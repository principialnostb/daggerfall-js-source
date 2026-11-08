import test from 'node:test';
import assert from 'node:assert/strict';
import { setModGroupEnabled, modResourceSignature, modResourceAllowed } from '../../src/systems/enhancedModResources.js';
import { modSetting } from '../../src/systems/modSettings.js';

test('group toggles gate real runtime settings and restoring a group recovers the chosen profile',()=>{
 const old=globalThis.localStorage;
 const memory=new Map();
 globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 const choices=[['animations','morrowind-animation','FirstPersonSource',0],['animations','morrowind-animation','OpenMWDynamicAnimations',0],['reactions','morrowind-animation','HitReactionSource',0],['bodies','morrowind-textures','BetterBodies',false],['bodies','morrowind-textures','BetterBodiesSource',0],['bodies','morrowind-textures','FirstPersonHands',0]];
 try{
  for(const [group,vendor,key,off] of choices){
   setModGroupEnabled(group,true);const selected=modSetting(vendor,key);
   setModGroupEnabled(group,false);assert.equal(modSetting(vendor,key),off,key);
   setModGroupEnabled(group,true);assert.equal(modSetting(vendor,key),selected,key);
  }
 }finally{globalThis.localStorage=old;}
});

test('resource signature distinguishes disabled variants and recovers on reenable without discarding files',()=>{
 const old=globalThis.localStorage;
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 try{
  setModGroupEnabled('animations',true);
  const before=modResourceSignature();
  const path='../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf';
  assert.equal(modResourceAllowed(path),true);
  setModGroupEnabled('animations',false);
  assert.notEqual(modResourceSignature(),before);
  assert.equal(modResourceAllowed(path),false);
  assert.equal(modSetting('morrowind-animation','AnimationBlendDuration'),0);
  assert.equal(modSetting('morrowind-animation','MotionDoctrine'),0);
  setModGroupEnabled('animations',true);
  assert.equal(modResourceSignature(),before);
  assert.equal(modResourceAllowed(path),true);
 }finally{setModGroupEnabled('animations',true);globalThis.localStorage=old;}
});
