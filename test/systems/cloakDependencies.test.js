import test from 'node:test';
import assert from 'node:assert/strict';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { animatedCloaksEnabled, animatedCloaksRequirement, extraAppearanceRequirements, extraAppearanceEnabled } from '../../src/systems/extraAppearance.js';
import { setModGroupEnabled, modResourceGlob } from '../../src/systems/enhancedModResources.js';
import { MOD_PACKS } from '../../src/systems/enhancedModCatalog.js';
test('standard cloak animation needs 3D customization, while new cloak and armor need connected replacement bodies',()=>{
 const old=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 const previous=getPref('modelCustomization');
 try{
  setModGroupEnabled('cloak-animation',true);setModGroupEnabled('animations',false);setModGroupEnabled('bodies',false);
  setPref('modelCustomization',false);assert.ok(animatedCloaksRequirement());assert.equal(animatedCloaksEnabled(),false);
  setPref('modelCustomization',true);assert.equal(animatedCloaksEnabled(),true,'standard cloak is independent of animation packs and replacement bodies');
  assert.equal(extraAppearanceEnabled('armor'),false);assert.equal(extraAppearanceEnabled('cloak'),false);
  assert.match(extraAppearanceRequirements('cloak').join(' '),/Better Bodies/);
  setModGroupEnabled('bodies',true);assert.equal(extraAppearanceEnabled('cloak'),false,'enabled group without files is insufficient');
  for(const pack of MOD_PACKS.filter(p=>p.group==='bodies')){const path='../../Mods/'+pack.folder+'/test.nif';modResourceGlob('../../Mods/**/*',{[path]:'test-url'});}
  assert.equal(extraAppearanceEnabled('armor'),true);assert.equal(extraAppearanceEnabled('cloak'),true);
  setModGroupEnabled('cloak-animation',false);assert.equal(extraAppearanceEnabled('cloak'),false);assert.equal(extraAppearanceEnabled('armor'),true);
  setPref('modelCustomization',false);assert.equal(animatedCloaksEnabled(),false);assert.equal(extraAppearanceEnabled('armor'),false);
 }finally{setModGroupEnabled('bodies',true);setModGroupEnabled('animations',true);setModGroupEnabled('cloak-animation',true);setPref('modelCustomization',previous);globalThis.localStorage=old;}
});
