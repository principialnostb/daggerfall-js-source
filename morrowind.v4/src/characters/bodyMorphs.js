// Character body morph settings for the Morrowind player.
// Values are normalized to [-1, 1] and persisted per browser profile.
export const BODY_MORPH_FIELDS = [
  ['height', 'Рост', 'overall'],
  ['bodyWidth', 'Ширина тела', 'overall'],
  ['bodyFullness', 'Общая полнота', 'overall'],
  ['shoulderWidth', 'Ширина плеч', 'shoulders'],
  ['ribcageWidth', 'Ширина грудной клетки', 'torso'],
  ['breastSize', 'Объём груди', 'chest'],
  ['breastProjection', 'Выступ груди', 'chest'],
  ['waistWidth', 'Ширина талии', 'torso'],
  ['abdomenVolume', 'Объём живота', 'torso'],
  ['hipWidth', 'Ширина таза', 'hips'],
  ['buttockSize', 'Объём ягодиц', 'hips'],
  ['buttockProjection', 'Выступ ягодиц', 'hips'],
  ['headScale', 'Размер головы', 'head'],
  ['armThickness', 'Толщина рук', 'arms'],
  ['armLength', 'Длина рук', 'arms'],
  ['thighThickness', 'Толщина бёдер', 'legs'],
  ['calfThickness', 'Толщина голеней', 'legs'],
  ['legLength', 'Длина ног', 'legs'],
  ['legGap', 'Расстояние между ногами', 'legs'],
];
const KEY = 'mw-character-body-morphs-v1';
const UNDERWEAR_KEY = 'mw-character-underwear-v1';
const BODY_HAIR_KEY = 'mw-character-body-hair-v1';
const IDENTITY_KEY = 'mw-character-appearance-identity-v1';
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

export function getUnderwearEnabled() {
  // Underwear is the safe/default in-game appearance; explicitly saved false
  // selects the fully nude Better Bodies variant in the appearance preview.
  try { return globalThis.localStorage?.getItem(UNDERWEAR_KEY) !== 'false'; } catch { return true; }
}
export function setUnderwearEnabled(enabled) {
  const value = !!enabled;
  try { globalThis.localStorage?.setItem(UNDERWEAR_KEY, value ? 'true' : 'false'); } catch { /* storage may be disabled */ }
  return value;
}

export function getBodyHairEnabled() {
  try { return globalThis.localStorage?.getItem(BODY_HAIR_KEY) === 'true'; } catch { return false; }
}
export function setBodyHairEnabled(enabled) {
  const value = !!enabled;
  try { globalThis.localStorage?.setItem(BODY_HAIR_KEY, value ? 'true' : 'false'); } catch { /* storage may be disabled */ }
  return value;
}

/** Appearance-only identity override. It changes the rendered race/face, not character attributes or skills. */
export function getAppearanceIdentity() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(IDENTITY_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return null;
    const race = String(saved.race || '').trim().toLowerCase();
    const faceIndex = Number(saved.faceIndex);
    if (!race || !Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex > 9) return null;
    return { race, faceIndex };
  } catch { return null; }
}
export function setAppearanceIdentity({ race, faceIndex } = {}) {
  const normalizedRace = String(race || '').trim().toLowerCase();
  const index = Number(faceIndex);
  if (!normalizedRace || !Number.isInteger(index) || index < 0 || index > 9) return getAppearanceIdentity();
  const identity = { race: normalizedRace, faceIndex: index };
  try { globalThis.localStorage?.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* storage may be disabled */ }
  return identity;
}
