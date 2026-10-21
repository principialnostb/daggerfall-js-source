// Bundled Morrowind replacement assets for packs under Mods/Textures and
// Mods/Bodies. Archive keys match the game-relative paths stored in NIF files.
//
// Priority inside this archive (later packages win exact-path collisions):
//   Better Bodies Nude textures (required fallback for the existing BB body)
//   Intelligent Textures 00 Core (base game texture refresh; no atlas files)
//   Vurt's Better Clothes Retexture (broad fallback override)
//   Better Clothes Retextured (targeted non-pants texture overrides only)
//   Better Morrowind Armor (base Data Files + Complete Armor Joints patch)
//   Westly's Fine Clothiers of Tamriel (clothing meshes/textures + plugin)
//   Westly's Faces Refurbished (head/hair meshes and textures)
//
// High Resolution Better Body Female Textures is included as a texture-only
// layer; its alternate NIFs never replace the project's corrected UV geometry.

import { makeVendoredArchive } from './urlArchive.js';
import { modSetting } from './modSettings.js';
import { getBodyHairEnabled, getUnderwearEnabled } from '../characters/bodyMorphs.js';
import { modDiagnostics } from './modDiagnostics.js';

const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob([
      '../../Mods/Bodies/Better Bodies/Nude/Data Files/Textures/**/*.{dds,DDS,tga,TGA}',
      '../../Mods/Bodies/High Resolution Better Body Female Textures/Hands/Textures/**/*.{dds,DDS,tga,TGA}',
      '../../Mods/Bodies/High Resolution Better Body Female Textures/Nude_No_Hair/Textures/**/*.{dds,DDS,tga,TGA}',
      '../../Mods/Bodies/High Resolution Better Body Female Textures/Underwear/Textures/**/*.{dds,DDS,tga,TGA}',
      '../../Mods/Bodies/High Resolution Better Body Female Textures/Nude_Body_Hair/Textures/**/*.{dds,DDS,tga,TGA}',
      '../../Mods/Bodies/Seamless DMRA body replacer/Meshes/**/*.{nif,NIF}',
      '../../Mods/Bodies/Seamless DMRA body replacer/Textures/**/*.{dds,DDS,tga,TGA}',
      '../../Mods/Textures/Intelligent Textures/00 Core/textures/**/*.{dds,DDS,tga,TGA}',
      "../../Mods/Textures/Vurt's Better Clothes Retexture/textures/**/*.{dds,DDS,tga,TGA}",
      '../../Mods/Textures/Better Clothes Retextured/textures/**/*.{dds,DDS,tga,TGA}',
      '../../Mods/Textures/Better Clothes Retextured/meshes/**/*.{nif,NIF}',
      "../../Mods/Textures/Westly's Fine Clothiers of Tamriel/Meshes/**/*.{nif,NIF}",
      "../../Mods/Textures/Westly's Fine Clothiers of Tamriel/Textures/**/*.{dds,DDS,tga,TGA}",
      "../../Mods/Textures/Westly's Fine Clothiers of Tamriel/Westly_Presents_FCOT.esp",
      "../../Mods/Textures/Westly's Faces Refurbished/Data Files/**/*.{nif,NIF,dds,DDS,tga,TGA}",
      '../../Mods/Textures/Better Morrowind Armor/Data Files/**/*.{nif,NIF,dds,DDS,tga,TGA,esp,ESP}',
      '../../Mods/Textures/Better Morrowind Armor/Complete Armor Joints/Data Files/**/*.{nif,NIF,dds,DDS,tga,TGA,esp,ESP}',
    ], {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const norm = (s) => String(s).replace(/\\/g, '/').toLowerCase();
const assetUrls = Object.create(null);
const baseBodyTextureUrls = Object.create(null);
const highResolutionFemaleUnderwearUrls = Object.create(null);
const highResolutionFemaleNoHairUrls = Object.create(null);
const highResolutionFemaleBodyHairUrls = Object.create(null);
const highResolutionFemaleHandUrls = Object.create(null);
const intelligentTextureUrls = Object.create(null);
const vurtClothesTextureUrls = Object.create(null);
const betterClothesTextureUrls = Object.create(null);
const betterClothesMeshUrls = Object.create(null);
const clothierAssetUrls = Object.create(null);
const armorTextureUrls = Object.create(null);
const armorJointsUrls = Object.create(null);
const faceTextureUrls = Object.create(null);
const dmraAssetUrls = Object.create(null);
const packageCounts = Object.create(null);
const pluginUrls = new Map();

const addAsset = (bucket, key, url, packageName) => {
  bucket[norm(key)] = url;
  packageCounts[packageName] = (packageCounts[packageName] ?? 0) + 1;
};
const relAfter = (path, lower, marker) => {
  const at = lower.indexOf(marker);
  return at < 0 ? null : path.slice(at + marker.length);
};
const addDataFilesAsset = (rel, url, packageName, bucket) => {
  const match = rel.match(/^data files\/(meshes|textures|icons)\/(.+\.(?:nif|dds|tga))$/i);
  if (!match) return false;
  const root = match[1].toLowerCase();
  addAsset(bucket, root + '/' + match[2], url, packageName);
  return true;
};

const packEnabled = Object.freeze({
  betterBodies: modSetting('morrowind-textures', 'BetterBodies') !== false || modSetting('morrowind-textures', 'SeamlessDMRA') === true, // DMRA uses the BB base skin.
  highResolutionFemaleTextures: modSetting('morrowind-textures', 'HighResolutionBetterBodyFemaleTextures') !== false,
  dmra: modSetting('morrowind-textures', 'SeamlessDMRA') === true,
  intelligentTextures: !!modSetting('morrowind-textures', 'IntelligentTextures'),
  vurtClothes: !!modSetting('morrowind-textures', 'VurtsBetterClothes'),
  betterClothes: !!modSetting('morrowind-textures', 'BetterClothesRetextured'),
  betterArmor: !!modSetting('morrowind-textures', 'BetterMorrowindArmor'),
  armorJoints: !!modSetting('morrowind-textures', 'CompleteArmorJoints'),
  clothiers: !!modSetting('morrowind-textures', 'WestlysFineClothiers'),
  faces: !!modSetting('morrowind-textures', 'WestlysFacesRefurbished'),
});

for (const [source, url] of Object.entries(FILES)) {
  const path = source.replace(/\\/g, '/');
  const lower = path.toLowerCase();

  const dmraRel = relAfter(path, lower, '/seamless dmra body replacer/');
  if (dmraRel) {
    if (!packEnabled.dmra) continue;
    const match = dmraRel.match(/^(meshes|textures)\/(.+\.(?:nif|dds|tga))$/i);
    if (match) addAsset(dmraAssetUrls, match[1].toLowerCase() + '/' + match[2], url, 'Seamless DMRA body replacer');
    continue;
  }

  // Base Better Bodies skin textures are retained as a fallback only. This
  // keeps the existing BB body functional without activating the failed
  // high-resolution female texture replacer.
  const bbRel = relAfter(path, lower, '/better bodies/');
  if (bbRel && /^nude\/data files\/textures\//i.test(bbRel)) {
    if (!packEnabled.betterBodies) continue;
    const rel = bbRel.replace(/^nude\/data files\//i, '');
    const match = rel.match(/^textures\/(.+\.(?:dds|tga))$/i);
    if (match) addAsset(baseBodyTextureUrls, 'textures/' + match[1], url, 'Better Bodies fallback');
    continue;
  }

  // High Resolution Better Body Female Textures: use the no-hair body skin
  // set and the matching high-resolution hand textures. These replace only
  // texture keys, never the project's corrected Better Bodies NIF/UV geometry.
  // This avoids the old failure mode where a pack's NIF silently overwrote
  // bb_skinf_no.nif and invalidated the user-corrected UV coordinates.
  const highResRel = relAfter(path, lower, '/high resolution better body female textures/');
  if (highResRel) {
    if (!packEnabled.highResolutionFemaleTextures || !packEnabled.betterBodies) continue;
    const match = highResRel.match(/^(hands\/textures|nude_no_hair\/textures|underwear\/textures|nude_body_hair\/textures)\/(bb\/.+\.(?:dds|tga))$/i);
    if (match) {
      const variant = match[1].toLowerCase();
      const bucket = variant === 'hands/textures' ? highResolutionFemaleHandUrls
        : variant === 'underwear/textures' ? highResolutionFemaleUnderwearUrls
          : variant === 'nude_body_hair/textures' ? highResolutionFemaleBodyHairUrls
            : highResolutionFemaleNoHairUrls;
      addAsset(bucket, 'textures/' + match[2], url, 'High Resolution Better Body Female Textures');
    }
    continue;
  }

  // Intelligent Textures: only the standard 00 Core texture set is safe as
  // a direct replacer. 01 Atlas Textures requires matching atlas meshes and is
  // intentionally excluded to prevent UV/atlas mismatches.
  const itRel = relAfter(path, lower, '/intelligent textures/');
  if (itRel) {
    if (!packEnabled.intelligentTextures) continue;
    const match = itRel.match(/^00 core\/textures\/(.+\.(?:dds|tga))$/i);
    if (match) addAsset(intelligentTextureUrls, 'textures/' + match[1], url, 'Intelligent Textures 00 Core');
    continue;
  }

  // Vurt's broad texture pack is a fallback for matching game texture paths.
  // Better Clothes Retextured is applied after it for its own exact paths,
  // but only non-pants textures are included: pants stay on the existing
  // texture selection as the visual control. Its NIFs may change UVs and
  // are not allowed to silently replace current body/equipment geometry.
  const betterClothesRel = relAfter(path, lower, '/better clothes retextured/');
  if (betterClothesRel) {
    if (!packEnabled.betterClothes) continue;
    const meshMatch = betterClothesRel.match(/^meshes\/(.+\.nif)$/i);
    const textureMatch = betterClothesRel.match(/^textures\/(.+\.(?:dds|tga))$/i);
    if (meshMatch) {
      addAsset(betterClothesMeshUrls, 'meshes/' + meshMatch[1], url, 'Better Clothes Retextured meshes');
    } else if (textureMatch && !/(?:pant|trouser)/i.test(textureMatch[1])) {
      addAsset(betterClothesTextureUrls, 'textures/' + textureMatch[1], url, 'Better Clothes Retextured (non-pants textures only)');
    }
    continue;
  }

  // Vurt's pack is a loose texture override: its paths are relative to the
  // game's Textures directory. Better Clothes Retextured, when it supplies
  // the same exact path, takes precedence in the next layer.
  const vurtRel = relAfter(path, lower, "/vurt's better clothes retexture/");
  if (vurtRel) {
    if (!packEnabled.vurtClothes) continue;
    const match = vurtRel.match(/^textures\/(.+\.(?:dds|tga))$/i);
    if (match) addAsset(vurtClothesTextureUrls, 'textures/' + match[1], url, "Vurt's Better Clothes Retexture");
    continue;
  }

  // Westly's Fine Clothiers ships meshes/textures directly under its own
  // Meshes/Textures roots, plus an ESP that defines its added clothing.
  const clothierRel = relAfter(path, lower, "/westly's fine clothiers of tamriel/");
  if (clothierRel) {
    if (!packEnabled.clothiers) continue;
    const match = clothierRel.match(/^(meshes|textures)\/(.+\.(?:nif|dds|tga))$/i);
    if (match) addAsset(clothierAssetUrls, match[1] + '/' + match[2], url, "Westly's Fine Clothiers of Tamriel");
    if (/^westly_presents_fcot\.esp$/i.test(clothierRel)) {
      const base = clothierRel;
      const key = 'bundled:' + base;
      pluginUrls.set(norm(key), { key, url, base: base.toLowerCase() });
    }
    continue;
  }

  // Better Morrowind Armor has several mutually exclusive compatibility
  // patches. Load the main Data Files and the explicitly compatible Complete
  // Armor Joints add-on only; never merge Chaos Heart, LeFemm, Snow Prince,
  // no-Tribunal, HiRez Armor, or DeFemm alternatives automatically.
  const armorRel = relAfter(path, lower, '/better morrowind armor/');
  if (armorRel) {
    const isJointsPack = /^complete armor joints\/data files\//i.test(armorRel);
    if (isJointsPack ? (!packEnabled.betterArmor || !packEnabled.armorJoints) : !packEnabled.betterArmor) continue;
    let rel = armorRel;
    let packageName = 'Better Morrowind Armor';
    let bucket = armorTextureUrls;
    if (/^complete armor joints\/data files\//i.test(rel)) {
      rel = rel.replace(/^complete armor joints\//i, '');
      packageName = 'Complete Armor Joints';
      bucket = armorJointsUrls;
    } else if (!/^data files\//i.test(rel)) {
      continue;
    }
    if (addDataFilesAsset(rel, url, packageName, bucket)) continue;

    // The main plugin is exposed to the existing bundled-plugin reader.
    // Optional DeFemm and compatibility ESPs are intentionally not loaded.
    if ((packageName === 'Better Morrowind Armor'
        && /^data files\/better morrowind armor\.esp$/i.test(rel))
      || (packageName === 'Complete Armor Joints'
        && /^data files\/complete armor joints\.esp$/i.test(rel))) {
      const base = rel.slice('data files/'.length);
      const key = 'bundled:' + base;
      pluginUrls.set(norm(key), { key, url, base: base.toLowerCase() });
    }
    continue;
  }

  // Westly's Faces Refurbished: race head/hair meshes and their textures.
  const facesRel = relAfter(path, lower, "/westly's faces refurbished/");
  if (facesRel) {
    if (!packEnabled.faces) continue;
    const rel = facesRel.replace(/^data files\//i, '');
    const match = rel.match(/^(meshes|textures)\/(.+\.(?:nif|dds|tga))$/i);
    if (match) addAsset(faceTextureUrls, match[1] + '/' + match[2], url, "Westly's Faces Refurbished");
  }
}


// Apply package precedence explicitly, independent of glob enumeration order.
// BMA and its joint patch outrank generic texture replacements where UVs differ;
// Westly's head/hair assets win last for their own model and texture keys.
Object.assign(
  assetUrls,
  baseBodyTextureUrls,
  dmraAssetUrls,
  intelligentTextureUrls,
  vurtClothesTextureUrls,
  betterClothesTextureUrls,
  betterClothesMeshUrls,
  armorTextureUrls,
  armorJointsUrls,
  clothierAssetUrls,
  faceTextureUrls,
);

// High-resolution body textures are selected lazily. Underwear/body-hair are
// editor preferences and may change while the game is running; a fixed URL map
// here would keep serving the first texture until a page reload. The archive
// resolves the correct variant when each key is loaded, and its cache is
// recreated when the preference signature changes.
const highResolutionKeys = new Set([
  ...Object.keys(highResolutionFemaleUnderwearUrls),
  ...Object.keys(highResolutionFemaleNoHairUrls),
  ...Object.keys(highResolutionFemaleBodyHairUrls),
  ...Object.keys(highResolutionFemaleHandUrls),
]);
for (const key of highResolutionKeys) {
  assetUrls[key] = () => {
    if (highResolutionFemaleHandUrls[key]) return highResolutionFemaleHandUrls[key];
    if (getUnderwearEnabled()) {
      return highResolutionFemaleUnderwearUrls[key]
        ?? highResolutionFemaleNoHairUrls[key]
        ?? highResolutionFemaleBodyHairUrls[key]
        ?? baseBodyTextureUrls[key];
    }
    if (getBodyHairEnabled()) {
      return highResolutionFemaleBodyHairUrls[key]
        ?? highResolutionFemaleNoHairUrls[key]
        ?? baseBodyTextureUrls[key];
    }
    return highResolutionFemaleNoHairUrls[key]
      ?? highResolutionFemaleBodyHairUrls[key]
      ?? baseBodyTextureUrls[key];
  };
}


const sourcePathByUrl = new Map(Object.entries(FILES).map(([sourcePath, url]) => [url, sourcePath.replace(/\\/g, '/') ]));
const sourceModOf = (url) => {
  const sourcePath = sourcePathByUrl.get(url) ?? String(url ?? '');
  const parts = sourcePath.split('/');
  const folderIndex = parts.findIndex((part) => /^(Bodies|Textures)$/i.test(part));
  return folderIndex >= 0 ? parts[folderIndex + 1] : 'bundled-morrowind-assets';
};
const fetchBytes = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Bundled Morrowind asset returned ' + response.status + ': ' + url);
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    modDiagnostics.record({ level: 'error', phase: 'asset-fetch', action: 'asset-fetch-failed', modId: sourceModOf(url), resource: sourcePathByUrl.get(url) ?? url,
      message: String(error?.message ?? error), details: { url: String(url ?? '').slice(0, 500) } });
    throw error;
  }
};

let _archive = null;
let _archiveSignature = '';

export function bundledMorrowindModsArchive() {
  const signature = [
    getUnderwearEnabled() ? 'underwear' : 'nude',
    getBodyHairEnabled() ? 'body-hair' : 'no-body-hair',
    ...Object.entries(packEnabled).map(([name, enabled]) => name + ':' + (enabled ? '1' : '0')),
  ].join('|');
  if (!_archive || signature !== _archiveSignature) {
    _archive = makeVendoredArchive(assetUrls, fetchBytes);
    _archiveSignature = signature;
    modDiagnostics.record({ level: 'info', phase: 'asset-selection', action: 'morrowind-asset-archive-selected', modId: 'bundled-morrowind-assets', resource: 'Mods/Bodies+Textures',
      details: { signature, sourceFiles: Object.keys(FILES).length, selectedAssetKeys: Object.keys(assetUrls).length, packageCounts, activeOptionalPacks: Object.entries(packEnabled).filter(([name, enabled]) => name !== 'betterBodies' && enabled).map(([name]) => name), underwear: getUnderwearEnabled(), bodyHair: getBodyHairEnabled() } });
  }
  return _archive;
}

export function bundledMorrowindPluginNames() {
  const rank = ({ base }) => {
    const name = base.toLowerCase();
    if (name === 'better morrowind armor.esp') return 0;
    if (name === 'complete armor joints.esp') return 1;
    if (name === 'westly_presents_fcot.esp') return 2;
    return 3;
  };
  return [...pluginUrls.values()]
    .sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key))
    .map((entry) => entry.key);
}

export async function loadBundledMorrowindPlugin(name) {
  const entry = pluginUrls.get(norm(name));
  return entry ? fetchBytes(entry.url) : null;
}

// Browser-console report for validating the new pack selection and real file
// fetches. This checks archive selection, not final GPU/material appearance.
export async function inspectBundledMorrowindTextures() {
  const archive = bundledMorrowindModsArchive();
  const candidates = [
    'textures/bb/bb_skinf_de.dds',
    'textures/bb/bb_handf_de.dds',
    'textures/bb/bb_handf_de.dds',
    'textures/tx_a_steel_cuirass01.dds',
    'textures/tx_c_c_shirtcom01.dds',
    'meshes/brz/war_brnzh_robe1f.nif',
    'textures/wfr/bv/wfr_f01.dds',
  ];
  const checks = await Promise.all(candidates.map(async (key) => {
    const entry = assetUrls[norm(key)] ?? null;
    const url = typeof entry === 'function' ? await entry() : entry;
    const row = {
      key,
      inArchive: archive.has(key),
      alreadyLoaded: archive.loaded(key),
      url,
      fetch: 'not-found',
      bytes: null,
      width: null,
      height: null,
      error: null,
    };
    if (!url) return row;
    try {
      const response = await fetch(url);
      row.fetch = response.status;
      if (!response.ok) return row;
      const bytes = new Uint8Array(await response.arrayBuffer());
      row.bytes = bytes.byteLength;
      if (bytes.byteLength >= 20 && bytes[0] === 0x44 && bytes[1] === 0x44
        && bytes[2] === 0x53 && bytes[3] === 0x20) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        row.height = view.getUint32(12, true);
        row.width = view.getUint32(16, true);
      }
    } catch (error) {
      row.fetch = 'failed';
      row.error = String(error?.message ?? error);
    }
    return row;
  }));
  const report = {
    browser: IN_BROWSER,
    discoveredSourceFiles: Object.keys(FILES).length,
    selectedAssetKeys: Object.keys(assetUrls).length,
    selectedPackageAssetCounts: { ...packageCounts },
    activeOptionalPacks: Object.entries(packEnabled).filter(([name, enabled]) => name !== 'betterBodies' && enabled).map(([name]) => name),
    bundledPlugins: bundledMorrowindPluginNames(),
    representativeFetches: checks,
    note: 'High Resolution Better Body Female Textures supplies the selected underwear / body-hair / no-hair skin variant and matching hands. Its NIF meshes are intentionally not used so corrected UV geometry remains intact.',
  };
  for (const row of checks) {
    if (row.error || (row.fetch !== 'not-found' && row.fetch !== 200)) modDiagnostics.record({ level: 'error', phase: 'asset-fetch', action: 'representative-asset-check-failed', modId: sourceModOf(row.url), resource: row.key, message: row.error ?? 'Asset fetch returned a non-success status.', details: { fetch: row.fetch, bytes: row.bytes } });
  }
  modDiagnostics.record({ level: checks.some((row) => row.error || (row.fetch !== 'not-found' && row.fetch !== 200)) ? 'warn' : 'info', phase: 'asset-audit', action: 'morrowind-texture-inspection-complete', modId: 'bundled-morrowind-assets', resource: 'representative-fetches', details: { discoveredSourceFiles: report.discoveredSourceFiles, selectedAssetKeys: report.selectedAssetKeys, selectedPackageAssetCounts: report.selectedPackageAssetCounts, checks: checks.map(({ key, inArchive, alreadyLoaded, fetch, bytes, width, height, error }) => ({ key, inArchive, alreadyLoaded, fetch, bytes, width, height, error })) } });
  console.table(checks);
  console.log('[Bundled Morrowind texture packs]', report);
  return report;
}

if (IN_BROWSER) window.inspectBundledMorrowindTextures = inspectBundledMorrowindTextures;
