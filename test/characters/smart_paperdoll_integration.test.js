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
});

test('Smart PaperDoll is checked before either existing third-person body lane and falls through when unavailable', () => {
  const view = read('../../src/player/mwView.js');
  assert.match(view, /mwCamera\.thirdPerson\(\) && modSetting\('eye-of-the-beholder', 'Graphics\.SmartPaperDoll'\) === true/);
  assert.match(view, /fpArm\.drawSmartPaperDoll\(canvas, \{ feet, yaw, grow:/);
  assert.match(view, /if \(eotbLane\(\)\) \{ const drawn = drawEotbBody/);
  const arm = read('../../src/combat/fpArm.js');
  assert.match(arm, /drawSmartPaperDoll\(canvas, \{ feet, yaw = 0, grow = 1 \} = \{\}\)/);
  assert.match(arm, /if \(!thirdActive\(\) \|\| !canvas \|\| !feet\) return false/);
});

test('voxel conversion consumes the finished PaperDoll RGBA composite and reuses the world character renderer', () => {
  const voxels = read('../../src/characters/paperDollVoxel.js');
  assert.match(voxels, /import \{ paperDollFigurePixels, requestPaperDollFigureRefresh \} from '\.\.\/ui\/paperDoll\.js'/);
  assert.match(voxels, /image\.rgba/);
  assert.match(voxels, /renderer\.drawCharacter\(mesh, model\)/);
  assert.match(voxels, /image\.version/);
  assert.match(voxels, /if \(!image\) \{\s*requestPaperDollFigureRefresh\(\);/);
  const doll = read('../../src/ui/paperDoll.js');
  assert.match(doll, /export function requestPaperDollFigureRefresh\(\)/);
  assert.match(doll, /void refreshPaperDoll\(_lastEntity\)/);
});
