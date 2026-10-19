// Runtime loader for the animation packs uploaded to the Morrowind Textures tree.
// Files are bundled by Vite as URLs; their bytes are parsed by the same NIF/KF
// reader used for the game's archives. This module deliberately does not touch
// meshes or skeleton geometry.
const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Morrowind Textures/Simply Walking/**/*.{kf,KF}',
      "../../../Morrowind Textures/Axel's Sexy Walk Fixed/Animation/axel fixed/female/*.{kf,KF}",
    ], {
      eager: true, query: '?url', import: 'default',
    })
  : {};

const norm = (value) => String(value).replace(/\\/g, '/').toLowerCase();
const entries = Object.entries(FILES).map(([path, url]) => ({ path: path.replace(/\\/g, '/'), lower: norm(path), url }));
const standardMale = entries.find((e) => e.lower.includes('/simply walking purist edition/meshes/xbase_anim.kf'));
const standardFemale = entries.find((e) => e.lower.includes('/simply walking purist edition/meshes/xbase_anim_female.kf'));
const feminineFemale = entries.find((e) => e.lower.includes('/simply walking/feminine walk cycle/meshes/xbase_anim_female.kf'));
const axelFemale = entries.find((e) => e.lower.includes("/axel's sexy walk fixed/animation/axel fixed/female/walkforward;.kf"));

const cache = new Map();
let warnedMissingWalkAssets = false;
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
 * Returns the standard source and (for female rigs) the two optional walk
 * overrides. The gameplay movement resolver selects one by saved preference.
 * Only each source's walk groups/keys are admitted, so idle/run/combat clips
 * from a broader .kf are never substituted.
 */
export async function loadWalkAnimationAssets({ female = false } = {}) {
  if (!IN_BROWSER) return [];
  const standard = female ? standardFemale : standardMale;
  // Load both female-only candidates once; fpArm's movement resolver chooses
  // the saved preference on each walk-group change. This keeps live switching
  // possible without reloading the rig or ever loading Axel's idle/run clips.
  const overrides = female
    ? [{ entry: feminineFemale, variant: 'female' }, { entry: axelFemale, variant: 'female2' }]
    : [];
  const selected = [];
  if (!standard && !warnedMissingWalkAssets) {
    warnedMissingWalkAssets = true;
    console.warn('[Morrowind animations] Vite did not resolve the standard KF asset.', inspectWalkAnimationAssets());
  }
  try {
    if (standard) {
      const data = await bytes(standard);
      if (data) selected.push({ name: standard.path, bytes: data, variant: 'standard', walkVariant: 'standard', walkOnly: true });
    }
    for (const { entry, variant } of overrides) {
      if (!entry) {
        console.warn('[Morrowind animations] Vite did not resolve optional female walk source:', variant, inspectWalkAnimationAssets());
        continue;
      }
      const data = await bytes(entry);
      if (data) selected.push({ name: entry.path, bytes: data, variant, walkVariant: variant, walkOnly: true });
    }
  } catch (error) {
    console.warn('[Morrowind animations] bundled walk set failed to load; archive animations remain active:', String(error?.message ?? error));
    return [];
  }
  if (!selected.length && !warnedMissingWalkAssets) {
    warnedMissingWalkAssets = true;
    console.warn('[Morrowind animations] no bundled walk KF was selected.', inspectWalkAnimationAssets());
  }
  return selected;
}
export function inspectWalkAnimationAssets() {
  return {
    browser: IN_BROWSER,
    standardMale: standardMale?.path ?? null,
    standardFemale: standardFemale?.path ?? null,
    feminineFemale: feminineFemale?.path ?? null,
    axelFemale: axelFemale?.path ?? null,
  };
}

/** The engine's walk group family; this intentionally excludes sneak/run/turn. */
export function isWalkAnimationGroup(name) {
  return /^walk/i.test(String(name ?? ''));
}

/** A text-key record can contain several newline-separated entries (e.g. SoundGen before WalkForward).
 * Keep the record if ANY line names a walk group; looking only before the first colon silently drops many valid
 * animation keys and makes the replacement KF appear to have no usable walk animation. */
export function isWalkAnimationKey(key) {
  return String(key?.text ?? '').split(/\r?\n/).some((line) => {
    const colon = line.indexOf(':');
    return colon > 0 && isWalkAnimationGroup(line.slice(0, colon).trim());
  });
}

/** Live preference gate used by the movement resolver. Non-walk sources are untouched. */
export function isWalkVariantEnabled(source, femaleWalk = 'standard') {
  if (!source?.walkOnly || !source?.walkVariant || source.walkVariant === 'standard') return true;
  const selected = typeof femaleWalk === 'boolean' ? (femaleWalk ? 'female' : 'standard') : String(femaleWalk);
  return source.walkVariant === selected;
}
