import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Smart PaperDoll is opt-in and lives in the existing EoTB setting store', () => {
  const settings = read('../../src/systems/modSettings.js');
  assert.match(settings, /'Graphics\.SmartPaperDoll': Object\.freeze\(\{ default: false/);
  const card = read('../../src/ui/skinCard.js');
  assert.match(card, /modSetting\(VENDOR, 'Graphics\.SmartPaperDoll'\)/);
  assert.match(card, /setModSetting\(VENDOR, 'Graphics\.SmartPaperDoll', !smart\)/);
  assert.match(card, /if \(smart\) \{[\s\S]*?standard on-foot and mounted presets are suspended/);
});

test('Smart PaperDoll is checked before either existing third-person body lane and falls through when unavailable', () => {
  const view = read('../../src/player/mwView.js');
  assert.match(view, /const smartPaperDollEnabled = mwCamera\.thirdPerson\(\)\s*&&\s*modSetting\('eye-of-the-beholder', 'Graphics\.SmartPaperDoll'\) === true/);
  assert.match(view, /fpArm\.drawSmartPaperDoll\(canvas, \{ feet, yaw, grow:/);
  assert.match(view, /third-person override is active; attempting composite draw/);
  assert.match(view, /if \(eotbLane\(\)\) \{ const drawn = drawEotbBody/);
  const arm = read('../../src/combat/fpArm.js');
  assert.match(arm, /drawSmartPaperDoll\(canvas, \{ feet, yaw = 0, grow = 1 \} = \{\}\)/);
  assert.match(arm, /if \(!thirdActive\(\) \|\| !canvas \|\| !feet\) return false/);
});

test('voxel conversion consumes the finished PaperDoll RGBA composite and reuses the world character renderer', () => {
  const voxels = read('../../src/characters/paperDollVoxel.js');
  assert.match(voxels, /import \{ paperDollFigurePixels, paperDollFigureStatus, requestPaperDollFigureRefresh \} from '\.\.\/ui\/paperDoll\.js'/);
  assert.match(voxels, /image\.rgba/);
  assert.match(voxels, /renderer\.drawCharacter\(mesh, model\)/);
  assert.match(voxels, /image\.version/);
  assert.match(voxels, /if \(!image\) \{\s*requestPaperDollFigureRefresh\(\);/);
  const doll = read('../../src/ui/paperDoll.js');
  assert.match(doll, /export function requestPaperDollFigureRefresh\(\)/);
  assert.match(doll, /void refreshPaperDoll\(_lastEntity\)/);
  assert.match(doll, /export function paperDollFigureStatus\(\)/);
  assert.match(voxels, /Figure composite is not ready/);
  assert.match(voxels, /Mesh creation threw an exception/);
});

test('Smart PaperDoll fills unequipped EoTB regions from the live equip table with original-frame fallback', () => {
  const body = read('../../src/player/eyeOfTheBeholder/eotbBody.js');
  const rig = read('../../src/combat/weapon/weaponRig.js');
  assert.match(rig, /smartPaperDollEquipment:[\s\S]*?chestArmor: !!worn\[EQUIP_SLOTS\.ChestArmor\]/);
  assert.match(rig, /feet: !!worn\[EQUIP_SLOTS\.Feet\]/);
  assert.match(rig, /head: !!worn\[EQUIP_SLOTS\.Head\]/);
  assert.match(body, /function composeSmartBody\(width, height, source, wornBits\)/);
  assert.match(body, /const colors = new Uint32Array\(source\)/);
  assert.match(body, /const rgba = new Uint8Array\(colors\.buffer, colors\.byteOffset, colors\.byteLength\)/);
  assert.match(body, /!wornBits\.chestArmor && nx >= 0\.20 && nx <= 0\.80 && ny >= 0\.30 && ny <= 0\.60/);
  assert.match(body, /!wornBits\.feet && nx >= 0\.24 && nx <= 0\.76 && ny >= 0\.875 && ny <= 0\.985/);
  assert.match(body, /!wornBits\.head && nx >= 0\.34 && nx <= 0\.66 && ny >= 0\.045 && ny <= 0\.245/);
  assert.match(body, /if \(rgba\[i \+ 3\] === 0\) continue/);
  assert.match(body, /catch \{ colors = looked; \}/);
  assert.match(body, /renderer\.uploadTexture\(s\.archive, variantRec, \{ width, height, colors: px \}\)/);
  assert.match(body, /renderer\.createBillboardBatch\(s\.archive, renderRec\(s\)/);
});
