// The player's own TEXTURE records, CIF frames and IMG files, read as pictures for the Replacements pane: the original
// a replacement covers, in a metal's colours where it is asked for one, and how many records and frames a file holds.
// Each file and the palette are read once; a failed read is forgotten so the next ask reads again (a pane opened
// before the game files are attached is not blank for the page).
import { TextureFile } from '../../formats/textureFile.js';
import { CifRciFile } from '../../formats/cifRciFile.js';
import { ImgFile } from '../../formats/imgFile.js';
import { CfaFile } from '../../formats/cfaFile.js';
import { DFPalette } from '../../formats/dfPalette.js';
import { classicRecordRgba } from '../../formats/derivedTexture.js';
import { changeDyeBitmap, DYE_TARGETS } from '../../characters/dyes.js';

/** TEXTURE, CIF and most IMG files are drawn in ART_PAL.COL, as DFU's TextureReader, FPSWeapon and ImageReader draw
 *  them; an IMG with its own palette reads it over a fresh copy. */
export const TEXTURE_PALETTE = 'ART_PAL.COL';
const textureFileName = (archive) => `TEXTURE.${String(archive).padStart(3, '0')}`;

/**
 * A reader over `getBytes(name)`: the player's ARENA2 (scenes/dataSource.js getBytes), or a test's own.
 * @param {(name: string) => Promise<ArrayBuffer|Uint8Array>} getBytes
 */
export function createClassicRecords(getBytes) {
  const reads = new Map();
  const once = (key, read) => {
    if (!reads.has(key)) {
      const reading = read();
      reads.set(key, reading);
      reading.catch(() => {
        if (reads.get(key) === reading) reads.delete(key);
      });
    }
    return reads.get(key);
  };
  const paletteBytes = () => once('palette-bytes', async () => new Uint8Array(await getBytes(TEXTURE_PALETTE)));
  const freshPalette = async () => {
    const loaded = new DFPalette();
    loaded.load(await paletteBytes(), TEXTURE_PALETTE);
    return loaded;
  };
  const palette = () => once('palette', freshPalette);
  const imgFile = (name) =>
    once(`img:${name}`, async () => {
      const file = new ImgFile();
      const colours = await freshPalette();
      return file.load(new Uint8Array(await getBytes(name)), name, colours) ? { file, colours } : null;
    });
  const textureFile = (archive) =>
    once(`texture:${archive}`, async () => {
      const file = new TextureFile();
      const name = textureFileName(archive);
      return file.load(new Uint8Array(await getBytes(name)), name, null) ? file : null;
    });
  const cifFile = (name) =>
    once(`cif:${name}`, async () => {
      const file = /\.CFA$/i.test(name) ? new CfaFile() : new CifRciFile();   // a riding sprite's frames are a CFA's
      return file.load(new Uint8Array(await getBytes(name)), name, null) ? file : null;
    });
  /** One frame of a loaded file as a top-down RGBA picture, in a metal's colours where `dye` names one (ChangeDye over
   *  the weapon-and-armour band, as the classic icon and the weapon in hand draw it), index 0 clear. */
  async function framePicture(file, record, frame, dye) {
    const colours = await palette();
    if (!file || !(record >= 0 && record < file.recordCount) || !(frame >= 0 && frame < file.getFrameCount(record))) return null;
    const bitmap = file.getDFBitmap(record, frame);
    if (!bitmap?.width) return null;
    return classicRecordRgba(dye == null ? bitmap : changeDyeBitmap(bitmap, dye, DYE_TARGETS.WeaponsAndArmor), colours);
  }
  const counts = (file) => (file ? Array.from({ length: file.recordCount }, (_, record) => file.getFrameCount(record)) : null);
  const sizeOf = (file, record, frame) =>
    file && record >= 0 && record < file.recordCount && frame >= 0 && frame < file.getFrameCount(record)
      ? { width: file.getSize(record).width, height: file.getSize(record).height }
      : null;
  return {
    /** A TEXTURE record's frame, or null where the file has none. `dye` a DyeColors value, or null for the plain one. */
    picture: async (archive, record, frame = 0, dye = null) => framePicture(await textureFile(archive), record, frame, dye),
    /** Each record's frame count in a TEXTURE archive, or null where the player's files have no such archive. */
    frameCounts: async (archive) => counts(await textureFile(archive)),
    /** A TEXTURE record's size (its frames share it), or null where the file has no such record and frame. */
    size: async (archive, record, frame = 0) => sizeOf(await textureFile(archive), record, frame),
    /** The same three for a CIF file by name (`WEAPON04.CIF`): a first-person weapon's frames. */
    cifPicture: async (name, record, frame = 0, dye = null) => framePicture(await cifFile(name), record, frame, dye),
    cifFrameCounts: async (name) => counts(await cifFile(name)),
    cifSize: async (name, record, frame = 0) => sizeOf(await cifFile(name), record, frame),
    /** A CIF file's records' frame counts and sizes, `{ counts, sizes }`: what a copy of it must keep. */
    cifShape: async (name) => {
      const file = await cifFile(name);
      if (!file) return null;
      return { counts: counts(file), sizes: Array.from({ length: file.recordCount }, (_, record) => sizeOf(file, record, 0)) };
    },
    /** A frame of a copy of a CIF (the player's own file, `bytes`) as the game draws it, or null. */
    cifCopyPicture: async (bytes, name, record, frame = 0, dye = null) => {
      const file = new CifRciFile();
      try {
        return file.load(bytes, name, null) ? await framePicture(file, record, frame, dye) : null;
      } catch {
        return null;
      }
    },
    /** A whole IMG file (`BODY00I0.IMG`) as a top-down RGBA picture, or null where the player's files have none. */
    imgPicture: async (name) => {
      const loaded = await imgFile(name);
      const bitmap = loaded?.file.getDFBitmap();
      return bitmap?.width ? classicRecordRgba(bitmap, loaded.colours) : null;
    },
    /** What a picture the port builds from the player's records reads (textureReplacement.js `build`), as a game's
     *  pipeline hands it: a TEXTURE record's frame, top-down RGBA with index 0 clear, and a record's scale. */
    deriveContext: Object.freeze({
      classicRgba: async (archive, record, frame = 0) => framePicture(await textureFile(archive).catch(() => null), record, frame, null),
      classicScale: async (archive, record) => (await textureFile(archive).catch(() => null))?.getScale(record) ?? null,
    }),
    /** An IMG file's size, or null. */
    imgSize: async (name) => {
      const bitmap = (await imgFile(name))?.file.getDFBitmap();
      return bitmap?.width ? { width: bitmap.width, height: bitmap.height } : null;
    },
  };
}

let shared = null;
/** The session's reader, over the player's own files. */
export const classicRecords = () =>
  (shared ??= createClassicRecords(async (name) => (await import('../../scenes/dataSource.js')).getBytes(name)));
