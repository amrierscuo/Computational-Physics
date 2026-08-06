'use strict';

const DATA_URL = './data/prime-roots.txt';
const SVG_NS = 'http://www.w3.org/2000/svg';
const CLASS_ORDER = ['A', 'B', 'C', 'D'];
const CLASS_CONFIG = {
  A: { residue: 1, blocks: [1], label: '+1', shape: 'circle' },
  B: { residue: 3, blocks: [2, 1], label: '+2+1', shape: 'square' },
  C: { residue: 7, blocks: [5, 2], label: '+5+2', shape: 'triangle' },
  D: { residue: 9, blocks: [5, 2, 2], label: '+5+2+2', shape: 'diamond' }
};

const state = {
  records: [],
  buckets: { A: [], B: [], C: [], D: [] },
  counts: { A: 0, B: 0, C: 0, D: 0 },
  transitions: Object.fromEntries(CLASS_ORDER.map((from) => [from, Object.fromEntries(CLASS_ORDER.map((to) => [to, 0]))])),
  decades: [0, 0, 0, 0, 0],
  selectedIndex: 0,
  selectedClass: null,
  bucketIndex: 0,
  playing: true,
  speed: 1,
  progress: 0,
  lastFrame: 0,
  ready: false
};

const elements = {
  loading: document.getElementById('geometryLoading'),
  loadingPercent: document.getElementById('geometryLoadingPercent'),
  loadingProgress: document.getElementById('geometryLoadingProgress'),
  loadingBar: document.getElementById('geometryLoadingBar'),
  loadingText: document.getElementById('geometryLoadingText'),
  selectedClass: document.getElementById('selectedClass'),
  selectedPrime: document.getElementById('selectedPrime'),
  selectedBlocks: document.getElementById('selectedBlocks'),
  playButton: document.getElementById('playButton'),
  stepButton: document.getElementById('stepButton'),
  speedRange: document.getElementById('speedRange'),
  classButtons: [...document.querySelectorAll('[data-class]')],
  canvas: document.getElementById('geometryCanvas'),
  status: document.getElementById('animationStatus'),
  frequencyChart: document.getElementById('frequencyChart'),
  transitionChart: document.getElementById('transitionChart'),
  modelChart: document.getElementById('modelChart'),
  decadeChart: document.getElementById('decadeChart'),
  frequencyNote: document.getElementById('frequencyNote'),
  modelNote: document.getElementById('modelNote'),
  decadeNote: document.getElementById('decadeNote')
};

const context = elements.canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function classFromPrime(prime) {
  return ({ 1: 'A', 3: 'B', 7: 'C', 9: 'D' })[prime % 10];
}

function parseRecord(line) {
  const value = line.trim();
  if (!value || value.startsWith('#')) return null;
  const record = JSON.parse(value);
  return {
    version: record.version,
    prime: record.prime,
    approximation: record.metrics.approximation
  };
}

function addRecord(record) {
  const className = classFromPrime(record.prime);
  if (!className) return;
  const minimal = { ...record, className };
  const previous = state.records.at(-1);
  state.records.push(minimal);
  state.buckets[className].push(minimal);
  state.counts[className] += 1;
  if (previous) state.transitions[previous.className][className] += 1;
}

function updateLoading(percent, text) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  elements.loadingBar.style.width = `${safe}%`;
  elements.loadingPercent.textContent = `${Math.round(safe)}%`;
  elements.loadingProgress.setAttribute('aria-valuenow', String(Math.round(safe)));
  elements.loadingText.textContent = text;
}

function finishLoading() {
  updateLoading(100, 'Charts ready.');
  window.setTimeout(() => elements.loading.classList.add('complete'), 180);
}

function allowPaint() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadDataset() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('Streaming non disponibile');

    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let loaded = 0;
    let painted = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      pending += decoder.decode(value, { stream: true });
      let newline = pending.indexOf('\n');
      while (newline >= 0) {
        const record = parseRecord(pending.slice(0, newline));
        if (record) addRecord(record);
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
      if (loaded - painted >= 1_000_000) {
        painted = loaded;
        const percent = total ? loaded / total * 100 : 0;
        updateLoading(percent, `${state.records.length} primes analyzed`);
        await allowPaint();
      }
    }

    pending += decoder.decode();
    if (pending.trim()) {
      const record = parseRecord(pending);
      if (record) addRecord(record);
    }

    computeDecades();
    renderAllCharts();
    state.ready = true;
    state.progress = reducedMotion ? 1 : 0;
    if (reducedMotion) state.playing = false;
    updateSelectionLabels();
    finishLoading();
    requestAnimationFrame(animate);
  } catch (error) {
    elements.loadingText.textContent = `Error: ${error.message}`;
    elements.status.textContent = 'Start a local server from the project folder.';
  }
}

function computeDecades() {
  const primeSet = new Set(state.records.map((record) => record.prime));
  const lastPrime = state.records.at(-1).prime;
  for (let base = 10; base + 1 <= lastPrime; base += 10) {
    let count = 0;
    for (const residue of [1, 3, 7, 9]) if (primeSet.has(base + residue)) count += 1;
    state.decades[count] += 1;
  }
}

function selectedRecord() {
  if (state.selectedClass) return state.buckets[state.selectedClass][state.bucketIndex] || state.buckets[state.selectedClass][0];
  return state.records[state.selectedIndex] || state.records[0];
}

function nextRecord() {
  if (!state.records.length) return;
  if (state.selectedClass) {
    state.bucketIndex = (state.bucketIndex + 1) % state.buckets[state.selectedClass].length;
  } else {
    state.selectedIndex = (state.selectedIndex + 1) % state.records.length;
  }
  state.progress = reducedMotion ? 1 : 0;
  updateSelectionLabels();
}

function updateSelectionLabels() {
  const record = selectedRecord();
  if (!record) return;
  const config = CLASS_CONFIG[record.className];
  elements.selectedClass.textContent = record.className;
  elements.selectedPrime.textContent = `p=${record.prime} | v${record.version}`;
  elements.selectedBlocks.textContent = config.label;
  elements.classButtons.forEach((button) => button.classList.toggle('active', button.dataset.class === state.selectedClass));
  const integerTriangle = findIntegerTriangle(record.prime);
  const triangleText = integerTriangle ? ` | triangolo intero ${integerTriangle[0]}^2+${integerTriangle[1]}^2` : ' | triangolo reale modulare';
  elements.status.textContent = `${record.className}: ${record.prime} = ${Math.floor(record.prime / 10) * 10} ${config.label} | r=${config.residue}${triangleText}`;
}

function findIntegerTriangle(prime) {
  if (prime % 4 !== 1) return null;
  for (let a = 1; a * a <= prime / 2; a += 1) {
    const b = Math.sqrt(prime - a * a);
    if (Number.isInteger(b)) return [a, b];
  }
  return null;
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function ease(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resizeCanvas() {
  const width = Math.max(320, elements.canvas.clientWidth);
  const height = width < 760 ? 820 : 390;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (elements.canvas.width !== Math.round(width * dpr) || elements.canvas.height !== Math.round(height * dpr)) {
    elements.canvas.width = Math.round(width * dpr);
    elements.canvas.height = Math.round(height * dpr);
    elements.canvas.style.height = `${height}px`;
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

function panelLayouts(width, height) {
  const gap = 10;
  if (width < 760) {
    const panelHeight = (height - gap * 4) / 3;
    return [0, 1, 2].map((index) => ({ x: gap, y: gap + index * (panelHeight + gap), width: width - gap * 2, height: panelHeight }));
  }
  const panelWidth = (width - gap * 4) / 3;
  return [0, 1, 2].map((index) => ({ x: gap + index * (panelWidth + gap), y: gap, width: panelWidth, height: height - gap * 2 }));
}

function drawPanel(rect, title, axisText) {
  const line = cssColor('--line');
  const text = cssColor('--text');
  const muted = cssColor('--muted');
  context.strokeStyle = line;
  context.lineWidth = 1;
  context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  context.fillStyle = text;
  context.font = '600 11px Consolas, monospace';
  context.fillText(title, rect.x + 10, rect.y + 18);
  context.fillStyle = muted;
  context.font = '9px Consolas, monospace';
  context.fillText(axisText, rect.x + 10, rect.y + 33);
}

function drawArrow(x1, y1, x2, y2, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.beginPath();
  context.moveTo(x2, y2);
  context.lineTo(x2 - 6 * Math.cos(angle - Math.PI / 6), y2 - 6 * Math.sin(angle - Math.PI / 6));
  context.lineTo(x2 - 6 * Math.cos(angle + Math.PI / 6), y2 - 6 * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
}

function drawDecadePanel(rect, record, progress) {
  drawPanel(rect, '1 | DECADE PLANE', 'x = number n | y = residue n-10k');
  const config = CLASS_CONFIG[record.className];
  const green = cssColor('--green');
  const cyan = cssColor('--cyan');
  const muted = cssColor('--muted');
  const text = cssColor('--text');
  const left = rect.x + 42;
  const right = rect.x + rect.width - 18;
  const bottom = rect.y + rect.height - 34;
  const top = rect.y + 52;
  const sx = (right - left) / 10;
  const sy = (bottom - top) / 10;
  const base = Math.floor(record.prime / 10) * 10;

  drawArrow(left, bottom, right, bottom, muted);
  drawArrow(left, bottom, left, top, muted);
  context.fillStyle = muted;
  context.font = '9px Consolas, monospace';
  context.fillText(String(base), left - 8, bottom + 16);
  context.fillText(String(base + 10), right - 18, bottom + 16);
  context.fillText('0', left - 14, bottom + 3);
  context.fillText('9', left - 14, top + sy);

  for (const className of CLASS_ORDER) {
    const residue = CLASS_CONFIG[className].residue;
    const x = left + residue * sx;
    const y = bottom - residue * sy;
    context.fillStyle = className === record.className ? cyan : muted;
    context.globalAlpha = className === record.className ? 1 : 0.35;
    context.beginPath();
    context.arc(x, y, 3, 0, Math.PI * 2);
    context.fill();
    context.fillText(className, x + 5, y - 4);
  }
  context.globalAlpha = 1;

  const reveal = ease(progress) * config.blocks.length;
  let cumulative = 0;
  config.blocks.forEach((block, index) => {
    const local = clamp(reveal - index);
    if (local <= 0) return;
    const startX = left + cumulative * sx;
    const startY = bottom - cumulative * sy;
    const endValue = cumulative + block * local;
    const endX = left + endValue * sx;
    const endY = bottom - endValue * sy;
    const color = block === 5 ? green : block === 2 ? cyan : text;
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    context.fillStyle = color;
    context.font = '10px Consolas, monospace';
    context.fillText(`+${block}`, (startX + endX) / 2 + 4, (startY + endY) / 2 - 4);
    cumulative += block;
  });
}

function drawClassShape(className, x, y, size, color, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  if (className === 'A') context.arc(x, y, size, 0, Math.PI * 2);
  if (className === 'B') context.rect(x - size, y - size, size * 2, size * 2);
  if (className === 'C') {
    context.moveTo(x, y - size * 1.2);
    context.lineTo(x + size, y + size);
    context.lineTo(x - size, y + size);
    context.closePath();
  }
  if (className === 'D') {
    context.moveTo(x, y - size * 1.25);
    context.lineTo(x + size, y);
    context.lineTo(x, y + size * 1.25);
    context.lineTo(x - size, y);
    context.closePath();
  }
  context.fill();
  context.restore();
}

function drawWheelPanel(rect, record, progress) {
  drawPanel(rect, '2 | MODULO 10 WHEEL', 'x = cos(2pi r/10) | y = sin(2pi r/10)');
  const cyan = cssColor('--cyan');
  const green = cssColor('--green');
  const muted = cssColor('--muted');
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2 + 14;
  const radius = Math.min(rect.width, rect.height - 66) * 0.32;

  context.strokeStyle = muted;
  context.globalAlpha = 0.5;
  context.strokeRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  drawArrow(centerX - radius - 12, centerY, centerX + radius + 12, centerY, muted);
  drawArrow(centerX, centerY + radius + 12, centerX, centerY - radius - 12, muted);
  context.globalAlpha = 1;

  for (const className of CLASS_ORDER) {
    const residue = CLASS_CONFIG[className].residue;
    const angle = -Math.PI / 2 + 2 * Math.PI * residue / 10;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    drawClassShape(className, x, y, className === record.className ? 6 : 4, className === record.className ? green : cyan, className === record.className ? 1 : 0.45);
    context.fillStyle = className === record.className ? green : muted;
    context.font = '10px Consolas, monospace';
    context.fillText(`${className}:${residue}`, x + 8, y + 3);
  }

  const targetAngle = -Math.PI / 2 + 2 * Math.PI * CLASS_CONFIG[record.className].residue / 10;
  const animatedAngle = -Math.PI / 2 + (targetAngle + Math.PI / 2) * ease(progress);
  const px = centerX + Math.cos(animatedAngle) * radius;
  const py = centerY + Math.sin(animatedAngle) * radius;
  context.strokeStyle = green;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.lineTo(px, py);
  context.stroke();
  drawClassShape(record.className, px, py, 7, green);
}

function drawRootPanel(rect, record, progress) {
  drawPanel(rect, '3 | ROOT CIRCLE', 'x,y = legs | x^2+y^2=p | tangent');
  const config = CLASS_CONFIG[record.className];
  const green = cssColor('--green');
  const cyan = cssColor('--cyan');
  const muted = cssColor('--muted');
  const text = cssColor('--text');
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2 + 15;
  const maxRadius = Math.min(rect.width, rect.height - 70) * 0.31;
  const radius = maxRadius * ease(progress);
  const theta = -Math.PI / 2 + 2 * Math.PI * config.residue / 10;
  const root = Math.sqrt(record.prime);
  const xValue = root * Math.cos(theta);
  const yValue = -root * Math.sin(theta);

  drawArrow(centerX - maxRadius - 14, centerY, centerX + maxRadius + 14, centerY, muted);
  drawArrow(centerX, centerY + maxRadius + 14, centerX, centerY - maxRadius - 14, muted);
  context.strokeStyle = muted;
  context.globalAlpha = 0.55;
  context.strokeRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;

  const px = centerX + Math.cos(theta) * radius;
  const py = centerY + Math.sin(theta) * radius;
  context.strokeStyle = green;
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(centerX, centerY);
  context.lineTo(px, py);
  context.stroke();

  context.strokeStyle = cyan;
  context.lineWidth = 1;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(px, py);
  context.lineTo(px, centerY);
  context.lineTo(centerX, centerY);
  context.stroke();
  context.setLineDash([]);

  const tx = -Math.sin(theta);
  const ty = Math.cos(theta);
  context.strokeStyle = text;
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(px - tx * radius * 0.75, py - ty * radius * 0.75);
  context.lineTo(px + tx * radius * 0.75, py + ty * radius * 0.75);
  context.stroke();
  drawClassShape(record.className, px, py, 6, green);

  if (progress > 0.55) {
    context.fillStyle = text;
    context.font = '9px Consolas, monospace';
    context.fillText(`sqrt(${record.prime})=${root.toFixed(5)}`, rect.x + 10, rect.y + rect.height - 42);
    context.fillStyle = muted;
    context.fillText(`x=${xValue.toFixed(3)} | y=${yValue.toFixed(3)}`, rect.x + 10, rect.y + rect.height - 28);
    context.fillText(`x^2+y^2=${record.prime}`, rect.x + 10, rect.y + rect.height - 14);
  }
}

function drawScene() {
  if (!state.ready) return;
  const { width, height } = resizeCanvas();
  context.clearRect(0, 0, width, height);
  const record = selectedRecord();
  const panels = panelLayouts(width, height);
  drawDecadePanel(panels[0], record, clamp(state.progress * 3));
  drawWheelPanel(panels[1], record, clamp((state.progress - 1 / 3) * 3));
  drawRootPanel(panels[2], record, clamp((state.progress - 2 / 3) * 3));
}

function animate(timestamp) {
  if (!state.ready) return;
  if (!state.lastFrame) state.lastFrame = timestamp;
  const elapsed = timestamp - state.lastFrame;
  state.lastFrame = timestamp;
  if (state.playing && !reducedMotion) {
    state.progress += elapsed / (5200 / state.speed);
    if (state.progress >= 1) nextRecord();
  }
  drawScene();
  requestAnimationFrame(animate);
}

function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function resetSvg(svg) {
  [...svg.children].forEach((child) => {
    if (!['title', 'desc'].includes(child.tagName.toLowerCase())) child.remove();
  });
}

function renderFrequencyChart() {
  const svg = elements.frequencyChart;
  resetSvg(svg);
  const total = state.records.length;
  const left = 62, right = 620, top = 20, bottom = 270;
  svg.append(svgElement('rect', { x: left, y: top, width: right - left, height: bottom - top, class: 'chart-frame' }));
  for (let tick = 0; tick <= 30; tick += 5) {
    const y = bottom - tick / 30 * (bottom - top);
    svg.append(svgElement('line', { x1: left, y1: y, x2: right, y2: y, class: 'grid-line' }));
    svg.append(svgElement('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 'chart-muted' }, `${tick}%`));
  }
  const referenceY = bottom - 25 / 30 * (bottom - top);
  svg.append(svgElement('line', { x1: left, y1: referenceY, x2: right, y2: referenceY, class: 'reference' }));
  const slot = (right - left) / 4;
  CLASS_ORDER.forEach((className, index) => {
    const rate = state.counts[className] / total * 100;
    const height = rate / 30 * (bottom - top);
    const x = left + index * slot + slot * 0.22;
    const width = slot * 0.56;
    svg.append(svgElement('rect', { x, y: bottom - height, width, height, class: 'bar' }));
    svg.append(svgElement('text', { x: x + width / 2, y: bottom - height - 7, 'text-anchor': 'middle', class: 'chart-label' }, `${rate.toFixed(3)}%`));
    svg.append(svgElement('text', { x: x + width / 2, y: bottom + 21, 'text-anchor': 'middle', class: 'chart-label' }, `${className} | ${CLASS_CONFIG[className].label}`));
  });
  svg.append(svgElement('text', { x: 18, y: 155, transform: 'rotate(-90 18 155)', 'text-anchor': 'middle', class: 'chart-muted' }, 'y = share of primes (%)'));
  svg.append(svgElement('text', { x: 340, y: 312, 'text-anchor': 'middle', class: 'chart-muted' }, 'x = final-digit class'));
  elements.frequencyNote.textContent = `${total.toLocaleString('en-GB')} primes | 25% reference`;
}

function renderTransitionChart() {
  const svg = elements.transitionChart;
  resetSvg(svg);
  const left = 110, top = 54, cellW = 112, cellH = 76;
  const values = CLASS_ORDER.flatMap((from) => CLASS_ORDER.map((to) => state.transitions[from][to]));
  const max = Math.max(...values);
  CLASS_ORDER.forEach((className, index) => {
    svg.append(svgElement('text', { x: left + index * cellW + cellW / 2, y: 35, 'text-anchor': 'middle', class: 'chart-label' }, className));
    svg.append(svgElement('text', { x: 78, y: top + index * cellH + cellH / 2 + 4, 'text-anchor': 'middle', class: 'chart-label' }, className));
  });
  CLASS_ORDER.forEach((from, row) => CLASS_ORDER.forEach((to, column) => {
    const value = state.transitions[from][to];
    const x = left + column * cellW;
    const y = top + row * cellH;
    svg.append(svgElement('rect', { x, y, width: cellW - 4, height: cellH - 4, fill: 'var(--green)', opacity: (0.12 + value / max * 0.78).toFixed(3) }));
    svg.append(svgElement('text', { x: x + (cellW - 4) / 2, y: y + 34, 'text-anchor': 'middle', class: 'chart-label' }, value.toLocaleString('en-GB')));
    svg.append(svgElement('text', { x: x + (cellW - 4) / 2, y: y + 53, 'text-anchor': 'middle', class: 'chart-muted' }, `${(value / state.counts[from] * 100).toFixed(1)}%`));
  }));
  svg.append(svgElement('text', { x: 22, y: 210, transform: 'rotate(-90 22 210)', 'text-anchor': 'middle', class: 'chart-muted' }, 'y = current prime class'));
  svg.append(svgElement('text', { x: 335, y: 405, 'text-anchor': 'middle', class: 'chart-muted' }, 'x = next prime class'));
}

function renderModelChart() {
  const svg = elements.modelChart;
  resetSvg(svg);
  const paperCounts = [
    4623042, 7429438, 7504612, 5442345,
    6010982, 4442562, 7043695, 7502896,
    6373981, 6755195, 4439355, 7431870,
    7991431, 6372941, 6012739, 4622916
  ];
  const paperTotal = paperCounts.reduce((sum, value) => sum + value, 0);
  const transitionTotal = Math.max(1, state.records.length - 1);
  const lastPrime = state.records.at(-1).prime;
  const correction = Math.log(Math.log(lastPrime)) / Math.log(lastPrime);
  const uniform = 6.25;
  const rows = CLASS_ORDER.flatMap((from) => CLASS_ORDER.map((to) => ({ from, to })));
  const left = 92, right = 618, top = 52, bottom = 506;
  const rowHeight = (bottom - top) / rows.length;
  const maxPercent = 10;
  const xFor = (percent) => left + percent / maxPercent * (right - left);

  svg.append(svgElement('text', { x: left - 10, y: 25, 'text-anchor': 'end', class: 'chart-muted' }, 'TRANSITION'));
  svg.append(svgElement('text', { x: (left + right) / 2, y: 25, 'text-anchor': 'middle', class: 'chart-muted' }, 'SHARE OF ALL CONSECUTIVE PAIRS'));
  svg.append(svgElement('rect', { x: left, y: top, width: right - left, height: bottom - top, class: 'chart-frame' }));
  for (let tick = 0; tick <= maxPercent; tick += 2) {
    const x = xFor(tick);
    svg.append(svgElement('line', { x1: x, y1: top, x2: x, y2: bottom, class: 'grid-line' }));
    svg.append(svgElement('text', { x, y: bottom + 20, 'text-anchor': 'middle', class: 'chart-muted' }, `${tick}%`));
  }
  svg.append(svgElement('line', { x1: xFor(uniform), y1: top, x2: xFor(uniform), y2: bottom, class: 'reference' }));

  rows.forEach(({ from, to }, index) => {
    const observed = state.transitions[from][to] / transitionTotal * 100;
    const c1 = from === to ? -1.5 : 0.5;
    const model = (1 + c1 * correction) / 16 * 100;
    const published = paperCounts[index] / paperTotal * 100;
    const y = top + rowHeight * (index + 0.5);
    const barHeight = Math.max(5, rowHeight * 0.42);
    svg.append(svgElement('text', { x: left - 10, y: y + 4, 'text-anchor': 'end', class: 'chart-label' }, `${from} -> ${to}`));
    svg.append(svgElement('rect', { x: left, y: y - barHeight / 2, width: Math.max(0, xFor(observed) - left), height: barHeight, class: 'model-observed' }));
    svg.append(svgElement('circle', { cx: xFor(model), cy: y, r: 4.5, class: 'model-los' }));
    const px = xFor(published);
    svg.append(svgElement('path', { d: `M ${px} ${y - 5} L ${px + 5} ${y} L ${px} ${y + 5} L ${px - 5} ${y} Z`, class: 'model-paper' }));
  });
  svg.append(svgElement('text', { x: 355, y: 550, 'text-anchor': 'middle', class: 'chart-muted' }, 'x axis = percentage of total | y axis = current class -> next class'));
  elements.modelNote.textContent = `x = ${lastPrime.toLocaleString('en-GB')} | c(x) = log(log(x)) / log(x) = ${correction.toFixed(4)}`;
}

function renderDecadeChart() {
  const svg = elements.decadeChart;
  resetSvg(svg);
  const left = 62, right = 620, top = 20, bottom = 270;
  const max = Math.max(...state.decades);
  svg.append(svgElement('rect', { x: left, y: top, width: right - left, height: bottom - top, class: 'chart-frame' }));
  const slot = (right - left) / 5;
  state.decades.forEach((value, index) => {
    const height = value / max * (bottom - top - 25);
    const x = left + index * slot + slot * 0.2;
    const width = slot * 0.6;
    svg.append(svgElement('rect', { x, y: bottom - height, width, height, class: index === 4 ? 'chart-cyan' : 'bar' }));
    svg.append(svgElement('text', { x: x + width / 2, y: bottom - height - 7, 'text-anchor': 'middle', class: 'chart-label' }, value.toLocaleString('en-GB')));
    svg.append(svgElement('text', { x: x + width / 2, y: bottom + 21, 'text-anchor': 'middle', class: 'chart-label' }, String(index)));
  });
  svg.append(svgElement('text', { x: 18, y: 155, transform: 'rotate(-90 18 155)', 'text-anchor': 'middle', class: 'chart-muted' }, 'y = number of decades'));
  svg.append(svgElement('text', { x: 340, y: 312, 'text-anchor': 'middle', class: 'chart-muted' }, 'x = primes among 10k+1,3,7,9'));
  elements.decadeNote.textContent = `${state.decades.reduce((sum, value) => sum + value, 0).toLocaleString('en-GB')} decades`;
}

function renderAllCharts() {
  renderFrequencyChart();
  renderTransitionChart();
  renderModelChart();
  renderDecadeChart();
}

elements.playButton.addEventListener('click', () => {
  state.playing = !state.playing;
  elements.playButton.textContent = state.playing ? 'Pause' : 'Resume';
});

elements.stepButton.addEventListener('click', nextRecord);
elements.speedRange.addEventListener('input', () => { state.speed = Number(elements.speedRange.value); });
elements.classButtons.forEach((button) => button.addEventListener('click', () => {
  const selected = button.dataset.class;
  state.selectedClass = state.selectedClass === selected ? null : selected;
  state.bucketIndex = 0;
  state.progress = reducedMotion ? 1 : 0;
  updateSelectionLabels();
}));

window.addEventListener('resize', drawScene);
loadDataset();
