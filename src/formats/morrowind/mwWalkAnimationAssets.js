// Runtime loader for animation packs under Mods/Animations.
// Files are bundled by Vite as URLs; their bytes are parsed by the same NIF/KF
// reader used for the game's archives. This module deliberately does not touch
// meshes or skeleton geometry.
import { modSetting } from '../../systems/modSettings.js';

const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/Simply Walking/**/*.{kf,KF}',
      "../../../Mods/Animations/Axel's Sexy Walk Fixed/Animation/axel fixed/female/*.{kf,KF}",
      // Morrowind Animation Overhaul is intentionally excluded pending explicit reuse permission.
    ], {
      eager: true, query: '?url', import: 'default',
    })
  : {};

// ReAnimation v3 ships individual first-person KF clips rather than one replacement
// library. Keep this glob separate from third-person locomotion and sort paths
// before resolving so glob enumeration order can never decide animation priority.
const FIRST_PERSON_FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/**/*.kf',
      '../../../Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/*.kf',
    ], { eager: true, query: '?url', import: 'default' })
  : {};

const HIT_REACTION_FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/**/*.kf',
      '../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/**/*.KF',
    ], { eager: true, query: '?url', import: 'default' })
  : {};

const norm = (value) => String(value).replace(/\\/g, '/').toLowerCase();
const entries = Object.entries(FILES).map(([path, url]) => ({ path: path.replace(/\\/g, '/'), lower: norm(path), url }));
const standardMale = entries.find((e) => e.lower.includes('/simply walking purist edition/meshes/xbase_anim.kf'));
// Keep the general female walk and Feminine Walk Cycle as distinct selectable
// variants. The resolver filters each source to its declared family and chooses
// the selected variant only; unsupported groups retain the game's own source.
const puristFemale = entries.find((e) => e.lower.includes('/simply walking purist edition/meshes/xbase_anim_female.kf'));
const feminineFemale = entries.find((e) => e.lower.includes('/simply walking/feminine walk cycle/meshes/xbase_anim_female.kf'));
const axelFemale = entries.find((e) => e.lower.includes("/axel's sexy walk fixed/animation/axel fixed/female/walkforward;.kf"));
const axelRunFemale = entries.find((e) => e.lower.includes("/axel's sexy walk fixed/animation/axel fixed/female/runforward;.kf"));
const overhaulMale = entries.find((e) => e.lower.includes('/morrowind animation overhaul/data files/meshes/xbase_anim.kf'));
const overhaulFemale = entries.find((e) => e.lower.includes('/morrowind animation overhaul/data files/meshes/xbase_anim_female.kf'));

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
 * Returns selected source candidates for Simply Walking, the independent Feminine
 * Walk Cycle, Axel's female locomotion clips, and the optional full MAO set.
 * The full overhaul is admitted only when explicitly selected; the Vanilla
 * source remains available for unsupported races and any groups absent in the pack.
 */
export async function loadWalkAnimationAssets({ female = false } = {}) {
  if (!IN_BROWSER) return [];
  const simplyCandidates = female
    ? [{ entry: puristFemale, variant: 'simply', family: 'walk' }]
    : [{ entry: standardMale, variant: 'simply', family: 'walk' }];
  const feminineCandidate = female
    ? { entry: feminineFemale, variant: 'feminine', family: 'walk' }
    : null;
  // Each female walk pack has its own visible option. fpArm filters the KF
  // down to the walk family and only admits the chosen variant.
  const overrides = female ? [
    { entry: axelFemale, variant: 'axel', family: 'walk' },
    { entry: axelRunFemale, variant: 'axel', family: 'run' },
  ] : [];
  const overhaul = modSetting('morrowind-animation', 'AnimationOverhaul') === 1
    ? { entry: female ? overhaulFemale : overhaulMale, variant: 'overhaul', family: 'all' }
    : null;
  const selected = [];
  if (!simplyCandidates.some(({ entry }) => entry) && !warnedMissingWalkAssets) {
    warnedMissingWalkAssets = true;
    console.warn('[Morrowind animations] Vite did not resolve any Simply Walking KF source.', inspectWalkAnimationAssets());
  }
  try {
    if (overhaul?.entry) {
      const data = await bytes(overhaul.entry);
      if (data) selected.push({ name: overhaul.entry.path, bytes: data, variant: 'overhaul', walkVariant: 'overhaul', family: 'all', animationFamily: 'all', walkOnly: false, runOnly: false, animationOverhaul: true });
    }
    for (const { entry, variant, family } of simplyCandidates) {
      if (!entry) continue;
      const data = await bytes(entry);
      if (data) selected.push({ name: entry.path, bytes: data, variant, walkVariant: variant, family, animationFamily: family, walkOnly: family === 'walk', runOnly: family === 'run' });
    }
    if (feminineCandidate?.entry) {
      const data = await bytes(feminineCandidate.entry);
      if (data) selected.push({ name: feminineCandidate.entry.path, bytes: data, variant: feminineCandidate.variant, walkVariant: feminineCandidate.variant, family: feminineCandidate.family, animationFamily: feminineCandidate.family, walkOnly: true, runOnly: false });
    }
    for (const { entry, variant, family } of overrides) {
      if (!entry) {
        console.warn('[Morrowind animations] Vite did not resolve optional female locomotion source:', family, variant, inspectWalkAnimationAssets());
        continue;
      }
      const data = await bytes(entry);
      if (data) selected.push({ name: entry.path, bytes: data, variant, walkVariant: variant, family, animationFamily: family, walkOnly: family === 'walk', runOnly: family === 'run' });
    }
  } catch (error) {
    console.warn('[Morrowind animations] bundled walk set failed to load; archive animations remain active:', String(error?.message ?? error));
    return [];
  }
  if (!selected.length && !warnedMissingWalkAssets) {
    warnedMissingWalkAssets = true;
    console.warn('[Morrowind animations] no bundled walk KF source was selected.', inspectWalkAnimationAssets());
  }
  return selected;
}
/** Load ReAnimation first-person clips in stable path order. */
export async function loadFirstPersonAnimationAssets() {
  if (!IN_BROWSER) return [];
  const files = Object.entries(FIRST_PERSON_FILES)
    .map(([path, url]) => ({ path: path.replace(/\\/g, '/'), url }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const result = [];
  for (const entry of files) {
    try {
      const data = await bytes(entry);
      if (data) result.push({ name: entry.path, bytes: data, family: 'first-person', variant: 'reanimation-v3' });
    } catch (error) {
      console.warn('[Morrowind animations] ReAnimation clip failed to load; archive fallback retained:', entry.path, String(error?.message ?? error));
    }
  }
  return result;
}

/** Load third-person hit-reaction KF files in stable path order. */
export async function loadHitReactionAnimationAssets() {
  if (!IN_BROWSER) return [];
  const files = Object.entries(HIT_REACTION_FILES)
    .map(([path, url]) => ({ path: path.replace(/\\/g, '/'), url }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const result = [];
  for (const entry of files) {
    try {
      const data = await bytes(entry);
      if (data) result.push({ name: entry.path, bytes: data, family: 'hit-reaction', variant: 'hit-reactions-v2' });
    } catch (error) {
      console.warn('[Morrowind animations] hit-reaction clip failed to load; archive fallback retained:', entry.path, String(error?.message ?? error));
    }
  }
  return result;
}

export function inspectWalkAnimationAssets() {
  return {
    browser: IN_BROWSER,
    standardMale: standardMale?.path ?? null,
    puristFemale: puristFemale?.path ?? null,
    feminineFemale: feminineFemale?.path ?? null,
    feminineCycleEnabledAsIndependentVariant: !!feminineFemale,
    axelFemale: axelFemale?.path ?? null,
    axelRunFemale: axelRunFemale?.path ?? null,
    overhaulMale: overhaulMale?.path ?? null,
    overhaulFemale: overhaulFemale?.path ?? null,
    overhaulEnabled: modSetting('morrowind-animation', 'AnimationOverhaul') === 1,
  };
}

/** The engine's walk group family; this intentionally excludes sneak/run/turn. */
export function isWalkAnimationGroup(name) {
  return /^walk/i.test(String(name ?? ''));
}

/** Axel's pack has a separate RunForward clip; it is controlled by the independent run selector. */
export function isRunAnimationGroup(name) {
  return /^run/i.test(String(name ?? ''));
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

export function isRunAnimationKey(key) {
  return String(key?.text ?? '').split(/\r?\n/).some((line) => {
    const colon = line.indexOf(':');
    return colon > 0 && isRunAnimationGroup(line.slice(0, colon).trim());
  });
}


/**
 * Resolve the persisted numeric choice for one rig to a source variant.
 * Player/remote-player bodies use the player choice; ordinary NPC bodies use
 * their own sex-specific choice. The returned 'vanilla' value excludes only
 * bundled walk-only sources and leaves every other animation source intact.
 */
export function walkVariantForActor({
  player = false, ownHeads = false, female = false,
  playerChoice = 0, npcMaleChoice = 0, npcFemaleChoice = 0,
} = {}) {
  const index = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
  if (player || ownHeads) {
    if (!female) return ['vanilla', 'simply'][index(playerChoice, 1)];
    return ['vanilla', 'simply', 'feminine', 'axel'][index(playerChoice, 3)];
  }
  if (female) return ['vanilla', 'simply', 'feminine', 'axel'][index(npcFemaleChoice, 3)];
  return ['vanilla', 'simply'][index(npcMaleChoice, 1)];
}

/** Live preference gates for the two independent locomotion families. */
export function isWalkVariantEnabled(source, walkChoice = 'vanilla') {
  const selected = typeof walkChoice === 'boolean' ? (walkChoice ? 'female' : 'standard') : String(walkChoice);
  if (selected === 'vanilla') return !source?.walkOnly;
  if (!source?.walkOnly) return true;
  return source.walkVariant === selected;
}

export function isRunVariantEnabled(source, runChoice = 'vanilla') {
  const selected = String(runChoice ?? 'vanilla');
  if (selected === 'vanilla') return !source?.runOnly;
  if (!source?.runOnly) return true;
  return source.walkVariant === selected;
}

/** Resolve the independent run preference for one actor. Axel only ships a female run clip. */
export function runVariantForActor({
  player = false, ownHeads = false, female = false,
  playerChoice = 0, npcMaleChoice = 0, npcFemaleChoice = 0,
} = {}) {
  const index = (value, max) => Math.max(0, Math.min(max, Number(value) || 0));
  if (player || ownHeads) return female && index(playerChoice, 1) === 1 ? 'axel' : 'vanilla';
  if (female) return index(npcFemaleChoice, 1) === 1 ? 'axel' : 'vanilla';
  return ['vanilla'][index(npcMaleChoice, 0)];
}
