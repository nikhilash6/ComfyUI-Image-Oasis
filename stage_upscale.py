"""
Stage 3 of the pipeline: optional upscale.

Provides algorithmic and model-based upscale helpers. The node operates on the
decoded pixel image and does a single algorithmic or model upscale per run.
Includes a model-loading cache and OOM-fallback tiled scaling.
"""

import gc
import logging
import torch
import folder_paths
import comfy.utils
import comfy.model_management as model_management

try:
    from spandrel import ModelLoader, ImageModelDescriptor
except ImportError:
    ModelLoader = None
    ImageModelDescriptor = None
    logging.warning("[Image Oasis] spandrel not available — model upscaling disabled.")

try:
    from spandrel_extra_arches import EXTRA_REGISTRY
    from spandrel import MAIN_REGISTRY
    MAIN_REGISTRY.add(*EXTRA_REGISTRY)
except Exception:
    pass


_STATE = {"model": None, "model_name": None}


def _unload_model():
    if _STATE["model"] is not None:
        del _STATE["model"]
        _STATE["model"] = None
        _STATE["model_name"] = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def _load_upscale_model(model_name):
    if _STATE["model"] is not None and _STATE["model_name"] == model_name:
        return _STATE["model"]
    _unload_model()
    if ModelLoader is None:
        raise RuntimeError("[Image Oasis] spandrel is required for model upscaling.")
    model_path = folder_paths.get_full_path_or_raise("upscale_models", model_name)
    sd = comfy.utils.load_torch_file(model_path, safe_load=True)
    if "module.layers.0.residual_group.blocks.0.norm1.weight" in sd:
        sd = comfy.utils.state_dict_prefix_replace(sd, {"module.": ""})
    out = ModelLoader().load_from_state_dict(sd).eval()
    if not isinstance(out, ImageModelDescriptor):
        raise RuntimeError("[Image Oasis] Upscale model must be a single-image model.")
    _STATE["model"] = out
    _STATE["model_name"] = model_name
    print(f"[Image Oasis] Loaded upscale model: {model_name} (scale {out.scale}x)")
    return out


def _snap8(n):
    return max(8, round(n / 8) * 8)


def _algorithmic(image, method, target_w, target_h):
    samples = image.movedim(-1, 1)
    s = comfy.utils.common_upscale(samples, target_w, target_h, method, crop="disabled")
    return s.movedim(1, -1)


def _model_single(image, upscale_model, device, tile, overlap, method, target_w, target_h):
    memory_required = model_management.module_size(upscale_model.model)
    memory_required += (512 * 512 * 3) * image.element_size() * max(upscale_model.scale, 1.0) * 384.0
    memory_required += image.nelement() * image.element_size()
    model_management.free_memory(memory_required, device)

    upscale_model.to(device)
    in_img = image.movedim(-1, -3).to(device)
    t = tile
    oom = True
    try:
        while oom:
            try:
                steps = comfy.utils.get_tiled_scale_steps(
                    in_img.shape[3], in_img.shape[2], tile_x=t, tile_y=t, overlap=overlap)
                pbar = comfy.utils.ProgressBar(steps)
                s = comfy.utils.tiled_scale(
                    in_img, lambda a: upscale_model(a),
                    tile_x=t, tile_y=t, overlap=overlap,
                    upscale_amount=upscale_model.scale, pbar=pbar)
                oom = False
            except Exception as e:
                model_management.raise_non_oom(e)
                t //= 2
                if t < 128:
                    raise e
    finally:
        upscale_model.to("cpu")

    s = torch.clamp(s.movedim(-3, -1), min=0, max=1.0)
    if s.shape[2] != target_w or s.shape[1] != target_h:
        s = _algorithmic(s, method, target_w, target_h)
    return s


def upscale_image(image, mode, method, multiplier, model_file=None,
                  tile_size=512, tile_overlap=32):
    """Single-pass pixel upscale. mode is 'algorithmic' or 'model'.
    Returns the upscaled IMAGE tensor [N,H,W,C]."""
    if image is None:
        return None

    # Normalize to 4D
    if image.ndim == 5:
        b, t, h, w, c = image.shape
        image = image.reshape(b * t, h, w, c)

    source_h, source_w = image.shape[1], image.shape[2]
    target_w = _snap8(source_w * multiplier)
    target_h = _snap8(source_h * multiplier)

    if mode == "algorithmic":
        return _algorithmic(image, method, target_w, target_h)

    if mode == "model":
        if not model_file:
            raise ValueError("[Image Oasis] Model upscale selected but no model file given.")
        upscale_model = _load_upscale_model(model_file)
        device = model_management.get_torch_device()
        secondary = method if method != "bislerp" else "lanczos"
        # Single-image fast path covers the common gen case (batch handled frame-wise)
        if image.shape[0] == 1:
            return _model_single(image, upscale_model, device, tile_size, tile_overlap,
                                 secondary, target_w, target_h)
        # Small batch: process frame by frame to bound VRAM
        frames = []
        for i in range(image.shape[0]):
            fr = _model_single(image[i:i + 1], upscale_model, device, tile_size,
                               tile_overlap, secondary, target_w, target_h)
            frames.append(fr[0].cpu())
        return torch.stack(frames)

    raise ValueError(f"[Image Oasis] Unknown upscale mode: {mode}")
