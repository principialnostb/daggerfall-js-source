import { clothReplacementPixels } from '../../src/systems/clothReplacementDye.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dyeClothPixels, modelDyeMips, setModelDye, modelDyeOf, modelDyeKey } from '../../src/systems/modelDye.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { changeDyeBitmap } from '../../src/characters/dyes.js';

test('cloth colour preserves secondary hues, alpha, shading and source pixels', () => {
  const source = new Uint8Array([180, 50, 30, 255, 90, 25, 15, 180, 20, 30, 170, 255, 0, 0, 0, 0]);
  const original = source.slice();
  const dyed = dyeClothPixels(source, 9);
  assert.deepEqual(source, original);
  assert.ok(dyed[1] > dyed[0]);
  assert.ok(dyed[1] > dyed[5]);
  assert.deepEqual(dyed.slice(8), original.slice(8));
  assert.equal(dyed[7], 180);
});

test('3D colours are local preferences and cached copies, reset to authored texture', () => {
  const previous = getPref('mwItemDyes'), enabled = getPref('modelCustomization');
  try {
    setPref('modelCustomization', true); setPref('mwItemDyes', null);
    const mips = [{ width: 1, height: 1, rgba: new Uint8Array([180, 50, 30, 255]) }];
    assert.equal(setModelDye('shirt', 9), true);
    assert.equal(modelDyeOf('shirt'), 9);
    const dyed = modelDyeMips(mips, 'chest (shirt)', 'cloth.dds');
    assert.notEqual(dyed, mips);
    assert.equal(modelDyeMips(mips, 'chest (shirt)', 'cloth.dds'), dyed);
    assert.equal(modelDyeMips(mips, 'chest (shirt)', 'skin.dds'), mips);
    assert.equal(setModelDye('shirt', null), true);
    assert.equal(modelDyeMips(mips, 'chest (shirt)', 'cloth.dds'), mips);
    setModelDye('shirt', 2); setPref('modelCustomization', false);
    assert.equal(modelDyeMips(mips, 'chest (shirt)', 'cloth.dds'), mips);
  } finally { setPref('mwItemDyes', previous); setPref('modelCustomization', enabled); }
});

test('custom 2D dye can replace brown cloth without touching a secondary palette band', () => {
  const bitmap = { data: new Uint8Array([0, 0x40, 0x41, 0x42, 0x80]) };
  assert.deepEqual([...changeDyeBitmap(bitmap, 9, 2).data], [0, 0xa0, 0xa1, 0xa2, 0x80]);
  assert.deepEqual([...changeDyeBitmap(bitmap, 9, 0).data], [...bitmap.data]);
});


test('classic and fur cloaks have colour keys, animated _skins cloth is not body skin', () => {
  const enabled = getPref('modelCustomization'), previous = getPref('mwItemDyes');
  try {
    setPref('modelCustomization', true); setPref('mwItemDyes', null);
    const classicItem = { templateIndex: 154 }; const classicKey = modelDyeKey(classicItem, { value: 'classic' }); assert.ok(classicKey.startsWith('local:'));
    assert.notEqual(modelDyeKey({ templateIndex: 154 }, { value: 'wolf-black' }), classicKey);
    assert.ok(modelDyeKey({ templateIndex: 165 }, { records: [{ id: 'shirt' }] }).startsWith('local:'));
    const mips = [{ width: 1, height: 1, rgba: new Uint8Array([180, 50, 30, 255]) }];
    setModelDye('daggerfall_cloak', 9);
    const dyed = modelDyeMips(mips, 'cloak (daggerfall_cloak)', 'textures/simply_cape_red_skins.dds');
    assert.notEqual(dyed, mips);
    assert.ok(dyed[0].rgba[1] > dyed[0].rgba[0]);
    assert.equal(modelDyeMips(mips, 'cloak (daggerfall_cloak)', 'textures/skin.dds'), mips);
  } finally { setPref('modelCustomization', enabled); setPref('mwItemDyes', previous); }
});


test('duplicate mod dye pictures recolour without replacing authored colour variants', () => {
  const colors = new Uint8ClampedArray([180, 50, 30, 255, 20, 30, 170, 255]);
  const image = { width: 2, height: 1, colors };
  const duplicate = { ...image, colors: colors.slice() };
  const result = clothReplacementPixels(image, duplicate, 9, 2);
  assert.notEqual(result, image);
  assert.ok(result.colors[1] > result.colors[0]);
  assert.deepEqual(result.colors.slice(4), colors.slice(4));
  assert.deepEqual(image.colors, colors);
  const authored = { ...image, colors: new Uint8ClampedArray([20, 150, 20, 255, 20, 30, 170, 255]) };
  assert.equal(clothReplacementPixels(authored, duplicate, 9, 2), authored);
  assert.equal(clothReplacementPixels(image, duplicate, 9, 0), image);
});
