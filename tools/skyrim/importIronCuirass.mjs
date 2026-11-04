// SKYRIM'S HEAVY IRON CUIRASS AS THE STEEL CUIRASS'S AND PAULDRONS' IRON LOOK, from the owner's own install.
//
//     node tools/skyrim/importIronCuirass.mjs [--preview]
//
// MW-IRON1 (2026-10-27, the owner: "цельный этот сет от этого железного шлема", "тяжелую конечно", and the split:
// "кираса и два наплечника отдельно, ремень кирасе"). Skyrim's female heavy iron cuirass (meshes\armor\iron\f\
// cuirassheavy_1.nif - the _1 body weight) is one armour for the whole body; the port's is Daggerfall's pieces, so it is
// cut along its own skin:
//   - PAULDRONS: the Pauldron shape's triangles held by the arm's bones (clavicle, upper arm, the pauldron's own bone),
//     left and right by side; the strap across the chest and the buckle on it are held by the spine - THE CUIRASS's;
//   - CUIRASS: the trunk held by the spine and the neck, and the shoulders' tops held by the clavicles;
//   - SKIRT: what the pelvis and the thighs hold - the belt, the plates, the satchel;
//   - FLAPS: what the skirt's own bones hold - the leather aprons front and back, made to hang over Skyrim's trousers;
//     over bare legs they read as rags at the crotch (the owner: "у промежности тряпок понавешано"), so they are kept
//     apart with the trousers and not worn;
//   - LEGS: what the calves hold - the trousers and their wraps, Skyrim's greaves (it has no greaves slot) - kept apart
//     for the greaves and not worn by the cuirass;
//   - the Skyrim body inside the armour is left out: the port has its own.
// Each is carried onto the Morrowind body (tools/skyrim/retarget.mjs) - Better Bodies' Dunmer woman at the vendored
// female skeleton's bind - pushed out over its skin, and skinned to the Morrowind bones its Skyrim bones stand for, in
// that bind. Like the helm (MW-HORN5), nothing of Bethesda's is committed: the outputs are ignored by git.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { listBsa, extract } from './bsa.mjs';
import { readSseNif } from './sseNif.mjs';
import { bodyAtBind, BETTER_BODY, FEMALE_SKELETON } from './mwBody.mjs';
import { boneRegion, mwBoneOf, profile, landmarkMap, trunkCarry, skinCarry, surfaceOf, segmentCarry, carryVertices, bodyIndex, fitOver, underSkin } from './retarget.mjs';
import { plateBind, PLATE_RIG, pieceRig } from '../bakeSteelPlate.mjs';
import { skinnedMeshesToNif } from '../nifWrite.mjs';
import { mipChain, writeDds } from '../meshTexture.mjs';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';
import { readPng, writePng } from '../pngIO.mjs';
import { isMain } from '../lib/isMain.mjs';

const SKYRIM = process.env.SKYRIM_PATH ?? 'D:/Steam/steamapps/common/Skyrim Special Edition';
const BS = String.fromCharCode(92);
export const OUT = 'scratch/skyrim/iron';
export const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
/** Skyrim's body weight the armour is taken at - its slider's ends, _0 thin and _1 full - and the body it was made on. */
export const WEIGHT = Number(process.env.SKYRIM_WEIGHT ?? 1);
export const CUIRASS = ['meshes', 'armor', 'iron', 'f', `cuirassheavy_${WEIGHT}.nif`].join(BS);
export const SKY_BODY = ['meshes', 'actors', 'character', 'character assets', `femalebody_${WEIGHT}.nif`].join(BS);
export const SKY_SKELETON = ['meshes', 'actors', 'character', 'character assets female', 'skeleton_female.nif'].join(BS);
export const PIECES = Object.freeze(['cuirass', 'skirt', 'pauldron_left', 'pauldron_right', 'legs', 'flaps']);
/** MW-IRON5: the knee's top on Better Bodies at the bind (its part reaches 50.6, under the thigh's from 50.0) - below
 *  it the armour stands 1.0 off the skin whatever part it is nearest. */
export const KNEE_TOP = 52;
const ARM_CROSS = 0.95;   // the arm's cross-section, Morrowind's to Skyrim's
export const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';

/** What ships of it - every file ignored by git (.gitignore, MW-IRON1): each worn piece's NIF and shape name (the part's
 *  rule-15 name, as the steel plate's PLATE_RIG has it), and the one painting they share. */
export const WORN = Object.freeze({
  cuirass: { nif: 'src/assets/mw/meshes/iron_cuirass.nif', shape: PLATE_RIG.cuirass.shape },
  skirt: { nif: 'src/assets/mw/meshes/iron_skirt.nif', shape: PLATE_RIG.skirt.shape },
  pauldron_left: { nif: 'src/assets/mw/meshes/iron_pauldron_left.nif', shape: PLATE_RIG.pauldron_left.shape },
  pauldron_right: { nif: 'src/assets/mw/meshes/iron_pauldron_right.nif', shape: PLATE_RIG.pauldron_right.shape },
  // MW-IRON3: the trousers below the skirt (the LEGS the cut set apart) as the greaves' iron look, a leg each
  greave_left: { nif: 'src/assets/mw/meshes/iron_greave_left.nif', shape: PLATE_RIG.greave_left.shape },
  greave_right: { nif: 'src/assets/mw/meshes/iron_greave_right.nif', shape: PLATE_RIG.greave_right.shape },
});
export const PAINTING = { dds: 'src/assets/mw/textures/iron_cuirass.dds', name: 'iron_cuirass.dds', size: 256 };

const archives = new Map();
export function fromBsa(names, path) {
  for (const a of names) {
    if (!archives.has(a)) archives.set(a, listBsa(join(SKYRIM, 'Data', a)));
    const bsa = archives.get(a), e = bsa.entries.find((x) => x.path === path.toLowerCase());
    if (e) return extract(bsa, e);
  }
  throw new Error(`${path} is in none of ${names.join(', ')}`);
}
export const MESHES = ['Skyrim - Meshes0.bsa', 'Skyrim - Meshes1.bsa'];
export const TEXTURES = Array.from({ length: 9 }, (_, i) => `Skyrim - Textures${i}.bsa`);

/** Skyrim's skeleton at bind: bone name -> world position (the node tree's transforms, row-major, v' = R v + t). */
export function skySkeleton(nif) {
  const world = new Map();
  const mm = (A, B) => [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]));
  const mv = (A, v) => [0, 1, 2].map((r) => A[r * 3] * v[0] + A[r * 3 + 1] * v[1] + A[r * 3 + 2] * v[2]);
  const walk = (i, R, t, s) => {
    const n = nif.nodes.get(i); if (!n) return;
    const wt = mv(R, n.trans).map((v, k) => t[k] + s * v), wR = mm(R, n.rot);
    world.set(n.name, wt);
    for (const c of n.children) walk(c, wR, wt, s * n.scale);
  };
  walk(0, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, 0], 1);
  return world;
}

const ARMISH = /UpperArm|Upperarm|Forearm|Hand|Finger/;
/** The trunk-and-leg points of a Skyrim body shape (its arms left out by their bones), in the world. */
function skyTrunkPoints(shape) {
  return shape.verts.filter((v) => {
    const j = v.w.indexOf(Math.max(...v.w));
    return !ARMISH.test(shape.skinning.bones[v.b[j]].name);
  }).map((v) => v.pos.map((c, k) => c + shape.T[k]));
}
const bustApex = (pts) => pts.filter((p) => p[2] > 85).reduce((a, p) => (p[1] > a[1] ? p : a))[2];

/** Which piece a triangle of `shape` belongs to, by the bones its corners hang on. */
export function pieceOf(shape, tri) {
  const sum = { arm: 0, calf: 0, trunk: 0, lower: 0, flap: 0 };
  for (const i of tri) {
    const v = shape.verts[i];
    v.w.forEach((w, j) => {
      const n = shape.skinning.bones[v.b[j]].name;
      const k = /Calf|Foot/.test(n) ? 'calf' : /Clavicle|UpperArm|Upperarm|Pauldron/.test(n) ? 'arm' : /Skirt/.test(n) ? 'flap' : /Pelvis|Thigh/.test(n) ? 'lower' : 'trunk';
      sum[k] += w;
    });
  }
  const top = Object.entries(sum).sort((a, b) => b[1] - a[1])[0][0];
  if (/satchel/i.test(shape.name)) return 'skirt';
  if (/Pauldron/.test(shape.name)) {
    if (top !== 'arm') return 'cuirass';   // the strap and its buckle
    const x = tri.reduce((a, i) => a + shape.verts[i].pos[0], 0);
    return x < 0 ? 'pauldron_left' : 'pauldron_right';
  }
  return top === 'calf' ? 'legs' : top === 'flap' ? 'flaps' : top === 'lower' ? 'skirt' : 'cuirass';
}

/** The trunk-and-leg triangles of a Skyrim body shape (its arms' left out by their bones), in the world. */
function skyTrunkTriangles(shape) {
  const armish = (i) => { const v = shape.verts[i], j = v.w.indexOf(Math.max(...v.w)); return ARMISH.test(shape.skinning.bones[v.b[j]].name); };
  return shape.tris.filter((t) => !t.some(armish)).map((t) => t.map((i) => shape.verts[i].pos.map((c, k) => c + shape.T[k])));
}
const partTriangles = (part) => Array.from({ length: part.indices.length / 3 }, (_, t) => [0, 1, 2].map((k) => part.positions.slice(part.indices[t * 3 + k] * 3, part.indices[t * 3 + k] * 3 + 3)));

/** The whole carry: every piece's mesh at the Morrowind bind, its Morrowind weights, and the report.
 *  `trunk` 'slices' (the default, what the owner wears) carries the trunk by the slices alone, 'skin' by its distance off
 *  the skin (the preview's B - the owner is still to choose);
 *  `flaps` wears the aprons in the skirt; `hideGroin` has the skirt hide the groin (the fit then leaves it out). */
export function carryCuirass({ fit = true, trunk: trunkMode = 'slices', flaps = true, hideGroin = false } = {}) {
  const cuirass = readSseNif(fromBsa(MESHES, CUIRASS));
  const skyBody = readSseNif(fromBsa(MESHES, SKY_BODY)).shapes.find((s) => /UnderwearBody/.test(s.name));
  const skel = skySkeleton(readSseNif(fromBsa(MESHES, SKY_SKELETON)));
  const bind = plateBind(readFileSync(FEMALE_SKELETON));
  const body = bodyAtBind(readFileSync(BETTER_BODY('de', 'f')), bind);
  const mwTrunk = body.filter((p) => !/Arm|Forearm|Wrist|Hand/.test(p.name)).flatMap((p) => Array.from({ length: p.positions.length / 3 }, (_, i) => p.positions.slice(i * 3, i * 3 + 3)));
  const skyTrunk = skyTrunkPoints(skyBody);
  const mwAt = (n) => bind.get(n).t, skyAt = (n) => { const p = skel.get(n); if (!p) throw new Error(`Skyrim's skeleton has no "${n}"`); return p; };
  const height = landmarkMap([
    [skyAt('NPC L Calf [LClf]')[2], mwAt('Bip01 L Calf')[2]],
    [skyAt('NPC Pelvis [Pelv]')[2], mwAt('Bip01 Pelvis')[2]],
    [bustApex(skyTrunk), bustApex(mwTrunk)],
    [skyAt('NPC Neck [Neck]')[2], mwAt('Bip01 Neck')[2]],
  ]);
  const skyProfile = profile(skyTrunk, 20, 125), mwProfile = profile(mwTrunk, 20, 125);
  const slices = trunkCarry({ skyProfile, mwProfile, height });
  const trunk = trunkMode === 'slices' ? slices : skinCarry({
    sky: surfaceOf(skyTrunkTriangles(skyBody), skyProfile),
    mw: surfaceOf(body.filter((p) => !/Arm|Forearm|Wrist|Hand/.test(p.name)).flatMap(partTriangles), mwProfile),
    height, fallback: slices,
  });
  const segments = new Map();
  const carryFor = (bone) => {
    const r = boneRegion(bone);
    if (r.region === 'trunk') return trunk;
    const key = r.sky.join('>');
    if (!segments.has(key)) segments.set(key, segmentCarry(skyAt(r.sky[0]), skyAt(r.sky[1]), mwAt(r.mw[0]), mwAt(r.mw[1]), ARM_CROSS));
    return segments.get(key);
  };
  const bodyIdx = bodyIndex(hideGroin ? body.filter((p) => p.name !== 'Tri Groin') : body);
  const pieces = Object.fromEntries(PIECES.map((p) => [p, { positions: [], normals: [], uvs: [], indices: [], weights: [] }]));
  for (const s of cuirass.shapes) {
    if (/^Female/.test(s.name)) continue;   // Skyrim's body inside the armour
    const names = s.skinning.bones.map((b) => b.name);
    const carried = carryVertices(s.verts, names, carryFor);
    const remap = PIECES.map(() => new Map());
    for (const tri of s.tris) {
      const own = pieceOf(s, tri), piece = own === 'flaps' && flaps ? 'skirt' : own, at = PIECES.indexOf(piece), out = pieces[piece];
      const idx = tri.map((i) => {
        if (!remap[at].has(i)) {
          remap[at].set(i, out.positions.length);
          const v = s.verts[i], w = new Map();
          v.w.forEach((x, j) => { if (x > 0) { const mb = mwBoneOf(names[v.b[j]]); w.set(mb, (w.get(mb) ?? 0) + x); } });
          out.positions.push(carried[i]);
          out.normals.push(v.n ?? [0, 0, 1]);
          out.uvs.push([v.uv[0], v.uv[1]]);
          out.weights.push([...w]);
        }
        return remap[at].get(i);
      });
      out.indices.push(...idx);
    }
  }
  const report = {};
  for (const [name, p] of Object.entries(pieces)) {
    if (!p.indices.length) continue;
    const before = underSkin(p.positions, bodyIdx);
    // MW-IRON5: everything 1.0 over the knee, which nothing covers whole and so stays drawn - 0.6 still showed through.
    // MW-IRON3: the skirt and the trousers stand 0.6 off the skin, not 0.35 - over the thighs and knees, which they leave
    // drawn, the skin showed through as the legs moved (the owner: "чуть чуть текстура кожи проглядывает")
    const fitted = fit ? fitOver(p.positions, p.indices, bodyIdx, { margin: (part, p) => (/Knee/.test(part) || p[2] < KNEE_TOP ? 1.0 : name === 'skirt' || name === 'legs' ? 0.6 : 0.35) }) : { positions: p.positions, moved: 0, worst: 0 };
    p.positions = fitted.positions;
    const after = underSkin(p.positions, bodyIdx);
    report[name] = { verts: p.positions.length, tris: p.indices.length / 3, underBefore: before.n, pushed: fitted.moved, worst: +fitted.worst.toFixed(2), underAfter: after.n, pokes: after.parts };
  }
  // MW-IRON3 (the owner: the steel greaves still drew under the iron set - "либо скрыть ... либо делить"): the trousers
  // cut by side into the greaves, weighted the plate's way (PLATE_RIG's greave - the thigh, the calf past the knee), as
  // the boots are, since Skyrim's own weights lift what they hold off a Morrowind joint
  for (const side of ['left', 'right']) {
    const legs = pieces.legs, keep = new Map(), out = { positions: [], normals: [], uvs: [], indices: [], weights: [] };
    for (let t = 0; t < legs.indices.length; t += 3) {
      const tri = legs.indices.slice(t, t + 3), x = tri.reduce((a, i) => a + legs.positions[i][0], 0);
      if ((x < 0) !== (side === 'left')) continue;
      out.indices.push(...tri.map((i) => {
        if (!keep.has(i)) { keep.set(i, out.positions.length); out.positions.push(legs.positions[i]); out.normals.push(legs.normals[i]); out.uvs.push(legs.uvs[i]); }
        return keep.get(i);
      }));
    }
    out.weights = pieceRig(`greave_${side}`, [{ positions: out.positions.flat() }], bind).weights[0];
    pieces[`greave_${side}`] = out;
  }
  return { pieces, body: hideGroin ? body.filter((p) => p.name !== 'Tri Groin') : body, bind, report };
}

// ═══ PREVIEW ════════════════════════════════════════════════════════
// The pieces on the body, front, side and back, flat-lit: the armour in its painting, the body in a skin tone.
export function previewPng({ pieces, body }, texture, { size = 360, worn = ['cuirass', 'skirt', 'pauldron_left', 'pauldron_right'] } = {}) {
  const views = [[1, 0], [0, 1], [-1, 0]];   // front (+Y toward the viewer), side (+X), back
  const W = size * views.length, img = new Uint8Array(W * size * 4);
  for (let i = 0; i < img.length; i += 4) { img[i] = img[i + 1] = 24; img[i + 2] = 30; img[i + 3] = 255; }
  const scale = size / 140, cz = 70;
  views.forEach(([fy, fx], vi) => {
    const depth = new Float32Array(size * size).fill(-Infinity), ox = vi * size;
    const proj = (p) => {   // right of screen and toward the viewer
      const right = fy ? p[0] * -fy : p[1] * -fx * -1, toward = fy ? p[1] * fy : p[0] * fx;
      return [size / 2 + (fy ? -right : right) * scale, size / 2 - (p[2] - cz) * scale, toward];
    };
    const draw = (P, indices, colour) => {
      for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
        const [pa, pb, pc] = [proj(P[a]), proj(P[b]), proj(P[c])];
        const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
        if (Math.abs(area) < 1e-9) continue;
        const n = [0, 1, 2].map((k) => (P[b][(k + 1) % 3] - P[a][(k + 1) % 3]) * (P[c][(k + 2) % 3] - P[a][(k + 2) % 3]) - (P[b][(k + 2) % 3] - P[a][(k + 2) % 3]) * (P[c][(k + 1) % 3] - P[a][(k + 1) % 3]));
        const nl = Math.hypot(...n) || 1, lit = 0.35 + 0.65 * Math.abs((n[0] * 0.3 + n[1] * 0.5 * (fy || 1) + n[2] * 0.8) / nl);
        for (let y = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1]))); y <= Math.min(size - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1]))); y++)
          for (let x = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0]))); x <= Math.min(size - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0]))); x++) {
            const w1 = ((pc[0] - pa[0]) * (y - pa[1]) - (x - pa[0]) * (pc[1] - pa[1])) / -area, w2 = ((pb[0] - pa[0]) * (y - pa[1]) - (x - pa[0]) * (pb[1] - pa[1])) / area, w0 = 1 - w1 - w2;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * pa[2] + w1 * pb[2] + w2 * pc[2], o = y * size + x;
            if (z <= depth[o]) continue;
            depth[o] = z;
            const col = colour(a, b, c, w0, w1, w2), q = (y * W + ox + x) * 4;
            for (let k = 0; k < 3; k++) img[q + k] = Math.min(255, col[k] * lit);
          }
      }
    };
    for (const part of body) {
      const P = Array.from({ length: part.positions.length / 3 }, (_, i) => part.positions.slice(i * 3, i * 3 + 3));
      draw(P, part.indices, () => [176, 150, 120]);
    }
    for (const name of worn) {
      const p = pieces[name];
      draw(p.positions, p.indices, (a, b, c, w0, w1, w2) => {
        const u = w0 * p.uvs[a][0] + w1 * p.uvs[b][0] + w2 * p.uvs[c][0], v = w0 * p.uvs[a][1] + w1 * p.uvs[b][1] + w2 * p.uvs[c][1];
        const tx = ((Math.floor(u * texture.width) % texture.width) + texture.width) % texture.width, ty = ((Math.floor(v * texture.height) % texture.height) + texture.height) % texture.height;
        const q = (ty * texture.width + tx) * 4;
        return [texture.data[q] * 1.6, texture.data[q + 1] * 1.6, texture.data[q + 2] * 1.6];
      });
    }
  });
  return { width: W, height: size, data: img };
}

/** Smooth normals off the carried positions - the arms moved, so Skyrim's no longer stand - averaged over every corner
 *  at one place, so a UV seam does not show as a crease. */
export function smoothNormals(P, indices) {
  const acc = P.map(() => [0, 0, 0]), at = new Map(), key = (p) => p.map((v) => v.toFixed(3)).join();
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [P[indices[t]], P[indices[t + 1]], P[indices[t + 2]]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of indices.slice(t, t + 3)) { const k = key(P[i]); if (!at.has(k)) at.set(k, [0, 0, 0]); const s = at.get(k); for (let q = 0; q < 3; q++) s[q] += n[q]; }
  }
  return P.map((p) => { const s = at.get(key(p)) ?? [0, 0, 1], l = Math.hypot(...s) || 1; return s.map((v) => v / l); });
}

/** One piece as the NIF writer takes it: flat arrays, V turned to the writer's (it flips it back), the bones it uses. */
export function nifOf(piece, shape, bind, texture = PAINTING.name) {
  const normals = smoothNormals(piece.positions, piece.indices);
  const mesh = { positions: piece.positions.flat(), normals: normals.flat(), uvs: piece.uvs.flatMap(([u, v]) => [u, 1 - v]), indices: piece.indices };
  const weights = piece.weights.map((list) => { const sum = list.reduce((a, [, w]) => a + w, 0); return list.map(([b, w]) => [b, w / sum]).sort((x, y) => y[1] - x[1]); });
  const names = [...new Set(weights.flat().map(([b]) => b))];
  const bones = names.map((name) => ({ name, bind: bind.get(name) }));
  return skinnedMeshesToNif([{ mesh, texture, name: `${shape} 0`, weights }], { node: `Iron ${shape}`, bones });
}

/** The worn pieces as one OBJ (one object each), for the painting's bake - the painting's V as Blender reads it. */
export function wornObj(pieces, names = Object.keys(WORN)) {
  let obj = '', base = 1;
  for (const name of names) {
    const p = pieces[name];
    obj += `o ${name}
`;
    for (const v of p.positions) obj += `v ${v.join(' ')}
`;
    for (const [u, v] of p.uvs) obj += `vt ${u} ${1 - v}
`;
    for (let t = 0; t < p.indices.length; t += 3) obj += `f ${p.indices.slice(t, t + 3).map((i) => `${i + base}/${i + base}`).join(' ')}
`;
    base += p.positions.length;
  }
  return obj;
}

/** The painting brought to the set's bar (the owner: "+- одинаковую планку качества держать"): squeezed from Skyrim's
 *  1024 to the set's 256 it keeps Mac's cuirass's tone (mean 48, spread 23 against 40 and 26) but loses its small
 *  detail - so the detail is given back with an unsharp mask, and the tone is brought to Mac's mean, its spread a little
 *  over it. Only the texels the mesh wears are read and changed (the rest is the bake's black). Pure. */
export function finishPainting(png, reference, { amount = 0.7, spread = 1.1 } = {}) {
  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const stats = (p) => { const L = []; for (let i = 0; i < p.data.length; i += 4) { const l = lum(p.data, i); if (p.data[i + 3] > 127 && l > 3) L.push(l); } const m = L.reduce((a, b) => a + b, 0) / L.length; return { m, sd: Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length) }; };
  const { width: W, height: H, data } = png, out = new Uint8Array(data);
  const own = stats(png), ref = stats(reference), k = (ref.sd / own.sd) * spread;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, l = lum(data, o);
    if (l <= 3) continue;
    let blur = [0, 0, 0], n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const q = ((Math.min(H - 1, Math.max(0, y + j)) * W) + Math.min(W - 1, Math.max(0, x + i))) * 4;
      if (lum(data, q) <= 3) continue;
      const w = (i || j) ? (i && j ? 1 : 2) : 4; for (let c = 0; c < 3; c++) blur[c] += data[q + c] * w; n += w;
    }
    const sharp = [0, 1, 2].map((c) => data[o + c] + amount * (data[o + c] - blur[c] / n));
    const sl = Math.max(1, 0.299 * sharp[0] + 0.587 * sharp[1] + 0.114 * sharp[2]), target = Math.max(2, ref.m + (sl - own.m) * k);
    for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(sharp[c] * target / sl)));
  }
  return { width: W, height: H, data: out };
}

/** The whole import: carried, fitted, painted, written. */
export function importIronCuirass() {
  const r = carryCuirass();
  for (const [name, w] of Object.entries(WORN)) save(w.nif, nifOf(r.pieces[name], w.shape, r.bind));
  const tex = (k) => { const d = decodeDds(new Uint8Array(fromBsa(TEXTURES, ['textures', 'armor', 'iron', 'f', `cuirassplate${k}.dds`].join(BS))), { levels: 1 }).mips[0]; return writePng({ width: d.width, height: d.height, data: d.rgba }); };
  save(join(OUT, 'diffuse.png'), tex(''));
  save(join(OUT, 'normal.png'), tex('_n'));
  save(join(OUT, 'worn.obj'), wornObj(r.pieces));
  execFileSync(BLENDER, ['-b', '--factory-startup', '--python', 'tools/skyrim/bakePainting.py', '--', ...['worn.obj', 'diffuse.png', 'normal.png', 'painting.png'].map((f) => resolve(OUT, f)), String(PAINTING.size)], { stdio: ['ignore', 'ignore', 'inherit'] });
  const png = finishPainting(readPng(readFileSync(join(OUT, 'painting.png'))), readPng(readFileSync('src/assets/mw/source/Steel_Plate_Cuirass.png')));
  save(join(OUT, 'painting-finished.png'), writePng(png));
  save(PAINTING.dds, writeDds(mipChain({ width: png.width, height: png.height, data: png.data })));
  return r;
}

if (isMain(import.meta.url)) {
  const r = process.argv.includes('--no-fit') ? carryCuirass({ fit: false }) : importIronCuirass();
  console.table(r.report);
  for (const w of Object.values(WORN)) console.log(`  -> ${w.nif}`);
  console.log(`  -> ${PAINTING.dds}`);
  execFileSync(process.execPath, ['tools/lookThumbs.mjs'], { stdio: 'inherit' });   // LOOK-THUMBS: the iron looks' pictures
  if (process.argv.includes('--preview')) {
    const d = decodeDds(new Uint8Array(fromBsa(TEXTURES, ['textures', 'armor', 'iron', 'f', 'cuirassplate.dds'].join(BS))), { levels: 1 }).mips[0];
    const tex = { width: d.width, height: d.height, data: d.rgba };
    save(join(OUT, 'preview.png'), writePng(previewPng(r, tex)));
    save(join(OUT, 'preview-bare.png'), writePng(previewPng(r, tex, { worn: ['cuirass', 'skirt'] })));
    console.log(`  previews in ${OUT}`);
  }
}
