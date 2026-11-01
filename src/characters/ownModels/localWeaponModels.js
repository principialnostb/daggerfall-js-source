import { BATTLEAXE_FIRST_PERSON } from './battleaxeFit.js';
// Optional weapon skins; a clean checkout and an unset preference keep the original model.
import { OWN_MW_URLS } from '../../systems/ownMwAssets.js';
import { getPref } from '../../systems/uiPrefs.js';
export const WEAPON_LOOKS_PREF = 'mwWeaponLooks';
export const weaponLookKey = (item) => `weapon:${item.templateIndex}:${item.material ?? 0}`;
export const SKYRIM_STEEL_AXE = Object.freeze({
  model: 'skyrim_steel_battleaxe.nif', bone: 'Weapon Bone', animateAs: 8,
  firstPersonAttitude: BATTLEAXE_FIRST_PERSON,
  borrowsAmmo: false, id: 'skyrim_steel_battleaxe', name: 'Steel Battleaxe', speed: 1,
});
export const WEAPON_SKINS = Object.freeze([
  Object.freeze({ value: 'skyrim-steel-battleaxe', label: 'Skyrim · Steel Battleaxe', templateIndex: 128, ...SKYRIM_STEEL_AXE }),
]);
// DFU ItemEnums.Weapons.War_Axe (128): the two-handed axe. Material is cosmetic compatibility here.
export const weaponSkinsFor = (item) => WEAPON_SKINS.filter((skin) => skin.templateIndex === item?.templateIndex);
export const weaponSkinAvailable = (skin, urls = OWN_MW_URLS) =>
  !!urls[`meshes/${skin.model}`] && !!urls[`textures/${skin.model.replace(/\.nif$/i, '.dds')}`];
export function localWeaponModelFor(item, urls = OWN_MW_URLS, looks = getPref(WEAPON_LOOKS_PREF)) {
  if (!item) return null;
  const skin = weaponSkinsFor(item).find((s) => s.value === looks?.[weaponLookKey(item)]);
  return skin && weaponSkinAvailable(skin, urls) ? skin : null;
}
