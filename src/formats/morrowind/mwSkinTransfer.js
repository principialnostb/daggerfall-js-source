// Preserve the worn mesh's rest position while transferring the donor's weights. The actor's skeleton then
// places it in the pose.

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
      skeletonRoot: GRAPH_ROOT,
      rootBone: GRAPH_ROOT,
      transform: IDENT_TRANSFORM,
      shapeTransform: null,
      bones: [
        {
          ref: attachRef,
          name: '',
          invBind: { a, t },
          indices: Array.from({ length: n }, (_, i) => i),
          weights: new Array(n).fill(1),
        },
      ],
    },
  };
}

/**
 * THE LIFT that puts a garment on the wearer. Morrowind is Z-up; this answers how far along +Z the garment
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
export function influencesOf(skin, n) {
  const out = Array.from({ length: n }, () => []);
  skin.bones.forEach((b, bi) => {
    for (let k = 0; k < b.indices.length; k++) out[b.indices[k]]?.push([bi, b.weights[k]]);
  });
  return out;
}

export function invert33(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!(Math.abs(det) > 1e-12)) return null;
  const k = 1 / det;
  return [
    A * k,
    -(b * i - c * h) * k,
    (b * f - c * e) * k,
    B * k,
    (a * i - c * g) * k,
    -(a * f - c * d) * k,
    C * k,
    -(a * h - b * g) * k,
    (a * e - b * d) * k,
  ];
}

/**
 * Each listed source vertex's whole skinning affine in `pose`, MEASURED through skinBatch itself rather than
 * re-derived: four probe vertices per source vertex (the origin and the three unit axes) carrying that vertex's
 * influences, skinned once. The columns and the translation are read off the result, so the garment is solved with
 * exactly the arithmetic that will draw it. Answers Map(j -> { a: 3x3 row-major, t }).
 */
export function measureAffines(src, js, { skeleton, pose, mats, skinBatch }) {
  const infl = src.infl;
  const bones = src.batch.skin.bones.map((b) => ({
    ref: b.ref,
    name: b.name,
    invBind: b.invBind,
    indices: [],
    weights: [],
  }));
  const positions = new Float32Array(js.length * 12);
  js.forEach((j, q) => {
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], q * 12);
    for (const [bi, w] of infl[j])
      for (let c = 0; c < 4; c++) {
        bones[bi].indices.push(q * 4 + c);
        bones[bi].weights.push(w);
      }
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
    const x = G[v * 3],
      y = G[v * 3 + 1],
      z = G[v * 3 + 2];
    let best = -1;
    let bd = Infinity;
    for (let j = 0; j < n; j++) {
      const dx = p[j * 3] - x,
        dy = p[j * 3 + 1] - y,
        dz = p[j * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return { j: best, d: bd };
  };
  const cache = new Map();
  const nearest = (s, v) => {
    const k = s * gn + v;
    let r = cache.get(k);
    if (!r) {
      r = nearestIn(s, v);
      cache.set(k, r);
    }
    return r;
  };
  const overall = (v) => {
    let bs = 0;
    let bd = Infinity;
    for (let s = 0; s < src.length; s++) {
      const r = nearest(s, v);
      if (r.d < bd) {
        bd = r.d;
        bs = s;
      }
    }
    return bs;
  };

  const subs = src.map(() => ({ map: new Map(), verts: [], indices: [] }));
  const I = garment.indices;
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    const votes = tri.map(overall);
    const s = votes.find((x) => votes.filter((y) => y === x).length >= 2) ?? votes[0];
    const sub = subs[s];
    for (const v of tri) {
      let at = sub.map.get(v);
      if (at === undefined) {
        at = sub.verts.length;
        sub.map.set(v, at);
        sub.verts.push({ v, j: nearest(s, v).j });
      }
      sub.indices.push(at);
    }
  }

  const out = [];
  subs.forEach((sub, s) => {
    if (!sub.indices.length) return;
    const { batch, infl } = src[s];
    const js = [...new Set(sub.verts.map((x) => x.j))];
    const aff = measureAffines(src[s], js, ctx);
    const bones = batch.skin.bones.map((b) => ({
      ref: b.ref,
      name: b.name,
      invBind: b.invBind,
      indices: [],
      weights: [],
    }));
    const positions = new Float32Array(sub.verts.length * 3);
    const uvs = garment.uvs ? new Float32Array(sub.verts.length * 2) : null;
    // MW-SMOOTH: the garment's own normals, solved as its positions are - skinBatch turns a normal by the blended 3x3
    // and renormalises, so the inverse of that 3x3 gives back the authored normal in this pose
    const N = garment.normals && garment.normals.length === G.length ? garment.normals : null;
    const normals = N ? new Float32Array(sub.verts.length * 3) : null;
    sub.verts.forEach(({ v, j }, k) => {
      const m = aff.get(j);
      const inv = invert33(m.a);
      const gx = G[v * 3] - m.t[0],
        gy = G[v * 3 + 1] - m.t[1],
        gz = G[v * 3 + 2] - m.t[2];
      if (inv) {
        positions[k * 3] = inv[0] * gx + inv[1] * gy + inv[2] * gz;
        positions[k * 3 + 1] = inv[3] * gx + inv[4] * gy + inv[5] * gz;
        positions[k * 3 + 2] = inv[6] * gx + inv[7] * gy + inv[8] * gz;
      } else {
        positions.set([G[v * 3], G[v * 3 + 1], G[v * 3 + 2]], k * 3);
      }
      if (normals) {
        const nx = N[v * 3],
          ny = N[v * 3 + 1],
          nz = N[v * 3 + 2];
        const ox = inv ? inv[0] * nx + inv[1] * ny + inv[2] * nz : nx;
        const oy = inv ? inv[3] * nx + inv[4] * ny + inv[5] * nz : ny;
        const oz = inv ? inv[6] * nx + inv[7] * ny + inv[8] * nz : nz;
        const len = Math.hypot(ox, oy, oz) || 1;
        normals[k * 3] = ox / len;
        normals[k * 3 + 1] = oy / len;
        normals[k * 3 + 2] = oz / len;
      }
      for (const [bi, w] of infl[j]) {
        bones[bi].indices.push(k);
        bones[bi].weights.push(w);
      }
      if (uvs) {
        uvs[k * 2] = garment.uvs[v * 2];
        uvs[k * 2 + 1] = garment.uvs[v * 2 + 1];
      }
    });
    out.push({
      name: garment.name || '',
      skinned: true,
      skin: { ...batch.skin, bones: bones.filter((b) => b.indices.length) },
      positions,
      normals,
      uvs,
      colors: null,
      material: garment.material ?? null,
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
function setTriangleHit(hit, x, y, z, wa, wb, wc) {
  hit.x = x;
  hit.y = y;
  hit.z = z;
  hit.wa = wa;
  hit.wb = wb;
  hit.wc = wc;
}

function closestPointTriangle(p, a, b, c, hit) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const acx = c[0] - a[0];
  const acy = c[1] - a[1];
  const acz = c[2] - a[2];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const apz = p[2] - a[2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return setTriangleHit(hit, a[0], a[1], a[2], 1, 0, 0);
  const bpx = p[0] - b[0];
  const bpy = p[1] - b[1];
  const bpz = p[2] - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return setTriangleHit(hit, b[0], b[1], b[2], 0, 1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return setTriangleHit(hit, a[0] + v * abx, a[1] + v * aby, a[2] + v * abz, 1 - v, v, 0);
  }
  const cpx = p[0] - c[0];
  const cpy = p[1] - c[1];
  const cpz = p[2] - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return setTriangleHit(hit, c[0], c[1], c[2], 0, 0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return setTriangleHit(hit, a[0] + w * acx, a[1] + w * acy, a[2] + w * acz, 1 - w, 0, w);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return setTriangleHit(hit, b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2]), 0, 1 - w, w);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom,
    w = vc * denom;
  return setTriangleHit(hit, a[0] + abx * v + acx * w, a[1] + aby * v + acy * w, a[2] + abz * v + acz * w, 1 - v - w, v, w);
}
function boxDistance2(x, y, z, box) {
  const dx = Math.max(box.x0 - x, 0, x - box.x1);
  const dy = Math.max(box.y0 - y, 0, y - box.y1);
  const dz = Math.max(box.z0 - z, 0, z - box.z1);
  return dx * dx + dy * dy + dz * dz;
}

function sameTopology(layout, positions, indices) {
  if (!layout || layout.points.length * 3 !== positions.length || layout.indices.length !== indices.length) return false;
  for (let i = 0; i < indices.length; i++) if (layout.indices[i] !== indices[i]) return false;
  return true;
}

function makeSurfaceLayout(positions, indices) {
  const points = Array.from({ length: Math.floor(positions.length / 3) }, () => [0, 0, 0]);
  const triangles = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i], ib = indices[i + 1], ic = indices[i + 2];
    const a = points[ia], b = points[ib], c = points[ic];
    if (a && b && c) triangles.push({ a, b, c, ia: ia * 3, ib: ib * 3, ic: ic * 3,
      x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0, cx: 0, cy: 0, cz: 0 });
  }
  return { points, triangles, indices: Array.from(indices), spatial: null, tree: null, poseNumber: 0, travel: 0 };
}

function buildSurfaceTree(items) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const t of items) {
    x0 = Math.min(x0, t.x0);
    y0 = Math.min(y0, t.y0);
    z0 = Math.min(z0, t.z0);
    x1 = Math.max(x1, t.x1);
    y1 = Math.max(y1, t.y1);
    z1 = Math.max(z1, t.z1);
  }
  if (items.length <= 8) return { x0, y0, z0, x1, y1, z1, items };
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const axisOrder = dy > dx ? byY : byX;
  items.sort(dz > Math.max(dx, dy) ? byZ : axisOrder);
  const mid = items.length >> 1;
  return { x0, y0, z0, x1, y1, z1, left: buildSurfaceTree(items.slice(0, mid)), right: buildSurfaceTree(items.slice(mid)) };
}
const byX = (a, b) => a.cx - b.cx;
const byY = (a, b) => a.cy - b.cy;
const byZ = (a, b) => a.cz - b.cz;

function updateTriangleBounds(tri) {
  const { a, b, c } = tri;
  tri.x0 = Math.min(a[0], b[0], c[0]);
  tri.x1 = Math.max(a[0], b[0], c[0]);
  tri.y0 = Math.min(a[1], b[1], c[1]);
  tri.y1 = Math.max(a[1], b[1], c[1]);
  tri.z0 = Math.min(a[2], b[2], c[2]);
  tri.z1 = Math.max(a[2], b[2], c[2]);
}

function updateTriangleCenter(tri) {
  tri.cx = (tri.x0 + tri.x1) * 0.5;
  tri.cy = (tri.y0 + tri.y1) * 0.5;
  tri.cz = (tri.z0 + tri.z1) * 0.5;
}

function refitSurface(node) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  if (node.items) {
    for (const tri of node.items) {
      updateTriangleBounds(tri);
      x0 = Math.min(x0, tri.x0);
      x1 = Math.max(x1, tri.x1);
      y0 = Math.min(y0, tri.y0);
      y1 = Math.max(y1, tri.y1);
      z0 = Math.min(z0, tri.z0);
      z1 = Math.max(z1, tri.z1);
    }
  } else {
    const { left, right } = node;
    refitSurface(left);
    refitSurface(right);
    x0 = Math.min(left.x0, right.x0);
    y0 = Math.min(left.y0, right.y0);
    z0 = Math.min(left.z0, right.z0);
    x1 = Math.max(left.x1, right.x1);
    y1 = Math.max(left.y1, right.y1);
    z1 = Math.max(left.z1, right.z1);
  }
  node.x0 = x0;
  node.y0 = y0;
  node.z0 = z0;
  node.x1 = x1;
  node.y1 = y1;
  node.z1 = z1;
}

function poseSurface(layout, positions) {
  const x = positions[0], y = positions[1], z = positions[2];
  const sx = x - (layout.x ?? x), sy = y - (layout.y ?? y), sz = z - (layout.z ?? z);
  let motion2 = 0;
  for (let i = 0; i < layout.points.length; i++) {
    const p = layout.points[i];
    const dx = positions[i * 3] - p[0] - sx;
    const dy = positions[i * 3 + 1] - p[1] - sy;
    const dz = positions[i * 3 + 2] - p[2] - sz;
    motion2 = Math.max(motion2, dx * dx + dy * dy + dz * dz);
    p[0] = positions[i * 3];
    p[1] = positions[i * 3 + 1];
    p[2] = positions[i * 3 + 2];
  }
  layout.step = layout.poseNumber ? Math.sqrt(motion2) : 0;
  layout.poseNumber++;
  layout.travel += layout.step + 1e-9;
  layout.x = x;
  layout.y = y;
  layout.z = z;
  if (!layout.triangles.length) return null;
  if (layout.spatial) refitSurface(layout.spatial);
  else {
    for (const t of layout.triangles) {
      updateTriangleBounds(t);
      updateTriangleCenter(t);
    }
    layout.spatial = buildSurfaceTree(layout.triangles.slice());
  }
  layout.tree = layout.poseNumber === 1 ? layout.spatial : null;
  return layout.spatial;
}

function clearancePush(best, signed) {
  const target = Math.max(best.clearance, Math.min(best.maxClearance, signed));
  return Math.max(-best.maxPush, Math.min(best.maxPush, target - signed));
}

// At hard seams the original tree order decides any tie that could change a
// Float32 position or whether a vertex counts as adjusted.
function sameClearance(p, best, hit, nx, ny, nz) {
  if (best.conform) return false;
  const q = best.point, n = best.normal;
  const a = clearancePush(best, (p[0] - q[0]) * n[0] + (p[1] - q[1]) * n[1] + (p[2] - q[2]) * n[2]);
  const b = clearancePush(best, (p[0] - hit.x) * nx + (p[1] - hit.y) * ny + (p[2] - hit.z) * nz);
  if (!a || !b) return !a && !b;
  return Object.is(Math.fround(p[0] + a * n[0]), Math.fround(p[0] + b * nx))
    && Object.is(Math.fround(p[1] + a * n[1]), Math.fround(p[1] + b * ny))
    && Object.is(Math.fround(p[2] + a * n[2]), Math.fround(p[2] + b * nz));
}

function considerTriangle(tri, normals, p, best, checkTies) {
  const hit = best.hit;
  closestPointTriangle(p, tri.a, tri.b, tri.c, hit);
  const dx = p[0] - hit.x, dy = p[1] - hit.y, dz = p[2] - hit.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const tied = d2 === best.distance2;
  if (d2 > best.distance2 || (tied && !(checkTies && best.localHit))) return;
  const a = hit.wa, b = hit.wb, c = hit.wc;
  const { ia, ib, ic } = tri;
  const nx = normals[ia] * a + normals[ib] * b + normals[ic] * c;
  const ny = normals[ia + 1] * a + normals[ib + 1] * b + normals[ic + 1] * c;
  const nz = normals[ia + 2] * a + normals[ib + 2] * b + normals[ic + 2] * c;
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-8) return;
  const ux = nx / len, uy = ny / len, uz = nz / len;
  if (tied) {
    const identical = best.point[0] === hit.x && best.point[1] === hit.y && best.point[2] === hit.z
      && best.normal[0] === ux && best.normal[1] === uy && best.normal[2] === uz;
    if (!identical && !best.ambiguous) best.ambiguous = !sameClearance(p, best, hit, ux, uy, uz);
    return;
  }
  best.localHit = true;
  best.found = true;
  best.ambiguous = false;
  best.point[0] = hit.x;
  best.point[1] = hit.y;
  best.point[2] = hit.z;
  best.normal[0] = ux;
  best.normal[1] = uy;
  best.normal[2] = uz;
  best.distance2 = d2;
}

function visitSurface(node, normals, p, best, distance2, ties = false) {
  if (ties ? distance2 > best.distance2 : distance2 >= best.distance2) return;
  const x = p[0], y = p[1], z = p[2];
  if (node.items) {
    for (const tri of node.items) {
      const bound = boxDistance2(x, y, z, tri);
      if (ties ? bound > best.distance2 : bound >= best.distance2) continue;
      considerTriangle(tri, normals, p, best, ties);
    }
    return;
  }
  const dl = boxDistance2(x, y, z, node.left), dr = boxDistance2(x, y, z, node.right);
  // The order, including equal distances, determines the normal at hard seams.
  if (dl < dr) {
    visitSurface(node.left, normals, p, best, dl, ties);
    if (dr <= best.distance2) visitSurface(node.right, normals, p, best, dr, ties);
  } else {
    visitSurface(node.right, normals, p, best, dr, ties);
    if (dl <= best.distance2) visitSurface(node.left, normals, p, best, dl, ties);
  }
}

/**
 * Move only the garment's private position buffer outward where it intersects
 * or violates clearance against source triangles. Source geometry, textures,
 * UVs and NIF bytes are not modified. This is a conservative first-order pass:
 * it does not remesh the garment or infer designer intent.
 */
export function fitGarmentClearance(
  garment,
  sources,
  ctx,
  { clearance = 0.35, maxDistance = 3.0, maxPush = 2.5, conform = false, side = null, ease = 0 } = {},
) {
  if (!garment?.positions?.length || !sources?.length) return garment;
  const surfaces = garmentFitSurfaces(sources, (batch, positions) => {
    ctx.skinBatch(batch, ctx.skeleton, ctx.pose, ctx.mats, positions, null);
  });
  return fitGarmentToSurfaces(garment, surfaces, { clearance, maxDistance, maxPush, conform, side, ease });
}

export function equipmentBoneSide(name) {
  const bone = String(name ?? '').toLowerCase();
  return /\b(?:l|left)\b/.test(bone) ? 'left' : /\b(?:r|right)\b/.test(bone) ? 'right' : null;
}

/** Build one surface per body section for all panels in this pose.
 * With a history, callers consume these surfaces before posing the donor again. */
export function garmentFitSurfaces(sources, poseSource, history = null) {
  const surfaces = [];
  for (const batch of sources) {
    if (!batch?.positions?.length || !batch?.indices?.length) continue;
    // Keep groin surfaces shared, but never let a left/right leg panel snap
    // to the other thigh or calf. The caller tags each source with the BODY
    // slot and bone used to bind it; untagged legacy callers keep old behavior.
    const side = batch.fitSlot && batch.fitSlot !== 'groin' ? equipmentBoneSide(batch.fitBone) : null;
    const posed = new Float32Array(batch.positions.length);
    poseSource(batch, posed);
    const normals = new Float32Array(posed.length);
    const I = batch.indices;
    let regular = true;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const ia = I[t] * 3, ib = I[t + 1] * 3, ic = I[t + 2] * 3;
      if (ic + 2 >= posed.length || ib + 2 >= posed.length || ia + 2 >= posed.length) continue;
      const ax = posed[ib] - posed[ia],
        ay = posed[ib + 1] - posed[ia + 1],
        az = posed[ib + 2] - posed[ia + 2];
      const bx = posed[ic] - posed[ia],
        by = posed[ic + 1] - posed[ia + 1],
        bz = posed[ic + 2] - posed[ia + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-10 || !Number.isFinite(len)) {
        regular = false;
        if (len < 1e-10) continue;
      }
      const x = nx / len, y = ny / len, z = nz / len;
      normals[ia] += x;
      normals[ia + 1] += y;
      normals[ia + 2] += z;
      normals[ib] += x;
      normals[ib + 1] += y;
      normals[ib + 2] += z;
      normals[ic] += x;
      normals[ic + 1] += y;
      normals[ic + 2] += z;
    }
    // Orient normals consistently away from this surface's centroid as a
    // fallback for NIFs whose triangle winding differs. This is approximate
    // for concave surfaces; signed-distance classification remains a limitation.
    let center = [0, 0, 0],
      count = posed.length / 3;
    for (let i = 0; i < posed.length; i += 3)
      for (let k = 0; k < 3; k++) center[k] += posed[i + k] / Math.max(1, count);
    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
      if (len > 1e-10) {
        for (let k = 0; k < 3; k++) normals[i + k] /= len;
        const dot =
          (posed[i] - center[0]) * normals[i] +
          (posed[i + 1] - center[1]) * normals[i + 1] +
          (posed[i + 2] - center[2]) * normals[i + 2];
        if (dot < 0) for (let k = 0; k < 3; k++) normals[i + k] *= -1;
      }
    }
    let layout = history?.get(batch);
    if (!sameTopology(layout, posed, I)) {
      layout = makeSurfaceLayout(posed, I);
      if (history) history.set(batch, layout);
    }
    const bvh = poseSurface(layout, posed);
    if (bvh) {
      const surface = { bvh, normals, side, layout };
      if (history && regular) surfaces.push(surface);
      else surfaces.push({ bvh: orderedRoot(surface), normals, side });
    }
  }
  return surfaces;
}

function orderedRoot(surface) {
  const layout = surface.layout;
  if (!layout.tree) {
    for (const tri of layout.triangles) updateTriangleCenter(tri);
    layout.tree = buildSurfaceTree(layout.triangles.slice());
  }
  return layout.tree;
}

function collectNear(node, p, radius2, list) {
  if (boxDistance2(p[0], p[1], p[2], node) > radius2) return;
  if (node.items) {
    for (const tri of node.items) {
      if (boxDistance2(p[0], p[1], p[2], tri) > radius2) continue;
      list.push(tri);
    }
  } else {
    collectNear(node.left, p, radius2, list);
    collectNear(node.right, p, radius2, list);
  }
}

// A triangle outside the saved radius cannot approach faster than its fastest
// vertex. Subtract shared translation, garment movement, and all intervening
// donor motion. Only a hit strictly inside the resulting radius is certified.
const neighborhoods = new WeakMap();
const neighborhoodPadding = 0.85; // donor-space units outside the last nearest distance
const slowPoseStep = neighborhoodPadding / 8; // above this, query the updated tree directly

function queryRefittedSurface(surface, p, best, bound, limit) {
  const { layout, bvh, normals } = surface;
  best.localHit = false;
  best.ambiguous = false;
  visitSurface(layout.tree ?? bvh, normals, p, best, bound, !layout.tree);
  if (best.ambiguous) {
    best.distance2 = limit;
    visitSurface(orderedRoot(surface), normals, p, best, bound);
  }
}

function queryNeighborhood(surface, p, best, entries, vertex) {
  const { layout, normals, bvh } = surface;
  const limit = best.distance2, bound = boxDistance2(p[0], p[1], p[2], bvh);
  if (bound >= limit) return;
  const x = p[0] - layout.x, y = p[1] - layout.y, z = p[2] - layout.z;
  let entry = entries[vertex];
  if (entry) {
    const dx = x - entry.x, dy = y - entry.y, dz = z - entry.z;
    const safe = entry.radius - Math.sqrt(dx * dx + dy * dy + dz * dz) - (layout.travel - entry.travel) - 1e-6;
    if (safe > 0) {
      best.localHit = false;
      best.ambiguous = false;
      for (const tri of entry.list) {
        if (boxDistance2(p[0], p[1], p[2], tri) > best.distance2) continue;
        considerTriangle(tri, normals, p, best, true);
      }
      if (best.distance2 < safe * safe) {
        if (best.ambiguous) {
          best.distance2 = limit;
          visitSurface(orderedRoot(surface), normals, p, best, bound);
        }
        return;
      }
      if (best.localHit) {
        best.distance2 = limit;
        // The full search revisits the closer local hit.
      }
    }
  }
  queryRefittedSurface(surface, p, best, bound, limit);
  // Spread list construction across poses and avoid it during abrupt motion.
  if ((vertex + layout.poseNumber) % 4 !== 0) return;
  if (!entry) entries[vertex] = entry = { list: [] };
  entry.x = x;
  entry.y = y;
  entry.z = z;
  entry.travel = layout.travel;
  entry.radius = Math.sqrt(best.distance2) + neighborhoodPadding;
  entry.list.length = 0;
  collectNear(bvh, p, entry.radius * entry.radius, entry.list);
}

export function fitGarmentToSurfaces(garment, surfaces,
  { clearance = 0.35, maxDistance = 3.0, maxPush = 2.5, conform = false, side = null, ease = 0, maxClearance = Infinity } = {},
) {
  if (!surfaces.length) return garment;
  const wantedSide = side === 'left' || side === 'right' ? side : null;
  const positions = Float32Array.from(garment.positions);
  const best = { point: [0, 0, 0], normal: [0, 0, 0], distance2: 0, found: false, clearance, maxClearance, maxPush, conform,
    hit: { x: 0, y: 0, z: 0, wa: 0, wb: 0, wc: 0 } };
  let perGarment = neighborhoods.get(garment);
  if (!perGarment) neighborhoods.set(garment, perGarment = new WeakMap());
  const allowed = [];
  for (const surface of surfaces) {
    if (wantedSide && surface.side && surface.side !== wantedSide) continue;
    let entries = null;
    if (surface.layout && surface.layout.step < slowPoseStep) {
      entries = perGarment.get(surface.layout);
      if (!entries) perGarment.set(surface.layout, entries = []);
    }
    allowed.push({ surface, entries });
  }
  let adjusted = 0;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const p = [positions[i], positions[i + 1], positions[i + 2]];
    best.found = false;
    best.distance2 = maxDistance * maxDistance;
    for (const { surface, entries } of allowed) {
      if (entries) queryNeighborhood(surface, p, best, entries, i / 3);
      else {
        const bound = boxDistance2(p[0], p[1], p[2], surface.bvh);
        if (bound >= best.distance2) continue;
        if (surface.layout) queryRefittedSurface(surface, p, best, bound, best.distance2);
        else visitSurface(surface.bvh, surface.normals, p, best, bound);
      }
    }
    if (!best.found) continue;
    const signed =
      (p[0] - best.point[0]) * best.normal[0] +
      (p[1] - best.point[1]) * best.normal[1] +
      (p[2] - best.point[2]) * best.normal[2];
    if (conform) {
      // Pants are often authored with a much larger volume than the current
      // body. Project their vertices onto the nearest body surface plus a
      // small fabric clearance instead of only pushing intersections outward.
      const target = [0, 1, 2].map((k) => p[k] * ease + (best.point[k] + best.normal[k] * clearance) * (1 - ease));
      if (Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]) > 1e-4) {
        positions[i] = target[0];
        positions[i + 1] = target[1];
        positions[i + 2] = target[2];
        adjusted++;
      }
      continue;
    }
    const push = clearancePush(best, signed);
    if (!push) continue;
    positions[i] += best.normal[0] * push;
    positions[i + 1] += best.normal[1] * push;
    positions[i + 2] += best.normal[2] * push;
    adjusted++;
  }
  return adjusted ? { ...garment, positions, clearanceFit: { adjusted, clearance, solver: 'triangle-bvh' } } : garment;
}
