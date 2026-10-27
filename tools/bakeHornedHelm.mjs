// THE HORNED STEEL HELM, baked in one command.
//
//     node tools/bakeHornedHelm.mjs [--sheet]
//         take the helm's committed source (SOURCE) and painting (PAINTING) and write the shipped NIF and DDS
//
// MW-HORN1 (2026-10-27, the owner: "вместо стального сета дефолтного попытаться сделать адаптацию как стальной сет с
// рогами"). The Steel Helm switch's third style.
//
// MW-HORN4 (2026-10-27, the owner on the helm built from numbers here: "слабо похож ... огромные проблемы с величиной
// текстурой ... ощущение полной инородности", and Blender installed for it). A fan replica of Skyrim's horned iron helm
// for the owner's personal, non-commercial fork, modelled by eye from screenshots - nothing of Bethesda's files - and
// now MADE IN BLENDER by tools/blender/hornedHelm.py: the low mesh it ships, its painting baked in Cycles from a bevelled,
// riveted copy, lit from above and in front, at the set's own 128x128 (Mac's helm pictures' size). That script writes
// the source and the painting; this bake takes them the way bakeSteelPlate takes Mac's exports - the scene's placement,
// one object held to the box it was read at - and skins the helm the closed helm's way (PLATE_RIG helm_closed: the head
// bone alone), filling the hair slot and hiding the head.
//
// MW-HORN5 (tools/skyrim/importIronHelmet.mjs): the source is now Skyrim's iron helmet, made from the owner's install.
// It is open under the mask - in Skyrim the wearer's chin and mouth show there - so, worn hiding the head as the closed
// helm is, it showed nothing under the mask but the body's neck (the owner: "там вообще типо головы нет совсем"). It is
// an OPEN helm now (ownArmorModels.js helmHorned: no `hides`), and so it is raised onto the game's head by HELM_LIFT
// as Mac's open helm is - the game's head stands that much higher up the head bone than the scene's it was fitted on.
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
