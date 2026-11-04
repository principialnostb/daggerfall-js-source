import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { wolfArmorPalette, wolfArmorModel } from '../../src/characters/ownModels/wolfArmorPalette.js';
import { composeWornArmor } from '../../src/formats/morrowind/mwItemMap.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../src/formats/morrowind/mwNifMesh.js';
import { palettePixel, replaceNifTexture } from '../../tools/skyrim/buildWolfArmorPalettes.mjs';

const cloak = { kind: 'clothing', templateIndex: 154, name: 'Casual Cloak' };
test('steel and warm helmet horns get only a subtle shift; leather retains the strong theme', () => {
  for (const palette of ['white', 'black']) {
    for (const [rgb, surface] of [[[90, 95, 100], 'mixed'], [[150, 115, 65], 'helmet']]) {
      const result = palettePixel(...rgb, palette, surface);
      assert.ok(result.every((v, i) => Math.abs(v - rgb[i]) <= 12), 'preserve natural metal/horn colour');
      assert.ok(palette === 'white' ? result.every((v, i) => v >= rgb[i]) : result.every((v, i) => v <= rgb[i]));
    }
    const leather = palettePixel(120, 80, 40, palette);
    assert.ok(Math.max(...leather.map((v, i) => Math.abs(v - [120, 80, 40][i]))) > 35, 'leather gets a distinctly stronger transformation');
  }
});
test('worn cloak selects iron palette; removing it or returning to classic restores existing model', () => {
  const armor = { kind: 'armor', templateIndex: 102, material: 513 };
  const args = { pieces: [armor, cloak], armors: [], bodyPool: [], looks: { daggerfall_steel_cuirass: 'iron' } };
  for (const [look, palette] of [['wolf-white', 'white'], ['wolf-black', 'black'], ['wolf-brown', 'classic'], ['classic', 'classic']]) {
    const cloakLooks = { 154: look };
    assert.equal(wolfArmorPalette(args.pieces, cloakLooks), palette);
    const composed = composeWornArmor({ ...args, cloakLooks });
    assert.ok(composed.adds.some((a) => a.model === wolfArmorModel('iron_cuirass.nif', palette)));
    assert.ok(!composed.adds.some((a) => /wolf_armor_.*wolf_pelt/.test(a.model)));
    const removed = composeWornArmor({ ...args, pieces: [armor], cloakLooks });
    assert.ok(removed.adds.some((a) => a.model === 'iron_cuirass.nif'));
  }
  assert.equal(wolfArmorModel('steel_plate_cuirass.nif', 'white'), 'steel_plate_cuirass.nif');
  assert.equal(wolfArmorModel('wolf_pelt_white.nif', 'black'), 'wolf_pelt_white.nif');
  assert.equal(wolfArmorPalette([], { 154: 'wolf-white' }), 'classic');
});

test('every local palette preserves complete NIF data except texture paths, and palette keeps detail contrast', { skip: !existsSync('src/assets/mw/meshes/wolf_armor_white_iron_cuirass.nif') }, () => {
  const root = 'src/assets/mw/meshes';
  const models = readdirSync(root).filter((p) => /^(iron_.*|steel_plate_helm_horned)\.nif$/.test(p));
  assert.equal(models.length, 11);
  for (const name of models) for (const palette of ['white', 'black']) {
    const bytes = readFileSync(`${root}/${name}`), themed = readFileSync(`${root}/${wolfArmorModel(name, palette)}`);
    let restored = themed;
    const original = parseNif(new Uint8Array(bytes));
    for (const rec of original.records.filter((r) => r.type === 'NiSourceTexture')) {
      restored = replaceNifTexture(restored, `wolf_armor_${palette}_${rec.fileName}`, rec.fileName);
    }
    assert.deepEqual(restored, bytes, `${name}: only texture string bytes may change`);
    assert.equal(flattenNif(parseNif(new Uint8Array(themed))).length, flattenNif(original).length);
  }
  for (const palette of ['white', 'black']) {
    const dark = palettePixel(25, 25, 25, palette), light = palettePixel(200, 200, 200, palette);
    assert.ok(light.every((v, i) => v > dark[i] + 90), 'retain texture lighting and wear contrast');
    const leather = palettePixel(120, 80, 40, palette);
    assert.ok(leather[0] > leather[2], 'leather retains warm identity');
  }
});
