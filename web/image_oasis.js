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
  /* Generate/Compare button colors. Default green; mirrored from --io-bg /
     --io-bd by applyTheme so the Background and Border sliders drive them. */
  --io-go-fill:#3a5a3f; --io-go-bd:#4f7a56;
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
.io-icon-btn.io-dice{background:var(--io-accent-dim);border-color:var(--io-accent);color:#fff;}
/* Sub-collapsible used inside the Prompt section for Enhancer Settings.
   Visually subordinate to .io-section: no accent header, thinner padding,
   single dim chevron. The header stays a row even when closed so the user
   can click it to expand. */
.io-subsec{border:1px solid var(--io-bd);border-radius:4px;background:#1a1a1a;margin-top:4px;}
.io-subsec-head{display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:pointer;user-select:none;font-family:var(--io-mono);font-size:10px;color:var(--io-dim);letter-spacing:.07em;text-transform:uppercase;}
.io-subsec-head:hover{color:#ddd;}
.io-subsec-title{flex:1;}
.io-subsec-body{padding:7px 8px 8px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--io-bd);}
.io-rec-label{font-family:var(--io-mono);font-size:10px;color:var(--io-dim);letter-spacing:.04em;white-space:nowrap;}
.io-warn-tip{font-family:var(--io-mono);font-size:9px;color:#c98;letter-spacing:.03em;line-height:1.3;padding:2px 0;}
.io-icon-btn.io-dice:hover{background:var(--io-accent);border-color:var(--io-accent);color:#fff;}
.io-icon-btn.io-go{background:var(--io-go-fill);border-color:var(--io-go-bd);color:#fff;}
.io-icon-btn.io-go:hover{background:var(--io-go-bd);border-color:var(--io-go-bd);color:#fff;}
/* Compare matches Generate's defaults; active state mirrors hover so the
   toggled-on look reads the same as moused-over. */
.io-icon-btn.io-compare{background:var(--io-go-fill);border-color:var(--io-go-bd);color:#fff;}
.io-icon-btn.io-compare:hover,
.io-icon-btn.io-compare.active{background:var(--io-go-bd);border-color:var(--io-go-bd);color:#fff;}
/* Save matches R&G's slate-blue defaults (item 13). */
.io-icon-btn.io-save{background:var(--io-accent-dim);border-color:var(--io-accent);color:#fff;}
.io-icon-btn.io-save:hover{background:var(--io-accent);border-color:var(--io-accent);color:#fff;}
/* Seed-row buttons (next to the seed input): identical squares with centered
   glyphs, sized to match the seed input's rendered height. font-size + padding
   matched to .io-input so the box reads as the same row. */
.io-icon-btn.io-sm{box-sizing:border-box;width:24px;height:24px;padding:0;font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center;}
/* Header icon buttons (Generate, R&G, Compare, Save): identical 26×26 squares
   with centered glyph, so the differing glyph extents (▶ vs 🎲 vs ◧ vs 💾)
   can't make one box taller or wider than another. */
.io-icon-btn.io-hdr{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:13px;line-height:1;}
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
.io-col-left::-webkit-scrollbar-thumb:hover{background:var(--io-bd);}
.io-col-right{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:#161616;border:1px solid var(--io-bd);border-radius:5px;overflow:hidden;}
.io-preview-head{position:relative;display:flex;align-items:center;gap:8px;font-family:var(--io-mono);font-size:9px;font-weight:700;letter-spacing:.08em;color:var(--io-accent);text-transform:uppercase;padding:6px 9px;border-bottom:1px solid var(--io-bd);flex-shrink:0;}
.io-preview-head .io-mini{flex:1;}
.io-preview-scroll{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:9px;}
.io-preview-img{max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;border:1px solid var(--io-bd);}
.io-preview-empty{color:var(--io-dim);font-family:var(--io-mono);font-size:10px;text-align:center;margin:auto;padding:20px;}
/* ── Compare-slider (item 6) — vendored from Preview Architect ──
   A = current image (in flow; defines container size; clipped from the right).
   B = compare source (previous batch or a ref image; absolute, fills container).
   Handle = white 2px vertical bar with circular knob; ::after widens the hit
   target. Labels mark which side is which. */
.io-cmp-item{position:relative;max-width:100%;max-height:100%;display:inline-flex;border-radius:4px;border:1px solid var(--io-bd);overflow:hidden;}
.io-cmp-item img.io-cmp-a{display:block;max-width:100%;max-height:100%;object-fit:contain;position:relative;z-index:2;border:none;border-radius:0;user-select:none;-webkit-user-drag:none;}
.io-cmp-item img.io-cmp-b{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;z-index:1;user-select:none;-webkit-user-drag:none;pointer-events:none;}
.io-cmp-handle{position:absolute;top:0;width:2px;height:100%;background:#fff;transform:translateX(-50%);cursor:ew-resize;z-index:10;box-shadow:0 0 6px rgba(0,0,0,.6);pointer-events:all;}
.io-cmp-handle::before{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:18px;height:18px;background:#fff;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,.5);}
.io-cmp-handle::after{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:24px;height:100%;cursor:ew-resize;}
.io-cmp-label{position:absolute;top:6px;font-family:var(--io-mono);font-size:9px;font-weight:700;color:#fff;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:3px;pointer-events:none;z-index:11;letter-spacing:.06em;}
.io-cmp-label-a{left:6px;}
.io-cmp-label-b{right:6px;}
.io-info-bar{padding:3px 10px;font-family:var(--io-mono);font-size:8px;color:var(--io-dim);letter-spacing:.06em;background:rgba(0,0,0,.25);border-top:1px solid var(--io-bd);white-space:nowrap;overflow:hidden;flex-shrink:0;height:20px;line-height:14px;box-sizing:border-box;display:flex;align-items:center;gap:6px;}
.io-info-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;}
.io-batch-nav{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;color:var(--io-dim);font-family:var(--io-mono);font-size:9px;letter-spacing:.04em;}
.io-batch-arrow{background:none;border:none;color:var(--io-dim);cursor:pointer;font-size:14px;line-height:1;padding:0 4px;font-family:var(--io-mono);}
.io-batch-arrow:hover{color:var(--io-accent);}
/* ── In-node help panel (item 2) ──
   Renders the markdown loaded from /image_oasis/help. Fixed 300px tall,
   scrollable, with prose-friendly typography that still respects the theme. */
.io-help-body{height:300px;overflow-y:auto;padding:10px 12px;background:#191919;border:1px solid var(--io-bd);border-radius:4px;color:#ddd;font-family:var(--io-sans);font-size:12px;line-height:1.55;}
.io-help-body > *:first-child{margin-top:0;}
.io-help-body > *:last-child{margin-bottom:0;}
.io-help-body h1{font-size:15px;margin:.4em 0 .35em;color:var(--io-accent);font-weight:700;letter-spacing:.02em;}
.io-help-body h2{font-size:13px;margin:.9em 0 .25em;color:var(--io-accent);font-weight:700;}
.io-help-body h3{font-size:12px;margin:.55em 0 .2em;color:#e6e6e6;font-weight:700;}
.io-help-body h4{font-size:11px;margin:.4em 0 .15em;color:var(--io-dim);text-transform:uppercase;letter-spacing:.05em;}
.io-help-body p{margin:.4em 0;}
.io-help-body ul,.io-help-body ol{margin:.3em 0 .4em 1.3em;padding:0;}
.io-help-body li{margin:.15em 0;}
.io-help-body code{font-family:var(--io-mono);font-size:11px;background:#0a0a0a;padding:1px 5px;border-radius:3px;color:#cfe5b9;}
.io-help-body pre{background:#0a0a0a;border:1px solid var(--io-bd);border-radius:3px;padding:6px 8px;overflow-x:auto;margin:.4em 0;}
.io-help-body pre code{background:none;padding:0;color:#cfe5b9;}
.io-help-body a{color:var(--io-accent);text-decoration:none;}
.io-help-body a:hover{text-decoration:underline;}
.io-help-body hr{border:none;border-top:1px solid var(--io-bd);margin:.7em 0;}
.io-help-body strong{color:#fff;}
.io-help-body em{color:#c8d2e0;}
.io-help-body blockquote{margin:.4em 0;padding:.2em 10px;border-left:3px solid var(--io-accent-dim);background:rgba(0,0,0,.25);color:#d8d8d8;border-radius:0 3px 3px 0;}
.io-help-body blockquote p{margin:.25em 0;}
.io-info-label{font-weight:700;color:var(--io-accent);}
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
.io-preset-card{background:var(--io-bg2);border:1px solid var(--io-bd);border-radius:5px;overflow:hidden;flex-shrink:0;transition:box-shadow .1s;}
.io-preset-card.io-preset-drop-above{box-shadow:0 -2px 0 0 var(--io-accent);}
.io-preset-card.io-preset-drop-below{box-shadow:0 2px 0 0 var(--io-accent);}
.io-preset-card.io-preset-dragging{opacity:.35;}
.io-preset-drag{flex:0 0 14px;display:grid;grid-template-columns:repeat(3,3px);grid-template-rows:repeat(3,3px);gap:2px;cursor:grab;padding:2px 0;opacity:.45;transition:opacity .12s;align-content:center;justify-content:center;}
.io-preset-head:hover .io-preset-drag{opacity:1;}
.io-preset-drag:active{cursor:grabbing;}
.io-preset-drag-dot{width:3px;height:3px;border-radius:50%;background:var(--io-dim);}
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
.io-timer{position:absolute;left:50%;top:50%;transform:translate(calc(-50% + 20px),-50%);pointer-events:none;font-family:'Orbitron','Space Mono',monospace;font-size:22px;font-weight:700;letter-spacing:.04em;color:var(--io-dim);font-variant-numeric:tabular-nums;white-space:nowrap;min-width:9ch;text-align:left;transition:color .4s ease;}
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
.io-lora-trigger-row{display:flex;align-items:center;gap:5px;margin:2px 0 4px 0;}
.io-lora-trigger-row .io-lora-trigger-spacer{flex:0 0 39px;}
.io-lora-trigger-row input{flex:1;font-size:11px;padding:3px 5px;}
/* Reference-image drop/paste target = the thumbnail box ONLY (not the whole
   row — the upload button beside it is a click target, and a drop landing on
   it shouldn't silently set the image). Drag-over and focus (click, then
   Ctrl+V pastes) share the same accent treatment so "this box will receive
   the image" reads identically for both input paths. */
.io-ref-thumb,.io-ref-thumb-empty{outline:none;}
.io-ref-thumb.io-drop,.io-ref-thumb-empty.io-drop,
.io-ref-thumb:focus,.io-ref-thumb-empty:focus{border-color:var(--io-accent);box-shadow:0 0 0 2px var(--io-accent-dim);}
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

// ── In-node help (item 2) ────────────────────────────────────────────────────
// Module-scope cache so help_content.md is fetched once per page-load, not once
// per node. Listeners get notified on completion so any open node can re-render
// to swap the "Loading…" placeholder for real content.
let IO_HELP_HTML = "";
let IO_HELP_LOADING = null;
const IO_HELP_LISTENERS = new Set();

const loadHelpOnce = () => {
  if (IO_HELP_HTML || IO_HELP_LOADING) return;
  IO_HELP_LOADING = fetch("/image_oasis/help")
    .then(r => r.text())
    .then(md => { IO_HELP_HTML = mdToHtml(md); IO_HELP_LISTENERS.forEach(fn => { try{ fn(); }catch{} }); })
    .catch(e => { console.warn("[Image Oasis] help fetch failed:", e); })
    .finally(() => { IO_HELP_LOADING = null; });
};

// Minimal Markdown → HTML converter. Subset chosen to cover what
// help_content.md needs: headings (#…####), **bold**, *italic*, `code`,
// ```fenced code```, [link](url), - / 1. lists, > blockquotes, --- hr,
// blank-line paragraph breaks. No nesting. Not a general-purpose parser.
function mdToHtml(md){
  if(!md) return "";
  const esc = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const inline = (s) => {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  };
  const lines = md.replace(/\r\n/g,"\n").split("\n");
  const out = [];
  let inCode = false, codeBuf = [];
  let listType = null;          // "ul" | "ol" | null
  let inQuote = false;
  let paraBuf = [];
  const flushPara = () => { if(paraBuf.length){ out.push(`<p>${inline(paraBuf.join(" "))}</p>`); paraBuf=[]; } };
  const flushList = () => { if(listType){ out.push(`</${listType}>`); listType=null; } };
  const flushQuote = () => { if(inQuote){ out.push("</blockquote>"); inQuote=false; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for(const raw of lines){
    if(/^```/.test(raw)){
      flushAll();
      if(inCode){ out.push(`<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`); codeBuf=[]; inCode=false; }
      else inCode=true;
      continue;
    }
    if(inCode){ codeBuf.push(raw); continue; }
    if(/^---+\s*$/.test(raw)){ flushAll(); out.push("<hr/>"); continue; }
    let m;
    if((m = raw.match(/^(#{1,4})\s+(.*)$/))){
      flushAll();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      continue;
    }
    if((m = raw.match(/^>\s?(.*)$/))){
      flushPara(); flushList();
      if(!inQuote){ out.push("<blockquote>"); inQuote=true; }
      out.push(`<p>${inline(m[1])}</p>`);
      continue;
    }
    if((m = raw.match(/^[-*]\s+(.*)$/))){
      flushPara(); flushQuote();
      if(listType !== "ul"){ flushList(); out.push("<ul>"); listType="ul"; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    if((m = raw.match(/^\d+\.\s+(.*)$/))){
      flushPara(); flushQuote();
      if(listType !== "ol"){ flushList(); out.push("<ol>"); listType="ol"; }
      out.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    if(/^\s*$/.test(raw)){ flushAll(); continue; }
    flushList(); flushQuote();
    paraBuf.push(raw.trim());
  }
  flushAll();
  return out.join("\n");
}

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
  // Mirror "Background" slider → Gen/Compare fill, "Border" slider → Gen/Compare
  // border (item 13). When --io-bg/--io-bd are at their defaults nothing is
  // written, so the green CSS defaults for --io-go-fill/--io-go-bd hold. When
  // the user overrides those sliders, the buttons follow.
  const mirror = [];
  const bg = IO_THEME["--io-bg"];
  if (bg && bg !== IO_THEME_DEFAULTS["--io-bg"]) mirror.push(`--io-go-fill:${bg};`);
  const bd = IO_THEME["--io-bd"];
  if (bd && bd !== IO_THEME_DEFAULTS["--io-bd"]) mirror.push(`--io-go-bd:${bd};`);
  const out = decls + mirror.join("");
  el.textContent = out ? `:root{${out}}` : "";
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

// Escape user-controlled text for interpolation into the HTML templates —
// element content AND double-quoted attribute values. Filenames, preset/theme
// names, and prompt text all flow through here; without it a value containing
// `"` `<` or `&` breaks the markup (a preset name is stored DOM injection),
// and prompt text containing entities fails to round-trip through render().
const esc = (s) => String(s ?? "")
  .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

const ARCHS = ["auraflow","flux","krea2","qwen_image_edit","other","sd3"];
const ARCH_LABELS = {auraflow:"AuraFlow",flux:"Flux.1 / Flux.2",krea2:"Krea 2 (Turbo / Raw)",other:"SD1 / SD1.5 / No Patch",sd3:"SD3 / SD3.5",qwen_image_edit:"Qwen-Image-Edit"};
// How many CLIP slots each arch exposes in the UI (mirrors clip_slots in
// registry.py). State preserves all three values regardless; nodes.py trims
// at runtime so a 1-slot arch never loads with stale slot-2/3 values.
const CLIP_SLOTS = {auraflow:1, flux:2, krea2:1, qwen_image_edit:1, other:2, sd3:3};
const SOURCES = ["checkpoint","diffusion","gguf"];
const SOURCE_LABELS = {checkpoint:"Checkpoint", diffusion:"Diffusion", gguf:"GGUF"};
const WEIGHT_DTYPES = ["default","fp8_e4m3fn","fp8_e4m3fn_fast","fp8_e5m2"];
const CLIP_TYPES = ["","stable_diffusion","sd3","flux","qwen_image","lumina2","hidream","chroma","flux2","krea2"];
const UPSCALE_MODES = ["algorithmic","model"];
const UPSCALE_METHODS = ["lanczos","bicubic","bilinear","nearest-exact","area"];
const MAX_SEED = 1125899906842624;  // 2^50, matches ComfyUI's seed range

// ── io_id result routing (side-channel, not via ComfyUI's `executed` event) ──
// Each Image Oasis node owns a stable UUID (io_id) that persists in its
// serialized widget state. The Python side sends generation results via a
// custom "image-oasis/result" WebSocket event keyed by io_id, instead of
// returning `{"ui": {"images": ...}}` (which would invoke ComfyUI's per-
// numeric-id routing — the source of every cross-workflow collision bug).
//
// The result either reaches a live closure handler immediately, or gets
// stashed for the next mount to drain (tab-switch closure rebuild case).
// Pending stash entries are keyed by UUID so collisions are mathematically
// impossible: ComfyUI's numeric node id is irrelevant to this path.
const IO_HANDLERS = new Map();         // io_id → updatePanel fn (active)
const IO_PENDING_RESULTS = new Map();  // io_id → images (off-tab stash)
api.addEventListener("image-oasis/result", ({detail}) => {
  if (!detail || typeof detail.io_id !== "string") return;
  if (!Array.isArray(detail.images) || !detail.images.length) return;
  const handler = IO_HANDLERS.get(detail.io_id);
  if (handler) handler(detail.images);
  else IO_PENDING_RESULTS.set(detail.io_id, detail.images);
});

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
        user_prompt:"", positive:"", negative:"",
        width:1024, height:1024, batch_size:1, seed:0,
        steps:20, cfg:3.5, sampler_name:"euler", scheduler:"simple", denoise:1.0,
        seed_control:"randomize",
        clip_file:"", clip_file_2:"", clip_file_3:"", vae_file:"", clip_bundled:false, vae_bundled:false,
        weight_dtype:"default", clip_type:"", shift:0.0,
        loras:[],
        enable_refiner:false, refiner_steps:10, refiner_cfg:3.5,
        refiner_denoise:0.4,
        enable_upscale:false, upscale_mode:"algorithmic",
        upscale_method:"lanczos", upscale_multiplier:2.0, upscale_model_file:"",
        ref_image1:"", ref_image2:"", ref_image3:"",
      };
      let open = { presets:false, model:false, loras:false, refs:false, prompt:false, sampling:false, refiner:false, upscale:false, theme:false, help:false };
      let taHeights = { user_prompt:72, positive:72, negative:72 };  // px, drag-handle controlled
      let presets = [];
      let presetName = "";
      let expandedPresets = new Set();
      let themeName = "";   // input value for the Save Theme name field (per-node)
      // Stable per-node UUID for side-channel result routing. Generated lazily
      // in onAdded if not restored from saved state via setValue. Persisted
      // through getValue so it round-trips through workflow JSON.
      let ioId = "";
      let previewImages = [];
      let previewInfo = [];
      let previewMeta = "";
      let previewSizeKB = 0;
      let currentBatchIdx = 0;       // which image of the current batch is displayed (0..N-1)
      let compareOpen = false;       // output-header Compare toggle (item 6 wires the actual slider)
      // ── Compare-slider state (item 6) ──
      let previousImages = [];       // URLs of the prior batch (snapshotted in onExecuted)
      let previousInfo = [];         // matching info objects, persisted via getValue/setValue
      let cmpPercent = 50;           // slider position 0..100 (% from the left)
      let cmpRefIdx = null;          // which ref slot (0|1|2) overrides "previous" as source; null = use previous
      let cmpDragging = false;       // closure-only; not persisted
      let cmpActiveContainer = null; // the .io-cmp-item whose handle the user grabbed (anchor for x→pct math)
      let allModels = {checkpoints:[],diffusion:[],gguf_unet:[],clip_std:[],clip_gguf:[],vaes:[],upscale_models:[],loras:[]};
      // ── Prompt-enhancer ("magic wand") state ──
      let llmModels = [];            // .gguf / .safetensors under models/LLM
      let llmModel = "";             // selected enhancer model
      let llmStyle = "natural";      // "natural" | "tags"
      let wandBusy = false;          // disables the button mid-call

      // Enhancer settings (collapsible at bottom of prompt panel).
      let llmSettingsOpen = false;
      let llmAutoLayers = true;      // checkbox: use recommended layer count
      let llmGpuLayers = -1;         // -1 = all on GPU; only used when auto is off
      let llmContext = 8192;
      let llmMaxTokens = 2048;
      // Recommendation cache: {total, layers, all} from the backend, or null
      // while fetching / on error. Refetched on model change.
      let llmRecommended = null;
      let llmRecommendedBusy = false;
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
      const opt = (list,val) => list.map(m=>`<option value="${esc(m)}"${m===val?" selected":""}>${esc(m)}</option>`).join("");
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
        <input class="io-input" type="number" data-f="${field}" value="${esc(st[field])}" step="${step}" ${min!=null?`min="${min}"`:""} ${max!=null?`max="${max}"`:""}${tip?` title="${tip}"`:""}/></div>`;

      const modelSection = () => {
        const isCkpt = st.source_type==="checkpoint";
        // For checkpoints, CLIP/VAE may be baked in (auto-detected). The
        // selectors disable and show "Baked in" — no manual tick boxes.
        const clipBaked = isCkpt && st.clip_bundled;
        const vaeBaked = isCkpt && st.vae_bundled;
        return sec("model","Model", `
          <div class="io-row">
            <span class="io-label">Arch</span>
            <select class="io-select" data-f="architecture" title="Model family / architecture. Determines which sampler defaults and shift values are appropriate, which CLIP types are valid, and how the prompt is encoded. Set this to match your base model — wrong arch will produce broken outputs or a clear error.">${ARCHS.map(a=>`<option value="${a}"${a===st.architecture?" selected":""}>${ARCH_LABELS[a]}</option>`).join("")}</select>
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
          ${!clipBaked && (CLIP_SLOTS[st.architecture]||1)>=2?`<div class="io-row">
            <span class="io-label">CLIP 2</span>
            <select class="io-select" data-f="clip_file_2">${optBlank(clipList(),st.clip_file_2,"\u2014 none \u2014")}</select>
          </div>`:""}
          ${!clipBaked && (CLIP_SLOTS[st.architecture]||1)>=3?`<div class="io-row">
            <span class="io-label">CLIP 3</span>
            <select class="io-select" data-f="clip_file_3">${optBlank(clipList(),st.clip_file_3,"\u2014 none \u2014")}</select>
          </div>`:""}
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
            <input class="io-input io-lora-str" type="number" data-lora-sm="${i}" value="${esc(l.strength_model)}" step="0.05" title="LoRA strength. Modern arches (Flux, Qwen, Z-Image, SD3) only adapt the transformer; CLIP/TE strength is mirrored from this value behind the scenes for the rare LoRA that ships text-encoder weights."/>
            <button class="io-ref-clear" data-lora-del="${i}" title="Remove" style="flex:0 0 18px;padding:0;text-align:center">\u2715</button>
          </div>
          ${on ? `<div class="io-lora-trigger-row" data-lora-trigger-row="${i}">
            <span class="io-lora-trigger-spacer"></span>
            <input class="io-input" type="text" data-lora-trigger="${i}" placeholder="trigger words\u2026" value="${esc(l.trigger_words||"")}" title="Optional trigger word or phrase. Prepended to the positive prompt (in stack order, comma-separated) when this LoRA is enabled. Leave blank to skip."/>
          </div>` : ""}`;
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
          // The thumb is the drop/paste target (data-ref-thumb + tabindex),
          // deliberately NOT the whole row — see the CSS comment.
          const tt = `title="Drop an image here, or click and paste (Ctrl+V)"`;
          const thumb = fn
            ? `<img class="io-ref-thumb" data-ref-thumb="${n}" tabindex="0" ${tt} src="${esc(imgURL({filename:fn,subfolder:"",type:"input"}))}"/>`
            : `<div class="io-ref-thumb-empty" data-ref-thumb="${n}" tabindex="0" ${tt}>${n}</div>`;
          // Compare-source toggle (item 6): only meaningful when the slot has an
          // image. Independent of the header Compare button — toggling a ref as
          // source doesn't auto-activate the slider, and vice versa.
          const cmpTog = fn
            ? `<button class="io-icon-btn io-compare io-sm${cmpRefIdx===n-1?" active":""}" data-cmp-ref-tog="${n-1}" title="Use as compare base">\u25e7</button>`
            : "";
          return `<div class="io-refslot">
            ${thumb}
            <button class="io-ref-btn" data-ref-upload="${n}">${fn?esc(fn):"Upload reference "+n+"\u2026"}</button>
            ${cmpTog}
            ${fn?`<button class="io-ref-clear" data-ref-clear="${n}">\u2715</button>`:""}
          </div>`;
        };
        return sec("refs","Reference Images", `${slot(1)}${slot(2)}${slot(3)}
          <div class="io-mini" style="opacity:.7">Used by image-edit architectures (e.g. Qwen-Image-Edit).</div>
        `);
      };

      const SEED_CONTROLS = ["fixed","increment","decrement","randomize"];
      const selCol = (field,label,list) => `
        <div><span class="io-mini">${label}</span>
        <select class="io-select" data-f="${field}">${opt(list,st[field])}</select></div>`;
      const taBlock = (field,ph) => `
        <div class="io-ta-wrap">
          <textarea class="io-ta" data-f="${field}" placeholder="${ph}" style="height:${taHeights[field]||72}px">${esc(st[field])}</textarea>
          <div class="io-ta-handle" data-ta-handle="${field}"></div>
        </div>`;
      // Magic-wand row: model picker, NL/Tags toggle + enhance button.
      // Out-of-band: calls /image_oasis/enhance directly; not part of the graph.
      const wandRow = () => {
        const hasModels = llmModels.length > 0;
        const modelOpts = hasModels
          ? optBlank(llmModels, llmModel, "\u2014 enhancer model \u2014")
          : `<option value="">\u2014 no models in models/LLM \u2014</option>`;
        const styleTog = ["natural","tags"].map(s=>
          `<button class="io-tog${llmStyle===s?" active":""}" data-llm-style="${s}">${s==="natural"?"Natural<br/>Language":"Tags"}</button>`).join("");
        const enhanceLabel = wandBusy ? "\u2026" : "\u2728 Enhance";
        return `
          <div class="io-row">
            <span class="io-label" style="width:auto">Model</span>
            <select class="io-select" data-llm-model ${hasModels?"":"disabled"}>${modelOpts}</select>
          </div>
          <div class="io-row" style="align-items:stretch">
            <div class="io-toggle-grp" style="flex:0 0 130px">${styleTog}</div>
            <button class="io-btn" data-wand-go style="margin-top:0;flex:1" ${wandBusy?"disabled":""}>${enhanceLabel}</button>
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
        <div class="io-mini" style="margin-bottom:2px">User Prompt</div>
        ${taBlock("user_prompt","Your short prompt to enhance")}
        <div class="io-mini" style="margin:6px 0 2px 0">Enhanced Prompt</div>
        ${taBlock("positive","Enhanced prompt (drives generation)")}
        ${wandRow()}
        <div class="io-ta-wrap">
          <textarea class="io-ta${negUsed?"":" io-ta-ignored"}" data-f="negative" placeholder="Negative prompt" style="height:${taHeights.negative||72}px" title="${negUsed?"":"Ignored — Negative Prompt uses CFG > 1. Increase CFG (or enable a refiner with CFG > 1) to use the negative prompt."}">${esc(st.negative)}</textarea>
          <div class="io-ta-handle" data-ta-handle="negative"></div>
        </div>
        <div class="io-neg-ignored-note" data-neg-note style="display:${negUsed?"none":"block"}">Ignored \u2014 Negative Prompt uses CFG &gt; 1.</div>
        ${enhancerSettingsBlock()}
      `);
      };

      // Collapsible sub-panel inside Prompt. Closed by default. Three settings:
      // GPU layers (with Auto checkbox + recommendation display), context size,
      // max tokens. Auto layers is driven by the /image_oasis/llm_recommended_layers
      // endpoint, refetched whenever the enhancer model selection changes.
      const enhancerSettingsBlock = () => {
        // Recommendation label content. While a fetch is in flight, show em-dash.
        // When the math says everything fits, show "All (N)". Otherwise "N/total".
        let recText;
        if (llmRecommendedBusy || !llmRecommended) {
          recText = "Recommended: \u2014";
        } else if (llmRecommended.all) {
          const total = llmRecommended.total;
          recText = total ? `Recommended: All (${total})` : "Recommended: All";
        } else {
          recText = `Recommended: ${llmRecommended.layers}/${llmRecommended.total}`;
        }
        const head = `
          <div class="io-subsec-head" data-subsec="enhancer_settings">
            <span class="io-subsec-title">Enhancer Settings</span>
            <span class="io-chevron${llmSettingsOpen?" open":""}">\u203a</span>
          </div>`;
        if (!llmSettingsOpen) return `<div class="io-subsec">${head}</div>`;
        // GPU layers field: disabled when Auto is on; shows -1 in that case
        // (the "Recommended" label translates that to "All (N)" for clarity).
        const layersDisabled = llmAutoLayers ? "disabled" : "";
        const layersValue = llmAutoLayers
          ? (llmRecommended ? llmRecommended.layers : -1)
          : llmGpuLayers;
        return `<div class="io-subsec">
          ${head}
          <div class="io-subsec-body">
            <div class="io-row" style="align-items:center">
              <label class="io-chk" data-llm-auto-layers>
                <span class="io-chk-box${llmAutoLayers?" on":""}">${llmAutoLayers?"\u2713":""}</span>Auto GPU layers
              </label>
              <span class="io-rec-label">${recText}</span>
            </div>
            <div class="io-warn-tip">\u26a0 Only disable Auto GPU Layers if you know what you're doing.</div>
            <div class="io-row">
              <span class="io-label">GPU layers</span>
              <input class="io-input" type="number" data-llm-gpu-layers value="${layersValue}" step="1" ${layersDisabled}/>
            </div>
            <div class="io-row">
              <span class="io-label">Context</span>
              <input class="io-input" type="number" data-llm-context value="${llmContext}" step="512" min="512"/>
            </div>
            <div class="io-row">
              <span class="io-label">Max tokens</span>
              <input class="io-input" type="number" data-llm-max-tokens value="${llmMaxTokens}" step="64" min="64"/>
            </div>
          </div>
        </div>`;
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
        <div class="io-half">${num("denoise","Denoise",0.01,0,1)}${num("shift","Shift (0=auto)",0.01,0,100,"Sigma shift for flow-matching schedulers. The right value depends on the model architecture — Flux typically uses ~1.0–3.5, SD3/3.5 uses ~3.0, AuraFlow uses ~3.0. 0 = use the architecture's default (recommended unless you know what you're doing). Higher values shift sampling toward later (more refined) noise levels.")}</div>
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
        <div class="io-row"><span class="io-label">\u00d7Multiplier</span><input class="io-input" type="number" data-f="upscale_multiplier" value="${st.upscale_multiplier}" step="0.1" min="1" max="8"/></div>
        ${st.upscale_mode==="model"
          ?`<div class="io-row"><span class="io-label">Up Model</span><select class="io-select" data-f="upscale_model_file">${optBlank(allModels.upscale_models,st.upscale_model_file,"\u2014 select \u2014")}</select></div>`
          :`<div class="io-row"><span class="io-label">Method</span><select class="io-select" data-f="upscale_method">${opt(UPSCALE_METHODS,st.upscale_method)}</select></div>`}`:""}
      `);

      // Theme editor: one row per editable CSS variable — a native color picker,
      // a hex text field (type or pick), wired to the GLOBAL theme. Editing any
      // row re-themes every open node live (see saveTheme / IO_THEME_LISTENERS).
      const themeRow = (v) => {
        const val = IO_THEME[v.k] || IO_THEME_DEFAULTS[v.k];
        return `<div class="io-row">
          <span class="io-label">${v.label}</span>
          <input class="io-swatch" type="color" data-theme-pick="${v.k}" value="${esc(val)}"/>
          <input class="io-input io-hex" data-theme-hex="${v.k}" value="${esc(val)}" maxlength="7" spellcheck="false"/>
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
            return `<span class="io-theme-chip" style="background:${esc(c)}" title="${esc(v.label+": "+c)}"></span>`;
          }).join("");
          const isActive = t.id===activeId;
          return `<div class="io-theme-row${isActive?" active":""}" data-theme-load="${t.id}" title="Click to apply">
            <span class="io-theme-chips">${chips}</span>
            <span class="io-theme-nm">${esc(t.name)}</span>
            ${isActive?`<span class="io-theme-meta">active</span>`:""}
            <button class="io-preset-del" data-theme-named-del="${t.id}" title="Delete theme">\u2715</button>
          </div>`;
        }).join("");
      };

      const themeSection = () => sec("theme","Theme", `
        ${IO_THEME_VARS.map(themeRow).join("")}
        <div class="io-row">
          <input class="io-input" data-theme-name placeholder="Save current as\u2026" maxlength="60" value="${esc(themeName)}"/>
          <button class="io-btn" data-theme-save style="margin-top:0">Save Theme</button>
        </div>
        ${namedThemesList()}
        <div class="io-row">
          <button class="io-btn" data-theme-reset style="margin-top:0;flex:1">Reset to default</button>
        </div>
        <div class="io-mini" style="opacity:.7">Edits preview live across every Image Oasis node. Save Theme stores the current palette as a named entry; click any saved row to switch.</div>
      `);

      // Help section (item 2). Renders help_content.md fetched from the
      // backend. Content is module-cached so opening Help on a second node
      // doesn't re-fetch. While the fetch is in flight a placeholder shows.
      const helpSection = () => sec("help","Help", `
        <div class="io-help-body">${IO_HELP_HTML || '<div class="io-mini" style="opacity:.7">Loading help\u2026</div>'}</div>
      `);

      const fmtStamp = ts => { try{ return new Date(ts).toLocaleString(); }catch{ return ""; } };
      const shortName = f => (f||"").split(/[/\\]/).pop().replace(/\.(safetensors|ckpt|pt|gguf)$/i,"") || "\u2014";
      const kv = (k,v) => `<div class="io-kv"><span class="io-kv-k">${k}</span><span class="io-kv-v">${v}</span></div>`;

      const presetsSection = () => {
        const cards = !presets.length
          ? `<div class="io-empty">No saved presets yet.<br/>Configure the node and save one.</div>`
          : presets.map(p=>{
              const exp = expandedPresets.has(p.id), c = p.config || {};
              // Drag grip mirrors the LoRA pattern: only the grip is the drag
              // source; the card serves as the drop target via data-preset-id.
              const grip = `<div class="io-preset-drag" draggable="true" data-preset-drag="${p.id}" title="Drag to reorder">${'<div class="io-preset-drag-dot"></div>'.repeat(9)}</div>`;
              return `<div class="io-preset-card" data-preset-id="${p.id}">
                <div class="io-preset-head" data-preset-toggle="${p.id}">
                  ${grip}
                  <span class="io-preset-nm">${esc(p.name)}</span>
                  <span class="io-preset-meta">${fmtStamp(p.timestamp)}</span>
                  <span class="io-chevron${exp?" open":""}">\u203a</span>
                  <button class="io-preset-del" data-preset-del="${p.id}">\u2715</button>
                </div>
                ${exp?`<div class="io-preset-detail">
                  ${kv("Arch", esc(c.architecture||"\u2014"))}
                  ${kv("Source", esc(c.source_type||"\u2014"))}
                  ${kv("Model", `<span title="${esc(c.model_file||"")}">${esc(shortName(c.model_file))}</span>`)}
                  ${kv("Steps/CFG", `${esc(c.steps??"?")} / ${esc(c.cfg??"?")}`)}
                  ${kv("Sampler", `${esc(c.sampler_name||"?")} / ${esc(c.scheduler||"?")}`)}
                  ${(c.loras && c.loras.length)?kv("LoRAs", (()=>{
                    const total = c.loras.length;
                    const active = c.loras.filter(l=>l.enabled!==false).length;
                    const names = c.loras.map(l=>shortName(l.name)).filter(Boolean).join(", ") || "(none)";
                    const summary = active===total ? `${active}` : `${active} of ${total}`;
                    const full = c.loras.map(l=>(l.enabled===false?"(off) ":"")+(l.name||"(empty)")+`  [m:${l.strength_model} c:${l.strength_clip}]`).join("\n");
                    return `<span title="${esc(full)}">${summary} \u2014 ${esc(names)}</span>`;
                  })()):""}
                  ${c.enable_refiner?kv("Refiner","on"):""}
                  ${c.enable_upscale?kv("Upscale",`${c.upscale_mode} \u00d7${c.upscale_multiplier}`):""}
                  <button class="io-btn" data-preset-load="${p.id}">Load preset</button>
                </div>`:""}
              </div>`;
            }).join("");
        return sec("presets","Presets", `
          <div class="io-row">
            <input class="io-input" data-preset-name placeholder="Save current as\u2026" maxlength="60" value="${esc(presetName)}"/>
            <button class="io-btn" data-preset-save style="margin-top:0">Save</button>
          </div>
          ${cards}
        `);
      };

      const renderPreview = () => {
        const hasImgs = previewImages.length > 0;
        // Clamp index in case persistence restored an out-of-range value.
        if (hasImgs && (currentBatchIdx<0 || currentBatchIdx>=previewImages.length)) currentBatchIdx = 0;
        // ── Compare-source resolution (item 6) ──
        // Ref slot wins when toggled and the slot still holds an image; falls
        // back silently to "previous" if the ref was cleared. previousImages
        // came from the prior generation's snapshot in onExecuted. Matched
        // batches (length-equal) pair by index; unmatched batches only
        // compare image[0] (rest render bare).
        const refSrcFn = (cmpRefIdx!==null) ? st["ref_image"+(cmpRefIdx+1)] : "";
        const refSrcUrl = refSrcFn ? imgURL({filename:refSrcFn,subfolder:"",type:"input"}) : null;
        const matchedBatch = previousImages.length>0 && previousImages.length===previewImages.length;
        const cmpSourceFor = (i) => {
          if (!compareOpen) return null;
          if (refSrcUrl) return { url: refSrcUrl, label: `Ref ${cmpRefIdx+1}` };
          if (matchedBatch) return { url: previousImages[i], label: "Prev" };
          if (previousImages.length>0 && i===0) return { url: previousImages[0], label: "Prev" };
          return null;
        };
        // Display only the currently-selected image of the batch. Navigation
        // arrows in the info bar move currentBatchIdx; the compare slider, if
        // active, pairs to previousImages[currentBatchIdx] via cmpSourceFor.
        // onerror swaps a dead <img> (e.g. a persisted temp ref whose file was
        // cleared between sessions) for the empty-state text instead of a broken
        // image icon. data-prev-idx stays on the img for buildMeta's load hook.
        let imgs;
        if (!hasImgs) {
          imgs = `<div class="io-preview-empty">Generated image<br/>appears here</div>`;
        } else {
          const i = currentBatchIdx;
          const u = previewImages[i];
          const src = cmpSourceFor(i);
          if (src) {
            imgs = `<div class="io-cmp-item">
              <img class="io-cmp-b" src="${esc(src.url)}"/>
              <img class="io-preview-img io-cmp-a" src="${esc(u)}" data-prev-idx="${i}" style="clip-path:inset(0 ${100-cmpPercent}% 0 0)" onerror="this.parentElement.outerHTML='<div class=&quot;io-preview-empty&quot;>Generated image<br/>appears here</div>'"/>
              <div class="io-cmp-handle" data-cmp-handle style="left:${cmpPercent}%"></div>
              <div class="io-cmp-label io-cmp-label-a">Now</div>
              <div class="io-cmp-label io-cmp-label-b">${src.label}</div>
            </div>`;
          } else {
            imgs = `<img class="io-preview-img" src="${esc(u)}" data-prev-idx="${i}" onerror="this.outerHTML='<div class=&quot;io-preview-empty&quot;>Generated image<br/>appears here</div>'"/>`;
          }
        }
        const saveBtn = hasImgs
          ? `<button class="io-icon-btn io-save io-hdr" data-save-out title="Save to output folder">\u{1f4be}</button>`
          : "";
        // Randomize-seed + queue lives on the header so it's reachable without
        // keeping the Generation group open. Always present (incl. empty state)
        // so it can kick off the first generation. The play button beside it
        // queues with the CURRENT seed (no randomize) — for re-running after a
        // refiner/upscale toggle without changing the image's base.
        const goBtn = `<button class="io-icon-btn io-go io-hdr" data-seed-keep title="Generate (keep seed)">\u25b6</button>`;
        const diceBtn = `<button class="io-icon-btn io-dice io-hdr" data-seed-rand title="Randomize &amp; Generate">\u{1f3b2}</button>`;
        // Compare toggle (item 6). Renders as toggled-on regardless of whether
        // a source is available; the slider itself is what hides when no
        // previous and no ref-slot is set.
        const compareBtn = hasImgs
          ? `<button class="io-icon-btn io-compare io-hdr${compareOpen?" active":""}" data-compare-tog title="Compare with previous">\u25e7</button>`
          : "";
        // Batch nav for the info bar (footer). Renders only when there are
        // multiple images. Wrap-around at both ends.
        const batchNav = hasImgs && previewImages.length>1
          ? `<span class="io-batch-nav"><button class="io-batch-arrow" data-batch-prev title="Previous image">\u2039</button>${currentBatchIdx+1}/${previewImages.length}<button class="io-batch-arrow" data-batch-next title="Next image">\u203a</button></span>`
          : "";
        const info = hasImgs
          ? `<div class="io-info-bar"><span class="io-info-text" data-info-bar>${previewMeta || "loading\u2026"}</span>${batchNav}</div>`
          : "";
        // Layout: [go][dice] | spacer | timer (absolute-centered) | [compare][save].
        // Show the frozen last value (or zero) between runs; startTimer repaints.
        const timer = `<span class="io-timer${timerRunning?" running":""}" data-timer>${fmtTimer(timerElapsedMs)}</span>`;
        return `<div class="io-col-right">
          <div class="io-preview-head">${goBtn}${diceBtn}<div style="flex:1"></div>${timer}${compareBtn}${saveBtn}</div>
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
        const parts = [dims, count, fn, size].filter(Boolean).map(esc);
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
      // Optional `resumeStart`: re-arm the clock against an epoch from a
      // previous closure (mid-run tab switch) instead of starting at zero.
      const startTimer = (resumeStart) => {
        if(timerRunning) return;
        timerRunning = true;
        timerStart = (typeof resumeStart==="number") ? resumeStart : Date.now();
        timerElapsedMs = Date.now()-timerStart;
        paintTimer(timerElapsedMs,true);
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
      // Restore a timer that was RUNNING when the closure was torn down (tab
      // switch mid-generation). Whether the run is still live can't be known
      // from the blob alone — a workflow saved mid-run and loaded tomorrow
      // would resume a phantom clock forever. So ask the server: ComfyUI's
      // stock GET /prompt returns exec_info.queue_remaining (running +
      // pending). Busy -> resume ticking from the original start epoch (the
      // queue-drained / error / interrupt events in THIS closure stop it
      // normally). Idle -> the run ended while we were away; freeze at the
      // last elapsed the old closure managed to persist.
      const resumeTimerIfLive = async (start, fallbackElapsed) => {
        try{
          const r = await (await fetch("/prompt")).json();
          if(((r?.exec_info?.queue_remaining)|0) > 0 && !timerRunning){
            startTimer(start);
            return;
          }
        }catch(e){ console.warn("[Image Oasis] timer resume check failed",e); }
        if(!timerRunning){
          timerElapsedMs = Math.max(0, fallbackElapsed||0);
          paintTimer(timerElapsedMs,false);
        }
      };

      const render = () => {
        const scEl = container.querySelector(".io-col-left");
        const scTop = scEl ? scEl.scrollTop : 0;
        // Help body has its own scroll viewport (300 px, overflow-y:auto). It
        // gets destroyed and recreated on each render, so without this, any
        // toggle in another section yanks the user back to the top of the
        // help text — annoying when reading along while configuring.
        const helpEl = container.querySelector(".io-help-body");
        const helpTop = helpEl ? helpEl.scrollTop : 0;
        container.innerHTML = `
          <div class="io-inner">
            <div class="io-body">
              <div class="io-col-left">
                ${presetsSection()}${modelSection()}${loraSection()}${refsSection()}${promptSection()}${samplingSection()}${refinerSection()}${upscaleSection()}${themeSection()}${helpSection()}
              </div>
              ${renderPreview()}
            </div>
          </div>`;
        bind();
        const sc2 = container.querySelector(".io-col-left");
        if (sc2) sc2.scrollTop = scTop;
        const help2 = container.querySelector(".io-help-body");
        if (help2 && helpTop) help2.scrollTop = helpTop;
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
            ta.title = negUsed ? "" : "Ignored — Negative Prompt uses CFG > 1. Increase CFG (or enable a refiner with CFG > 1) to use the negative prompt.";
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
        container.querySelector("[data-llm-model]")?.addEventListener("change",e=>{
          e.stopPropagation();
          llmModel = e.target.value;
          // New model -> the previous recommendation is stale. Clear & refetch.
          llmRecommended = null;
          save();
          fetchRecommendedLayers();
        });
        container.querySelector("[data-llm-model]")?.addEventListener("click",e=>e.stopPropagation());
        container.querySelectorAll("[data-llm-style]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();llmStyle=b.dataset.llmStyle;save();render();}));
        container.querySelector("[data-wand-go]")?.addEventListener("click",e=>{e.stopPropagation();runEnhance();});

        // ── Enhancer Settings sub-panel bindings ──
        container.querySelector('[data-subsec="enhancer_settings"]')?.addEventListener("click",e=>{
          e.stopPropagation(); llmSettingsOpen = !llmSettingsOpen; save(); render();
        });
        container.querySelector("[data-llm-auto-layers]")?.addEventListener("click",e=>{
          e.stopPropagation();
          llmAutoLayers = !llmAutoLayers;
          // Switching auto ON syncs the field to the current recommendation so
          // there's no flash of a stale manual value. Switching auto OFF keeps
          // whatever was in the field (so the user can fine-tune from the
          // recommendation as a starting point).
          if (llmAutoLayers && llmRecommended) llmGpuLayers = llmRecommended.layers;
          save(); render();
        });
        container.querySelector("[data-llm-gpu-layers]")?.addEventListener("input",e=>{
          e.stopPropagation();
          if (llmAutoLayers) return;   // disabled in this mode; ignore stray input
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v)) { llmGpuLayers = v; save(); }
        });
        container.querySelector("[data-llm-context]")?.addEventListener("input",e=>{
          e.stopPropagation();
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v) && v >= 512) { llmContext = v; save(); }
        });
        container.querySelector("[data-llm-max-tokens]")?.addEventListener("input",e=>{
          e.stopPropagation();
          const v = parseInt(e.target.value, 10);
          if (Number.isFinite(v) && v >= 64) { llmMaxTokens = v; save(); }
        });
        // Click on the inputs shouldn't bubble (would collapse the sub-section).
        container.querySelectorAll("[data-llm-gpu-layers],[data-llm-context],[data-llm-max-tokens]")
          .forEach(el=>el.addEventListener("click",e=>e.stopPropagation()));

        // Reference image upload / clear
        container.querySelectorAll("[data-ref-upload]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();uploadRef(b.dataset.refUpload);}));
        container.querySelectorAll("[data-ref-clear]").forEach(b=>b.addEventListener("click",e=>{e.stopPropagation();st["ref_image"+b.dataset.refClear]="";render();}));

        // Reference THUMBNAILS are the drop/paste targets (not the whole slot
        // row — the upload button is a click target, and a drop landing on it
        // must not silently set the image). preventDefault on dragover is what
        // lets `drop` fire at all; stopPropagation keeps ComfyUI's canvas-level
        // drop (loading a workflow from a dropped PNG) from hijacking it.
        container.querySelectorAll("[data-ref-thumb]").forEach(thumb=>{
          const n = thumb.dataset.refThumb;
          thumb.addEventListener("dragenter",e=>{e.preventDefault();e.stopPropagation();thumb.classList.add("io-drop");});
          thumb.addEventListener("dragover", e=>{e.preventDefault();e.stopPropagation();if(e.dataTransfer)e.dataTransfer.dropEffect="copy";thumb.classList.add("io-drop");});
          thumb.addEventListener("dragleave",e=>{e.stopPropagation();thumb.classList.remove("io-drop");});
          thumb.addEventListener("drop",     e=>{e.preventDefault();e.stopPropagation();thumb.classList.remove("io-drop");acceptDrop(n, e.dataTransfer);});
          // Ctrl+V paste into a focused thumb (tabindex makes it focusable;
          // clicking it focuses it). clipboardData IS a DataTransfer, so
          // acceptDrop handles all the same shapes as a drop: a real image
          // file (what "Copy image" in a browser provides), a URL string, or
          // <img src> scraped from text/html. stopPropagation keeps ComfyUI's
          // document-level paste (which pastes copied NODES) from also firing.
          thumb.addEventListener("paste",e=>{
            e.preventDefault(); e.stopPropagation();
            acceptDrop(n, e.clipboardData);
          });
          // Clicking an image-bearing thumb would otherwise do nothing visible;
          // stop the event from reaching the canvas either way.
          thumb.addEventListener("click",e=>e.stopPropagation());
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
          st.loras=[...(st.loras||[]),{name:"",strength_model:1.0,strength_clip:1.0,enabled:true,trigger_words:""}];
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
        // Trigger words: mutate in place, no re-render (input would lose focus
        // mid-typing). Read by Python at execute time and prepended to the
        // positive prompt in stack order for every enabled LoRA whose trigger
        // string is non-empty.
        container.querySelectorAll("[data-lora-trigger]").forEach(el=>{
          el.addEventListener("click",e=>e.stopPropagation());
          const h=()=>{ st.loras[+el.dataset.loraTrigger].trigger_words = el.value; };
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
        // Compare toggle — header button flips compareOpen; the slider DOM
        // appears in renderPreview when a source (previous batch or ref slot)
        // is available.
        container.querySelector("[data-compare-tog]")?.addEventListener("click",e=>{e.stopPropagation();compareOpen=!compareOpen;render();});
        // Ref-slot compare-source toggle (item 6): independent of compareOpen.
        // Same-slot click clears; different-slot click switches. Only one
        // ref can be the source at a time.
        container.querySelectorAll("[data-cmp-ref-tog]").forEach(b=>b.addEventListener("click",e=>{
          e.stopPropagation();
          const i = parseInt(b.dataset.cmpRefTog,10);
          cmpRefIdx = (cmpRefIdx===i) ? null : i;
          render();
        }));
        // Slider-handle drag: mousedown sets the active container; document-
        // level mousemove/up are bound once per node lifetime further down.
        container.querySelectorAll("[data-cmp-handle]").forEach(h=>h.addEventListener("mousedown",e=>{
          e.preventDefault(); e.stopPropagation();
          cmpDragging = true;
          cmpActiveContainer = h.closest(".io-cmp-item");
        }));
        // Batch navigation arrows in the info bar. Wrap-around at both ends —
        // ‹ at index 0 jumps to the last image; › at the last jumps to 0.
        const _nav = (delta) => {
          if(previewImages.length<2) return;
          const n = previewImages.length;
          currentBatchIdx = (currentBatchIdx + delta + n) % n;
          render();
        };
        container.querySelector("[data-batch-prev]")?.addEventListener("click",e=>{e.stopPropagation();_nav(-1);});
        container.querySelector("[data-batch-next]")?.addEventListener("click",e=>{e.stopPropagation();_nav(+1);});

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
          if(e.target.closest("[data-preset-drag]"))return;
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
        // ── Preset drag-to-reorder ── mirrors the LoRA pattern. The grip is
        // the only draggable element; the card is the drop target via
        // data-preset-id. Drop persists via POST /image_oasis/reorder_presets.
        container.querySelectorAll("[data-preset-drag]").forEach(grip=>{
          const card = grip.closest(".io-preset-card");
          grip.addEventListener("dragstart",e=>{
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(grip.dataset.presetDrag));
            if(e.dataTransfer.setDragImage){
              const r = card.getBoundingClientRect();
              e.dataTransfer.setDragImage(card, e.clientX - r.left, e.clientY - r.top);
            }
            setTimeout(()=>card.classList.add("io-preset-dragging"), 0);
          });
          grip.addEventListener("dragend",()=>{
            card.classList.remove("io-preset-dragging");
            container.querySelectorAll(".io-preset-drop-above,.io-preset-drop-below")
              .forEach(el=>el.classList.remove("io-preset-drop-above","io-preset-drop-below"));
          });
        });
        container.querySelectorAll("[data-preset-id]").forEach(card=>{
          card.addEventListener("dragover",e=>{
            // Only treat as a preset drop if we're carrying a preset id.
            // The dataTransfer types check lets a LoRA/ref drag pass through.
            if(!e.dataTransfer || !Array.from(e.dataTransfer.types||[]).includes("text/plain")) return;
            e.preventDefault(); e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            const r = card.getBoundingClientRect();
            const above = (e.clientY - r.top) < r.height/2;
            card.classList.toggle("io-preset-drop-above", above);
            card.classList.toggle("io-preset-drop-below", !above);
          });
          card.addEventListener("dragleave",e=>{
            if(e.relatedTarget && card.contains(e.relatedTarget)) return;
            card.classList.remove("io-preset-drop-above","io-preset-drop-below");
          });
          card.addEventListener("drop",async e=>{
            e.preventDefault(); e.stopPropagation();
            const r = card.getBoundingClientRect();
            const above = (e.clientY - r.top) < r.height/2;
            card.classList.remove("io-preset-drop-above","io-preset-drop-below");
            const fromId = e.dataTransfer.getData("text/plain");
            const targetId = card.dataset.presetId;
            if(!fromId || fromId === targetId) return;
            const from = presets.findIndex(p=>p.id===fromId);
            const targetIdx = presets.findIndex(p=>p.id===targetId);
            if(from < 0 || targetIdx < 0) return;
            let insertAt = above ? targetIdx : targetIdx + 1;
            // After splice(from,1) every index > from shifts down by 1.
            if(from < insertAt) insertAt -= 1;
            const arr = presets.slice();
            const [moved] = arr.splice(from, 1);
            arr.splice(insertAt, 0, moved);
            presets = arr;
            render();
            // Persist. Failure logs but doesn't roll back the UI — the user
            // can re-drag, and the next loadPresets() would refresh anyway.
            try{
              await fetch("/image_oasis/reorder_presets",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body: JSON.stringify({ ids: presets.map(p=>p.id) }),
              });
            }catch(err){ console.warn("[Image Oasis] reorder persist failed:", err); }
          });
        });

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
      const PRESET_EXCLUDE = ["user_prompt", "positive", "negative", "seed",
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

      // ── Output preview (render to the right pane) ──
      const imgURL = (info) => {
        const p = new URLSearchParams({filename:info.filename, subfolder:info.subfolder||"", type:info.type||"temp", t:Date.now()});
        return `${window.location.origin}/view?${p}`;
      };
      // Single source of truth for applying a new batch to the right pane.
      // Called from the module-level "image-oasis/result" listener via the
      // IO_HANDLERS map. Snapshots the prior batch as "previous" before
      // overwriting so the compare slider survives across runs / tab switches.
      const updatePanel = (imgs) => {
        if(!Array.isArray(imgs) || !imgs.length) return;
        if(previewInfo.length){
          previousInfo = previewInfo;
          previousImages = previewImages;
        }
        previewInfo = imgs;                 // keep raw {filename,subfolder,type} for save
        previewImages = imgs.map(imgURL);
        currentBatchIdx = 0;                 // new batch → start on the first image
        previewMeta = ""; previewSizeKB = 0; // recomputed on image load
        render();
      };
      // Belt-and-suspenders: Python no longer returns `{"ui": {"images": …}}`,
      // so ComfyUI's internal `executed` listener never tries to assign
      // `node.imgs`. But if anything ever sets it on this node instance, the
      // canvas paint hook is a no-op, so no image is rendered under the node.
      selfNode.onDrawBackground = function(){};
      // ── io_id lifecycle ──
      // LiteGraph calls onAdded BEFORE node.configure() → setValue. So on a
      // tab-back rebuild, onAdded runs while ioId is still "" (the saved id
      // is only restored by setValue moments later). Registration and drain
      // therefore live in registerIoHandler(), called from BOTH onAdded
      // (fresh node, no saved value → setValue never fires) and the END of
      // setValue (rebuild path — after preview state is restored, so the
      // drain's snapshot-to-previous captures the old batch for compare).
      // registeredIoId tracks the key actually in IO_HANDLERS so a re-call
      // with a different ioId (onAdded minted one, setValue restored the
      // real one) cleans up the stale registration.
      let registeredIoId = null;
      const ensureIoId = () => {
        if (!ioId) ioId = (crypto?.randomUUID?.() ?? ("io-" + Date.now() + "-" + Math.random().toString(36).slice(2)));
        return ioId;
      };
      const registerIoHandler = () => {
        ensureIoId();
        // Paste-duplicate: ComfyUI deep-copies widget state, so another LIVE
        // closure may already own this id. Mint our own instead of stealing.
        const existing = IO_HANDLERS.get(ioId);
        if (existing && existing !== updatePanel) {
          ioId = "";
          ensureIoId();
        }
        if (registeredIoId && registeredIoId !== ioId) IO_HANDLERS.delete(registeredIoId);
        IO_HANDLERS.set(ioId, updatePanel);
        registeredIoId = ioId;
        // Drain a result that landed while this closure was torn down
        // (off-tab completion during a workflow switch).
        if (IO_PENDING_RESULTS.has(ioId)) {
          const pending = IO_PENDING_RESULTS.get(ioId);
          IO_PENDING_RESULTS.delete(ioId);
          updatePanel(pending);
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
        // Kick off the initial recommendation fetch if a model is selected.
        // Done after the list arrives so the model name is locked in.
        if (llmModel) fetchRecommendedLayers();
      };

      // GET /image_oasis/llm_recommended_layers — backend reads the GGUF header,
      // triggers a targeted eviction of tracked Comfy models, measures free
      // VRAM, and returns {total, layers, all}. When Auto is on, the result
      // also becomes the GPU-layers field value used at enhance time.
      const fetchRecommendedLayers = async () => {
        if (!llmModel) { llmRecommended = null; render(); return; }
        // .safetensors models can't be loaded by the enhancer yet; skip the
        // call (backend would reject it anyway).
        if (llmModel.toLowerCase().endsWith(".safetensors")) {
          llmRecommended = null; render(); return;
        }
        llmRecommendedBusy = true; render();
        try{
          const r = await fetch("/image_oasis/llm_recommended_layers?model=" + encodeURIComponent(llmModel));
          const data = await r.json();
          if (!r.ok || data.error) {
            llmRecommended = null;
          } else {
            llmRecommended = data;
            if (llmAutoLayers) llmGpuLayers = data.layers;
          }
        } catch(e) {
          console.warn("[Image Oasis] recommended layers", e);
          llmRecommended = null;
        } finally {
          llmRecommendedBusy = false; render();
        }
      };

      const runEnhance = async () => {
        if(wandBusy) return;
        const cur = (st.user_prompt||"").trim();
        if(!cur){ console.warn("[Image Oasis] nothing to enhance — User Prompt is empty"); return; }
        if(!llmModel){ alert("Select an enhancer model (place .gguf files in models/LLM)."); return; }
        // Layers actually sent: Auto on -> recommendation (or -1 if missing);
        // Auto off -> the user's manual value. Backend coerces -1 = all.
        const layersToSend = llmAutoLayers
          ? (llmRecommended ? llmRecommended.layers : -1)
          : llmGpuLayers;
        wandBusy = true; render();
        try{
          const r = await fetch("/image_oasis/enhance",{
            method:"POST", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
              prompt: cur,
              style: llmStyle,
              model: llmModel,
              n_gpu_layers: layersToSend,
              n_ctx: llmContext,
              max_tokens: llmMaxTokens,
            }),
          });
          const data = await r.json();
          if(!r.ok || data.error){
            // Surface the backend's clear message; leave the enhanced prompt untouched.
            alert("Enhance failed: " + (data.error || ("HTTP "+r.status)));
          } else if(data.enhanced){
            // Re-clicks always overwrite the Enhanced Prompt — that's the
            // designed iteration loop. The User Prompt is the sticky source.
            st.positive = data.enhanced;
          }
        }catch(e){
          alert("Enhance failed: " + e.message);
        }finally{
          wandBusy = false; render();
        }
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
          // Stable per-node UUID for side-channel result routing (read by
          // Python from state0 top-level, used to key the "image-oasis/result"
          // WebSocket event back to the originating node). Survives workflow
          // save/reload and tab-switch closure rebuilds.
          io_id: ensureIoId(),
          uiState:{open, taHeights},
          execState:st,
          // Persist the output preview so switching tabs (which rebuilds the
          // node closure) doesn't blank it. We store the raw {filename,
          // subfolder,type} refs + known metadata, not pixels; the <img> re-
          // resolves via /view. A temp file cleared mid-session may 404, which
          // simply shows the empty state — no worse than before. prevInfo
          // carries the prior batch so the compare slider survives a reload.
          // batchIdx restores which image of the batch was being viewed.
          preview:{ info:previewInfo, prevInfo:previousInfo, sizeKB:previewSizeKB, batchIdx:currentBatchIdx },
          // Compare-feature state (item 6): toggle, slider position, and which
          // ref slot is set as the compare source (null when using "previous").
          compare:{ open:compareOpen, pct:cmpPercent, refIdx:cmpRefIdx },
          // Enhancer picks (model + style) persist across tab switches; the
          // model list itself is re-fetched on add. Settings panel state
          // (Auto + GPU layers + ctx + max_tokens + open/closed) persists too.
          wand:{
            model: llmModel, style: llmStyle,
            settings_open: llmSettingsOpen,
            auto_layers: llmAutoLayers,
            gpu_layers: llmGpuLayers,
            n_ctx: llmContext,
            max_tokens: llmMaxTokens,
          },
          // Timer state. `elapsed` restores the frozen between-runs readout;
          // `running` + `start` let a NEW closure resume the live clock after
          // a mid-generation tab switch (validated against the server queue
          // on restore, so a stale saved-mid-run blob can't resume a phantom).
          timer:{ elapsed: timerElapsedMs, running: timerRunning, start: timerStart },
        }),
        setValue:v=>{ try{
          const o=JSON.parse(v); const ex=o.execState||o; const ui=o.uiState||{};
          // Restore io_id from saved state, then (at the end of this restore,
          // below) re-register the handler under it and drain any pending
          // result. onAdded runs BEFORE setValue in LiteGraph's configure
          // sequence, so any registration onAdded made used a freshly minted
          // id — registerIoHandler cleans that up and re-keys to this one.
          if(typeof o.io_id === "string" && o.io_id) ioId = o.io_id;
          if(ex&&typeof ex==="object") st={...st,...ex};
          if(ui.open) open={...open,...ui.open};
          if(ui.taHeights) taHeights={...taHeights,...ui.taHeights};
          if(o.preview && Array.isArray(o.preview.info) && o.preview.info.length){
            previewInfo = o.preview.info;
            previewImages = previewInfo.map(imgURL);
            previewSizeKB = o.preview.sizeKB || 0;
            previewMeta = "";   // recomputed on image load
            if(typeof o.preview.batchIdx === "number"){
              currentBatchIdx = Math.min(previewImages.length-1, Math.max(0, o.preview.batchIdx|0));
            }
          }
          if(o.preview && Array.isArray(o.preview.prevInfo) && o.preview.prevInfo.length){
            previousInfo = o.preview.prevInfo;
            previousImages = previousInfo.map(imgURL);
          }
          if(o.compare){
            if("open" in o.compare) compareOpen = !!o.compare.open;
            if(typeof o.compare.pct==="number") cmpPercent = Math.min(100, Math.max(0, o.compare.pct));
            if("refIdx" in o.compare) cmpRefIdx = (o.compare.refIdx===null) ? null : (o.compare.refIdx|0);
          }
          // Timer restore — only when this closure isn't already timing (in
          // which case the live interval owns the display). A blob captured
          // mid-run resumes the clock (queue-validated, async); otherwise
          // just restore the frozen between-runs readout.
          if(o.timer && !timerRunning){
            if(o.timer.running && typeof o.timer.start==="number"){
              resumeTimerIfLive(o.timer.start, o.timer.elapsed);
            } else if(typeof o.timer.elapsed==="number"){
              timerElapsedMs = Math.max(0, o.timer.elapsed);
            }
          }
          if(o.wand){
            if(o.wand.model) llmModel=o.wand.model;
            if(o.wand.style) llmStyle=o.wand.style;
            if("settings_open" in o.wand) llmSettingsOpen=!!o.wand.settings_open;
            if("auto_layers" in o.wand) llmAutoLayers=!!o.wand.auto_layers;
            if(typeof o.wand.gpu_layers === "number") llmGpuLayers=o.wand.gpu_layers;
            if(typeof o.wand.n_ctx === "number" && o.wand.n_ctx >= 512) llmContext=o.wand.n_ctx;
            if(typeof o.wand.max_tokens === "number" && o.wand.max_tokens >= 64) llmMaxTokens=o.wand.max_tokens;
          }
          if(!_restoring){ _restoring=true; setTimeout(()=>{ _restoring=false; render(); },0); }
          // Re-key the result handler to the restored io_id and drain any
          // off-tab result. This MUST run after the preview-state restore
          // above: previewInfo now holds the pre-tab-away batch, so when the
          // drain applies the new batch, updatePanel snapshots the old one
          // into "previous" and the compare slider survives the round trip.
          registerIoHandler();
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

      // ── Suppress in-node live preview rendering (item 11) ──
      // LiteGraph normally expands a node's bottom border to draw whatever is
      // in app.nodePreviewImages[node.id] (the v3+ frontend path used by
      // b_preview events) or the legacy node.imgs array. We have our own
      // output pane on the right side, so the in-node rendering is just
      // visual noise — and on Pheeby's VHS-equipped setup it engulfs the
      // controls until a refresh. Clear both slots on every preview-related
      // event, then ask LiteGraph for a redraw so a half-drawn frame doesn't
      // linger. Cheap (a property delete and a dirty-flag set).
      const _suppressLivePreview = () => {
        if (app.nodePreviewImages) delete app.nodePreviewImages[selfNode.id];
        if (selfNode.imgs && selfNode.imgs.length) selfNode.imgs = [];
        app.graph?.setDirtyCanvas(true, false);
      };
      api.addEventListener("b_preview", _suppressLivePreview);
      api.addEventListener("progress", _suppressLivePreview);

      // Repaint this node's theme swatches when ANY node edits the global theme.
      // Only matters when our theme section is open; applyTheme() already handles
      // the actual recolor globally via :root, so this just syncs the controls.
      const _themeRedraw = () => { if(open.theme) render(); };
      IO_THEME_LISTENERS.add(_themeRedraw);

      // Help content load (item 2). Fetch once per page-load (module-cached);
      // when it arrives, ask any node whose Help section is open to re-render
      // so the "Loading…" placeholder swaps for the real content.
      const _helpReady = () => { if(open.help) render(); };
      IO_HELP_LISTENERS.add(_helpReady);
      loadHelpOnce();

      // ── Slider-handle drag listeners (item 6) ──
      // Document-level so the drag continues even when the cursor leaves the
      // handle. mousemove computes the percentage from the active container's
      // bounding rect; ALL visible sliders sync to the same pct so a batch
      // with matched-pair sliders moves together. Updates clip-path / left
      // directly on the DOM rather than re-rendering for performance.
      const _cmpMove = (e) => {
        if(!cmpDragging || !cmpActiveContainer) return;
        const rect = cmpActiveContainer.getBoundingClientRect();
        if(!rect.width) return;
        const pct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
        cmpPercent = pct;
        container.querySelectorAll("[data-cmp-handle]").forEach(el => { el.style.left = `${pct}%`; });
        container.querySelectorAll(".io-cmp-a").forEach(el => { el.style.clipPath = `inset(0 ${100-pct}% 0 0)`; });
      };
      const _cmpUp = () => {
        if(cmpDragging){
          cmpDragging = false;
          cmpActiveContainer = null;
        }
      };
      document.addEventListener("mousemove", _cmpMove);
      document.addEventListener("mouseup", _cmpUp);

      const _origAdded = selfNode.onAdded?.bind(selfNode);
      selfNode.onAdded = function(){
        if(_origAdded)_origAdded();
        // Fresh-node path: a node dragged from the menu has no saved widget
        // value, so setValue never fires and this is the only registration.
        // Rebuild path: setValue runs after this, restores the saved io_id,
        // and re-keys the registration (registerIoHandler cleans up the id
        // minted here).
        registerIoHandler();
        Promise.all([loadModels(), loadPresets(), loadLlmModels(), loadTheme(), loadNamedThemes()]).then(()=>render());
      };
      const _origRemoved = selfNode.onRemoved?.bind(selfNode);
      selfNode.onRemoved = function(){
        // Unregister the live handler so future results stash into
        // IO_PENDING_RESULTS instead of calling into this dead closure.
        // The pending entry survives a tab-switch teardown and gets drained
        // by the next closure's setValue/onAdded registration.
        if (registeredIoId) { IO_HANDLERS.delete(registeredIoId); registeredIoId = null; }
        api.removeEventListener("promptQueued", _seedHook);
        api.removeEventListener("execution_start", _timerStartEvt);
        api.removeEventListener("executing", _timerExecutingEvt);
        api.removeEventListener("execution_error", _timerEndEvt);
        api.removeEventListener("execution_interrupted", _timerEndEvt);
        api.removeEventListener("b_preview", _suppressLivePreview);
        api.removeEventListener("progress", _suppressLivePreview);
        document.removeEventListener("mousemove", _cmpMove);
        document.removeEventListener("mouseup", _cmpUp);
        IO_THEME_LISTENERS.delete(_themeRedraw);
        IO_HELP_LISTENERS.delete(_helpReady);
        if(timerInterval){ clearInterval(timerInterval); timerInterval=null; }
        if(_origRemoved)_origRemoved();
      };
    };
  },
});
