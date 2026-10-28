// BODY-WEIGHT (MOTION-DOCTRINE pilot step 2, bible/05-Combat/Motion-Doctrine.md section 7): one weight from what the body
// wears and holds, and the trunk's spring answer to the body's real acceleration - forward into a start, back against a
// stop, settling with a little overshoot; heavier is slower and deeper; laid over the clip's trunk, the legs untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { bodyWeightOf, createBodyWeight, leanTrunk, LEAN, SWAY } from '../../../src/characters/bodyMotion/bodyWeight.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const PLATE = 0x0200, CHAIN = 0x0100, LEATHER = 0x0000;
const suit = (material) => [102, 103, 104, 105, 106, 107, 108].map((templateIndex) => ({ kind: 'armor', templateIndex, material }));

test('BODY-WEIGHT: bare and empty-handed weighs nothing; full plate and a two-hander nearly all; leather < chain < plate', () => {
  assert.equal(bodyWeightOf({}).w, 0);
  const plate2h = bodyWeightOf({ armor: suit(PLATE), mwType: MW_WEAPON_TYPE.LongBladeTwoHand }).w;
  assert.ok(plate2h > 0.9 && plate2h <= 1, `plate and a two-hander: ${plate2h}`);
  const [l, c, p] = [LEATHER, CHAIN, PLATE].map((m) => bodyWeightOf({ armor: suit(m) }).w);
  assert.ok(l < c && c < p, `leather ${l}, chain ${c}, plate ${p}`);
  assert.ok(bodyWeightOf({ mwType: MW_WEAPON_TYPE.LongBladeTwoHand }).w > bodyWeightOf({ mwType: MW_WEAPON_TYPE.ShortBladeOneHand }).w, 'a two-hander outweighs a dagger');
  assert.equal(bodyWeightOf({ mwType: MW_WEAPON_TYPE.HandToHand }).w, 0, 'the fists are no weight');
  assert.equal(bodyWeightOf({ armor: [{ kind: 'clothing', templateIndex: 102 }] }).w, 0, 'clothes are no armour');
});

/** Run a body through a scene of speeds (m/s straight ahead, facing +z at yaw 0), 60 Hz; answer the pitch each frame. */
function run(scene, { armor = [], mwType = MW_WEAPON_TYPE.None, active = true } = {}) {
  const layer = createBodyWeight();
  const out = [];
  let z = 0;
  for (const [speed, seconds] of scene) {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      z += speed / 60;
      out.push(layer.step(1 / 60, { active, move: { travel: [0, 0, z], bodyYaw: 0 }, armor, mwType }).pitch);
    }
  }
  return out;
}
const peak = (a, from, to) => a.slice(from, to).reduce((m, v) => (Math.abs(v) > Math.abs(m) ? v : m), 0);

test('BODY-WEIGHT: a start leans the trunk forward, a stop leans it back, and both settle - never past the cap', () => {
  const p = run([[0, 0.5], [6, 1.5], [0, 1.5]]);
  const start = peak(p, 30, 60), stop = peak(p, 120, 150);
  assert.ok(start > 0.05, `the start leans forward (${start} rad)`);
  assert.ok(stop < -0.05, `the stop leans back (${stop} rad)`);
  assert.ok(Math.abs(p[115]) < 0.01, `a steady run stands up again (${p[115]})`);
  assert.ok(Math.abs(p[p.length - 1]) < 0.005, 'and the stop comes to rest');
  assert.ok(p.every((v) => Math.abs(v) <= LEAN.max + 0.02), 'the cap holds');
});

test('BODY-WEIGHT: the stop settles THROUGH rest - a little overshoot forward after the lean back (the trunk coming to rest, not a halt)', () => {
  const p = run([[6, 1.5], [0, 1.5]]);
  const after = p.slice(90);
  const back = after.findIndex((v) => v < -0.03);
  assert.ok(back >= 0, 'it leans back first');
  const over = Math.max(...after.slice(back));
  assert.ok(over > 0.002 && over < 0.06, `then overshoots forward a little (${over} rad)`);
});

test('BODY-WEIGHT: heavier is deeper and slower - full plate and a two-hander lean further and later than a bare body', () => {
  const scene = [[0, 0.3], [6, 1.2]];
  const light = run(scene), heavy = run(scene, { armor: suit(PLATE), mwType: MW_WEAPON_TYPE.LongBladeTwoHand });
  const pl = peak(light, 18, 72), ph = peak(heavy, 18, 72);
  assert.ok(ph > pl, `deeper: ${ph} > ${pl}`);
  const at = (a, v) => a.slice(18).findIndex((x) => x === v);
  assert.ok(at(heavy, ph) > at(light, pl), 'and its peak comes later');
});

test('BODY-WEIGHT: off the ground (or the switch off) the trunk comes back to the clip\'s, and a teleport is no acceleration', () => {
  const layer = createBodyWeight();
  let z = 0;
  for (let i = 0; i < 20; i++) { z += 0.1; layer.step(1 / 60, { active: true, move: { travel: [0, 0, z], bodyYaw: 0 } }); }
  for (let i = 0; i < 120; i++) { z += 0.1; layer.step(1 / 60, { active: false, move: { travel: [0, 0, z], bodyYaw: 0 } }); }
  assert.equal(layer.lean().pitch, 0, 'back to the clip');
  const jump = createBodyWeight();
  jump.step(1 / 60, { active: true, move: { travel: [0, 0, 0], bodyYaw: 0 } });
  const p = jump.step(1 / 60, { active: true, move: { travel: [0, 0, 500], bodyYaw: 0 } }).pitch;
  assert.equal(p, 0, 'a 500 m step in a frame is a placement, not a run');
});

test('BODY-WEIGHT: a sidestep rolls the trunk toward it, by the body\'s own facing', () => {
  const layer = createBodyWeight();
  let x = 0, r = 0;
  for (let i = 0; i < 30; i++) {
    x += i > 5 ? 5 / 60 : 0;   // facing +z at yaw 0: +x is the right
    r = Math.max(r, layer.step(1 / 60, { active: true, move: { travel: [x, 0, 0], bodyYaw: 0 } }).roll);
  }
  assert.ok(r > 0.02, `a step to the right rolls the right side down (${r})`);
});

test('BODY-WEIGHT: the lean turns the trunk on the retail biped and leaves the legs and the hips where the clip put them', () => {
  const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const pose = new Map();
  const before = sm(sk, pose, GRAPH_ROOT);
  assert.equal(leanTrunk(sk, pose, GRAPH_ROOT, sm, { pitch: 0.2, roll: 0 }), true);
  const after = sm(sk, pose, GRAPH_ROOT);
  const pt = (m, name) => m.get(sk.byName.get(name)).t;
  for (const name of ['bip01 l thigh', 'bip01 r calf', 'bip01 pelvis']) {
    assert.ok(Math.hypot(...pt(after, name).map((v, i) => v - pt(before, name)[i])) < 1e-3, `${name} stays`);
  }
  const head0 = pt(before, 'bip01 head'), head1 = pt(after, 'bip01 head');
  assert.ok(head1[1] - head0[1] > 2, `a forward lean carries the head forward (+y, ${head1[1] - head0[1]} units)`);
  assert.ok(head1[2] < head0[2], 'and down');
  assert.equal(leanTrunk(sk, new Map(), GRAPH_ROOT, sm, { pitch: 0, roll: 0 }), false, 'no lean, no write');
});

test('BODY-WEIGHT SWAY: a steady walk in plate carries the trunk a little forward; a bare body walks upright', () => {
  const plate = run([[4.4, 2]], { armor: suit(PLATE), mwType: MW_WEAPON_TYPE.LongBladeTwoHand }), bare = run([[4.4, 2]]);
  const steadyPlate = plate[plate.length - 1], steadyBare = bare[bare.length - 1];
  assert.ok(steadyPlate > 0.04 && steadyPlate <= SWAY.carry[1] + 0.005, `plate leans into the walk (${steadyPlate} rad)`);
  assert.ok(Math.abs(steadyBare) < 0.005, `bare walks upright (${steadyBare})`);
  const layer = createBodyWeight();
  let z = 0;
  for (let i = 0; i < 120; i++) { z += 4.4 / 60; layer.step(1 / 60, { active: true, move: { travel: [0, 0, z], bodyYaw: 0 }, armor: suit(PLATE) }); }
  assert.ok(layer.sway().on > 0.95 && layer.sway().roll > 0.03, `and its step shifts over the standing foot (${layer.sway().roll} rad)`);
  for (let i = 0; i < 120; i++) layer.step(1 / 60, { active: true, move: { travel: [0, 0, z], bodyYaw: 0 }, armor: suit(PLATE) });
  assert.ok(layer.sway().on < 0.01, 'standing still, the shift goes');
});

test('BODY-WEIGHT SWAY: the trunk shifts over the LOWER foot - a raised right foot leans the body to the left, in step with the clip', { skip: 'LEAN_ON is false - the lean and the sway are set aside (Motion-Doctrine.md 7d)' }, () => {
  const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const thigh = sk.byName.get('bip01 r thigh'), foot = sk.byName.get('bip01 r foot');
  const node = sk.nodes.get(thigh);
  const rot = ([k, a]) => { const c = Math.cos(a), s = Math.sin(a); return k === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : k === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const footZ = (pose) => sm(sk, pose, GRAPH_ROOT).get(foot).t[2];
  const lifted = [[0, 0.6], [0, -0.6], [1, 0.6], [1, -0.6], [2, 0.6], [2, -0.6]].map((a) => { const pose = new Map([[thigh, { ...node.rest, rotation: Array.from(mul33(node.rest.rotation, rot(a))) }]]); return { pose, z: footZ(pose) }; })
    .sort((p, q) => q.z - p.z)[0].pose;
  assert.ok(footZ(lifted) > footZ(new Map()) + 2, 'the right foot is off the ground');
  const layer = createBodyWeight();
  let z = 0;
  for (let i = 0; i < 120; i++) { z += 4.4 / 60; layer.step(1 / 60, { active: true, move: { travel: [0, 0, z], bodyYaw: 0 }, armor: suit(PLATE) }); }
  const headX = (pose) => sm(sk, pose, GRAPH_ROOT).get(sk.byName.get('bip01 head')).t[0];
  const before = headX(lifted);
  layer.slot(null)(sk, lifted, GRAPH_ROOT, sm);
  assert.ok(headX(lifted) < before - 0.5, `the head goes over the left foot (-x): ${before} -> ${headX(lifted)}`);
});
const mul33 = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));

test('BODY-WEIGHT: the rig steps it behind the MotionDoctrine switch and lays it over the body-motion slot', () => {
  const src = readFileSync(new URL('../../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(src, /bodyWeight\.stepRig\(dt, modSetting\('morrowind-animation', 'MotionDoctrine'\) !== 0 && viewMode === 'third', cam, lastBuildOpts\?\.armor, thirdBuilt\?\.mwType, dead\)/);
  assert.match(src, /motion: bodyWeight\.slot\(motion\.slot\)/);   // PIN MOVED back (STRIDE set aside, Motion-Doctrine.md 7d)
});
