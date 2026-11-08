import { itemAppearanceKey } from '../../systems/item/itemAppearanceKey.js';
// Draw and compare choices in paperdoll coordinates to avoid duplicate records.
// Each thumbnail then crops to its own visible pixels so shirts and full outfits
// remain readable. This presentation scale does not change placement on the body.
import { isPaperdollHelmet } from '../../systems/helmetPaperdollLooks.js';
import { getPref } from '../../systems/uiPrefs.js';
import { paperdollLookChoices, paperdollLookOf, setPaperdollLook, paperdollDyeOf, setPaperdollDye } from '../../systems/paperdollLooks.js';
import { CLOTHING_DYES } from '../../characters/dyes.js';
import { DF_CLOTHING_DYE_RGB } from '../../formats/morrowind/mwItemMap.js';
import { dfmodGeneration } from '../../systems/dfmodTextures.js';
import { itemDyeColor } from '../../systems/item/itemDye.js';
import { getTemplate } from '../../characters/paperdoll/paperdoll.js';
import { paperdollLayerPixels } from '../paperDoll.js';

/** Cards a page: one row of three (the owner: three in a row, never six). */
const PAGE = 3;
/** Tab and page per piece key, kept across the inventory's rerenders. */
const states = new Map();
let lastMode = null;
/** Drawn choices per piece, identity and saved-looks set: { looks, urls } once ready. */
const drawn = new Map();

/** The visible pixels' box of an RGBA picture, or null when it is empty. */
export function artBounds(rgba, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] <= 16) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** The smallest box holding every given box, or null. */
export function unionBounds(boxes) {
  const live = boxes.filter(Boolean);
  if (!live.length) return null;
  const x = Math.min(...live.map((b) => b.x)), y = Math.min(...live.map((b) => b.y));
  const r = Math.max(...live.map((b) => b.x + b.width)), btm = Math.max(...live.map((b) => b.y + b.height));
  return { x, y, width: r - x, height: btm - y };
}

/** A picture's fingerprint inside a window - equal pictures, equal prints. */
export function pictureFingerprint(rgba, width, box) {
  let h = 0x811c9dc5;
  for (let y = box.y; y < box.y + box.height; y++) for (let x = box.x; x < box.x + box.width; x++) {
    const o = (y * width + x) * 4;
    const a = rgba[o + 3] > 16 ? 1 : 0;
    const v = a ? (rgba[o] << 16) ^ (rgba[o + 1] << 8) ^ rgba[o + 2] ^ 0x1000000 : 0;
    h = Math.imul(h ^ v, 0x01000193) >>> 0;
  }
  return `${box.width}x${box.height}:${h}`;
}

/**
 * Keep the first of every set of equal pictures, comparing their shared paperdoll window.
 * @param {Array<{ look: any, pixels: { width: number, height: number, rgba: ArrayLike<number> } | null }>} entries original first
 * @returns {{ kept: Array<{ look: any, pixels: any }>, window: { x: number, y: number, width: number, height: number } | null }}
 */
export function dedupeAndFrame(entries) {
  const window = unionBounds(entries.map((e) => (e.pixels ? artBounds(e.pixels.rgba, e.pixels.width, e.pixels.height) : null)));
  if (!window) return { kept: entries, window: null };
  const seen = new Set();
  const kept = [];
  for (const e of entries) {
    if (!e.pixels) { kept.push(e); continue; }
    const print = pictureFingerprint(e.pixels.rgba, e.pixels.width, window);
    if (seen.has(print)) continue;
    seen.add(print);
    kept.push(e);
  }
  return { kept, window };
}

/** One picture cropped to its visible bounds, as a data URL (null without a canvas). */
function windowUrl(pixels, window) {
  if (typeof document === 'undefined' || typeof ImageData === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = window.width; canvas.height = window.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const crop = new Uint8ClampedArray(window.width * window.height * 4);
    for (let y = 0; y < window.height; y++) {
      const from = ((window.y + y) * pixels.width + window.x) * 4;
      crop.set(pixels.rgba.subarray ? pixels.rgba.subarray(from, from + window.width * 4) : Array.prototype.slice.call(pixels.rgba, from, from + window.width * 4), y * window.width * 4);
    }
    ctx.putImageData(new ImageData(crop, window.width, window.height), 0, 0);
    return canvas.toDataURL();
  } catch { return null; }
}

const sameLook = (a, b) => (a === null || b === null ? a === b : a.v === b.v && a.t === b.t);
// A card's id is its WHOLE look - template and style. GARMENT-KINDS made `{ t, v }` looks, and an id of the style alone
// gave every garment's style 0 one id: their cards shared one picture, and the card pressed was not the look worn
// (the owner, 2026-11-08: "очень много дублирующихся текстур", "не всегда соответствует то что надеваешь").
const lookId = (look) => (look === null ? 'own' : `${look.t !== undefined ? `t${look.t}` : ''}${look.v !== undefined ? `v${look.v}` : ''}`);
const shapeOf = (look) => (look && (look.t !== undefined || look.v !== undefined) ? { ...(look.t !== undefined ? { t: look.t } : {}), ...(look.v !== undefined ? { v: look.v } : {}) } : null);
/** The words a card is read by. */
export function lookLabel(look) {
  if (look === null) return 'Исходный';
  if (look.t !== undefined && look.v !== undefined) return `${getTemplate(look.t)?.name ?? look.t} ${look.v + 1}`;
  if (look.v !== undefined) return `2D-облик ${look.v + 1}`;
  return getTemplate(look.t)?.name ?? `2D-облик ${look.t}`;
}

/**
 * The picker, or null when the piece has neither tab. `modelRow` is the piece's 3D look row (the 3D tab's content).
 * @param {{ item: any, identity: any, modelRow?: any, onChange: () => void, layerPixels?: typeof paperdollLayerPixels }} options
 */
export function paperdollAppearancePicker({ item, identity, modelRow = null, onChange, layerPixels = paperdollLayerPixels }) {
  const key = `${itemAppearanceKey(item, true)}|${item.group}:${item.templateIndex}:${item.material ?? 0}`;
  const helm = isPaperdollHelmet(item);
  const allLooks = [null, ...paperdollLookChoices(item, identity)];
  if (!states.has(key)) {
    const at = allLooks.findIndex((l) => sameLook(l, paperdollLookOf(item)));
    states.set(key, { mode: lastMode ?? (helm || !getPref('morrowindThirdPersonOnly') ? '3d' : '2d'), page: Math.max(0, Math.floor(at / PAGE)) });
  }
  const state = states.get(key);
  if (lastMode) state.mode = lastMode;
  // THE TABS (the owner, 2026-11-08, with a screenshot of the helm's card): 3D and 2D share one card for every piece -
  // two tabs when both are on, ONE full-width tab named for what it holds when only one is. 3D: the model-look switch
  // and a look row to show (a helm shows its tab even with none); 2D: the inventory's 2D card, paperdoll customization
  // and a look besides its own.
  const can3d = getPref('modelCustomization') === true && (helm || !!modelRow);
  const can2d = !!getPref('morrowindThirdPersonOnly') && getPref('paperdollCustomization') !== false && allLooks.length > 1;
  const modes = [...(can3d ? ['3d'] : []), ...(can2d ? ['2d'] : [])];
  if (!modes.length) return null;
  if (!modes.includes(state.mode)) state.mode = modes[0];
  const make = (tag, cls, text = '') => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const root = make('div', 'helmet-appearance paperdoll-appearance');
  const tabs = make('div', 'look-tabs'); tabs.style?.setProperty('grid-template-columns', modes.map(() => '1fr').join(' '));
  tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Внешний вид предмета');
  const panel = make('div', 'look-panel'); panel.setAttribute('role', 'tabpanel');
  const buttons = [];
  // What the pictures are drawn from. The DYE too (the owner, 2026-11-08: a yellow short shirt's cards showed blue): two
  // pieces of one template and material in different dyes, or one piece re-dyed, are different pictures.
  let dye = paperdollDyeOf(item);   // GARMENT-DYES: the cards are drawn in the colour the card will wear
  const drawKey = () => `${key}|${item.variant ?? 0}|${item.dye ?? ''}|${itemDyeColor(item) ?? ''}|${dye ?? ''}|${identity?.gender}|${identity?.race}|${dfmodGeneration()}`;
  let framed = drawn.get(drawKey()) ?? null;
  const draw = () => {
    for (const [mode, button] of buttons) {
      button.classList.toggle('on', mode === state.mode);
      button.classList.toggle('primary', mode === state.mode);
      button.setAttribute('aria-selected', String(mode === state.mode));
      button.tabIndex = mode === state.mode ? 0 : -1;
    }
    modelRow?.setPreviewVisible?.(state.mode === '3d');
    panel.replaceChildren();
    panel.setAttribute('aria-label', state.mode === '3d' ? '3D-модель' : '2D-облик');
    if (state.mode === '3d') {
      panel.append(modelRow ?? make('span', 'look-name', 'Нет других 3D-моделей'));
      return;
    }
    const current = shapeOf(paperdollLookOf(item));
    const looks = framed ? framed.looks : allLooks;
    const per = PAGE;
    if (dye !== null) {   // GARMENT-DYES: the ten cloth dyes, the worn one lit; a press recolours the cards and the card
      const dyes = make('div', 'look-dyes');
      dyes.setAttribute('role', 'radiogroup'); dyes.setAttribute('aria-label', 'Цвет');
      for (const d of CLOTHING_DYES) {
        const rgb = DF_CLOTHING_DYE_RGB[d] ?? [128, 128, 128];
        const chip = make('button', `look-dye${d === dye ? ' on' : ''}`);
        chip.type = 'button'; chip.title = `Цвет ${d + 1}`;
        chip.setAttribute('role', 'radio'); chip.setAttribute('aria-checked', String(d === dye));
        chip.style?.setProperty?.('background', `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
        chip.onclick = () => {
          if (!setPaperdollDye(item, d)) return;
          dye = paperdollDyeOf(item);
          framed = drawn.get(drawKey()) ?? null;
          draw(); loadPictures(); onChange();
        };
        dyes.append(chip);
      }
      panel.append(dyes);
    }
    state.page = Math.max(0, Math.min(state.page, Math.ceil(looks.length / per) - 1));
    const row = make('div', 'look-row helmet-2d-row');
    const cards = make('div', 'look-cards');
    for (const look of looks.slice(state.page * per, state.page * per + per)) {
      const label = lookLabel(look);
      const on = sameLook(look, current);
      const button = make('button', `look-pick${on ? ' on' : ''}`);
      button.setAttribute('data-paperdoll-look', lookId(look));
      button.type = 'button'; button.title = label;
      button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(on));
      const url = framed?.urls.get(lookId(look));
      if (url) { const image = make('img', ''); image.alt = label; image.src = url; button.append(image); }
      else button.append(make('span', 'look-name', label));
      button.onclick = () => { if (setPaperdollLook(item, look)) { draw(); onChange(); } };
      cards.append(button);
    }
    const navigation = make('div', 'look-pages');
    for (const [delta, label] of [[-1, 'Предыдущий ряд'], [1, 'Следующий ряд']]) {
      const button = make('button', delta < 0 ? 'look-page-prev' : 'look-page-next'); button.type = 'button';
      button.title = label; button.setAttribute('aria-label', label);
      button.disabled = delta < 0 ? state.page === 0 : (state.page + 1) * per >= looks.length;
      button.onclick = () => { state.page += delta; draw(); };
      navigation.append(button);
    }
    row.append(cards, navigation); panel.append(row);
  };
  for (const mode of modes) {
    const label = modes.length > 1 ? (mode === '2d' ? '2D' : '3D') : (mode === '2d' ? '2D-облик' : '3D-модель');
    const button = make('button', 'act look-tab', label); button.type = 'button'; button.setAttribute('role', 'tab');
    button.onclick = () => { lastMode = state.mode = mode; draw(); };
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons.at(-1) : buttons.find(([other]) => other !== mode) || buttons[0];
      lastMode = state.mode = target[0]; draw(); target[1].focus();
    };
    buttons.push([mode, button]); tabs.append(button);
  }
  root.append(tabs, panel); draw();
  // Compare on one panel, then crop each visible thumbnail independently.
  let pictureRequest = 0;
  function loadPictures() {
    if (framed || !modes.includes('2d')) return;
    const request = ++pictureRequest, cacheKey = drawKey();
    Promise.all(allLooks.map((look) => Promise.resolve(layerPixels(item, identity, dye === null ? look : { ...(look ?? {}), d: dye })).catch(() => null).then((pixels) => ({ look, pixels }))))
      .then((entries) => {
        if (request !== pictureRequest || cacheKey !== drawKey()) return;
        if (!entries.some((e) => e.pixels)) return;
        const { kept, window } = dedupeAndFrame(entries);
        const urls = new Map();
        if (window) for (const e of kept) if (e.pixels) { const bounds = artBounds(e.pixels.rgba, e.pixels.width, e.pixels.height); const url = bounds ? windowUrl(e.pixels, bounds) : null; if (url) urls.set(lookId(e.look), url); }
        framed = { looks: kept.map((e) => e.look), urls };
        if (drawn.size >= 64) drawn.clear();   // a bounded cache: a few pieces' pictures, drawn again on demand
        drawn.set(cacheKey, framed);
        draw();
      });
  }
  loadPictures();
  return root;
}
