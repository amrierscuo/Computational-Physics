'use strict';

const FS = 1024;
const DURATION = 8;
const N = FS * DURATION;
const EVENT_TIME = 4;
const LOW_FREQUENCY = 20;
const HIGH_FREQUENCY = 450;
const DETECTORS = [
  { name: 'H1', color: '#ff7b39', offset: 0, gain: 1, seed: 114 },
  { name: 'L1', color: '#58e5ed', offset: 0.007, gain: 0.92, seed: 170 },
  { name: 'V1', color: '#a56cff', offset: 0.019, gain: 0.56, seed: 814 }
];

const state = { running: false, results: null };

const elements = {
  preset: document.getElementById('presetSelect'), injectionMass: document.getElementById('injectionMass'),
  templateMass: document.getElementById('templateMass'), amplitude: document.getElementById('amplitude'),
  noise: document.getElementById('noise'), chiBins: document.getElementById('chiBins'), glitch: document.getElementById('glitchToggle'),
  injectionMassOutput: document.getElementById('injectionMassOutput'), templateMassOutput: document.getElementById('templateMassOutput'),
  amplitudeOutput: document.getElementById('amplitudeOutput'), noiseOutput: document.getElementById('noiseOutput'),
  runButton: document.getElementById('runButton'), progressBar: document.getElementById('progressBar'), statusText: document.getElementById('statusText'),
  networkSnr: document.getElementById('networkSnr'), reducedChi: document.getElementById('reducedChi'),
  reweightedSnr: document.getElementById('reweightedSnr'), candidateTime: document.getElementById('candidateTime'),
  backgroundRank: document.getElementById('backgroundRank'), detectorRows: document.getElementById('detectorRows'),
  chiSummary: document.getElementById('chiSummary'), snrSummary: document.getElementById('snrSummary'),
  coincidenceSummary: document.getElementById('coincidenceSummary'), backgroundSummary: document.getElementById('backgroundSummary'),
  strain: document.getElementById('strainCanvas'), psd: document.getElementById('psdNetworkCanvas'),
  snr: document.getElementById('snrCanvas'), chi: document.getElementById('chiCanvas'),
  coincidence: document.getElementById('coincidenceCanvas'), background: document.getElementById('backgroundCanvas')
};

function setProgress(percent, text) {
  elements.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  elements.statusText.textContent = text;
}

function yieldFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function fft(real, imaginary, inverse = false) {
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
    const angle = (inverse ? 2 : -2) * Math.PI / size;
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
  if (inverse) {
    for (let index = 0; index < length; index += 1) {
      real[index] /= length;
      imaginary[index] /= length;
    }
  }
}

function waveform(mass, mergerTime, phaseOffset = 0) {
  const output = new Float64Array(N);
  const inspiralDuration = Math.max(0.5, Math.min(3.2, 92 / mass));
  const startTime = mergerTime - inspiralDuration;
  const ringDuration = Math.max(0.12, Math.min(0.5, 16 / mass));
  const mergerFrequency = Math.min(390, 7600 / mass);
  const ringFrequency = Math.min(430, mergerFrequency * 0.82);
  let phase = phaseOffset;
  for (let index = 0; index < N; index += 1) {
    const time = index / FS;
    if (time < startTime || time > mergerTime + ringDuration) continue;
    let frequency;
    let envelope;
    if (time <= mergerTime) {
      const u = (time - startTime) / inspiralDuration;
      const chirpLaw = (Math.pow(Math.max(0.045, 1 - 0.955 * u), -3 / 8) - 1) / (Math.pow(0.045, -3 / 8) - 1);
      frequency = 25 + (mergerFrequency - 25) * chirpLaw;
      envelope = 0.05 + 0.95 * Math.pow(u, 1.7);
    } else {
      const tau = (time - mergerTime) / ringDuration;
      frequency = ringFrequency;
      envelope = Math.exp(-5 * tau);
    }
    phase += 2 * Math.PI * frequency / FS;
    output[index] = envelope * Math.sin(phase);
  }
  let peak = 1e-12;
  output.forEach((value) => { peak = Math.max(peak, Math.abs(value)); });
  for (let index = 0; index < N; index += 1) output[index] /= peak;
  return output;
}

function coloredNoise(seed, scale) {
  const random = seededRandom(seed);
  const output = new Float64Array(N);
  let spare = null;
  let low = 0;
  const gaussian = () => {
    if (spare !== null) { const result = spare; spare = null; return result; }
    const a = Math.max(1e-12, random());
    const b = random();
    const radius = Math.sqrt(-2 * Math.log(a));
    spare = radius * Math.sin(2 * Math.PI * b);
    return radius * Math.cos(2 * Math.PI * b);
  };
  for (let index = 0; index < N; index += 1) {
    const white = gaussian();
    low = 0.992 * low + 0.008 * white;
    const time = index / FS;
    output[index] = scale * (0.58 * white + 1.9 * low + 0.08 * Math.sin(2 * Math.PI * 60 * time) + 0.035 * Math.sin(2 * Math.PI * 120 * time));
  }
  return output;
}

function makeDetectorData(detector, injection, amplitude, noiseLevel, glitchOn) {
  const data = coloredNoise(detector.seed, noiseLevel);
  const shift = Math.round(detector.offset * FS);
  for (let index = 0; index < N; index += 1) {
    const sourceIndex = index - shift;
    if (sourceIndex >= 0 && sourceIndex < N) data[index] += injection[sourceIndex] * amplitude * detector.gain;
  }
  if (glitchOn) {
    const glitchTime = EVENT_TIME + 0.04 + detector.offset * 0.4;
    for (let index = 0; index < N; index += 1) {
      const time = index / FS;
      const x = (time - glitchTime) / 0.012;
      data[index] += noiseLevel * 2.3 * Math.exp(-0.5 * x * x) * Math.sin(2 * Math.PI * 170 * time);
    }
  }
  return data;
}

function estimatePsd(data) {
  const segmentLength = 2048;
  const stride = segmentLength / 2;
  const bins = segmentLength / 2 + 1;
  const psd = new Float64Array(bins);
  let segments = 0;
  for (let start = 0; start + segmentLength <= data.length; start += stride) {
    const real = new Float64Array(segmentLength);
    const imaginary = new Float64Array(segmentLength);
    for (let index = 0; index < segmentLength; index += 1) {
      const windowValue = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / (segmentLength - 1));
      real[index] = data[start + index] * windowValue;
    }
    fft(real, imaginary);
    for (let bin = 0; bin < bins; bin += 1) psd[bin] += (real[bin] * real[bin] + imaginary[bin] * imaginary[bin]) / (FS * segmentLength * 0.375);
    segments += 1;
  }
  for (let bin = 0; bin < bins; bin += 1) psd[bin] = Math.max(1e-12, psd[bin] / Math.max(1, segments));
  return psd;
}

function interpolatePsd(psd, frequency) {
  const position = Math.max(0, Math.min(psd.length - 1, frequency / (FS / 2) * (psd.length - 1)));
  const low = Math.floor(position);
  const high = Math.min(psd.length - 1, low + 1);
  const mix = position - low;
  return psd[low] * (1 - mix) + psd[high] * mix;
}

function transform(series) {
  const real = Float64Array.from(series);
  const imaginary = new Float64Array(N);
  fft(real, imaginary);
  return { real, imaginary };
}

function whiten(series, psd) {
  const { real, imaginary } = transform(series);
  for (let bin = 0; bin < N; bin += 1) {
    const folded = bin <= N / 2 ? bin : N - bin;
    const frequency = folded * FS / N;
    if (frequency < LOW_FREQUENCY || frequency > HIGH_FREQUENCY) {
      real[bin] = 0;
      imaginary[bin] = 0;
    } else {
      const scale = Math.sqrt(interpolatePsd(psd, frequency));
      real[bin] /= scale;
      imaginary[bin] /= scale;
    }
  }
  fft(real, imaginary, true);
  const mean = real.reduce((sum, value) => sum + value, 0) / N;
  const variance = real.reduce((sum, value) => sum + (value - mean) ** 2, 0) / N;
  const std = Math.sqrt(Math.max(1e-20, variance));
  for (let index = 0; index < N; index += 1) real[index] = (real[index] - mean) / std;
  return real;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function matchedFilter(data, template, psd, bandCount) {
  const dataSpectrum = transform(data);
  const templateSpectrum = transform(template);
  const weights = [];
  let totalWeight = 0;
  for (let bin = 1; bin < N / 2; bin += 1) {
    const frequency = bin * FS / N;
    if (frequency < LOW_FREQUENCY || frequency > HIGH_FREQUENCY) continue;
    const noise = interpolatePsd(psd, frequency);
    const weight = (templateSpectrum.real[bin] ** 2 + templateSpectrum.imaginary[bin] ** 2) / noise;
    weights.push({ bin, weight });
    totalWeight += weight;
  }
  const cuts = [weights[0]?.bin || 1];
  let accumulated = 0;
  let nextTarget = totalWeight / bandCount;
  weights.forEach(({ bin, weight }) => {
    accumulated += weight;
    if (cuts.length < bandCount && accumulated >= nextTarget) {
      cuts.push(bin + 1);
      nextTarget = totalWeight * (cuts.length + 0) / bandCount;
    }
  });
  cuts.push(Math.floor(HIGH_FREQUENCY * N / FS) + 1);
  while (cuts.length < bandCount + 1) cuts.splice(cuts.length - 1, 0, cuts[cuts.length - 2] + 1);
  const bandCorrelations = [];
  for (let band = 0; band < bandCount; band += 1) {
    const real = new Float64Array(N);
    const imaginary = new Float64Array(N);
    const start = cuts[band];
    const end = Math.max(start + 1, cuts[band + 1]);
    for (let bin = start; bin < Math.min(end, N / 2); bin += 1) {
      const frequency = bin * FS / N;
      const noise = interpolatePsd(psd, frequency);
      real[bin] = (dataSpectrum.real[bin] * templateSpectrum.real[bin] + dataSpectrum.imaginary[bin] * templateSpectrum.imaginary[bin]) / noise;
      imaginary[bin] = (dataSpectrum.imaginary[bin] * templateSpectrum.real[bin] - dataSpectrum.real[bin] * templateSpectrum.imaginary[bin]) / noise;
    }
    fft(real, imaginary, true);
    bandCorrelations.push({ real, imaginary });
  }
  const zReal = new Float64Array(N);
  const zImaginary = new Float64Array(N);
  const rawChi = new Float64Array(N);
  for (let index = 0; index < N; index += 1) {
    for (const band of bandCorrelations) {
      zReal[index] += band.real[index];
      zImaginary[index] += band.imaginary[index];
    }
    const expectedReal = zReal[index] / bandCount;
    const expectedImaginary = zImaginary[index] / bandCount;
    let discrepancy = 0;
    for (const band of bandCorrelations) discrepancy += (band.real[index] - expectedReal) ** 2 + (band.imaginary[index] - expectedImaginary) ** 2;
    rawChi[index] = bandCount * discrepancy;
  }
  const backgroundIndices = [];
  for (let index = 0; index < N; index += 4) {
    const lag = index <= N / 2 ? index : index - N;
    const time = EVENT_TIME + lag / FS;
    if (time > 0.5 && time < DURATION - 0.5 && Math.abs(time - EVENT_TIME) > 0.45) backgroundIndices.push(index);
  }
  const noisePower = backgroundIndices.reduce((sum, index) => sum + zReal[index] ** 2 + zImaginary[index] ** 2, 0) / Math.max(1, backgroundIndices.length);
  const noiseScale = Math.sqrt(Math.max(1e-30, noisePower));
  const chiScale = Math.max(1e-30, median(backgroundIndices.map((index) => rawChi[index])));
  const snr = new Float64Array(N);
  const reducedChi = new Float64Array(N);
  const reweighted = new Float64Array(N);
  for (let index = 0; index < N; index += 1) {
    snr[index] = Math.hypot(zReal[index], zImaginary[index]) / noiseScale;
    reducedChi[index] = Math.max(0.02, rawChi[index] / chiScale);
    reweighted[index] = reducedChi[index] <= 1 ? snr[index] : snr[index] * Math.pow((1 + reducedChi[index] ** 3) / 2, -1 / 6);
  }
  return { snr, reducedChi, reweighted };
}

function signedLag(index) {
  return index <= N / 2 ? index : index - N;
}

function candidateTimeForIndex(index) {
  return EVENT_TIME + signedLag(index) / FS;
}

function peakInWindow(values, center, halfWidth) {
  let bestIndex = 0;
  let bestValue = -Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const time = candidateTimeForIndex(index);
    if (Math.abs(time - center) <= halfWidth && values[index] > bestValue) {
      bestValue = values[index];
      bestIndex = index;
    }
  }
  return { index: bestIndex, value: bestValue, time: candidateTimeForIndex(bestIndex) };
}

function alignedTemplate(whiteTemplate, whiteData, lagSamples) {
  const shifted = new Float64Array(N);
  for (let index = 0; index < N; index += 1) shifted[index] = whiteTemplate[(index - lagSamples + N) % N];
  let numerator = 0;
  let denominator = 0;
  const center = Math.round((EVENT_TIME + lagSamples / FS) * FS);
  const halfWindow = Math.round(FS / 3);
  for (let index = Math.max(0, center - halfWindow); index < Math.min(N, center + halfWindow); index += 1) {
    numerator += whiteData[index] * shifted[index];
    denominator += shifted[index] * shifted[index];
  }
  const scale = numerator / Math.max(1e-12, denominator);
  for (let index = 0; index < N; index += 1) shifted[index] *= scale;
  return shifted;
}

async function runAnalysis() {
  if (state.running) return;
  state.running = true;
  elements.runButton.disabled = true;
  try {
    const injectionMass = Number(elements.injectionMass.value);
    const templateMass = Number(elements.templateMass.value);
    const amplitude = Number(elements.amplitude.value);
    const noiseLevel = Number(elements.noise.value);
    const bandCount = Number(elements.chiBins.value);
    const glitchOn = elements.glitch.checked;
    setProgress(4, 'Generating the synthetic CBC signal...');
    await yieldFrame();
    const injection = waveform(injectionMass, EVENT_TIME, 0.35);
    const template = waveform(templateMass, EVENT_TIME, 0);
    const results = [];
    for (let detectorIndex = 0; detectorIndex < DETECTORS.length; detectorIndex += 1) {
      const detector = DETECTORS[detectorIndex];
      setProgress(12 + detectorIndex * 24, `${detector.name}: noise, Welch PSD and whitening...`);
      await yieldFrame();
      const data = makeDetectorData(detector, injection, amplitude, noiseLevel, glitchOn);
      const psd = estimatePsd(data);
      const whiteData = whiten(data, psd);
      const whiteTemplate = whiten(template, psd);
      setProgress(22 + detectorIndex * 24, `${detector.name}: matched filter and ${bandCount} χ² bands...`);
      await yieldFrame();
      const filter = matchedFilter(data, template, psd, bandCount);
      const peak = peakInWindow(filter.reweighted, EVENT_TIME + detector.offset, 0.25);
      const aligned = alignedTemplate(whiteTemplate, whiteData, signedLag(peak.index));
      results.push({ detector, data, psd, whiteData, aligned, ...filter, peak });
    }
    setProgress(88, 'Network consistency and off-source background...');
    await yieldFrame();
    const networkSnr = new Float64Array(N);
    const networkReweighted = new Float64Array(N);
    const networkChi = new Float64Array(N);
    for (let index = 0; index < N; index += 1) {
      let rawSquare = 0;
      let weightedSquare = 0;
      let chiSum = 0;
      results.forEach((result) => {
        const alignedIndex = (index + Math.round(result.detector.offset * FS) + N) % N;
        rawSquare += result.snr[alignedIndex] ** 2;
        weightedSquare += result.reweighted[alignedIndex] ** 2;
        chiSum += result.reducedChi[alignedIndex];
      });
      networkSnr[index] = Math.sqrt(rawSquare);
      networkReweighted[index] = Math.sqrt(weightedSquare);
      networkChi[index] = chiSum / results.length;
    }
    const candidate = peakInWindow(networkReweighted, EVENT_TIME, 0.25);
    const rawCandidate = networkSnr[candidate.index];
    const candidateChi = networkChi[candidate.index];
    const background = [];
    const windowSamples = Math.round(0.18 * FS);
    for (let start = Math.round(0.5 * FS); start + windowSamples < N - 0.5 * FS; start += windowSamples) {
      const time = candidateTimeForIndex(start);
      if (Math.abs(time - EVENT_TIME) < 0.5) continue;
      let maximum = 0;
      for (let offset = 0; offset < windowSamples; offset += 1) maximum = Math.max(maximum, networkReweighted[(start + offset) % N]);
      background.push(maximum);
    }
    const exceedances = background.filter((value) => value >= candidate.value).length;
    const empiricalP = (exceedances + 1) / (background.length + 1);
    state.results = { results, networkSnr, networkReweighted, networkChi, candidate, rawCandidate, candidateChi, background, empiricalP, bandCount, injectionMass, templateMass, glitchOn };
    renderResults();
    setProgress(100, `Analysis complete: ${bandCount} χ² bands, ${background.length} background windows.`);
  } catch (error) {
    setProgress(0, `Error: ${error.message}`);
  } finally {
    state.running = false;
    elements.runButton.disabled = false;
  }
}

function prepareCanvas(canvas, height) {
  const width = Math.max(300, canvas.clientWidth);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  return { context, width, height };
}

function drawFrame(context, width, height, margin) {
  context.strokeStyle = 'rgba(165,108,255,.28)';
  context.strokeRect(margin.left + 0.5, margin.top + 0.5, width - margin.left - margin.right - 1, height - margin.top - margin.bottom - 1);
  context.fillStyle = '#929bb2';
  context.font = '9px Consolas, monospace';
}

function drawTimeSeries(canvas, series, startTime, endTime, height = 290, zeroLine = false) {
  const { context, width } = prepareCanvas(canvas, height);
  const margin = { left: 48, right: 14, top: 20, bottom: 35 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  drawFrame(context, width, height, margin);
  let maximum = 1e-9;
  series.forEach((entry) => {
    for (let index = 0; index < entry.values.length; index += 1) {
      const time = entry.timeAt(index);
      if (time >= startTime && time <= endTime) maximum = Math.max(maximum, Math.abs(entry.values[index]));
    }
  });
  if (zeroLine) {
    context.strokeStyle = 'rgba(255,225,106,.2)';
    context.beginPath(); context.moveTo(margin.left, margin.top + plotH / 2); context.lineTo(margin.left + plotW, margin.top + plotH / 2); context.stroke();
  }
  series.forEach((entry) => {
    context.strokeStyle = entry.color;
    context.lineWidth = entry.width || 1.25;
    context.beginPath();
    let started = false;
    for (let index = 0; index < entry.values.length; index += 1) {
      const time = entry.timeAt(index);
      if (time < startTime || time > endTime) continue;
      const x = margin.left + (time - startTime) / (endTime - startTime) * plotW;
      const y = zeroLine ? margin.top + plotH / 2 - entry.values[index] / maximum * plotH * 0.46 : margin.top + plotH - entry.values[index] / maximum * plotH * 0.92;
      if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
    }
    context.stroke();
  });
  context.fillStyle = '#929bb2';
  context.textAlign = 'center';
  for (let tick = 0; tick <= 4; tick += 1) {
    const time = startTime + (endTime - startTime) * tick / 4;
    context.fillText(`${time.toFixed(3)} s`, margin.left + tick / 4 * plotW, height - 13);
  }
  let legendX = margin.left + 6;
  series.forEach((entry) => {
    context.fillStyle = entry.color;
    context.textAlign = 'left';
    context.fillText(entry.label, legendX, 13);
    legendX += context.measureText(entry.label).width + 18;
  });
}

function drawPsd(results) {
  const { context, width, height } = prepareCanvas(elements.psd, 290);
  const margin = { left: 52, right: 14, top: 20, bottom: 35 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  drawFrame(context, width, height, margin);
  const all = [];
  results.forEach((result) => result.psd.forEach((value, bin) => {
    const frequency = bin * FS / 2048;
    if (frequency >= 10 && frequency <= 500) all.push(10 * Math.log10(value));
  }));
  const minDb = Math.min(...all);
  const maxDb = Math.max(...all);
  results.forEach((result) => {
    context.strokeStyle = result.detector.color;
    context.lineWidth = 1.2;
    context.beginPath();
    let started = false;
    result.psd.forEach((value, bin) => {
      const frequency = bin * FS / 2048;
      if (frequency < 10 || frequency > 500) return;
      const x = margin.left + (frequency - 10) / 490 * plotW;
      const y = margin.top + (maxDb - 10 * Math.log10(value)) / Math.max(1, maxDb - minDb) * plotH;
      if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
    });
    context.stroke();
  });
  context.fillStyle = '#929bb2'; context.textAlign = 'center';
  [20,100,200,300,400,500].forEach((frequency) => context.fillText(`${frequency}`, margin.left + (frequency - 10) / 490 * plotW, height - 13));
  let x = margin.left + 5;
  results.forEach((result) => { context.fillStyle = result.detector.color; context.textAlign = 'left'; context.fillText(result.detector.name, x, 13); x += 32; });
}

function drawChi(resultState) {
  const start = EVENT_TIME - 0.32;
  const end = EVENT_TIME + 0.32;
  const chiMax = Math.max(1, ...Array.from(resultState.networkChi).filter((_, index) => {
    const time = candidateTimeForIndex(index); return time >= start && time <= end;
  }));
  const snrMax = Math.max(1, ...Array.from(resultState.networkReweighted));
  const chiNormalized = Float64Array.from(resultState.networkChi, (value) => value / chiMax);
  const snrNormalized = Float64Array.from(resultState.networkReweighted, (value) => value / snrMax);
  drawTimeSeries(elements.chi, [
    { values: chiNormalized, color: '#ff7b39', label: `reduced χ² max ${chiMax.toFixed(2)}`, timeAt: candidateTimeForIndex },
    { values: snrNormalized, color: '#58e5ed', label: `newSNR max ${snrMax.toFixed(2)}`, timeAt: candidateTimeForIndex }
  ], start, end, 290, false);
}

function drawCoincidence(results) {
  const { context, width, height } = prepareCanvas(elements.coincidence, 290);
  const margin = { left: 54, right: 18, top: 30, bottom: 36 };
  const plotW = width - margin.left - margin.right;
  const start = EVENT_TIME - 0.04;
  const end = EVENT_TIME + 0.06;
  drawFrame(context, width, height, margin);
  results.forEach((result, row) => {
    const y = margin.top + 42 + row * 62;
    const expected = EVENT_TIME + result.detector.offset;
    const low = expected - 0.01;
    const high = expected + 0.01;
    context.fillStyle = `${result.detector.color}33`;
    context.fillRect(margin.left + (low - start) / (end - start) * plotW, y - 12, (high - low) / (end - start) * plotW, 24);
    context.strokeStyle = result.detector.color;
    context.beginPath(); context.moveTo(margin.left, y); context.lineTo(margin.left + plotW, y); context.stroke();
    const x = margin.left + (result.peak.time - start) / (end - start) * plotW;
    context.fillStyle = result.detector.color;
    context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill();
    context.textAlign = 'right'; context.fillText(result.detector.name, margin.left - 9, y + 3);
  });
  context.fillStyle = '#929bb2'; context.textAlign = 'center';
  for (let tick = 0; tick <= 5; tick += 1) {
    const time = start + (end - start) * tick / 5;
    context.fillText(`${((time - EVENT_TIME) * 1000).toFixed(0)} ms`, margin.left + tick / 5 * plotW, height - 13);
  }
}

function drawBackground(values, candidateValue) {
  const { context, width, height } = prepareCanvas(elements.background, 340);
  const margin = { left: 50, right: 18, top: 24, bottom: 38 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  drawFrame(context, width, height, margin);
  const maxValue = Math.max(candidateValue, ...values) * 1.08;
  const bins = 24;
  const counts = new Array(bins).fill(0);
  values.forEach((value) => { counts[Math.min(bins - 1, Math.floor(value / maxValue * bins))] += 1; });
  const maxCount = Math.max(1, ...counts);
  counts.forEach((count, bin) => {
    const x = margin.left + bin / bins * plotW;
    const barW = plotW / bins - 2;
    const barH = count / maxCount * plotH;
    context.fillStyle = 'rgba(165,108,255,.65)';
    context.fillRect(x + 1, margin.top + plotH - barH, barW, barH);
  });
  const candidateX = margin.left + candidateValue / maxValue * plotW;
  context.strokeStyle = '#ffe16a'; context.lineWidth = 2;
  context.beginPath(); context.moveTo(candidateX, margin.top); context.lineTo(candidateX, margin.top + plotH); context.stroke();
  context.fillStyle = '#ffe16a'; context.textAlign = 'right'; context.fillText('candidate', candidateX - 5, margin.top + 12);
  context.fillStyle = '#929bb2'; context.textAlign = 'center';
  for (let tick = 0; tick <= 5; tick += 1) context.fillText((maxValue * tick / 5).toFixed(1), margin.left + tick / 5 * plotW, height - 14);
}

function renderResults() {
  const r = state.results;
  elements.networkSnr.textContent = r.rawCandidate.toFixed(2);
  elements.reducedChi.textContent = r.candidateChi.toFixed(2);
  elements.reweightedSnr.textContent = r.candidate.value.toFixed(2);
  elements.candidateTime.textContent = `${r.candidate.time.toFixed(4)} s`;
  elements.backgroundRank.textContent = `${(r.empiricalP * 100).toFixed(2)}%`;
  elements.chiSummary.textContent = `p=${r.bandCount} bands | nominal dof=${2 * r.bandCount - 2}`;
  elements.snrSummary.textContent = `template ${r.templateMass} Msol | injection ${r.injectionMass} Msol`;
  elements.backgroundSummary.textContent = `${r.background.length} windows | empirical p with +1 correction`;
  elements.detectorRows.innerHTML = r.results.map((result) => {
    const expected = EVENT_TIME + result.detector.offset;
    const coherent = Math.abs(result.peak.time - expected) <= 0.012;
    return `<tr><td><span class="ifo-dot" style="background:${result.detector.color}"></span>${result.detector.name}</td><td>${(result.detector.offset * 1000).toFixed(1)} ms</td><td>${result.peak.time.toFixed(5)} s</td><td>${result.snr[result.peak.index].toFixed(2)}</td><td>${result.reducedChi[result.peak.index].toFixed(2)}</td><td>${result.peak.value.toFixed(2)}</td><td class="${coherent ? 'ok' : 'no'}">${coherent ? 'YES' : 'NO'}</td></tr>`;
  }).join('');
  const h1 = r.results[0];
  drawTimeSeries(elements.strain, [
    { values: h1.whiteData, color: '#929bb2', label: 'H1 whitened', width: 1, timeAt: (index) => index / FS },
    { values: h1.aligned, color: '#ffe16a', label: 'aligned template', width: 1.8, timeAt: (index) => index / FS }
  ], r.candidate.time - 0.32, r.candidate.time + 0.18, 340, true);
  drawPsd(r.results);
  drawTimeSeries(elements.snr, r.results.map((result) => ({ values: result.snr, color: result.detector.color, label: result.detector.name, timeAt: candidateTimeForIndex })), EVENT_TIME - 0.5, EVENT_TIME + 0.5, 290, false);
  drawChi(r);
  drawCoincidence(r.results);
  drawBackground(r.background, r.candidate.value);
}

function updateOutputs() {
  elements.injectionMassOutput.textContent = `${elements.injectionMass.value} Msol`;
  elements.templateMassOutput.textContent = `${elements.templateMass.value} Msol`;
  elements.amplitudeOutput.textContent = Number(elements.amplitude.value).toFixed(2);
  elements.noiseOutput.textContent = Number(elements.noise.value).toFixed(2);
}

function applyPreset() {
  const preset = elements.preset.value;
  if (preset === 'gw150914') {
    elements.injectionMass.value = '36'; elements.templateMass.value = '36'; elements.amplitude.value = '1.1'; elements.noise.value = '0.95'; elements.glitch.checked = false; elements.chiBins.value = '8';
  } else if (preset === 'gw170814') {
    elements.injectionMass.value = '31'; elements.templateMass.value = '31'; elements.amplitude.value = '0.9'; elements.noise.value = '1'; elements.glitch.checked = false; elements.chiBins.value = '26';
  } else {
    elements.injectionMass.value = '36'; elements.templateMass.value = '36'; elements.amplitude.value = '0.75'; elements.noise.value = '1.15'; elements.glitch.checked = true; elements.chiBins.value = '16';
  }
  updateOutputs();
  runAnalysis();
}

elements.runButton.addEventListener('click', runAnalysis);
elements.preset.addEventListener('change', applyPreset);
[elements.injectionMass,elements.templateMass,elements.amplitude,elements.noise].forEach((input) => input.addEventListener('input', updateOutputs));
window.addEventListener('resize', () => { if (state.results) renderResults(); });

applyPreset();
