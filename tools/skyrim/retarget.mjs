// SKYRIM ARMOUR ONTO THE MORROWIND BODY: the pure half of the port (MW-IRON1).
//
// A Skyrim body armour is a skinned mesh bound to Skyrim's skeleton, on Skyrim's body, arms down at about 25 degrees;
// the port's armour is bound to Morrowind's, on Better Bodies, arms out level. Bone frames do not carry across - the two
// skeletons' bones point along different local axes (a Skyrim thigh runs down its Z, a Morrowind one down its X) - so
// nothing here reads a bone's axes. Each vertex is carried by the REGION its bones belong to, and blended by its own
// Skyrim weights:
//
//   - the trunk and the legs (pelvis, spine, neck, the skirt's bones, the thighs) by SLICES: height maps through the two
//     bodies' landmarks (knee, pelvis, the bust's apex, the neck), and in each slice the width scales by the two bodies'
//     half widths there and the depth maps the two bodies' back-to-front span onto each other - so a waist lands on a
//     waist and a bust on a bust;
//   - the shoulders and arms (clavicle, upper arm and its twist, the pauldron's bone) by SEGMENTS: each bone a segment
//     from its origin to its child's, its frame the segment and the world's forward, the length scaled to the
//     Morrowind bone's - which lifts the arm from Skyrim's slope to Morrowind's level.
//
// Then FIT pushes every vertex that ended under the Morrowind skin back out over it, by a margin, the push smoothed
// over the mesh so a plate moves as a plate.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => mul(a, 1 / (Math.hypot(...a) || 1));
const lerp = (a, b, t) => a + (b - a) * t;

/** Skyrim's bone names to their region and, for the arm's, the segment (bone, child) it rides and the Morrowind one. */
export function boneRegion(name) {
  const side = / L /.test(name) || /^NPC L/.test(name) ? 'L' : / R /.test(name) || /^NPC R/.test(name) ? 'R' : null;
  if (/Clavicle|Pauldron/.test(name) && side) return { region: 'arm', sky: [`NPC ${side} Clavicle [${side}Clv]`, `NPC ${side} UpperArm [${side}Uar]`], mw: [`Bip01 ${side} Clavicle`, `Bip01 ${side} UpperArm`] };
  if (/UpperArm|Upperarm/.test(name) && side) return { region: 'arm', sky: [`NPC ${side} UpperArm [${side}Uar]`, `NPC ${side} Forearm [${side}Lar]`], mw: [`Bip01 ${side} UpperArm`, `Bip01 ${side} Forearm`] };
  if (/Forearm/.test(name) && side) return { region: 'arm', sky: [`NPC ${side} Forearm [${side}Lar]`, `NPC ${side} Hand [${side}Hnd]`], mw: [`Bip01 ${side} Forearm`, `Bip01 ${side} Hand`] };
  return { region: 'trunk' };
}

/** Skyrim's bone to the Morrowind bone its weight goes to in the baked skin. */
export function mwBoneOf(name) {
  const side = /^NPC L/.test(name) ? 'L' : /^NPC R/.test(name) ? 'R' : null;
  if (/Pelvis|Skirt/.test(name)) return 'Bip01 Pelvis';
  if (/Spine2/.test(name)) return 'Bip01 Spine2';
  if (/Spine1/.test(name)) return 'Bip01 Spine1';
  if (/Spine/.test(name)) return 'Bip01 Spine';
  if (/Neck/.test(name)) return 'Bip01 Neck';
  if (side && /Clavicle|Pauldron/.test(name)) return `Bip01 ${side} Clavicle`;
  if (side && /Upperarm|UpperArm/.test(name)) return `Bip01 ${side} UpperArm`;
  if (side && /Forearm/.test(name)) return `Bip01 ${side} Forearm`;
  if (side && /Thigh/.test(name)) return `Bip01 ${side} Thigh`;
  if (side && /Calf/.test(name)) return `Bip01 ${side} Calf`;
  if (side && /Foot/.test(name)) return `Bip01 ${side} Foot`;
  throw new Error(`no Morrowind bone for "${name}"`);
}

/** A body's slice profile over height: per 1-unit step, the half width, the back and the front of the vertices within
 *  `reach` of it, smoothed. `points` the trunk-and-leg vertices. The reach is wide on purpose: the bodies are low-poly,
 *  and a thin slice that catches two vertices off the widest line reads a waist where there is none - which scaled a
 *  flaring belt into a blade. */
export function profile(points, z0, z1, reach = 3) {
  const bins = [];
  for (let z = Math.floor(z0); z <= Math.ceil(z1); z++) bins.push({ z, w: 0, back: Infinity, front: -Infinity });
  for (const p of points) {
    for (const b of bins) {
      if (Math.abs(b.z - p[2]) > reach) continue;
      b.w = Math.max(b.w, Math.abs(p[0])); b.back = Math.min(b.back, p[1]); b.front = Math.max(b.front, p[1]);
    }
  }
  const ok = bins.filter((b) => b.w > 0);
  const at = (z) => {   // linear between the nearest filled bins, held at the ends
    if (z <= ok[0].z) return ok[0];
    if (z >= ok.at(-1).z) return ok.at(-1);
    let i = ok.findIndex((b) => b.z >= z);
    const a = ok[i - 1], b = ok[i], t = (z - a.z) / (b.z - a.z);
    return { w: lerp(a.w, b.w, t), back: lerp(a.back, b.back, t), front: lerp(a.front, b.front, t) };
  };
  const smooth = (z) => { const s = [-1.5, 0, 1.5].map((d) => at(z + d)); return { w: s.reduce((a, b) => a + b.w, 0) / 3, back: s.reduce((a, b) => a + b.back, 0) / 3, front: s.reduce((a, b) => a + b.front, 0) / 3 }; };
  return smooth;
}

/** Piecewise-linear through matched landmarks [[from, to], ...] (sorted by from), extrapolated at the ends. */
export function landmarkMap(pairs) {
  return (z) => {
    let i = pairs.findIndex(([f]) => f >= z);
    if (i <= 0) i = i === 0 ? 1 : pairs.length - 1;
    const [f0, t0] = pairs[i - 1], [f1, t1] = pairs[i];
    return t0 + (z - f0) * (t1 - t0) / (f1 - f0);
  };
}

/** The trunk's carry: a Skyrim point to the Morrowind body's, by slices. */
export function trunkCarry({ skyProfile, mwProfile, height }) {
  return (p) => {
    const z = height(p[2]), s = skyProfile(p[2]), m = mwProfile(z);
    const kx = Math.min(1.3, Math.max(0.7, m.w / s.w));
    const ky = Math.min(1.4, Math.max(0.6, (m.front - m.back) / (s.front - s.back)));
    return [p[0] * kx, m.back + (p[1] - s.back) * ky, z];
  };
}

/** A body's surface as seen from its own axis: `outward(z, dir)` the distance from the axis point at height z (x 0, y
 *  the slice's mid) to the body's OUTERMOST surface along the level direction `dir`, or null where the ray meets none
 *  (between the legs). Triangles are bucketed by height. */
export function surfaceOf(triangles, prof) {
  const B = 2, buckets = new Map();
  triangles.forEach((t, i) => {
    const z0 = Math.floor(Math.min(t[0][2], t[1][2], t[2][2]) / B), z1 = Math.floor(Math.max(t[0][2], t[1][2], t[2][2]) / B);
    for (let z = z0; z <= z1; z++) { if (!buckets.has(z)) buckets.set(z, []); buckets.get(z).push(i); }
  });
  const axis = (z) => { const s = prof(z); return [0, (s.front + s.back) / 2, z]; };
  const outward = (z, dir) => {
    const o = axis(z);
    let far = null;
    for (const i of buckets.get(Math.floor(z / B)) ?? []) {
      const [a, b, c] = triangles[i], e1 = sub(b, a), e2 = sub(c, a), h = cross(dir, e2), det = dot(e1, h);
      if (Math.abs(det) < 1e-12) continue;
      const f = 1 / det, s = sub(o, a), u = f * dot(s, h);
      if (u < 0 || u > 1) continue;
      const q = cross(s, e1), v = f * dot(dir, q);
      if (v < 0 || u + v > 1) continue;
      const t = f * dot(e2, q);
      if (t > 0 && (far === null || t > far)) far = t;
    }
    return far;
  };
  return { axis, outward };
}

/** The trunk's carry by the SKIN (MW-IRON1, after the slices left a belt pushed into a roll): a point keeps its
 *  distance outside the body - measured on Skyrim's from the slice's axis along the point's own level direction, laid
 *  off the Morrowind body's surface the same way at the mapped height. A plate snug on Skyrim's waist is snug on Better
 *  Bodies'; one standing off a hip stands off it as far. Where either ray meets no body (between the legs), the slices'
 *  carry answers. */
export function skinCarry({ sky, mw, height, fallback }) {
  return (p) => {
    const z = height(p[2]), ao = sky.axis(p[2]), rel = [p[0] - ao[0], p[1] - ao[1], 0], r = Math.hypot(rel[0], rel[1]);
    if (r < 1e-6) return fallback(p);
    const dir = [rel[0] / r, rel[1] / r, 0];
    const rs = sky.outward(p[2], dir), rm = mw.outward(z, dir);
    if (rs === null || rm === null) return fallback(p);
    const m = mw.axis(z), out = rm + (r - rs);
    return [m[0] + dir[0] * out, m[1] + dir[1] * out, z];
  };
}

/** A bone segment's frame: origin, unit direction, its length, and two crosswise axes off `ref` - the world's forward,
 *  or (for a segment that runs forward itself, the foot) the world's side. */
function frame(o, e, ref = [0, 1, 0]) {
  const d = unit(sub(e, o)), fwd = ref;
  const f = unit(sub(fwd, mul(d, dot(fwd, d))));
  return { o, d, f, s: cross(d, f), len: Math.hypot(...sub(e, o)) };
}

/** The arm's carry for one segment pair: Skyrim's frame to Morrowind's, the length scaled, the cross-section by `k`
 *  (`null`: by the length's own ratio - a hand or a foot carried whole keeps its proportions). */
export function segmentCarry(skyFrom, skyTo, mwFrom, mwTo, k = 1, ref = [0, 1, 0], along = null) {
  const A = frame(skyFrom, skyTo, ref), B = frame(mwFrom, mwTo, ref);
  if (k === null) k = B.len / A.len;
  const lengthwise = along ?? B.len / A.len;   // a hand's own length, measured on the two bodies, over its bone's
  return (p) => {
    const r = sub(p, A.o);
    const a = dot(r, A.d) * lengthwise, b = dot(r, A.f) * k, c = dot(r, A.s) * k;
    return add(B.o, add(mul(B.d, a), add(mul(B.f, b), mul(B.s, c))));
  };
}

/** Every vertex carried: `verts` [{ pos, w, b }], `boneNames` the skin's, `carry(region)` the function for a region key.
 *  The blend is over the vertex's own weights, per region. */
export function carryVertices(verts, boneNames, carryFor) {
  return verts.map((v) => {
    let out = [0, 0, 0], total = 0;
    v.w.forEach((w, j) => {
      if (w <= 0) return;
      out = add(out, mul(carryFor(boneNames[v.b[j]])(v.pos), w));
      total += w;
    });
    return total ? mul(out, 1 / total) : v.pos;
  });
}

// ═══ FIT ════════════════════════════════════════════════════════════

/** The nearest point of a triangle to p (Ericson's closest-point test). */
function closestOnTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, mul(ab, d1 / (d1 - d3)));
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, mul(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, mul(sub(c, b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const den = 1 / (va + vb + vc);
  return add(a, add(mul(ab, vb * den), mul(ac, vc * den)));
}

/** The body as triangles with outward normals, bucketed on a 4-unit grid for the nearest-triangle search. */
export function bodyIndex(parts) {
  const tris = [];
  for (const part of parts) {
    const P = (i) => part.positions.slice(i * 3, i * 3 + 3);
    for (let t = 0; t < part.indices.length; t += 3) {
      const a = P(part.indices[t]), b = P(part.indices[t + 1]), c = P(part.indices[t + 2]);
      let n = unit(cross(sub(b, a), sub(c, a)));
      const vn = [0, 1, 2].reduce((acc, k) => add(acc, part.normals.slice(part.indices[t + k] * 3, part.indices[t + k] * 3 + 3)), [0, 0, 0]);
      if (dot(n, vn) < 0) n = mul(n, -1);   // the face's own winding may disagree with the skin's normals; the normals win
      tris.push({ a, b, c, n, part: part.name });
    }
  }
  const G = 4, grid = new Map();
  tris.forEach((t, i) => {
    const mn = [0, 1, 2].map((k) => Math.floor(Math.min(t.a[k], t.b[k], t.c[k]) / G)), mx = [0, 1, 2].map((k) => Math.floor(Math.max(t.a[k], t.b[k], t.c[k]) / G));
    for (let x = mn[0]; x <= mx[0]; x++) for (let y = mn[1]; y <= mx[1]; y++) for (let z = mn[2]; z <= mx[2]; z++) {
      const key = `${x},${y},${z}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i);
    }
  });
  const near = (p, r = 2) => {   // the nearest body point within r grid cells: { point, n, dist }
    const c = p.map((v) => Math.floor(v / G));
    let best = null;
    for (let x = c[0] - r; x <= c[0] + r; x++) for (let y = c[1] - r; y <= c[1] + r; y++) for (let z = c[2] - r; z <= c[2] + r; z++) {
      for (const i of grid.get(`${x},${y},${z}`) ?? []) {
        const t = tris[i], q = closestOnTriangle(p, t.a, t.b, t.c), d = Math.hypot(...sub(p, q));
        if (!best || d < best.dist) best = { point: q, n: t.n, dist: d, part: t.part };
      }
    }
    return best;
  };
  return { tris, near };
}

/** Vertex neighbours of a mesh, welded by position. */
function neighbours(positions, indices) {
  const n = positions.length, key = new Map(), weld = new Array(n);
  positions.forEach((p, i) => { const k = p.map((v) => v.toFixed(3)).join(); if (!key.has(k)) key.set(k, i); weld[i] = key.get(k); });
  const nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) nb[weld[indices[t + a]]].add(weld[indices[t + b]]);
  return { weld, nb };
}

/** Push every vertex out over the body by `margin` (a number, or by the body part it is over and where - `margin(part, point)`), the
 *  pushes smoothed over the mesh (`rounds`), repeated until none is left under. Answers the new positions and how many were moved and how far. */
export function fitOver(positions, indices, body, { margin = 0.35, rounds = 6, passes = 4 } = {}) {
  let P = positions.map((p) => p.slice());
  const { weld, nb } = neighbours(P, indices);
  let moved = 0, worst = 0;
  for (let pass = 0; pass < passes; pass++) {
    let push = P.map(() => [0, 0, 0]), under = 0;
    P.forEach((p, i) => {
      if (weld[i] !== i) return;
      const h = body.near(p);
      if (!h) return;
      const depth = dot(sub(p, h.point), h.n), m = typeof margin === 'function' ? margin(h.part, p) : margin;   // above the skin when positive
      if (depth < m && h.dist < 6) { push[i] = mul(h.n, m - depth); under++; worst = Math.max(worst, m - depth); }
    });
    if (!under) break;
    moved = Math.max(moved, under);
    for (let r = 0; r < rounds; r++) {   // spread each push to its neighbours, keeping the larger
      push = push.map((v, i) => {
        if (weld[i] !== i || !nb[i].size) return v;
        const avg = [...nb[i]].reduce((acc, j) => add(acc, push[j]), [0, 0, 0]);
        const m = mul(avg, 1 / nb[i].size);
        return Math.hypot(...m) > Math.hypot(...v) ? mul(add(m, v), 0.5) : v;
      });
    }
    P = P.map((p, i) => add(p, push[weld[i]]));
  }
  return { positions: P, moved, worst };
}

/** How many vertices of `positions` stand under the skin (deeper than `tolerance`), and which body parts they poke. */
export function underSkin(positions, body, tolerance = 0.05) {
  const parts = {};
  let n = 0;
  for (const p of positions) {
    const h = body.near(p);
    if (h && h.dist < 6 && dot(sub(p, h.point), h.n) < -tolerance) { n++; parts[h.part] = (parts[h.part] ?? 0) + 1; }
  }
  return { n, parts };
}
