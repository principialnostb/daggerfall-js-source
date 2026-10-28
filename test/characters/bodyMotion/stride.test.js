// STRIDE and FOOT-SPEED (MOTION-DOCTRINE, bible/05-Combat/Motion-Doctrine.md): Daggerfall's speeds share their ratio
// between the clip's cadence and the legs' swing, the legs lengthen about their cycle's mean without lifting the planted
// foot, and the clip's pace is its planted foot's, not its root's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { strideShare, lengthenLegs, cycleMean, createStride, STRIDE } from '../../../src/characters/bodyMotion/stride.js';
import { loopWindow } from '../../../src/combat/leftArmLayer.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
/** A track turning about the rig's x by angle(t) - quaternions in the tracks' own [w, x, y, z]. */
const swing = (angle) => ({ angle });
const sampleTrack = (tr, t) => { const a = tr.angle(t); return { rotation: [Math.cos(a / 2), Math.sin(a / 2), 0, 0], translation: null, scale: 1 }; };

test('STRIDE: the ratio is shared - cadence times stride is the ratio, the stride capped, nothing below 1', () => {
  for (const k of [1.5, 2, 2.54, 4]) {
    const { rate, stride } = strideShare(k);
    assert.ok(Math.abs(rate * stride - Math.min(k, STRIDE.maxRate * stride)) < 1e-9, `k ${k}`);
    assert.ok(stride <= STRIDE.maxStride + 1e-12 && stride >= 1);
    assert.ok(rate < k, `k ${k}: the legs step slower than the reference's ${k}x (${rate})`);
  }
  assert.deepEqual(strideShare(0.6), { rate: 0.6, stride: 1 }, 'slower than the clip: the reference\'s rate, no stride');
  assert.equal(strideShare(2).stride, Math.SQRT2, 'a walk at twice the clip: half the ratio in each');
});

test('STRIDE: a cycle\'s mean turn is read off its own loop, once per source', () => {
  let asked = 0;
  const counted = (tr, t) => { asked++; return sampleTrack(tr, t); };
  const source = { trackMap: new Map([['bip01 l thigh', swing((t) => 0.4 + 0.3 * Math.sin(2 * Math.PI * t))]]) };
  const q = cycleMean({ group: 'walkforward' }, source, 'bip01 l thigh', counted, { start: 0, stop: 1 });
  assert.ok(Math.abs(2 * Math.acos(q[0]) - 0.4) < 0.02, `the mean turn is the swing's middle (${2 * Math.acos(q[0])})`);
  const n = asked;
  cycleMean({ group: 'walkforward' }, source, 'bip01 l thigh', counted, { start: 0, stop: 1 });
  assert.equal(asked, n, 'memoised');
  assert.equal(cycleMean({ group: 'walkforward' }, source, 'bip01 r calf', counted, { start: 0, stop: 1 }), null, 'no track, no mean');
});

test('STRIDE: the legs swing further about their mean and the body keeps the ground the clip stood it on', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const thigh = sk.byName.get('bip01 r thigh'), node = sk.nodes.get(thigh);
  const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const mul = (a, b) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]));
  const pose = new Map([[thigh, { ...node.rest, rotation: Float32Array.from(mul(node.rest.rotation, rx(0.3))) }]]);
  const toQ = (m) => { const w = Math.sqrt(Math.max(0, 1 + m[0] + m[4] + m[8])) / 2; return [w, (m[7] - m[5]) / (4 * w), (m[2] - m[6]) / (4 * w), (m[3] - m[1]) / (4 * w)]; };
  const means = new Map([['bip01 r thigh', toQ(node.rest.rotation)]]);
  const footZ = (p) => { const m = sm(sk, p, GRAPH_ROOT); return Math.min(m.get(sk.byName.get('bip01 l foot')).t[2], m.get(sk.byName.get('bip01 r foot')).t[2]); };
  const angleOff = (p) => { const r = p.get(thigh).rotation, d = mul(r, [0, 3, 6, 1, 4, 7, 2, 5, 8].map((i) => node.rest.rotation[i])); return Math.acos(Math.min(1, (d[0] + d[4] + d[8] - 1) / 2)); };
  const ground = footZ(pose), before = angleOff(pose);
  const dz = lengthenLegs(sk, pose, GRAPH_ROOT, sm, { stride: 1.4, w: 1, means });
  assert.ok(Math.abs(angleOff(pose) - before * 1.4) < 3e-3, `the swing ${before} -> ${angleOff(pose)}`);
  assert.ok(Number.isFinite(dz));
  assert.ok(Math.abs(footZ(pose) - ground) < 0.05, `the lower foot keeps the ground (${ground} -> ${footZ(pose)})`);
  assert.equal(lengthenLegs(sk, new Map(), GRAPH_ROOT, sm, { stride: 1, w: 1, means }), null, 'no stride, nothing done');
});

test('STRIDE: the layer comes on with a movement faster than its clip, never for a turn, and off when it stops', () => {
  const law = createStride({ sampleTrack, loopWindow });
  const source = { trackMap: new Map(STRIDE.bones.map((b) => [b, swing((t) => 0.2 * Math.sin(6 * t))])), keys: [] };
  const state = { group: 'walkforward', startTime: 0, stopTime: 1 };
  for (let i = 0; i < 60; i++) law.stepRig(1 / 60, true, state, source, { move: { speed: 4.4 } }, 154, 70);
  assert.ok(law.weight() > 0.99 && Math.abs(law.stride() - strideShare(4.4 * 70 / 154).stride) < 1e-9);
  for (let i = 0; i < 60; i++) law.stepRig(1 / 60, true, { ...state, group: 'turnleft' }, source, { move: { speed: 4.4 } }, 154, 70);
  assert.ok(law.weight() < 0.01, 'a turn in place takes no stride');
  assert.equal(law.rate(2, false), 2, 'switched off: the reference\'s rate');
});

test('FOOT-SPEED: with the switch off, or no skeleton, the pace is the reference\'s root velocity', () => {
  const law = createStride({ sampleTrack, loopWindow });
  assert.equal(law.pace({ trackMap: new Map() }, { group: 'walkforward' }, null, 154, true), 154);
  assert.equal(law.pace({ trackMap: new Map() }, { group: 'walkforward' }, {}, 154, false), 154);
});

test('STRIDE and FOOT-SPEED: the rig reads them behind the MotionDoctrine switch', () => {
  const src = readFileSync(new URL('../../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(src, /: strideLaw\.rate\(Math\.min\(MOVEMENT_SPEED_CAP,/);
  assert.match(src, /strideLaw\.stepRig\(dt, modSetting\('morrowind-animation', 'MotionDoctrine'\) !== 0 && viewMode === 'third', movementState, movementSource, cam, movementAnimSpeed, MW_UNITS_PER_METER\)/);
  assert.match(src, /const vel = strideLaw\.pace\(movementSource, movementState, rig\(\)\?\.arm\?\.skeleton,/);
  assert.match(src, /motion: bodyWeight\.slot\(strideLaw\.slot\(motion\.slot\)\)/);
});

test('STRIDE MAX-RATE: a sideways run at Daggerfall\'s full speed never scurries past the cap - the rest is a slide', () => {
  const { rate, stride } = strideShare(5.6);
  assert.equal(rate, STRIDE.maxRate);
  assert.equal(stride, STRIDE.maxStride);
  assert.ok(rate * stride < 5.6, 'the legs cover less than the body: a slide, the lesser evil');
});
