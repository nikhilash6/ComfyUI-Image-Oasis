# Image Oasis

A standalone, all-in-one ComfyUI image generation node. One node replaces the
multi-Switch graph: pick an architecture, point at a model, prompt, get a
finished image - with an optional prompt enhancer, refiner pass, and upscale.

## What it does in one node

* **Tri-source model loading**: checkpoint / diffusion (unet) / GGUF
* **Architecture switching** via a dropdown (a capability *registry* replaces
every "Switch (Any)" node): AuraFlow, Flux.1 / Flux.2, Qwen-Image-Edit,
SD1 / SD1.5 / No Patch (the SDXL/SD1.x escape hatch), SD3 / SD3.5
* **Architecture-correct model-sampling patch** (ModelSamplingFlux /
DiscreteFlow with the right multiplier), with arch-default shift values
* **Per-architecture CLIP slots** - single, dual, or triple, automatically
surfaced based on the chosen architecture (Flux gets 2, SD3/3.5 gets 3,
AuraFlow/Qwen gets 1, etc.). Mixed safetensors + GGUF CLIPs are supported
through `ComfyUI-GGUF`'s `DualCLIPLoaderGGUF`/`TripleCLIPLoaderGGUF`
* **LoRA stack**: any number of LoRAs applied to model + CLIP in order, each with
its own model/CLIP strength and an optional trigger-words field that auto-
prepends to your prompt - works over GGUF UNets as well as safetensors;
drag the 9-dot grip to reorder
* **Conditioning** that branches automatically: plain CLIP text encode, or
TextEncodeQwenImageEditPlus with up to 3 reference images (upload *or*
drag-and-drop) when the architecture supports it
* **VAE-derived empty latent** (correct channel count / compression per model)
* **Refiner pass (img2img-style)**: optional second sampling pass over the base
result. The base runs to full denoise, then the refiner re-noises to
`refiner\_denoise` strength and runs its own steps - the "second KSampler at
partial denoise" pattern, independent of the base schedule
* **Optional upscale**: algorithmic or spandrel model upscale with OOM-fallback
tiling
* **Prompt enhancer ("magic wand")**: expand a short prompt into a detailed one
with a local LLM - see below
* **Presets**: save, reload, and drag-to-reorder named configurations
* **On-node output**: the generated image renders in the node's right-hand pane,
with a save-to-output button, randomize-seed-and-generate dice, an A/B
**compare slider** (current vs. previous, or current vs. a selected
reference image), and left/right arrows for navigating batches - all
available without keeping the Generation group open
* **Custom theme** (six CSS variables, named theme presets, live propagation
across every Image Oasis node in the workflow)
* **In-node help panel** that renders `help\_content.md` inline, so the
reference text lives next to the controls it describes

## What's new in v1.2

* **Prompt enhancer split into two boxes** - a sticky **User Prompt** (your short input)
and an **Enhanced Prompt** (the result, which drives generation). Re-clicking 
Enhance re-runs from the User Prompt every time, so iterating no longer 
overwrites your original.
* **Auto-cleanup profiles** - `profiles.json` strips model-specific output 
artifacts from enhancer results (`<think>` blocks, orphan `</think>` tags, 
leaked template tokens) without any user-facing toggle. Auto-resolved from 
the model filename, with a universal fallback. Edit the file to add rules 
for new models - no restart needed.
* **Enhancer Settings sub-panel** at the bottom of the Prompt section: Auto GPU 
layers with a live VRAM-based recommendation, manual GPU layers override, 
Context, Max tokens.
* **The enhancer LLM stays loaded between Enhance clicks** - re-enhancing is 
dramatically faster. It still unloads automatically when image generation 
starts, so it never competes with the diffusion model for VRAM during sampling.
* **Flash attention is now enabled by default** in the llama.cpp loader, for an 
additional inference speedup on CUDA / Metal builds.
* **Dropped:** the Think / No-think toggle (cleanup profiles handle thinking models 
now) and the revert button (no longer needed with the two-box flow).

## What's new in v1.1

* **Compare slider** in the output pane (`◧`) wipes between the current
generation and the previous one - perfect for "what did the refiner /
upscale actually do?" Toggle the same glyph on a reference image slot to
compare against that ref instead.
* **Batch navigation** - when a batch returns multiple images, `‹ N/M ›` in
the footer steps through them; the compare slider follows along per index.
* **Dual \& triple CLIP** - extra `CLIP 2` / `CLIP 3` rows appear in the Model
section based on the architecture, so SDXL (dual) and SD3.5 (triple) work
without leaving the node.
* **In-node Help section** at the bottom of the control stack.
* **Preset reorder** - drag the 9-dot grip on any preset card to rearrange.
* **No more in-node live preview** rendering under the node body - the output
pane is the only thing that draws the image, so it can't fight the compare
slider or engulf the controls on certain ComfyUI builds.
* **Architecture dropdown reorganized \& renamed** (alphabetical; "Other / No
Patch" became "SD1 / SD1.5 / No Patch" - and is the correct choice for
SDXL since SDXL is not flow-matching).
* Output-header buttons (Generate ▶, R\&G 🎲, Compare ◧, Save 💾) unified into
four equal squares; the timer no longer jiggles as the milliseconds tick.
* **Failures are loud now.** A sampling error (e.g. out-of-VRAM) or a failed
architecture sampling patch stops the run and shows the real error on the
node, instead of silently producing a gray image - and a failed run is
never cached, so re-queuing actually retries.
* **Bounded model cache.** Cached models are kept for the 4 most-recently-run
node instances and evicted beyond that, so swapping between workflows all
day no longer creeps RAM upward until restart. A manual
`POST /image\_oasis/flush\_cache` clears everything immediately if you need
the RAM back mid-session.
* **The execution timer survives tab switches** - including mid-generation:
switch workflows while a run is live and the clock resumes from the true
elapsed time when you come back (validated against the server queue, so a
workflow saved mid-run can't resurrect a phantom timer).

## LoRA stack

The Model section has a **LoRAs** subsection where you can stack any number of
LoRAs. Each row is a LoRA file (from `ComfyUI/models/loras/`) plus a **model**
strength and a **CLIP** strength; "+ Add LoRA" adds rows and the ✕ removes them.
LoRAs are applied **in list order, top to bottom**, to both the model and CLIP
right after the model loads and before the sampling patch - so if two LoRAs
fight, reorder them rather than only lowering strengths.

* **Strength tweaks are cheap.** The loader caches the raw on-disk model
separately from the LoRA-patched layer, so changing a strength re-patches from
the cached base instead of re-reading the model from disk. Only changing the
model file itself triggers a full reload.
* **Trigger words per LoRA.** Each enabled LoRA row exposes a trigger-words
field. Whatever you type there gets prepended to the positive prompt at run
time, in stack order, comma-joined. Disabled LoRAs sit out. Empty fields are
skipped. The trigger string is part of the LoRA stack and rides along in
presets.
* **GGUF is supported.** LoRAs apply over GGUF-quantized UNets. The patched
layers give back some of the quantization's memory saving (expected, not a
bug), so VRAM ticks up slightly with a heavy stack.
* **The stack rides along in presets.** Saving a preset captures the LoRA list
and strengths as part of the reusable "look".

## Reference images

The **Reference Images** section holds up to three slots, used by image-edit
architectures (e.g. Qwen-Image-Edit) and ignored by the rest. Fill a slot three
ways: click **Upload**, **drag an image onto the slot's image box** - from your
file manager, from another browser tab, or even from the node's own output pane
to iterate on a result - or **click the image box and paste (Ctrl+V)** an image
copied from anywhere (a website, a screenshot tool, another app). Dropped and
pasted images are copied into ComfyUI's input folder exactly like uploads, so
they behave identically downstream.

## Prompt enhancer (magic wand)

The Prompt section has a "magic wand" that expands a short prompt into a rich,
detailed one using a local GGUF LLM. It is **out-of-band**: it is not part of
the generation graph and the LLM never competes with the diffusion model for
VRAM during sampling.

### The two-box flow

* **User Prompt** - your short input. Sticky: it is not overwritten by an
enhancement, so re-clicking Enhance always re-runs from the same source.
* **Enhanced Prompt** - the LLM's expanded result. **This is what actually
drives generation.** It is overwritten on every Enhance click, so iterating
is just clicking Enhance again. You can also hand-edit it freely.

Pick a style with the toggle: **Natural Language** produces a flowing paragraph
(best for Flux, Qwen-Image-Edit, SD3); **Tags** produces a single line of
comma-separated positive tags (best for SDXL-style models).

### LLM lifetime

The model loads on the first Enhance click and **stays loaded between clicks**,
so re-enhancing is dramatically faster than the load+unload cycle of v1.1. It
unloads automatically at the start of the next image generation, so it never
holds VRAM during sampling. You don't manage this - it just happens.

### Auto cleanup (`profiles.json`)

Different LLMs leak different artifacts (a `<think>...</think>` reasoning
block, an orphan `</think>` tag, stray `\[INST]` / `\[OUT]` / `<<SYS>>` template
tokens, etc.). Image Oasis strips these automatically via `profiles.json`
beside `routes\_enhance.py`: each profile has a `match` regex (against the
model filename) and a list of cleanup rules, and the first profile that
matches wins. A `universal` rule set runs if nothing matches. Rule edits take
effect on the **next click** - no ComfyUI restart needed. Power users can add
new profiles for new model families without touching code.

### Enhancer Settings (collapsed sub-panel at the bottom of the Prompt section)

* **Auto GPU layers** (checkbox, on by default). When on, the enhancer reads
the GGUF header for layer count, queries free VRAM, and computes how many
layers fit on the GPU after a safety reserve - shown in the **Recommended:**
label next to the checkbox (`All (N)` when the whole model fits, `K/N`
otherwise). The computation evicts the diffusion model first, so the
reading reflects what will actually be available at enhance time.
* **GPU layers** - manual override, only editable when Auto is off. `-1` =
all on GPU. Don't disable Auto unless you know what you're doing - an
over-aggressive manual value will OOM the load; the enhancer retries on
CPU as a backstop, but you'll have given up the GPU speedup.
* **Context** and **Max tokens** - llama.cpp's `n\_ctx` and the per-call
output cap. Defaults (8192 / 2048) cover the curated model set; raise
Context if you're using a longer-context model and want headroom.

### Enhancer setup

1. Install `llama-cpp-python` (see Optional dependencies below).
2. Put a GGUF LLM in `ComfyUI/models/LLM/`. It appears in the model dropdown.
3. Select it, pick a style (NL or Tags), type your User Prompt, click Enhance.

### Recommended enhancer model

Use an **abliterated Qwen3** GGUF - available in 4B, 8B, 14B, and 32B - at the
largest size + quant that fully fits your VRAM (for \~8 GB cards, 8B Q4\_K\_M is
a good sweet spot; more VRAM, go bigger or higher quant; under 8 GB, the 4B is
a clean fallback). Notes:

* **Abliterated / uncensored** is the part that matters most. A stock instruct
model will sanitize, soften, or refuse certain subjects *regardless of the
system prompt*. If enhancements come back euphemized or watered down, the
model is the cause, not the prompt - use an abliterated build.
* **Instruct or hybrid-thinking, both work.** Thinking models (Qwen3 / Qwen3.5)
burn output tokens on reasoning before the answer, but the auto-cleanup
profiles strip the `<think>` block cleanly from the result. So a thinking
model is just slower per enhance, not "leaky". Pick instruct for speed,
thinking for quality on harder rewrites.
* **VL is fine for text.** The enhancer only sends text, never images, so a
vision-language model's vision tower goes unused. That is harmless - the
well-maintained abliterated builds are usually VL. A text-only Qwen3-8B
abliterated GGUF works identically and saves the unused vision weight if
you prefer it.

> Tip: enhancer output targets \~900 characters. Z-Image Turbo and
> Qwen-Image-Edit begin losing prompt accuracy past roughly 1000 characters
> (the text encoder truncates or dilutes), so the enhancer aims just under
> that ceiling.

## Install

```bash
cd ComfyUI/custom\_nodes
git clone https://github.com/NikoDemon80/ComfyUI-Image-Oasis
cd ComfyUI-Image-Oasis
pip install -r requirements.txt
```

Restart ComfyUI. The node appears under **Image Oasis → Image Oasis**.

> Alternatively, download the repo as a zip, extract into
> `ComfyUI/custom\_nodes/`, and run `pip install -r requirements.txt` from
> inside the extracted folder.

### What `requirements.txt` installs

* **`spandrel`** + **`spandrel-extra-arches`** - model-based upscaling
(the Upscale section's "Model" mode). Algorithmic upscaling needs nothing.

### Optional dependencies (not in `requirements.txt`)

Image Oasis works without these - each missing dep just disables its specific
feature with a clear error at use-time, not at node-load.

* **`ComfyUI-GGUF`** - a separate ComfyUI custom node (not a pip package),
required for the GGUF source type and GGUF CLIP files. Install via ComfyUI
Manager or:

```bash
  cd ComfyUI/custom\_nodes
  git clone https://github.com/city96/ComfyUI-GGUF
  ```

  Without it, checkpoint and diffusion source types still work; selecting GGUF
errors clearly.

* **`llama-cpp-python`** - local LLM runtime for the prompt enhancer
("magic wand"). Kept out of `requirements.txt` because the CUDA install is
toolkit-specific.

  **Pre-built wheels (easiest)**:

  ```
  pip install llama-cpp-python                          # CPU only
  pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu124   # CUDA 12.4 prebuilt
  ```

  PyPI's stock wheel is CPU-only. The abetlen wheel index has CUDA-built wheels
per Python+CUDA combination - check
[abetlen.github.io/llama-cpp-python](https://abetlen.github.io/llama-cpp-python/)
for the URL matching your toolkit (cu121 / cu122 / cu124 / etc.).

  **Source build with CUDA (when no prebuilt wheel exists for your combo)**:

  ```
  set CMAKE\_ARGS=-DGGML\_CUDA=on
  set FORCE\_CMAKE=1
  pip install --upgrade --force-reinstall --no-cache-dir llama-cpp-python
  ```

  This compiles from source - expect 15-30 minutes on a modern CPU. It requires:

  * **Visual Studio Build Tools** with the *Desktop development with C++*
workload (provides `cl.exe`). Free from Microsoft.
  * **CMake** on PATH (3.21 or newer).
  * **CUDA Toolkit** matching your driver (headers, libs, and `nvcc`).
Install from NVIDIA.

  On Linux, swap `set` for `export` and the rest is identical. On macOS, replace
`-DGGML\_CUDA=on` with `-DGGML\_METAL=on` for Apple Silicon GPU acceleration.

  **Heads up - bleeding-edge Python / CUDA**: if you're on a very new Python
(3.13+) or CUDA toolkit (13+), pre-built wheels may not exist yet. `pip install`
will silently fall back to a CPU-only source build *without* the CUDA flags
unless you set them explicitly. If your enhancer is suddenly slow after an
upgrade, check that the install built with CUDA - the build log near the end
should mention `GGML\_CUDA` being enabled.

  **Flash attention is enabled by default** in the loader. Any reasonably
recent CUDA or Metal build of `llama-cpp-python` gets the speedup
transparently; CPU builds ignore the flag. Truly ancient versions (pre-0.2.51,
\~2 years old) don't accept the `flash\_attn` kwarg and will error on load -
upgrade if you see that.

  ## Notes

* Leave `clip\_type` and `shift` neutral (blank / 0) to use the architecture's
defaults from the registry.
* Adding a new architecture later = one new entry in `registry.py` (set
`clip\_slots` to 1, 2, or 3 to declare its CLIP arity).
* Preset state preserves CLIP slot 2 and 3 values across arch switches -
swap from SD3 to Qwen and back and your three SD3 CLIPs are still in
place. `nodes.py` trims unused slots before the load call, so a 1-slot
arch never accidentally triggers a triple-CLIP load with stale state.

  ## Credits

* Execution timer (Orbitron readout + queue-event pattern) adapted from
crt-nodes.
* "Accessibility tool for the nodally challenged" - PheebyKatz.

