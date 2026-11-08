import test from 'node:test';
import assert from 'node:assert/strict';
import { activeAppearanceIdentity, appearanceDisplayKey, currentAppearanceResult } from '../../src/characters/activeAppearance.js';
import { setAppearanceIdentity, getAppearanceIdentity } from '../../src/characters/bodyMorphs.js';
import { setModGroupEnabled } from '../../src/systems/enhancedModResources.js';
import { paperDollDisplayIdentity } from '../../src/ui/paperDoll.js';
import { playerHeadKey, _setHeadDataForTests } from '../../src/characters/headPortraits.js';

test('body group controls portrait and paperdoll identity while preserving the saved editor appearance',async()=>{
 const previous=globalThis.localStorage;
 const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 try{
  setModGroupEnabled('bodies',true);
  const saved=setAppearanceIdentity({race:'darkelf',female:true,faceIndex:4,headId:'custom_head'});
  const entity={race:'Nord',gender:'male',faceIndex:2};
  assert.equal(activeAppearanceIdentity().race,'darkelf');
  const enabledKey=appearanceDisplayKey();
  assert.equal(paperDollDisplayIdentity(entity).faceIndex,4);
  _setHeadDataForTests({morrowindDataCount:()=>1,morrowindDataGeneration:()=>1});
  const portraitKey=playerHeadKey(entity);
  let finish;const pending=currentAppearanceResult(()=>new Promise(resolve=>{finish=resolve;}),{});
  setModGroupEnabled('bodies',false);
  assert.equal(activeAppearanceIdentity(),null);
  assert.deepEqual(paperDollDisplayIdentity(entity),entity);
  assert.notEqual(appearanceDisplayKey(),enabledKey);
  assert.notEqual(playerHeadKey(entity),portraitKey);
  finish({pixels:'old editor face'});assert.equal(await pending,null);
  assert.deepEqual(getAppearanceIdentity(),saved);
  setModGroupEnabled('bodies',true);
  assert.equal(appearanceDisplayKey(),enabledKey);
  assert.equal(paperDollDisplayIdentity(entity).faceIndex,4);
  assert.deepEqual(entity,{race:'Nord',gender:'male',faceIndex:2});
 }finally{setModGroupEnabled('bodies',true);_setHeadDataForTests(null);globalThis.localStorage=previous;}
});
