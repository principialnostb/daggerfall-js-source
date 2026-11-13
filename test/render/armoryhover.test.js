// The hover law: every body piece of the Aura Armory floats its slot's gap off the part it belongs to, bobbing on a phase
// of its own and trailing its wearer's motion; a ring tips loose and turns slowly, and fades on its side toward the body;
// the law's fade and turn held to the shader that draws them, run here by the GLSL evaluator; every rate whole over the
// auras' clock, so nothing jumps at its wrap; and each piece on a rig, the Morrowind body, a sprite and the wolf placed by it.
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glslFunctions } from '../glsl.mjs';
import {
  ARMORY_HOVER, ARMORY_BODY, ARMORY_HOVER_HZ, ARMORY_LAG, ARMORY_OPEN, armoryPhase, armoryBob, armoryLag, armoryHoverAt,
  armoryRingAxis, armoryInward, armoryOpen, armorySpin, armoryHoverWhole, armorySpinPer, ARMORY_HOVER_GLSL,
} from '../../src/render/armoryHover.js';
import {
  armoryDraws, armoryHeadTip, armoryPrograms, armoryRatesWhole, ARMORY_PIECE_INDEX, ARMORY_HEAD, ARMORY_RINGS, ARMORY_ARMLET,
  ARMORY_SPURS, ARMORY_SPUR_ROOT, ARMORY_BODY_PIECES, ARMORY_EMBER_FALL, ArmoryRenderer,
} from '../../src/render/armoryPass.js';
import { TIDE_CIRCLET, TIDE_SURF, TIDE_STREAM, tideBeadDrift } from '../../src/render/armoryTide.js';
import { AURA_CLOCK_PERIOD } from '../../src/render/auraRing.js';
import { kitLookY, PREVIEW_STAGE } from '../../src/render/auraPreview.js';
import { newPose, poseFromBones, poseFromFigure, poseWorld, POSE_AT, ARMORY_BONES, ARMORY_BEAST_FIT } from '../../src/render/armoryPose.js';
import { ARMORY_PIECES } from '../../src/net/armoryLaw.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../src/formats/morrowind/mwSkin.js';
import { armBonesInBody } from '../../src/combat/fpArm.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';

const EYE = [0, 1.6, 3];
const close = (/** @type {number} */ a, /** @type {number} */ b, eps = 1e-9) => Math.abs(a - b) <= eps;
const sub = (/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (/** @type {ArrayLike<number>} */ a, /** @type {ArrayLike<number>} */ b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (/** @type {ArrayLike<number>} */ a) => Math.hypot(a[0], a[1], a[2]);
const mid = (/** @type {any} */ d) => [0, 1, 2].map((i) => (d.A[i] + d.B[i]) / 2);
/** How far `p` stands from the line through `a` and `b`. */
const offLine = (/** @type {number[]} */ p, /** @type {number[]} */ a, /** @type {number[]} */ b) => {
  const d = sub(b, a), l = len(d), u = [d[0] / l, d[1] / l, d[2] / l], v = sub(p, a), k = dot(v, u);
  return len(sub(v, [u[0] * k, u[1] * k, u[2] * k]));
};
const kitOf = (/** @type {string} */ key) => { const p = ARMORY_PIECES[ARMORY_PIECE_INDEX[key]]; return ['head', 'torso', 'arms', 'legs', 'weapon'].map((s) => (s === p.slot ? p.code : '0')).join(''); };
const fsOf = (/** @type {string} */ key, /** @type {any} */ b = {}) => glslFunctions(armoryPrograms(ARMORY_PIECE_INDEX[key])[0][1], { uTime: 0, uSeed: 0, uScale: 1, uFace: 1, uR: [0.11, 0.11], uMesh: 0, uPart: 0, vS: [0.5, 0.05, 0, 0], ...b });
const mwPose = () => {
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const p = newPose();
  poseFromBones(armBonesInBody({ skeleton: sk, mats: skeletonSpaceMatrices(sk, new Map(), GRAPH_ROOT) }, ARMORY_BONES), p);
  return p;
};
const BODIES = /** @type {const} */ ([['the rest pose', () => newPose()], ['the Morrowind body', mwPose]]);

test('HOVER the law: a gap a slot, a hand\'s width or less; a bob on each piece\'s and side\'s own phase; the lag behind the motion no more than its share of the gap; every rate whole over the auras\' clock (mutants: a gap of nought; every piece in step; the lag unbounded; a rate off the clock)', () => {
  for (const slot of /** @type {const} */ (['head', 'torso', 'arms', 'legs'])) {
    const H = ARMORY_HOVER[slot];
    assert.ok(H.gap >= 0.04 && H.gap <= 0.1, `${slot}: a gap of 4 to 10 cm (${H.gap})`);
    assert.ok(H.bob > 0 && H.bob < H.gap / 3, `${slot}: a bob well inside the gap`);
  }
  assert.ok(armoryHoverWhole() && armoryRatesWhole(), 'every rate whole');
  for (const r of Object.values(ARMORY_HOVER_HZ)) assert.ok(Number.isInteger(Math.round(r * AURA_CLOCK_PERIOD * 1e9) / 1e9), `${r} whole`);
  // the phases: each piece's and each side's own, in 0..1
  const phases = ARMORY_BODY_PIECES.flatMap((k) => [0, 1, 4, 5].map((s) => armoryPhase(k, s)));
  assert.ok(phases.every((p) => p >= 0 && p < 1) && new Set(phases.map((p) => p.toFixed(6))).size === phases.length, 'no two the same');
  assert.equal(armoryPhase('ashbound', 1), armoryPhase('ashbound', 1), 'the same each frame');
  // the bob: within its height, through its whole swing, the same across the wrap
  const samples = [...Array(240).keys()].map((i) => armoryBob('arms', 0.3, i * 0.05));
  assert.ok(Math.max(...samples) <= ARMORY_HOVER.arms.bob + 1e-12 && Math.max(...samples) > ARMORY_HOVER.arms.bob * 0.95 && Math.min(...samples) < -ARMORY_HOVER.arms.bob * 0.95, 'up and down its height');
  for (const slot of /** @type {const} */ (['head', 'torso', 'arms', 'legs'])) assert.ok(close(armoryBob(slot, 0.7, 0.01), armoryBob(slot, 0.7, 0.01 + AURA_CLOCK_PERIOD), 1e-9), `${slot}: whole at the wrap`);
  // the lag: none standing; behind the motion, as fast as it is up to its most
  assert.deepEqual(armoryLag('torso', [0, 0, 0]), [-0, -0]);
  assert.deepEqual(armoryLag('torso', null), [-0, -0], 'no motion known: none');
  const slow = armoryLag('torso', [1, 0, 0]), fast = armoryLag('torso', [0, 0, -40]);
  assert.ok(close(slow[0], -ARMORY_LAG.s) && slow[1] === -0, 'behind a slow walk, by its seconds of it');
  assert.ok(close(fast[1], ARMORY_LAG.share * ARMORY_HOVER.torso.gap) && fast[0] === -0, 'at a run, no more than its share of the gap');
  assert.ok(close(armoryLag('legs', [0, 0, 40], 2)[1], -ARMORY_LAG.share * ARMORY_HOVER.legs.gap * 2), 'the share at the body\'s scale');
  const h = armoryHoverAt('head', 0.25, 0, [2, 0, 0], 1.5);
  assert.ok(close(h[1], ARMORY_HOVER.head.bob * 1.5) && h[0] < 0 && h[2] === -0, 'its bob up at the body\'s scale, its lag behind');
});

test('HOVER a loose ring: tipped its tilt off the limb toward a side that turns round it, whole at the wrap; the way in toward the body square to the limb (mutants: the tilt unturned; the axis off its tilt; the way in along the limb)', () => {
  const d = [0, -1, 0], fwd = [0, 0, 1];
  for (const t of [0, 1.7, 9.3]) {
    const ax = armoryRingAxis(d, fwd, 0.24, 1 / 20, 0.1, t);
    assert.ok(close(len(ax), 1, 1e-12) && close(Math.acos(dot(ax, d)), 0.24, 1e-9), `tipped its tilt at ${t}`);
  }
  const a0 = armoryRingAxis(d, fwd, 0.24, 1 / 20, 0.1, 0), a5 = armoryRingAxis(d, fwd, 0.24, 1 / 20, 0.1, 5);
  assert.ok(len(sub(a0, a5)) > 0.05, 'its tilt turning round the limb');
  assert.ok(close(len(sub(armoryRingAxis(d, fwd, 0.24, 1 / 20, 0.1, 0.3), armoryRingAxis(d, fwd, 0.24, 1 / 20, 0.1, 0.3 + AURA_CLOCK_PERIOD))), 0, 1e-9), 'whole at the wrap');
  assert.deepEqual(armoryRingAxis([0, 1, 0], [0, 1, 0], 0, 0, 0, 0), [0, 1, 0], 'a limb along its own reference: still its own way');
  const inn = armoryInward([0.25, 1.2, 0], [0, 1.5, 0.1], d);
  assert.ok(close(dot(inn, d), 0, 1e-12) && inn[0] < -0.9 && close(len(inn), 1, 1e-12), 'toward the body, square to the arm');
  assert.deepEqual(armoryInward([0, 1, 0], [0, 2, 0], [0, 1, 0]), [0, 0, 0], 'the body on the line: none');
});

test('HOVER the shader\'s fade and turn are the law\'s: a ring lit away from the body and dark facing it; a pattern turned at its rate, whole at the wrap (mutants: the fade reversed; the turn the other way; a turn off the clock)', () => {
  const f = fsOf('ashbound');
  for (const c of [-1, 0, ARMORY_OPEN.from, 0.5, ARMORY_OPEN.to, 1]) assert.ok(close(f.armoryOpen(c), armoryOpen(c), 1e-9), `the fade at ${c}`);
  assert.ok(armoryOpen(-0.5) === 1 && armoryOpen(1) === 0 && armoryOpen(0.5) > 0 && armoryOpen(0.5) < 1, 'whole away from the body, none facing it');
  for (const [u, hz, t] of [[0.2, 1 / 12, 3.1], [0.9, 1 / 12, 118.4], [0.5, 1 / 8, 47.2]]) {
    f.globals.uTime = t;
    assert.ok(close(f.armorySpin(u, Number(armorySpinPer(hz))), armorySpin(u, hz, t), 1e-9), `the turn at ${u}, ${t}`);
    assert.ok(close(armorySpin(u, hz, t), armorySpin(u, hz, t + AURA_CLOCK_PERIOD), 1e-9), 'whole at the wrap');
  }
  assert.ok(armorySpin(0.5, 1 / 12, 1) < 0.5, 'turning one way');
  assert.equal(armorySpinPer(1 / 12), '12.0');
  assert.ok(ARMORY_HOVER_GLSL.includes('uTime / per'), 'the period divides exactly');
  // every tube's light is faded by it, as the shader reads its facing toward the body; a card's never
  for (const key of ['ashbound', 'eternalarmlets', 'cinderstride', 'eternalgreaves', 'tidebracers', 'tidegreaves']) {
    const lit = { uKindle: 1, uFogMode: 0, vWorld: [0, 1, 0], uCamPos: [0, 1.6, 3], uTime: 2.2 };
    const away = fsOf(key, { ...lit, vS: [0.5, 0.05, -0.6, 0] }), toward = fsOf(key, { ...lit, vS: [0.5, 0.05, 0.95, 0] });
    for (const g of [away, toward]) { g.globals.vP = [0.03, 0.2]; g.armoryLook(); }
    assert.ok(toward.globals.o.slice(0, 3).every((x) => x === 0), `${key}: dark facing the body`);
  }
});

test('HOVER the vertex shader hands a tube its facing toward the body - the way in (uIn) on its surface - and nought with none (mutants: the facing never handed; its sign reversed)', () => {
  const vs = (/** @type {number[]} */ uIn, /** @type {number[]} */ aP) => {
    const v = glslFunctions(armoryPrograms(ARMORY_PIECE_INDEX.ashbound)[0][0], { uMesh: 0, uPart: 0, uTime: 0, uSeed: 0, uScale: 1, uLift: 0, uR: [0.11, 0.11], uA: [0, 1, 0], uB: [0, 1.05, 0], uN: [0, 0, 1], uU: [0, 1, 0], uIn: uIn, uVel: [0, 0, 0], uSize: 0, uCamPos: [0, 1.6, 3], uCamRight: [1, 0, 0], uCamUp: [0, 1, 0], uVP: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], uTrail: Array.from({ length: 8 }, () => [0, 0, 0, -1]), aP });
    v.main();
    return v.globals.vS[2];
  };
  // u = 0 toward uN (+z); a quarter round, +x
  assert.ok(close(vs([1, 0, 0], [0.25, 0.5]), 1, 1e-6) || close(vs([1, 0, 0], [0.25, 0.5]), -1, 1e-6), 'square on, toward it or away');
  assert.ok(close(vs([0, 0, 1], [0, 0.5]), 1, 1e-6) && close(vs([0, 0, 1], [0.5, 0.5]), -1, 1e-6), 'facing the body, and facing away');
  assert.ok(close(vs([0, 0, 0], [0.3, 0.5]), 0, 1e-12), 'no way in: nought - none of it fades');
});

test('HOVER every body piece on the rest pose and the Morrowind body floats its slot\'s gap off its part: the crown and the halo over the head\'s top, the circlet round the head, the chest\'s pieces before its face and the Sigil\'s twin off its back, the rings wider than their limbs, the plate and the spurs off the arm (mutants: a gap left off; a ring on its limb; the plate on the arm; a spur rooted on the skin)', () => {
  for (const [name, make] of BODIES) {
    const pose = make(), w = { at: [0, 0, 0], yaw: 0, pose, seed: 0.37, vel: [0, 0, 0] }, t = 5.3;
    const pt = (/** @type {string} */ n) => /** @type {number[]} */ (poseWorld(pose, n, w.at, 0, [0, 0, 0]));
    const draws = (/** @type {string} */ k) => armoryDraws(k, w, EYE, true, null, t);
    const crownY = pt('crown')[1], G = (/** @type {'head'|'torso'|'arms'|'legs'} */ s) => ARMORY_HOVER[s].gap, B = (/** @type {'head'|'torso'|'arms'|'legs'} */ s) => ARMORY_HOVER[s].bob;
    // the head
    const [band] = draws('burningcrown');
    assert.ok(band.A[1] >= crownY + G('head') - B('head') - 1e-9 && band.A[1] <= crownY + G('head') + B('head') + 1e-9, `${name}: the crown the head's gap over its top`);
    const H = ARMORY_HEAD.eternalhalo, halo = draws('eternalhalo')[0], c = mid(halo), axis = sub(halo.B, halo.A).map((v) => v / len(sub(halo.B, halo.A)));
    const lowest = c[1] - H.r * Math.sqrt(1 - axis[1] * axis[1]) - (len(sub(halo.B, halo.A)) / 2) * axis[1];
    assert.ok(lowest >= crownY + G('head') - B('head') - 1e-6, `${name}: the halo's lowest the head's gap over the head's top (${(lowest - crownY).toFixed(3)})`);
    const ring = draws('tidecirclet')[0];
    const up = sub(pt('head'), pt('neck')).map((v, _, a) => v / len(a)), brow = pt('head').map((v, i) => v + up[i] * TIDE_CIRCLET.brow);
    assert.ok(close(ring.r[0], ARMORY_BODY.head + G('head')) && len(sub(mid(ring), brow)) < B('head') + 1e-9, `${name}: the circlet round the head at the brow, the gap off it`);
    // the torso
    for (const key of ['emberheart', 'eternalsigil', 'tidepearl']) {
      const plate = draws(key).find((d) => d.mesh === 2);
      assert.ok(close(plate.A[2] - pt('chest')[2], G('torso'), 1e-9), `${name} ${key}: the torso's gap before the chest's face`);
    }
    const back = draws('eternalsigil').filter((d) => d.mesh === 2)[1];
    assert.ok(close(pt('chest')[2] - back.A[2], ARMORY_BODY.back + G('torso'), 1e-9), `${name}: the Sigil's twin the gap off the back`);
    // the arms: every ring wider than its arm by the gap, at most a bob and a tilt off its line
    for (const key of ['ashbound', 'eternalarmlets']) {
      for (const d of draws(key).filter((x) => x.mesh === 0)) {
        const side = d.A[0] < 0 ? 'L' : 'R', m = mid(d), upper = m[1] > pt(`el${side}`)[1] - 0.02;
        const reach = upper ? ARMORY_BODY.upper : ARMORY_BODY.fore;
        assert.ok(close(d.r[0], reach + G('arms')), `${name} ${key}: its ring the arm's reach and the gap round`);
        assert.ok(offLine(m, pt(upper ? `sh${side}` : `el${side}`), pt(upper ? `el${side}` : `wa${side}`)) < B('arms') + 1e-6, `${name} ${key}: round its arm's line`);
        assert.ok(len(d.I) > 0.99 && d.I[0] * (side === 'L' ? 1 : -1) > 0, `${name} ${key}: open toward the body`);
      }
    }
    const coil = draws('tidebracers').filter((d) => d.mesh === 0);
    assert.ok(coil.every((d) => close(d.r[0], TIDE_STREAM.fore + G('arms')) && close(d.r[1], TIDE_STREAM.wrist + G('arms'))), `${name}: the stream the gap round the forearm`);
    const plate = draws('insigniaarmlet').find((d) => d.part === 1), shL = pt('shL'), elL = pt('elL');
    assert.ok(offLine(plate.B, shL, elL) > ARMORY_BODY.upper + G('arms') - B('arms'), `${name}: the crest plate beside the arm, the gap off it`);
    for (const d of draws('crystalspurs')) {
      const side = d.A[0] < 0 ? 'L' : 'R', fore = ARMORY_SPURS[d.part].seg === 'fore';
      const off = offLine(d.A, pt(fore ? `el${side}` : `sh${side}`), pt(fore ? `wa${side}` : `el${side}`));
      assert.ok(off > ARMORY_SPUR_ROOT + G('arms') - B('arms') && off < ARMORY_SPUR_ROOT + G('arms') + 0.04, `${name}: spur ${d.part} rooted the gap off the arm (${off.toFixed(3)})`);
    }
    // the legs: every ring the shin's reach and the gap round, up the shin
    for (const key of ['cinderstride', 'eternalgreaves']) {
      const rings = draws(key).filter((d) => d.mesh === 0);
      assert.equal(rings.length, ARMORY_RINGS[/** @type {'cinderstride'} */ (key)].shin.length * 2, `${name} ${key}: its rings on both shins`);
      for (const d of rings) {
        const side = d.A[0] < 0 ? 'L' : 'R';
        assert.ok(d.r[0] >= ARMORY_BODY.shin + G('legs') - 1e-9 && d.r[0] <= ARMORY_BODY.ankle + G('legs') + 1e-9, `${name} ${key}: the gap round the shin`);
        assert.ok(d.A[1] > pt(`ft${side}`)[1] - 0.06 && d.B[1] < pt(`kn${side}`)[1], `${name} ${key}: between the foot and the knee`);
      }
    }
    const surf = draws('tidegreaves')[0];
    assert.ok(close(surf.r[0], TIDE_SURF.foot + G('legs')) && close(surf.r[1], TIDE_SURF.knee + G('legs')), `${name}: the surf's sleeve the gap round the leg`);
  }
});

test('HOVER each piece and side bobs on its own: the two arms\' rings and the two shins\' at different heights at one moment, the same piece each frame; a wearer\'s pieces trail its motion and the footfalls stay on the ground (mutants: one phase for both sides; the lag forward; the footfall embers floating)', () => {
  const w = { at: [0, 0, 0], yaw: 0, pose: newPose(), seed: 0.37, vel: [0, 0, 0] };
  const rest = (/** @type {string} */ k) => armoryDraws(k, { ...w, seed: 0 }, EYE, true, null, 0);
  for (const key of ['ashbound', 'eternalarmlets', 'cinderstride', 'tidebracers', 'tidegreaves']) {
    const dy = [0.7, 2.6].flatMap((t) => {
      const tubes = armoryDraws(key, w, EYE, true, null, t).filter((d) => d.mesh === 0), half = tubes.length / 2;
      return tubes.slice(0, half).map((d, i) => d.A[1] - tubes[half + i].A[1]);
    });
    assert.ok(dy.some((v) => Math.abs(v) > 1e-3), `${key}: its sides not in step (${dy.map((v) => v.toFixed(4))})`);
    assert.deepEqual(armoryDraws(key, w, EYE, true, null, 2.6).map((d) => d.A), armoryDraws(key, w, EYE, true, null, 2.6).map((d) => d.A), `${key}: the same each frame`);
  }
  assert.ok(rest('ashbound').length > 0);
  // running forward (+z): every piece shifted back, by no more than its share of its gap; the trail's cards where they fell
  for (const key of ['burningcrown', 'emberheart', 'ashbound', 'cinderstride']) {
    const still = armoryDraws(key, w, EYE, true, null, 3), run = armoryDraws(key, { ...w, vel: [0, 0, 6] }, EYE, true, null, 3);
    const slot = /** @type {'head'|'torso'|'arms'|'legs'} */ (ARMORY_PIECES[ARMORY_PIECE_INDEX[key]].slot);
    run.forEach((d, i) => {
      const shift = d.A[2] - still[i].A[2];
      if (key === 'cinderstride' && d.mesh === 1 && d.part === 1) { assert.equal(shift, 0, 'its footfall embers on the ground, where the feet fell'); return; }
      if (d.mesh === 1) return;   // its embers, ash and sparks in the air, left where they rise and fall
      assert.ok(shift < 0 && -shift <= ARMORY_LAG.share * ARMORY_HOVER[slot].gap + 1e-9, `${key}: trailing the run (${shift.toFixed(4)})`);
    });
  }
});

test('HOVER nothing jumps at the clock\'s wrap: every piece\'s draws a hair before it and a hair after are a hair apart (mutants: a bob, a tilt or a spin off the clock)', () => {
  const w = { at: [0, 0, 0], yaw: 0, pose: newPose(), seed: 0.37, vel: [0, 0, 0] };
  for (const key of ARMORY_BODY_PIECES) {
    const a = armoryDraws(key, w, EYE, true, null, AURA_CLOCK_PERIOD - 1e-4), b = armoryDraws(key, w, EYE, true, null, 1e-4);
    assert.equal(a.length, b.length);
    a.forEach((d, i) => {
      assert.ok(len(sub(d.A, b[i].A)) < 1e-3 && len(sub(d.B, b[i].B)) < 1e-3 && len(sub(d.N, b[i].N)) < 1e-2, `${key} draw ${i}: a hair apart`);
    });
  }
});

test('HOVER a head piece\'s tip holds still: over everything its piece draws at every moment of its bob, on the rest pose and the Morrowind body, and over the head by its gap (mutants: the tip at the bob\'s middle; the gap left out of it)', () => {
  for (const [name, make] of BODIES) {
    const pose = make();
    for (const key of ['burningcrown', 'eternalhalo', 'tidecirclet']) {
      const w = { at: [0, 0, 0], yaw: 0, pose, seed: 0.37, vel: [0, 0, 0], kit: kitOf(key) };
      const tip = /** @type {number} */ (armoryHeadTip(w));
      for (let i = 0; i < 40; i++) {
        const top = Math.max(...armoryDraws(key, w, EYE, true, null, i * 0.31).filter((d) => d.mesh === 0).map((d) => Math.max(d.A[1], d.B[1])));
        assert.ok(top <= tip + 1e-9, `${name} ${key}: its draws under its tip (${top.toFixed(3)} at ${tip.toFixed(3)})`);
      }
      assert.ok(tip > pose.pts[POSE_AT.crown + 1] + ARMORY_HOVER.head.gap - (key === 'tidecirclet' ? 0.1 : 0), `${name} ${key}: over the head by its gap`);
    }
  }
});

test('HOVER the Ember Heart\'s embers fly out on the beat and fall clear below it; the head\'s measures the hover\'s (mutants: the embers rising; the halo sunk to the head)', () => {
  const vs = glslFunctions(armoryPrograms(ARMORY_PIECE_INDEX.emberheart)[0][0], { uMesh: 1, uPart: 2, uTime: 0.95, uSeed: 0, uScale: 1, uLift: 0, uR: [0, 0], uA: [0, 1.2, 0.2], uB: [0, 1.2, 0.2], uN: [0, 0, 1], uU: [0, 1, 0], uIn: [0, 0, 0], uVel: [0, 0, 0], uSize: 0, uCamPos: [0, 1.6, 3], uCamRight: [1, 0, 0], uCamUp: [0, 1, 0], uVP: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], uTrail: Array.from({ length: 8 }, () => [0, 0, 0, -1]) });
  for (let k = 0; k < 8; k++) {
    const info = { value: [0, 0, 0, 0] }, c = vs.cardAt(k, info);
    assert.ok(c[1] < 1.2 - ARMORY_EMBER_FALL * 0.5 && c[2] > 0.2, `ember ${k} late in its life: fallen below the heart, out before it (${c.map((v) => v.toFixed(3))})`);
  }
  assert.ok(close(ARMORY_HEAD.eternalhalo.lift, ARMORY_HOVER.head.gap + ARMORY_HEAD.eternalhalo.r * Math.sin(Math.atan(ARMORY_HEAD.eternalhalo.tilt)) + 0.012, 1e-12), 'the halo lifted so its lowest point clears the head by the gap');
  assert.ok(close(TIDE_CIRCLET.r, ARMORY_BODY.head + ARMORY_HOVER.head.gap, 1e-12));
  assert.ok(ARMORY_ARMLET.size > 0 && ARMORY_ARMLET.turn > 0 && ARMORY_ARMLET.turn < Math.PI / 2);
});

test('HOVER a sprite\'s pieces: its head\'s the gap over the painted head, its arms\' rings the painted arm\'s half and the gap round, its plate beside the arm; the wolf\'s fitted at its scale (mutants: the card\'s rings as wide as the arm; the wolf\'s gap a person\'s)', () => {
  const card = newPose();
  poseFromFigure({ base: 0, mpp: 0.02 }, card);
  const w = { at: [0, 0, 0], yaw: 0, pose: card, seed: 0.37, vel: [0, 0, 0] }, right = [1, 0, 0];
  const crown = armoryDraws('burningcrown', w, EYE, true, right, 1)[0];
  assert.ok(crown.A[1] >= card.pts[POSE_AT.crown + 1] + (ARMORY_HOVER.head.gap - ARMORY_HOVER.head.bob) * card.scale - 1e-9, 'the crown over the painted head by the gap');
  const rings = armoryDraws('ashbound', w, EYE, true, right, 1).filter((d) => d.mesh === 0);
  assert.ok(rings.length === 4 && rings.every((d) => close(d.r[0], (ARMORY_BODY.upper + ARMORY_HOVER.arms.gap) * card.scale)), 'the upper arm\'s rings, the gap round it');
  const coil = armoryDraws('tidebracers', w, EYE, true, right, 1).filter((d) => d.mesh === 0);
  assert.ok(coil.length === 2 && coil.every((d) => close(d.r[0], (TIDE_STREAM.upper + ARMORY_HOVER.arms.gap) * card.scale)), 'its stream the gap round the upper arm');
  // the wolf: its scale on its reach and its gap alike
  const bones = { 'bip01 head': [0, 1.65, 0.3], 'bip01 neck': [0, 1.5, 0.2], 'bip01 spine2': [0.08, 1.3, 0], 'bip01 l upperarm': [-0.25, 1.42, 0.1], 'bip01 r upperarm': [0.25, 1.42, 0.1] };
  const wolf = newPose();
  poseFromBones(bones, wolf, true);
  const [heart] = armoryDraws('emberheart', { at: [0, 0, 0], yaw: 0, pose: wolf, vel: [0, 0, 0] }, EYE, true, null, 0);
  assert.ok(close(heart.A[2] - wolf.pts[POSE_AT.chest + 2], ARMORY_HOVER.torso.gap * ARMORY_BEAST_FIT, 1e-9), 'the wolf\'s heart its gap, at its scale');
});

test('HOVER the preview stage keeps a floating crown in its frame: a kit worn alone looks up by as far as its head piece stands over the stage\'s top, any other kit or none as it was (mutants: the crown cut off; every kit looked up to)', () => {
  const pose = newPose(), tip = /** @type {number} */ (armoryHeadTip({ kit: 'a0000', pose }));
  assert.ok(tip > PREVIEW_STAGE.top && close(kitLookY('a0000', 0.95), 0.95 + tip - PREVIEW_STAGE.top, 1e-12), 'the crown over the top: looked up to');
  for (const kit of ['c0000', '0a000', '00b00', null]) assert.equal(kitLookY(kit, 0.95), 0.95, `${kit}: as it was`);
  assert.ok(/** @type {number} */ (armoryHeadTip({ kit: 'c0000', pose })) < PREVIEW_STAGE.top, 'the circlet stays under it');
});

test('HOVER the two sides of a piece bob nowhere near in step: a ring piece\'s left and right a tenth of a bob or more apart (mutants: the phase\'s hash unmixed - two parts a character apart all but in step)', () => {
  const apart = (/** @type {number} */ a, /** @type {number} */ b) => { const x = Math.abs(a - b) % 1; return Math.min(x, 1 - x); };
  for (const key of ['ashbound', 'eternalarmlets', 'cinderstride', 'eternalgreaves']) for (const [l, r] of [[0, 4], [1, 5]]) assert.ok(apart(armoryPhase(key, l), armoryPhase(key, r)) >= 0.1, `${key} ${l}/${r}`);
  for (const key of ['tidebracers', 'tidegreaves']) assert.ok(apart(armoryPhase(key, 0), armoryPhase(key, 1)) >= 0.1, key);
  for (let j = 0; j < 5; j++) assert.ok(apart(armoryPhase('crystalspurs', j), armoryPhase('crystalspurs', 8 + j)) >= 0.02, `spur ${j}`);
});

test('HOVER the pass hands each draw its way toward the body and the clock: a ring\'s uIn set and not nought, a piece\'s place moving with the clock (mutants: uIn never set; the clock never handed to the draws)', () => {
  const log = /** @type {any[]} */ ([]);
  const gl = new Proxy({}, { get: (_, k) => (typeof k === 'string' && /^[A-Z][A-Z_0-9]*$/.test(k) ? 1 : (/** @type {any[]} */ ...a) => { log.push([k, ...a]); return k === 'getExtension' ? null : k === 'getUniformLocation' ? { name: a[1] } : {}; }) });
  const pass = new ArmoryRenderer(/** @type {any} */ (gl)), I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const wearer = (/** @type {string} */ kit) => ({ kit, at: [0, 0, 0], yaw: 0, pose: newPose(), kindle: 1, torn: -1, _d: 3, seed: 0.37 });
  pass.draw([wearer('00a00')], I, I, EYE, 1, null, true);
  const ins = log.filter((c) => c[0] === 'uniform3fv' && c[1]?.name === 'uIn').map((c) => Array.from(c[2]));
  assert.ok(ins.some((v) => len(v) > 0.99), `a ring's way in handed (${ins.length})`);
  const placeAt = (/** @type {number} */ s) => { log.length = 0; pass.draw([wearer('a0000')], I, I, EYE, s, null, true); return Array.from(log.find((c) => c[0] === 'uniform3fv' && c[1]?.name === 'uA')[2]); };
  assert.ok(Math.abs(placeAt(1)[1] - placeAt(2.2)[1]) > 1e-4, 'the crown bobbing with the clock');
});

test('HOVER a crystal spur spins slowly on its own line and sways round the arm; a circlet\'s bead is drawn where it has drifted (mutants: the spur unspun; the spur unswayed; the drift left out of the look)', () => {
  const w = { at: [0, 0, 0], yaw: 0, pose: newPose(), seed: 0.37, vel: [0, 0, 0] };
  const a = armoryDraws('crystalspurs', w, EYE, true, null, 0.5), b = armoryDraws('crystalspurs', w, EYE, true, null, 1.5);
  assert.ok(a.every((d, i) => len(sub(d.N, b[i].N)) > 0.05), 'each spun a little in a second');
  const dir = (/** @type {any} */ d) => sub(d.B, d.A).map((v, _, x) => v / len(x));
  assert.ok(a.every((d, i) => len(sub(dir(d), dir(b[i]))) > 1e-3), 'and swayed');
  // the front bead (the pearl) drifted up: its top edge lit where it has moved, dark where it would stand undrifted
  const t = [...Array(400).keys()].map((i) => i * 0.01).reduce((q, x) => (tideBeadDrift(0, x) > tideBeadDrift(0, q) ? x : q), 0);
  const H = TIDE_CIRCLET.band, rad = 0.62 * TIDE_CIRCLET.bead, f = fsOf('tidecirclet', { uTime: t, uR: [TIDE_CIRCLET.r, TIDE_CIRCLET.r], vS: [1, H, 0, 0] });
  const lum = (/** @type {number} */ y) => { f.globals.vP = [0, 0.5 + y / H]; return f.circletLight().reduce((s, x) => s + x, 0); };
  const up = tideBeadDrift(0, t);
  assert.ok(up > TIDE_CIRCLET.drift * 0.9 && lum(up + rad * 0.7) > 0.2 && lum(-rad * 0.7) < lum(up + rad * 0.7) * 0.2, `drawn where it drifted (${up.toFixed(4)})`);
});
