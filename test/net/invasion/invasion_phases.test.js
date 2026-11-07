// An invasion boss's three phases and its telegraphed blows (net/invasion/invasionBlows.js through the brain): its
// phases cut at the gate's first mark and at the endless waves' third, each turn bringing its next heavy blow at once;
// the slam alone in the first, the cleave and the charge in the second, the stomp in the third; every blow a stamp of
// the gate's laid with a wind-up never under the gate's floor, carried whole over the wire.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INVASION_SEAM } from '../../../src/net/bossSeam.js';
import { INVASION_RISE_MS, INVASION_WAVE_GAP_MS } from '../../../src/net/invasion/invasionBrain.js';
import {
  INVASION_BLOW,
  INVASION_HEAVY,
  INVASION_HEAVY_EVERY_MS,
  INVASION_PHASE_AT,
  INVASION_PHASE3_WINDUP_X,
  invasionPhaseOf,
  invasionHeavyPick,
  invasionHeavyStamp,
} from '../../../src/net/invasion/invasionBlows.js';
import { validInvasionOut } from '../../../src/net/invasion/invasionWire.js';
import { PHASE_AT } from '../../../src/net/gate/gateBrain.js';
import { egWindupFloorMs, egInShape } from '../../../src/net/eliteGates/egShape.js';
import { INVASION_PHASE3_AT, INVASION_WAVES, INVASION_FAMILIES } from '../../../src/systems/toybox/toyboxLaw.js';
import { INVASION_BOSS_HP } from '../../../src/net/staffEvent/toyboxEvent.js';

const FAMILY = INVASION_FAMILIES[0];
const EVENT = { id: 'tb12cd34ef', mt: [...FAMILY.kinds], b: FAMILY.boss, hp: INVASION_BOSS_HP };

/** A fight whose boss has just stood up, Ann `gap` metres south of it. */
function risen(gap, rng = () => 0) {
  const fight = INVASION_SEAM.new({ ev: EVENT, sx: 0, sz: 0, now: 0 });
  INVASION_SEAM.join(fight, 'ann', 'Ann', 40, 0);
  fight.wave = INVASION_WAVES;
  let now = INVASION_WAVE_GAP_MS;
  INVASION_SEAM.step(fight, now, [{ sub: 'ann', x: 0, z: 0 }], rng);
  const boss = fight.boss;
  boss.mv = null;
  now += INVASION_RISE_MS;
  const ann = { sub: 'ann', x: boss.x, z: boss.z - gap };
  return { fight, boss, ann, now, step: (at) => INVASION_SEAM.step(fight, at, [ann], rng) };
}
const heavies = (fight) => fight.blows.filter((blow) => blow.i === 0 && blow.a !== INVASION_BLOW.swing);

test('INVASION PHASES: cut at the gate\'s first mark and where the endless waves begin', () => {
  assert.equal(INVASION_PHASE_AT[0], PHASE_AT[0], 'the gate\'s first mark');
  assert.equal(INVASION_PHASE_AT[1], INVASION_PHASE3_AT, 'the third where the waves become endless');
  assert.deepEqual([1, 0.67, 0.66, 0.34, 1 / 3, 0.1].map((frac) => invasionPhaseOf(frac * 1000, 1000)), [1, 1, 2, 2, 3, 3]);
});

test('INVASION PHASES: the brain turns them as the boss\'s health falls, each turn throwing its heavy blow at once; the third brings the endless waves (mutant: no second phase)', () => {
  const { fight, boss, step } = risen(3);
  let now = INVASION_WAVE_GAP_MS + INVASION_RISE_MS + 10;
  const [first] = step(now);
  assert.equal(first.ph, 1);
  assert.equal(heavies(fight).length, 0, 'no heavy blow before its time');
  boss.busy = 0;
  boss.h = boss.m * 0.6;
  const [second] = step((now += 250));
  assert.equal(second.ph, 2, 'the second phase said');
  assert.equal(heavies(fight).length, 1, 'its turn throws a heavy blow at once');
  assert.equal(fight.third, 0, 'no endless waves yet');
  boss.busy = 0;
  boss.h = boss.m * 0.3;
  const [third] = step((now += 250));
  assert.deepEqual([third.ph, third.p3, fight.third], [3, 1, 1]);
  assert.equal(heavies(fight).length, 2, 'and the third\'s');
  assert.equal(boss.heavyAt, now + INVASION_HEAVY_EVERY_MS[2], 'its blows come quicker');
});

test('INVASION BLOWS: the slam alone in the first phase; the cleave at a near mark and the charge at a far one in the second; the stomp in the third', () => {
  assert.deepEqual([0, 0.5, 0.99].map((roll) => invasionHeavyPick(1, 3, null, () => roll)), ['slam', 'slam', 'slam']);
  assert.deepEqual(new Set([0, 0.5, 0.99].map((roll) => invasionHeavyPick(2, 3, null, () => roll))), new Set(['slam', 'cleave']), 'a near mark: no charge');
  assert.deepEqual(new Set([0, 0.5, 0.99].map((roll) => invasionHeavyPick(2, 15, null, () => roll))), new Set(['slam', 'charge']), 'a far mark: no cleave');
  assert.ok([0, 0.3, 0.6, 0.99].some((roll) => invasionHeavyPick(3, 3, null, () => roll) === 'stomp'), 'the stomp in the third');
  assert.equal([0, 0.3, 0.6, 0.99].some((roll) => invasionHeavyPick(2, 3, null, () => roll) === 'stomp'), false, 'never before it');
  assert.notEqual(invasionHeavyPick(2, 3, 'slam', () => 0), 'slam', 'never the same twice while another fits');
  // their shapes: the gate's stamps, wound up no shorter than the gate's floor, shorter in the third phase
  for (const key of Object.keys(INVASION_HEAVY)) {
    const one = invasionHeavyStamp(key, 0, 0, 0, 1);
    const three = invasionHeavyStamp(key, 0, 0, 0, 3);
    assert.ok(one.wu >= egWindupFloorMs(one.st) && three.wu >= egWindupFloorMs(three.st), key);
    assert.ok(three.wu <= one.wu && three.wu >= Math.round(INVASION_HEAVY[key].windup * INVASION_PHASE3_WINDUP_X) - 1, key);
  }
  const [kind] = ['slam', 'cleave', 'charge', 'stomp'].map((key) => invasionHeavyStamp(key, 0, 0, 0, 1).st[0]);
  assert.equal(kind, 'd');
  assert.deepEqual(['cleave', 'charge', 'stomp'].map((key) => invasionHeavyStamp(key, 0, 0, 0, 1).st[0]), ['c', 'l', 'r']);
  const stomp = invasionHeavyStamp('stomp', 0, 0, 0, 3).st;
  assert.deepEqual([egInShape(stomp, 0, 1), egInShape(stomp, 0, 8), egInShape(stomp, 0, 20)], [false, true, false], 'safe at its feet and far off');
});

test('INVASION BLOWS: the charge is aimed down a lane at its mark and carries the boss along it as it lands; every blow crosses the wire whole (mutant: the charge laid behind it)', () => {
  const { fight, boss, ann, step } = risen(15, () => 0.99);
  boss.h = boss.m * 0.5;
  const now = INVASION_WAVE_GAP_MS + INVASION_RISE_MS + 10;
  const [said] = step(now);
  const [charge] = heavies(fight);
  assert.equal(charge.a, INVASION_BLOW.charge);
  assert.equal(egInShape(charge.st, ann.x, ann.z), true, 'its lane holds its mark');
  assert.equal(egInShape(charge.st, boss.x, boss.z + 10), false, 'and nothing behind it');
  assert.ok(boss.mv && boss.mv.at === charge.at && boss.mv.tz < boss.z, 'it runs the lane from its landing');
  const row = said.b.find((one) => one[0] === charge.s);
  assert.deepEqual(row, [charge.s, 0, INVASION_BLOW.charge, charge.at, charge.wu, charge.p, charge.st]);
  assert.deepEqual(validInvasionOut(said), said, 'the wire carries it');
  assert.equal(validInvasionOut({ ...said, b: [[...row.slice(0, 6), ['a']]] }), null, 'never a stamp that covers the world');
  assert.equal(validInvasionOut({ ...said, b: [[...row.slice(0, 6), ['d', 0, 0, 500]]] }), null, 'nor one past the bound');
  assert.equal(validInvasionOut({ ...said, ph: 4 }), null, 'nor a fourth phase');
});
