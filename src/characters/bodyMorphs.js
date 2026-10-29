// Character body morph settings for the Morrowind player.
// Values are normalized to [-1, 1] and persisted per browser profile.
import { getBool, setValue, saveSettings, onSettingChange } from '../systems/settings/settings.js';
// BODY-SHAPE (characters/bodyShape.js): each label names what the slider visibly does on the Better Bodies mesh.
// Height, arm length and leg length are gone: a vertex morph cannot lengthen a body whose head, hands and worn
// armour hang from bones - they need the skeleton's own scale, a separate change.
export const BODY_MORPH_FIELDS = [
  ['breastSize', 'Размер груди', 'chest'],
  ['breastProjection', 'Выступ груди вперёд', 'chest'],
  ['breastLift', 'Подъём груди', 'chest'],
  ['breastSpacing', 'Расстановка груди', 'chest'],
  ['waistWidth', 'Талия: ширина', 'waist'],
  ['waistDepth', 'Талия: глубина (сбоку)', 'waist'],
  ['abdomenVolume', 'Живот', 'waist'],
  ['hipWidth', 'Ширина бёдер (таз)', 'hips'],
  ['buttockSize', 'Объём ягодиц', 'hips'],
  ['buttockProjection', 'Выступ ягодиц назад', 'hips'],
  ['buttockLift', 'Подъём ягодиц', 'hips'],
  ['thighThickness', 'Полнота бёдер', 'legs'],
  ['calfThickness', 'Икры', 'legs'],
  ['legGap', 'Расстановка ног', 'legs'],
  ['shoulderWidth', 'Ширина плеч', 'upper'],
  ['ribcageWidth', 'Грудная клетка', 'upper'],
  ['armThickness', 'Толщина рук', 'upper'],
  ['bodyWidth', 'Ширина фигуры', 'overall'],
  ['bodyFullness', 'Полнота (вид сбоку)', 'overall'],
  ['headScale', 'Размер головы', 'overall'],
];
// v2: the sliders' meanings moved (v1's "breast" moved the belly), so v1's values are not carried over
const KEY = 'mw-character-body-morphs-v2';
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

// NUDITY-SYNC: the editor's «Нижнее бельё» and the settings' Show Nudity
// (ChildGuard/PlayerNudity - the paperdoll's welds) are ONE switch, underwear
// = !nudity. The editor's saved choice is the authority: on first read it is
// written over a setting that disagrees; a later Show Nudity change in the
// settings screen is mirrored back into the editor's key, so the last action
// wins either way and the two never read differently.
let nudityLinked = false;
function readSavedUnderwear() {
  try {
    const saved = globalThis.localStorage?.getItem(UNDERWEAR_KEY);
    return saved === 'true' ? true : saved === 'false' ? false : null;
  } catch { return null; }
}
function writeSavedUnderwear(value) {
  try { globalThis.localStorage?.setItem(UNDERWEAR_KEY, value ? 'true' : 'false'); } catch { /* storage may be disabled */ }
}
function writeNuditySetting(underwear) {
  if (getBool('ChildGuard', 'PlayerNudity') === !underwear) return;
  setValue('ChildGuard', 'PlayerNudity', !underwear);
  try { saveSettings(); } catch { /* storage may be disabled */ }
}
function linkNuditySetting() {
  if (nudityLinked) return;
  nudityLinked = true;
  const saved = readSavedUnderwear();
  if (saved !== null) writeNuditySetting(saved);
  onSettingChange((section, key, str) => {
    if (section !== 'ChildGuard' || key !== 'PlayerNudity') return;
    const underwear = String(str).toLowerCase() !== 'true';
    if (readSavedUnderwear() !== underwear) writeSavedUnderwear(underwear);
  });
}
export function getUnderwearEnabled() {
  linkNuditySetting();
  // Underwear is the safe/default in-game appearance (Show Nudity ships False).
  return readSavedUnderwear() ?? !getBool('ChildGuard', 'PlayerNudity');
}
export function setUnderwearEnabled(enabled) {
  linkNuditySetting();
  const value = !!enabled;
  writeSavedUnderwear(value);
  writeNuditySetting(value);
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

/** Appearance-only identity override. It changes the rendered race/sex/head/hair, not character attributes or skills. */
export function getAppearanceIdentity() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(IDENTITY_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return null;
    const race = String(saved.race || '').trim().toLowerCase();
    const faceIndex = Number(saved.faceIndex);
    if (!race || !Number.isInteger(faceIndex) || faceIndex < 0 || faceIndex > 9) return null;
    const cleanPartId = (value) => {
      const id = String(value || '').trim();
      return id && id.length <= 160 && /^[a-z0-9_ -]+$/i.test(id) ? id : null;
    };
    return {
      race, faceIndex,
      female: typeof saved.female === 'boolean' ? saved.female : null,
      headId: cleanPartId(saved.headId),
      hairId: cleanPartId(saved.hairId),
    };
  } catch { return null; }
}
export function setAppearanceIdentity({ race, faceIndex, female, headId, hairId } = {}) {
  const normalizedRace = String(race || '').trim().toLowerCase();
  const index = Number(faceIndex);
  if (!normalizedRace || !Number.isInteger(index) || index < 0 || index > 9) return getAppearanceIdentity();
  const cleanPartId = (value) => {
    const id = String(value || '').trim();
    return id && id.length <= 160 && /^[a-z0-9_ -]+$/i.test(id) ? id : null;
  };
  const identity = {
    race, faceIndex: index,
    ...(typeof female === 'boolean' ? { female } : {}),
    ...(cleanPartId(headId) ? { headId: cleanPartId(headId) } : {}),
    ...(cleanPartId(hairId) ? { hairId: cleanPartId(hairId) } : {}),
  };
  identity.race = normalizedRace;
  try { globalThis.localStorage?.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* storage may be disabled */ }
  return { ...identity, female: typeof identity.female === 'boolean' ? identity.female : null, headId: identity.headId ?? null, hairId: identity.hairId ?? null };
}
