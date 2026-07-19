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
- **Boogu-Image 0.1 (Base / Turbo)** - Boogu's 10B unified image model. Turbo is 3-4 step distilled (CFG 1.0, sgm_uniform); Base uses standard flow-matching (CFG ~4, 30-50 steps). Uses the Flux VAE and a Qwen3-VL-8B text encoder with its own `boogu` CLIP type - the arch default sets this for you, and picking a different CLIP type will crash the run (the model needs conditioning metadata only the boogu encoder attaches). The Edit variant is not supported.
- **Flux.1 / Flux.2** - Black Forest Labs flow-matching.
- **Krea 2 (Turbo / Raw)** - Krea's 12B DiT. Turbo is 8-step distilled (CFG 1.0); Raw uses standard flow-matching (more steps, positive CFG).
- **Qwen-Image-Edit** - Alibaba's image editor. Takes reference images.
- **SD1 / SD1.5 / No Patch** - catch-all for SD1, SD1.5, SDXL, and anything else that doesn't need a flow-matching sampling patch. **This is the correct choice for SDXL.**
- **SD3 / SD3.5** - Stable Diffusion 3 / 3.5.

> 💡 If you pick the wrong arch you'll get garbage or a solid gray image - the sampler is being patched for a different math regime. When in doubt, try **SD1 / SD1.5 / No Patch** first since "no patch" is always safe to fall back to.

> ⚠️ **Krea 2 + Sage attention = black images.** Sage attention corrupts Krea 2's math, so as of v1.4 the node refuses to run Krea 2 while ComfyUI is launched with `--use-sage-attention` - you'll get a clear error instead of a wasted run and a black square. Remove the flag and restart ComfyUI. Other architectures (Flux, Qwen, SD3, SDXL, etc.) are unaffected.

### CLIP / VAE
If the checkpoint bundles its own CLIP and VAE, those dropdowns disappear. If not, you pick them yourself.

### CLIP slots (per architecture)
The number of CLIP dropdowns you see depends on the selected architecture:
- **AuraFlow, Boogu-Image, Krea 2, Qwen-Image-Edit** - one CLIP slot.
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
- **CivitAI** - next to the trigger field on every enabled LoRA. Hashes your local file and opens its exact CivitAI model page in a new tab - no search-results guessing, it's a by-file-hash match. Handy for checking recommended strengths and trigger words. If the file isn't on CivitAI, the error shows up in the button's tooltip.
- **Drag handle** (9-dot grip) - reorder. LoRAs apply top to bottom, so the order matters when two LoRAs compete.
- **✕** - delete the row.

> 💡 If two LoRAs fight, try **reordering** before lowering strengths.

> 💡 If a LoRA isn't doing anything visible, check whether it needs a trigger word. Trigger-word LoRAs are silent without one.

---

## 🖼️ Reference Images

Two groups of slots, used by two different features:

### Qwen Image Edit (slots 1-3)
Feed the **Qwen-Image-Edit** architecture's edit conditioning - "take this picture and change X". Up to three slots; most edit models only use one. The **Fit Method** in the Latent section controls how these are mapped onto your output size. On any other architecture these slots dim and are ignored.

### Img2Img Init (non-Qwen)
One **Init** slot. Fill it on any *non-Qwen* architecture (Flux, SD1.5/SDXL, SD3, AuraFlow, Krea 2) and generation starts from this image instead of from pure noise. **Occupied slot = img2img on; clear the slot to return to normal generation.** There is no separate toggle.

**What img2img actually is:** think image *inspiration*, not image editing. Any diffusion model can do it - the model remakes your image in its own signature style, carrying over the structure, composition, and palette. Every model's style bleeds onto the result (a Flux remake looks like Flux, a Krea remake looks like Krea), and models differ in how strongly they impose it versus preserve the original. For surgical "change only the hat" instructions, that's Qwen-Image-Edit's job.

- **Strength** is the **Denoise** value in the Generation section. **Start at 0.5 and adjust from there** - the right value depends entirely on what you're asking the model to do to the image. Lower preserves more of the source; higher hands more over to the prompt and the model's own style.
- **Sizing** is the **Fit Method** in the Latent section.
- On the Qwen arch this slot dims and is ignored - Qwen already consumes images through the edit slots above.

### Three ways to fill a slot
- **Click** the upload button.
- **Drag and drop** a file onto the slot's image box - from your file manager, from the ComfyUI Asset side panel, or even from the node's own output pane (dragging your last output into Init is a quick way to iterate on it).
- **Paste** - click the slot's image box, then Ctrl+V. Works with images copied straight off a website or from a screenshot tool.

> 💡 The little square thumbnail is the drop & paste target - it lights up when it's ready to receive. Hover it for a reminder.

### Image info line
Occupied slots show the image's **resolution and file size** under the upload button. The **⤢** button next to it copies the image's dimensions into the Latent Width/Height (snapped to /16) - one click to make the output the same size as the source.

### Other slot controls
- **✕** - clears the slot.
- **◧** - uses this image as the **Compare base** in the output viewer (see Output section below). Works on all four slots, including Init - handy for wiping between your source and the img2img result. Only one slot can be the compare base at a time.

---

## ✍️ Prompt

### User Prompt
Your **short, sketch-style prompt** - the source the enhancer rewrites from. This box is **sticky**: clicking 🪄 Enhance doesn't change it, so you can re-click Enhance over and over to iterate against the same starting point without losing your original.

> 💡 If you're *not* using the enhancer, you can leave User Prompt empty and just type your full prompt into Enhanced Prompt below.

### Enhanced Prompt
The expanded version of your User Prompt - **this is what actually drives image generation**. Two ways it gets populated:
- Click 🪄 Enhance and the LLM writes here.
- Type or paste directly. Hand-edits stick around until the next Enhance click overwrites them.

Every Enhance click **overwrites this box** with a fresh result. That's the designed iteration loop - re-click for a new variation, or hand-tweak the result.

### Negative prompt
What you *don't* want. Only used when **CFG > 1**. At CFG = 1 the box grays out and gets ignored - there's no path for it.

### Prompt Enhancer 🪄 (magic wand)
A local LLM that rewrites your User Prompt into a detailed Enhanced Prompt. Runs **out-of-band**: it is not part of the generation graph. The model **stays loaded between enhance clicks** (so re-clicking is fast) and unloads automatically when you queue an image, so it never fights the diffusion model for VRAM during generation.

1. Pick an enhancer model from the dropdown. (Drop `.gguf` files in `ComfyUI/models/LLM/` to populate it.)
2. Pick a style: **Natural Language** (a flowing paragraph, best for Flux / Qwen-Image-Edit / SD3) or **Tags** (comma-separated, best for SDXL-style models).
3. Type a short prompt into **User Prompt**.
4. Click the wand 🪄. The result lands in **Enhanced Prompt**.
5. Want a different take? Click the wand again - the LLM re-enhances from your User Prompt and overwrites the Enhanced Prompt with a fresh result.

> 💡 The first Enhance click is slower (the model loads). Subsequent clicks reuse the loaded model and are fast. The model only unloads when you queue an image generation.

### Auto cleanup
Different LLMs leak different artifacts in their output - a `<think>...</think>` reasoning block, an orphan `</think>` tag, stray `[INST]` / `[OUT]` / `<<SYS>>` template tokens. Image Oasis strips these for you automatically: there's a `profiles.json` next to `routes_enhance.py` with a list of cleanup profiles, each matching a model filename pattern. First profile that matches wins; nothing matches, a `universal` rule set runs. **Edits to `profiles.json` take effect on the next Enhance click - no ComfyUI restart needed.**

> 💡 If a new model is leaking junk in the output, add a profile for it in `profiles.json` and click Enhance again. You don't need to touch any code.

### Enhancer Settings (collapsible sub-panel at the bottom of the Prompt section)
Click the **Enhancer Settings** header to expand. Three knobs, all optional - defaults are tuned for the curated model set.

- **Auto GPU layers** (checkbox, on by default). When on, Image Oasis reads the GGUF header for the model's layer count, checks live free VRAM, and picks how many layers to put on the GPU - shown next to the checkbox as **Recommended: All (N)** when the whole model fits, or **Recommended: K/N** when only a partial offload fits. The reading happens after evicting the diffusion model, so it reflects what will actually be free at enhance time.
- **GPU layers** (number field). Manual override - only editable when Auto is off. `-1` = put everything on the GPU and let llama.cpp figure it out. Anything `0` or higher is a literal layer count.
- **Context** (number field). The LLM's context window size (`n_ctx`). Default 8192. Bigger = longer inputs/outputs work, but uses more VRAM at load time.
- **Max tokens** (number field). The maximum number of tokens the LLM will emit per Enhance click. Default 2048. Capped internally against what your Context can actually hold after the input, so over-large values just clamp.

> ⚠ Only disable **Auto GPU layers** if you know what you're doing. An over-aggressive manual value will OOM the model load. Image Oasis retries on CPU as a backstop, but you'll have given up the GPU speedup.

### Picking an enhancer model

Use an abliterated GGUF - at the largest size + quant that fully fits your VRAM.

Recommended models for low-VRAM setups:

```
Model                            Quant  Tier
Llama3.3 8B Instruct Abliterated Q5_K_M (A)
Mistral 7B Instruct Abliterated  Q5_K_M (S)
Qwen2.5 7B Instruct Abliterated  Q5_K_M (C)
Qwen3 8B Abliterated             Q4_K_M (C)
Qwen3.5 9B Abliterated           Q4_K_M (B)
SuperGemma4 E4B Abliterated      Q5_K_M (A)
WizardLM-2 7B Abliterated        Q5_K_M (S)
```

---

## 📐 Latent

The canvas: what size and shape the generation starts as.

### Width / Height
Output dimensions in pixels. The ↔ button swaps them. Every image that enters generation - the img2img init or the Qwen edit references - is conformed to this size, so what these fields say is what you get.

### Ratio presets
Toggle a ratio button (1:1, 2:3, 3:4, 9:16, 16:9, 4:3, 3:2) to lock the aspect: the height snaps immediately, and from then on editing either field recalculates the other (to the nearest multiple of 16 - the safe snap for every supported architecture). Click the active button again to unlock and edit freely. The ↔ swap also flips the lock to its mirror (2:3 becomes 3:2) so the highlighted button stays honest.

### Fit Method
How incoming images are conformed to your Width x Height. On the Qwen-Image-Edit architecture this applies to the **edit reference images**; on every other architecture it applies to the **img2img Init image**. When an image path is in effect, a line under the buttons says which one - the Qwen edit references on Qwen, the img2img init otherwise.

- **Stretch** - scale to exactly the target size. Ignores aspect; a mismatched image distorts.
- **Crop** (default) - scale to fill preserving aspect, then center-crop the overflow. No distortion; the edges may be lost.
- **Pad** - scale to fit inside preserving aspect; the leftover space is filled by repeating the image's own edges. The padded regions are invented by the model, so expect the borders to be made up.

> 💡 If you want the output shaped like your source image, click the ⤢ button on the image's info line (see Reference Images) or the matching ratio preset - then every Fit Method behaves identically because nothing needs conforming.

### Batch
Generate multiple images in one run. Each gets a different starting noise pattern (seed).

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
How much noise to start from. **1.0** = fresh generation. Lower values keep more of the starting latent - this is the strength dial for **img2img** (Init slot occupied): start at **0.5** and adjust from there, since the right value depends entirely on what you're asking the model to do to the image. Also used internally by the refiner pass.

### Variety
Fixes the "every seed looks the same" problem on distilled models (Z-Image Turbo, Krea 2 Turbo, Boogu Turbo, and similar). On these models the prompt dominates so strongly that re-rolling the seed barely changes the composition. Variety adds a tiny, seeded amount of noise to the prompt conditioning during the early sampling steps - just enough to land each seed on a genuinely different layout - and hands back the clean prompt for the rest of the run, so adherence and fine detail are unaffected.

- **0 = off** (default; exact current behavior).
- **Start around 0.1** and adjust. Higher values diversify harder but drift further from the prompt.
- Fully reproducible: the same seed with the same Variety value regenerates the same image.

### Shift
A flow-matching parameter. **0 = use the architecture's recommended default** (recommended unless you know the model). Hover the field for typical ranges by architecture.

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

## ⏻ Bypass Node

A fixed footer under the left column. Click **Bypass Node** to skip this node at execution (same as rgthree's bypass - node mode 4); the button highlights and flips to **Activate Node** to bring it back. Useful when the node sits mid-graph and you want the workflow to run without it for a pass.

---

## 📤 Output (the right side)

Where generated images appear.

### Header buttons
- ▶ **Generate** - runs with the current seed. Useful when adding a refiner/upscale pass to the last generated image.
- 🎲 **Randomize & Generate** - picks a new seed and generates a new image.
- ⏹ **Interrupt** - stops the current run. Only appears while a generation is in progress.
- ◧ **Compare** - toggles the A/B slider (see below).
- 💾 **Save** - copies to your ComfyUI output folder.

### Execution timer
The big `MM:SS:mmm` readout glows while a run is in progress; freezes at the final time when done. It survives tab switches - even mid-generation: switch away while a run is live and the clock picks back up from the true elapsed time when you return.

### History bar
Under the viewer is a filmstrip of recent images (up to 24):

- **Dashed green border** - temp preview (not written to `output/` yet; may disappear after a ComfyUI restart).
- **Solid green border** - saved to `output/`.
- **Accent border** - currently loaded in the viewer.
- **Click a thumb** - load it into the viewer.
- **✕ on hover** - remove from the strip (does not delete the file on disk).
- **+ tile** - load an existing image from `output/` into the strip.
- **‹ N/M ›** in the info bar - step through history. Wraps around.

Each image from a batch becomes its own thumb. 💾 Save writes the currently viewed image into `output/` and turns its border solid.

### Compare slider (the ◧ button)
Drag the white handle to wipe between two images.

- **Default:** current image vs. the previous generation. Toggle refiner or upscale on, hit ▶ Generate, then ◧ - you can drag the slider bar to preview exactly what changed.
- **Versus a reference image:** click the ◧ next to a reference slot. The slider now compares current vs. that reference image. Click again to clear.
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
