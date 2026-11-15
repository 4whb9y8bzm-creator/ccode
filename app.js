const $ = (id) => document.getElementById(id);

const profiles = {
  a1mini: { name: 'Bambu Lab A1 mini', w: 180, h: 180 },
  a1: { name: 'Bambu Lab A1', w: 256, h: 256 },
  p1: { name: 'Bambu Lab P1P / P1S', w: 256, h: 256 },
  x1: { name: 'Bambu Lab X1 Carbon', w: 256, h: 256 }
};

const palette = [
  { name: 'Black', color: '#171717' },
  { name: 'Red', color: '#ed5146' },
  { name: 'Orange', color: '#f5a13b' },
  { name: 'Yellow', color: '#f1d64a' },
  { name: 'Green', color: '#55b57d' },
  { name: 'Blue', color: '#4d7dff' },
  { name: 'Purple', color: '#8d68ff' }
];

const state = {
  mode: 'text',
  outputMode: 'mono',
  toolType: 'pen',
  sourceCanvas: document.createElement('canvas'),
  previewCanvas: null,
  artwork: null,
  fileName: 'artwork',
  paths: [],
  colorLayers: [],
  showGrid: true,
  estimateMinutes: 0,
  toastTimer: null
};

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function profile() {
  return profiles[$('printerSelect').value] || profiles.a1mini;
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function say(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function currentSize() {
  const p = profile();
  const w = clamp($('widthInput').value, 20, p.w);
  const h = clamp($('heightInput').value, 20, p.h);
  return { w, h };
}

function updatePrinterInfo() {
  const p = profile();
  const bed = `${p.w} × ${p.h} mm BED`;
  $('bedLabel').textContent = bed;
  $('dimText').textContent = `${p.w} × ${p.h} mm`;

  const widthValue = Number($('widthInput').value) || p.w;
  const heightValue = Number($('heightInput').value) || p.h;
  $('widthInput').value = Math.min(widthValue, p.w);
  $('heightInput').value = Math.min(heightValue, p.h);
  $('widthInput').max = p.w;
  $('heightInput').max = p.h;
}

function setMode(nextMode) {
  state.mode = nextMode;
  $('textPanel').classList.toggle('hidden', nextMode !== 'text');
  $('imagePanel').classList.toggle('hidden', nextMode !== 'image');

  const tabs = document.querySelectorAll('.mode-tab');
  tabs.forEach((button) => {
    const active = button.dataset.mode === nextMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  $('editorLabel').textContent = nextMode === 'text'
    ? 'TEXT COMPOSER'
    : nextMode === 'image'
      ? 'IMAGE CONVERTER'
      : 'PDF DRAWER';

  if (nextMode === 'text') {
    renderText();
  }

  generateArtwork();
}

function renderText() {
  const canvas = state.sourceCanvas;
  const ctx = canvas.getContext('2d');
  const text = $('textInput').value.slice(0, 120);
  $('textInput').value = text;
  $('charCount').textContent = `${text.length} / 120`;

  const size = Number($('fontSize').value) || 34;
  const bold = $('boldToggle').checked ? '700' : '400';
  const font = `${bold} ${size}px ${$('fontSelect').value}`;

  const sample = 600;
  canvas.width = sample;
  canvas.height = sample;
  ctx.clearRect(0, 0, sample, sample);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sample, sample);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111111';
  ctx.font = font;

  const lines = text.split('\n');
  const totalHeight = lines.length * (size + 8);
  const startY = sample / 2 - totalHeight / 2 + size / 2;

  lines.forEach((line, index) => {
    const y = startY + index * (size + 8);
    ctx.fillText(line || ' ', sample / 2, y);
  });

  state.artwork = null;
  $('fileName').textContent = 'text layer';
  generateArtwork();
}

function loadArtworkFromImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const canvas = state.sourceCanvas;
    const ctx = canvas.getContext('2d');
    const size = 1200;
    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const ratio = Math.min(size / img.width, size / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    state.artwork = file;
    $('fileName').textContent = file.name;
    generateArtwork();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

async function loadPdfFromFile(file) {
  if (!window.pdfjsLib) {
    say('PDF library did not load. Check your connection.');
    return;
  }

  try {
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.4 });
    const canvas = state.sourceCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;
    state.artwork = file;
    $('fileName').textContent = file.name;
    generateArtwork();
  } catch (error) {
    say('PDF could not be processed.');
    console.error(error);
  }
}

function handleSelectedFile(file) {
  if (!file) return;
  if (state.mode === 'pdf') {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      loadPdfFromFile(file);
    } else {
      say('Please choose a PDF file.');
    }
    return;
  }

  if (file.type.startsWith('image/')) {
    loadArtworkFromImage(file);
  } else {
    say('Please choose an image file.');
  }
}

function buildMaskFromCanvas(canvas) {
  const { width, height } = canvas;
  const imageData = canvas.getContext('2d').getImageData(0, 0, width, height);
  const data = imageData.data;
  const mask = [];

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const lum = (r * 0.299 + g * 0.587 + b * 0.114);
    const ink = a > 0 && lum < 245 ? 1 : 0;
    mask.push(ink);
  }

  return { width, height, mask, data };
}

function createHatchPath(x, y, width, step, strength) {
  const points = [];
  const edge = Math.max(1, step * 0.9);
  const wiggle = strength * 0.28;
  const segments = 4 + Math.floor(width / step);

  for (let i = 0; i <= segments; i++) {
    const px = x + i * edge;
    const py = y + Math.sin((px * 0.08) + (y * 0.04)) * wiggle;
    points.push({ x: px, y: py });
  }
  return points;
}

function generatePenPaths(maskData, density, shading) {
  const { width, height, mask } = maskData;
  const step = Math.max(1.2, 4 - density * 1.3);
  const target = [];

  for (let y = 0; y < height; y += step) {
    const path = [];
    for (let x = 0; x < width; x += step) {
      const idx = (Math.floor(y) * width + Math.floor(x));
      const value = mask[idx];
      if (value) {
        path.push({ x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.5 });
      }
    }
    if (path.length > 1) {
      target.push(path);
    }
  }

  // Dense edge sampling to improve line clarity
  for (let y = 0; y < height; y += step * 2) {
    for (let x = 0; x < width; x += step * 2) {
      const idx = y * width + x;
      if (mask[idx]) {
        const path = [];
        for (let q = 0; q < 5; q++) {
          const px = x + q * step * 0.8;
          const py = y + Math.sin((x + q * 1.8) * 0.14) * (shading * 0.15);
          path.push({ x: px, y: py });
        }
        if (path.length > 1) target.push(path);
      }
    }
  }

  return target.slice(0, 1500);
}

function generatePencilPaths(maskData, density, shading) {
  const { width, height, mask } = maskData;
  const step = Math.max(1.4, density * 2.2);
  const paths = [];
  const passes = 3 + Math.floor(shading / 30);

  for (let pass = 0; pass < passes; pass++) {
    const offset = pass * step * 0.5;
    for (let y = offset; y < height; y += step * 1.6) {
      const path = [];
      for (let x = 0; x < width; x += step) {
        const idx = Math.floor(y) * width + Math.floor(x);
        const active = mask[idx] && ((x + pass * 19) % Math.ceil(step * 2.2) < step * 1.2 || pass === 0);
        if (active) {
          const py = y + Math.sin((x * 0.1) + pass) * (step * 0.8 * (shading / 100));
          path.push({ x, y: py });
        }
      }
      if (path.length > 2) paths.push(path);
    }
  }

  return paths.slice(0, 2500);
}

function colorLayersFromCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const colors = [];
  const found = [];

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 10) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (r * 0.299 + g * 0.587 + b * 0.114);
    if (lum > 245) continue;

    let matchIndex = -1;
    for (let j = 0; j < colors.length; j++) {
      const diff = Math.abs(colors[j].r - r) + Math.abs(colors[j].g - g) + Math.abs(colors[j].b - b);
      if (diff < 120) {
        matchIndex = j;
        break;
      }
    }

    if (matchIndex === -1) {
      colors.push({ r, g, b, count: 1 });
    } else {
      const c = colors[matchIndex];
      c.r = (c.r * c.count + r) / (c.count + 1);
      c.g = (c.g * c.count + g) / (c.count + 1);
      c.b = (c.b * c.count + b) / (c.count + 1);
      c.count += 1;
    }
  }

  const sorted = colors
    .map((c) => ({
      name: palette.find((p) => {
        const rgb = p.color.match(/[\da-f]{2}/gi).map((part) => parseInt(part, 16));
        return Math.abs(c.r - rgb[0]) + Math.abs(c.g - rgb[1]) + Math.abs(c.b - rgb[2]) < 120;
      })?.name || 'Accent',
      rgb: [Math.round(c.r), Math.round(c.g), Math.round(c.b)]
    }))
    .filter((item, index, arr) => arr.findIndex((entry) => entry.name === item.name) === index)
    .slice(0, 5);

  const layers = sorted.map((color) => {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = width;
    layerCanvas.height = height;
    const layerCtx = layerCanvas.getContext('2d');
    layerCtx.fillStyle = '#ffffff';
    layerCtx.fillRect(0, 0, width, height);
    const layerImage = layerCtx.getImageData(0, 0, width, height);
    const layerData = layerImage.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 10) continue;
      const lum = (r * 0.299 + g * 0.587 + b * 0.114);
      if (lum < 245) {
        const dr = r - color.rgb[0];
        const dg = g - color.rgb[1];
        const db = b - color.rgb[2];
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
        if (distance < 100) {
          layerData[i] = 0;
          layerData[i + 1] = 0;
          layerData[i + 2] = 0;
          layerData[i + 3] = 255;
        }
      }
    }

    layerCtx.putImageData(layerImage, 0, 0);
    const mask = buildMaskFromCanvas(layerCanvas);
    return {
      name: color.name,
      paths: state.toolType === 'pencil' ? generatePencilPaths(mask, Number($('densityInput').value), Number($('shadingInput').value)) : generatePenPaths(mask, Number($('densityInput').value), Number($('shadingInput').value)),
      color: color.name
    };
  });

  return layers.filter((layer) => layer.paths.length > 0);
}

function normalizeToPlate(canvas) {
  const { w, h } = currentSize();
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  const source = state.sourceCanvas;
  const scale = Math.min(w / source.width, h / source.height);
  const iw = source.width * scale;
  const ih = source.height * scale;
  const x = (w - iw) / 2;
  const y = (h - ih) / 2;

  ctx.drawImage(source, x, y, iw, ih);
  return work;
}

function generateArtwork() {
  const source = state.sourceCanvas;
  if (!source.width || !source.height) {
    state.paths = [];
    drawPreview();
    updateEstimate();
    return;
  }

  const work = normalizeToPlate(source);
  const maskData = buildMaskFromCanvas(work);
  const density = Number($('densityInput').value) || 1.2;
  const shading = Number($('shadingInput').value) || 65;

  if (state.outputMode === 'color') {
    state.colorLayers = colorLayersFromCanvas(work);
    state.paths = state.colorLayers.flatMap((layer) => layer.paths);
  } else {
    state.colorLayers = [];
    state.paths = state.toolType === 'pencil'
      ? generatePencilPaths(maskData, density, shading)
      : generatePenPaths(maskData, density, shading);
  }

  drawPreview();
  updateEstimate();
}

function drawPreview() {
  const canvas = $('previewCanvas');
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const { w, h } = currentSize();
  const xScale = (rect.width - 30) / w;
  const yScale = (rect.height - 30) / h;
  const scale = Math.min(xScale, yScale);

  const offsetX = (rect.width - w * scale) / 2;
  const offsetY = (rect.height - h * scale) / 2;

  ctx.fillStyle = '#111417';
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  if (state.showGrid) {
    const gridStep = Math.max(12, scale * 20);
    const minX = offsetX;
    const minY = offsetY;
    for (let x = minX; x <= rect.width - minX; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rect.height);
      ctx.stroke();
    }
    for (let y = minY; y <= rect.height - minY; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(rect.width, y);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = '#b1d85a';
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, w * scale, h * scale);

  const drawPath = (path, color) => {
    if (!path || path.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    path.forEach((point, index) => {
      const px = offsetX + point.x * scale;
      const py = offsetY + (h - point.y) * scale;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };

  const base = state.outputMode === 'color' ? state.colorLayers : [{ paths: state.paths, color: '#dfe8ff' }];
  base.forEach((layer) => {
    if (layer && layer.paths) {
      layer.paths.forEach((path) => drawPath(path, layer.color || '#dfe8ff'));
    }
  });

  const hasContent = state.paths.length > 0 || state.colorLayers.length > 0;
  $('emptyPreview').classList.toggle('hidden', hasContent);
}

function updateEstimate() {
  const paths = state.outputMode === 'color'
    ? state.colorLayers.flatMap((layer) => layer.paths)
    : state.paths;

  let totalDistance = 0;
  paths.forEach((path) => {
    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      totalDistance += Math.hypot(dx, dy);
    }
  });

  const drawFeed = Math.max(200, Number($('drawFeed').value) || 900);
  const minutes = totalDistance / drawFeed * 0.8 + (state.outputMode === 'color' ? state.colorLayers.length * 1.2 : 0.5);
  state.estimateMinutes = minutes;
  $('timeEstimate').innerHTML = `${Math.max(1, Math.round(minutes))} <small>min</small>`;
}

function makeHeader() {
  const p = profile();
  const tool = $('toolTypeSelect').value === 'pencil' ? 'pencil' : 'pen';
  const surfaceOffset = Number($('surfaceInput').value) || 0;
  return [
    '; Lineform generated toolpath',
    `; Printer: ${p.name}`,
    `; Bed: ${p.w} x ${p.h} mm`,
    `; Tool: ${tool}`,
    `; Auto-level: ${$('autoLevelToggle').checked ? 'enabled' : 'disabled'}`,
    `; Surface offset: ${surfaceOffset.toFixed(2)} mm`,
    '; Safety: verify toolhead, paper placement and Z before printing',
    '',
    'G28',
    'G90',
    'G92 E0',
    'M83',
    'G0 Z5 F2400',
    ''
  ].join('\n');
}

function pathToGcode(path, feed, travelZ, drawZ, xOffset, yOffset) {
  if (!path || path.length < 1) return [];
  const lines = [];
  const start = path[0];
  lines.push(`G0 X${(start.x + xOffset).toFixed(2)} Y${(start.y + yOffset).toFixed(2)} Z${travelZ.toFixed(2)} F${Number($('travelFeed').value) || 2400}`);
  lines.push(`G1 X${(start.x + xOffset).toFixed(2)} Y${(start.y + yOffset).toFixed(2)} Z${drawZ.toFixed(2)} F${feed}`);

  for (let i = 1; i < path.length; i++) {
    const point = path[i];
    lines.push(`G1 X${(point.x + xOffset).toFixed(2)} Y${(point.y + yOffset).toFixed(2)} Z${drawZ.toFixed(2)} F${feed}`);
  }

  return lines;
}

function buildCombinedGcode() {
  const tool = $('toolTypeSelect').value === 'pencil' ? 'pencil' : 'pen';
  const drawFeed = Number($('drawFeed').value) || 900;
  const travelFeed = Number($('travelFeed').value) || 2400;
  const drawZ = Number($('drawZ').value) || 0;
  const travelZ = Number($('travelZ').value) || 5;
  const xOffset = Number($('xInput').value) || 0;
  const yOffset = Number($('yInput').value) || 0;

  const out = [makeHeader()];

  if (state.outputMode === 'color' && state.colorLayers.length) {
    state.colorLayers.forEach((layer, index) => {
      out.push(`\n; COLOR ${index + 1}/${state.colorLayers.length}: ${layer.name}`);
      out.push(`M117 COLOR ${layer.name}`);
      layer.paths.forEach((path) => {
        out.push(...pathToGcode(path, drawFeed, travelZ, drawZ, xOffset, yOffset));
      });
      if (index < state.colorLayers.length - 1) {
        out.push('');
        out.push('M0 ; CHANGE COLOR: prepare next color and press resume');
        out.push('');
      }
    });
  } else {
    out.push(`; MODE: ${tool} ${state.outputMode === 'mono' ? 'mono' : 'multi-color'}`);
    state.paths.forEach((path) => {
      out.push(...pathToGcode(path, drawFeed, travelZ, drawZ, xOffset, yOffset));
    });
  }

  out.push('');
  out.push('G0 Z10 F2400');
  out.push('M104');
  out.push('; Finished drawing');
  return out.join('\n');
}

function slugify(value) {
  return String(value || 'drawing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'drawing';
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleDownload() {
  const gcode = buildCombinedGcode();
  if (!gcode || gcode.length < 50) {
    say('Generate some artwork first.');
    return;
  }
  downloadText(`${slugify($('fileName').textContent || 'drawing')}-${state.outputMode}.gcode`, gcode);
}

function handleDownloadColorLayers() {
  if (state.outputMode !== 'color' || !state.colorLayers.length) {
    say('Add a multi-color image or enable color mode.');
    return;
  }

  state.colorLayers.forEach((layer, index) => {
    const layerGcode = [makeHeader(), `; COLOR ${index + 1}: ${layer.name}`, ...layer.paths.flatMap((path) => pathToGcode(path, Number($('drawFeed').value) || 900, Number($('travelZ').value) || 5, Number($('drawZ').value) || 0, Number($('xInput').value) || 0, Number($('yInput').value) || 0)), 'G0 Z10 F2400', 'M104'].join('\n');
    downloadText(`${slugify(layer.name)}-${index + 1}.gcode`, layerGcode);
  });
}

function handleShare() {
  const payload = {
    printer: $('printerSelect').value,
    mode: state.mode,
    outputMode: state.outputMode,
    tool: $('toolTypeSelect').value,
    width: $('widthInput').value,
    height: $('heightInput').value,
    density: $('densityInput').value,
    estimateMinutes: state.estimateMinutes
  };

  const text = JSON.stringify(payload, null, 2);
  navigator.clipboard?.writeText(text).then(() => say('Share payload copied to clipboard')).catch(() => say('Share payload ready for copy'));
}

function bindControls() {
  $('printerSelect').addEventListener('change', () => {
    updatePrinterInfo();
    generateArtwork();
  });

  $('textInput').addEventListener('input', renderText);
  $('fontSelect').addEventListener('change', renderText);
  $('fontSize').addEventListener('input', () => {
    $('fontSizeValue').textContent = $('fontSize').value;
    renderText();
  });
  $('boldToggle').addEventListener('change', renderText);

  $('widthInput').addEventListener('input', generateArtwork);
  $('heightInput').addEventListener('input', generateArtwork);
  $('densityInput').addEventListener('input', () => {
    $('densityValue').textContent = Number($('densityInput').value).toFixed(1);
    generateArtwork();
  });
  $('shadingInput').addEventListener('input', () => {
    $('shadingValue').textContent = `${$('shadingInput').value}%`;
    generateArtwork();
  });
  $('surfaceInput').addEventListener('input', () => {
    $('surfaceValue').textContent = `${Number($('surfaceInput').value).toFixed(2)} mm`;
  });
  $('drawFeed').addEventListener('input', updateEstimate);
  $('travelFeed').addEventListener('input', updateEstimate);
  $('toolTypeSelect').addEventListener('change', generateArtwork);
  $('outputModeSelect').addEventListener('change', () => {
    state.outputMode = $('outputModeSelect').value;
    $('downloadColorBtn').classList.toggle('hidden', state.outputMode !== 'color');
    generateArtwork();
  });

  $('browseBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', (event) => handleSelectedFile(event.target.files[0]));
  document.getElementById('removeFile').addEventListener('click', () => {
    $('fileInput').value = '';
    state.artwork = null;
    $('fileInfo').classList.add('hidden');
    renderText();
  });

  $('dropZone').addEventListener('dragover', (event) => {
    event.preventDefault();
    $('dropZone').classList.add('dragging');
  });
  $('dropZone').addEventListener('dragleave', () => $('dropZone').classList.remove('dragging'));
  $('dropZone').addEventListener('drop', (event) => {
    event.preventDefault();
    $('dropZone').classList.remove('dragging');
    handleSelectedFile(event.dataTransfer.files[0]);
  });

  document.querySelectorAll('.mode-tab').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('gridToggle').addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    $('gridToggle').classList.toggle('active', state.showGrid);
    drawPreview();
  });
  $('fitBtn').addEventListener('click', () => {
    const p = profile();
    $('widthInput').value = Math.min(p.w, 180);
    $('heightInput').value = Math.min(p.h, 180);
    generateArtwork();
  });
  $('downloadBtn').addEventListener('click', handleDownload);
  $('downloadColorBtn').addEventListener('click', handleDownloadColorLayers);
  $('shareBtn').addEventListener('click', handleShare);
}

function init() {
  $('fontSizeValue').textContent = $('fontSize').value;
  $('densityValue').textContent = Number($('densityInput').value).toFixed(1);
  $('shadingValue').textContent = `${$('shadingInput').value}%`;
  $('surfaceValue').textContent = `${Number($('surfaceInput').value).toFixed(2)} mm`;
  state.outputMode = $('outputModeSelect').value;
  $('downloadColorBtn').classList.toggle('hidden', state.outputMode !== 'color');
  updatePrinterInfo();
  bindControls();
  renderText();
  drawPreview();
}

init();
