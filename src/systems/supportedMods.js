// @ts-check
// MODS-BYO: the third-party Morrowind packs the game has adapters for. Their files never ship unless their terms allow it:
// a player fetches the original from its author's page and attaches it in Mods & Files. Attached files live in this
// browser (scenes/dataSource.js attachModFiles), keyed by the path the loaders' tables already read, and enter those
// tables as object URLs before the first rig builds. A local Mods/ folder is found at dev and build time the same way.
import { getPref, setPref } from './uiPrefs.js';

const IN_BROWSER = typeof window !== 'undefined';
const FOUND = IN_BROWSER
  ? {
      oda: import.meta.glob('../../Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim.1st/*.{kf,KF}', { query: '?url' }),
      reanimation: import.meta.glob('../../Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/*.{kf,KF}', { query: '?url' }),
      mao: import.meta.glob('../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/{x,X}base_anim.kf', { query: '?url' }),
      hands: import.meta.glob('../../Mods/Bodies/Better Hands/Meshes/b/*.1st.nif', { query: '?url' }),
      robert: import.meta.glob("../../Mods/Bodies/Robert's bodies/Data Files/Meshes/bbr/*.nif", { query: '?url' }),
      bodies: import.meta.glob('../../Mods/Bodies/Better Bodies/Nude/Data Files/Meshes/bb/bb_skin*.nif', { query: '?url' }),
    }
  : {};

/** `marker`: what in a picked path proves the pack; its match's start is the pack's root unless `rootBefore` (a group 1
 *  the root stands before, so an archive without a Data Files level still lands where the loaders look). `home` is where
 *  the pack's files live under Mods/; `prefix` goes between it and a path that lacks the level the loaders read. */
export const SUPPORTED_MODS = Object.freeze([
  Object.freeze({ id: 'oda', blurb: 'Walks, runs and sneaks by direction.', name: 'OpenMW Dynamic Animations', url: 'https://www.nexusmods.com/morrowind/mods/57633', home: 'Animations/OpenMW Dynamic Animations/', marker: /(?:^|\/)(animations\/xbase_anim\.1st\/(?:walk|run|sneak)(?:forward|back|left|right)_base;\.kf)$/i }),
  Object.freeze({ id: 'reanimation', blurb: 'New first-person blows and weapon motion.', name: 'ReAnimation v3', url: 'https://www.nexusmods.com/morrowind/mods/52596', home: 'Animations/ReAnimation v3 - Complete - first-person animation pack/', marker: /(?:^|\/)(00 core\/animations\/xbase_anim\.1st\/[^/]*\.kf)$/i }),
  Object.freeze({ id: 'mao', blurb: 'New run, and walks in a stance.', name: 'Morrowind Animation Overhaul', url: 'https://www.nexusmods.com/morrowind/mods/60253', home: 'Animations/Morrowind Animation Overhaul/', marker: /(?:^|\/)((?:data files\/)?meshes\/xbase_anim(?:_female)?\.kf)$/i, level: 'Data Files/' }),
  Object.freeze({ id: 'hands', blurb: 'Better first-person hand models.', name: 'Better Hands', url: 'https://www.nexusmods.com/morrowind/mods/52552', home: 'Bodies/Better Hands/', marker: /(?:^|\/)(meshes\/b\/[^/]*\.1st\.nif)$/i }),
  Object.freeze({ id: 'robert', blurb: 'The arm and skin under Better Hands. Attach both.', name: "Robert's Bodies", url: 'https://www.nexusmods.com/games/morrowind/mods?keyword=Robert%27s+Bodies', home: "Bodies/Robert's bodies/", marker: /(?:^|\/)((?:data files\/)?meshes\/bbr\/[^/]*\.nif)$/i, level: 'Data Files/' }),
  Object.freeze({ id: 'bodies', blurb: 'Better body models and skins.', name: 'Better Bodies', url: 'https://www.nexusmods.com/morrowind/mods/3880', home: 'Bodies/Better Bodies/', marker: /(?:^|\/)(nude\/data files\/meshes\/bb\/bb_skin[^/]*\.nif)$/i }),
]);

const FILE_KEPT = /\.(?:kf|nif|dds|tga)$/i;

/** From picked paths, every supported pack in them: its id and the root its files hang under. */
export function identifyPacks(paths) {
  const found = new Map();
  for (const raw of paths) {
    const path = String(raw).replace(/\\/g, '/');
    for (const mod of SUPPORTED_MODS) {
      if (found.has(mod.id)) continue;
      const m = mod.marker.exec(path);
      if (m) found.set(mod.id, { id: mod.id, root: path.slice(0, m.index + m[0].length - m[1].length) });
    }
  }
  return [...found.values()];
}

/** A picked file's key in the store - its path under Mods/ - or null when it is no file of that pack. */
export function modFileKey(pack, rawPath) {
  const mod = SUPPORTED_MODS.find((m) => m.id === pack.id);
  const path = String(rawPath).replace(/\\/g, '/');
  if (!mod || !path.startsWith(pack.root) || !FILE_KEPT.test(path)) return null;
  const rel = path.slice(pack.root.length);
  const level = mod.level && !rel.toLowerCase().startsWith(mod.level.toLowerCase()) ? mod.level : '';
  return mod.home + level + rel;
}

const OFF_PREF = 'supportedModsOff';
export const modEnabled = (id) => !getPref(OFF_PREF)?.[id];
export const setModEnabled = (id, on) => setPref(OFF_PREF, { ...(getPref(OFF_PREF) ?? {}), [id]: !on });

const tables = [];
let attached = new Map();

/** A loader's URL table, open to attached files: `re` picks by the lowercased key under Mods/. */
export function registerModTable(table, re) {
  tables.push({ table, re });
  return table;
}

const MODS_ROOT = '../../../Mods/';
/** Attached files (key under Mods/ to URL) into every table, and a switched-off pack's files out of them. */
export function applyModFiles(files) {
  attached = new Map(files);
  const off = SUPPORTED_MODS.filter((m) => !modEnabled(m.id)).map((m) => `/mods/${m.home.toLowerCase()}`);
  for (const { table, re } of tables) {
    for (const [key, url] of attached) if (re.test(key.toLowerCase())) table[MODS_ROOT + key] = url;
    for (const key of Object.keys(table)) {
      const lower = key.replace(/\\/g, '/').toLowerCase();
      if (off.some((dir) => lower.includes(dir))) delete table[key];
    }
  }
}

/** True when the pack's own files were found: attached in this browser, or in the Mods/ folder at build time. */
export const supportedModFound = (id) => {
  const mod = SUPPORTED_MODS.find((m) => m.id === id);
  if (Object.keys(FOUND[id] ?? {}).length > 0) return true;
  return !!mod && [...attached.keys()].some((key) => key.startsWith(mod.home));
};
/** True when the found pack is attached here, so Remove has something to remove. */
export const supportedModAttached = (id) => {
  const mod = SUPPORTED_MODS.find((m) => m.id === id);
  return !!mod && [...attached.keys()].some((key) => key.startsWith(mod.home));
};
