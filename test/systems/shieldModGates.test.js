import test from 'node:test';
import assert from 'node:assert/strict';
import { setModGroupEnabled } from '../../src/systems/enhancedModResources.js';
import { bashesNow } from '../../src/combat/blowFlow.js';
import { shieldGuardStance, shieldBashHold } from '../../src/combat/shieldGuard.js';
import { leftArmModeOf } from '../../src/combat/leftArmLayer.js';
import { MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';
import { selectedShieldLook, SHIELD_LOOKS } from '../../src/characters/ownModels/shieldLooks.js';
import { inventoryFaceIndex, setInventoryFaceIndex } from '../../src/systems/inventoryFace.js';
import { setPref } from '../../src/systems/uiPrefs.js';

test('disabling animations removes procedural shield attacks and stance overrides',()=>{
 const old=globalThis.localStorage;globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 try{
  setModGroupEnabled('animations',true);
  assert.equal(bashesNow({thrust:true,shield:true,fists:true}),true);
  assert.equal(shieldGuardStance(MW_WEAPON_TYPE.HandToHand,true),MW_WEAPON_TYPE.LongBladeOneHand);
  setModGroupEnabled('animations',false);
  assert.equal(bashesNow({thrust:true,shield:true,fists:true}),false);
  assert.equal(shieldGuardStance(MW_WEAPON_TYPE.HandToHand,true),MW_WEAPON_TYPE.HandToHand);
  assert.equal(shieldBashHold('AttackRelease',.5),null);
  assert.equal(leftArmModeOf({shield:true,type:MW_WEAPON_TYPE.HandToHand}),null);
  const look=SHIELD_LOOKS[0],item={templateIndex:look.templateIndex,material:look.material};
  const selections={[`shield:${item.templateIndex}:${item.material}`]:look.value};
  setModGroupEnabled('bodies',true);assert.equal(selectedShieldLook(item,selections),look);
  setModGroupEnabled('bodies',false);assert.equal(selectedShieldLook(item,selections),null);
  setModGroupEnabled('bodies',true);assert.equal(selectedShieldLook(item,selections),look);
 }finally{setModGroupEnabled('animations',true);setModGroupEnabled('bodies',true);globalThis.localStorage=old;}
});
test('2D portrait customization does not affect the paperdoll while disabled',()=>{
 const entity={name:'Gate test'},identity={race:'Nord',gender:'male'};
 setPref('paperdollCustomization',true);setInventoryFaceIndex(entity,identity,3);
 assert.equal(inventoryFaceIndex(entity,identity),3);
 setPref('paperdollCustomization',false);assert.equal(inventoryFaceIndex(entity,identity),null);
 setPref('paperdollCustomization',true);assert.equal(inventoryFaceIndex(entity,identity),3);
});
