import { modelDyeOf, modelDyeMips } from '../systems/modelDye.js';
// LOOK-THUMBS-MW (BLOODBATH, 2026-11-08; systems/modelLooks.js, ui/enhanced/modelLookRow.js): A MORROWIND RECORD'S
// PICTURE FOR THE 3D TAB, drawn as the own looks' are (render/lookThumbRaster.js) from the player's own archives.
//
// A worn piece is drawn AS WORN, not as its ground mesh (the owner: "сапоги и перчатки нужно парными сделать"): every
// body part its record names (the BODY record's mesh - a skinned file's own shapes for the part's bone, a rigid mesh
// placed at its bone with the left side mirrored, mwFirstPerson.js rule 13 placeAtBone) on the skeleton at rest. So a
// pair of boots stands as two boots and a pair of gauntlets is both hands, drawn side by side rather than an arm's span
// apart. A weapon and a shield are their ground mesh - a blade turned on the diagonal, a shield stood up - as is any
// piece whose parts the archives do not answer.
import { parseNif } from '../formats/morrowind/mwNifFile.js';
import { flattenNif } from '../formats/morrowind/mwNifMesh.js';
import { buildSkeleton, skeletonSpaceMatrices, skinBatch, GRAPH_ROOT } from '../formats/morrowind/mwSkin.js';
import { ARMO_PART } from '../formats/morrowind/mwItemMap.js';
import { shapeMatchesBone } from '../formats/morrowind/mwFirstPerson.js';
import { loadFromArchives, preloadArmTextures, collectArmTextures } from '../combat/fpArm.js';
import { rasterLook, boundsOf, rotX, rotY, rotZ, mul3, MIRROR_X, IDENTITY3, closePair } from './lookThumbRaster.js';

const SKELETON = 'meshes/base_anim.nif';
/** Drawn pictures by catalog generation and records: a Promise of the RGBA picture or null. */
const cache = new Map();
const skeletons = new Map();

const find = (archives, path) => (archives ?? []).find((a) => a.has(path)) ?? null;
async function bytesOf(archives, path) {
  await loadFromArchives(archives, [path]);
  const arc = find(archives, path);
  if (!arc || (typeof arc.loaded === 'function' && !arc.loaded(path))) return null;
  try { return arc.get(path).slice(); } catch { return null; }
}
async function shapesOf(archives, model) {
  const bytes = await bytesOf(archives, `meshes/${model}`);
  if (!bytes) return [];
  try { return flattenNif(parseNif(bytes)).filter((s) => s.positions?.length && s.indices?.length); } catch { return []; }
}
async function restBones(catalog) {
  const key = catalog.gen ?? 0;
  if (!skeletons.has(key)) skeletons.set(key, (async () => {
    const bytes = await bytesOf(catalog.archives, SKELETON);
    if (!bytes) return null;
    const skel = buildSkeleton(parseNif(bytes));
    const mats = skeletonSpaceMatrices(skel, new Map(), GRAPH_ROOT, [...skel.nodes.keys()]);
    const bone = (name) => { const ref = skel.byName.get(String(name).toLowerCase()); return ref === undefined ? null : mats.get(ref) ?? null; };
    // a skinned shape at rest: blended by its own bones on this skeleton, as the body's CPU skin does (mwSkin.js skinBatch)
    const skin = (shape) => {
      // bound by bone NAME to this skeleton, its root the skeleton's - mwCharacter.js bindPart's binding, no retarget
      const bones = shape.skin.bones.map((b) => { const ref = skel.byName.get(String(b.name).toLowerCase()); return { ...b, ref: ref === undefined ? null : ref }; });
      const bound = { ...shape, skin: { ...shape.skin, bones, skeletonRoot: GRAPH_ROOT, rootBone: GRAPH_ROOT } };
      const positions = new Float32Array(shape.positions.length), normals = new Float32Array(shape.positions.length);
      skinBatch(bound, skel, new Map(), mats, positions, normals);
      return { ...shape, positions, normals };
    };
    return { bone, skin };
  })().catch(() => null));
  return skeletons.get(key);
}

/** A lying ground mesh stood up, front to the viewer (its long side up); one already standing stays. */
function standUp(shapes) {
  const b = boundsOf(shapes), ext = b.max.map((v, k) => v - b.min[k]);
  if (!(ext[2] < 0.5 * Math.max(ext[0], ext[1]))) return IDENTITY3;
  const base = ext[0] > ext[1] ? rotZ(Math.PI / 2) : IDENTITY3;
  return mul3(rotZ(Math.PI), mul3(rotX(Math.PI / 2), base));
}

/** The worn parts of armour or clothing records on the resting skeleton, as raster copies (side-tagged). */
async function wornCopies(records, catalog, { partFilter = null } = {}) {
  const rest = await restBones(catalog);
  if (!rest) return [];
  const { bone, skin } = rest;
  const bodies = new Map((catalog.parts ?? []).map((b) => [String(b.id || '').toLowerCase(), b]));
  const copies = [];
  const done = new Set();
  for (const rec of records) {
    for (const ref of rec.parts ?? []) {
      const id = String(ref.male || ref.female || '').toLowerCase();
      const body = bodies.get(id);
      const row = ARMO_PART[ref.part];
      const boneName = row?.bones?.[0];
      if (!body?.model || !boneName || (partFilter && !partFilter(row.name))) continue;
      const key = `${body.model}@${boneName}`;
      if (done.has(key)) continue;
      done.add(key);
      const shapes = await shapesOf(catalog.archives, body.model);
      const left = /left/i.test(boneName);
      const skinned = shapes.filter((s) => s.skinned || s.skin);
      if (skinned.length) {
        const mine = [];
        for (const s of skinned) if (shapeMatchesBone(s.name, boneName)) { try { mine.push(skin(s)); } catch { /* a skin this skeleton cannot bind draws nothing */ } }
        if (mine.length) copies.push({ shapes: mine, side: left ? 'left' : /right/i.test(boneName) ? 'right' : null });
        continue;
      }
      const at = bone(boneName);
      if (!at) continue;
      const a = at.a, m = [a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7], a[8]];
      copies.push({ shapes, matrix: left ? mul3(m, MIRROR_X) : m, offset: [at.t[0], at.t[1], at.t[2]], side: left ? 'left' : /right/i.test(boneName) ? 'right' : null });
    }
  }
  return copies;
}

/**
 * The picture of records as a look - RGBA { width, height, data } - or null when nothing draws.
 * @param {any[]} records the records the look draws (a pair's two, a garment's one, a weapon's one)
 * @param {'armor'|'shield'|'clothing'|'weapon'} kind
 * @param {any} catalog the rig's catalogue (fpArm modelCatalog: archives, parts, gen)
 * @param {{ size?: number, pauldron?: boolean, dye?: number | null }} [options]
 */
export function mwLookThumb(records, kind, catalog, { size = 96, pauldron = false, dye = undefined } = {}) {
  const live = (records ?? []).filter(Boolean);
  if (!live.length || !catalog?.archives) return Promise.resolve(null);
  const key = `${catalog.gen ?? 0}:${kind}:${size}:${live.map((r) => `${r.id}:${r.model}:${dye === undefined ? modelDyeOf(r.id) : dye}`).join('+')}`;
  if (!cache.has(key)) {
    if (cache.size > 400) cache.clear();
    cache.set(key, (async () => {
      let copies = [];
      if (kind === 'armor' || kind === 'clothing') {
        // a pauldron draws its shoulder and upper arm - not the forearm guard some carry, an arm's length away
        copies = await wornCopies(live, catalog, { partFilter: pauldron ? (name) => /pauldron|upper arm/.test(name) : null });
        copies = closePair(copies);
      }
      if (!copies.length) {
        const shapes = await shapesOf(catalog.archives, live[0].model);
        if (!shapes.length) return null;
        let m = standUp(shapes);
        if (kind === 'weapon') m = mul3(rotY(-Math.PI / 4), m);   // a blade on the diagonal, as the own looks' battleaxe
        copies = [{ shapes, matrix: m }];
      }
      const all = copies.flatMap((c) => c.shapes);
      await preloadArmTextures(all, catalog.archives, catalog.gen ?? null);
      const textures = collectArmTextures(all, catalog.archives, catalog.gen ?? null);
      const textureOf = (file) => {
        const e = textures.get(file);
        const m0 = e?.ok ? e.image?.mips?.[0] : null;
        if (!m0) return null;
        const dyed = modelDyeMips([{ ...m0, rgba: m0.data ?? m0.rgba }], `clothing (${live[0].id})`, file, dye)[0];
        return { width: dyed.width, height: dyed.height, data: dyed.rgba };
      };
      return rasterLook(copies, textureOf, { size });
    })().catch(() => null));
  }
  return cache.get(key);
}
