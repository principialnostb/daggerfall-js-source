// @ts-check
// CLOAK-CONTACT (the owner, 2026-11-12: the animated cloak "stands very far from the back", gear slung over it "does not
// press it", and it costs frames; measured: the live contact pass refitted the cloak to the whole body every frame, 14.4
// ms, and each push stayed in the cloth). The body the cloth meets is a few capsules on the live bones instead, given
// in the cloak's own bind space - the cloak rides the chest, so one transform takes them there. A capsule is never
// wider than the fitted cloak leaves room for at rest: standing it pushes nothing, and a limb moving into the cloth does.

const SEGMENTS = Object.freeze([
  ['bip01 pelvis', 'bip01 spine1', 9.5], ['bip01 spine1', 'bip01 neck', 10],
  ['bip01 l thigh', 'bip01 l calf', 6.5], ['bip01 r thigh', 'bip01 r calf', 6.5],
  ['bip01 l calf', 'bip01 l foot', 4.6], ['bip01 r calf', 'bip01 r foot', 4.6],
  ['bip01 l upperarm', 'bip01 l forearm', 4.2], ['bip01 r upperarm', 'bip01 r forearm', 4.2],
  ['bip01 l forearm', 'bip01 l hand', 3.6], ['bip01 r forearm', 'bip01 r hand', 3.6],
]);
/** Units a capsule stands inside the fitted cloth at rest; seconds between the gear's footprints being taken again. */
export const CLOAK_CONTACT = Object.freeze({ slack: 0.15, gearEvery: 0.2, chest: 'bip01 spine2' });

const RIGS = new WeakMap();
const GEAR = new WeakMap();

const inv3 = (a) => {
  const d = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  return [(a[4] * a[8] - a[5] * a[7]) / d, (a[2] * a[7] - a[1] * a[8]) / d, (a[1] * a[5] - a[2] * a[4]) / d, (a[5] * a[6] - a[3] * a[8]) / d,
    (a[0] * a[8] - a[2] * a[6]) / d, (a[2] * a[3] - a[0] * a[5]) / d, (a[3] * a[7] - a[4] * a[6]) / d, (a[1] * a[6] - a[0] * a[7]) / d, (a[0] * a[4] - a[1] * a[3]) / d];
};
const mulv = (a, v) => [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];

/** How far the point at offset `o` of `positions` stands from the segment a-b, and the nearest point on it. */
export function segmentReach(positions, o, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((positions[o] - a[0]) * ab[0] + (positions[o + 1] - a[1]) * ab[1] + (positions[o + 2] - a[2]) * ab[2]) / l2)) : 0;
  const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return { d: Math.hypot(positions[o] - c[0], positions[o + 1] - c[1], positions[o + 2] - c[2]), c };
}

/** The rig's rest matrices and the segments' bone refs, once a skeleton. */
function rigOf(arm) {
  let rig = RIGS.get(arm.skeleton);
  if (!rig) {
    const ref = (n) => arm.skeleton.byName.get(n);
    const rest = arm.fns.skelMats(arm.skeleton, arm.fns.poseSkeleton(arm.skeleton, null, null, 0, { accumRoot: null }), -1);
    rig = { rest, chest: ref(CLOAK_CONTACT.chest), segments: SEGMENTS.map(([a, b, r]) => ({ a: ref(a), b: ref(b), r })).filter((s) => s.a != null && s.b != null) };
    RIGS.set(arm.skeleton, rig);
  }
  return rig;
}

/**
 * The capsules the cloth of `piece` meets this frame, in its bind space: `[{ a, b, r }]`. Null with no live pose.
 * @param {any} arm the third-person assembly (its `mats` the frame's)
 * @param {any} piece the cloak, its `clothPhysics` made
 */
export function cloakColliders(arm, piece) {
  const state = piece?.clothPhysics;
  if (!state || !arm?.mats || !arm.skeleton || !arm.fns) return null;
  const rig = rigOf(arm), restChest = rig.rest.get(rig.chest), liveChest = arm.mats.get(rig.chest);
  if (!restChest || !liveChest) return null;
  if (!state.capsuleR) {
    // never wider than the fitted cloth leaves room for at rest
    state.capsuleR = rig.segments.map((s) => {
      const a = rig.rest.get(s.a)?.t, b = rig.rest.get(s.b)?.t; let r = s.r;
      if (!a || !b) return 0;
      for (let o = 0; o < state.base.length; o += 3) r = Math.min(r, segmentReach(state.base, o, a, b).d - CLOAK_CONTACT.slack);
      return Math.max(0, r);
    });
  }
  const back = inv3(liveChest.a);
  const toBind = (t) => { const v = mulv(restChest.a, mulv(back, [t[0] - liveChest.t[0], t[1] - liveChest.t[1], t[2] - liveChest.t[2]])); return [v[0] + restChest.t[0], v[1] + restChest.t[1], v[2] + restChest.t[2]]; };
  const out = [];
  rig.segments.forEach((s, i) => {
    const a = arm.mats.get(s.a)?.t, b = arm.mats.get(s.b)?.t;
    if (a && b && state.capsuleR[i] > 0.05) out.push({ a: toBind(a), b: toBind(b), r: state.capsuleR[i] });
  });
  return out;
}

/** Push the free vertices of a cloth state out of the capsules; answers how many it moved. */
export function pushOutOfCapsules(state, capsules, fixed) {
  if (!capsules?.length) return 0;
  const pos = state.pos; let moved = 0;
  for (const cap of capsules) {
    const lo = [Math.min(cap.a[0], cap.b[0]) - cap.r, Math.min(cap.a[1], cap.b[1]) - cap.r, Math.min(cap.a[2], cap.b[2]) - cap.r];
    const hi = [Math.max(cap.a[0], cap.b[0]) + cap.r, Math.max(cap.a[1], cap.b[1]) + cap.r, Math.max(cap.a[2], cap.b[2]) + cap.r];
    for (let v = 0, o = 0; o < pos.length; v++, o += 3) {
      if (pos[o] < lo[0] || pos[o] > hi[0] || pos[o + 1] < lo[1] || pos[o + 1] > hi[1] || pos[o + 2] < lo[2] || pos[o + 2] > hi[2] || fixed(v)) continue;
      const { d, c } = segmentReach(pos, o, cap.a, cap.b);
      if (d >= cap.r) continue;
      // straight out of the limb; a vertex on its very axis goes back (-y), behind the body
      const k = d > 1e-5 ? cap.r / d : 0;
      if (k) { pos[o] = c[0] + (pos[o] - c[0]) * k; pos[o + 1] = c[1] + (pos[o + 1] - c[1]) * k; pos[o + 2] = c[2] + (pos[o + 2] - c[2]) * k; } else pos[o + 1] = c[1] - cap.r;
      moved++;
    }
  }
  return moved;
}

/** Is the stowed gear's footprint on the cloth due again? It moves with the back it hangs from: five times a second. */
export function cloakGearDue(arm, dt) {
  const left = (GEAR.get(arm) ?? 0) - Math.max(0, Number(dt) || 0);
  GEAR.set(arm, left <= 0 ? CLOAK_CONTACT.gearEvery : left);
  return left <= 0;
}
