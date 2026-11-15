(() => {
  const $ = (id) => document.getElementById(id);
  const base = $('previewCanvas');
  const wrap = base.parentElement;
  const overlay = document.createElement('canvas');
  overlay.id = 'placementOverlay';
  overlay.setAttribute('aria-label', 'Drag artwork to move it; drag the corner handle to scale it');
  overlay.style.cssText = 'position:absolute;z-index:3;touch-action:none;cursor:grab;';
  wrap.appendChild(overlay);

  const generateButton = document.createElement('button');
  generateButton.id = 'generateGcodeBtn';
  generateButton.className = 'download-button';
  generateButton.type = 'button';
  generateButton.textContent = 'Generate G-code';
  $('downloadBtn').before(generateButton);
  const instructions = document.createElement('div');
  instructions.textContent = 'Drag the artwork to move it. Drag the corner handle to resize.';
  instructions.style.cssText = 'font-size:10px;color:#96989f;margin:-5px 0 12px;line-height:1.5';
  $('previewHeading')?.appendChild(instructions);

  let generatedCode = null;
  let gesture = null;
  let metrics = null;
  const originalGenerate = window.generate;
  window.generate = function (...args) {
    generatedCode = null;
    generateButton.textContent = 'Generate G-code';
    return originalGenerate.apply(this, args);
  };

  function placeOverlay() {
    const r = base.getBoundingClientRect();
    const p = wrap.getBoundingClientRect();
    overlay.style.left = `${r.left - p.left}px`;
    overlay.style.top = `${r.top - p.top}px`;
    overlay.style.width = `${r.width}px`;
    overlay.style.height = `${r.height}px`;
    overlay.width = Math.max(1, Math.round(r.width * devicePixelRatio));
    overlay.height = Math.max(1, Math.round(r.height * devicePixelRatio));
    paintOverlay();
  }

  function paintOverlay() {
    const rect = base.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const p = window.profiles[$('printerSelect').value];
    const margin = 22;
    const scale = Math.min((rect.width - margin * 2) / p.w, (rect.height - margin * 2) / p.h);
    const bw = p.w * scale, bh = p.h * scale;
    const left = (rect.width - bw) / 2, top = (rect.height - bh) / 2;
    const w = Math.max(10, Number($('widthInput').value) || 10);
    const h = Math.max(10, Number($('heightInput').value) || 10);
    const x = Math.max(0, Math.min(p.w - w, Number($('xInput').value) || 0));
    const y = Math.max(0, Math.min(p.h - h, Number($('yInput').value) || 0));
    const box = {left: left + x * scale, top: top + (p.h - y - h) * scale, width: w * scale, height: h * scale};
    const ctx = overlay.getContext('2d');
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#c8f169';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(box.left, box.top, box.width, box.height);
    ctx.setLineDash([]);
    ctx.fillStyle = '#c8f169';
    ctx.fillRect(box.left + box.width - 6, box.top + box.height - 6, 12, 12);
    metrics = {p, scale, box, rect};
  }

  function mmFromPointer(event) {
    const r = overlay.getBoundingClientRect();
    return {x: (event.clientX - r.left), y: (event.clientY - r.top)};
  }

  overlay.addEventListener('pointerdown', (event) => {
    if (!metrics || !window.artwork) return;
    const pt = mmFromPointer(event), b = metrics.box;
    const handle = Math.hypot(pt.x - (b.left + b.width), pt.y - (b.top + b.height)) < 16;
    const inside = pt.x >= b.left && pt.x <= b.left + b.width && pt.y >= b.top && pt.y <= b.top + b.height;
    if (!handle && !inside) return;
    event.preventDefault();
    overlay.setPointerCapture(event.pointerId);
    overlay.style.cursor = handle ? 'nwse-resize' : 'grabbing';
    const p = metrics.p;
    gesture = {type:handle ? 'resize' : 'move', start:pt, x:Number($('xInput').value)||0, y:Number($('yInput').value)||0, w:Number($('widthInput').value)||10, h:Number($('heightInput').value)||10, ratio:(Number($('widthInput').value)||10)/(Number($('heightInput').value)||10), bed:p};
  });

  overlay.addEventListener('pointermove', (event) => {
    if (!gesture || !metrics) return;
    const pt = mmFromPointer(event), dx=(pt.x-gesture.start.x)/metrics.scale, dy=-(pt.y-gesture.start.y)/metrics.scale;
    if (gesture.type === 'move') {
      $('xInput').value = Math.round(Math.max(0, Math.min(gesture.bed.w-gesture.w, gesture.x+dx)));
      $('yInput').value = Math.round(Math.max(0, Math.min(gesture.bed.h-gesture.h, gesture.y+dy)));
    } else {
      const factor = Math.max((gesture.w+dx)/gesture.w, (gesture.h-dy)/gesture.h);
      const maxFactor = Math.min(gesture.bed.w/gesture.w, gesture.bed.h/gesture.h);
      const next = Math.max(10/gesture.w, Math.min(maxFactor, factor));
      const nw = Math.round(gesture.w*next), nh = Math.round(gesture.h*next);
      $('widthInput').value = nw; $('heightInput').value = nh;
      $('xInput').value = Math.round(Math.max(0, Math.min(gesture.bed.w-nw, gesture.x-(nw-gesture.w)/2)));
      $('yInput').value = Math.round(Math.max(0, Math.min(gesture.bed.h-nh, gesture.y-(nh-gesture.h)/2)));
    }
    window.generate();
    placeOverlay();
  });

  function endGesture() { gesture = null; overlay.style.cursor = 'grab'; }
  overlay.addEventListener('pointerup', endGesture);
  overlay.addEventListener('pointercancel', endGesture);
  window.addEventListener('resize', placeOverlay);
  $('printerSelect').addEventListener('change', () => requestAnimationFrame(placeOverlay));
  ['widthInput','heightInput','xInput','yInput'].forEach(id => $(id).addEventListener('input', () => requestAnimationFrame(placeOverlay)));

  generateButton.addEventListener('click', () => {
    window.generate();
    if (!window.strokes || !window.strokes.length) { window.say('Add artwork before generating G-code.'); return; }
    generatedCode = window.combinedGcode();
    generateButton.textContent = 'G-code ready ✓';
    window.say('G-code generated. Review it, then download when ready.');
  });
  $('downloadBtn').onclick = () => {
    if (!generatedCode) { window.say('Generate G-code first.'); return; }
    const name = (window.artwork?.name || 'drawing').replace(/\.[^.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-') || 'drawing';
    window.download(`${name}-${window.colorMode ? 'color' : 'drawing'}.gcode`, generatedCode);
    window.say('G-code downloaded. Review it before printing.');
  };

  requestAnimationFrame(placeOverlay);
})();
