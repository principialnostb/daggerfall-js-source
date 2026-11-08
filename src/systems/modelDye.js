import { itemAppearanceKey } from './item/itemAppearanceKey.js';
import { equipTableOf } from './equip.js';
import { getPref, setPref } from './uiPrefs.js';
import { CLOTHING_DYES } from '../characters/dyes.js';
import { CLOAK_TEMPLATES } from '../characters/ownModels/wolfCloak.js';
import { DF_CLOTHING_DYE_RGB } from '../formats/morrowind/mwItemMap.js';

export const MODEL_DYES_PREF = 'mwItemDyes';
let player = null;
const bindings = new Map();
export function noteModelDyePlayer(entity) { player = entity; }
const dyeValue = (entry) => typeof entry === 'number' ? entry : entry?.d ?? null;
export function modelDyeOf(key) {
  if (getPref('modelCustomization') !== true) return null;
  const dyes = getPref(MODEL_DYES_PREF) ?? {};
  if (Object.hasOwn(dyes, key)) return dyeValue(dyes[key]);
  if (player) for (const item of equipTableOf(player).filter(Boolean)) {
    const entry = dyes[itemAppearanceKey(item)];
    if (entry?.record === key) return dyeValue(entry);
  }
  return null;
}
export function setModelDye(key, dye) {
  if (!key || (dye !== null && !CLOTHING_DYES.includes(dye))) return false;
  if (modelDyeOf(key) === dye) return false;
  const next = { ...(getPref(MODEL_DYES_PREF) ?? {}) };
  if (dye === null) delete next[key]; else next[key] = { d: dye, record: bindings.get(key) ?? key };
  setPref(MODEL_DYES_PREF, next);
  return true;
}
export function modelDyeKey(item, active) {
  const key = itemAppearanceKey(item, true);
  const record = CLOAK_TEMPLATES.includes(item?.templateIndex)
    ? active?.value?.startsWith('wolf-') ? 'wolf_pelt_cloak' : 'daggerfall_cloak'
    : active?.records?.[0]?.id ?? null;
  if (!record) return null;
  bindings.set(key, record);
  const dyes = getPref(MODEL_DYES_PREF) ?? {}, entry = dyes[key];
  if (entry && entry.record !== record) setPref(MODEL_DYES_PREF, { ...dyes, [key]: { d: dyeValue(entry), record } });
  return key;
}
export const clothTextureCanDye = (file) => !/(?:^|[\\/ _-])skin(?:[\\/_.-]|$)|buckle|button|belt|metal|(?:^|[\\/])(?:tx_)?b_[nk]_/i.test(file);
const hue = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  return (((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6) + 1) % 1;
};
const distance = (a, b) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

// Replace the main cloth hue. Other hues, alpha and the shading stay authored.
export function dyeClothPixels(data, dye, anchor = undefined) {
  const rgb = DF_CLOTHING_DYE_RGB[dye];
  if (!rgb) return data;
  const bins = new Float64Array(24);
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (data[i + 3] > 16 && max - min > 20) bins[Math.floor(hue(data[i], data[i + 1], data[i + 2]) * 24) % 24] += max - min;
  }
  const dominant = anchor ?? (bins.some((n) => n > 0) ? (bins.indexOf(Math.max(...bins)) + .5) / 24 : null);
  const targetHue = hue(...rgb), targetMax = Math.max(...rgb), targetMin = Math.min(...rgb);
  const targetSat = targetMax ? (targetMax - targetMin) / targetMax : 0;
  const out = new Uint8Array(data);
  for (let i = 0; i < out.length; i += 4) {
    if (data[i + 3] <= 16) continue;
    const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
    const oldHue = hue(data[i], data[i + 1], data[i + 2]);
    if (dominant !== null && (max - min < 20 || distance(oldHue, dominant) > .12)) continue;
    const h = (targetHue + (dominant === null ? 0 : oldHue - dominant) + 1) % 1;
    const sat = targetSat * (dominant === null ? .75 : .6 + .4 * (max ? (max - min) / max : 0));
    const value = max * (.55 + targetMax / 255 * .65), chroma = value * sat;
    const x = chroma * (1 - Math.abs((h * 6) % 2 - 1)), m = value - chroma;
    const channels = h < 1/6 ? [chroma,x,0] : h < 2/6 ? [x,chroma,0] : h < 3/6 ? [0,chroma,x] : h < 4/6 ? [0,x,chroma] : h < 5/6 ? [x,0,chroma] : [chroma,0,x];
    for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255, Math.round(channels[c] + m)));
  }
  return out;
}
const cache = new WeakMap();
export function modelDyeMips(mips, slot, file = '', override = undefined) {
  const id = /\(([^()]+)\)/.exec(slot ?? '')?.[1];
  const dye = override !== undefined ? override : id ? modelDyeOf(id) : null;
  if (dye === null || !Array.isArray(mips) || !clothTextureCanDye(file)) return mips;
  let byDye = cache.get(mips);
  if (!byDye) { byDye = new Map(); cache.set(mips, byDye); }
  if (!byDye.has(dye)) byDye.set(dye, mips.map((m) => m.rgba ? { ...m, rgba: dyeClothPixels(m.rgba, dye) } : m));
  return byDye.get(dye);
}
