// Import: a zip of replacement pictures and CIF files, each named for what it replaces, kept in one go.
//
// A picture's name is the one Daggerfall Unity reads loose files by, in any folder of the zip: a texture's
// `{archive}_{record}-{frame}[_{Dye}].png` (`112366/112366_0-0.png` is the Female Orc Warrior's first frame; a metal's
// dye, `233_12-0_Daedric.png`), a CIF frame's `{FILE}_{record}-{frame}[_{Metal}].png` (`LONGSWORD.CIF_0-0_Daedric.png`)
// or an IMG's `{FILE}.png` (`BODY00I0.IMG.png`). A spell icon is `ICON00I0.IMG_{index}.png`, a painting of the port's
// own its name (`climb-grip.png`); a CIF named as the game's (`WEAPON04.CIF`) replaces it whole. Each is held to the
// pane's rules against the original it names, and to replacementSafety.js's; a name for another map is passed over.
import { textureEntry, isVendorArchive, pictureBelowPlayer } from '../textureReplacement.js';
import { replacementRefusal, pngSize, drawnSize, cifRefusal } from './replacementRules.js';
import { baseName, isPlainName, cleanPng, MAX_FILE_BYTES, MAX_ZIP_BYTES, MAX_ZIP_FILES } from './replacementSafety.js';
import { saveReplacements, keyOfPicture } from './replacementStore.js';
import { classicRecords } from './classicRecords.js';
import { parseCifPictureName, cifPictureName, canonicalPictureName, PORT_PAINTINGS } from './playerPictures.js';
import { DYE_NAMES } from '../../characters/dyes.js';
import { MATERIAL_NAMES } from '../item/itemInfo.js';

const OTHER_IMAGE = /\.(jpe?g|webp|gif|bmp|tga|dds)$/i;

const KNOWN_DYES = new Set(Object.values(DYE_NAMES));
const KNOWN_METALS = new Set(MATERIAL_NAMES);
/**
 * What a file in the zip names, or null: a texture's plain picture, for a known dye or none (`{ kind: 'texture',
 * archive, record, frame, dye }`), a picture the game asks by name (`{ kind: 'picture', name }`: a CIF frame for a
 * known metal or none, an IMG, a spell icon, the held map), or a whole CIF file (`{ kind: 'file', file }`). A name
 * that is not plain (replacementSafety.js isPlainName) names nothing.
 * @param {string} name a path inside the zip
 */
export function pictureNamedBy(name) {
  const base = baseName(name);
  if (!isPlainName(base)) return null;
  if (/^[A-Z0-9_-]+\.(CIF|RCI)$/i.test(base)) return { kind: 'file', file: base.toUpperCase() };
  if (!/\.png$/i.test(base)) return null;
  const stem = base.slice(0, -4);
  const frame = parseCifPictureName(stem);
  if (frame) return frame.metal && !KNOWN_METALS.has(frame.metal) ? null : { kind: 'picture', name: cifPictureName(frame.file, frame.record, frame.frame, frame.metal) };
  if (/^[A-Z0-9_-]+\.IMG(_\d+)?$/i.test(stem)) return { kind: 'picture', name: canonicalPictureName(stem) };
  if (Object.hasOwn(PORT_PAINTINGS, stem.toLowerCase())) return { kind: 'picture', name: stem.toLowerCase() };
  const entry = textureEntry(base);
  if (!entry || entry.map !== 'Albedo' || (entry.dye && !KNOWN_DYES.has(entry.dye))) return null;
  return { kind: 'texture', archive: entry.archive, record: entry.record, frame: entry.frame, dye: entry.dye ?? null };
}
/** A file named for a picture, but not as a PNG (`112366_0-0.jpg`): refused as one that cannot be read. */
const otherImageNamedForPicture = (name) => OTHER_IMAGE.test(name) && !!pictureNamedBy(baseName(name).replace(OTHER_IMAGE, '.png'));

const spriteSizes = new Map();
/** The shipped body sprite's size, read from its PNG header. */
async function spriteSize(url) {
  if (!spriteSizes.has(url)) {
    spriteSizes.set(
      url,
      fetch(url)
        .then((response) => (response.ok ? response.arrayBuffer() : null))
        .then((bytes) => (bytes ? pngSize(new Uint8Array(bytes)) : null))
        .catch(() => null),
    );
  }
  return spriteSizes.get(url);
}
let offered = null;
/** Every name the pane offers, read once: the catalog's (replacementCatalog.js offeredPictureNames). */
const offeredNames = () => (offered ??= import('./replacementCatalog.js').then((catalog) => catalog.offeredPictureNames()));
/** The originals a picture may follow, or none where the game has no such picture: a CIF frame's record, an IMG's or
 *  a painting's own size, the player's shipped body sprite, the classic record, or a mod-only archive's picture. */
export async function originalSizes(picture) {
  if (picture.kind === 'picture') {
    const [names, catalog] = await Promise.all([offeredNames(), import('./replacementCatalog.js')]);
    const frame = parseCifPictureName(picture.name);
    const entry = names.get(frame ? frame.file : picture.name.toUpperCase());
    if (!entry || (frame ? entry.kind !== 'cif' : entry.kind !== 'named')) return [];
    return catalog.offeredSizes(entry, frame ?? {});
  }
  const { archive, record, frame } = picture;
  const catalog = await import('./replacementCatalog.js');
  const painted = frame === 0 ? await catalog.generatedPicture(archive, record).catch(() => null) : null;
  if (painted) return [{ width: painted.width, height: painted.height }];
  const { eotbSpriteUrl } = await import('../../player/eyeOfTheBeholder/eotbSprite.js');
  const spriteUrl = eotbSpriteUrl(`${archive}_${record}-${frame}`);
  if (spriteUrl) return [await spriteSize(spriteUrl)].filter(Boolean);
  const classic = await classicRecords().size(archive, record, frame).catch(() => null);
  if (classic) return [classic];
  if (!isVendorArchive(archive)) return [];
  const own = await pictureBelowPlayer(archive, record, frame, { derive: classicRecords().deriveContext });
  return own ? [{ width: own.width, height: own.height }] : [];
}

/** The browser can draw the picture. Where it has no decoder (the tests), the header's word stands. */
async function decodes(blob) {
  if (typeof globalThis.createImageBitmap !== 'function') return true;
  try {
    const bitmap = await globalThis.createImageBitmap(blob);
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
}

/** The shape a CIF file named `file` must keep (`{ counts, sizes }`), or null where the game reads no copy of it. */
export async function cifShapeOf(file) {
  const names = await offeredNames();
  const entry = names.get(String(file).toUpperCase());
  if (entry?.kind !== 'cif' || entry.classicFile.toUpperCase() !== String(file).toUpperCase()) return null;
  return classicRecords().cifShape(entry.classicFile).catch(() => null);
}

const tooMuch = () => Object.assign(new Error('the zip holds too much'), { code: 'zip-too-much' });

/** Read a zip, keep every picture and CIF file in it that replaces the game's, and count the rest by why: `{ kept,
 *  files, unknown, outOfShape, tooBig, unreadable, cifRefused }` (files named for nothing in the game, pictures out of
 *  shape or too big to read, files not readable as PNG, CIF files that do not read or keep the game's shape). Throws
 *  with `code` 'not-zip' for a file that is not one, 'zip-too-large' when a file inflates past MAX_FILE_BYTES, and
 *  'zip-too-much' past MAX_ZIP_BYTES or MAX_ZIP_FILES. @param {Blob} file */
export async function importReplacementZip(file, { readZip = null, sizesOf = originalSizes, shapeOf = cifShapeOf, save = saveReplacements } = {}) {
  if (Number(file?.size) > MAX_ZIP_BYTES) throw tooMuch();
  const readEntries = readZip ?? (await import('../../scenes/dataSource.js')).readZipEntries;
  let unreadable = 0;
  let inflated = 0;
  let entries;
  try {
    entries = await readEntries(file, {
      pick: (names) => {
        unreadable += names.filter(otherImageNamedForPicture).length;
        const picked = names.filter((name) => pictureNamedBy(name));
        if (picked.length > MAX_ZIP_FILES) throw tooMuch();
        return picked;
      },
      // asked of every picked file before any is inflated, so the zip's own word bounds what is read
      limit: (name, size) => {
        inflated += size;
        if (inflated > MAX_ZIP_BYTES) throw tooMuch();
        return MAX_FILE_BYTES;
      },
    });
  } catch (e) {
    if (e?.code === 'zip-too-large' || e?.code === 'zip-too-much') throw e;
    throw Object.assign(new Error('not a zip'), { code: 'not-zip' });
  }
  const seen = new Set();
  const keep = [];
  let unknown = 0;
  let outOfShape = 0;
  let tooBig = 0;
  let files = 0;
  let cifRefused = 0;
  for (const { name, data } of entries) {
    const picture = pictureNamedBy(name);
    const key = keyOfPicture(picture);
    if (seen.has(key)) continue; // the first file of a name stands, as the texture door's own loose pick keeps it
    seen.add(key);
    if (picture.kind === 'file') {
      const shape = await shapeOf(picture.file);
      if (!shape) unknown++;
      else if (cifRefusal(new Uint8Array(data), picture.file, shape)) cifRefused++;
      else {
        keep.push({ ...picture, fileName: baseName(name), blob: new Blob([new Uint8Array(data)], { type: 'application/octet-stream' }) });
        files++;
      }
      continue;
    }
    const originals = await sizesOf(picture);
    if (!originals.length) {
      unknown++;
      continue;
    }
    const bytes = cleanPng(new Uint8Array(data));
    const refusal = bytes ? replacementRefusal(bytes, originals) : { reason: 'notPng' };
    if (refusal?.reason === 'notPng') {
      unreadable++;
      continue;
    }
    if (refusal) {
      if (refusal.reason === 'tooBig') tooBig++;
      else outOfShape++;
      continue;
    }
    const blob = new Blob([bytes], { type: 'image/png' });
    if (!(await decodes(blob))) {
      unreadable++;
      continue;
    }
    const size = pngSize(bytes);
    const drawn = drawnSize(size, originals);
    keep.push({ ...picture, ...size, drawWidth: drawn.width, drawHeight: drawn.height, fileName: baseName(name), blob });
  }
  if (keep.length) await save(keep);
  return { kept: keep.length - files, files, unknown, outOfShape, tooBig, unreadable, cifRefused };
}
