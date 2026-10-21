// Runtime loader for animation packs under Mods/Animations.
// Files are bundled by Vite as URLs; their bytes are parsed by the same NIF/KF
// reader used for the game's archives. This module deliberately does not touch
// meshes or skeleton geometry.
import { modSetting } from '../../systems/modSettings.js';
import { recordMorrowindDiagnostic } from '../../systems/morrowindDiagnostics.js';

const IN_BROWSER = typeof window !== 'undefined';
const FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/Simply Walking/**/*.{kf,KF}',
      "../../../Mods/Animations/Axel's Sexy Walk Fixed/Animation/axel fixed/female/*.{kf,KF}",
      // MAO files remain user-supplied under Mods/Animations; they are not vendored in this repository.
      '../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/xbase_anim.kf',
      '../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/xbase_anim_female.kf',
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
      '../../../Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/**/*.{kf,KF}',
      '../../../Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core/Animations/xbase_anim.1st/*.{kf,KF}',
    ], { eager: true, query: '?url', import: 'default' })
  : {};

const HIT_REACTION_FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/**/*.{kf,KF}',
      '../../../Mods/Animations/Hit Reactions Animated v2 -- OpenMW/Animations/**/*.KF',
    ], { eager: true, query: '?url', import: 'default' })
  : {};

// The OpenMW Dynamic Animations package has a large script-driven catalog.
// Only its explicit first-person directional locomotion clips are eligible
// here; its Lua controllers, NPC/creature variants, poses and YAML blend rules
// are not browser-runtime providers.
const OPENMW_DYNAMIC_FIRST_PERSON_FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim.1st/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim.1st/*.KF',
    ], { eager: true, query: '?url', import: 'default' })
  : {};

const OPENMW_DYNAMIC_THIRD_PERSON_FILES = IN_BROWSER
  ? import.meta.glob([
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xbase_anim_female/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xbase_animkna/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xargonian_swimkna/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xepos_kha_upr_anim_f/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/xepos_kha_upr_anim_m/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/oaab/r/xMazken/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/r/xGolden Saint/**/*.{kf,KF}',
      '../../../Mods/Animations/OpenMW Dynamic Animations/animations/tr/cr/xtr_cr_seducer_01/**/*.{kf,KF}',
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
  if (!entry) {
    recordMorrowindDiagnostic({ subsystem: 'animation', stage: 'asset-read', outcome: 'skipped', reasonCode: 'ASSET_ENTRY_MISSING' });
    return null;
  }
  recordMorrowindDiagnostic({ subsystem: 'animation', stage: 'asset-read', outcome: 'started', sourcePath: entry.path, assetType: 'kf' });
  let pending = cache.get(entry.url);
  if (!pending) {
    pending = fetch(entry.url).then(async (response) => {
      if (!response.ok) {
        recordMorrowindDiagnostic({ subsystem: 'animation', stage: 'asset-read', severity: 'error', outcome: 'error', sourcePath: entry.path, assetType: 'kf', reasonCode: 'ASSET_HTTP_ERROR', httpStatus: response.status });
        throw new Error('HTTP ' + response.status + ' loading ' + entry.path);
      }
      const data = new Uint8Array(await response.arrayBuffer());
      recordMorrowindDiagnostic({ subsystem: 'animation', stage: 'asset-read', outcome: 'ok', sourcePath: entry.path, assetType: 'kf', byteLength: data.byteLength });
      return data;
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
    recordMorrowindDiagnostic({ subsystem: 'animation', stage: 'candidate-load', severity: 'error', outcome: 'fallback', reasonCode: 'ANIMATION_PACK_LOAD_FAILED', detail: String(error?.message ?? error), fallback: 'archive-animations' });
    console.warn('[Morrowind animations] bundled walk set failed to load; archive animations remain active:', String(error?.message ?? error));
    return [];
  }
  if (!selected.length && !warnedMissingWalkAssets) {
    warnedMissingWalkAssets = true;
    console.warn('[Morrowind animations] no bundled walk KF source was selected.', inspectWalkAnimationAssets());
  }
  recordMorrowindDiagnostic({ subsystem: 'animation', stage: 'candidate-load', outcome: 'ok', actorContext: female ? 'female' : 'male', selectedCount: selected.length, selectedAssets: selected.map((item) => ({ sourcePath: item.name, provider: item.variant, family: item.family })) });
  return selected;
}
/** Resolve the mutually exclusive first-person provider from persisted settings. */
export function firstPersonAnimationProviderForChoice(choice = 1) {
  return ['vanilla', 'reanimation-v3', 'openmw-dynamic-first-person', 'reanimation-v3+openmw-dynamic-first-person'][
    Math.max(0, Math.min(3, Math.trunc(Number(choice) || 0)))
  ];
}

/** Restrict the OpenMW pack to named directional first-person locomotion clips. */
export function isOpenMWDynamicFirstPersonClip(path) {
  const normalized = norm(path);
  if (!normalized.includes('/openmw dynamic animations/animations/xbase_anim.1st/')) return false;
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return /^(?:walk|run|sneak)(?:forward|back|left|right)_base;\.kf$/.test(filename);
}

/** Map a selected OpenMW base clip to the vanilla group requested by gameplay. */
export function openMWDynamicFirstPersonGroup(path) {
  if (!isOpenMWDynamicFirstPersonClip(path)) return null;
  const filename = norm(path).slice(norm(path).lastIndexOf('/') + 1);
  const match = filename.match(/^((?:walk|run|sneak)(?:forward|back|left|right))_base;\.kf$/);
  if (!match) return null;
  // The runtime asks for lowercase movement groups (walkforward, runleft, ...).
  // OpenMW's directory names are title-cased, but animation group identity is not.
  return match[1].toLowerCase();
}

/**
 * ReAnimation and ODAR ship first-person KF files under xbase_anim.1st.
 * The female first-person rig uses the same named animation channels; clipReport
 * binds each KF by track name and rejects clips that cannot bind, so allow the
 * female skeleton through the same compatibility gate instead of silently
 * leaving every female first-person action on the archive source.
 */
export function isFirstPersonAnimationRigCompatible(skeletonPath) {
  const normalized = norm(skeletonPath);
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1);
  return /^(?:x?base_anim(?:_female)?\.1st\.nif)$/.test(filename);
}

/** Load one selected first-person provider in stable path order. */
export async function loadFirstPersonAnimationAssets({ skeletonPath } = {}) {
  if (!IN_BROWSER || !isFirstPersonAnimationRigCompatible(skeletonPath)) return [];
  const provider = firstPersonAnimationProviderForChoice(
    modSetting('morrowind-animation', 'FirstPersonSource'),
  );
  if (provider === 'vanilla') return [];
  // The providers are additive, not mutually exclusive: ReAnimation supplies
  // stance/weapon clips, while ODAR replaces directional locomotion only.
  const catalogs = [
    ...(provider.includes('reanimation-v3') ? [{ files: FIRST_PERSON_FILES, variant: 'reanimation-v3' }] : []),
    ...(provider.includes('openmw-dynamic-first-person') ? [{ files: OPENMW_DYNAMIC_FIRST_PERSON_FILES, variant: 'openmw-dynamic-first-person' }] : []),
  ];
  const files = catalogs.flatMap(({ files: catalog, variant }) => Object.entries(catalog)
    .map(([path, url]) => ({ path: path.replace(/\\/g, '/'), url, variant }))
    .filter((entry) => entry.variant !== 'openmw-dynamic-first-person' || isOpenMWDynamicFirstPersonClip(entry.path)))
    // The source search is reverse-priority: dynamic locomotion is last so it
    // overrides ReAnimation only where both define the same movement group.
    .sort((a, b) => Number(a.variant === 'openmw-dynamic-first-person') - Number(b.variant === 'openmw-dynamic-first-person')
      || a.path.localeCompare(b.path));
  const result = [];
  for (const entry of files) {
    try {
      const data = await bytes(entry);
      if (data) result.push({
        name: entry.path,
        bytes: data,
        family: 'first-person',
        variant: entry.variant,
        ...(entry.variant === 'openmw-dynamic-first-person' ? { targetGroup: openMWDynamicFirstPersonGroup(entry.path) } : {}),
      });
    } catch (error) {
      console.warn('[Morrowind animations] first-person clip failed to load; archive fallback retained:', entry.path, String(error?.message ?? error));
    }
  }
  return result;
}

/** Resolve the hit-reaction pack's skeleton folder from the actual third-person rig. */
export function hitReactionVariantForSkeleton(skeletonPath) {
  const normalized = norm(skeletonPath);
  const file = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (/^(?:x)?base_anim_female\.nif$/.test(file)) return 'female';
  if (/^(?:x)?base_animkna\.nif$/.test(file)) return 'beast';
  if (/^(?:x)?base_anim\.nif$/.test(file)) return 'male';
  return null;
}

/** Admit reaction clips only from the directory matching the active rig. */
export function isHitReactionAssetForSkeleton(assetPath, skeletonPath) {
  const variant = hitReactionVariantForSkeleton(skeletonPath);
  if (!variant) return false;
  const normalized = norm(assetPath);
  const match = normalized.match(/\/animations\/(x?base_anim(?:_female|kna)?)\//);
  if (!match) return false;
  const folder = match[1];
  const assetVariant = folder.includes('_female') ? 'female' : folder.endsWith('kna') ? 'beast' : 'male';
  return assetVariant === variant;
}

/** Normalize the group prefix on each text-key line, optionally keeping only selected groups. */
export function normalizeAnimationGroupKeys(keys, allowedGroups = null) {
  const accepted = allowedGroups == null ? null : new Set(allowedGroups.map((name) => String(name).toLowerCase()));
  const out = [];
  for (const key of keys ?? []) {
    const mapped = [];
    for (const line of String(key?.text ?? '').split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon <= 0) continue;
      const group = line.slice(0, colon).trim().toLowerCase();
      if (accepted && !accepted.has(group)) continue;
      mapped.push(group + line.slice(colon));
    }
    if (mapped.length) out.push({ ...key, text: mapped.join('\n') });
  }
  return out;
}

/** Remap only the named animation-group prefixes in text keys to a runtime group. */
export function remapAnimationGroupKeys(keys, sourceGroups, targetGroup) {
  const accepted = new Set((sourceGroups ?? []).map((name) => String(name).toLowerCase()));
  const target = String(targetGroup ?? '').toLowerCase();
  if (!accepted.size || !target) return [];
  const out = [];
  for (const key of keys ?? []) {
    const lines = String(key?.text ?? '').split(/\r?\n/);
    const mapped = [];
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon <= 0) continue;
      const group = line.slice(0, colon).trim().toLowerCase();
      if (accepted.has(group)) mapped.push(target + line.slice(colon));
    }
    if (mapped.length) out.push({ ...key, text: mapped.join('\n') });
  }
  return out;
}

/** Canonical gameplay group represented by an OpenMW Dynamic Animations third-person KF. */
export function openMWDynamicThirdPersonTargetGroup(path) {
  const normalized = norm(path);
  if (!normalized.includes('/openmw dynamic animations/animations/')) return null;
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.kf$/i, '').replace(/;\s*skip$/i, '').replace(/;$/, '');
  const stem = filename.replace(/^(?:x|z)/, '');
  const locomotion = stem.match(/^(walk|run|sneak|swim|swimrun)(forward|back|left|right)(?:_(?:base|dirn|march|mw|noble)[a-z0-9]*)?$/);
  if (locomotion) return `${locomotion[1]}${locomotion[2]}`;
  if (stem === 'armposes') return 'armposes';
  const idle = stem.match(/^idle(\d*)(?:_copy)?$/);
  if (idle) return `idle${idle[1]}`;
  if (/^arms[a-z]+$/.test(stem)) return stem;
  if (/^(?:jump|turnleft|turnright|readypose|zillarescale)$/.test(stem)) return stem;
  return null;
}

/** Source group name as authored in the mod's KF, before canonical remapping. */
export function openMWDynamicThirdPersonSourceGroup(path) {
  const normalized = norm(path);
  const filename = normalized.slice(normalized.lastIndexOf('/') + 1).replace(/\.kf$/i, '').replace(/;\s*skip$/i, '').replace(/;$/, '');
  return filename.toLowerCase();
}

/** A stable FNV-1a hash for deterministic per-actor variant selection. */
function stableAnimationHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Choose one deterministic variant per canonical group for this actor. */
export function selectOpenMWDynamicAnimationVariants(assets, seed = '') {
  const byGroup = new Map();
  for (const asset of assets ?? []) {
    const group = String(asset?.targetGroup ?? '').toLowerCase();
    if (!group) continue;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(asset);
  }
  const selected = [];
  for (const [group, candidates] of byGroup) {
    candidates.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    // The stock ODAR presets use base15 as the general walk-forward gait;
    // base13/base11 are speed presets, while march/noble clips are profile-
    // specific. Our runtime already scales root velocity to actor speed, so
    // keep the general base15 gait unless no compatible base15 exists.
    if (group === 'walkforward') {
      const preferred = [
        /walkforward_base15;?\.kf$/i,
        /walkforward_mw15;?\.kf$/i,
        /walkforward_base13;?\.kf$/i,
        /walkforward_base11;?\.kf$/i,
        /walkforward_dirn15;?\.kf$/i,
      ];
      const chosen = preferred.map((pattern) => candidates.find((asset) => pattern.test(String(asset.name)))).find(Boolean);
      if (chosen) { selected.push(chosen); continue; }
    }
    selected.push(candidates[stableAnimationHash(`${seed}:${group}`) % candidates.length]);
  }
  return selected.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Load the mod's third-person KF variants matching the active rig folder. */
export async function loadOpenMWDynamicThirdPersonAnimationAssets({ skeletonPath, race = '' } = {}) {
  if (!IN_BROWSER || modSetting('morrowind-animation', 'OpenMWDynamicAnimations') !== 1) return [];
  const normalizedSkeleton = norm(skeletonPath);
  const skeletonFile = normalizedSkeleton.slice(normalizedSkeleton.lastIndexOf('/') + 1);
  const folder = skeletonFile.replace(/\.nif$/i, '');
  const isArgonianBeast = String(race).toLowerCase() === 'argonian' && /base_animkna$/i.test(folder);
  const files = Object.entries(OPENMW_DYNAMIC_THIRD_PERSON_FILES)
    .map(([path, url]) => ({ path: path.replace(/\\/g, '/'), url }))
    .filter((entry) => {
      const p = norm(entry.path);
      if (!p.includes('/animations/')) return false;
      if (p.includes('/animations/') && p.includes(`/${folder}/`)) return true;
      return isArgonianBeast && p.includes('/animations/xargonian_swimkna/');
    })
    .map((entry) => ({ ...entry, targetGroup: openMWDynamicThirdPersonTargetGroup(entry.path) }))
    .filter((entry) => !!entry.targetGroup)
    .sort((a, b) => a.path.localeCompare(b.path));
  const result = [];
  for (const entry of files) {
    try {
      const data = await bytes(entry);
      if (data) result.push({
        name: entry.path, bytes: data, targetGroup: entry.targetGroup,
        sourceGroup: openMWDynamicThirdPersonSourceGroup(entry.path),
        family: 'dynamic-third-person', variant: 'openmw-dynamic-animations',
      });
    } catch (error) {
      console.warn('[Morrowind animations] OpenMW third-person KF failed to load; archive source retained:', entry.path, String(error?.message ?? error));
    }
  }
  return result;
}

/** OpenMW Hit Reactions' per-KF entry and stagger-recovery transition rules. */
export function hitReactionTransitionBlend(fromSource, toSource, progress) {
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  if (toSource?.animationPack === 'hit-reactions-v2') {
    // xHitReact.yaml: sineOut/0.1 s; every stagger/death KF's own YAML: sineOut/0.08 s.
    const duration = toSource.reactionKind === 'hit' ? 0.1 : 0.08;
    return { duration, easing: 'sineOut', weight: Math.sin(t * Math.PI / 2) };
  }
  if (fromSource?.animationPack === 'hit-reactions-v2' && fromSource?.reactionKind === 'stagger') {
    // animation-config.yaml: stagger* -> * uses cubicOut/0.5 s.
    return { duration: 0.5, easing: 'cubicOut', weight: 1 - Math.pow(1 - t, 3) };
  }
  if (fromSource?.animationPack === 'hit-reactions-v2' && fromSource?.reactionKind === 'hit') {
    // OpenMW's global catch-all rule is sineOut/0.25 s when leaving HitReact.
    return { duration: 0.25, easing: 'sineOut', weight: Math.sin(t * Math.PI / 2) };
  }
  return null;
}

/** Backwards-compatible helper for callers/tests concerned only with recovery. */
export function hitReactionRecoveryBlend(fromSource, progress) {
  return hitReactionTransitionBlend(fromSource, null, progress);
}

/** The target group consumed by the existing combat state machine. */
export function hitReactionTargetGroup(assetPath, hitIndex, deathIndex) {
  const name = norm(assetPath).slice(norm(assetPath).lastIndexOf('/') + 1);
  if (/death/i.test(name)) return { family: 'death', group: `death${Math.max(1, Math.trunc(Number(deathIndex) || 1))}` };
  if (/(?:hit|stagger)/i.test(name)) return { family: 'hit', group: `hit${Math.max(1, Math.trunc(Number(hitIndex) || 1))}` };
  return null;
}

/** Load third-person hit-reaction KF files in stable path order for one rig. */
export async function loadHitReactionAnimationAssets({ skeletonPath } = {}) {
  if (!IN_BROWSER || modSetting('morrowind-animation', 'HitReactionSource') === 0) return [];
  const files = Object.entries(HIT_REACTION_FILES)
    .map(([path, url]) => ({ path: path.replace(/\\/g, '/'), url }))
    .filter((entry) => isHitReactionAssetForSkeleton(entry.path, skeletonPath))
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
