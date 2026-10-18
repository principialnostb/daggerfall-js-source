// Runtime loader for the animation packs uploaded to the Morrowind Textures tree.
// Files are bundled by Vite as URLs; their bytes are parsed by the same NIF/KF
// reader used for the game's archives. This module deliberately does not touch
// meshes or skeleton geometry.
const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob('../../../Morrowind Textures/Simply Walking/**/*.{kf,KF}', {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const norm = (value) => String(value).replace(/\\/g, '/').toLowerCase();
const entries = Object.entries(FILES).map(([path, url]) => ({ path: path.replace(/\\/g, '/'), lower: norm(path), url }));
const standardMale = entries.find((e) => e.lower.includes('/simply walking purist edition/meshes/xbase_anim.kf'));
const standardFemale = entries.find((e) => e.lower.includes('/simply walking purist edition/meshes/xbase_anim_female.kf'));
const feminineFemale = entries.find((e) => e.lower.includes('/simply walking/feminine walk cycle/meshes/xbase_anim_female.kf'));

const cache = new Map();
async function bytes(entry) {
  if (!entry) return null;
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
 * Returns a standard walk source for the actor's skeleton and, optionally,
 * the female-only gait override. Callers must filter these sources to walk
 * groups so a full .kf can never silently replace idle/run/combat clips.
 */
export async function loadWalkAnimationAssets({ female = false } = {}) {
  if (!IN_BROWSER) return [];
  const standard = female ? standardFemale : standardMale;
  const selected = [];
  try {
    if (standard) {
      const data = await bytes(standard);
      if (data) selected.push({ name: standard.path, bytes: data, variant: 'standard' });
    }
    if (female && feminineFemale) {
      const data = await bytes(feminineFemale);
      if (data) selected.push({ name: feminineFemale.path, bytes: data, variant: 'female' });
    }
  } catch (error) {
    console.warn('[Morrowind animations] bundled walk set unavailable; archive animations remain active:', String(error?.message ?? error));
  }
  return selected;
}

export function inspectWalkAnimationAssets() {
  return {
    browser: IN_BROWSER,
    standardMale: standardMale?.path ?? null,
    standardFemale: standardFemale?.path ?? null,
    feminineFemale: feminineFemale?.path ?? null,
  };
}

/** The engine's walk group family; this intentionally excludes sneak/run/turn. */
export function isWalkAnimationGroup(name) {
  return /^walk/i.test(String(name ?? ''));
}

/** Live preference gate used by the movement resolver. Non-walk sources are untouched. */
export function isWalkVariantEnabled(source, femaleWalk) {
  return !source?.walkOnly || source.walkVariant !== 'female' || !!femaleWalk;
}
