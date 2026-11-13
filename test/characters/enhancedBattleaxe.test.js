import { meshesToNif } from '../../tools/nifWrite.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { enhancedAxeRecord, enhancedAxeModel } from '../../src/characters/ownModels/enhancedBattleaxe.js';
import { enhancedAxeShapes } from '../../tools/enhancedBattleaxe.mjs';
import { setPref } from '../../src/systems/uiPrefs.js';
import { MOD_PACKS } from '../../src/systems/enhancedModCatalog.js';
import { modResourceGlob, setModGroupEnabled } from '../../src/systems/enhancedModResources.js';
import { MwBsaFile } from '../../src/formats/morrowind/mwBsaFile.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { flattenNif } from '../../src/formats/morrowind/mwNifMesh.js';
import { weaponRecords, pickWeaponRecord } from '../../src/formats/morrowind/mwFirstPerson.js';
import { paperdollLookChoices, setPaperdollLook } from '../../src/systems/paperdollLooks.js';
import { modelLookChoices } from '../../src/systems/modelLooks.js';

const data = 'D:/Steam/steamapps/common/Morrowind/Data Files/';
test('all retail War Axe records retain their own materials, UVs and head widths', { skip: !existsSync(data + 'Morrowind.bsa') }, () => {
  const archive = new MwBsaFile(new Uint8Array(readFileSync(data + 'Morrowind.bsa')));
  const records = weaponRecords(new Uint8Array(readFileSync(data + 'Morrowind.esm'))).filter(r => r.type === 8);
  const models = new Set(records.map(r => r.model));
  assert.ok(models.size >= 8);
  for (const model of models) {
    const source = flattenNif(parseNif(archive.get('meshes/' + model)));
    const shapes = enhancedAxeShapes(source);
    assert.equal(shapes.length, source.length);
    const decoded = flattenNif(parseNif(new Uint8Array(meshesToNif(shapes, { keepV: true }))));
    for (let j = 0; j < shapes.length; j++) {
      assert.equal(shapes[j].texture, source[j].material.textureFile);
      assert.deepEqual(shapes[j].mesh.uvs, source[j].uvs);
      assert.deepEqual(shapes[j].mesh.colors, source[j].colors);
      assert.deepEqual(decoded[j].colors, source[j].colors);
      assert.deepEqual(decoded[j].uvs, source[j].uvs);
      assert.deepEqual(shapes[j].material, source[j].material);
      assert.deepEqual(shapes[j].mesh.indices, source[j].indices);
      for (let i = 0; i < source[j].positions.length; i++) {
        if (i % 3 !== 1) assert.equal(shapes[j].mesh.positions[i], source[j].positions[i]);
        else assert.ok(shapes[j].mesh.positions[i] >= source[j].positions[i] - 1e-6);
      }
    }
  }
});
test('record enhancement covers every axe independently and rejects one-handed and incomplete sources', { skip: !existsSync(data + 'Morrowind.esm') }, () => {
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  try {
    setPref('enhancedBattleaxes', true); setPref('modelCustomization', true); setModGroupEnabled('bodies', true);
    for (const pack of MOD_PACKS.filter(p => p.group === 'bodies')) modResourceGlob('../../Mods/**/*', { ['../../Mods/' + pack.folder + '/test.nif']: 'local' });
    const records = weaponRecords(new Uint8Array(readFileSync(data + 'Morrowind.esm')));
    for (const rec of records.filter(r => r.model && [7,8].includes(r.type))) {
      const urls = { ['meshes/' + enhancedAxeModel(rec.model)]: 'local' };
      const output = enhancedAxeRecord(rec, urls);
      assert.equal(output.model, rec.type === 8 ? enhancedAxeModel(rec.model) : rec.model);
      assert.equal(output.id, rec.id); assert.equal(output.speed, rec.speed);
      assert.equal(enhancedAxeRecord(rec, {}), rec);
    }
    setModGroupEnabled('bodies', false);
    const rec = records.find(r => r.type === 8);
    assert.equal(enhancedAxeRecord(rec, { ['meshes/' + enhancedAxeModel(rec.model)]: 'local' }), rec);
  } finally { setPref('enhancedBattleaxes', false); setModGroupEnabled('bodies', true); globalThis.localStorage = oldStorage; }
});
test('2D axes cannot use blunt weapons or cross one/two-handed classes; 3D ignores a stale one-handed choice', { skip: !existsSync(data + 'Morrowind.esm') }, () => {
  for (const templateIndex of [127,128]) {
    const item = { group: 'Weapons', templateIndex, material: 1 };
    assert.deepEqual(paperdollLookChoices(item), []);
    for (const t of [115,124,125,126,templateIndex === 127 ? 128 : 127]) assert.equal(setPaperdollLook(item, { t }), false);
  }
  const records = weaponRecords(new Uint8Array(readFileSync(data + 'Morrowind.esm')));
  const one = records.find(r => r.type === 7 && !r.enchanted);
  assert.equal(pickWeaponRecord(records, 8, 'Steel', { pick: one.id }).type, 8);
  for (const templateIndex of [127,128]) {
    const expected = templateIndex === 128 ? 8 : 7;
    for (const choice of modelLookChoices({ group: 'Weapons', templateIndex, material: 1 }, { weapons: records })) assert.ok(choice.records.every(r => r.type === expected));
  }
});
