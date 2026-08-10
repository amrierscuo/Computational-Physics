import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(toolDirectory, "..");
const defaultWayfarerPath = path.join(projectDirectory, "data", "wayfarer-poi.json");
const defaultOutputPath = path.join(projectDirectory, "data", "google-photos.json");
const options = parseArguments(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (options.check) {
  const payload = await readJson(options.output);
  validateOutput(payload);
  printSummary(payload, options.output);
  process.exit(0);
}

if (options.inbox) options.pairs.push(...await pairsFromInbox(options.inbox));

if (!options.pairs.length) {
  throw new Error("Provide at least one --pair <dataset.json> <decisions.json>.");
}

const wayfarer = await readJson(options.wayfarer);
if (!Array.isArray(wayfarer.records)) throw new Error("Invalid Wayfarer dataset.");

const reviewedRecords = [];
const bands = [];
const seenPhotoIds = new Set();
let candidateCount = 0;
let excludedCount = 0;

for (const pair of options.pairs) {
  const dataset = await readJson(pair.dataset);
  const decisions = await readJson(pair.decisions);
  validateReviewPair(dataset, decisions, pair);
  const excluded = new Set(decisions.excludedPhotoIds || []);
  candidateCount += dataset.records.length;
  excludedCount += excluded.size;
  bands.push({
    minimumViews: Number(dataset.minimumViews),
    maximumViews: Number.isFinite(Number(dataset.maximumViews)) ? Number(dataset.maximumViews) : null,
    candidateCount: dataset.records.length,
    approvedCount: dataset.records.length - excluded.size,
    excludedCount: excluded.size
  });

  for (const record of dataset.records) {
    if (excluded.has(record.photoId)) continue;
    if (seenPhotoIds.has(record.photoId)) throw new Error(`Duplicate approved photoId: ${record.photoId}`);
    seenPhotoIds.add(record.photoId);
    reviewedRecords.push(normalizePhoto(record));
  }
}

const wayfarerByTitle = buildWayfarerTitleIndex(wayfarer.records);
reviewedRecords.forEach((record) => applyDirectLocation(record, wayfarerByTitle));
propagateExactPlaceLocations(reviewedRecords);

reviewedRecords.sort((left, right) => (
  Number(right.views) - Number(left.views)
  || left.title.localeCompare(right.title)
  || left.photoId.localeCompare(right.photoId)
));

const locatedCount = reviewedRecords.filter(hasValidCoordinates).length;
const mappedPlaceCount = new Set(reviewedRecords.filter(hasValidCoordinates).map(coordinateKey)).size;
const generatedAt = new Date().toISOString();
const payload = {
  schemaVersion: 1,
  generatedAt,
  source: "Reviewed account-owned Google Maps photos",
  ownership: "User-owned public Google Maps photos",
  reviewStatus: "complete",
  publicReady: true,
  candidateCount,
  approvedCount: reviewedRecords.length,
  excludedCount,
  locatedCount,
  unlocatedCount: reviewedRecords.length - locatedCount,
  mappedPlaceCount,
  locationPolicy: "Exact normalized title plus compatible municipality from an accepted Wayfarer record; exact place-label propagation only",
  bands,
  records: reviewedRecords
};

validateOutput(payload);
await writeFile(options.output, `${JSON.stringify(payload)}\n`, "utf8");
printSummary(payload, options.output);

function parseArguments(args) {
  const parsed = {
    check: false,
    help: false,
    wayfarer: defaultWayfarerPath,
    output: defaultOutputPath,
    inbox: null,
    pairs: []
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--check") parsed.check = true;
    else if (argument === "--help" || argument === "-h") parsed.help = true;
    else if (argument === "--wayfarer") parsed.wayfarer = path.resolve(args[++index]);
    else if (argument === "--output") parsed.output = path.resolve(args[++index]);
    else if (argument === "--inbox") parsed.inbox = path.resolve(args[++index]);
    else if (argument === "--pair") {
      parsed.pairs.push({
        dataset: path.resolve(args[++index]),
        decisions: path.resolve(args[++index])
      });
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return parsed;
}

async function pairsFromInbox(inboxPath) {
  const entries = await readdir(inboxPath, { withFileTypes: true });
  const jsonPaths = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(inboxPath, entry.name));
  const datasets = new Map();
  const decisions = [];
  for (const filePath of jsonPaths) {
    const payload = await readJson(filePath);
    if (Array.isArray(payload.records)) datasets.set(path.basename(filePath), filePath);
    if (Array.isArray(payload.excludedPhotoIds) && payload.sourceDataset) decisions.push({ payload, filePath });
  }
  return decisions.map(({ payload, filePath }) => {
    const dataset = datasets.get(path.basename(payload.sourceDataset));
    if (!dataset) throw new Error(`Dataset ${payload.sourceDataset} not found in ${inboxPath}`);
    return { dataset, decisions: filePath };
  });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function validateReviewPair(dataset, decisions, pair) {
  if (!Array.isArray(dataset.records)) throw new Error(`Invalid records in ${pair.dataset}`);
  if (!Array.isArray(decisions.excludedPhotoIds)) throw new Error(`Invalid decisions in ${pair.decisions}`);
  if (Number(decisions.candidateCount) !== dataset.records.length) {
    throw new Error(`Candidate count mismatch for ${pair.dataset}`);
  }
  if (path.basename(decisions.sourceDataset || "") !== path.basename(pair.dataset)) {
    throw new Error(`Decision source mismatch for ${pair.dataset}`);
  }
  const datasetIds = new Set(dataset.records.map((record) => record.photoId));
  decisions.excludedPhotoIds.forEach((photoId) => {
    if (!datasetIds.has(photoId)) throw new Error(`Excluded photoId not found: ${photoId}`);
  });
  if (Number(decisions.excludeCount) !== decisions.excludedPhotoIds.length) {
    throw new Error(`Excluded count mismatch for ${pair.decisions}`);
  }
}

function normalizePhoto(record) {
  if (!record.photoId || !record.thumbnailUrl) throw new Error("Google photo missing photoId or thumbnailUrl.");
  return {
    photoId: String(record.photoId),
    submissionType: "Google Maps Photo",
    title: cleanText(record.title) || "Unknown place",
    placeLabel: cleanText(record.placeLabel) || "Unknown place",
    views: Math.max(0, Number(record.views) || 0),
    thumbnailUrl: String(record.thumbnailUrl),
    latitude: null,
    longitude: null,
    locationMethod: null,
    locationReference: null,
    reviewStatus: "keep"
  };
}

function cleanText(value) {
  return String(value || "").replaceAll("\u2014", "-").replace(/\s+/g, " ").trim();
}

function buildWayfarerTitleIndex(records) {
  const index = new Map();
  records.filter(hasValidCoordinates).forEach((record) => {
    const key = normalizeText(record.title);
    if (!key || key === "unknown place") return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  });
  return index;
}

function applyDirectLocation(photo, wayfarerByTitle) {
  const titleKey = normalizeText(photo.title);
  if (!titleKey || titleKey === "unknown place") return;
  const matches = wayfarerByTitle.get(titleKey) || [];
  const uniqueCoordinates = new Map(matches.map((record) => [coordinateKey(record), record]));
  if (uniqueCoordinates.size !== 1) return;
  const match = uniqueCoordinates.values().next().value;
  const googleMunicipality = municipalityFromGoogleLabel(photo.placeLabel);
  const wayfarerMunicipality = municipalityFromWayfarerAddress(match.address);
  if (!municipalitiesCompatible(googleMunicipality, wayfarerMunicipality)) return;
  photo.latitude = Number(match.latitude);
  photo.longitude = Number(match.longitude);
  photo.locationMethod = "wayfarer-title-municipality";
  photo.locationReference = String(match.sourceId || match.listIndex || match.title);
}

function propagateExactPlaceLocations(records) {
  const groups = new Map();
  records.forEach((record) => {
    const key = normalizeText(record.placeLabel);
    if (!key || key === "unknown place") return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  groups.forEach((group) => {
    const located = group.filter(hasValidCoordinates);
    const coordinates = new Map(located.map((record) => [coordinateKey(record), record]));
    if (coordinates.size !== 1) return;
    const source = coordinates.values().next().value;
    group.filter((record) => !hasValidCoordinates(record)).forEach((record) => {
      record.latitude = Number(source.latitude);
      record.longitude = Number(source.longitude);
      record.locationMethod = "exact-place-label";
      record.locationReference = source.locationReference;
    });
  });
}

function municipalityFromGoogleLabel(value) {
  const match = String(value || "").match(/\b\d{5}\s+(.+)$/i);
  if (!match) return "";
  return normalizeText(match[1]
    .replace(/\bMetropolitan City of\b.*$/i, "")
    .replace(/\bProvince of\b.*$/i, "")
    .split(",")[0]
    .replace(/\s+(?:CA|SU|SS|CI|OR|NU|OT|VS)\b.*$/i, ""));
}

function municipalityFromWayfarerAddress(value) {
  const parts = String(value || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3 || !/^[A-Z]{2}$/i.test(parts.at(-2))) return "";
  return normalizeText(parts.at(-3));
}

function municipalitiesCompatible(left, right) {
  if (!left || !right || left === "ca" || right === "ca") return false;
  return left === right || left.endsWith(` ${right}`) || right.endsWith(` ${left}`);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasValidCoordinates(record) {
  if (record.latitude === null || record.latitude === undefined || record.latitude === ""
    || record.longitude === null || record.longitude === undefined || record.longitude === "") return false;
  return Number.isFinite(Number(record.latitude))
    && Number.isFinite(Number(record.longitude))
    && Number(record.latitude) >= -90
    && Number(record.latitude) <= 90
    && Number(record.longitude) >= -180
    && Number(record.longitude) <= 180;
}

function coordinateKey(record) {
  return `${Number(record.latitude).toFixed(7)},${Number(record.longitude).toFixed(7)}`;
}

function validateOutput(payload) {
  if (!Array.isArray(payload.records)) throw new Error("Google photo output has no records array.");
  if (Number(payload.approvedCount) !== payload.records.length) throw new Error("Approved count mismatch.");
  if (Number(payload.candidateCount) !== Number(payload.approvedCount) + Number(payload.excludedCount)) {
    throw new Error("Candidate count mismatch.");
  }
  const ids = new Set();
  payload.records.forEach((record) => {
    if (!record.photoId || ids.has(record.photoId)) throw new Error(`Invalid or duplicate photoId: ${record.photoId}`);
    ids.add(record.photoId);
    if (record.reviewStatus !== "keep") throw new Error(`Unapproved record in output: ${record.photoId}`);
    if (!record.thumbnailUrl || !Number.isFinite(Number(record.views))) throw new Error(`Invalid photo record: ${record.photoId}`);
    const hasLatitude = record.latitude !== null && record.latitude !== undefined;
    const hasLongitude = record.longitude !== null && record.longitude !== undefined;
    if (hasLatitude !== hasLongitude) throw new Error(`Partial coordinates: ${record.photoId}`);
    if (hasLatitude && !hasValidCoordinates(record)) throw new Error(`Invalid coordinates: ${record.photoId}`);
  });
  const located = payload.records.filter(hasValidCoordinates).length;
  if (located !== Number(payload.locatedCount)) throw new Error("Located count mismatch.");
}

function printSummary(payload, outputPath) {
  console.log("Google Maps photo dataset ready");
  console.log(`Approved: ${payload.approvedCount}`);
  console.log(`Excluded: ${payload.excludedCount}`);
  console.log(`Map-located: ${payload.locatedCount} photos across ${payload.mappedPlaceCount} places`);
  console.log(`Gallery-only: ${payload.unlocatedCount}`);
  console.log(`Output: ${outputPath}`);
}

function printHelp() {
  console.log("Usage:");
  console.log("  node tools/build-google-photos.mjs --pair <dataset.json> <decisions.json> [--pair ...]");
  console.log("Options:");
  console.log("  --wayfarer <file>  Wayfarer coordinate reference dataset");
  console.log("  --output <file>     Output path, defaults to data/google-photos.json");
  console.log("  --inbox <folder>    Auto-pair datasets and decision files in one folder");
  console.log("  --check             Validate the current output only");
}
