// ReAnimation v3 first-person KF provider.
// Only the 00 Core first-person animation sources are discovered here; compatibility
// patches and the mod's MWSE/OpenMW scripts are not executable in the browser port.
// Paths are sorted before insertion so overlapping animation groups resolve identically
// on every build instead of inheriting import.meta.glob enumeration order.

const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob(
      '../../../Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/**/*.kf',
      { eager: true, query: '?url', import: 'default' },
    )
  : {};

const entries = Object.entries(FILES)
  .map(([path, url]) => ({ path: path.replace(/\\/g, '/'), url }))
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

/**
 * Load the first-person ReAnimation v3 core sources. The caller must still parse
 * and bind each KF against the active first-person rig; failed or incompatible
 * files must be skipped so the game's archive sources remain a fallback.
 */
export async function loadReAnimationAssets() {
  if (!IN_BROWSER) return [];
  const loaded = [];
  for (const entry of entries) {
    try {
      loaded.push({
        name: entry.path,
        bytes: await read(entry),
        optional: true,
        animationPack: 'reanimation-v3',
      });
    } catch (error) {
      console.warn('[ReAnimation v3] optional first-person source failed to load; archive source retained:', entry.path, String(error?.message ?? error));
    }
  }
  return loaded;
}

export function inspectReAnimationAssets() {
  return {
    browser: IN_BROWSER,
    count: entries.length,
    paths: entries.map((entry) => entry.path),
  };
}
