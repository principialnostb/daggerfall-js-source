import { activeAppearanceIdentity, appearanceEditorEnabled } from '../../characters/activeAppearance.js';
import { getBodyHairEnabled, getBodyMorphs, getUnderwearEnabled } from '../../characters/bodyMorphs.js';
import { modGroupEnabled } from '../../systems/enhancedModResources.js';
import { CLOAK_LOOKS_PREF, CLOAK_TEMPLATES } from '../../characters/ownModels/wolfCloak.js';
import { getPref } from '../../systems/uiPrefs.js';
import { drawnEquipTable } from '../../systems/capeShown.js';
import { itemAppearanceKey, itemOwnStyle } from '../../systems/item/itemAppearanceKey.js';
import { modelCustomizationOn, modelLookOf } from '../../systems/modelLooks.js';
import { modelDyeOf } from '../../systems/modelDye.js';
import { paperdollLookOf } from '../../systems/paperdollLooks.js';

/** Read the local render choices by slot. Item instance identifiers stay local. */
export function captureCosmeticProfile(entity) {
  const bodyEnabled = appearanceEditorEnabled() && modGroupEnabled('bodies');
  const slots = [];
  for (const [slot, item] of (entity?.equip ? drawnEquipTable(entity) : []).entries()) {
    if (!item) continue;
    const model = modelLookOf(item);
    const style = CLOAK_TEMPLATES.includes(item.templateIndex) ? itemOwnStyle(item) ?? getPref(CLOAK_LOOKS_PREF)?.[item.templateIndex] ?? null : modelCustomizationOn() ? itemOwnStyle(item) : null;
    const dye = modelDyeOf(itemAppearanceKey(item));
    const paperdoll = paperdollLookOf(item);
    if (model || style || dye != null || paperdoll) {
      slots.push({
        slot,
        group: item.group,
        templateIndex: item.templateIndex,
        material: item.material ?? 0,
        ...(model ? { model } : {}),
        ...(style ? { style } : {}),
        ...(dye != null ? { dye } : {}),
        ...(paperdoll ? { paperdoll } : {}),
      });
    }
  }
  return {
    version: 1,
    body: bodyEnabled ? {
      identity: activeAppearanceIdentity(),
      proportions: getBodyMorphs(),
      underwear: getUnderwearEnabled(),
      bodyHair: getBodyHairEnabled(),
    } : null,
    slots,
  };
}
