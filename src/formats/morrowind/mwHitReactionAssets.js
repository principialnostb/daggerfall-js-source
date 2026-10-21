// Hit Reactions Animated v2: opt-in third-person reaction/death KF provider.
// OpenMW Lua scripts, settings, and global blending YAML are not executed by the browser
// port. Only explicitly named reaction/death KF clips are exposed to the native resolver.

const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob(
      '../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/{xbase_anim,xbase_anim_female}/*.kf',
      { eager: true, query: '?url', import: 'default' },
    )
  : {};

const candidateName = /(?:^|\/)(?:x?death|hitreact|stagger)[^/]*\.kf$/i;
const entries = Object.entries(FILES)
  .map(([path, url]) => ({ path: path.replace(/\\/g, '/'), url }))
  .filter((entry) => candidateName.test(entry.path))
  .sort((a, b) => a.path.localeCompare(b.path, 'en', { sensitivity: 'base' }));
const cache = new Map();

async function read(entry) {
  let pending = cache.get(entry.url);
  if (!pending) {
    pending = fetch(entry.url).then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' loading ' + entry.path);
      return new Uint8Array(await response.arrayBuffer());
    });
    cache.set(entry.url, pending);
  }
  return new Uint8Array(await pending);
}

export async function loadHitReactionAssets() {
  if (!IN_BROWSER) return [];
  const loaded = await Promise.all(entries.map(async (entry) => {
    try {
      return { name: entry.path, bytes: await read(entry), optional: true, animationPack: 'hit-reactions-v2' };
    } catch (error) {
      console.warn('[Hit Reactions Animated] optional source failed to load; archive source retained:', entry.path, String(error?.message ?? error));
      return null;
    }
  }));
  return loaded.filter(Boolean);
}

export function isHitReactionGroup(name) {
  return /^(?:x?hitreact|x?stagger)/i.test(String(name ?? ''));
}

export function isDeathReactionGroup(name) {
  return /^(?:x?death)/i.test(String(name ?? ''));
}

export function isHitReactionKey(key) {
  return String(key?.text ?? '').split(/\r?\n/).some((line) => {
    const colon = line.indexOf(':');
    return colon > 0 && isHitReactionGroup(line.slice(0, colon).trim());
  });
}

export function isDeathReactionKey(key) {
  return String(key?.text ?? '').split(/\r?\n/).some((line) => {
    const colon = line.indexOf(':');
    return colon > 0 && isDeathReactionGroup(line.slice(0, colon).trim());
  });
}

export function chooseReactionGroup(sources, family, roll = 0) {
  const matcher = family === 'death' ? isDeathReactionGroup : isHitReactionGroup;
  const groups = [...new Set((sources ?? [])
    .filter((source) => source?.animationPack === 'hit-reactions-v2')
    .flatMap((source) => source.groups ?? [])
    .filter(matcher))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  if (!groups.length) return null;
  const index = ((((Number(roll) | 0) % groups.length) + groups.length) % groups.length);
  return groups[index];
}
