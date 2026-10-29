// Cosmetic art selection only. Never change item.variant: it is shared with gameplay/3D imports.
import { getPref, setPref } from './uiPrefs.js';

export const HELMET_2D_PREF = 'helmetPaperdollLooks';
export const HELMET_2D_COUNT = 6;
export const isPaperdollHelmet = (item) => item?.group === 'Armor' && item.templateIndex === 107 && !item.artifact;
const keyOf = (item) => `${item.templateIndex}:${item.material ?? 0}`;

export function helmetPaperdollVariant(item) {
  if (!isPaperdollHelmet(item)) return null;
  const value = getPref(HELMET_2D_PREF)?.[keyOf(item)];
  return Number.isInteger(value) && value >= 0 && value < HELMET_2D_COUNT ? value : null;
}

export function setHelmetPaperdollVariant(item, value) {
  if (!isPaperdollHelmet(item) || (value !== null && (!Number.isInteger(value) || value < 0 || value >= HELMET_2D_COUNT))) return false;
  if (helmetPaperdollVariant(item) === value) return false;
  const looks = { ...(getPref(HELMET_2D_PREF) ?? {}) };
  if (value === null) delete looks[keyOf(item)];
  else looks[keyOf(item)] = value;
  setPref(HELMET_2D_PREF, looks);
  return true;
}
