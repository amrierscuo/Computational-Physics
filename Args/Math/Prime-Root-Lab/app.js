'use strict';

const DATA_URL = './data/prime-roots.txt';
const MIN_DECIMALS = 3;

const state = {
  records: [],
  index: 0,
  dirty: false,
  loading: false,
  timestampGroups: new Map(),
  timestampGroupCount: 0,
  sourceName: 'data/prime-roots.txt'
};

const elements = {
  loadingScreen: document.getElementById('loadingScreen'),
  loadingProgress: document.getElementById('loadingProgress'),
  loadingBar: document.getElementById('loadingBar'),
  loadingPercent: document.getElementById('loadingPercent'),
  loadingText: document.getElementById('loadingText'),
  versionList: document.getElementById('versionList'),
  recordCount: document.getElementById('recordCount'),
  recordJump: document.getElementById('recordJump'),
  jumpButton: document.getElementById('jumpButton'),
  listWindow: document.getElementById('listWindow'),
  versionLabel: document.getElementById('versionLabel'),
  sourceStatus: document.getElementById('sourceStatus'),
  primeValue: document.getElementById('primeValue'),
  approximationValue: document.getElementById('approximationValue'),
  statusChip: document.getElementById('statusChip'),
  timestampValue: document.getElementById('timestampValue'),
  timestampGroup: document.getElementById('timestampGroup'),
  decimalCount: document.getElementById('decimalCount'),
  errorValue: document.getElementById('errorValue'),
  boundsValue: document.getElementById('boundsValue'),
  nextDigitValue: document.getElementById('nextDigitValue'),
  dirtyState: document.getElementById('dirtyState'),
  formulaSteps: document.getElementById('formulaSteps'),
  stopSummary: document.getElementById('stopSummary'),
  stopTrace: document.getElementById('stopTrace'),
  fileInput: document.getElementById('fileInput'),
  exportButton: document.getElementById('exportButton'),
  previousButton: document.getElementById('previousButton'),
  nextButton: document.getElementById('nextButton'),
  generateButton: document.getElementById('generateButton'),
  emptyTemplate: document.getElementById('emptyTemplate')
};

function updateLoadingProgress(percent, text) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  elements.loadingScreen.hidden = false;
  elements.loadingScreen.classList.remove('complete');
  elements.loadingBar.style.width = `${safePercent}%`;
  elements.loadingPercent.textContent = `${Math.round(safePercent)}%`;
  elements.loadingProgress.setAttribute('aria-valuenow', String(Math.round(safePercent)));
  elements.loadingText.textContent = text;
}

function finishLoading() {
  updateLoadingProgress(100, 'Archive ready.');
  window.setTimeout(() => elements.loadingScreen.classList.add('complete'), 180);
}

function cancelLoading(message) {
  elements.loadingText.textContent = message;
  elements.loadingScreen.classList.add('complete');
}

function isPrime(value) {
  if (value < 2) return false;
  if (value % 2 === 0) return value === 2;
  for (let divisor = 3; divisor * divisor <= value; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function nextPrime(value) {
  let candidate = value + 1;
  while (!isPrime(candidate)) candidate += 1;
  return candidate;
}

function decomposeDigit(digit, place, leading) {
  const standard = {
    0: [], 1: [1], 2: [2], 3: [2, 1], 4: [2, 2],
    5: [5], 6: [5, 1], 7: [5, 2], 8: [5, 2, 1], 9: [5, 2, 2]
  };
  const blocks = digit === 2 && leading ? [1, 1] : standard[digit];
  return blocks.map((block) => BigInt(block) * place);
}

function decomposeInteger(integerText) {
  const digits = [...integerText].map(Number);
  const leadingIndex = digits.findIndex((digit) => digit !== 0);
  return digits.flatMap((digit, index) => {
    const power = digits.length - index - 1;
    return decomposeDigit(digit, 10n ** BigInt(power), index === leadingIndex);
  });
}

function scaledToDecimal(integer, decimals) {
  if (decimals === 0) return integer.toString();
  const padded = integer.toString().padStart(decimals + 1, '0');
  return `${padded.slice(0, -decimals)}.${padded.slice(-decimals)}`;
}

function squareCandidate(value, prime) {
  const [whole, fraction = ''] = value.split('.');
  const scaledInteger = BigInt(`${whole}${fraction}`);
  const blocks = decomposeInteger(scaledInteger.toString());
  const products = blocks.map((block) => scaledInteger * block);
  const squareScaled = scaledInteger * scaledInteger;
  const scale = 10n ** BigInt(fraction.length * 2);
  const target = BigInt(prime) * scale;

  return {
    value,
    scaledInteger: scaledInteger.toString(),
    decimals: fraction.length,
    blocks: blocks.map(String),
    products: products.map(String),
    squareScaled: squareScaled.toString(),
    square: scaledToDecimal(squareScaled, fraction.length * 2),
    relation: squareScaled < target ? '<' : squareScaled > target ? '>' : '='
  };
}

function stoppingRule(prime) {
  const rootText = Math.sqrt(prime).toFixed(15);
  const [whole, rawDigits] = rootText.split('.');
  const digits = rawDigits.replace(/0+$/, '');
  const checks = [];
  let keep = Math.min(MIN_DECIMALS, digits.length);

  while (keep < digits.length) {
    const next = Number(digits[keep]);
    const decision = next < 5 ? 'stop' : 'continue';
    checks.push({ value: `${whole}.${digits.slice(0, keep)}`, next, decision });
    if (decision === 'stop') break;
    keep += 1;
  }

  return {
    sqrt: rootText,
    approximation: `${whole}.${digits.slice(0, keep)}`,
    nextDigit: keep < digits.length ? Number(digits[keep]) : null,
    checks
  };
}

function buildRecord(prime, version) {
  const root = Math.sqrt(prime);
  const integerLow = Math.floor(root);
  const tenthLow = (Math.floor(root * 10) / 10).toFixed(1);
  const tenthHigh = (Number(tenthLow) + 0.1).toFixed(1);
  const stop = stoppingRule(prime);
  const error = root - Number(stop.approximation);

  return {
    schema: 1,
    version,
    prime,
    status: 'generated',
    discoveredAt: new Date().toISOString(),
    metrics: {
      sqrt: stop.sqrt,
      approximation: stop.approximation,
      decimals: stop.approximation.split('.')[1].length,
      error: error.toPrecision(12)
    },
    bounds: { integer: [integerLow, integerLow + 1], tenth: [tenthLow, tenthHigh] },
    stop: { minimumDecimals: MIN_DECIMALS, nextDigit: stop.nextDigit, checks: stop.checks },
    steps: [
      squareCandidate(tenthLow, prime),
      squareCandidate(tenthHigh, prime),
      squareCandidate(stop.approximation, prime)
    ]
  };
}

function parseArchive(text) {
  const records = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`Riga ${index + 1} non valida: ${error.message}`);
    }
  }

  if (!records.length) throw new Error('The file contains no records.');
  records.sort((a, b) => a.version - b.version);
  return records;
}

function parseArchiveLine(line, lineNumber) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Riga ${lineNumber} non valida: ${error.message}`);
  }
}

function allowPaint() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadArchiveStream(response, sourceName) {
  if (!response.body) {
    loadText(await response.text(), sourceName);
    return;
  }

  const totalBytes = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let loadedBytes = 0;
  let paintedBytes = 0;
  let lineNumber = 0;
  let firstPaintDone = false;

  state.records = [];
  state.index = 0;
  state.dirty = false;
  state.loading = true;
  state.sourceName = sourceName;
  elements.sourceStatus.textContent = `${sourceName} | starting read...`;
  updateLoadingProgress(0, 'Connecting to the TXT archive...');

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    loadedBytes += value.byteLength;
    pending += decoder.decode(value, { stream: true });

    let newlineIndex = pending.indexOf('\n');
    while (newlineIndex >= 0) {
      lineNumber += 1;
      const record = parseArchiveLine(pending.slice(0, newlineIndex), lineNumber);
      if (record) state.records.push(record);
      pending = pending.slice(newlineIndex + 1);
      newlineIndex = pending.indexOf('\n');
    }

    if (!firstPaintDone && state.records.length) {
      firstPaintDone = true;
      render();
      await allowPaint();
    }

    if (loadedBytes - paintedBytes >= 1_000_000) {
      paintedBytes = loadedBytes;
      const progress = totalBytes ? Math.min(100, loadedBytes / totalBytes * 100).toFixed(0) : '?';
      elements.sourceStatus.textContent = `${sourceName} | ${progress}% | ${state.records.length} formulas`;
      elements.recordCount.textContent = `${state.records.length} records`;
      if (progress !== '?') updateLoadingProgress(progress, `${state.records.length} formulas read`);
      await allowPaint();
    }
  }

  pending += decoder.decode();
  if (pending.trim()) {
    lineNumber += 1;
    const record = parseArchiveLine(pending, lineNumber);
    if (record) state.records.push(record);
  }
  if (!state.records.length) throw new Error('The file contains no records.');

  state.loading = false;
  buildTimestampGroups();
  elements.sourceStatus.textContent = `${sourceName} | ${state.records.length} formulas loaded`;
  render();
  finishLoading();
}

function serializeArchive() {
  const header = '# Prime Root Lab NDJSON v1\n# One JSON record per line. Formulas, steps, metrics and timestamps are persistent.\n';
  return header + state.records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

function buildTimestampGroups() {
  const groups = new Map();
  for (const record of state.records) {
    const timestamp = record.discoveredAt;
    if (!groups.has(timestamp)) {
      groups.set(timestamp, { index: groups.size + 1, count: 0 });
    }
    groups.get(timestamp).count += 1;
  }
  state.timestampGroups = groups;
  state.timestampGroupCount = groups.size;
}

function formatTimestamp(iso) {
  if (!iso) return 'no timestamp';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'invalid timestamp';
  return new Intl.DateTimeFormat('it-IT', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    fractionalSecondDigits: 3, hour12: false
  }).format(date);
}

function appendText(parent, text, className) {
  const span = document.createElement('span');
  span.textContent = text;
  if (className) span.className = className;
  parent.append(span);
}

function renderFormulaStep(step, prime, index, total) {
  const article = document.createElement('article');
  article.className = 'formula-step';

  const label = document.createElement('div');
  label.className = 'step-label';
  const role = index === total - 1 ? 'FINAL CANDIDATE' : index === 0 ? 'LOWER BOUND' : 'UPPER BOUND';
  label.append(Object.assign(document.createElement('span'), { textContent: `M${index + 2}` }));
  label.append(Object.assign(document.createElement('span'), { textContent: role }));

  const scroll = document.createElement('div');
  scroll.className = 'formula-scroll';
  const formula = document.createElement('code');
  formula.className = 'formula';
  const scale = step.decimals ? `10^${step.decimals * 2}` : '1';

  appendText(formula, `${step.value}^2 = ${step.scaledInteger} x `);
  appendText(formula, `(${step.blocks.join(' + ')})`, 'decomposition');
  appendText(formula, ` / ${scale} = `, 'division');
  appendText(formula, `[${step.products.join(' + ')}]`, 'products');
  appendText(formula, ` / ${scale} = `, 'division');
  appendText(formula, `${step.square} ${step.relation} ${prime}`, 'comparison');

  scroll.append(formula);
  article.append(label, scroll);
  return article;
}

function renderVersionList() {
  elements.versionList.replaceChildren();
  const windowSize = 80;
  const halfWindow = Math.floor(windowSize / 2);
  const start = Math.max(0, Math.min(state.index - halfWindow, state.records.length - windowSize));
  const end = Math.min(state.records.length, start + windowSize);
  const visibleRecords = state.records.slice(start, end);

  visibleRecords.forEach((record, offset) => {
    const index = start + offset;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `version-item${index === state.index ? ' active' : ''}`;
    button.setAttribute('aria-current', index === state.index ? 'true' : 'false');

    const version = document.createElement('span');
    version.className = 'version';
    version.textContent = `v${record.version}`;
    const prime = document.createElement('span');
    prime.className = 'prime';
    prime.textContent = `p=${record.prime}`;
    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = record.discoveredAt ? new Date(record.discoveredAt).toLocaleDateString('en-GB') : 'never';
    button.append(version, prime, date);
    button.addEventListener('click', () => {
      state.index = index;
      render();
    });
    elements.versionList.append(button);
  });
  elements.recordCount.textContent = `${state.records.length} records`;
  elements.listWindow.textContent = state.records.length
    ? `showing ${start + 1}-${end} of ${state.records.length}`
    : 'no records';
}

function jumpToRecord() {
  const query = elements.recordJump.value.trim().toLowerCase();
  if (!query) return;
  const value = Number(query.replace(/[^0-9]/g, ''));
  if (!Number.isInteger(value)) return;

  let index = -1;
  if (query.startsWith('v')) {
    index = state.records.findIndex((record) => record.version === value);
  } else if (query.startsWith('p')) {
    index = state.records.findIndex((record) => record.prime === value);
  } else {
    index = state.records.findIndex((record) => record.prime === value);
    if (index < 0) index = state.records.findIndex((record) => record.version === value);
  }

  if (index < 0) {
    elements.sourceStatus.textContent = `No record found for ${query}.`;
    return;
  }
  state.index = index;
  elements.sourceStatus.textContent = `Record ${query} found in the archive.`;
  render();
}

function renderStopTrace(record) {
  elements.stopTrace.replaceChildren();
  record.stop.checks.forEach((check) => {
    const item = document.createElement('div');
    item.className = `stop-step ${check.decision}`;
    const value = document.createElement('strong');
    value.textContent = check.value;
    item.append(value, document.createTextNode(` | digit ${check.next} | ${check.decision === 'stop' ? 'stop' : 'continue'}`));
    elements.stopTrace.append(item);
  });
  elements.stopSummary.textContent = `min ${record.stop.minimumDecimals} decimals | ${record.stop.checks.length} checks`;
}

function renderEmpty(message) {
  elements.formulaSteps.replaceChildren(elements.emptyTemplate.content.cloneNode(true));
  elements.formulaSteps.querySelector('span').textContent = message;
  elements.stopTrace.replaceChildren();
  elements.exportButton.disabled = true;
  elements.previousButton.disabled = true;
  elements.nextButton.disabled = true;
}

function render() {
  renderVersionList();
  const record = state.records[state.index];
  if (!record) {
    renderEmpty('Load data/prime-roots.txt to begin.');
    return;
  }

  elements.exportButton.disabled = state.loading;
  elements.previousButton.disabled = state.records.length < 2;
  elements.nextButton.disabled = state.records.length < 2;
  elements.generateButton.disabled = state.loading;
  elements.versionLabel.textContent = `V${record.version} | PRIME NUMBER ${record.prime}`;
  elements.primeValue.textContent = record.prime;
  elements.approximationValue.textContent = record.metrics.approximation;
  elements.statusChip.textContent = record.status;
  elements.timestampValue.textContent = formatTimestamp(record.discoveredAt);
  elements.timestampValue.dateTime = record.discoveredAt || '';
  const timestampGroup = state.timestampGroups.get(record.discoveredAt);
  elements.timestampGroup.textContent = timestampGroup
    ? `group ${timestampGroup.index}/${state.timestampGroupCount} | ${timestampGroup.count} records at the same timestamp`
    : 'grouping timestamps';
  elements.decimalCount.textContent = record.metrics.decimals;
  elements.errorValue.textContent = record.metrics.error;
  elements.boundsValue.textContent = `${record.bounds.tenth[0]} < sqrt(${record.prime}) < ${record.bounds.tenth[1]}`;
  elements.nextDigitValue.textContent = record.stop.nextDigit ?? 'end';
  elements.dirtyState.textContent = state.dirty ? 'changes to export' : 'synchronized with TXT';
  elements.dirtyState.classList.toggle('dirty', state.dirty);

  elements.formulaSteps.replaceChildren();
  const integerStep = document.createElement('article');
  integerStep.className = 'formula-step';
  const integerLabel = document.createElement('div');
  integerLabel.className = 'step-label';
  integerLabel.innerHTML = '<span>M1</span><span>INTEGER BOUND</span>';
  const integerScroll = document.createElement('div');
  integerScroll.className = 'formula-scroll';
  const integerFormula = document.createElement('code');
  integerFormula.className = 'formula comparison';
  integerFormula.textContent = `${record.bounds.integer[0]}^2 < ${record.prime} < ${record.bounds.integer[1]}^2`;
  integerScroll.append(integerFormula);
  integerStep.append(integerLabel, integerScroll);
  elements.formulaSteps.append(integerStep);
  record.steps.forEach((step, index) => {
    elements.formulaSteps.append(renderFormulaStep(step, record.prime, index, record.steps.length));
  });

  renderStopTrace(record);
}

function loadText(text, sourceName) {
  state.records = parseArchive(text);
  state.index = 0;
  state.dirty = false;
  state.loading = false;
  buildTimestampGroups();
  state.sourceName = sourceName;
  elements.sourceStatus.textContent = `${sourceName} | ${state.records.length} formulas loaded`;
  render();
}

async function loadDefaultArchive() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await loadArchiveStream(response, 'data/prime-roots.txt');
  } catch (error) {
    state.loading = false;
    elements.sourceStatus.textContent = 'Automatic loading is unavailable. Select the TXT file.';
    renderEmpty(error.message);
    cancelLoading('Automatic loading is unavailable.');
  }
}

elements.fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    loadText(await file.text(), file.name);
  } catch (error) {
    elements.sourceStatus.textContent = `Archive error: ${error.message}`;
    renderEmpty(error.message);
  } finally {
    event.target.value = '';
  }
});

elements.exportButton.addEventListener('click', () => {
  const blob = new Blob([serializeArchive()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'prime-roots.txt';
  link.click();
  URL.revokeObjectURL(url);
  state.dirty = false;
  elements.sourceStatus.textContent = 'Archive exported. Replace data/prime-roots.txt to publish the new data.';
  render();
});

elements.generateButton.addEventListener('click', () => {
  const last = state.records.at(-1);
  const prime = nextPrime(last ? last.prime : 5);
  const version = last ? last.version + 1 : 1;
  state.records.push(buildRecord(prime, version));
  state.index = state.records.length - 1;
  state.dirty = true;
  elements.sourceStatus.textContent = `p=${prime} added in memory. Export the TXT file to save it.`;
  render();
});

elements.previousButton.addEventListener('click', () => {
  state.index = (state.index - 1 + state.records.length) % state.records.length;
  render();
});

elements.nextButton.addEventListener('click', () => {
  state.index = (state.index + 1) % state.records.length;
  render();
});

elements.jumpButton.addEventListener('click', jumpToRecord);
elements.recordJump.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') jumpToRecord();
});

loadDefaultArchive();
