'use strict';

const DATA_URL = './data/prime-roots.txt';
const MIN_DECIMALS = 3;
const INITIAL_RECORD_LIMIT = 1000;
const RANGE_CHUNK_BYTES = 512 * 1024;

const state = {
  records: [],
  index: 0,
  dirty: false,
  loading: false,
  timestampGroups: new Map(),
  timestampGroupCount: 0,
  sourceName: 'data/prime-roots.txt',
  archiveBytes: 0,
  downloadedBytes: 0,
  archiveComplete: false,
  pendingText: '',
  lineNumber: 0,
  decoder: new TextDecoder()
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
  archiveCoverage: document.getElementById('archiveCoverage'),
  archiveBytes: document.getElementById('archiveBytes'),
  coverageBar: document.getElementById('coverageBar'),
  blockPercent: document.getElementById('blockPercent'),
  blockPercentValue: document.getElementById('blockPercentValue'),
  loadBlockButton: document.getElementById('loadBlockButton'),
  loadAllButton: document.getElementById('loadAllButton'),
  loadHint: document.getElementById('loadHint'),
  archiveBrowser: document.getElementById('archiveBrowser'),
  methodDetails: document.getElementById('methodDetails'),
  fileMenu: document.getElementById('fileMenu'),
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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1);
  const value = bytes / (1000 ** unitIndex);
  return `${value.toFixed(unitIndex > 1 ? 2 : 0)} ${units[unitIndex]}`;
}

function getArchivePercent() {
  if (!state.archiveBytes) return state.archiveComplete ? 100 : 0;
  return Math.min(100, state.downloadedBytes / state.archiveBytes * 100);
}

function updateArchiveControls() {
  const percent = getArchivePercent();
  const blockPercent = Number(elements.blockPercent.value);
  const complete = state.archiveComplete;
  const busy = state.loading;

  elements.archiveCoverage.textContent = `${percent < 10 && !complete ? percent.toFixed(1) : Math.round(percent)}%`;
  elements.archiveBytes.textContent = state.archiveBytes
    ? `${formatBytes(state.downloadedBytes)} / ${formatBytes(state.archiveBytes)}`
    : formatBytes(state.downloadedBytes);
  elements.coverageBar.style.width = `${percent}%`;
  elements.blockPercentValue.textContent = `${blockPercent}%`;
  elements.loadBlockButton.textContent = complete ? 'Archive complete' : `Load next ${blockPercent}%`;
  elements.loadBlockButton.disabled = busy || complete;
  elements.loadAllButton.disabled = busy || complete;
  elements.blockPercent.disabled = busy || complete;
  elements.loadHint.textContent = complete
    ? `${state.records.length} records loaded. Calculations and exports now use the complete archive.`
    : `${state.records.length} records active. Browser, groups and metrics use only this loaded subset.`;
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

function resetRemoteArchive(totalBytes, sourceName) {
  state.records = [];
  state.index = 0;
  state.dirty = false;
  state.loading = true;
  state.timestampGroups = new Map();
  state.timestampGroupCount = 0;
  state.sourceName = sourceName;
  state.archiveBytes = totalBytes;
  state.downloadedBytes = 0;
  state.archiveComplete = false;
  state.pendingText = '';
  state.lineNumber = 0;
  state.decoder = new TextDecoder();
  updateArchiveControls();
}

function parsePendingLines(maxRecords = Number.POSITIVE_INFINITY) {
  let added = 0;
  let newlineIndex = state.pendingText.indexOf('\n');
  while (newlineIndex >= 0 && added < maxRecords) {
    state.lineNumber += 1;
    const record = parseArchiveLine(state.pendingText.slice(0, newlineIndex), state.lineNumber);
    state.pendingText = state.pendingText.slice(newlineIndex + 1);
    if (record) {
      state.records.push(record);
      added += 1;
    }
    newlineIndex = state.pendingText.indexOf('\n');
  }
  return added;
}

function flushFinalArchiveLine(maxRecords = Number.POSITIVE_INFINITY) {
  if (!state.pendingText.trim() || maxRecords <= 0) return 0;
  state.lineNumber += 1;
  const record = parseArchiveLine(state.pendingText, state.lineNumber);
  state.pendingText = '';
  if (!record) return 0;
  state.records.push(record);
  return 1;
}

async function loadRemoteRange(endByte, maxNewRecords = Number.POSITIVE_INFINITY, onProgress) {
  let added = parsePendingLines(maxNewRecords);
  if (added >= maxNewRecords || state.downloadedBytes >= state.archiveBytes) return added;

  const startByte = state.downloadedBytes;
  const safeEnd = Math.min(endByte, state.archiveBytes - 1);
  const response = await fetch(DATA_URL, {
    cache: 'no-store',
    headers: { Range: `bytes=${startByte}-${safeEnd}` }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (startByte > 0 && response.status !== 206) {
    throw new Error('This server did not honor the requested archive block.');
  }

  const contentRange = response.headers.get('content-range');
  const rangeTotal = Number(contentRange?.split('/').at(-1));
  if (Number.isFinite(rangeTotal) && rangeTotal > 0) state.archiveBytes = rangeTotal;

  const readValue = (value) => {
    state.downloadedBytes += value.byteLength;
    state.pendingText += state.decoder.decode(value, { stream: true });
    const remaining = maxNewRecords - added;
    added += parsePendingLines(remaining);
    updateArchiveControls();
    if (onProgress) onProgress();
  };

  if (!response.body) {
    readValue(new Uint8Array(await response.arrayBuffer()));
  } else {
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      readValue(value);
      if (added >= maxNewRecords) {
        await reader.cancel();
        break;
      }
    }
  }

  if (state.downloadedBytes >= state.archiveBytes) {
    state.downloadedBytes = state.archiveBytes;
    state.pendingText += state.decoder.decode();
    const remaining = maxNewRecords - added;
    added += parsePendingLines(remaining);
    if (added < maxNewRecords) added += flushFinalArchiveLine(maxNewRecords - added);
    state.archiveComplete = state.pendingText.trim() === '';
  }
  updateArchiveControls();
  return added;
}

async function loadArchiveTo(targetBytes, label) {
  if (state.loading || state.archiveComplete) return;
  state.loading = true;
  updateArchiveControls();
  elements.sourceStatus.textContent = label;
  elements.generateButton.disabled = true;
  elements.exportButton.disabled = true;

  try {
    parsePendingLines();
    const target = Math.min(state.archiveBytes, Math.max(state.downloadedBytes, targetBytes));
    while (state.downloadedBytes < target) {
      const endByte = Math.min(target - 1, state.downloadedBytes + RANGE_CHUNK_BYTES - 1);
      await loadRemoteRange(endByte, Number.POSITIVE_INFINITY, () => {
        elements.recordCount.textContent = `${state.records.length} loaded`;
      });
      await allowPaint();
    }

    buildTimestampGroups();
    state.index = Math.min(state.index, Math.max(0, state.records.length - 1));
    state.loading = false;
    elements.sourceStatus.textContent = state.archiveComplete
      ? `${state.sourceName} | complete archive | ${state.records.length} formulas`
      : `${state.sourceName} | ${getArchivePercent().toFixed(1)}% | ${state.records.length} formulas loaded`;
    render();
    updateArchiveControls();
  } catch (error) {
    state.loading = false;
    elements.sourceStatus.textContent = `Block loading error: ${error.message}`;
    updateArchiveControls();
    render();
  }
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
  const windowSize = window.matchMedia('(max-width: 850px)').matches ? 12 : 24;
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
  elements.recordCount.textContent = `${state.records.length} loaded`;
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
    elements.sourceStatus.textContent = state.archiveComplete
      ? `No record found for ${query}.`
      : `${query} is not in the loaded subset. Load another archive block and try again.`;
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

  elements.exportButton.disabled = state.loading || !state.archiveComplete;
  elements.previousButton.disabled = state.records.length < 2;
  elements.nextButton.disabled = state.records.length < 2;
  elements.generateButton.disabled = state.loading || !state.archiveComplete;
  elements.generateButton.textContent = state.archiveComplete ? 'Add next prime' : 'Load 100% to add';
  elements.versionLabel.textContent = `V${record.version} | PRIME NUMBER ${record.prime}`;
  elements.primeValue.textContent = record.prime;
  elements.approximationValue.textContent = record.metrics.approximation;
  elements.statusChip.textContent = record.status;
  elements.timestampValue.textContent = formatTimestamp(record.discoveredAt);
  elements.timestampValue.dateTime = record.discoveredAt || '';
  const timestampGroup = state.timestampGroups.get(record.discoveredAt);
  elements.timestampGroup.textContent = timestampGroup
    ? `loaded group ${timestampGroup.index}/${state.timestampGroupCount} | ${timestampGroup.count} records at the same timestamp`
    : 'grouping timestamps';
  elements.decimalCount.textContent = record.metrics.decimals;
  elements.errorValue.textContent = record.metrics.error;
  elements.boundsValue.textContent = `${record.bounds.tenth[0]} < sqrt(${record.prime}) < ${record.bounds.tenth[1]}`;
  elements.nextDigitValue.textContent = record.stop.nextDigit ?? 'end';
  elements.dirtyState.textContent = state.dirty
    ? 'changes to export'
    : state.archiveComplete ? 'synchronized with TXT' : 'loaded subset';
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
  state.archiveBytes = new TextEncoder().encode(text).byteLength;
  state.downloadedBytes = state.archiveBytes;
  state.archiveComplete = true;
  state.pendingText = '';
  state.lineNumber = text.split(/\r?\n/).length;
  state.decoder = new TextDecoder();
  buildTimestampGroups();
  state.sourceName = sourceName;
  elements.sourceStatus.textContent = `${sourceName} | ${state.records.length} formulas loaded`;
  render();
  updateArchiveControls();
}

async function loadDefaultArchive() {
  try {
    const headResponse = await fetch(DATA_URL, { method: 'HEAD', cache: 'no-store' });
    if (!headResponse.ok) throw new Error(`HTTP ${headResponse.status}`);
    const totalBytes = Number(headResponse.headers.get('content-length'));
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) throw new Error('Archive size is unavailable.');

    resetRemoteArchive(totalBytes, 'data/prime-roots.txt');
    elements.sourceStatus.textContent = 'Loading the first 1,000 formulas...';
    updateLoadingProgress(0, 'Connecting to the TXT archive...');

    while (state.records.length < INITIAL_RECORD_LIMIT && state.downloadedBytes < state.archiveBytes) {
      const endByte = Math.min(state.archiveBytes - 1, state.downloadedBytes + RANGE_CHUNK_BYTES - 1);
      const remaining = INITIAL_RECORD_LIMIT - state.records.length;
      await loadRemoteRange(endByte, remaining, () => {
        const initialPercent = Math.min(100, state.records.length / INITIAL_RECORD_LIMIT * 100);
        updateLoadingProgress(initialPercent, `${state.records.length} of ${INITIAL_RECORD_LIMIT} formulas`);
      });
      await allowPaint();
    }

    if (!state.records.length) throw new Error('The file contains no records.');
    state.loading = false;
    buildTimestampGroups();
    elements.sourceStatus.textContent = state.archiveComplete
      ? `${state.sourceName} | complete archive | ${state.records.length} formulas`
      : `${state.sourceName} | initial subset | ${state.records.length} formulas`;
    render();
    updateArchiveControls();
    finishLoading();
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
  if (!state.archiveComplete || state.loading) return;
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

elements.blockPercent.addEventListener('input', updateArchiveControls);
elements.loadBlockButton.addEventListener('click', () => {
  const blockBytes = Math.ceil(state.archiveBytes * Number(elements.blockPercent.value) / 100);
  const target = Math.min(state.archiveBytes, state.downloadedBytes + blockBytes);
  loadArchiveTo(target, `Loading the next ${elements.blockPercent.value}% archive block...`);
});
elements.loadAllButton.addEventListener('click', () => {
  loadArchiveTo(state.archiveBytes, 'Loading the complete archive...');
});

if (window.matchMedia('(max-width: 850px)').matches) {
  elements.archiveBrowser.open = false;
  elements.methodDetails.open = false;
  elements.fileMenu.open = false;
}

loadDefaultArchive();
