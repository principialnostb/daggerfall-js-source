// Character body morph settings for the Morrowind player.
// Values are normalized to [-1, 1] and persisted per browser profile.
export const BODY_MORPH_FIELDS = [
  ['shoulderWidth', 'Ширина плеч', 'shoulders'],
  ['bustVolume', 'Объём груди', 'chest'],
  ['ribcageWidth', 'Ширина грудной клетки', 'chest'],
  ['armThickness', 'Толщина рук', 'arms'],
  ['armLength', 'Длина рук', 'arms'],
  ['waistWidth', 'Ширина талии', 'torso'],
  ['bellyVolume', 'Объём живота', 'torso'],
  ['pelvisWidth', 'Ширина таза', 'hips'],
  ['buttockVolume', 'Объём ягодиц', 'hips'],
  ['buttockProjection', 'Выступ ягодиц', 'hips'],
  ['legGap', 'Расстояние между ногами', 'legs'],
  ['thighThickness', 'Толщина бёдер', 'legs'],
  ['calfThickness', 'Толщина голеней', 'legs'],
  ['legLength', 'Длина ног', 'legs'],
  ['height', 'Рост', 'overall'],
  ['fullness', 'Общая полнота', 'overall'],
  ['bodyWidth', 'Ширина корпуса', 'overall'],
];
const KEY = 'mw-character-body-morphs-v1';
const defaults = Object.freeze(Object.fromEntries(BODY_MORPH_FIELDS.map(([key]) => [key, 0])));
let cached = null;
export function getBodyMorphs() {
  if (cached) return { ...cached };
  let saved = null;
  try { saved = JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null'); } catch { saved = null; }
  cached = { ...defaults };
  if (saved && typeof saved === 'object') {
    for (const [key] of BODY_MORPH_FIELDS) {
      const n = Number(saved[key]);
      if (Number.isFinite(n)) cached[key] = Math.max(-1, Math.min(1, n));
    }
  }
  return { ...cached };
}
export function setBodyMorph(key, value) {
  if (!(key in defaults)) return getBodyMorphs();
  const n = Number(value);
  const state = getBodyMorphs();
  state[key] = Number.isFinite(n) ? Math.max(-1, Math.min(1, n)) : 0;
  cached = state;
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(cached)); } catch { /* storage may be disabled */ }
  return { ...cached };
}
export function resetBodyMorphs() {
  cached = { ...defaults };
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(cached)); } catch { /* storage may be disabled */ }
  return { ...cached };
}
