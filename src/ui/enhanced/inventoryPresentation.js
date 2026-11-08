import { getPref, setPref } from '../../systems/uiPrefs.js';

// The inventory mode has priority over saved 2D face and helmet appearances.
export function inventoryModelSource(arm) {
  return getPref('morrowindThirdPersonOnly') ? null : arm;
}

export function setInventory2D(enabled) {
  setPref('morrowindThirdPersonOnly', !!enabled);
  setPref('morrowind3dPaperDoll', !enabled);
  setPref('morrowind3dInventoryIcons', !enabled);
}
