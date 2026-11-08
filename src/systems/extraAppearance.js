import { getPref } from './uiPrefs.js';
import { modGroupEnabled, modGroupReady } from './enhancedModResources.js';
export const EXTRA_APPEARANCE_PREFS = Object.freeze({armor:'extraArmorLooks',weapon:'extraWeaponLooks',cloak:'extraCloakLooks'});
export function animatedCloaksRequirement() {
  return getPref('modelCustomization') === true ? null : 'Требуется включённая кастомизация 3D.';
}
export const animatedCloaksEnabled = () => !animatedCloaksRequirement() && modGroupEnabled('cloak-animation');
export function extraAppearanceRequirements(kind) {
  const missing=[];
  if(getPref('modelCustomization') !== true) missing.push('Включите кастомизацию 3D.');
  if(!modGroupReady('bodies')) missing.push('Подключите все ресурсы и включите группу «Тела и руки» (Better Bodies / Better Hands).');
  if(kind === 'cloak' && !animatedCloaksEnabled()) missing.push('Включите анимацию плащей.');
  return missing;
}
export function extraAppearanceEnabled(kind) {
  return extraAppearanceRequirements(kind).length === 0 && getPref(EXTRA_APPEARANCE_PREFS[kind]) !== false;
}
