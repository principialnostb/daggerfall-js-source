// Better Bodies asset resolver for the Morrowind character pipeline.
//
// Runtime body and skin URLs are selected by the actor's race and sex from the
// checked-in race variants. The diagnostic below remains a Nord-female probe;
// it is not evidence that every race/sex combination has been visually validated.
// Vite's asset glob keeps the source files addressable without embedding binary data.
const IN_BROWSER = typeof window !== 'undefined';
const bodyModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Morrowind Textures/Better Bodies/Nude/Data Files/Meshes/bb/bb_skin*.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const bodyTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Morrowind Textures/Better Bodies/Nude/Data Files/Textures/bb/bb_skin*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
import betterBodiesFemaleUvEditsUrl from '../../../bb_skinf_no-uv-edits.json?url';

const RACE_CODES = Object.freeze({
  breton: 'br', darkelf: 'de', highelf: 'he', imperial: 'im',
  nord: 'no', orc: 'or', redguard: 'rg', woodelf: 'we',
});
const compactRaceName = (race) => String(
  race && typeof race === 'object' ? (race.name ?? race.race ?? race.id ?? '') : (race ?? ''),
).toLowerCase().replace(/[^a-z]/g, '');

/** Resolve a Better Bodies base mesh + skin as one race/sex-matched pair.
 * Unknown races return null rather than silently receiving the Nord female skin. */
export function betterBodiesAssetUrls({ race = 'Nord', female = false } = {}) {
  const raceName = compactRaceName(race);
  const raceKey = RACE_CODES[raceName] ?? (Object.values(RACE_CODES).includes(raceName) ? raceName : null);
  if (!raceKey) return null;
  const genderKey = female ? 'f' : 'm';
  const stem = `bb_skin${genderKey}_${raceKey}`;
  const findUrl = (table, extension) => {
    const entry = Object.entries(table).find(([path]) => path.toLowerCase().endsWith(`/${stem}.${extension}`));
    return entry?.[1] ?? null;
  };
  const model = findUrl(bodyModelUrls, 'nif');
  const texture = findUrl(bodyTextureUrls, 'dds');
  if (!model || !texture) return null;
  return Object.freeze({ model, texture, texturePath: `textures/bb/${stem}.dds`, raceKey, female: !!female });
}

// Compatibility alias for the isolated Nord-female diagnostic preview.
export const betterBodiesFemaleAssetUrls = betterBodiesAssetUrls({ race: 'Nord', female: true });
import { parseNif, deref } from './mwNifFile.js';
import { flattenNif } from './mwNifMesh.js';
import { buildSkeleton } from './mwSkin.js';

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
    response = await fetch(betterBodiesFemaleAssetUrls.model);
  } catch (error) {
    return { ok: false, stage: 'fetch', error: String(error?.message ?? error) };
  }
  if (!response.ok) {
    return {
      ok: false,
      stage: 'fetch',
      status: response.status,
      modelUrl: betterBodiesFemaleAssetUrls.model,
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
      modelUrl: betterBodiesFemaleAssetUrls.model,
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
      modelUrl: betterBodiesFemaleAssetUrls.model,
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
    modelUrl: betterBodiesFemaleAssetUrls.model,
    textureUrl: betterBodiesFemaleAssetUrls.texture,
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



let uvEditsPromise = null;

/**
 * Load the user's current UV corrections from the checked-in JSON file.
 * The preview editor and the live third-person body share this exact data,
 * so a later coordinate adjustment does not need a second hard-coded copy.
 */
export async function loadBetterBodiesFemaleUvEdits() {
  if (!uvEditsPromise) {
    uvEditsPromise = fetch(betterBodiesFemaleUvEditsUrl).then(async (response) => {
      if (!response.ok) throw new Error('Better Bodies UV edits failed to load: HTTP ' + response.status);
      const payload = await response.json();
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


// End-to-end browser diagnostic: parse the race-specific Better Bodies NIF,
// apply Morrowind's canonical texture-path rules, and identify the first live
// archive that will satisfy each path. This intentionally does not change
// archive order or player/NPC rendering.
export async function diagnoseBetterBodiesTextureResolution(race = 'de') {
  const raceKey = String(race || 'de').toLowerCase().replace(/[^a-z]/g, '');
  const modelPath = `meshes/bb/bb_skinf_${raceKey}.nif`;
  const [{ loadMorrowindArchives }, { correctTexturePath }, { parseNif }, { flattenNif }] = await Promise.all([
    import('../../scenes/dataSource.js'),
    import('./mwTexture.js'),
    import('./mwNifFile.js'),
    import('./mwNifMesh.js'),
  ]);
  const archives = await loadMorrowindArchives();
  const archiveLabel = (archive, index) => {
    if (archive.vendored) return `vendored archive #${index} (${archive.names.length} keys)`;
    if (Array.isArray(archive.names)) return `loose user files archive #${index} (${archive.names.length} keys)`;
    if (typeof archive.list === 'function') return `Morrowind BSA archive #${index} (${archive.fileCount ?? archive.list().length} keys)`;
    return `archive #${index}`;
  };
  const archiveDetails = archives.map((archive, index) => ({
    index,
    label: archiveLabel(archive, index),
    has: typeof archive.has === 'function',
    matchingSkinTextureKeys: (Array.isArray(archive.names) ? archive.names : typeof archive.list === 'function' ? archive.list() : [])
      .filter((key) => /^textures\/bb\/(?:bb_skinf|bb_handf)_.*\.dds$/i.test(key))
      .slice(0, 30),
  }));

  const modelArchiveIndex = archives.findIndex((archive) => archive.has?.(modelPath));
  const report = {
    race: raceKey,
    modelPath,
    archiveCount: archives.length,
    archiveOrder: archiveDetails.map(({ index, label }) => ({ index, label })),
    model: { found: modelArchiveIndex >= 0, archiveIndex: modelArchiveIndex, textureFiles: [], error: null },
    textures: [],
    note: 'The first archive with has(path) is the winning source under the current ordered archive resolver. This checks the race-specific NIF and live archive table, not only the static URL map.',
  };
  if (modelArchiveIndex < 0) {
    report.model.error = 'Race-specific Better Bodies NIF was not found in the loaded archive list.';
    console.log('[Better Bodies live texture resolution]', report);
    return report;
  }

  let nif;
  try {
    const bytes = await archives[modelArchiveIndex].load(modelPath);
    nif = parseNif(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch (error) {
    report.model.error = String(error?.message ?? error);
    console.log('[Better Bodies live texture resolution]', report);
    return report;
  }
  const batches = flattenNif(nif);
  report.model.textureFiles = [...new Set(batches.map((batch) => batch.material?.textureFile).filter(Boolean))];

  for (const authoredPath of report.model.textureFiles) {
    const exists = (key) => archives.some((archive) => archive.has?.(key));
    const correctedPath = correctTexturePath(authoredPath, exists);
    const winningArchiveIndex = archives.findIndex((archive) => archive.has?.(correctedPath));
    const row = {
      authoredPath,
      correctedPath,
      found: winningArchiveIndex >= 0,
      winningArchiveIndex,
      winningArchive: winningArchiveIndex >= 0 ? archiveLabel(archives[winningArchiveIndex], winningArchiveIndex) : null,
      fetch: null,
      bytes: null,
      width: null,
      height: null,
      error: null,
    };
    if (winningArchiveIndex >= 0) {
      try {
        const bytes = await archives[winningArchiveIndex].load(correctedPath);
        row.bytes = bytes.byteLength;
        if (bytes.byteLength >= 20 && bytes[0] === 0x44 && bytes[1] === 0x44 && bytes[2] === 0x53 && bytes[3] === 0x20) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          row.height = view.getUint32(12, true);
          row.width = view.getUint32(16, true);
        }
        row.fetch = 'archive-load-ok';
      } catch (error) {
        row.fetch = 'archive-load-failed';
        row.error = String(error?.message ?? error);
      }
    }
    report.textures.push(row);
  }

  console.table(report.textures);
  console.log('[Better Bodies live texture resolution]', report);
  return report;
}

if (typeof window !== 'undefined') {
  window.diagnoseBetterBodiesTextureResolution = diagnoseBetterBodiesTextureResolution;
}
