// The spell icon sheet with the player's own icons laid in (the Replacements pane).
//
// ICON00I0.IMG holds the 69 spell icons, 16 pixels square, 20 to a row. An overhaul may draw the whole sheet: a worn UI
// pack's picture, else an attached mod's (DFU's `ICON00I0.IMG.png`). A player's icon is kept as `ICON00I0.IMG_<n>` and
// laid over whichever sheet the game draws. The sheet takes the scale its biggest picture needs, so every icon keeps its
// cell and its detail.
import { resampleRgba } from '../../formats/resample.js';
import { decodePng } from '../textureReplacement.js';
import { dfmodImgImage, dfmodGeneration } from '../dfmodTextures.js';
import { packImgUrl, packBytes } from '../uiPack.js';
import { hasPlayerPicture, playerPictureRgba } from './playerPictures.js';

export const SPELL_ICON_FILE = 'ICON00I0.IMG';
export const SPELL_ICON_CELL = 16;
export const SPELL_ICONS_PER_ROW = 20;
/** The most a sheet is scaled by: 128-pixel icons, a 2560 x 512 sheet. */
export const MAX_SHEET_SCALE = 8;
/** The name a spell icon is kept and asked by. */
export const spellIconPictureName = (index) => `${SPELL_ICON_FILE}_${Number(index)}`;
/** A spell icon's cell on the classic sheet: `{ x, y, width, height }`, top row first. */
export const spellIconCell = (index) => ({
  x: (index % SPELL_ICONS_PER_ROW) * SPELL_ICON_CELL,
  y: Math.trunc(index / SPELL_ICONS_PER_ROW) * SPELL_ICON_CELL,
  width: SPELL_ICON_CELL,
  height: SPELL_ICON_CELL,
});

/** The classic sheet's width: 20 icons of 16 pixels. */
const CLASSIC_SHEET_WIDTH = SPELL_ICONS_PER_ROW * SPELL_ICON_CELL;
/** The bytes of a picture's colours, whichever typed array carries them (`colors` or a decode's `data`). */
const bytesOf = (picture) => {
  const pixels = picture.colors ?? picture.data;
  return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
};
/** A sheet stretched to `width` x `height`: whole pixels where it divides them, filtered where it does not. */
function sheetAt(sheet, width, height) {
  const source = bytesOf(sheet);
  if (width % sheet.width || height % sheet.height) return new Uint8ClampedArray(resampleRgba({ width: sheet.width, height: sheet.height, data: source }, width, height).data);
  const factor = width / sheet.width;
  const colors = new Uint8ClampedArray(width * height * 4);
  const row = new Uint8ClampedArray(width * 4);
  for (let sourceRow = 0; sourceRow < sheet.height; sourceRow++) {
    for (let x = 0; x < width; x++) {
      const from = (sourceRow * sheet.width + Math.trunc(x / factor)) * 4;
      for (let channel = 0; channel < 4; channel++) row[x * 4 + channel] = source[from + channel];
    }
    for (let copy = 0; copy < height / sheet.height; copy++) colors.set(row, (sourceRow * (height / sheet.height) + copy) * width * 4);
  }
  return colors;
}

/**
 * A sheet - the classic one (`{ width, height, colors }`) or an overhaul's of any scale (`{ width, height, data }`) -
 * with `icons` (index -> top-down `{ width, height, data }`) laid into their cells, at a whole multiple of the classic
 * size that keeps the sheet's detail and the biggest icon's.
 * @returns {{ width: number, height: number, colors: Uint8ClampedArray, scale: number }}
 */
export function composeIconSheet(sheet, icons) {
  const sheetScale = Math.max(1, Math.round(sheet.width / CLASSIC_SHEET_WIDTH));
  const needed = [...icons.values()].map((icon) => Math.ceil(Math.max(icon.width, icon.height) / SPELL_ICON_CELL));
  const scale = Math.min(MAX_SHEET_SCALE, Math.max(sheetScale, ...needed));
  const width = CLASSIC_SHEET_WIDTH * scale;
  const height = Math.round((sheet.height * CLASSIC_SHEET_WIDTH) / sheet.width) * scale;
  const colors = sheetAt(sheet, width, height);
  const edge = SPELL_ICON_CELL * scale;
  for (const [index, icon] of icons) {
    const cell = spellIconCell(index);
    if ((cell.y + cell.height) * scale > height) continue;
    const fitted = bytesOf(resampleRgba(icon, edge, edge));
    for (let row = 0; row < edge; row++)
      colors.set(fitted.subarray(row * edge * 4, (row + 1) * edge * 4), ((cell.y * scale + row) * width + cell.x * scale) * 4);
  }
  return { width, height, colors, scale };
}
/** One icon cut from a sheet of any scale, top-down `{ width, height, data }`, or null past the sheet. */
export function cutIcon(sheet, index) {
  if (!sheet?.width) return null;
  const unit = sheet.width / CLASSIC_SHEET_WIDTH;
  const cell = spellIconCell(index);
  const [x, y, edge] = [Math.round(cell.x * unit), Math.round(cell.y * unit), Math.round(SPELL_ICON_CELL * unit)];
  if (y + edge > sheet.height || x + edge > sheet.width) return null;
  const pixels = bytesOf(sheet);
  const data = new Uint8Array(edge * edge * 4);
  for (let row = 0; row < edge; row++) data.set(pixels.subarray(((y + row) * sheet.width + x) * 4, ((y + row) * sheet.width + x + edge) * 4), row * edge * 4);
  return { width: edge, height: edge, data };
}

/** What the overhaul's sheet is read again for: the attached mods changing, or another pack worn. */
export const overhaulIconKey = () => `${dfmodGeneration()}:${packImgUrl(SPELL_ICON_FILE) ?? ''}`;
let overhaulRead = { key: null, sheet: null };
/** The sheet an overhaul draws the spell icons from, top-down RGBA - the worn UI pack's, else an attached mod's - or
 *  null where the game's own draws. Read once for each overhaulIconKey. Never throws. */
export function overhaulIconSheet({ decode = decodePng } = {}) {
  const key = overhaulIconKey();
  if (overhaulRead.key !== key) overhaulRead = { key, sheet: readOverhaulSheet(decode) };
  return overhaulRead.sheet;
}
async function readOverhaulSheet(decode) {
  const url = packImgUrl(SPELL_ICON_FILE);
  if (url) {
    try {
      const sheet = await decode(await packBytes(url));
      if (sheet?.width) return sheet;
    } catch (e) {
      console.warn('[spell icons] the pack\'s sheet would not read - an attached mod\'s or the game\'s draws:', e?.message ?? e);
    }
  }
  try {
    return (await dfmodImgImage(SPELL_ICON_FILE)) ?? null;
  } catch {
    return null;
  }
}

/** The player's spell icons among the first `count`, by index - only those they chose, read at once. */
export async function playerSpellIcons(count) {
  const chosen = Array.from({ length: count }, (_, index) => index).filter((index) => hasPlayerPicture(spellIconPictureName(index)));
  const read = await Promise.all(chosen.map((index) => playerPictureRgba(spellIconPictureName(index))));
  return new Map(chosen.map((index, i) => [index, read[i]]).filter(([, icon]) => icon?.width));
}
