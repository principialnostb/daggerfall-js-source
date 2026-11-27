import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandomClothing, ITEM_GROUPS } from '../../src/systems/loot/loot.js';
import { setItemFields } from '../../src/systems/item/itemTemplates.js';
import { inventoryItemImage } from '../../src/systems/item/itemTemplates.js';
import { paperdollItemImage } from '../../src/ui/paperDoll.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { paperdollLookChoices, paperdollLookOf, setPaperdollLook, setPaperdollDye } from '../../src/systems/paperdollLooks.js';
import { modelLookOf, setModelLook, noteModelLookPlayer } from '../../src/systems/modelLooks.js';
import { lookVariantsOf, setLookVariant } from '../../src/systems/lookVariants.js';
import { itemAppearanceKey, itemOwnStyleFields } from '../../src/systems/item/itemAppearanceKey.js';
import { modelDyeKey, modelDyeOf, setModelDye, modelDyeMips } from '../../src/systems/modelDye.js';
import { dfWornArmor } from '../../src/formats/morrowind/mwItemMap.js';
import { EQUIP_SLOTS } from '../../src/systems/equip.js';

const mint = (template) => {
  let first = true;
  return setItemFields(createRandomClothing('male', () => first ? (first = false, (ITEM_GROUPS.MensClothing.indexOf(template) + .1) / ITEM_GROUPS.MensClothing.length) : 0));
};
const scoped = (fn) => () => {
  const names=['paperdollLooks','helmetPaperdollLooks','mwRecordLooks','mwItemOwnLooks','mwItemDyes','modelCustomization','paperdollCustomization'];
  const previous=names.map(n=>getPref(n));
  try {for(const n of names.slice(0,5))setPref(n,null);setPref('modelCustomization',true);setPref('paperdollCustomization',true);fn();}
  finally {names.forEach((n,i)=>setPref(n,previous[i]));}
};

test('identical shirts and pants retain independent 2D shape and dye through save copies', scoped(() => {
  for(const t of [165,151]) {
    const one=mint(t),two=mint(t), untouched=JSON.stringify(two);
    const choice=paperdollLookChoices(one)[0];
    assert.ok(setPaperdollLook(one,choice));assert.ok(setPaperdollDye(one,2));
    assert.equal(paperdollLookOf(two),null);assert.equal(JSON.stringify(two),untouched);
    assert.equal(paperdollItemImage(two).dye,0);assert.equal(inventoryItemImage(two).dye,0);
    const restored=setItemFields(JSON.parse(JSON.stringify(one)));
    assert.deepEqual(paperdollLookOf(restored),paperdollLookOf(one));
    assert.equal(paperdollItemImage(restored).dye,2);assert.equal(inventoryItemImage(restored).dye,2);
    assert.ok(setPaperdollDye(two,9));assert.notEqual(itemAppearanceKey(one),itemAppearanceKey(two));
    assert.equal(paperdollItemImage(one).dye,2);
  }
}));

test('native and own 3D look selections do not change another matching instance', scoped(() => {
  const one=mint(165),two=mint(165);setModelLook(one,'common_shirt_02');
  assert.equal(modelLookOf(two),null);assert.equal(modelLookOf(setItemFields(JSON.parse(JSON.stringify(one)))),'common_shirt_02');
  const helm1={group:'Armor',templateIndex:107,material:513},helm2={...helm1};
  const choices=lookVariantsOf(helm1);const value=choices.values.find(v=>v!==choices.current);
  assert.ok(value);assert.ok(setLookVariant(helm1,value));
  assert.equal(lookVariantsOf(helm1).current,value);assert.notEqual(lookVariantsOf(helm2).current,value);
  assert.deepEqual(itemOwnStyleFields(helm1),{ownStyle:value});assert.deepEqual(itemOwnStyleFields(helm2),{});
  const slots=[];slots[EQUIP_SLOTS.Head]=helm1;
  assert.equal(dfWornArmor(slots,EQUIP_SLOTS,{} )[0].ownStyle,value);
  slots[EQUIP_SLOTS.Head]=helm2;assert.equal(dfWornArmor(slots,EQUIP_SLOTS,{} )[0].ownStyle,undefined);
}));

test('two identical 3D garments have independent dyes and only the equipped one supplies a material dye', scoped(() => {
  const one=mint(165),two=mint(165), active={records:[{id:'same_shirt'}]};
  const key1=modelDyeKey(one,active),key2=modelDyeKey(two,active);
  assert.notEqual(key1,key2);setModelDye(key1,2);setModelDye(key2,9);
  const slots=[];slots[EQUIP_SLOTS.ChestClothes]=one;noteModelLookPlayer({items:[one,two],equip:{slots}});
  assert.equal(modelDyeOf('same_shirt'),2);
  slots[EQUIP_SLOTS.ChestClothes]=two;assert.equal(modelDyeOf('same_shirt'),9);
  assert.equal(modelDyeOf(key1),2);assert.equal(modelDyeOf(key2),9);
  const source=[{width:1,height:1,rgba:new Uint8Array([180,50,30,255])}];
  assert.equal(modelDyeMips(source,'chest (same_shirt)','cloth.dds',null),source,'an untouched preview cannot borrow the equipped copy dye');
}));
