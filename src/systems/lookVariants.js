// @ts-check
// LOOK-VARIANTS (2026-10-27, the owner: "выбирать вариации вещей визуального отображения прям через инвентарь когда вещь
// надета на персонажа"): THE LOOKS A WORN PIECE CAN WEAR, turned from the inventory's paperdoll - the wheel over the
// piece steps through them, and its tooltip names the one worn. A test bench for looks, before a look has a home of its
// own on the item: a look is the viewer's switch it always was (the Steel Helm's `mwSteelHelm`), so turning it here is
// throwing that switch, and the body is rebuilt as the settings tile rebuilds it (ui/enhanced/enhancedMenu.js TILE_AFTER).
import { getPref, setPref } from './uiPrefs.js';
import { ownArmorModelFor, STEEL_HELM_STYLES, STEEL_HELM_DEFAULT } from '../characters/ownModels/ownArmorModels.js';

/** The looks' names as the tooltip says them. */
const LOOK_LABEL = Object.freeze({ closed: 'Closed', open: 'Open', horned: 'Horned' });

/** A worn item's looks - { pref, values, current } - or null when it has one look. */
export function lookVariantsOf(item) {
  if (!item || typeof item.templateIndex !== 'number') return null;
  const own = ownArmorModelFor({ templateIndex: item.templateIndex, material: item.material ?? 0 });
  if (!own?.styles) return null;
  const v = getPref('mwSteelHelm');
  return { pref: 'mwSteelHelm', values: STEEL_HELM_STYLES, current: STEEL_HELM_STYLES.includes(v) ? v : STEEL_HELM_DEFAULT };
}

/** The look a worn item wears now, as the screens name it - or null when it has one. */
export function lookVariantLabel(item) {
  const l = lookVariantsOf(item);
  return l ? LOOK_LABEL[l.current] ?? l.current : null;
}

/** The tooltip's line for a worn item with looks, or null. */
export function lookVariantLine(item) {
  const l = lookVariantsOf(item);
  if (!l) return null;
  const at = l.values.indexOf(l.current);
  return `Look: ${LOOK_LABEL[l.current] ?? l.current} (${at + 1}/${l.values.length}) - wheel to change`;
}

/** Step a worn item's look by `dir` (+1 / -1, wrapping); the new look, or null when it has one. */
export function stepLookVariant(item, dir) {
  const l = lookVariantsOf(item);
  if (!l || !dir) return null;
  const n = l.values.length, at = l.values.indexOf(l.current);
  const next = l.values[(((at + Math.sign(dir)) % n) + n) % n];
  setPref(l.pref, next);
  return next;
}

/** Rebuild the player's Morrowind body after a look changed - the settings tile's way. */
export async function rebuildForLook(entity) {
  const { buildArmsFor } = await import('../combat/weapon/weaponRig.js');
  await buildArmsFor(entity);
}
