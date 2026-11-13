// WEAPON-GEAR (2026-10-27): online, each point of gear on a weapon
// skill adds 0.44% to its blow from the first point, added to MARTIAL2's climb (GEAR-ADDS); the fists are their own, and nothing
// of it reaches a player, a refereed fight, a mentor or the beast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { pcaaoWeaponAttackDamage, pcaaoModules } from '../../src/combat/pcaao.js';
import {
  weaponPastPct, weaponGearPct, weaponGearRoll, weaponGearAdd, weaponPvpClimbPct, weaponMasteryBlow, WEAPON_GEAR_PER_POINT, WEAPON_GEAR_PCT_MOST, _resetWeaponMasteryForTests,
} from '../../src/systems/weaponMastery.js';
import { BLOW_TOPS } from '../../src/systems/powerCeiling.js';
import { masteryBlowTop } from '../../tools/powerCeiling.mjs';
import { SKILLS, skillValue } from '../../src/systems/skills.js';
import { duelAttackerOf, resolveDuelStrike, duelStandIn } from '../../src/combat/duelCombat.js';

const ALL_ON = { Enabled: true, equipmentDamageEnhanced: false, fadingEnchantedItems: false, fixedStrengthDamageModifier: true, armorHitFormulaRedone: true, criticalStrikesIncreaseDamage: true, conditionBasedEffectiveness: false, softMaterialRequirements: true };
const M = pcaaoModules((k) => ALL_ON[k], () => undefined);
const skillsOf = (v) => Object.fromEntries(Array.from({ length: 35 }, (_, i) => [i, v]));
const foe = { isPlayer: false, careerIndex: 0, level: 5, health: 100, maxHealth: 100 };
const low = { ...foe, health: 10 };
/** A player trained to `trained` in every skill (Long Blade, Axe and Archery mastered), `gear` more on each weapon skill. */
const player = (trained, gear = 0) => ({
  isPlayer: true, _online: true, level: 45, raceId: 1, skills: skillsOf(trained),
  stats: { strength: 100, intelligence: 50, willpower: 50, agility: 100, endurance: 100, personality: 50, speed: 100, luck: 50 },
  masteredSkills: [SKILLS.Archery, SKILLS.LongBlade, SKILLS.Axe], career: { weaponArmorShieldsBitfield: 0 },
  _mods: { skills: { [SKILLS.LongBlade]: gear, [SKILLS.Archery]: gear, [SKILLS.Axe]: gear, [SKILLS.ShortBlade]: gear, [SKILLS.HandToHand]: gear } },
});
const daedric = (templateIndex) => ({ group: 'Weapons', templateIndex, material: WEAPON_MATERIALS.Daedric, flags: 0, maxCondition: 100, currentCondition: 100 });
const ON = { online: true };
const online = (fn) => {
  const loc = globalThis.location;
  globalThis.location = { search: '?online' };
  _resetWeaponMasteryForTests();
  try { return fn(); } finally { globalThis.location = loc; _resetWeaponMasteryForTests(); }
};

const near = (a, b, why) => assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} against ${b}`);

test('WEAPON-GEAR: 0.44% a point of gear from the first point - the sheet of 872 (trained 200, 672 on it) x4.36, counted to 320', () => {
  assert.equal(WEAPON_GEAR_PER_POINT, 0.44);
  assert.equal(skillValue(player(200, 672), SKILLS.LongBlade), 140 + 672, 'the gear on the skill counts');
  near(weaponGearPct(player(200, 672), SKILLS.LongBlade, ON), 295.68, 'the top kit');
  near(weaponGearPct(player(50, 50), SKILLS.LongBlade, ON), 22, 'a low weapon player gains from the first point');
  near(weaponGearPct(player(100, 100), SKILLS.LongBlade, ON), 44, 'below 200 live');
  assert.equal(weaponGearPct(player(200), SKILLS.LongBlade, ON), 0, 'no gear: none');
  assert.equal(weaponGearPct(player(100, 5000), SKILLS.LongBlade, ON), WEAPON_GEAR_PCT_MOST, 'counted to the most');
  assert.equal(BLOW_TOPS.mastery, masteryBlowTop(), 'the ceiling\'s mastery top is the climb\'s most and the gear\'s');
  assert.equal(BLOW_TOPS.mastery, 400);
});

test('WEAPON-GEAR: every weapon family adds its climb and its gear - the sword, the axe, the bow, the dagger; never the fists', () => {
  const sword = daedric(WEAPONS.Longsword), axe = daedric(WEAPONS.War_Axe), bow = daedric(WEAPONS.Long_Bow), dagger = daedric(WEAPONS.Dagger);
  const geared = player(200, 672), trained = player(200), both = player(200, 100);
  for (const w of [sword, bow]) near(weaponPastPct(w, geared, foe, ON), 335.68, `${w.templateIndex}: the climb's 40 and the gear's`);
  near(weaponPastPct(dagger, geared, foe, ON), 295.68, 'the dagger\'s climb is its pace, its gear its blow');
  near(weaponPastPct(axe, geared, foe, ON), 335.68, 'the axe at full health: the sword\'s climb and its gear');
  near(weaponPastPct(axe, geared, low, ON), 335.68, 'the axe at low health: the same');
  assert.equal(weaponPastPct(sword, trained, foe, ON), 40, 'no gear: MARTIAL2\'s climb, as it was');
  assert.equal(weaponPastPct(axe, trained, low, ON), 40, 'the axe\'s climb is the sword\'s');
  near(weaponPastPct(sword, both, foe, ON), 84, '100 of gear on a trained 200 adds, never the greater');
  assert.equal(weaponPastPct(null, geared, foe, ON), 0, 'the fists read their skill in their roll already');
});

test('WEAPON-GEAR: only my blow online at a foe - offline, a mentor, the beast, a peer and a player target take nothing', () => {
  const sword = daedric(WEAPONS.Longsword);
  assert.equal(weaponGearPct(player(100, 672), SKILLS.LongBlade, { online: false }), 0, 'offline is Daggerfall\'s');
  assert.equal(weaponGearPct({ ...player(100, 672), _mentor: {} }, SKILLS.LongBlade, ON), 0);
  assert.equal(weaponGearPct({ ...player(100, 672), isInBeastForm: true }, SKILLS.LongBlade, ON), 0);
  assert.equal(weaponGearPct({ ...player(100, 672), peer: true }, SKILLS.LongBlade, ON), 0);
  online(() => {
    // At a foe the 672 points roll 67 to 134 into the weapon's own roll (weaponGearAdd); the blow
    // modifier is the climb's x1.4 alone, over a blow that already carries them
    assert.equal(weaponGearAdd(player(200, 672), sword, foe, () => 0), 67);
    assert.equal(weaponGearAdd(player(200, 672), sword, foe, () => 0.9999), 134);
    assert.equal(weaponGearAdd(player(200, 672), sword, { isPlayer: true }, () => 0), 0, 'a player target: none here');
    assert.equal(weaponGearAdd(player(200, 672), null, foe, () => 0), 0, 'the fists: theirs is in their roll');
    assert.equal(weaponMasteryBlow(sword, 100, player(200, 672), foe), 140, 'the climb alone over the blow');
    assert.equal(weaponMasteryBlow(sword, 100, player(200, 672), { isPlayer: true }), 100, 'a player takes the blow as struck');
    assert.equal(weaponMasteryBlow(sword, 100, player(100), foe), 100, 'skill 100, no gear: as struck');
  });
});

test('GEAR-ROLL: through the real core - a Daedric Longsword at the same roll strikes 67 to 134 harder for 672 gear', () => online(() => {
  const sword = daedric(WEAPONS.Longsword);
  const at = (p) => pcaaoWeaponAttackDamage(p, foe, 0, 0, sword, () => 0.5, M);
  const bare = at(player(100));
  assert.ok(bare > 0);
  for (let i = 0; i < 100; i++) {
    const geared = at(player(100, 672));
    assert.ok(geared - bare >= 67 && geared - bare <= 134, `${geared} against ${bare}`);
  }
}));

test('GEAR-ROLL: every family takes the same roll for the same gear; the fists, the beast, a peer, a mentor and offline none', () => {
  const all = player(100, 600);
  all._mods.skills[SKILLS.BluntWeapon] = 600;
  for (const t of [WEAPONS.Dagger, WEAPONS.Longsword, WEAPONS.War_Axe, WEAPONS.Warhammer, WEAPONS.Staff, WEAPONS.Long_Bow]) {
    assert.deepEqual(weaponGearRoll(all, daedric(t), ON), [60, 120], `template ${t}`);
  }
  assert.equal(weaponGearRoll(player(100, 600), null, ON), null, 'the fists: their gear is in their roll');
  assert.equal(weaponGearRoll(player(100, 600), daedric(WEAPONS.Longsword), { online: false }), null);
  assert.equal(weaponGearRoll({ ...player(100, 600), isInBeastForm: true }, daedric(WEAPONS.Longsword), ON), null);
  assert.equal(weaponGearRoll({ ...player(100, 600), peer: true }, daedric(WEAPONS.Longsword), ON), null);
  assert.equal(weaponGearRoll({ ...player(100, 600), _mentor: {} }, daedric(WEAPONS.Longsword), ON), null);
  assert.equal(weaponGearRoll(player(100, 0), daedric(WEAPONS.Longsword), ON), null, 'no gear, no roll');
});

test('GEAR-ROLL: a blow between players carries the same roll - the sheet\'s `gr`, its percent `wp` the climb alone', () => online(() => {
  const sword = daedric(WEAPONS.Longsword);
  const a = duelAttackerOf(player(200, 600), sword);
  assert.deepEqual(a.gr, [60, 120], 'the gear rolled, as at a foe');
  assert.equal(a.wp, 40, 'the climb past 100 alone (x1.4), no gear percent');
  assert.equal(duelAttackerOf(player(200, 600), null).gr, null, 'the fists: their gear is in `sk`');
  const bare = duelAttackerOf(player(200, 0), sword);
  const at = (sheet) => resolveDuelStrike({ k: 'strike', by: 'melee', a: sheet, w: { t: WEAPONS.Longsword, m: WEAPON_MATERIALS.Daedric, c: 100 } }, duelStandIn(), { rolls: () => 0.5 }).dmg;
  const plain = at(bare), geared = at(a);
  assert.ok(plain > 0);
  assert.ok(geared >= Math.floor((plain / 1.4 + 60) * 1.4) - 2, `${geared} against ${plain}`);
}));

test('between players a crit multiplies the gear\'s roll as it does at a foe - never added after it', () => online(() => {
  const sword = daedric(WEAPONS.Longsword);
  const me = player(200, 600);
  const w = { t: WEAPONS.Longsword, m: WEAPON_MATERIALS.Daedric, c: 100 };
  const at = (sheet) => resolveDuelStrike({ k: 'strike', by: 'melee', a: sheet, w }, duelStandIn(), { rolls: () => 0.5 }).dmg;
  const noCrit = (p) => { p.skills[SKILLS.CriticalStrike] = 0; return p; };
  const highCrit = (p) => { p.masteredSkills.push(SKILLS.CriticalStrike); p._mods.skills[SKILLS.CriticalStrike] = 600; return p; };
  const plain = at(duelAttackerOf(noCrit(player(200, 0)), sword));
  const geared = at(duelAttackerOf(noCrit(me), sword));
  const critPlain = at(duelAttackerOf(highCrit(player(200, 0)), sword));
  const critGeared = at(duelAttackerOf(highCrit(player(200, 600)), sword));
  assert.ok(critPlain > plain, 'the high crit lands its crit');
  const mult = critPlain / plain;
  assert.ok(critGeared - critPlain >= (geared - plain) * mult * 0.9, `crit ${critGeared - critPlain} against bare ${geared - plain} x${mult}`);
}));

test('PVP-EVEN: between players every family\'s climb is 1% a point (x1.4 at 200) - the axe and the hammer with no half line - save the Short Blade\'s, which is its swing, and the fists\', which is in their roll', () => online(() => {
  const me = player(200);
  me.masteredSkills.push(SKILLS.BluntWeapon, SKILLS.ShortBlade);
  for (const t of [WEAPONS.Longsword, WEAPONS.War_Axe, WEAPONS.Warhammer, WEAPONS.Staff, WEAPONS.Long_Bow]) {
    assert.equal(duelAttackerOf(me, daedric(t)).wp, 40, `template ${t}`);
    assert.equal(weaponPvpClimbPct(daedric(t), me, ON), 40);
  }
  assert.equal(duelAttackerOf(me, daedric(WEAPONS.Dagger)).wp, 0, 'the dagger: its climb is its swing');
  assert.equal(duelAttackerOf(me, daedric(WEAPONS.Shortsword)).wp, 0);
  assert.equal(duelAttackerOf(me, null).wp, 0, 'the fists');
  assert.equal(weaponPvpClimbPct(daedric(WEAPONS.Longsword), me, { online: false }), 0, 'offline');
}));


test('the weapon\'s own damage lines (an affix, its gems, an heirloom) ride the gear\'s roll as the wraps\' ride the fists\'', async () => {
  const { registerWeaponDamageMod } = await import('../../src/systems/entityMods.js');
  online(() => {
    const sword = daedric(WEAPONS.Longsword);
    const at = (p) => pcaaoWeaponAttackDamage(p, foe, 0, 0, sword, () => 0, M);
    const plainGap = at(player(100, 600)) - at(player(100));
    assert.equal(plainGap, 60, 'the 600 points\' low roll, 60');
    registerWeaponDamageMod('test-double', (w, d) => d * 2);
    try {
      const doubledGap = at(player(100, 600)) - at(player(100));
      assert.equal(doubledGap, 120, 'a +100% damage line doubles the gear\'s roll too');
    } finally {
      registerWeaponDamageMod('test-double', null);
    }
  });
});
