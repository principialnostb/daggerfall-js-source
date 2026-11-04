import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movementPhaseTime } from '../../src/combat/movementContinuity.js';
import { guardMovementGroup } from '../../src/combat/guardLocomotion.js';
import { MW_WEAPON_TYPE, MW_UNITS_PER_METER } from '../../src/formats/morrowind/mwFirstPerson.js';

const keys = (group, start, left, right) => [
  { time: start, text: `${group}: start` }, { time: left, text: 'soundgen: left' },
  { time: right, text: 'soundgen: right' }, { time: start + 1, text: `${group}: stop` },
];
test('GUARD-CONTINUITY: map the supporting foot interval, including clips whose left/right events have opposite phases', () => {
  const a = { group: 'walkforward2c', startTime: 0, stopTime: 1, time: 0.45 };
  const b = { group: 'runforward', startTime: 10, stopTime: 11, time: 10 };
  assert.ok(Math.abs(movementPhaseTime(a, keys(a.group, 0, 0.2, 0.7), b, keys(b.group, 10, 10.6, 10.1)) - 10.85) < 1e-10);
  a.time = 0.95;
  assert.ok(Math.abs(movementPhaseTime(a, keys(a.group, 0, 0.2, 0.7), b, keys(b.group, 10, 10.6, 10.1)) - 10.35) < 1e-10);
  assert.equal(movementPhaseTime(a, [], { ...b, group: 'jump' }, []), null);
});
test('GUARD-CONTINUITY: missing foot markers keep normalized phase instead of resetting to the new clip start', () => {
  const a = { group: 'walkforward2c', startTime: 0, stopTime: 1, time: 0.45 };
  const b = { group: 'runforward', startTime: 10, stopTime: 11, time: 10 };
  assert.ok(Math.abs(movementPhaseTime(a, [], b, []) - 10.45) < 1e-10);
});
test('GUARD-CONTINUITY: only enabled two-handed forward locomotion chooses the accepted free gait', () => {
  const has = (g) => ['runforward', 'runforward2c', 'runforward1h', 'walkforward', 'walkforward2c', 'walkforward1h'].includes(g);
  assert.deepEqual(guardMovementGroup('runforward', MW_WEAPON_TYPE.LongBladeTwoHand, has, true), { group: 'runforward', walked: false });
  assert.equal(guardMovementGroup('runforward', MW_WEAPON_TYPE.LongBladeTwoHand, has, false).group, 'runforward2c');
  assert.equal(guardMovementGroup('runforward', MW_WEAPON_TYPE.LongBladeOneHand, has, true).group, 'runforward1h');
  assert.equal(guardMovementGroup('walkforward', MW_WEAPON_TYPE.LongBladeTwoHand, has, true).group, 'walkforward');
  assert.equal(guardMovementGroup('walkforward', MW_WEAPON_TYPE.LongBladeTwoHand, has, false).group, 'walkforward2c');
  assert.equal(guardMovementGroup('walkforward', MW_WEAPON_TYPE.LongBladeTwoHand, (g) => g === 'walkforward2c', true).group, 'walkforward2c');
  assert.equal(guardMovementGroup('walkforward', MW_WEAPON_TYPE.LongBladeOneHand, has, true).group, 'walkforward1h');
  assert.equal(guardMovementGroup('runforward', MW_WEAPON_TYPE.LongBladeTwoHand, (g) => g === 'runforward2c', true).group, 'runforward2c');
});


import { readFileSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, collectTextKeys, normalizeTextKeys, resetClip, sampleTrack, advanceClip, animVelocity } from '../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices, accumRootRef, GRAPH_ROOT } from '../../src/formats/morrowind/mwSkin.js';
import { poseAssembly } from '../../src/formats/morrowind/mwFirstPerson.js';
import { createLowerBodyLayer, lowerBodyBones } from '../../src/combat/lowerBodyLayer.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';

test('GUARD-CONTINUITY: the actual pose compositor preserves the live movement legs during a whole-body weapon fade', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const nif = parseNif(readFileSync(new URL('../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
  const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif), source = { keys, trackMap };
  const movement = resetClip(keys, 'runforward');
  assert.ok(movement.ok);
  movement.time = movement.startTime + 0.5;
  const layer = createLowerBodyLayer({ sampleTrack });
  for (let i = 0; i < 90; i++) layer.step(1 / 60, { third: true, movement, movementTracks: trackMap, movementSource: source });
  const accumRoot = accumRootRef(sk, trackMap), mask = lowerBodyBones(sk);
  const baseTime = keys.find((k) => k.text.startsWith('weapontwohand:'))?.time ?? 0;
  const from = poseSkeleton(sk, trackMap, sampleTrack, movement.startTime, { accumRoot });
  const wrapped = layer.tracks(trackMap, mask), sampler = layer.sampler(sampleTrack);
  const expected = poseSkeleton(sk, wrapped, sampler, baseTime, { accumRoot });
  const assembly = { skeleton: sk, fns: { poseSkeleton, skelMats: skeletonSpaceMatrices }, pieces: [] };
  poseAssembly(assembly, { tracks: wrapped, sampleTrack: sampler, time: baseTime, accumRoot, blendFrom: from, blendWeight: 0.03, skin: false });
  for (const [ref, node] of sk.nodes) if (wrapped.get(node.name.toLowerCase())?.__poseOwner) {
    assert.deepEqual(assembly.pose.get(ref), expected.get(ref), node.name + ' must not be faded toward the frozen weapon snapshot');
  }
  const upper = sk.byName.get('bip01 spine1');
  assert.notDeepEqual(assembly.pose.get(upper).rotation, expected.get(upper).rotation, 'the upper-body weapon fade still works');
});


test('GUARD-CONTINUITY: the layer transfers real MAO support phase and advances the outgoing clip during a walk/run crossfade', () => {
  const nif = parseNif(readFileSync(new URL('../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
  const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif), source = { keys, trackMap };
  const sampled = [];
  const tracked = (track, time) => { sampled.push(time); return sampleTrack(track, time); };
  const layer = createLowerBodyLayer({ sampleTrack: tracked });
  const walk = resetClip(keys, 'walkforward2c');
  const dt = 1 / 60, rate = 1.8;
  for (let i = 0; i < 90; i++) {
    advanceClip(walk, keys, dt * rate);
    layer.step(dt, { third: true, movement: walk, movementTracks: trackMap, movementSource: source });
  }
  const outgoing = { ...walk }; advanceClip(outgoing, keys, dt * rate);
  const run = resetClip(keys, 'runforward');
  const expected = movementPhaseTime(outgoing, keys, run, keys);
  layer.step(dt, { third: true, action: {}, movement: run, movementTracks: trackMap, movementSource: source });
  assert.ok(Math.abs(run.time - expected) < 1e-8, 'the actual incoming state receives the support phase');
  const tracks = layer.tracks(trackMap, new Set(['bip01 l calf']));
  sampled.length = 0;
  layer.sampler(tracked)(tracks.get('bip01 l calf'), 0);
  assert.ok(sampled.some((t) => Math.abs(t - outgoing.time) < 1e-8), 'the outgoing clock advances instead of freezing at its last frame');
});


import { createBodyWeight } from '../../src/characters/bodyMotion/bodyWeight.js';
import { createBodyMotion, motionWord } from '../../src/characters/bodyMotion/bodyMotion.js';

test('RUNNING-BLOW-PIPELINE: real moving legs stay identical with and without repeated upper-body attacks', () => {
  const nif = parseNif(readFileSync(new URL('../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
  const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif), source = { keys, trackMap };
  const attackStart = keys.find((k) => k.text === 'weapontwohand: chop start');
  assert.ok(attackStart, 'the fixture uses a real two-handed attack window');
  const armour = [102, 103, 104, 105, 106, 107, 108].map((templateIndex) => ({ kind: 'armor', templateIndex, material: 0 }));
  for (const speed of [2.5, 5.8, 8.1]) for (const dt of [1 / 30, 1 / 60]) {
    const sk = buildSkeleton(parseNif(retailSkeleton())), accumRoot = accumRootRef(sk, trackMap);
    const make = () => ({ lower: createLowerBodyLayer({ sampleTrack }), weight: createBodyWeight(), motion: createBodyMotion(),
      movement: resetClip(keys, 'runforward'), assembly: { skeleton: sk, fns: { poseSkeleton, skelMats: skeletonSpaceMatrices }, pieces: [] } });
    const pair = [make(), make()], mask = lowerBodyBones(sk);
    const animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), 'runforward');
    for (let f = 0; f < 150; f++) {
      const phase = (f - 60) % 60, attacking = f >= 60;
      const upper = phase < 15 ? 'AttackWindUp' : phase < 25 ? 'AttackRelease' : 'AttackEnd';
      const progress = phase < 15 ? phase / 14 : phase < 25 ? (phase - 15) / 9 : (phase - 25) / 34;
      for (let i = 0; i < pair.length; i++) {
        const b = pair[i], strike = i === 1 && attacking;
        const cam = { yaw: 0, move: { speed, running: true, forward: 1, strafe: 0, grounded: true, bodyYaw: 0, travel: [0, 0, f * speed * dt] } };
        advanceClip(b.movement, keys, dt * b.weight.moveRate(speed * MW_UNITS_PER_METER / animSpeed, 'runforward'));
        b.lower.stepRig(dt, true, null, strike ? {} : null, null, null, b.movement, source, null, null);
        const word = motionWord({ cam, third: true, rig: { ok: true, settingsSkeleton: 'meshes/base_anim.nif', mwType: MW_WEAPON_TYPE.LongBladeTwoHand },
          shown: true, upper: strike ? upper : 'WeaponEquipped', attackType: strike ? 'chop' : null, hand: 'R', progress });
        assert.ok(word.on && word.running);
        b.motion.step(dt, word);
        b.weight.stepRig(dt, true, cam, armour, word.mwType, false, word, b.movement, source, animSpeed);
        poseAssembly(b.assembly, { tracks: b.lower.tracks(trackMap, mask), sampleTrack: b.lower.sampler(sampleTrack),
          time: strike ? attackStart.time + 0.3 * progress : b.movement.time, accumRoot, skin: false,
          blendFrom: strike ? b.assembly.shownPose : null, blendWeight: strike ? 0.1 : 1, motion: b.weight.slot(b.motion.slot) });
      }
      if (attacking) for (const name of ['bip01 pelvis', 'bip01 l thigh', 'bip01 r thigh', 'bip01 l calf', 'bip01 r calf', 'bip01 l foot', 'bip01 r foot']) {
        const ref = sk.byName.get(name), a = pair[0].assembly.mats.get(ref), b = pair[1].assembly.mats.get(ref);
        assert.ok([...a.a, ...a.t].every((v, j) => Math.abs(v - [...b.a, ...b.t][j]) < 1e-5), `${name}: attack changed running legs at ${speed} m/s, frame ${f}`);
      }
    }
  }
});
