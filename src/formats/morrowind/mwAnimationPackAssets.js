// Inventory and deterministic selection boundary for the three additional animation packs.
// This module only discovers KF assets. It deliberately does not execute OpenMW Lua,
// apply YAML blend rules implicitly, or make a pack active merely because files exist.
const IN_BROWSER = typeof window !== 'undefined';

const FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/**/*.kf',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/**/*.kf',
      '../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/**/*.kf',
    ], {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const PACKS = Object.freeze({
  reanimation: 'reanimation-v3',
  dynamic: 'openmw-dynamic-animations',
  hitReactions: 'hit-reactions-v2',
});

const ROOTS = Object.freeze({
  [PACKS.reanimation]: 'Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/',
  [PACKS.dynamic]: 'Mods/Animations/OpenMW Dynamic Animations/animations/',
  [PACKS.hitReactions]: 'Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/',
});

const normalize = (value) => String(value ?? '').replace(/\\/g, '/').toLowerCase();
const basename = (path) => normalize(path).split('/').pop() ?? '';

export function animationPackFamily(packId, path) {
  const name = basename(path);
  if (packId === PACKS.reanimation) {
    if (/movement|runbounce|runforward|walkforward|sneakmovement|sneakidle|jump/.test(name)) return 'locomotion';
    if (/idle|guard|torch|tension/.test(name)) return 'idle';
    if (/chop|slash|thrust|shoot|strike|attack|recoil|altattacks|handtohand|crossbow|bow/.test(name)) return 'combat';
    if (/equneq|equip|unequip|throw/.test(name)) return 'actions';
    return 'other';
  }
  if (packId === PACKS.dynamic) {
    if (/walk/.test(name)) return 'walk';
    if (/run/.test(name)) return 'run';
    if (/sneak/.test(name)) return 'sneak';
    if (/idle/.test(name)) return 'idle';
    if (/jump|swim|fall/.test(name)) return 'movement';
    return 'other';
  }
  if (packId === PACKS.hitReactions) {
    if (/hitreact/.test(name)) return 'hit-reaction';
    if (/stagger/.test(name)) return 'stagger';
    if (/death/.test(name)) return 'death';
    return 'other';
  }
  return 'other';
}

const entries = Object.entries(FILES)
  .map(([path, url]) => {
    const normalizedPath = path.replace(/\\/g, '/');
    const lowerPath = normalize(normalizedPath);
    const packId = Object.keys(ROOTS).find((id) => lowerPath.includes(normalize(ROOTS[id])));
    if (!packId) return null;
    const relativePath = normalizedPath.slice(normalizedPath.toLowerCase().indexOf(ROOTS[packId].toLowerCase()) + ROOTS[packId].length);
    const skeleton = relativePath.split('/')[0].toLowerCase();
    return {
      packId,
      path: normalizedPath,
      relativePath,
      lowerPath,
      skeleton,
      family: animationPackFamily(packId, relativePath),
      url,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.lowerPath.localeCompare(b.lowerPath));

const cache = new Map();

export function listAnimationPackAssets({ packId, family, skeleton } = {}) {
  return entries.filter((entry) => {
    if (packId && entry.packId !== packId) return false;
    if (family && entry.family !== family) return false;
    if (skeleton && entry.skeleton !== normalize(skeleton)) return false;
    return true;
  }).map(({ url, ...entry }) => ({ ...entry }));
}

export async function loadAnimationPackAsset(asset) {
  if (!IN_BROWSER || !asset?.url) return null;
  let pending = cache.get(asset.url);
  if (!pending) {
    pending = fetch(asset.url).then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + asset.path);
      return new Uint8Array(await response.arrayBuffer());
    }).catch((error) => {
      cache.delete(asset.url);
      throw error;
    });
    cache.set(asset.url, pending);
  }
  return new Uint8Array(await pending);
}

export function inspectAnimationPackAssets() {
  const countByPack = Object.fromEntries(Object.values(PACKS).map((packId) => [
    packId, entries.filter((entry) => entry.packId === packId).length,
  ]));
  return {
    browser: IN_BROWSER,
    countByPack,
    packs: Object.values(PACKS).map((packId) => ({
      packId,
      count: countByPack[packId],
      families: [...new Set(entries.filter((entry) => entry.packId === packId).map((entry) => entry.family))].sort(),
    })),
  };
}

export { PACKS as ANIMATION_PACK_IDS };
