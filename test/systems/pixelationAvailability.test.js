import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../../src/systems/features.js';
import { tileStates, pixelationRequirement } from '../../src/ui/enhanced/enhancedMenu.js';
import { MOD_PACKS } from '../../src/systems/enhancedModCatalog.js';
import { modResourceGlob, setModGroupEnabled } from '../../src/systems/enhancedModResources.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';

test('the three character pixelation controls stay disabled until body resources are connected and enabled',()=>{
 const old=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 const ids=['char-pixel-fp','char-pixel-player','char-pixel-npc'];
 const keys=['charPixelFp','charPixelPlayer','charPixelNpc'];
 try{
  for(let i=0;i<ids.length;i++){
   setPref(keys[i],360);
   const state=tileStates(FEATURES.find(f=>f.id===ids[i]));
   assert.equal(state.locked,true);
   assert.match(state.lockReason,/EMC/);
   state.set(0);assert.equal(getPref(keys[i]),360);
  }
  for(const pack of MOD_PACKS.filter(p=>p.group==='bodies')){
   const path='../../Mods/'+pack.folder+'/test.nif';
   modResourceGlob('../../Mods/**/*',{[path]:'test-url'});
  }
  setModGroupEnabled('bodies',true);
  for(const id of ids)assert.equal(tileStates(FEATURES.find(f=>f.id===id)).locked,false);
  const active=tileStates(FEATURES.find(f=>f.id===ids[0]));
  active.set(0);assert.equal(getPref(keys[0]),0);
  setModGroupEnabled('bodies',false);
  active.set(2);assert.equal(getPref(keys[0]),0,'a stale handler must not write after disconnect');
  for(const id of ids)assert.equal(tileStates(FEATURES.find(f=>f.id===id)).locked,true);
  assert.equal(pixelationRequirement('world-pixel-objects'),null,'decor is independent');
 }finally{setModGroupEnabled('bodies',true);globalThis.localStorage=old;}
});
