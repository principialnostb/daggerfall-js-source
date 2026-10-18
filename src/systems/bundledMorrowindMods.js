// Bundled Morrowind replacement assets for the mod packs checked into
// Morrowind Textures. The archive keys match the paths stored in NIF files.
//
// Priority inside this archive (later packages win exact-path collisions):
//   Better Bodies Nude textures (required fallback for the existing BB body)
//   Intelligent Textures 00 Core (base game texture refresh; no atlas files)
//   Better Clothes Retextured (clothing textures and meshes)
//   Better Morrowind Armor (base Data Files + Complete Armor Joints patch)
//   Westly's Faces Refurbished (head/hair meshes and textures)
//
// The failed High Resolution Better Body Female Textures and old Better Heads
// packages are deliberately not discovered here. The active Better Bodies NIF
// and its user-corrected UV data are not replaced by this module.
import { makeVendoredArchive } from './urlArchive.js';

const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob('../../Morrowind Textures/**/*.{nif,NIF,dds,DDS,tga,TGA,esm,ESM,esp,ESP}', {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const norm = (s) => String(s).replace(/\\/g, '/').toLowerCase();
const assetUrls = Object.create(null);
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
const addDataFilesAsset = (rel, url, packageName, allowMeshes = true) => {
  const match = rel.match(/^data files\\/(meshes|textures)\\/(.+\\.(?:nif|dds|tga))$/i);
  if (!match) return false;
  const root = match[1].toLowerCase();
  if (root === 'meshes' && !allowMeshes) return false;
  addAsset(assetUrls, root + '/' + match[2], url, packageName);
  return true;
};

for (const [source, url] of Object.entries(FILES)) {
  const path = source.replace(/\\/g, '/');
  const lower = path.toLowerCase();

  // Base Better Bodies skin textures are retained as a fallback only. This
  // keeps the existing BB body functional without activating the failed
  // high-resolution female texture replacer.
  const bbRel = relAfter(path, lower, '/better bodies/');
  if (bbRel && /^nude\\/data files\\/textures\\//i.test(bbRel)) {
    const rel = bbRel.replace(/^nude\\/data files\\//i, '');
    const match = rel.match(/^textures\\/(.+\\.(?:dds|tga))$/i);
    if (match) addAsset(assetUrls, 'textures/' + match[1], url, 'Better Bodies fallback');
    continue;
  }

  // Intelligent Textures: only the standard 00 Core texture set is safe as
  // a direct replacer. 01 Atlas Textures requires matching atlas meshes and is
  // intentionally excluded to prevent UV/atlas mismatches.
  const itRel = relAfter(path, lower, '/intelligent textures/');
  if (itRel) {
    const match = itRel.match(/^00 core\\/textures\\/(.+\\.(?:dds|tga))$/i);
    if (match) addAsset(assetUrls, 'textures/' + match[1], url, 'Intelligent Textures 00 Core');
    continue;
  }

  // Better Clothes Retextured ships paths relative to Data Files already.
  const clothesRel = relAfter(path, lower, '/better clothes retextured/');
  if (clothesRel) {
    const match = clothesRel.match(/^(meshes|textures)\\/(.+\\.(?:nif|dds|tga))$/i);
    if (match) addAsset(assetUrls, match[1] + '/' + match[2], url, 'Better Clothes Retextured');
    continue;
  }

  // Better Morrowind Armor has several mutually exclusive compatibility
  // patches. Load the main Data Files and the explicitly compatible Complete
  // Armor Joints add-on only; never merge Chaos Heart, LeFemm, Snow Prince,
  // no-Tribunal, HiRez Armor, or DeFemm alternatives automatically.
  const armorRel = relAfter(path, lower, '/better morrowind armor/');
  if (armorRel) {
    let rel = armorRel;
    let packageName = 'Better Morrowind Armor';
    if (/^complete armor joints\\/data files\\//i.test(rel)) {
      rel = rel.replace(/^complete armor joints\\//i, '');
      packageName = 'Complete Armor Joints';
    } else if (!/^data files\\//i.test(rel)) {
      continue;
    }
    if (addDataFilesAsset(rel, url, packageName)) continue;

    // The main plugin is exposed to the existing bundled-plugin reader.
    // Optional DeFemm and compatibility ESPs are intentionally not loaded.
    if (packageName === 'Better Morrowind Armor'
      && /^data files\\/better morrowind armor\\.esp$/i.test(rel)) {
      const key = 'bundled:' + rel.slice('data files/'.length);
      pluginUrls.set(norm(key), { key, url, base: 'better morrowind armor.esp' });
    }
    continue;
  }

  // Westly's Faces Refurbished: race head/hair meshes and their textures.
  const facesRel = relAfter(path, lower, "/westly's faces refurbished/");
  if (facesRel) {
    const rel = facesRel.replace(/^data files\\//i, '');
    const match = rel.match(/^(meshes|textures)\\/(.+\\.(?:nif|dds|tga))$/i);
    if (match) addAsset(assetUrls, match[1] + '/' + match[2], url, "Westly's Faces Refurbished");
  }
}

const fetchBytes = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Bundled Morrowind asset returned ' + response.status + ': ' + url);
  return new Uint8Array(await response.arrayBuffer());
};

let _archive = null;

export function bundledMorrowindModsArchive() {
  return (_archive ??= makeVendoredArchive(assetUrls, fetchBytes));
}

export function bundledMorrowindPluginNames() {
  return [...pluginUrls.values()].map((entry) => entry.key);
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
    'textures/tx_a_steel_cuirass01.dds',
    'textures/bc/bc_common_shirt_t.dds',
    'textures/b_n_dark elf_f_head_01.dds',
  ];
  const checks = await Promise.all(candidates.map(async (key) => {
    const url = assetUrls[norm(key)] ?? null;
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
    bundledPlugins: bundledMorrowindPluginNames(),
    representativeFetches: checks,
    note: 'High Resolution Better Body Female Textures and Better Heads are not selected by this loader.',
  };
  console.table(checks);
  console.log('[Bundled Morrowind texture packs]', report);
  return report;
}

if (IN_BROWSER) window.inspectBundledMorrowindTextures = inspectBundledMorrowindTextures;
