// Real bundled MAO clips on the retail hierarchy, not hand-authored joint poses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys, normalizeTextKeys, extractTracks, resetClip, sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { bodyOf, at } from '../../../src/characters/bodyMotion/bodyKit.js';
import { motionWord } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { createGuardStand, guardStands, GUARD_STAND, FIST_BOUNCE } from '../../../src/characters/bodyMotion/guardStand.js';

const nif = parseNif(readFileSync(new URL('../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const word = (type, move = {}, extra = {}) => motionWord({ cam: { move: { speed: 0, forward: 0, grounded: true, ...move } }, third: true,
  rig: { ok: true, settingsSkeleton: 'meshes/base_anim.nif', mwType: type }, shown: true, upper: 'WeaponEquipped', ...extra });

test('GUARD-STAND: a drawn stance weapon standing on the ground stands in the stance - the fists too; a bow, a sheathed blade, a body travelling or in the air does not', () => {
  for (const type of [MW_WEAPON_TYPE.LongBladeOneHand, MW_WEAPON_TYPE.LongBladeTwoHand, MW_WEAPON_TYPE.BluntOneHand, MW_WEAPON_TYPE.HandToHand]) assert.equal(guardStands(word(type)), true, String(type));
  assert.equal(guardStands(word(MW_WEAPON_TYPE.MarksmanBow)), false);
  assert.equal(guardStands(word(MW_WEAPON_TYPE.LongBladeOneHand, { speed: 4.4, forward: 1 })), false, 'a walk is the walk\'s own pose');
  assert.equal(guardStands(word(MW_WEAPON_TYPE.LongBladeOneHand, { grounded: false })), false);
  assert.equal(guardStands(motionWord({ cam: { move: { speed: 0, grounded: true } }, third: true, rig: { ok: true, settingsSkeleton: 'meshes/base_anim.nif', mwType: MW_WEAPON_TYPE.LongBladeOneHand }, shown: false, upper: 'None' })), false);
});

/** A stand played through the layer: the hips' height over the lower ankle in legs, and how far the ankles moved. */
function stand(group, type, seconds = 2, move = {}, config = GUARD_STAND) {
  const sk = buildSkeleton(parseNif(retailSkeleton())), body = bodyOf(sk, GRAPH_ROOT, sm), accumRoot = accumRootRef(sk, trackMap);
  const state = resetClip(keys, group, { loopFallback: true }), layer = createGuardStand(config);
  assert.ok(state.ok, group);
  let level = 0, clip = 0, slid = 0, knee = 0;
  for (let f = 0; f < seconds * 60; f++) {
    const t = state.startTime + ((f / 60) % Math.max(0.05, state.stopTime - state.startTime));
    const pose = poseSkeleton(sk, trackMap, sampleTrack, t, { accumRoot }), before = sm(sk, pose, GRAPH_ROOT);
    layer.step(1 / 60, true, word(type, move));
    layer.apply(sk, pose, GRAPH_ROOT, sm);
    const after = sm(sk, pose, GRAPH_ROOT);
    const read = (m) => { const floor = Math.min(at(m, body.bones.L.foot)[2], at(m, body.bones.R.foot)[2]); return ((at(m, body.bones.L.thigh)[2] + at(m, body.bones.R.thigh)[2]) / 2 - floor) / body.leg; };
    level = read(after); clip = read(before);
    for (const side of ['L', 'R']) slid = Math.max(slid, dist(at(before, body.bones[side].foot), at(after, body.bones[side].foot)));
    const b = body.bones.L, a = at(after, b.thigh), k = at(after, b.calf), n = at(after, b.foot);
    knee = (dist(a, k) + dist(k, n)) - dist(a, n);   // how far the leg is folded
  }
  return { level, clip, slid, knee, weight: layer.weight() };
}

test('GUARD-STAND: the one-hander and the fists stand at the two-hander\'s level - the hips lowered, the ankles where the clip put them, the knees bent - and never lifted', () => {
  for (const [group, type] of [['idle1h', MW_WEAPON_TYPE.LongBladeOneHand], ['idlehh', MW_WEAPON_TYPE.HandToHand], ['idle2c', MW_WEAPON_TYPE.LongBladeTwoHand]]) {
    const r = stand(group, type);
    const want = type === MW_WEAPON_TYPE.LongBladeOneHand ? GUARD_STAND.narrow : GUARD_STAND.level;   // The fists stand on the two-hander's wide feet
    assert.ok(r.clip > want + 0.02, `${group}: the clip stands at ${r.clip.toFixed(3)}`);
    assert.ok(r.level <= want + 0.004 && r.level > want - 0.014, `${group}: stood at ${r.level.toFixed(3)}`);   // STAND-LIFE breathes under the level
    assert.ok(r.slid < 0.05, `${group}: an ankle moved ${r.slid.toFixed(3)} units`);
    assert.ok(r.knee > 0.5, `${group}: the knees yield (${r.knee.toFixed(2)})`);
  }
  // a stance already lower than the level asked is left as it is
  const low = stand('idle1h', MW_WEAPON_TYPE.LongBladeOneHand, 1, {}, { ...GUARD_STAND, level: 1.5, narrow: 1.5 });
  assert.ok(low.clip < 1.5 && Math.abs(low.level - low.clip) < 1e-6 && low.slid === 0, 'never lifted');
});

test('GUARD-STAND: travelling eases it off within its ease, and a bow never takes it', () => {
  assert.equal(stand('idle1h', MW_WEAPON_TYPE.MarksmanBow).weight, 0);
  const sk = buildSkeleton(parseNif(retailSkeleton())), layer = createGuardStand();
  for (let f = 0; f < 60; f++) layer.step(1 / 60, true, word(MW_WEAPON_TYPE.LongBladeOneHand));
  assert.ok(layer.weight() > 0.95);
  const pose = poseSkeleton(sk, trackMap, sampleTrack, resetClip(keys, 'idle1h').startTime, { accumRoot: accumRootRef(sk, trackMap) });
  const mid = () => sm(sk, new Map(pose), GRAPH_ROOT);
  let last = null, leap = 0;
  for (let f = 0; f < 60; f++) {
    layer.step(1 / 60, true, word(MW_WEAPON_TYPE.LongBladeOneHand, { speed: 4.4, forward: 1 }));
    const p = new Map(pose); layer.apply(sk, p, GRAPH_ROOT, sm);
    const z = sm(sk, p, GRAPH_ROOT).get(bodyOf(sk, GRAPH_ROOT, sm).bones.pelvis).t[2];
    if (last != null) leap = Math.max(leap, Math.abs(z - last));
    last = z;
  }
  assert.ok(layer.weight() < 0.02, 'off within a second of the first step');
  assert.ok(leap < 0.35, `the hips rise smoothly, ${leap.toFixed(3)} units a frame at most`);
  assert.ok(mid());
});

test('STAND-LIFE: the lowered hips of a one-hander breathe and shift from foot to foot, the ankles still; the two-hander is left alone', () => {
  const range = (group, type) => { const zs = [], xs = []; for (const sec of [1, 1.5, 2, 2.6, 3.2, 4, 4.6, 5.3]) { const r = stand(group, type, sec); zs.push(r.level); xs.push(r.slid); } return { z: Math.max(...zs) - Math.min(...zs), slid: Math.max(...xs) }; };
  const hh = range('idle1h', MW_WEAPON_TYPE.LongBladeOneHand), two = range('idle2c', MW_WEAPON_TYPE.LongBladeTwoHand);
  assert.ok(hh.z > 0.004 && hh.z < 0.012, `the one-hander's hips breathe ${hh.z.toFixed(4)} of a leg`);
  assert.ok(hh.slid < 0.05, 'the ankles stay');
  assert.ok(two.z < 0.002, `the two-hander's level holds (${two.z.toFixed(4)})`);
});

test('FIST-BOUNCE: on the two-hander\'s legs the fists\' knees give and the weight shifts while they wait - quiet under a punch, the ankles still; the two-hander itself is left alone', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton())), body = bodyOf(sk, GRAPH_ROOT, sm), accumRoot = accumRootRef(sk, trackMap);
  const state = resetClip(keys, 'idle2c', { loopFallback: true });
  const play = (type, extra = {}) => {
    const layer = createGuardStand(); let lo = Infinity, hi = -Infinity, slid = 0;
    for (let f = 0; f < 240; f++) {
      const pose = poseSkeleton(sk, trackMap, sampleTrack, state.startTime, { accumRoot }), before = sm(sk, pose, GRAPH_ROOT);
      layer.step(1 / 60, true, { ...word(type), ...extra });
      layer.apply(sk, pose, GRAPH_ROOT, sm);
      const after = sm(sk, pose, GRAPH_ROOT), z = at(after, body.bones.pelvis)[2] / body.leg;
      if (f > 60) { lo = Math.min(lo, z); hi = Math.max(hi, z); for (const side of ['L', 'R']) slid = Math.max(slid, dist(at(before, body.bones[side].foot), at(after, body.bones[side].foot))); }
    }
    return { range: hi - lo, slid };
  };
  const fists = play(MW_WEAPON_TYPE.HandToHand), two = play(MW_WEAPON_TYPE.LongBladeTwoHand);
  assert.ok(fists.range > FIST_BOUNCE.breath * 0.8 && fists.range < FIST_BOUNCE.breath * 1.3, `the fists' hips bounce ${fists.range.toFixed(4)} of a leg`);
  assert.ok(fists.slid < 0.05, 'the ankles stay');
  assert.ok(two.range < 0.002, 'the two-hander is as it was');
  const punching = play(MW_WEAPON_TYPE.HandToHand, { blow: { type: 'chop', hand: 'R', section: 'release', progress: 0.5, strength: 1 } });
  assert.ok(punching.range < 0.002, 'quiet under a punch');
});
