// What a picture or a file chosen on the Replacements pane must be before it is kept.
//
// The game reads replacements as PNG files, as Daggerfall Unity's TextureReplacement does, so a chosen file must be a
// PNG. It must keep the shape of the picture it replaces: the original's size, or bigger in the same proportions, so it
// is drawn at the original's size with more detail. SHAPE_ALLOWANCE lets a picture a little off that shape stand. The
// original is the classic record's size, or the overhaul picture's where one covers it. The game shrinks a picture past
// what a device takes as it loads it; past MAX_PICTURE_SIDE or MAX_PICTURE_PIXELS one is refused, as reading it would
// take more memory than a device can spare. A whole CIF must keep the game file's records and frames.
import { CifRciFile } from '../../formats/cifRciFile.js';

/** The eight bytes every PNG file starts with. */
export const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** How far a picture may stray from its original's shape and still be taken: its proportions within 2% of the
 *  original's, and each side at most 2% short of it. It is drawn at the original's size, where 2% does not show. */
export const SHAPE_ALLOWANCE = 0.02;
/** The longest side a picture or CIF record may have: the largest texture any device holds. */
export const MAX_PICTURE_SIDE = 16384;
/** The most pixels a picture may have, and a CIF file in all its records and frames: 512 MB once read. */
export const MAX_PICTURE_PIXELS = 16384 * 8192;
/** Whether a picture of this size is too big to read. */
export const isTooBig = ({ width, height }, pixels = width * height) =>
  width > MAX_PICTURE_SIDE || height > MAX_PICTURE_SIDE || pixels > MAX_PICTURE_PIXELS;

/**
 * The width and height a PNG file's header states, or null when the bytes are not a PNG.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number } | null}
 */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;
  const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunkType !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The originals a replacement may follow: the overhaul picture's size where one covers it, and the classic record's.
 * @param {{ width: number, height: number } | null} classicSize
 * @param {{ width: number, height: number } | null} overhaulSize
 */
export function acceptedSizes(classicSize, overhaulSize = null) {
  const sizes = [];
  for (const size of [overhaulSize, classicSize])
    if (size?.width > 0 && size?.height > 0 && !sizes.some((kept) => kept.width === size.width && kept.height === size.height))
      sizes.push({ width: size.width, height: size.height });
  return sizes;
}

/**
 * Whether a picture follows an original: about its size or bigger, and in about its proportions - within
 * SHAPE_ALLOWANCE, or, for a picture so small that one pixel is more than that, some one scale of the original rounds
 * to its width and its height alike. The scales that round to a width w are (w - 1/2) / ow to (w + 1/2) / ow; the two
 * ranges must overlap, in whole numbers.
 * @param {{ width: number, height: number }} size
 * @param {{ width: number, height: number }} original
 */
export function followsOriginal(size, original) {
  const least = 1 - SHAPE_ALLOWANCE;
  if (size.width < original.width * least || size.height < original.height * least) return false;
  const proportions = (size.width * original.height) / (size.height * original.width);
  if (Math.abs(proportions - 1) <= SHAPE_ALLOWANCE) return true;
  if (size.width < original.width || size.height < original.height) return false;
  const { width, height } = size;
  return (2 * width - 1) * original.height < (2 * height + 1) * original.width &&
    (2 * height - 1) * original.width < (2 * width + 1) * original.height;
}

/**
 * Why a chosen file cannot replace the picture, or null when it can. The reasons are codes the pane words: `notPng`
 * (not a PNG file), `tooBig` (too big to read, carrying its size) and `wrongSize` (it follows none of the originals,
 * carrying its own size and the originals).
 * @param {Uint8Array} bytes the file's contents
 * @param {{ width: number, height: number }[]} accepted
 */
export function replacementRefusal(bytes, accepted) {
  const size = pngSize(bytes);
  if (!size) return { reason: 'notPng' };
  if (isTooBig(size)) return { reason: 'tooBig', width: size.width, height: size.height };
  if (accepted.length && !accepted.some((original) => followsOriginal(size, original)))
    return { reason: 'wrongSize', width: size.width, height: size.height, accepted };
  return null;
}

/**
 * The size the game draws a kept picture at: the first original it follows (the overhaul's before the classic one).
 * @param {{ width: number, height: number }} size
 * @param {{ width: number, height: number }[]} accepted
 */
export const drawnSize = (size, accepted) => accepted.find((original) => followsOriginal(size, original)) ?? size;

/**
 * Why a CIF file cannot stand in for the game's `name`, or null when it can (`shape`: its records' frame counts and
 * sizes). The codes: `notCif` (it does not read as one), `wrongShape` (other records or frame counts), `tooBig` (too
 * big to read) and `wrongSize` (a record out of its shape, carrying its number and size).
 * @param {Uint8Array} bytes
 * @param {string} name
 * @param {{ counts: number[], sizes: { width: number, height: number }[] }} shape
 */
export function cifRefusal(bytes, name, shape) {
  const copy = new CifRciFile();
  try {
    if (!bytes?.byteLength || !copy.load(bytes, String(name).toUpperCase(), null) || !copy.recordCount) return { reason: 'notCif' };
  } catch {
    return { reason: 'notCif' };
  }
  const counts = Array.from({ length: copy.recordCount }, (_, record) => copy.getFrameCount(record));
  if (counts.length !== shape.counts.length || counts.some((frames, record) => frames !== shape.counts[record]))
    return { reason: 'wrongShape', records: counts.length, expected: shape.counts.length };
  let pixels = 0;
  for (let record = 0; record < counts.length; record++) {
    const { width, height } = copy.getSize(record);
    if (width < 0 || height < 0) return { reason: 'notCif' }; // a plain CIF's sizes are signed: no real one is below 0
    pixels += width * height * counts[record];
    if (isTooBig({ width, height }, pixels)) return { reason: 'tooBig', record, width, height };
    const original = shape.sizes[record];
    if (original && !followsOriginal({ width, height }, original)) return { reason: 'wrongSize', record, width, height, accepted: [original] };
  }
  return null;
}
