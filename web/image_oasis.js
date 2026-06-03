// Image Oasis — full DOM-widget monolith UI
// Features: injectCSS guard, addDOMWidget with getValue/setValue JSON
// serialization, onAdded init that fetches model lists, reactive model
// dropdown, preset library, control-after-generate seed handling, and a
// right-hand output pane with save-to-output.
//
// Config is serialized into the "image_oasis_ui" widget and read by the backend
// via _read_widget_state. The serialized shape doubles as the preset substrate.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const CSS = `
:root{
  --io-mono:'Space Mono',monospace; --io-sans:'DM Sans',sans-serif;
  /* ── Accent: change just this to re-theme the node ── */
  --io-accent:#6f8bbd;        /* slate blue */
  --io-accent-dim:#4a5d82;    /* darker slate for active fills */
  --io-bg:#000000; --io-bg2:#2a2a2a; --io-bd:#3a3a3a; --io-dim:#888;
}
.io-widget{font-family:var(--io-sans);background:var(--io-bg);border:1px solid var(--io-bd);border-radius:6px;padding:0;width:100%;box-sizing:border-box;color:#ddd;overflow:hidden;display:flex;flex-direction:column;}
.io-titlebar{background:#353535;padding:0 10px;height:30px;display:flex;align-items:center;gap:8px;flex-shrink:0;border-bottom:1px solid var(--io-bd);}
.io-title{font-family:var(--io-mono);font-weight:700;font-size:12px;letter-spacing:.12em;color:#bbb;text-transform:uppercase;}
.io-inner{padding:8px 10px 10px;display:flex;flex-direction:column;gap:8px;flex:1;overflow:hidden;min-height:0;}
.io-section{background:var(--io-bg2);border:1px solid var(--io-bd);border-radius:5px;overflow:visible;flex-shrink:0;}
.io-sec-head{display:flex;align-items:center;gap:7px;padding:6px 9px;cursor:pointer;user-select:none;}
.io-sec-title{flex:1;font-family:var(--io-mono);font-size:10px;font-weight:700;letter-spacing:.07em;color:var(--io-accent);text-transform:uppercase;}
.io-chevron{color:var(--io-dim);transition:transform .15s;font-size:13px;}
.io-chevron.open{transform:rotate(90deg);}
.io-sec-body{padding:4px 9px 9px;display:flex;flex-direction:column;gap:7px;}
.io-row{display:flex;align-items:center;gap:8px;}
.io-label{font-size:10px;color:var(--io-dim);font-family:var(--io-mono);width:74px;flex-shrink:0;letter-spacing:.04em;}
.io-label.dim{opacity:.5;}
.io-select,.io-input{flex:1;min-width:0;background:#191919;border:1px solid var(--io-bd);border-radius:4px;color:#ddd;font-family:var(--io-sans);font-size:11px;padding:4px 6px;outline:none;}
.io-select:focus,.io-input:focus{border-color:var(--io-accent);}
.io-select:disabled{opacity:.4;}
.io-ta-wrap{position:relative;width:100%;display:flex;flex-direction:column;}
.io-ta{width:100%;box-sizing:border-box;background:#191919;border:1px solid var(--io-bd);border-radius:4px 4px 0 0;color:#ddd;font-family:var(--io-sans);font-size:11px;padding:5px 7px;outline:none;resize:none;overflow-y:auto;line-height:1.4;display:block;}
.io-ta:focus{border-color:var(--io-accent);}
.io-ta-handle{height:9px;background:#191919;border:1px solid var(--io-bd);border-top:none;border-radius:0 0 4px 4px;cursor:ns-resize;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.io-ta-handle::before{content:"";width:24px;height:0;border-top:2px dotted var(--io-dim);}
.io-ta-handle:hover::before{border-color:#999;}
.io-ta:focus{border-color:var(--io-accent);}
/* Negative-prompt dimmed state: applied when no pass in the current config
   uses CFG > 1, so the negative is mathematically inert. Editable, just dim. */
.io-ta.io-ta-ignored{opacity:.45;}
.io-neg-ignored-note{font-size:9px;color:var(--io-dim);font-family:var(--io-mono);letter-spacing:.04em;margin-top:-3px;}
.io-toggle-grp{display:flex;gap:0;border:1px solid var(--io-bd);border-radius:4px;overflow:hidden;flex:1;}
.io-tog{flex:1;background:#191919;border:none;color:var(--io-dim);font-family:var(--io-mono);font-size:10px;line-height:1.15;padding:5px 4px;cursor:pointer;letter-spacing:.04em;transition:all .12s;}
.io-tog.active{background:var(--io-accent-dim);color:#fff;font-weight:700;}
/* Enhancer think/no-think toggle — sits between the Model label and the dropdown.
   flex:0 0 auto + box-sizing + font-size:11px/line-height:normal/padding:4px 9px
   make it compute to the same height as the adjacent .io-select. */
.io-think-tog{flex:0 0 auto;box-sizing:border-box;background:#191919;border:1px solid var(--io-bd);border-radius:4px;color:var(--io-dim);font-family:var(--io-mono);font-size:11px;line-height:normal;padding:4px 9px;cursor:pointer;letter-spacing:.04em;transition:all .12s;white-space:nowrap;}
.io-think-tog:hover{border-color:#777;color:#ddd;}
.io-think-tog.active{background:var(--io-accent-dim);border-color:var(--io-accent);color:#fff;font-weight:700;}
.io-icon-btn.io-dice{background:var(--io-accent-dim);border-color:var(--io-accent);color:#fff;}
.io-icon-btn.io-dice:hover{background:var(--io-accent);border-color:var(--io-accent);color:#fff;}
.io-icon-btn.io-go{background:#3a5a3f;border-color:#4f7a56;color:#fff;}
.io-icon-btn.io-go:hover{background:#4f7a56;border-color:#5f9468;color:#fff;}
/* Seed-row buttons: pin the play + dice to one small size so they match. */
.io-icon-btn.io-sm{font-size:10px;}
/* Header icon buttons (play + dice): fixed height + centered content so the
   differing glyph extents (▶ vs 🎲) can't make one box taller than the other.
   Box dimensions are identical; only the glyph inside differs. */
.io-icon-btn.io-hdr{height:26px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px;font-size:13px;line-height:1;}
.io-chk{display:flex;align-items:center;gap:6px;cursor:pointer;font-size:10px;color:#ddd;font-family:var(--io-mono);flex:1;}
.io-chk-box{width:14px;height:14px;border:1px solid var(--io-bd);border-radius:3px;background:#191919;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;flex-shrink:0;}
.io-chk-box.on{background:var(--io-accent-dim);border-color:var(--io-accent);}
.io-half{display:flex;gap:8px;}
.io-half>div{flex:1;display:flex;flex-direction:column;gap:3px;}
.io-mini{font-size:9px;color:var(--io-dim);font-family:var(--io-mono);letter-spacing:.04em;}
.io-badge{font-size:8px;background:#5a5a5a;color:#eee;border-radius:3px;padding:1px 4px;font-family:var(--io-mono);font-weight:700;margin-left:5px;}
.io-body{display:flex;gap:9px;flex:1;min-height:0;overflow:hidden;}
.io-col-left{display:flex;flex-direction:column;gap:9px;overflow-y:auto;overflow-x:hidden;flex:0 0 360px;min-height:0;min-width:0;}
.io-col-left::-webkit-scrollbar{width:4px;}
.io-col-left::-webkit-scrollbar-thumb{background:var(--io-bd);border-radius:2px;}
.io-col-right{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:#161616;border:1px solid var(--io-bd);border-radius:5px;overflow:hidden;}
.io-preview-head{position:relative;display:flex;align-items:center;gap:8px;font-family:var(--io-mono);font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--io-accent);text-transform:uppercase;padding:6px 9px;border-bottom:1px solid var(--io-bd);flex-shrink:0;}
.io-preview-head .io-mini{flex:1;}
.io-preview-scroll{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:9px;}
.io-preview-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;border:1px solid var(--io-bd);}
.io-preview-empty{color:var(--io-dim);font-family:var(--io-mono);font-size:10px;text-align:center;margin:auto;padding:20px;}
.io-info-bar{padding:3px 10px;font-family:var(--io-mono);font-size:8px;color:var(--io-dim);letter-spacing:.06em;background:rgba(0,0,0,.25);border-top:1px solid var(--io-bd);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;height:20px;line-height:14px;box-sizing:border-box;display:flex;align-items:center;gap:6px;}
.io-info-label{font-weight:700;color:#aaa;}
.io-refslot{display:flex;align-items:center;gap:8px;}
.io-ref-thumb{width:44px;height:44px;border-radius:4px;border:1px solid var(--io-bd);object-fit:cover;background:#191919;flex-shrink:0;}
.io-ref-thumb-empty{width:44px;height:44px;border-radius:4px;border:1px dashed var(--io-bd);background:#191919;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--io-dim);font-size:9px;font-family:var(--io-mono);}
.io-ref-btn{flex:1;background:#191919;border:1px solid var(--io-bd);border-radius:4px;color:var(--io-dim);font-family:var(--io-mono);font-size:10px;padding:5px 6px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.io-ref-btn:hover{border-color:#777;color:#ddd;}
.io-ref-clear{background:none;border:none;color:var(--io-dim);cursor:pointer;font-size:11px;flex-shrink:0;}
.io-ref-clear:hover{color:#e07050;}
.io-icon-btn{background:#191919;border:1px solid var(--io-bd);border-radius:4px;color:#bbb;font-size:12px;cursor:pointer;padding:3px 7px;flex-shrink:0;}
.io-icon-btn:hover{border-color:#777;color:#fff;}
.io-icon-btn:disabled{opacity:.35;cursor:default;}
.io-preset-card{background:var(--io-bg2);border:1px solid var(--io-bd);border-radius:5px;overflow:hidden;flex-shrink:0;}
.io-preset-head{display:flex;align-items:center;gap:7px;padding:6px 9px;cursor:pointer;user-select:none;}
.io-preset-nm{flex:1;font-family:var(--io-mono);font-size:11px;font-weight:700;color:var(--io-accent);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.io-preset-meta{font-size:8px;color:var(--io-dim);font-family:var(--io-mono);}
.io-preset-del{background:none;border:none;color:var(--io-dim);cursor:pointer;font-size:11px;flex-shrink:0;padding:0 2px;}
.io-preset-del:hover{color:#e07050;}
.io-preset-detail{padding:4px 9px 9px;display:flex;flex-direction:column;gap:4px;}
.io-kv{display:flex;gap:6px;font-size:10px;}
.io-kv-k{color:var(--io-dim);font-family:var(--io-mono);width:60px;flex-shrink:0;}
.io-kv-v{color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;}
.io-btn{background:var(--io-accent-dim);border:1px solid var(--io-accent);color:#fff;font-family:var(--io-mono);font-size:10px;font-weight:700;padding:5px 8px;border-radius:4px;cursor:pointer;letter-spacing:.05em;margin-top:3px;}
.io-btn:hover{background:var(--io-accent);}
.io-empty{color:var(--io-dim);font-family:var(--io-mono);font-size:10px;text-align:center;padding:14px;line-height:1.6;}
.io-swatch{width:30px;height:26px;padding:0;border:1px solid var(--io-bd);border-radius:4px;background:#191919;cursor:pointer;flex-shrink:0;}
.io-swatch::-webkit-color-swatch-wrapper{padding:2px;}
.io-swatch::-webkit-color-swatch{border:none;border-radius:2px;}
.io-hex{flex:0 0 76px;font-family:var(--io-mono);text-transform:lowercase;}
/* Execution timer — Orbitron readout that glows in the node accent while running.
   Absolute-centered on the header so it sits at the true midpoint regardless of
   the (asymmetric) label and button widths on either side.
   Timer pattern + Orbitron readout adapted from crt-nodes. */
@keyframes io-timer-pulse{0%,100%{text-shadow:0 0 8px var(--io-accent);}50%{text-shadow:0 0 14px var(--io-accent);}}
.io-timer{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;font-family:'Orbitron','Space Mono',monospace;font-size:22px;font-weight:700;letter-spacing:.04em;color:var(--io-dim);font-variant-numeric:tabular-nums;white-space:nowrap;transition:color .4s ease;}
.io-timer.running{color:var(--io-accent);animation:io-timer-pulse 2.4s infinite ease-in-out;}
/* LoRA stack rows: dropdown + two compact strength fields + remove. */
.io-lora-row{display:flex;align-items:center;gap:5px;}
.io-lora-str{flex:0 0 56px;text-align:center;padding:4px 3px;}
.io-lora-row.off{opacity:.42;}
.io-lora-en{flex:0 0 20px;background:none;border:none;color:var(--io-dim);font-size:21px;line-height:1;cursor:pointer;padding:0;}
.io-lora-en.on{color:var(--io-accent);}
/* Drag handle: 9-dot grip (PA pattern). Always-visible at low opacity so the
   user knows the rows are reorderable; brightens on hover. Width tight so the
   row reclaims horizontal space for the LoRA name dropdown. */
.io-lora-drag{flex:0 0 14px;display:grid;grid-template-columns:repeat(3,3px);grid-template-rows:repeat(3,3px);gap:2px;cursor:grab;padding:2px 0;opacity:.45;transition:opacity .12s;align-content:center;justify-content:center;}
.io-lora-drag:hover{opacity:1;}
.io-lora-drag:active{cursor:grabbing;}
.io-lora-drag-dot{width:3px;height:3px;border-radius:50%;background:var(--io-dim);}
/* Drag source + drop position indicators. The shadow draws a thin accent line
   above OR below the target depending on cursor half — standard list reorder UX. */
.io-lora-row.io-lora-dragging{opacity:.35;}
.io-lora-row.io-lora-drop-above{box-shadow:0 -2px 0 0 var(--io-accent);}
.io-lora-row.io-lora-drop-below{box-shadow:0 2px 0 0 var(--io-accent);}
/* Reference-slot drop target highlight (drag an image in). */
.io-refslot.io-drop{outline:1px dashed var(--io-accent);outline-offset:2px;border-radius:6px;}
.io-refslot.io-drop .io-ref-thumb,.io-refslot.io-drop .io-ref-thumb-empty{border-color:var(--io-accent);box-shadow:0 0 0 2px var(--io-accent-dim);}
/* Named theme library rows: 6 color chips + name + delete. Click loads it. */
.io-theme-row{display:flex;align-items:center;gap:7px;padding:5px 8px;background:#191919;border:1px solid var(--io-bd);border-radius:4px;cursor:pointer;}
.io-theme-row:hover{border-color:var(--io-accent);}
.io-theme-row.active{border-color:var(--io-accent);box-shadow:inset 0 0 0 1px var(--io-accent-dim);}
.io-theme-chips{display:inline-flex;gap:2px;flex-shrink:0;}
.io-theme-chip{width:11px;height:11px;border-radius:2px;border:1px solid rgba(255,255,255,.08);}
.io-theme-nm{flex:1;font-family:var(--io-mono);font-size:11px;font-weight:700;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.io-theme-meta{font-size:8px;color:var(--io-dim);font-family:var(--io-mono);}
`;

function injectCSS(){
  if(document.getElementById("io-styles"))return;
  const s=document.createElement("style"); s.id="io-styles"; s.textContent=CSS;
  document.head.appendChild(s);
  // Orbitron for the execution timer readout (falls back to Space Mono if the
  // fetch is blocked). Loaded once, guarded by id.
  if(!document.getElementById("io-orbitron-font")){
    const f=document.createElement("link"); f.id="io-orbitron-font"; f.rel="stylesheet";
    f.href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap";
    document.head.appendChild(f);
  }
}

// ── Global theme machinery (module scope, shared by all Image Oasis nodes) ────
//
// The 6 editable CSS variables and their factory defaults. These mirror the
// :root block in CSS exactly; the editor edits these, the override <style>
// applies them to :root, so EVERY node re-themes at once (global, by design).
const IO_THEME_VARS = [
  {k:"--io-accent",     label:"Accent"},
  {k:"--io-accent-dim", label:"Accent (dim)"},
  {k:"--io-bg",         label:"Background"},
  {k:"--io-bg2",        label:"Panel"},
  {k:"--io-bd",         label:"Border"},
  {k:"--io-dim",        label:"Muted text"},
];
const IO_THEME_DEFAULTS = {
  "--io-accent":"#6f8bbd", "--io-accent-dim":"#4a5d82",
  "--io-bg":"#000000", "--io-bg2":"#2a2a2a", "--io-bd":"#3a3a3a", "--io-dim":"#888888",
};
// Live in-memory copy of the active theme (defaults until the backend load
// returns). New nodes read this on creation so they open already-themed.
let IO_THEME = {...IO_THEME_DEFAULTS};
// Editor instances register a redraw callback here so that editing the theme on
// ONE node repaints its swatches on ALL open nodes (it's a global setting).
const IO_THEME_LISTENERS = new Set();

// Apply the current IO_THEME to :root via a dedicated override <style>. Only
// values that differ from the default are written, so the static CSS defaults
// remain the source of truth for anything untouched.
function applyTheme(){
  let el = document.getElementById("io-theme-override");
  if(!el){ el=document.createElement("style"); el.id="io-theme-override"; document.head.appendChild(el); }
  const decls = IO_THEME_VARS
    .map(v=>v.k)
    .filter(k=>IO_THEME[k] && IO_THEME[k]!==IO_THEME_DEFAULTS[k])
    .map(k=>`${k}:${IO_THEME[k]};`)
    .join("");
  el.textContent = decls ? `:root{${decls}}` : "";
}

// Fetch the saved theme once (called on each node's onAdded; cheap + idempotent).
async function loadTheme(){
  try{
    const saved = await (await fetch("/image_oasis/theme")).json();
    IO_THEME = {...IO_THEME_DEFAULTS, ...(saved||{})};
  }catch(e){ console.warn("[Image Oasis] theme load",e); IO_THEME={...IO_THEME_DEFAULTS}; }
  applyTheme();
  IO_THEME_LISTENERS.forEach(fn=>{ try{fn();}catch{} });
}

// Live-preview a theme change: paint :root and tell every open node to
// repaint its editor swatches. Does NOT persist to disk — the user controls
// persistence via the explicit Save Theme button (or Reset, which commits a
// reset-to-defaults). This lets the user experiment with colors freely.
function refreshTheme(){
  applyTheme();
  IO_THEME_LISTENERS.forEach(fn=>{ try{fn();}catch{} });
}

// Persist + apply + notify. Used by the Save Theme button and by the Reset
// button (which both apply a new state AND commit it across restarts). Sends
// only non-default values; an empty payload means "no overrides, use defaults."
async function saveTheme(){
  refreshTheme();
  const payload = {};
  for(const {k} of IO_THEME_VARS){ if(IO_THEME[k] && IO_THEME[k]!==IO_THEME_DEFAULTS[k]) payload[k]=IO_THEME[k]; }
  try{ await fetch("/image_oasis/theme",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); }
  catch(e){ console.warn("[Image Oasis] theme save",e); }
}

// ── Named theme library (module scope, shared by all open nodes) ─────────────
//
// Parallel to per-node `presets`: the active theme (IO_THEME) is what's CURRENTLY
// applied; this list is a library of named palettes the user can switch between.
// Loading an entry copies its colors into IO_THEME and persists as active, so
// the selection survives restarts. Library save/delete refresh ALL open nodes
// via IO_THEME_LISTENERS (same callback used by live-edit recolor).
let IO_NAMED_THEMES = [];

async function loadNamedThemes(){
  try{
    const r = await (await fetch("/image_oasis/themes")).json();
    IO_NAMED_THEMES = Array.isArray(r) ? r : [];
  }catch(e){ console.warn("[Image Oasis] named themes load",e); IO_NAMED_THEMES=[]; }
}

// Save the CURRENT IO_THEME as a named entry. We send the full set of 6
// colors (not just non-defaults) so the named theme is a stable snapshot
// even if defaults change later. Caller is responsible for trimming/validating
// the name; the backend re-validates.
async function saveNamedTheme(name){
  const trimmed = (name||"").trim();
  if(!trimmed) return false;
  const colors = {};
  for(const {k} of IO_THEME_VARS){ colors[k] = IO_THEME[k] || IO_THEME_DEFAULTS[k]; }
  try{
    const r = await fetch("/image_oasis/save_named_theme",{
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({name:trimmed, colors}),
    });
    if(!r.ok) return false;
    await loadNamedThemes();
    // Also persist as active — Save Theme means "this is what I'm using now".
    await saveTheme();
    IO_THEME_LISTENERS.forEach(fn=>{ try{fn();}catch{} });
    return true;
  }catch(e){ console.warn("[Image Oasis] save named theme",e); return false; }
}

async function deleteNamedTheme(id){
  try{
    await fetch(`/image_oasis/themes/${id}`,{method:"DELETE"});
    await loadNamedThemes();
    IO_THEME_LISTENERS.forEach(fn=>{ try{fn();}catch{} });
  }catch(e){ console.warn("[Image Oasis] delete named theme",e); }
}

// Apply a named theme: copy its colors into IO_THEME, then saveTheme() to
// apply + notify + persist as active. Missing colors fall back to defaults
// (a tolerated state for hand-edited themes.json).
async function applyNamedTheme(id){
  const t = IO_NAMED_THEMES.find(x=>x.id===id);
  if(!t || !t.colors) return;
  IO_THEME = {...IO_THEME_DEFAULTS, ...t.colors};
  await saveTheme();
}

const ARCHS = ["flux","qwen_image_edit","sd3","auraflow","other"];
const ARCH_LABELS = {flux:"Flux",qwen_image_edit:"Qwen-Image-Edit",sd3:"SD3 / 3.5",auraflow:"AuraFlow",other:"Other"};
const SOURCES = ["checkpoint","diffusion","gguf"];
const SOURCE_LABELS = {checkpoint:"Checkpoint", diffusion:"Diffusion", gguf:"GGUF"};
const WEIGHT_DTYPES = ["default","fp8_e4m3fn","fp8_e4m3fn_fast","fp8_e5m2"];
const CLIP_TYPES = ["","stable_diffusion","sd3","flux","qwen_image","lumina2","hidream","chroma","flux2"];
const UPSCALE_MODES = ["algorithmic","model"];
const UPSCALE_METHODS = ["lanczos","bicubic","bilinear","nearest-exact","area"];
const MAX_SEED = 1125899906842624;  // 2^50, matches ComfyUI's seed range

app.registerExtension({
  name: "ImageOasis",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "ImageOasis") return;

    const _onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      if (_onCreated) _onCreated.apply(this, arguments);
      injectCSS();
      this.setSize([1000, 670]);
      this.color = "#000000"; this.bgcolor = "#202020";
      this.serialize_widgets = true;

      const selfNode = this;
      const container = document.createElement("div");
      container.className = "io-widget";

      let st = {
        architecture:"flux", source_type:"diffusion", model_file:"",
        positive:"", negative:"",
        width:1024, height:1024, batch_size:1, seed:0,
        steps:20, cfg:3.5, sampler_name:"euler", scheduler:"simple", denoise:1.0,
        seed_control:"randomize",
        clip_file:"", vae_file:"", clip_bundled:false, vae_bundled:false,
        weight_dtype:"default", clip_type:"", shift:0.0,
        loras:[],
        enable_refiner:false, refiner_steps:10, refiner_cfg:3.5,
        refiner_denoise:0.4,
        enable_upscale:false, upscale_mode:"algorithmic",
        upscale_method:"lanczos", upscale_multiplier:2.0, upscale_model_file:"",
        ref_image1:"", ref_image2:"", ref_image3:"",
      };
      let open = { presets:false, model:false, loras:false, refs:false, prompt:false, sampling:false, refiner:false, upscale:false, theme:false };
      let taHeights = { positive:72, negative:72 };  // px, drag-handle controlled
      let presets = [];
      let presetName = "";
      let expandedPresets = new Set();
      let themeName = "";   // input value for the Save Theme name field (per-node)
      let previewImages = [];
      let previewInfo = [];
      let previewMeta = "";
      let previewSizeKB = 0;
      let allModels = {checkpoints:[],diffusion:[],gguf_unet:[],clip_std:[],clip_gguf:[],vaes:[],upscale_models:[],loras:[]};
      // ── Prompt-enhancer ("magic wand") state ──
      let llmModels = [];            // .gguf / .safetensors under models/LLM
      let llmModel = "";             // selected enhancer model
      let llmStyle = "natural";      // "natural" | "tags"
      let prewandPrompt = null;      // sticky stash of the pre-enhance prompt; null = nothing to revert
      let llmThinkOff = true;        // default no-think: hybrid models skip reasoning, no-op on plain instruct
      let wandBusy = false;          // disables the button mid-call
      let samplers = ["euler","euler_ancestral","dpmpp_2m","dpmpp_2m_sde","dpmpp_3m_sde","ddim","uni_pc","lcm","er_sde","sa_solver"];
      let schedulers = ["simple","normal","karras","beta","sgm_uniform","exponential","ddim_uniform"];

      // ── Execution timer state ──
      // Driven by ComfyUI's global queue events (execution_start / executing-null).
      // State lives here in the closure (not on the DOM) so it survives render()'s
      // innerHTML wipes; the interval re-queries the element each tick rather than
      // holding a stale reference to a node that render() may have replaced.
      let timerRunning = false;
      let timerStart = 0;
      let timerElapsedMs = 0;        // frozen final value, shown between runs
      let timerInterval = null;

      const modelListFor = (t) =>
        t==="checkpoint" ? allModels.checkpoints
        : t==="diffusion" ? allModels.diffusion
        : allModels.gguf_unet;
      const clipList = () => [...allModels.clip_std, ...allModels.clip_gguf].sort();
      const opt = (list,val) => list.map(m=>`<option value="${m}"${m===val?" selected":""}>${m}</option>`).join("");
      const optBlank = (list,val,ph) => `<option value="">${ph}</option>`+opt(list,val);

      const sec = (key,title,bodyHTML) => `
        <div class="io-section">
          <div class="io-sec-head" data-sec="${key}">
            <span class="io-sec-title">${title}</span>
            <span class="io-chevron${open[key]?" open":""}">\u203a</span>
          </div>
          ${open[key]?`<div class="io-sec-body">${bodyHTML}</div>`:""}
        </div>`;

      const chk = (field,label) => `
        <label class="io-chk" data-chk="${field}">
          <span class="io-chk-box${st[field]?" on":""}">${st[field]?"\u2713":""}</span>${label}
        </label>`;

      const num = (field,label,step,min,max,tip) => `
        <div${tip?` title="${tip}"`:""}><span class="io-mini">${label}</span>
        <input class="io-input" type="number" data-f="${field}" value="${st[field]}" step="${step}" ${min!=null?`min="${min}"`:""} ${max!=null?`max="${max}"`:""}${tip?` title="${tip}"`:""}/></div>`;

      const modelSection = () => {
        const isCkpt = st.source_type==="checkpoint";
        // For checkpoints, CLIP/VAE may be baked in (auto-detected). The
        // selectors disable and show "Baked in" — no manual tick boxes.
        const clipBaked = isCkpt && st.clip_bundled;
        const vaeBaked = isCkpt && st.vae_bundled;
        return sec("model","Model", `
          <div class="io-row">
            <span class="io-label">Arch</span>
            <select class="io-select" data-f="architecture" title="Model family / architecture. Determines which sampler defaults and shift values are appropriate, which CLIP types are valid, and how the prompt is encoded. Set this to match your base model — wrong arch will produce broken outputs or silent fallbacks.">${ARCHS.map(a=>`<option value="${a}"${a===st.architecture?" selected":""}>${ARCH_LABELS[a]}</option>`).join("")}</select>
          </div>
          <div class="io-row">
            <span class="io-label">Source</span>
            <div class="io-toggle-grp">${SOURCES.map(s=>`<button class="io-tog${st.source_type===s?" active":""}" data-src="${s}">${SOURCE_LABELS[s]}</button>`).join("")}</div>
          </div>
          <div class="io-row">
            <span class="io-label">Model</span>
            <select class="io-select" data-f="model_file">${optBlank(modelListFor(st.source_type),st.model_file,"\u2014 select model \u2014")}</select>
          </div>
          ${!isCkpt?`<div class="io-row"><span class="io-label">Weight</span><select class="io-select" data-f="weight_dtype">${WEIGHT_DTYPES.map(d=>`<option value="${d}"${d===st.weight_dtype?" selected":""}>${d}</option>`).join("")}</select></div>`:""}
          <div class="io-row">
            <span class="io-label${clipBaked?" dim":""}">CLIP${clipBaked?`<span class="io-badge">BAKED</span>`:""}</span>
            <select class="io-select" data-f="clip_file" ${clipBaked?"disabled":""}>${optBlank(clipList(),st.clip_file,clipBaked?"\u2014 baked in \u2014":"\u2014 select CLIP \u2014")}</select>
          </div>
          ${!clipBaked?`<div class="io-row">
            <span class="io-label">CLIP Type</span>
            <select class="io-select" data-f="clip_type">${CLIP_TYPES.map(t=>`<option value="${t}"${t===st.clip_type?" selected":""}>${t||"(arch default)"}</option>`).join("")}</select>
          </div>`:""}
          <div class="io-row">
            <span class="io-label${vaeBaked?" dim":""}">VAE${vaeBaked?`<span class="io-badge">BAKED</span>`:""}</span>
            <select class="io-select" data-f="vae_file" ${vaeBaked?"disabled":""}>${optBlank(allModels.vaes,st.vae_file,vaeBaked?"\u2014 baked in \u2014":"\u2014 select VAE \u2014")}</select>
          </div>
        `);
      };

      const loraSection = () => {
        const list = st.loras||[];
        const rows = list.map((l,i)=>{
          const on = l.enabled!==false;
          // Drag handle is the ONLY drag initiator. The row carries
          // data-lora-row-idx so the dragover/drop handlers know what target
          // they're operating on (the source index travels through dataTransfer).
          const grip = `<div class="io-lora-drag" draggable="true" data-lora-drag="${i}" title="Drag to reorder">${'<div class="io-lora-drag-dot"></div>'.repeat(9)}</div>`;
          return `
          <div class="io-lora-row${on?"":" off"}" data-lora-row-idx="${i}">
            ${grip}
            <button class="io-lora-en${on?" on":""}" data-lora-en="${i}" title="${on?"Enabled \u2014 click to disable":"Disabled \u2014 click to enable"}">${on?"\u25cf":"\u25cb"}</button>
            <select class="io-select" data-lora-name="${i}">${optBlank(allModels.loras||[], l.name||"", "\u2014 select LoRA \u2014")}</select>
            <input class="io-input io-lora-str" type="number" data-lora-sm="${i}" value="${l.strength_model}" step="0.05" title="LoRA strength. Modern arches (Flux, Qwen, Z-Image, SD3) only adapt the transformer; CLIP/TE strength is mirrored from this value behind the scenes for the rare LoRA that ships text-encoder weights."/>
            <button class="io-ref-clear" data-lora-del="${i}" title="Remove" style="flex:0 0 18px;padding:0;text-align:center">\u2715</button>
          </div>`;
        }).join("");
        // Header: spacer aligns with grip+toggle (14+5+20 = 39px), then LoRA
        // label spans dropdown, then Model column header above the weight input.
        const head = list.length
          ? `<div class="io-lora-row"><span style="width:39px;flex:0 0 39px"></span><span class="io-mini" style="flex:1">LoRA</span><span class="io-mini io-lora-str">Model</span><span style="flex:0 0 18px"></span></div>`
          : "";
        return sec("loras","LoRAs", `
          ${head}
          ${rows||`<div class="io-mini" style="opacity:.6">No LoRAs. Stacked top-to-bottom; drag the grip to reorder.</div>`}
          <button class="io-btn" data-lora-add style="margin-top:4px">+ Add LoRA</button>`);
      };

      const refsSection = () => {
        const slot = (n) => {
          const fn = st["ref_image"+n];
          const thumb = fn
            ? `<img class="io-ref-thumb" src="${imgURL({filename:fn,subfolder:"",type:"input"})}"/>`
            : `<div class="io-ref-thumb-empty">${n}</div>`;
          return `<div class="io-refslot" data-ref-slot="${n}">
            ${thumb}
            <button class="io-ref-btn" data-ref-upload="${n}">${fn||"Upload reference "+n+"\u2026"}</button>
            ${fn?`<button class="io-ref-clear" data-ref-clear="${n}">\u2715</button>`:""}
          </div>`;
        };
        return sec("refs","Reference Images", `${slot(1)}${slot(2)}${slot(3)}
          <div class="io-mini" style="opacity:.7">Used by image-edit architectures (e.g. Qwen-Image-Edit). Drag an image in to set.</div>
        `);
      };

      const SEED_CONTROLS = ["fixed","increment","decrement","randomize"];
      const selCol = (field,label,list) => `
        <div><span class="io-mini">${label}</span>
        <select class="io-select" data-f="${field}">${opt(list,st[field])}</select></div>`;
      const taBlock = (field,ph) => `
        <div class="io-ta-wrap">
          <textarea class="io-ta" data-f="${field}" placeholder="${ph}" style="height:${taHeights[field]||72}px">${st[field]}</textarea>
          <div class="io-ta-handle" data-ta-handle="${field}"></div>
        </div>`;
      // Magic-wand row: model picker + NL/Tags toggle + enhance/revert buttons.
      // Out-of-band: calls /image_oasis/enhance directly; not part of the graph.
      const wandRow = () => {
        const hasModels = llmModels.length > 0;
        const modelOpts = hasModels
          ? optBlank(llmModels, llmModel, "\u2014 enhancer model \u2014")
          : `<option value="">\u2014 no models in models/LLM \u2014</option>`;
        const styleTog = ["natural","tags"].map(s=>
          `<button class="io-tog${llmStyle===s?" active":""}" data-llm-style="${s}">${s==="natural"?"Natural<br/>Language":"Tags"}</button>`).join("");
        const enhanceLabel = wandBusy ? "\u2026" : "\u2728 Enhance";
        // No-think toggle: for hybrid reasoning models (Qwen3/3.5/3.6). When active, the
        // backend passes enable_thinking:false through chat_template_kwargs AND prefixes
        // /no_think to the user message — belt and suspenders, because the kwarg alone
        // has known reliability issues on some recent Qwen3.5/3.6 GGUFs.
        const thinkLabel = llmThinkOff ? "\u26a1 No-think" : "\u{1f4ad} Think";
        const thinkTitle = llmThinkOff
          ? "Thinking disabled \u2014 fast, lower quality on reasoning tasks. Click to re-enable."
          : "Thinking enabled. Click to skip the think step on Qwen3-family models for much faster enhancement.";
        const revertBtn = (prewandPrompt!==null)
          ? `<button class="io-icon-btn" data-wand-revert title="Revert to your original prompt">\u21b6</button>` : "";
        return `
          <div class="io-row">
            <span class="io-label" style="width:auto">Model</span>
            <button class="io-think-tog${llmThinkOff?" active":""}" data-llm-thinkoff title="${thinkTitle}">${thinkLabel}</button>
            <select class="io-select" data-llm-model ${hasModels?"":"disabled"}>${modelOpts}</select>
          </div>
          <div class="io-mini" style="opacity:.7;margin:-2px 0 2px 0">Tip: instruct models work best. For thinking models, click \u26a1 to skip reasoning.</div>
          <div class="io-row" style="align-items:stretch">
            <div class="io-toggle-grp" style="flex:0 0 130px">${styleTog}</div>
            <button class="io-btn" data-wand-go style="margin-top:0;flex:1" ${wandBusy?"disabled":""}>${enhanceLabel}</button>
            ${revertBtn}
          </div>`;
      };
      const promptSection = () => {
        // Mirror the backend predicate in nodes.py: the negative is only ever
        // consumed by a pass with CFG > 1. If neither pass uses one, the
        // negative is inert — we dim the textarea and show a note so the user
        // knows. The textarea stays editable so they can stage a prompt for
        // later; the backend substitutes "" when neg_used is false, so edits
        // here don't bust the conditioning cache.
        const negUsed = (st.cfg !== 1) || (st.enable_refiner && st.refiner_cfg !== 1);
        return sec("prompt","Prompt", `
        ${taBlock("positive","Positive prompt")}
        ${wandRow()}
        <div class="io-ta-wrap">
          <textarea class="io-ta${negUsed?"":" io-ta-ignored"}" data-f="negative" placeholder="Negative prompt" style="height:${taHeights.negative||72}px" title="${negUsed?"":"Ignored — no pass uses CFG > 1. Increase CFG (or enable a refiner with CFG > 1) to use the negative prompt."}">${st.negative}</textarea>
          <div class="io-ta-handle" data-ta-handle="negative"></div>
        </div>
        <div class="io-neg-ignored-note" data-neg-note style="display:${negUsed?"none":"block"}">Ignored \u2014 no pass uses CFG &gt; 1.</div>
      `);
      };
      const samplingSection = () => sec("sampling","Generation", `
        <div class="io-half">${num("width","Width",8,64,8192)}${num("height","Height",8,64,8192)}</div>
        <div class="io-row">
          <span class="io-label">Seed</span>
          <input class="io-input" type="number" data-f="seed" value="${st.seed}" step="1" min="0"/>
          <button class="io-icon-btn io-go io-sm" data-seed-keep title="Generate (keep seed)">\u25b6</button>
          <button class="io-icon-btn io-dice io-sm" data-seed-rand title="Randomize &amp; Generate">\u{1f3b2}</button>
        </div>
        <div class="io-row">
          <span class="io-label">After gen</span>
          <select class="io-select" data-f="seed_control">${SEED_CONTROLS.map(c=>`<option value="${c}"${c===st.seed_control?" selected":""}>${c}</option>`).join("")}</select>
        </div>
        <div class="io-half">${num("steps","Steps",1,1,1000)}${num("cfg","CFG",0.1,0,100)}${num("batch_size","Batch",1,1,64)}</div>
        <div class="io-half">${selCol("sampler_name","Sampler",samplers)}${selCol("scheduler","Scheduler",schedulers)}</div>
        <div class="io-half">${num("denoise","Denoise",0.01,0,1)}${num("shift","Shift (0=auto)",0.01,0,100,"Sigma shift for flow-matching schedulers. The right value depends on the model architecture — Flux typically uses ~1.0–3.5, SD3/3.5 uses ~3.0, AuraFlow uses ~1.73. 0 = use the architecture's default (recommended unless you know what you're doing). Higher values shift sampling toward later (more refined) noise levels.")}</div>
      `);

      const refinerSection = () => sec("refiner","Refiner Pass", `
        <div class="io-row">${chk("enable_refiner","Enable refiner")}</div>
        ${st.enable_refiner?`
        <div class="io-half">${num("refiner_steps","Steps",1,1,1000)}${num("refiner_cfg","CFG",0.1,0,100)}</div>
        <div class="io-half">${num("refiner_denoise","Denoise",0.01,0,1)}<div></div></div>
        <div class="io-mini" style="opacity:.7">Second pass over the base image at the set denoise strength. Lower denoise = subtler cleanup.</div>`:""}
      `);

      const upscaleSection = () => sec("upscale","Upscale", `
        <div class="io-row">${chk("enable_upscale","Enable upscale")}</div>
        ${st.enable_upscale?`
        <div class="io-row"><span class="io-label">Mode</span><div class="io-toggle-grp">${UPSCALE_MODES.map(mo=>`<button class="io-tog${st.upscale_mode===mo?" active":""}" data-umode="${mo}">${mo[0].toUpperCase()+mo.slice(1)}</button>`).join("")}</div></div>
        <div class="io-row"><span class="io-label">Method</span><select class="io-select" data-f="upscale_method">${opt(UPSCALE_METHODS,st.upscale_method)}</select></div>
        <div class="io-half">${num("upscale_multiplier","\u00d7Multiplier",0.1,1,8)}<div></div></div>
        ${st.upscale_mode==="model"?`<div class="io-row"><span class="io-label">Up Model</span><select class="io-select" data-f="upscale_model_file">${optBlank(allModels.upscale_models,st.upscale_model_file,"\u2014 select \u2014")}</select></div>`:""}`:""}
      `);

      // Theme editor: one row per editable CSS variable — a native color picker,
      // a hex text field (type or pick), wired to the GLOBAL theme. Editing any
      // row re-themes every open node live (see saveTheme / IO_THEME_LISTENERS).
      const themeRow = (v) => {
        const val = IO_THEME[v.k] || IO_THEME_DEFAULTS[v.k];
        return `<div class="io-row">
          <span class="io-label">${v.label}</span>
          <input class="io-swatch" type="color" data-theme-pick="${v.k}" value="${val}"/>
          <input class="io-input io-hex" data-theme-hex="${v.k}" value="${val}" maxlength="7" spellcheck="false"/>
        </div>`;
      };
      // Determine whether the CURRENT in-memory IO_THEME matches a named theme
      // (every key equal). Used to highlight that row in the library list.
      const activeNamedThemeId = () => {
        for(const t of IO_NAMED_THEMES){
          const cs = t.colors||{};
          let match = true;
          for(const {k} of IO_THEME_VARS){
            const a = IO_THEME[k] || IO_THEME_DEFAULTS[k];
            const b = cs[k] || IO_THEME_DEFAULTS[k];
            if(a !== b){ match = false; break; }
          }
          if(match) return t.id;
        }
        return null;
      };

      const namedThemesList = () => {
        if(!IO_NAMED_THEMES.length){
          return `<div class="io-mini" style="opacity:.6;padding:4px 2px">No saved themes yet. Tweak the colors above, type a name, and click Save Theme.</div>`;
        }
        const activeId = activeNamedThemeId();
        return IO_NAMED_THEMES.map(t=>{
          const cs = t.colors||{};
          const chips = IO_THEME_VARS.map(v=>{
            const c = cs[v.k] || IO_THEME_DEFAULTS[v.k];
            return `<span class="io-theme-chip" style="background:${c}" title="${v.label}: ${c}"></span>`;
          }).join("");
          const isActive = t.id===activeId;
          return `<div class="io-theme-row${isActive?" active":""}" data-theme-load="${t.id}" title="Click to apply">
            <span class="io-theme-chips">${chips}</span>
            <span class="io-theme-nm">${t.name}</span>
            ${isActive?`<span class="io-theme-meta">active</span>`:""}
            <button class="io-preset-del" data-theme-named-del="${t.id}" title="Delete theme">\u2715</button>
          </div>`;
        }).join("");
      };

      const themeSection = () => sec("theme","Theme", `
        ${IO_THEME_VARS.map(themeRow).join("")}
        <div class="io-row">
          <input class="io-input" data-theme-name placeholder="Save current as\u2026" maxlength="60" value="${themeName}"/>
          <button class="io-btn" data-theme-save style="margin-top:0">Save Theme</button>
        </div>
        ${namedThemesList()}
        <div class="io-row">
          <button class="io-btn" data-theme-reset style="margin-top:0;flex:1">Reset to default</button>
        </div>
        <div class="io-mini" style="opacity:.7">Edits preview live across every Image Oasis node. Save Theme stores the current palette as a named entry; click any saved row to switch.</div>
      `);

      const fmtStamp = ts => { try{ return new Date(ts).toLocaleString(); }catch{ return ""; } };
      const shortName = f => (f||"").split(/[/\\]/).pop().replace(/\.(safetensors|ckpt|pt|gguf)$/i,"") || "\u2014";
      const kv = (k,v) => `<div class="io-kv"><span class="io-kv-k">${k}</span><span class="io-kv-v">${v}</span></div>`;

      const presetsSection = () => {
        const cards = !presets.length
          ? `<div class="io-empty">No saved presets yet.<br/>Configure the node and save one.</div>`
          : presets.map(p=>{
              const exp = expandedPresets.has(p.id), c = p.config || {};
              return `<div class="io-preset-card">
                <div class="io-preset-head" data-preset-toggle="${p.id}">
                  <span class="io-preset-nm">${p.name}</span>
                  <span class="io-preset-meta">${fmtStamp(p.timestamp)}</span>
                  <span class="io-chevron${exp?" open":""}">\u203a</span>
                  <button class="io-preset-del" data-preset-del="${p.id}">\u2715</button>
                </div>
                ${exp?`<div class="io-preset-detail">
                  ${kv("Arch", c.architecture||"\u2014")}
                  ${kv("Source", c.source_type||"\u2014")}
                  ${kv("Model", `<span title="${c.model_file||""}">${shortName(c.model_file)}</span>`)}
                  ${kv("Steps/CFG", `${c.steps??"?"} / ${c.cfg??"?"}`)}
                  ${kv("Sampler", `${c.sampler_name||"?"} / ${c.scheduler||"?"}`)}
                  ${(c.loras && c.loras.length)?kv("LoRAs", (()=>{
                    const total = c.loras.length;
                    const active = c.loras.filter(l=>l.enabled!==false).length;
                    const names = c.loras.map(l=>shortName(l.name)).filter(Boolean).join(", ") || "(none)";
                    const summary = active===total ? `${active}` : `${active} of ${total}`;
                    const full = c.loras.map(l=>(l.enabled===false?"(off) ":"")+(l.name||"(empty)")+`  [m:${l.strength_model} c:${l.strength_clip}]`).join("\n");
                    return `<span title="${full}">${summary} \u2014 ${names}</span>`;
                  })()):""}
                  ${c.enable_refiner?kv("Refiner","on"):""}
                  ${c.enable_upscale?kv("Upscale",`${c.upscale_mode} \u00d7${c.upscale_multiplier}`):""}
                  <button class="io-btn" data-preset-load="${p.id}">Load preset</button>
                </div>`:""}
              </div>`;
            }).join("");
        return sec("presets","Presets", `
          <div class="io-row">
            <input class="io-input" data-preset-name placeholder="Save current as\u2026" maxlength="60" value="${presetName}"/>
            <button class="io-btn" data-preset-save style="margin-top:0">Save</button>
          </div>
          ${cards}
        `);
      };

      const renderPreview = () => {
        const hasImgs = previewImages.length > 0;
        // onerror swaps a dead <img> (e.g. a persisted temp ref whose file was
        // cleared between sessions) for the empty-state text instead of a broken
        // image icon. data-prev-idx stays on the img for buildMeta's load hook.
        const imgs = hasImgs
          ? previewImages.map((u,i)=>`<img class="io-preview-img" src="${u}" data-prev-idx="${i}" onerror="this.outerHTML='<div class=&quot;io-preview-empty&quot;>Generated image<br/>appears here</div>'"/>`).join("")
          : `<div class="io-preview-empty">Generated image<br/>appears here</div>`;
        const saveBtn = hasImgs
          ? `<button class="io-icon-btn" data-save-out title="Save to output folder">\u{1f4be} Save</button>`
          : "";
        // Randomize-seed + queue lives on the header so it's reachable without
        // keeping the Generation group open. Always present (incl. empty state)
        // so it can kick off the first generation. The play button beside it
        // queues with the CURRENT seed (no randomize) — for re-running after a
        // refiner/upscale toggle without changing the image's base.
        const goBtn = `<button class="io-icon-btn io-go io-hdr" data-seed-keep title="Generate (keep seed)">\u25b6</button>`;
        const diceBtn = `<button class="io-icon-btn io-dice io-hdr" data-seed-rand title="Randomize &amp; Generate">\u{1f3b2}</button>`;
        const info = hasImgs
          ? `<div class="io-info-bar" data-info-bar>${previewMeta || "loading\u2026"}</div>`
          : "";
        // Layout: [go][dice] | spacer | timer (absolute-centered) | [save].
        // Show the frozen last value (or zero) between runs; startTimer repaints.
        const timer = `<span class="io-timer${timerRunning?" running":""}" data-timer>${fmtTimer(timerElapsedMs)}</span>`;
        return `<div class="io-col-right">
          <div class="io-preview-head">${goBtn}${diceBtn}<div style="flex:1"></div>${timer}${saveBtn}</div>
          <div class="io-preview-scroll">${imgs}</div>
          ${info}
        </div>`;
      };

      // Compose the info string from the loaded image + known metadata.
      const buildMeta = (imgEl) => {
        const info = previewInfo[0] || {};
        const fn = (info.filename||"").split(/[/\\]/).pop();
        const dims = imgEl && imgEl.naturalWidth ? `${imgEl.naturalWidth}\u00d7${imgEl.naturalHeight}` : "";
        const count = previewImages.length>1 ? `${previewImages.length} imgs` : "";
        const size = previewSizeKB ? `${previewSizeKB} KB` : "";
        const parts = [dims, count, fn, size].filter(Boolean);
        previewMeta = parts.map((p,i)=> i===0 ? `<span class="io-info-label">${p}</span>` : p).join("  \u00b7  ");
        const bar = container.querySelector("[data-info-bar]");
        if(bar) bar.innerHTML = previewMeta;
      };

      // ── Execution timer ──
      // MM:SS:mmm. paintTimer() re-queries the element every call so it works
      // across render() rebuilds (the element it wrote to last tick may be gone).
      const fmtTimer = (ms) => {
        if(ms<0) ms=0;
        const m  = String(Math.floor(ms/60000)).padStart(2,"0");
        const s  = String(Math.floor((ms%60000)/1000)).padStart(2,"0");
        const mn = String(Math.floor(ms%1000)).padStart(3,"0");
        return `${m}:${s}:${mn}`;
      };
      const paintTimer = (ms,running) => {
        const el = container.querySelector("[data-timer]");
        if(!el) return;
        el.textContent = fmtTimer(ms);
        el.classList.toggle("running", !!running);
      };
      const startTimer = () => {
        if(timerRunning) return;
        timerRunning = true;
        timerStart = Date.now();
        paintTimer(0,true);
        timerInterval = setInterval(()=>{
          timerElapsedMs = Date.now()-timerStart;
          paintTimer(timerElapsedMs,true);
        },33);
      };
      const stopTimer = () => {
        if(!timerRunning) return;
        timerRunning = false;
        clearInterval(timerInterval); timerInterval=null;
        timerElapsedMs = Date.now()-timerStart;
        paintTimer(timerElapsedMs,false);  // freeze final value, drop the running glow
      };

      const render = () => {
        const scEl = container.querySelector(".io-col-left");
        const scTop = scEl ? scEl.scrollTop : 0;
        container.innerHTML = `
          <div class="io-inner">
            <div class="io-body">
              <div class="io-col-left">
                ${presetsSection()}${modelSection()}${loraSection()}${refsSection()}${promptSection()}${samplingSection()}${refinerSection()}${upscaleSection()}${themeSection()}
              </div>
              ${renderPreview()}
            </div>
          </div>`;
        bind();
        const sc2 = container.querySelector(".io-col-left");
        if (sc2) sc2.scrollTop = scTop;
        // NOTE: render() must NOT call save(). Coupling draw to persist creates a
        // re-render loop (save -> widget value change -> redraw -> render -> save).
        // save() is called only by actual user edits below.
      };

      // Attach canvas event-stoppers ONCE (not per-render, or they stack).
      container.addEventListener("mousedown",e=>e.stopPropagation());
      container.addEventListener("pointerdown",e=>e.stopPropagation());
      container.addEventListener("wheel",e=>e.stopPropagation());

      const bind = () => {
        container.querySelectorAll("[data-sec]").forEach(el=>el.onclick=(e)=>{e.stopPropagation();open[el.dataset.sec]=!open[el.dataset.sec];save();render();});
        container.querySelectorAll("[data-src]").forEach(el=>el.onclick=(e)=>{e.stopPropagation();st.source_type=el.dataset.src;st.model_file="";st.clip_bundled=false;st.vae_bundled=false;save();render();});
        container.querySelectorAll("[data-umode]").forEach(el=>el.onclick=(e)=>{e.stopPropagation();st.upscale_mode=el.dataset.umode;save();render();});
        container.querySelectorAll("[data-chk]").forEach(el=>el.onclick=(e)=>{e.stopPropagation();const f=el.dataset.chk;st[f]=!st[f];save();render();});
        // Targeted (non-render) UI sync for the negative-prompt dimmed state.
        // Must NOT call render() — cfg/refiner_cfg fire oninput on every
        // keystroke, and render() would replace the number input the user is
        // typing into. Toggling the class + note display is enough.
        const updateNegativeUi = () => {
          const negUsed = (st.cfg !== 1) || (st.enable_refiner && st.refiner_cfg !== 1);
          const ta = container.querySelector('[data-f="negative"]');
          if(ta){
            ta.classList.toggle("io-ta-ignored", !negUsed);
            ta.title = negUsed ? "" : "Ignored — no pass uses CFG > 1. Increase CFG (or enable a refiner with CFG > 1) to use the negative prompt.";
          }
          const note = container.querySelector("[data-neg-note]");
          if(note) note.style.display = negUsed ? "none" : "block";
        };
        container.querySelectorAll("[data-f]").forEach(el=>{
          const f=el.dataset.f;
          const handler=()=>{
            let v=el.value;
            if(el.type==="number"){v=parseFloat(v); if(isNaN(v))v=0;}
            st[f]=v;
            save();                       // persist WITHOUT re-rendering (no innerHTML wipe)
            // A manual edit to the positive prompt becomes the new revert
            // baseline: drop the stash so the next enhance re-captures this text.
            if(f==="positive"){ prewandPrompt=null; }
            if(f==="architecture"){render();}        // arch changes which fields show
            if(f==="model_file"){checkBundle();}     // detect baked CLIP/VAE for checkpoints
            // cfg / refiner_cfg gate the negative-textarea dim state. Targeted
            // DOM update (no full render) so number entry doesn't get clobbered.
            if(f==="cfg" || f==="refiner_cfg"){ updateNegativeUi(); }
          };
          el.onchange=handler;
          el.addEventListener("click",e=>e.stopPropagation());
          if(el.tagName==="TEXTAREA"||el.type==="number")el.oninput=handler;
        });

        // ── Magic-wand bindings ──
        container.querySelector("[data-llm-model]")?.addEventListener("change",e=>{e.stopPropagation();llmModel=e.target.value;});
        container.querySelector("[data-llm-model]")?.addEventListener("click",e=>e.stopPropagation());
        container.querySelectorAll("[data-llm-style]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();llmStyle=b.dataset.llmStyle;render();}));
        container.querySelector("[data-llm-thinkoff]")?.addEventListener("click",e=>{e.stopPropagation();llmThinkOff=!llmThinkOff;render();});
        container.querySelector("[data-wand-go]")?.addEventListener("click",e=>{e.stopPropagation();runEnhance();});
        container.querySelector("[data-wand-revert]")?.addEventListener("click",e=>{e.stopPropagation();revertWand();});

        // Reference image upload / clear
        container.querySelectorAll("[data-ref-upload]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();uploadRef(b.dataset.refUpload);}));
        container.querySelectorAll("[data-ref-clear]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();st["ref_image"+b.dataset.refClear]="";render();}));

        // Reference slots are drop targets. preventDefault on dragover is what
        // lets `drop` fire at all; stopPropagation keeps ComfyUI's canvas-level
        // drop (loading a workflow from a dropped PNG) from hijacking it. The
        // highlight is re-added on dragover so crossing child elements (which
        // fire dragleave) doesn't make it flicker off.
        container.querySelectorAll("[data-ref-slot]").forEach(slot=>{
          const n = slot.dataset.refSlot;
          slot.addEventListener("dragenter",e=>{e.preventDefault();e.stopPropagation();slot.classList.add("io-drop");});
          slot.addEventListener("dragover", e=>{e.preventDefault();e.stopPropagation();if(e.dataTransfer)e.dataTransfer.dropEffect="copy";slot.classList.add("io-drop");});
          slot.addEventListener("dragleave",e=>{e.stopPropagation();slot.classList.remove("io-drop");});
          slot.addEventListener("drop",     e=>{e.preventDefault();e.stopPropagation();slot.classList.remove("io-drop");acceptDrop(n, e.dataTransfer);});
        });

        // LoRA stack — add/remove re-render; field edits mutate st in place
        // (persistence is via getValue reading st live, like the [data-f] rows).
        container.querySelector("[data-lora-add]")?.addEventListener("click",e=>{
          e.stopPropagation();
          // New LoRAs default clip := model. Most modern LoRAs (Flux/Qwen/Z-Image
          // /SD3) have no text-encoder weights, so the clip strength is a silent
          // no-op there. For the rare SDXL LoRA with TE weights, mirroring gives
          // sensible "balanced" default behavior. The UI doesn't expose clip
          // separately; backend still reads it from the dict.
          st.loras=[...(st.loras||[]),{name:"",strength_model:1.0,strength_clip:1.0,enabled:true}];
          render();
        });
        container.querySelectorAll("[data-lora-del]").forEach(b=>b.addEventListener("click",e=>{
          e.stopPropagation();
          st.loras=(st.loras||[]).filter((_,idx)=>idx!==+b.dataset.loraDel);
          render();
        }));
        // Enable/disable: keeps the row in the list (and in presets) but excludes
        // it from the active stack. Backend skips entries with enabled===false.
        container.querySelectorAll("[data-lora-en]").forEach(b=>b.addEventListener("click",e=>{
          e.stopPropagation();
          const l=st.loras[+b.dataset.loraEn];
          l.enabled = (l.enabled===false);   // false -> true; true/undefined -> false
          render();
        }));
        // Drag-to-reorder. The grip is the only draggable element; the row
        // serves as the drop target (data-lora-row-idx). dataTransfer carries
        // the source index as text. Cursor half determines drop-above vs
        // drop-below, then we adjust for the splice shift when from < insertAt.
        container.querySelectorAll("[data-lora-drag]").forEach(grip=>{
          const row = grip.closest(".io-lora-row");
          grip.addEventListener("dragstart",e=>{
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(grip.dataset.loraDrag));
            // Use the whole row as the drag image so the ghost looks like the
            // row being moved, not just a tiny grip. setDragImage requires the
            // element to be in the DOM at the time of the call (it is).
            if(e.dataTransfer.setDragImage){
              const r = row.getBoundingClientRect();
              e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top);
            }
            // Defer the opacity flip so it lands AFTER the drag image snapshot.
            setTimeout(()=>row.classList.add("io-lora-dragging"), 0);
          });
          grip.addEventListener("dragend",e=>{
            row.classList.remove("io-lora-dragging");
            // Clean up any stale drop indicators on siblings.
            container.querySelectorAll(".io-lora-drop-above,.io-lora-drop-below")
              .forEach(el=>el.classList.remove("io-lora-drop-above","io-lora-drop-below"));
          });
        });
        container.querySelectorAll("[data-lora-row-idx]").forEach(row=>{
          row.addEventListener("dragover",e=>{
            e.preventDefault(); e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            const r = row.getBoundingClientRect();
            const above = (e.clientY - r.top) < r.height/2;
            row.classList.toggle("io-lora-drop-above", above);
            row.classList.toggle("io-lora-drop-below", !above);
          });
          row.addEventListener("dragleave",e=>{
            // Only clear when leaving the row, not when entering a child.
            if(e.relatedTarget && row.contains(e.relatedTarget)) return;
            row.classList.remove("io-lora-drop-above","io-lora-drop-below");
          });
          row.addEventListener("drop",e=>{
            e.preventDefault(); e.stopPropagation();
            const r = row.getBoundingClientRect();
            const above = (e.clientY - r.top) < r.height/2;
            row.classList.remove("io-lora-drop-above","io-lora-drop-below");
            const from = parseInt(e.dataTransfer.getData("text/plain"));
            const targetIdx = +row.dataset.loraRowIdx;
            if(isNaN(from) || from === targetIdx) return;
            let insertAt = above ? targetIdx : targetIdx + 1;
            // After splice(from,1), every index > from shifts down by 1.
            // Compensate so the visual drop position is honored.
            if(from < insertAt) insertAt -= 1;
            const arr = st.loras.slice();
            const [moved] = arr.splice(from, 1);
            arr.splice(insertAt, 0, moved);
            st.loras = arr;
            render();
          });
        });
        container.querySelectorAll("[data-lora-name]").forEach(el=>{
          el.addEventListener("click",e=>e.stopPropagation());
          el.addEventListener("change",e=>{e.stopPropagation();st.loras[+el.dataset.loraName].name=el.value;});
        });
        // Model-strength edit: mirror to strength_clip in state. Field is no
        // longer surfaced in the UI; the JS keeps clip == model so loading
        // behavior is predictable for the rare LoRA that uses CLIP weights.
        container.querySelectorAll("[data-lora-sm]").forEach(el=>{
          el.addEventListener("click",e=>e.stopPropagation());
          const h=()=>{
            let v=parseFloat(el.value); if(isNaN(v))v=0;
            const lora = st.loras[+el.dataset.loraSm];
            lora.strength_model = v;
            lora.strength_clip  = v;
          };
          el.onchange=h; el.oninput=h;
        });

        // Seed dice + save output
        // Seed dice = Random + Queue: set new seed, then queue.
        // Two instances now: one by the seed field, one on the output header.
        container.querySelectorAll("[data-seed-rand]").forEach(btn=>btn.addEventListener("click",async e=>{
          e.stopPropagation();
          st.seed=Math.floor(Math.random()*MAX_SEED);
          render();
          await app.queuePrompt(0,1);
        }));
        // Generate-only: queue with the current seed, no randomize. No render
        // either — nothing in `st` changed, so the DOM is already current.
        container.querySelectorAll("[data-seed-keep]").forEach(btn=>btn.addEventListener("click",async e=>{
          e.stopPropagation();
          await app.queuePrompt(0,1);
        }));
        container.querySelector("[data-save-out]")?.addEventListener("click",e=>{e.stopPropagation();saveOutput();});

        // Build the info bar once the primary preview image has loaded.
        const primaryImg = container.querySelector('[data-prev-idx="0"]');
        if(primaryImg){
          if(primaryImg.complete && primaryImg.naturalWidth) buildMeta(primaryImg);
          else primaryImg.addEventListener("load",()=>buildMeta(primaryImg));
        }

        // Prompt textarea drag-handles (custom resize — no native grip / scrollbar collision)
        container.querySelectorAll("[data-ta-handle]").forEach(h=>{
          h.addEventListener("pointerdown",e=>{
            e.preventDefault(); e.stopPropagation();
            const field=h.dataset.taHandle;
            const ta=h.parentElement.querySelector("textarea");
            const startY=e.clientY, startH=ta.offsetHeight;
            h.setPointerCapture(e.pointerId);
            const move=ev=>{ const nh=Math.max(40,startH+(ev.clientY-startY)); ta.style.height=nh+"px"; taHeights[field]=nh; };
            const up=ev=>{ h.releasePointerCapture(e.pointerId); h.removeEventListener("pointermove",move); h.removeEventListener("pointerup",up); };
            h.addEventListener("pointermove",move);
            h.addEventListener("pointerup",up);
          });
        });

        // Presets
        const nameInp = container.querySelector("[data-preset-name]");
        if(nameInp){ nameInp.addEventListener("input",()=>{presetName=nameInp.value;}); nameInp.addEventListener("click",e=>e.stopPropagation()); }
        container.querySelector("[data-preset-save]")?.addEventListener("click",e=>{e.stopPropagation();savePreset();});
        container.querySelectorAll("[data-preset-toggle]").forEach(h=>h.addEventListener("click",e=>{
          if(e.target.closest("[data-preset-del]"))return;
          e.stopPropagation();const id=h.dataset.presetToggle;
          expandedPresets.has(id)?expandedPresets.delete(id):expandedPresets.add(id);
          // Populate the name field so a subsequent Save overwrites this preset.
          // Unlike Load Preset, this does NOT touch st — the user keeps their
          // in-progress edits and can save them OVER an existing preset by
          // simply clicking the card and then Save.
          const p = presets.find(x=>x.id===id);
          if(p) presetName = p.name;
          render();
        }));
        container.querySelectorAll("[data-preset-load]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();loadPreset(b.dataset.presetLoad);}));
        container.querySelectorAll("[data-preset-del]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();deletePreset(b.dataset.presetDel);}));

        // ── Theme editor bindings ──
        // Edits apply LIVE (preview across every open node) but do not persist
        // until the user clicks Save Theme. Reset writes immediately because
        // "reset to defaults" is a discrete commit, not an experiment.
        const hexOk = s => /^#[0-9a-fA-F]{6}$/.test(s);
        container.querySelectorAll("[data-theme-pick]").forEach(el=>{
          el.addEventListener("click",e=>e.stopPropagation());
          el.addEventListener("input",e=>{ e.stopPropagation(); IO_THEME[el.dataset.themePick]=el.value; applyTheme(); });
          el.addEventListener("change",e=>{ e.stopPropagation(); IO_THEME[el.dataset.themePick]=el.value; refreshTheme(); });
        });
        container.querySelectorAll("[data-theme-hex]").forEach(el=>{
          el.addEventListener("click",e=>e.stopPropagation());
          el.addEventListener("change",e=>{
            e.stopPropagation();
            let v=el.value.trim(); if(v && v[0]!=="#") v="#"+v;
            if(hexOk(v)){ IO_THEME[el.dataset.themeHex]=v; refreshTheme(); }
            else { el.value = IO_THEME[el.dataset.themeHex]||IO_THEME_DEFAULTS[el.dataset.themeHex]; } // revert bad input
          });
        });
        // ── Named theme library bindings ──
        // Save Theme requires a name; on success the entry becomes active and
        // the library list refreshes (across all open nodes via the listener).
        const themeNameInp = container.querySelector("[data-theme-name]");
        if(themeNameInp){
          themeNameInp.addEventListener("input",()=>{ themeName=themeNameInp.value; });
          themeNameInp.addEventListener("click",e=>e.stopPropagation());
        }
        container.querySelector("[data-theme-save]")?.addEventListener("click",async e=>{
          e.stopPropagation();
          const nm = (themeName||"").trim();
          if(!nm){
            // Focus the input rather than silently no-op so the user sees why.
            themeNameInp?.focus();
            return;
          }
          const ok = await saveNamedTheme(nm);
          if(ok){ themeName=""; render(); }
        });
        // Click a saved theme row to load it. Suppressed when the click lands
        // on the delete X (delete handler runs instead, mirroring presets).
        container.querySelectorAll("[data-theme-load]").forEach(row=>row.addEventListener("click",async e=>{
          if(e.target.closest("[data-theme-named-del]")) return;
          e.stopPropagation();
          const id = row.dataset.themeLoad;
          // Populate the name field too (symmetric with preset card click): the
          // user can re-save edits to the SAME entry without retyping.
          const t = IO_NAMED_THEMES.find(x=>x.id===id);
          if(t) themeName = t.name;
          await applyNamedTheme(id);
          render();
        }));
        container.querySelectorAll("[data-theme-named-del]").forEach(b=>b.addEventListener("click",async e=>{
          e.stopPropagation();
          await deleteNamedTheme(b.dataset.themeNamedDel);
        }));
        container.querySelector("[data-theme-reset]")?.addEventListener("click",e=>{
          e.stopPropagation(); IO_THEME={...IO_THEME_DEFAULTS}; saveTheme();
        });
      };

      // Detect baked CLIP/VAE in a selected checkpoint (mirrors CA check_bundle).
      const checkBundle = async () => {
        if(st.source_type!=="checkpoint" || !st.model_file){ st.clip_bundled=false; st.vae_bundled=false; render(); return; }
        try{
          const r = await (await fetch("/image_oasis/check_bundle",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:st.model_file})})).json();
          st.clip_bundled=!!r.has_clip; st.vae_bundled=!!r.has_vae;
        }catch(e){ console.warn("[Image Oasis]",e); st.clip_bundled=false; st.vae_bundled=false; }
        render();
      };

      // Upload a File/Blob into ComfyUI's input folder; returns the stored name
      // (subfolder-qualified). Shared by the file picker AND drag-drop, so a
      // dropped image becomes a plain input-folder file exactly like a picked
      // one — same content-digest caching, same thumbnail path, no temp/output
      // annotation handling needed anywhere downstream.
      const uploadImageBlob = async (fileOrBlob, filename) => {
        const fname = filename || fileOrBlob.name || `dropped_${Date.now()}.png`;
        const body = new FormData();
        body.append("image", fileOrBlob, fname);   // a raw Blob has no name; supply one
        body.append("overwrite","true");
        const r = await (await fetch("/upload/image",{method:"POST",body})).json();
        if(!r || !r.name) throw new Error("upload returned no name");
        return r.subfolder ? `${r.subfolder}/${r.name}` : r.name;
      };

      const uploadRef = (n) => {
        const inp = document.createElement("input");
        inp.type="file"; inp.accept="image/*";
        inp.onchange = async () => {
          const file = inp.files?.[0]; if(!file) return;
          try{ st["ref_image"+n] = await uploadImageBlob(file, file.name); render(); }
          catch(e){ console.warn("[Image Oasis] upload failed",e); }
        };
        inp.click();
      };

      // Accept an image dropped onto reference slot `n`. Sources, in order:
      //   1) real File(s)            — OS drag, or a panel exposing files
      //   2) text/uri-list           — the well-formed URL drag (asset panel,<img>)
      //   3) text/plain              — fallback URL
      //   4) text/html src/href      — last-resort scrape from dropped markup
      // A URL is fetched to a blob and re-uploaded (see uploadImageBlob). Works
      // for ComfyUI's own /view URLs (input/temp/output) — including dragging
      // this node's own generated preview straight back into a ref slot.
      const acceptDrop = async (n, dt) => {
        if(!dt) return;
        try{
          const f = dt.files && dt.files[0];
          if(f && f.type.startsWith("image/")){
            st["ref_image"+n] = await uploadImageBlob(f, f.name);
            render(); return;
          }
          let url = (dt.getData("text/uri-list")||"").split(/\r?\n/).find(s=>s && !s.startsWith("#"));
          if(!url) url = (dt.getData("text/plain")||"").trim();
          if(!url){
            const html = dt.getData("text/html")||"";
            const m = html.match(/(?:src|href)\s*=\s*["']([^"']+)["']/i);
            if(m) url = m[1];
          }
          if(!url) return;
          const abs = new URL(url, window.location.href).href;   // resolve relative/protocol-relative
          const resp = await fetch(abs);
          if(!resp.ok) throw new Error("HTTP "+resp.status);
          const blob = await resp.blob();
          if(!blob.type.startsWith("image/")) throw new Error("not an image: "+blob.type);
          let nm = "";
          try{ nm = new URL(abs).searchParams.get("filename")||""; }catch{}
          if(!nm) nm = abs.split(/[?#]/)[0].split("/").pop()||"";
          st["ref_image"+n] = await uploadImageBlob(blob, nm || `dropped_${Date.now()}.png`);
          render();
        }catch(e){ console.warn("[Image Oasis] drop failed",e); }
      };

      // State lives in `st` / `open`. getValue() (on the DOM widget) reads them
      // live whenever ComfyUI serializes, so there is NO need to write the
      // widget value manually — doing so would call setValue and re-render
      // (the loop that froze the UI). save() is intentionally a no-op kept for
      // call-site clarity; persistence is automatic via getValue.
      const save = () => {};

      let _restoring = false;

      // Fields a preset must NOT carry: the working prompt, the seed value, and
      // the reference images. These are per-session work, not part of a reusable
      // "style/config" preset — loading a preset should never wipe the prompt you
      // are mid-edit on, reset your seed, or swap your reference images. Excluded
      // at BOTH save and load: save keeps stored presets clean; load protects the
      // current values (and shields against older presets that baked these in).
      const PRESET_EXCLUDE = ["positive", "negative", "seed",
                              "ref_image1", "ref_image2", "ref_image3"];

      const presetConfig = (state) => {
        const out = {...state};
        for (const k of PRESET_EXCLUDE) delete out[k];
        return out;
      };

      // ── Presets (load, save, delete) ──────────────────────────────────
      const loadPresets = async () => {
        try{ presets = await (await fetch("/image_oasis/presets")).json(); }catch(e){ console.warn("[Image Oasis]",e); presets=[]; }
      };
      const savePreset = async () => {
        const name = (presetName||"").trim();
        if(!name) return;
        try{
          const r = await (await fetch("/image_oasis/save_preset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name, config:presetConfig(st)})})).json();
          if(r.ok){ presetName=""; await loadPresets(); render(); }
        }catch(e){ console.warn("[Image Oasis]",e); }
      };
      const loadPreset = (id) => {
        const p = presets.find(x=>x.id===id);
        if(!p||!p.config) return;
        st = {...st, ...presetConfig(p.config)};
        presetName = p.name;          // pre-fill so a subsequent Save overwrites this preset
        render();
        if(st.source_type==="checkpoint" && st.model_file) checkBundle();
      };
      const deletePreset = async (id) => {
        try{ await fetch(`/image_oasis/presets/${id}`,{method:"DELETE"}); }catch(e){ console.warn("[Image Oasis]",e); }
        expandedPresets.delete(id); await loadPresets(); render();
      };

      // ── Output preview (render to the right pane, suppress native below-node) ──
      const imgURL = (info) => {
        const p = new URLSearchParams({filename:info.filename, subfolder:info.subfolder||"", type:info.type||"temp", t:Date.now()});
        return `${window.location.origin}/view?${p}`;
      };
      const _origExecuted = selfNode.onExecuted?.bind(selfNode);
      selfNode.onExecuted = function(data){
        _origExecuted?.(data);
        if(!data) return;
        const imgs = data.images;
        if(imgs){ delete data.images; }  // suppress ComfyUI's native below-node preview
        if(Array.isArray(imgs) && imgs.length){
          previewInfo = imgs;                 // keep raw {filename,subfolder,type} for save
          previewImages = imgs.map(imgURL);
          previewMeta = ""; previewSizeKB = 0; // recomputed on image load
          render();
        }
      };

      const saveOutput = async () => {
        if(!previewInfo.length) return;
        try{
          const r = await (await fetch("/image_oasis/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({images:previewInfo})})).json();
          if(r.saved?.length){
            previewSizeKB = r.saved.reduce((s,x)=>s+(x.size_kb||0),0);
            previewInfo = r.saved; previewImages = r.saved.map(imgURL); render();
          }
        }catch(e){ console.warn("[Image Oasis] save failed",e); }
      };

      // ── Prompt enhancer ("magic wand") ────────────────────────────────
      const loadLlmModels = async () => {
        try{
          const r = await (await fetch("/image_oasis/llm_models")).json();
          llmModels = Array.isArray(r.models) ? r.models : [];
          if(!llmModel && llmModels.length) llmModel = llmModels[0];
        }catch(e){ console.warn("[Image Oasis] llm models",e); llmModels=[]; }
      };

      const runEnhance = async () => {
        if(wandBusy) return;
        const cur = (st.positive||"").trim();
        if(!cur){ console.warn("[Image Oasis] nothing to enhance"); return; }
        if(!llmModel){ alert("Select an enhancer model (place .gguf files in models/LLM)."); return; }
        // Sticky stash: capture the ORIGINAL only if we don't already hold one,
        // so revert always returns to the first pre-enhance text.
        if(prewandPrompt===null) prewandPrompt = st.positive;
        wandBusy = true; render();
        try{
          const r = await fetch("/image_oasis/enhance",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({prompt:cur, style:llmStyle, model:llmModel, think_off:llmThinkOff, unload_after:true}),
          });
          const data = await r.json();
          if(!r.ok || data.error){
            // Surface the backend's clear message; leave the prompt untouched.
            alert("Enhance failed: " + (data.error || ("HTTP "+r.status)));
            prewandPrompt = (st.positive===prewandPrompt) ? null : prewandPrompt; // no change made
          } else if(data.enhanced){
            st.positive = data.enhanced;
          }
        }catch(e){
          alert("Enhance failed: " + e.message);
        }finally{
          wandBusy = false; render();
        }
      };

      const revertWand = () => {
        if(prewandPrompt===null) return;
        st.positive = prewandPrompt;
        prewandPrompt = null;   // next enhance re-captures the now-restored text
        render();
      };

      const loadModels = async () => {
        try{ allModels = await (await fetch("/image_oasis/models")).json(); }catch(e){ console.warn("[Image Oasis]",e); }
        try{
          const oi = await (await fetch("/object_info/KSampler")).json();
          const inp = oi?.KSampler?.input?.required;
          if(inp?.sampler_name?.[0]) samplers = inp.sampler_name[0];
          if(inp?.scheduler?.[0]) schedulers = inp.scheduler[0];
        }catch{}
        render();
      };

      this.addDOMWidget("image_oasis_ui","div",container,{
        getValue:()=>JSON.stringify({
          version:1,
          uiState:{open, taHeights},
          execState:st,
          // Persist the output preview so switching tabs (which rebuilds the
          // node closure) doesn't blank it. We store the raw {filename,
          // subfolder,type} refs + known metadata, not pixels; the <img> re-
          // resolves via /view. A temp file cleared mid-session may 404, which
          // simply shows the empty state — no worse than before.
          preview:{ info:previewInfo, sizeKB:previewSizeKB },
          // Enhancer picks (model + style) persist across tab switches; the
          // model list itself is re-fetched on add.
          wand:{ model:llmModel, style:llmStyle, prewand:prewandPrompt, think_off:llmThinkOff },
        }),
        setValue:v=>{ try{
          const o=JSON.parse(v); const ex=o.execState||o; const ui=o.uiState||{};
          if(ex&&typeof ex==="object") st={...st,...ex};
          if(ui.open) open={...open,...ui.open};
          if(ui.taHeights) taHeights={...taHeights,...ui.taHeights};
          if(o.preview && Array.isArray(o.preview.info) && o.preview.info.length){
            previewInfo = o.preview.info;
            previewImages = previewInfo.map(imgURL);
            previewSizeKB = o.preview.sizeKB || 0;
            previewMeta = "";   // recomputed on image load
          }
          if(o.wand){
            if(o.wand.model) llmModel=o.wand.model;
            if(o.wand.style) llmStyle=o.wand.style;
            if("think_off" in o.wand) llmThinkOff=!!o.wand.think_off;
            // Restore the revert stash. Use a presence check (not truthiness) so
            // an empty-string original is preserved; absent key -> nothing to revert.
            prewandPrompt = ("prewand" in o.wand) ? o.wand.prewand : prewandPrompt;
          }
          if(!_restoring){ _restoring=true; setTimeout(()=>{ _restoring=false; render(); },0); }
        }catch{} },
      });

      // Control-after-generate: apply the seed action after each queued prompt,
      // so the NEXT run uses the updated seed (ComfyUI's standard semantics).
      const _seedHook = () => {
        const a = st.seed_control;
        if(a==="fixed") return;
        let s = Number(st.seed)||0;
        if(a==="randomize") s = Math.floor(Math.random()*MAX_SEED);
        else if(a==="increment") s = s>=MAX_SEED ? 0 : s+1;
        else if(a==="decrement") s = s<=0 ? MAX_SEED : s-1;
        st.seed = s;
        render();
      };
      api.addEventListener("promptQueued", _seedHook);

      // ── Execution-timer listeners (global queue events) ──
      // execution_start fires when the queue kicks off; executing with a null
      // detail signals the queue drained. Also stop on error/interrupt so a
      // failed run doesn't leave the clock spinning. Named refs so onRemoved
      // can detach them cleanly (anonymous handlers can't be removed).
      const _timerStartEvt = () => startTimer();
      const _timerExecutingEvt = (e) => { if(e?.detail===null) stopTimer(); };
      const _timerEndEvt = () => stopTimer();
      api.addEventListener("execution_start", _timerStartEvt);
      api.addEventListener("executing", _timerExecutingEvt);
      api.addEventListener("execution_error", _timerEndEvt);
      api.addEventListener("execution_interrupted", _timerEndEvt);

      // Repaint this node's theme swatches when ANY node edits the global theme.
      // Only matters when our theme section is open; applyTheme() already handles
      // the actual recolor globally via :root, so this just syncs the controls.
      const _themeRedraw = () => { if(open.theme) render(); };
      IO_THEME_LISTENERS.add(_themeRedraw);

      const _origAdded = selfNode.onAdded?.bind(selfNode);
      selfNode.onAdded = function(){
        if(_origAdded)_origAdded();
        Promise.all([loadModels(), loadPresets(), loadLlmModels(), loadTheme(), loadNamedThemes()]).then(()=>render());
      };
      const _origRemoved = selfNode.onRemoved?.bind(selfNode);
      selfNode.onRemoved = function(){
        api.removeEventListener("promptQueued", _seedHook);
        api.removeEventListener("execution_start", _timerStartEvt);
        api.removeEventListener("executing", _timerExecutingEvt);
        api.removeEventListener("execution_error", _timerEndEvt);
        api.removeEventListener("execution_interrupted", _timerEndEvt);
        IO_THEME_LISTENERS.delete(_themeRedraw);
        if(timerInterval){ clearInterval(timerInterval); timerInterval=null; }
        if(_origRemoved)_origRemoved();
      };
    };
  },
});
