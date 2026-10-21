/**
 * Deterministic inventory for the animation packs staged under Mods/Animations.
 *
 * This is deliberately not a runtime asset loader. A provider may be routed
 * into a live animation resolver only after its KF/NIF groups, skeleton
 * compatibility, scope and permissions have been verified and a real consumer
 * exists. Keeping staged packs here makes their state explicit without
 * accidentally activating files because a glob or folder order changed.
 */

export const ANIMATION_PACK_STATUS = Object.freeze({
  integrated: 'integrated',
  staged: 'staged',
  blockedPermission: 'blocked-permission',
});

export const ANIMATION_PACKS = Object.freeze([
  Object.freeze({
    id: 'reanimation-v3',
    title: 'ReAnimation v3 - Complete - first-person animation pack',
    nexusUrl: 'https://www.nexusmods.com/morrowind/mods/52596',
    status: ANIMATION_PACK_STATUS.blockedPermission,
    sourceRoot: 'Mods/Animations/ReAnimation v3 - Complete - first-person animation pack/00 Core',
    assetPattern: 'Animations/xbase_anim.1st/**/*.kf',
    domains: Object.freeze([
      'first-person.idle',
      'first-person.locomotion',
      'first-person.combat',
      'first-person.equipment',
      'first-person.jump-sneak',
    ]),
    runtimeMode: 'assets-only',
    notes: 'The Nexus page prohibits conversion to other games and limits redistribution. Do not use these assets in this port unless the author grants explicit permission. If permission is granted, enumerate text-key groups and validate the first-person skeleton before adding a consumer. FBA compatibility and thrown-projectile fixes are separate optional components.',
  }),
  Object.freeze({
    id: 'openmw-dynamic-animations',
    title: 'OpenMW Dynamic Animations',
    nexusUrl: 'https://www.nexusmods.com/morrowind/mods/57633',
    status: ANIMATION_PACK_STATUS.staged,
    sourceRoot: 'Mods/Animations/OpenMW Dynamic Animations',
    assetPattern: 'animations/**/*.kf',
    domains: Object.freeze([
      'third-person.idle',
      'third-person.locomotion',
      'first-person.locomotion',
      'race-specific.animations',
    ]),
    runtimeMode: 'assets-only',
    notes: 'KF/YAML assets can be evaluated independently. The OpenMW .omwscripts/Lua behavior is not executed by the browser runtime; integrate only verified static animation groups through domain-scoped selectors.',
  }),
  Object.freeze({
    id: 'hit-reactions-animated-v2',
    title: 'Hit Reactions Animated v2 -- OpenMW',
    nexusUrl: 'https://www.nexusmods.com/morrowind/mods/56594',
    status: ANIMATION_PACK_STATUS.blockedPermission,
    sourceRoot: 'Mods/Animations/Hit Reactions Animated v2 -- OpenMW',
    assetPattern: 'Animations/**/*.{kf,nif,yaml}',
    domains: Object.freeze([
      'third-person.hit-reaction',
      'third-person.stagger',
      'third-person.death',
    ]),
    runtimeMode: 'not-enabled',
    notes: 'The Nexus page requires permission to use the assets and prohibits conversion to other games. Keep staged files out of runtime discovery until the author grants explicit permission for this port.',
  }),
]);

const byId = new Map(ANIMATION_PACKS.map((pack) => [pack.id, pack]));

/**
 * Gate a requested provider by stable ID, domain, permission/integration
 * status. Callers must treat a non-ok result as a Vanilla/archive fallback;
 * this helper never picks a provider based on directory order.
 */
export function resolveAnimationPack({ providerId, domain } = {}) {
  if (!providerId || providerId === 'vanilla') {
    return { ok: true, providerId: 'vanilla', reason: 'explicit-vanilla' };
  }
  const pack = byId.get(String(providerId));
  if (!pack) return { ok: false, providerId: 'vanilla', reason: 'unknown-provider' };
  if (!pack.domains.includes(String(domain))) {
    return { ok: false, providerId: 'vanilla', reason: 'domain-mismatch', packId: pack.id };
  }
  if (pack.status === ANIMATION_PACK_STATUS.blockedPermission) {
    return { ok: false, providerId: 'vanilla', reason: 'permission-required', packId: pack.id };
  }
  if (pack.status !== ANIMATION_PACK_STATUS.integrated) {
    return { ok: false, providerId: 'vanilla', reason: 'runtime-not-integrated', packId: pack.id };
  }
  return { ok: true, providerId: pack.id, reason: 'selected', pack };
}

export function animationPackById(id) {
  return byId.get(String(id)) ?? null;
}
