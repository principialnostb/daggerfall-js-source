import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CUFF_FIT, wristFrame, wristRing, fitPoint, fitCuffsToHand, cuffEnd, armGirth, clearOfArm, handStart, trimToCuff } from '../../../src/formats/morrowind/mwCuffFit.js';
import { isDonorCuffShape } from '../../../src/formats/morrowind/mwFirstPerson.js';

// CUFF-FIT (2026-10-26, Mac: "the new hand and the armour past the wrist live apart - keep the new hand with its armour
// texture, the worn armour past the wrist vanilla, but as one piece"). Measured on retail (Morrowind.bsa, the
// first-person skeleton, Robert's iron donor): the iron cuff's wrist end stood at radius 2.45 round a donor wrist of
// 1.5-1.9, its end weighted to the forearm; a 40-degree twist of the hand moved the seam 0.37 units, fitted 0.08-0.11.

const rd = (p) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const FORE = 1, HAND = 2;
const IDENT = () => ({ a: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]), t: [0, 0, 0] });

/** A cylinder along +x (the forearm to the hand), from `a0` to `a1`, `rings` rings of `k` vertices, radius r(a). */
function tube({ a0, a1, rings = 8, k = 12, r, bone }) {
  const pos = [], idx = [];
  for (let i = 0; i < rings; i++) {
    const a = a0 + (a1 - a0) * (i / (rings - 1));
    for (let j = 0; j < k; j++) { const t = (j / k) * 2 * Math.PI; pos.push(a, r(a) * Math.cos(t), r(a) * Math.sin(t)); }
  }
  for (let i = 0; i + 1 < rings; i++) for (let j = 0; j < k; j++) {
    const p = i * k + j, q = i * k + ((j + 1) % k);
    idx.push(p, q, p + k, q, q + k, p + k);
  }
  const n = pos.length / 3, all = Array.from({ length: n }, (_, i) => i);
  const bones = typeof bone === 'function' ? bone(pos) : [{ ref: bone, name: bone === HAND ? 'Bip01 L Hand' : 'Bip01 L Forearm', invBind: IDENT(), indices: all, weights: all.map(() => 1) }];
  return { name: 'tube', positions: Float32Array.from(pos), normals: null, indices: Uint16Array.from(idx), skinned: true, skin: { bones } };
}

/** A skeleton of two bones, the hand turned `deg` about the forearm's own axis; skinBatch the plain linear blend. */
function ctxWith(deg = 0) {
  const c = Math.cos(deg * Math.PI / 180), s = Math.sin(deg * Math.PI / 180);
  const mats = new Map([[FORE, IDENT()], [HAND, { a: Float32Array.from([1, 0, 0, 0, c, -s, 0, s, c]), t: [0, 0, 0] }]]);
  const skinBatch = (batch, _sk, _pose, m, out) => {
    out.fill(0);
    for (const b of batch.skin.bones) {
      const M = m.get(b.ref), B = b.invBind;
      for (let k = 0; k < b.indices.length; k++) {
        const v = b.indices[k], w = b.weights[k];
        const x = batch.positions[v * 3], y = batch.positions[v * 3 + 1], z = batch.positions[v * 3 + 2];
        const p = [0, 1, 2].map((i) => B.a[i * 3] * x + B.a[i * 3 + 1] * y + B.a[i * 3 + 2] * z + B.t[i]);
        for (let i = 0; i < 3; i++) out[v * 3 + i] += w * (M.a[i * 3] * p[0] + M.a[i * 3 + 1] * p[1] + M.a[i * 3 + 2] * p[2] + M.t[i]);
      }
    }
  };
  return { skeleton: null, pose: null, mats, skinBatch };
}
const frame = wristFrame([0, 0, 0], [1, 0, 0]);
const skinned = (batch, ctx) => { const o = new Float32Array(batch.positions.length); ctx.skinBatch(batch, null, null, ctx.mats, o); return o; };
const radiusAt = (o, v) => Math.hypot(o[v * 3 + 1], o[v * 3 + 2]);

// the donor: a hand from just short of the wrist, radius 1.6; the cuff: elbow to the wrist, radius 2.5, all forearm
const donor = () => tube({ a0: -0.4, a1: 8, r: () => 1.6, bone: HAND });
const cuff = (a1 = -0.1, r = () => 2.5) => tube({ a0: -10, a1, rings: 12, r, bone: FORE });

test('CUFF-FIT: the donor\'s wrist ring - where its hand begins, its centre and its radius round the forearm', () => {
  const ctx = ctxWith();
  const d = donor();
  const ring = wristRing([{ batch: d, rest: skinned(d, ctx), infl: null }], frame);
  assert.ok(Math.abs(ring.a0 - -0.4) < 1e-6, 'the hand begins at its nearest vertex to the elbow');
  assert.ok(Math.abs(ring.cx) < 1e-6 && Math.abs(ring.cy) < 1e-6);
  for (const t of [0, 1, 2, 3, 4, 5]) assert.ok(Math.abs(ring.radius(Math.cos(t), Math.sin(t)) - 1.6) < 1e-6, `round, at ${t}`);
  assert.equal(wristRing([], frame), null, 'no donor, no ring');
});

test('CUFF-FIT: a cuff ending at the wrist stands outside the hand where it begins, its end buried under the hand\'s surface, and fades back to its own shape towards the elbow', () => {
  // the hand widens from 1.6 where it begins to 2.0 a unit on
  const ring = { a0: -0.4, cx: 0, cy: 0, radius: (x, y, a = -0.4) => 1.6 + 0.4 * Math.min(1, Math.max(0, a + 0.4)), wrist: [] };
  const shape = { a1: -0.4, flared: false };
  const at = (a, r) => fitPoint([a, r, 0], ring, shape);
  const end = at(-0.4, 2.5);
  assert.ok(Math.abs(end.c[0] - (-0.4 + CUFF_FIT.bury)) < 1e-9, `its own end goes the bury into the hand (${end.c[0]})`);
  assert.ok(Math.abs(end.c[1] - (ring.radius(0, 0, end.c[0]) - CUFF_FIT.clearance)) < 1e-9, `under the hand's surface there (${end.c[1]})`);
  const pastEnd = fitPoint([-1.6, 2.5, 0], ring, { a1: -1.6, flared: false });
  assert.ok(Math.abs(pastEnd.c[0] - (-0.4 + CUFF_FIT.bury)) < 1e-9, 'a cuff ending short of the hand: drawn on, the same');
  const back = fitPoint([1, 2.5, 0], ring, { a1: 1, flared: false });
  assert.ok(Math.abs(back.c[0] - (-0.4 + CUFF_FIT.bury)) < 1e-9, 'and one a little past it: drawn back');
  // where the hand begins the cuff stands outside it: a vertex that lands there
  const shell = at(-1.2, 2.5);
  assert.ok(shell.c[0] <= ring.a0, `this one stays short of the hand (${shell.c[0]})`);
  assert.ok(shell.c[1] >= 1.6 + CUFF_FIT.clearance - 1e-9 && shell.c[1] < 2.5, `outside the hand's opening, drawn in towards it (${shell.c[1]})`);
  assert.equal(at(-0.4 - 2 * CUFF_FIT.reach - 1, 2.5).f, 0, 'far back from the wrist: its own shape');
  assert.deepEqual(at(-8, 2.5).c, [-8, 2.5, 0], 'and untouched');
  assert.equal(fitPoint([-8, 2.5, 0], ring, { a1: -8, flared: false }).c[0], -8, 'one ending up the arm is never drawn down it');
  // a flare over the hand keeps its width, and is only pushed out of the hand
  const flare = { a1: 3, flared: true };
  assert.equal(fitPoint([1, 3.2, 0], ring, flare).c[1], 3.2, 'a flare stays a flare');
  assert.ok(Math.abs(fitPoint([1, 1.0, 0], ring, flare).c[1] - (ring.radius(0, 0, 1) + CUFF_FIT.clearance)) < 1e-9, 'never inside the hand');
  assert.equal(fitPoint([1, 3.2, 0], ring, flare).c[0], 1, 'and never drawn on');
});

test('CUFF-FIT: the fitted cuff sits on the hand at rest and turns with it - the vanilla one does not', () => {
  const rest = ctxWith(0), turned = ctxWith(40);
  const d = donor(), c = cuff();
  const [fit] = fitCuffsToHand([c], [d], rest, frame);
  assert.notEqual(fit, c, 'a fitted copy');
  assert.notEqual(fit.positions, c.positions, 'the bound batch is never written');
  assert.ok(fit.skin.bones.some((b) => b.ref === HAND), 'the cuff now has the hand\'s bone - the donor lent it');
  const end = [...new Set(c.indices)].filter((v) => Math.abs(c.positions[v * 3] - -0.1) < 1e-6);
  const fr = skinned(fit, rest);
  for (const v of end) {
    assert.ok(Math.abs(fr[v * 3] - (-0.4 + CUFF_FIT.bury)) < 0.02, `its end in the hand at rest (${fr[v * 3].toFixed(3)})`);
    assert.ok(Math.abs(radiusAt(fr, v) - (1.6 - CUFF_FIT.clearance)) < 0.02, `under its surface (${radiusAt(fr, v).toFixed(3)})`);
  }
  const elbow = [...new Set(c.indices)].filter((v) => c.positions[v * 3] < -5);
  for (const v of elbow) {
    assert.ok(Math.abs(radiusAt(fr, v) - 2.5) < 1e-4, 'towards the elbow: its own girth');
    if (c.positions[v * 3] <= -10 + 1e-6) assert.ok(Math.abs(fr[v * 3] - -10) < 1e-5, 'its elbow end where it was');
  }
  // the hand turns 40 degrees: the fitted cuff's end keeps its distance to the donor's vertex beside it, the vanilla
  // one's does not
  const dr = skinned(d, rest), dt = skinned(d, turned);
  const nearestMove = (o0, o1, v) => {
    let best = 0, bd = Infinity;
    for (let j = 0; j < dr.length / 3; j++) { const dd = Math.hypot(dr[j * 3] - o0[v * 3], dr[j * 3 + 1] - o0[v * 3 + 1], dr[j * 3 + 2] - o0[v * 3 + 2]); if (dd < bd) { bd = dd; best = j; } }
    const d1 = Math.hypot(o1[v * 3] - dt[best * 3], o1[v * 3 + 1] - dt[best * 3 + 1], o1[v * 3 + 2] - dt[best * 3 + 2]);
    return Math.abs(d1 - bd);
  };
  const ft = skinned(fit, turned), cr = skinned(c, rest), ct = skinned(c, turned);
  const drift = (o0, o1) => end.reduce((s, v) => s + nearestMove(o0, o1, v), 0) / end.length;
  assert.ok(drift(fr, ft) < 0.05, `the fitted seam holds (${drift(fr, ft).toFixed(3)})`);
  assert.ok(drift(cr, ct) > 0.5, `the vanilla one came apart (${drift(cr, ct).toFixed(3)})`);
});

test('CUFF-FIT: nothing to sit on, nothing moved; a flared cuff keeps its flare', () => {
  const rest = ctxWith(0);
  const c = cuff();
  assert.equal(fitCuffsToHand([c], [], rest, frame)[0], c, 'no donor: the cuff as authored');
  const far = tube({ a0: -12, a1: -8, r: () => 2.5, bone: FORE });
  assert.equal(fitCuffsToHand([far], [donor()], rest, frame)[0], far, 'a cuff ending far up the arm: untouched');
  const bell = cuff(3, (a) => (a > 0 ? 2.5 + a : 2.5));
  const [fit] = fitCuffsToHand([bell], [donor()], rest, frame);
  assert.equal(fit.cuffFit.flared, true);
  const o = skinned(fit, rest);
  const tip = [...new Set(bell.indices)].filter((v) => bell.positions[v * 3] > 2.9);
  for (const v of tip) assert.ok(Math.abs(radiusAt(o, v) - 5.5) < 1e-4, `the bell's mouth as authored (${radiusAt(o, v).toFixed(3)})`);
});

test('CUFF-FIT: the draw is spread over the whole cuff, elbow to wrist - a short cuff\'s last band never stretched to tearing; the arm\'s own skin is never a flare', () => {
  const ring = { a0: -0.4, cx: 0, cy: 0, radius: () => 1.6, wrist: [] };
  const shape = { a1: -2, flared: false, aStart: -11 };
  const at = (a) => fitPoint([a, 2.5, 0], ring, shape).c[0];
  const drawn = (-0.4 + CUFF_FIT.bury) - -2;
  assert.ok(Math.abs(at(-2) - (-0.4 + CUFF_FIT.bury)) < 1e-9, 'its end into the hand');
  assert.equal(at(-11), -11, 'its elbow end where it was');
  assert.ok(Math.abs(at(-6.5) - (-6.5 + drawn / 2)) < 1e-9, 'half-way up, half the draw - evenly');
  const rest = ctxWith(0);
  // and so in the fit: a vertex far up the cuff, clear of the hand's girth, takes its share of the draw
  const short = cuff(-2);
  const [drawnOn] = fitCuffsToHand([short], [donor()], rest, frame);
  const os = skinned(drawnOn, rest);
  const mid = [...new Set(short.indices)].find((v) => Math.abs(short.positions[v * 3] - -6) < 0.6);
  const share = (short.positions[mid * 3] - -10) / (-2 - -10);
  assert.ok(Math.abs(os[mid * 3] - (short.positions[mid * 3] + drawn * share)) < 1e-4, `drawn on its share (${os[mid * 3]})`);
  // the arm's skin (BETTER-HANDS' wrist) runs past the hand's start by design: sat under it, not kept as a flare
  const wrist = cuff(1.2);
  assert.equal(fitCuffsToHand([wrist], [donor()], rest, frame)[0].cuffFit.flared, true, 'a cuff that far over the hand is a flare');
  const [skin] = fitCuffsToHand([wrist], [donor()], rest, frame, { flare: false });
  assert.equal(skin.cuffFit.flared, false);
  const o = skinned(skin, rest);
  const end = [...new Set(wrist.indices)].filter((v) => Math.abs(wrist.positions[v * 3] - 1.2) < 1e-6);
  for (const v of end) assert.ok(radiusAt(o, v) < 1.6, `under the hand's surface (${radiusAt(o, v).toFixed(3)})`);
});

test('CUFF-FIT: the worn cuff is kept clear of the arm\'s own skin under it - its faces as well as its vertices, never read past the skin', () => {
  // (Mac's screenshots: Robert's fuller forearm showed through the leather cuff, a pale stripe; a pink fleck at the plate)
  const arm = armGirth([{ batch: tube({ a0: -10, a1: -2, r: () => 2, bone: FORE }), rest: tube({ a0: -10, a1: -2, r: () => 2, bone: FORE }).positions }], frame);
  assert.ok(Math.abs(arm.radius(-6, 1, 0) - 2) < 1e-6, 'the skin\'s girth');
  assert.equal(arm.radius(0, 1, 0), null, 'past the skin\'s last ring: none - the cuff\'s buried end is never read against it');
  assert.equal(arm.radius(-14, 1, 0), null);
  const vertexOnly = clearOfArm([-6, 1.9, 0], arm);
  assert.ok(Math.abs(vertexOnly[1] - (2 + CUFF_FIT.skinClearance)) < 1e-9, 'a vertex inside the skin set out over it');
  assert.equal(clearOfArm([-6, 2.5, 0], arm), null, 'one clear of it left alone');
  // seven to a ring: the face to the next vertex runs a chord cos(pi / 7) inside - the vertex set out so the chord clears
  const chord = clearOfArm([-6, 2.15, 0], arm, { halfTheta: Math.PI / 7, halfA: 0 });
  assert.ok(chord && Math.abs(chord[1] * Math.cos(Math.PI / 7) - (2 + CUFF_FIT.skinClearance)) < 1e-9, `its chords clear the skin (${chord?.[1]})`);
  assert.equal(clearOfArm([-6, 0.2, 0], arm), null, 'never pushed further than CUFF_FIT.maxPush');
  const fp = rd('src/formats/morrowind/mwFirstPerson.js');
  assert.match(fp, /const skins = c === 'cuff' \? mine\.filter\(\(p\) => sideOf\(p\) === side && p\.cuffFit === 'skin'\)\.map\(\(p\) => p\.batch\) : \[\];/);
});

test('CUFF-FIT: the worn gauntlet is cut by where the donor hand begins, not by its weights - its cuff and wrist band whole, a hand shape\'s stray left out', () => {
  // (Mac: "a pale stripe down the leather glove in every pose"; "gaps either side of the plate's wrist") - a cuff's wrist
  // end rides the hand as much as the arm: by weights retail's netch cuff lost a wedge down its length
  const rest = ctxWith(0);
  assert.ok(Math.abs(handStart([donor()], rest, frame) - -0.4) < 1e-6, 'the donor hand\'s first vertex');
  assert.equal(handStart([], rest, frame), null);
  const wristy = tube({ a0: -10, a1: 1, rings: 12, r: () => 2.5, bone: (pos) => {
    const n = pos.length / 3, fore = [], hand = [];
    for (let v = 0; v < n; v++) (pos[v * 3] < -1 ? fore : hand).push(v);
    return [{ ref: FORE, name: 'Bip01 L Forearm', invBind: IDENT(), indices: fore, weights: fore.map(() => 1) },
      { ref: HAND, name: 'Bip01 L Hand', invBind: IDENT(), indices: hand, weights: hand.map(() => 1) }];
  } });
  const cut = trimToCuff(wristy, rest, frame, -0.4 + CUFF_FIT.bury);
  const o = skinned(cut, rest);
  let maxAlong = -Infinity;
  for (let t = 0; t < cut.indices.length; t += 3) maxAlong = Math.max(maxAlong, [0, 1, 2].reduce((s, k) => s + o[cut.indices[t + k] * 3], 0) / 3);
  assert.ok(maxAlong < -0.4 + CUFF_FIT.bury, 'nothing the donor hand covers');
  assert.ok(cut.indices.length > (wristy.indices.length * 2) / 3, 'its wrist band kept - hand-weighted as it is');
  assert.equal(trimToCuff(donor(), rest, frame, -1), null, 'nothing short of the limit: nothing');
  assert.equal(trimToCuff(wristy, rest, frame, -9, { least: CUFF_FIT.strayShare }), null, 'a stray of a shape: left out');
  const fp = rd('src/formats/morrowind/mwFirstPerson.js');
  assert.match(fp, /if \(part\.forearmShapesOnly && !\(batch = armWeightedTriangles\(batch\)\)\) \{ if \(ridesTheArm\(whole\)\) cuffWholes\.push\(\{ part, bone, whole \}\); continue; \}/);
  assert.match(fp, /const t = p\.cuffWhole \? trimToCuff\(p\.cuffWhole, ctx, frame, limit \+ CUFF_FIT\.bury\) : null;/);
  assert.match(fp, /const t = trimToCuff\(r\.whole, ctx, frame, limit \+ CUFF_FIT\.bury, \{ least: CUFF_FIT\.strayShare \}\);/);
});

test('CUFF-FIT: the cuff ends at its last ring, never at a lone tongue (retail\'s netch cuff: seven 2 units short, one at the wrist)', () => {
  assert.equal(cuffEnd([-11, -11, -11, -2.05, -2.02, -1.84, -1.7, -1.6, -1.54, 0]), -1.54, 'the ring, not the tongue');
  assert.equal(cuffEnd([-11, -10.9, -10.8, -0.3, -0.2, -0.1]), -0.1, 'a ring at the wrist is the end');
  assert.equal(cuffEnd([-1, 0]), 0, 'too few for a ring: its farthest');
  assert.equal(cuffEnd([]), -Infinity);
  // a tube with a tongue: fitted by its ring, the ring buried in the hand
  const rest = ctxWith(0);
  const base = cuff(-2);
  const n = base.positions.length / 3;
  const positions = Float32Array.from([...base.positions, 0, 1.3, 0]);
  const indices = Uint16Array.from([...base.indices, n - 1, n - 2, n]);
  const all = Array.from({ length: n + 1 }, (_, i) => i);
  const tongued = { ...base, positions, indices, skin: { bones: [{ ref: FORE, name: 'Bip01 L Forearm', invBind: IDENT(), indices: all, weights: all.map(() => 1) }] } };
  const [fit] = fitCuffsToHand([tongued], [donor()], rest, frame);
  const o = skinned(fit, rest);
  const ring = [...new Set(base.indices)].filter((v) => Math.abs(base.positions[v * 3] - -2) < 1e-6);
  for (const v of ring) assert.ok(Math.abs(o[v * 3] - (-0.4 + CUFF_FIT.bury)) < 0.02, `the ring goes into the hand (${o[v * 3].toFixed(2)})`);
});

test('CUFF-FIT: the donor\'s own cuff is a shape most of whose triangles ride the arm; its hand is not', () => {
  assert.equal(isDonorCuffShape(cuff()), true, 'elbow to wrist on the forearm: the donor\'s cuff');
  assert.equal(isDonorCuffShape(donor()), false, 'the hand');
  const wristy = tube({ a0: -1, a1: 8, r: () => 1.6, bone: (pos) => {
    const n = pos.length / 3, fore = [], hand = [];
    for (let v = 0; v < n; v++) (pos[v * 3] < 0.3 ? fore : hand).push(v);
    return [{ ref: FORE, name: 'Bip01 L Forearm', invBind: IDENT(), indices: fore, weights: fore.map(() => 1) },
      { ref: HAND, name: 'Bip01 L Hand', invBind: IDENT(), indices: hand, weights: hand.map(() => 1) }];
  } });
  assert.equal(isDonorCuffShape(wristy), false, 'a hand with its wrist on the forearm is still a hand');
  assert.equal(isDonorCuffShape({ positions: new Float32Array(9), indices: Uint16Array.from([0, 1, 2]) }), false, 'no skin: no cuff');
});

test('CUFF-FIT: the wiring - the donor its hands alone, each side\'s cuff fitted onto them as the parts bind', () => {
  const fp = rd('src/formats/morrowind/mwFirstPerson.js');
  assert.match(fp, /if \(part\.handShapesOnly && isDonorCuffShape\(batch\)\) continue;/);
  assert.match(fp, /cuffFit: part\.cuffFit \?\? \(part\.forearmShapesOnly \? 'cuff' : part\.handShapesOnly \? 'hand' : null\),/);
  assert.match(fp, /const pairs = \[\['cuff', 'hand', \{\}\], \['skin', 'bareHand', \{ flare: false \}\]\];/, 'BETTER-HANDS: the arm\'s wrist under the bare hand');
  assert.match(fp, /fitCuffPieces\(assembly, firstPiece, cuffWholes\);/);
  assert.match(fp, /const frame = wristFrame\(\[\.\.\.hand\], \[hand\[0\] - fore\[0\], hand\[1\] - fore\[1\], hand\[2\] - fore\[2\]\]\);/);
  assert.match(fp, /const fitted = fitCuffsToHand\(cuffs\.map\(\(p\) => p\.batch\), donors\.map\(\(p\) => p\.batch\), ctx, frame, \{ \.\.\.opts, skins \}\);/);
  const arm = rd('src/combat/fpArm.js');
  assert.match(arm, /textureFiles,\s+handShapesOnly: true,/, 'the Robert\'s donor is flagged');
});
