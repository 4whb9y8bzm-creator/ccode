const $ = (id) => document.getElementById(id);
const PRINTERS = {
  a1mini: { name: 'Bambu Lab A1 mini', width: 180, height: 180 },
  a1: { name: 'Bambu Lab A1', width: 256, height: 256 },
  p1: { name: 'Bambu Lab P1P / P1S', width: 256, height: 256 },
  x1: { name: 'Bambu Lab X1 Carbon', width: 256, height: 256 }
};
const COLORS = [
  { name: 'Black', hex: '#171717', rgb: [23, 23, 23] },
  { name: 'Red', hex: '#ed5146', rgb: [237, 81, 70] },
  { name: 'Orange', hex: '#f5a13b', rgb: [245, 161, 59] },
  { name: 'Yellow', hex: '#f1d64a', rgb: [241, 214, 74] },
  { name: 'Green', hex: '#55a96e', rgb: [85, 169, 110] },
  { name: 'Blue', hex: '#5386d8', rgb: [83, 134, 216] },
  { name: 'Purple', hex: '#9c6ac7', rgb: [156, 106, 199] }
];
const state = {
  mode: 'text', colorMode: false, grid: true, tool: 'pen', name: 'drawing',
  source: document.createElement('canvas'), sourceReady: false,
  paths: [], layers: [], generated: '', toastTimer: null, drag: null, view: null
};
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function profile() { return PRINTERS[$('printerSelect').value] || PRINTERS.a1mini; }
function clamp(v, min, max) { return Math.min(Math.max(Number(v) || 0, min), max); }
function notify(message) {
  const toast = $('toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function invalidate() {
  state.generated = ''; $('downloadBtn').disabled = true; $('generateBtn').textContent = '✦  Generate G-code';
}
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.source-tab').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active));
  });
  $('textPanel').classList.toggle('hidden', mode !== 'text');
  $('uploadPanel').classList.toggle('hidden', mode === 'text');
  $('fontControls').classList.toggle('hidden', mode !== 'text');
  $('editorLabel').textContent = mode === 'text' ? 'TEXT COMPOSER' : mode === 'pdf' ? 'PDF IMPORT' : 'IMAGE IMPORT';
  $('uploadTitle').textContent = mode === 'pdf' ? 'Drop a PDF here' : 'Drop an image here';
  $('uploadHelp').textContent = mode === 'pdf' ? 'PDF · first page is converted' : 'PNG, JPG, WEBP · processed locally';
  $('fileInput').accept = mode === 'pdf' ? '.pdf,application/pdf' : 'image/png,image/jpeg,image/webp';
  $('fileInput').value = '';
  $('fileInfo').classList.add('hidden');
  $('processStatus').textContent = 'Your artwork stays in this browser.';
  if (mode === 'text') renderText();
  else { state.sourceReady = false; state.paths = []; state.layers = []; drawPreview(); updateEstimate(); invalidate(); }
}
function renderText() {
  const text = $('textInput').value.slice(0, 240); $('textInput').value = text;
  $('charCount').textContent = `${text.length} / 240`;
  const canvas = state.source; canvas.width = 1200; canvas.height = 520;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const baseSize = Number($('fontSize').value) || 34;
  const font = $('fontSelect').value; const weight = $('boldToggle').checked ? '700' : '400';
  const lines = text.split('\n'); let size = baseSize * 3; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#111';
  ctx.font = `${weight} ${size}px "${font}"`;
  const maxW = canvas.width - 80;
  while (lines.some((line) => ctx.measureText(line).width > maxW) && size > 24) { size -= 2; ctx.font = `${weight} ${size}px "${font}"`; }
  const lineHeight = Math.min(size * 1.25, (canvas.height - 30) / Math.max(1, lines.length));
  const startY = canvas.height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, i) => ctx.fillText(line || ' ', canvas.width / 2, startY + i * lineHeight));
  $('fontSizeOut').textContent = baseSize; state.name = 'text'; state.sourceReady = true; rebuild();
}
function importImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file); const img = new Image();
  img.onload = () => {
    state.source.width = img.naturalWidth; state.source.height = img.naturalHeight;
    state.source.getContext('2d').drawImage(img, 0, 0);
    state.name = file.name; state.sourceReady = true;
    $('fileName').textContent = file.name; $('fileInfo').classList.remove('hidden');
    state.colorMode = true; $('colorBtn').classList.add('active'); $('monoBtn').classList.remove('active');
    $('processStatus').textContent = 'Analyzing artwork and separating palette colors…';
    rebuild(); $('processStatus').textContent = `${state.layers.length} color layer${state.layers.length === 1 ? '' : 's'} prepared automatically.`;
    notify('Image imported and color layers prepared.'); URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); notify('Could not open that image.'); };
  img.src = url;
}
async function importPdf(file) {
  if (!window.pdfjsLib) { notify('PDF reader could not load. Check your internet connection.'); return; }
  try {
    $('processStatus').textContent = 'Importing first PDF page…';
    const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1); const viewport = page.getViewport({ scale: 1.6 });
    state.source.width = Math.ceil(viewport.width); state.source.height = Math.ceil(viewport.height);
    const ctx = state.source.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, state.source.width, state.source.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    state.name = file.name; state.sourceReady = true; state.colorMode = false;
    $('monoBtn').classList.add('active'); $('colorBtn').classList.remove('active');
    $('fileName').textContent = `${file.name} · page 1`; $('fileInfo').classList.remove('hidden');
    $('processStatus').textContent = 'First page imported; choose B&W or color output.';
    rebuild(); notify('First PDF page imported.');
  } catch (error) { console.error(error); notify('Could not read this PDF.'); }
}
function handleFile(file) {
  if (!file) return;
  if (state.mode === 'pdf') {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) importPdf(file);
    else notify('Choose a PDF file.');
  } else if (file.type.startsWith('image/')) importImage(file);
  else notify('Choose a PNG, JPG, WEBP image or PDF.');
}
function fitSource() {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 480;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 480, 480);
  if (!state.sourceReady) return canvas;
  const scale = Math.min(440 / state.source.width, 440 / state.source.height);
  const w = state.source.width * scale, h = state.source.height * scale;
  ctx.drawImage(state.source, (480 - w) / 2, (480 - h) / 2, w, h);
  return canvas;
}
function nearestColor(r, g, b) {
  let best = COLORS[0], bestD = Infinity;
  for (const c of COLORS) { const d = (r-c.rgb[0])**2 + (g-c.rgb[1])**2 + (b-c.rgb[2])**2; if (d < bestD) { bestD=d; best=c; } }
  return best;
}
function routeOrder(paths) {
  if (!$('fastRoute').checked || paths.length < 2) return paths;
  // Raster scan already groups nearby strokes; for modest jobs, nearest endpoint reduces travel.
  if (paths.length > 900) return paths;
  const todo = paths.slice(), out = []; let x = todo[0].x1, y = todo[0].y1;
  while (todo.length) {
    let best = 0, rev = false, dBest = Infinity;
    for (let i=0; i<todo.length; i++) {
      const p=todo[i], da=(p.x1-x)**2+(p.y1-y)**2, db=(p.x2-x)**2+(p.y2-y)**2;
      if (da<dBest) { dBest=da; best=i; rev=false; } if (db<dBest) { dBest=db; best=i; rev=true; }
    }
    const p=todo.splice(best,1)[0], q=rev?{...p,x1:p.x2,y1:p.y2,x2:p.x1,y2:p.y1}:p;
    out.push(q); x=q.x2; y=q.y2;
  }
  return out;
}
function rasterize() {
  const bed=profile(), frameW=clamp($('widthInput').value,10,bed.width), frameH=clamp($('heightInput').value,10,bed.height);
  const originX=clamp($('xInput').value,0,bed.width-frameW), originY=clamp($('yInput').value,0,bed.height-frameH);
  const imgCanvas=fitSource(), ctx=imgCanvas.getContext('2d',{willReadFrequently:true}), data=ctx.getImageData(0,0,480,480).data;
  const spacing=Number($('densityInput').value)||.8, step=Math.max(1,Math.round(spacing*2)), cutoff=Number($('thresholdInput').value)||145;
  const pencil=$('toolSelect').value==='pencil', shading=Number($('shadingInput').value)||60, colorMode=state.colorMode;
  const layerMap=new Map(); let monochrome=[];
  const pointToMm=(px,py)=>({x:originX+px/480*frameW,y:originY+(1-py/480)*frameH});
  // Rasterize contiguous marked pixels into horizontal strokes, alternating scan direction.
  for(let row=0, y=0; y<480; row++,y+=step) {
    const reverse = $('fastRoute').checked && row%2===1;
    let runStart=-1, runColor=null, runName='';
    const xs=Array.from({length:Math.ceil(480/step)},(_,i)=>i*step).filter(x=>x<480);
    if(reverse) xs.reverse();
    const flush=(endX)=>{
      if(runStart<0 || !runColor) return;
      let a=runStart, b=endX;
      if(reverse) [a,b]=[b,a];
      const p1=pointToMm(a,y),p2=pointToMm(b,y);
      if(Math.hypot(p2.x-p1.x,p2.y-p1.y)>.15) {
        const path={x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,color:runName,hex:runColor.hex};
        if(colorMode){if(!layerMap.has(runName))layerMap.set(runName,{name:runName,hex:runColor.hex,paths:[]});layerMap.get(runName).paths.push(path)}
        monochrome.push(path);
      }
      runStart=-1;runColor=null;runName='';
    };
    let prevX=null;
    for(const x of xs){
      const i=(y*480+x)*4,r=data[i],g=data[i+1],b=data[i+2],lum=.299*r+.587*g+.114*b;
      let on=false,color=null,name='';
      if(colorMode){if(lum<248){color=nearestColor(r,g,b);name=color.name;on=true}}
      else {
        let t=cutoff;
        if(pencil){const matrix=[[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];const dark=1-lum/255;const pattern=(matrix[Math.floor(y/step)%4][Math.floor(x/step)%4]-7.5)*7;t=255-dark*255+pattern*(shading/60)}
        on=$('invertToggle').checked?lum>t:lum<t;color=COLORS[0];name='Black';
      }
      const adjacent=prevX!==null && Math.abs(x-prevX)===step;
      if(on && runStart<0){runStart=x;runColor=color;runName=name}
      else if(on && runStart>=0 && (!adjacent || name!==runName)){flush(prevX===null?x:prevX);runStart=x;runColor=color;runName=name}
      else if(!on && runStart>=0)flush(prevX===null?x:prevX);
      prevX=x;
    }
    if(runStart>=0)flush(xs[xs.length-1]);
  }
  // Pencil adds a second, lighter cross-hatch pass. Density is controlled by tonal threshold.
  if(pencil && !colorMode){
    const crossStep=Math.max(step*2,Math.round(step*100/Math.max(30,shading)));
    for(let x=0;x<480;x+=crossStep){let start=-1;for(let y=0;y<480;y+=step){const i=(y*480+x)*4,lum=.299*data[i]+.587*data[i+1]+.114*data[i+2],dark=255-lum;if(dark>cutoff*.7){if(start<0)start=y}else if(start>=0){const a=pointToMm(x,start),b=pointToMm(x,y-step);if(Math.hypot(b.x-a.x,b.y-a.y)>.4)monochrome.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,color:'Black',hex:'#c8c8c8'});start=-1}}if(start>=0){const a=pointToMm(x,start),b=pointToMm(x,479);if(Math.hypot(b.x-a.x,b.y-a.y)>.4)monochrome.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,color:'Black',hex:'#c8c8c8'})}}
  }
  const layers=[...layerMap.values()].map(layer=>({...layer,paths:routeOrder(layer.paths)}));
  return {paths:colorMode?layers.flatMap(l=>l.paths):routeOrder(monochrome),layers};
}
function rebuild(){if(!state.sourceReady){state.paths=[];state.layers=[];drawPreview();updateEstimate();invalidate();return}const result=rasterize();state.paths=result.paths;state.layers=result.layers;drawPreview();updateEstimate();invalidate()}
function plateTransform(){const canvas=$('previewCanvas'),r=canvas.getBoundingClientRect(),p=profile(),margin=22,scale=Math.min((r.width-margin*2)/p.width,(r.height-margin*2)/p.height),w=p.width*scale,h=p.height*scale;return {r,p,scale,left:(r.width-w)/2,top:(r.height-h)/2,w,h}}
function drawPreview(){const canvas=$('previewCanvas'),r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;const dpr=window.devicePixelRatio||1;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,r.width,r.height);ctx.fillStyle='#17191d';ctx.fillRect(0,0,r.width,r.height);const t=plateTransform();ctx.fillStyle='#22252b';ctx.fillRect(t.left,t.top,t.w,t.h);if(state.grid){ctx.strokeStyle='rgba(255,255,255,.07)';ctx.lineWidth=.6;for(let x=0;x<=t.p.width;x+=10){ctx.beginPath();ctx.moveTo(t.left+x*t.scale,t.top);ctx.lineTo(t.left+x*t.scale,t.top+t.h);ctx.stroke()}for(let y=0;y<=t.p.height;y+=10){ctx.beginPath();ctx.moveTo(t.left,t.top+y*t.scale);ctx.lineTo(t.left+t.w,t.top+y*t.scale);ctx.stroke()}}ctx.strokeStyle='#62666d';ctx.lineWidth=1;ctx.strokeRect(t.left,t.top,t.w,t.h);const paths=state.colorMode?state.layers.flatMap(l=>l.paths):state.paths;for(const p of paths){ctx.beginPath();ctx.strokeStyle=state.colorMode?(COLORS.find(c=>c.name===p.color)?.hex||'#c8f169'):p.hex==='#c8c8c8'?'#9b9b9b':'#c8f169';ctx.lineWidth=1.05;ctx.moveTo(t.left+p.x1*t.scale,t.top+(t.p.height-p.y1)*t.scale);ctx.lineTo(t.left+p.x2*t.scale,t.top+(t.p.height-p.y2)*t.scale);ctx.stroke()}const frameW=clamp($('widthInput').value,10,t.p.width),frameH=clamp($('heightInput').value,10,t.p.height),x=clamp($('xInput').value,0,t.p.width-frameW),y=clamp($('yInput').value,0,t.p.height-frameH),bx=t.left+x*t.scale,by=t.top+(t.p.height-y-frameH)*t.scale,bw=frameW*t.scale,bh=frameH*t.scale;ctx.strokeStyle='#c8f169';ctx.lineWidth=1.4;ctx.setLineDash([5,4]);ctx.strokeRect(bx,by,bw,bh);ctx.setLineDash([]);ctx.fillStyle='#c8f169';ctx.fillRect(bx+bw-6,by+bh-6,12,12);state.view={...t,box:{x:bx,y:by,w:bw,h:bh}};$('emptyPreview').classList.toggle('hidden',paths.length>0);$('bedLabel').textContent=`${t.p.width} × ${t.p.height} MM BED`;$('previewDimensions').textContent=`${t.p.width} × ${t.p.height} mm`}
function updateEstimate(){const paths=state.colorMode?state.layers.flatMap(l=>l.paths):state.paths;let draw=0,travel=0,prev=null;for(const p of paths){draw+=Math.hypot(p.x2-p.x1,p.y2-p.y1);if(prev)travel+=Math.hypot(p.x1-prev.x2,p.y1-prev.y2);prev=p}const df=Math.max(100,Number($('drawFeed').value)||900),tf=Math.max(300,Number($('travelFeed').value)||2400),minutes=draw/df+travel/tf+paths.length*.12/60+(state.colorMode?Math.max(0,state.layers.length-1)*.5:0);$('timeEstimate').innerHTML=paths.length?(minutes<1?`${Math.max(1,Math.round(minutes*60))} <small>sec</small>`:`${Math.max(1,Math.round(minutes))} <small>min</small>`):'— <small>min</small>';$('distanceEstimate').textContent=paths.length?`${Math.round(draw+travel)} mm`:'— mm';$('pathSummary').textContent=paths.length?`${paths.length.toLocaleString()} strokes${state.colorMode?` · ${state.layers.length} colors`:''}`:'Add text or artwork to estimate';$('meterFill').style.width=`${Math.max(2,Math.min(100,minutes*3))}%`;}
function headerGcode(){const p=profile();return ['; Lineform V3 generic plotter-style G-code',`; Selected profile: ${p.name} (${p.width} x ${p.height} mm bed)`,'; This is NOT a complete Bambu printer job: no homing, heat, startup or machine macros.','; Verify attachment, coordinate system, travel limits, Z clearance, and pause support before use.','G21 ; millimeters','G90 ; absolute coordinates',''].join('\n')}
function pathsToGcode(paths){const df=Math.max(100,Number($('drawFeed').value)||900),tf=Math.max(300,Number($('travelFeed').value)||2400),tz=Number($('travelZ').value)||5,dz=(Number($('drawZ').value)||0)+(Number($('calibrationZ').value)||0),out=[];let last=null;for(const p of paths){const connected=last&&Math.hypot(p.x1-last.x2,p.y1-last.y2)<.03;if(!connected)out.push(`G0 Z${tz.toFixed(2)} F${tf}`,`G0 X${p.x1.toFixed(2)} Y${p.y1.toFixed(2)} F${tf}`,`G1 Z${dz.toFixed(2)} F${Math.min(df,300)}`);out.push(`G1 X${p.x2.toFixed(2)} Y${p.y2.toFixed(2)} F${df}`);last=p}return out}
function buildGcode(){const out=[headerGcode()];if(state.colorMode&&state.layers.length){state.layers.forEach((layer,i)=>{out.push(`; COLOR LAYER ${i+1}/${state.layers.length}: ${layer.name}`,...pathsToGcode(layer.paths));if(i<state.layers.length-1)out.push(`G0 Z${Number($('travelZ').value)||5}`,`; Change color to ${state.layers[i+1].name}; press resume`,$('pauseCommand').value.trim()||'M400 U1')})}else out.push('; SINGLE-COLOR PATH',...pathsToGcode(state.paths));out.push(`G0 Z${Number($('travelZ').value)||5} F${Number($('travelFeed').value)||2400}`,'; End of drawing');return out.join('\n')}
function saveText(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function slug(v){return String(v||'drawing').replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'')||'drawing'}
function generateGcode(){rebuild();if(!state.paths.length){notify('Add text or import artwork first.');return}state.generated=buildGcode();$('downloadBtn').disabled=false;$('generateBtn').textContent='✓  G-code ready';notify('G-code generated. Review it before downloading.')}
function downloadGcode(){if(!state.generated){notify('Generate G-code first.');return}saveText(`${slug(state.name)}-${state.colorMode?'color':'drawing'}.gcode`,state.generated);}
function downloadLayers(){if(!state.layers.length){notify('No color layers to download.');return}state.layers.forEach((layer,i)=>{const text=[headerGcode(),`; Single color: ${layer.name}`,...pathsToGcode(layer.paths),`G0 Z${Number($('travelZ').value)||5}`].join('\n');setTimeout(()=>saveText(`${slug(state.name)}-${slug(layer.name)}.gcode`,text),i*250)});notify(`Downloading ${state.layers.length} color files.`)}
function pointer(e){const r=$('previewCanvas').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function beginDrag(e){if(!state.sourceReady||!state.view)return;const q=pointer(e),b=state.view.box,handle=Math.hypot(q.x-b.x-b.w,q.y-b.y-b.h)<18,inside=q.x>=b.x&&q.x<=b.x+b.w&&q.y>=b.y&&q.y<=b.y+b.h;if(!handle&&!inside)return;e.preventDefault();$('previewCanvas').setPointerCapture(e.pointerId);state.drag={type:handle?'resize':'move',point:q,x:Number($('xInput').value)||0,y:Number($('yInput').value)||0,w:clamp($('widthInput').value,10,profile().width),h:clamp($('heightInput').value,10,profile().height),bed:profile()};$('previewCanvas').style.cursor=handle?'nwse-resize':'grabbing'}
function drag(e){if(!state.drag||!state.view)return;const d=state.drag,q=pointer(e),dx=(q.x-d.point.x)/state.view.scale,dy=-(q.y-d.point.y)/state.view.scale;if(d.type==='move'){$('xInput').value=Math.round(clamp(d.x+dx,0,d.bed.width-d.w));$('yInput').value=Math.round(clamp(d.y+dy,0,d.bed.height-d.h))}else{const factor=Math.max(.1,Math.max((d.w+dx)/d.w,(d.h-dy)/d.h)),f=Math.min(factor,d.bed.width/d.w,d.bed.height/d.h),w=Math.round(d.w*f),h=Math.round(d.h*f);$('widthInput').value=w;$('heightInput').value=h;$('xInput').value=Math.round(clamp(d.x-(w-d.w)/2,0,d.bed.width-w));$('yInput').value=Math.round(clamp(d.y-(h-d.h)/2,0,d.bed.height-h))}rebuild()}
function center(){const p=profile(),w=clamp($('widthInput').value,10,p.width),h=clamp($('heightInput').value,10,p.height);$('xInput').value=Math.round((p.width-w)/2);$('yInput').value=Math.round((p.height-h)/2);rebuild()}
function bind(){document.querySelectorAll('.source-tab').forEach(t=>t.addEventListener('click',()=>setMode(t.dataset.mode)));$('textInput').addEventListener('input',renderText);$('fontSelect').addEventListener('change',renderText);$('fontSize').addEventListener('input',renderText);$('boldToggle').addEventListener('change',renderText);$('browseBtn').addEventListener('click',()=>$('fileInput').click());$('fileInput').addEventListener('change',e=>handleFile(e.target.files[0]));$('dropZone').addEventListener('dragover',e=>{e.preventDefault();$('dropZone').classList.add('drag-over')});$('dropZone').addEventListener('dragleave',()=>$('dropZone').classList.remove('drag-over'));$('dropZone').addEventListener('drop',e=>{e.preventDefault();$('dropZone').classList.remove('drag-over');handleFile(e.dataTransfer.files[0])});$('removeFile').addEventListener('click',()=>{state.sourceReady=false;state.paths=[];state.layers=[];$('fileInput').value='';$('fileInfo').classList.add('hidden');$('processStatus').textContent='Your artwork stays in this browser.';drawPreview();updateEstimate();invalidate()});$('monoBtn').addEventListener('click',()=>{state.colorMode=false;$('monoBtn').classList.add('active');$('colorBtn').classList.remove('active');rebuild()});$('colorBtn').addEventListener('click',()=>{state.colorMode=true;$('colorBtn').classList.add('active');$('monoBtn').classList.remove('active');rebuild()});$('toolSelect').addEventListener('change',()=>{state.tool=$('toolSelect').value;$('shadingControl').classList.toggle('hidden',state.tool!=='pencil');rebuild()});$('fastRoute').addEventListener('change',rebuild);
  ['widthInput','heightInput','xInput','yInput','densityInput','thresholdInput','shadingInput','invertToggle','drawFeed','travelFeed','drawZ','travelZ','pauseCommand'].forEach(id=>$(id).addEventListener('input',()=>{if(id==='densityInput')$('densityOut').textContent=`${Number($(id).value).toFixed(2)} mm`;if(id==='thresholdInput')$('thresholdOut').textContent=$(id).value;if(id==='shadingInput')$('shadingOut').textContent=`${$(id).value}%`;rebuild()}));
  $('printerSelect').addEventListener('change',()=>{const p=profile();$('widthInput').max=p.width;$('heightInput').max=p.height;$('xInput').max=p.width;$('yInput').max=p.height;$('widthInput').value=Math.min(Number($('widthInput').value)||125,p.width);$('heightInput').value=Math.min(Number($('heightInput').value)||80,p.height);$('xInput').value=clamp($('xInput').value,0,p.width-Number($('widthInput').value));$('yInput').value=clamp($('yInput').value,0,p.height-Number($('heightInput').value));rebuild()});
  $('gridBtn').addEventListener('click',()=>{state.grid=!state.grid;$('gridBtn').classList.toggle('selected',state.grid);drawPreview()});$('centerBtn').addEventListener('click',center);$('generateBtn').addEventListener('click',generateGcode);$('downloadBtn').addEventListener('click',downloadGcode);$('downloadColorBtn').addEventListener('click',downloadLayers);$('previewCanvas').addEventListener('pointerdown',beginDrag);$('previewCanvas').addEventListener('pointermove',drag);$('previewCanvas').addEventListener('pointerup',()=>{state.drag=null;$('previewCanvas').style.cursor='grab'});$('previewCanvas').addEventListener('pointercancel',()=>{state.drag=null});
  $('shareBtn').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:'Lineform V3 drawing',text:'My drawing toolpath project',url:location.href});else if(navigator.clipboard){await navigator.clipboard.writeText(location.href);notify('Page link copied.')}else notify('Sharing is unavailable in this browser.')}catch(e){if(e.name!=='AbortError')notify('Could not share this page.')}});
  $('surfaceBtn').addEventListener('click',()=>{$('calibrationZ').value=$('drawZ').value;$('surfaceDialog').showModal()});$('closeSurface').addEventListener('click',()=>$('surfaceDialog').close());$('cancelSurface').addEventListener('click',()=>$('surfaceDialog').close());$('saveSurface').addEventListener('click',()=>{$('drawZ').value=$('calibrationZ').value;$('surfaceDialog').close();rebuild();notify('Manual Z setting saved. Check clearance before use.')});window.addEventListener('resize',drawPreview);
}
function init(){bind();const p=profile();$('widthInput').max=p.width;$('heightInput').max=p.height;$('xInput').max=p.width;$('yInput').max=p.height;$('densityOut').textContent=`${Number($('densityInput').value).toFixed(2)} mm`;$('thresholdOut').textContent=$('thresholdInput').value;$('shadingOut').textContent=`${$('shadingInput').value}%`;$('shadingControl').classList.add('hidden');renderText()}
init();
