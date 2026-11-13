// The player's own pictures and files, chosen on the Replacements pane, by the name the game asks for them.
//
// A picture is named as DFU names a loose file (TextureReplacement): a CIF frame `FILE.CIF_<record>-<frame>[_<Metal>]`
// or a whole IMG `FILE.IMG`. A spell icon is `ICON00I0.IMG_<index>`; a painting of the port's own by its name. A CIF
// frame chosen for one metal answers that metal; one chosen for every metal answers the rest. A whole file
// (`WEAPON04.CIF`) is read in place of the game's own by the readers that ask for it: the weapon in hand, the casting
// hands and the paper doll's heads. Each reader asks here before any mod.
import { decodePng } from '../textureReplacement.js';
import { CifRciFile } from '../../formats/cifRciFile.js';
import { resampleRgba } from '../../formats/resample.js';

/** The port's own paintings a player may replace, by the name they are kept under: the file beside the page and its
 *  own size. The enhanced skin's held map, the climbing hands' fist and reaching arm, and the guns' frame strips. */
export const PORT_PAINTINGS = Object.freeze({
  'held-map': Object.freeze({ file: 'art/held-map.png', width: 1648, height: 1086 }),
  'climb-grip': Object.freeze({ file: 'art/climb-grip.png', width: 105, height: 152 }),
  'climb-reach': Object.freeze({ file: 'art/climb-reach.png', width: 183, height: 114 }),
  'thunderlock-frames': Object.freeze({ file: 'art/thunderlock-frames.png', width: 1120, height: 98 }),
  'pistol-frames': Object.freeze({ file: 'art/pistol-frames.png', width: 528, height: 113 }),
});
export const HELD_MAP_PICTURE = 'held-map';

const CIF_NAME = /^(.+\.(?:CIF|RCI|CFA))_(\d+)-(\d+)(?:_([A-Za-z]+))?$/i;
/** A CIF frame's name read back: its file, record, frame and metal (null for every metal), or null. */
export function parseCifPictureName(name) {
  const match = CIF_NAME.exec(String(name ?? ''));
  return match ? { file: match[1].toUpperCase(), record: Number(match[2]), frame: Number(match[3]), metal: match[4] ?? null } : null;
}
/** The name a CIF frame is asked by, with or without a metal. */
export const cifPictureName = (file, record, frame = 0, metal = null) =>
  `${String(file).toUpperCase()}_${Number(record)}-${Number(frame)}${metal ? `_${metal}` : ''}`;
/** A name in the one spelling the pictures are kept by: a CIF frame's and an IMG's in capitals, a painting's as it is. */
export function canonicalPictureName(name) {
  const cif = parseCifPictureName(name);
  if (cif) return cifPictureName(cif.file, cif.record, cif.frame, cif.metal);
  const text = String(name ?? '');
  return /\.IMG(_\d+)?$/i.test(text) ? text.toUpperCase() : text;
}

let pictures = new Map(); // canonical name -> { load, blob, stamp }
let files = new Map(); // FILE -> { load, stamp }
let generation = 0;
const urls = new Map(); // canonical name -> object URL
/** Counts every registration: a cache of anything drawn from these pictures keys on it. */
export const playerPicturesGeneration = () => generation;

function forgetUrls() {
  for (const url of urls.values()) globalThis.URL?.revokeObjectURL?.(url);
  urls.clear();
}
/** Register the player's pictures: [{ name, stamp, load, blob? }]. Answers how many. */
export function setPlayerPictures(entries) {
  pictures = new Map();
  for (const entry of entries ?? []) {
    if (!entry?.name || typeof entry.load !== 'function') continue;
    pictures.set(canonicalPictureName(entry.name), { load: entry.load, blob: entry.blob ?? null, stamp: entry.stamp ?? 0 });
  }
  forgetUrls();
  generation++;
  return pictures.size;
}
/** Register the player's whole files: [{ file, stamp, load }]. Answers how many. */
export function setPlayerFiles(entries) {
  files = new Map();
  for (const entry of entries ?? []) {
    if (!entry?.file || typeof entry.load !== 'function') continue;
    files.set(String(entry.file).toUpperCase(), { load: entry.load, stamp: entry.stamp ?? 0 });
  }
  generation++;
  return files.size;
}
export const playerPictureNames = () => [...pictures.keys()];
export const playerFileNames = () => [...files.keys()];

/** The entry that answers an asked name: a CIF frame's own metal's, else the one for every metal. */
function entryOf(name) {
  if (!pictures.size) return null;
  const cif = parseCifPictureName(name);
  if (!cif) return pictures.get(canonicalPictureName(name)) ?? null;
  return pictures.get(cifPictureName(cif.file, cif.record, cif.frame, cif.metal)) ??
    pictures.get(cifPictureName(cif.file, cif.record, cif.frame)) ?? null;
}
export const hasPlayerPicture = (name) => !!entryOf(name);
/** When the answering picture was kept (a texture made of it keys on this), or null. */
export const playerPictureStamp = (name) => entryOf(name)?.stamp ?? null;

/** The player's picture for an asked name, top row first (`{ width, height, data }`), or null. Never throws. */
export async function playerPictureRgba(name, { decode = decodePng } = {}) {
  const entry = entryOf(name);
  if (!entry) return null;
  try {
    const bytes = await entry.load();
    return bytes?.byteLength ? await decode(bytes) : null;
  } catch (e) {
    console.warn(`[replacements] the picture ${name} would not decode - the game's own draws:`, e?.message ?? e);
    return null;
  }
}
/** The player's painting brought to a gun strip's own size (its cells are cut and measured at that size), or null. */
export async function playerStrip(name, strip, decode = decodePng) {
  const picture = await playerPictureRgba(name, { decode });
  return picture?.width ? resampleRgba(picture, strip.cellW * strip.frames, strip.cellH) : null;
}
/** The player's picture for an asked name as a URL an image can show, or null. Made once a registration. */
export function playerPictureUrl(name) {
  const entry = entryOf(name);
  if (!entry?.blob || typeof globalThis.URL?.createObjectURL !== 'function') return null;
  const key = canonicalPictureName(name);
  if (!urls.has(key)) urls.set(key, globalThis.URL.createObjectURL(entry.blob));
  return urls.get(key);
}

export const hasPlayerFile = (file) => files.has(String(file ?? '').toUpperCase());
export const playerFileStamp = (file) => files.get(String(file ?? '').toUpperCase())?.stamp ?? null;
/** The bytes of the player's own copy of a file, or null. Never throws. */
export async function playerFileBytes(file) {
  const entry = files.get(String(file ?? '').toUpperCase());
  if (!entry) return null;
  try {
    const bytes = await entry.load();
    return bytes?.byteLength ? bytes : null;
  } catch (e) {
    console.warn(`[replacements] the file ${file} would not read - the game's own draws:`, e?.message ?? e);
    return null;
  }
}
/** Two CIF files have the same records with the same frame counts. */
export const sameCifShape = (a, b) =>
  !!a && !!b && a.recordCount === b.recordCount &&
  Array.from({ length: a.recordCount }, (_, record) => record).every((record) => a.getFrameCount(record) === b.getFrameCount(record));
/** The player's own copy of a CIF, read as the game reads its file, or null. Given the game's `original`, a copy of
 *  another shape is not answered. */
export async function playerCifCopy(file, palette = null, original = null) {
  const bytes = await playerFileBytes(file);
  if (!bytes) return null;
  const copy = new CifRciFile();
  try {
    if (!copy.load(bytes, String(file).toUpperCase(), palette)) return null;
  } catch {
    return null;
  }
  return !original || sameCifShape(copy, original) ? copy : null;
}
