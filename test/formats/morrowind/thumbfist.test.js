import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THUMB_FIST, isThumbBone, thumbShare, thumbCentres, thumbMoves, movedThumb, createThumbFist } from '../../../src/formats/morrowind/mwThumbFist.js';
import { firstPersonHandsSource } from '../../../src/formats/morrowind/mwBetterBodiesPaths.js';

// THUMB-FIST (2026-10-26, Mac: "Robert's hands everywhere but the thumb of a clenched fist" - then: "copying the vanilla
// thumb whole does not fit; correct Robert's own, it is too long and oddly bent"). Measured on the data, each thumb
// bone's own frame (xbase_anim.1st.kf "idlehh"): Better Hands' tip 2.08 out against Better Bodies' 2.04, but its
// flesh 0.4-0.5 off each phalanx's axis. Each phalanx is moved by that, its shape kept, never lengthened.

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const HAND = 1, THUMB = 2;
const IDENT = () => ({ a: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: [0, 0, 0] });

/** A tube along +x from a0 to a1 (radius r); its vertices at x > 0 ride the thumb, offset `off` across it (y). */
function tube({ a0 = -2, a1 = 4, r = 1, off = 0, rings = 6, k = 10 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i < rings; i++) {
    const a = a0 + (a1 - a0) * (i / (rings - 1));
    for (let j = 0; j < k; j++) { const t = (j / k) * 2 * Math.PI; pos.push(a, r * Math.cos(t) + (a > 0 ? off : 0), r * Math.sin(t)); }
  }
  for (let i = 0; i + 1 < rings; i++) for (let j = 0; j < k; j++) { const p = i * k + j, q = i * k + ((j + 1) % k); idx.push(p, q, p + k, q, q + k, p + k); }
  const n = pos.length / 3, hand = [], thumb = [];
  for (let v = 0; v < n; v++) (pos[v * 3] > 0 ? thumb : hand).push(v);
  return { name: 'Tri Left Hand', positions: Float32Array.from(pos), normals: null, indices: Uint16Array.from(idx),
    skin: { bones: [
      { ref: HAND, name: 'Bip01 L Hand', invBind: IDENT(), indices: hand, weights: hand.map(() => 1) },
      { ref: THUMB, name: 'Bip01 L Finger01', invBind: IDENT(), indices: thumb, weights: thumb.map(() => 1) },
    ] } };
}
/** The fist: the thumb bone turned `deg` about z through the origin; skinBatch the plain linear blend. */
function fistPose(deg = 30) {
  const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  const mats = new Map([[HAND, IDENT()], [THUMB, { a: Float32Array.from([c, -s, 0, s, c, 0, 0, 0, 1]), t: [0, 0, 0] }]]);
  const skinBatch = (batch, _sk, _pose, m, out) => {
    out.fill(0);
    for (const b of batch.skin.bones) {
      const M = m.get(b.ref), B = b.invBind;
      for (let q = 0; q < b.indices.length; q++) {
        const v = b.indices[q], w = b.weights[q];
        const x = batch.positions[v * 3], y = batch.positions[v * 3 + 1], z = batch.positions[v * 3 + 2];
        const p = [0, 1, 2].map((i) => B.a[i * 3] * x + B.a[i * 3 + 1] * y + B.a[i * 3 + 2] * z + B.t[i]);
        for (let i = 0; i < 3; i++) out[v * 3 + i] += w * (M.a[i * 3] * p[0] + M.a[i * 3 + 1] * p[1] + M.a[i * 3 + 2] * p[2] + M.t[i]);
      }
    }
  };
  return { skeleton: null, pose: null, mats, skinBatch };
}
const skinned = (batch, pose) => { const o = new Float32Array(batch.positions.length); pose.skinBatch(batch, null, null, pose.mats, o); return o; };
const near = (a, b, eps = 1e-4) => a.every((x, i) => Math.abs(x - b[i]) < eps);

test('THUMB-FIST: the thumb\'s bones and each vertex\'s share of them', () => {
  for (const n of ['Bip01 L Finger0', 'Bip01 L Finger01', 'Bip01 R Finger02']) assert.equal(isThumbBone(n), true, n);
  for (const n of ['Bip01 L Finger1', 'Bip01 L Finger12', 'Bip01 L Hand', 'Bip01 L Finger03x']) assert.equal(isThumbBone(n), false, n);
  const s = thumbShare(tube());
  assert.equal(s[0], 0, 'a palm vertex');
  assert.equal(s[s.length - 1], 1, 'a thumb tip');
});

test('THUMB-FIST: a phalanx\'s flesh centre is read in its own bone\'s frame - the same whatever the pose', () => {
  const t = tube({ off: 0.5 });
  const a = thumbCentres(t, fistPose(0)).get('bip01 l finger01'), b = thumbCentres(t, fistPose(40)).get('bip01 l finger01');
  assert.ok(near(a, b), `${a} / ${b}`);
  assert.ok(Math.abs(a[1] - 0.5) < 1e-4, 'its offset off the axis');
});

test('THUMB-FIST: the moves - how far the hand\'s flesh stands from the reference\'s, never out along the bone', () => {
  const pose = fistPose(30);
  const m = thumbMoves(tube({ off: 0.5 }), tube({ off: 0 }), pose).get('bip01 l finger01');
  assert.ok(near(m, [0, -0.5, 0]), `back onto the axis (${m})`);
  const longer = tube({ a1: 6 }), shorter = tube({ a1: 4 });
  assert.equal(thumbMoves(shorter, longer, pose).get('bip01 l finger01')[0], 0, 'never made longer');
  assert.ok(thumbMoves(longer, shorter, pose).get('bip01 l finger01')[0] < 0, 'a longer one drawn in');
  assert.equal(thumbMoves(tube(), { ...tube(), skin: { bones: [] } }, pose).size, 0, 'no shared bone: nothing');
  assert.equal(thumbMoves(tube({ r: 1 }), tube({ r: 0.6 }), pose).has('bip01 l hand'), false, 'the thumb\'s bones alone - never the palm');
});

test('THUMB-FIST: the hand\'s thumb moved, its own shape kept - the palm untouched, and back through its own skin', () => {
  const pose = fistPose(30);
  const hand = tube({ off: 0.5 }), ref = tube({ off: 0, r: 0.7, rings: 8, k: 16 });
  const positions = movedThumb(hand, thumbMoves(hand, ref, pose), pose);
  assert.ok(positions);
  assert.notEqual(positions, hand.positions, 'its own copy - the mesh is never written');
  const o = skinned({ ...hand, positions }, pose), before = skinned(hand, pose), s = thumbShare(hand);
  const thumbVerts = [];
  for (let v = 0; v < s.length; v++) {
    if (s[v] === 0) { assert.ok(near([o[v * 3], o[v * 3 + 1], o[v * 3 + 2]], [before[v * 3], before[v * 3 + 1], before[v * 3 + 2]], 1e-5), 'the palm as it was'); continue; }
    thumbVerts.push(v);
  }
  // the centre where the reference's is, in the bone's frame; the thumb's own shape - its vertices' spacing - kept
  const c = thumbCentres({ ...hand, positions }, pose).get('bip01 l finger01');
  assert.ok(Math.abs(c[1]) < 1e-3, `onto the axis (${c})`);
  const d = (q, a, b) => Math.hypot(q[a * 3] - q[b * 3], q[a * 3 + 1] - q[b * 3 + 1], q[a * 3 + 2] - q[b * 3 + 2]);
  for (let i = 1; i < thumbVerts.length; i++) assert.ok(Math.abs(d(o, thumbVerts[0], thumbVerts[i]) - d(before, thumbVerts[0], thumbVerts[i])) < 1e-4, 'its shape its own');
  assert.equal(movedThumb(hand, new Map(), pose), null, 'no moves: nothing');
});

test('THUMB-FIST: a gauntlet hand on the same bones takes the same moves, its plate keeping its thickness', () => {
  const pose = fistPose(30);
  const moves = thumbMoves(tube({ off: 0.5 }), tube({ off: 0 }), pose);
  const plate = tube({ r: 1.3, off: 0.5 });
  const g = movedThumb(plate, moves, pose);
  const c = thumbCentres({ ...plate, positions: g }, pose).get('bip01 l finger01');
  assert.ok(Math.abs(c[1]) < 1e-3, 'moved with the thumb');
  const o = skinned({ ...plate, positions: g }, pose), before = skinned(plate, pose), s = thumbShare(plate);
  let first = -1;
  for (let v = 0; v < s.length; v++) {
    if (s[v] === 0) continue;
    if (first < 0) { first = v; continue; }
    const d = (q) => Math.hypot(q[v * 3] - q[first * 3], q[v * 3 + 1] - q[first * 3 + 1], q[v * 3 + 2] - q[first * 3 + 2]);
    assert.ok(Math.abs(d(o) - d(before)) < 1e-4, 'the plate whole');
  }
});

test('THUMB-FIST: the rig eases each piece between its authored and its fist positions over THUMB_FIST.ease', () => {
  const open = Float32Array.from([0, 0, 0, 1, 1, 1]), fist = Float32Array.from([2, 0, 0, 1, 1, 3]);
  const batch = { positions: open };
  const piece = { batch, fistPositions: fist };
  const tf = createThumbFist([piece, { batch: { positions: new Float32Array(3) }, fistPositions: new Float32Array(6) }]);
  assert.equal(tf.count(), 1, 'a piece whose sets differ in size is left alone');
  assert.notEqual(piece.batch, batch, 'the piece takes its own batch');
  assert.equal(batch.positions, open, 'the parsed one is never written');
  tf.step(THUMB_FIST.ease / 2, true);
  const mid = piece.batch.positions[0];
  assert.ok(mid > 0 && mid < 2, `half-way in (${mid})`);
  tf.step(THUMB_FIST.ease, true);
  assert.deepEqual([...piece.batch.positions], [...fist], 'the fist');
  tf.step(THUMB_FIST.ease * 2, false);
  assert.deepEqual([...piece.batch.positions], [...open], 'and back');
  assert.equal(tf.weight(), 0);
});

test('THUMB-FIST / BETTER-HANDS: the wiring - fitted at the build in the fists\' stance, eased by it each frame; the setting two choices', () => {
  const arm = rd('src/combat/fpArm.js');
  assert.match(arm, /const fistPick = thumbReference \? pickAnimSource\(sources, FIST_GROUP, resetClip\) : null;/);
  assert.match(arm, /prepareThumbFist\(arm, \{ referenceBytes: thumbReference, handBytes: betterBodiesFpHands\?\.bytes,/);
  assert.match(arm, /thumbFist,   \/\/ THUMB-FIST/);
  assert.match(arm, /built\.thumbFist\?\.step\(dt, animWeaponType\(built\.mwType, sheathed, spellReady\) === MW_WEAPON_TYPE\.HandToHand\);/);
  const tf = rd('src/formats/morrowind/mwThumbFist.js');
  assert.match(tf, /export const FIST_GROUP = 'idlehh';/);
  const settings = rd('src/systems/modSettings.js');
  assert.match(settings, /FirstPersonHands: Object\.freeze\(\{ default: 1, options: lazyWords\('Vanilla', 'Better Hands'\),/);
  assert.equal(firstPersonHandsSource(2), 'better-hands');
});
