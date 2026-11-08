import { MOD_PACKS } from '../../src/systems/enhancedModCatalog.js';
import { modResourceGlob } from '../../src/systems/enhancedModResources.js';
import { setModGroupEnabled } from '../../src/systems/enhancedModResources.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getPref, setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { extraAppearanceEnabled } from '../../src/systems/extraAppearance.js';
import { ownArmorParts } from '../../src/characters/ownModels/ownArmorModels.js';
for(const pack of MOD_PACKS.filter(p=>p.group==='bodies')) { const path='../../Mods/'+pack.folder+'/test.nif'; modResourceGlob('../../Mods/**/*',{[path]:'test-url'}); }

test('extra armor falls back when disabled and restores the saved variant when enabled',()=>{
 const saved={'test':'iron'},base=[{model:'plate.nif'}],iron=[{model:'iron.nif'}];
 const own={id:'test',parts:base,styles:{iron}};
 setPref('modelCustomization',true);setPref('extraArmorLooks',true);
 assert.equal(ownArmorParts(own,{looks:saved,hasModel:()=>true}),iron);
 setPref('extraArmorLooks',false);
 assert.equal(ownArmorParts(own,{looks:saved,hasModel:()=>true}),base);
 assert.equal(saved.test,'iron');
 setPref('extraArmorLooks',true);
 assert.equal(ownArmorParts(own,{looks:saved,hasModel:()=>true}),iron);
 setPref('modelCustomization',false);
 assert.equal(ownArmorParts(own,{looks:saved,hasModel:()=>true}),base);
 _resetForTests();
});
test('extra cloaks require animated cloaks and 3D customization without clearing saved choices',()=>{
 const old=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 setPref('modelCustomization',true);setPref('extraCloakLooks',true);setModGroupEnabled('cloak-animation',true);
 setPref('mwCloakLooks',{154:'wolf-white'});
 assert.equal(extraAppearanceEnabled('cloak'),true);
 setModGroupEnabled('cloak-animation',false);assert.equal(extraAppearanceEnabled('cloak'),false);
 assert.equal(getPref('mwCloakLooks')[154],'wolf-white');
 setModGroupEnabled('cloak-animation',true);assert.equal(extraAppearanceEnabled('cloak'),true);
 setPref('modelCustomization',false);assert.equal(extraAppearanceEnabled('weapon'),false);
 assert.equal(extraAppearanceEnabled('armor'),false);
 globalThis.localStorage=old;
 _resetForTests();
});
