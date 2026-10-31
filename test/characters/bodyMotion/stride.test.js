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

test('STRIDE and FOOT-SPEED: SET ASIDE (2026-10-28, the owner: "now everything has gone wooden") - the rig no longer reads them', () => {
  const src = readFileSync(new URL('../../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /strideLaw/, 'the module is kept and pinned above, the rig does not wire it');
});

test('STRIDE MAX-RATE: a sideways run at Daggerfall\'s full speed never scurries past the cap - the rest is a slide', () => {
  const { rate, stride } = strideShare(5.6);
  assert.equal(rate, STRIDE.maxRate);
  assert.equal(stride, STRIDE.maxStride);
  assert.ok(rate * stride < 5.6, 'the legs cover less than the body: a slide, the lesser evil');
});

test('RUN-STRIDE: a run plays its clip at most RUN_STRIDE.maxRate its own speed and lengthens the legs by the rest (MAO runforward2c 4.57 m/s under the 8.1 m/s run: 1.77x before); a walk keeps the reference rate', async () => {
  const { runStrideShare, RUN_STRIDE, createStride } = await import('../../../src/characters/bodyMotion/stride.js');
  const k = (8.1 * 69.99125109) / 320;   // the body's speed over the clip's
  const share = runStrideShare(k);
  assert.ok(Math.abs(share.rate * share.stride - k) < 1e-9, 'the ratio shared, no slide');
  assert.ok(share.rate <= RUN_STRIDE.maxRate * 1.01 && share.stride > 1.25, `rate ${share.rate.toFixed(2)}, stride ${share.stride.toFixed(2)}`);
  assert.deepEqual(runStrideShare(0.9), { rate: 0.9, stride: 1 });
  const layer = createStride({ sampleTrack: () => null, loopWindow: () => ({ start: 0, stop: 1 }), share: runStrideShare, groups: /^run/i });
  assert.equal(layer.rate(k, true, 'runforward2c'), share.rate);
  assert.equal(layer.rate(2.49, true, 'walkforward2c'), 2.49, 'the walk is the clip the owner accepted');
  assert.equal(layer.rate(k, false, 'runforward2c'), k, 'switched off: the reference');
});

test('WALK-STRIDE: a walk plays at most its maxRate (2.5x before, MAO walkforward2c at 4.4 m/s), the rest in the stride, the ratio kept', async () => {
  const { walkStrideShare, WALK_STRIDE } = await import('../../../src/characters/bodyMotion/stride.js');
  const k = (4.43 * 69.99125109) / 124.3, share = walkStrideShare(k);
  assert.ok(Math.abs(share.rate * share.stride - k) < 1e-9, 'the ratio shared, no slide');
  assert.ok(share.rate <= WALK_STRIDE.maxRate * 1.01 && share.stride > 1.5, `rate ${share.rate.toFixed(2)}, stride ${share.stride.toFixed(2)}`);
});

test('STRIDE-SMOOTH: a wavering speed does not reach the playback rate frame by frame, and a new clip takes its own ratio at once', async () => {
  const { walkStrideShare } = await import('../../../src/characters/bodyMotion/stride.js');
  const layer = createStride({ sampleTrack: () => null, loopWindow: () => ({ start: 0, stop: 1 }), share: walkStrideShare, groups: /^(walk|run)/i });
  const state = { group: 'walkforward', startTime: 0, stopTime: 1 };
  let step = 0, last = null;
  for (let i = 0; i < 120; i++) {
    const k = 3 + 0.3 * Math.sin(i * 1.7);
    layer.step(1 / 60, { on: true, state, source: { keys: [], trackMap: new Map() }, k });
    const r = layer.rate(k, true, 'walkforward');
    if (last != null && i > 30) step = Math.max(step, Math.abs(r - last));
    last = r;
  }
  assert.ok(step < 0.03, `the rate moved ${step.toFixed(3)} a frame (the raw ratio: 0.2)`);
  layer.step(1 / 60, { on: true, state: { group: 'runforward', startTime: 0, stopTime: 1 }, source: { keys: [], trackMap: new Map() }, k: 1.2 });
  assert.equal(layer.rate(1.2, true, 'runforward'), walkStrideShare(1.2).rate);
});


test('PROFILE-WALK: the knee softens in its existing plane, the foot keeps its turn and the lower ankle keeps the ground', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const state = { group: 'walkforward', startTime: 0, stopTime: 1 };
  const source = { trackMap: new Map(STRIDE.bones.map((b) => [b, swing(() => 0)])), keys: [] };
  const means = new Map(STRIDE.bones.map((b) => [b, cycleMean(state, source, b, sampleTrack, { start: 0, stop: 1 })]));
  const base = new Map();
  const plain = new Map(base), soft = new Map(base);
  lengthenLegs(sk, plain, GRAPH_ROOT, sm, { stride: 1.66, means, calf: 0 });
  lengthenLegs(sk, soft, GRAPH_ROOT, sm, { stride: 1.66, means, calf: 0, knees: true });
  const a = sm(sk, plain, GRAPH_ROOT), b = sm(sk, soft, GRAPH_ROOT);
  const sub = (x, y) => x.map((v, i) => v - y[i]);
  const dot = (x, y) => x.reduce((v, n, i) => v + n * y[i], 0);
  const bend = (m, side) => {
    const [h, k, f] = ['thigh', 'calf', 'foot'].map((n) => m.get(sk.byName.get(`bip01 ${side} ${n}`)).t);
    const u = sub(k, h), v = sub(f, k);
    return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / Math.hypot(...u) / Math.hypot(...v)))) * 180 / Math.PI;
  };
  for (const side of ['l', 'r']) {
    assert.ok(bend(b, side) > bend(a, side) + 1, 'a longer step must actually fold the knee');
    assert.ok(bend(b, side) >= 14.9, 'the knee never locks straight');
    const foot = sk.byName.get(`bip01 ${side} foot`);
    assert.ok(a.get(foot).a.every((v, i) => Math.abs(v - b.get(foot).a[i]) < 1e-5), 'no extra ankle pitch or roll');
    const hip = sk.byName.get(`bip01 ${side} thigh`), knee = sk.byName.get(`bip01 ${side} calf`);
    const u = sub(a.get(knee).t, a.get(hip).t), v = sub(a.get(foot).t, a.get(knee).t);
    const axis = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const delta = sub(sub(b.get(foot).t, b.get(hip).t), sub(a.get(foot).t, a.get(hip).t));
    assert.ok(Math.abs(dot(delta, axis)) / Math.hypot(...axis) < 1e-4, 'the ankle stays in its existing knee plane');
  }
  const low = (m) => Math.min(...STRIDE.feet.map((n) => m.get(sk.byName.get(n)).t[2]));
  assert.ok(Math.abs(low(a) - low(b)) < 1e-4, 'the existing ground compensation includes the softer knee');
});

test('PROFILE-WALK: the free forward and back walks opt in (GUARD-BACK-KNEES), the guard walk and run keep identical poses', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const source = { trackMap: new Map(STRIDE.bones.map((b) => [b, swing(() => 0)])), keys: [] };
  for (const group of ['walkforward2c', 'walkback', 'runforward', 'walkforward']) {
    const make = (knees) => {
      const layer = createStride({ sampleTrack, loopWindow, knees });
      for (let i = 0; i < 120; i++) layer.step(1 / 60, { on: true, state: { group, startTime: 0, stopTime: 1 }, source, k: 2 });
      const pose = new Map(); layer.slot(null)(sk, pose, GRAPH_ROOT, sm); return pose;
    };
    if (group === 'walkforward' || group === 'walkback') assert.notDeepEqual(make(true), make(false));
    else assert.deepEqual(make(true), make(false), `${group} must be unchanged`);
  }
});
