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
  // Most Morrowind packages use <package>/Data Files/Meshes|Textures.
  // The high-resolution female texture archive is an exception: it ships
  // selectable variants directly as Nude_No_Hair/Textures, Nude_Body_Hair/
  // Textures, Underwear/Textures and Hands/Textures. Normalize those variant
  // paths to the same Data-Files-relative texture keys the renderer requests.
  const dataPath = isHighResolutionFemale
    ? rel.replace(/^.*?\/textures\//i, 'Textures/')
    : rel.replace(/^.*?\/data files\//i, '');
  const m = dataPath.match(/^(Meshes|Textures)\/(.+)\.(nif|dds|tga)$/i);
  if (m) {
    const root = m[1].toLowerCase() === 'meshes' ? 'meshes' : 'textures';
    // Texture-only trial: never replace the live body geometry or its manually
    // fixed UVs. Use the clean nude skin by default and the package's compatible
    // high-resolution hand textures; ignore the alternate body-hair/underwear
    // variants so their same-named files cannot win by glob enumeration order.
    if (isHighResolutionFemale) {
      if (root !== 'textures') continue;
      const variant = rel.split('/')[0].toLowerCase();
      if (variant !== 'nude_no_hair' && variant !== 'hands') continue;
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
