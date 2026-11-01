// Cosmetic 2D inventory art, deliberately separate from entity/3D appearance.
import { getPref, setPref } from './uiPrefs.js';
import { FACES_PER_RACE } from './races.js';
export const INVENTORY_FACES_PREF = 'inventoryFaces';
export const inventoryFaceKey = (entity, identity) => JSON.stringify([entity?.name ?? '', identity.race, identity.gender]);
export function inventoryFaceIndex(entity, identity) {
  const value = getPref(INVENTORY_FACES_PREF)?.[inventoryFaceKey(entity, identity)];
  return Number.isInteger(value) && value >= 0 && value < FACES_PER_RACE ? value : null;
}
export function setInventoryFaceIndex(entity, identity, index) {
  if (!Number.isInteger(index) || index < 0 || index >= FACES_PER_RACE) return false;
  setPref(INVENTORY_FACES_PREF, { ...(getPref(INVENTORY_FACES_PREF) ?? {}), [inventoryFaceKey(entity, identity)]: index });
  return true;
}
