"""
Video pipeline Stage 1: load models, text encoders, VAEs and CLIP-Vision;
apply LoRA stacks and optional attention patches.

The video sibling of stage_load.py, sharing its contracts:
  - configuration arrives as explicit arguments (from the DOM widget blob),
  - loaders CLONE before patching, so cached raw objects stay pristine,
  - a selected-but-unresolvable file fails loudly naming the file, never by
    falling through to a generic error.

Differences from the image stage, driven by registry_video:
  - THE REGISTRY DRIVES SLOT LAYOUT. Model slots come from the arch spec
    `sr_model` slot. load_models() therefore returns a dict of models keyed
    by the registry's `model_slots` (plus optional extras), not one model.
  - TWO VAE SLOTS. LTX 2.3 splits video and audio VAEs into separate files;
    the audio VAE only loads when the audio toggle is on.
      each file to its slot.
"""

import os
import sys

import torch
import folder_paths
import comfy.sd
import comfy.utils


# ---------------------------------------------------------------------------
# Folder discovery (same helpers as stage_load.py; duplicated so this module
# stays importable standalone — the two stages share no runtime state)
# ---------------------------------------------------------------------------

def _find_in_folders(filename, *folder_names):
    for name in folder_names:
        try:
            dirs = folder_paths.get_folder_paths(name)
        except Exception:
            continue
        for base in dirs:
            p = os.path.join(base, filename.replace("/", os.sep))
            if os.path.exists(p):
                return p
    return None


def _find_unet_path(f):
    return _find_in_folders(f, "unet", "diffusion_models")


def _require_text_encoder_path(f):
    p = _find_in_folders(f, "text_encoders", "clip")
    if not p:
        raise FileNotFoundError(
            f"[LTX Oasis] CLIP/text-encoder file not found: {f}. "
            "Check your text_encoders / clip folders — the file may have been "
            "moved or renamed since the list was loaded.")
    return p


# ---------------------------------------------------------------------------
# Registry-node bridges (GGUF, kjnodes) — load classes from ComfyUI's node
# registry at runtime. Same pattern as stage_load._load_gguf_node: fill
# required args from INPUT_TYPES defaults, override with explicit kwargs.
# ---------------------------------------------------------------------------

def _node_from_registry(class_name):
    import nodes as _n
    return _n.NODE_CLASS_MAPPINGS.get(class_name)


def _load_gguf_node(class_name, **explicit_kwargs):
    Cls = _node_from_registry(class_name)
    if not Cls:
        raise RuntimeError(
            f"[LTX Oasis] {class_name} not found — is ComfyUI-GGUF installed?")
    loader = Cls()
    kwargs = dict(explicit_kwargs)
    for k, v in Cls.INPUT_TYPES().get("required", {}).items():
        if k in kwargs:
            continue
        d = (v[1] if len(v) > 1 else {}).get(
            "default", v[0][0] if isinstance(v[0], list) else None)
        if d is not None:
            kwargs[k] = d
    if class_name == "UnetLoaderGGUF":
        return loader.load_unet(**kwargs)[0]
    return loader.load_clip(**kwargs)[0]


# ---------------------------------------------------------------------------
# Prompt-enhancer VRAM handoff — identical contract to the image stage. The
# enhancer module is shared suite-wide under IO's fixed sys.modules key.
# ---------------------------------------------------------------------------

def unload_enhancer_if_loaded():
    m = sys.modules.get("image_oasis_routes_enhance")
    if m is None:
        return
    fn = getattr(m, "unload_enhancer", None)
    if fn is None:
        return
    try:
        fn()
    except Exception as e:
        print(f"[LTX Oasis] Enhancer unload skipped: {e!r}")


# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------

def _dtype_options(weight_dtype):
    opts = {}
    if weight_dtype == "fp8_e4m3fn":
        opts["dtype"] = torch.float8_e4m3fn
    elif weight_dtype == "fp8_e4m3fn_fast":
        opts["dtype"] = torch.float8_e4m3fn
        opts["fp8_optimizations"] = True
    elif weight_dtype == "fp8_e5m2":
        opts["dtype"] = torch.float8_e5m2
    return opts


def _load_one_model(source_type, model_file, weight_dtype, slot):
    """Load a single diffusion model by source type. Checkpoint source also
    returns (clip, vae) bundles; others return (model, None, None)."""
    if not model_file:
        raise ValueError(f"[LTX Oasis] No model selected for slot '{slot}'.")

    if source_type == "diffusion":
        unet_path = _find_unet_path(model_file)
        if not unet_path:
            raise FileNotFoundError(
                f"[LTX Oasis] Diffusion model not found ({slot}): {model_file}")
        return (comfy.sd.load_diffusion_model(
            unet_path, model_options=_dtype_options(weight_dtype)), None, None)

    if source_type == "gguf":
        unet_path = _find_unet_path(model_file)
        if not unet_path:
            raise FileNotFoundError(
                f"[LTX Oasis] GGUF model not found ({slot}): {model_file}")
        return _load_gguf_node("UnetLoaderGGUF", unet_name=model_file), None, None

    raise ValueError(f"[LTX Oasis] Unknown source type: {source_type}")


def _clip_type_enum(clip_type):
    """Strict CLIPType lookup. The image stage's silent fallback to
    STABLE_DIFFUSION would be catastrophic here — a video TE tokenized with an
    SD tokenizer produces garbage conditioning with no error — so unknown
    types raise instead."""
    enum = getattr(comfy.sd.CLIPType, clip_type.upper(), None)
    if enum is None:
        raise ValueError(
            f"[LTX Oasis] Unknown CLIP type '{clip_type}'. Your ComfyUI may "
            "be too old for this architecture — update ComfyUI.")
    return enum


def _load_clip(clip_files, clip_type):
    """1 or 2 TE files -> CLIP object. Any .gguf in the set routes through
    ComfyUI-GGUF's loaders (their load_data handles mixed safetensors+GGUF)."""
    slots = [f for f in clip_files if f]
    if not slots:
        return None
    any_gguf = any(f.lower().endswith(".gguf") for f in slots)
    if len(slots) == 1:
        if any_gguf:
            return _load_gguf_node("CLIPLoaderGGUF", clip_name=slots[0], type=clip_type)
        return comfy.sd.load_clip(
            ckpt_paths=[_require_text_encoder_path(slots[0])],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            clip_type=_clip_type_enum(clip_type))
    if len(slots) == 2:
        if any_gguf:
            return _load_gguf_node(
                "DualCLIPLoaderGGUF",
                clip_name1=slots[0], clip_name2=slots[1], type=clip_type)
        return comfy.sd.load_clip(
            ckpt_paths=[_require_text_encoder_path(f) for f in slots],
            embedding_directory=folder_paths.get_folder_paths("embeddings"),
            clip_type=_clip_type_enum(clip_type))
    raise ValueError(
        f"[LTX Oasis] Expected 1-2 text encoder files, got {len(slots)}.")


def _load_vae_file(vae_file, label):
    vae_path = folder_paths.get_full_path("vae", vae_file)
    if not vae_path:
        raise FileNotFoundError(
            f"[LTX Oasis] {label} VAE not found: {vae_file}")
    sd, meta = comfy.utils.load_torch_file(vae_path, return_metadata=True)
    vae_obj = comfy.sd.VAE(sd=sd, metadata=meta)
    vae_obj.throw_exception_if_invalid()
    return vae_obj


def load_models(spec, source_type, model_files, clip_files, vae_files,
                weight_dtype, clip_bundled=False, vae_bundled=False,
                audio_enabled=False):
    """Load everything the architecture declares. Returns a dict:

        {"models":      {slot: ModelPatcher, ...}   # keys = spec model_slots
                                                    #        (+ "sr_model" if given)
         "clip":        CLIP,
         "vae":         VAE,                        # video VAE
         "audio_vae":   VAE | None,
         "clip_vision": ClipVisionModel | None}

    `model_files` maps slot name -> filename. Extra keys beyond the registry's
    `model_slots` load
    with the same source rules. `vae_files` maps "video"/"audio" -> filename.
        bundle is consulted (multi-model arches have no bundled anything).
    """
    models, bundled_clip, bundled_vae = {}, None, None

    slot_order = list(spec["model_slots"])
    for extra in model_files:
        if extra not in slot_order:
            slot_order.append(extra)     # e.g. sr_model, appended after core slots

    for i, slot in enumerate(slot_order):
        f = (model_files.get(slot) or "").strip()
        if not f:
            if slot in spec["model_slots"]:
                raise ValueError(
                    f"[LTX Oasis] Architecture '{spec['label']}' requires a "
                    f"model in slot '{slot}'.")
            continue                     # optional extra slot left empty
        m, c, v = _load_one_model(source_type, f, weight_dtype, slot)
        models[slot] = m
        if i == 0:
            bundled_clip, bundled_vae = c, v

    # ── Text encoder ────────────────────────────────────────────────────────
    clip_obj = bundled_clip if clip_bundled else _load_clip(
        clip_files, spec["clip"]["type"])
    if clip_obj is None:
        raise RuntimeError(
            "[LTX Oasis] No text encoder available — select the file(s), "
            "or use a checkpoint with a bundled encoder.")

    # ── VAEs ────────────────────────────────────────────────────────────────
    vae_obj = None
    if vae_bundled:
        vae_obj = bundled_vae
    elif (vae_files.get("video") or "").strip():
        vae_obj = _load_vae_file(vae_files["video"].strip(), "Video")
    if vae_obj is None:
        raise RuntimeError(
            "[LTX Oasis] No video VAE available — select a VAE file, "
            "or use a checkpoint with a bundled VAE.")

    audio_vae = None
    if audio_enabled and "audio" in spec["vae_slots"]:
        af = (vae_files.get("audio") or "").strip()
        if not af:
            raise ValueError(
                "[LTX Oasis] Audio is enabled but no audio VAE is selected.")
        audio_vae = _load_vae_file(af, "Audio")

    # ── CLIP-Vision (mode-gated by caller; loaded when a file is given) ─────
    return {"models": models, "clip": clip_obj, "vae": vae_obj,
            "audio_vae": audio_vae}


# ---------------------------------------------------------------------------
# LoRA application
# ---------------------------------------------------------------------------

def load_loras(model_obj, clip_obj, loras):
    """User LoRA stack -> applied to (model, clip) in order. Identical
    contract to stage_load.load_loras: load_lora_for_models CLONES before
    patching; blank/zero entries skipped; missing files warn, never abort.
    For multi-model arches the caller passes the model the stack targets
    (every registry model slot — see apply_lora_stack_multi)."""
    model_out, clip_out = model_obj, clip_obj
    for spec in (loras or []):
        name = (spec.get("name") or "").strip()
        if not name or name == "(none)":
            continue
        sm = float(spec.get("strength_model", 0.0))
        sc = float(spec.get("strength_clip", 0.0))
        if sm == 0.0 and sc == 0.0:
            continue
        lora_path = folder_paths.get_full_path("loras", name)
        if not lora_path or not os.path.exists(lora_path):
            print(f"[LTX Oasis] LoRA not found, skipping: {name}")
            continue
        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model_out, clip_out, lora, sm, sc)
        print(f"[LTX Oasis] Applied LoRA: {name} (model {sm}, clip {sc})")
    return model_out, clip_out


def apply_lora_stack_multi(models, clip_obj, loras):
    """Apply the user LoRA stack to EVERY registry model slot, sharing one
    CLIP pass. Each slot gets the model-side deltas; the clip deltas are
    applied once (all slots share the same text encoder). Returns
    (new_models_dict, new_clip)."""
    if not loras:
        return dict(models), clip_obj
    out = {}
    clip_out = clip_obj
    first_slot = True
    for slot, m in models.items():
        if first_slot:
            out[slot], clip_out = load_loras(m, clip_out, loras)
            first_slot = False
        else:
            # subsequent slots: model deltas only (clip already patched)
            zero_clip = [dict(l, strength_clip=0.0) for l in loras]
            out[slot], _ = load_loras(m, clip_out, zero_clip)
    return out, clip_out


def apply_attention_patches(model_obj, patches):
    """Registry-declared per-model attention patches. 'sage_auto' bridges to
    kjnodes' PathchSageAttentionKJ when installed; when it isn't, the patch is
    skipped with a note (output stays correct, just slower) rather than
    failing the run — sage is an accelerator, not a correctness requirement.
    PromptRelay's masked-attention fallback (vendor/patches.py) keeps temporal
    masks working when sage IS active."""
    m = model_obj
    for p in (patches or ()):
        if p == "sage_auto":
            Cls = _node_from_registry("PathchSageAttentionKJ")
            if Cls is None:
                print("[LTX Oasis] SageAttention patch skipped — "
                      "ComfyUI-KJNodes not installed.")
                continue
            try:
                m = Cls().patch(m, "auto")[0]
                print("[LTX Oasis] SageAttention (auto) applied.")
            except Exception as e:
                print(f"[LTX Oasis] SageAttention patch skipped: {e!r}")
        else:
            print(f"[LTX Oasis] Unknown attention patch '{p}' ignored.")
    return m
