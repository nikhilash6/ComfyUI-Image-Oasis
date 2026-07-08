# Changelog

## v1.4

### Added
- Added img2img to every non-Qwen architecture. A new **Init** slot in the Reference Images section (under its own "Img2Img Init" divider) starts generation from your image instead of noise - an occupied slot enables it, clearing the slot returns to normal generation. Think image inspiration rather than image editing: the model remakes your image in its own style, carrying over structure, composition, and palette. Denoise is the strength dial (start around 0.5 and adjust). The Init slot has full parity with the other slots: upload, drag-drop, paste, clear, and the compare-base toggle.
- Added a **Latent** section: width/height with a swap button, aspect-ratio presets (1:1, 2:3, 3:4, 9:16, 16:9, 4:3, 3:2) that lock the fields together (nearest /16), a **Fit Method** row, and Batch (moved from Generation).
- Added the **Fit Method** (Stretch / Crop / Pad) controlling how incoming images are conformed to the latent size on both image paths: the img2img init image on non-Qwen architectures, and the edit reference images on Qwen-Image-Edit - which previously scaled references by its own internal policy without asking. Crop is the default; Pad fills leftover space with edge replication rather than black bars.
- Added an image info line to every occupied reference/init slot showing the image's resolution and file size, plus a one-click ⤢ button that sets the latent width/height to the source image's dimensions (snapped to /16).
- Added an **Interrupt** button (⏹) to the output header, visible only while a run is in progress.
- Added a fail-fast guard for startup flags that corrupt specific architectures, registry-driven. Krea 2 now refuses to run under `--use-sage-attention` with a clear error instead of silently producing black images.
- Added an automatic conditioning rebalance to the Krea 2 architecture. Krea 2 conditions on 12 stacked text-encoder layers, and alignment training under-weights the deep layers that carry fine detail and identity; the node now reweights them as part of the encode path, RMS-renormalized so overall conditioning strength is unchanged. Always on, no control to set. Krea 2 seeds from v1.3 will render slightly differently. Technique credit: nova452 and huwhitememes (both Apache-2.0).
- Added Boogu-Image 0.1 (Base and Turbo) as a first-class architecture, with the new `boogu` CLIP type. The arch default CLIP type is required - Boogu derives a mandatory conditioning argument from metadata only its own text-encoder path attaches, so generic CLIP types crash the run. Uses the Flux VAE and the Qwen3-VL-8B text encoder. The Edit variant is not supported. Requires a ComfyUI recent enough to include native Boogu support.
- Added a **Variety** control to the Generation section for the low seed-diversity problem on distilled models (Z-Image Turbo, Krea 2 Turbo, Boogu Turbo, and similar), where re-rolling the seed barely changes the composition. Variety adds a small, seeded amount of noise to the prompt conditioning during the early sampling steps so each seed lands on a genuinely different layout, then hands back the clean prompt for the rest of the run. 0 is off (the default, exact previous behavior); start around 0.1. Same seed plus same Variety reproduces the same image, and the setting rides presets like any other generation parameter.
- The CLIP type dropdown is now served from the registry alongside the architecture definitions, removing the last hand-synced frontend list - new image models are a registry-only change end to end.

### Improved
- Improved rerun overhead: reference and init images are content-hashed through a stat-based memo and only loaded/decoded when a cache miss actually needs to encode them, so a seed-only rerun costs a file stat per image instead of a read, decode, and hash.
- Architecture definitions (dropdown entries, labels, CLIP slot counts, image-conditioning gating) are now served to the frontend from the registry, so adding an architecture is a registry-only change with no hand-synced frontend mirror to drift.
- Improved VAE decode resilience: an out-of-memory during decode now retries with tiled decoding instead of failing after the sampling work is already done.
- Improved prompt-enhancer VRAM behavior: the diffusion model is no longer evicted from VRAM by passive events (adding a node, switching workflow tabs, changing the enhancer model dropdown). Eviction now happens only when Enhance is actually clicked. Auto GPU layers are computed after that eviction against real free VRAM, and the recommendation label updates to the layer count actually used.
- Improved enhancer safety: Enhance is refused while an image is generating (on both the button and the backend), and concurrent enhance requests from multiple nodes are serialized instead of racing the model loader.
- Improved error reporting when a selected CLIP/text-encoder file can't be found on disk: the error now names the missing file instead of suggesting you select one.
- Corrupted (NaN) latents reaching the preview now print a loud warning naming the likely cause instead of being silently clamped to a black image.

### Fixed
- Fixed the plain text-encode path silently dropping conditioning extras the text encoder attaches (attention mask and others). It now returns ComfyUI's full conditioning structure exactly like the stock CLIPTextEncode node. This was fatal for Boogu-Image, whose model requires an argument derived from the attention mask, and subtly lossy for other mask-emitting encoders (Qwen-Image, Krea 2) - conditioning for those architectures now matches stock ComfyUI, so seeds may render slightly differently than earlier Image Oasis versions.
- Fixed theme save routes reporting success even when the write to disk failed.
- Fixed a batch of dead code and lint issues flagged by the registry workflow.

---

## v1.3

### Added
- Added Krea 2 (Turbo and Raw) as a first-class architecture. Uses the new `krea2` CLIP type for Qwen3-VL-4B's 12-layer stacked hidden state; the 1.15 flow shift is baked into the model config, so no sampling patch is applied.
- Added `krea2` to the CLIP type dropdown to expose the new text encoder path.

### Notes
- Krea 2 produces black images when ComfyUI is launched with `--use-sage-attention`. Remove the flag if you're generating with Krea 2. Other architectures are unaffected.

---

## v1.2

### Added
- Added a new feature that splits the prompt enhancer into two textareas: a sticky **User Prompt** (your short input) and an **Enhanced Prompt** (the result that drives generation). Re-clicking Enhance always re-runs from the User Prompt, so iterating no longer means losing your original.
- Added a new feature that auto-cleans model-specific output artifacts from enhancer results (`<think>` blocks, orphan `</think>` tags, leaked `[INST]` / `[OUT]` / `<<SYS>>` template tokens, etc.) via `profiles.json`. Profiles are auto-resolved from the model filename with a universal fallback; edit the file to add rules for new models - no restart needed.
- Added an **Enhancer Settings** sub-panel at the bottom of the Prompt section (collapsed by default): Auto GPU layers with a live VRAM-based recommendation, manual GPU layers override, Context, and Max tokens. The recommendation is computed from the GGUF header's layer count and current free VRAM whenever the model selection changes.

### Improved
- Improved enhancer iteration speed: the LLM now stays loaded between Enhance clicks instead of unloading per click. It still unloads automatically when image generation starts, so it never competes with the diffusion model for VRAM during sampling.
- Improved enhancer inference speed: flash attention is now enabled by default in the llama.cpp loader. CUDA and Metal builds get the speedup transparently; CPU builds ignore the flag.

### Fixed
- Fixed a bit of code that was adding unnecessary overhead to the LLM loading process, forcing models which would normally full load into VRAM to partially offload, slowing inference speed dramatically. Prompt enhancement is now fully optimized and should feel 3-5x faster.

### Removed
- Removed the Think / No-think toggle. Thinking models now work cleanly out of the box because the auto-cleanup profiles strip the `<think>` block from the output.
- Removed the revert button. With User Prompt and Enhanced Prompt as separate boxes, your original is never overwritten - re-clicking Enhance just re-runs from the User Prompt.

---

## v1.1

### Added
- Added a new feature that lets you A/B compare the current image/batch against the previous image/batch with a draggable wipe slider in the output pane. You can also set any reference image as the compare base.
- Added a new feature that puts a full Help panel inside the node - markdown guide with a category dropdown, scrollable, no separate window needed.
- Added a new feature that surfaces multiple CLIP loader slots automatically based on the chosen architecture (1, 2, or 3 slots).
- Added a new feature that lets you drag-and-drop or Ctrl+V images directly onto reference image slots.
- Added a new feature that puts navigation arrows in the bottom-right corner of the output pane for stepping through multi-image batches.
- Added a new feature that lets you drag-reorder preset cards via a 9-dot grip handle.
- Added a new feature that lets you set trigger words per LoRA. Saved with the stack and prepended to your prompt automatically when the LoRA is enabled.

### Improved
- Improved the output-header buttons by unifying Generate, Randomize, Compare, and Save into equal-size square icons with a consistent hover behavior.
- Improved the Generate and Compare buttons by giving them their own theme variables - they default to green, and the Background and Border sliders propagate to them when moved off-default.
- Improved the execution timer by making it survive tab switches mid-generation. Switch away during a run, come back, and the clock picks up from real elapsed time.
- Improved the negative-prompt skip label to make it clear that the Negative Prompt is what's being ignored when CFG = 1.
- Improved the architecture tooltips with clearer descriptions; corrected the AuraFlow shift default callout to 3.0.
- Improved the timer readout by left-justifying the text so milliseconds digits no longer jiggle the whole string.
- Improved the Upscale section layout by reordering controls and hiding Method when in Model mode (and Up Model when in Algorithmic mode).

### Fixed
- Fixed a bug where the live preview rendered under the node body, overlapping controls and fighting with the compare slider. The right-side output pane is now the sole place the image is shown.
- Fixed a bug that caused the generated image, execution highlight, and progress bar to appear under the wrong node on a different workflow tab when that node happened to share an internal ID with Image Oasis. Results are now delivered directly to the originating Image Oasis node regardless of which workflow tab you're on. (A brief execution highlight may still flash on a same-ID node during a run - it carries no image or progress fill and clears at completion.)

### Known issues
- The generated images no longer appear in the asset side panel. The image is still saved to the temp directory as normal.
- The per-step progress bar no longer renders on the node. Step progress still prints to the ComfyUI console. The overall queue progress bar is unaffected.

---

## v1.0

### Added
- Initial release. A standalone all-in-one ComfyUI image generation node consolidating model loading, conditioning, sampling, refiner, upscale, and preview into a single monolithic node with no input/output sockets.
- Supports Flux, Qwen-Image-Edit, SD3, AuraFlow, and Z-Image Turbo architectures across checkpoint, diffusion model, and GGUF sources.
- Optional refiner pass and optional upscale (algorithmic or model-based).
- Optional LLM-based prompt enhancer (Qwen3 GGUFs).
- LoRA stack with per-LoRA model and CLIP strength.
- Preset library for saving and loading configurations.
- Per-node theme controls.
