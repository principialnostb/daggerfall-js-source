// @ts-check
// THE INVASION'S REWARD: one roll for each player who earned the invasion boss's fall. Three outcomes: an Ebony
// Legendary, a Daedric piece of the Realm Defender's Aetheric set, or Retribution's Call, a Gilded Daedric katana.
// The table is INVASION_REWARD_TABLE, the one place to tweak it. Every draw is the caller's `rand`, so a receipt's seed
// mints the same piece on every device (systems/staffEventSpoils.js).
import { WEAPONS, WEAPON_MATERIALS } from '../../characters/weapons.js';
import { createWeapon } from '../../combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../armorMaterials.js';
import { setItemFields, mintCondition } from '../item/itemTemplates.js';
import { applyRarity } from '../loot/lootRarity.js';
import { DEFENDER_SET_PIECES, mintAetheric } from '../aetheric.js';
import { RETRIBUTIONS_CALL, mintGilded } from '../gilded.js';

/** The three outcomes and their shares of the one roll, in the order the roll reads them. */
export const INVASION_REWARD_TABLE = Object.freeze([
  Object.freeze({ id: 'legendary', share: 0.823 }),
  Object.freeze({ id: 'aetheric', share: 0.167 }),
  Object.freeze({ id: 'gilded', share: 0.01 }),
]);
/** The Ebony pieces a Legendary can be: every body piece and shield, and every weapon but the arrow. Each has a
 *  Legendary record of its own, so the row never falls to a Rare. */
export const INVASION_LEGENDARY_ARMOR = Object.freeze([102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]);
export const INVASION_LEGENDARY_WEAPONS = Object.freeze(
  Object.values(WEAPONS).filter((weapon) => weapon !== WEAPONS.Arrow),
);

/** @param {readonly any[]} list @param {() => number} rand */
const pick = (list, rand) => list[Math.max(0, Math.min(list.length - 1, Math.floor(rand() * list.length) || 0))];

/** Which row of the table a draw lands on. @param {number} draw a draw in [0, 1) */
export function invasionRewardRow(draw) {
  let at = 0;
  for (const row of INVASION_REWARD_TABLE) {
    at += row.share;
    if (draw < at) return row;
  }
  return INVASION_REWARD_TABLE[INVASION_REWARD_TABLE.length - 1];
}

/** An Ebony base, a weapon or a piece of armour at even odds. @param {() => number} rand */
function ebonyBase(rand) {
  if (rand() < 0.5) return createWeapon(pick(INVASION_LEGENDARY_WEAPONS, rand), WEAPON_MATERIALS.Ebony, rand);
  const templateIndex = pick(INVASION_LEGENDARY_ARMOR, rand);
  return mintCondition(setItemFields({ group: 'Armor', templateIndex, material: ARMOR_MATERIAL.Ebony, flags: 0 }));
}

/**
 * ONE INVASION REWARD: a minted, known, item-law-valid piece. The boss's table is the same at every level, so the
 * options' `level` is read by no row yet.
 * @param {() => number} rand a source of draws in [0, 1)
 * @param {{ level?: number }} [_opts]
 */
export function rollInvasionReward(rand, _opts = {}) {
  const row = invasionRewardRow(rand());
  if (row.id === 'gilded') return mintGilded(RETRIBUTIONS_CALL);
  if (row.id === 'aetheric') return mintAetheric(pick(DEFENDER_SET_PIECES, rand));
  const item = ebonyBase(rand);
  applyRarity(item, 'legendary', rand);
  item.isIdentified = true;
  return item;
}
