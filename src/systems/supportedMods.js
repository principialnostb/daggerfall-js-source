// @ts-check
// MODS-BYO: the third-party Morrowind packs the game has adapters for. Their files never ship: a player or tester fetches
// the original from its author's page. Today a pack counts as found when its own files stand in the local Mods/ folder at
// dev or build time (Vite's glob must stay written literally). Attaching an archive in a published build is not built yet.
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

export const SUPPORTED_MODS = Object.freeze([
  Object.freeze({ id: 'oda', name: 'OpenMW Dynamic Animations', url: 'https://www.nexusmods.com/morrowind/mods/57633' }),
  Object.freeze({ id: 'reanimation', name: 'ReAnimation v3', url: 'https://www.nexusmods.com/morrowind/mods/52596' }),
  Object.freeze({ id: 'mao', name: 'Morrowind Animation Overhaul', url: 'https://www.nexusmods.com/morrowind/mods/60253' }),
  Object.freeze({ id: 'hands', name: 'Better Hands', url: 'https://www.nexusmods.com/morrowind/mods/52552' }),
  Object.freeze({ id: 'robert', name: "Robert's Bodies", url: 'https://www.nexusmods.com/games/morrowind/mods?keyword=Robert%27s+Bodies' }),
  Object.freeze({ id: 'bodies', name: 'Better Bodies', url: 'https://www.nexusmods.com/morrowind/mods/3880' }),
]);

/** True when the pack's own files were found: its id's glob matched at least one file. */
export const supportedModFound = (id) => Object.keys(FOUND[id] ?? {}).length > 0;
