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
    if (/chop|slash|thrust|shoot|strike|attack|recoil|altattacks|handtohand|crossbow|bow|thrownknife|thrownstar/.test(name)) return 'combat';
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
  .sort((a, b) => a.lowerPath < b.lowerPath ? -1 : a.lowerPath > b.lowerPath ? 1 : 0);

// Provider metadata is intentionally separate from file discovery. A discovered file is
// not an active provider until its family has a gameplay consumer and compatibility tests.
export const ANIMATION_PACK_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'reanimation-v3.first-person',
    packId: PACKS.reanimation,
    domains: Object.freeze(['animation.player.firstPerson.locomotion', 'animation.player.firstPerson.stance', 'animation.player.firstPerson.attack']),
    status: 'needs-validation',
    reason: 'Canonical core KF sources and generic attack variants are wired to first-person rigs by weapon family; stable action-hash selection is active, while katana/mirrored variants, complete weapon coverage, advanced Lua overrides, and in-game compatibility remain outstanding.',
  }),
  Object.freeze({
    id: 'dynamic-animations.locomotion',
    packId: PACKS.dynamic,
    domains: Object.freeze(['animation.player.walk', 'animation.npc.walk', 'animation.npc.idle']),
    status: 'needs-validation',
    reason: 'Forward-walk variants and NPC Idle2/Idle3/Idle6 clips are wired with stable per-actor selection; backward/side movement, sneak/run, player idle, speed caps, and race-specific OpenMW behavior remain unported.',
  }),
  Object.freeze({
    id: 'hit-reactions-v2.reactions',
    packId: PACKS.hitReactions,
    domains: Object.freeze(['animation.actor.hitReaction', 'animation.actor.stagger', 'animation.actor.death']),
    status: 'needs-validation',
    reason: 'JavaScript hurt()/die() consumers and deterministic group selection are wired; visual, timing, and skeleton compatibility checks remain outstanding.',
  }),
]);

/** Only a provider with a declared runtime consumer can resolve away from Vanilla; pending validation is returned as a reason. */
export function resolveAnimationPackProvider(domain, selection = 'vanilla') {
  if (!selection || selection === 'vanilla') {
    return { requested: selection || 'vanilla', effective: 'vanilla', provider: null, fallback: false, reason: 'Vanilla selected' };
  }
  const provider = ANIMATION_PACK_PROVIDERS.find((item) => item.id === selection && item.domains.includes(domain));
  if (!provider) {
    return { requested: selection, effective: 'vanilla', provider: null, fallback: true, reason: 'No provider declares this domain and selection' };
  }
  if (provider.status === 'present-unintegrated' || provider.status === 'blocked') {
    return { requested: selection, effective: 'vanilla', provider: provider.id, fallback: true, reason: provider.reason };
  }
  return {
    requested: selection,
    effective: provider.id,
    provider: provider.id,
    fallback: false,
    reason: provider.status === 'needs-validation' ? provider.reason : null,
  };
}

const cache = new Map();

export function listAnimationPackAssets({ packId, family, skeleton } = {}) {
  return entries.filter((entry) => {
    if (packId && entry.packId !== packId) return false;
    if (family && entry.family !== family) return false;
    if (skeleton && entry.skeleton !== normalize(skeleton)) return false;
    return true;
  });
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

/** Deterministic selection over an explicit group list. Input order is ignored; roll is supplied by
 * the caller's gameplay PRNG, never generated inside the animation provider. */
export function selectDeterministicReactionGroup(groups, kind, roll = 0) {
  const candidates = [...new Set((groups ?? []).map((group) => String(group).toLowerCase()))]
    .filter((group) => kind === 'death'
      ? group.startsWith('death') && !group.includes('dremora')
      : kind === 'hit'
        ? group.startsWith('hitreact') || group.startsWith('stagger')
        : false)
    .sort();
  if (!candidates.length) return null;
  const index = ((((Number(roll) | 0) % candidates.length) + candidates.length) % candidates.length);
  return candidates[index];
}

/** Select a source variant reproducibly from its semantic seed, never array/glob order. */
export function selectStableAnimationVariant(candidates, seed) {
  const ordered = [...(candidates ?? [])].sort((a, b) => {
    const left = String(a.source?.name ?? a.name ?? '');
    const right = String(b.source?.name ?? b.name ?? '');
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (!ordered.length) return null;
  const value = String(seed ?? '');
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ordered[(hash >>> 0) % ordered.length];
}

/** Load the ReAnimation core KF sources relevant to the current first-person weapon family.
 * Unsupported weapon families return no candidates and therefore retain archive animations. */
export function reAnimationPrefixesForWeaponGroup(weaponShortGroup = '') {
  const prefixesByGroup = {
    '1s': ['xdagger', 'x1s'],
    '1h': ['x1h'],
    '1b': ['x1h'],
    '2c': ['x2c'],
    '2w': ['x2w', 'x2h'],
    bow: ['xbow'],
    crossbow: ['xcrossbow'],
    '1t': ['x1t', 'xthrownknife', 'xthrownstar'],
    hh: ['xh2h', 'xhh'],
  };
  return prefixesByGroup[normalize(weaponShortGroup)] ?? [];
}

export async function loadReAnimationAnimationAssets({ weaponShortGroup = '' } = {}) {
  if (!IN_BROWSER) return [];
  const prefixes = reAnimationPrefixesForWeaponGroup(weaponShortGroup);
  if (!prefixes.length) return [];
  const candidates = listAnimationPackAssets({ packId: PACKS.reanimation, skeleton: 'xbase_anim.1st' })
    .filter((asset) => {
      const name = basename(asset.relativePath).replace(/\.kf$/, '');
      if (!prefixes.some((prefix) => name.startsWith(prefix))) return false;
      // Generic alternate/sub clips are selected by the first-person attack resolver.
      // Katana-only and mirrored variants stay excluded until their weapon-specific rules exist.
      return !/(?:katana|mirrored)/i.test(name);
    });
  const loaded = await Promise.all(candidates.map(async (asset) => {
    try {
      const bytes = await loadAnimationPackAsset(asset);
      return bytes?.length ? { ...asset, bytes } : null;
    } catch (error) {
      console.warn('[Morrowind animations] optional ReAnimation asset unavailable:', asset.path, String(error?.message ?? error));
      return null;
    }
  }));
  return loaded.filter(Boolean);
}

/** Load one deterministic Dynamic Animations idle variant for a humanoid third-person rig. */
export async function loadDynamicIdleAnimationAsset({ female = false, variant = '2' } = {}) {
  if (!IN_BROWSER) return null;
  const skeleton = female ? 'xbase_anim_female' : 'xbase_anim';
  const candidates = listAnimationPackAssets({ packId: PACKS.dynamic, skeleton, family: 'idle' });
  const wanted = `idle${String(variant)}_copy;.kf`.toLowerCase();
  const asset = candidates.find((candidate) => basename(candidate.relativePath) === wanted)
    ?? candidates.find((candidate) => basename(candidate.relativePath) === 'idle2_copy;.kf');
  if (!asset) return null;
  try {
    const bytes = await loadAnimationPackAsset(asset);
    return bytes?.length ? { ...asset, bytes, idleOnly: true, idleVariant: 'dynamic', dynamicIdleAlias: true } : null;
  } catch (error) {
    console.warn('[Morrowind animations] optional Dynamic Animations idle clip unavailable; archive idle retained:', asset.path, String(error?.message ?? error));
    return null;
  }
}

/** Load the Hit Reactions pack's clips for the actor's actual skeleton family.
 * The pack's OpenMW event scripts are not loaded; gameplay owns event routing. */
export async function loadHitReactionAnimationAssets({ female = false, beast = false } = {}) {
  if (!IN_BROWSER) return [];
  const skeleton = beast ? 'xbase_animkna' : female ? 'xbase_anim_female' : 'xbase_anim';
  const candidates = listAnimationPackAssets({ packId: PACKS.hitReactions, skeleton })
    .filter((asset) => ['hit-reaction', 'stagger', 'death'].includes(asset.family));
  const loaded = await Promise.all(candidates.map(async (asset) => {
    try {
      const bytes = await loadAnimationPackAsset(asset);
      return bytes?.length ? { ...asset, bytes } : null;
    } catch (error) {
      console.warn('[Morrowind animations] optional hit-reaction asset unavailable:', asset.path, String(error?.message ?? error));
      return null;
    }
  }));
  return loaded.filter(Boolean);
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
