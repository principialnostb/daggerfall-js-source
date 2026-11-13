// Export: every replacement the player has kept, in one zip Import reads back as it was.
//
// Each file is named as Import reads it, in Daggerfall Unity's folders where it has one: a texture's picture in
// `Textures/`, a CIF frame in `Textures/CifRci/`, an IMG's picture or a spell icon in `Textures/Img/`, a painting of the
// port's own in `Port/`, and a whole CIF or RCI file in `Files/`. A picture is checked again as Import checks it, so a
// zip it writes holds only clean PNGs. The zip is stored, not deflated: PNGs are already packed.
import { listReplacements } from './replacementStore.js';
import { parseCifPictureName } from './playerPictures.js';
import { cleanPng } from './replacementSafety.js';
import { textureName } from '../textureReplacement.js';
import { crc32, zipStoreParts } from '../save/saveTransfer.js';

/** The most files and bytes a zip without zip64 can hold. */
const MAX_ZIP_ENTRIES = 0xffff;
const MAX_ZIP_SIZE = 0xffffffff;

/**
 * The name a kept replacement is exported under, or null for a record of no kind Import reads.
 * @param {{ kind?: string, archive?: number, record?: number, frame?: number, dye?: string|null, name?: string,
 *   file?: string }} replacement
 */
export function exportEntryName({ kind = 'texture', archive, record = 0, frame = 0, dye = null, name, file }) {
  if (kind === 'file') return file ? `Files/${file}` : null;
  if (kind === 'picture') {
    if (!name) return null;
    if (parseCifPictureName(name)) return `Textures/CifRci/${name}.png`;
    if (/\.IMG(_\d+)?$/i.test(name)) return `Textures/Img/${name}.png`;
    return `Port/${name}.png`;
  }
  if (kind !== 'texture' || !Number.isInteger(archive)) return null;
  return `Textures/${textureName(archive, record, frame, 'Albedo', dye)}.png`;
}

/** The name Export suggests: the game's, and the day. */
export const exportZipName = (now = new Date()) => {
  const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
  return `dfo-replacements-${day}.zip`;
};

/**
 * Every kept replacement as one zip: `{ blob, count }`, files sorted by name. A file's bytes are read once for its
 * CRC and the stored Blob goes into the zip as it is, so the whole set is never held in memory twice. Throws an Error
 * with `code` 'export-too-big' past what a zip without zip64 holds.
 * @param {{ list?: () => Promise<any[]> }} [seams]
 */
export async function exportReplacementZip({ list = listReplacements } = {}) {
  const kept = await list();
  const named = kept
    .map((replacement) => ({ replacement, name: exportEntryName(replacement) }))
    .filter(({ replacement, name }) => name && replacement.blob)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const entries = [];
  let size = 0;
  for (const { replacement, name } of named) {
    if (entries.at(-1)?.name === name) continue;
    const bytes = new Uint8Array(await replacement.blob.arrayBuffer());
    const data = replacement.kind === 'file' ? bytes : cleanPng(bytes);
    if (!data) continue;
    entries.push({ name, data: data === bytes ? replacement.blob : data, crc: crc32(data) });
    size += data.length + 2 * name.length + 76;
  }
  if (entries.length > MAX_ZIP_ENTRIES || size > MAX_ZIP_SIZE) throw Object.assign(new Error('too much to export'), { code: 'export-too-big' });
  return { blob: new Blob(zipStoreParts(entries), { type: 'application/zip' }), count: entries.length };
}
