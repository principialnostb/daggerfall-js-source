import test from 'node:test';
import assert from 'node:assert/strict';
import { appearanceHairPool, distinctAppearanceModels, playerBodyRows } from '../../src/formats/morrowind/mwFirstPerson.js';
import { HAIR_SWATCHES, hairColorMips, hairGeometryKey, normalizeSavedHairColor, selectHairBatches } from '../../src/characters/hairColor.js';
import { prepareHairTints } from '../../src/characters/hairPreparationClient.js';

test('editor combines installed same-sex hair across races and collapses mesh aliases', () => {
  const makeHair = (id, race, model, female = false) => ({ id, race, model, female, slot: 'hair', playable: true, skin: true });
  const parts = [
    makeHair('nord', 'nord', 'Nord.nif'),
    makeHair('old', 'orc', 'obsolete.nif'),
    makeHair('old', 'orc', 'Orc/Style.nif'),
    makeHair('same', 'orc', 'orc\\style.NIF'),
    makeHair('missing', 'orc', 'missing.nif'),
    makeHair('female', 'orc', 'female.nif', true),
    makeHair('wrong-flag', 'dark elf', 'b/B_N_Dark Elf_F_Hair_04.NIF'),
    makeHair('B_N_Dark Elf_F_Hair_05', 'dark elf', 'generic.nif'),
    makeHair('crest', 'argonian', 'nord.nif'),
    makeHair('ears', 'khajiit', 'female.nif', true),
  ];
  const installed = new Set(['meshes/nord.nif', 'meshes/orc/style.nif', 'meshes/female.nif',
    'meshes/b/b_n_dark elf_f_hair_04.nif', 'meshes/generic.nif']);
  const has = path => installed.has(path);
  assert.deepEqual(distinctAppearanceModels(appearanceHairPool(parts, false, has), has), [
    { id: 'nord', aliases: ['nord'] }, { id: 'old', aliases: ['old', 'same'] },
  ]);
  assert.deepEqual(appearanceHairPool(parts, true, has).map(record => record.id), ['female']);
  const hair = options => playerBodyRows(parts, 'nord', false, { has, ...options }).find(row => row.slot === 'hair').record.id;
  assert.equal(hair({ appearanceHairId: 'same' }), 'same');
  const selected = playerBodyRows(parts, 'nord', false, { has, appearanceHairId: 'same' }).find(row => row.slot === 'hair');
  assert.equal(selected.earRecord.id, 'nord');

  assert.equal(hair({ appearanceHairId: 'female' }), 'nord');
  assert.equal(hair({ appearanceHairId: 'same', walk: { hair: 0 } }), 'same');
  const npc = playerBodyRows(parts, 'nord', false, { has, walk: { head: 0, hair: 0 }, appearanceHairId: 'same' }).find(row => row.slot === 'hair');
  assert.equal(npc.earRecord.id, 'nord');
});

test('hair tint copies only hair mip pixels and preserves alpha', () => {
  const mips = [{ rgba: Uint8Array.of(90, 40, 20, 127) }];
  assert.equal(hairColorMips(mips, 'head', '#dd5522'), mips);
  assert.equal(hairColorMips(mips, 'hair', null), mips);
  assert.equal(hairColorMips(mips, 'hair', '#dd5522', { textureFile: 'TX_B_N_Dark Elf_F_H02.BMP' }), mips);
  assert.equal(hairColorMips(mips, 'hair', '#dd5522', { name: 'elf fdarkem head', textureFile: 'hair01.bmp' }), mips);
  assert.equal(hairColorMips(mips, 'hair', '#dd5522', { textureFile: 'hairpin00.bmp' }), mips);
  assert.equal(hairColorMips(mips, 'hair', '#dd5522', { textureFile: 'TX_B_N_Redguard_F_H01.bmp' }), mips);
  assert.equal(normalizeSavedHairColor('#344c76'), null);
  assert.equal(normalizeSavedHairColor('#503124'), '#503124');
  const tint = hairColorMips(mips, 'hair', '#aa2277');
  assert.notDeepEqual([...tint[0].rgba.slice(0, 3)], [90, 40, 20]);
  assert.equal(tint[0].rgba[3], 127);
  assert.deepEqual([...mips[0].rgba], [90, 40, 20, 127]);
});

test('shared hair material can supply separate ear geometry', () => {
  const material = { textureFile: 'TX_B_N_High Elf_F_Hair01.bmp' };
  const ears = { material, positions: [-5.8, 0, 2, 5.8, 1, 4] };
  const hair = { material, positions: [-5.9, -5, 2, 5.9, 8, 12] };
  assert.deepEqual(selectHairBatches([hair, ears], 'hair'), [hair]);
  assert.deepEqual(selectHairBatches([hair, ears], 'ears'), [ears]);
});

test('haircut comparison ignores ear batches and triangle ordering', () => {
  const hair = { positions: Float32Array.of(0, 0, 8, 1, 0, 8, 0, 1, 8), indices: Uint16Array.of(0, 1, 2) };
  const reversed = { ...hair, indices: Uint16Array.of(2, 1, 0) };
  const ears = { ...hair, name: 'ears' };
  assert.equal(hairGeometryKey([ears, hair]), hairGeometryKey([reversed]));
  assert.deepEqual(selectHairBatches([hair, reversed], 'hair'), [hair]);
});

test('the same swatch anchors light and dark source textures to the same color', () => {
  const tint = value => hairColorMips([{ rgba: Uint8Array.of(value, value, value, 255) }], 'hair', '#e5cb96')[0].rgba;
  assert.deepEqual([...tint(40)], [184, 162, 123, 255]);
  assert.equal(normalizeSavedHairColor('#e4ded5'), '#c8c2b7');
  assert.equal(normalizeSavedHairColor('#eee8d7'), '#c8c2b7');
  assert.deepEqual(tint(40), tint(190));
});

test('ear donor leaves its central scalp out of the assembled haircut', () => {
  const batch = {
    material: { textureFile: 'TX_B_N_Dark Elf_F_H02.BMP' },
    positions: Float32Array.of(4, 0, 1, 5, 0, 1, 4, 1, 1, -1, 0, 1, 1, 0, 1, 0, 1, 1),
    indices: Uint16Array.of(0, 1, 2, 3, 4, 5),
  };
  assert.deepEqual([...selectHairBatches([batch], 'ears')[0].indices], [0, 1, 2]);
  assert.deepEqual(selectHairBatches([batch], 'hair'), []);
});


test('every swatch retains ordered shadows and highlights without clipping the strand texture', () => {
  const source = Uint8Array.from([0, 64, 128, 192, 255].flatMap(value => [value, value, value, 255]));
  for (const [color] of HAIR_SWATCHES.slice(1)) {
    const pixels = hairColorMips([{ rgba: source }], 'hair', color)[0].rgba;
    for (let channel = 0; channel < 3; channel++) {
      const values = [0, 4, 8, 12, 16].map(offset => pixels[offset + channel]);
      assert.ok(values[0] > 0 && values[4] < 255, color);
      assert.ok(values.every((value, index) => index === 0 || value > values[index - 1]), color);
    }
  }
});


test('hair tint strengthens strand detail without sampling transparent atlas padding', () => {
  const row = values => Uint8Array.from(values.flatMap(([value, alpha = 255]) => [value, value, value, alpha]));
  const source = row([[0, 0], [110], [145], [110], [255, 0]]);
  const darkPadding = row([[255, 0], [110], [145], [110], [0, 0]]);
  const tint = rgba => hairColorMips([{ rgba, width: 5, height: 1 }], 'hair', '#b8a27b')[0].rgba;
  const detailed = tint(source);
  const plain = hairColorMips([{ rgba: source }], 'hair', '#b8a27b')[0].rgba;
  assert.ok(detailed[8] - detailed[4] > plain[8] - plain[4]);
  assert.deepEqual(detailed.slice(4, 16), tint(darkPadding).slice(4, 16));
});

test('prepared hair uses the original mip pixels and alpha for each actor colour', async () => {
  const mips = [16, 8, 4, 2, 1].map(width => ({
    width, height: width, rgba: Uint8Array.from({ length: width * width * 4 }, (_, i) => (i * 47 + width) % 256),
  }));
  const original = structuredClone(mips);
  const colors = ['#bc9058', '#332018'];
  const pieces = [{ slot: 'hair', material: { textureFile: 'hair.dds' } }];
  const textures = new Map([['hair.dds', { image: { mips } }]]);
  const prepared = await Promise.all(colors.map(color => prepareHairTints(pieces, textures, color)));
  for (const [i, color] of colors.entries()) {
    assert.deepEqual(prepared[i].get(mips), hairColorMips(structuredClone(mips), 'hair', color));
    const again = await prepareHairTints(pieces, textures, color.toUpperCase());
    assert.equal(again.get(mips), prepared[i].get(mips));
  }
  assert.deepEqual(mips, original);
});
