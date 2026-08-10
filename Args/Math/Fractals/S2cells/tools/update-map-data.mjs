import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(toolDirectory, "..");
const dataDirectory = path.join(projectDirectory, "data");
const wayfarerPath = path.join(dataDirectory, "wayfarer-poi.json");
const streetViewPath = path.join(dataDirectory, "streetview-360.json");
const backupDirectory = path.join(projectDirectory, ".map-data-backups");
const allowedWayfarerTypes = new Set(["Wayspot Submission", "Photo Submission"]);
const finalAcceptedStatuses = new Set(["Accepted", "Appeal Accepted"]);
const validReviewStatuses = new Set(["keep", "exclude", "pending"]);

const options = parseArguments(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const currentWayfarer = await readPayload(wayfarerPath);
const currentStreetView = await readPayload(streetViewPath);
validateWayfarerPayload(currentWayfarer);
validateStreetViewPayload(currentStreetView);

if (options.check) {
  printValidationSummary(currentWayfarer, currentStreetView);
  process.exit(0);
}

const inputFiles = await resolveInputFiles(options);
if (!inputFiles.length) {
  console.log("Nessun file JSON o JSONL trovato. Copia i nuovi export in data/inbox e riprova.");
  printValidationSummary(currentWayfarer, currentStreetView);
  process.exit(0);
}

const importedPayloads = [];
for (const inputPath of inputFiles) importedPayloads.push(await readInput(inputPath));

const importState = {
  files: inputFiles.length,
  unsupported: 0,
  invalidCoordinates: 0,
  nonFinalWayfarer: 0,
  nonPublishedStreetView: 0,
  wayfarerAdded: 0,
  wayfarerUpdated: 0,
  streetViewAdded: 0,
  streetViewUpdated: 0,
  wayfarerInput: 0,
  streetViewInput: 0,
};

const wayfarerByKey = new Map();
const usedListIndexes = new Set();
for (const record of currentWayfarer.records) {
  const baseKey = wayfarerKey(record);
  const storageKey = wayfarerByKey.has(baseKey) ? `${baseKey}#${record.listIndex}` : baseKey;
  wayfarerByKey.set(storageKey, record);
  if (Number.isInteger(Number(record.listIndex))) usedListIndexes.add(Number(record.listIndex));
}
let nextListIndex = usedListIndexes.size ? Math.max(...usedListIndexes) + 1 : 0;

const streetViewByKey = new Map(currentStreetView.records.map((record) => [streetViewKey(record), record]));
let importedNonPublished = Number(currentStreetView.nonPublishedCount || 0);
let importedSourceIndexCount = Number(currentWayfarer.sourceIndexCount || currentWayfarer.records.length);

for (const imported of importedPayloads) {
  importedNonPublished = Math.max(
    importedNonPublished,
    Number(imported.metadata?.nonPublishedCount || 0),
  );
  importedSourceIndexCount = Math.max(
    importedSourceIndexCount,
    Number(imported.metadata?.sourceIndexCount || imported.metadata?.reportedCount || 0),
  );

  for (const incomingRecord of imported.records) {
    const kind = recordKind(incomingRecord);
    if (kind === "wayfarer") {
      importState.wayfarerInput += 1;
      if (!hasValidCoordinates(incomingRecord)) {
        importState.invalidCoordinates += 1;
        continue;
      }
      const status = incomingRecord.statusRaw || incomingRecord.status;
      if (!finalAcceptedStatuses.has(incomingRecord.status) && !finalAcceptedStatuses.has(status)) {
        importState.nonFinalWayfarer += 1;
        continue;
      }

      const key = wayfarerKey(incomingRecord);
      const existingEntry = findWayfarerEntry(wayfarerByKey, incomingRecord, key);
      const existing = existingEntry?.record;
      const merged = normalizeWayfarerRecord({ ...existing, ...incomingRecord }, existing);
      if (existing) {
        merged.listIndex = Number(existing.listIndex);
        merged.visiblePosition = Number(existing.visiblePosition || Number(existing.listIndex) + 1);
        importState.wayfarerUpdated += 1;
      } else {
        let requestedIndex = Number(incomingRecord.listIndex);
        if (!Number.isInteger(requestedIndex) || usedListIndexes.has(requestedIndex)) requestedIndex = nextListIndex;
        while (usedListIndexes.has(requestedIndex)) requestedIndex += 1;
        merged.listIndex = requestedIndex;
        merged.visiblePosition = requestedIndex + 1;
        usedListIndexes.add(requestedIndex);
        nextListIndex = Math.max(nextListIndex, requestedIndex + 1);
        importState.wayfarerAdded += 1;
      }
      wayfarerByKey.set(existingEntry?.storageKey || key, merged);
      continue;
    }

    if (kind === "streetview") {
      importState.streetViewInput += 1;
      if (incomingRecord.publishStatus !== "PUBLISHED") {
        importState.nonPublishedStreetView += 1;
        continue;
      }
      if (!hasValidCoordinates(incomingRecord)) {
        importState.invalidCoordinates += 1;
        continue;
      }
      const normalized = normalizeStreetViewRecord(incomingRecord);
      const key = streetViewKey(normalized);
      if (streetViewByKey.has(key)) importState.streetViewUpdated += 1;
      else importState.streetViewAdded += 1;
      streetViewByKey.set(key, { ...streetViewByKey.get(key), ...normalized });
      continue;
    }

    importState.unsupported += 1;
  }
}

importedNonPublished = Math.max(importedNonPublished, importState.nonPublishedStreetView);
const now = new Date().toISOString();
const wayfarerRecords = [...wayfarerByKey.values()].sort((left, right) => Number(left.listIndex) - Number(right.listIndex));
const streetViewRecords = [...streetViewByKey.values()].sort(compareStreetViewRecords);
const nextWayfarer = buildWayfarerPayload(
  currentWayfarer,
  wayfarerRecords,
  now,
  importedSourceIndexCount,
  importState.wayfarerAdded,
);
const nextStreetView = buildStreetViewPayload(currentStreetView, streetViewRecords, now, importedNonPublished);

validateWayfarerPayload(nextWayfarer);
validateStreetViewPayload(nextStreetView);

const writeWayfarer = importState.wayfarerInput > 0;
const writeStreetView = importState.streetViewInput > 0;
const backupPath = await backupCurrentFiles(writeWayfarer, writeStreetView);
const writes = [];
if (writeWayfarer) writes.push(writeCompactJson(wayfarerPath, nextWayfarer));
if (writeStreetView) writes.push(writeCompactJson(streetViewPath, nextStreetView));
await Promise.all(writes);

console.log("Aggiornamento dati della Field Map completato");
console.log(`File importati: ${importState.files}`);
console.log(`Wayfarer: ${currentWayfarer.records.length} -> ${nextWayfarer.records.length} (${importState.wayfarerAdded} nuovi, ${importState.wayfarerUpdated} aggiornati)`);
console.log(`Street View 360: ${currentStreetView.records.length} -> ${nextStreetView.records.length} (${importState.streetViewAdded} nuovi, ${importState.streetViewUpdated} aggiornati)`);
console.log(`Ignorati: ${importState.unsupported} tipi non supportati, ${importState.nonFinalWayfarer} Wayfarer non finali, ${importState.nonPublishedStreetView} panorami non pubblicati, ${importState.invalidCoordinates} coordinate non valide`);
console.log(`Backup locale: ${backupPath}`);
console.log("Ora controlla map.html in locale. Se e corretto, fai commit e push dei due JSON modificati.");

function parseArguments(argumentsList) {
  const result = { check: false, help: false, inbox: null, files: [] };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--check") result.check = true;
    else if (argument === "--help" || argument === "-h") result.help = true;
    else if (argument === "--inbox") result.inbox = argumentsList[++index];
    else result.files.push(argument);
  }
  return result;
}

async function resolveInputFiles(inputOptions) {
  const files = inputOptions.files.map((file) => path.resolve(file));
  const inbox = path.resolve(inputOptions.inbox || path.join(dataDirectory, "inbox"));
  try {
    const names = await readdir(inbox, { withFileTypes: true });
    for (const entry of names) {
      if (!entry.isFile() || !/\.(json|jsonl)$/i.test(entry.name)) continue;
      files.push(path.join(inbox, entry.name));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return [...new Set(files)].filter((file) => /\.(json|jsonl)$/i.test(file));
}

async function readInput(inputPath) {
  const source = await readFile(inputPath, "utf8");
  if (/\.jsonl$/i.test(inputPath)) {
    return {
      metadata: {},
      records: source.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
    };
  }
  const payload = JSON.parse(source);
  if (Array.isArray(payload)) return { metadata: {}, records: payload };
  if (payload?.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return {
      metadata: payload,
      records: payload.features.map((feature) => ({
        ...feature.properties,
        longitude: feature.geometry?.coordinates?.[0],
        latitude: feature.geometry?.coordinates?.[1],
      })),
    };
  }
  if (Array.isArray(payload?.records)) return { metadata: payload, records: payload.records };
  if (recordKind(payload)) return { metadata: {}, records: [payload] };
  throw new Error(`Struttura dati non riconosciuta: ${inputPath}`);
}

function recordKind(record) {
  if (allowedWayfarerTypes.has(record?.submissionType)) return "wayfarer";
  if (record?.panoramaType === "Street View 360" || record?.photoId) return "streetview";
  return null;
}

function wayfarerKey(record) {
  if (record?.importKey) return String(record.importKey);
  return [
    record?.sourceId ? `id:${record.sourceId}` : "fallback",
    record?.submissionType || "",
    normalizeKeyPart(record?.title),
    record?.submissionDate || "",
    coordinateKey(record),
    imageIdentity(record),
  ].join(":");
}

function imageIdentity(record) {
  if (record?.submissionType !== "Photo Submission") return "nomination";
  const imageUrl = record?.submissionType === "Photo Submission"
    ? record?.submittedPhotoUrl || record?.thumbnailUrl
    : record?.mainSubmissionPhotoUrl || record?.thumbnailUrl;
  if (!imageUrl) return "no-image";
  return createHash("sha256").update(String(imageUrl)).digest("hex").slice(0, 16);
}

function findWayfarerEntry(recordsByKey, incoming, preferredKey) {
  if (recordsByKey.has(preferredKey)) return { storageKey: preferredKey, record: recordsByKey.get(preferredKey) };
  const incomingIndex = Number(incoming.listIndex);
  if (!Number.isInteger(incomingIndex)) return null;
  for (const [storageKey, record] of recordsByKey) {
    if (Number(record.listIndex) !== incomingIndex) continue;
    if (record.submissionType !== incoming.submissionType) continue;
    if (record.sourceId && incoming.sourceId && record.sourceId !== incoming.sourceId) continue;
    return { storageKey, record };
  }
  return null;
}

function streetViewKey(record) {
  if (!record?.photoId) throw new Error("Un panorama Street View non contiene photoId.");
  return String(record.photoId);
}

function normalizeWayfarerRecord(record, existing) {
  const type = record.submissionType;
  const roles = type === "Photo Submission" ? ["submitted"] : ["primary", "support"];
  const imageReview = {
    primary: reviewStatus(record, existing, "primary", roles),
    support: reviewStatus(record, existing, "support", roles),
    submitted: reviewStatus(record, existing, "submitted", roles),
  };
  const primaryKept = imageReview.primary === "keep";
  const supportKept = imageReview.support === "keep";
  const submittedKept = imageReview.submitted === "keep";
  const normalized = {
    ...record,
    importKey: wayfarerKey(record),
    status: finalAcceptedStatuses.has(record.status) ? record.status : "Accepted",
    statusRaw: record.statusRaw || record.status || "Accepted",
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    imageReview,
  };
  delete normalized.imageFiles;
  if (type === "Photo Submission") {
    normalized.mainSubmissionPhotoUrl = null;
    normalized.supportingPhotoUrl = null;
    normalized.submittedPhotoUrl = submittedKept ? record.submittedPhotoUrl || null : null;
    normalized.thumbnailUrl = submittedKept ? record.thumbnailUrl || normalized.submittedPhotoUrl : null;
    normalized.displayPhotoUrl = normalized.submittedPhotoUrl;
  } else {
    normalized.mainSubmissionPhotoUrl = primaryKept ? record.mainSubmissionPhotoUrl || null : null;
    normalized.supportingPhotoUrl = supportKept ? record.supportingPhotoUrl || null : null;
    normalized.submittedPhotoUrl = null;
    normalized.thumbnailUrl = primaryKept ? record.thumbnailUrl || normalized.mainSubmissionPhotoUrl : null;
    normalized.displayPhotoUrl = normalized.mainSubmissionPhotoUrl || normalized.supportingPhotoUrl;
  }
  return normalized;
}

function reviewStatus(record, existing, role, applicableRoles) {
  if (!applicableRoles.includes(role)) return "exclude";
  const incoming = record.imageReview?.[role];
  if (validReviewStatuses.has(incoming)) return incoming;
  const previous = existing?.imageReview?.[role];
  if (validReviewStatuses.has(previous)) return previous;
  return "pending";
}

function normalizeStreetViewRecord(record) {
  return {
    ...record,
    photoId: String(record.photoId),
    panoramaType: "Street View 360",
    title: record.title || `Street View 360${record.captureTime ? ` - ${String(record.captureTime).slice(0, 10)}` : ""}`,
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    publishStatus: "PUBLISHED",
  };
}

function buildWayfarerPayload(previous, records, generatedAt, importedIndexCount, addedCount) {
  const types = countBy(records, (record) => record.submissionType);
  const imageRoles = records.flatMap((record) => (
    record.submissionType === "Photo Submission"
      ? [record.imageReview?.submitted]
      : [record.imageReview?.primary, record.imageReview?.support]
  ));
  const reviewComplete = imageRoles.every((status) => status === "keep" || status === "exclude");
  const published = imageRoles.filter((status) => status === "keep").length;
  return {
    ...previous,
    schemaVersion: 1,
    generatedAt,
    reviewStatus: reviewComplete ? "complete" : "pending",
    publicReady: reviewComplete,
    partial: false,
    sourceIndexCount: Math.max(importedIndexCount, Number(previous.sourceIndexCount || 0) + addedCount),
    fullDetailTargetCount: Math.max(Number(previous.fullDetailTargetCount || 0) + addedCount, records.length),
    recordCount: records.length,
    types,
    imageCounts: {
      source: imageRoles.length,
      excluded: imageRoles.length - published,
      published,
    },
    records,
  };
}

function buildStreetViewPayload(previous, records, generatedAt, nonPublishedCount) {
  const coordinateGroups = new Set(records.map(coordinateKey));
  return {
    ...previous,
    schemaVersion: 1,
    generatedAt,
    source: previous.source || "Google Street View Publish API",
    ownership: previous.ownership || "Account-owned public panoramas",
    publicReady: true,
    sourceRecordCount: records.length + nonPublishedCount,
    recordCount: records.length,
    publishedCount: records.length,
    nonPublishedCount,
    coordinateGroupCount: coordinateGroups.size,
    records,
  };
}

function validateWayfarerPayload(payload) {
  if (!payload || !Array.isArray(payload.records)) throw new Error("wayfarer-poi.json non contiene records.");
  const indexes = new Set();
  for (const record of payload.records) {
    if (!allowedWayfarerTypes.has(record.submissionType)) throw new Error(`Tipo Wayfarer non valido: ${record.submissionType}`);
    if (!hasValidCoordinates(record)) throw new Error(`Coordinate Wayfarer non valide: ${record.title || record.sourceId}`);
    const listIndex = Number(record.listIndex);
    if (!Number.isInteger(listIndex) || indexes.has(listIndex)) throw new Error(`listIndex Wayfarer non valido o duplicato: ${record.listIndex}`);
    indexes.add(listIndex);
    assertPrivateImageRules(record);
  }
}

function validateStreetViewPayload(payload) {
  if (!payload || !Array.isArray(payload.records)) throw new Error("streetview-360.json non contiene records.");
  const keys = new Set();
  for (const record of payload.records) {
    if (record.panoramaType !== "Street View 360" || record.publishStatus !== "PUBLISHED") {
      throw new Error(`Panorama non pubblico nel dataset: ${record.photoId}`);
    }
    if (!hasValidCoordinates(record)) throw new Error(`Coordinate Street View non valide: ${record.photoId}`);
    const key = streetViewKey(record);
    if (keys.has(key)) throw new Error(`Duplicato Street View: ${key}`);
    keys.add(key);
  }
}

function assertPrivateImageRules(record) {
  if (record.submissionType === "Photo Submission") {
    if (record.mainSubmissionPhotoUrl || record.supportingPhotoUrl) throw new Error(`Photo Submission con immagini non ammesse: ${record.title}`);
    if (record.imageReview?.submitted !== "keep" && record.submittedPhotoUrl) throw new Error(`Immagine non revisionata pubblicata: ${record.title}`);
  } else {
    if (record.imageReview?.primary !== "keep" && record.mainSubmissionPhotoUrl) throw new Error(`Foto primaria non revisionata pubblicata: ${record.title}`);
    if (record.imageReview?.support !== "keep" && record.supportingPhotoUrl) throw new Error(`Foto di supporto non revisionata pubblicata: ${record.title}`);
  }
}

function hasValidCoordinates(record) {
  const latitude = Number(record?.latitude);
  const longitude = Number(record?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

function compareStreetViewRecords(left, right) {
  return String(right.captureTime || "").localeCompare(String(left.captureTime || ""))
    || String(left.photoId).localeCompare(String(right.photoId));
}

function coordinateKey(record) {
  return `${Number(record.latitude).toFixed(7)},${Number(record.longitude).toFixed(7)}`;
}

function normalizeKeyPart(value) {
  return String(value || "").trim().toLocaleLowerCase("it").replace(/\s+/g, " ");
}

function countBy(records, selector) {
  return records.reduce((counts, record) => {
    const key = selector(record);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

async function backupCurrentFiles(includeWayfarer, includeStreetView) {
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const target = path.join(backupDirectory, stamp);
  await mkdir(target, { recursive: true });
  const copies = [];
  if (includeWayfarer) copies.push(copyFile(wayfarerPath, path.join(target, path.basename(wayfarerPath))));
  if (includeStreetView) copies.push(copyFile(streetViewPath, path.join(target, path.basename(streetViewPath))));
  await Promise.all(copies);
  return target;
}

async function readPayload(target) {
  return JSON.parse(await readFile(target, "utf8"));
}

async function writeCompactJson(target, payload) {
  await writeFile(target, `${JSON.stringify(payload)}\n`, "utf8");
}

function printValidationSummary(wayfarer, streetView) {
  console.log("Dataset validi");
  console.log(`Wayfarer: ${wayfarer.records.length}`);
  console.log(`Street View 360: ${streetView.records.length}`);
  console.log(`Totale mappa: ${wayfarer.records.length + streetView.records.length}`);
}

function printHelp() {
  console.log(`Uso:
  node tools/update-map-data.mjs --inbox data/inbox
  node tools/update-map-data.mjs file1.json file2.jsonl
  node tools/update-map-data.mjs --check

I file possono contenere un array, un oggetto con records, JSONL oppure GeoJSON.`);
}
