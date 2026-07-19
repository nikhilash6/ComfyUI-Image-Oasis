"""
Video pipeline Stage 2: text encoding, PromptRelay multi-prompt, reference
images, and the per-architecture latent + conditioning recipe.

Everything model-specific is invoked through comfy_bridge.call_node against
the installed ComfyUI's own node classes (GPL-aligned either way; runtime
invocation additionally guarantees we match the installed implementation).

Returns a dict consumed by stage_sample_video:
    {"positive", "negative", "latent",            # ready to sample
     "video_latent_frames",                       # temporal latent length (pre-AV)
     "relay_mask_fn",                             # or None
     "used_guides_or_inplace": bool}              # LTX: crop needed post-sample
"""

from .comfy_bridge import call_node, first, node_class
from .vendor import prompt_relay as pr


# ---------------------------------------------------------------------------
# Text encoding (+ PromptRelay)
# ---------------------------------------------------------------------------

def encode_text(clip, text):
    return first("CLIPTextEncode", clip=clip, text=text or "")


def build_relay(clip, global_prompt, segments, latent_frames, relay_options=None):
    """PromptRelay: global prompt + [{text, frames}] segments ->
    (full_prompt, mask_fn). Frames are in LATENT frames here — the caller
    converts from pixel frames using the arch's temporal stride.

    Empty beat texts fall back to the global prompt (Director behaviour) so
    guide-only beats keep the timeline lengths aligned with text beats.
    If every beat is empty, relay is skipped and the global prompt is used alone.
    """
    segs = list(segments or [])
    if not segs:
        return global_prompt, None

    fallback = (global_prompt or "").strip() or "video"
    locals_ = []
    lengths = []
    any_real = False
    for s in segs:
        t = (s.get("text") or "").strip()
        if t:
            any_real = True
        else:
            t = fallback
        locals_.append(t)
        f = s.get("frames")
        lengths.append(int(f) if f else 0)
    if not any_real:
        return global_prompt, None

    specified = lengths if any(lengths) else None

    raw_tok = pr.get_raw_tokenizer(clip)
    full_prompt, token_ranges = pr.map_token_indices(raw_tok, global_prompt, locals_)
    seg_lengths = pr.distribute_segment_lengths(
        len(locals_), latent_frames, specified)
    q_token_idx = pr.build_segments(token_ranges, seg_lengths,
                                    relay_options=relay_options or None)
    if not q_token_idx:
        return full_prompt, None
    # fallback tokens-per-frame only matters when grid sizes are unavailable
    # and Lq doesn't divide evenly; 1 keeps it harmless.
    mask_fn = pr.create_mask_fn(q_token_idx, 1, latent_frames)
    return full_prompt, mask_fn


def apply_nag(models, negative, audio_enabled,
              scale=11.0, alpha=0.25, tau=2.5):
    """Make the negative effective on distilled LTX: CFG 1 skips the uncond
    pass entirely, so plain negative conditioning is inert — KJNodes'
    LTX2_NAG injects it into cross-attention instead (NAG). Clones per slot;
    the shared work cache is never mutated. Must run BEFORE
    apply_relay_to_models so PromptRelay wraps the NAG forward (both sides
    are built for that stacking order)."""
    try:
        node_class("LTX2_NAG")
    except RuntimeError:
        raise RuntimeError(
            "[LTX Oasis] A negative prompt at CFG 1 routes through the "
            "LTX2 NAG node from ComfyUI-KJNodes, which isn't installed. "
            "Install/enable KJNodes, clear the negative, or raise CFG above 1.")
    out = {}
    for slot, m in models.items():
        out[slot] = first("LTX2_NAG", model=m,
                          nag_scale=scale, nag_alpha=alpha, nag_tau=tau,
                          nag_cond_video=negative,
                          nag_cond_audio=negative if audio_enabled else None)
    return out


def apply_relay_to_models(models, mask_fn):
    """Patch every model slot for PromptRelay. Clones internally; returns a
    new dict. Raises with the arch name if a model family is unsupported —
    the registry should have gated this, so reaching here is a config bug."""
    if mask_fn is None:
        return models
    from .vendor import patches as vp
    out = {}
    for slot, m in models.items():
        arch, _patch_size, _stride = vp.detect_model_type(m)
        clone = m.clone()
        vp.apply_patches(clone, arch, mask_fn)
        out[slot] = clone
    return out


def guides_from_beats(segments, total_frames):
    """Derive LTXVAddGuide specs from beat rows.

    Each beat occupies a pixel-frame slice (explicit `frames`, or an even
    split of `total_frames` when every beat leaves frames at 0). A beat with
    `guide_image` pins that image at the start of its slice. No hard slot
    cap — VRAM/latent cost is the limit.
    """
    segs = list(segments or [])
    if not segs:
        return []
    try:
        total = max(int(total_frames or 0), 0)
    except (TypeError, ValueError):
        total = 0
    raw = []
    for s in segs:
        try:
            f = int(s.get("frames") or 0)
        except (TypeError, ValueError):
            f = 0
        raw.append(max(f, 0))
    lengths = pr.distribute_segment_lengths(
        len(segs), total, raw if any(raw) else None)

    guides = []
    cursor = 0
    for s, L in zip(segs, lengths):
        img = (s.get("guide_image") or "").strip()
        if img:
            try:
                strength = float(s.get("guide_strength", 1.0))
            except (TypeError, ValueError):
                strength = 1.0
            guides.append({
                "image": img,
                "frame_idx": int(cursor),
                "strength": strength,
            })
        cursor += L
    return guides


def relay_temporal_stride(model):
    """Pixel->latent frame conversion factor for relay segment lengths."""
    from .vendor import patches as vp
    _arch, _ps, stride = vp.detect_model_type(model)
    return int(stride)


# ---------------------------------------------------------------------------
# Reference image loading (filenames uploaded to ComfyUI's input folder)
# ---------------------------------------------------------------------------

def load_ref_image(name):
    if not (name or "").strip():
        return None
    img, _mask = call_node("LoadImage", image=name.strip())
    return img


# ---------------------------------------------------------------------------
# Latent + conditioning recipes
# ---------------------------------------------------------------------------

def load_audio_waveform(audio_file):
    """Load an input-folder audio file. Returns (waveform[B,C,N], sample_rate)."""
    audio = first("LoadAudio", audio=audio_file)
    return audio["waveform"], int(audio["sample_rate"])


def build_driven_audio_latent(audio_vae, length, fps, audio_file):
    """Audio-driven generation: encode a real audio file as the init audio
    latent instead of noise. The real region gets noise_mask 0 (kept as-is —
    the video stream cross-attends to it during joint denoising). Any tail
    past the file's end stays 1 (generated).

    Critical: the waveform is trimmed to the video's wall-clock duration
    *before* encoding, so the frozen latent content and the video share the
    same timebase. (Encoding the full file then truncating latents warps
    the content vs. frames/fps.)"""
    import torch
    duration = float(length) / float(fps)
    wave, sr = load_audio_waveform(audio_file)
    target_n = max(1, int(round(duration * sr)))
    # Encode only the real samples that fit the video — never pad silence
    # into the encode (short files leave the latent tail for generation).
    # Resample is left to LTXVAudioVAEEncode (stock path).
    enc_wave = wave[..., :min(int(wave.shape[-1]), target_n)].contiguous()
    enc = first("LTXVAudioVAEEncode",
                audio={"waveform": enc_wave, "sample_rate": sr},
                audio_vae=audio_vae)
    # Empty latent at the video's length = authoritative target shape.
    # Schema types frame_rate as int — round so 23.976 doesn't truncate to 23.
    empty = first("LTXVEmptyLatentAudio", audio_vae=audio_vae,
                  frames_number=int(length),
                  frame_rate=max(1, int(round(float(fps)))),
                  batch_size=1)
    target = empty["samples"]
    real = enc["samples"].to(target.device, target.dtype)
    t = min(int(real.shape[2]), int(target.shape[2]))
    samples = target.clone()
    samples[:, :, :t] = real[:1, :, :t]
    mask = torch.ones_like(samples)     # 1 = generate (matches Concat's fill)
    mask[:, :, :t] = 0.0                # 0 = keep the real audio
    return {"samples": samples, "noise_mask": mask, "type": "audio"}


def build_mux_audio(audio_file, length, fps, audio_latent, audio_vae):
    """Build the audio track that goes into CreateVideo for file-driven runs.

    Uses the *original* waveform trimmed to frames/fps — not the VAE decode
    of the frozen latent. Encode→vocoder round-trips drift several percent
    over a clip (≈1s in 19s), which shows up as progressive lip-sync error
    even when the model saw the right latent. Short files keep the original
    prefix and append the decoded generated tail."""
    import torch
    import torchaudio
    duration = float(length) / float(fps)
    wave, sr = load_audio_waveform(audio_file)   # native rate for mux quality
    target_n = max(1, int(round(duration * sr)))
    n_real = int(wave.shape[-1])

    if n_real >= target_n:
        return {"waveform": wave[..., :target_n].contiguous(),
                "sample_rate": sr}

    # Short file: original + decoded tail (generated region of the latent).
    decoded = first("LTXVAudioVAEDecode", samples=audio_latent,
                    audio_vae=audio_vae)
    d_wave, d_sr = decoded["waveform"], int(decoded["sample_rate"])
    if d_sr != sr:
        d_wave = torchaudio.functional.resample(d_wave, d_sr, sr)
    if d_wave.shape[-1] < target_n:
        d_wave = torch.nn.functional.pad(d_wave, (0, target_n - d_wave.shape[-1]))
    else:
        d_wave = d_wave[..., :target_n]
    # Channel match.
    if d_wave.shape[1] != wave.shape[1]:
        if wave.shape[1] == 1 and d_wave.shape[1] > 1:
            wave = wave.expand(-1, d_wave.shape[1], -1)
        elif d_wave.shape[1] == 1 and wave.shape[1] > 1:
            d_wave = d_wave.expand(-1, wave.shape[1], -1)
        else:
            ch = min(wave.shape[1], d_wave.shape[1])
            wave, d_wave = wave[:, :ch], d_wave[:, :ch]
    out = d_wave.clone()
    out[..., :n_real] = wave[..., :n_real].to(out.device, out.dtype)
    return {"waveform": out.contiguous(), "sample_rate": sr}


def build_latent_and_conditioning(spec, mode, loaded, gen, refs,
                                  positive, negative, audio_enabled,
                                  audio_file=""):
    """Dispatch on the registry's latent recipe string. `loaded` is
    stage_load_video's dict; `gen` carries width/height/frames/fps/
    conditioning_fps; `refs` carries the start IMAGE tensor and guide specs
    [{image(IMAGE), frame_idx, strength}]."""
    recipe = spec["latent_recipes"][mode]
    vae = loaded["vae"]
    w, h, length = int(gen["width"]), int(gen["height"]), int(gen["frames"])
    start = refs.get("start")
    out = {"positive": positive, "negative": negative,
           "relay_mask_fn": None, "used_guides_or_inplace": False}

    if recipe in ("ltxv_empty_av", "ltxv_img_inplace_av"):
        latent = first("EmptyLTXVLatentVideo",
                       width=w, height=h, length=length, batch_size=1)
        if recipe == "ltxv_img_inplace_av":
            if start is None:
                raise ValueError("[LTX Oasis] i2v needs a start image — set "
                                 "one in Start Frame or switch mode to t2v.")
            latent = first("LTXVImgToVideoInplace", vae=vae, image=start,
                           latent=latent, strength=1.0, bypass=False)
            out["used_guides_or_inplace"] = True

        # Keyframe guide slots (LTXVAddGuide appends conditioning frames to
        # the latent; they are cropped back out after sampling).
        for g in (refs.get("guides") or []):
            img = g.get("image")
            if img is None:
                continue
            positive, negative, latent = call_node(
                "LTXVAddGuide", positive=positive, negative=negative, vae=vae,
                latent=latent, image=img,
                frame_idx=int(g.get("frame_idx", 0)),
                strength=float(g.get("strength", 1.0)))
            out["used_guides_or_inplace"] = True

        # Stamp the frame rate into conditioning (fully user-editable;
        # follows working fps unless overridden).
        positive, negative = call_node(
            "LTXVConditioning", positive=positive, negative=negative,
            frame_rate=float(gen.get("conditioning_fps") or gen.get("fps") or 25.0))

        out["video_latent_frames"] = int(latent["samples"].shape[2])

        if audio_enabled:
            fps = float(gen.get("fps") or 25.0)
            fps_i = max(1, int(round(fps)))
            if (audio_file or "").strip():
                audio_latent = build_driven_audio_latent(
                    loaded["audio_vae"], length, fps, audio_file.strip())
            else:
                audio_latent = first(
                    "LTXVEmptyLatentAudio", audio_vae=loaded["audio_vae"],
                    frames_number=int(length), frame_rate=fps_i, batch_size=1)
            latent = first("LTXVConcatAVLatent",
                           video_latent=latent, audio_latent=audio_latent)
    else:
        raise ValueError(f"[LTX Oasis] Unknown latent recipe '{recipe}'.")

    out.setdefault("video_latent_frames", int(latent["samples"].shape[2]))
    out["positive"], out["negative"], out["latent"] = positive, negative, latent
    return out
