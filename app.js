/*
  RetroArch Overlay Editor - Redesigned app.js
  - Single-file client app
  - Load a .cfg and image files, visually position buttons, export ZIP with overlay.cfg and images
  - Simpler, more robust event flow and state handling
*/

// --- DOM ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const cfgInput = document.getElementById('cfgInput');
const imageFiles = document.getElementById('imageFiles');
const btnAdd = document.getElementById('btnAdd');
const btnExportZip = document.getElementById('btnExportZip');
const btnUndo = document.getElementById('btnUndo');
const btnRedo = document.getElementById('btnRedo');
const btnReset = document.getElementById('btnReset');

const overlayNameEl = document.getElementById('overlayName');
const cfgNameEl = document.getElementById('cfgName');

const selNone = document.getElementById('selNone');
const selProps = document.getElementById('selProps');
const pLabel = document.getElementById('pLabel');
const pAction = document.getElementById('pAction');
const pActionCustom = document.getElementById('pActionCustom');
const pImg = document.getElementById('pImg');
const pReplaceFile = document.getElementById('pReplaceFile');
const pX = document.getElementById('pX');
const pY = document.getElementById('pY');
const pW = document.getElementById('pW');
const pH = document.getElementById('pH');
const btnDelete = document.getElementById('btnDelete');
const btnApply = document.getElementById('btnApply');

const previewSize = document.getElementById('previewSize');
const customSizeLabel = document.getElementById('customSizeLabel');
const customW = document.getElementById('customW');
const customH = document.getElementById('customH');
const snapCheckbox = document.getElementById('snap');
const gridSizeInput = document.getElementById('gridSize');

// --- State ---
let images = {}; // filename -> { blob, img (Image) }
let buttons = []; // array of { label, filename, action, x,y,w,h } coords normalized 0..1
let selected = -1;

// simple undo/redo by deep copy snapshots
const undoStack = [];
const redoStack = [];
function snapshotPush() {
  undoStack.push(JSON.stringify({ buttons, overlayName: overlayNameEl.value }));
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify({ buttons, overlayName: overlayNameEl.value }));
  const raw = undoStack.pop();
  const parsed = JSON.parse(raw);
  buttons = parsed.buttons || [];
  overlayNameEl.value = parsed.overlayName || overlayNameEl.value;
  selected = -1;
  refreshUI();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify({ buttons, overlayName: overlayNameEl.value }));
  const raw = redoStack.pop();
  const parsed = JSON.parse(raw);
  buttons = parsed.buttons || [];
  overlayNameEl.value = parsed.overlayName || overlayNameEl.value;
  selected = -1;
  refreshUI();
}
function updateUndoButtons() {
  btnUndo.disabled = undoStack.length === 0;
  btnRedo.disabled = redoStack.length === 0;
}

// --- Canvas helpers ---
function setCanvasSize(w, h) {
  canvas.width = w;
  canvas.height = h;
  draw();
}
function parsePreviewSize(v) {
  if (v === 'custom') return { w: parseInt(customW.value,10)||1280, h: parseInt(customH.value,10)||720 };
  const [w,h] = v.split('x').map(n=>parseInt(n,10));
  return { w,h };
}
function nx(x){ return x * canvas.width; }
function ny(y){ return y * canvas.height; }
function nw(w){ return w * canvas.width; }
function nh(h){ return h * canvas.height; }

// grid + snapping
function snapToGridPixel(px, py) {
  if (!snapCheckbox.checked) return { px, py };
  const g = Math.max(4, parseInt(gridSizeInput.value,10)||16);
  return { px: Math.round(px / g) * g, py: Math.round(py / g) * g };
}

// --- Drawing & hit testing ---
function clearCanvas() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
}
function drawGrid() {
  if (!snapCheckbox.checked) return;
  const g = Math.max(4, parseInt(gridSizeInput.value,10)||16);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  for (let x=0;x<canvas.width;x+=g) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
  for (let y=0;y<canvas.height;y+=g) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
  ctx.restore();
}
function draw() {
  clearCanvas();
  drawGrid();
  // draw overlay image if available
  const overlayName = overlayNameEl.value || 'overlay.png';
  if (images[overlayName] && images[overlayName].img) {
    try { ctx.drawImage(images[overlayName].img, 0,0,canvas.width, canvas.height); } catch(e) {}
  }

  // draw buttons
  buttons.forEach((b, i) => {
    const x = nx(b.x), y = ny(b.y), w = nw(b.w), h = nh(b.h);
    ctx.save();
    if (images[b.filename] && images[b.filename].img) {
      try { ctx.drawImage(images[b.filename].img, x, y, w, h); } catch(e) {
        ctx.fillStyle = 'rgba(8,160,247,0.12)'; ctx.fillRect(x,y,w,h);
      }
    } else {
      ctx.fillStyle = 'rgba(8,160,247,0.12)'; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle = 'rgba(8,160,247,0.45)'; ctx.strokeRect(x,y,w,h);
      ctx.fillStyle = '#08a0f7'; ctx.font = '14px sans-serif'; ctx.fillText(b.label||'btn', x+6, y+18);
    }
    if (i === selected) {
      ctx.strokeStyle = '#08a0f7'; ctx.lineWidth = 2; ctx.strokeRect(x,y,w,h);
      // draw handlers
      const hs = 8;
      [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([hx,hy])=>{
        ctx.fillStyle = '#fff'; ctx.fillRect(hx-hs/2, hy-hs/2, hs, hs);
        ctx.strokeStyle = '#000'; ctx.strokeRect(hx-hs/2, hy-hs/2, hs, hs);
      });
    }
    ctx.restore();
  });
}

function hitTest(mx, my) {
  for (let i = buttons.length - 1; i >= 0; --i) {
    const b = buttons[i];
    const x = nx(b.x), y = ny(b.y), w = nw(b.w), h = nh(b.h);
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) return i;
  }
  return -1;
}

// --- Interaction (drag/resize) ---
let dragging = false;
let dragType = null; // 'move'|'resize'
let dragStart = null; // { mx,my, orig }
let resizeHandleIndex = null;

canvas.addEventListener('mousedown', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const idx = hitTest(mx, my);
  if (idx >= 0) {
    selected = idx;
    showSelectedProps();
    draw();
    const b = buttons[idx];
    const x = nx(b.x), y = ny(b.y), w = nw(b.w), h = nh(b.h);
    const handles = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
    for (let i=0;i<handles.length;i++){
      const [hx,hy] = handles[i];
      if (Math.hypot(mx-hx, my-hy) < 10) {
        dragging = true; dragType = 'resize'; resizeHandleIndex = i; dragStart = { mx, my, orig: { ...b } };
        return;
      }
    }
    dragging = true; dragType = 'move'; dragStart = { mx, my, orig: { ...b } };
    return;
  } else {
    selected = -1; hideSelectedProps(); draw();
  }
});

canvas.addEventListener('mousemove', (ev)=>{
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  let mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const dx = mx - dragStart.mx, dy = my - dragStart.my;
  const b = buttons[selected];
  if (!b) return;
  if (dragType === 'move') {
    let px = (dragStart.orig.x * canvas.width + dx);
    let py = (dragStart.orig.y * canvas.height + dy);
    if (snapCheckbox.checked) {
      const snapped = snapToGridPixel(px, py);
      px = snapped.px; py = snapped.py;
    }
    b.x = Math.max(0, Math.min(1 - b.w, px / canvas.width));
    b.y = Math.max(0, Math.min(1 - b.h, py / canvas.height));
  } else if (dragType === 'resize') {
    const ox = dragStart.orig.x * canvas.width, oy = dragStart.orig.y * canvas.height;
    const ow = dragStart.orig.w * canvas.width, oh = dragStart.orig.h * canvas.height;
    let nxw = ow, nxh = oh, nxX = ox, nxY = oy;

    if (resizeHandleIndex === 0) { nxw = (ox + ow) - mx; nxh = (oy + oh) - my; nxX = mx; nxY = my; }
    else if (resizeHandleIndex === 1) { nxw = mx - ox; nxh = (oy + oh) - my; nxX = ox; nxY = my; }
    else if (resizeHandleIndex === 2) { nxw = (ox + ow) - mx; nxh = my - oy; nxX = mx; nxY = oy; }
    else { nxw = mx - ox; nxh = my - oy; nxX = ox; nxY = oy; }

    nxw = Math.max(8, nxw); nxh = Math.max(8, nxh);
    if (snapCheckbox.checked) {
      const g = Math.max(4, parseInt(gridSizeInput.value,10)||16);
      nxw = Math.round(nxw / g) * g;
      nxh = Math.round(nxh / g) * g;
      nxX = Math.round(nxX / g) * g;
      nxY = Math.round(nxY / g) * g;
    }

    b.x = Math.max(0, Math.min(1, nxX / canvas.width));
    b.y = Math.max(0, Math.min(1, nxY / canvas.height));
    b.w = Math.max(0.02, Math.min(1, nxw / canvas.width));
    b.h = Math.max(0.02, Math.min(1, nxh / canvas.height));
  }
  updateSelectedInputsFromState();
  draw();
});

window.addEventListener('mouseup', ()=>{
  if (dragging) snapshotPush();
  dragging = false; dragType = null; resizeHandleIndex = null; dragStart = null;
});

// --- UI helpers ---
function showSelectedProps() {
  if (selected < 0 || selected >= buttons.length) { hideSelectedProps(); return; }
  selNone.hidden = true; selProps.hidden = false;
  const b = buttons[selected];
  pLabel.value = b.label || '';
  pImg.value = b.filename || '';
  pAction.value = b.action || '';
  pActionCustom.value = '';
  pX.value = (b.x||0).toFixed(3);
  pY.value = (b.y||0).toFixed(3);
  pW.value = (b.w||0.12).toFixed(3);
  pH.value = (b.h||0.12).toFixed(3);
}
function hideSelectedProps() {
  selNone.hidden = false; selProps.hidden = true;
}
function updateSelectedInputsFromState() {
  if (selected < 0) return;
  const b = buttons[selected];
  pX.value = (b.x||0).toFixed(3);
  pY.value = (b.y||0).toFixed(3);
  pW.value = (b.w||0.12).toFixed(3);
  pH.value = (b.h||0.12).toFixed(3);
  pLabel.value = b.label || '';
  pImg.value = b.filename || '';
  pAction.value = b.action || '';
}

// apply edits from the selected properties UI into state
function applySelectedEdits() {
  if (selected < 0) return;
  const b = buttons[selected];
  b.label = pLabel.value || b.label;
  b.action = pActionCustom.value.trim() || pAction.value || b.action;
  // NB: filename unchanged unless user replaced
  b.x = clamp01(parseFloat(pX.value) || 0);
  b.y = clamp01(parseFloat(pY.value) || 0);
  b.w = clamp01(parseFloat(pW.value) || 0.1, 0.01);
  b.h = clamp01(parseFloat(pH.value) || 0.1, 0.01);
  snapshotPush();
  draw();
}

function clamp01(v, min=0) { v = Number(v); if (isNaN(v)) v = min; return Math.max(min, Math.min(1, v)); }

// --- Buttons & file handling ---
btnAdd.addEventListener('click', ()=>{
  const b = { label: 'Button', filename: '', action: 'save_state', x: 0.8, y: 0.8, w: 0.12, h: 0.12 };
  buttons.push(b);
  selected = buttons.length - 1;
  snapshotPush();
  showSelectedProps();
  draw();
});

btnReset.addEventListener('click', ()=>{
  images = {}; buttons = []; selected = -1; overlayNameEl.value = 'overlay.png';
  snapshotPush();
  refreshUI();
});

// load image files
imageFiles.addEventListener('change', async (ev)=>{
  const files = Array.from(ev.target.files || []);
  for (const f of files) {
    const name = sanitizeFilename(f.name);
    const img = await loadImageFromFile(f);
    images[name] = { blob: f, img };
  }
  draw();
});

// replace single button image
pReplaceFile.addEventListener('change', async (ev)=>{
  if (selected < 0) return;
  const f = ev.target.files[0]; if (!f) return;
  const name = sanitizeFilename(f.name);
  const img = await loadImageFromFile(f);
  images[name] = { blob: f, img };
  buttons[selected].filename = name;
  pImg.value = name;
  snapshotPush();
  draw();
});

// apply/delete
btnApply.addEventListener('click', applySelectedEdits);
btnDelete.addEventListener('click', ()=>{
  if (selected < 0) return;
  buttons.splice(selected, 1);
  selected = -1;
  snapshotPush();
  hideSelectedProps();
  draw();
});

// cfg load (basic parser)
cfgInput.addEventListener('change', async (ev)=>{
  const f = ev.target.files[0]; if (!f) return;
  const txt = await f.text();
  parseCfgText(txt);
  snapshotPush();
  draw();
});

function parseCfgText(txt) {
  buttons = [];
  selected = -1;
  const lines = txt.split(/\r?\n/).map(l => l.trim());
  for (const ln of lines) {
    if (!ln) continue;
    const m = ln.match(/^overlay0_desc(\d+)\s*=\s*"(.+)"$/);
    if (m) {
      const idx = parseInt(m[1],10);
      const parts = m[2].split(',');
      const label = parts[0] || '';
      const filename = parts[1] || '';
      const action = parts[3] || '';
      const x = extractNumber(lines, `overlay0_desc${idx}_x`) || 0;
      const y = extractNumber(lines, `overlay0_desc${idx}_y`) || 0;
      const w = extractNumber(lines, `overlay0_desc${idx}_w`) || 0.12;
      const h = extractNumber(lines, `overlay0_desc${idx}_h`) || 0.12;
      buttons.push({ label, filename, action, x, y, w, h });
    }
    const m2 = ln.match(/^overlay0_overlay\s*=\s*(.+)$/);
    if (m2) {
      overlayNameEl.value = m2[1].replace(/"/g,'').trim();
    }
  }
}

// helper to get numeric value from lines
function extractNumber(lines, key) {
  for (const l of lines) {
    const re = new RegExp(`^${key}\\s*=\\s*(.+)$`);
    const m = l.match(re);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

// --- Export ZIP ---
btnExportZip.addEventListener('click', async ()=>{
  const zip = new JSZip();
  const overlayFileName = overlayNameEl.value || 'overlay.png';
  // overlay image present?
  if (images[overlayFileName] && images[overlayFileName].blob) {
    zip.file(overlayFileName, images[overlayFileName].blob);
  } else {
    // put current canvas as overlay
    const dataUrl = canvas.toDataURL('image/png');
    zip.file(overlayFileName, dataURLtoBlob(dataUrl));
  }
  // include images used by buttons (or placeholder)
  for (const b of buttons) {
    if (b.filename) {
      if (images[b.filename] && images[b.filename].blob) {
        zip.file(b.filename, images[b.filename].blob);
      } else {
        // create small placeholder
        const ph = generatePlaceholder(b.label || 'btn', 64, 64);
        zip.file(b.filename || `btn_${Math.random().toString(36).slice(2,8)}.png`, ph);
      }
    }
  }
  // add cfg
  const cfgText = generateCfgText();
  zip.file(cfgNameEl.value || 'overlay.cfg', cfgText);
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'retroarch_overlay.zip');
});

// build cfg text
function generateCfgText() {
  const overlayFileName = overlayNameEl.value || 'overlay.png';
  let s = '';
  s += `overlay0_overlay = ${overlayFileName}\n`;
  s += `overlay0_full_screen = true\n`;
  s += `overlay0_descs = ${buttons.length}\n`;
  buttons.forEach((b,i)=>{
    const label = (b.label||'').replace(/"/g,'');
    const fname = b.filename || '';
    s += `overlay0_desc${i} = "${label},${fname},RetroArch,${b.action||''}"\n`;
    s += `overlay0_desc${i}_x = ${b.x}\n`;
    s += `overlay0_desc${i}_y = ${b.y}\n`;
    s += `overlay0_desc${i}_w = ${b.w}\n`;
    s += `overlay0_desc${i}_h = ${b.h}\n`;
  });
  return s;
}

// --- utilities ---
function sanitizeFilename(name){ return name.replaceAll(/[^a-zA-Z0-9._-]/g, '_'); }
function loadImageFromFile(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new Blob([u8], { type: mime });
}
function generatePlaceholder(text,w=64,h=64) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1220'; g.fillRect(0,0,w,h);
  g.fillStyle = '#08a0f7'; g.font = '12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w/2, h/2);
  return dataURLtoBlob(c.toDataURL('image/png'));
}

// --- selection input listeners ---
pLabel.addEventListener('input', ()=>{ if (selected<0) return; buttons[selected].label = pLabel.value; draw(); });
pAction.addEventListener('change', ()=>{ if (selected<0) return; buttons[selected].action = pAction.value; draw(); });
pActionCustom.addEventListener('input', ()=>{ if (selected<0) return; });
pX.addEventListener('input', ()=>{ if (selected<0) return; buttons[selected].x = clamp01(parseFloat(pX.value)||0); draw(); });
pY.addEventListener('input', ()=>{ if (selected<0) return; buttons[selected].y = clamp01(parseFloat(pY.value)||0); draw(); });
pW.addEventListener('input', ()=>{ if (selected<0) return; buttons[selected].w = clamp01(parseFloat(pW.value)||0.1,0.01); draw(); });
pH.addEventListener('input', ()=>{ if (selected<0) return; buttons[selected].h = clamp01(parseFloat(pH.value)||0.1,0.01); draw(); });

// --- preview size controls ---
previewSize.addEventListener('change', ()=>{
  if (previewSize.value === 'custom') { customSizeLabel.hidden = false; setCanvasSize(parseInt(customW.value,10)||1280, parseInt(customH.value,10)||720); }
  else { customSizeLabel.hidden = true; const v = previewSize.value.split('x'); setCanvasSize(parseInt(v[0],10), parseInt(v[1],10)); }
});
customW.addEventListener('input', ()=> setCanvasSize(parseInt(customW.value,10)||1280, parseInt(customH.value,10)||720));
customH.addEventListener('input', ()=> setCanvasSize(parseInt(customW.value,10)||1280, parseInt(customH.value,10)||720));

// --- keyboard shortcuts ---
window.addEventListener('keydown', (e)=>{
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
  if (e.key === 'Delete') { if (selected >= 0) { buttons.splice(selected,1); selected = -1; snapshotPush(); refreshUI(); } }
});

// --- small helpers ---
function refreshUI() {
  draw();
  if (selected >= 0) showSelectedProps(); else hideSelectedProps();
  updateUndoButtons();
}
function sanitizeAndStoreImage(file) {
  const name = sanitizeFilename(file.name);
  return loadImageFromFile(file).then(img=>{
    images[name] = { blob: file, img };
    return name;
  });
}

// --- init ---
function init() {
  // set default canvas size
  const { w,h } = parsePreviewSize(previewSize.value);
  setCanvasSize(w,h);
  draw();
  updateUndoButtons();
}
init();
