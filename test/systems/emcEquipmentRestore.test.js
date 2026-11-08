import { MOD_PACKS } from '../../src/systems/enhancedModCatalog.js';
import { modResourceGlob } from '../../src/systems/enhancedModResources.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ownArmorParts } from '../../src/characters/ownModels/ownArmorModels.js';
import { enabledModValue } from '../../src/systems/enhancedModRuntime.js';
import { modGroupReady } from '../../src/systems/enhancedModResources.js';

for(const pack of MOD_PACKS.filter(p=>p.group==='bodies')) { const path='../../Mods/'+pack.folder+'/test.nif'; modResourceGlob('../../Mods/**/*',{[path]:'test-url'}); }

test('a missing saved armor mesh falls back to standard parts without rewriting the selected style',()=>{
 setPref('modelCustomization',true);
 const standard=[{model:'plate.nif'}],imported=[{model:'iron.nif'}];
 const own={id:'test-cuirass',parts:standard,styles:{plate:standard,iron:imported}};
 const looks={'test-cuirass':'iron'};
 assert.equal(ownArmorParts(own,{looks,hasModel:()=>false}),standard);
 assert.equal(ownArmorParts(own,{looks,hasModel:()=>true}),imported);
 assert.equal(looks['test-cuirass'],'iron');
 setPref('modelCustomization',false);
});
test('the supported cloak mode is Vanilla Animated regardless of retired dev selection',()=>{
 assert.equal(enabledModValue('morrowind-animation','SimplyAnimatedCloaks',0),1);
 assert.equal(enabledModValue('morrowind-animation','SimplyAnimatedCloaks',2),1);
});
test('pixelation prerequisite becomes available after required body resources are registered',()=>{
 assert.equal(modGroupReady('bodies'),true);
});
