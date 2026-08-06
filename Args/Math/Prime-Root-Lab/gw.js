'use strict';

const DATA_URL = './data/prime-roots.txt';
const CLASS_ORDER = ['A', 'B', 'C', 'D'];
const ARM_LENGTH = 4000;
const LASER_WAVELENGTH = 1064e-9;
const MAX_DISPLAY_FREQUENCY = 500;
const VIDEO_DURATION = 54.166667;
const VIDEO_SYNC_TOLERANCE = 0.002;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  primes: [], bins: [], signal: new Float64Array(), spectrogram: null, psd: null,
  duration: 12, sampleRate: 4096, fftSize: 512, binSize: 256,
  signalMode: 'prime', noiseMode: 'ideal', whitened: false,
  elapsed: 0, lastFrame: 0, playing: !reducedMotion, ready: false,
  audioOn: false, audioContext: null, audioSource: null, audioGain: null
};

const elements = {
  loading: document.getElementById('loadingScreen'),
  loadingPercent: document.getElementById('loadingPercent'),
  loadingProgress: document.getElementById('loadingProgress'),
  loadingBar: document.getElementById('loadingBar'),
  loadingText: document.getElementById('loadingText'),
  playButton: document.getElementById('playButton'),
  audioButton: document.getElementById('audioButton'),
  whitenButton: document.getElementById('whitenButton'),
  syncVideoButton: document.getElementById('syncVideoButton'),
  sampleRate: document.getElementById('sampleRateSelect'),
  fft: document.getElementById('fftSelect'),
  bin: document.getElementById('binSelect'),
  signalMode: document.getElementById('signalModeSelect'),
  noiseMode: document.getElementById('noiseModeSelect'),
  duration: document.getElementById('durationRange'),
  durationOutput: document.getElementById('durationOutput'),
  timeValue: document.getElementById('timeValue'),
  deltaValue: document.getElementById('deltaValue'),
  strainValue: document.getElementById('strainValue'),
  frequencyValue: document.getElementById('frequencyValue'),
  audioStatus: document.getElementById('audioStatus'),
  cbcPhaseValue: document.getElementById('cbcPhaseValue'),
  videoSyncStatus: document.getElementById('videoSyncStatus'),
  phaseValue: document.getElementById('phaseValue'),
  samplingSummary: document.getElementById('samplingSummary'),
  mappingSummary: document.getElementById('mappingSummary'),
  psdSummary: document.getElementById('psdSummary'),
  qualityStatus: document.getElementById('qualityStatus'),
  classValues: Object.fromEntries(CLASS_ORDER.map((name) => [name, document.getElementById(`class${name}Value`)])),
  interferometer: document.getElementById('interferometerCanvas'),
  spectrogram: document.getElementById('spectrogramCanvas'),
  deviation: document.getElementById('deviationCanvas'),
  psd: document.getElementById('psdCanvas'),
  videoPanel: document.getElementById('referenceVideoPanel'),
  video: document.getElementById('referenceVideo'),
  videoTimeValue: document.getElementById('videoTimeValue')
};

function classFromPrime(prime) {
  return ({ 1: 'A', 3: 'B', 7: 'C', 9: 'D' })[prime % 10];
}

function updateLoading(percent, message) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  elements.loadingBar.style.width = `${safe}%`;
  elements.loadingPercent.textContent = `${Math.round(safe)}%`;
  elements.loadingProgress.setAttribute('aria-valuenow', String(Math.round(safe)));
  elements.loadingText.textContent = message;
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
        parseLine(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        newline = pending.indexOf('\n');
      }
      if (loaded - painted >= 1_000_000) {
        painted = loaded;
        updateLoading(total ? loaded / total * 100 : 0, `${state.primes.length.toLocaleString('en-GB')} primes read`);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }
    pending += decoder.decode();
    if (pending.trim()) parseLine(pending);
    rebuildModel();
    state.ready = true;
    updateLoading(100, 'Simulation ready.');
    window.setTimeout(() => elements.loading.classList.add('complete'), 180);
    requestAnimationFrame(animate);
  } catch (error) {
    elements.loadingText.textContent = `Error: ${error.message}`;
  }
}

function parseLine(line) {
  const value = line.trim();
  if (!value || value.startsWith('#')) return;
  const record = JSON.parse(value);
  if (Number.isFinite(record.prime)) state.primes.push(record.prime);
}

function buildBins() {
  state.bins = [];
  for (let start = 0; start < state.primes.length; start += state.binSize) {
    const chunk = state.primes.slice(start, Math.min(state.primes.length, start + state.binSize));
    if (chunk.length < Math.max(16, state.binSize / 4)) continue;
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    chunk.forEach((prime) => {
      const className = classFromPrime(prime);
      if (className) counts[className] += 1;
    });
    const delta = (counts.A + counts.C - counts.B - counts.D) / chunk.length;
    state.bins.push({ delta, counts, startVersion: start + 1, endVersion: start + chunk.length });
  }
}

function interpolateDelta(unitTime) {
  if (!state.bins.length) return 0;
  const position = Math.max(0, Math.min(1, unitTime)) * (state.bins.length - 1);
  const low = Math.floor(position);
  const high = Math.min(state.bins.length - 1, low + 1);
  const mix = position - low;
  return state.bins[low].delta * (1 - mix) + state.bins[high].delta * mix;
}

function maxDelta() {
  return Math.max(1e-12, ...state.bins.map((bin) => Math.abs(bin.delta)));
}

function phaseBoundaries() {
  return videoIsSynchronized() ? { inspiralEnd: 0.38, mergerEnd: 0.52 } : { inspiralEnd: 0.78, mergerEnd: 0.86 };
}

function cbcPhase(unitTime) {
  const { inspiralEnd, mergerEnd } = phaseBoundaries();
  if (unitTime < inspiralEnd) return 'INSPIRAL';
  if (unitTime < mergerEnd) return 'MERGER';
  return 'RINGDOWN';
}

function chirpFrequency(unitTime) {
  const u = Math.max(0, Math.min(1, unitTime));
  const { inspiralEnd, mergerEnd } = phaseBoundaries();
  if (u < inspiralEnd) {
    const x = u / inspiralEnd;
    const regularized = Math.pow(1 - 0.94 * x, -3 / 8);
    const start = Math.pow(1, -3 / 8);
    const end = Math.pow(0.06, -3 / 8);
    return 30 + 190 * (regularized - start) / (end - start);
  }
  if (u < mergerEnd) return 220 + 90 * (u - inspiralEnd) / (mergerEnd - inspiralEnd);
  return 250;
}

function cbcEnvelope(unitTime) {
  const u = Math.max(0, Math.min(1, unitTime));
  const { inspiralEnd, mergerEnd } = phaseBoundaries();
  if (u < inspiralEnd) return 0.06 + 0.74 * Math.pow(u / inspiralEnd, 1.8);
  if (u < mergerEnd) return 0.8 + 0.2 * Math.sin((u - inspiralEnd) / (mergerEnd - inspiralEnd) * Math.PI / 2);
  const decay = videoIsSynchronized() ? 0.18 : 0.055;
  return Math.exp(-(u - mergerEnd) / decay);
}

function seededNoise(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function buildSignal() {
  const length = Math.max(state.fftSize, Math.round(state.duration * state.sampleRate));
  const signal = new Float64Array(length);
  const peak = maxDelta();
  const random = seededNoise(250114);
  let phase = 0;
  let spareGaussian = null;
  const gaussian = () => {
    if (spareGaussian !== null) {
      const value = spareGaussian;
      spareGaussian = null;
      return value;
    }
    const a = Math.max(1e-12, random());
    const b = random();
    const radius = Math.sqrt(-2 * Math.log(a));
    spareGaussian = radius * Math.sin(2 * Math.PI * b);
    return radius * Math.cos(2 * Math.PI * b);
  };
  let absolutePeak = 1e-12;
  for (let index = 0; index < length; index += 1) {
    const unitTime = index / Math.max(1, length - 1);
    const normalizedDelta = interpolateDelta(unitTime) / peak;
    const frequency = chirpFrequency(unitTime);
    phase += 2 * Math.PI * frequency / state.sampleRate;
    const carrier = cbcEnvelope(unitTime) * Math.sin(phase);
    const primeModulation = 0.3 + 0.7 * normalizedDelta;
    let sample = state.signalMode === 'prime' ? carrier * primeModulation : carrier;
    if (state.noiseMode !== 'ideal') sample += 0.16 * gaussian();
    if (state.noiseMode === 'glitch') {
      const centered = (unitTime - 0.56) / 0.009;
      const burst = Math.exp(-0.5 * centered * centered) * Math.sin(2 * Math.PI * 170 * index / state.sampleRate);
      sample += 1.15 * burst;
    }
    signal[index] = Number.isFinite(sample) ? sample : 0;
    absolutePeak = Math.max(absolutePeak, Math.abs(signal[index]));
  }
  const scale = 0.92 / absolutePeak;
  for (let index = 0; index < signal.length; index += 1) signal[index] *= scale;
  state.signal = signal;
}

function fftInPlace(real, imaginary) {
  const length = real.length;
  let target = 0;
  for (let index = 1; index < length; index += 1) {
    let bit = length >> 1;
    while (target & bit) { target ^= bit; bit >>= 1; }
    target ^= bit;
    if (index < target) {
      [real[index], real[target]] = [real[target], real[index]];
      [imaginary[index], imaginary[target]] = [imaginary[target], imaginary[index]];
    }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = -2 * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < length; start += size) {
      let weightReal = 1;
      let weightImaginary = 0;
      for (let offset = 0; offset < size / 2; offset += 1) {
        const even = start + offset;
        const odd = even + size / 2;
        const oddReal = real[odd] * weightReal - imaginary[odd] * weightImaginary;
        const oddImaginary = real[odd] * weightImaginary + imaginary[odd] * weightReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = weightReal * stepReal - weightImaginary * stepImaginary;
        weightImaginary = weightReal * stepImaginary + weightImaginary * stepReal;
        weightReal = nextReal;
      }
    }
  }
}

function buildSpectrogram() {
  const hop = state.fftSize / 4;
  const frameCount = Math.max(1, Math.floor((state.signal.length - state.fftSize) / hop) + 1);
  const maxBin = Math.max(1, Math.min(state.fftSize / 2, Math.floor(MAX_DISPLAY_FREQUENCY * state.fftSize / state.sampleRate)));
  const frequencyBins = maxBin + 1;
  const powers = new Float32Array(frameCount * frequencyBins);
  const psd = new Float64Array(frequencyBins);
  const windowEnergy = state.fftSize * 0.375;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const real = new Float64Array(state.fftSize);
    const imaginary = new Float64Array(state.fftSize);
    const start = frame * hop;
    for (let index = 0; index < state.fftSize; index += 1) {
      const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (state.fftSize - 1));
      real[index] = (state.signal[start + index] || 0) * windowValue;
    }
    fftInPlace(real, imaginary);
    for (let bin = 0; bin <= maxBin; bin += 1) {
      const power = Math.max(1e-20, (real[bin] * real[bin] + imaginary[bin] * imaginary[bin]) / (state.sampleRate * windowEnergy));
      powers[frame * frequencyBins + bin] = power;
      psd[bin] += power;
    }
  }
  for (let bin = 0; bin < frequencyBins; bin += 1) psd[bin] /= frameCount;
  let minimum = Infinity;
  let maximum = -Infinity;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let bin = 0; bin < frequencyBins; bin += 1) {
      const index = frame * frequencyBins + bin;
      const displayPower = state.whitened ? powers[index] / Math.max(1e-20, psd[bin]) : powers[index];
      const db = 10 * Math.log10(Math.max(1e-20, displayPower));
      powers[index] = db;
      minimum = Math.min(minimum, db);
      maximum = Math.max(maximum, db);
    }
  }
  state.psd = psd;
  state.spectrogram = { values: powers, frameCount, frequencyBins, minimum, maximum, hop, raster: null };
}

function videoIsSynchronized() {
  return Math.abs(state.duration - VIDEO_DURATION) <= VIDEO_SYNC_TOLERANCE;
}

function updateVideoVisibility() {
  const synchronized = videoIsSynchronized();
  elements.videoPanel.hidden = !synchronized;
  elements.videoSyncStatus.textContent = synchronized ? 'video synchronized 1:1' : 'video not synchronized';
  if (!synchronized) {
    elements.video.pause();
  } else {
    elements.video.currentTime = Math.min(state.elapsed, VIDEO_DURATION - 0.001);
    if (state.playing) elements.video.play().catch(() => {});
  }
}

function stopAudioSource() {
  if (!state.audioSource) return;
  try { state.audioSource.stop(); } catch (error) { void error; }
  state.audioSource.disconnect();
  state.audioSource = null;
}

function startAudioSource() {
  if (!state.audioOn || !state.audioContext || !state.playing || !state.signal.length) return;
  stopAudioSource();
  const buffer = state.audioContext.createBuffer(1, state.signal.length, state.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < state.signal.length; index += 1) channel[index] = state.signal[index];
  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(state.audioGain);
  source.start(0, Math.min(state.elapsed, state.duration - 0.001));
  state.audioSource = source;
}

function rebuildModel() {
  buildBins();
  buildSignal();
  buildSpectrogram();
  state.elapsed = Math.min(state.elapsed, state.duration);
  elements.durationOutput.textContent = `${state.duration.toFixed(3)} s`;
  const deltaFrequency = state.sampleRate / state.fftSize;
  const deltaTime = (state.fftSize / 4) / state.sampleRate;
  elements.samplingSummary.textContent = `fs=${state.sampleRate} Hz | Nyquist=${state.sampleRate / 2} Hz | Delta f=${deltaFrequency.toFixed(2)} Hz | Delta t=${deltaTime.toFixed(4)} s | overlap=75%`;
  elements.mappingSummary.textContent = `${state.primes.length.toLocaleString('en-GB')} primes -> ${state.bins.length} windows -> ${state.duration.toFixed(3)} simulated s`;
  elements.psdSummary.textContent = `Welch/Hann | 75% overlap | ASD = square root of PSD | ${state.whitened ? 'whitened view' : 'raw view'}`;
  elements.qualityStatus.className = 'quality-status';
  if (state.noiseMode === 'ideal') elements.qualityStatus.textContent = 'IDEAL - no added noise';
  if (state.noiseMode === 'noise') {
    elements.qualityStatus.textContent = 'NOISE - synthetic Gaussian floor, no real nonstationarity';
    elements.qualityStatus.classList.add('warning-state');
  }
  if (state.noiseMode === 'glitch') {
    elements.qualityStatus.textContent = 'GLITCH - synthetic transient at 56% of the duration, to be distinguished from the chirp';
    elements.qualityStatus.classList.add('glitch-state');
  }
  updateVideoVisibility();
  if (state.audioOn) startAudioSource();
  drawStaticViews();
}

function prepareCanvas(canvas, cssHeight) {
  const width = Math.max(300, canvas.clientWidth);
  const height = cssHeight;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { context, width, height };
}

function palette(value) {
  const t = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const stops = [[4,5,12],[48,18,91],[131,42,141],[235,77,57],[255,226,111]];
  const scaled = t * (stops.length - 1);
  const low = Math.floor(scaled);
  const high = Math.min(stops.length - 1, low + 1);
  const mix = scaled - low;
  const lowStop = stops[low] || stops[0];
  const highStop = stops[high] || lowStop;
  return lowStop.map((part, index) => Math.round(part * (1 - mix) + highStop[index] * mix));
}

function drawSpectrogram() {
  if (!state.spectrogram) return;
  const { context, width, height } = prepareCanvas(elements.spectrogram, 380);
  const margin = { left: 58, right: 14, top: 18, bottom: 42 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  context.clearRect(0, 0, width, height);
  const spec = state.spectrogram;
  if (!spec.raster) {
    const offscreen = document.createElement('canvas');
    offscreen.width = spec.frameCount;
    offscreen.height = spec.frequencyBins;
    const offContext = offscreen.getContext('2d');
    const image = offContext.createImageData(offscreen.width, offscreen.height);
    const span = Math.max(1, spec.maximum - spec.minimum);
    for (let frame = 0; frame < spec.frameCount; frame += 1) {
      for (let bin = 0; bin < spec.frequencyBins; bin += 1) {
        const db = spec.values[frame * spec.frequencyBins + bin];
        const normalized = Math.pow(Math.max(0, Math.min(1, (db - spec.minimum) / span)), 1.55);
        const [red, green, blue] = palette(normalized);
        const pixel = ((spec.frequencyBins - 1 - bin) * spec.frameCount + frame) * 4;
        image.data[pixel] = red;
        image.data[pixel + 1] = green;
        image.data[pixel + 2] = blue;
        image.data[pixel + 3] = 255;
      }
    }
    offContext.putImageData(image, 0, 0);
    spec.raster = offscreen;
  }
  context.imageSmoothingEnabled = true;
  context.drawImage(spec.raster, margin.left, margin.top, plotW, plotH);
  context.strokeStyle = 'rgba(158,101,255,0.45)';
  context.strokeRect(margin.left + 0.5, margin.top + 0.5, plotW - 1, plotH - 1);
  context.fillStyle = '#9a9ab5';
  context.font = '10px Consolas, monospace';
  context.textAlign = 'center';
  for (let tick = 0; tick <= 4; tick += 1) {
    const x = margin.left + tick / 4 * plotW;
    context.fillText(`${(tick / 4 * state.duration).toFixed(1)} s`, x, height - 18);
  }
  context.textAlign = 'right';
  for (let frequency = 0; frequency <= MAX_DISPLAY_FREQUENCY; frequency += 100) {
    const y = margin.top + plotH - frequency / MAX_DISPLAY_FREQUENCY * plotH;
    context.fillText(`${frequency} Hz`, margin.left - 7, y + 3);
  }
  const cursorX = margin.left + Math.min(1, state.elapsed / state.duration) * plotW;
  context.strokeStyle = '#55e8ef';
  context.lineWidth = 1.5;
  context.beginPath(); context.moveTo(cursorX, margin.top); context.lineTo(cursorX, margin.top + plotH); context.stroke();
}

function drawDeviation() {
  const { context, width, height } = prepareCanvas(elements.deviation, 230);
  const margin = { left: 54, right: 14, top: 16, bottom: 38 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const peak = maxDelta();
  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(158,101,255,0.3)';
  context.strokeRect(margin.left + 0.5, margin.top + 0.5, plotW - 1, plotH - 1);
  const zeroY = margin.top + plotH / 2;
  context.strokeStyle = 'rgba(255,225,106,0.45)';
  context.setLineDash([5,5]);
  context.beginPath(); context.moveTo(margin.left, zeroY); context.lineTo(margin.left + plotW, zeroY); context.stroke();
  context.setLineDash([]);
  context.strokeStyle = '#ff7b39';
  context.lineWidth = 1.5;
  context.beginPath();
  state.bins.forEach((bin, index) => {
    const x = margin.left + index / Math.max(1, state.bins.length - 1) * plotW;
    const y = zeroY - bin.delta / peak * plotH * 0.45;
    if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  context.fillStyle = '#9a9ab5';
  context.font = '10px Consolas, monospace';
  context.textAlign = 'right';
  context.fillText(`+${peak.toFixed(3)}`, margin.left - 7, margin.top + 4);
  context.fillText('0', margin.left - 7, zeroY + 3);
  context.fillText(`-${peak.toFixed(3)}`, margin.left - 7, margin.top + plotH);
  context.textAlign = 'center';
  context.fillText('dataset start', margin.left + 38, height - 14);
  context.fillText('dataset end', margin.left + plotW - 34, height - 14);
  const cursorX = margin.left + Math.min(1, state.elapsed / state.duration) * plotW;
  context.strokeStyle = '#55e8ef';
  context.beginPath(); context.moveTo(cursorX, margin.top); context.lineTo(cursorX, margin.top + plotH); context.stroke();
}

function drawPsd() {
  if (!state.psd) return;
  const { context, width, height } = prepareCanvas(elements.psd, 300);
  const margin = { left: 58, right: 14, top: 18, bottom: 42 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const dbValues = Array.from(state.psd, (value) => 10 * Math.log10(Math.max(1e-20, value)));
  const minDb = Math.min(...dbValues);
  const maxDb = Math.max(...dbValues);
  const span = Math.max(1, maxDb - minDb);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = 'rgba(158,101,255,0.3)';
  context.strokeRect(margin.left + 0.5, margin.top + 0.5, plotW - 1, plotH - 1);
  context.strokeStyle = '#55e8ef';
  context.lineWidth = 1.5;
  context.beginPath();
  dbValues.forEach((db, bin) => {
    const x = margin.left + bin / Math.max(1, dbValues.length - 1) * plotW;
    const y = margin.top + (maxDb - db) / span * plotH;
    if (bin === 0) context.moveTo(x, y); else context.lineTo(x, y);
  });
  context.stroke();
  context.fillStyle = '#9a9ab5';
  context.font = '10px Consolas, monospace';
  context.textAlign = 'center';
  for (let frequency = 0; frequency <= MAX_DISPLAY_FREQUENCY; frequency += 100) {
    const x = margin.left + frequency / MAX_DISPLAY_FREQUENCY * plotW;
    context.fillText(`${frequency}`, x, height - 17);
  }
  context.textAlign = 'right';
  context.fillText(`${maxDb.toFixed(0)} dB`, margin.left - 7, margin.top + 4);
  context.fillText(`${minDb.toFixed(0)} dB`, margin.left - 7, margin.top + plotH);
}

function drawInterferometer(normalized, time) {
  const { context, width, height } = prepareCanvas(elements.interferometer, 380);
  context.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2 + 20;
  const scaleX = 1 + normalized * 0.075;
  const scaleY = 1 - normalized * 0.075;
  const transform = (x, y) => [centerX + (x - centerX) * scaleX, centerY + (y - centerY) * scaleY];
  context.strokeStyle = 'rgba(158,101,255,0.18)';
  context.lineWidth = 1;
  for (let offset = -180; offset <= 180; offset += 30) {
    context.beginPath();
    for (let step = -180; step <= 180; step += 6) {
      const [x, y] = transform(centerX + step, centerY + offset);
      if (step === -180) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    context.beginPath();
    for (let step = -180; step <= 180; step += 6) {
      const [x, y] = transform(centerX + offset, centerY + step);
      if (step === -180) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
  }
  const arm = Math.min(width, height) * 0.34;
  const [mirrorX, mirrorXY] = transform(centerX + arm, centerY);
  const [mirrorYX, mirrorY] = transform(centerX, centerY - arm);
  context.strokeStyle = '#55e8ef';
  context.lineWidth = 3;
  context.beginPath(); context.moveTo(centerX, centerY); context.lineTo(mirrorX, mirrorXY); context.stroke();
  context.strokeStyle = '#ff7b39';
  context.beginPath(); context.moveTo(centerX, centerY); context.lineTo(mirrorYX, mirrorY); context.stroke();
  context.fillStyle = '#ffe16a';
  context.fillRect(centerX - 6, centerY - 6, 12, 12);
  context.fillStyle = '#f3f1ff';
  context.fillRect(mirrorX - 4, mirrorXY - 15, 8, 30);
  context.fillRect(mirrorYX - 15, mirrorY - 4, 30, 8);
  const unitTime = Math.min(1, time / state.duration);
  const pulse = (time * chirpFrequency(unitTime) * 0.08) % 1;
  context.fillStyle = '#ffe16a';
  context.beginPath(); context.arc(centerX + (mirrorX - centerX) * pulse, centerY, 5, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(centerX, centerY + (mirrorY - centerY) * pulse, 5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#9a9ab5';
  context.font = '10px Consolas, monospace';
  context.fillText('x arm | A+C', centerX + 18, centerY + 19);
  context.fillText('y arm | B+D', centerX + 10, centerY - 16);
  context.fillText(`geometric zoom = ${(Math.abs(normalized) * 7.5).toFixed(2)}%`, 12, 20);
  context.fillStyle = normalized >= 0 ? '#55e8ef' : '#ff7b39';
  context.fillText(normalized >= 0 ? 'x expands | y contracts' : 'x contracts | y expands', 12, 36);
}

function currentValues() {
  const unitTime = Math.min(1, state.elapsed / state.duration);
  const delta = interpolateDelta(unitTime);
  const normalized = delta / maxDelta();
  const strain = normalized * 1e-21;
  const frequency = chirpFrequency(unitTime);
  const opticalPhase = 4 * Math.PI * ARM_LENGTH / LASER_WAVELENGTH * strain;
  return { unitTime, delta, normalized, strain, frequency, opticalPhase, phaseName: cbcPhase(unitTime) };
}

function updateReadouts(values) {
  elements.timeValue.textContent = `${state.elapsed.toFixed(3)} s`;
  elements.deltaValue.textContent = `${values.delta >= 0 ? '+' : ''}${values.delta.toFixed(5)}`;
  elements.strainValue.textContent = values.strain.toExponential(3);
  elements.frequencyValue.textContent = `${values.frequency.toFixed(1)} Hz`;
  elements.phaseValue.textContent = `Delta Phi = ${values.opticalPhase.toExponential(3)} rad`;
  elements.cbcPhaseValue.textContent = values.phaseName;
  const binIndex = Math.min(state.bins.length - 1, Math.round(values.unitTime * (state.bins.length - 1)));
  const currentBin = state.bins[binIndex];
  if (currentBin) {
    const total = Object.values(currentBin.counts).reduce((sum, value) => sum + value, 0);
    CLASS_ORDER.forEach((className) => {
      const percent = currentBin.counts[className] / total * 100;
      const deviation = percent - 25;
      elements.classValues[className].textContent = `${percent.toFixed(2)}% (${deviation >= 0 ? '+' : ''}${deviation.toFixed(2)} pp)`;
    });
  }
  elements.audioStatus.textContent = state.audioOn ? 'synchronized synthetic buffer' : 'audio off';
  if (videoIsSynchronized()) {
    elements.videoTimeValue.textContent = `${state.elapsed.toFixed(3)} / ${VIDEO_DURATION.toFixed(3)} s`;
    if (Math.abs(elements.video.currentTime - state.elapsed) > 0.12 && elements.video.readyState >= 1) {
      elements.video.currentTime = Math.min(state.elapsed, VIDEO_DURATION - 0.001);
    }
  }
}

function drawStaticViews() {
  drawSpectrogram();
  drawDeviation();
  drawPsd();
  const values = currentValues();
  drawInterferometer(values.normalized, state.elapsed);
  updateReadouts(values);
}

function animate(timestamp) {
  if (!state.ready) return;
  if (!state.lastFrame) state.lastFrame = timestamp;
  const elapsedMs = Math.min(100, timestamp - state.lastFrame);
  state.lastFrame = timestamp;
  if (state.playing) {
    state.elapsed += elapsedMs / 1000;
    if (state.elapsed >= state.duration) {
      state.elapsed %= state.duration;
      if (videoIsSynchronized()) elements.video.currentTime = state.elapsed;
    }
  }
  drawStaticViews();
  requestAnimationFrame(animate);
}

async function toggleAudio() {
  if (!state.audioOn) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    state.audioContext = state.audioContext || new AudioContext();
    await state.audioContext.resume();
    if (!state.audioGain) {
      state.audioGain = state.audioContext.createGain();
      state.audioGain.gain.value = 0.13;
      state.audioGain.connect(state.audioContext.destination);
    }
    state.audioOn = true;
    elements.audioButton.textContent = 'Audio ON';
    elements.audioButton.setAttribute('aria-pressed', 'true');
    startAudioSource();
  } else {
    stopAudioSource();
    state.audioOn = false;
    elements.audioButton.textContent = 'Audio OFF';
    elements.audioButton.setAttribute('aria-pressed', 'false');
    elements.audioStatus.textContent = 'audio off';
  }
}

elements.playButton.addEventListener('click', () => {
  state.playing = !state.playing;
  elements.playButton.textContent = state.playing ? 'Pause' : 'Resume';
  if (state.playing) {
    if (state.audioOn) startAudioSource();
    if (videoIsSynchronized()) elements.video.play().catch(() => {});
  } else {
    stopAudioSource();
    elements.video.pause();
  }
});
elements.audioButton.addEventListener('click', toggleAudio);
elements.whitenButton.addEventListener('click', () => {
  state.whitened = !state.whitened;
  elements.whitenButton.textContent = state.whitened ? 'Whitening ON' : 'Whitening OFF';
  elements.whitenButton.setAttribute('aria-pressed', String(state.whitened));
  buildSpectrogram();
  elements.psdSummary.textContent = `Welch/Hann | 75% overlap | ASD = square root of PSD | ${state.whitened ? 'whitened view' : 'raw view'}`;
  drawStaticViews();
});
elements.syncVideoButton.addEventListener('click', () => {
  state.duration = VIDEO_DURATION;
  elements.duration.value = String(VIDEO_DURATION);
  state.elapsed = 0;
  rebuildModel();
});
elements.sampleRate.addEventListener('change', () => { state.sampleRate = Number(elements.sampleRate.value); rebuildModel(); });
elements.fft.addEventListener('change', () => { state.fftSize = Number(elements.fft.value); rebuildModel(); });
elements.bin.addEventListener('change', () => { state.binSize = Number(elements.bin.value); rebuildModel(); });
elements.signalMode.addEventListener('change', () => { state.signalMode = elements.signalMode.value; rebuildModel(); });
elements.noiseMode.addEventListener('change', () => { state.noiseMode = elements.noiseMode.value; rebuildModel(); });
elements.duration.addEventListener('input', () => {
  state.duration = Number(elements.duration.value);
  elements.durationOutput.textContent = `${state.duration.toFixed(1)} s`;
  updateVideoVisibility();
});
elements.duration.addEventListener('change', rebuildModel);
window.addEventListener('resize', drawStaticViews);
window.addEventListener('pagehide', () => {
  stopAudioSource();
  elements.video.pause();
});

loadDataset();
