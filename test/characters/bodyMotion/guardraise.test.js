// GUARD-RAISE (2026-11-07, src/characters/bodyMotion/guardElbows.js): the fists' guard stands the fists before the chin,
// not pressed into the chest - measured on a woman's body (the vendored xbase_anim_female) in the game's own idlehh pose
// (Morrowind Animation Overhaul's clip, as the game plays it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGuardElbows, GUARD_RAISE } from '../../../src/characters/bodyMotion/guardElbows.js';
import { bodyOf } from '../../../src/characters/bodyMotion/bodyKit.js';
import { bodyFrames } from '../../../src/characters/bodyMotion/bodySolve.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { extractTracks, collectTextKeys, normalizeTextKeys, sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { MW_WEAPON_TYPE as T } from '../../../src/formats/morrowind/mwFirstPerson.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sk = buildSkeleton(parseNif(readFileSync(join(ROOT, 'vendor/weapon-sheathing/Data Files/Animations/xbase_anim_female/xbase_anim_sh.nif'))));
const kf = parseNif(readFileSync(join(ROOT, 'Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf')));
const keys = normalizeTextKeys(collectTextKeys(kf)), tracks = extractTracks(kf);
const sm = (s, pose, root, refs) => skeletonSpaceMatrices(s, pose, root, refs);
const body = bodyOf(sk, GRAPH_ROOT, sm);
const fists = { on: true, mwType: T.HandToHand, shown: true, hands: 'single' };
const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

/** each fist and elbow in the chest's frame (right, forward, up; arm lengths), and the arm's two lengths */
function measure(pose) {
  const M = sm(sk, pose, GRAPH_ROOT), F = bodyFrames(body, M), C = M.get(body.chest).t;
  const loc = (ref) => { const d = sub(M.get(ref).t, C); return [dot(d, F.right), dot(d, F.fwd), dot(d, F.up)].map((v) => v / body.arm); };
  const out = {};
  for (const s of ['L', 'R']) {
    const b = body.bones[s], S = M.get(b.upper).t, E = M.get(b.fore).t, W = M.get(b.hand).t;
    out[s] = { fist: loc(b.hand), elbow: loc(b.fore), l1: Math.hypot(...sub(E, S)), l2: Math.hypot(...sub(W, E)), turn: [...M.get(b.hand).a] };
  }
  return out;
}

test('GUARD-RAISE: the game\'s guard (idlehh) stands its fists at the chest; raised, before the chin, each on its own side, the elbows below (mutant: no raise, or a fist across the middle)', () => {
  const time = keys.find((k) => k.text === 'idlehh: start').time + 0.3;
  const pose = poseSkeleton(sk, tracks, sampleTrack, time);
  const before = measure(pose);
  // the guard the constants were measured on
  for (const s of ['L', 'R']) assert.ok(Math.abs(before[s].fist[2] - GUARD_RAISE.from[s][2]) < 0.1, `${s} fist at the chest: ${before[s].fist}`);
  const g = createGuardElbows();
  for (let i = 0; i < 120; i++) g.step(1 / 60, true, fists);
  g.apply(sk, pose, GRAPH_ROOT, sm);
  const after = measure(pose);
  for (const s of ['L', 'R']) {
    const a = after[s], side = s === 'L' ? -1 : 1;
    assert.ok(a.fist[2] > before[s].fist[2] + 0.15 && a.fist[2] > 0.2, `${s} fist raised toward the chin: ${a.fist}`);
    assert.ok(side * a.fist[0] > 0.05, `${s} fist on its own side of the middle: ${a.fist}`);
    assert.ok(a.fist[1] > 0.3, `${s} fist before the face: ${a.fist}`);
    assert.ok(a.elbow[2] < a.fist[2] - 0.2, `${s} elbow below its fist: ${a.elbow} / ${a.fist}`);
    assert.ok(Math.abs(a.l1 - before[s].l1) < 1e-3 && Math.abs(a.l2 - before[s].l2) < 1e-3, 'the arm keeps its lengths');
    assert.ok(a.turn.every((v, i) => Math.abs(v - before[s].turn[i]) < 1e-3), `${s} fist keeps its turn in the world`);
  }
});

test('GUARD-RAISE: no share, no raise - a blow or a weapon leaves the arms the clip\'s', () => {
  const time = keys.find((k) => k.text === 'idlehh: start').time + 0.3;
  const pose = poseSkeleton(sk, tracks, sampleTrack, time), before = measure(pose);
  const g = createGuardElbows();
  for (let i = 0; i < 120; i++) g.step(1 / 60, true, { ...fists, mwType: T.LongBladeOneHand });
  g.apply(sk, pose, GRAPH_ROOT, sm);
  const after = measure(pose);
  for (const s of ['L', 'R']) assert.deepEqual(after[s].fist, before[s].fist);
});


test('ordinary movement releases the raised guard; a stop restores it smoothly', () => {
  const guard = createGuardElbows();
  const moving = { ...fists, speed: 4, forward: 1 };
  for (let i = 0; i < 120; i++) guard.step(1 / 60, true, moving);
  assert.equal(guard.status(), 0);
  guard.step(1 / 60, true, fists);
  assert.ok(guard.status() > 0 && guard.status() < 0.3);
  for (let i = 0; i < 120; i++) guard.step(1 / 60, true, fists);
  assert.equal(guard.status(), 1);
  for (const running of [false, true]) for (const [forward, strafe] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    for (let i = 0; i < 120; i++) guard.step(1 / 60, true, { ...moving, forward, strafe, running });
    assert.equal(guard.status(), 0);
  }
});
