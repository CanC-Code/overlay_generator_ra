// RetroArch Overlay Editor - app.js
// Full, standalone. No bundler required.

// DOM refs
const cfgInput = document.getElementById('cfgInput');
const overlayImgInput = document.getElementById('overlayImgInput');
const addBtn = document.getElementById('addBtn');
const exportZip = document.getElementById('exportZip');
const resetBtn = document.getElementById('resetBtn');
const replaceBtn = document.getElementById('replaceBtn');
const replaceImgInput = document.getElementById('replaceImgInput');
const extraImages = document.getElementById('extraImages');

const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');

// Properties pane
const noSelection = document.getElementById('noSelection');
const props = document.getElementById('props');
const propLabel = document.getElementById('propLabel');
const propAction = document.getElementById('propAction');
const propImgName = document.getElementById('propImgName');
const propX = document.getElementById('propX');
const propY = document.getElementById('propY');
const propW = document.getElementById('propW');
const propH = document.getElementById('propH');
const deleteBtn = document.getElementById('deleteBtn');

// Action list (common)
const ACTIONS = [
  'save_state', 'load_state', 'toggle_fast_forward', 'toggle_slowmotion', 'menu_toggle', 'menu_toggle', 'state_slot_0', 'state_slot_1', 'state_slot_2', 'state_slot_3'
];

// populate actions
ACTIONS.forEach(a => {
  const o = document.createElement('option'); o.value = a; o.textContent = a; propAction.appendChild(o);
});

// App state
let overlayImg = null; // Image object used as overlay background preview (optional)
let overlayFilename = 'overlay.png';
let images = {}; // filename -> {blob, img}
let buttons = []; // {label,img,action,x,y,w,h,filename}
let selectedIndex = -1;

// Canvas interaction
let dragging = false;
let dragType = null; // 'move' or 'resize'
let dragStart = null;
let resizeHandle = null;

function resetApp(){
  images = {}; buttons = []; selectedIndex = -1; overlayImg = null; overlayFilename = 'overlay.png';
  ctx.clearRect(0,0,canvas.width,canvas.height); draw(); updateProps();
}

resetBtn.addEventListener('click', resetApp);

// Helpers: normalized coords -> pixel
function nx(x){return x * canvas.width}
function ny(y){return y * canvas.height}
function nw(w){return w * canvas.width}
function nh(h){return h * canvas.height}

// Draw loop
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // transparent checker already in CSS; still clear to transparent
  ctx.save();
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // draw overlay image if provided
  if (overlayImg) ctx.drawImage(overlayImg,0,0,canvas.width,canvas.height);

  // draw buttons
  buttons.forEach((b,i)=>{
    const x = nx(b.x), y = ny(b.y), w = nw(b.w), h = nh(b.h);
    ctx.save();
    ctx.globalAlpha = (i === selectedIndex ? 1 : 0.95);
    if (b.filename && images[b.filename] && images[b.filename].img) {
      const img = images[b.filename].img;
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.fillStyle = 'rgba(8,160,247,0.15)'; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle = 'rgba(8,160,247,0.45)'; ctx.strokeRect(x,y,w,h);
      ctx.fillStyle = '#08a0f7'; ctx.font = '14px sans-serif'; ctx.fillText(b.label||'btn', x+6, y+18);
    }
    // selection outline
    if (i === selectedIndex) {
      ctx.strokeStyle = '#08a0f7'; ctx.lineWidth = 2; ctx.strokeRect(x,y,w,h);
      // handles
      const hs = 8; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
      [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].forEach(([hx,hy])=>{ctx.fillRect(hx-hs/2,hy-hs/2,hs,hs); ctx.strokeRect(hx-hs/2,hy-hs/2,hs,hs)});
    }
    ctx.restore();
  });

  ctx.restore();
}

// hit testing
function hitTest(mx,my){
  for (let i = buttons.length-1; i>=0; --i){
    const b = buttons[i];
    const x = nx(b.x), y = ny(b.y), w = nw(b.w), h = nh(b.h);
    if (mx >= x && mx <= x+w && my >= y && my <= y+h) return i;
  }
  return -1;
}

canvas.addEventListener('mousedown', (ev)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const idx = hitTest(mx,my);
  if (idx >= 0){
    selectedIndex = idx; updateProps(); draw();
    // check if near handle for resize
    const b = buttons[idx];
    const x = nx(b.x), y = ny(b.y), w = nw(b.w), h = nh(b.h);
    const handles = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
    for (let i=0;i<handles.length;i++){
      const [hx,hy] = handles[i];
      if (Math.hypot(mx-hx, my-hy) < 10) {dragging=true; dragType='resize'; resizeHandle=i; dragStart={mx,my,orig: {...b}}; return}
    }
    dragging=true; dragType='move'; dragStart={mx,my,orig:{...b}};
  } else {
    selectedIndex = -1; updateProps(); draw();
  }
});

canvas.addEventListener('mousemove',(ev)=>{
  if (!dragging) return;
  const rect = canvas.getBoundingClientRect();
  const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
  const dx = mx - dragStart.mx, dy = my - dragStart.my;
  const b = buttons[selectedIndex];
  if (!b) return;
  if (dragType === 'move'){
    const nxv = (dragStart.orig.x * canvas.width + dx) / canvas.width;
    const nyv = (dragStart.orig.y * canvas.height + dy) / canvas.height;
    b.x = Math.max(0, Math.min(1 - b.w, nxv));
    b.y = Math.max(0, Math.min(1 - b.h, nyv));
  } else if (dragType === 'resize'){
    // handle corners
    const ox = dragStart.orig.x * canvas.width, oy = dragStart.orig.y * canvas.height;
    const ow = dragStart.orig.w * canvas.width, oh = dragStart.orig.h * canvas.height;
    let nxw = ow, nxh = oh, nxX = ox, nxY = oy;
    if (resizeHandle === 0) { // top-left
      nxw = (ox + ow) - mx; nxh = (oy + oh) - my; nxX = mx; nxY = my;
    } else if (resizeHandle === 1) { // top-right
      nxw = mx - ox; nxh = (oy + oh) - my; nxX = ox; nxY = my;
    } else if (resizeHandle === 2) { // bottom-left
      nxw = (ox + ow) - mx; nxh = my - oy; nxX = mx; nxY = oy;
    } else { // bottom-right
      nxw = mx - ox; nxh = my - oy; nxX = ox; nxY = oy;
    }
    nxw = Math.max(8, nxw); nxh = Math.max(8, nxh);
    b.x = Math.max(0, Math.min(1, nxX / canvas.width));
    b.y = Math.max(0, Math.min(1, nxY / canvas.height));
    b.w = Math.max(0.02, Math.min(1, nxw / canvas.width));
    b.h = Math.max(0.02, Math.min(1, nxh / canvas.height));
  }
  updatePropsFromState(); draw();
});

window.addEventListener('mouseup', ()=>{dragging=false; dragType=null; resizeHandle=null; dragStart=null});

// Add button
addBtn.addEventListener('click', ()=>{
  const b = {label:'Button', filename:'', action:'save_state', x:0.8, y:0.8, w:0.12, h:0.12};
  buttons.push(b); selectedIndex = buttons.length-1; updateProps(); draw();
});

// Replace selected image via file input
replaceImgInput.addEventListener('change', async (ev)=>{
  if (selectedIndex < 0) return alert('Select a button first');
  const f = ev.target.files[0]; if (!f) return;
  const name = sanitizeFilename(f.name);
  images[name] = {blob: f, img: await loadImageFromFile(f)};
  buttons[selectedIndex].filename = name; propImgName.value = name; draw();
});

replaceBtn.addEventListener('click', ()=>{ replaceImgInput.click(); });

extraImages.addEventListener('change', async (ev)=>{
  const files = Array.from(ev.target.files);
  for (const f of files){ const name = sanitizeFilename(f.name); images[name] = {blob:f, img: await loadImageFromFile(f)} }
});

// delete
deleteBtn.addEventListener('click', ()=>{
  if (selectedIndex<0) return; buttons.splice(selectedIndex,1); selectedIndex=-1; updateProps(); draw();
});

// prop inputs -> state
[propLabel, propAction, propX, propY, propW, propH].forEach(el => el.addEventListener('input', ()=>{
  if (selectedIndex<0) return; const b = buttons[selectedIndex];
  b.label = propLabel.value; b.action = propAction.value; b.x = parseFloat(propX.value)||0; b.y = parseFloat(propY.value)||0; b.w = parseFloat(propW.value)||0.1; b.h = parseFloat(propH.value)||0.1; draw();
}));

function updateProps(){
  if (selectedIndex<0){ noSelection.style.display='block'; props.style.display='none'; return }
  noSelection.style.display='none'; props.style.display='block';
  const b = buttons[selectedIndex]; propLabel.value = b.label||''; propAction.value = b.action||''; propImgName.value = b.filename||'';
  propX.value = (b.x||0).toFixed(3); propY.value = (b.y||0).toFixed(3); propW.value = (b.w||0.1).toFixed(3); propH.value = (b.h||0.1).toFixed(3);
}
function updatePropsFromState(){ if (selectedIndex>=0) updateProps(); }

// load overlay image
overlayImgInput.addEventListener('change', async (ev)=>{
  const f = ev.target.files[0]; if (!f) return;
  overlayImg = await loadImageFromFile(f); images[overlayFilename] = {blob: f, img: overlayImg}; draw();
});

// load cfg
cfgInput.addEventListener('change', async (ev)=>{
  const f = ev.target.files[0]; if (!f) return; const txt = await f.text(); loadCfgText(txt);
});

function loadCfgText(txt){
  // Very small robust parser for overlay0_desc lines
  buttons = []; selectedIndex=-1;
  const lines = txt.split(/\r?\n/).map(l=>l.trim());
  let inOverlay0 = false;
  for (const ln of lines){
    if (!ln) continue;
    // overlay0_descN = "label,filename,target,action"
    const m = ln.match(/^overlay0_desc(\d+)\s*=\s*"(.+)"$/);
    if (m){
      const idx = parseInt(m[1],10); const parts = m[2].split(',');
      const label = parts[0]||''; const filename = parts[1]||''; const action = parts[3]||''; // parts[2] typically "RetroArch"
      // read x,y,w,h
      const x = extractNumber(lines, `overlay0_desc${idx}_x`) || 0; const y = extractNumber(lines, `overlay0_desc${idx}_y`) || 0;
      const w = extractNumber(lines, `overlay0_desc${idx}_w`) || 0.12; const h = extractNumber(lines, `overlay0_desc${idx}_h`) || 0.12;
      buttons.push({label, filename, action, x, y, w, h});
    }
    // overlay image filename
    const m2 = ln.match(/^overlay0_overlay\s*=\s*(.+)$/);
    if (m2){ overlayFilename = m2[1].replace(/"/g,'').trim(); }
  }
  draw(); updateProps();
}

function extractNumber(lines, key){
  for (const l of lines){
    const m = l.match(new RegExp(`^${key}\\s*=\\s*(.+)$`));
    if (m) return parseFloat(m[1]);
  }
  return null;
}

// utils
function sanitizeFilename(name){ return name.replaceAll(/[^a-zA-Z0-9._-]/g, '_'); }
function loadImageFromFile(f){ return new Promise((res,rej)=>{ const img = new Image(); img.onload=()=>res(img); img.onerror=rej; img.src = URL.createObjectURL(f); }); }

// Export ZIP
exportZip.addEventListener('click', async ()=>{
  const zip = new JSZip();
  // overlay image: if images has overlayFilename use it; otherwise create blank transparent PNG from canvas
  if (images[overlayFilename] && images[overlayFilename].blob){ zip.file(overlayFilename, images[overlayFilename].blob); }
  else {
    // create blank PNG from current canvas size (transparent)
    const b64 = canvas.toDataURL('image/png'); const blob = dataURLtoBlob(b64);
    zip.file(overlayFilename, blob);
  }

  // add images used by buttons
  for (const b of buttons){ if (b.filename){ if (images[b.filename] && images[b.filename].blob) zip.file(b.filename, images[b.filename].blob); else {
      // if filename missing blob, create a simple placeholder image as blob
      const ph = generatePlaceholder(b.label||'btn', Math.round(128*b.w*canvas.width), Math.round(128*b.h*canvas.height));
      zip.file(b.filename || (`btn_${Math.random().toString(36).slice(2,8)}.png`), ph);
    } } }

  // generate cfg
  const cfg = generateCfg(); zip.file('overlay.cfg', cfg);

  const content = await zip.generateAsync({type:'blob'});
  saveAs(content, 'retroarch_overlay_export.zip');
});

function generateCfg(){
  let s = '';
  s += `overlay0_overlay = ${overlayFilename}\n`;
  s += `overlay0_full_screen = true\n`;
  s += `overlay0_descs = ${buttons.length}\n`;
  buttons.forEach((b,i)=>{
    const label = (b.label||'').replace(/"/g,''); const fname = b.filename || '';
    s += `overlay0_desc${i} = "${label},${fname},RetroArch,${b.action||''}"\n`;
    s += `overlay0_desc${i}_x = ${b.x}\n`;
    s += `overlay0_desc${i}_y = ${b.y}\n`;
    s += `overlay0_desc${i}_w = ${b.w}\n`;
    s += `overlay0_desc${i}_h = ${b.h}\n`;
  });
  return s;
}

function dataURLtoBlob(dataurl) {
  const arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1], bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  for (let i=0;i<n;i++) u8arr[i] = bstr.charCodeAt(i);
  return new Blob([u8arr], {type:mime});
}

// generate placeholder small image blob
function generatePlaceholder(text,w=96,h=96){
  const c = document.createElement('canvas'); c.width = Math.max(32,w); c.height = Math.max(32,h); const g = c.getContext('2d');
  g.fillStyle = '#0b1220'; g.fillRect(0,0,c.width,c.height);
  g.fillStyle = '#08a0f7'; g.font = '14px sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(text, c.width/2, c.height/2);
  return dataURLtoBlob(c.toDataURL('image/png'));
}

// helper to preload images if user drags separate image files named in cfg
// user can drag them into "extra images" input; the UI stores them in `images` map

// initial draw
draw();
