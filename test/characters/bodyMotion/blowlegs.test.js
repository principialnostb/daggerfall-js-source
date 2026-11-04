// BLOW-LEGS (MOTION-DOCTRINE, bible/05-Combat/Motion-Doctrine.md 7f): a blow struck standing loads, drives and recovers
// with the whole body - the hips back and turned away, then forward, down and through; the lead foot steps (lifted,
// never slid) on a thrust and a chop and steps home; both feet stand where the stance put them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { blowPhase, blowLegsPose, createBlowLegs, settleOffsets, BLOW_LEGS, BLOW_LEGS_TIME, BLOW_SETTLE, BLOW_PIVOT, BLOW_MOVE, TRAILING_FOOT } from '../../../src/characters/bodyMotion/blowLegs.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { solveBody } from '../../../src/characters/bodyMotion/bodySolve.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
/** LEG-DRIVE: where a foot stands on the ground - the ball of the foot (it turns on it, the heel going out), its ankle
 *  plus BLOW_PIVOT.ball of the leg along its toe's way, level. */
function ballOf(m, body, side) {
  const a = m.get(body.bones[side].foot).a, s = Math.hypot(a[0], a[3], a[6]), f = body.footAxes[side].fwd;
  const toe = [0, 1, 2].map((r) => (a[r * 3] * f[0] + a[r * 3 + 1] * f[1] + a[r * 3 + 2] * f[2]) / s), h = Math.hypot(toe[0], toe[1]) || 1;
  const t = m.get(body.bones[side].foot).t;
  return [t[0] + toe[0] / h * BLOW_PIVOT.ball * body.leg, t[1] + toe[1] / h * BLOW_PIVOT.ball * body.leg, t[2]];
}
const blow = (type, section, progress, extra = {}) => ({ type, section, progress, strength: 1, reversed: false, hand: 'R', ...extra });

test('sword pilot: preserve the overhead, give a side cut a step, mirror its effort for a backhand', () => {
  const hit = (type, extra = {}) => blowLegsPose(blow(type, 'release', 1, extra), 1);
  assert.deepEqual(hit('chop', { sword: true }), hit('chop'));
  const side = hit('slash', { sword: true });
  assert.ok(side.step > 0 && side.forward);
  assert.ok(side.yaw > hit('slash').yaw);
  assert.equal(hit('slash', { sword: true, reversed: true }).yaw, -side.yaw);
  assert.ok(hit('thrust', { sword: true }).drop < hit('chop', { sword: true }).drop);
});

test('BLOW-LEGS: the key poses - wound away, driven through, recovered; a backhand mirrored, a slash steps nowhere', () => {
  assert.equal(blowPhase('windup', 0).load, 0);
  assert.equal(blowPhase('release', 1).drive, 1);
  assert.equal(blowPhase('follow', BLOW_LEGS_TIME.hold).recover, 0, 'the hit held a while');
  assert.equal(blowPhase('follow', 1).recover, 1);
  assert.equal(blowPhase(null, 0.5), null);
  assert.ok(blowPhase('release', 0.3).drive > 0.6, 'the drive snaps out of the wind-up');
  const wound = blowLegsPose(blow('slash', 'windup', 1)), hit = blowLegsPose(blow('slash', 'release', 1)), home = blowLegsPose(blow('slash', 'follow', 1));
  assert.ok(wound.yaw < 0 && wound.fwd < 0, 'wound up: turned to the right, the weight back');
  assert.ok(hit.yaw > 0 && hit.fwd > 0 && hit.drop > wound.drop, 'struck: through the swing, forward and down');
  for (const k of ['fwd', 'drop', 'yaw', 'pitch']) assert.ok(Math.abs(home[k]) < 1e-9, `recovered: ${k}`);
  assert.ok(Math.abs(blowLegsPose(blow('slash', 'release', 1, { reversed: true })).yaw + hit.yaw) < 1e-9, 'a backhand turns the other way');
  assert.equal(blowLegsPose(blow('slash', 'release', 1, { hand: 'L' })).lead, 'R', 'a left hand\'s blow leads with the right foot');
  assert.equal(hit.forward, false, 'a slash steps nowhere');
  assert.equal(blowLegsPose(blow('thrust', 'windup', 0.5)).forward, null, 'a wind-up leaves the foot where it stands');
  assert.equal(blowLegsPose(blow('thrust', 'release', 0.1)).forward, true);
  assert.equal(blowLegsPose(blow('thrust', 'follow', 0.9)).forward, false, 'home late in the follow-through');
  assert.ok(blowLegsPose(blow('chop', 'release', 1), 1).drop > blowLegsPose(blow('chop', 'release', 1), 0).drop, 'a heavier body strikes deeper');
  assert.equal(blowLegsPose(blow('shoot', 'release', 1)), null, 'a shot is the arms\'');
  assert.ok(BLOW_LEGS.thrust.step > BLOW_LEGS.chop.step, 'the thrust the longest step');
});

/** A whole blow struck standing over the rest pose: each frame's pelvis and feet. */
function strike(type, opts = {}) {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const legs = createBlowLegs();
  const names = { pelvis: body.bones.pelvis, L: body.bones.L.foot, R: body.bones.R.foot };
  const frames = [];
  const run = (section, n, word = {}) => {
    for (let i = 0; i <= n; i++) {
      legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, ...word, blow: section ? blow(type, section, i / n, opts) : null }, 0);
      const pose = new Map();
      legs.apply(sk, pose, GRAPH_ROOT, sm);
      const m = sm(sk, pose, GRAPH_ROOT);
      frames.push({ section, air: legs.status().air, pelvis: [...m.get(names.pelvis).t], L: ballOf(m, body, 'L'), R: ballOf(m, body, 'R') });
    }
  };
  run('windup', 20); run('release', 12); run('follow', 30); run(null, 60);   // STEP-HOP: home BLOW_LEGS_TIME.rest after the blow
  return { frames, body, legs };
}
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('BLOW-LEGS: a standing thrust steps its lead foot forward and home - lifted, never slid - the back foot planted', () => {
  const { frames, body } = strike('thrust');
  const start = frames[0];
  const far = Math.max(...frames.map((f) => f.L[1] - start.L[1]));
  assert.ok(far > BLOW_LEGS.thrust.step * body.leg * 0.9, `the lead foot stepped ${far.toFixed(1)} units`);
  assert.ok(Math.max(...frames.map((f) => f.L[2] - start.L[2])) > BLOW_LEGS_TIME.lift * body.leg * 0.5, 'lifted on its way');
  for (let i = 1; i < frames.length; i++) {
    if (!frames[i].air.L && !frames[i - 1].air.L) assert.ok(d(frames[i].L, frames[i - 1].L) < 0.3, `frame ${i}: a planted foot slid ${d(frames[i].L, frames[i - 1].L).toFixed(2)}`);
    assert.ok(d(frames[i].R, start.R) < 0.5, `frame ${i}: the back foot left its place`);
    assert.ok(d(frames[i].pelvis, frames[i - 1].pelvis) < body.leg * 0.06, `frame ${i}: the hips leapt`);
  }
  assert.ok(d(frames[frames.length - 1].L, start.L) < 0.5, 'home again');
  const low = Math.min(...frames.map((f) => f.pelvis[2]));
  assert.ok(start.pelvis[2] - low > 0.04 * body.leg, 'the hips drop into the hit');
});

test('BLOW-LEGS: a slash keeps both feet where they stand and turns the hips through; the body set moving gives the legs back', () => {
  const { frames } = strike('slash');
  const start = frames[0];
  for (const f of frames) { assert.ok(d(f.L, start.L) < 0.5); assert.ok(d(f.R, start.R) < 0.5); }
  const legs = createBlowLegs();
  for (let i = 0; i < 30; i++) legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, blow: blow('chop', 'release', 0.5) }, 0);
  assert.ok(legs.weight() > 0.99);
  // BLOW-MOVE: moving, the layer keeps a share of the hips over the stride's feet (its own test below); no blow, none
  for (let i = 0; i < 60; i++) legs.step(1 / 60, true, { on: true, grounded: true, speed: 3, blow: null }, 0);
  assert.ok(legs.weight() < 0.01, 'moving with no blow: the stride\'s (LOWER-BODY)');
  for (let i = 0; i < 60; i++) legs.step(1 / 60, false, { on: true, grounded: true, speed: 0, blow: blow('chop', 'release', 0.5) }, 0);
  assert.ok(legs.weight() < 0.01, 'switched off');
});

/** A stride the clip leaves the legs in: the left thigh swung forward and the right back by `t` radians about whichever
 *  of the thigh's own axes carries its foot most along the way (+Y). */
function stridePose(sk, body, t) {
  const turn = (a, axis, u) => { const c = Math.cos(u), s = Math.sin(u); const R = axis === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]; return [0, 1, 2].flatMap((r) => [0, 1, 2].map((k) => a[r * 3] * R[k] + a[r * 3 + 1] * R[3 + k] + a[r * 3 + 2] * R[6 + k])); };
  const pose = new Map();
  for (const [side, u] of [['L', t], ['R', -t]]) {
    const ref = body.bones[side].thigh, node = sk.nodes.get(ref);
    let best = null;
    for (const axis of [0, 1, 2]) {
      const p = new Map([[ref, { ...node.rest, rotation: turn(node.rest.rotation, axis, u) }]]);
      const y = sm(sk, p, GRAPH_ROOT).get(body.bones[side].foot).t[1] - sm(sk, new Map(), GRAPH_ROOT).get(body.bones[side].foot).t[1];
      if (!best || y * Math.sign(u) > best.y) best = { y: y * Math.sign(u), rot: p.get(ref).rotation };
    }
    pose.set(ref, { ...node.rest, rotation: best.rot });
  }
  return pose;
}

test('STOP-UNDER-A-BLOW / WIDE-STANCE: a foot left in the air under a held wind-up is stepped down - lifted, never slid; feet planted wide apart are the fighting stance and stay where they stand', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const held = (clip) => {
    const legs = createBlowLegs(), frames = [];
    for (let i = 0; i < 120; i++) {
      legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, blow: blow('chop', 'windup', 1) }, 0);   // the wind-up held
      const pose = new Map(clip);
      legs.apply(sk, pose, GRAPH_ROOT, sm);
      const m = sm(sk, pose, GRAPH_ROOT);
      frames.push({ L: ballOf(m, body, 'L'), R: ballOf(m, body, 'R'), Lz: m.get(body.bones.L.foot).t[2], Rz: m.get(body.bones.R.foot).t[2], air: legs.status().air });
    }
    // from the frame the layer has the legs whole (it comes on over BLOW_LEGS_TIME.in - the foot's turn eased in with it)
    for (let i = 6; i < frames.length; i++) for (const s of ['L', 'R']) {
      if (!frames[i].air[s] && !frames[i - 1].air[s]) assert.ok(d(frames[i][s], frames[i - 1][s]) < 0.3, `frame ${i}: the planted ${s} foot slid ${d(frames[i][s], frames[i - 1][s]).toFixed(2)}`);
    }
    assert.ok(!frames.some((f) => f.air.L && f.air.R), 'one foot at a time');
    return frames;
  };
  // a stride the clip leaves: the left thigh swung forward alone - its foot ahead and off the ground
  const lifted = new Map([...stridePose(sk, body, 0.35)].filter(([ref]) => ref === body.bones.L.thigh));
  const m0 = sm(sk, lifted, GRAPH_ROOT);
  assert.ok(m0.get(body.bones.L.foot).t[2] - m0.get(body.bones.R.foot).t[2] > BLOW_SETTLE.lifted * body.leg, 'the clip leaves a foot in the air');
  const down = held(lifted), end = down[down.length - 1];
  assert.ok(Math.abs(end.Lz - end.Rz) < 1, `both on the ground (${(end.Lz - end.Rz).toFixed(1)} apart in height)`);
  // the fighting stance: both feet on the ground, far apart along the way (the owner's guard clip stands so)
  const rest = sm(sk, new Map(), GRAPH_ROOT), ft = (s) => rest.get(body.bones[s].foot).t, wide = new Map();
  solveBody(sk, wide, GRAPH_ROOT, sm, { w: 1, feet: { L: { at: [ft('L')[0], ft('L')[1] + 0.3 * body.leg, ft('L')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 }, R: { at: [ft('R')[0], ft('R')[1] - 0.12 * body.leg, ft('R')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 } } });
  const w0 = sm(sk, wide, GRAPH_ROOT);
  assert.ok(Math.abs(ballOf(w0, body, 'L')[1] - ballOf(w0, body, 'R')[1]) > BLOW_SETTLE.apart * body.leg, 'the stance is wide');
  const kept = held(wide);
  for (const s of ["L", "R"]) { const far = Math.max(...kept.slice(6).map((f) => d(f[s], ballOf(w0, body, s)))); assert.ok(far < 0.6 && kept.every((f) => !f.air[s]), `the ${s} foot kept its place in the stance (off it by ${far.toFixed(2)} at most)`); }
  const A = (s) => ({ at: [...rest.get(body.bones[s].foot).t], toe: [0, 1, 0], up: [0, 0, 1] });
  assert.equal(settleOffsets({ L: A('L'), R: A('R') }, { L: rest.get(body.bones.L.thigh).t, R: rest.get(body.bones.R.thigh).t }, body.leg), null, 'standing feet stay');
});

test('STOP-UNDER-A-BLOW: stopped under a held blow, the layer waits for the stance of the clip and anchors the feet there, not on the stride being handed back', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const half = stridePose(sk, body, 0.12);
  const rest = sm(sk, new Map(), GRAPH_ROOT);
  const m0 = sm(sk, half, GRAPH_ROOT);
  assert.ok(d(m0.get(body.bones.L.foot).t, rest.get(body.bones.L.foot).t) > 3, 'the stride is not the stance');
  const legs = createBlowLegs();
  for (let i = 0; i < 20; i++) legs.step(1 / 60, true, { on: true, grounded: true, speed: 5, blow: blow('slash', 'windup', 1) }, 0);
  let m = null, onAt = null;
  for (let i = 0; i < 90; i++) {
    legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, blow: blow('slash', 'windup', 1) }, 0);   // the button held
    const pose = new Map(i < 8 ? half : []);   // LOWER-BODY hands the stride back to the clip over its first frames
    legs.apply(sk, pose, GRAPH_ROOT, sm);
    if (onAt == null && legs.status().anchored) onAt = i;   // BLOW-MOVE: until then the stride's own feet
    m = sm(sk, pose, GRAPH_ROOT);
  }
  assert.ok(onAt != null && onAt / 60 >= BLOW_LEGS_TIME.after - 1 / 60, `the feet were anchored only once the body stood (${onAt} frames)`);
  for (const s of ['L', 'R']) assert.ok(d(ballOf(m, body, s), ballOf(rest, body, s)) < 0.6, `the ${s} foot on the clip's stance`);
});

test('LEG-DRIVE: in a series the stepped foot stays out and goes home once after it; the back foot turns on its ball after the hips; the weight goes back loading and forward striking', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const legs = createBlowLegs();
  const rest = sm(sk, new Map(), GRAPH_ROOT), L0 = ballOf(rest, body, 'L'), x0 = rest.get(body.bones.pelvis).t[0];
  // the toe's heading on the ground in bodyTurn's sense (+ to the left), as the hips' yaw
  const heading = (m, s) => { const a = m.get(body.bones[s].foot).a, f = body.footAxes[s].fwd; return -Math.atan2(a[0] * f[0] + a[1] * f[1] + a[2] * f[2], a[3] * f[0] + a[4] * f[1] + a[5] * f[2]); };
  const out = [], turns = [], sides = [];
  const frame = (b) => {
    legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, blow: b }, 0);
    const pose = new Map(); legs.apply(sk, pose, GRAPH_ROOT, sm); const m = sm(sk, pose, GRAPH_ROOT);
    out.push({ b: b?.section ?? null, n: b?.n, ahead: ballOf(m, body, 'L')[1] - L0[1] });
    turns.push({ b: b?.section ?? null, back: heading(m, 'R') - heading(rest, 'R'), hips: legs.status().yaw });
    sides.push({ b: b?.section ?? null, p: b?.progress, x: m.get(body.bones.pelvis).t[0] - x0 });
  };
  for (let i = 0; i < 30; i++) frame(null);
  for (let n = 0; n < 3; n++) for (const [sec, k] of [['windup', 20], ['release', 8], ['follow', 30]]) for (let i = 0; i <= k; i++) frame({ ...blow('thrust', sec, i / k), n });
  for (let i = 0; i < 40; i++) frame(null);
  const step = BLOW_LEGS.thrust.step * body.leg;
  const between = out.filter((f) => f.n >= 1);
  assert.ok(Math.min(...between.map((f) => f.ahead)) > 0.8 * step, `the foot stayed out through the series (${Math.min(...between.map((f) => f.ahead)).toFixed(1)} of ${step.toFixed(1)})`);
  assert.ok(Math.abs(out[out.length - 1].ahead) < 0.5, 'home once the blows stop');
  const hit = turns.filter((t) => t.b === 'release' || t.b === 'follow').reduce((a, t) => (Math.abs(t.hips) > Math.abs(a.hips) ? t : a));
  assert.ok(Math.sign(hit.back) === Math.sign(hit.hips) && Math.abs(hit.back) > 0.4 * Math.abs(hit.hips), `the back foot turned after the hips (${hit.back.toFixed(2)} of ${hit.hips.toFixed(2)} rad)`);
  const wound = sides.filter((f) => f.b === 'windup' && f.p === 1), struck = sides.filter((f) => f.b === 'release' && f.p === 1);
  assert.ok(wound.every((f) => f.x > 0.5) && struck.every((f) => f.x < -0.5), 'the hips over the back (right) foot wound up, over the lead (left) one at the hit');
});

test('LUNGE-GUARD: from a deep stance on bent knees the lead leg never locks straight - through each blow, its step and the step home', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const rest = sm(sk, new Map(), GRAPH_ROOT), ft = (s) => rest.get(body.bones[s].foot).t, th = (s) => rest.get(body.bones[s].thigh).t;
  const stance = new Map();
  solveBody(sk, stance, GRAPH_ROOT, sm, {
    w: 1, hip: { at: [(th('L')[0] + th('R')[0]) / 2, (th('L')[1] + th('R')[1]) / 2 + 0.04 * body.leg, th('L')[2] - 0.08 * body.leg], yaw: 0, roll: 0, pitch: 0 },
    feet: { L: { at: [ft('L')[0], ft('L')[1] + 0.33 * body.leg, ft('L')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 }, R: { at: [ft('R')[0], ft('R')[1] - 0.11 * body.leg, ft('R')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 } },
  });
  const L = body.bones.L, knee = (m) => { const H = m.get(L.thigh).t, K = m.get(L.calf).t, A = m.get(L.foot).t, u = H.map((v, i) => v - K[i]), v = A.map((x, i) => x - K[i]); return Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
  const k0 = knee(sm(sk, stance, GRAPH_ROOT));
  for (const type of ['thrust', 'chop', 'slash']) {
    const legs = createBlowLegs();
    let straightest = 0;
    for (let i = 0; i < 160; i++) {
      const sec = i < 40 ? 'windup' : i < 50 ? 'release' : i < 100 ? 'follow' : null;
      legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, blow: sec ? blow(type, sec, sec === 'windup' ? i / 40 : sec === 'release' ? (i - 40) / 10 : (i - 50) / 50) : null }, 0);
      const pose = new Map(stance); legs.apply(sk, pose, GRAPH_ROOT, sm);
      if (legs.weight() > 0.99) straightest = Math.max(straightest, knee(sm(sk, pose, GRAPH_ROOT)));
    }
    assert.ok(straightest < Math.max(k0, 150) + 1, `${type}: the lead knee at most ${straightest.toFixed(0)} degrees open (the stance's ${k0.toFixed(0)}; it locked at 175)`);
  }
});

test('STEP-HOP: blows clicked one by one keep the stepped foot out between them - it leaves the ground to step out and once to go home, not on every blow; a short step lifts it little', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const legs = createBlowLegs();
  let lifts = 0, was = false, high = 0;
  const z0 = sm(sk, new Map(), GRAPH_ROOT).get(body.bones.L.foot).t[2];
  const frame = (b) => {
    legs.step(1 / 60, true, { on: true, grounded: true, speed: 0, blow: b }, 0);
    const pose = new Map(); legs.apply(sk, pose, GRAPH_ROOT, sm);
    high = Math.max(high, sm(sk, pose, GRAPH_ROOT).get(body.bones.L.foot).t[2] - z0);
    const a = legs.status().air.L; if (a && !was) lifts++; was = a;
  };
  for (let n = 0; n < 4; n++) {
    for (const [sec, k] of [['windup', 20], ['release', 8], ['follow', 30]]) for (let i = 0; i <= k; i++) frame(blow('chop', sec, i / k));
    for (let i = 0; i < 15; i++) frame(null);   // a pause between the clicks, under BLOW_LEGS_TIME.rest
  }
  for (let i = 0; i < 60; i++) frame(null);
  assert.equal(lifts, 2, 'out once, home once');
  const step = BLOW_LEGS.chop.step * body.leg;
  assert.ok(high < 0.35 * step + 0.2, `lifted ${high.toFixed(1)} for a ${step.toFixed(1)} step`);
});

test('BLOW-MOVE: a blow struck walking keeps the stride\'s feet exactly where its clip sets them and drops and turns the hips through it by a share; stopping, the standing blow takes over with no foot leaping', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const legs = createBlowLegs();
  // the clip's walk: the hips a little low on bent knees, the feet swinging along the way about their stance
  const rest = sm(sk, new Map(), GRAPH_ROOT), ft = (s) => rest.get(body.bones[s].foot).t, th = (s) => rest.get(body.bones[s].thigh).t;
  const stride = (t) => {
    const a = 0.22 * body.leg * Math.sin(2 * Math.PI * 1.4 * t), pose = new Map();
    solveBody(sk, pose, GRAPH_ROOT, sm, {
      w: 1, hip: { at: [(th('L')[0] + th('R')[0]) / 2, (th('L')[1] + th('R')[1]) / 2, th('L')[2] - 0.07 * body.leg], yaw: 0, roll: 0, pitch: 0 },
      feet: { L: { at: [ft('L')[0], ft('L')[1] + a, ft('L')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 }, R: { at: [ft('R')[0], ft('R')[1] - a, ft('R')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 } },
    });
    return pose;
  };
  let worst = 0, deepest = 0, leap = 0, prev = null, f = 0, stopAt = 0;
  for (const moving of [true, false]) for (const [sec, k] of [['windup', 20], ['release', 8], ['follow', 30]]) for (let i = 0; i <= k; i++, f++) {
    if (moving) stopAt = f / 60;
    legs.step(1 / 60, true, { on: true, grounded: true, speed: moving ? 2.5 : 0, blow: blow('chop', sec, i / k) }, 0);
    const clip = stride(moving ? f / 60 : stopAt);   // stopped: the clip holds where the stride stood
    const c = sm(sk, clip, GRAPH_ROOT), pose = new Map(clip);
    legs.apply(sk, pose, GRAPH_ROOT, sm);
    const m = sm(sk, pose, GRAPH_ROOT);
    if (moving && legs.weight() > 0.99) for (const s of ['L', 'R']) worst = Math.max(worst, d(m.get(body.bones[s].foot).t, c.get(body.bones[s].foot).t));
    if (moving) deepest = Math.max(deepest, c.get(body.bones.pelvis).t[2] - m.get(body.bones.pelvis).t[2]);
    const now = { L: ballOf(m, body, 'L'), R: ballOf(m, body, 'R') };
    if (prev && !moving) for (const s of ['L', 'R']) leap = Math.max(leap, d(now[s], prev[s]));
    prev = now;
  }
  assert.ok(worst < 0.3, `walking, the feet on the stride's own (off by ${worst.toFixed(2)} at most)`);
  // GUARD-WALK: the stride sunk into a fighting walk under the blow, the blow's own drop over it
  assert.ok(deepest > (BLOW_MOVE.crouch[0] + 0.5 * BLOW_MOVE.share * BLOW_LEGS.chop.hit.drop) * body.leg, `walking, the hips sank into the chop (${deepest.toFixed(2)})`);
  assert.ok(leap < 0.06 * body.leg, `stopping, no foot leapt (${leap.toFixed(2)} a frame at most)`);
});

test('TRAILING-FOOT: stopped under a blow struck walking, the stride\'s back foot left far behind its hip steps in to a guard\'s depth - lifted, alone; the lead foot stays', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const rest = sm(sk, new Map(), GRAPH_ROOT), ft = (s) => rest.get(body.bones[s].foot).t, th = (s) => rest.get(body.bones[s].thigh).t;
  // the walk caught at its widest: the left foot far ahead, the right far behind
  const stride = new Map(), a = 0.36 * body.leg;
  solveBody(sk, stride, GRAPH_ROOT, sm, {
    w: 1, hip: { at: [(th('L')[0] + th('R')[0]) / 2, (th('L')[1] + th('R')[1]) / 2, th('L')[2] - 0.1 * body.leg], yaw: 0, roll: 0, pitch: 0 },
    feet: { L: { at: [ft('L')[0], ft('L')[1] + a, ft('L')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 }, R: { at: [ft('R')[0], ft('R')[1] - a, ft('R')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 } },
  });
  const legs = createBlowLegs();
  let m = null, lifted = false, L0 = null;
  for (let i = 0; i < 160; i++) {
    const moving = i < 40;
    legs.step(1 / 60, true, { on: true, grounded: true, speed: moving ? 4.4 : 0, blow: blow('chop', 'windup', 1) }, 0);
    const pose = new Map(stride); legs.apply(sk, pose, GRAPH_ROOT, sm); m = sm(sk, pose, GRAPH_ROOT);
    if (legs.status().anchored && !L0) L0 = ballOf(m, body, 'L');
    if (legs.status().air.R) lifted = true;
    assert.ok(!legs.status().air.L, 'the lead foot stays');
  }
  const behind = m.get(body.bones.R.thigh).t[1] - m.get(body.bones.R.foot).t[1];
  assert.ok(lifted, 'the back foot stepped - lifted, not slid');
  assert.ok(behind < (TRAILING_FOOT.to + 0.05) * body.leg, `the back foot in to a guard's depth (${(behind / body.leg).toFixed(2)} of the leg behind its hip; it stood ${(a / body.leg).toFixed(2)} and more)`);
  assert.ok(d(ballOf(m, body, 'L'), L0) < 0.6, 'the lead foot where it stood');
});

test('FEET-FREED: walking on after a blow struck walking, the feet stay on the stride - never anchored while the body moves', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const body = bodyOf(sk, GRAPH_ROOT, sm);
  const rest = sm(sk, new Map(), GRAPH_ROOT), ft = (s) => rest.get(body.bones[s].foot).t, th = (s) => rest.get(body.bones[s].thigh).t;
  const stride = (t) => {
    const a = 0.22 * body.leg * Math.sin(2 * Math.PI * 1.4 * t), pose = new Map();
    solveBody(sk, pose, GRAPH_ROOT, sm, {
      w: 1, hip: { at: [(th('L')[0] + th('R')[0]) / 2, (th('L')[1] + th('R')[1]) / 2, th('L')[2] - 0.07 * body.leg], yaw: 0, roll: 0, pitch: 0 },
      feet: { L: { at: [ft('L')[0], ft('L')[1] + a, ft('L')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 }, R: { at: [ft('R')[0], ft('R')[1] - a, ft('R')[2]], toe: [0, 1, 0], up: [0, 0, 1], w: 1 } },
    });
    return pose;
  };
  const legs = createBlowLegs();
  let f = 0, worst = 0, anchored = 0;
  for (const [sec, k] of [['windup', 20], ['release', 8], ['follow', 30], [null, 90]]) for (let i = 0; i <= k; i++, f++) {
    legs.step(1 / 60, true, { on: true, grounded: true, speed: 4.4, blow: sec ? blow('chop', sec, i / k) : null }, 0);
    const clip = stride(f / 60), c = sm(sk, clip, GRAPH_ROOT), pose = new Map(clip);
    legs.apply(sk, pose, GRAPH_ROOT, sm);
    const m = sm(sk, pose, GRAPH_ROOT);
    if (legs.status().anchored) anchored++;
    if (legs.weight() > 0.05) for (const s of ['L', 'R']) worst = Math.max(worst, d(m.get(body.bones[s].foot).t, c.get(body.bones[s].foot).t));
  }
  assert.equal(anchored, 0, 'never anchored while moving');
  assert.ok(worst < 0.5, `the feet on the stride's own (off by ${worst.toFixed(2)} units at most)`);
});

test('BLOW-LEGS: wired - the motion word to the weight layer, the hips and feet before the elbows\' clearance', () => {
  const bw = rd('src/characters/bodyMotion/bodyWeight.js');
  assert.match(bw, /legs\.step\(dt, active, word, weight\);/);
  assert.match(bw, /if \(clearOn\) legs\.apply\(skeleton, pose, rootRef, skelMats\);[^\n]*\n\s+if \(clearOn\) clearArms\(/);
  assert.match(rd('src/combat/fpArm.js'), /thirdBuilt\?\.mwType, dead, motion\.word\(\)[,)]/);   // RUN-STRIDE: the movement clip passed after the word
  assert.match(rd('src/characters/bodyMotion/bodyMotion.js'), /word: \(\) => input,/);
});
