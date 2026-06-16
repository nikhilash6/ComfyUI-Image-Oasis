"""
Image Oasis — All-in-One image generation node.

One node: pick an architecture, point at a model, prompt it, get a finished
image. Internally an orchestrator over three stages (load + sample-patch +
encode + latent / KSampler refinement chain / optional upscale).

Pipeline:
    validate -> load_models -> apply_model_sampling -> encode_conditioning
    -> make_latent -> run_sampling_chain (base [+ refiner]) -> [upscale] -> IMAGE
"""

import os
import sys
import importlib

# Robust sibling imports.
#
# ComfyUI sometimes loads a custom-node package under a module name equal to its
# full filesystem path (e.g. 'C:\\...\\custom_nodes\\Image_Oasis'). Relative
# imports like `from .pipeline import x` then resolve against that path-name and
# fail with a ModuleNotFoundError naming the whole path. To avoid depending on
# how ComfyUI names the package, we load sibling modules by absolute file path.

_THIS_DIR = os.path.dirname(os.path.abspath(__file__))


def _load_sibling(mod_name):
    """Import a sibling .py module by file path, regardless of package name."""
    # Already imported under our private namespace? reuse it.
    key = f"image_oasis_{mod_name}"
    if key in sys.modules:
        return sys.modules[key]
    path = os.path.join(_THIS_DIR, f"{mod_name}.py")
    spec = importlib.util.spec_from_file_location(key, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[key] = module
    spec.loader.exec_module(module)
    return module


registry = _load_sibling("registry")
stage_load = _load_sibling("stage_load")
stage_sample = _load_sibling("stage_sample")
stage_upscale = _load_sibling("stage_upscale")
preview = _load_sibling("preview")

ARCH_REGISTRY = registry.ARCH_REGISTRY
ARCH_KEYS = registry.ARCH_KEYS
get_arch = registry.get_arch
validate_combo = registry.validate_combo


def _arch_dropdown():
    # Show friendly labels mapped back to keys via a parallel lookup.
    return ARCH_KEYS  # keys are short and clear enough to show directly


import folder_paths


def _list(*folder_names):
    """Union of filenames across one or more ComfyUI folder types. Never throws."""
    seen, out = set(), []
    for name in folder_names:
        try:
            for f in folder_paths.get_filename_list(name):
                if f not in seen:
                    seen.add(f)
                    out.append(f)
        except Exception:
            pass
    return sorted(out)


def _model_files():
    # Union of every source type, since source_type switches between them.
    # diffusion + gguf models live under unet / diffusion_models.
    files = _list("checkpoints", "unet", "diffusion_models")
    # A required combo widget needs at least one entry or ComfyUI errors.
    return files if files else ["(no models found)"]


def _clip_files():
    return _list("text_encoders", "clip")


def _vae_files():
    return _list("vae")


def _upscale_files():
    return _list("upscale_models")


def _with_blank(items):
    """Prepend a blank '(none)' option for optional dropdowns."""
    return ["(none)"] + items


# ── Widget-state readers ──────────────────────────────────────────────────────

import json as _json


def _read_widget_state(prompt, unique_id, widget_key):
    """Read a DOM widget JSON blob from PROMPT inputs safely. {} if missing."""
    if not prompt or unique_id is None:
        return {}
    try:
        node_data = prompt.get(str(unique_id), prompt.get(unique_id, {})) or {}
        raw = (node_data.get("inputs", {}) or {}).get(widget_key)
        if not raw:
            return {}
        return _json.loads(raw) if isinstance(raw, str) else (raw if isinstance(raw, dict) else {})
    except Exception:
        return {}


def _split_widget_state(state):
    """Normalize to (uiState, execState). Supports flat and {uiState,execState}."""
    if not isinstance(state, dict):
        return {}, {}
    ui = state.get("uiState")
    ex = state.get("execState")
    if isinstance(ui, dict) or isinstance(ex, dict):
        return (ui if isinstance(ui, dict) else {}), (ex if isinstance(ex, dict) else {})
    return {}, state


def _load_input_image(filename):
    """Load an uploaded reference image from ComfyUI's input folder into an
    IMAGE tensor [1,H,W,C]. Returns None if no file. Mirrors LoadImage."""
    if not filename:
        return None
    try:
        import numpy as np
        import torch
        from PIL import Image, ImageOps
        path = folder_paths.get_annotated_filepath(filename)
        img = Image.open(path)
        img = ImageOps.exif_transpose(img)
        if img.mode == "I":
            img = img.point(lambda i: i * (1 / 255))
        img = img.convert("RGB")
        arr = np.array(img).astype(np.float32) / 255.0
        return torch.from_numpy(arr)[None, ]
    except Exception as e:
        print(f"[Image Oasis] Could not load reference image '{filename}': {e}")
        return None


# ── Cross-run caches ──────────────────────────────────────────────────────────
#
# This node is OUTPUT_NODE with all config in a hidden PROMPT blob, so ComfyUI
# cannot diff its inputs and re-executes generate() on every queue — even when
# only the seed changed. Without caching, that re-runs the entire Stage 1 each
# time (GGUF disk load + dequant, CLIP load, VAE construction, text encode),
# which is the bulk of the per-run cost. We memoize the heavy objects here,
# keyed on the inputs that actually require a rebuild, so a seed-only re-run
# skips straight to sampling.
#
# Keyed by unique_id, so each node instance holds at most one entry; switching
# any keyed input simply overwrites that instance's entry (the old objects are
# dropped, not accumulated).

import hashlib as _hashlib
import json as _json_cache
import uuid as _uuid

_RAWLOAD_CACHE = {}  # unique_id -> (key, model, clip, vae) — raw disk load only
_LOAD_CACHE = {}     # unique_id -> (key, model, clip) — after LoRA + sampling patch
_COND_CACHE = {}   # unique_id -> (key, positive_cond, negative_cond)
# Sampling is split into two caches that mirror the two-KSampler-node graph:
# the base pass and the refiner pass are independent stages. _BASE_CACHE holds
# the base pass's output LATENT (not a decoded image — the refiner continues in
# latent space, so there must be no decode between them). _REFINED_CACHE holds
# the final decoded IMAGE after the whole chain. Splitting them means enabling
# the refiner is a base-cache HIT (its inputs didn't change) plus a refiner
# miss (correct — the refiner must run), instead of re-sampling the base too.
_BASE_CACHE = {}    # unique_id -> (key, base_latent)
_REFINED_CACHE = {}  # unique_id -> (key, image, latent)

_ALL_CACHES = (_RAWLOAD_CACHE, _LOAD_CACHE, _COND_CACHE, _BASE_CACHE, _REFINED_CACHE)

# Bounded LRU over node instances. Each unique_id pins a full model set in RAM;
# entries used to live forever, so swapping between workflows all day (each with
# its own node ids) crept RAM upward until restart. Cap the number of live
# instances: touching an id on each run keeps the active ones fresh, and the
# least-recently-run instance is evicted from EVERY cache tier at once (a raw
# entry without its dependent tiers frees nothing — the patched clones reference
# the raw objects).
_INSTANCE_LRU = {}   # unique_id -> None, insertion-ordered (oldest first)
_MAX_INSTANCES = 4


def _touch_instance(uid):
    _INSTANCE_LRU.pop(uid, None)
    _INSTANCE_LRU[uid] = None
    while len(_INSTANCE_LRU) > _MAX_INSTANCES:
        oldest = next(iter(_INSTANCE_LRU))
        del _INSTANCE_LRU[oldest]
        for cache in _ALL_CACHES:
            cache.pop(oldest, None)
        print(f"[Image Oasis] Evicted cached models for inactive node {oldest}.")


def clear_caches():
    """Drop every cached model/conditioning/latent. Used by the flush route."""
    _INSTANCE_LRU.clear()
    for cache in _ALL_CACHES:
        cache.clear()


def _cache_key(payload):
    return _hashlib.sha256(
        _json_cache.dumps(payload, sort_keys=True, default=str).encode()
    ).hexdigest()


def _tensor_digest(t):
    """Stable digest of an IMAGE tensor's contents (or None).

    Keying the conditioning cache on reference-image *contents* rather than
    filenames is required for the Qwen-Image-Edit path: the uploader overwrites
    in place (overwrite:"true"), so a new image can reuse an old filename. We
    hash the raw bytes so re-encoding triggers when the pixels change even if
    the name doesn't. Shape/dtype are folded in to disambiguate.
    """
    if t is None:
        return None
    try:
        arr = t.detach().cpu().contiguous().numpy()
        h = _hashlib.sha256()
        h.update(str(arr.shape).encode())
        h.update(str(arr.dtype).encode())
        h.update(arr.tobytes())
        return h.hexdigest()
    except Exception:
        # Never let a hashing failure break generation; fall back to a sentinel
        # that forces a re-encode (correct, just not cached) for this run. The
        # sentinel must be UNIQUE per call — a constant here would make two
        # consecutive failures produce identical cache keys, i.e. a stale HIT.
        return f"uncacheable-{_uuid.uuid4().hex}"


# Default config — the JS widget overrides these via the image_oasis_ui blob.
_DEFAULTS = {
    "architecture": "flux",
    "source_type": "diffusion",
    "model_file": "",
    "positive": "",
    "negative": "",
    "width": 1024, "height": 1024, "batch_size": 1, "seed": 0,
    "steps": 20, "cfg": 3.5, "sampler_name": "euler", "scheduler": "simple",
    "denoise": 1.0, "seed_control": "randomize",
    "clip_file": "", "clip_file_2": "", "clip_file_3": "", "vae_file": "",
    "clip_bundled": False, "vae_bundled": False,
    "weight_dtype": "default", "clip_type": "", "shift": 0.0,
    # LoRA stack: list of {name, strength_model, strength_clip}, applied in order.
    "loras": [],
    "enable_refiner": False, "refiner_steps": 10, "refiner_cfg": 3.5,
    "refiner_denoise": 0.4,
    "enable_upscale": False, "upscale_mode": "algorithmic",
    "upscale_method": "lanczos", "upscale_multiplier": 2.0,
    "upscale_model_file": "",
    # Reference images: uploaded into ComfyUI's input folder; blob carries names.
    "ref_image1": "", "ref_image2": "", "ref_image3": "",
}


class ImageOasis:

    @classmethod
    def INPUT_TYPES(cls):
        # True monolith: no input sockets. All config (incl. uploaded reference
        # image filenames) comes from the DOM widget blob, read at runtime.
        return {
            "required": {},
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    # Monolith: OUTPUT_NODE only (renders its own preview). No output sockets.
    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "generate"
    OUTPUT_NODE = True
    CATEGORY = "Image Oasis"
    NAME = "Image Oasis"
    DESCRIPTION = (
        "All-in-one image generation: switchable architecture (Flux, Qwen-Image-Edit, "
        "SD3, AuraFlow), tri-source model loading, sampling patch, refiner pass, "
        "and optional upscale — in a single node."
    )

    def generate(self, unique_id=None, prompt=None, extra_pnginfo=None):
        # Silence ComfyUI's global progress hook for the duration of the run.
        # The hook is the transport for BOTH per-step live-preview frames
        # (b_preview) and progress messages — each keyed by raw numeric node
        # id and painted by the frontend onto whatever node the *currently
        # active* graph has at that id. When the user tabs to another
        # workflow mid-generation, a same-id node there (e.g. a Show Text)
        # receives IO's preview frames and progress bar. IO suppresses its
        # own live-preview display anyway, so these frames serve nobody:
        # killing the hook removes the misrouting at the source instead of
        # chasing it in the frontend. Restored in `finally`, so interrupts
        # (InterruptProcessingException) and errors can't leave it dead for
        # other workflows. ComfyUI executes one prompt at a time, so the
        # temporary swap can't clobber a concurrent run.
        import comfy.utils
        prev_hook = comfy.utils.PROGRESS_BAR_HOOK
        comfy.utils.set_progress_bar_global_hook(None)
        try:
            return self._generate_impl(unique_id=unique_id, prompt=prompt,
                                       extra_pnginfo=extra_pnginfo)
        finally:
            comfy.utils.set_progress_bar_global_hook(prev_hook)

    def _generate_impl(self, unique_id=None, prompt=None, extra_pnginfo=None):

        # ── Read config from the DOM widget blob (image_oasis_ui) ──────────
        state0 = _read_widget_state(prompt, unique_id, "image_oasis_ui")
        # io_id rides at the top level of the widget state blob (separate from
        # uiState/execState). Stable per-node UUID generated by the frontend,
        # round-trips through workflow JSON. Used to route the result back to
        # the originating node via a custom WebSocket event, bypassing
        # ComfyUI's per-numeric-id `executed` routing that mis-targets same-id
        # nodes on whichever workflow is currently active.
        io_id = state0.get("io_id") if isinstance(state0, dict) else None
        ui, ex = _split_widget_state(state0)
        merged = {**(ui or {}), **(ex or {})}
        cfg = dict(_DEFAULTS)
        for k in cfg:
            if k in merged and merged[k] is not None:
                cfg[k] = merged[k]

        architecture = cfg["architecture"]
        source_type = cfg["source_type"]
        model_file = cfg["model_file"]
        positive = cfg["positive"]
        negative = cfg["negative"]
        width = int(cfg["width"]); height = int(cfg["height"])
        batch_size = int(cfg["batch_size"]); seed = int(cfg["seed"])
        steps = int(cfg["steps"]); cfg_scale = float(cfg["cfg"])
        sampler_name = cfg["sampler_name"]; scheduler = cfg["scheduler"]
        denoise = float(cfg["denoise"])
        clip_file = cfg["clip_file"]; clip_file_2 = cfg["clip_file_2"]; clip_file_3 = cfg["clip_file_3"]; vae_file = cfg["vae_file"]
        clip_bundled = bool(cfg["clip_bundled"]); vae_bundled = bool(cfg["vae_bundled"])
        weight_dtype = cfg["weight_dtype"]; clip_type = cfg["clip_type"]
        shift = float(cfg["shift"])
        enable_refiner = bool(cfg["enable_refiner"])
        refiner_steps = int(cfg["refiner_steps"]); refiner_cfg = float(cfg["refiner_cfg"])
        refiner_denoise = float(cfg["refiner_denoise"])
        enable_upscale = bool(cfg["enable_upscale"])
        upscale_mode = cfg["upscale_mode"]; upscale_method = cfg["upscale_method"]
        upscale_multiplier = float(cfg["upscale_multiplier"])
        upscale_model_file = cfg["upscale_model_file"]

        # Normalize the LoRA stack (list of {name, strength_model, strength_clip}),
        # dropping blanks here so the cache key and the load are deterministic.
        # Trigger words are collected from the same iteration (enabled LoRAs
        # only) and prepended to the positive prompt in stack order, comma-
        # joined, just before the conditioning encode. The cond cache key is
        # built off the final `positive` string, so trigger edits bust the
        # cache correctly without extra bookkeeping.
        loras = []
        trigger_phrases = []
        for it in (cfg.get("loras") or []):
            if not isinstance(it, dict):
                continue
            if not it.get("enabled", True):
                continue  # kept in the UI list, but excluded from the active stack
            tw = (it.get("trigger_words") or "").strip()
            if tw:
                trigger_phrases.append(tw)
            nm = (it.get("name") or "").strip()
            if not nm or nm == "(none)":
                continue
            loras.append({
                "name": nm,
                "strength_model": float(it.get("strength_model", 1.0)),
                "strength_clip": float(it.get("strength_clip", 0.0)),
            })
        if trigger_phrases:
            prefix = ", ".join(trigger_phrases)
            positive = (prefix + ", " + positive) if positive else prefix

        if not model_file:
            raise ValueError("[Image Oasis] No model selected.")

        # First thing on every generation: release the enhancer LLM if one is
        # cached. Must run unconditionally — putting it inside load_models()
        # missed the case where the diffusion model is already in _RAWLOAD_CACHE
        # (load_models() is skipped, but the LLM was still pinning ~5GB of VRAM,
        # forcing the text encoder to spill). No-op when no LLM is loaded.
        stage_load.unload_enhancer_if_loaded()

        # ── Validate up front (cheap, before any loading) ──────────────────
        spec = validate_combo(architecture, source_type)

        # Reference images: load from uploaded filenames (monolith, no sockets).
        # Gated on the arch actually consuming them — otherwise every queue
        # would re-read + content-hash up to three images that get ignored,
        # and editing a ref slot would bust the conditioning cache for nothing.
        ref_names = (cfg["ref_image1"], cfg["ref_image2"], cfg["ref_image3"])
        if spec["accepts_image_cond"]:
            image1, image2, image3 = (_load_input_image(n) for n in ref_names)
        else:
            image1 = image2 = image3 = None
            if any(ref_names):
                print(f"[Image Oasis] Note: architecture '{architecture}' does "
                      f"not use reference images — they will be ignored.")

        # Resolve arch-derived defaults where the user left a field neutral.
        effective_clip_type = (clip_type or "").strip() or spec["default_clip_type"]
        effective_shift = shift if shift > 0.0 else spec["shift_default"]
        sampling = spec["sampling"]

        # Trim CLIP slots to the arch's allowance. State preserves all three
        # so switching arches doesn't destroy prior picks, but a 1-slot arch
        # must never trigger a triple-CLIP load with stale slot-2/3 values.
        n_clip_slots = spec.get("clip_slots", 1)
        if n_clip_slots < 2: clip_file_2 = ""
        if n_clip_slots < 3: clip_file_3 = ""

        # Mark this instance as live in the bounded cache LRU (may evict the
        # least-recently-run instance's caches across all tiers).
        _touch_instance(unique_id)

        # ── Stage 1: load (two-tier cache) ─────────────────────────────────
        # Tier 1 — raw disk load, keyed only on what forces a re-read (the
        # expensive part: GGUF dequant, CLIP load, VAE construction). A LoRA or
        # strength tweak does NOT change this key, so it never re-reads disk.
        raw_key = _cache_key({
            "source_type": source_type, "model_file": model_file,
            "clip_file": clip_file, "clip_file_2": clip_file_2,
            "clip_file_3": clip_file_3, "vae_file": vae_file,
            "clip_bundled": clip_bundled, "vae_bundled": vae_bundled,
            "weight_dtype": weight_dtype, "clip_type": effective_clip_type,
        })
        cached_raw = _RAWLOAD_CACHE.get(unique_id)
        if cached_raw and cached_raw[0] == raw_key:
            raw_model, raw_clip, vae = cached_raw[1], cached_raw[2], cached_raw[3]
        else:
            raw_model, raw_clip, vae = stage_load.load_models(
                source_type=source_type, model_file=model_file,
                clip_file=clip_file, clip_file_2=clip_file_2, clip_file_3=clip_file_3,
                vae_file=vae_file,
                clip_bundled=clip_bundled, vae_bundled=vae_bundled,
                weight_dtype=weight_dtype, clip_type=effective_clip_type)
            _RAWLOAD_CACHE[unique_id] = (raw_key, raw_model, raw_clip, vae)
            # A fresh disk load invalidates everything layered on top of it.
            _LOAD_CACHE.pop(unique_id, None)
            _COND_CACHE.pop(unique_id, None)
            _BASE_CACHE.pop(unique_id, None)
            _REFINED_CACHE.pop(unique_id, None)

        # Tier 2 — LoRA stack + sampling patch on top of the raw objects. Both
        # load_lora_for_models and apply_model_sampling CLONE before patching, so
        # re-applying from the cached raw objects is safe: changing a LoRA or a
        # strength re-patches from pristine raw model/clip rather than re-reading
        # disk or stacking patches on an already-patched model.
        load_key = _cache_key({
            "raw": raw_key, "loras": loras,
            "sampling": sampling, "shift": effective_shift,
        })
        cached_load = _LOAD_CACHE.get(unique_id)
        if cached_load and cached_load[0] == load_key:
            model, clip = cached_load[1], cached_load[2]
        else:
            model, clip = stage_load.load_loras(raw_model, raw_clip, loras)
            model = stage_load.apply_model_sampling(
                model, sampling=sampling, shift_val=effective_shift)
            _LOAD_CACHE[unique_id] = (load_key, model, clip)
            # Re-patched model/CLIP invalidates conditioning + sampled outputs.
            _COND_CACHE.pop(unique_id, None)
            _BASE_CACHE.pop(unique_id, None)
            _REFINED_CACHE.pop(unique_id, None)

        # ── Conditioning (cached) ──────────────────────────────────────────
        # Re-encode only when the text, image-cond settings, reference image
        # contents, or the loaded model (via load_key) change. Reference images
        # are keyed by content digest (not filename) because the Qwen-Image-Edit
        # uploader overwrites in place — a changed image can reuse a filename.
        #
        # Negative-prompt short-circuit: ComfyUI's sampler skips the uncond
        # evaluation when cfg==1.0 (math: out = uncond + cfg*(cond-uncond)
        # collapses to cond), so anything in the negative box has zero effect
        # for that pass. If NEITHER pass uses CFG > 1, the negative is dead
        # weight: we replace it with "" so editing the negative textarea
        # doesn't bust the conditioning cache, and we skip the CLIP encode of
        # the user's negative text entirely. The predicate must consider the
        # refiner — base=1, refiner=3 still uses the negative during refining.
        neg_used = (cfg_scale != 1.0) or (enable_refiner and refiner_cfg != 1.0)
        effective_neg = negative if neg_used else ""

        cond_key = _cache_key({
            "load": load_key,
            "pos": positive, "neg": effective_neg,
            "image_cond": spec["accepts_image_cond"],
            "refs": [_tensor_digest(image1), _tensor_digest(image2),
                     _tensor_digest(image3)],
        })
        cached_cond = _COND_CACHE.get(unique_id)
        if cached_cond and cached_cond[0] == cond_key:
            positive_cond, negative_cond = cached_cond[1], cached_cond[2]
        else:
            positive_cond, negative_cond = stage_load.encode_conditioning(
                clip_obj=clip, vae_obj=vae,
                pos_text=positive, neg_text=effective_neg,
                accepts_image_cond=spec["accepts_image_cond"],
                image_edit_on=spec["accepts_image_cond"],  # auto-on when arch supports it
                image1=image1, image2=image2, image3=image3)
            _COND_CACHE[unique_id] = (cond_key, positive_cond, negative_cond)

        latent = stage_load.make_latent(vae, width, height, batch_size)

        # ── Stage 2: sampling chain (base [+ refiner]) ─────────────────────
        # Two independently-cached stages mirroring two chained KSampler nodes.
        #
        # Base pass: a normal, complete sampling pass. It runs all `steps` and
        # fully denoises — it does NOT leave leftover noise. (Leaving noise only
        # makes sense for the latent-handoff variant where the refiner continues
        # the SAME schedule; this node uses the img2img-style refiner below.)
        base_pass = {
            "steps": steps, "cfg": cfg_scale,
            "sampler_name": sampler_name, "scheduler": scheduler,
            "denoise": denoise, "add_noise": True,
            "start_at_step": 0, "end_at_step": 10000,
            "return_with_leftover_noise": False,
        }

        # Base sampling (cached): keyed on the conditioning (which folds in model
        # + prompt + refs), the seed, latent geometry, and the base pass params
        # ONLY — NOT on the refiner or any upscale setting. So enabling the
        # refiner, or changing a refiner/upscale control, leaves this key
        # untouched and reuses the cached base LATENT instead of re-sampling it.
        # We cache the latent (not a decoded image) because the refiner continues
        # in latent space with no decode between passes.
        base_key = _cache_key({
            "cond": cond_key,
            "seed": int(seed),
            "geometry": [int(width), int(height), int(batch_size)],
            "base": base_pass,
        })
        cached_base = _BASE_CACHE.get(unique_id)
        if cached_base and cached_base[0] == base_key:
            base_latent = cached_base[1]
        else:
            # decode_final=False: the base stage only produces a latent. The
            # decode happens in the refined stage below (whether or not a refiner
            # runs), so the no-refiner and refiner paths share one decode.
            _, base_latent = stage_sample.run_sampling_chain(
                model=model, vae=vae,
                positive=positive_cond, negative=negative_cond,
                latent=latent, seed=int(seed), passes=[base_pass],
                decode_final=False)
            _BASE_CACHE[unique_id] = (base_key, base_latent)

        # Refined image (cached): the final decoded image. With no refiner this
        # is just the base latent decoded; with a refiner it's the base latent
        # carried through an independent img2img-style second pass. Keyed on the
        # base (via base_key) plus the refiner settings, so it correctly misses
        # when the refiner is toggled or its params change, and hits on an
        # upscale-only re-run (upscale settings are not in this key).
        if enable_refiner:
            # Refiner pass: an independent img2img-style second pass over the
            # base result. It RE-NOISES to `refiner_denoise` strength (add_noise
            # True, denoise < 1.0) and runs its own `refiner_steps`. This is the
            # "second KSampler at partial denoise" pattern — robust, and exactly
            # what the refiner_steps + refiner_denoise controls describe. It does
            # NOT continue the base schedule, so start_at_step does not apply.
            refiner_pass = {
                "steps": refiner_steps, "cfg": refiner_cfg,
                "sampler_name": sampler_name, "scheduler": scheduler,
                "denoise": refiner_denoise, "add_noise": True,
                "start_at_step": 0, "end_at_step": 10000,
                "return_with_leftover_noise": False,
            }
            refined_key = _cache_key({
                "base": base_key,
                "refiner": refiner_pass,
            })
        else:
            refiner_pass = None
            refined_key = _cache_key({"base": base_key, "refiner": None})

        cached_refined = _REFINED_CACHE.get(unique_id)
        if cached_refined and cached_refined[0] == refined_key:
            image, out_latent = cached_refined[1], cached_refined[2]
        elif refiner_pass is not None:
            # Continue from the (cached) base latent through the refiner pass.
            image, out_latent = stage_sample.run_sampling_chain(
                model=model, vae=vae,
                positive=positive_cond, negative=negative_cond,
                latent=base_latent, seed=int(seed), passes=[refiner_pass],
                decode_final=True)
            _REFINED_CACHE[unique_id] = (refined_key, image, out_latent)
        else:
            # No refiner: decode the base latent directly. Run an empty chain so
            # the decode path stays identical to the refiner branch.
            image, out_latent = stage_sample.run_sampling_chain(
                model=model, vae=vae,
                positive=positive_cond, negative=negative_cond,
                latent=base_latent, seed=int(seed), passes=[],
                decode_final=True)
            _REFINED_CACHE[unique_id] = (refined_key, image, out_latent)

        # ── Stage 3: optional upscale ──────────────────────────────────────
        if enable_upscale and image is not None:
            image = stage_upscale.upscale_image(
                image=image, mode=upscale_mode, method=upscale_method,
                multiplier=upscale_multiplier,
                model_file=upscale_model_file or None)

        # ── On-node preview ────────────────────────────────────────────────
        ui_images = preview.save_preview(image, prompt=prompt, extra_pnginfo=extra_pnginfo)

        # Side-channel result routing: send the saved-image metadata via a
        # custom WebSocket event keyed by io_id. The frontend's module-level
        # listener looks up the originating node by io_id (stable UUID) and
        # updates its panel directly. This sidesteps ComfyUI's per-numeric-id
        # `executed` routing entirely — no `node.imgs` assignment, no Pinia
        # `nodeOutput` store entry, no cross-workflow id collision damage.
        # Returning {} (no "ui" key) keeps OUTPUT_NODE execution semantics
        # without registering images for canvas paint or other-workflow
        # mis-routing.
        if io_id:
            try:
                from server import PromptServer
                PromptServer.instance.send_sync(
                    "image-oasis/result",
                    {"io_id": io_id, "images": ui_images},
                )
            except Exception as e:
                print(f"[Image Oasis] result send failed: {e}")
        return {}


NODE_CLASS_MAPPINGS = {"ImageOasis": ImageOasis}
NODE_DISPLAY_NAME_MAPPINGS = {"ImageOasis": "Image Oasis 🌴"}
