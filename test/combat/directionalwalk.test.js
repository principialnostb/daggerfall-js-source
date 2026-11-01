import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, collectTextKeys, normalizeTextKeys, resetClip, sampleTrack, advanceClip, animVelocity } from '../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT } from '../../src/formats/morrowind/mwSkin.js';
import { poseAssembly, MW_WEAPON_TYPE, MW_UNITS_PER_METER } from '../../src/formats/morrowind/mwFirstPerson.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';
import { loopWindow } from '../../src/combat/leftArmLayer.js';
import { createLowerBodyLayer, lowerBodyBones } from '../../src/combat/lowerBodyLayer.js';
import { createLoopSeam } from '../../src/combat/loopSeam.js';
import { createDirectionalWalkSampler } from '../../src/combat/directionalWalkSampler.js';
import { guardMovementGroup } from '../../src/combat/guardLocomotion.js';
import { createBodyWeight } from '../../src/characters/bodyMotion/bodyWeight.js';
import { createBodyMotion, motionWord } from '../../src/characters/bodyMotion/bodyMotion.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';

const nif = parseNif(readFileSync(new URL('../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
const source = { keys: normalizeTextKeys(collectTextKeys(nif)), trackMap: extractTracks(nif) };
const { keys, trackMap } = source;
const sub = (a, b) => a.map((v, i) => v - b[i]);

function measure(group, hz, filtered) {
  const sk = buildSkeleton(parseNif(retailSkeleton())), accumRoot = accumRootRef(sk, trackMap), weight = createBodyWeight(), motion = createBodyMotion();
  const armed = /2c$/.test(group), base = group.replace(/2c$/, '');
  const type = armed ? MW_WEAPON_TYPE.LongBladeTwoHand : MW_WEAPON_TYPE.None;
  assert.equal(guardMovementGroup(base, type, (g) => !(armed && g === base) && resetClip(keys, g).ok, true).group, group);
  const state = resetClip(keys, group), lower = createLowerBodyLayer({ sampleTrack }), mask = lowerBodyBones(sk);
  const seams = createLoopSeam({ sampleTrack, loopWindow });
  const assembly = { skeleton: sk, fns: { poseSkeleton, skelMats: sm }, pieces: [] };
  const speed = 4.43, animSpeed = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), group), rows = [];
  for (let f = 0; f < hz * 4; f++) {
    const cam = { yaw: 0, move: { speed, grounded: true, running: false,
      forward: base === 'walkback' ? -1 : 0, strafe: base === 'walkleft' ? -1 : base === 'walkright' ? 1 : 0,
      bodyYaw: 0, travel: [0, 0, f * speed / hz] } };
    const word = motionWord({ cam, third: true, rig: { ok: true, settingsSkeleton: 'meshes/base_anim.nif', mwType: type },
      shown: armed, upper: 'WeaponEquipped' });
    advanceClip(state, keys, 1 / hz * weight.moveRate(speed * MW_UNITS_PER_METER / animSpeed, group));
    lower.stepRig(1 / hz, true, null, null, null, null, state, source, null, null);
    motion.step(1 / hz, word);
    weight.stepRig(1 / hz, true, cam, null, type, false, word, state, source, animSpeed);
    poseAssembly(assembly, { tracks: filtered ? lower.tracks(trackMap, mask) : trackMap,
      sampleTrack: filtered ? lower.sampler(sampleTrack) : seams.sampler(sampleTrack, state, source),
      time: state.time, accumRoot, skin: false, motion: weight.slot(motion.slot) });
    if (f >= hz * 2) rows.push({ time: state.time, rate: weight.moveRate(speed * MW_UNITS_PER_METER / animSpeed, group),
      feet: ['bip01 l foot', 'bip01 r foot'].map((n) => assembly.mats.get(sk.byName.get(n)).t),
      knees: ['bip01 l calf', 'bip01 r calf'].map((n) => assembly.mats.get(sk.byName.get(n)).t) });
  }
  const metrics = (field) => {
    const acceleration = [];
    for (let f = 2; f < rows.length; f++) for (let side = 0; side < 2; side++) {
      const v = sub(rows[f][field][side], rows[f - 1][field][side]);
      const old = sub(rows[f - 1][field][side], rows[f - 2][field][side]);
      acceleration.push(Math.hypot(...sub(v, old)) * hz * hz / MW_UNITS_PER_METER);
    }
    return { peak: Math.max(...acceleration), rms: Math.sqrt(acceleration.reduce((s, v) => s + v * v, 0) / acceleration.length) };
  };
  return { rows, feet: metrics('feet'), knees: metrics('knees') };
}

test('DIRECTION-WALK-SMOOTH: actual lower-body composition softens back/side combat steps at 30/60/120 Hz, with global smoothing on or off', () => {
  const previous = getPref('mwClipSmooth');
  try {
    for (const smooth of [false, true]) {
      setPref('mwClipSmooth', smooth);
      for (const hz of [30, 60, 120]) for (const group of ['walkback2c', 'walkleft2c', 'walkright2c', 'walkback']) {
        const old = measure(group, hz, false), next = measure(group, hz, true);
        const limit = group === 'walkback' ? 0.95 : 0.8;
        assert.ok(next.feet.peak < old.feet.peak * limit, `${group} ${hz} Hz: foot acceleration still spikes`);
        assert.ok(next.feet.rms < old.feet.rms * limit, `${group} ${hz} Hz: overall foot roughness remains`);
        assert.ok(next.knees.rms < old.knees.rms * limit, `${group} ${hz} Hz: knee roughness remains`);
        assert.deepEqual(next.rows.map((r) => [r.time, r.rate]), old.rows.map((r) => [r.time, r.rate]), 'do not disguise roughness by slowing the movement clock');
      }
    }
  } finally { setPref('mwClipSmooth', previous); }
});

test('DIRECTION-WALK-SMOOTH: accepted forward gait, runs, ordinary lateral steps, idles and blows keep the exact sampler', () => {
  const layer = createDirectionalWalkSampler({ loopWindow });
  for (const group of ['walkforward', 'walkforward2c', 'walkleft', 'walkright', 'runback2c', 'runleft2c', 'runright2c', 'runforward', 'idle2c', 'weapontwohand']) {
    assert.equal(layer.sampler(sampleTrack, resetClip(keys, group), source), sampleTrack, group);
  }
});

test('DIRECTION-WALK-SMOOTH: neighbours wrap on the movement clock, while entries and overlays retain theirs', () => {
  const state = resetClip(keys, 'walkleft2c'), win = loopWindow(state, keys), seam = createLoopSeam({ sampleTrack, loopWindow });
  const under = seam.sampler(sampleTrack, state, source), layer = createDirectionalWalkSampler({ loopWindow });
  const filtered = layer.sampler(under, state, source), track = trackMap.get('bip01 l calf');
  assert.equal(layer.sampler(under, state, source), filtered, 'reuse the sampler');
  assert.equal(filtered(track, win.start), filtered(track, win.start), 'reuse same-frame samples under the outer filter');
  const a = filtered(track, win.start + 1e-7), b = filtered(track, win.stop - 1e-7);
  const sign = a.rotation.reduce((v, x, i) => v + x * b.rotation[i], 0) < 0 ? -1 : 1;
  assert.ok(Math.hypot(...a.rotation.map((v, i) => v - sign * b.rotation[i])) < 0.02, 'no loop pop');
  assert.deepEqual(filtered(track, win.start - 0.05), under(track, win.start - 0.05), 'entry outside the loop is unfiltered');
  const overlay = { __overlay: track }, read = (t, time) => ({ rotation: [1, 0, 0, 0], translation: [time, 0, 0], scale: 1 });
  assert.deepEqual(layer.sampler(read, state, source)(overlay, win.start + 0.1), read(overlay, win.start + 0.1), 'never filter an overlay on the wrong clock');
});

test('GUARD-DIRECTION-BASE: a shown two-hander walks back and sideways on the accepted free clips; its runs, other weapons and the off switch stay', () => {
  const has = (g) => resetClip(keys, g).ok, two = MW_WEAPON_TYPE.LongBladeTwoHand;
  for (const base of ['walkback', 'walkleft', 'walkright']) {
    assert.deepEqual(guardMovementGroup(base, two, has, true), { group: base, walked: false });
    assert.equal(guardMovementGroup(base, two, (g) => g !== base && has(g), true).group, `${base}2c`, 'no free clip: the armed walk stands');
    assert.equal(guardMovementGroup(base, two, has, false).group, `${base}2c`, 'switch off');
  }
  for (const base of ['runback', 'runleft', 'runright']) assert.equal(guardMovementGroup(base, two, has, true).group, `${base}2c`);
});

test('GUARD-BACK-KNEES: the back stride keeps the stance foot down: no rise and dip before it lifts, the hump its clip does not have', () => {
  const heights = (side) => {
    const sk = buildSkeleton(parseNif(retailSkeleton())), accumRoot = accumRootRef(sk, trackMap), weight = createBodyWeight(), motion = createBodyMotion();
    const state = resetClip(keys, 'walkback'), av = animVelocity(keys, trackMap.get(sk.nodes.get(accumRoot).name.toLowerCase()), 'walkback'), out = [], speed = 4.43;
    const lower = createLowerBodyLayer({ sampleTrack }), mask = lowerBodyBones(sk), assembly = { skeleton: sk, fns: { poseSkeleton, skelMats: sm }, pieces: [] };
    for (let f = 0; f < 240; f++) {
      const cam = { yaw: 0, move: { speed, grounded: true, running: false, forward: -1, strafe: 0, bodyYaw: 0, travel: [0, 0, f * speed / 60] } };
      const word = motionWord({ cam, third: true, rig: { ok: true, settingsSkeleton: 'meshes/base_anim.nif', mwType: MW_WEAPON_TYPE.LongBladeTwoHand }, shown: true, upper: 'WeaponEquipped' });
      advanceClip(state, keys, weight.moveRate(speed * MW_UNITS_PER_METER / av, 'walkback') / 60);
      lower.stepRig(1 / 60, true, null, null, null, null, state, source, null, null);
      motion.step(1 / 60, word); weight.stepRig(1 / 60, true, cam, null, MW_WEAPON_TYPE.LongBladeTwoHand, false, word, state, source, av);
      poseAssembly(assembly, { tracks: lower.tracks(trackMap, mask), sampleTrack: lower.sampler(sampleTrack), time: state.time, accumRoot, skin: false, motion: weight.slot(motion.slot) });
      if (f >= 120) out.push(assembly.mats.get(sk.byName.get(`bip01 ${side} foot`)).t[2] / MW_UNITS_PER_METER * 100);
    }
    return out;
  };
  for (const side of ['l', 'r']) {
    const z = heights(side), floor = Math.min(...z);
    let dip = 0;
    for (let i = 1; i < z.length - 1; i++) {
      if (!(z[i] >= z[i - 1] && z[i] > z[i + 1] && z[i] < floor + 9)) continue;
      let j = i + 1;
      while (j + 1 < z.length && z[j + 1] <= z[j]) j++;
      if (j + 1 < z.length) dip = Math.max(dip, z[i] - z[j]);
    }
    assert.ok(dip < 3, `${side} foot rises and dips ${dip.toFixed(1)} cm in its stance`);
  }
});
