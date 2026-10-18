// Bundled Morrowind mod assets. Runtime NIF/DDS/TGA files and plugin records
// are served through the same archive and record-reader contracts as user data.
import { makeVendoredArchive } from './urlArchive.js';

const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob('../../Morrowind Textures/**/*.{nif,NIF,dds,DDS,tga,TGA,esm,ESM,esp,ESP}', {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const norm = (s) => String(s).replace(/\\/g, '/').toLowerCase();
const assetUrls = {};
const highResolutionFemaleTextureUrls = {};
const pluginUrls = new Map();

for (const [source, url] of Object.entries(FILES)) {
  const p = source.replace(/\\/g, '/');
  const lower = p.toLowerCase();
  const clothesAt = lower.indexOf('/clothes/');
  const headsAt = lower.indexOf('/better heads/');
  const highResFemaleAt = lower.indexOf('/high resolution better body female textures/');
  const modAt = clothesAt >= 0 ? clothesAt + '/clothes/'.length
    : headsAt >= 0 ? headsAt + '/better heads/'.length
      : highResFemaleAt >= 0
        ? highResFemaleAt + '/high resolution better body female textures/'.length
        : -1;
  if (modAt < 0) continue;
  const isHighResolutionFemale = highResFemaleAt >= 0;
  const rel = p.slice(modAt);
  // Mod archives are commonly packed as <package>/Data Files/Meshes|Textures.
  // The runtime archive contract is Data-Files-relative, so strip the outer
  // package and Data Files prefix before indexing assets. Keep `rel` intact
  // below for plugin identity/load order.
  const dataPath = rel.replace(/^.*?\/data files\//i, '');
  const m = dataPath.match(/^(Meshes|Textures)\/(.+)\.(nif|dds|tga)$/i);
  if (m) {
    const root = m[1].toLowerCase() === 'meshes' ? 'meshes' : 'textures';
    // This package is a TEXTURE-ONLY trial. Never let its optional/alternate
    // meshes replace the live Better Bodies geometry or its manually fixed UVs.
    if (isHighResolutionFemale) {
      if (root !== 'textures') continue;
      highResolutionFemaleTextureUrls[(root + '/' + m[2] + '.' + m[3]).toLowerCase()] = url;
    } else {
      assetUrls[(root + '/' + m[2] + '.' + m[3]).toLowerCase()] = url;
    }
    continue;
  }
  if (isHighResolutionFemale || !/\.(esm|esp)$/i.test(rel)) continue;
  const base = rel.split('/').pop().toLowerCase();
  const isClothesPlugin = base === 'ale_clothing_v1.esp';
  const isHeadPlugin = base === 'better heads.esm'
    || base === 'better heads tribunal addon.esm'
    || base === 'better heads bloodmoon addon.esm'
    || /^bh_.*\.esm$/i.test(base);
  if (isClothesPlugin || isHeadPlugin) {
    const key = 'bundled:' + rel;
    pluginUrls.set(norm(key), { key, url, base });
  }
}

// Give the high-resolution female skin textures explicit precedence over the
// standard Better Bodies texture files, independent of glob enumeration order.
// Only matching texture paths are replaced; missing files keep the existing skin.
Object.assign(assetUrls, highResolutionFemaleTextureUrls);

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
  const all = [...pluginUrls.values()];
  const rank = ({ base }) => {
    const n = base.toLowerCase();
    if (n === 'better heads.esm') return 0;
    if (n === 'better heads tribunal addon.esm') return 1;
    if (n === 'better heads bloodmoon addon.esm') return 2;
    if (n === 'ale_clothing_v1.esp') return 4;
    return 3;
  };
  return all.sort((a, b) => rank(a) - rank(b) || a.key.localeCompare(b.key)).map((x) => x.key);
}

export async function loadBundledMorrowindPlugin(name) {
  const entry = pluginUrls.get(norm(name));
  return entry ? fetchBytes(entry.url) : null;
}
