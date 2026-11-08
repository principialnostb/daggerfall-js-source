// LOOK-THUMBS-MW (BLOODBATH, 2026-11-08; the owner, of the 3D tab's Morrowind cards: "на старых первых вариантах хорошие
// красивые иконки по масштабированию и визуалу, а тут ... новые"): A LOOK'S PICTURE DRAWN THE WAY THE OWN LOOKS' ARE -
// tools/lookThumbs.mjs drawLook's law (turned three-quarters, tipped toward the viewer, lit from above in front, framed
// tight, supersampled and box-filtered down) - but at runtime and over the player's own Morrowind meshes, which no
// file in the repository may carry. Pure: shapes in (formats/morrowind/mwNifMesh.js flattenNif's batches), RGBA out.
//
// A piece is drawn as COPIES of its shapes, each turned by its own 3x3 matrix and moved by its own offset - a cuirass's
// ground mesh stood up off its back, a boot mirrored into its pair, two gauntlets side by side.

const YAW = -32 * Math.PI / 180, PITCH = 12 * Math.PI / 180;
const LIGHT = (() => { const l = [0.35, 0.55, 0.75], n = Math.hypot(...l); return l.map((v) => v / n); })();

/** A turn about X by `a` radians (NIF Z-up: a positive turn tips +Y toward +Z). */
export const rotX = (a) => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
/** A turn about Y by `a` radians. */
export const rotY = (a) => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
/** A turn about Z by `a` radians. */
export const rotZ = (a) => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
/** Mirror across X (a left from a right). */
export const MIRROR_X = Object.freeze([-1, 0, 0, 0, 1, 0, 0, 0, 1]);
export const IDENTITY3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
/** a * b, 3x3 row-major. */
export function mul3(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
const apply = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/** The axis-aligned box of shapes under a matrix. */
export function boundsOf(shapes, m = IDENTITY3) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) for (let i = 0; i < s.positions.length; i += 3) {
    const p = apply(m, s.positions[i], s.positions[i + 1], s.positions[i + 2]);
    for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; }
  }
  return { min: mn, max: mx };
}

/** A pair drawn side by side: the left half moved beside the right with a small gap, when they stand far apart. */
/** The box of copies as placed. */
function placedBox(list) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const c of list) {
    const b = boundsOf(c.shapes, c.matrix ?? IDENTITY3), o = c.offset ?? [0, 0, 0];
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.min[k] + o[k]); mx[k] = Math.max(mx[k], b.max[k] + o[k]); }
  }
  return { mn, mx };
}
/** A side held out level (a hand at the bind's outstretched arm) turned down about its own middle, its far end - the
 *  fingers - to the ground, so a pair stands as two hands and not as one long bar. */
function hangDown(copies) {
  let out = copies;
  for (const side of ['left', 'right']) {
    const group = out.filter((c) => c.side === side);
    if (!group.length) continue;
    const { mn, mx } = placedBox(group);
    if (!((mx[0] - mn[0]) > 1.5 * (mx[2] - mn[2]))) continue;
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const R = rotY(c[0] >= 0 ? Math.PI / 2 : -Math.PI / 2);   // +X out on the right goes down, -X out on the left too
    out = out.map((k) => {
      if (k.side !== side) return k;
      const o = k.offset ?? [0, 0, 0];
      const d = apply(R, o[0] - c[0], o[1] - c[1], o[2] - c[2]);
      return { ...k, matrix: mul3(R, k.matrix ?? IDENTITY3), offset: [d[0] + c[0], d[1] + c[1], d[2] + c[2]] };
    });
  }
  return out;
}
export function closePair(copies) {
  if (!copies.some((c) => c.side === 'left') || !copies.some((c) => c.side === 'right')) return copies;
  copies = hangDown(copies);
  const lefts = copies.filter((c) => c.side === 'left'), rights = copies.filter((c) => c.side === 'right');
  const box = (list) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const c of list) {
      const b = boundsOf(c.shapes, c.matrix ?? IDENTITY3), o = c.offset ?? [0, 0, 0];
      for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.min[k] + o[k]); mx[k] = Math.max(mx[k], b.max[k] + o[k]); }
    }
    return { mn, mx };
  };
  const L = box(lefts), R = box(rights);
  const width = Math.max(L.mx[0] - L.mn[0], R.mx[0] - R.mn[0]);
  const gap = L.mn[0] > R.mx[0] ? L.mn[0] - R.mx[0] : R.mn[0] - L.mx[0];
  if (gap <= width * 0.5) return copies;
  const want = width * 0.15;
  const dx = L.mn[0] > R.mx[0] ? -(gap - want) : gap - want;
  const dz = ((R.mn[2] + R.mx[2]) - (L.mn[2] + L.mx[2])) / 2;   // and level with it
  return copies.map((c) => (c.side === 'left' ? { ...c, offset: [(c.offset?.[0] ?? 0) + dx, c.offset?.[1] ?? 0, (c.offset?.[2] ?? 0) + dz] } : c));
}

/**
 * Draw copies of shapes into a square RGBA picture.
 * @param {Array<{ shapes: any[], matrix?: number[], offset?: number[] }>} copies
 * @param {(file: string) => ({ width: number, height: number, data: ArrayLike<number> } | null)} textureOf a shape's painting by its file
 * @param {{ size?: number, supersample?: number, yaw?: number, pitch?: number }} [options]
 * @returns {{ width: number, height: number, data: Uint8ClampedArray } | null}
 */
export function rasterLook(copies, textureOf, { size = 96, supersample = 3, yaw = YAW, pitch = PITCH } = {}) {
  const view = (p) => {   // turned round Z by yaw, then tipped by pitch: x right, y up, z toward the viewer
    const x1 = p[0] * Math.cos(yaw) - p[1] * Math.sin(yaw), y1 = p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw);
    return [x1, p[2] * Math.cos(pitch) - y1 * Math.sin(pitch), y1 * Math.cos(pitch) + p[2] * Math.sin(pitch)];
  };
  const placed = [];
  for (const c of copies) {
    const m = c.matrix ?? IDENTITY3, off = c.offset ?? [0, 0, 0];
    for (const s of c.shapes ?? []) {
      if (!s?.positions?.length || !s.indices?.length) continue;
      const n = s.positions.length / 3;
      const P = new Array(n), N = new Array(n);
      for (let i = 0; i < n; i++) {
        const q = apply(m, s.positions[i * 3], s.positions[i * 3 + 1], s.positions[i * 3 + 2]);
        P[i] = view([q[0] + off[0], q[1] + off[1], q[2] + off[2]]);
        N[i] = view(s.normals ? apply(m, s.normals[i * 3], s.normals[i * 3 + 1], s.normals[i * 3 + 2]) : [0, 0, 1]);
      }
      placed.push({ s, P, N });
    }
  }
  if (!placed.length) return null;
  let mn0 = Infinity, mn1 = Infinity, mx0 = -Infinity, mx1 = -Infinity;
  for (const { P } of placed) for (const p of P) { if (p[0] < mn0) mn0 = p[0]; if (p[0] > mx0) mx0 = p[0]; if (p[1] < mn1) mn1 = p[1]; if (p[1] > mx1) mx1 = p[1]; }
  if (!(mx0 > mn0) && !(mx1 > mn1)) return null;
  const S = size * supersample, span = Math.max(mx0 - mn0, mx1 - mn1) * 1.08, c0 = (mn0 + mx0) / 2, c1 = (mn1 + mx1) / 2;
  const toPx = (p) => [(p[0] - c0) / span * S + S / 2, S / 2 - (p[1] - c1) / span * S, p[2]];
  const rgba = new Float32Array(S * S * 4), depth = new Float32Array(S * S).fill(-Infinity);
  for (const { s, P: VP, N } of placed) {
    const tex = textureOf(s.material?.textureFile ?? '');
    const P = VP.map(toPx);
    for (let t = 0; t < s.indices.length; t += 3) {
      const a = s.indices[t], b = s.indices[t + 1], d = s.indices[t + 2];
      const pa = P[a], pb = P[b], pd = P[d];
      if (!pa || !pb || !pd) continue;
      const area = (pb[0] - pa[0]) * (pd[1] - pa[1]) - (pd[0] - pa[0]) * (pb[1] - pa[1]);
      if (Math.abs(area) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pd[0]))), x1 = Math.min(S - 1, Math.ceil(Math.max(pa[0], pb[0], pd[0])));
      const y0 = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pd[1]))), y1 = Math.min(S - 1, Math.ceil(Math.max(pa[1], pb[1], pd[1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w1 = ((pd[0] - pa[0]) * (py - pa[1]) - (px - pa[0]) * (pd[1] - pa[1])) / -area;
        const w2 = ((pb[0] - pa[0]) * (py - pa[1]) - (px - pa[0]) * (pb[1] - pa[1])) / area;
        const w0 = 1 - w1 - w2;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * pa[2] + w1 * pb[2] + w2 * pd[2], o = y * S + x;
        if (z <= depth[o]) continue;
        const nx = w0 * N[a][0] + w1 * N[b][0] + w2 * N[d][0], ny = w0 * N[a][1] + w1 * N[b][1] + w2 * N[d][1], nz = w0 * N[a][2] + w1 * N[b][2] + w2 * N[d][2];
        const nl = Math.hypot(nx, ny, nz) || 1;
        const lit = 0.45 + 0.75 * Math.abs((nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nl);
        let r = 150, g = 150, bl = 150;
        if (tex && s.uvs) {
          const u = w0 * s.uvs[a * 2] + w1 * s.uvs[b * 2] + w2 * s.uvs[d * 2], v = w0 * s.uvs[a * 2 + 1] + w1 * s.uvs[b * 2 + 1] + w2 * s.uvs[d * 2 + 1];
          const tx = ((Math.floor(u * tex.width) % tex.width) + tex.width) % tex.width, ty = ((Math.floor(v * tex.height) % tex.height) + tex.height) % tex.height;
          const q = (ty * tex.width + tx) * 4;
          if (s.material?.alphaTest && tex.data[q + 3] < (s.material.alphaThreshold || 128)) continue;
          r = tex.data[q]; g = tex.data[q + 1]; bl = tex.data[q + 2];
        }
        depth[o] = z;
        rgba[o * 4] = Math.min(255, r * lit); rgba[o * 4 + 1] = Math.min(255, g * lit); rgba[o * 4 + 2] = Math.min(255, bl * lit); rgba[o * 4 + 3] = 255;
      }
    }
  }
  const out = new Uint8ClampedArray(size * size * 4);   // the box filter down, colour weighted by coverage
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, w = 0;
    for (let j = 0; j < supersample; j++) for (let i = 0; i < supersample; i++) {
      const o = ((y * supersample + j) * S + x * supersample + i) * 4, a = rgba[o + 3] / 255;
      r += rgba[o] * a; g += rgba[o + 1] * a; b += rgba[o + 2] * a; w += a;
    }
    const q = (y * size + x) * 4;
    if (w) { out[q] = Math.round(r / w); out[q + 1] = Math.round(g / w); out[q + 2] = Math.round(b / w); }
    out[q + 3] = Math.round(w / (supersample * supersample) * 255);
  }
  return { width: size, height: size, data: out };
}
