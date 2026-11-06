// @ts-check
// TRUNK-SKIN (2026-11-06, the owner's 19-47-18 recording: running with a two-hander, "the shoulder sinks into the chest").
// ARM-CLEARANCE measured the trunk as one ellipse about the chest - a man's, from the pelvis to the chest bone - and the
// game's body is Better Bodies (67d1d4c46d): a woman's breasts stand 0.63 of the shoulder width out in front where that
// ellipse ended at 0.42, and the upper arm above the chest bone was never looked at. THE TRUNK'S OWN SKIN instead:
// Better Bodies' trunk (its Tri Chest and Tri Groin, the faces on the spine and the pelvis), every race, as a polar
// profile about the chest bone in the chest's frame - slices DZ shoulder widths high from z0, NA bins round from the
// left (atan2(fwd, right) + pi), each the furthest the skin stands out there (shoulder widths; 0 where no trunk is: the
// shoulders' own seam, between the thighs). Baked once from the meshes on the retail rig's rest; the races share one
// shape, so it is the body's, not a race's. The port's own; Daggerfall Unity draws no arm.

/** The limbs' own half-thickness (shoulder widths, Better Bodies' median about the bone): a point on the bone stands
 *  this far inside its skin. */
export const LIMB = Object.freeze({ upper: 0.16, fore: 0.13 });

export const TRUNK_PROFILE = Object.freeze({
  NA: 16, DZ: 0.1,
  female: Object.freeze({ z0: -15, rows: Object.freeze([
    Object.freeze([0, 0.53, 0.52, 0.45, 0.44, 0.5, 0.52, 0, 0, 0, 0.28, 0.28, 0.27, 0.28, 0, 0]),
    Object.freeze([0, 0.53, 0.52, 0.46, 0.45, 0.5, 0.52, 0, 0, 0, 0.32, 0.3, 0.3, 0.32, 0, 0]),
    Object.freeze([0, 0.54, 0.51, 0.47, 0.45, 0.51, 0.54, 0, 0, 0.38, 0.34, 0.33, 0.33, 0.34, 0.36, 0]),
    Object.freeze([0.51, 0.53, 0.5, 0.46, 0.45, 0.49, 0.53, 0.52, 0.5, 0.47, 0.37, 0.35, 0.34, 0.35, 0.44, 0.49]),
    Object.freeze([0.51, 0.51, 0.48, 0.43, 0.43, 0.47, 0.5, 0.51, 0.49, 0.47, 0.39, 0.36, 0.35, 0.37, 0.45, 0.49]),
    Object.freeze([0.48, 0.47, 0.43, 0.38, 0.38, 0.43, 0.46, 0.49, 0.48, 0.44, 0.38, 0.37, 0.36, 0.37, 0.43, 0.47]),
    Object.freeze([0.43, 0.41, 0.37, 0.31, 0.3, 0.37, 0.39, 0.44, 0.45, 0.44, 0.36, 0.36, 0.36, 0.36, 0.41, 0.44]),
    Object.freeze([0.39, 0.35, 0.3, 0.26, 0.26, 0.3, 0.35, 0.41, 0.41, 0.42, 0.36, 0.36, 0.35, 0.35, 0.4, 0.4]),
    Object.freeze([0.35, 0.29, 0.24, 0.21, 0.22, 0.24, 0.3, 0.36, 0.37, 0.38, 0.37, 0.37, 0.36, 0.35, 0.36, 0.35]),
    Object.freeze([0.31, 0.26, 0.23, 0.2, 0.21, 0.22, 0.27, 0.33, 0.35, 0.38, 0.38, 0.37, 0.36, 0.37, 0.37, 0.33]),
    Object.freeze([0.34, 0.29, 0.26, 0.23, 0.23, 0.26, 0.3, 0.35, 0.38, 0.42, 0.43, 0.39, 0.39, 0.42, 0.41, 0.36]),
    Object.freeze([0.36, 0.34, 0.29, 0.26, 0.27, 0.29, 0.36, 0.38, 0.41, 0.46, 0.46, 0.43, 0.43, 0.45, 0.45, 0.4]),
    Object.freeze([0.39, 0.39, 0.32, 0.28, 0.27, 0.32, 0.4, 0.4, 0.43, 0.47, 0.53, 0.5, 0.5, 0.53, 0.47, 0.42]),
    Object.freeze([0.43, 0.45, 0.39, 0.3, 0.3, 0.39, 0.45, 0.44, 0.44, 0.57, 0.61, 0.59, 0.59, 0.61, 0.57, 0.43]),
    Object.freeze([0.45, 0.45, 0.43, 0.34, 0.34, 0.43, 0.45, 0.45, 0.45, 0.59, 0.63, 0.62, 0.62, 0.63, 0.59, 0.45]),
    Object.freeze([0, 0.46, 0.44, 0.35, 0.35, 0.44, 0.46, 0, 0.46, 0.58, 0.63, 0.61, 0.61, 0.63, 0.58, 0.46]),
    Object.freeze([0, 0, 0, 0.35, 0.35, 0, 0, 0, 0, 0.54, 0.57, 0.54, 0.54, 0.57, 0.54, 0]),
    Object.freeze([0, 0, 0, 0.34, 0.34, 0, 0, 0, 0, 0.49, 0.49, 0.44, 0.44, 0.49, 0.49, 0]),
    Object.freeze([0, 0, 0.32, 0.33, 0.33, 0.32, 0, 0, 0, 0, 0.41, 0.34, 0.34, 0.41, 0, 0]),
    Object.freeze([0, 0, 0.3, 0.28, 0.28, 0.3, 0, 0, 0, 0.28, 0.34, 0.24, 0.24, 0.34, 0.28, 0]),
    Object.freeze([0, 0.21, 0.22, 0.16, 0.16, 0.22, 0.21, 0, 0, 0.21, 0, 0, 0, 0, 0.21, 0]),
  ]) }),
  male: Object.freeze({ z0: -15, rows: Object.freeze([
    Object.freeze([0, 0, 0, 0.37, 0.37, 0, 0, 0, 0, 0, 0.27, 0.33, 0.35, 0.28, 0, 0]),
    Object.freeze([0, 0, 0, 0.4, 0.45, 0, 0, 0, 0, 0, 0.33, 0.39, 0.4, 0.34, 0, 0]),
    Object.freeze([0, 0.53, 0.51, 0.46, 0.45, 0.5, 0.52, 0, 0, 0.38, 0.35, 0.4, 0.4, 0.35, 0.36, 0]),
    Object.freeze([0.51, 0.51, 0.5, 0.45, 0.44, 0.49, 0.51, 0.52, 0.5, 0.47, 0.37, 0.4, 0.4, 0.36, 0.44, 0.49]),
    Object.freeze([0.51, 0.5, 0.47, 0.42, 0.42, 0.47, 0.49, 0.51, 0.49, 0.47, 0.39, 0.38, 0.39, 0.37, 0.45, 0.49]),
    Object.freeze([0.48, 0.47, 0.43, 0.38, 0.38, 0.43, 0.46, 0.49, 0.48, 0.44, 0.38, 0.38, 0.37, 0.37, 0.43, 0.47]),
    Object.freeze([0.43, 0.41, 0.37, 0.31, 0.3, 0.37, 0.41, 0.45, 0.46, 0.43, 0.37, 0.37, 0.36, 0.36, 0.41, 0.44]),
    Object.freeze([0.42, 0.4, 0.33, 0.29, 0.29, 0.33, 0.38, 0.44, 0.44, 0.42, 0.38, 0.38, 0.37, 0.36, 0.4, 0.42]),
    Object.freeze([0.41, 0.36, 0.3, 0.26, 0.26, 0.3, 0.36, 0.42, 0.42, 0.41, 0.38, 0.39, 0.37, 0.36, 0.39, 0.4]),
    Object.freeze([0.38, 0.34, 0.29, 0.26, 0.26, 0.3, 0.34, 0.4, 0.41, 0.41, 0.39, 0.4, 0.39, 0.38, 0.38, 0.39]),
    Object.freeze([0.39, 0.33, 0.31, 0.28, 0.28, 0.32, 0.33, 0.4, 0.42, 0.43, 0.4, 0.4, 0.4, 0.39, 0.41, 0.41]),
    Object.freeze([0.41, 0.37, 0.33, 0.31, 0.31, 0.34, 0.38, 0.42, 0.45, 0.47, 0.46, 0.41, 0.41, 0.45, 0.46, 0.44]),
    Object.freeze([0.43, 0.43, 0.36, 0.34, 0.33, 0.36, 0.44, 0.45, 0.47, 0.49, 0.47, 0.43, 0.42, 0.46, 0.48, 0.46]),
    Object.freeze([0.47, 0.46, 0.41, 0.34, 0.34, 0.41, 0.47, 0.47, 0.48, 0.5, 0.48, 0.44, 0.44, 0.48, 0.49, 0.48]),
    Object.freeze([0.48, 0.48, 0.45, 0.35, 0.35, 0.45, 0.48, 0.48, 0.5, 0.52, 0.5, 0.46, 0.46, 0.5, 0.52, 0.5]),
    Object.freeze([0, 0.47, 0.46, 0.39, 0.39, 0.46, 0.47, 0, 0.5, 0.53, 0.51, 0.46, 0.46, 0.51, 0.53, 0.5]),
    Object.freeze([0, 0, 0, 0.37, 0.37, 0, 0, 0, 0, 0.52, 0.5, 0.44, 0.44, 0.5, 0.52, 0]),
    Object.freeze([0, 0, 0, 0.36, 0.36, 0, 0, 0, 0, 0.5, 0.48, 0.42, 0.42, 0.48, 0.5, 0]),
    Object.freeze([0, 0, 0, 0.34, 0.34, 0, 0, 0, 0, 0.45, 0.44, 0.38, 0.38, 0.44, 0.45, 0]),
    Object.freeze([0, 0, 0.32, 0.3, 0.3, 0.32, 0, 0, 0, 0.4, 0.38, 0.29, 0.29, 0.38, 0.4, 0]),
    Object.freeze([0, 0.29, 0.27, 0.22, 0.22, 0.27, 0.29, 0, 0, 0.27, 0.23, 0, 0, 0.23, 0.27, 0]),
  ]) }),
});

/** The trunk's skin radius (shoulder widths) at the chest-frame point (x right, y forward, z up; shoulder widths), for a
 *  `kind` (bodyKindOf's word: a female's breasts, any other the male trunk); 0 where no trunk stands. Bins and slices
 *  are read as they were baked - the furthest skin of the cell - and a cell's empty neighbour leaves it its own. */
export function trunkRadius(kind, x, y, z) {
  const P = String(kind ?? '').includes('female') ? TRUNK_PROFILE.female : TRUNK_PROFILE.male;
  const row = P.rows[Math.floor(z / TRUNK_PROFILE.DZ) - P.z0];
  if (!row) return 0;
  const NA = TRUNK_PROFILE.NA, f = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI) * NA - 0.5;
  const i0 = ((Math.floor(f) % NA) + NA) % NA, i1 = (i0 + 1) % NA, t = f - Math.floor(f);
  const a = row[i0], b = row[i1];
  if (!(a > 0)) return b > 0 && t > 0.5 ? b : 0;
  if (!(b > 0)) return t < 0.5 ? a : 0;
  return a + (b - a) * t;
}

/** How deep an arm's elbow (`mid`, its forearm's thickness on it) and its upper arm's lower half (between `shoulder` and
 *  `mid`, the upper arm's) stand inside the trunk's skin, in shoulder widths (0 clear), for the chest frame `F`
 *  ({ right, fwd, up }) at `chest` on a body `sw` shoulder widths across. */
export function trunkInside(kind, F, chest, sw) {
  const depth = (p, limb) => {
    const d = [p[0] - chest[0], p[1] - chest[1], p[2] - chest[2]];
    const x = (d[0] * F.right[0] + d[1] * F.right[1] + d[2] * F.right[2]) / sw;
    const y = (d[0] * F.fwd[0] + d[1] * F.fwd[1] + d[2] * F.fwd[2]) / sw;
    const z = (d[0] * F.up[0] + d[1] * F.up[1] + d[2] * F.up[2]) / sw;
    const R = trunkRadius(kind, x, y, z);
    return R > 0 ? Math.max(0, R + limb - Math.hypot(x, y)) : 0;
  };
  return (mid, shoulder) => Math.max(depth(mid, LIMB.fore), shoulder ? depth(mid.map((v, i) => (v + shoulder[i]) / 2), LIMB.upper) : 0);
}
