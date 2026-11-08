import { appStorage } from './appStorage.js';
const KEY='enhanced-mod-profile-v1';
const keys = {
  'morrowind-animation':['SimplyAnimatedCloaks','AnimationBlendDuration','BlowStyle','MotionDoctrine','FirstPersonSource','OpenMWDynamicAnimations','HitReactionSource','PlayerWalkSource','PlayerRunSource','NpcMaleWalk','NpcFemaleWalk','NpcFemaleRun'],
  'morrowind-textures':['BetterBodies','BetterBodiesSource','FirstPersonHands','SeamlessDMRA','SeamlessDMRASource'],
};
let profile;
let active = false;
export function enableStandardModProfile(){ active = true; }
export function standardModValue(vendor,key,effective){
  if(!active || !keys[vendor]?.includes(key))return effective;
  if(!profile){try{profile=JSON.parse(appStorage()?.getItem(KEY)||'{}');}catch{profile={};}}
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) profile = {};
  const id=vendor+'/'+key;
  if(!Object.hasOwn(profile,id)){
    profile[id]=effective;
    try{appStorage()?.setItem(KEY,JSON.stringify(profile));}catch{/* Keep the effective source if storage is unavailable. */}
  }
  return profile[id];
}
