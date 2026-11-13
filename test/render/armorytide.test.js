// The Tidebound line's own shapes: each piece drawn by its own code, never another line's; each law (the spray's arc,
// the shell's spiral and its light, the stream's flow, the surf's lines, a footfall's ripple, the Edge's swell) held to
// the shader that draws it, run here by the GLSL evaluator; every rate whole over its clock.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glslFunctions, GlslDiscard } from '../glsl.mjs';
import {
  TIDE_CIRCLET, TIDE_SPRAY, TIDE_SHELL, TIDE_STREAM, TIDE_SURF, TIDE_DROPS, TIDEBOUND_HZ, TIDE_CLOCK_PERIOD, TIDE_RIPPLE_KIND,
  tideSprayArc, tideSprayAt, tideSpiralAt, tideShellPulse, tidePearlFlash, tideStreamAt, tideSurfLine, tideSurfAt, tideRippleAt,
  tideboundWhole, tideBeadDrift,
} from '../../src/render/armoryTide.js';
import { ARMORY_HOVER, ARMORY_BODY, armoryOpen } from '../../src/render/armoryHover.js';
import {
  ARMORY_PIECE_INDEX, ARMORY_HEAD, ARMORY_TRAIL, ARMORY_HZ, armoryDraws, armoryHeadTip, armoryPrograms, armoryRatesWhole, ArmoryRenderer,
} from '../../src/render/armoryPass.js';
import { AURA_CLOCK_PERIOD } from '../../src/render/auraRing.js';
import { newPose, poseFromFigure, poseFromBones, POSE_AT, ARMORY_BEAST_FIT } from '../../src/render/armoryPose.js';
import { stageLens, PREVIEW_STAGE } from '../../src/render/auraPreview.js';
import * as GL from '../../src/render/weaponGlowGlsl.js';
import * as WG from '../../src/systems/weaponGlow.js';
import { Renderer } from '../../src/render/renderer.js';
import { startWeaponPiecePreview } from '../../src/render/weaponPiecePreview.js';

const TIDE = ['tidecirclet', 'tidepearl', 'tidebracers', 'tidegreaves'];
const progOf = (/** @type {string} */ key) => armoryPrograms(ARMORY_PIECE_INDEX[key])[0];
const fsOf = (/** @type {string} */ key, /** @type {any} */ b = {}) => glslFunctions(progOf(key)[1], { uTime: 0, uSeed: 0, uScale: 1, uFace: 1, uR: [0.06, 0.05], uMesh: 0, uPart: 0, vS: [1, 0.25, 0, 0], ...b });
const vsOf = (/** @type {string} */ key, /** @type {any} */ b = {}) => glslFunctions(progOf(key)[0], { uTime: 0, uSeed: 0, uScale: 1, uR: [0.13, 0], uA: [0, 1.7, 0], uB: [0, 1.68, 0], uN: [0, 0, 1], uU: [0, 1, 0], uPart: 1, ...b });
const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-6) => Math.abs(a - b) <= eps;
const rig = () => ({ at: [0, 0, 0], yaw: 0, pose: newPose(), vel: [0, 0, 0] });
const EYE = [0, 1.6, 3];

test('TIDEBOUND each piece its own: its draws not the Eternal twin it was, its looks its own code and none of another line\'s; every rate and life whole over the clock', () => {
  const twin = { tidecirclet: 'eternalhalo', tidepearl: 'eternalsigil', tidebracers: 'eternalarmlets', tidegreaves: 'eternalgreaves' };
  for (const [tide, was] of Object.entries(twin)) {
    const a = armoryDraws(tide, rig(), EYE, true), b = armoryDraws(was, rig(), EYE, true);
    assert.ok(a.length > 0, `${tide} draws`);
    assert.notDeepEqual(a.map((d) => [d.mesh, d.part, d.count, d.r]), b.map((d) => [d.mesh, d.part, d.count, d.r]), `${tide}: not ${was}'s draws`);
  }
  // every tube, decal and card of a Tidebound piece is lit by tideLight, and no Eternal piece's look is reached
  const lit = { uKindle: 1, uFogMode: 0, vWorld: [0, 1, 0], uCamPos: [0, 1.6, 3] };
  for (const key of TIDE) {
    for (const mesh of [0, 1, 2]) {
      const f = fsOf(key, { ...lit, uMesh: mesh, uTime: 7.3, vS: [0.6, mesh === 1 ? 0 : 0.3, 0.8, 0] });
      f.globals.vP = [0.2, 0.3];
      f.armoryLook();
      const want = f.tideLight(), open = mesh === 0 ? armoryOpen(0.8) : 1;   // a tube's side toward the body fades (armoryHover.js)
      assert.ok(f.globals.o.slice(0, 3).every((x, i) => close(x, Math.max(want[i] * open, 0))), `${key}: its own look, mesh ${mesh}`);
    }
  }
  for (const key of ['eternalhalo', 'eternalsigil', 'eternalarmlets', 'eternalgreaves']) {
    const f = fsOf(key, { ...lit, uTime: 2 });
    f.globals.vP = [0.2, 0.3];
    const tl = f.tideLight();
    assert.deepEqual(tl, [0, 0, 0], `${key}: no Tidebound look in an Eternal program`);
  }
  assert.ok(tideboundWhole() && armoryRatesWhole());
  for (const r of Object.values(TIDEBOUND_HZ)) assert.ok(Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e9) / 1e9), `${r} whole`);
  assert.equal(TIDE_CLOCK_PERIOD, AURA_CLOCK_PERIOD, 'the auras\' clock');
  assert.ok(!Object.values(ARMORY_HZ).includes(TIDEBOUND_HZ.stream), 'its rates its own table');
});

test('TIDEBOUND the circlet: a ring of beads round the head the head\'s gap off it - at the brow, not over the head as the halo floats - tipped lower at the front, each bead drifting on its own; its spray leaps off the front in short arcs and falls back, a few at a time; the shader\'s spray and drift the law\'s', () => {
  const w = rig(), head = w.pose.pts[POSE_AT.head + 1], crown = w.pose.pts[POSE_AT.crown + 1];
  const [band, spray] = armoryDraws('tidecirclet', w, EYE, true);
  assert.equal(band.mesh, 0);
  assert.ok(band.A[1] > head && band.B[1] < crown, `at the brow, between the head's middle and its crown (${band.A[1].toFixed(3)}..${band.B[1].toFixed(3)})`);
  const tall = Math.hypot(...[0, 1, 2].map((i) => band.B[i] - band.A[i]));
  assert.ok(Math.abs(tall - TIDE_CIRCLET.band) < 1e-9 && band.r[0] === TIDE_CIRCLET.r && Math.abs(TIDE_CIRCLET.r - ARMORY_BODY.head - ARMORY_HOVER.head.gap) < 1e-12, 'a band its height, the head\'s gap round the head');
  assert.ok(band.B[2] > band.A[2], 'its axis tipped forward: its front sits lowest');
  const halo = armoryDraws('eternalhalo', w, EYE, true)[0];
  assert.ok(halo.A[1] > crown && band.B[1] < halo.A[1] - 0.1, 'the halo floats over the crown; the circlet round the brow');
  // each bead drifts on its own, its drift the shader's
  const f = fsOf('tidecirclet', { uTime: 3.3 });
  const drifts = [0, 1, 2, 3].map((id) => tideBeadDrift(id, 3.3));
  assert.ok(new Set(drifts.map((d) => d.toFixed(5))).size === 4 && drifts.every((d) => Math.abs(d) <= TIDE_CIRCLET.drift), `each its own (${drifts.map((d) => d.toFixed(4))})`);
  for (const id of [0, 5, 19, 20]) assert.ok(close(f.tideBeadDrift(id), tideBeadDrift(id, 3.3), 1e-9), `bead ${id}: the shader's drift the law's`);
  assert.ok(close(tideBeadDrift(7, 1.1), tideBeadDrift(7, 1.1 + TIDE_CLOCK_PERIOD), 1e-9) && close(tideBeadDrift(3, 0.5), tideBeadDrift(23, 0.5), 1e-12), 'whole at the wrap, and round the ring');
  assert.deepEqual([spray.mesh, spray.part, spray.count], [1, 1, TIDE_SPRAY.count]);
  assert.deepEqual(armoryDraws('tidecirclet', w, EYE, false).map((d) => d.mesh), [0], 'far: the band, no spray');
  // a plate over the head clears the band's back and the spray's top
  const tip = armoryHeadTip({ kit: 'c0000', pose: w.pose, at: [0, 0, 0], yaw: 0 });
  assert.ok(tip >= band.B[1] + TIDE_CIRCLET.spray - TIDE_CIRCLET.r * Math.sin(Math.atan(TIDE_CIRCLET.tilt)) + TIDE_CIRCLET.drop - 1e-9 && tip < armoryHeadTip({ kit: 'b0000', pose: w.pose, at: [0, 0, 0], yaw: 0 }), `clear of it, under the halo's (${tip.toFixed(3)})`);
  // a head leant back: the band all but level, its spray over its back - the plate over the spray
  const back = rig();
  back.pose.pts[POSE_AT.neck + 2] += 0.04;
  const [lean] = armoryDraws('tidecirclet', back, EYE, true), ay = (lean.B[1] - lean.A[1]) / Math.hypot(...[0, 1, 2].map((i) => lean.B[i] - lean.A[i]));
  const leanTip = /** @type {number} */ (armoryHeadTip({ kit: 'c0000', pose: back.pose, at: [0, 0, 0], yaw: 0 }));
  assert.ok(leanTip >= lean.B[1] + TIDE_CIRCLET.spray - lean.r[0] * Math.sqrt(1 - ay * ay) + TIDE_CIRCLET.drop - 1e-9, `over the spray of a band all but level (${leanTip.toFixed(3)})`);
  // the arc: off the band, up to its top half-way, back down; lit leaving, dark landing
  assert.deepEqual(tideSprayArc(0).slice(0, 2), [0, 0]);
  assert.ok(close(tideSprayArc(0.5)[0], TIDE_CIRCLET.spray) && close(tideSprayArc(1)[0], 0), 'up its height and back down');
  assert.ok(tideSprayArc(0.25)[0] < tideSprayArc(0.5)[0] && tideSprayArc(0.75)[0] < tideSprayArc(0.5)[0]);
  assert.ok(tideSprayArc(0.8)[1] > tideSprayArc(0.2)[1], 'drifting outward');
  assert.ok(tideSprayArc(0)[2] === 0 && tideSprayArc(1)[2] === 0 && tideSprayArc(0.4)[2] === 1, 'lit in the air alone');
  // a few at a time, from within the front, never the back; the same at the wrap
  let most = 0, none = 0;
  for (let i = 0; i < 400; i++) {
    const t = i * 0.13, up = [...Array(TIDE_SPRAY.count).keys()].map((k) => tideSprayAt(k, t, 0.37)).filter((s) => s[3] > 0);
    most = Math.max(most, up.length);
    if (!up.length) none++;
    for (const s of up) assert.ok(Math.abs(s[0]) <= TIDE_CIRCLET.spread && s[1] >= 0 && s[1] <= TIDE_CIRCLET.spray, 'off the front, never over its arc');
  }
  assert.ok(most <= 8 && most >= 3 && none < 40, `a few in the air at once (at most ${most}, none ${none} of 400)`);
  for (const k of [0, 3, 7]) assert.deepEqual(tideSprayAt(k, 2.2, 0.1).map((x) => +x.toFixed(9)), tideSprayAt(k, 2.2 + TIDE_CLOCK_PERIOD, 0.1).map((x) => +x.toFixed(9)), 'whole at the wrap');
  // the vertex shader's drops are the law's, placed off the band's front
  for (const [t, seed] of [[1.3, 0], [5.7, 0.37], [44.1, 0.8]]) {
    const vs = vsOf('tidecirclet', { uTime: t, uSeed: seed });
    for (let k = 0; k < TIDE_SPRAY.count; k++) {
      const g = vs.tideSpray(k), j = tideSprayAt(k, t, seed);
      assert.ok(g.every((x, i) => close(x, j[i], 1e-6)), `drop ${k} at ${t}: ${g} against ${j}`);
      const info = { value: [0, 0, 0, 0] }, c = vs.tideCardAt(k, info);
      if (j[3] > 0) assert.ok(c[3] > 0 && c[1] >= 1.7 - 1e-9 && c[2] > 0, 'a drop over the band\'s top, out front');
      else assert.equal(c[3], 0, 'none between its leaps');
    }
  }
});

test('TIDEBOUND the pearl: a nautilus on the chest - whorls on its spiral, chambers between - turning slowly, a light running in along it to the pearl at its eye, which flares as it arrives; the shader\'s the law\'s', () => {
  const S = TIDE_SHELL, G = Math.log(S.grow);
  const at = (/** @type {number} */ T, turn = 0, out = 0) => { const r = S.r0 * S.grow ** (T + out), a = (T + turn) * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a)]; };
  for (const T of [1.2, 1.7, 2.3, 2.9]) {
    const [x, y] = at(T), [q, w, tin] = tideSpiralAt(x, y, 0);
    assert.ok(w < 1e-6 || w > 1 - 1e-6, `a whorl at ${T} turns (w ${w})`);
    assert.ok(Math.abs(tin - T) < 1e-6 || Math.abs(tin + 1 - T) < 1e-6, 'its turns from the eye');
    const [, mid] = tideSpiralAt(...at(T, 0, 0.5), 0);
    assert.ok(close(mid, 0.5, 1e-6), 'half-way out between whorls');
    const [, turned] = tideSpiralAt(...at(T, 0.1), 0.1);
    assert.ok(turned < 1e-6 || turned > 1 - 1e-6, 'the shell turned, its whorl with it');
    assert.ok(close(q, Math.log(Math.hypot(x, y) / S.r0) / G - (((Math.atan2(y, x) / (2 * Math.PI)) % 1) + 1) % 1));
  }
  // the light runs in: the brightest turn along the spiral falls as the clock runs, from the rim to the eye
  const top = (/** @type {number} */ t) => [...Array(301).keys()].map((i) => (i / 300) * S.turns).reduce((b, T) => (tideShellPulse(T, t) > tideShellPulse(b, t) ? T : b), 0);
  const P = 1 / TIDEBOUND_HZ.shell;
  assert.ok(top(P * 0.2) > top(P * 0.5) && top(P * 0.5) > top(P * 0.8), `inward (${top(P * 0.2).toFixed(2)}, ${top(P * 0.5).toFixed(2)}, ${top(P * 0.8).toFixed(2)})`);
  assert.ok(tideShellPulse(top(P * 0.5) + 0.5, P * 0.5) > tideShellPulse(top(P * 0.5) - 0.5, P * 0.5), 'its tail behind it, outward');
  assert.ok(tidePearlFlash(P * 0.999) > 0.9 && tidePearlFlash(P * 0.5) < 0.01, 'the pearl flares as the light reaches it');
  assert.ok(Math.max(...[0, 1, 2, 3].map((T) => tideShellPulse(T, 0))) < 1e-6, 'no light at the hand-over, so none jumps');
  for (const t of [0.3, 2.2, 5.9]) assert.ok(close(tideShellPulse(1.4, t), tideShellPulse(1.4, t + TIDE_CLOCK_PERIOD), 1e-9) && close(tidePearlFlash(t), tidePearlFlash(t + TIDE_CLOCK_PERIOD), 1e-9), 'whole at the wrap');
  // the shader's spiral and light are the law's; a whorl lit, between whorls dark, the eye the pearl
  for (const t of [1.1, 3.4]) {
    const f = fsOf('tidepearl', { uTime: t, uMesh: 2, vS: [0, 0, 0, 0] });
    for (const p of [[0.3, 0.2], [-0.5, 0.41], [0.05, -0.7]]) {
      const g = f.tideSpiral(p, t * TIDEBOUND_HZ.turn), j = tideSpiralAt(p[0], p[1], t * TIDEBOUND_HZ.turn);
      assert.ok(g.every((x, i) => close(x, j[i], 1e-6)), `${p}: ${g} against ${j}`);
    }
    for (const T of [0.5, 1.5, 2.5]) assert.ok(close(f.tideShellPulse(T), tideShellPulse(T, t), 1e-9));
    assert.ok(close(f.tidePearlFlash(), tidePearlFlash(t), 1e-9));
    const lum = (/** @type {number[]} */ p) => { f.globals.vP = p; return f.shellLight().reduce((s, x) => s + x, 0); };
    const turn = t * TIDEBOUND_HZ.turn;
    assert.ok(lum(at(2.3, turn)) > 3 * lum(at(2.3, turn, 0.5)), 'its whorl bright, the chamber faint');
    assert.ok(lum([0, 0]) > 0.6, 'the pearl at its eye');
    assert.ok(lum(at(2.3, turn, 3)) === 0 && lum([0.99, 0.99]) === 0, 'nothing past its rim');
  }
  // on the chest alone: a decal and the pearl's glow, no back as the Sigil has
  const draws = armoryDraws('tidepearl', rig(), [0, 1.5, -3], true);
  assert.deepEqual(draws.map((d) => [d.mesh, d.size]), [[2, TIDE_SHELL.size], [1, 0]].map(([m, s]) => [m, m === 2 ? s : draws[1].size]));
  assert.ok(draws.every((d) => d.N[2] > 0) && draws[0].face === 0, 'facing forward, unseen from behind');
});

test('TIDEBOUND the bracers: a stream coiling round each forearm toward the hand - a sprite\'s upper arm about its band - its ripples running toward the hand, foam on their crests, drops off its end; the shader\'s flow the law\'s', () => {
  const w = rig(), pts = w.pose.pts;
  const tubes = armoryDraws('tidebracers', w, EYE, true).filter((d) => d.mesh === 0);
  assert.equal(tubes.length, 2, 'a stream on each arm');
  for (const d of tubes) {
    const side = d.A[0] < 0 ? 'L' : 'R', el = pts[POSE_AT[`el${side}`] + 1], wa = pts[POSE_AT[`wa${side}`] + 1];
    assert.ok(d.A[1] < el && d.A[1] > d.B[1] && d.B[1] > wa, 'the forearm, the elbow end first: it runs to the hand');
    assert.ok(close(d.r[0], TIDE_STREAM.fore + ARMORY_HOVER.arms.gap) && close(d.r[1], TIDE_STREAM.wrist + ARMORY_HOVER.arms.gap), 'the arms\' gap off the arm, narrowing to the wrist');
  }
  const drops = armoryDraws('tidebracers', w, EYE, true).filter((d) => d.mesh === 1);
  assert.ok(drops.length === 2 && drops.every((d, i) => close(d.A[1], tubes[i].B[1])), 'drops off each stream\'s end at the hand');
  const card = { ...rig(), pose: newPose() };
  poseFromFigure({ base: 0, mpp: 0.02 }, card.pose);
  const cardTubes = armoryDraws('tidebracers', card, EYE, true, [1, 0, 0]).filter((d) => d.mesh === 0);
  const sh = card.pose.pts[POSE_AT.shL + 1], el = card.pose.pts[POSE_AT.elL + 1];
  assert.ok(cardTubes.length >= 1 && cardTubes.every((d) => d.A[1] < sh && d.A[1] > d.B[1] && d.B[1] > el - 0.12), 'a sprite\'s on the upper arm, toward the elbow');
  // the law: the stream's middle at u = v x turns; a crest runs toward the hand; whole at the wrap
  const turns = 1.5, C = 0.4, L = 0.25;
  assert.ok(tideStreamAt(0.75, 0.5, turns, C, L, 0)[0] < 1e-9 && tideStreamAt(0.75 + TIDE_STREAM.half, 0.5, turns, C, L, 0)[0] > 0.999, 'its middle and its edge');
  const crestAt = (/** @type {number} */ t) => [...Array(200).keys()].map((i) => i / 200).filter((v) => v < 1 / TIDE_STREAM.ripples + 0.05).reduce((b, v) => (tideStreamAt(v * turns, v, turns, C, L, t)[1] > tideStreamAt(b * turns, b, turns, C, L, t)[1] ? v : b), 0);
  assert.ok(crestAt(0.1) > crestAt(0), 'its crest runs toward the hand');
  assert.ok(close(tideStreamAt(0.2, 0.3, turns, C, L, 1.3)[1], tideStreamAt(0.2, 0.3, turns, C, L, 1.3 + TIDE_CLOCK_PERIOD)[1], 1e-9));
  assert.ok(close(tideStreamAt(0.3, 0.4, turns, C, L, 0)[2], 0.4 + (((0.3 - 0.6 + 0.5) % 1) - 0.5) * turns * C * C / (turns * turns * C * C + L * L)), 'along: the point\'s place down the stream');
  const f = fsOf('tidebracers', { uTime: 3.7 });
  for (const [u, v] of [[0.1, 0.2], [0.6, 0.7], [0.95, 0.05]]) {
    const g = f.tideStream(u, v, turns, C, L), j = tideStreamAt(u, v, turns, C, L, 3.7);
    assert.ok(g.every((x, i) => close(x, j[i], 1e-6)), `${u}, ${v}`);
  }
  const lum = (/** @type {number} */ u, /** @type {number} */ v) => { f.globals.vP = [u, v]; return f.streamLight().reduce((s, x) => s + x, 0); };
  const tn = 0.25 / (TIDE_STREAM.pitch);
  assert.ok(lum(0.5 * tn % 1, 0.5) > 4 * lum((0.5 * tn + 0.5) % 1, 0.5), 'water on the stream, none off it');
});

test('TIDEBOUND the greaves: wavy lines of surf washing up from the ankle, slowing and fading as they rise, a new one each second; drops running back down; a ripple where a foot fell, on the ground; the shader\'s surf the law\'s', () => {
  const S = TIDE_SURF;
  const [h0, a0, l0] = tideSurfLine(0, 0.01), [h1, , l1] = tideSurfLine(0, 0.5), [h2, , l2] = tideSurfLine(0, 2.5);
  assert.ok(h0 < h1 && h1 < h2 && h2 <= S.top, 'rising from the ankle');
  assert.ok(h1 - h0 > tideSurfLine(0, 2.99)[0] - tideSurfLine(0, 2.5)[0], 'slowing as it rises');
  assert.ok(a0 < 0.01 && l1 > l2 && l2 > 0, 'fading as it goes');
  assert.ok(l0 < l1, 'and in as it starts');
  const born = [...Array(S.lines).keys()].map((j) => tideSurfLine(j, 0)[1]).sort();
  assert.deepEqual(born.map((a) => +a.toFixed(6)), [0, 1 / 3, 2 / 3].map((a) => +a.toFixed(6)), `${S.lines} alive, a second apart`);
  assert.equal(TIDEBOUND_HZ.surf, S.lines / S.life);
  for (const t of [0.4, 77.7]) assert.ok(close(tideSurfAt(0.3, 0.4, t), tideSurfAt(0.3, 0.4, t + TIDE_CLOCK_PERIOD), 1e-9), 'whole at the wrap');
  // a line is wavy round the leg: its height changes round it
  const t = 1.2, [h] = tideSurfLine(0, t);
  const peak = (/** @type {number} */ u) => [...Array(400).keys()].map((i) => i / 400).reduce((b, v) => (tideSurfAt(u, v, t) > tideSurfAt(u, b, t) ? v : b), 0);
  const heights = [0, 0.1, 0.2, 0.3].map(peak);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 0.03, `wavy, not a ring (${heights.map((x) => x.toFixed(3))})`);
  const hs = [...Array(S.lines).keys()].map((j) => tideSurfLine(j, t)[0]);
  assert.ok(hs.some((y) => Math.abs(peak(0) - y) < S.amp * 1.2) && h > 0, 'about a line\'s height');
  const f = fsOf('tidegreaves', { uTime: t, vS: [1, 0.4, 0, 0] });
  for (const tt of [t, 7.9, 101.3]) {
    f.globals.uTime = tt;
    for (const [u, v] of [[0, 0.3], [0.13, 0.45], [0.4, 0.62], [0.77, 0.21], [0.9, 0.7]]) assert.ok(close(f.tideSurf(u, v)[0], tideSurfAt(u, v, tt), 1e-6), `the shader's foam the law's at ${u}, ${v}, ${tt}`);
  }
  f.globals.uTime = t;
  const lum = (/** @type {number} */ u, /** @type {number} */ v) => { f.globals.vP = [u, v]; return f.surfLight().reduce((s, x) => s + x, 0); };
  for (const u of [0, 0.25, 0.6]) {
    const on = peak(u);
    assert.ok(lum(u, on) > 0.5 && lum(u, on) > 3 * lum(u, Math.min(0.99, on + 0.12)), `${u}: the shader's foam on the law's line`);
  }
  // the tube, the drops and the ripples
  const w = rig(), d = armoryDraws('tidegreaves', w, EYE, true);
  assert.deepEqual(d.map((x) => [x.mesh, x.part]), [[0, 0], [1, 1], [0, 0], [1, 1], [1, 2]]);
  const G = ARMORY_HOVER.legs.gap, bob = ARMORY_HOVER.legs.bob;
  assert.ok(d[0].A[1] > 0.06 && d[0].A[1] < 0.1 + bob && d[0].B[1] > 0.4 && close(d[0].r[0], S.foot + G) && close(d[0].r[1], S.knee + G), 'over the foot to the knee, the legs\' gap round the leg');
  assert.equal(d[4].count, ARMORY_TRAIL, 'a ripple a footfall');
  assert.deepEqual(armoryDraws('tidegreaves', { ...w, mounted: true }, EYE, true), [], 'a rider\'s legs are the horse\'s');
  const sprite = { ...rig(), pose: newPose() };
  poseFromFigure({ base: 0, mpp: 0.02 }, sprite.pose);
  const sr = armoryDraws('tidegreaves', sprite, EYE, true, [1, 0, 0])[0].r;
  assert.ok(close(sr[0], (S.foot + G) * sprite.pose.scale) && close(sr[1], (S.knee + G) * sprite.pose.scale), 'a sprite\'s round its painted leg as a rig\'s, at its scale');
  assert.deepEqual([S.foot, S.knee, S.from], [ARMORY_BODY.ankle, ARMORY_BODY.shin, 0.2]);
  // a ripple spreads and fades
  const ringAt = (/** @type {number} */ a) => [...Array(200).keys()].map((i) => i / 200).reduce((b, x) => (tideRippleAt(x, a) > tideRippleAt(b, a) ? x : b), 0);
  assert.ok(ringAt(0.1) < ringAt(0.4) && ringAt(0.4) < ringAt(0.8), 'spreading');
  assert.ok(tideRippleAt(ringAt(0.2), 0.2) > tideRippleAt(ringAt(0.8), 0.8) && tideRippleAt(ringAt(1), 1) === 0, 'and fading');
  const fc = fsOf('tidegreaves', { uMesh: 1, vS: [0.3, TIDE_RIPPLE_KIND, 1, 0] });
  for (const x of [0.2, 0.45, 0.7]) { fc.globals.vP = [x, 0]; assert.ok(close(fc.tideCardLight()[1] / fc.tideRamp(0.8)[1], tideRippleAt(x, 0.3) * 0.75, 1e-6), `the shader's ripple at ${x}`); }
  // the vertex shader lays a ripple flat on the ground, the trail's own place; any other card faces the eye
  const corners = (/** @type {number} */ kind) => [[0, 0], [1, 0], [1, 1]].map(([u, v]) => {
    const vs = glslFunctions(progOf('tidegreaves')[0], { uMesh: 1, uPart: kind === TIDE_RIPPLE_KIND ? 2 : 1, uTime: 0.5, uSeed: 0, uScale: 1, uLift: 0, uR: [0.1, 0], uA: [0, 0.06, 0], uB: [0, 0.46, 0], uN: [0, 0, 1], uU: [0, 1, 0], uVel: [0, 0, 0], uSize: 0, uCamPos: [0, 1.6, 3], uCamRight: [1, 0, 0], uCamUp: [0, 1, 0], uVP: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], uTrail: Array.from({ length: ARMORY_TRAIL }, (_, i) => (i === 0 ? [0.3, 0, 0.2, 0.5] : [0, 0, 0, -1])), aP: [u, v] });
    vs.main();
    return vs.globals.vWorld;
  });
  const flat = corners(TIDE_RIPPLE_KIND);
  assert.ok(flat.every((p) => close(p[1], 0.01, 1e-9)) && Math.abs(flat[2][2] - flat[0][2]) > 0.1, `on the ground (${flat.map((p) => p.map((x) => x.toFixed(3)))})`);
});

test('TIDEBOUND the pass hands the greaves their footfalls, as the Cinderstride its embers; the wolf wears the torso, arm and leg pieces fitted to it', () => {
  const log = [];
  const gl = new Proxy({}, { get: (_, k) => (typeof k === 'string' && /^[A-Z][A-Z_0-9]*$/.test(k) ? 1 : (...a) => { log.push([k, ...a]); return k === 'getExtension' ? null : k === 'getUniformLocation' ? { name: a[1] } : {}; }) });
  const pass = new ArmoryRenderer(/** @type {any} */ (gl));
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const wearer = (/** @type {string} */ kit) => ({ kit, at: [0, 0, 0], yaw: 0, pose: newPose(), kindle: 1, torn: -1, _d: 3, trail: new Float32Array(ARMORY_TRAIL * 4).fill(-1) });
  for (const [kit, trailed] of [['000c0', true], ['000a0', true], ['000b0', false]]) {
    log.length = 0;
    pass.draw([wearer(kit)], I, I, EYE, 1, null, true);
    assert.equal(log.some((c) => c[0] === 'uniform4fv' && c[1]?.name === 'uTrail'), trailed, `${kit}: footfalls ${trailed ? '' : 'not '}handed`);
  }
  const bones = { 'bip01 head': [0, 1.65, 0.3], 'bip01 neck': [0, 1.5, 0.2], 'bip01 spine2': [0.08, 1.3, 0], 'bip01 l upperarm': [-0.25, 1.42, 0.1], 'bip01 r upperarm': [0.25, 1.42, 0.1] };
  const wolf = newPose();
  poseFromBones(bones, wolf, true);
  for (const key of ['tidepearl', 'tidebracers', 'tidegreaves']) assert.ok(armoryDraws(key, { at: [0, 0, 0], yaw: 0, pose: wolf }, EYE, true).length > 0, `${key} on the wolf`);
  const [arm] = armoryDraws('tidebracers', { at: [0, 0, 0], yaw: 0, pose: wolf }, EYE, true);
  assert.ok(close(arm.r[0], (TIDE_STREAM.fore * wolf.arm + ARMORY_HOVER.arms.gap) * ARMORY_BEAST_FIT, 1e-6), 'the arms\' gap round the wolf\'s wider arm, at its scale');
  const [leg] = armoryDraws('tidegreaves', { at: [0, 0, 0], yaw: 0, pose: wolf }, EYE, true);
  assert.ok(Math.abs(leg.B[1] - wolf.pts[POSE_AT.ftL + 1]) <= ARMORY_HOVER.legs.bob * ARMORY_BEAST_FIT + 1e-9, 'the wolf\'s topped at the hock, give or take its bob');
  const pass2 = new ArmoryRenderer(/** @type {any} */ (gl));
  pass2.draw([{ ...wearer('ccec0'), torn: 1 }], I, I, EYE, 1, null, true);
  assert.equal(pass2.drawn, 3, 'turned beast: the pearl, the bracers and the greaves, never the circlet');
  assert.equal(TIDE_DROPS.flight < 1, true);
});

test('TIDEBOUND the Edge: the edge\'s code in a skin of its own - a swell whose crests run toward the tip, a bright skin and foam, drops falling off the weapon - in every drawer; the wire\'s word and the field key unchanged in kind', () => {
  const spec = WG.glowSpec('tide', WG.ARMORY_LEVEL), edge = WG.glowSpec('edge', WG.ARMORY_LEVEL);
  assert.deepEqual([spec.code, spec.skin, spec.word, edge.skin], [WG.GLOW_CODE.edge, GL.GLOW_TIDE.skin, 'tide2', 0]);
  assert.deepEqual(WG.GLOW_SKIN, { tide: GL.GLOW_TIDE.skin });
  assert.deepEqual(spec.win, GL.GLOW_SPRITE_WINDOW.tide);
  assert.ok(GL.glowFieldReach('tide') === GL.GLOW_REACH_MAX.tide + GL.GLOW_TIDE.slack && spec.win[0] > edge.win[0], 'its field reaches its drops');
  for (const s of Object.values(WG.GLOW_LOOKS).slice(1)) assert.equal(WG.glowSpec(s, s === 'arcane' || s === 'brand' || s === 'edge' || s === 'gilded' ? 2 : 1).skin, 0, `${s}: its own pattern`);
  // the field key: a code under 8, its skin a bit of its own, the cuts and the cells their own - no two fields share one
  const keys = new Set();
  for (const code of [1, 2, 3, 4, 5, 6, 7]) for (const skin of [0, 1]) for (const cutL of [false, true]) for (const cutR of [false, true]) for (const [aw, ah] of [[60, 48], [48, 60], [4095, 1], [1, 4095], [320, 200]]) keys.add(GL.glowFieldKey({ code, skin }, cutL, cutR, aw, ah));
  assert.equal(keys.size, 7 * 2 * 4 * 5, 'every field its own key');
  assert.ok(WG.GLOW_LOOKS.length <= 8, 'no code passes the key\'s 8');
  assert.notEqual(GL.glowFieldKey(spec, false, false, 60, 48), GL.glowFieldKey(edge, false, false, 60, 48), 'the Tidebound Edge\'s field not the Eternal\'s');
  // the swell: its crests run toward the tip (up), its reach within its most; the shader's the law's; whole at the wrap
  const crest = (/** @type {number} */ t) => [...Array(240).keys()].map((i) => i / 20).reduce((b, y) => (GL.tideEdgeCrest(0, y, t) > GL.tideEdgeCrest(0, b, t) ? y : b), 0);
  assert.ok(crest(0.1) > crest(0), `toward the tip (${crest(0).toFixed(2)} to ${crest(0.1).toFixed(2)})`);
  let most = 0;
  for (let i = 0; i < 2000; i++) most = Math.max(most, GL.tideEdgeReach((i * 7.3) % 40, (i * 3.1) % 60, i * 0.07, 2));
  assert.ok(most <= GL.GLOW_REACH_MAX.tide + 1e-9 && most > GL.GLOW_REACH_MAX.tide - 0.1, `its most ${most}`);
  const glsl = glslFunctions(GL.GLOW_SPRITE_FS, { uRamp: [[0.1, 0.6, 0.6], [0.4, 0.8, 0.8], [0.9, 1, 1], [1, 1, 1]], uGlowSkin: 1 });
  for (const [x, y, t] of [[3, 7, 0.2], [-5, 22, 13.7], [11, -4, 200.1]]) {
    assert.ok(close(glsl.gwTideReach([x, y], t, 2), GL.tideEdgeReach(x, y, t, 2), 1e-5), `the shader's swell at ${x}, ${y}`);
    assert.ok(close(glsl.gwReach(6, [x, y], t, 2), GL.tideEdgeReach(x, y, t, 2), 1e-5), 'the edge\'s code, its skin');
    assert.ok(close(GL.tideEdgeReach(x, y, t, 2), GL.tideEdgeReach(x, y, t + GL.GLOW_CLOCK_PERIOD, 2), 1e-9), 'whole at the wrap');
  }
  glsl.globals.uGlowSkin = 0;
  assert.ok(!close(glsl.gwReach(6, [3, 7], 0.2, 2), GL.tideEdgeReach(3, 7, 0.2, 2), 1e-3), 'skin 0: the Eternal Edge\'s own line');
  // its skin bright at the band's outer cell, foam on a crest's; the teal body under it
  glsl.globals.uGlowSkin = 1;
  const t = 0.4, top = [...Array(120).keys()].map((i) => i / 10).reduce((b, y) => (GL.tideEdgeCrest(0, y, t) > GL.tideEdgeCrest(0, b, t) ? y : b), 0);
  const R = GL.tideEdgeReach(0, top, t, 2);
  assert.deepEqual(glsl.gwShade(6, 0.5 / R, [0, top], t, 2).slice(0, 3), [1, 1, 1], 'foam on the crest\'s skin');
  const trough = top + GL.GLOW_TIDE.wave / 2, Rt = GL.tideEdgeReach(0, trough, t, 2);
  assert.deepEqual(glsl.gwShade(6, 0.5 / Rt, [0, trough], t, 2).slice(0, 3), [0.4, 0.8, 0.8], 'the glass of the skin in a trough');
  assert.deepEqual(glsl.gwShade(6, 0.95, [0, top], t, 2).slice(0, 3), [0.1, 0.6, 0.6], 'the teal body by the weapon');
  // a drop falls a cell a step, GLOW_TIDE.fall steps a second
  let seen = 0;
  for (let x = 0; x < 30; x++) for (let y = 0; y < 30; y++) if (glsl.gwDrip([x, y], 1.01, 2)) { seen++; assert.equal(glsl.gwDrip([x, y - 1], 1.01 + 1 / GL.GLOW_TIDE.fall, 2), true, 'a cell lower a step later'); }
  assert.ok(seen > 9 && seen < 120, `a few (${seen} of 900)`);
  // under the weapon only: a solid cell straight above, in the field's rows
  const field = (/** @type {number} */ solidRow) => ({ texelFetch: (/** @type {string} */ s, /** @type {number[]} */ c) => [0.5, 0, s === 'uField' && c[1] === solidRow ? 1 : 0, 1], textureSize: () => [64, 64] });
  const under = glslFunctions(GL.GLOW_SPRITE_FS, { uFieldAt: [0, 0], ...field(10) });
  assert.equal(under.gwUnder([5, 14]), true, 'below it');
  assert.equal(under.gwUnder([5, 6]), false, 'above it');
  assert.equal(under.gwUnder([5, 10 + Math.ceil(GL.glowFieldReach('tide')) + 1]), false, 'past its reach');
  // the Morrowind pass: the edge's rings, and its drops shifted down under it
  const rings = GL.glowRingDraws('tide'), edgeRings = GL.glowRingDraws('edge');
  assert.deepEqual(rings.slice(0, edgeRings.length), edgeRings);
  const drops = rings.slice(edgeRings.length);
  assert.ok(drops.length === GL.GLOW_TIDE.drops.length * 3 && drops.every((d) => d.ring === -1 && d.shift[1] < 0) && rings.length <= GL.GLOW_DRAWS_MAX);
  assert.ok(GL.glowReach('tide') >= Math.max(...GL.GLOW_TIDE.drops), 'a picture padded for them');
  const mesh = glslFunctions(GL.GLOW_MESH_FS, {});
  assert.ok(GL.GLOW_MESH_FS.includes('gwDrip(c, t, lv)') && typeof mesh.gwDrip === 'function');
});

test('TIDEBOUND the Edge\'s skin in every drawer: the classic sprite, the world picture and the Morrowind pass set it; the weapon piece\'s stage too', () => {
  const log = [];
  let id = 0;
  const stub = new Proxy({}, {
    get: (o, k) => {
      if (k === 'getProgramParameter' || k === 'getShaderParameter') return () => true;
      if (k === 'getUniformLocation') return (/** @type {any} */ p, /** @type {string} */ name) => ({ uniform: name });
      if (typeof k === 'string' && k.startsWith('create')) return () => ({ id: ++id, kind: k });
      if (k === 'drawingBufferWidth') return 800;
      if (k === 'drawingBufferHeight') return 600;
      if (typeof k === 'string' && k.toUpperCase() === k) return k;
      return (/** @type {any[]} */ ...args) => { log.push([k, ...args]); };
    },
  });
  const r = new Renderer({ getContext: () => stub, clientWidth: 800, clientHeight: 600, width: 800, height: 600 });
  const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  r.beginFrame(I, I, new Float32Array([0, 1, 0]));
  const skinSet = () => log.filter((c) => c[0] === 'uniform1i' && c[1]?.uniform === 'uGlowSkin').map((c) => c[2]);
  for (const [look, want] of [['tide', 1], ['edge', 0]]) {
    log.length = 0;
    r.drawScreenQuadGlow({ id: `frame-${look}` }, { x: 100, y: 50, w: 300, h: 240 }, undefined, WG.glowSpec(look, 2), { art: [60, 48], view: [800, 600] });
    assert.deepEqual(skinSet(), [want], `the classic sprite: ${look}`);
  }
  // one frame drawn with both: two fields, never the Eternal's read for the Tidebound's
  log.length = 0;
  const tex = { id: 'both' };
  r.drawScreenQuadGlow(tex, { x: 100, y: 50, w: 300, h: 240 }, undefined, WG.glowSpec('edge', 2), { art: [60, 48], view: [800, 600] });
  r.drawScreenQuadGlow(tex, { x: 100, y: 50, w: 300, h: 240 }, undefined, WG.glowSpec('tide', 2), { art: [60, 48], view: [800, 600] });
  assert.equal(log.filter((c) => c[0] === 'texImage2D').length, 2, 'a field for each');
  // the Morrowind pass
  log.length = 0;
  const mesh = { ranges: [{ first: 0, count: 3, slot: 'weapon', tex: null, hidden: false }], weaponGlow: WG.glowSpec('tide', 2) };
  r._glowVpW = 400; r._glowVpH = 450;
  r._drawWeaponGlow(mesh, I, null, false);
  assert.deepEqual(skinSet(), [1], 'the Morrowind pass');
  assert.ok(log.some((c) => c[0] === 'uniform1f' && c[1]?.uniform === 'uSkin'), 'its skinning uniform its own still');
  // the world picture
  r.textures = r.textures ?? new Map();
  r.textures.set('back', { id: 'back' });
  r._proj = I; r._view = I; r._bbCullOff = true;
  log.length = 0;
  r.drawBillboardGlow('back', WG.glowSpec('tide', 2), { origin: [0, 0, -2], right: [1, 0, 0], up: [0, 1, 0], w: 1, h: 2, art: [40, 80] });
  assert.deepEqual(skinSet(), [1], 'the world picture');
  // the weapon piece's stage, the Cabinet's and the shop's
  for (const [look, want] of [['tide', 1], ['edge', 0]]) {
    log.length = 0;
    const canvas = { getContext: () => stub, clientWidth: 300, clientHeight: 400, width: 0, height: 0, isConnected: true };
    const stage = startWeaponPiecePreview(/** @type {any} */ (canvas), WG.glowSpec(look, 2), { now: () => 3 });
    stage?.step();
    assert.deepEqual(skinSet(), [want], `the stage: ${look}`);
    stage?.stop();
  }
});

test('TIDEBOUND up close: a single piece\'s stage draws the camera in on its slot, from where it stands - the same middle and share its still cuts', () => {
  assert.deepEqual(stageLens(null), { lookY: PREVIEW_STAGE.lookY, fov: PREVIEW_STAGE.fov }, 'no focus: the stage\'s own');
  const half = Math.tan(PREVIEW_STAGE.fov / 2);
  const head = stageLens({ y: 0.21, zoom: 3.2 });
  assert.ok(close(Math.tan(head.fov / 2), half / 3.2, 1e-12), 'a share 1/zoom of the frame');
  assert.ok(close(head.lookY, PREVIEW_STAGE.lookY + (1 - 0.42) * half * PREVIEW_STAGE.dist, 1e-12) && head.lookY > 1.6, `at the head (${head.lookY.toFixed(2)} m)`);
  assert.ok(stageLens({ y: 0.79, zoom: 2.3 }).lookY < 0.5, 'the legs low');
  assert.equal(stageLens({ y: 0.5, zoom: 0.5 }).fov, PREVIEW_STAGE.fov, 'never wider than the stage');
});
