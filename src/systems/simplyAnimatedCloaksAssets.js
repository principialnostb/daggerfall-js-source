// CLOAKS1: Simply Animated Cloaks as a virtual Morrowind data-files archive.
// The feature toggle and worn-clothing resolver already select these model names. The missing
// integration was the asset mount: the mod's NIFs lived under Mods/Animations, outside every
// archive the character builder searched, so the equipped item could never bind to the rig.
// Keep the mod assets in place and expose only the eight supported player-cloak meshes plus
// their diffuse textures through the same { has, get, load, loaded } interface as a BSA.
import { makeVendoredArchive } from './urlArchive.js';
import { modDiagnostics } from './modDiagnostics.js';

const IN_BROWSER = typeof window !== 'undefined';

const MESH_FILES = IN_BROWSER
  ? import.meta.glob('../../Mods/Animations/Simply animated cloaks/meshes/Cloaks/common_cape_*_skins.nif', {
    eager: true, query: '?url', import: 'default',
  })
  : {};

// Keep only diffuse maps used by the supported common cloaks. Normal maps are not consumed by
// this renderer; including them would needlessly add dozens of megabytes to the production build.
const TEXTURE_FILES = IN_BROWSER
  ? import.meta.glob([
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_black.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_blue.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_bordo.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_brown.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_darker.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_green.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_greenblue.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_grey.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_greyblue.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_red.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_white.dds',
    '../../Mods/Animations/Simply animated cloaks/textures/common_linen_cloak_yellow.dds',
  ], { eager: true, query: '?url', import: 'default' })
  : {};

// ownClothingModels.js intentionally exposes stable, port-owned model names. Alias those names
// to the corresponding real NIFs in the bundled mod rather than pointing the resolver at a
// filename that does not exist in either the VFS or the source pack.
export const SIMPLY_CLOAK_MODEL_ALIASES = Object.freeze({
  'simply_cape_blue_skins.nif': 'common_cape_blue_skins.nif',
  'simply_cape_grey_skins.nif': 'common_cape_grey_skins.nif',
  'simply_cape_red_skins.nif': 'common_cape_red_skins.nif',
  'simply_cape_black_skins.nif': 'common_cape_black_skins.nif',
  'simply_cape_brwn_blue_skins.nif': 'common_cape_brwn_blue_skins.nif',
  'simply_cape_brown_skins.nif': 'common_cape_brown_skins.nif',
  'simply_cape_03_b_skins.nif': 'common_cape_03_b_skins.nif',
  'simply_cape_green_skins.nif': 'common_cape_green_skins.nif',
});

const basename = (path) => String(path).replace(/\\/g, '/').split('/').pop().toLowerCase();
const byMeshName = new Map(Object.entries(MESH_FILES).map(([path, url]) => [basename(path), url]));
const urls = {};
const resolvedModels = [];
const missingModels = [];
for (const [alias, source] of Object.entries(SIMPLY_CLOAK_MODEL_ALIASES)) {
  const url = byMeshName.get(source);
  if (url) {
    urls[`meshes/${alias}`] = url;
    resolvedModels.push(alias);
  } else {
    missingModels.push({ requested: alias, source });
  }
}
for (const [path, url] of Object.entries(TEXTURE_FILES)) {
  urls[`textures/${basename(path)}`] = url;
}

modDiagnostics.record({
  level: missingModels.length ? 'warn' : 'info',
  phase: 'discovery',
  action: 'simply-animated-cloak-assets-catalogued',
  modId: 'simply-animated-cloaks',
  resource: 'Mods/Animations/Simply animated cloaks',
  message: missingModels.length
    ? 'Some Simply Animated Cloaks meshes were not resolved; affected equipped cloaks will remain unavailable until the missing asset is restored.'
    : 'Simply Animated Cloaks meshes and diffuse textures were discovered.',
  details: {
    resolvedModels,
    missingModels,
    diffuseTextures: Object.keys(TEXTURE_FILES).map(basename),
    archiveEntries: Object.keys(urls).length,
    browser: IN_BROWSER,
  },
});

for (const resource of Object.keys(urls)) {
  modDiagnostics.record({
    level: 'info',
    phase: 'registration',
    action: 'register',
    domain: 'morrowind-vfs',
    modId: 'simply-animated-cloaks',
    resource,
    message: 'Mounted bundled Simply Animated Cloaks resource.',
    details: { kind: resource.endsWith('.nif') ? 'skinned-mesh' : 'diffuse-texture' },
  });
}

const resourceByUrl = new Map(Object.entries(urls).map(([resource, url]) => [url, resource]));
const fetchBytes = async (url) => {
  const resource = resourceByUrl.get(url) ?? 'unknown cloak asset';
  const phase = resource.endsWith('.nif') ? 'body' : 'texture';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    modDiagnostics.record({
      level: 'info', phase, action: 'asset-open', modId: 'simply-animated-cloaks', resource,
      message: 'Bundled cloak resource opened by the Morrowind VFS.',
      details: { bytes: bytes.byteLength },
    });
    return bytes;
  } catch (error) {
    modDiagnostics.record({
      level: 'error', phase, action: 'asset-open-failed', modId: 'simply-animated-cloaks', resource,
      message: String(error?.message ?? error).slice(0, 500),
    });
    throw error;
  }
};

let archive = null;
/** The cloaks are mounted after loose files and before BSAs, so user overrides still win. */
export function simplyAnimatedCloaksArchive() {
  return (archive ??= makeVendoredArchive(urls, fetchBytes));
}

/** Exported for regression tests and the animation diagnostics pane. */
export const SIMPLY_ANIMATED_CLOAK_ASSET_CATALOG = Object.freeze({
  models: Object.freeze([...resolvedModels]),
  missingModels: Object.freeze([...missingModels]),
  textures: Object.freeze(Object.keys(TEXTURE_FILES).map(basename)),
});
