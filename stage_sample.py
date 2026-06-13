"""
Stage 2 of the pipeline: run one or more KSampler passes over the latent.

This is the refinement chain. A single pass is base sampling; additional
passes are refiner passes — the two-chained-KSampler-Advanced pattern,
generalized to N passes. Each pass maps its advanced flags onto
common_ksampler.

A "pass" is a dict:
    {
        "steps": int, "cfg": float,
        "sampler_name": str, "scheduler": str,
        "denoise": float,
        "add_noise": bool,              # False -> disable_noise
        "start_at_step": int,           # !=0 -> start_step
        "end_at_step": int,             # !=10000 -> last_step
        "return_with_leftover_noise": bool,  # True -> force_full_denoise=False
    }
"""

import torch
import traceback


def _vae_decode_safe(vae, samples):
    """Decode 4D or 5D latents. 5D spatiotemporal VAEs decode whole; image VAEs
    decode per-frame and concat."""
    if not hasattr(vae, "decode"):
        raise RuntimeError("[Image Oasis] VAE has no decode()")
    if samples is None:
        return None
    if samples.ndim != 5:
        return vae.decode(samples)

    _b, _c, t, _lh, _lw = samples.shape
    latent_dim = int(getattr(vae, "latent_dim", 2) or 2)
    if latent_dim >= 3:
        return vae.decode(samples)

    outs = []
    for t0 in range(t):
        decoded = vae.decode(samples[:, :, t0, :, :])
        if decoded is not None:
            outs.append(decoded)
    if not outs:
        return None
    return torch.cat(outs, dim=0)


def _img_bhwc(image):
    if image is None or not isinstance(image, torch.Tensor):
        return image
    if image.ndim == 4:
        return image
    if image.ndim == 5:
        b, t, h, w, c = image.shape
        return image.reshape(b * t, h, w, c)
    return image


def run_sampling_chain(model, vae, positive, negative, latent, seed, passes,
                       decode_final=True):
    """Execute the sampling chain. Returns (image, latent).

    `passes` is a list of pass-dicts (see module docstring). Seed is shared
    across passes.
    """
    from nodes import common_ksampler

    samples = latent["samples"]
    if samples.ndim == 5:
        _, _, _, lH, lW = samples.shape
    else:
        _, _, lH, lW = samples.shape
    fallback_image = torch.zeros(1, lH * 8, lW * 8, 3, dtype=torch.float32)

    active = [p for p in passes if p.get("enabled", True)]
    if not active:
        # No passes to run. If a decode was requested, decode the input latent
        # as-is (this is the "decode the base latent directly" path used when the
        # refiner is off); otherwise hand back the untouched latent + fallback.
        if decode_final:
            decoded = _vae_decode_safe(vae, samples)
            if decoded is not None:
                return _img_bhwc(decoded), latent
        return fallback_image, latent

    current_latent = latent
    last_image = fallback_image

    for i, p in enumerate(active):
        steps = max(1, int(p.get("steps", 20)))
        cfg = float(p.get("cfg", 7.0))
        sampler = p.get("sampler_name", "euler")
        scheduler = p.get("scheduler", "normal")
        denoise = float(p.get("denoise", 1.0))
        vae_decode = bool(p.get("vae_decode", False))

        ksampler_kwargs = {"denoise": denoise}
        if not p.get("add_noise", True):
            ksampler_kwargs["disable_noise"] = True
        if int(p.get("start_at_step", 0)) != 0:
            ksampler_kwargs["start_step"] = int(p["start_at_step"])
        if int(p.get("end_at_step", 10000)) != 10000:
            ksampler_kwargs["last_step"] = int(p["end_at_step"])
        if p.get("return_with_leftover_noise", False):
            ksampler_kwargs["force_full_denoise"] = False

        # Failures MUST propagate. Swallowing them here would fall through with
        # `current_latent` still equal to the pass's INPUT latent, and the
        # caller would then cache that un-sampled latent under the same key a
        # successful run uses — every requeue with identical settings becomes a
        # cache hit on garbage. Letting the exception raise means ComfyUI shows
        # the real error on the node and no cache entry is written.
        try:
            result = common_ksampler(
                model, seed, steps, cfg, sampler, scheduler,
                positive, negative, current_latent, **ksampler_kwargs)
        except Exception as e:
            traceback.print_exc()
            raise RuntimeError(
                f"[Image Oasis] Sampling pass {i + 1} failed: {e}") from e
        if not isinstance(result, tuple) or len(result) < 1:
            raise RuntimeError(
                f"[Image Oasis] Sampling pass {i + 1}: common_ksampler returned "
                "no latent — check steps, denoise, start_at_step, end_at_step.")
        current_latent = result[0]

        if vae_decode:
            decoded = _vae_decode_safe(vae, current_latent["samples"])
            last_image = _img_bhwc(decoded) if decoded is not None else last_image

    # Always produce a final decoded image unless the last pass already did.
    if decode_final:
        decoded = _vae_decode_safe(vae, current_latent["samples"])
        if decoded is not None:
            last_image = _img_bhwc(decoded)

    return last_image, current_latent
