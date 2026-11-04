// CUFF-FIT (2026-10-26, Mac: "the new hand and the armour past the wrist live apart from each other - keep the new hand
// with its armour texture, draw the worn armour past the wrist as vanilla does, but as one piece with the new hand"):
// THE VANILLA CUFF, SAT ON THE DONOR HAND.
//
// The first-person gauntlet is two files (combat/fpArm.js, the Robert's gauntlet substitution): the donor's hands and
// fingers (Robert's Bodies Based Gauntlets, one mesh for every gauntlet, the worn one's texture laid on it) and the
// worn gauntlet's own cuff (mwFirstPerson.js armWeightedTriangles). The cuff was modelled round the RETAIL hand - a
// wider, shorter wrist, weighted the retail way - so where it met the donor's wrist it stood off it, and when the hand
// turned in a blow the two came apart: two transforms agree in one pose at most (mwSkinTransfer.js says why).
//
// So the cuff's wrist end is fitted to the donor's, in the rest pose the skins are solved in, and the cuff fades back
// to its own shape over CUFF_FIT.reach towards the elbow:
//   - where the donor's hand begins, the cuff stands CUFF_FIT.clearance outside it, angle by angle;
//   - and its own end goes CUFF_FIT.bury INTO the hand, CUFF_FIT.clearance under the hand's surface there (drawn on or
//     back to reach it, from within CUFF_FIT.reach of the wrist) - so the hand closes over the cut. Mac's screenshot
//     (2026-10-26, the netch gauntlet looked up at): a low-poly cuff's end sat round the hand left a gap at each of
//     its few corners, and the forearm's grey skin showed through;
//   - a cuff that flares OVER the hand (daedric, indoril: past the wrist by more than CUFF_FIT.flare) keeps its flare and
//     is only pushed out of the hand;
//   - its wrist end takes the donor wrist's bones and weights (nearest donor vertex), so it turns with the hand;
// and each moved vertex is solved through its new skin so that skinning puts it where the fit wants it (the
// "copy bone weights" of mwSkinTransfer.js, by the same measured affines). The textures, UVs and triangles are the
// cuff's own; the bound batch is never written - a copy is answered.

import { affineMul } from './mwAffine.js';
import { affineInverse } from './mwParticles.js';
import { influencesOf, invert33, measureAffines } from './mwSkinTransfer.js';

export const CUFF_FIT = Object.freeze({ reach: 3, band: 0.75, clearance: 0.12, bury: 0.8, slice: 0.25, flare: 1, bins: 16, ringVerts: 3, ringSpan: 0.6,
  girthSlice: 0.5, girthGap: 8, skinClearance: 0.1, maxPush: 1.2, strayShare: 0.25 });

const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const unit = (p) => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };

/** The batch skinned in ctx's pose: positions (and normals, when it has them). */
function restOf(batch, ctx) {
  const p = new Float32Array(batch.positions.length);
  const n = batch.normals ? new Float32Array(batch.positions.length) : null;
  ctx.skinBatch(batch, ctx.skeleton, ctx.pose, ctx.mats, p, n);
  return { p, n };
}

/** The forearm's frame at the wrist: `along` the forearm to the hand, two axes across it, from the wrist joint. */
export function wristFrame(origin, dir) {
  const u = unit(dir);
  const e1 = unit(cross(u, Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const e2 = cross(u, e1);
  return { origin, u, e1, e2, of: (p) => { const d = sub(p, origin); return [dot(d, u), dot(d, e1), dot(d, e2)]; },
    at: (a, x, y) => [0, 1, 2].map((i) => origin[i] + a * u[i] + x * e1[i] + y * e2[i]) };
}

/**
 * The donor's WRIST RING in `frame`: where its hand begins along the forearm (`a0`, the nearest vertex to the elbow),
 * the ring's centre across it and its radius in CUFF_FIT.bins angles (a bin with no vertex takes its nearest
 * neighbour's). Null when the donors draw nothing.
 */
export function wristRing(donors, frame) {
  const pts = [];
  for (const d of donors) {
    const used = new Set(d.batch.indices);
    for (const v of used) pts.push({ d, v, c: frame.of([d.rest[v * 3], d.rest[v * 3 + 1], d.rest[v * 3 + 2]]) });
  }
  if (!pts.length) return null;
  const a0 = Math.min(...pts.map((q) => q.c[0]));
  const ring = pts.filter((q) => q.c[0] <= a0 + CUFF_FIT.band);
  const cx = ring.reduce((s, q) => s + q.c[1], 0) / ring.length, cy = ring.reduce((s, q) => s + q.c[2], 0) / ring.length;
  // the hand's girth slice by slice from where it begins (CUFF_FIT.slice apart), CUFF_FIT.bins angles a slice: the
  // ring is the first, and the cuff's buried end reads the slice it ends in
  const K = CUFF_FIT.bins, S = Math.ceil((CUFF_FIT.bury + CUFF_FIT.band) / CUFF_FIT.slice) + 1;
  const table = Array.from({ length: S }, () => new Array(K).fill(-1));
  const binOf = (x, y) => Math.floor(((Math.atan2(y, x) / (2 * Math.PI)) + 1) * K) % K;
  for (const q of pts) {
    const x = q.c[1] - cx, y = q.c[2] - cy, k = binOf(x, y), r = Math.hypot(x, y);
    const s = q.c[0] <= a0 + CUFF_FIT.band ? 0 : Math.round((q.c[0] - a0) / CUFF_FIT.slice);
    if (s > 0 && s < S && Math.abs(q.c[0] - (a0 + s * CUFF_FIT.slice)) <= CUFF_FIT.slice) table[s][k] = Math.max(table[s][k], r);
    if (s === 0) table[0][k] = Math.max(table[0][k], r);
  }
  if (table[0].every((x) => x < 0)) return null;
  for (let s = 0; s < S; s++) {
    const r = table[s];
    if (r.every((x) => x < 0)) { table[s] = table[s - 1].slice(); continue; }   // a slice with nothing: the one before
    for (let k = 0; k < K; k++) {
      if (r[k] >= 0) continue;
      for (let t = 1; t < K; t++) { const n = r[(k + t) % K] >= 0 ? r[(k + t) % K] : r[(k - t + K) % K]; if (n >= 0) { r[k] = n; break; } }
    }
  }
  const radius = (x, y, a = a0) => {   // linear between the bins' centres, and between the slices
    const f = ((Math.atan2(y, x) / (2 * Math.PI)) + 1) * K - 0.5;
    const k0 = ((Math.floor(f) % K) + K) % K, t = f - Math.floor(f);
    const at = (s) => table[s][k0] * (1 - t) + table[s][(k0 + 1) % K] * t;
    const g = Math.min(S - 1, Math.max(0, (a - a0) / CUFF_FIT.slice)), s0 = Math.floor(g), s1 = Math.min(S - 1, s0 + 1);
    return at(s0) * (1 - (g - s0)) + at(s1) * (g - s0);
  };
  // the donor's wrist vertices, for the cuff's weights: a cuff vertex copies its nearest
  const wrist = pts.filter((q) => q.c[0] <= a0 + CUFF_FIT.bury + CUFF_FIT.band);
  return { a0, cx, cy, radius, wrist };
}

/** Where the donor hand begins along the forearm (its nearest vertex to the elbow) in `ctx`'s pose, or null. */
export function handStart(donors, ctx, frame) {
  let a0 = Infinity;
  for (const batch of donors) {
    const p = restOf(batch, ctx).p;
    for (const v of new Set(batch.indices)) a0 = Math.min(a0, frame.of([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]])[0]);
  }
  return Number.isFinite(a0) ? a0 : null;
}

/** A worn gauntlet's shape cut by WHERE, not by weights: the triangles whose centre lies short of `limit` along the
 *  forearm (the donor hand's start, CUFF_FIT.bury in) - its cuff and its wrist band whole; what the donor hand covers
 *  goes. A copy, or null when nothing is left. */
export function trimToCuff(batch, ctx, frame, limit, { least = 0 } = {}) {
  const p = restOf(batch, ctx).p, I = batch.indices, kept = [];
  const along = (v) => frame.of([p[v * 3], p[v * 3 + 1], p[v * 3 + 2]])[0];
  for (let t = 0; t + 2 < I.length; t += 3) {
    if ((along(I[t]) + along(I[t + 1]) + along(I[t + 2])) / 3 < limit) kept.push(I[t], I[t + 1], I[t + 2]);
  }
  // `least`: a share under which what is left is a stray of a hand shape (retail netch's palm: one triangle of its
  // wrist), not a cuff
  if (!kept.length || kept.length < least * I.length) return null;
  return { ...batch, indices: Uint16Array.from(kept) };
}

/** Where the fit puts one cuff vertex at frame coordinates `c` (along, across x, across y), its weight `f`. */
export function fitPoint(c, ring, { a1, flared, aStart = a1 - CUFF_FIT.reach }) {
  // the cuff's own end goes CUFF_FIT.bury into the hand - drawn on or drawn back, the whole way, the draw spread evenly
  // from its far end (`aStart`, the elbow's) to its own: drawn over its last reach alone, a short cuff's last band of
  // texture stretched to tearing (Mac's screenshot, 2026-10-26, the netch cuff drawn 1.9 at the wrist); never one
  // ending up the arm, never a flare
  const ends = !flared && a1 > ring.a0 - CUFF_FIT.reach;
  const span = Math.max(1e-6, a1 - aStart);
  const da = ends ? (ring.a0 + CUFF_FIT.bury - a1) * Math.min(1, Math.max(0, (c[0] - aStart) / span)) : 0;
  const a = c[0] + da;
  const f = smooth01((a - (ring.a0 - CUFF_FIT.reach)) / CUFF_FIT.reach);
  if (!(f > 0)) return { c: da ? [a, c[1], c[2]] : c, f: 0, moved: !!da };   // only drawn on: its share of the draw
  const x = c[1] - ring.cx, y = c[2] - ring.cy, r = Math.hypot(x, y);
  // outside the hand where it begins, sinking under its surface to the buried end: the hand closes over the cut
  const sink = smooth01((a - ring.a0) / CUFF_FIT.bury);
  const want = ring.radius(x, y, a) + CUFF_FIT.clearance * (1 - 2 * sink);
  // the flare keeps its width, only ever pushed out of the hand; a cuff ending at the wrist takes the hand's girth
  const out = ring.radius(x, y, a) + CUFF_FIT.clearance;
  const r2 = flared ? (r < out ? r + f * (out - r) : r) : r + f * (want - r);
  const k = r > 1e-6 ? r2 / r : 1;
  return { c: [a, ring.cx + x * k, ring.cy + y * k], f, moved: true };
}

/**
 * Where the cuff ENDS along the forearm: its last RING - the farthest point with CUFF_FIT.ringVerts of its vertices
 * within CUFF_FIT.ringSpan behind it - not its farthest vertex. Retail's netch cuff ends in a ring of seven 2 units short
 * of the wrist, one tongue vertex alone reaching it; taking the tongue for the end left the ring where it was and the
 * donor's shorter hand a gap away (Mac's screenshot, 2026-10-26). A cuff of fewer vertices: its farthest.
 */
export function cuffEnd(along) {
  const a = [...along].sort((x, y) => x - y);
  for (let i = a.length - 1; i >= CUFF_FIT.ringVerts - 1; i--) {
    if (a[i] - a[i - CUFF_FIT.ringVerts + 1] <= CUFF_FIT.ringSpan) return a[i];
  }
  return a.length ? a[a.length - 1] : -Infinity;
}

/**
 * CUFF-FIT: `cuffs` (skinned batches, the worn gauntlet's cuff of one side) fitted to `donors` (the donor hand's
 * batches of that side) in `ctx`'s pose ({ skeleton, pose, mats, skinBatch } - the rest pose), about the wrist `frame`
 * (wristFrame). Answers the cuffs in order - a fitted copy, or the batch itself where nothing moved.
 */
export function fitCuffsToHand(cuffs, donors, ctx, frame, { flare = true, skins = [] } = {}) {
  const rested = donors.map((batch) => ({ batch, rest: restOf(batch, ctx).p, infl: influencesOf(batch.skin, batch.positions.length / 3) }));
  const ring = wristRing(rested, frame);
  if (!ring) return cuffs;
  const arm = skins.length ? armGirth(skins.map((batch) => ({ batch, rest: restOf(batch, ctx).p })), frame) : null;
  const cuffRest = cuffs.map((batch) => restOf(batch, ctx));
  const along = [];
  cuffs.forEach((batch, i) => { for (const v of new Set(batch.indices)) along.push(frame.of(Array.from(cuffRest[i].p.subarray(v * 3, v * 3 + 3)))[0]); });
  const a1 = cuffEnd(along);
  // `flare` false: the arm's own skin (BETTER-HANDS' wrist), whose end runs past the hand's start by design - it is
  // sat under the hand's surface, never kept as a flare
  const flared = flare && a1 > ring.a0 + CUFF_FIT.flare;
  const aStart = Math.min(...along);
  return cuffs.map((batch, i) => fitOne(batch, cuffRest[i], ring, { a1, flared, aStart, arm }, ctx, frame));
}

/**
 * THE ARM'S GIRTH under the cuff (Mac's screenshots, 2026-10-26: "the arm shows through the glove"): Robert's Bodies'
 * forearm is a fuller arm than the retail one every cuff was modelled round, and its skin came out through the cuff
 * - a pale stripe down the netch leather, a pink fleck at the plate's elbow end. Its skin vertices (`skins`, posed at
 * rest) read about the forearm's axis in slices CUFF_FIT.girthSlice long and CUFF_FIT.bins angles: `radius(a, x, y)`
 * - the skin's outermost there - or null where the arm has no skin.
 */
export function armGirth(skins, frame) {
  const K = CUFF_FIT.bins, slices = new Map();
  const binOf = (x, y) => Math.floor(((Math.atan2(y, x) / (2 * Math.PI)) + 1) * K) % K;
  for (const s of skins) {
    for (const v of new Set(s.batch.indices)) {
      const c = frame.of([s.rest[v * 3], s.rest[v * 3 + 1], s.rest[v * 3 + 2]]);
      const i = Math.round(c[0] / CUFF_FIT.girthSlice), k = binOf(c[1], c[2]);
      const row = slices.get(i) ?? new Array(K).fill(-1);
      row[k] = Math.max(row[k], Math.hypot(c[1], c[2]));
      slices.set(i, row);
    }
  }
  for (const row of slices.values()) {
    for (let k = 0; k < K; k++) {
      if (row[k] >= 0) continue;
      for (let t = 1; t < K; t++) { const n = row[(k + t) % K] >= 0 ? row[(k + t) % K] : row[(k - t + K) % K]; if (n >= 0) { row[k] = n; break; } }
    }
  }
  // a low-poly arm's rings stand apart: between two the skin runs straight, so a slice with none reads the nearest
  // ring each side (within CUFF_FIT.girthGap slices), linearly
  return {
    radius(a, x, y) {
      const g = a / CUFF_FIT.girthSlice, k = binOf(x, y);
      let lo = null, hi = null;
      for (let d = 0; d <= CUFF_FIT.girthGap && (lo == null || hi == null); d++) {
        if (lo == null && slices.has(Math.floor(g) - d)) lo = Math.floor(g) - d;
        if (hi == null && slices.has(Math.ceil(g) + d)) hi = Math.ceil(g) + d;
      }
      // past the skin's last ring there is no skin to clear - never read on beyond it (the cuff's end buried in the hand)
      if (lo == null || hi == null) return null;
      if (lo === hi) return slices.get(lo)[k];
      const t = (g - lo) / (hi - lo);
      return slices.get(lo)[k] * (1 - t) + slices.get(hi)[k] * t;
    },
  };
}

/**
 * A cuff vertex at frame coordinates `c` pushed out to CUFF_FIT.skinClearance over the arm's skin (armGirth) - never by
 * more than CUFF_FIT.maxPush, never in. A low-poly cuff's faces run as CHORDS between its vertices (retail's netch
 * cuff: seven to a ring), inside the vertices' own radius by cos(half the angle between them): so the skin is read over
 * the whole sector to the vertex's neighbours (`halfTheta` either side, `halfA` along) and the vertex set out so the
 * chord clears it. Answers the point, or null where it is clear already.
 */
export function clearOfArm(c, arm, { halfTheta = 0, halfA = 0 } = {}) {
  if (!arm) return null;
  const th = Math.atan2(c[2], c[1]), step = (2 * Math.PI) / CUFF_FIT.bins;
  const ht = Math.min(Math.PI / 2 - 0.05, Math.max(0, halfTheta));
  let r0 = null;
  for (const a of halfA > 0 ? [c[0] - halfA, c[0], c[0] + halfA] : [c[0]]) {
    for (let t = -ht; t <= ht + 1e-9; t += Math.max(step / 2, ht || 1)) {
      const r = arm.radius(a, Math.cos(th + t), Math.sin(th + t));
      if (r != null && (r0 == null || r > r0)) r0 = r;
    }
  }
  if (r0 == null || !(r0 > 0)) return null;
  const r = Math.hypot(c[1], c[2]), want = (r0 + CUFF_FIT.skinClearance) / Math.cos(ht);
  if (!(r < want) || want - r > CUFF_FIT.maxPush || r < 1e-6) return null;
  return [c[0], c[1] * want / r, c[2] * want / r];
}

/** Each vertex's sector to its neighbours across the triangles, in the frame: half the widest angle about the axis
 *  and half the longest step along it. Map(vertex -> { halfTheta, halfA }). */
function sectorsOf(batch, rest, frame) {
  const I = batch.indices, of = new Map(), near = new Map();
  const at = (v) => { let c = of.get(v); if (!c) { c = frame.of([rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2]]); of.set(v, c); } return c; };
  for (let t = 0; t + 2 < I.length; t += 3) {
    for (const [a, b] of [[I[t], I[t + 1]], [I[t + 1], I[t + 2]], [I[t + 2], I[t]]]) {
      for (const [x, y] of [[a, b], [b, a]]) { const s = near.get(x) ?? new Set(); s.add(y); near.set(x, s); }
    }
  }
  const out = new Map();
  for (const [v, ns] of near) {
    const c = at(v), th = Math.atan2(c[2], c[1]);
    let dt = 0, da = 0;
    for (const u of ns) {
      const d = at(u);
      let w = Math.abs(Math.atan2(d[2], d[1]) - th);
      if (w > Math.PI) w = 2 * Math.PI - w;
      dt = Math.max(dt, w); da = Math.max(da, Math.abs(d[0] - c[0]));
    }
    out.set(v, { halfTheta: dt / 2, halfA: da / 2 });
  }
  return out;
}

function fitOne(batch, rest, ring, shape, ctx, frame) {
  const n = batch.positions.length / 3;
  const skin = batch.skin;
  const bones = skin.bones.map((b) => ({ ref: b.ref, name: b.name, invBind: b.invBind }));
  const byRef = new Map(bones.map((b, i) => [b.ref, i]));
  const infl = influencesOf(skin, n);
  // the cuff's own dominant bone: a bone the donor brings is bound so that, at rest, it places as that one does
  const lead = skin.bones.reduce((best, b) => (b.ref != null && b.indices.length > (best?.indices.length ?? -1) ? b : best), null);
  const boneFor = (ref, name) => {
    if (byRef.has(ref)) return byRef.get(ref);
    const at = ctx.mats.get(ref), leadAt = lead ? ctx.mats.get(lead.ref) : null;
    if (!at || !leadAt) return -1;
    bones.push({ ref, name, invBind: affineMul(affineInverse(at), affineMul(leadAt, lead.invBind)) });
    byRef.set(ref, bones.length - 1);
    return bones.length - 1;
  };
  const targets = new Map();
  const sectors = shape.arm ? sectorsOf(batch, rest.p, frame) : null;
  for (const v of new Set(batch.indices)) {
    const p = [rest.p[v * 3], rest.p[v * 3 + 1], rest.p[v * 3 + 2]];
    const fit = fitPoint(frame.of(p), ring, shape);
    const { f, moved } = fit;
    // and clear of the arm's skin under it, wherever on the cuff, its faces as well as its vertices (armGirth)
    const clear = clearOfArm(fit.c, shape.arm, sectors?.get(v));
    const c = clear ?? fit.c;
    if (!moved && !clear) continue;
    const to = frame.at(c[0], c[1], c[2]);
    if (!(f > 0)) { targets.set(v, to); continue; }   // drawn on, or cleared, alone: its own bones
    // the donor wrist's nearest vertex lends its bones: its weights blended in by f
    let best = null, bd = Infinity;
    for (const q of ring.wrist) {
      const j = q.v, dr = q.d.rest;
      const d2 = (dr[j * 3] - to[0]) ** 2 + (dr[j * 3 + 1] - to[1]) ** 2 + (dr[j * 3 + 2] - to[2]) ** 2;
      if (d2 < bd) { bd = d2; best = q; }
    }
    const mixed = new Map();
    for (const [bi, w] of infl[v]) mixed.set(bi, (mixed.get(bi) ?? 0) + w * (1 - f));
    let lent = 0;
    for (const [dbi, w] of best ? best.d.infl[best.v] : []) {
      const db = best.d.batch.skin.bones[dbi];
      const bi = db.ref == null ? -1 : boneFor(db.ref, db.name);
      if (bi < 0) continue;
      mixed.set(bi, (mixed.get(bi) ?? 0) + w * f); lent += w * f;
    }
    if (!(lent > 0)) for (const [bi, w] of infl[v]) mixed.set(bi, (mixed.get(bi) ?? 0) + w * f);   // nothing lent: its own
    infl[v] = [...mixed].filter(([, w]) => w > 1e-6);
    targets.set(v, to);
  }
  if (!targets.size) return batch;
  const newSkin = { ...skin, bones: bones.map((b) => ({ ...b, indices: [], weights: [] })) };
  infl.forEach((list, v) => { for (const [bi, w] of list) { newSkin.bones[bi].indices.push(v); newSkin.bones[bi].weights.push(w); } });
  const js = [...targets.keys()];
  const aff = measureAffines({ batch: { skin: newSkin }, infl }, js, ctx);
  const positions = Float32Array.from(batch.positions);
  const normals = batch.normals ? Float32Array.from(batch.normals) : null;
  for (const v of js) {
    const m = aff.get(v), inv = invert33(m.a), to = targets.get(v);
    if (!inv) continue;
    const g = [to[0] - m.t[0], to[1] - m.t[1], to[2] - m.t[2]];
    positions[v * 3] = inv[0] * g[0] + inv[1] * g[1] + inv[2] * g[2];
    positions[v * 3 + 1] = inv[3] * g[0] + inv[4] * g[1] + inv[5] * g[2];
    positions[v * 3 + 2] = inv[6] * g[0] + inv[7] * g[1] + inv[8] * g[2];
    if (normals && rest.n) {   // MW-SMOOTH: the normal it was lit by at rest, through the new skin
      const N = [rest.n[v * 3], rest.n[v * 3 + 1], rest.n[v * 3 + 2]];
      const o = [inv[0] * N[0] + inv[1] * N[1] + inv[2] * N[2], inv[3] * N[0] + inv[4] * N[1] + inv[5] * N[2], inv[6] * N[0] + inv[7] * N[1] + inv[8] * N[2]];
      const l = Math.hypot(o[0], o[1], o[2]) || 1;
      normals[v * 3] = o[0] / l; normals[v * 3 + 1] = o[1] / l; normals[v * 3 + 2] = o[2] / l;
    }
  }
  newSkin.bones = newSkin.bones.filter((b) => b.indices.length);
  return { ...batch, positions, normals, skin: newSkin, cuffFit: { moved: targets.size, flared: shape.flared } };
}
