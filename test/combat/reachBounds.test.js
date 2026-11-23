import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFpArm } from '../../src/combat/fpArm.js';
import { sampleTrack } from '../../src/formats/morrowind/mwAnim.js';
import { clipUnionBounds, distinctReachTimes, poseAssembly, sweepShadowOf } from '../../src/formats/morrowind/mwFirstPerson.js';
import { fixtureBodyDeps } from '../fixtures/mw/bodyRig.mjs';

test('a world-camera body retains the geometry and normals of each posed piece', async () => {
  const build = firstPersonLens => buildFpArm({ race: 'fprace', deps: fixtureBodyDeps(), reachSweep: false, firstPersonLens });
  const reference = await build(true);
  const npc = await build(false);
  assert.ok(reference.ok && npc.ok && reference.third.ok && npc.third.ok);
  for (const part of ['arm', 'third']) {
    const a = part === 'arm' ? reference.arm : reference.third.arm;
    const b = part === 'arm' ? npc.arm : npc.third.arm;
    assert.deepEqual(b.bounds, a.bounds);
    assert.deepEqual(b.pieces.map(p => [p.slot, p.positions, p.normals, p.indices]), a.pieces.map(p => [p.slot, p.positions, p.normals, p.indices]));
  }
});

test('reducing repeated or clamped animation samples gives identical skinned clip bounds', async () => {
  const rig = await buildFpArm({ race: 'fprace', deps: fixtureBodyDeps(), reachSweep: false });
  assert.ok(rig.ok);
  const times = [-900, -800, 0, .1, .13, .5, .5, 1, 5, 700, 800];
  const distinct = distinctReachTimes(rig.tracks, times);
  assert.ok(distinct.length < times.length);
  const union = entries => {
    const arm = sweepShadowOf(rig.arm);
    return clipUnionBounds(arm, time => poseAssembly(arm, { tracks: rig.tracks, sampleTrack, time, accumRoot: rig.accumRoot }), entries);
  };
  assert.deepEqual(union(distinct), union(times));
});

test('Euler, quaternion, translation and scale channels all contribute to the sample window', () => {
  const group = (first, last) => ({ keys: [{ time: first }, { time: last }] });
  for (const track of [{ rotationKeys: group(-4, 6).keys }, { xyzRotations: [group(-4, 6)] }, { translations: group(-4, 6) }, { scales: group(-4, 6) }]) {
    assert.deepEqual(distinctReachTimes(new Map([['bone', track]]), [-9, -8, 0, 3, 9, 12]), [-4, 0, 3, 6]);
  }
});

