// Cosmetic art selection only. Never change item.variant: it is shared with gameplay/3D imports.
// PAPERDOLL-LOOKS (2026-11-08): the helm is one case of systems/paperdollLooks.js now - every piece with a 2D choice
// shares its store, its no-duplicates rule and its gate. These names stay for the helmet's callers and pins.
import { getPref, setPref } from './uiPrefs.js';
import { LEGACY_HELMET_PREF, paperdollLookOf, setPaperdollLook, clearPaperdollLooks } from './paperdollLooks.js';

export const HELMET_2D_PREF = LEGACY_HELMET_PREF;
export const HELMET_2D_COUNT = 6;
export const isPaperdollHelmet = (item) => item?.group === 'Armor' && item.templateIndex === 107 && !item.artifact;

/** The helm's chosen style, or null for its own (a choice equal to its own is no choice). */
export function helmetPaperdollVariant(item) {
  if (!isPaperdollHelmet(item)) return null;
  return paperdollLookOf(item)?.v ?? null;
}

export function setHelmetPaperdollVariant(item, value) {
  if (!isPaperdollHelmet(item) || (value !== null && (!Number.isInteger(value) || value < 0 || value >= HELMET_2D_COUNT))) return false;
  return setPaperdollLook(item, value === null ? null : { v: value });
}

export function setPaperdollCustomization(enabled) {
  if (!enabled) clearPaperdollLooks();
  setPref('paperdollCustomization', !!enabled);
}
export function helmetCustomizationModes() {
  return [
    ...(getPref('modelCustomization') === true ? ['3d'] : []),
    ...(getPref('paperdollCustomization') !== false ? ['2d'] : []),
  ];
}
