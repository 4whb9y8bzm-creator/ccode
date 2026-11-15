const $ = (id) => document.getElementById(id);
const profiles = {a1mini:{name:'Bambu Lab A1 mini',w:180,h:180},a1:{name:'Bambu Lab A1',w:256,h:256},p1:{name:'Bambu Lab P1P / P1S',w:256,h:256},x1:{name:'Bambu Lab X1 Carbon',w:256,h:256}};
const palette = [
  {name:'Black',hex:'#171717',rgb:[23,23,23]},
  {name:'Red',hex:'#ed5146',rgb:[237,81,70]},
  {name:'Orange',hex:'#f5a13b',rgb:[245,161,59]},
  {name:'Yellow',hex:'#f1d64a',rgb:[241,214,74]},
  {name:'Green',hex:'#61a86c',rgb:[97,168,108]},
  {name:'Blue',hex:'#5386d8',rgb:[83,134,216]},
  {name:'Purple',hex:'#9c6ac7',rgb:[156,106,199]},
  {name:'White',hex:'#f5f2e9',rgb:[245,242,233]}
];
let mode='text', colorMode=false, gridOn=true, artwork=null, sourceCanvas=document.createElement('canvas'), strokes=[], layerStrokes=[], toastTimer, generatedCode='';
if(window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function profile(){return profiles[$('printerSelect').value]}
function clamp(v,min,max){return Math.max(min,Math.min(max,Number(v)||0))}
function say(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2800)}
function currentSize(){return {w:clamp($('widthInput').value,10,profile().w),h:clamp($('heightInput').value,10,profile().h)}}
function isPencil(){return $('drawingTool') && $('drawingTool').value === 'pencil'}
function updateToolHint(){
  const pencil = isPencil();
  const hint = $('toolHint');
  if (hint) {
    hint.textContent = pencil ? 'Pencil mode adds denser hatch-like shading to mimic graphite. Best for sketches and grayscale images.' : 'Pen mode keeps clean single-stroke outlines and more efficient travel paths.';
  }
}
function optimizePaths(paths){
  const list = paths || [];
  if (!$('fastRoute') || !$('fastRoute').checked || list.length < 2) return list;
  const remaining = list.map((p,i)=>({id:i,p}));
  const out = [];
  let cx = list[0].x1;
  let cy = list[0].y1;
  while (remaining.length) {
    let best = null, bestDist = Infinity;
    for (const item of remaining) {
      const da = Math.hypot(item.p.x1-cx, item.p.y1-cy);
      const db = Math.hypot(item.p.x2-cx, item.p.y2-cy);
      if (da < bestDist) { best = {item, reverse:false}; bestDist = da; }
      if (db < bestDist) { best = {item, reverse:true}; bestDist = db; }
    }
    if (!best) break;
    const chosen = best.item.p;
    const ordered = best.reverse ? {x1:chosen.x2,y1:chosen.y2,x2:chosen.x1,y2:chosen.y1,color:chosen.color} : {...chosen};
    out.push(ordered);
    cx = ordered.x2;
    cy = ordered.y2;
    const idx = remaining.findIndex(r => r.id === best.item.id);
    if (idx >= 0) remaining.splice(idx,1);
  }
  return out;
}
function addSegment(list, color, x1, y1, x2, y2){
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return;
  list.push({x1:Number(x1),y1:Number(y1),x2:Number(x2),y2:Number(y2),color});
}

function renderText(){
  const text=$('textInput').value.slice(0,120); $('textInput').value=text; $('charCount').textContent=`${text.length} / 120`;
  const c=sourceCanvas, ctx=c.getContext('2d'); c.width=1200; c.height=520; ctx.clearRect(0,0,c.width,c.height); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  const size=Number($('fontSize').value)*3; const weight=$('boldToggle').checked?'700':'400'; const font=$('fontSelect').value; ctx.fillStyle='#111'; ctx.textBaseline='middle'; ctx.font=`${weight} ${size}px "${font}"`;
  const lines=text.split('\n'); let fitted=size; for(const line of lines){ while(ctx.measureText(line).width>1100 && fitted>18){ fitted-=2; ctx.font=`${weight} ${fitted}px "${font}"`; } }
  const lineH=fitted*1.25; const startY=(c.height-lines.length*lineH)/2 + fitted*0.55; lines.forEach((line,i)=>ctx.fillText(line,50,startY+i*lineH));
  $('fontSizeOut').textContent=$('fontSize').value; artwork={type:'text',name:'text'}; generate();
}

function setMode(next){
  mode=next;
  document.querySelectorAll('.mode-tab').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-selected',on)});
  $('textPanel').classList.toggle('hidden', mode !== 'text');
  $('filePanel').classList.toggle('hidden', mode === 'text');
  $('fontControls').classList.toggle('hidden', mode !== 'text');
  $('thresholdRow').classList.toggle('hidden', mode === 'text');
  $('invertToggle').parentElement.classList.toggle('hidden', mode === 'text');
  $('editorLabel').textContent = mode === 'text' ? 'TEXT COMPOSER' : mode === 'pdf' ? 'PDF IMPORT' : 'IMAGE IMPORT';
  $('uploadTitle').textContent = mode === 'pdf' ? 'Drop a PDF here' : 'Drop an image here';
  $('uploadHelp').textContent = mode === 'pdf' ? 'PDF · first page is converted' : 'PNG, JPG, WEBP · or browse files';
  $('fileInput').accept = mode === 'pdf' ? '.pdf,application/pdf' : 'image/png,image/jpeg,image/webp';
  $('fileInput').value = '';
  $('fileInfo').classList.add('hidden');
  if(mode !== 'text'){ artwork=null; strokes=[]; layerStrokes=[]; drawPreview(); updateEstimate(); }
  else renderText();
}

function loadImage(file){
  if(!file) return;
  const url=URL.createObjectURL(file), img=new Image();
  img.onload=()=>{
    sourceCanvas.width=img.naturalWidth; sourceCanvas.height=img.naturalHeight;
    const ctx=sourceCanvas.getContext('2d');
    ctx.clearRect(0,0,sourceCanvas.width,sourceCanvas.height);
    ctx.drawImage(img,0,0);
    artwork={type:'image',name:file.name};
    $('fileName').textContent=file.name; $('fileInfo').classList.remove('hidden');
    generate();
    say('Image imported.');
    URL.revokeObjectURL(url);
  };
  img.onerror=()=>{URL.revokeObjectURL(url); say('Could not read that image.');};
  img.src=url;
}

async function loadPdf(file){
  if(!window.pdfjsLib){ say('PDF reader did not load. Check your internet connection.'); return; }
  try {
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:bytes}).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({scale:2});
    sourceCanvas.width = vp.width; sourceCanvas.height = vp.height;
    const ctx = sourceCanvas.getContext('2d');
    ctx.clearRect(0,0,sourceCanvas.width,sourceCanvas.height);
    await page.render({canvasContext:ctx, viewport:vp}).promise;
    artwork={type:'pdf',name:file.name};
    $('fileName').textContent=`${file.name} · page 1`;
    $('fileInfo').classList.remove('hidden');
    generate();
    say('First PDF page imported.');
  } catch (err) {
    say('Could not read this PDF.');
  }
}

function onFile(file){
  if(!file) return;
  if(mode === 'pdf') {
    if(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) loadPdf(file);
    else say('Choose a PDF file.');
    return;
  }
  if(file.type.startsWith('image/')) loadImage(file); else say('Choose a PNG, JPG, or WEBP image.');
}

function nearestColor(r,g,b){
  let best=palette[0], dist=Infinity;
  for(const c of palette){ const d=(r-c.rgb[0])**2+(g-c.rgb[1])**2+(b-c.rgb[2])**2; if(d<dist){dist=d; best=c;} }
  return best;
}

function generate(){
  if(!artwork){ strokes=[]; layerStrokes=[]; drawPreview(); updateEstimate(); return; }
  const {w,h}=currentSize();
  const density=Number($('densityInput').value);
  const threshold=Number($('thresholdInput').value);
  const invert=$('invertToggle').checked;
  const pencil=isPencil();
  const densityScale = pencil ? Math.max(0.25, density * 0.72) : density;
  const ctx = sourceCanvas.getContext('2d', {willReadFrequently:true});
  const img = ctx.getImageData(0,0,sourceCanvas.width,sourceCanvas.height);
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;
  const stepX = Math.max(1, Math.round((sw * densityScale) / w));
  const stepY = Math.max(1, Math.round((sh * densityScale) / h));
  const x0 = clamp($('xInput').value,0,profile().w-w);
  const y0 = clamp($('yInput').value,0,profile().h-h);
  const total = [];
  const layers = new Map();

  function capture(color, x1, y1, x2, y2){
    const seg = {x1:x0 + (x1/sw)*w, y1:y0 + (1-y1/sh)*h, x2:x0 + (x2/sw)*w, y2:y0 + (1-y2/sh)*h, color};
    if (Math.hypot(seg.x2-seg.x1, seg.y2-seg.y1) > densityScale * 0.55) {
      total.push(seg);
      if (!layers.has(color.name)) layers.set(color.name, []);
      layers.get(color.name).push(seg);
    }
  }

  for(let py=0; py<sh; py += stepY){
    for(let px=0; px<sw; px += stepX){
      const i=(py*sw+px)*4; const r=img.data[i], g=img.data[i+1], b=img.data[i+2], a=img.data[i+3];
      let active=false, color=null;
      if(a > 30){
        if(colorMode){
          color = nearestColor(r,g,b);
          active = color.name !== 'White';
        } else {
          const lum = 0.299*r + 0.587*g + 0.114*b;
          color = {name:'Black',hex:'#171717',rgb:[23,23,23]};
          active = invert ? lum > threshold : lum < threshold;
        }
      }
      if(!active || !color) continue;
      const cx = px + stepX * 0.5;
      const cy = py + stepY * 0.5;
      const x1 = cx - stepX * 0.3;
      const x2 = cx + stepX * 0.3;
      const y1 = cy - stepY * 0.3;
      const y2 = cy + stepY * 0.3;
      if(pencil){
        const d = Math.max(0.2, 1 - (Math.min(255, (r+g+b)/3) / 255));
        const hatch = Math.max(stepX * 0.25, densityScale * 0.9 * (0.8 + d));
        capture(color, x1, y1, x2, y2);
        capture(color, x1 - hatch, y1 + hatch, x2 + hatch, y2 - hatch);
        capture(color, x1 + hatch, y1 - hatch, x2 - hatch, y2 + hatch);
      } else {
        capture(color, x1, y1, x2, y2);
      }
    }
  }

  strokes = optimizePaths(total);
  layerStrokes = [...layers.entries()].map(([name,paths]) => ({name, color: palette.find(c=>c.name===name)?.hex || '#171717', paths: optimizePaths(paths)}));
  if(colorMode && !layerStrokes.length){ layerStrokes = [{name:'Black',color:'#171717',paths: optimizePaths(strokes)}]; }
  drawPreview();
  updateEstimate();
  generatedCode='';
}

function drawPreview(){
  const canvas=$('previewCanvas'); const rect=canvas.getBoundingClientRect(); if(!rect.width || !rect.height) return;
  const dpr=window.devicePixelRatio||1; canvas.width=Math.floor(rect.width*dpr); canvas.height=Math.floor(rect.height*dpr); const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  const cw=rect.width, ch=rect.height, p=profile(); const margin=22; const scale=Math.min((cw-margin*2)/p.w,(ch-margin*2)/p.h); const plateW=p.w*scale, plateH=p.h*scale; const left=(cw-plateW)/2, top=(ch-plateH)/2;
  ctx.clearRect(0,0,cw,ch); ctx.fillStyle='#202126'; ctx.fillRect(0,0,cw,ch); ctx.strokeStyle='#55575f'; ctx.lineWidth=1; ctx.strokeRect(left,top,plateW,plateH);
  if(gridOn){ ctx.strokeStyle='rgba(255,255,255,0.08)'; for(let x=0; x<=p.w; x+=10){ const px = left + x * scale; ctx.beginPath(); ctx.moveTo(px,top); ctx.lineTo(px,top+plateH); ctx.stroke(); } for(let y=0; y<=p.h; y+=10){ const py = top + y * scale; ctx.beginPath(); ctx.moveTo(left,py); ctx.lineTo(left+plateW,py); ctx.stroke(); } }
  const size=currentSize(); const x0=clamp($('xInput').value,0,p.w-size.w), y0=clamp($('yInput').value,0,p.h-size.h);
  ctx.strokeStyle='#c8f169'; ctx.setLineDash([4,4]); ctx.strokeRect(left + x0*scale, top + (p.h-(y0+size.h))*scale, size.w*scale, size.h*scale); ctx.setLineDash([]);
  const paths = colorMode ? layerStrokes.flatMap(layer => layer.paths.map(p => ({...p,color: layer.name}))) : strokes;
  for(const s of paths){
    ctx.beginPath(); ctx.strokeStyle = colorMode ? (palette.find(c=>c.name===s.color)?.hex || '#c8f169') : '#c8f169';
    ctx.moveTo(left + s.x1*scale, top + (p.h - s.y1)*scale);
    ctx.lineTo(left + s.x2*scale, top + (p.h - s.y2)*scale);
    ctx.stroke();
  }
  $('emptyPreview').classList.toggle('hidden', paths.length > 0);
  $('canvasSizeLabel').textContent = `${p.w} × ${p.h} mm BED`;
  $('previewDimensions').textContent = `${p.w} × ${p.h} mm`;
}

function updateEstimate(){
  const feed=Math.max(100, Number($('drawFeed').value) || 900), travel=Math.max(300, Number($('travelFeed').value) || 2400);
  const paths = colorMode ? layerStrokes.flatMap(layer => layer.paths) : strokes;
  if(!paths.length){ $('timeEstimate').innerHTML='— <small>min</small>'; $('distanceEstimate').textContent='— mm'; $('pathSummary').textContent='Add artwork to estimate'; $('meterFill').style.width='0%'; return; }
  let totalDistance=0; for(const s of paths) totalDistance += Math.hypot(s.x2-s.x1, s.y2-s.y1);
  const timeMinutes = totalDistance/feed + (paths.length*0.5)/travel;
  $('timeEstimate').innerHTML = timeMinutes < 1 ? `${Math.max(1,Math.round(timeMinutes*60))} <small>sec</small>` : `${Math.max(1,Math.round(timeMinutes))} <small>min</small>`;
  $('distanceEstimate').textContent = `${Math.round(totalDistance)} mm`;
  $('pathSummary').textContent = `${paths.length.toLocaleString()} pen strokes${colorMode ? ` · ${layerStrokes.length} colors` : ''}`;
  $('meterFill').style.width = `${Math.min(100,Math.max(10,timeMinutes*3))}%`;
}

function makeHeader(){
  const p=profile();
  return ['; Lineform drawing toolpath', `; Printer profile: ${p.name} (${p.w} x ${p.h} mm build plate)`, '; Review and test before use.', 'G21 ; millimeters', 'G90 ; absolute positioning', `G0 Z${Number($('travelZ').value)||5} F${Number($('travelFeed').value)||2400}`].join('\n');
}

function pathGcode(paths){
  const dz=(Number($('drawZ').value)||0)+(Number($('calibrationZ').value)||0); const tz=Number($('travelZ').value)||5; const df=Number($('drawFeed').value)||900; const tf=Number($('travelFeed').value)||2400;
  const out=[]; let last=null;
  for(const s of paths){
    if(last && Math.hypot(s.x1-last.x2, s.y1-last.y2) < 0.3){
      out.push(`G1 X${s.x1.toFixed(2)} Y${s.y1.toFixed(2)} F${df}`);
    } else {
      out.push(`G0 Z${tz} F${tf}`, `G0 X${s.x1.toFixed(2)} Y${s.y1.toFixed(2)} F${tf}`, `G1 Z${dz.toFixed(2)} F${Math.min(df,500)}`);
    }
    out.push(`G1 X${s.x2.toFixed(2)} Y${s.y2.toFixed(2)} F${df}`);
    last=s;
  }
  return out.join('\n');
}

function combinedGcode(){
  const out=[makeHeader()];
  if(colorMode && layerStrokes.length){
    layerStrokes.forEach((layer,i)=>{
      out.push(`\n; COLOR ${i+1}/${layerStrokes.length}: ${layer.name}`);
      out.push(pathGcode(layer.paths));
      if(i < layerStrokes.length-1){
        out.push(`\n; Change color to ${layerStrokes[i+1].name} and press resume`);
        out.push($('pauseCommand').value || 'M400 U1');
      }
    });
  } else {
    out.push('\n; MONOCHROME DRAWING');
    out.push(pathGcode(strokes));
  }
  out.push(`\nG0 Z${Number($('travelZ').value)||5} F${Number($('travelFeed').value)||2400}`);
  out.push('; End of drawing');
  return out.join('\n');
}

function download(name,content){
  const blob=new Blob([content],{type:'text/plain;charset=utf-8'}), url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function slug(s){ return (s||'drawing').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'drawing'; }

function generateAndSave(){
  if(!artwork){ say('Add some text or artwork first.'); return; }
  generate();
  if(!(strokes.length || (colorMode && layerStrokes.length))){ say('No path data was generated. Adjust the settings and try again.'); return; }
  generatedCode = combinedGcode();
  $('downloadBtn').disabled = false; $('downloadBtn').style.opacity='1';
  say('G-code generated. Click download when ready.');
}

function downloadMain(){
  if(!generatedCode){ generateAndSave(); return; }
  const base = slug(artwork?.name?.replace(/\.[^.]+$/,'') || 'drawing');
  download(`${base}-${colorMode ? 'color' : 'drawing'}.gcode`, generatedCode);
  say('G-code downloaded.');
}

function downloadColors(){
  if(!layerStrokes.length){ say('No color paths to download.'); return; }
  layerStrokes.forEach((layer,i)=>{
    const code = [makeHeader(), `; Single color: ${layer.name}`, pathGcode(layer.paths), `G0 Z${Number($('travelZ').value)||5}`].join('\n');
    const name = `${slug(artwork?.name?.replace(/\.[^.]+$/,'') || 'drawing')}-${slug(layer.name)}.gcode`;
    setTimeout(()=>download(name, code), i * 250);
  });
  say(`Downloading ${layerStrokes.length} separate color files.`);
}

function fit(){
  if(!artwork) return;
  const s=currentSize();
  $('widthInput').value = Math.min(s.w, profile().w * 0.7).toFixed(0);
  $('heightInput').value = Math.min(s.h, profile().h * 0.7).toFixed(0);
  $('xInput').value = ((profile().w - Number($('widthInput').value)) / 2).toFixed(0);
  $('yInput').value = ((profile().h - Number($('heightInput').value)) / 2).toFixed(0);
  generate();
}

function init(){
  document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', ()=> setMode(b.dataset.mode)));
  $('textInput').addEventListener('input', renderText);
  ['fontSelect','fontSize','boldToggle'].forEach(id => $(id).addEventListener('input', renderText));
  $('printerSelect').addEventListener('change', () => {
    const p=profile(); const s=currentSize();
    $('widthInput').max = p.w; $('heightInput').max = p.h; $('xInput').max = p.w; $('yInput').max = p.h;
    $('widthInput').value = Math.min(s.w, p.w); $('heightInput').value = Math.min(s.h, p.h);
    $('xInput').value = clamp($('xInput').value,0,p.w-Number($('widthInput').value));
    $('yInput').value = clamp($('yInput').value,0,p.h-Number($('heightInput').value));
    generate();
  });
  ['widthInput','heightInput','xInput','yInput','densityInput','thresholdInput','invertToggle','drawFeed','travelFeed','travelZ','drawZ','pauseCommand'].forEach(id => {
    $(id).addEventListener('input', () => {
      if(id==='densityInput') $('densityOut').textContent = Number($(id).value).toFixed(2);
      if(id==='thresholdInput') $('thresholdOut').textContent = $(id).value;
      generate();
    });
  });
  $('monoBtn').onclick = () => { colorMode = false; $('monoBtn').classList.add('active'); $('colorBtn').classList.remove('active'); $('colorHint').textContent = 'Single-color line drawing · one G-code file'; generate(); };
  $('colorBtn').onclick = () => { colorMode = true; $('colorBtn').classList.add('active'); $('monoBtn').classList.remove('active'); $('colorHint').textContent = 'Color-separated paths · pause between colors'; generate(); };
  $('browseBtn').onclick = () => $('fileInput').click();
  $('fileInput').onchange = (e) => onFile(e.target.files[0]);
  $('dropZone').addEventListener('dragover', e => { e.preventDefault(); $('dropZone').classList.add('dragover'); });
  $('dropZone').addEventListener('dragleave', () => $('dropZone').classList.remove('dragover'));
  $('dropZone').addEventListener('drop', e => { e.preventDefault(); $('dropZone').classList.remove('dragover'); onFile(e.dataTransfer.files[0]); });
  $('removeFile').onclick = () => { artwork=null; strokes=[]; layerStrokes=[]; generatedCode=''; $('fileInfo').classList.add('hidden'); drawPreview(); updateEstimate(); };
  $('centerBtn').onclick = () => { const s=currentSize(); $('xInput').value = Math.round((profile().w - s.w)/2); $('yInput').value = Math.round((profile().h - s.h)/2); generate(); };
  $('fitBtn').onclick = fit;
  $('gridBtn').onclick = () => { gridOn = !gridOn; $('gridBtn').classList.toggle('selected', gridOn); drawPreview(); };
  $('generateBtn').onclick = generateAndSave;
  $('downloadBtn').onclick = downloadMain;
  $('colorDownloadBtn').onclick = downloadColors;
  $('shareBtn').onclick = async () => {
    try {
      if(navigator.share){ await navigator.share({title:'Lineform drawing', text:'I made a drawing toolpath with Lineform.', url: location.href}); }
      else if(navigator.clipboard){ await navigator.clipboard.writeText(location.href); say('Project link copied.'); }
      else { say('Sharing is not available in this browser.'); }
    } catch (e) { if(e.name !== 'AbortError') say('Could not share this link.'); }
  };
  $('calibrateBtn').onclick = () => $('calibrationDialog').showModal();
  $('cancelCalibration').onclick = () => $('calibrationDialog').close();
  $('saveCalibration').onclick = () => { $('drawZ').value = $('calibrationZ').value; $('calibrationDialog').close(); generate(); say('Manual Z offset saved. Verify printer clearance before drawing.'); };
  $('drawingTool').addEventListener('change', () => { updateToolHint(); if(artwork) generate(); });
  $('fastRoute').addEventListener('change', () => { if(artwork) generate(); });
  window.addEventListener('resize', drawPreview);
  $('downloadBtn').disabled = true; $('downloadBtn').style.opacity = '0.65';
  updateToolHint();
  renderText();
}

init();
