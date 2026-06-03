"""
Image Oasis — "magic wand" prompt enhancer (backend route).

A self-contained, out-of-band prompt enhancer. It is NOT part of the generation
pipeline: the JS wand button POSTs the current prompt + a style toggle here, this
route loads a local GGUF LLM, expands the prompt, and returns the text. The model
loads and unloads per click (unload is the default) so it never competes with the
diffusion model during sampling.

Implements:
  - [OUTPUT]/<think> extraction chain (encodes real trial-and-error against
    thinking models that leak reasoning)
  - two system prompts (Natural Language / Tags)
  - llama-cpp-python load + chat-completion call with raw-completion fallback
  - auto GPU-layer sizing from the GGUF header + live free VRAM
  - a *targeted* VRAM free (comfy free_memory) that preserves Image Oasis's
    own load cache when there is already room, rather than a blanket unload
  - OOM-on-load -> CPU retry fallback
"""

import os
import re
import gc
import json
import struct
import random

import folder_paths
from server import PromptServer
from aiohttp import web


# ── Model directory: models/LLM only, gguf + safetensors listed ───────────────

def _llm_dir():
    comfy_dir = os.path.dirname(folder_paths.__file__)
    d = os.path.join(comfy_dir, "models", "LLM")
    os.makedirs(d, exist_ok=True)
    return d


def _list_llm_models():
    """List .gguf and .safetensors under models/LLM (recursively). Safetensors
    are listed so power users see them, but the loader below only handles GGUF."""
    base = _llm_dir()
    out = []
    for root, _, files in os.walk(base):
        for f in files:
            if f.lower().endswith((".gguf", ".safetensors")):
                rel = os.path.relpath(os.path.join(root, f), base).replace("\\", "/")
                out.append(rel)
    return sorted(out)


# ── Minimal GGUF header reader (layer count + architecture) ───────────────────
#
# We don't need a full parser. We read the KV block and skip each value by its
# type, capturing only general.architecture and {arch}.block_count. All fields
# little-endian per the GGUF spec.

_GGUF_MAGIC = 0x46554747  # "GGUF" little-endian

# value type -> fixed byte width (scalars only); strings/arrays handled specially
_GGUF_SCALAR_WIDTH = {
    0: 1, 1: 1,      # uint8, int8
    2: 2, 3: 2,      # uint16, int16
    4: 4, 5: 4,      # uint32, int32
    6: 4,            # float32
    7: 1,            # bool
    10: 8, 11: 8,    # uint64, int64
    12: 8,           # float64
}
_GGUF_TYPE_STRING = 8
_GGUF_TYPE_ARRAY = 9


def _read_gguf_meta(path, max_bytes=8 * 1024 * 1024):
    """Return {'architecture': str|None, 'block_count': int|None} or {} on failure.

    Reads only the metadata KV block (capped), skipping values by type. Tolerant:
    any malformed/short read returns what was found so far.
    """
    try:
        with open(path, "rb") as f:
            head = f.read(4 + 4 + 8 + 8)  # magic, version, tensor_count, kv_count
            if len(head) < 24:
                return {}
            magic, version, _n_tensors, n_kv = struct.unpack("<IIQQ", head)
            if magic != _GGUF_MAGIC:
                return {}
            # version 2/3 use 64-bit counts (handled above). Bail on anything wild.
            if n_kv > 100000:
                return {}

            blob = f.read(max_bytes)  # metadata lives near the front; cap the read
    except Exception:
        return {}

    pos = 0
    n = len(blob)
    found = {"architecture": None, "block_count": None}

    def _u(fmt, width):
        nonlocal pos
        if pos + width > n:
            raise EOFError
        v = struct.unpack_from(fmt, blob, pos)[0]
        pos += width
        return v

    def _read_str():
        nonlocal pos
        ln = _u("<Q", 8)
        if pos + ln > n:
            raise EOFError
        s = blob[pos:pos + ln].decode("utf-8", errors="replace")
        pos += ln
        return s

    def _skip_value(vtype):
        nonlocal pos
        if vtype in _GGUF_SCALAR_WIDTH:
            pos += _GGUF_SCALAR_WIDTH[vtype]
        elif vtype == _GGUF_TYPE_STRING:
            ln = _u("<Q", 8)
            pos += ln
        elif vtype == _GGUF_TYPE_ARRAY:
            elem_type = _u("<I", 4)
            count = _u("<Q", 8)
            if elem_type == _GGUF_TYPE_STRING:
                for _ in range(count):
                    ln = _u("<Q", 8)
                    pos += ln
            elif elem_type in _GGUF_SCALAR_WIDTH:
                pos += _GGUF_SCALAR_WIDTH[elem_type] * count
            else:
                raise ValueError("nested/unknown array element type")
        else:
            raise ValueError(f"unknown gguf value type {vtype}")

    def _read_scalar_value(vtype):
        # Only called for keys we care about; returns python value for ints/strings.
        if vtype == _GGUF_TYPE_STRING:
            return _read_str()
        fmt = {0: "<B", 1: "<b", 2: "<H", 3: "<h", 4: "<I", 5: "<i",
               6: "<f", 7: "<B", 10: "<Q", 11: "<q", 12: "<d"}.get(vtype)
        if fmt is None:
            raise ValueError("non-scalar where scalar expected")
        return _u(fmt, _GGUF_SCALAR_WIDTH[vtype])

    try:
        arch = None
        # First pass: we need architecture to know the block_count key name, but
        # general.architecture may appear after some keys. So capture both by name:
        # match "general.architecture" and any key ending ".block_count".
        for _ in range(n_kv):
            key = _read_str()
            vtype = _u("<I", 4)
            if key == "general.architecture" and vtype == _GGUF_TYPE_STRING:
                arch = _read_scalar_value(vtype)
                found["architecture"] = arch
            elif key.endswith(".block_count") and vtype in _GGUF_SCALAR_WIDTH:
                found["block_count"] = int(_read_scalar_value(vtype))
            else:
                _skip_value(vtype)
            if found["architecture"] and found["block_count"] is not None:
                break
    except Exception:
        # Return whatever we managed to capture; caller treats None as "unknown".
        pass

    return found


# ── Auto GPU-layer sizing ─────────────────────────────────────────────────────

def _free_vram_bytes(device=None):
    """Free VRAM in bytes, or None if CUDA/torch unavailable."""
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        free, _total = torch.cuda.mem_get_info(device) if device is not None \
            else torch.cuda.mem_get_info()
        return int(free)
    except Exception:
        return None


def _targeted_vram_free(estimate_bytes):
    """Ask ComfyUI to free *just enough* VRAM for the LLM, evicting as little as
    possible. Preserves Image Oasis's load cache when there is already room.
    Best-effort: silently does nothing if comfy's API isn't shaped as expected."""
    try:
        import comfy.model_management as mm
        device = mm.get_torch_device()
        # free_memory evicts loaded models until `estimate_bytes` is free (or all
        # are evicted). It will free nothing if there's already room.
        mm.free_memory(estimate_bytes, device)
        return device
    except Exception:
        return None


def _auto_gpu_layers(model_path, n_ctx, reserve_bytes=1024 * 1024 * 1024):
    """Decide n_gpu_layers for this GGUF given live free VRAM.

    Returns an int: -1 means "all layers on GPU", 0 means CPU-only, a positive
    number is a partial offload. Conservative on purpose: under-offloading costs
    a few seconds, over-offloading risks an OOM on a shared card.

    Estimate model runtime footprint as file_size * 1.35 (covers KV cache at
    n_ctx + compute buffers + llama.cpp overhead, roughly, for typical small
    models). The reserve keeps `reserve_bytes` free as headroom.
    """
    try:
        file_size = os.path.getsize(model_path)
    except Exception:
        return 0  # can't size -> safest is CPU

    est_runtime = int(file_size * 1.35)

    # Targeted free first, so the reading below reflects post-eviction VRAM.
    _targeted_vram_free(est_runtime + reserve_bytes)

    free = _free_vram_bytes()
    if free is None:
        return 0  # no CUDA -> CPU

    usable = free - reserve_bytes
    if usable <= 0:
        return 0
    if usable >= est_runtime:
        return -1  # everything fits -> all layers on GPU

    meta = _read_gguf_meta(model_path)
    n_layers = meta.get("block_count")
    if not n_layers or n_layers <= 0:
        # Unknown layer count: can't compute a partial split safely. Prefer CPU
        # over a blind guess that could OOM.
        return 0

    # Fraction of the model that fits, mapped to a layer count, minus one layer
    # of slack (the non-layer weights — embeddings/output head — also need room).
    frac = usable / est_runtime
    layers = int(n_layers * frac) - 1
    return max(0, min(n_layers, layers))


# ── [OUTPUT]/<think> extraction ───────────────────────────────────────────────

def _split_thinking_and_answer(text):
    if not isinstance(text, str):
        return "", ""
    t = text.strip()
    if not t:
        return "", ""
    thinking = ""
    answer_region = t
    think_close = re.search(r"</think\s*>", t, flags=re.IGNORECASE)
    if think_close:
        thinking = t[: think_close.start()].strip()
        thinking = re.sub(r"^\s*<think\s*>\s*", "", thinking, flags=re.IGNORECASE).strip()
        answer_region = t[think_close.end():].strip()
    # Match either bracket style: [OUTPUT]...[/OUTPUT] or <OUTPUT>...</OUTPUT>.
    # Thinking models sometimes emit the XML-style closer, which slipped past the
    # old square-bracket-only logic and rode through into the final prompt.
    out_open = re.search(r"[\[<]OUTPUT[\]>]", answer_region, flags=re.IGNORECASE)
    if out_open:
        answer = answer_region[out_open.end():]
        answer = re.sub(r"[\[<]/OUTPUT[\]>].*$", "", answer, flags=re.IGNORECASE | re.DOTALL)
        answer = answer.strip()
    else:
        answer = answer_region
    return thinking, answer


def _normalize_answer(answer, single_line=True):
    if not isinstance(answer, str):
        return ""
    out = answer.strip()
    out = re.sub(r"^\s*(?:final\s*)?(?:output|answer)\s*:\s*", "", out, flags=re.IGNORECASE).strip()
    if out.startswith("```") and out.endswith("```"):
        out = out.strip("`").strip()
    if len(out) >= 2 and ((out[0] == out[-1] == '"') or (out[0] == out[-1] == "'")):
        out = out[1:-1].strip()
    if single_line:
        out = re.sub(r"\s+", " ", out).strip()
    return out


# Deterministic backstop for the Tags style: remove negation phrases that the
# prompt rules failed to suppress. Handles BOTH output shapes models actually
# produce: comma-separated tags (drop the whole offending tag) and space-run
# "tag salad" with no commas (excise the negation word plus the short run of
# words it governs). Negative tags are the worst failure here because they
# become things the diffusion model RENDERS, so we guarantee removal rather than
# trusting the prompt. Applied ONLY to tag output.
_NEG_WORDS = r"(?:no|not|without|absent|missing|lacking|devoid|none|sans|free)"

# Comma-tag form: a whole tag that begins with a negation word.
_NEG_TAG_LEADING = re.compile(rf"^\s*{_NEG_WORDS}\b", re.IGNORECASE)

# Continuous-text form: a negation word + up to 3 following words (the negated
# noun and its qualifiers), e.g. "no clothing visible", "without harsh shadows",
# "no external views visible". Bounded so it can't eat the rest of the string.
_NEG_PHRASE = re.compile(
    rf"\b{_NEG_WORDS}\b(?:\s+(?:of|or|any|visible|present|signs?|other)\b)?"
    rf"(?:\s+[A-Za-z][\w-]*){{1,3}}",
    re.IGNORECASE)


def _strip_negative_tags(text, style="tags"):
    if not isinstance(text, str) or not text.strip():
        return text

    # Parenthetical "(none worn)" / "(none)" anywhere -> remove the parenthetical.
    text = re.sub(r"\s*\(\s*none[^)]*\)", "", text, flags=re.IGNORECASE)

    if style == "tags" and "," in text:
        # Comma-separated tags: drop whole tags that lead with a negation, and
        # excise negation phrases buried inside an otherwise-good tag.
        kept = []
        for raw in text.split(","):
            tag = raw.strip()
            if not tag:
                continue
            if _NEG_TAG_LEADING.match(tag):
                continue
            tag = _NEG_PHRASE.sub("", tag).strip(" ,")
            if tag:
                kept.append(tag)
        return ", ".join(kept)

    # Everything else — prose (NL) or comma-less "tag salad" — excise the
    # negation phrases in place and tidy the grammatical debris left behind.
    out = _NEG_PHRASE.sub(" ", text)
    out = _tidy_excision_debris(out)
    return out


def _tidy_excision_debris(text):
    """Clean grammatical litter left after excising negation phrases from prose:
    dangling conjunctions before punctuation, doubled/space-prefixed punctuation,
    and orphaned short fragments between separators."""
    s = text
    # "... and ;" / "... with ," -> drop the dangling connective before punctuation
    s = re.sub(r"\s+(?:and|or|with|while|but)\s*(?=[;,.])", "", s, flags=re.IGNORECASE)
    # space before punctuation
    s = re.sub(r"\s+([;,.])", r"\1", s)
    # doubled/!empty punctuation runs -> single
    s = re.sub(r"([;,.])(?:\s*[;,.])+", r"\1", s)
    # a separator immediately followed by end or another separator's leftover
    s = re.sub(r"[;,]\s*(?=[;,.])", "", s)
    # orphaned tiny fragment like ";  present" / ",  visible" between separators
    s = re.sub(r"([;,.])\s+\w{1,9}\s*(?=[;,.]|$)",
               lambda m: m.group(1)
               if len(m.group(0).strip(" ;,.")) <= 9 and m.group(0).strip(" ;,.").lower() in
               ("present","visible","worn","shown","seen","there") else m.group(0),
               s)
    # collapse whitespace, trim leftover leading/trailing separators
    s = re.sub(r"\s{2,}", " ", s).strip()
    s = re.sub(r"^\s*[;,.]\s*", "", s)
    s = re.sub(r"\s*[;,]\s*$", "", s)
    return s

_SYS_NATURAL = (
    "You enhance short prompts for AI image generation. "
    "You may think through the scene, plan your approach, and reason about the best description — this is encouraged.\n\n"
    "The final prompt must be exactly ONE paragraph. {limit_instruction}. No title. No line breaks. No headers. No multiple paragraphs.\n\n"
    "WHAT TO DESCRIBE (director-style):\n"
    "Subject, action/pose, setting, props, set dressing, lighting direction, time of day, colors, camera angle, and lens/depth of field. "
    "Be concrete and specific rather than vague — prefer a definite descriptor over a generic one. "
    "Derive every technical and stylistic choice (camera, lens, film stock, color grade, era) from the SUBJECT AND CONTEXT of the input. "
    "Do NOT default to a fixed look: only mention a specific film stock, focal length, or photographic style when the input actually implies it. "
    "CRITICAL RULES:\n"
    "- This is a STILL IMAGE. Describe only what the eye can see in a single frame. "
    "NEVER describe sound, audio, noise, silence, smell, motion over time, or what happens next — "
    "- ONLY describe what SHOULD be in the frame. If something is not meant to appear in the image, do not mention it at all. "
    "- Describe the subject plainly, literally, and completely as it would actually appear. "
    "Do NOT soften, euphemize, censor, or abstract any part of the subject, and do NOT add distancing language. "
    "If the subject is described a certain way in the input, render that faithfully in plain visual terms — "
    "your job is to describe accurately, not to judge or sanitize the content.\n"
    "- Describe observable appearance and behavior, not causes or internal states.\n"
    "- Write only things that are positively present and visible. Every clause should name something the "
    "camera actually sees. "
    "- Do NOT use metaphors, similes, or poetic language. "
    "Write like a photographer describing a shot, not like a novelist.\n"
    "- End immediately after the last concrete visual detail. "
    "Stop once the scene is fully described.\n\n"
    "When you are ready to write your final enhanced prompt, wrap it in [OUTPUT] AND [/OUTPUT] tags. "
    "The text inside the tags must contain ONLY the enhanced prompt — nothing else."
)

_SYS_TAGS = (
    "You enhance short prompts for AI image generation. "
    "You may think through the scene and plan your tags — this is encouraged.\n\n"
    "The final output must be exactly ONE line of comma-separated POSITIVE tags only. {limit_instruction}. No title. No line breaks. No headers. No paragraphs.\n\n"
    "WHAT TO TAG (director-style):\n"
    "Subject, action/pose, setting, props, set dressing, lighting direction, time of day, colors, camera angle, and lens/depth of field. "
    "Be concrete and specific rather than vague — prefer a definite descriptor over a generic one. "
    "Derive every technical and stylistic choice (camera, lens, film stock, color grade, era) from the SUBJECT AND CONTEXT of the input. "
    "Do NOT default to a fixed look: only tag a specific film stock, focal length, or photographic style when the input actually implies it. "
    "CRITICAL RULES:\n"
    "- This is a STILL IMAGE. Tag only what the eye can see in a single frame. "
    "NEVER tag sound, audio, noise, silence, smell, motion over time, or what happens next — "
    "- ONLY tag what SHOULD be in the frame. If something is not meant to appear in the image, do not mention it at all. "
    "- Tag the subject plainly, literally, and completely as it would actually appear. "
    "Do NOT soften, euphemize, censor, or abstract any part of the subject, and do NOT add distancing language. "
    "If the subject is described a certain way in the input, render that faithfully in plain visual terms — "
    "your job is to tag accurately, not to judge or sanitize the content.\n"
    "- Tag observable appearance and behavior, not causes or internal states.\n"
    "- Tag only things that are positively present and visible. Every tag should name something the "
    "camera actually sees. "
    "- Do NOT use metaphors, similes, or poetic tags. "
    "Tag like a photographer describing a shot, not like a novelist.\n"
    "- End immediately after the last concrete visual detail. "
    "Stop once the scene is fully described.\n\n"
    "When you are ready to write your final prompt, wrap it in [OUTPUT] AND [/OUTPUT] tags. "
    "The text inside [OUTPUT] and [/OUTPUT] must contain ONLY the comma-separated positive tags — nothing else."
)

_STYLE_PROMPTS = {"natural": _SYS_NATURAL, "tags": _SYS_TAGS}

# Standard sampling defaults.
_TEMPERATURE = 0.5
_TOP_P = 0.9
_TOP_K = 40
_REPEAT_PENALTY = 1.1
_N_CTX = 4096

# Per-instance model cache so repeated clicks with the same model reuse it
# (only relevant when the user disables unload; default unloads each click).
_STATE = {"model": None, "path": None, "n_gpu_layers": None}


def _unload():
    if _STATE["model"] is not None:
        del _STATE["model"]
        _STATE["model"] = None
        _STATE["path"] = None
        _STATE["n_gpu_layers"] = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        print("[Image Oasis] Enhancer model unloaded.")


def _load_llama(model_path, n_gpu_layers):
    from llama_cpp import Llama
    return Llama(model_path=model_path, n_gpu_layers=n_gpu_layers,
                 n_ctx=_N_CTX, verbose=False)


# llama-cpp-python added create_chat_completion(chat_template_kwargs=...) in a
# fairly recent release. Older builds raise TypeError on unknown kwargs and fall
# into our raw fallback, which uses a Llama-style [INST] template that's wrong
# for Qwen. Probe once with inspect and only pass the kwarg when supported; on
# older builds the /no_think prefix in the user message still suppresses thinking.
_CHAT_TEMPLATE_KWARGS_SUPPORTED = None


def _chat_template_kwargs_supported(llm):
    global _CHAT_TEMPLATE_KWARGS_SUPPORTED
    if _CHAT_TEMPLATE_KWARGS_SUPPORTED is not None:
        return _CHAT_TEMPLATE_KWARGS_SUPPORTED
    try:
        import inspect
        params = inspect.signature(llm.create_chat_completion).parameters
        _CHAT_TEMPLATE_KWARGS_SUPPORTED = (
            "chat_template_kwargs" in params
            or any(p.kind == inspect.Parameter.VAR_KEYWORD for p in params.values())
        )
    except Exception:
        _CHAT_TEMPLATE_KWARGS_SUPPORTED = False
    if not _CHAT_TEMPLATE_KWARGS_SUPPORTED:
        print("[Image Oasis] llama-cpp-python is too old for chat_template_kwargs; "
              "relying on /no_think prefix only. `pip install -U llama-cpp-python` "
              "for the proper enable_thinking switch.")
    return _CHAT_TEMPLATE_KWARGS_SUPPORTED


def _generate(llm, system_prompt, user_prompt, max_tokens, think_off=False):
    user_content = user_prompt.strip()
    # No-think MECHANISM only — instruction text is unchanged. Prefer
    # chat_template_kwargs (enable_thinking=False), which touches no prompt text.
    # Fall back to the legacy /no_think token only when that kwarg isn't supported,
    # appended on its own trailing line so it never lands inside the content the
    # model is asked to enhance (the old in-content prefix garbled non-hybrid output).
    use_kwarg = think_off and _chat_template_kwargs_supported(llm)
    use_prefix = think_off and not use_kwarg
    combined = (
        f"{system_prompt}\n\n"
        f"IMPORTANT RULES:\n"
        f"- You may think, plan, draft, and revise freely before your final output\n"
        f"- When ready, wrap your final prompt in [OUTPUT] and [/OUTPUT] tags\n"
        f"- The text inside [OUTPUT] tags must contain ONLY the enhanced prompt\n\n"
        f"Short prompt to enhance: {user_content}"
    )
    if use_prefix:
        combined += "\n\n/no_think"
    # Fresh seed every call so re-enhancing the same prompt yields new text even
    # when the model instance is reused from cache. Not surfaced — prompt text
    # reproducibility isn't a goal the way image seeds are.
    seed = random.randint(0, 2**31 - 1)
    try:
        kwargs = dict(
            messages=[{"role": "user", "content": combined}],
            temperature=_TEMPERATURE, max_tokens=max_tokens,
            top_p=_TOP_P, top_k=_TOP_K, repeat_penalty=_REPEAT_PENALTY, seed=seed,
            # Halt the instant the answer closes. Without this, a model that emits
            # the [OUTPUT] block then keeps talking (common on plain instruct
            # models invited to "think freely") runs to max_tokens — the "takes
            # forever" case. The <think> block precedes [OUTPUT], so a thinking
            # model is unaffected. llama-cpp omits the stop string from the
            # returned text; _split_thinking_and_answer tolerates the missing
            # closing tag (it takes everything after [OUTPUT]).
            stop=["[/OUTPUT]", "</OUTPUT>"])
        if use_kwarg:
            # Read by the Qwen3-family Jinja chat template baked into the GGUF;
            # it injects an empty <think></think> so the model skips reasoning.
            kwargs["chat_template_kwargs"] = {"enable_thinking": False}
        resp = llm.create_chat_completion(**kwargs)
        msg = resp["choices"][0].get("message", {})
        reasoning = (msg.get("reasoning_content") or "").strip()
        content = (msg.get("content") or "").strip()
        full = f"{reasoning}\n\n{content}" if (reasoning and content) else (reasoning or content)
        return full, content
    except Exception as e:
        print(f"[Image Oasis] Enhancer chat completion failed, raw fallback: {e}")
        resp = llm(f"[INST] {combined} [/INST]", temperature=_TEMPERATURE,
                   max_tokens=max_tokens, top_p=_TOP_P, top_k=_TOP_K,
                   repeat_penalty=_REPEAT_PENALTY, seed=seed, stop=["[/OUTPUT]", "</OUTPUT>", "[INST]", "</s>"])
        txt = resp["choices"][0]["text"].strip()
        return txt, txt


# ── Routes ────────────────────────────────────────────────────────────────────

routes = PromptServer.instance.routes


@routes.get("/image_oasis/llm_models")
async def image_oasis_llm_models(request):
    return web.json_response({"models": _list_llm_models()})


@routes.post("/image_oasis/enhance")
async def image_oasis_enhance(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "Bad request body."}, status=400)

    prompt = (data.get("prompt") or "").strip()
    style = (data.get("style") or "natural").lower()
    model_name = (data.get("model") or "").strip()
    unload_after = bool(data.get("unload_after", True))
    think_off = bool(data.get("think_off", False))

    if not prompt:
        return web.json_response({"error": "Nothing to enhance — the prompt is empty."}, status=400)
    if style not in _STYLE_PROMPTS:
        style = "natural"
    if not model_name:
        return web.json_response({"error": "No LLM model selected."}, status=400)
    if model_name.lower().endswith(".safetensors"):
        return web.json_response({
            "error": "Full safetensors models aren't supported yet — the enhancer "
                     "loads GGUF only. Convert to GGUF or select a .gguf model."
        }, status=400)

    model_path = os.path.join(_llm_dir(), model_name)
    if not os.path.isfile(model_path):
        return web.json_response({"error": f"Model not found: {model_name}"}, status=404)

    # llama-cpp-python presence check (clear message).
    try:
        import llama_cpp  # noqa: F401
    except ImportError:
        return web.json_response({
            "error": "llama-cpp-python is not installed. Install with: "
                     "pip install llama-cpp-python (CUDA: "
                     "CMAKE_ARGS=\"-DGGML_CUDA=on\" pip install llama-cpp-python)."
        }, status=500)

    system_prompt = _STYLE_PROMPTS[style].format(limit_instruction="Stay under 900 characters")

    def work():
        # Auto-size layers (does the targeted VRAM free internally), then load
        # with an OOM->CPU fallback so the wand never hard-crashes.
        n_layers = _auto_gpu_layers(model_path, _N_CTX)

        reuse = (_STATE["model"] is not None
                 and _STATE["path"] == model_path
                 and _STATE["n_gpu_layers"] == n_layers)
        if reuse:
            llm = _STATE["model"]
        else:
            _unload()
            try:
                llm = _load_llama(model_path, n_layers)
            except Exception as e:
                # Most likely CUDA OOM; retry pinned to CPU.
                msg = str(e)
                print(f"[Image Oasis] Enhancer GPU load failed ({msg}); retrying on CPU.")
                _unload()
                llm = _load_llama(model_path, 0)
                n_layers = 0
            _STATE["model"] = llm
            _STATE["path"] = model_path
            _STATE["n_gpu_layers"] = n_layers

        # Token budget = whatever the context window has left after the input.
        # Thinking models burn most of this reasoning, THEN emit the [OUTPUT]
        # block; capping at the ~200-token output target (as a naive char limit
        # would) strangles them mid-thought and leaks raw reasoning. The output
        # length is enforced by the *instruction* ("Stay under 900 characters")
        # plus the [OUTPUT] extraction — not by a hard token cap. We still bound
        # it so a runaway can't fill the whole window forever.
        combined_len = len(system_prompt) + len(prompt) + 400  # +rules scaffold
        est_input_tokens = int(combined_len / 3.5)
        budget = _N_CTX - est_input_tokens - 64
        max_tokens = max(256, min(budget, 1536))
        print(f"[Image Oasis] Enhancer budget: {max_tokens} tokens "
              f"(ctx {_N_CTX}, est input {est_input_tokens}, layers {n_layers}, "
              f"think={'off' if think_off else 'on'})")

        full, content = _generate(llm, system_prompt, prompt, max_tokens,
                                  think_off=think_off)
        _, answer = _split_thinking_and_answer(content or full)
        enhanced = _normalize_answer(answer, single_line=True)
        # Deterministic negation strip for TAGS only — tags parse cleanly and the
        # strip is proven safe there. Prose (NL) negations are left to the system
        # prompt: regex-excising them from sentences leaves grammatical debris
        # that's worse than the occasional clean-but-negated phrase.
        if style == "tags":
            enhanced = _strip_negative_tags(enhanced, style=style)

        if unload_after:
            _unload()
        return enhanced, n_layers

    try:
        import asyncio
        loop = asyncio.get_running_loop()
        enhanced, n_layers = await loop.run_in_executor(None, work)
    except Exception as e:
        _unload()
        return web.json_response({"error": f"Enhancement failed: {e}"}, status=500)

    if not enhanced:
        return web.json_response({"error": "The model returned no usable text. Try again."}, status=500)

    return web.json_response({"enhanced": enhanced, "gpu_layers": n_layers})
