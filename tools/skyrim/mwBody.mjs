// THE MORROWIND BODY THE ARMOUR IS FITTED ON, in the plate scene's frame.
//
// MW-IRON1 (2026-10-27, the owner: "что бы оно на тело ложилось на его пропорции идеально и не просвечивали текстуры кожи
// и прочее"). The player's body is Better Bodies by default (modSettings.js BetterBodiesSource 2) - one NIF of skinned
// parts, Tri Chest to Tri Right Foot, under Mods/Bodies. Each part's vertices are put where the bind stands them: per
// vertex, the weighted sum over its bones of the bone's bind (the vendored retail skeleton's, plateBind - the scene's
// frame the plate is baked in) times the bone's skin transform. A single bone's answer is not enough: Better Bodies'
// skin transforms disagree by up to 9 units between the bones of one vertex.
import { readFileSync } from 'node:fs';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { affineOfTransform } from '../../src/formats/morrowind/mwAffine.js';

export const BETTER_BODY = (race = 'de', sex = 'f') => `Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/bb/bb_skin${sex}_${race}.nif`;
export const FEMALE_SKELETON = 'vendor/weapon-sheathing/Data Files/Animations/xbase_anim_female/xbase_anim_sh.nif';

const ap = (m, v) => [0, 1, 2].map((k) => m.a[k * 3] * v[0] + m.a[k * 3 + 1] * v[1] + m.a[k * 3 + 2] * v[2] + m.t[k]);
const an = (m, v) => [0, 1, 2].map((k) => m.a[k * 3] * v[0] + m.a[k * 3 + 1] * v[1] + m.a[k * 3 + 2] * v[2]);

/** The body's parts at bind in `bind`'s frame: [{ name, positions, normals, indices }]. */
export function bodyAtBind(nifBytes, bind) {
  const nif = parseNif(new Uint8Array(nifBytes));
  const parts = [];
  for (const r of nif.records) {
    if (r?.type !== 'NiTriShape' || r.skin < 0) continue;
    const d = nif.records[r.data], sk = nif.records[r.skin], sd = nif.records[sk.data];
    const n = d.vertices.length / 3, pos = new Float64Array(n * 3), nrm = new Float64Array(n * 3), wsum = new Float64Array(n);
    sk.bones.forEach((ref, i) => {
      const B = bind.get(nif.records[ref].name);
      if (!B) return;
      const S = affineOfTransform(sd.bones[i].transform);
      const { indices = [], weights = [] } = sd.bones[i];
      for (let j = 0; j < indices.length; j++) {
        const index = indices[j], weight = weights[j];
        const v = [d.vertices[index * 3], d.vertices[index * 3 + 1], d.vertices[index * 3 + 2]];
        const p = ap(B, ap(S, v));
        const q = d.normals ? an(B, an(S, [d.normals[index * 3], d.normals[index * 3 + 1], d.normals[index * 3 + 2]])) : [0, 0, 0];
        for (let k = 0; k < 3; k++) { pos[index * 3 + k] += weight * p[k]; nrm[index * 3 + k] += weight * q[k]; }
        wsum[index] += weight;
      }
    });
    for (let i = 0; i < n; i++) if (wsum[i] > 0) for (let k = 0; k < 3; k++) { pos[i * 3 + k] /= wsum[i]; nrm[i * 3 + k] /= wsum[i]; }
    const tris = d.triangles ?? d.indices;
    parts.push({ name: r.name, positions: Array.from(pos), normals: Array.from(nrm), indices: Array.from(tris) });
  }
  return parts;
}
