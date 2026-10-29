// Fitting cage sampled through the same skeleton/skin path as the worn character.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { assembleFirstPersonArm, poseAssembly } from '../../src/formats/morrowind/mwFirstPerson.js';
import { skinnedMeshesToNif } from '../nifWrite.mjs';
import { plateBind } from '../bakeSteelPlate.mjs';
import { BETTER_BODY, FEMALE_SKELETON } from './mwBody.mjs';
import { isMain } from '../lib/isMain.mjs';
export async function prepareWolfCage() {
  const skeletonBytes = new Uint8Array(readFileSync(FEMALE_SKELETON));
  const bind = plateBind(skeletonBytes);
  const mesh = { positions: [0,0,0, 1,0,0, 0,1,0, 0,0,1], indices: [0,1,2] };
  const probe = skinnedMeshesToNif([{ mesh, weights: Array.from({ length: 4 }, () => [['Bip01 Spine2', 1]]) }], { bones: [{ name: 'Bip01 Spine2', bind: bind.get('Bip01 Spine2') }] });
  const names = ['iron_cuirass', 'iron_skirt', 'iron_pauldron_left', 'iron_pauldron_right', 'steel_plate_helm_horned'];
  const parts = names.map((name) => ({ slot: name, bones: [], bytes: new Uint8Array(readFileSync(`src/assets/mw/meshes/${name}.nif`)) }));
  parts.push({ slot: 'body', bones: [], bytes: new Uint8Array(readFileSync(BETTER_BODY())) }, { slot: 'probe', bones: [], bytes: probe });
  const rig = await assembleFirstPersonArm({ skeletonBytes, parts });
  if (!rig.ok) throw new Error(rig.error);
  poseAssembly(rig);
  const basis = rig.pieces.find((p) => p.slot === 'probe').positions;
  const translation = Array.from(basis.slice(0, 3));
  const matrix = [0,1,2].map((row) => [basis[3+row]-basis[row], basis[6+row]-basis[row], basis[9+row]-basis[row], translation[row]]);
  matrix.push([0,0,0,1]);
  const surfaces = rig.pieces.filter((p) => p.slot !== 'probe' && p.positions?.length).map((p) => ({
    name: p.slot, positions: Array.from(p.positions), normals: Array.from(p.normals ?? []), indices: Array.from(p.indices),
  }));
  const path = 'scratch/skyrim/wolf/fitting-cage.json'; mkdirSync('scratch/skyrim/wolf', { recursive: true });
  writeFileSync(path, JSON.stringify({ matrix, surfaces }));
  return path;
}
if (isMain(import.meta.url)) console.log(await prepareWolfCage());
