# Image Oasis Help 🌴

Welcome! Image Oasis is a one-node setup for ComfyUI. Instead of wiring up 60+ nodes, you fill in the fields, hit Generate, and you're done. This guide walks the sections top to bottom - skip around as needed.

---

## 💾 Presets

A **preset** is a snapshot of your settings - Model, LoRA stack, Generation, Refiner, Upscale, everything in the config. It does **NOT** save your prompt text, your seed, or your reference images. Those are per-run, not part of a reusable "style".

**To save:** type a name, hit save.
**To load:** pick from the dropdown.
**To delete:** select it, then trash icon.
**To reorder:** drag the 9-dot grip on the left of any preset card.

---

## 🧠 Model

This is where you pick what actually generates the image.

### Three ways to load a model
- **Checkpoint** - one `.safetensors` file with everything inside (model + text encoder + VAE). Simplest.
- **Diffusion** - a standalone model file. You'll pick CLIP and VAE separately.
- **GGUF** - a quantized model. Smaller, lighter on VRAM. Same external-CLIP/VAE setup as Diffusion.

### Architecture dropdown
Tell Image Oasis what *kind* of model you loaded so sampling is configured correctly:
- **AuraFlow** - AuraFlow flow-matching using models like Z-Image Turbo.
- **Flux.1 / Flux.2** - Black Forest Labs flow-matching.
- **Qwen-Image-Edit** - Alibaba's image editor. Takes reference images.
- **SD1 / SD1.5 / No Patch** - catch-all for SD1, SD1.5, SDXL, and anything else that doesn't need a flow-matching sampling patch. **This is the correct choice for SDXL.**
- **SD3 / SD3.5** - Stable Diffusion 3 / 3.5.

> 💡 If you pick the wrong arch you'll get garbage or a solid gray image - the sampler is being patched for a different math regime. When in doubt, try **SD1 / SD1.5 / No Patch** first since "no patch" is always safe to fall back to.

### CLIP / VAE
If the checkpoint bundles its own CLIP and VAE, those dropdowns disappear. If not, you pick them yourself.

### CLIP slots (per architecture)
The number of CLIP dropdowns you see depends on the selected architecture:
- **AuraFlow, Qwen-Image-Edit** - one CLIP slot.
- **Flux.1 / Flux.2, SD1 / SD1.5 / No Patch** - two slots (slot 2 optional). Flux uses `clip_l + t5xxl`; SDXL uses `clip_l + clip_g`; SD1.5 / Flux.2 Klein leave slot 2 empty.
- **SD3 / SD3.5** - three slots (`clip_l + clip_g + t5xxl`). The triple-CLIP combo produces noticeably better quality than dual on SD3.5.

Empty slots are ignored - leave them blank if your config doesn't need them. Your CLIP picks **persist across architecture switches**: jump from SD3 to Qwen and back and your three SD3 CLIPs are still there.

> 💡 **GGUF + safetensors can mix.** A GGUF CLIP in slot 1 and a safetensors CLIP in slot 2 (or any combo) works fine - the GGUF loader handles the fusion.

---

## 🎨 LoRA

LoRAs are little add-ons that nudge the model toward a particular style, character, or concept.

- **+ Add LoRA** drops a new row.
- **Strength** - typical range 0.5-1.5. Depends on LoRA. Consult Civitai page for recommended LoRA settings.
- **Toggle** - enables/disables without removing.
- **Trigger words** - some LoRAs need a specific word or phrase in the prompt to activate. Type it in the trigger field under each enabled LoRA and it's automatically prepended to your positive prompt at run time. Leave blank for LoRAs that don't need a trigger. Disabled LoRAs are skipped.
- **Drag handle** (9-dot grip) - reorder. LoRAs apply top to bottom, so the order matters when two LoRAs compete.
- **✕** - delete the row.

> 💡 If two LoRAs fight, try **reordering** before lowering strengths.

> 💡 If a LoRA isn't doing anything visible, check whether it needs a trigger word. Trigger-word LoRAs are silent without one.

---

## 🖼️ Reference Images

For image-editing architectures like Qwen-Image-Edit. Up to **three** slots. Most edit models only use one.

### Three ways to fill a slot
- **Click** the upload button.
- **Drag and drop** a file onto the slot's image box - from your file manager, from the ComfyUI Asset side panel, or even from the node's own output pane.
- **Paste** - click the slot's image box, then Ctrl+V. Works with images copied straight off a website or from a screenshot tool.

> 💡 The little square thumbnail is the drop & paste target - it lights up when it's ready to receive. Hover it for a reminder.

### Other slot controls
- **✕** - clears the slot.
- **◧** - uses this image as the **Compare base** in the output viewer (see Output section below). Only one ref slot can be the compare base at a time.

---

## ✍️ Prompt

### Positive prompt
What you want to see.

### Negative prompt
What you *don't* want. Only used when **CFG > 1**. At CFG = 1 the box grays out and gets ignored - there's no path for it.

### Prompt Enhancer 🪄 (magic wand)
A local LLM that rewrites your short prompt into a detailed one. Runs **out-of-band**: it loads when you click the wand, rewrites, and unloads - so it never fights the diffusion model for VRAM during generation.

1. Pick an enhancer model from the dropdown.
2. Pick a style: **Natural Language** or **Tags** (comma-separated, good for SDXL-era).
3. Click the wand 🪄.
4. Don't like the result? Hit the revert button ↶ to bring back your original prompt.

### Think mode (💭) vs No-think (⚡)
For hybrid thinking models. Think mode runs a reasoning pass first - slower, but the output is tighter and less likely to drift. No-think is faster but can produce contradictions. Generally, thinking models are overkill for prompt enhancement. Instruct Abliterated models are recommended for faster iteration.

---

## ⚙️ Sampling

The actual image-generation step.

### Steps
How many denoising iterations. More = more refined, with diminishing returns. Use recommended model settings.

### CFG (Classifier-Free Guidance)
How strictly the model follows the prompt. Higher = stricter, lower = looser. Use recommended model settings.

> 💡 **CFG = 1** is a special fast mode. Only one forward pass per step (vs. two), so it's roughly **2× faster**. Distilled/turbo models are trained for this. Negative prompt is disabled at CFG = 1.

### Sampler / Scheduler
The math used to walk through noise removal. Some common pairs:
- `euler` + `simple` - safe default. fast iteration
- `dpmpp_2m` + `karras` - quality favorite. slower iteration.
- `lcm` / `sgm_uniform` - for distilled models.
- `euler_a` / `beta` - my personal favorite.

Results vary by model - experiment.

### Denoise
How much noise to start from. **1.0** = fresh generation. Lower values start from a partly-denoised state (use only for image editing or refiner pass).

### Shift
A flow-matching parameter. **0 = use the architecture's recommended default** (recommended unless you know the model). Hover the field for typical ranges by architecture.

### Batch
Generate multiple images in one run. Each gets a different starting noise pattern (seed).

### Seed
The random number that locks in the noise pattern. **Same seed + same settings = same image.**
- 🎲 - randomize and run.
- ▶ - run with the *current* seed (re-iterate without changing the noise base, helpful when refining or upscaling a generated image).

### After-generate
What happens to the seed *after* each run:
- **Fixed** - stays the same.
- **Increment / Decrement** - steps by 1.
- **Randomize** - new seed every time.

---

## 🔬 Refiner

A second sampling pass that runs on top of the first one.

### When to use it
- **Iterating on an existing image** - enable refiner with a low denoise (~0.1-0.3) to nudge the current image rather than fully regenerate.

The refiner has its **own** steps, CFG, and denoise - all independent from the base pass.

---

## 🔍 Upscale

Make the output image bigger after generation.

### Two modes
- **Algorithmic** - fast classic resizing (bilinear, bicubic, lanczos, nearest, bislerp). No model needed.
- **Model** - a dedicated upscale model (ESRGAN-family, e.g. 4x-UltraSharp). Slightly slower but much better quality, especially on real-world detail.

### ×Multiplier
How much to scale. 2× doubles resolution; 4× quadruples. With model mode, the model's "native" scale is applied first, then resized to your target multiplier if it doesn't match. This way, you can use a x4 upscale model but still only upscale the image to whatever size you want.

> 💡 OOM-safe. Image Oasis tiles automatically and falls back to smaller tiles if it runs out of VRAM mid-upscale.

---

## 🎨 Theme

Customize the node's colors. **Six theme variables** drive everything:

- **Accent** - the bright highlight color (R&G button fill, active toggles, etc.).
- **Accent (dim)** - darker variant of Accent (R&G/Save button fill, dim states).
- **Background** - the node's main background. Also drives the Generate/Compare button fill.
- **Panel** - section headers.
- **Border** - borders everywhere. Also drives the Generate/Compare button border.
- **Muted text** - labels, hints, dim text.

### Named themes
Save a palette under a name. Switch between them with one click. Themes apply to **every Image Oasis node** in the workflow at once.

### Reset
The **Reset to Default** button clears all overrides - back to the default slate-blue + dark palette.

---

## 📤 Output (the right side)

Where generated images appear.

### Header buttons
- ▶ **Generate** - runs with the current seed. Useful when adding a refiner/upscale pass to the last generated image.
- 🎲 **Randomize & Generate** - picks a new seed and generates a new image.
- ◧ **Compare** - toggles the A/B slider (see below).
- 💾 **Save** - copies to your ComfyUI output folder.

### Execution timer
The big `MM:SS:mmm` readout glows while a run is in progress; freezes at the final time when done. It survives tab switches - even mid-generation: switch away while a run is live and the clock picks back up from the true elapsed time when you return.

### Batch navigation
When a batch returns more than one image, `‹ N/M ›` appears in the bottom-right of the footer. Click the arrows to step through them. Wraps around at both ends. The compare slider (if active) pairs by index - image *N* current vs. image *N* previous.

### Compare slider (the ◧ button)
Drag the white handle to wipe between two images.

- **Default:** current image vs. the previous generation. Toggle refiner or upscale on, hit ▶ Generate, then ◧ - you can drag the slider bar to preview exactly what changed.
- **Versus a reference image:** click the ◧ next to a reference slot. The slider now compares current vs. that reference image. Click again to clear.
- **Batches:** every image in the batch gets its own slider (paired by index) when the previous batch had the same count. They all share one slider position so you can compare the whole batch at once.
- **Hidden:** if there's no previous and no ref toggled, the slider just doesn't appear.

---

## Tips & gotchas 💡

- **VRAM tight?** Use GGUF models - they're quantized to fit in less memory.
- **Generation feels slow?** Try CFG = 1 with a distilled / turbo model. Roughly 2× faster.
- **Same image every run?** Set the after-generate action to **Randomize** or use 🎲 **Randomize & Generate**.
- **Negative prompt seems to do nothing?** Check CFG - at 1.0 it's intentionally ignored.
- **Strength tweaks are cheap.** Changing a LoRA strength re-patches from cache - only changing the model *file* triggers a full reload.
- **Got an error instead of an image?** That's on purpose. When something genuinely fails mid-run (most often running out of VRAM), the run stops and shows the error rather than handing you a gray image. Fix the cause (smaller batch, lower resolution, GGUF quant) and re-queue - failed runs are never cached, so retrying actually retries.

---

*"Accessibility tool for the nodally challenged" - PheebyKatz 💖*
