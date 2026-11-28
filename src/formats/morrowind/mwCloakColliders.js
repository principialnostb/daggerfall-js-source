// @ts-check
// Use the posed surfaces of worn pieces to keep the animated cloak clear of the body and the stowed shield.
import { placeAtBone } from './mwFirstPerson.js';
import { affineMul } from './mwAffine.js';
import { enableRigidBatchSkin, skinPost } from './mwSkin.js';

/** Units the cloth keeps behind the body; the most one frame pushes it (deeper is a limb over the cloak, not under it);
 *  units a piece is rounded by, sideways;
 *  units round the fitted cloth the field covers; the bone the cloak is skinned to; seconds between gear footprints. */
export const CLOAK_CONTACT = Object.freeze({ clearance: 1, deep: 6, margin: 8, round: 2, chest: 'bip01 spine2', gearEvery: 0.2 });

const RIGS = new WeakMap();
const GEAR = new WeakMap();
const SCRATCH = new WeakMap();
const FULL_CLOAK_BIND = new WeakMap();

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
  const batch = piece.batch, skin = batch?.skin;
  let bind = null;
  if (skin) {
    if (!FULL_CLOAK_BIND.has(skin)) FULL_CLOAK_BIND.set(skin, enableRigidBatchSkin(batch));
    if (FULL_CLOAK_BIND.get(skin)) {
      const bone = skin.bones[0], live = arm.mats.get(bone.ref);
      if (live) bind = affineMul(skinPost(skin, arm.skeleton, arm.pose), affineMul(live, bone.invBind));
    }
  }
  if (!bind && (!restChest || !liveChest)) return null;
  const f = boxOf(state), { ox, oz, w, h, yTop, back } = f;
  back.fill(Infinity);
  // A chest-bound mesh can have its own frame. Invert its actual skinning
  // transform so the live collision surface lines up with the drawn cloth.
  const R = bind ? inv3(bind.a) : mul33(restChest.a, inv3(liveChest.a));
  const lt = bind?.t ?? liveChest.t, rt = bind ? [0, 0, 0] : restChest.t;
  const lift = (x, y, z) => { x -= lt[0]; y -= lt[1]; z -= lt[2]; return [R[0] * x + R[1] * y + R[2] * z + rt[0], R[3] * x + R[4] * y + R[5] * z + rt[1], R[6] * x + R[7] * y + R[8] * z + rt[2]]; };
  const put = (i, j, y) => { if (i >= 0 && j >= 0 && i < w && j < h && y < back[j * w + i]) back[j * w + i] = y; };
  for (const p of arm.pieces) {
    if (!isUnder(p) || !p.indices?.length) continue;
    let s = SCRATCH.get(p);
    const n = p.kind === 'skinned' ? p.batch?.positions?.length : p.source?.length;
    if (!n) continue;
    if (!s || s.posed.length !== n) { s = { posed: new Float32Array(n), bind: new Float32Array(n) }; SCRATCH.set(p, s); }
    const posed = arm.cpuSkinned && p.positions?.length === n ? p.positions : s.posed;
    if (posed === s.posed) {
      if (p.kind === 'skinned') arm.fns.skinBatch(p.batch, arm.skeleton, arm.pose, arm.mats, posed, null);
      else if (arm.fns.attachmentTransform) placeAtBone(p.source, p.followAt ?? arm.fns.attachmentTransform(arm.mats, p.attachRef), p.mirrored, posed, p.boneOffset);
      else continue;
    }
    const P = s.bind;
    for (let o = 0; o < n; o += 3) {
      const q = lift(posed[o], posed[o + 1], posed[o + 2]);
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
  const u0 = u * u, u1 = (1 - u) ** 2, v0 = v * v, v1 = (1 - v) ** 2;
  const da = a === Infinity ? Infinity : u0 + v0, db = b === Infinity ? Infinity : u1 + v0;
  const dc = c === Infinity ? Infinity : u0 + v1, dd = d === Infinity ? Infinity : u1 + v1;
  const nearest = Math.min(da, db, dc, dd);
  return nearest === da ? a : nearest === db ? b : nearest === dc ? c : d;
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

/** Keep armour ridges clear between cloth vertices without moving the shoulder anchors sideways. */
export function clearCloakFaces(state, colliders, indices) {
  const field = colliders?.field;
  if (!field) return;
  const { pos, prev } = state;
  const push = state.facePush ??= new Float32Array(pos.length / 3);
  push.fill(0);
  const depth = (x, y, z) => Math.min(3, y - bodyBackAt(field, x, z) + CLOAK_CONTACT.clearance);
  for (let i = 0; i < pos.length; i += 3) push[i / 3] = Math.max(0, depth(pos[i], pos[i + 1], pos[i + 2]));
  for (const { a, b } of state.edges) {
    const x = a * 3, y = b * 3;
    const amount = depth((pos[x] + pos[y]) * .5, (pos[x + 1] + pos[y + 1]) * .5, (pos[x + 2] + pos[y + 2]) * .5);
    push[a] = Math.max(push[a], amount);
    push[b] = Math.max(push[b], amount);
  }
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    const x = a * 3, y = b * 3, z = c * 3;
    const amount = depth((pos[x] + pos[y] + pos[z]) / 3, (pos[x + 1] + pos[y + 1] + pos[z + 1]) / 3,
      (pos[x + 2] + pos[y + 2] + pos[z + 2]) / 3);
    push[a] = Math.max(push[a], amount);
    push[b] = Math.max(push[b], amount);
    push[c] = Math.max(push[c], amount);
  }
  for (let v = 0; v < push.length; v++) {
    if (!push[v]) continue;
    const y = v * 3 + 1;
    pos[y] -= push[v];
    prev[y] = Math.min(prev[y], pos[y]);
  }
}

/** Is the stowed gear's footprint on the cloth due again? It moves with the back it hangs from: five times a second. */
export function cloakGearDue(arm, dt) {
  const left = (GEAR.get(arm) ?? 0) - Math.max(0, Number(dt) || 0);
  GEAR.set(arm, left <= 0 ? CLOAK_CONTACT.gearEvery : left);
  return left <= 0;
}
