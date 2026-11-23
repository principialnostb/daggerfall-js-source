import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openAsBlob, readFileSync } from 'node:fs';
import { installedClip, overhaulClip } from '../../fixtures/mw/animationClip.mjs';
import { MwBsaFile } from '../../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, collectTextKeys, normalizeTextKeys, resetClip, sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { GRAPH_ROOT, accumRootRef, poseSkeleton, skeletonSpaceMatrices } from '../../../src/formats/morrowind/mwSkin.js';
import { assembleFirstPersonArm, MW_WEAPON_TYPE, poseAssembly } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { trunkOf } from '../../../src/characters/bodyMotion/carry.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const bones = ['bip01 pelvis', 'bip01 spine2', 'bip01 l hand', 'bip01 r hand', 'weapon bone'];
const packed = process.env.DFO_TEST_EMC_PACK;


async function checkClip(skeletonBytes, clip, group, options, attack, aliases = []) {
  const rig = await assembleFirstPersonArm({ skeletonBytes, parts: [] });
  assert.ok(rig.skeleton, rig.error);
  const tracks = extractTracks(clip);
  for (const [original, bone] of aliases) {
    assert.ok(tracks.has(original), original);
    tracks.set(bone, tracks.get(original));
  }
  const keys = normalizeTextKeys(collectTextKeys(clip));
  const range = resetClip(keys, group, options);
  assert.ok(range.ok && range.stopTime > range.startTime, group);
  const root = accumRootRef(rig.skeleton, tracks);
  const motion = createBodyMotion();
  const weapon = group === 'weapontwohand' ? MW_WEAPON_TYPE.LongBladeTwoHand : MW_WEAPON_TYPE.LongBladeOneHand;
  if (attack) {
    for (let i = 0; i < 90; i++) {
      motion.step(1 / 60, sceneInput({ weapon }));
      poseAssembly(rig, { tracks, sampleTrack, time: range.startTime, accumRoot: root, skin: false, motion: motion.slot });
    }
    assert.ok(rig.motionFit, 'the same skeleton accepts a held-weapon pose before the strike');
  }
  const previous = new Map();
  let moving = false;
  for (let frame = 0; frame < 45; frame++) {
    const phase = frame / 45;
    const time = range.startTime + phase * (range.stopTime - range.startTime);
    const raw = poseSkeleton(rig.skeleton, tracks, sampleTrack, time, { accumRoot: root });
    const expected = skeletonSpaceMatrices(rig.skeleton, raw, GRAPH_ROOT);
    if (attack) motion.step(1 / 60, sceneInput({ weapon, speed: 4, forward: 1,
      blow: { type: attack, section: 'release', progress: phase, hand: 'R', strength: 1 } }));
    poseAssembly(rig, { tracks, sampleTrack, time, accumRoot: root, skin: false, motion: attack ? motion.slot : null });
    if (frame < 20) continue;
    assert.equal(rig.runFit, null);
    assert.equal(rig.motionFit, null);
    for (const name of bones) {
      const ref = rig.skeleton.byName.get(name);
      if (ref == null && name === 'weapon bone') continue;
      assert.ok(ref != null, name);
      const wanted = expected.get(ref);
      assert.deepEqual(rig.mats.get(ref), wanted, group + ' ' + name + ' frame ' + frame);
      const last = previous.get(name);
      if (last && wanted.a.some((v, i) => Math.abs(v - last.a[i]) > 1e-5)) moving = true;
      previous.set(name, wanted);
    }
  }
  return moving;
}

test('a full run carries a two-hander with its authored shoulder turn and leaves a paired carry level', () => {
  const gait = { run: 1 };
  const two = trunkOf('two', gait);
  assert.ok(Math.abs(two.yaw + 18 * Math.PI / 180) < 1e-6);
  assert.ok(Math.abs(two.pitch - 4 * Math.PI / 180) < 1e-6);
  assert.deepEqual(trunkOf('dual', gait), { yaw: 0, pitch: 0, square: 0, collar: 0 });
});

test('a free runner leaves the sampled whole-body pose intact at full motion weight', async () => {
  const rig = await assembleFirstPersonArm({ skeletonBytes: retailSkeleton(), parts: [] });
  const motion = createBodyMotion();
  const word = sceneInput({ speed: 8, forward: 1, running: true });
  const ref = rig.skeleton.byName.get('bip01 pelvis');
  const raw = new Map([[ref, { ...rig.skeleton.nodes.get(ref).rest, translation: [3, 4, 5] }]]);
  for (let i = 0; i < 90; i++) motion.step(1 / 60, word);
  assert.ok(motion.weight() > 0.99);
  const pose = new Map(raw);
  assert.equal(motion.slot(rig.skeleton, pose, GRAPH_ROOT, rig.fns.skelMats), null);
  assert.deepEqual(pose, raw);
});

test('a drawn bow keeps both hands on its sampled grip while the gait clock advances', async () => {
  const rig = await assembleFirstPersonArm({ skeletonBytes: retailSkeleton(), parts: [] });
  const motion = createBodyMotion();
  const word = sceneInput({ weapon: MW_WEAPON_TYPE.MarksmanBow, shown: true, speed: 8, forward: 1, running: true });
  const names = ['bip01 l hand', 'bip01 r hand', 'bip01 spine2'];
  const zero = rig.fns.skelMats(rig.skeleton, new Map(), GRAPH_ROOT);
  for (let i = 0; i < 120; i++) {
    motion.step(1 / 60, word);
    poseAssembly(rig, { motion: motion.slot, skin: false });
    if (i < 60) continue;
    assert.ok(motion.weight() > 0.99);
    assert.deepEqual(motion.status().arms, { L: 0, R: 0 });
    for (const name of names) {
      const ref = rig.skeleton.byName.get(name);
      assert.deepEqual(rig.mats.get(ref), zero.get(ref), name);
    }
  }
  assert.ok(motion.stride().move > 0.9);
});

test('the retail skeleton preserves authored grip and trunk transforms after attack entry', async () => {
  const clip = parseNif(readFileSync(new URL('../../fixtures/mw/armfpweapon.kf', import.meta.url)));
  const aliases = [['right upper arm', 'bip01 r upperarm'], ['left upper arm', 'bip01 l upperarm'],
    ['right forearm', 'bip01 r forearm'], ['left forearm', 'bip01 l forearm']];
  assert.ok(await checkClip(retailSkeleton(), clip, 'weapononehand', { start: 'chop start', stop: 'chop small follow stop' }, 'chop', aliases));
});

test('installed EMC run and attack tracks move the retail camera rigs along their authored trajectories', { skip: !packed }, async () => {
  const bsa = await MwBsaFile.open(await openAsBlob(process.env.DFO_TEST_MORROWIND_BSA));

  const full = await bsa.load('meshes/base_anim.nif');
  const first = await bsa.load('meshes/xbase_anim.1st.nif');
  const moves = installedClip('Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/x1hMovement.kf');
  assert.ok(await checkClip(first, moves, 'runforward1h', {}, null));
  const melee = installedClip(overhaulClip);
  for (const attack of ['slash', 'chop', 'thrust']) {
    assert.ok(await checkClip(full, melee, 'weapontwohand', { start: attack + ' start', stop: attack + ' small follow stop' }, attack), attack);
  }
});
