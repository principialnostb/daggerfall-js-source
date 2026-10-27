// SKYRIM'S IRON GAUNTLETS AND BOOTS AS THE STEEL GAUNTLETS' AND BOOTS' IRON LOOK, from the owner's own install.
//
//     node tools/skyrim/importIronLimbs.mjs [--preview]
//
// MW-IRON2 (2026-10-27, the owner: "давай просто пока что доделаем перчатки и ботинки"). After the cuirass (MW-IRON1,
// tools/skyrim/importIronCuirass.mjs - its BSA reader, its painting's finish and its NIF writer are this one's too):
// Skyrim's female iron gauntlets and boots (meshes\armor\iron\f\gauntlets_1.nif, boots_1.nif), each one mesh for both
// sides, cut left and right by side and carried onto the Morrowind body by bone SEGMENTS (tools/skyrim/retarget.mjs):
//   - the upper arm's cuff, the forearm and its twists, the thigh's top and the calf each ride their own segment;
//   - the hand with all its fingers, and the foot with its toe, are carried WHOLE on the hand's and the foot's segment,
//     scaled to the Morrowind one's length - Skyrim's five three-jointed fingers have no one-to-one in Morrowind's three
//     two-jointed ones, and a gauntlet takes the hand's place, so no skin under it to follow;
//   - their weights go to the Morrowind bones the Skyrim ones stand for: the thumb to the thumb, the index and middle
//     fingers to Finger1, the ring and little to Finger2, each finger's third joint to its second; the toe to the foot.
// Then pushed out over the Better Bodies skin as the cuirass is, painted by Blender's re-bake and brought to Mac's
// gauntlets' and boots' tone at their sizes (256 and 128). Nothing of Bethesda's is committed: every output is ignored.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { readSseNif } from './sseNif.mjs';
import { bodyAtBind, BETTER_BODY, FEMALE_SKELETON } from './mwBody.mjs';
import { landmarkMap, segmentCarry, carryVertices, bodyIndex, fitOver, underSkin } from './retarget.mjs';
import { KNEE_TOP, fromBsa, MESHES, TEXTURES, BLENDER, OUT, SKY_SKELETON, save, skySkeleton, finishPainting, nifOf, wornObj, previewPng } from './importIronCuirass.mjs';
import { plateBind, PLATE_RIG, pieceRig } from '../bakeSteelPlate.mjs';
import { decodeDds } from '../../src/formats/morrowind/mwDdsFile.js';
import { mipChain, writeDds } from '../meshTexture.mjs';
import { readPng, writePng } from '../pngIO.mjs';
import { isMain } from '../lib/isMain.mjs';

const BS = String.fromCharCode(92);
const SIDE_REF = [1, 0, 0];
/** The set's one tone: the iron cuirass's painting as its import finished it (run that import first). */
const IRON_TONE = join(OUT, 'painting-finished.png');   // a foot runs forward: its frame is taken off the world's side

/** The two limbs: Skyrim's mesh, the pieces it is cut into (by side), what ships of each, and the painting. */
export const LIMBS = Object.freeze({
  gauntlets: {
    mesh: ['meshes', 'armor', 'iron', 'f', 'gauntlets_1.nif'].join(BS),
    pieces: { gauntlet_left: { shape: PLATE_RIG.gauntlet_left.shape, nif: 'src/assets/mw/meshes/iron_gauntlet_left.nif' }, gauntlet_right: { shape: PLATE_RIG.gauntlet_right.shape, nif: 'src/assets/mw/meshes/iron_gauntlet_right.nif' } },
    painting: { name: 'iron_gauntlets.dds', dds: 'src/assets/mw/textures/iron_gauntlets.dds', size: 256 },
    // In the game the fist was huge and the elbow's cuff hollow (the owner: "кулак огромный", "полое пространство где
    // локти"). The hand was scaled by its bone (6.49 against 6.03, +8%) where the hands themselves - wrist to fingertip,
    // Better Bodies' against Skyrim's femalehands_1 - are 13.32 against 15.37 (-13%), and the fit pushed the curled
    // fingers out over Better Bodies' open palm, which the gauntlet hides anyway. So the hand is scaled by the hands
    // (`handScale`) and left out of the fit; and the gauntlet hides the wrist alone - the forearm is drawn inside its
    // cuff, 0.6 under it.
    fitParts: /Upper Arm|Forearm|Wrist/, hands: true, margin: 0.6,
  },
  boots: {
    mesh: ['meshes', 'armor', 'iron', 'f', 'boots_1.nif'].join(BS),
    pieces: { boot_left: { shape: PLATE_RIG.boot_left.shape, nif: 'src/assets/mw/meshes/iron_boot_left.nif' }, boot_right: { shape: PLATE_RIG.boot_right.shape, nif: 'src/assets/mw/meshes/iron_boot_right.nif' } },
    painting: { name: 'iron_boots.dds', dds: 'src/assets/mw/textures/iron_boots.dds', size: 128 },
    fitParts: /Knee|Ankle|Foot|Upper Leg/,
    // In the game the iron boots floated: Skyrim weights its heel partly to the calf, and Morrowind's standing pose
    // turns the foot off the calf as the bind does not, so the heel rose with the shin. Weighted the plate's way
    // instead (PLATE_RIG's boot - the foot holds the foot, the calf the shaft, the thigh the top, blended at the
    // joints), as Mac's boots, which stand on the ground; the heel set on the plate boot's sole (-0.18 at the bind);
    // and kept 0.7 off the knee, which the boot leaves drawn and which showed through it as the leg bent.
    rig: true, sole: -0.18, margin: (part, p) => (/Knee/.test(part) || p[2] < KNEE_TOP ? 1.0 : 0.6),   // MW-IRON5: 1.0 off the knee (0.7 still showed it)
  },
});

/** Skyrim's limb bone to the Morrowind bone its weight goes to. */
export function limbBoneOf(name) {
  const m = /^NPC ([LR]) (\w+)/.exec(name);
  if (!m) throw new Error(`no Morrowind bone for "${name}"`);
  const [, S, b] = m, bip = (x) => `Bip01 ${S} ${x}`;
  if (/^Finger0[0]$/.test(b)) return bip('Finger0');
  if (/^Finger0[12]$/.test(b)) return bip('Finger01');
  if (/^Finger[12]0$/.test(b)) return bip('Finger1');
  if (/^Finger[12][12]$/.test(b)) return bip('Finger11');
  if (/^Finger[34]0$/.test(b)) return bip('Finger2');
  if (/^Finger[34][12]$/.test(b)) return bip('Finger21');
  if (/^Hand$/.test(b)) return bip('Hand');
  if (/^Forearm/.test(b)) return bip('Forearm');
  if (/^UpperArm|^Upperarm/.test(b)) return bip('UpperArm');
  if (/^Thigh/.test(b)) return bip('Thigh');
  if (/^Calf/.test(b)) return bip('Calf');
  if (/^Foot|^Toe/.test(b)) return bip('Foot');
  throw new Error(`no Morrowind bone for "${name}"`);
}

/** The carry for a Skyrim limb bone: its segment, Skyrim's to Morrowind's. `sky(n)` and `mw(n)` the bones' bind
 *  positions; `mwLocal(n, p)` a point in a Morrowind bone's own frame. */
export function limbCarryFor({ sky, skyFull, mw, mwLocal, handScale = null }) {
  const cache = new Map();
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    const m = /^NPC ([LR]) (\w+)/.exec(name), [, S, b] = m;
    const k = (n) => skyFull(`NPC ${S} ${n}`), bip = (n) => `Bip01 ${S} ${n}`;
    let carry;
    if (/^UpperArm|^Upperarm/.test(b)) carry = segmentCarry(sky(k('UpperArm')), sky(k('Forearm')), mw(bip('UpperArm')), mw(bip('Forearm')), 0.95);
    else if (/^Forearm/.test(b)) carry = segmentCarry(sky(k('Forearm')), sky(k('Hand')), mw(bip('Forearm')), mw(bip('Hand')), 0.95);
    else if (/^Hand|^Finger/.test(b)) {   // the hand whole, from the wrist to the middle finger's root
      const mid = mw(bip('Finger1')).map((v, i) => (v + mw(bip('Finger2'))[i]) / 2);
      carry = segmentCarry(sky(k('Hand')), sky(k('Finger20')), mw(bip('Hand')), mid, handScale, undefined, handScale);
    } else if (/^Thigh/.test(b)) carry = segmentCarry(sky(k('Thigh')), sky(k('Calf')), mw(bip('Thigh')), mw(bip('Calf')));
    else if (/^Calf/.test(b)) carry = segmentCarry(sky(k('Calf')), sky(k('Foot')), mw(bip('Calf')), mw(bip('Foot')));
    else if (/^Foot|^Toe/.test(b)) carry = segmentCarry(sky(k('Foot')), sky(k('Toe0')), mw(bip('Foot')), mwLocal(bip('Foot'), [5.5, 9, 0]), null, SIDE_REF);   // the ball, as the plate's rig ends the foot
    else throw new Error(`no segment for "${name}"`);
    cache.set(name, carry);
    return carry;
  };
}

/** Better Bodies' hand over Skyrim's, wrist bone to the farthest fingertip - femalehands_1 against the Dunmer woman's. */
export function handsRatio(skel, bind) {
  const hands = readSseNif(fromBsa(MESHES, ['meshes', 'actors', 'character', 'character assets', 'femalehands_1.nif'].join(BS))).shapes[0];
  const skyHand = skel.get([...skel.keys()].find((n) => n.startsWith('NPC L Hand')));
  const tips = hands.verts.filter((v) => /L (Hand|Finger)/.test(hands.skinning.bones[v.b[v.w.indexOf(Math.max(...v.w))]].name)).map((v) => v.pos.map((c, k) => c + hands.T[k]));
  const far = (o, P) => Math.max(...P.map((p) => Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2])));
  const bb = bodyAtBind(readFileSync(BETTER_BODY('de', 'f')), bind).find((p) => p.name === 'Tri Left Hand');
  return far(bind.get('Bip01 L Hand').t, Array.from({ length: bb.positions.length / 3 }, (_, i) => bb.positions.slice(i * 3, i * 3 + 3))) / far(skyHand, tips);
}

/** One limb carried, cut, fitted: its pieces at the Morrowind bind with their Morrowind weights, and the report. */
export function carryLimb(limb) {
  const nif = readSseNif(fromBsa(MESHES, limb.mesh));
  const skel = skySkeleton(readSseNif(fromBsa(MESHES, SKY_SKELETON)));
  const bind = plateBind(readFileSync(FEMALE_SKELETON));
  const body = bodyAtBind(readFileSync(BETTER_BODY('de', 'f')), bind);
  const names = [...skel.keys()];
  const skyFull = (short) => names.find((n) => n === short || n.startsWith(`${short} [`)) ?? short;
  const sky = (n) => { const p = skel.get(n); if (!p) throw new Error(`Skyrim's skeleton has no "${n}"`); return p; };
  const mw = (n) => { const b = bind.get(n); if (!b) throw new Error(`the bind has no "${n}"`); return b.t; };
  const mwLocal = (n, l) => { const m = bind.get(n); return [0, 1, 2].map((k) => m.a[k * 3] * l[0] + m.a[k * 3 + 1] * l[1] + m.a[k * 3 + 2] * l[2] + m.t[k]); };
  const handScale = limb.hands ? handsRatio(skel, bind) : null;
  const carryFor = limbCarryFor({ sky, skyFull, mw, mwLocal, handScale });
  const keys = Object.keys(limb.pieces);
  const pieces = Object.fromEntries(keys.map((p) => [p, { positions: [], normals: [], uvs: [], indices: [], weights: [] }]));
  for (const s of nif.shapes) {
    const bones = s.skinning.bones.map((b) => b.name);
    const carried = carryVertices(s.verts, bones, carryFor);
    const remap = keys.map(() => new Map());
    for (const tri of s.tris) {
      const x = tri.reduce((a, i) => a + s.verts[i].pos[0], 0), piece = keys[x < 0 ? 0 : 1], at = keys.indexOf(piece), out = pieces[piece];
      out.indices.push(...tri.map((i) => {
        if (!remap[at].has(i)) {
          remap[at].set(i, out.positions.length);
          const v = s.verts[i], w = new Map();
          v.w.forEach((q, j) => { if (q > 0) { const mb = limbBoneOf(bones[v.b[j]]); w.set(mb, (w.get(mb) ?? 0) + q); } });
          out.positions.push(carried[i]); out.normals.push(v.n ?? [0, 0, 1]); out.uvs.push([v.uv[0], v.uv[1]]); out.weights.push([...w]);
        }
        return remap[at].get(i);
      }));
    }
  }
  const fitBody = bodyIndex(body.filter((p) => limb.fitParts.test(p.name)));
  const report = {};
  for (const [name, p] of Object.entries(pieces)) {
    const before = underSkin(p.positions, fitBody), fitted = fitOver(p.positions, p.indices, fitBody, { margin: limb.margin ?? 0.35 });
    p.positions = fitted.positions;
    if (limb.sole !== undefined) {   // the heel onto the plate boot's sole, the lift fading out up the ankle and toward the toe
      const lift = limb.sole - Math.min(...p.positions.filter((q) => q[1] < 0).map((q) => q[2]));
      p.positions = p.positions.map((q) => [q[0], q[1], q[2] + lift * Math.min(1, Math.max(0, 1 - q[2] / 6)) * Math.min(1, Math.max(0, (6 - q[1]) / 6))]);
    }
    if (limb.rig) p.weights = pieceRig(name, [{ positions: p.positions.flat() }], bind).weights[0];
    const after = underSkin(p.positions, fitBody);
    report[name] = { verts: p.positions.length, tris: p.indices.length / 3, underBefore: before.n, worst: +fitted.worst.toFixed(2), underAfter: after.n };
  }
  return { pieces, body, bind, report };
}

/** One limb's whole import: carried, written, painted. */
export function importLimb(key) {
  const limb = LIMBS[key], r = carryLimb(limb);
  for (const [name, p] of Object.entries(limb.pieces)) save(p.nif, nifOf(r.pieces[name], p.shape, r.bind, limb.painting.name));
  const tex = nifTextures(limb);
  save(join(OUT, `${key}-diffuse.png`), tex[0]);
  save(join(OUT, `${key}-normal.png`), tex[1]);
  save(join(OUT, `${key}.obj`), wornObj(r.pieces, Object.keys(limb.pieces)));
  execFileSync(BLENDER, ['-b', '--factory-startup', '--python', 'tools/skyrim/bakePainting.py', '--', ...[`${key}.obj`, `${key}-diffuse.png`, `${key}-normal.png`, `${key}-painting.png`].map((f) => resolve(OUT, f)), String(limb.painting.size)], { stdio: ['ignore', 'ignore', 'inherit'] });
  // MW-IRON4: toned to the iron cuirass's finished painting, not to Mac's piece of the same slot - Mac's boots are far
  // brighter than his cuirass (mean 60 and 48), and the iron boots came out lighter than the iron they are worn with
  const png = finishPainting(readPng(readFileSync(join(OUT, `${key}-painting.png`))), readPng(readFileSync(IRON_TONE)));
  save(join(OUT, `${key}-finished.png`), writePng(png));
  save(limb.painting.dds, writeDds(mipChain({ width: png.width, height: png.height, data: png.data })));
  return r;
}

/** The limb's painting and its normal map, as PNG bytes - named by the mesh's own texture set. */
function nifTextures(limb) {
  const set = readSseNif(fromBsa(MESHES, limb.mesh)).shapes.find((s) => s.textures)?.textures ?? [];
  return set.slice(0, 2).map((p) => { const d = decodeDds(new Uint8Array(fromBsa(TEXTURES, p)), { levels: 1 }).mips[0]; return writePng({ width: d.width, height: d.height, data: d.rgba }); });
}

if (isMain(import.meta.url)) {
  const both = {};
  for (const key of Object.keys(LIMBS)) {
    const r = importLimb(key);
    Object.assign(both, r.report);
    if (process.argv.includes('--preview')) {
      const t = readPng(readFileSync(join(OUT, `${key}-finished.png`)));
      save(join(OUT, `${key}-preview.png`), writePng(previewPng(r, { width: t.width, height: t.height, data: t.data.map((v, i) => (i % 4 === 3 ? v : Math.min(255, v * 1.1))) }, { worn: Object.keys(LIMBS[key].pieces) })));
    }
  }
  console.table(both);
  for (const l of Object.values(LIMBS)) { for (const p of Object.values(l.pieces)) console.log(`  -> ${p.nif}`); console.log(`  -> ${l.painting.dds}`); }
  execFileSync(process.execPath, ['tools/lookThumbs.mjs'], { stdio: 'inherit' });
}
