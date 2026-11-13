// What a file brought into the Replacements pane must be before it is read or kept, so a hostile one does no harm.
//
// A zip is read only when it fits in memory, and only its entries with a plain name: letters, digits, dots, dashes
// and underscores, no folder. A name never becomes a path, markup or code: it is matched against the game's own names.
// A PNG is walked chunk by chunk, each chunk's length, type and CRC checked, and kept rebuilt from the chunks that
// draw it, so text, metadata, an animation and any bytes after its end never reach the store or an export.
import { crc32 } from '../save/saveTransfer.js';
import { PNG_SIGNATURE } from './replacementRules.js';

/** The most one file may hold: a picture or CIF file in a zip, or one chosen alone. */
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** The biggest zip Import reads, and the most its files may inflate to together. */
export const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
/** The most files one zip may offer to be kept. */
export const MAX_ZIP_FILES = 20000;

/** A file's name: a letter or digit, then up to 95 letters, digits, dots, dashes or underscores. */
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
/** The last part of a path in a zip, `/` or `\` apart. */
export const baseName = (name) => String(name ?? '').split(/[\\/]/).pop();
/** Whether an entry's own name is plain enough to be matched at all. */
export const isPlainName = (name) => PLAIN_NAME.test(baseName(name));
/** A chosen file's name as it is kept beside the picture: its last part, every other character an underscore. */
export const safeFileName = (name) => baseName(name).replace(/[^A-Za-z0-9._ ()-]/g, '_').slice(0, 96);

/** The chunks kept: those a browser draws the picture from. */
const DRAWN_CHUNKS = new Set(['IHDR', 'PLTE', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'IDAT', 'IEND']);
/** The bit depths each PNG colour type allows. */
const DEPTHS_BY_COLOUR = new Map([[0, [1, 2, 4, 8, 16]], [2, [8, 16]], [3, [1, 2, 4, 8]], [4, [8, 16]], [6, [8, 16]]]);
const MAX_CHUNK = 0x7fffffff;

/** Whether an IHDR chunk's 13 bytes state a picture PNG allows. */
function headerIsValid(view, at) {
  const width = view.getUint32(at);
  const height = view.getUint32(at + 4);
  const depth = view.getUint8(at + 8);
  const colour = view.getUint8(at + 9);
  const methods = [view.getUint8(at + 10), view.getUint8(at + 11)];
  const interlace = view.getUint8(at + 12);
  return width > 0 && height > 0 && width <= MAX_CHUNK && height <= MAX_CHUNK && !!DEPTHS_BY_COLOUR.get(colour)?.includes(depth) &&
    methods[0] === 0 && methods[1] === 0 && (interlace === 0 || interlace === 1);
}

/**
 * The PNG these bytes hold, rebuilt from its drawn chunks, or null when they are not a whole, valid PNG: the signature,
 * one IHDR first, a palette where the colour type needs one, an IDAT, an IEND, and every chunk whole with a true CRC.
 * An unknown critical chunk refuses the file, as the PNG standard asks. The bytes are answered as they came when
 * nothing was dropped.
 * @param {Uint8Array} bytes
 * @returns {Uint8Array | null}
 */
export function cleanPng(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < PNG_SIGNATURE.length + 25 + 12 + 12) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept = [];
  let position = PNG_SIGNATURE.length;
  let colour = -1;
  let palette = false;
  let data = false;
  let ended = false;
  let dropped = false;
  while (!ended && position + 12 <= bytes.length) {
    const length = view.getUint32(position);
    const end = position + 12 + length;
    if (length > MAX_CHUNK || end > bytes.length) return null;
    const type = String.fromCharCode(bytes[position + 4], bytes[position + 5], bytes[position + 6], bytes[position + 7]);
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    if (crc32(bytes.subarray(position + 4, position + 8 + length)) !== view.getUint32(position + 8 + length)) return null;
    if (colour < 0 && type !== 'IHDR') return null;
    if (type === 'IHDR') {
      if (colour >= 0 || length !== 13 || !headerIsValid(view, position + 8)) return null;
      colour = view.getUint8(position + 17);
    } else if (type === 'PLTE') {
      if (palette || data || length === 0 || length % 3 || length > 768) return null;
      palette = true;
    } else if (type === 'IDAT') data = true;
    else if (type === 'IEND') {
      if (length !== 0 || !data) return null;
      ended = true;
    } else if (type.charCodeAt(0) < 97 && !DRAWN_CHUNKS.has(type)) return null;
    if (DRAWN_CHUNKS.has(type)) kept.push([position, end]);
    else dropped = true;
    position = end;
  }
  if (!ended || (colour === 3 && !palette)) return null;
  if (!dropped && position === bytes.length) return bytes;
  const out = new Uint8Array(PNG_SIGNATURE.length + kept.reduce((sum, [start, end]) => sum + end - start, 0));
  out.set(PNG_SIGNATURE, 0);
  let at = PNG_SIGNATURE.length;
  for (const [start, end] of kept) {
    out.set(bytes.subarray(start, end), at);
    at += end - start;
  }
  return out;
}
