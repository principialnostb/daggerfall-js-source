// The dragon's hoard, on the receipt's seed: its shape, its tiers, its gold and its gem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDragonSpoils, dragonSpoilsList, DRAGON_GOLD_PER_LEVEL, DRAGON_SPOILS_LEGENDARY, DRAGON_MAGIC_PIECES } from '../../../src/systems/dragon/dragonSpoils.js';
import { STOOD_GOLD } from '../../../src/systems/serpent/serpentSpoils.js';

test('DRAGON4 the hoard: the seed\'s own - the same seed, level and earning the same hoard; a dealer\'s Rare or better, then DRAGON_MAGIC_PIECES Magic or better and the dragon\'s gem for everyone, a stander STOOD_GOLD of the gold; its gold DRAGON_GOLD_PER_LEVEL a level within a fifth; the Rare piece Legendary about DRAGON_SPOILS_LEGENDARY of the time (mutants: a stander paid a dealer\'s; the Legendary\'s share; one Magic piece; no gem)', () => {
  const a = dragonSpoilsList(1234, 20, 'dealt'), b = dragonSpoilsList(1234, 20, 'dealt');
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const d = rollDragonSpoils(99, 20, 'dealt'), s = rollDragonSpoils(99, 20, 'stood');
  assert.equal(DRAGON_MAGIC_PIECES, 2);
  assert.equal(d.pieces.length, 1 + DRAGON_MAGIC_PIECES);
  assert.ok(['rare', 'legendary'].includes(d.pieces[0].tier), d.pieces[0].tier);
  assert.equal(s.pieces.length, DRAGON_MAGIC_PIECES);
  for (const p of [...d.pieces.slice(1), ...s.pieces]) assert.ok(['magic', 'rare', 'legendary'].includes(p.tier), p.tier);
  for (const h of [d, s]) assert.deepEqual(h.gems.map((g) => g.group), ['Gems'], 'the dragon\'s gem, a dealer\'s and a stander\'s');
  const list = dragonSpoilsList(99, 20, 'stood');
  assert.deepEqual(list.map((x) => x.kind), ['item', 'item', 'item', 'gold'], 'the pieces, the gem, then the gold');
  assert.equal(list[2].item.group, 'Gems');
  let legendary = 0, gMin = Infinity, gMax = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const h = rollDragonSpoils(seed, 10, 'dealt');
    if (h.pieces[0].tier === 'legendary') legendary++;
    gMin = Math.min(gMin, h.gold); gMax = Math.max(gMax, h.gold);
    assert.ok(h.pieces.every((p) => p.item.isIdentified), 'every piece known');
  }
  assert.ok(gMin >= DRAGON_GOLD_PER_LEVEL * 10 * 0.8 - 1 && gMax <= DRAGON_GOLD_PER_LEVEL * 10 * 1.2 + 1);
  assert.ok(Math.abs(legendary / 600 - DRAGON_SPOILS_LEGENDARY) < 0.06, `${legendary} of 600 Legendary`);
  const st = rollDragonSpoils(5, 10, 'stood').gold, dl = rollDragonSpoils(5, 10, 'dealt').gold;
  assert.ok(Math.abs(st - dl * STOOD_GOLD) <= 1, 'a stander\'s share of the gold');
});
