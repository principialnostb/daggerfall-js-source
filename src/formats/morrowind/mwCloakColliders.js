// @ts-check
// CLOAK-CONTACT (the owner, 2026-11-12: the animated cloak "stands very far from the back", gear slung over it "does not
// press it", and it costs frames; measured: the live contact pass refitted the cloak to the whole body every frame, 14.4
// ms). CLOAK-BODY (the owner, 2026-11-13: legs and armour came through the cloth after capsules took the refit's place;
// measured: the capsules, on the bones, met 0-2 of 1949 points a stride). The cloth meets the worn pieces' own posed
// surface: their backmost point over each unit of the cloak's (x, z), taken in its bind space each frame.
import { placeAtBone } from './mwFirstPerson.js';

/** Units the cloth keeps behind the body; the most one frame pushes it (deeper is a limb over the cloak, not under it);
 *  units a piece is rounded by, sideways;
 *  units round the fitted cloth the field covers; the bone the cloak is skinned to; seconds between gear footprints. */
export const CLOAK_CONTACT = Object.freeze({ clearance: 1, deep: 6, margin: 8, round: 2, chest: 'bip01 spine2', gearEvery: 0.2 });

const RIGS = new WeakMap();
const GEAR = new WeakMap();
const SCRATCH = new WeakMap();

const inv3 = (a) => {
  const d = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  return [(a[4] * a[8] - a[5] * a[7]) / d, (a[2] * a[7] - a[1] * a[8]) / d, (a[1] * a[5] - a[2] * a[4]) / d, (a[5] * a[6] - a[3] * a[8]) / d,
    (a[0] * a[8] - a[2] * a[6]) / d, (a[2] * a[3] - a[0] * a[5]) / d, (a[3] * a[7] - a[4] * a[6]) / d, (a[1] * a[6] - a[0] * a[7]) / d, (a[0] * a[4] - a[1] * a[3]) / d];
};
const mul33 = (p, q) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c]));

/** The rig's rest matrices, once a skeleton. */
function rigOf(arm) {
  let rig = RIGS.get(arm.skeleton);
  if (!rig) {
    const rest = arm.fns.skelMats(arm.skeleton, arm.fns.poseSkeleton(arm.skeleton, null, null, 0, { accumRoot: null }), -1);
    rig = { rest, chest: arm.skeleton.byName.get(CLOAK_CONTACT.chest) };
    RIGS.set(arm.skeleton, rig);
  }
  return rig;
}

/** The cloth's field box, once a cloth state: its fitted (x, z) and y spans, the margin round them. */
function boxOf(state) {
  if (!state.field) {
    const b = state.base, m = CLOAK_CONTACT.margin;
    let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let o = 0; o < b.length; o += 3) {
      x0 = Math.min(x0, b[o]); x1 = Math.max(x1, b[o]); y1 = Math.max(y1, b[o + 1]); z0 = Math.min(z0, b[o + 2]); z1 = Math.max(z1, b[o + 2]);
    }
    const ox = Math.floor(x0 - m), oz = Math.floor(z0 - m), w = Math.ceil(x1 + m) - ox + 1, h = Math.ceil(z1 + m) - oz + 1;
    state.field = { ox, oz, w, h, yTop: y1 + m, back: new Float32Array(w * h) };
  }
  return state.field;
}

/** The worn pieces the cloth goes over: what it was fitted over, less a tail and a shield. */
const isUnderOf = (piece) => (p) => p !== piece && !!piece.clothPhysicsUnderSlots?.has(p.slot) && p.slot !== 'tail' && !/^shield\b/.test(p.slot ?? '') && !p.hidden;

/**
 * The body the cloth of `piece` meets this frame: `{ field }`, the backmost y of the worn pieces over each unit of the
 * cloak's (x, z) in its bind space (Infinity: nothing there). Null with no live pose.
 * @param {any} arm the third-person assembly (its `pose` and `mats` the frame's)
 * @param {any} piece the cloak, its `clothPhysics` made
 * @param {(p: any) => boolean} [isUnder] the pieces it goes over (default: its `clothPhysicsUnderSlots`)
 */
export function cloakColliders(arm, piece, isUnder = isUnderOf(piece)) {
  const state = piece?.clothPhysics;
  if (!state || !arm?.mats || !arm.pose || !arm.skeleton || !arm.fns) return null;
  const rig = rigOf(arm), restChest = rig.rest.get(rig.chest), liveChest = arm.mats.get(rig.chest);
  if (!restChest || !liveChest) return null;
  const f = boxOf(state), { ox, oz, w, h, yTop, back } = f;
  back.fill(Infinity);
  // the worn piece's posed point into the cloak's bind: rest chest after the live one undone
  const R = mul33(restChest.a, inv3(liveChest.a)), lt = liveChest.t, rt = restChest.t;
  const lift = (x, y, z) => { x -= lt[0]; y -= lt[1]; z -= lt[2]; return [R[0] * x + R[1] * y + R[2] * z + rt[0], R[3] * x + R[4] * y + R[5] * z + rt[1], R[6] * x + R[7] * y + R[8] * z + rt[2]]; };
  const put = (i, j, y) => { if (i >= 0 && j >= 0 && i < w && j < h && y < back[j * w + i]) back[j * w + i] = y; };
  for (const p of arm.pieces) {
    if (!isUnder(p) || !p.indices?.length) continue;
    let s = SCRATCH.get(p);
    const n = p.kind === 'skinned' ? p.batch?.positions?.length : p.source?.length;
    if (!n) continue;
    if (!s || s.posed.length !== n) { s = { posed: new Float32Array(n), bind: new Float32Array(n) }; SCRATCH.set(p, s); }
    if (p.kind === 'skinned') arm.fns.skinBatch(p.batch, arm.skeleton, arm.pose, arm.mats, s.posed, null);
    else if (arm.fns.attachmentTransform) placeAtBone(p.source, arm.fns.attachmentTransform(arm.mats, p.attachRef), p.mirrored, s.posed, p.boneOffset);
    else continue;
    const P = s.bind;
    for (let o = 0; o < n; o += 3) {
      const q = lift(s.posed[o], s.posed[o + 1], s.posed[o + 2]);
      P[o] = q[0] - ox; P[o + 1] = q[1]; P[o + 2] = q[2] - oz;
      put(Math.round(P[o]), Math.round(P[o + 2]), q[1]);
    }
    const I = p.indices;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ax = P[a], ay = P[a + 1], az = P[a + 2], bx = P[b], by = P[b + 1], bz = P[b + 2], cx = P[c], cy = P[c + 1], cz = P[c + 2];
      if (Math.min(ay, by, cy) > yTop) continue;
      const i0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx))), i1 = Math.min(w - 1, Math.floor(Math.max(ax, bx, cx)));
      const j0 = Math.max(0, Math.ceil(Math.min(az, bz, cz))), j1 = Math.min(h - 1, Math.floor(Math.max(az, bz, cz)));
      if (i0 > i1 || j0 > j1) continue;
      const d = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(d) < 1e-9) continue;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const wa = ((bx - i) * (cz - j) - (cx - i) * (bz - j)) / d, wb = ((cx - i) * (az - j) - (ax - i) * (cz - j)) / d, wc = 1 - wa - wb;
        if (wa < -1e-6 || wb < -1e-6 || wc < -1e-6) continue;
        const y = wa * ay + wb * by + wc * cy;
        if (y < back[j * w + i]) back[j * w + i] = y;
      }
    }
  }
  // rounded: a point beside a piece stays behind it by its own distance - a hem row just under a heel kicked back
  // would otherwise pass under the boot between its points
  for (let k = 0; k < CLOAK_CONTACT.round; k++) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let y = back[j * w + i];
      if (i > 0) y = Math.min(y, back[j * w + i - 1] + 1); if (i + 1 < w) y = Math.min(y, back[j * w + i + 1] + 1);
      if (j > 0) y = Math.min(y, back[(j - 1) * w + i] + 1); if (j + 1 < h) y = Math.min(y, back[(j + 1) * w + i] + 1);
      back[j * w + i] = y;
    }
  }
  return { field: f };
}

/** The body's backmost y under the bind point (x, z): between four units, the plane they make; at the body's edge, the
 *  nearest one's; Infinity off the body. */
export function bodyBackAt(field, x, z) {
  const { ox, oz, w, h, back } = field;
  const fx = x - ox, fz = z - oz, i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i + 1 >= w || j + 1 >= h) return Infinity;
  const u = fx - i, v = fz - j;
  const a = back[j * w + i], b = back[j * w + i + 1], c = back[(j + 1) * w + i], d = back[(j + 1) * w + i + 1];
  if (a !== Infinity && b !== Infinity && c !== Infinity && d !== Infinity) return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  const near = [[a, u * u + v * v], [b, (1 - u) ** 2 + v * v], [c, u * u + (1 - v) ** 2], [d, (1 - u) ** 2 + (1 - v) ** 2]].filter(([y]) => y !== Infinity);
  return near.length ? near.sort((p, q) => p[1] - q[1])[0][0] : Infinity;
}

/** Push the free vertices of a cloth state back behind the body (bind -y), the push taking their speed into the body;
 *  answers how many it moved. */
export function meetCloakBody(state, colliders, fixed) {
  const field = colliders?.field;
  if (!field) return 0;
  const pos = state.pos, prev = state.prev; let moved = 0;
  for (let v = 0, o = 0; o < pos.length; v++, o += 3) {
    if (fixed(v)) continue;
    const limit = bodyBackAt(field, pos[o], pos[o + 2]) - CLOAK_CONTACT.clearance;
    const over = pos[o + 1] - limit;
    if (!(over > 0) || over > CLOAK_CONTACT.deep) continue;
    pos[o + 1] = limit;
    if (prev[o + 1] > limit) prev[o + 1] = limit;
    moved++;
  }
  return moved;
}

/** Is the stowed gear's footprint on the cloth due again? It moves with the back it hangs from: five times a second. */
export function cloakGearDue(arm, dt) {
  const left = (GEAR.get(arm) ?? 0) - Math.max(0, Number(dt) || 0);
  GEAR.set(arm, left <= 0 ? CLOAK_CONTACT.gearEvery : left);
  return left <= 0;
}
