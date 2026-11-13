// The gear on a weapon skill rides in the weapon's roll (weaponRollAdd), and a blow wears its
// blade by a tenth of its damage (damageEquipment). The gear's part of the blow wears nothing: a well-geared axe wears
// as the same axe would without the gear.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { damageEquipment, weaponAttackDamage } from '../../src/combat/formulas.js';
import { registerWeaponRollAdd, weaponRollWithGear, takeWeaponWearShare } from '../../src/systems/entityMods.js';
import { mintCondition } from '../../src/systems/item/itemTemplates.js';
import { WEAPONS } from '../../src/characters/weapons.js';

const axe = () => mintCondition({ group: 'Weapons', templateIndex: WEAPONS.War_Axe, material: 4, name: 'War Axe' });
const foe = () => ({ isPlayer: false, isClass: true, items: [], activeEffects: [], stats: { strength: 50 } });
const me = () => ({ isPlayer: true, items: [], activeEffects: [], stats: { strength: 50 } });

test('GEAR-WEAR: the share is the weapon\'s own roll over the roll with its gear, read once', () => {
  registerWeaponRollAdd(() => 90);
  try {
    assert.equal(weaponRollWithGear(10, me(), axe(), foe(), Math.random), 100);
    assert.equal(takeWeaponWearShare(), 0.1);
    assert.equal(takeWeaponWearShare(), 1, 'read once, then back to whole');
  } finally { registerWeaponRollAdd(null); }
  weaponRollWithGear(10, me(), axe(), foe(), Math.random);
  assert.equal(takeWeaponWearShare(), 1, 'no gear: the whole blow is the weapon\'s');
});

test('GEAR-WEAR: a geared blow wears the axe by its own part alone (mutant: the whole blow - 20 not 2)', () => {
  const blade = axe();
  registerWeaponRollAdd(() => 90);
  try {
    weaponRollWithGear(10, me(), blade, foe(), Math.random);   // a roll of 10, the gear's 90 on top
    damageEquipment(me(), foe(), 200, blade, 0, { rolls: () => 0.99 });   // the blow landed at 200
  } finally { registerWeaponRollAdd(null); }
  assert.equal(blade.maxCondition - blade.currentCondition, 2, 'a tenth of the weapon\'s 20, not of the gear\'s 200');
  const plain = axe();
  damageEquipment(me(), foe(), 200, plain, 0, { rolls: () => 0.99 });
  assert.equal(plain.maxCondition - plain.currentCondition, 20, 'without gear the whole blow wears, as DFU');
});

test('GEAR-WEAR: weaponAttackDamage itself remembers the share of its gear', () => {
  registerWeaponRollAdd(() => 1000);
  try {
    const d = weaponAttackDamage(me(), foe(), 0, axe(), () => 0.5);
    assert.ok(d > 1000);
    const s = takeWeaponWearShare();
    assert.ok(s > 0 && s < 0.05, `share ${s}`);
  } finally { registerWeaponRollAdd(null); }
});
