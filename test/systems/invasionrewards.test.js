// The invasion boss's reward: its table's shares, each outcome minted lawful, the names, Retribution's Call's marks, a
// Legendary's Ebony base and record, the same piece for the same seed, and the staff event's receipt rolling it when it says so.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INVASION_REWARD_TABLE, invasionRewardRow, rollInvasionReward,
} from '../../src/systems/toybox/invasionRewards.js';
import { invasionSpoilsList, staffSpoilsList, grantStaffSpoils } from '../../src/systems/staffEventSpoils.js';
import { DEFENDER_SET_PIECES } from '../../src/systems/aetheric.js';
import { RETRIBUTIONS_CALL, validGildedMarks } from '../../src/systems/gilded.js';
import { itemFindings } from '../../src/systems/item/itemLaw.js';
import { legendaryById } from '../../src/systems/loot/lootRarity.js';
import { WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { templateByIndex } from '../../src/systems/item/itemTemplates.js';
import { seededRng } from '../../src/systems/wind/wind.js';

/** A source that answers `first`, then the seeded stream. */
const leading = (first, seed = 7) => {
  const rest = seededRng(seed);
  let used = false;
  return () => (used ? rest() : ((used = true), first));
};
const daedric = (it) => it.material === (it.group === 'Weapons' ? WEAPON_MATERIALS.Daedric : ARMOR_MATERIAL.Daedric);
const ebony = (it) => it.material === (it.group === 'Weapons' ? WEAPON_MATERIALS.Ebony : ARMOR_MATERIAL.Ebony);

test('THE TABLE: three rows - an Ebony Legendary 82.3 times in 100, an Aetheric 16.7, the Gilded one - summing to the whole, read in that order (mutants: a share moved; the order)', () => {
  assert.deepEqual(INVASION_REWARD_TABLE.map((r) => [r.id, r.share]), [['legendary', 0.823], ['aetheric', 0.167], ['gilded', 0.01]]);
  assert.ok(Math.abs(INVASION_REWARD_TABLE.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
  assert.ok(Object.isFrozen(INVASION_REWARD_TABLE) && INVASION_REWARD_TABLE.every(Object.isFrozen));
  assert.deepEqual([0, 0.8229, 0.823, 0.9899, 0.99, 0.9999].map((r) => invasionRewardRow(r).id), ['legendary', 'legendary', 'aetheric', 'aetheric', 'gilded', 'gilded']);
  const n = 4000, seen = { legendary: 0, aetheric: 0, gilded: 0 };
  for (let s = 1; s <= n; s++) seen[rollInvasionReward(seededRng(s)).rarity]++;
  for (const row of INVASION_REWARD_TABLE) assert.ok(Math.abs(seen[row.id] / n - row.share) < 0.03, `${row.id}: ${seen[row.id]} of ${n}`);
});

test('A LEGENDARY: Ebony, known, a weapon or a piece of armour, named by its record, never a Rare, lawful (mutants: a Daedric base; the Rare tier)', () => {
  const groups = new Set();
  for (let s = 1; s <= 400; s++) {
    const it = rollInvasionReward(leading(0.1, s));
    assert.equal(it.rarity, 'legendary', it.name);
    assert.ok(ebony(it), `${it.name}: Ebony`);
    assert.equal(it.isIdentified, true);
    assert.deepEqual(itemFindings(it), [], it.name);
    const rec = legendaryById(it.legendary);
    assert.ok(rec, `${it.name}: a record`);
    assert.equal(it.name, rec.name);
    groups.add(it.group);
  }
  assert.deepEqual([...groups].sort(), ['Armor', 'Weapons']);
});

test('AN AETHERIC: a Realm Defender piece named for its own gear, lawful; every record reachable (mutants: the name off its template; one record never drawn)', () => {
  const drawn = new Set();
  for (let s = 1; s <= 600; s++) {
    const it = rollInvasionReward(leading(0.9, s));
    assert.equal(it.rarity, 'aetheric');
    assert.deepEqual(itemFindings(it), [], it.name);
    assert.ok(daedric(it));
    assert.equal(it.sigil.set, 'defender');
    const gear = templateByIndex(it.templateIndex).name.toLowerCase();
    assert.equal(it.name.toLowerCase(), `the realm defender's ${gear}`);
    drawn.add(it.aetheric);
  }
  assert.equal(drawn.size, DEFENDER_SET_PIECES.length, 'every piece can be the reward');
  const names = DEFENDER_SET_PIECES.map((r) => r.name);
  assert.ok(names.includes("The Realm Defender's Cuirass") && names.includes("The Realm Defender's Dai-Katana"));
});

test("THE GILDED: Retribution's Call, its record's marks exactly, lawful (mutants: another record; a line off)", () => {
  const it = rollInvasionReward(leading(0.995));
  assert.deepEqual([it.rarity, it.gilded, it.name], ['gilded', RETRIBUTIONS_CALL.id, "Retribution's Call"]);
  assert.deepEqual(it.affixes, RETRIBUTIONS_CALL.affixes.map((a) => ({ ...a })));
  assert.equal(it.material, WEAPON_MATERIALS.Daedric);
  assert.ok(validGildedMarks(structuredClone(it)));
  assert.deepEqual(itemFindings(it), []);
});

test('DETERMINISM: the same seed mints the same piece, on every call and at any level; another seed may not (mutants: a Math.random draw)', () => {
  for (const s of [1, 42, 9001, 123456]) {
    const a = rollInvasionReward(seededRng(s), { level: 1 });
    const b = rollInvasionReward(seededRng(s), { level: 30 });
    assert.deepEqual(a, b, `seed ${s}`);
  }
  const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => rollInvasionReward(seededRng(s)).name));
  assert.ok(names.size > 1);
});

test('THE RECEIPT: an invasion receipt (tb 1) grants the invasion reward, one piece and no gold, off its seed; any other receipt the staff table, once (mutants: the staff table for an invasion; a second grant)', async () => {
  const list = invasionSpoilsList(77, 12);
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'item');
  assert.deepEqual(list[0].item, rollInvasionReward(seededRng(77)));
  assert.equal(list[0].tier, list[0].item.rarity);
  const grants = [];
  const pool = { grant: (o) => { grants.push(o); return true; } };
  const lock = (f) => Promise.resolve().then(f);
  await grantStaffSpoils(pool, lock, { v: 'ev1', s: 'acct', c: 77, r: 1, tb: 1 }, 12);
  await grantStaffSpoils(pool, lock, { v: 'ev2', s: 'acct', c: 77, r: 1 }, 12);
  assert.equal(grants.length, 2);
  assert.deepEqual(grants[0].roll(), list, 'the invasion\'s reward');
  assert.deepEqual(grants[1].roll(), staffSpoilsList(77, 12, 1), 'the staff table');
  assert.equal(grants[0].day, 'sev:ev1', 'one day a receipt, as the staff table\'s');
});
