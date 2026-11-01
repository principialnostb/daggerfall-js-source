// @ts-check
// MW-STOCK (test-PR): the one set of Morrowind sources the build ships, in place of the fork's settings rows. Each value
// is the index the row stored; docs/PR-Integration-Guide.md says what each means. A pack whose files are absent falls
// back to the game's own clips and bodies (the loaders' own fallback), so a checkout without Mods/ still runs.
export const MW_STOCK = Object.freeze({
  AnimationBlendDuration: 2, // Smooth, 0.25 s
  MotionDoctrine: 1, // the formula: stride, seams, hitstop, first-person weight
  FirstPersonSource: 3, // ReAnimation v3 with OpenMW Dynamic Animations' directional walks over it
  OpenMWDynamicAnimations: 1, // OpenMW Dynamic Animations, third person
  HitReactionSource: 0, // the game's own reactions
  PlayerWalkSource: 1, // Vanilla
  PlayerRunSource: 1,
  NpcMaleWalk: 1,
  NpcFemaleWalk: 1,
  NpcFemaleRun: 1,
  BetterBodiesSource: 2, // Better Bodies: the geometry of the PR's item 4
  FirstPersonHands: 1, // Better Hands
  SeamlessDMRASource: 1, // not selected
  HighResolutionBetterBodyFemaleTexturesSource: 1, // not selected: its readme forbids redistribution
  HighResolutionBetterBodyFemaleTextures: false,
});
