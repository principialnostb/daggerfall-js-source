// Network motion state is discrete. A rising scene Y alone also happens
// on stairs, slopes and moving platforms.
export function motionPoseOf(player, riding) {
  if (riding || player.climb?.isClimbing) return {};
  if (player.levitating) return { mair: 3 };
  if (player.swimming) return { mair: 2 };
  return {
    ...(player.grounded === false ? { mair: 1 } : {}),
    ...(player.isSneaking || player.crouching ? { mcr: 1 } : {}),
  };
}