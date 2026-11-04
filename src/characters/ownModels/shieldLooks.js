import { ARMOR_MATERIAL } from '../../systems/armorMaterials.js';

export const isShieldTemplate = (template) => Number.isInteger(template) && template >= 109 && template <= 112;
export const shieldLookKey = (item) => `shield:${item.templateIndex}:${item.material ?? 0}`;
// Explicit shape/material allowlist. Never infer compatibility from similar
// names, material fallback chains, or a resized model of another shield class.
export const SHIELD_LOOKS = Object.freeze([
  { value: 'skyrim-hide', label: 'Skyrim · Hide', templateIndex: 110, material: ARMOR_MATERIAL.Leather, model: 'shield_sky_hide.nif', source: 'armor/hide/hideshield.nif' },
  { value: 'skyrim-iron', label: 'Skyrim · Iron', templateIndex: 110, material: ARMOR_MATERIAL.Iron, model: 'shield_sky_iron.nif', source: 'armor/iron/shield.nif' },
  { value: 'skyrim-banded-iron', label: 'Skyrim · Banded Iron', templateIndex: 110, material: ARMOR_MATERIAL.Iron, model: 'shield_sky_banded_iron.nif', source: 'armor/iron/shieldheavy.nif' },
  { value: 'skyrim-steel', label: 'Skyrim · Steel', templateIndex: 110, material: ARMOR_MATERIAL.Steel, model: 'shield_sky_steel.nif', source: 'armor/steel/shield.nif' },
  { value: 'skyrim-dwarven', label: 'Skyrim · Dwarven', templateIndex: 110, material: ARMOR_MATERIAL.Dwarven, model: 'shield_sky_dwarven.nif', source: 'armor/dwarven/dwarvenshield.nif' },
  { value: 'skyrim-elven', label: 'Skyrim · Elven', templateIndex: 111, material: ARMOR_MATERIAL.Elven, model: 'shield_sky_elven.nif', source: 'armor/elven/elvenshield.nif' },
  { value: 'skyrim-ebony', label: 'Skyrim · Ebony', templateIndex: 111, material: ARMOR_MATERIAL.Ebony, model: 'shield_sky_ebony.nif', source: 'weapons/ebony/ebonyshield.nif' },
  { value: 'skyrim-daedric', label: 'Skyrim · Daedric', templateIndex: 111, material: ARMOR_MATERIAL.Daedric, model: 'shield_sky_daedric.nif', source: 'armor/daedric/daedricshield.nif' },
]);
export const shieldLooksFor = (item) => SHIELD_LOOKS.filter((look) => look.templateIndex === item?.templateIndex && look.material === (item?.material ?? 0));
export const selectedShieldLook = (item, looks) => shieldLooksFor(item).find((look) => look.value === looks?.[shieldLookKey(item)]) ?? null;
