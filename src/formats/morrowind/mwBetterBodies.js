// Better Bodies asset resolver for the Morrowind character pipeline.
//
// Runtime body and skin URLs are selected by the actor's race and sex from the
// checked-in race variants. The diagnostic below remains a Nord-female probe;
// it is not evidence that every race/sex combination has been visually validated.
// Vite's asset glob keeps the source files addressable without embedding binary data.
const IN_BROWSER = typeof window !== 'undefined';
import { getUnderwearEnabled, getBodyHairEnabled } from '../../characters/bodyMorphs.js';
import { modSetting } from '../../systems/modSettings.js';
import { betterBodiesFirstPersonHandAssetPaths, betterBodiesHighResolutionFemaleHandTexturePath, betterBodiesTextureStem } from './mwBetterBodiesPaths.js';

const nudeBodyModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/bb/bb_skin*.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const nudeHandModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/bb/bb_hand*.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const nudeHandTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Nude/Data Files/Textures/bb/bb_hand*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const nudeBodyTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Nude/Data Files/Textures/bb/bb_skin*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const underwearBodyModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/bb/bb_skin*.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const underwearHandModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Meshes/bb/bb_hand*.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const underwearHandTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Textures/bb/bb_hand*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const underwearBodyTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies/Underwear/Data Files/Textures/bb/bb_skin*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const highResolutionFemaleHandTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/High Resolution Better Body Female Textures/Hands/Textures/bb/bb_handf_*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
// HD-BODY: the high-resolution female pack is a MESH and texture pair - its chest and groin are its own topology
// (707/321 vertices against Better Bodies' 518/155), so its 2048px skin never fits the Better Bodies UVs. Selected
// together, behind HighResolutionBetterBodyFemaleTexturesSource = 2; the underwear is painted in its texture.
const highResolutionFemaleBodyModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/High Resolution Better Body Female Textures/Meshes/bb/bb_skinf_*.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const highResolutionFemaleBodyTextureUrls = IN_BROWSER
  ? Object.freeze({
      underwear: import.meta.glob('../../../Mods/Bodies/High Resolution Better Body Female Textures/Underwear/Textures/bb/bb_skinf_*.dds', {
        eager: true, query: '?url', import: 'default',
      }),
      nude: import.meta.glob('../../../Mods/Bodies/High Resolution Better Body Female Textures/Nude_No_Hair/Textures/bb/bb_skinf_*.dds', {
        eager: true, query: '?url', import: 'default',
      }),
      bodyHair: import.meta.glob('../../../Mods/Bodies/High Resolution Better Body Female Textures/Nude_Body_Hair/Textures/bb/bb_skinf_*.dds', {
        eager: true, query: '?url', import: 'default',
      }),
    })
  : Object.freeze({ underwear: {}, nude: {}, bodyHair: {} });
const dmraFemaleBodyModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Seamless DMRA body replacer/Meshes/bb/bb_skinf_*.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
// Behind the same gate as the asset URLs above: a static `?url` import is Vite's alone, and under node it refuses
// the whole module graph (every test that imports the arm) for a file only the browser fetches.
const betterBodiesFemaleUvEditsUrl = IN_BROWSER
  ? Object.values(import.meta.glob('../../../bb_skinf_no-uv-edits.json', {
      eager: true, query: '?url', import: 'default',
    }))[0] ?? null
  : null;

const RACE_CODES = Object.freeze({
  breton: 'br', darkelf: 'de', highelf: 'he', imperial: 'im',
  nord: 'no', orc: 'or', redguard: 'rg', woodelf: 'we',
});
const compactRaceName = (race) => String(
  race && typeof race === 'object' ? (race.name ?? race.race ?? race.id ?? '') : (race ?? ''),
).toLowerCase().replace(/[^a-z]/g, '');

// BETTER-HANDS: the whole body - its wrist, forearm and upper arm are the first-person arm (its .1st carries hands alone)
const robertBodyModelUrls = IN_BROWSER
  ? import.meta.glob("../../../Mods/Bodies/Robert's bodies/Data Files/Meshes/bbr/*.nif", {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const robertBodyTextureUrls = IN_BROWSER
  ? import.meta.glob("../../../Mods/Bodies/Robert's bodies/Data Files/Textures/bbr/*.dds", {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const betterHandsModelUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Hands/Meshes/b/*.1st.nif', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const betterHandsTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Hands/Textures/bbr/*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const ROBERT_RACE_NAMES = Object.freeze({
  breton: 'breton', darkelf: 'dark elf', highelf: 'high elf', imperial: 'Imperial',
  nord: 'Nord', orc: 'Orc', redguard: 'Redguard', woodelf: 'Wood Elf',
});

/** Pure source paths for the first-person Robert Bodies + Better Hands pair. */
export function robertBodiesFirstPersonAssetPaths({ race = 'Nord', female = false } = {}) {
  const raceName = compactRaceName(race);
  const raceKey = RACE_CODES[raceName] ?? (Object.values(RACE_CODES).includes(raceName) ? raceName : null);
  const label = ROBERT_RACE_NAMES[raceName];
  if (!raceKey || !label) return null;
  const genderKey = female ? 'f' : 'm';
  const handName = raceName === 'breton' && !female
    ? 'b_n_breton_m_hand.1st.nif'
    : `b_n_${label}_${genderKey}_hands.1st.nif`;
  return Object.freeze({
    raceKey,
    genderKey,
    bodyModelPath: `Robert's bodies/Data Files/Meshes/bbr/${raceKey}_${genderKey}.nif`,   // BETTER-HANDS: the arm's, the whole body's mesh
    bodyTexturePath: `Robert's bodies/Data Files/Textures/bbr/${raceKey}_${genderKey}.dds`,
    handModelPath: `Better Hands/Meshes/b/${handName}`,
    handTexturePath: `Better Hands/Textures/bbr/${raceKey}_${genderKey}.dds`,
    texturePath: `textures/bbr/${raceKey}_${genderKey}.dds`,
  });
}

/**
 * Resolve bundled first-person arm/hand assets without changing the active
 * third-person body provider. The hand texture gets a private path at runtime
 * because Better Hands and Robert's Bodies ship the same texture basename.
 */
export function robertBodiesFirstPersonAssetUrls(options = {}) {
  const paths = robertBodiesFirstPersonAssetPaths(options);
  if (!paths) return null;
  const findUrl = (table, suffix) => Object.entries(table)
    .find(([path]) => path.toLowerCase().endsWith('/' + suffix.toLowerCase()))?.[1] ?? null;
  const bodyModel = findUrl(robertBodyModelUrls, paths.bodyModelPath);
  const bodyTexture = findUrl(robertBodyTextureUrls, paths.bodyTexturePath);
  const handModel = findUrl(betterHandsModelUrls, paths.handModelPath);
  const handTexture = findUrl(betterHandsTextureUrls, paths.handTexturePath);
  if (!bodyModel || !bodyTexture || !handModel || !handTexture) return null;
  return Object.freeze({
    ...paths, bodyModel, bodyTexture, handModel, handTexture,
    bodyTexturePath: paths.texturePath,
  });
}

/** Resolve a Better Bodies mesh and matching skin for the actor's race and sex.
 * Both female and male actors use their race-specific mesh and texture when the
 * corresponding Better Bodies asset exists. Underwear and nude variants use the
 * same race selection in their respective asset folders. */
export function betterBodiesAssetUrls({ race = 'Nord', female = false, underwear = getUnderwearEnabled(), bodyHair = getBodyHairEnabled() } = {}) {
  const raceName = compactRaceName(race);
  const raceKey = RACE_CODES[raceName] ?? (Object.values(RACE_CODES).includes(raceName) ? raceName : null);
  if (!raceKey) return null;
  const genderKey = female ? 'f' : 'm';
  const geometryRaceKey = raceKey;
  const modelStem = `bb_skin${genderKey}_${geometryRaceKey}`;
  const sourceTextureStem = `bb_skin${genderKey}_${raceKey}`;
  const textureRaceKey = raceKey;
  const textureStem = `bb_skin${genderKey}_${textureRaceKey}`;
  const handPaths = betterBodiesFirstPersonHandAssetPaths({ race, female, underwear });
  const handModelStem = `bb_hand${genderKey}_${geometryRaceKey}`;
  const handTextureStem = `bb_hand${genderKey}_${textureRaceKey}`;
  const modelTable = underwear ? underwearBodyModelUrls : nudeBodyModelUrls;
  const textureTable = underwear ? underwearBodyTextureUrls : nudeBodyTextureUrls;
  const findUrl = (table, stem, extension) => {
    const entry = Object.entries(table).find(([path]) => path.toLowerCase().endsWith(`/${stem}.${extension}`));
    return entry?.[1] ?? null;
  };
  // Seamless DMRA is a female-only geometry alternative. It keeps the selected
  // Better Bodies skin/underwear texture, but only its own female mesh is used.
  const dmraEnabled = female && modSetting('morrowind-textures', 'SeamlessDMRASource') === 2;
  const dmraModel = dmraEnabled ? findUrl(dmraFemaleBodyModelUrls, modelStem, 'nif') : null;
  // HD-BODY: the pack's own mesh with its own skin, both or neither (DMRA's geometry wins where both are chosen)
  const highResolution = female && !dmraModel && modSetting('morrowind-textures', 'HighResolutionBetterBodyFemaleTexturesSource') === 2;
  const highResolutionTextureTable = underwear ? highResolutionFemaleBodyTextureUrls.underwear
    : bodyHair ? highResolutionFemaleBodyTextureUrls.bodyHair : highResolutionFemaleBodyTextureUrls.nude;
  const highResolutionModel = highResolution ? findUrl(highResolutionFemaleBodyModelUrls, modelStem, 'nif') : null;
  const highResolutionTexture = highResolutionModel ? findUrl(highResolutionTextureTable, sourceTextureStem, 'dds') : null;
  const hd = !!(highResolutionModel && highResolutionTexture);
  const model = dmraModel ?? (hd ? highResolutionModel : findUrl(modelTable, modelStem, 'nif'));
  const texture = hd ? highResolutionTexture : findUrl(textureTable, sourceTextureStem, 'dds');
  const variant = hd ? (underwear ? 'hd-underwear' : bodyHair ? 'hd-body-hair' : 'hd-nude') : underwear ? 'underwear' : 'nude';
  const handModelTable = underwear ? underwearHandModelUrls : nudeHandModelUrls;
  const handTextureTable = underwear ? underwearHandTextureUrls : nudeHandTextureUrls;
  const handModel = findUrl(handModelTable, handModelStem, 'nif');
  let handTexture = findUrl(handTextureTable, handTextureStem, 'dds');
  let handTextureSourcePath = handPaths.texturePath;
  // The high-resolution female pack has its own race-matched hand DDS files.
  // Keep the runtime texture key stable while using the same skin source as the
  // selected female body when that pack is enabled.
  if (female && modSetting('morrowind-textures', 'HighResolutionBetterBodyFemaleTextures') === true) {
    const highResolutionHandPath = betterBodiesHighResolutionFemaleHandTexturePath({ race });
    const highResolutionHandBasename = highResolutionHandPath?.split('/').pop()?.toLowerCase();
    const highResolutionHandTexture = highResolutionHandBasename
      ? Object.entries(highResolutionFemaleHandTextureUrls)
        .find(([path]) => path.toLowerCase().endsWith('/' + highResolutionHandBasename))?.[1] ?? null
      : null;
    if (highResolutionHandTexture) {
      handTexture = highResolutionHandTexture;
      handTextureSourcePath = highResolutionHandPath;
    }
  }
  if (!model || !texture) return null;
  // NUDITY-SYNC: the skin's runtime name is the VARIANT's own (betterBodiesTextureStem) - every variant ships one name,
  // bb_skin<sex>_<race>, and an archive ahead of the registered skin (the bundled mods, a player's loose files) answered
  // that name with ITS texture: the nude mesh came up in the underwear skin. The NIF is rewritten to the same name.
  const runtimeTextureStem = betterBodiesTextureStem({ genderKey, raceKey: textureRaceKey, variant });
  return Object.freeze({
    model, texture, texturePath: `textures/bb/${runtimeTextureStem}.dds`, sourceTextureStem: textureStem, runtimeTextureStem, variant,
    handModel, handTexture, handTexturePath: handPaths.runtimeTexturePath,
    handModelPath: handPaths.modelPath, handTextureSourcePath,
    raceKey, textureRaceKey, geometryRaceKey, female: !!female, underwear: !!underwear, bodyVariant: dmraModel ? 'Seamless DMRA' : hd ? 'High Resolution' : 'Better Bodies',
  });
}

// BEASTS (Gleb, 2026-10-27: "the beasts are the weakest place now"): Better Bodies 3.2 "Better Beasts" - a whole
// seamless body for the Argonian and the Khajiit, the human bodies' own shapes (Tri Chest, Tri Groin, the legs, the
// arms) with a tail and the beast's feet, skinned to retail's beast skeleton (base_animkna). Underwear is the pack's
// smoothed mesh, nude its anatomical one; the scales and fur carry no painted underwear. Its skins name retail's own
// files (TX_B_N_Argonian_F_F...), so they are given names of their own at load (fpArm) and no archive answers them.
const beastBodyModelUrls = IN_BROWSER
  ? Object.freeze({
      underwear: import.meta.glob('../../../Mods/Bodies/Better Bodies 3.2 Beasts/Underwear/Meshes/bb/*.nif', {
        eager: true, query: '?url', import: 'default',
      }),
      nude: import.meta.glob('../../../Mods/Bodies/Better Bodies 3.2 Beasts/Nude/Meshes/bb/*.nif', {
        eager: true, query: '?url', import: 'default',
      }),
    })
  : Object.freeze({ underwear: {}, nude: {} });
const beastBodyTextureUrls = IN_BROWSER
  ? import.meta.glob('../../../Mods/Bodies/Better Bodies 3.2 Beasts/Textures/*.dds', {
      eager: true, query: '?url', import: 'default',
    })
  : {};
const BEAST_RACES = Object.freeze({ argonian: 'argonian', khajiit: 'khajiit' });

/** Pure: the beast body's file names for a race and sex - the mesh, and the stem every skin it wears begins with. */
export function betterBeastsAssetPaths({ race = 'Argonian', female = false, underwear = true } = {}) {
  const raceKey = BEAST_RACES[compactRaceName(race)];
  if (!raceKey) return null;
  const sex = female ? 'f' : 'm';
  return Object.freeze({
    raceKey, female: !!female, underwear: !!underwear,
    model: `Mods/Bodies/Better Bodies 3.2 Beasts/${underwear ? 'Underwear' : 'Nude'}/Meshes/bb/bb_n_${raceKey}_${sex}_skins.nif`,
    // q_argonian_f_skins / q_argonian_f_hands, tx_b_n_argonian_f_f (feet) / _t (tail) / the khajiit's hand pieces
    texturePattern: new RegExp(`^(?:q|tx_b_n)_${raceKey}_${sex}_[a-z]+\.dds$`),
  });
}

/** The beast body's URLs: its mesh, and every skin of its race and sex by file name (lower case, as the NIF's are compared). */
export function betterBeastsAssetUrls({ race = 'Argonian', female = false, underwear = getUnderwearEnabled() } = {}) {
  const paths = betterBeastsAssetPaths({ race, female, underwear });
  if (!paths) return null;
  const meshName = paths.model.split('/').pop();
  const model = Object.entries(beastBodyModelUrls[underwear ? 'underwear' : 'nude'])
    .find(([path]) => path.toLowerCase().endsWith('/' + meshName))?.[1] ?? null;
  const textures = Object.entries(beastBodyTextureUrls)
    .map(([path, url]) => [path.split('/').pop().toLowerCase(), url])
    .filter(([name]) => paths.texturePattern.test(name))
    .map(([name, url]) => Object.freeze({ name, url }));
  if (!model || !textures.length) return null;
  return Object.freeze({ ...paths, model, textures, bodyVariant: 'Better Beasts' });
}

// The standalone HTML diagnostic intentionally stays fully nude, independent
// of the game's saved underwear preference.
export const betterBodiesFemaleAssetUrls = betterBodiesAssetUrls({ race: 'Nord', female: true, underwear: false });
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
  if (!betterBodiesFemaleUvEditsUrl) throw new Error('Better Bodies UV edits are only bundled for the browser build.');
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
