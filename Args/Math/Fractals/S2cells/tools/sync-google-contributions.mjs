import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(toolDirectory, "..");
const defaults = {
  exclusions: path.join(projectDirectory, "data", "google-media-exclusions.json"),
  pins: path.join(projectDirectory, "data", "google-photo-place-pins.json"),
  output: path.join(projectDirectory, "data", "google-photos.json")
};
const options = parseArguments(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}
if (!options.export) throw new Error("Provide --export <live-google-contributions.json>.");

const source = await readJson(options.export);
const exclusions = await readJson(options.exclusions);
const pinPayload = await readJson(options.pins);
const sourceRecords = Array.isArray(source.records) ? source.records : [];
const excludedIds = new Set(exclusions.excludedPhotoIds || []);
const mediaRecords = sourceRecords.filter((record) => record.mediaType === "photo" || record.mediaType === "video");
const sourceIds = new Set(mediaRecords.map((record) => String(record.photoId || "")));

excludedIds.forEach((photoId) => {
  if (!sourceIds.has(String(photoId))) throw new Error(`Excluded media ID is not present in the export: ${photoId}`);
});

const placesById = new Map((pinPayload.places || []).map((place) => [String(place.placeId), { ...place }]));
const records = [];
const photoLinks = [];
const seenIds = new Set();

for (const sourceRecord of mediaRecords) {
  const photoId = cleanText(sourceRecord.photoId);
  if (!photoId || excludedIds.has(photoId)) continue;
  if (seenIds.has(photoId)) throw new Error(`Duplicate media ID: ${photoId}`);
  if (!sourceRecord.thumbnailUrl) throw new Error(`Missing thumbnail URL: ${photoId}`);
  seenIds.add(photoId);

  const placeId = extractPlaceId(sourceRecord);
  if (placeId && !placesById.has(placeId)) {
    placesById.set(placeId, {
      placeId,
      latitude: null,
      longitude: null,
      status: "not-queried"
    });
  }
  if (placeId) photoLinks.push({ photoId, placeId });
  const place = placeId ? placesById.get(placeId) : null;
  const located = hasValidCoordinates(place);
  const isVideo = sourceRecord.mediaType === "video";
  const title = cleanText(sourceRecord.title) || "Unknown place";
  const address = cleanText(sourceRecord.address) || null;

  records.push({
    photoId,
    mediaType: isVideo ? "video" : "photo",
    submissionType: isVideo ? "Google Maps Video" : "Google Maps Photo",
    title,
    address,
    placeLabel: cleanText(sourceRecord.placeLabel) || [title, address].filter(Boolean).join(" "),
    views: Math.max(0, Number(sourceRecord.views) || 0),
    duration: isVideo ? cleanText(sourceRecord.duration) || null : null,
    thumbnailUrl: String(sourceRecord.thumbnailUrl),
    placeId,
    placeUrl: googleMapsPlaceUrl(placeId, title),
    placeStatus: cleanText(place?.status) || (placeId ? "not-queried" : "missing"),
    latitude: located ? Number(place.latitude) : null,
    longitude: located ? Number(place.longitude) : null,
    locationMethod: located ? "google-place-pin" : null,
    locationReference: located ? placeId : null,
    reviewStatus: "keep"
  });
}

records.sort(compareMediaRecords);
photoLinks.sort((left, right) => left.photoId.localeCompare(right.photoId));
const places = [...placesById.values()].sort((left, right) => String(left.placeId).localeCompare(String(right.placeId)));
const generatedAt = new Date().toISOString();
const locatedRecords = records.filter(hasValidCoordinates);
const photoRecords = records.filter((record) => record.mediaType === "photo");
const videoRecords = records.filter((record) => record.mediaType === "video");

const output = {
  schemaVersion: 2,
  generatedAt,
  source: "Account-owned Google Maps Contributions DOM export",
  ownership: "User-owned public Google Maps media",
  reviewStatus: "complete",
  publicReady: true,
  candidateCount: mediaRecords.length,
  approvedCount: records.length,
  excludedCount: excludedIds.size,
  photoCount: photoRecords.length,
  videoCount: videoRecords.length,
  locatedCount: locatedRecords.length,
  locatedPhotoCount: photoRecords.filter(hasValidCoordinates).length,
  locatedVideoCount: videoRecords.filter(hasValidCoordinates).length,
  unlocatedCount: records.length - locatedRecords.length,
  mappedPlaceCount: new Set(locatedRecords.map(coordinateKey)).size,
  placePinSource: path.basename(options.pins),
  placeLinkedCount: photoLinks.length,
  resolvedPlaceIdCount: places.filter(hasValidCoordinates).length,
  unresolvedPlaceIdCount: places.filter((place) => !hasValidCoordinates(place)).length,
  locationPolicy: "Google Maps Place ID from the public Contributions UI; previously resolved official place pins are reused and unresolved places remain gallery-only",
  records
};

const updatedPins = {
  ...pinPayload,
  schemaVersion: 2,
  generatedAt,
  source: "Google Maps Contributions Place IDs with previously resolved Google Places locations",
  coordinatePolicy: "Reuse verified official Google Place coordinates; never invent coordinates for unresolved Place IDs",
  mediaCount: records.length,
  photoCount: records.length,
  placeCount: places.length,
  resolvedPlaceCount: places.filter(hasValidCoordinates).length,
  unresolvedPlaceCount: places.filter((place) => !hasValidCoordinates(place)).length,
  photos: photoLinks,
  places
};

validateOutput(output);
await writeCompactJson(options.output, output);
await writeCompactJson(options.pins, updatedPins);
printSummary(output, options.output, options.pins);

function parseArguments(args) {
  const parsed = { ...defaults, export: null, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--export") parsed.export = path.resolve(args[++index]);
    else if (argument === "--exclusions") parsed.exclusions = path.resolve(args[++index]);
    else if (argument === "--pins") parsed.pins = path.resolve(args[++index]);
    else if (argument === "--output") parsed.output = path.resolve(args[++index]);
    else if (argument === "--help" || argument === "-h") parsed.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeCompactJson(filePath, payload) {
  await writeFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function extractPlaceId(record) {
  if (record.placeId) return cleanText(record.placeId);
  return cleanText(record.bucketId).split(/\s+/).find((value) => /^ChIJ/.test(value)) || null;
}

function googleMapsPlaceUrl(placeId, title) {
  if (!placeId) return null;
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", title || "Google Maps place");
  url.searchParams.set("query_place_id", placeId);
  return url.href;
}

function cleanText(value) {
  return String(value || "").replaceAll("\u2014", "-").replace(/\s+/g, " ").trim();
}

function hasValidCoordinates(record) {
  if (record?.latitude === null || record?.latitude === undefined || record?.latitude === ""
    || record?.longitude === null || record?.longitude === undefined || record?.longitude === "") return false;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

function coordinateKey(record) {
  return `${Number(record.latitude).toFixed(7)},${Number(record.longitude).toFixed(7)}`;
}

function compareMediaRecords(left, right) {
  return Number(right.views || 0) - Number(left.views || 0)
    || left.submissionType.localeCompare(right.submissionType)
    || left.title.localeCompare(right.title)
    || left.photoId.localeCompare(right.photoId);
}

function validateOutput(payload) {
  if (payload.candidateCount !== payload.approvedCount + payload.excludedCount) throw new Error("Candidate count mismatch.");
  if (payload.photoCount + payload.videoCount !== payload.approvedCount) throw new Error("Media type count mismatch.");
  if (payload.locatedCount + payload.unlocatedCount !== payload.approvedCount) throw new Error("Location count mismatch.");
  const ids = new Set();
  payload.records.forEach((record) => {
    if (!record.photoId || ids.has(record.photoId)) throw new Error(`Invalid or duplicate media ID: ${record.photoId}`);
    ids.add(record.photoId);
    if (record.submissionType !== "Google Maps Photo" && record.submissionType !== "Google Maps Video") {
      throw new Error(`Invalid media type: ${record.submissionType}`);
    }
    if (record.reviewStatus !== "keep" || !record.thumbnailUrl) throw new Error(`Invalid public media record: ${record.photoId}`);
    if (record.locationMethod === "google-place-pin" && !record.placeId) throw new Error(`Located media has no Place ID: ${record.photoId}`);
  });
}

function printSummary(payload, outputPath, pinsPath) {
  console.log("Google Maps media dataset ready");
  console.log(`Approved: ${payload.approvedCount} (${payload.photoCount} photos, ${payload.videoCount} videos)`);
  console.log(`Excluded: ${payload.excludedCount}`);
  console.log(`Map-located: ${payload.locatedCount} media across ${payload.mappedPlaceCount} places`);
  console.log(`Gallery-only: ${payload.unlocatedCount}`);
  console.log(`Output: ${outputPath}`);
  console.log(`Place pins: ${pinsPath}`);
}

function printHelp() {
  console.log(`Usage:
  node tools/sync-google-contributions.mjs --export <live-google-contributions.json>

Options:
  --exclusions <file>  Reviewed exclusion IDs
  --pins <file>        Place ID and coordinate cache
  --output <file>      Google media output
  --help               Show this help`);
}
