// MW-BRIG2 (2026-09-29, Mac on MW-BRIG1: "The texture was great, you just somehow moved the geometry in the
// process"): A WORN MODEL SKINNED FROM THE BODY UNDER IT.
//
// MW-BRIG1 hung the steel brigandine RIGID on the skeleton's "Chest" and "Groin" nodes and took each node's REST
// transform back out (restPoseInverse). The body it was fitted to does not move that way. A retail body part is
// SKINNED (Morrowind-Rules.md MW-D21: "authored part-local, is a torso on the ground"), and the reference places
// every one of its vertices by the part's OWN NiSkinData - v' = v * (Sum w_i * invBind_i * boneSkelMat_i) *
// skinToSkel * skinTransform (rule 20) - on the spine, pelvis and leg bones, never on the Chest node. So the moment
// the idle played, the torso moved by its bones and the brigandine by a node the body never uses, and the two came
// apart. Nothing about the fit could have saved it: two things placed by two different transforms agree in one pose
// at most.
//
// The fix is to stop having two transforms. Each garment vertex copies the skin of the body vertex nearest it - the
// same bones, the same weights, the same inverse binds, the same skin transform - and its own position is solved so
// that, in the pose the modeller fitted it in (the skeleton at rest), that skin puts it exactly where it was
// authored. From then on it is drawn by skinBatch, the one door the body itself goes through, so every frame it moves
// by precisely the transform the skin under it moves by. It is the "copy bone weights" every armour fitter uses,
// with the reference's own skinning doing the rest.
//
// A body part that is RIGID (some mods' are) is a skin of one bone: its attach bone, with the mirror and BoneOffset
// the rigid path applies (rules 13 and 14) as the inverse bind, so a garment over it rides that bone exactly as the
// part does.
//
// MW-BRIG3 (2026-09-29, Mac on MW-BRIG2: "completely broke the morrowind torso" - "it's placed lower where the torso
// should be", worn only, on a male body): THE DEFECT WAS WHERE IT SAT, BOTH TIMES. The skinning above holds the
// garment to the body in every pose, and it holds it exactly as far from the body as it started - so a garment that
// starts too LOW stays too low, and it hides the chest skin it was meant to cover (the cuirass slot shadows it), which
// leaves the upper torso empty under the neck. Both MW-BRIG1 and MW-BRIG2 took the height from the modeller's scene
// on faith (tools/bakeBrigandine.mjs: that scene's body "is" the skeleton at rest), and nobody measured the result on a
// real body. The brigandine itself says the scene's body was not this one: its collar peaks at z 94.8 and its belt at
// z ~67, well under a Morrowind man's neck and waist. So the height is now MEASURED ON THE WEARER (fitLift below): the
// garment's top meets the top of the body part it hides, in the same rest pose the skin is solved in.

import { GRAPH_ROOT } from './mwSkin.js';

const IDENT_TRANSFORM = Object.freeze({ rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0], scale: 1 });

/**
 * A body batch as a SKIN. A skinned batch is returned as it is; a rigid one becomes a skin of its one attach bone,
 * the rigid path's mirror (rule 13) and BoneOffset (rule 14) folded into the inverse bind so the result lands where
 * the rigid path draws the part.
 */
export function sourceSkin(batch, { attachRef = null, mirrored = false, boneOffset = null } = {}) {
  if (batch.skinned && batch.skin) return batch;
  const n = batch.positions.length / 3;
  const a = Float32Array.from([mirrored ? -1 : 1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const t = boneOffset ? [boneOffset[0], boneOffset[1], boneOffset[2]] : [0, 0, 0];
  return {
    ...batch,
    skinned: true,
    skin: {
      skeletonRoot: GRAPH_ROOT, rootBone: GRAPH_ROOT, transform: IDENT_TRANSFORM, shapeTransform: null,
      bones: [{ ref: attachRef, name: '', invBind: { a, t }, indices: Array.from({ length: n }, (_, i) => i), weights: new Array(n).fill(1) }],
    },
  };
}

/**
 * MW-BRIG3: THE LIFT that puts a garment on the wearer. Morrowind is Z-up; this answers how far along +Z the garment
 * must move so that its highest point meets the highest point of `anchors` - the body part it hides, SKINNED in
 * `ctx`'s pose (the rest pose the transfer is solved in). Skinned, never read raw: a retail part's authored vertices
 * are part-local, "a torso on the ground" (Morrowind-Rules.md MW-D21). A pure translation, so the garment's shape is
 * the modeller's to the last vertex. Null with no garment or no anchor vertex: nothing to measure against.
 * `ctx` is { skeleton, pose, mats, skinBatch }; the anchors are skins (sourceSkin).
 */
export function fitLift(garments, anchors, ctx) {
  let top = -Infinity;
  for (const g of garments) for (let i = 2; i < g.positions.length; i += 3) top = Math.max(top, g.positions[i]);
  let anchorTop = -Infinity;
  for (const a of anchors) {
    const p = new Float32Array(a.positions.length);
    ctx.skinBatch(a, ctx.skeleton, ctx.pose, ctx.mats, p, null);
    for (let i = 2; i < p.length; i += 3) anchorTop = Math.max(anchorTop, p[i]);
  }
  if (!Number.isFinite(top) || !Number.isFinite(anchorTop)) return null;
  return { lift: anchorTop - top, top, anchorTop };
}

/** The garment batch moved `lift` along +Z, on a copy: the bound batch is never written. */
export function liftBatch(batch, lift) {
  const positions = Float32Array.from(batch.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] += lift;
  return { ...batch, positions };
}

/** Every vertex's influences, as [boneIndex, weight] pairs, read off the skin's per-bone lists. */
function influencesOf(skin, n) {
  const out = Array.from({ length: n }, () => []);
  skin.bones.forEach((b, bi) => {
    for (let k = 0; k < b.indices.length; k++) out[b.indices[k]]?.push([bi, b.weights[k]]);
  });
  return out;
}

function invert33(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-12)) return null;
  const k = 1 / det;
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k,
    B * k, (a * i - c * g) * k, -(a * f - c * d) * k,
    C * k, -(a * h - b * g) * k, (a * e - b * d) * k];
}

/**
 * Each listed source vertex's whole skinning affine in `pose`, MEASURED through skinBatch itself rather than
 * re-derived: four probe vertices per source vertex (the origin and the three unit axes) carrying that vertex's
 * influences, skinned once. The columns and the translation are read off the result, so the garment is solved with
 * exactly the arithmetic that will draw it. Answers Map(j -> { a: 3x3 row-major, t }).
 */
function measureAffines(src, js, { skeleton, pose, mats, skinBatch }) {
  const infl = src.infl;
  const bones = src.batch.skin.bones.map((b) => ({ ref: b.ref, name: b.name, invBind: b.invBind, indices: [], weights: [] }));
  const positions = new Float32Array(js.length * 12);
  js.forEach((j, q) => {
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], q * 12);
    for (const [bi, w] of infl[j]) for (let c = 0; c < 4; c++) { bones[bi].indices.push(q * 4 + c); bones[bi].weights.push(w); }
  });
  const probe = { skin: { ...src.batch.skin, bones }, positions, normals: null };
  const out = new Float32Array(positions.length);
  skinBatch(probe, skeleton, pose, mats, out, null);
  const res = new Map();
  js.forEach((j, q) => {
    const o = q * 12;
    const t = [out[o], out[o + 1], out[o + 2]];
    const col = (k) => [out[o + k * 3] - t[0], out[o + k * 3 + 1] - t[1], out[o + k * 3 + 2] - t[2]];
    const [cx, cy, cz] = [col(1), col(2), col(3)];
    res.set(j, { a: [cx[0], cy[0], cz[0], cx[1], cy[1], cz[1], cx[2], cy[2], cz[2]], t });
  });
  return res;
}

/**
 * Skin `garment` (a rigid batch whose positions are where the modeller fitted it, in the pose `pose`) from the body
 * batches `sources` (skins, see sourceSkin). Answers one skinned batch per source the garment's triangles land on:
 * each carries that source's skin (bones, inverse binds, skin and shape transforms) with the garment's own
 * influences, positions solved so that skinning them in `pose` gives back the authored positions, and the garment's
 * UVs, material and triangles.
 *
 * A triangle goes to the source nearest the majority of its corners, and each corner copies the nearest vertex OF
 * THAT SOURCE, so a triangle is never split across two skins. `ctx` is { skeleton, pose, mats, skinBatch }.
 */
export function transferSkin(garment, sources, ctx) {
  if (!sources.length) return [];
  const src = sources.map((batch) => {
    const n = batch.positions.length / 3;
    const p = new Float32Array(batch.positions.length);
    ctx.skinBatch(batch, ctx.skeleton, ctx.pose, ctx.mats, p, null);
    return { batch, n, p, infl: influencesOf(batch.skin, n) };
  });
  const G = garment.positions;
  const gn = G.length / 3;
  const nearestIn = (s, v) => {
    const { p, n } = src[s];
    const x = G[v * 3], y = G[v * 3 + 1], z = G[v * 3 + 2];
    let best = -1; let bd = Infinity;
    for (let j = 0; j < n; j++) {
      const dx = p[j * 3] - x, dy = p[j * 3 + 1] - y, dz = p[j * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = j; }
    }
    return { j: best, d: bd };
  };
  const cache = new Map();
  const nearest = (s, v) => { const k = s * gn + v; let r = cache.get(k); if (!r) { r = nearestIn(s, v); cache.set(k, r); } return r; };
  const overall = (v) => { let bs = 0; let bd = Infinity; for (let s = 0; s < src.length; s++) { const r = nearest(s, v); if (r.d < bd) { bd = r.d; bs = s; } } return bs; };

  const subs = src.map(() => ({ map: new Map(), verts: [], indices: [] }));
  const I = garment.indices;
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    const votes = tri.map(overall);
    const s = votes.find((x) => votes.filter((y) => y === x).length >= 2) ?? votes[0];
    const sub = subs[s];
    for (const v of tri) {
      let at = sub.map.get(v);
      if (at === undefined) { at = sub.verts.length; sub.map.set(v, at); sub.verts.push({ v, j: nearest(s, v).j }); }
      sub.indices.push(at);
    }
  }

  const out = [];
  subs.forEach((sub, s) => {
    if (!sub.indices.length) return;
    const { batch, infl } = src[s];
    const js = [...new Set(sub.verts.map((x) => x.j))];
    const aff = measureAffines(src[s], js, ctx);
    const bones = batch.skin.bones.map((b) => ({ ref: b.ref, name: b.name, invBind: b.invBind, indices: [], weights: [] }));
    const positions = new Float32Array(sub.verts.length * 3);
    const uvs = garment.uvs ? new Float32Array(sub.verts.length * 2) : null;
    // MW-SMOOTH: the garment's own normals, solved as its positions are - skinBatch turns a normal by the blended 3x3
    // and renormalises, so the inverse of that 3x3 gives back the authored normal in this pose
    const N = garment.normals && garment.normals.length === G.length ? garment.normals : null;
    const normals = N ? new Float32Array(sub.verts.length * 3) : null;
    sub.verts.forEach(({ v, j }, k) => {
      const m = aff.get(j);
      const inv = invert33(m.a);
      const gx = G[v * 3] - m.t[0], gy = G[v * 3 + 1] - m.t[1], gz = G[v * 3 + 2] - m.t[2];
      if (inv) {
        positions[k * 3] = inv[0] * gx + inv[1] * gy + inv[2] * gz;
        positions[k * 3 + 1] = inv[3] * gx + inv[4] * gy + inv[5] * gz;
        positions[k * 3 + 2] = inv[6] * gx + inv[7] * gy + inv[8] * gz;
      } else {
        positions.set([G[v * 3], G[v * 3 + 1], G[v * 3 + 2]], k * 3);
      }
      if (normals) {
        const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
        const ox = inv ? inv[0] * nx + inv[1] * ny + inv[2] * nz : nx;
        const oy = inv ? inv[3] * nx + inv[4] * ny + inv[5] * nz : ny;
        const oz = inv ? inv[6] * nx + inv[7] * ny + inv[8] * nz : nz;
        const len = Math.hypot(ox, oy, oz) || 1;
        normals[k * 3] = ox / len; normals[k * 3 + 1] = oy / len; normals[k * 3 + 2] = oz / len;
      }
      for (const [bi, w] of infl[j]) { bones[bi].indices.push(k); bones[bi].weights.push(w); }
      if (uvs) { uvs[k * 2] = garment.uvs[v * 2]; uvs[k * 2 + 1] = garment.uvs[v * 2 + 1]; }
    });
    out.push({
      name: garment.name || '', skinned: true,
      skin: { ...batch.skin, bones: bones.filter((b) => b.indices.length) },
      positions, normals, uvs, colors: null, material: garment.material ?? null,
      indices: Uint16Array.from(sub.indices),
    });
  });
  return out;
}


/**
 * MW-BB-FIT2: triangle-surface garment clearance solver.
 *
 * Unlike the first vertex-nearest pilot, this queries the actual triangles of
 * each skinned source surface, uses the closest point on a triangle and
 * interpolates its vertex normal. A small BVH avoids an O(garment vertices *
 * body vertices) scan. This is still a clearance solver, not a full volumetric
 * collision solver: callers must supply the actual target body surfaces in
 * the same rest-pose coordinate frame as the garment.
 */
function closestPointTriangle(p, a, b, c) {
  const sub = (x, y) => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  const dot = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return { point: a, bary: [1, 0, 0] };
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return { point: b, bary: [0, 1, 0] };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return { point: [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]], bary: [1 - v, v, 0] };
  }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return { point: c, bary: [0, 0, 1] };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return { point: [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]], bary: [1 - w, 0, w] };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return { point: [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])], bary: [0, 1 - w, w] };
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return { point: [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w], bary: [1 - v - w, v, w] };
}
const boxDistance2 = (p, box) => {
  let d = 0;
  for (let k = 0; k < 3; k++) {
    const delta = p[k] < box.min[k] ? box.min[k] - p[k] : p[k] > box.max[k] ? p[k] - box.max[k] : 0;
    d += delta * delta;
  }
  return d;
};
function buildSurfaceBvh(positions, indices, normals) {
  const triangles = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ids = [indices[i], indices[i + 1], indices[i + 2]];
    if (ids.some((v) => v * 3 + 2 >= positions.length)) continue;
    const pts = ids.map((v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]);
    const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
    const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
    triangles.push({ ids, pts, min, max, center: min.map((v, k) => (v + max[k]) * 0.5) });
  }
  const build = (items) => {
    const min = [0, 1, 2].map((k) => Math.min(...items.map((t) => t.min[k])));
    const max = [0, 1, 2].map((k) => Math.max(...items.map((t) => t.max[k])));
    if (items.length <= 8) return { min, max, items };
    let axis = 0;
    if (max[1] - min[1] > max[axis] - min[axis]) axis = 1;
    if (max[2] - min[2] > max[axis] - min[axis]) axis = 2;
    items.sort((a, b) => a.center[axis] - b.center[axis]);
    const mid = items.length >> 1;
    return { min, max, left: build(items.slice(0, mid)), right: build(items.slice(mid)) };
  };
  return triangles.length ? build(triangles) : null;
}
function nearestSurfacePoint(p, root, normals, maxDistance2) {
  let best = null, bestD2 = maxDistance2;
  const visit = (node) => {
    if (!node || boxDistance2(p, node) >= bestD2) return;
    if (node.items) {
      for (const tri of node.items) {
        const hit = closestPointTriangle(p, ...tri.pts);
        const dx = p[0] - hit.point[0], dy = p[1] - hit.point[1], dz = p[2] - hit.point[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= bestD2) continue;
        const n = [0, 1, 2].map((k) => tri.ids.reduce((sum, id, q) => sum + normals[id * 3 + k] * hit.bary[q], 0));
        const len = Math.hypot(...n);
        if (len < 1e-8) continue;
        bestD2 = d2;
        best = { point: hit.point, normal: n.map((v) => v / len), distance2: d2 };
      }
      return;
    }
    const dl = node.left ? boxDistance2(p, node.left) : Infinity;
    const dr = node.right ? boxDistance2(p, node.right) : Infinity;
    if (dl < dr) { visit(node.left); visit(node.right); } else { visit(node.right); visit(node.left); }
  };
  visit(root);
  return best;
}

/**
 * Move only the garment's private position buffer outward where it intersects
 * or violates clearance against source triangles. Source geometry, textures,
 * UVs and NIF bytes are not modified. This is a conservative first-order pass:
 * it does not remesh the garment or infer designer intent.
 */
export function fitGarmentClearance(garment, sources, ctx, {
  clearance = 0.35, maxDistance = 3.0, maxPush = 2.5, conform = false,
} = {}) {
  if (!garment?.positions?.length || !sources?.length) return garment;
  const surfaces = [];
  for (const batch of sources) {
    if (!batch?.positions?.length || !batch?.indices?.length) continue;
    const posed = new Float32Array(batch.positions.length);
    ctx.skinBatch(batch, ctx.skeleton, ctx.pose, ctx.mats, posed, null);
    const normals = new Float32Array(posed.length);
    const I = batch.indices;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const ids = [I[t], I[t + 1], I[t + 2]];
      const ia = ids[0] * 3, ib = ids[1] * 3, ic = ids[2] * 3;
      if (ic + 2 >= posed.length || ib + 2 >= posed.length || ia + 2 >= posed.length) continue;
      const ax = posed[ib] - posed[ia], ay = posed[ib + 1] - posed[ia + 1], az = posed[ib + 2] - posed[ia + 2];
      const bx = posed[ic] - posed[ia], by = posed[ic + 1] - posed[ia + 1], bz = posed[ic + 2] - posed[ia + 2];
      const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
      const len = Math.hypot(...n);
      if (len < 1e-10) continue;
      for (const id of ids) for (let k = 0; k < 3; k++) normals[id * 3 + k] += n[k] / len;
    }
    // Orient normals consistently away from this surface's centroid as a
    // fallback for NIFs whose triangle winding differs. This is approximate
    // for concave surfaces; signed-distance classification remains a limitation.
    let center = [0, 0, 0], count = posed.length / 3;
    for (let i = 0; i < posed.length; i += 3) for (let k = 0; k < 3; k++) center[k] += posed[i + k] / Math.max(1, count);
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
      if (len > 1e-10) {
        for (let k = 0; k < 3; k++) normals[i + k] /= len;
        const dot = (posed[i] - center[0]) * normals[i] + (posed[i + 1] - center[1]) * normals[i + 1] + (posed[i + 2] - center[2]) * normals[i + 2];
        if (dot < 0) for (let k = 0; k < 3; k++) normals[i + k] *= -1;
      }
    }
    const bvh = buildSurfaceBvh(posed, I, normals);
    if (bvh) surfaces.push({ bvh, normals });
  }
  if (!surfaces.length) return garment;
  const positions = Float32Array.from(garment.positions);
  let adjusted = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const p = [positions[i], positions[i + 1], positions[i + 2]];
    let best = null;
    for (const surface of surfaces) {
      const hit = nearestSurfacePoint(p, surface.bvh, surface.normals, maxDistance * maxDistance);
      if (hit && (!best || hit.distance2 < best.distance2)) best = hit;
    }
    if (!best) continue;
    const signed = (p[0] - best.point[0]) * best.normal[0]
      + (p[1] - best.point[1]) * best.normal[1]
      + (p[2] - best.point[2]) * best.normal[2];
    if (conform) {
      // Pants are often authored with a much larger volume than the current
      // body. Project their vertices onto the nearest body surface plus a
      // small fabric clearance instead of only pushing intersections outward.
      const target = [0, 1, 2].map((k) => best.point[k] + best.normal[k] * clearance);
      if (Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]) > 1e-4) {
        positions[i] = target[0]; positions[i + 1] = target[1]; positions[i + 2] = target[2];
        adjusted++;
      }
      continue;
    }
    if (signed >= clearance) continue;
    const push = Math.min(maxPush, clearance - signed);
    positions[i] += best.normal[0] * push;
    positions[i + 1] += best.normal[1] * push;
    positions[i + 2] += best.normal[2] * push;
    adjusted++;
  }
  return adjusted ? { ...garment, positions, clearanceFit: { adjusted, clearance, solver: 'triangle-bvh' } } : garment;
}
