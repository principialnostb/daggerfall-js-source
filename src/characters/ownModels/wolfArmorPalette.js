import { CLOAK_TEMPLATES, wolfCloakModel } from './wolfCloak.js';
import { OWN_MW_URLS } from '../../systems/ownMwAssets.js';

// Only equipped pieces reach the worn composer. Follow its first valid cloak,
// consistently even if two cloak slots are occupied. Classic preserves the set.
export function wolfArmorPalette(pieces, cloakLooks) {
  for (const piece of pieces ?? []) {
    if (piece.kind !== 'clothing' || !CLOAK_TEMPLATES.includes(piece.templateIndex)) continue;
    const look = cloakLooks?.[piece.templateIndex];
    if (!wolfCloakModel(look)) continue;
    return look === 'wolf-white' ? 'white' : look === 'wolf-black' ? 'black' : 'classic';
  }
  return 'classic';
}

export function wolfArmorModel(model, palette) {
  if (!['white', 'black'].includes(palette) || !/^(iron_.*|steel_plate_helm_horned)\.nif$/i.test(model)) return model;
  const themed = `wolf_armor_${palette}_${model}`;
  // A checkout with the old local assets must keep drawing its accepted set.
  return typeof window !== 'undefined' && !(`meshes/${themed}` in OWN_MW_URLS) ? model : themed;
}
