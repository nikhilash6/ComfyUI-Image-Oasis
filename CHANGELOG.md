# Changelog

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
