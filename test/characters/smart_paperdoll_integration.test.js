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

test('Smart PaperDoll uses an independent animated rig instead of voxelising the inventory portrait', () => {
  const rig = read('../../src/characters/smartPaperDollRig.js');
  assert.match(rig, /buildNeutralBody/);
  assert.match(rig, /createCharacterRig/);
  assert.match(rig, /feminineMorph/);
  assert.match(rig, /sphereFaces\(-0\.075/);
  assert.match(rig, /drapedPiece/);
  assert.match(rig, /setSmartPaperDollLayers/);
  assert.match(rig, /cachedRig\.update\(dt\)/);
  assert.match(rig, /renderer\.drawCharacter\(cachedRig\.mesh, model\)/);
  const entry = read('../../src/characters/paperDollVoxel.js');
  assert.match(entry, /drawSmartPaperDollRig\(renderer, \{ feet, yaw, grow \}\)/);
  assert.match(entry, /clearSmartPaperDollRig\(\)/);
  assert.doesNotMatch(entry.slice(entry.indexOf('export function drawSmartPaperDoll(')), /paperDollFigurePixels\(/);
});
