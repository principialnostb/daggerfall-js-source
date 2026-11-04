import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CLOAK_DYE_PAINTING,
  SIMPLY_CLOAK_MODEL_BY_PAINTING,
  SIMPLY_CLOAK_MODEL_PATHS,
  ownCloakFor,
} from '../../src/characters/ownModels/ownClothingModels.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('Simply Animated Cloaks: every selected skin mesh is shipped under the runtime asset root', () => {
  assert.equal(SIMPLY_CLOAK_MODEL_PATHS.length, 8);
  for (const path of SIMPLY_CLOAK_MODEL_PATHS) {
    assert.ok(existsSync(resolve(root, 'src/assets/mw', path)), `missing runtime cloak asset: ${path}`);
  }
});

test('Simply Animated Cloaks: both Daggerfall cloak garments resolve to the selected animated dye mesh', () => {
  for (let dye = 0; dye < CLOAK_DYE_PAINTING.length; dye++) {
    const painting = CLOAK_DYE_PAINTING[dye];
    const expected = SIMPLY_CLOAK_MODEL_BY_PAINTING[painting];
    for (const name of ['Casual Cloak', 'Formal Cloak']) {
      assert.equal(
        ownCloakFor({ kind: 'clothing', name, dye }, { style: 'simply-animated' }).model,
        expected,
        `${name}, dye ${dye} must resolve to ${expected}`,
      );
    }
  }
});

test('Simply Animated Cloaks: the user toggle is in the Animations tab, not duplicated under Gameplay', () => {
  const map = readFileSync(resolve(root, 'src/ui/settings/settingsMap.js'), 'utf8');
  const animationStart = map.indexOf('tab("animations"');
  const animationEnd = map.indexOf('tab("', animationStart + 5);
  const gameplayStart = map.indexOf('tab("gameplay"');
  const gameplayEnd = map.indexOf('tab("', gameplayStart + 5);
  const animationTab = map.slice(animationStart, animationEnd);
  const gameplayTab = map.slice(gameplayStart, gameplayEnd);
  assert.match(animationTab, /feat:simply-animated-cloaks/);
  assert.doesNotMatch(gameplayTab, /feat:simply-animated-cloaks/);
  assert.equal((map.match(/feat:simply-animated-cloaks/g) ?? []).length, 1);
});
