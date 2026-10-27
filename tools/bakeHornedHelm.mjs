// THE HORNED STEEL HELM, made here and baked in one command.
//
//     node tools/bakeHornedHelm.mjs [--sheet]
//         make the mesh and its painting from the numbers below and write the shipped NIF and DDS
//
// MW-HORN1 (2026-10-27, the owner: "вместо стального сета дефолтного попытаться сделать адаптацию как стальной сет с
// рогами", "согласно текущему вайбу игры"). The Steel Helm switch's third style. The steel plate's two helms are Mac's
// exports (tools/bakeSteelPlate.mjs); this one has no export - it is BUILT, part by part, from the numbers in this file,
// so a change to it is a change here and a re-run. The shapes are the old northern helm's: a skull with a raised crest,
// a riveted brow band, an angular face plate with a nasal over painted eye slits, a neck guard in two stepped tiers, a
// leather lining hanging under the plates, and a horn out of each side in a riveted cup, sweeping out, back and down.
// Low-poly and painted coarse, for the pixel pass (render/charPixelLayer.js) and Daggerfall's own 320x200 look.
//
// It stands where the closed helm stands - the scene's frame (Z up, front +Y, right +X), fitted on the same head - and is
// skinned the closed helm's way (PLATE_RIG helm_closed: the head bone alone), filling the hair slot and hiding the head.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { mipChain, writeDds } from './meshTexture.mjs';
import { skinnedMeshesToNif } from './nifWrite.mjs';
import { writePng } from './pngIO.mjs';
import { previewSheet } from './meshSheets.mjs';
import { isMain } from './lib/isMain.mjs';
import { plateBind, pieceRig, RETAIL_SKELETON, meshFile, textureFile, textureName } from './bakeSteelPlate.mjs';

export const PIECE = 'helm_horned';
export const TEXTURE = 'helm_horned';
export const TEX_SIZE = 256;

// The skull the helm is built round (the closed helm's shell: x +-7.5, y -7.9..9.0, z 113.9..132.8).
const RX = 7.2, RY = 8.0, CY = 0.5, ZR = 121, H = 12;
const DEG = Math.PI / 180;

// The painting's regions, in image space (row 0 the top), each inset so the mips do not bleed across.
const R = (u0, v0, u1, v1) => { const g = 2 / TEX_SIZE; return { u0: u0 + g, v0: v0 + g, u1: u1 - g, v1: v1 - g }; };
const REGION = Object.freeze({
  dome: R(0, 0, 0.5, 0.25), band: R(0.5, 0, 1, 0.0625), crest: R(0.5, 0.0625, 1, 0.125), face: R(0.5, 0.125, 1, 0.375),
  neck1: R(0, 0.25, 0.5, 0.375), neck2: R(0, 0.375, 0.5, 0.5), nose: R(0.5, 0.375, 0.75, 0.5), collar: R(0.75, 0.375, 1, 0.5),
  horn: R(0, 0.5, 0.5, 1), leather: R(0.5, 0.5, 1, 1),
});

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (pts, x) => {   // piecewise-linear [[x, y], ...]
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  return pts[pts.length - 1][1];
};

/** A mesh built of grids: each a surface f(s, t) over [0,1]^2 with its own region of the painting. Every triangle is
 *  turned to face away from (sign 1) or toward (sign -1) its grid's `inside(s, t)` point, counter-clockwise outward as
 *  the plate's own meshes are; normals are averaged within a grid, so the parts meet at hard edges. */
export function buildHelm() {
  const positions = [], normals = [], uvs = [], indices = [];
  const grid = (nu, nv, f, region, inside, sign = 1) => {
    const base = positions.length / 3;
    const acc = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const s = i / nu, t = j / nv, p = f(s, t);
      positions.push(...p);
      uvs.push(lerp(region.u0, region.u1, s), 1 - lerp(region.v1, region.v0, t));   // the writer flips V (nifWrite keepV)
      acc.push([0, 0, 0]);
    }
    const at = (i, j) => j * (nu + 1) + i;
    const P = (k) => positions.slice((base + k) * 3, (base + k) * 3 + 3);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      for (const tri of [[at(i, j), at(i + 1, j), at(i + 1, j + 1)], [at(i, j), at(i + 1, j + 1), at(i, j + 1)]]) {
        let [a, b, c] = tri;
        const pa = P(a), pb = P(b), pc = P(c);
        const n = cross(sub(pb, pa), sub(pc, pa));
        if (Math.hypot(...n) < 1e-9) continue;
        const m = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
        const ref = inside((i + 0.5) / nu, (j + 0.5) / nv, m);
        if (dot(n, sub(m, ref)) * sign < 0) [b, c] = [c, b];
        const nn = cross(sub(P(b), P(a)), sub(P(c), P(a)));
        for (const k of [a, b, c]) for (let q = 0; q < 3; q++) acc[k][q] += nn[q];
        indices.push(base + a, base + b, base + c);
      }
    }
    for (const n of acc) normals.push(...norm(n));
  };
  const axis = (s, t, m) => [0, CY, m[2]];   // the skull's own axis, at the triangle's height

  // THE SKULL: azimuth round (0 the front), elevation up to the crown.
  grid(24, 8, (s, t) => {
    const th = s * 2 * Math.PI, e = t * Math.PI / 2;
    return [RX * Math.cos(e) * Math.sin(th), CY + RY * Math.cos(e) * Math.cos(th), ZR + H * Math.sin(e)];
  }, REGION.dome, () => [0, CY, ZR]);

  // THE CREST: a raised strip over the crown, front rim to back rim, its section a flat-topped ridge.
  const crestProfile = [[-0.8, -0.2], [-0.8, 0.65], [0.8, 0.65], [0.8, -0.2]];
  grid(3, 16, (s, t) => {
    const phi = lerp(0.12, Math.PI - 0.12, t);
    const y = CY + RY * Math.cos(phi), z = ZR + H * Math.sin(phi);
    const out = norm([0, (y - CY) / (RY * RY), (z - ZR) / (H * H)]);
    const k = Math.min(2, Math.floor(s * 3)), f = s * 3 - k;
    const x = lerp(crestProfile[k][0], crestProfile[k + 1][0], f), h = lerp(crestProfile[k][1], crestProfile[k + 1][1], f);
    return [x, y + out[1] * h, z + out[2] * h];
  }, REGION.crest, () => [0, CY, ZR]);

  // THE BROW BAND: a riveted ring round the skull's rim.
  grid(24, 1, (s, t) => {
    const th = s * 2 * Math.PI, g = lerp(0.35, 0.2, t);
    return [(RX + g) * Math.sin(th), CY + (RY + g) * Math.cos(th), lerp(119.4, 122.6, t)];
  }, REGION.band, axis);

  // THE FACE PLATE: the front and the cheeks, its lower edge a V to the chin, keeled down the middle.
  const faceBottom = (deg) => ramp([[0, 112.0], [20, 112.6], [45, 114.2], [70, 115.0], [95, 115.4]], Math.abs(deg));
  const facePoint = (s, t) => {
    const deg = lerp(-95, 95, s), th = deg * DEG, flare = 1 - t;
    const keel = 0.7 * flare * Math.max(0, 1 - Math.abs(th) / 0.6);
    const z = lerp(faceBottom(deg), 121.2, t);
    return [(RX + 0.55 + 0.35 * flare) * Math.sin(th), CY + (RY + 0.7 + 0.5 * flare) * Math.cos(th) + keel, z];
  };
  grid(20, 4, facePoint, REGION.face, axis);

  // THE NASAL: a bar down the face plate's middle, brow to below the eyes.
  grid(3, 6, (s, t) => {
    const k = Math.min(2, Math.floor(s * 3)), f = s * 3 - k;
    const prof = [[-0.65, 0], [-0.65, 0.7], [0.65, 0.7], [0.65, 0]];
    const x = lerp(prof[k][0], prof[k + 1][0], f), h = lerp(prof[k][1], prof[k + 1][1], f);
    const z = lerp(112.6, 123.0, t);
    const tf = Math.min(1, Math.max(0, (z - faceBottom(0)) / (121.2 - faceBottom(0))));
    const y = z > 121.2 ? CY + RY + 0.3 : facePoint(0.5, tf)[1];
    return [x, y + h, z];
  }, REGION.nose, (s, t, m) => [0, CY, m[2]]);

  // THE NECK GUARD: two tiers stepping out down the back, the lower narrower.
  grid(14, 2, (s, t) => {
    const th = lerp(95, 265, s) * DEG, g = 0.5 + 0.7 * (1 - t);
    return [(RX + g) * Math.sin(th), CY + (RY + g) * Math.cos(th), lerp(114.6, 121.2, t)];
  }, REGION.neck1, axis);
  grid(12, 2, (s, t) => {
    const th = lerp(118, 242, s) * DEG, g = 1.1 + 0.7 * (1 - t);
    return [(RX + g) * Math.sin(th), CY + (RY + g) * Math.cos(th), lerp(111.2, 115.4, t)];
  }, REGION.neck2, axis);

  // THE LINING: leather inside the plates, hanging a little below them, seen from within.
  grid(24, 1, (s, t) => {
    const th = s * 2 * Math.PI;
    return [(RX - 0.2) * Math.sin(th), CY + (RY - 0.2) * Math.cos(th), lerp(111.0, 121.0, t)];
  }, REGION.leather, axis, -1);

  // THE HORNS: a tapering tube along a curve - out of the side, up and back, then forward and down - in a riveted cup.
  const RIGHT_HORN = [[6.4, -0.6, 124.6], [9.4, -1.4, 126.6], [12.4, -1.0, 127.4], [14.8, 0.6, 126.2], [16.2, 3.2, 123.4], [16.0, 5.8, 120.6], [15.0, 7.4, 119.0]];
  for (const side of [1, -1]) {
    const pts = RIGHT_HORN.map(([x, y, z]) => [x * side, y, z]);
    const path = (t) => {   // Catmull-Rom through the points
      const f = t * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      return [0, 1, 2].map((k) => 0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u * u + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u * u * u));
    };
    const ring = (t, r, a) => {
      const c = path(t), T = norm(sub(path(Math.min(1, t + 0.01)), path(Math.max(0, t - 0.01))));
      const B = norm(cross(T, [0, 0, 1])), N2 = cross(B, T);
      return [c[0] + r * (Math.cos(a) * B[0] + Math.sin(a) * N2[0]), c[1] + r * (Math.cos(a) * B[1] + Math.sin(a) * N2[1]), c[2] + r * (Math.cos(a) * B[2] + Math.sin(a) * N2[2])];
    };
    const hornR = (t) => 1.75 * Math.pow(1 - t, 0.85) + 0.03;
    grid(8, 22, (s, t) => ring(t, hornR(t), s * 2 * Math.PI), REGION.horn, (s, t) => path(t));
    const CUP = 0.17;
    grid(8, 2, (s, t) => ring(t * CUP, 2.2, s * 2 * Math.PI), REGION.collar, (s, t) => path(t * CUP));
    grid(8, 1, (s, t) => ring(CUP, lerp(2.2, hornR(CUP), t), s * 2 * Math.PI), REGION.collar, () => path(0));
  }

  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], positions[i + k]); max[k] = Math.max(max[k], positions[i + k]); }
  const r6 = (a) => a.map((v) => +v.toFixed(6));
  return { positions: r6(positions), normals: r6(normals), uvs: r6(uvs), indices, bounds: { min: r6(min), max: r6(max) } };
}

// ═══ THE PAINTING ═══════════════════════════════════════════════════
// Coarse, as Daggerfall's own armour is: a few flat tones, dark seams, light rivet heads, hammered speckle.
const hash = (x, y, k = 0) => { let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const STEEL = [98, 104, 114], SEAM = [28, 30, 34], RIVET = [206, 208, 212], SLIT = [14, 10, 8];
const HORN = [222, 206, 160], HORN_DARK = [120, 96, 62], HORN_TIP = [42, 34, 26], LEATHER = [98, 62, 36];

export function paintHelm(size = TEX_SIZE) {
  const data = new Uint8Array(size * size * 4);
  const put = (x, y, c, k = 1) => { const o = (y * size + x) * 4; data[o] = Math.max(0, Math.min(255, c[0] * k)); data[o + 1] = Math.max(0, Math.min(255, c[1] * k)); data[o + 2] = Math.max(0, Math.min(255, c[2] * k)); data[o + 3] = 255; };
  const speckle = (x, y) => 0.9 + 0.2 * hash(x >> 1, y >> 1);   // two-texel grain: coarse on purpose
  const region = (r, paint) => {
    const x0 = Math.floor(r.u0 * size) - 2, x1 = Math.ceil(r.u1 * size) + 2, y0 = Math.floor(r.v0 * size) - 2, y1 = Math.ceil(r.v1 * size) + 2;
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) {
      const s = Math.min(1, Math.max(0, (x + 0.5 - r.u0 * size) / ((r.u1 - r.u0) * size)));
      const t = Math.min(1, Math.max(0, 1 - (y + 0.5 - r.v0 * size) / ((r.v1 - r.v0) * size)));   // t up, as the grids run
      put(x, y, ...paint(s, t, x, y));
    }
  };
  const rivetRow = (s, t, tRow, count, w, h) => {   // a light head above-left, its shadow below-right
    const ds = (s * count) % 1 - 0.5, dt = t - tRow;
    if (Math.abs(ds) * w < 1.2 && Math.abs(dt) * h < 1.2) return ds + dt < 0.02 ? RIVET : SEAM;
    return null;
  };
  const steel = (x, y, k = 1) => [STEEL, k * speckle(x, y)];
  region(REGION.dome, (s, t, x, y) => t < 0.05 ? [SEAM] : steel(x, y, 0.92 + 0.16 * t));
  region(REGION.band, (s, t, x, y) => {
    if (t < 0.15 || t > 0.85) return [SEAM];
    return rivetRow(s, t, 0.5, 16, 128, 16) ? [rivetRow(s, t, 0.5, 16, 128, 16)] : steel(x, y, 0.85);
  });
  region(REGION.crest, (s, t, x, y) => (Math.abs(s - 1 / 3) < 0.04 || Math.abs(s - 2 / 3) < 0.04 ? [SEAM] : steel(x, y, s > 1 / 3 && s < 2 / 3 ? 1.12 : 0.9)));
  region(REGION.face, (s, t, x, y) => {
    const deg = Math.abs(lerp(-95, 95, s));
    if (t > 0.94 || t < 0.06 || s < 0.015 || s > 0.985) return [SEAM];
    const lo = 0.58 + 0.10 * Math.min(1, Math.max(0, (deg - 9) / 29)), hi = 0.80;   // the slit's lower edge climbs outward
    if (deg > 9 && deg < 40 && t > lo && t < hi) return [SLIT];
    if (deg > 7 && deg < 42 && t > lo - 0.05 && t < hi + 0.05) return [SEAM];
    const r = rivetRow(s, t, 0.88, 12, 128, 64);
    return r ? [r] : steel(x, y, 1);
  });
  for (const [k, row] of [['neck1', 0.72], ['neck2', 0.72]]) {
    region(REGION[k], (s, t, x, y) => {
      if (t < 0.1 || t > 0.94) return [SEAM];
      const r = rivetRow(s, t, row, 9, 128, 32);
      return r ? [r] : steel(x, y, 0.95);
    });
  }
  region(REGION.nose, (s, t, x, y) => (s < 0.3 || s > 0.7 ? [SEAM] : steel(x, y, 1.15)));
  region(REGION.collar, (s, t, x, y) => {
    if (t < 0.12 || t > 0.88) return [SEAM];
    const r = rivetRow(s, t, 0.5, 6, 64, 32);
    return r ? [r] : steel(x, y, 0.9);
  });
  region(REGION.horn, (s, t, x, y) => {
    if (t > 0.94) return [HORN_TIP, speckle(x, y)];
    const band = ((t * 16) % 1) < 0.28;   // the growth rings, dark
    const c = HORN.map((v, i) => lerp(v, HORN_DARK[i], Math.pow(t, 1.6) * 0.8));
    return [band ? c.map((v) => v * 0.72) : c, speckle(x, y)];
  });
  region(REGION.leather, (s, t, x, y) => (((t * 10) % 1) < 0.08 && hash(x >> 2, 9) > 0.4 ? [LEATHER, 0.6] : [LEATHER, speckle(x, y)]));
  return { width: size, height: size, data };
}

/** The bake: the helm built and painted, skinned to the head in retail's bind - the NIF and the DDS. Pure. */
export function bakeHornedHelm({ skeleton }) {
  const mesh = buildHelm();
  const bind = plateBind(skeleton);
  const r = pieceRig('helm_closed', [mesh], bind);   // the closed helm's rig: the head bone alone
  const nif = skinnedMeshesToNif([{ mesh, texture: textureName(TEXTURE), name: `${r.shape} 0`, weights: r.weights[0] }], { node: `Steel Plate ${PIECE}`, bones: r.bones });
  const png = paintHelm();
  return { mesh, nif, png, dds: writeDds(mipChain(png)) };
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

if (isMain(import.meta.url)) {
  const r = bakeHornedHelm({ skeleton: readFileSync(RETAIL_SKELETON) });
  save(meshFile(PIECE), r.nif);
  save(textureFile(TEXTURE), r.dds);
  console.log(`  ${PIECE} ${r.mesh.indices.length / 3} triangles -> ${meshFile(PIECE)}  ${r.nif.length} bytes; bounds ${JSON.stringify(r.mesh.bounds)}`);
  console.log(`  ${TEXTURE} ${TEX_SIZE}x${TEX_SIZE} -> ${textureFile(TEXTURE)}  ${r.dds.length} bytes`);
  if (process.argv.includes('--sheet')) {
    const c = [0, 1, 2].map((k) => (r.mesh.bounds.min[k] + r.mesh.bounds.max[k]) / 2);   // the sheet frames the origin
    const centred = { ...r.mesh, positions: r.mesh.positions.map((v, i) => (v - c[i % 3]) * 6) };   // and sizes a body, not a helm
    save('scratch/steel-plate-helm_horned.png', writePng(previewSheet(centred, 360, r.png)));
    save('scratch/steel-plate-helm_horned-texture.png', writePng(r.png));
  }
}
