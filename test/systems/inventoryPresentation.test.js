import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryModelSource, setInventory2D } from '../../src/ui/enhanced/inventoryPresentation.js';
import { getPref, setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { readFileSync } from 'node:fs';

test('switching inventory mode gates attached models immediately and keeps the source for switching back',()=>{
 _resetForTests();
 const arm={figure:()=>({width:1,height:1}),itemIcon:()=>({width:1,height:1})};
 setPref('morrowindThirdPersonOnly',false);
 assert.equal(inventoryModelSource(arm),arm);
 setPref('morrowindThirdPersonOnly',true);
 assert.equal(inventoryModelSource(arm),null);
 assert.equal(getPref('morrowindThirdPersonOnly'),true);
 setPref('morrowindThirdPersonOnly',false);
 assert.equal(inventoryModelSource(arm),arm);
 assert.equal(inventoryModelSource(null),null);
 _resetForTests();
});

test('figure and item icons share the inventory mode; saved 2D appearances cannot override 3D',()=>{
 const source=readFileSync(new URL('../../src/ui/enhanced/enhancedInventory.js',import.meta.url),'utf8');
 assert.match(source,/const armMod = inventoryModelSource\(deps.fpArm\)/);
 assert.match(source,/modelIconUrlOf\(item, size, inventoryModelSource\(deps.fpArm\)\)/);
 assert.match(source,/const figure = modelFigure\(\)/);
 assert.doesNotMatch(source,/customFace \|\| customHelmet/);
 assert.doesNotMatch(source,/if \(helmetPaperdollVariant\(item\) !== null\) return null/);
});

test('inventory mode synchronizes the renderer flags, not just the menu preference',()=>{
 setInventory2D(false);
 assert.equal(getPref('morrowind3dPaperDoll'),true);
 assert.equal(getPref('morrowind3dInventoryIcons'),true);
 assert.equal(getPref('morrowindThirdPersonOnly'),false);
 setInventory2D(true);
 assert.equal(getPref('morrowind3dPaperDoll'),false);
 assert.equal(getPref('morrowind3dInventoryIcons'),false);
 assert.equal(getPref('morrowindThirdPersonOnly'),true);
 _resetForTests();
});


test('saved inventory mode wins over stale render flags on the first read and after reload', () => {
 const previous = globalThis.localStorage;
 const entries = new Map();
 globalThis.localStorage = {getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
 try {
  for (const twoD of [false,true]) {
   entries.set('dagger.ui.v1',JSON.stringify({_rev:2,morrowindThirdPersonOnly:twoD,morrowind3dPaperDoll:twoD,morrowind3dInventoryIcons:twoD}));
   _resetForTests();
   assert.equal(getPref('morrowindThirdPersonOnly'),twoD);
   assert.equal(getPref('morrowind3dPaperDoll'),!twoD);
   assert.equal(getPref('morrowind3dInventoryIcons'),!twoD);
   setInventory2D(!twoD);
   _resetForTests();
   assert.equal(getPref('morrowind3dPaperDoll'),twoD);
   assert.equal(getPref('morrowind3dInventoryIcons'),twoD);
  }
  entries.clear();_resetForTests();
  assert.equal(getPref('morrowind3dPaperDoll'),true);
 } finally {globalThis.localStorage=previous;_resetForTests();}
});
