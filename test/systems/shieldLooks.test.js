import test from 'node:test';
import assert from 'node:assert/strict';
import { SHIELD_LOOKS, shieldLookKey, selectedShieldLook } from '../../src/characters/ownModels/shieldLooks.js';
import { lookChoices, setLookVariant, ARMOR_LOOKS_PREF } from '../../src/systems/lookVariants.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { composeWornArmor, mwArmorRecords } from '../../src/formats/morrowind/mwItemMap.js';
import { readFileSync, existsSync } from 'node:fs';
import { assembleFirstPersonArm, poseAssembly } from '../../src/formats/morrowind/mwFirstPerson.js';
import { FEMALE_SKELETON } from '../../tools/skyrim/mwBody.mjs';

test('shield appearances validate both material and exact shield class, including stale saved choices',()=>{
  for(const look of SHIELD_LOOKS) {
    const item={templateIndex:look.templateIndex,material:look.material};
    const prefs={[shieldLookKey(item)]:look.value};
    assert.equal(selectedShieldLook(item,prefs),look);
    for(const templateIndex of [109,110,111,112]) for(const material of Object.values(ARMOR_MATERIAL)) {
      if(templateIndex===item.templateIndex && material===item.material)continue;
      const other={templateIndex,material};
      assert.equal(selectedShieldLook(other,{[shieldLookKey(other)]:look.value}),null);
    }
  }
});
test('inventory choice reaches shield composition and Original restores the normal record resolver',()=>{
  const before=getPref(ARMOR_LOOKS_PREF);
  try {
    setPref(ARMOR_LOOKS_PREF,null);
    const item={templateIndex:110,material:ARMOR_MATERIAL.Iron};
    assert.deepEqual(lookChoices(item).map(c=>c.value),['classic','skyrim-iron','skyrim-banded-iron']);
    assert.equal(setLookVariant(item,'skyrim-steel'),false);
    assert.equal(setLookVariant(item,'skyrim-banded-iron'),true);
    const prefs=getPref(ARMOR_LOOKS_PREF);
    const result=composeWornArmor({pieces:[{kind:'armor',...item}],armors:[],clothes:[],bodyPool:[],looks:prefs});
    assert.ok(result.adds.some(p=>p.slot.startsWith('shield (') && p.model==='shield_sky_banded_iron.nif'));
    assert.equal(setLookVariant(item,'classic'),true);
    const records=[{id:'iron_shield',model:'original.nif'}];
    assert.equal(mwArmorRecords(records,110,item.material,getPref(ARMOR_LOOKS_PREF)).records[0].model,'original.nif');
  } finally {setPref(ARMOR_LOOKS_PREF,before);}
});
test('local shield imports bind as rigid carried shields and remain finite in the runtime pose', {skip:!existsSync('src/assets/mw/meshes/shield_sky_iron.nif')},async()=>{
  for(const look of SHIELD_LOOKS) {
    const arm=await assembleFirstPersonArm({skeletonBytes:new Uint8Array(readFileSync(FEMALE_SKELETON)),parts:[{slot:`shield (${look.value})`,bones:['shield bone'],bytes:new Uint8Array(readFileSync(`src/assets/mw/meshes/${look.model}`))}]});
    assert.equal(arm.ok,true);
    assert.ok(arm.pieces.length && arm.pieces.every(p=>p.kind==='rigid'));
    poseAssembly(arm);
    assert.ok(arm.pieces.every(p=>p.positions.every(Number.isFinite)));
  }
});
