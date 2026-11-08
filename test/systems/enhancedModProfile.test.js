import test from 'node:test';
import assert from 'node:assert/strict';
import { standardModValue, enableStandardModProfile } from '../../src/systems/enhancedModProfile.js';
test('standard profile captures effective values without reinterpreting Vanilla or changing unrelated controls',()=>{
 assert.equal(standardModValue('morrowind-animation','FirstPersonSource',3),3);
 enableStandardModProfile();
 assert.equal(standardModValue('morrowind-animation','FirstPersonSource',3),3);
 assert.equal(standardModValue('morrowind-animation','FirstPersonSource',0),3);
 assert.equal(standardModValue('morrowind-textures','BetterBodies',true),true);
 assert.equal(standardModValue('morrowind-textures','BetterBodies',false),true);
 assert.equal(standardModValue('morrowind-textures','SeamlessDMRA',false),false);
 assert.equal(standardModValue('morrowind-textures','SeamlessDMRA',true),false);
 assert.equal(standardModValue('morrowind-textures','IntelligentTextures',true),true);
 assert.equal(standardModValue('morrowind-textures','IntelligentTextures',false),false);
});
