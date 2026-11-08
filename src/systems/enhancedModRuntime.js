import { modGroupEnabled } from './enhancedModResources.js';
export function enabledModValue(vendor, key, value) {
  if(vendor === 'morrowind-animation') {
    if(key === 'SimplyAnimatedCloaks') return modGroupEnabled('cloak-animation') ? 1 : 0;
    if(key === 'HitReactionSource' && !modGroupEnabled('reactions')) return 0;
    if(!modGroupEnabled('animations') && ['AnimationBlendDuration','MotionDoctrine','FirstPersonSource','OpenMWDynamicAnimations','PlayerWalkSource','PlayerRunSource','NpcMaleWalk','NpcFemaleWalk','NpcFemaleRun'].includes(key)) return 0;
  }
  if(vendor === 'morrowind-textures' && !modGroupEnabled('bodies')) {
    if(['BetterBodies','SeamlessDMRA'].includes(key)) return false;
    if(['BetterBodiesSource','SeamlessDMRASource','FirstPersonHands'].includes(key)) return 0;
  }
  return value;
}
