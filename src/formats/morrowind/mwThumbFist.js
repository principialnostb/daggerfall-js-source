// THUMB-FIST (2026-10-26, Mac: "Robert's hands are better everywhere - the fingers, where they sit, how the hand meets
// the arm - all but the THUMB IN A CLENCHED FIST, with gauntlets and without"): A FIST'S CORRECTIVE FOR THE THUMB.
//
// The hand stays one mesh - Better Hands' (or the donor gauntlet hand built on it, combat/fpArm.js) - with its own
// shape, texture and skin. The first cut laid its thumb onto Better Bodies' surface (Mac: "a very strange thumb -
// copying the vanilla one whole does not fit; correct Robert's own"). Measured in each thumb bone's own frame (the
// meshes share the skeleton, so the frames are one), the two thumbs are the same length - the tip 2.08 against 2.04 -
// but Better Hands' flesh rides 0.4-0.5 off each phalanx's axis, the same way on all three, its base the bulkier: in
// the fist the thumb stands out from the fingers, long-looking and oddly bent. So each phalanx of Better Hands' thumb
// is MOVED - its own shape kept - by how far its flesh's centre stands from Better Bodies' in that bone's frame
// (never outward along the bone: the thumb is not lengthened), the phalanges' moves blended by the skin's own weights
// so the joints stay closed, and solved back through the skin (mwSkinTransfer.js measureAffines) in the fists' pose
// into a second set of bind positions. A gauntlet hand on the same bones takes the same moves, bone by bone. The rig
// eases between the two sets by the fists' stance (createThumbFist): the authored thumb in every other pose.

import { influencesOf, invert33, measureAffines } from './mwSkinTransfer.js';
import { bindPartsInto } from './mwFirstPerson.js';
import { GRAPH_ROOT } from './mwSkin.js';

export const THUMB_FIST = Object.freeze({ ease: 0.25, core: 0.5 });

/** The bones of the thumb: Bip01 L Finger0, Finger01, Finger02 and the right's. */
export const isThumbBone = (name) => /\bfinger0\d?$/i.test(String(name ?? '').trim());

/** Per vertex, the share of its weight the thumb's bones carry. */
export function thumbShare(batch) {
  const n = (batch?.positions?.length ?? 0) / 3;
  const thumb = new Float32Array(n), all = new Float32Array(n);
  for (const b of batch?.skin?.bones ?? []) {
    const t = isThumbBone(b.name);
    for (let k = 0; k < b.indices.length; k++) { all[b.indices[k]] += b.weights[k]; if (t) thumb[b.indices[k]] += b.weights[k]; }
  }
  for (let v = 0; v < n; v++) thumb[v] = all[v] > 0 ? thumb[v] / all[v] : 0;
  return thumb;
}

/** The batch skinned in `pose` ({ skeleton, pose, mats, skinBatch }). */
function posed(batch, pose) {
  const p = new Float32Array(batch.positions.length);
  pose.skinBatch(batch, pose.skeleton, pose.pose, pose.mats, p, null);
  return p;
}

/** Bind positions for `batch` that skin to `to` (Map vertex -> posed point) in `pose`; the rest as they were. */
function solveBind(batch, to, pose) {
  const infl = influencesOf(batch.skin, batch.positions.length / 3);
  const js = [...to.keys()];
  const aff = measureAffines({ batch, infl }, js, pose);
  const out = Float32Array.from(batch.positions);
  for (const v of js) {
    const m = aff.get(v), inv = invert33(m.a), q = to.get(v);
    if (!inv) continue;
    const g = [q[0] - m.t[0], q[1] - m.t[1], q[2] - m.t[2]];
    out[v * 3] = inv[0] * g[0] + inv[1] * g[1] + inv[2] * g[2];
    out[v * 3 + 1] = inv[3] * g[0] + inv[4] * g[1] + inv[5] * g[2];
    out[v * 3 + 2] = inv[6] * g[0] + inv[7] * g[1] + inv[8] * g[2];
  }
  return out;
}

/** Each thumb bone's flesh centre in that bone's own frame: Map(bone name -> [x, y, z]) over the vertices it mostly
 *  carries (THUMB_FIST.core), the batch posed in `pose`. */
export function thumbCentres(batch, pose) {
  const at = posed(batch, pose);
  const out = new Map();
  for (const b of batch.skin?.bones ?? []) {
    if (!isThumbBone(b.name) || b.ref == null) continue;
    const m = pose.mats.get(b.ref);
    if (!m) continue;
    const a = m.a, s2 = a[0] * a[0] + a[3] * a[3] + a[6] * a[6];
    const c = [0, 0, 0];
    let n = 0;
    for (let k = 0; k < b.indices.length; k++) {
      if (!(b.weights[k] > THUMB_FIST.core)) continue;
      const v = b.indices[k], d = [at[v * 3] - m.t[0], at[v * 3 + 1] - m.t[1], at[v * 3 + 2] - m.t[2]];
      for (let i = 0; i < 3; i++) c[i] += (a[i] * d[0] + a[3 + i] * d[1] + a[6 + i] * d[2]) / s2;
      n++;
    }
    if (n) out.set(String(b.name).toLowerCase().trim(), c.map((x) => x / n));
  }
  return out;
}

/** THE MOVES: per thumb bone, how far `hand`'s flesh centre stands from `reference`'s, in the bone's frame - never out
 *  along the bone (x), so the thumb is not made longer. Map(bone name -> [x, y, z]); empty when they share no bone. */
export function thumbMoves(hand, reference, pose) {
  const h = thumbCentres(hand, pose), r = thumbCentres(reference, pose);
  const out = new Map();
  for (const [name, c] of h) {
    const q = r.get(name);
    if (q) out.set(name, [Math.min(0, q[0] - c[0]), q[1] - c[1], q[2] - c[2]]);
  }
  return out;
}

/** `batch`'s fist positions: each vertex moved by its thumb bones' moves (thumbMoves), weighted as its skin weights it
 *  and turned into the posed bone's frame, solved back to bind positions. Null when nothing moves. */
export function movedThumb(batch, moves, pose) {
  if (!moves?.size) return null;
  const at = posed(batch, pose);
  const by = new Map();
  for (const b of batch.skin?.bones ?? []) {
    const d = moves.get(String(b.name).toLowerCase().trim());
    const m = d && b.ref != null ? pose.mats.get(b.ref) : null;
    if (!m) continue;
    const a = m.a, w = [a[0] * d[0] + a[1] * d[1] + a[2] * d[2], a[3] * d[0] + a[4] * d[1] + a[5] * d[2], a[6] * d[0] + a[7] * d[1] + a[8] * d[2]];
    for (let k = 0; k < b.indices.length; k++) {
      const v = b.indices[k], s = by.get(v) ?? [0, 0, 0];
      for (let i = 0; i < 3; i++) s[i] += w[i] * b.weights[k];
      by.set(v, s);
    }
  }
  const to = new Map();
  for (const [v, d] of by) to.set(v, [at[v * 3] + d[0], at[v * 3 + 1] + d[1], at[v * 3 + 2] + d[2]]);
  return to.size ? solveBind(batch, to, pose) : null;
}

/** The fists' stance group, whose first frame is the fist the thumb is fitted in. */
export const FIST_GROUP = 'idlehh';

/**
 * THE BUILD'S SIDE: on the assembled first-person `arm`, each side's hand - Better Hands' (`slot` 'betterBodies', its
 * section 'hand:<side>') and the donor gauntlet hand (`cuffFit` 'hand', mwCuffFit.js) - gets its fist positions: the
 * moves measured between Better Hands' thumb (`handBytes`, or the drawn hand) and Better Bodies' (`referenceBytes`),
 * both bound here and never drawn, in `fist` ({ tracks, sampleTrack, time, accumRoot }: the fists' stance's first
 * frame). Answers createThumbFist over the pieces it moved, or null.
 */
export function prepareThumbFist(arm, { referenceBytes, handBytes, fist }) {
  if (!arm?.ok || !referenceBytes || !fist?.tracks) return null;
  const fns = arm.fns, skeleton = arm.skeleton;
  const bound = (bytes) => {
    if (!bytes) return [];
    const scratch = { pieces: [], notes: [], skeleton, fns };
    bindPartsInto(scratch, [{ slot: 'betterBodies', bones: [], bytes, showSlots: ['hand:left', 'hand:right'], hideSlots: [] }]);
    return scratch.pieces.filter((p) => p.kind === 'skinned');
  };
  const refs = bound(referenceBytes), hands = bound(handBytes);
  if (!refs.length) return null;
  const pose = fns.poseSkeleton(skeleton, fist.tracks, fist.sampleTrack, fist.time, { accumRoot: fist.accumRoot ?? null });
  const at = { skeleton, pose, mats: fns.skelMats(skeleton, pose, GRAPH_ROOT), skinBatch: fns.skinBatch };
  const sideOf = (p) => (/left/i.test(`${p.bodySection ?? ''} ${p.bone ?? ''} ${p.batch?.name ?? ''}`) ? 'left' : 'right');
  const targets = arm.pieces.filter((p) => p.kind === 'skinned'
    && ((p.slot === 'betterBodies' && /^hand:/.test(p.bodySection ?? '')) || p.cuffFit === 'hand'));
  const fitted = [];
  for (const side of ['left', 'right']) {
    const ref = refs.find((p) => sideOf(p) === side);
    const own = hands.find((p) => sideOf(p) === side) ?? targets.find((p) => p.slot === 'betterBodies' && sideOf(p) === side);
    if (!ref || !own) continue;
    const moves = thumbMoves(own.batch, ref.batch, at);
    for (const p of targets.filter((q) => sideOf(q) === side)) {
      const positions = movedThumb(p.batch, moves, at);
      if (positions) { p.fistPositions = positions; fitted.push(p); }
    }
  }
  return fitted.length ? createThumbFist(fitted) : null;
}

const smooth01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * The rig's side: `pieces` each { batch, fistPositions } - their bind positions eased between the authored and the
 * fist's by `step(dt, fist)`, THUMB_FIST.ease seconds either way; each piece's batch is its own copy, so the parsed mesh
 * is never written. Answers the current weight.
 */
export function createThumbFist(pieces) {
  const own = pieces.filter((p) => p.fistPositions && p.batch?.positions?.length === p.fistPositions.length).map((p) => {
    const open = Float32Array.from(p.batch.positions);
    p.batch = { ...p.batch, positions: Float32Array.from(open) };
    return { piece: p, open, fist: p.fistPositions };
  });
  let w = 0, laid = 0;
  return {
    count: () => own.length,
    weight: () => w,
    step(dt, fist) {
      const goal = fist ? 1 : 0;
      const k = THUMB_FIST.ease > 0 ? Math.min(1, Math.max(0, dt) / THUMB_FIST.ease) : 1;
      w = goal > w ? Math.min(goal, w + k) : Math.max(goal, w - k);
      const e = smooth01(w);
      if (e === laid) return w;
      laid = e;
      for (const o of own) { const out = o.piece.batch.positions; for (let i = 0; i < out.length; i++) out[i] = o.open[i] + (o.fist[i] - o.open[i]) * e; }
      return w;
    },
  };
}
