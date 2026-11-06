import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, poseSkeleton, blendPoseMaps, skeletonSpaceMatrices as sm, GRAPH_ROOT, injectSkeletonNodes, accumRootRef } from '../../../src/formats/morrowind/mwSkin.js';
import { collectTextKeys, normalizeTextKeys, extractTracks, resetClip } from '../../../src/formats/morrowind/mwAnim.js';
import { sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { offWeaponBoneAddon } from '../../../src/combat/twoHands/mirrorRig.js';
import { bindPart } from '../../../src/formats/morrowind/mwCharacter.js';
import { createBodyMotion, sceneInput } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { clearArms } from '../../../src/characters/bodyMotion/armClearance.js';
import { balanceForearm, wristPole, ARM_ANATOMY, heldPoseAnatomy } from '../../../src/characters/bodyMotion/armAnatomy.js';
import { rotAxisAngle, solveReach } from '../../../src/combat/climbRig.js';
import { bodyOf, mul, apply, turnOf, algebra } from '../../../src/characters/bodyMotion/bodyKit.js';
import { loopWindow } from '../../../src/combat/leftArmLayer.js';

const path = (p) => new URL(`../../../${p}`, import.meta.url);
const pack = 'Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/';
const skin = 'Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/bb/';
const available = [pack + 'Xbase_anim.kf', pack + 'Xbase_anim_female.kf', skin + 'bb_skinf_he.nif', skin + 'bb_skinm_he.nif'].every((p) => existsSync(path(p)));
const source = (female) => {
  const nif = parseNif(readFileSync(path(pack + (female ? 'Xbase_anim_female.kf' : 'Xbase_anim.kf'))));
  return { keys: normalizeTextKeys(collectTextKeys(nif)), trackMap: extractTracks(nif) };
};
const det = (a) => a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);

function rig(female, weapon) {
  const nif = parseNif(retailSkeleton()), sk = buildSkeleton(nif);
  injectSkeletonNodes(sk, offWeaponBoneAddon(sk, GRAPH_ROOT, sm, nif));
  const body = bodyOf(sk, GRAPH_ROOT, sm), rest = sm(sk, new Map(), GRAPH_ROOT), motion = createBodyMotion();
  const sources = female ? [source(true), source(false)] : [source(false)];
  const part = bindPart(sk, parseNif(readFileSync(path(skin + (female ? 'bb_skinf_he.nif' : 'bb_skinm_he.nif')))));
  const batches = part.skinned.filter((b) => /Wrist|Forearm/.test(b.name)).map((batch) => {
    const vertices = Array.from({ length: batch.positions.length / 3 }, () => ({ weights: [], rest: Array(9).fill(0) }));
    for (const bone of batch.skin.bones) if (bone.ref != null) {
      const r = mul(rest.get(bone.ref).a, bone.invBind.a);
      for (let k = 0; k < bone.indices.length; k++) {
        const v = vertices[bone.indices[k]], w = bone.weights[k];
        v.weights.push({ bone, w });
        for (let j = 0; j < 9; j++) v.rest[j] += r[j] * w;
      }
    }
    return { name: batch.name, vertices: vertices.filter((v) => v.weights.filter(({ w }) => w > 0.05).length >= 2) };
  });
  const elbowTurns = { L: 0, R: 0 };
  const pick = (group, options = {}) => {
    for (const s of sources) {
      const state = resetClip(s.keys, group, { loopFallback: true, loopCount: Infinity, ...options });
      if (state.ok) return { ...s, state, accumRoot: accumRootRef(sk, s.trackMap) };
    }
    throw Error(`Missing ${group}`);
  };
  return { body, sk, pick, step(raw, input, dt) {
    const pose = new Map(raw), original = sm(sk, raw, GRAPH_ROOT);
    motion.step(dt, sceneInput({ weapon, kind: female ? 'female' : 'male', ...input }));
    const report = motion.apply(sk, pose, GRAPH_ROOT, sm);
    clearArms(sk, pose, GRAPH_ROOT, sm, { previous: elbowTurns, dt, held: report?.armAnatomy });
    const mats = sm(sk, pose, GRAPH_ROOT);
    if (!report && input.blow?.section) {
      assert.ok(heldPoseAnatomy(pose), 'attack frames must retain the shared forearm correction');
      for (const ref of [body.bones.L.hand, body.bones.R.hand, sk.byName.get('weapon bone')]) {
        const before = original.get(ref), after = mats.get(ref);
        for (let i = 0; i < 3; i++) assert.ok(Math.abs(before.t[i] - after.t[i]) < 0.01, `attack grip moved ${after.t[i]-before.t[i]} at ${ref} component ${i}`);
        for (let i = 0; i < 9; i++) assert.ok(Math.abs(before.a[i] - after.a[i]) < 1e-4, 'attack weapon/hand orientation changed');
      }
    }
    if (report?.armAnatomy) {
      const { sub, cross, norm, dot, len } = algebra;
      for (const side of ['L', 'R']) {
        const b = body.bones[side], plane = cross(sub(mats.get(b.fore).t, mats.get(b.upper).t), sub(mats.get(b.hand).t, mats.get(b.fore).t));
        if (len(plane) > 1e-5) assert.ok(dot(norm(apply(turnOf(mats, b.upper), body.armHinge[side].upper)), norm(plane)) > 0.999,
          'forearm pronation must not undo the upper-arm hinge fix');
      }
      const r = mats.get(sk.byName.get('weapon bone')), l = mats.get(sk.byName.get('weapon bone left'));
      const axis = [r.a[1], r.a[4], r.a[7]], size = Math.hypot(...axis), d = l.t.map((x, i) => x - r.t[i]);
      const along = d.reduce((sum, x, i) => sum + x * axis[i] / size, 0);
      if ([2, 4, 8].includes(weapon)) assert.ok(Math.hypot(...d.map((x, i) => x - axis[i] / size * along)) < 1, `weapon ${weapon}: actual off-hand weapon attachment left the hilt by ${Math.hypot(...d.map((x, i) => x - axis[i] / size * along))}`);
    }
    const volumes = {};
    for (const b of batches) {
      let least = 1;
      for (const v of b.vertices) {
        const a = Array(9).fill(0);
        for (const { bone, w } of v.weights) {
          const r = mul(mats.get(bone.ref).a, bone.invBind.a);
          for (let j = 0; j < 9; j++) a[j] += w * r[j];
        }
        least = Math.min(least, det(a) / det(v.rest));
      }
      volumes[b.name] = least;
    }
    return { pose, mats, volumes };
  } };
}

const sample = (r, clip, t) => poseSkeleton(r.sk, clip.trackMap, sampleTrack, t, { accumRoot: clip.accumRoot });

test('ARM-ANATOMY: real male/female skin retains wrist and elbow volume through held locomotion', { skip: !available }, () => {
  for (const female of [false, true]) for (const weapon of [2, 4, 5, 6, 8]) {
    const results = {};
    for (const group of ['idle2c', 'walkforward', 'walkback', 'runforward', 'runback2c']) {
      const r = rig(female, weapon), clip = r.pick([5, 6].includes(weapon) ? group.replace(/2c$/, '2w').replace(/^(walkforward|walkback|runforward)$/, '$12w') : group), win = loopWindow(clip.state, clip.keys), worst = {};
      for (let i = 0; i < 240; i++) {
        const t = win.start + ((i / 60 * 1.36) % (win.stop - win.start));
        const running = group.startsWith('run'), idle = group.startsWith('idle');
        const out = r.step(sample(r, clip, t), { running, forward: idle ? 0 : group.includes('back') ? -1 : 1, speed: idle ? 0 : running ? 8.1 : 4.4 }, 1 / 60);
        if (i < 120) continue;
        for (const [name, value] of Object.entries(out.volumes)) worst[name] = Math.min(worst[name] ?? 1, value);
      }
      for (const [name, value] of Object.entries(worst)) assert.ok(value > (group.startsWith('run') || [5, 6].includes(weapon) ? 0.4 : 0.6),
        `${female ? 'female' : 'male'} weapon ${weapon} ${group} ${name}: local skin volume collapsed to ${value}`);
      results[group] = worst;
    }
    assert.equal(Object.keys(results).length, 5);
  }
});

test('ARM-ANATOMY: attack returns preserve grip and continuous forearm rotations', { skip: !available }, () => {
  for (const female of [false, true]) for (const weapon of [2, 5, 6]) for (const running of [false, true]) for (const type of ['slash', 'chop', 'thrust']) {
    const r = rig(female, weapon), wide = [5, 6].includes(weapon), idle = r.pick(running ? wide ? 'runforward2w' : 'runforward' : wide ? 'idle2w' : 'idle2c'), blow = r.pick(wide ? 'weapontwowide' : 'weapontwohand', { start: `${type} start`, stop: `${type} small follow stop` });
    const neutral = sample(r, idle, idle.state.startTime + 0.1);
    let from = null, shown = neutral, previous = null, worstTurn = 0, worstVolume = 1;
    for (let i = 0; i < 330; i++) {
      const striking = i >= 120 && i < 210, n = i - 120;
      if (i === 120 || i === 210) from = shown;
      const raw = striking ? sample(r, blow, blow.state.startTime + (blow.state.stopTime - blow.state.startTime) * n / 89) : neutral;
      const u = striking ? Math.min(1, n / 8) : i >= 210 ? Math.min(1, (i - 210) / 30) : 1;
      shown = from && u < 1 ? blendPoseMaps(from, raw, u * u * (3 - 2 * u)) : raw;
      const word = striking ? { blow: { type, hand: 'R', section: n < 30 ? 'windup' : n < 50 ? 'release' : 'follow', progress: n < 30 ? n / 30 : n < 50 ? (n - 30) / 20 : (n - 50) / 40, strength: 1 } } : {};
      const out = r.step(shown, { ...word, running, speed: running ? 8.1 : 0, forward: running ? 1 : 0 }, 1 / 60);
      const rotations = ['L', 'R'].map((s) => out.mats.get(r.body.bones[s].fore).a);
      if (i >= 210 && previous) for (let side = 0; side < 2; side++) {
        const trace = rotations[side].reduce((sum, v, k) => sum + v * previous[side][k], 0);
        worstTurn = Math.max(worstTurn, Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))));
      }
      if (i >= 210) worstVolume = Math.min(worstVolume, ...Object.values(out.volumes));
      previous = rotations;
    }
    if (!wide) assert.ok(worstTurn < (running ? 0.4 : 0.3), `${female ? 'female' : 'male'} weapon ${weapon} ${running ? 'running' : 'standing'} ${type}: forearm snapped ${worstTurn * 180 / Math.PI} degrees in a return frame`);
    assert.ok(worstVolume > (wide ? 0.3 : running ? 0.35 : 0.45), `${female ? 'female' : 'male'} weapon ${weapon} ${running ? 'running' : 'standing'} ${type}: return pinched the skin to ${worstVolume}`);
  }
});


test('ARM-ANATOMY: distribute an axial hand turn without moving the forearm axis; repeated solves spend one frame once', () => {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1], axis = [1, 0, 0], hand = rotAxisAngle(axis, 2 * Math.PI / 3);
  const fore = balanceForearm(I, I, hand, axis, I, I);
  const expected = rotAxisAngle(axis, Math.PI / 3);
  fore.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-6));
  assert.deepEqual(apply(fore, axis), axis);
  const state = { angle: 0, frame: 1, dt: 1 / 60 };
  balanceForearm(I, I, hand, axis, I, I, 1, state);
  const first = state.angle;
  assert.ok(Math.abs(first - ARM_ANATOMY.turnSpeed / 60) < 1e-6);
  balanceForearm(I, I, hand, axis, I, I, 1, state);
  assert.equal(state.angle, first, 'a reachability retry does not spend the frame twice');
  state.frame++;
  balanceForearm(I, I, hand, axis, I, I, 1, state);
  assert.ok(Math.abs(state.angle - 2 * first) < 1e-6);
});

test('ARM-ANATOMY: a wrist-compatible elbow keeps the shoulder/wrist fixed and retains a safe preferred pole', () => {
  const shoulder = [0, 0, 0], wrist = [1, 0, 0], fingers = [0.5, Math.sqrt(0.75), 0];
  const preferred = [0, 0, 1], pole = wristPole(shoulder, wrist, fingers, 1, 1, preferred);
  const result = solveReach(shoulder, 1, 1, wrist, pole, 0.999);
  const fore = result.end.map((v, i) => v - result.mid[i]);
  const bend = Math.acos(fore.reduce((sum, v, i) => sum + v * fingers[i], 0));
  assert.ok(bend <= ARM_ANATOMY.wristBend + 1e-6);
  assert.deepEqual(result.end, wrist);
  const kept = wristPole(shoulder, wrist, fingers, 1, 1, pole);
  kept.forEach((v, i) => assert.ok(Math.abs(v - pole[i]) < 1e-6, 'a safe elbow is unchanged'));
});


test('ARM-ANATOMY: real walk/run/stop transitions keep the skinned joints open at 30/60/120 Hz', { skip: !available }, () => {
  for (const hz of [30, 60, 120]) {
    const r = rig(true, 2), groups = ['idle2c', 'walkforward', 'runforward', 'walkback', 'idle2c'];
    let shown = null, worst = 1, previous = null, turn = 0;
    for (const group of groups) {
      const clip = r.pick(group), win = loopWindow(clip.state, clip.keys), from = shown;
      for (let i = 0; i < hz * 2; i++) {
        const raw = sample(r, clip, win.start + ((i / hz * 1.36) % (win.stop - win.start)));
        const u = Math.min(1, i / hz / 0.2);
        shown = from && u < 1 ? blendPoseMaps(from, raw, u * u * (3 - 2 * u)) : raw;
        const running = group.startsWith('run'), idle = group.startsWith('idle');
        const out = r.step(shown, { running, speed: idle ? 0 : running ? 8.1 : 4.4, forward: idle ? 0 : group.includes('back') ? -1 : 1 }, 1 / hz);
        const rotations = ['L', 'R'].map((s) => out.mats.get(r.body.bones[s].fore).a);
        if (from) {
          worst = Math.min(worst, ...Object.values(out.volumes));
          if (previous) for (let side = 0; side < 2; side++) {
            const trace = rotations[side].reduce((sum, v, k) => sum + v * previous[side][k], 0);
            turn = Math.max(turn, Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))));
          }
        }
        previous = rotations;
      }
    }
    assert.ok(turn < 0.75 * 60 / hz, `${hz} Hz: forearm flipped ${turn * 180 / Math.PI} degrees during a gait change`);
    assert.ok(worst > 0.35, `${hz} Hz: a held gait transition collapsed the local skin volume to ${worst}`);
  }
});
