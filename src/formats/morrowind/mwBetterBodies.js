// Better Bodies integration probe for the Morrowind third-person character pipeline.
//
// This deliberately starts as an opt-in probe, not a replacement for the live
// player body: it lets us verify that the repository's actual Better Bodies
// NIF can be read by DFO's existing Morrowind NIF parser before we touch the
// player assembly, bone binding, or equipment rules.
//
// Run in the browser console on the morrowind.v2 build:
//   const bb = await import('/src/formats/morrowind/mwBetterBodies.js');
//   console.log(await bb.inspectBetterBodiesFemale());
//
// URL objects keep the binary resources out of Node's module loader; Vite
// emits the NIF/DDS as build assets (assetsInclude in vite.config.js).
import betterBodiesFemaleUvEdits from '../../../bb_skinf_no-uv-edits.json' with { type: 'json' };
import { parseNif, deref } from './mwNifFile.js';
import { flattenNif } from './mwNifMesh.js';
import { buildSkeleton } from './mwSkin.js';

const betterBodiesFemaleNifUrl = new URL('../../../Morrowind Textures/Better Bodies/Nude/Data Files/Meshes/bb/bb_skinf_no.nif', import.meta.url).href;
const betterBodiesFemaleTextureUrl = new URL('../../../Morrowind Textures/Better Bodies/Nude/Data Files/Textures/bb/bb_skinf_no.dds', import.meta.url).href;

/**
 * Parse the checked-in Better Bodies female Nord mesh with DFO's own NIF
 * reader and report whether it is suitable for a rigged third-person test.
 *
 * This function does not alter the active player, NPCs, item icons, or
 * inventory PaperDoll. Its output is intended to establish the exact next
 * integration step with measured data rather than assuming NIF compatibility.
 */
export async function inspectBetterBodiesFemale() {
  let response;
  try {
    response = await fetch(betterBodiesFemaleNifUrl);
  } catch (error) {
    return { ok: false, stage: 'fetch', error: String(error?.message ?? error) };
  }
  if (!response.ok) {
    return {
      ok: false,
      stage: 'fetch',
      status: response.status,
      modelUrl: betterBodiesFemaleNifUrl,
      error: 'Could not fetch the Better Bodies NIF asset from this build.',
    };
  }

  let nif;
  try {
    nif = parseNif(new Uint8Array(await response.arrayBuffer()));
  } catch (error) {
    return {
      ok: false,
      stage: 'parse',
      modelUrl: betterBodiesFemaleNifUrl,
      error: String(error?.message ?? error),
    };
  }

  let batches;
  try {
    batches = flattenNif(nif);
  } catch (error) {
    return {
      ok: false,
      stage: 'flatten',
      modelUrl: betterBodiesFemaleNifUrl,
      error: String(error?.message ?? error),
    };
  }

  const skeleton = buildSkeleton(nif);
  const shapes = batches.map((batch, index) => ({
    index,
    vertices: batch.positions ? batch.positions.length / 3 : 0,
    triangles: batch.indices ? batch.indices.length / 3 : 0,
    skinned: Boolean(batch.skinned && batch.skin),
    texture: batch.material?.textureFile ?? null,
    boneCount: batch.skin?.bones?.length ?? 0,
    bones: (batch.skin?.bones ?? []).map((bone) => bone.name || '(unnamed)'),
  })).filter((shape) => shape.vertices > 0 && shape.triangles > 0);

  const roots = (nif.roots ?? []).map((ref) => {
    const record = deref(nif, ref);
    return record ? { ref, type: record.type, name: record.name ?? '' } : { ref, type: null, name: '' };
  });

  const totalVertices = shapes.reduce((sum, shape) => sum + shape.vertices, 0);
  const totalTriangles = shapes.reduce((sum, shape) => sum + shape.triangles, 0);
  const modelBoneNames = [...skeleton.byName.keys()].sort();
  const usedBoneNames = [...new Set(shapes.flatMap((shape) => shape.bones))].sort();
  const missingSkeletonBones = usedBoneNames.filter((name) => name && name !== '(unnamed)' && !skeleton.byName.has(name));
  const textureFiles = [...new Set(shapes.map((shape) => shape.texture).filter(Boolean))];
  return {
    ok: shapes.length > 0,
    stage: shapes.length ? 'geometry' : 'empty-geometry',
    modelUrl: betterBodiesFemaleNifUrl,
    textureUrl: betterBodiesFemaleTextureUrl,
    nifVersion: '4.0.0.2',
    recordCount: nif.records.length,
    roots,
    skeletonNodes: skeleton.nodes.size,
    namedBones: skeleton.byName.size,
    modelBoneNames,
    usedBoneNames,
    missingSkeletonBones,
    textureFiles,
    shapes,
    totalVertices,
    totalTriangles,
    skinnedShapes: shapes.filter((shape) => shape.skinned).length,
    message: shapes.length
      ? 'The model parsed. Next verify its bone names against the live third-person skeleton and render a controlled preview before enabling it for the player.'
      : 'The NIF parsed but the current flattener found no drawable triangles.',
  };
}

export const betterBodiesFemaleAssetUrls = Object.freeze({
  model: betterBodiesFemaleNifUrl,
  texture: betterBodiesFemaleTextureUrl,
});


let uvEditsPromise = null;

/**
 * Load the user's current UV corrections from the checked-in JSON file.
 * The preview editor and the live third-person body share this exact data,
 * so a later coordinate adjustment does not need a second hard-coded copy.
 */
export async function loadBetterBodiesFemaleUvEdits() {
  if (!uvEditsPromise) {
    uvEditsPromise = Promise.resolve().then(() => {
      const payload = betterBodiesFemaleUvEdits;
      if (payload?.format !== 'better-bodies-nif-uv-edits-v1' || !Array.isArray(payload.edits)) {
        throw new Error('Better Bodies UV edits have an unsupported format.');
      }
      return payload.edits;
    }).catch((error) => {
      uvEditsPromise = null;
      throw error;
    });
  }
  return uvEditsPromise;
}
