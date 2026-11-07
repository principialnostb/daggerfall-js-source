// An invasion's fight on the relay's brain (net/invasion/invasionBrain.js, through net/bossSeam.js INVASION_SEAM): its
// waves in order, each once the last is dead; every foe's health its own, a blow believed only from the fighter's own
// pose within reach and only as far as the fighter's bucket; the boss after the tenth, taking nothing while it rises;
// the third phase's endless waves; and the fall, which only those whose blow it took have earned.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { INVASION_SEAM, BOSS_SEAM_KEYS } from '../../../src/net/bossSeam.js';
import {
  invasionFoeAt,
  INVASION_RISE_MS,
  INVASION_WAVE_GAP_MS,
  INVASION_BLOW,
  INVASION_SLAM_EVERY_MS,
  INVASION_SHOT_R,
} from '../../../src/net/invasion/invasionBrain.js';
import { validInvasionOut, validInvasionIn, relaySupportsInvasion, INVASION_RELAY_MIN } from '../../../src/net/invasion/invasionWire.js';
import { TOYBOX_EVENT_RELAY_MIN } from '../../../src/net/staffEvent/staffEventLaw.js';
import { RELAY_VERSION } from '../../../src/net/wire.js';
import { invasionWaveSize, INVASION_PHASE3_WAVE, INVASION_BOSS_HP } from '../../../src/net/staffEvent/toyboxEvent.js';
import { INVASION_WAVES, INVASION_FAMILIES } from '../../../src/systems/toybox/toyboxLaw.js';
import { HIT_KINDS, HIT_CAP_X, BUCKET_DEPTH_X, dpsRef } from '../../../src/net/gate/gateBrain.js';

const FAMILY = INVASION_FAMILIES[3];
const EVENT = { id: 'tb12cd34ef', mt: [...FAMILY.kinds], b: FAMILY.boss, hp: INVASION_BOSS_HP };
const rng = () => 0.37;

function fightAt(now = 1000) {
  const fight = INVASION_SEAM.new({ ev: EVENT, sx: 5000, sz: -7000, now });
  INVASION_SEAM.join(fight, 'ann', 'Ann', 30, now);
  INVASION_SEAM.join(fight, 'bob', 'Bob', 30, now);
  return fight;
}
const bodies = [{ sub: 'ann', x: 0, z: 0 }, { sub: 'bob', x: 3, z: 0 }];
/** Every standing foe killed by Ann, each blow from where the foe stands (a full bucket each time). */
function clear(fight, now) {
  for (const foe of [...fight.foes]) {
    fight.players.ann.bucket = 1e9;
    const [x, z] = invasionFoeAt(foe, now);
    while (fight.foes.includes(foe)) assert.ok(INVASION_SEAM.hit(fight, 'ann', 1e6, HIT_KINDS.Melee, { x, z }, now += 200, null, { i: foe.i }) > 0);
  }
  return now;
}

test('INVASION BRAIN: it keeps the boss seam; its words cross the wire\'s own projection', () => {
  assert.deepEqual(Object.keys(INVASION_SEAM).filter((k) => k !== 'name'), [...BOSS_SEAM_KEYS]);
  const fight = fightAt();
  const [st] = INVASION_SEAM.step(fight, 1000 + INVASION_WAVE_GAP_MS, bodies, rng);
  assert.deepEqual(validInvasionOut(st), st, 'the state is what the wire carries');
  assert.equal(validInvasionIn({ k: 'hit', id: EVENT.id, i: 1, d: 0, r: 0 }), null, 'no blow of nothing');
  assert.equal(validInvasionIn({ k: 'hit', id: EVENT.id, i: 1, d: 5, r: 3 }), null, 'no kind past a spell');
  assert.equal(INVASION_RELAY_MIN, TOYBOX_EVENT_RELAY_MIN, 'the relay that keeps a toybox event hosts its invasion');
  assert.equal(relaySupportsInvasion(RELAY_VERSION), true);
  assert.equal(relaySupportsInvasion(`world${INVASION_RELAY_MIN - 1}`), false, 'an older relay is said no word');
});

test('INVASION BRAIN: THE WAVES - each the size of its turn and the family\'s own, the next only once the last is dead; the boss rises after the tenth and takes no blow while it rises', () => {
  const fight = fightAt();
  let now = 1000;
  INVASION_SEAM.step(fight, (now += 500), bodies, rng);
  assert.equal(fight.foes.length, 0, 'a breath before the first');
  for (let k = 0; k < INVASION_WAVES; k++) {
    now += INVASION_WAVE_GAP_MS;
    INVASION_SEAM.step(fight, now, bodies, rng);
    assert.equal(fight.foes.length, invasionWaveSize(k), `wave ${k + 1}`);
    assert.ok(fight.foes.every((foe) => FAMILY.kinds.includes(foe.k)));
    INVASION_SEAM.step(fight, (now += 500), bodies, rng);
    assert.equal(fight.foes.length, invasionWaveSize(k), 'no more while it stands');
    assert.equal(fight.boss, null);
    now = clear(fight, now);
    INVASION_SEAM.step(fight, (now += 250), bodies, rng);
  }
  assert.equal(fight.led.n, Array.from({ length: INVASION_WAVES }, (_, k) => invasionWaveSize(k)).reduce((a, b) => a + b), 'every kill on the ledger');
  INVASION_SEAM.step(fight, (now += INVASION_WAVE_GAP_MS), bodies, rng);
  assert.ok(fight.boss, 'the boss after the tenth');
  assert.deepEqual([fight.boss.k, fight.boss.m, fight.led.bu], [FAMILY.boss, INVASION_BOSS_HP, 1]);
  const [x, z] = invasionFoeAt(fight.boss, now);
  assert.equal(INVASION_SEAM.hit(fight, 'ann', 50, HIT_KINDS.Melee, { x, z }, now + 100, null, { i: 0 }), 0, 'rising: no blow');
  assert.ok(INVASION_SEAM.hit(fight, 'ann', 50, HIT_KINDS.Melee, { x, z }, now + INVASION_RISE_MS + 100, null, { i: 0 }) > 0, 'risen');
});

test('INVASION BRAIN: A BLOW IS A REQUEST - out of reach refused, past the bucket and the one-blow cap clamped, never past the foe\'s health; a stranger\'s and a pose-less blow nothing', () => {
  const fight = fightAt();
  INVASION_SEAM.step(fight, 1000 + INVASION_WAVE_GAP_MS, bodies, rng);
  const foe = fight.foes[0];
  const now = 1000 + INVASION_WAVE_GAP_MS + 10;
  const [x, z] = invasionFoeAt(foe, now);
  assert.equal(INVASION_SEAM.hit(fight, 'ann', 10, HIT_KINDS.Melee, { x: x + 20, z }, now, null, { i: foe.i }), 0, 'a swing from twenty metres');
  assert.equal(INVASION_SEAM.hit(fight, 'ann', 10, HIT_KINDS.Shaft, { x: x + INVASION_SHOT_R + 5, z }, now, null, { i: foe.i }), 0, 'a shot past its reach');
  assert.equal(INVASION_SEAM.hit(fight, 'zed', 10, HIT_KINDS.Melee, { x, z }, now, null, { i: foe.i }), 0, 'a stranger');
  assert.equal(INVASION_SEAM.hit(fight, 'ann', 10, HIT_KINDS.Melee, null, now, null, { i: foe.i }), 0, 'no pose of its own');
  foe.h = foe.m = 1e6;
  const got = INVASION_SEAM.hit(fight, 'ann', 1e6, HIT_KINDS.Melee, { x, z }, now + 1, null, { i: foe.i });
  assert.equal(got, HIT_CAP_X * dpsRef(30), 'one blow is held to the cap');
  let spent = got;
  for (let k = 0; k < 3; k++) spent += INVASION_SEAM.hit(fight, 'ann', 1e6, HIT_KINDS.Melee, { x, z }, now + 2 + k, null, { i: foe.i });
  assert.ok(spent <= BUCKET_DEPTH_X * dpsRef(30) + 1, 'and every blow to the bucket');
  assert.equal(foe.h, 1e6 - spent, 'its health the brain\'s alone');
});

test('INVASION BRAIN: THE BOSS - its slam a disc about its feet while a fighter is near; at a third of its health waves come one after another until it falls; the fall crumbles them and pays those whose blow it took', () => {
  const fight = fightAt();
  fight.wave = INVASION_WAVES;
  let now = 1000 + INVASION_WAVE_GAP_MS;
  INVASION_SEAM.step(fight, now, bodies, rng);
  assert.ok(fight.boss);
  now += INVASION_RISE_MS + INVASION_SLAM_EVERY_MS + 10;
  INVASION_SEAM.step(fight, now, bodies, rng);
  const slam = fight.blows.find((blow) => blow.a === INVASION_BLOW.slam);
  assert.ok(slam, 'it slams');
  assert.deepEqual([slam.st[0], slam.st[3]], ['d', 7], 'a disc of seven metres');
  fight.boss.h = Math.floor(fight.boss.m / 3);
  INVASION_SEAM.step(fight, (now += 250), bodies, rng);
  INVASION_SEAM.step(fight, (now += 250), bodies, rng);
  assert.equal(fight.foes.length, INVASION_PHASE3_WAVE, 'the third phase\'s wave');
  for (let wave = 0; wave < 2; wave++) {
    now = clear(fight, now);
    INVASION_SEAM.step(fight, (now += 250), bodies, rng);
    assert.equal(fight.foes.length, 0);
    INVASION_SEAM.step(fight, (now += INVASION_WAVE_GAP_MS), bodies, rng);
    assert.equal(fight.foes.length, INVASION_PHASE3_WAVE, `and another (${wave + 2})`);
  }
  fight.boss.h = 5;
  fight.players.ann.bucket = 1e9;
  const [x, z] = invasionFoeAt(fight.boss, now);
  INVASION_SEAM.hit(fight, 'ann', 100, HIT_KINDS.Melee, { x, z }, now, null, { i: 0 });
  assert.ok(fight.fell, 'it falls');
  assert.deepEqual([fight.foes.length, fight.boss.dead, fight.led.bk, fight.led.kb], [0, 1, 1, 'ann']);
  assert.equal(INVASION_SEAM.earned(fight, 'ann'), true);
  assert.equal(INVASION_SEAM.earned(fight, 'bob'), false, 'a fighter whose blow it never took earns nothing');
  assert.deepEqual(INVASION_SEAM.step(fight, now + 250, bodies, rng), [], 'a fallen fight says nothing more');
});
