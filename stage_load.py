"""
Stage 1 of the pipeline: load models, apply the architecture sampling patch,
encode conditioning, and build the empty latent.

Configuration arrives as explicit function arguments (from the node's
INPUT_TYPES widgets / DOM widget blob), so this stage is self-contained.
"""

import sys

import torch
import folder_paths
import comfy.sd
import comfy.utils


# ---------------------------------------------------------------------------
# Folder discovery
# ---------------------------------------------------------------------------

def _find_in_folders(filename, *folder_names):
    import os
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


def _find_text_encoder_path(f):
    return _find_in_folders(f, "text_encoders", "clip")


# ---------------------------------------------------------------------------
# GGUF loader bridge
# ---------------------------------------------------------------------------

def _load_gguf_node(class_name, **explicit_kwargs):
    """Load a GGUF node from ComfyUI's registry, filling required args from
    INPUT_TYPES defaults. Raises a clear error if ComfyUI-GGUF isn't installed."""
    import nodes as _n
    Cls = _n.NODE_CLASS_MAPPINGS.get(class_name)
    if not Cls:
        raise RuntimeError(
            f"[Image Oasis] {class_name} not found — is ComfyUI-GGUF installed?"
        )
    loader = Cls()
    kwargs = dict(explicit_kwargs)
    for k, v in Cls.INPUT_TYPES().get("required", {}).items():
        if k in kwargs:
            continue
        d = (v[1] if len(v) > 1 else {}).get(
            "default", v[0][0] if isinstance(v[0], list) else None
        )
        if d is not None:
            kwargs[k] = d
    if class_name == "UnetLoaderGGUF":
        return loader.load_unet(**kwargs)[0]
    return loader.load_clip(**kwargs)[0]


# ---------------------------------------------------------------------------
# Model loading (checkpoint / diffusion / gguf)
# ---------------------------------------------------------------------------

def unload_enhancer_if_loaded():
    """Free the prompt-enhancer LLM (if one is cached) at the start of image
    generation, so it doesn't compete with the diffusion model for VRAM. No-op
    when no LLM is loaded, so iterating without re-enhancing doesn't trigger a
    reload cycle. Routes_enhance is loaded under a fixed sys.modules key by
    __init__.py — look it up there to avoid relative-import fragility.

    Called from nodes.py before the diffusion cache check, so it fires on
    every generation regardless of whether load_models() runs."""
    m = sys.modules.get("image_oasis_routes_enhance")
    if m is None:
        return
    fn = getattr(m, "unload_enhancer", None)
    if fn is None:
        return
    try:
        fn()
    except Exception as e:
        # Never let an enhancer-side failure block image generation.
        print(f"[Image Oasis] Enhancer unload skipped: {e!r}")


def load_models(source_type, model_file, clip_file, vae_file,
                clip_bundled, vae_bundled, weight_dtype, clip_type,
                clip_file_2="", clip_file_3=""):
    """Return (model, clip, vae).

    clip_file_2 and clip_file_3 are optional. Empty = single-CLIP behavior
    (today's path). One extra set = dual-CLIP, both extras set = triple-CLIP
    (item 7). Dual/triple routed to either stock comfy.sd.load_clip (all
    safetensors) or ComfyUI-GGUF's DualCLIPLoaderGGUF / TripleCLIPLoaderGGUF
    (any GGUF — those loaders' load_data path handles mixed safetensors+GGUF
    transparently).
    """
    if not model_file:
        raise ValueError("[Image Oasis] No model file specified.")

    model_obj = clip_obj = vae_obj = None

    # ── Model ──────────────────────────────────────────────────────────────
    if source_type == "checkpoint":
        ckpt_path = folder_paths.get_full_path("checkpoints", model_file)
        if not ckpt_path:
            raise FileNotFoundError(f"[Image Oasis] Checkpoint not found: {model_file}")
        out = comfy.sd.load_checkpoint_guess_config(
            ckpt_path, output_vae=True, output_clip=True,
            embedding_directory=folder_paths.get_folder_paths("embeddings"))
        model_obj, clip_obj, vae_obj = out[0], out[1], out[2]

    elif source_type == "diffusion":
        unet_path = _find_unet_path(model_file)
        if not unet_path:
            raise FileNotFoundError(f"[Image Oasis] Diffusion model not found: {model_file}")
        opts = {}
        if weight_dtype == "fp8_e4m3fn":
            opts["dtype"] = torch.float8_e4m3fn
        elif weight_dtype == "fp8_e4m3fn_fast":
            opts["dtype"] = torch.float8_e4m3fn
            opts["fp8_optimizations"] = True
        elif weight_dtype == "fp8_e5m2":
            opts["dtype"] = torch.float8_e5m2
        model_obj = comfy.sd.load_diffusion_model(unet_path, model_options=opts)

    elif source_type == "gguf":
        unet_path = _find_unet_path(model_file)
        if not unet_path:
            raise FileNotFoundError(f"[Image Oasis] GGUF model not found: {model_file}")
        model_obj = _load_gguf_node("UnetLoaderGGUF", unet_name=model_file)
    else:
        raise ValueError(f"[Image Oasis] Unknown source type: {source_type}")

    # ── CLIP ────────────────────────────────────────────────────────────────
    # Multi-CLIP routing (item 7). When 2 or 3 slots are filled, dispatch to
    # the right stock or GGUF loader. Any GGUF in the set → use ComfyUI-GGUF's
    # dual/triple loader (its load_data path handles mixed safetensors+GGUF).
    # All-safetensors → comfy.sd.load_clip with the full ckpt_paths list.
    clip_type_enum = getattr(
        comfy.sd.CLIPType, clip_type.upper(), comfy.sd.CLIPType.STABLE_DIFFUSION)

    if not clip_bundled:
        slots = [f for f in (clip_file, clip_file_2, clip_file_3) if f]
        if len(slots) == 1:
            cf = slots[0]
            if cf.lower().endswith(".gguf"):
                clip_obj = _load_gguf_node("CLIPLoaderGGUF", clip_name=cf, type=clip_type)
            else:
                te_path = _find_text_encoder_path(cf)
                if te_path:
                    clip_obj = comfy.sd.load_clip(
                        ckpt_paths=[te_path],
                        embedding_directory=folder_paths.get_folder_paths("embeddings"),
                        clip_type=clip_type_enum)
        elif len(slots) == 2:
            any_gguf = any(f.lower().endswith(".gguf") for f in slots)
            if any_gguf:
                # GGUF dual loader handles mixed safetensors+GGUF natively.
                # Only refusal is scaled-fp8 + GGUF (raises NotImplementedError).
                clip_obj = _load_gguf_node(
                    "DualCLIPLoaderGGUF",
                    clip_name1=slots[0], clip_name2=slots[1], type=clip_type,
                )
            else:
                te_paths = [p for p in (_find_text_encoder_path(slots[0]),
                                        _find_text_encoder_path(slots[1])) if p]
                if len(te_paths) == 2:
                    clip_obj = comfy.sd.load_clip(
                        ckpt_paths=te_paths,
                        embedding_directory=folder_paths.get_folder_paths("embeddings"),
                        clip_type=clip_type_enum)
        elif len(slots) == 3:
            any_gguf = any(f.lower().endswith(".gguf") for f in slots)
            if any_gguf:
                clip_obj = _load_gguf_node(
                    "TripleCLIPLoaderGGUF",
                    clip_name1=slots[0], clip_name2=slots[1], clip_name3=slots[2],
                    type=clip_type,
                )
            else:
                te_paths = [p for p in (_find_text_encoder_path(slots[0]),
                                        _find_text_encoder_path(slots[1]),
                                        _find_text_encoder_path(slots[2])) if p]
                if len(te_paths) == 3:
                    clip_obj = comfy.sd.load_clip(
                        ckpt_paths=te_paths,
                        embedding_directory=folder_paths.get_folder_paths("embeddings"),
                        clip_type=clip_type_enum)

    # ── VAE ──────────────────────────────────────────────────────────────────
    if vae_file and not vae_bundled:
        vae_path = folder_paths.get_full_path("vae", vae_file)
        if vae_path:
            sd, meta = comfy.utils.load_torch_file(vae_path, return_metadata=True)
            vae_obj = comfy.sd.VAE(sd=sd, metadata=meta)
            vae_obj.throw_exception_if_invalid()

    if model_obj is None:
        raise RuntimeError("[Image Oasis] Model failed to load.")
    if clip_obj is None:
        raise RuntimeError(
            "[Image Oasis] No CLIP available — select a CLIP file, "
            "or use a checkpoint with bundled CLIP.")
    if vae_obj is None:
        raise RuntimeError(
            "[Image Oasis] No VAE available — select a VAE file, "
            "or use a checkpoint with bundled VAE.")

    return model_obj, clip_obj, vae_obj


# ---------------------------------------------------------------------------
# LoRA stack — applied on top of the loaded model/clip
# ---------------------------------------------------------------------------

def load_loras(model_obj, clip_obj, loras):
    """Apply a stack of LoRAs to (model, clip), in order.

    `loras` is a list of {"name", "strength_model", "strength_clip"}. Each is
    loaded from the ComfyUI "loras" folder via comfy.sd.load_lora_for_models,
    which CLONES model/clip before patching — so the caller's originals are
    untouched. That matters here: the node caches the un-patched objects and
    re-applies LoRAs on top, so a strength tweak must not mutate them. Entries
    with a blank name or both strengths 0 are skipped; a missing file warns and
    is skipped rather than aborting the run.

    Works on GGUF-quantized UNets too (ComfyUI-GGUF supports it); patched layers
    give back some of the quant's memory saving, which is expected, not a fault.
    """
    import os
    import comfy.sd

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
            print(f"[Image Oasis] LoRA not found, skipping: {name}")
            continue
        lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
        model_out, clip_out = comfy.sd.load_lora_for_models(
            model_out, clip_out, lora, sm, sc)
        print(f"[Image Oasis] Applied LoRA: {name} (model {sm}, clip {sc})")
    return model_out, clip_out


# ---------------------------------------------------------------------------
# Model-sampling patch (flux / sd3 / auraflow)
# ---------------------------------------------------------------------------

def apply_model_sampling(model_obj, sampling, shift_val, cfgnorm_on=False):
    """Patch the model's sampling discretization. 'sampling' is one of
    'flux' | 'sd3' | 'auraflow' | 'none'.

    Failures raise. Falling back to the unpatched model would let a Flux/SD3
    model sample with the wrong discretization — garbage images with no
    user-visible error, which is strictly worse than failing the run.
    """
    if sampling == "none" and not cfgnorm_on:
        return model_obj

    try:
        import comfy.model_sampling as cms
        m = model_obj.clone()

        if sampling in ("auraflow", "sd3"):
            class _MS(cms.ModelSamplingDiscreteFlow, cms.CONST):
                pass
            ms = _MS(m.model.model_config)
            ms.set_parameters(
                shift=shift_val,
                multiplier=1.0 if sampling == "auraflow" else 1000)
            m.add_object_patch("model_sampling", ms)

        elif sampling == "flux":
            class _MS(cms.ModelSamplingFlux, cms.CONST):
                pass
            ms = _MS(m.model.model_config)
            ms.set_parameters(shift=shift_val)
            m.add_object_patch("model_sampling", ms)

        if cfgnorm_on:
            m.model_options.setdefault("transformer_options", {})["cfg_norm"] = True

        return m
    except Exception as e:
        raise RuntimeError(
            f"[Image Oasis] Sampling patch '{sampling}' failed: {e}. "
            f"Check that the selected architecture matches the model.") from e


# ---------------------------------------------------------------------------
# Conditioning — text vs Qwen-Image-Edit branch
# ---------------------------------------------------------------------------

def _img_bhwc(image):
    """Normalize IMAGE tensors to [N,H,W,C] (flattens 5D video batches)."""
    if image is None or not isinstance(image, torch.Tensor):
        return image
    if image.ndim == 4:
        return image
    if image.ndim == 5:
        b, t, h, w, c = image.shape
        return image.reshape(b * t, h, w, c)
    raise ValueError(
        f"[Image Oasis] IMAGE must be 4D or 5D, got {tuple(image.shape)}")


def encode_conditioning(clip_obj, vae_obj, pos_text, neg_text,
                        accepts_image_cond, image_edit_on,
                        image1=None, image2=None, image3=None):
    """Return (positive_cond, negative_cond).

    Routes through TextEncodeQwenImageEditPlus only when the architecture
    accepts image conditioning, the edit path is enabled, and at least one
    image is wired in. Otherwise plain CLIP text encode.
    """
    has_images = any(i is not None for i in (image1, image2, image3))

    if has_images:
        image1 = _img_bhwc(image1)
        image2 = _img_bhwc(image2)
        image3 = _img_bhwc(image3)

    use_qwen = bool(accepts_image_cond and image_edit_on and has_images)

    if use_qwen:
        from comfy_extras.nodes_qwen import TextEncodeQwenImageEditPlus

        def encode(text, use_vae=True):
            result = TextEncodeQwenImageEditPlus.execute(
                clip=clip_obj,
                prompt=text or "",
                vae=vae_obj if use_vae else None,
                image1=image1, image2=image2, image3=image3)
            return result[0]
    else:
        def encode(text, use_vae=True):
            tokens = clip_obj.tokenize(text or "")
            c, p = clip_obj.encode_from_tokens(tokens, return_pooled=True)
            return [[c, {"pooled_output": p}]]

    pos_cond = encode(pos_text, use_vae=True)
    neg_cond = encode(neg_text, use_vae=False)
    return pos_cond, neg_cond


# ---------------------------------------------------------------------------
# Empty latent — VAE-derived, generic across architectures
# ---------------------------------------------------------------------------

def make_latent(vae_obj, width, height, batch):
    """Build an empty latent sized from the VAE's own channel count and spatial
    compression — works for 4ch SD, 16ch Flux/SD3, etc. without hardcoding."""
    latent_ch = getattr(vae_obj, "latent_channels", 4)
    spatial = (vae_obj.spacial_compression_encode()
               if hasattr(vae_obj, "spacial_compression_encode") else 8)

    w = max(spatial, (int(width) // spatial) * spatial)
    h = max(spatial, (int(height) // spatial) * spatial)
    batch = max(1, int(batch))

    return {"samples": torch.zeros([batch, latent_ch, h // spatial, w // spatial])}
