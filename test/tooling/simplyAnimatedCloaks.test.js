import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../src/formats/morrowind/mwNifMesh.js';
import { SIMPLY_CLOAK_MODEL_BY_PAINTING, SIMPLY_CLOAK_MODEL_PATHS, ownCloakFor } from '../../src/characters/ownModels/ownClothingModels.js';
import { composeWornArmor } from '../../src/formats/morrowind/mwItemMap.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const bytes = (path) => readFileSync(join(ROOT, 'src/assets/mw', path));

test('Simply Animated Cloaks: the optional JS port resolves Daggerfall cloak dyes to shipped skinned meshes', () => {
  assert.deepEqual(Object.keys(SIMPLY_CLOAK_MODEL_BY_PAINTING), ['blue', 'grey', 'red', 'dark_brown', 'purple', 'light_brown', 'white', 'green']);
  assert.equal(new Set(Object.values(SIMPLY_CLOAK_MODEL_BY_PAINTING)).size, 8);
  for (const path of SIMPLY_CLOAK_MODEL_PATHS) {
    assert.ok(existsSync(join(ROOT, 'src/assets/mw', path)), path + ' ships');
    const [batch, ...rest] = flattenNif(parseNif(bytes(path)));
    assert.equal(rest.length, 0, path + ' is one renderable mesh');
    assert.equal(batch.skinned, true, path + ' is skinned for the existing JS animation rig');
    assert.ok(batch.skin.bones.length > 0, path + ' has bone influences');
    const texture = basename(batch.material.textureFile.replaceAll(String.fromCharCode(92), '/'));
    assert.ok(existsSync(join(ROOT, 'src/assets/mw/textures', texture)), path + ' resolves texture ' + texture);
  }
});

test('Simply Animated Cloaks: opt-in style preserves classic default and garment dye semantics', () => {
  const piece = { kind: 'clothing', name: 'Casual Cloak', dye: 7 };
  assert.equal(ownCloakFor(piece).model, 'cloak_blue.nif');
  assert.equal(ownCloakFor(piece, { style: 'simply-animated' }).model, 'simply_cape_blue_skins.nif');
  assert.equal(ownCloakFor({ ...piece, dye: 8 }, { style: 'simply-animated' }).model, 'simply_cape_brown_skins.nif',
    'the nearest supported painting is used when the pack has no exact Daggerfall dye');
  const composed = composeWornArmor({ pieces: [piece], armors: [], bodyPool: [], cloakStyle: 'simply-animated' });
  assert.equal(composed.adds.at(-1).model, 'simply_cape_blue_skins.nif');
});
