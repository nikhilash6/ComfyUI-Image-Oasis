# Oasis Suite (Image Oasis v1.5)

One ComfyUI pack with three nodes that share the same player language, save
habits, and UI patterns. Install once; everything lands under
`custom_nodes/ComfyUI-Image-Oasis/`.

| Node | Class id | Folder | Docs |
|------|----------|--------|------|
| **Image Oasis** | `ImageOasis` | `image_oasis/` | [image_oasis/image_oasis_README.md](image_oasis/image_oasis_README.md) |
| **Video Oasis Viewer** | `VideoOasisPreview` | `video_oasis/` | [video_oasis/video_oasis_README.md](video_oasis/video_oasis_README.md) |
| **LTX2.3 Oasis** | `LTX23Oasis` | `ltx23_oasis/` | [ltx23_oasis/ltx23_oasis_README.md](ltx23_oasis/ltx23_oasis_README.md) |

Frontends live in `web/` (`image_oasis.js`, `videoOasis.js`, `ltx23Oasis.js`).
**License: GPL-3.0-or-later** for the whole pack (see [LICENSE](LICENSE)).

---

## What's new in 1.5

v1.5 turns Image Oasis into a small **suite**. Two new nodes ship in this pack
for the first time (they were never a public release on their own):

### Video Oasis Viewer (new)

A preview-first Save Video replacement. Incoming `VIDEO` encodes to temp and
plays in-node; nothing hits your output folder until you press Save.

- Scrub / frame-step / mute / speed / lightbox (scroll zoom, drag pan)
- Frame drag onto other nodes' image inputs (Load Image, refs, LTX guides, …)
- Playback: **off → loop → cycle** (cycle walks the scene bar like a dailies reel)
- **Scene bar** (up to 24): click to recall, delete, long-press reorder, **+**
  load from `output/`, **Save** (lossless copy + workflow metadata)
- **Clip**: mark in `[` / out `]` then Clip -- trimmed file lands in the bar
- **Create Movie**: concat every *saved* bar clip (stream-copy when possible,
  re-encode when Clip or mismatched params require it)
- **Encode / Save** section (LTXO-matching): format / codec / quality / save prefix
- Theme follows LTX2.3 Oasis (not Image Oasis)

Full detail: [video_oasis/video_oasis_README.md](video_oasis/video_oasis_README.md).

### LTX2.3 Oasis (new)

All-in-one LTX 2.3 video generation in the Image Oasis UI shape -- model pick,
prompt enhancer, LoRA stack, Start Frame / Prompt Beats, audio modes, sigmas,
spatial upsample -- with the same player, scene bar, Clip, Create Movie, and
encode/save path as Video Oasis Viewer (uses the in-pack encode path; no
extra video pack required).

- Text→Video and Image→Video, plus **Continue from viewed video** chaining
- Prompt Beats (local text + optional guide images on a timeline)
- Audio: Off / Generate / File (audio-driven video)
- Scene bar persistence across ComfyUI tab switches and reloads

Full detail: [ltx23_oasis/ltx23_oasis_README.md](ltx23_oasis/ltx23_oasis_README.md)
(and the in-node Help pane, fed by `ltx23_oasis/ltx23_oasis_help_content.md`).

### Image Oasis (carried forward)

Same all-in-one image node as 1.4.x, plus the recent history-strip / bypass /
CivitAI-hash work. Architecture registry, enhancer, LoRAs, refiner, upscale --
unchanged class id `ImageOasis`. See
[image_oasis/image_oasis_README.md](image_oasis/image_oasis_README.md) for the
full feature list and older "what's new" notes (v1.1-1.4).

### Pack-level changes

- Layout: `image_oasis/`, `video_oasis/`, `ltx23_oasis/` + shared `web/`
- Whole pack is **GPL-3.0-or-later** (LTX Director code vendored under
  `ltx23_oasis/vendor/` requires it)
- Stable class ids so workflows keep loading: `ImageOasis`,
  `VideoOasisPreview`, `LTX23Oasis`

---

## Install

1. Place (or update) this folder at
   `ComfyUI/custom_nodes/ComfyUI-Image-Oasis/`.
2. Install Python deps from the pack root:
   `pip install -r requirements.txt`
3. Restart ComfyUI, then hard-refresh the browser (Ctrl+F5) so the three
   frontend scripts reload.

**Optional (Image Oasis / LTX enhancer):** `llama-cpp-python` with a CUDA/Metal
build for the GGUF prompt enhancer -- see
[image_oasis/image_oasis_README.md](image_oasis/image_oasis_README.md).

**Optional (LTX):** `ComfyUI-GGUF` for GGUF diffusion; `ComfyUI-KJNodes` for
LTX2 NAG when CFG is 1 and a negative prompt is set.

Presets / themes:

- Image Oasis → `ComfyUI/user/image_oasis/`
- LTX2.3 Oasis → `ComfyUI/user/ltx23_oasis/`

---

## Credits

- Execution timer pattern adapted from crt-nodes.
- Krea 2 conditioning rebalance: nova452 / huwhitememes (Apache-2.0).
- LTX2.3 Oasis vendors PromptRelay / patches from WhatDreamsCost-ComfyUI
  (LTX Director), GPL-3.0-or-later -- see `ltx23_oasis/vendor/`.
- "Accessibility tool for the nodally challenged" -- PheebyKatz.

## License

**GPL-3.0-or-later.** See [LICENSE](LICENSE).
