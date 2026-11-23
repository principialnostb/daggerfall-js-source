// Bake the horned helm with node tools/bakeHornedHelm.mjs [--sheet] after importing the owner's Skyrim helmet
// and painting. Skin it to the head bone and retain the wearer's visible face beneath the open mask. Generated
// Skyrim assets stay local and are ignored by Git.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readFbx } from './fbxRead.mjs';
import { readPng, writePng } from './pngIO.mjs';
import { mipChain, writeDds } from './meshTexture.mjs';
import { skinnedMeshesToNif } from './nifWrite.mjs';
import { previewSheet } from './meshSheets.mjs';
import { isMain } from './lib/isMain.mjs';
import { HELM_LIFT, liftMesh, bakeObject, plateBind, pieceRig, RETAIL_SKELETON, meshFile, textureFile, textureName } from './bakeSteelPlate.mjs';

export const PIECE = 'helm_horned';
export const TEXTURE = 'helm_horned';

/** What tools/blender/hornedHelm.py writes: the helm and its painting. */
export const SOURCE = 'src/assets/mw/source/Steel_Plate_Horned_Helm.fbx';
export const PAINTING = 'src/assets/mw/source/Steel_Plate_Horned_Helm.png';

/** The helm's object and the box it was modelled at (Blender's numbers are the scene's). */
export const OBJECT = 'Horned_Helm';
export const BOX = Object.freeze([[-12.21, -9.49, 113.94], [12.21, 11.6, 131.01]]);

/** The bake: the helm read from its source, raised onto the game's head (HELM_LIFT) and skinned to it in retail's
 *  bind - the NIF and the DDS. Pure. */
export function bakeHornedHelm({ fbx, png, skeleton }) {
  const mesh = liftMesh(bakeObject(readFbx(Buffer.from(fbx)), OBJECT, BOX), HELM_LIFT);
  const r = pieceRig('helm_closed', [mesh], plateBind(skeleton));   // the closed helm's rig: the head bone alone
  const nif = skinnedMeshesToNif([{ mesh, texture: textureName(TEXTURE), name: `${r.shape} 0`, weights: r.weights[0] }], { node: `Steel Plate ${PIECE}`, bones: r.bones });
  const picture = readPng(png);
  return { mesh, nif, picture, dds: writeDds(mipChain({ width: picture.width, height: picture.height, data: picture.data })) };
}

const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };

if (isMain(import.meta.url)) {
  const r = bakeHornedHelm({ fbx: readFileSync(SOURCE), png: readFileSync(PAINTING), skeleton: readFileSync(RETAIL_SKELETON) });
  save(meshFile(PIECE), r.nif);
  save(textureFile(TEXTURE), r.dds);
  console.log(`  ${PIECE} ${r.mesh.indices.length / 3} triangles -> ${meshFile(PIECE)}  ${r.nif.length} bytes; bounds ${JSON.stringify(r.mesh.bounds)}`);
  console.log(`  ${TEXTURE} ${r.picture.width}x${r.picture.height} -> ${textureFile(TEXTURE)}  ${r.dds.length} bytes`);
  if (process.argv.includes('--sheet')) save('scratch/steel-plate-helm_horned.png', writePng(previewSheet(r.mesh, 360, r.picture)));
}
