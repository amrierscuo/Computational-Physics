import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_BYTES = 52_350_000;
const MIN_DECIMALS = 3;
const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(toolDirectory, '..');
const outputPath = path.join(projectDirectory, 'data', 'prime-roots.txt');
const temporaryPath = `${outputPath}.tmp`;
const timestampIndexPath = path.join(projectDirectory, 'data', 'timestamp-groups.txt');

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

function nextPrime(candidate, knownPrimes) {
  let value = candidate;
  while (true) {
    const limit = Math.sqrt(value);
    let prime = true;
    for (const divisor of knownPrimes) {
      if (divisor > limit) break;
      if (value % divisor === 0) {
        prime = false;
        break;
      }
    }
    if (prime) return value;
    value += 2;
  }
}

const header = '# Prime Root Lab NDJSON v1\n# Un record JSON per riga. Formule, passaggi, metriche e timestamp sono persistenti.\n';
const file = fs.openSync(temporaryPath, 'w');
let bytes = Buffer.byteLength(header);
let version = 0;
let candidate = 7;
let lastPrime = 5;
let nextProgress = 5_000_000;
const knownPrimes = [2, 3, 5];

try {
  fs.writeSync(file, header);
  while (bytes < TARGET_BYTES) {
    const prime = nextPrime(candidate, knownPrimes);
    knownPrimes.push(prime);
    version += 1;
    const line = `${JSON.stringify(buildRecord(prime, version))}\n`;
    fs.writeSync(file, line);
    bytes += Buffer.byteLength(line);
    lastPrime = prime;
    candidate = prime + 2;
    if (bytes >= nextProgress) {
      console.log(`${(bytes / 1_000_000).toFixed(2)} MB | v${version} | p=${prime}`);
      nextProgress += 5_000_000;
    }
  }
} finally {
  fs.closeSync(file);
}

fs.renameSync(temporaryPath, outputPath);

const generatedRecords = fs.readFileSync(outputPath, 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map(JSON.parse);
const timestampGroups = new Map();
for (const record of generatedRecords) {
  const timestamp = record.discoveredAt;
  if (!timestampGroups.has(timestamp)) {
    timestampGroups.set(timestamp, {
      schema: 1,
      timestamp,
      count: 0,
      firstVersion: record.version,
      lastVersion: record.version,
      firstPrime: record.prime,
      lastPrime: record.prime
    });
  }
  const group = timestampGroups.get(timestamp);
  group.count += 1;
  group.lastVersion = record.version;
  group.lastPrime = record.prime;
}
const timestampHeader = '# Prime Root Lab timestamp groups NDJSON v1\n# Un record per timestamp reale distinto.\n';
const timestampText = timestampHeader + [...timestampGroups.values()].map((group) => JSON.stringify(group)).join('\n') + '\n';
fs.writeFileSync(timestampIndexPath, timestampText);

console.log(JSON.stringify({
  bytes,
  megabytes: bytes / 1_000_000,
  records: version,
  lastPrime,
  distinctTimestamps: timestampGroups.size
}));
