import test from 'node:test';
import assert from 'node:assert/strict';
import { garmentSideBatch, texturedPartBytes, visibleBodyLegBatch } from '../../../src/formats/morrowind/mwGarmentMaterials.js';
import { composeWornArmor } from '../../../src/formats/morrowind/mwItemMap.js';

test('short Summerset robes keep knees and ankles visible beneath the hem', () => {
  const robes = ['war_highelf_robe_01b', 'war_highelf_robe_03b'].map(id => ({
    id, type: 4, name: id, model: 'robe_ground.nif', enchanted: false,
    parts: [{ part: 3, male: 'robe_body' }, { part: 17, male: null }, { part: 18, male: null }],
  }));
  const wear = mwRecord => composeWornArmor({
    pieces: [{ kind: 'clothing', name: 'Plain Robes', mwRecord }],
    armors: [], clothes: robes, bodyPool: [{ id: 'robe_body', model: 'robe.nif' }],
  });
  const lowerLegShadows = result => result.shadows.filter(slot => /^(knee|ankle):/.test(slot)).sort();
  assert.deepEqual(lowerLegShadows(wear(robes[0].id)), []);
  assert.deepEqual(lowerLegShadows(wear(robes[1].id)), ['ankle:left', 'ankle:right', 'knee:left', 'knee:right']);
});

test('one bilateral knee shape gives each slot only its own triangles', () => {
  const batch = { name: 'Right Knee', positions: new Float32Array(18), indices: Uint16Array.of(0,1,2,3,4,5),
    skin: { bones: [{name:'bip01 l calf', indices:[0,1,2], weights:[1,1,1]}, {name:'bip01 r calf', indices:[3,4,5], weights:[1,1,1]}] } };
  assert.deepEqual([...garmentSideBatch(batch, 'left knee', [batch]).indices], [0,1,2]);
  assert.deepEqual([...garmentSideBatch(batch, 'right knee', [batch]).indices], [3,4,5]);
  assert.equal(garmentSideBatch(batch, 'left knee', [batch, { name: 'Tri Left Knee' }]), undefined);
});

test('only an incomplete override gives way to a textured model of the same path', async () => {
  const path = 'meshes/c/knee.nif';
  const make = texture => ({ has: key => key === path, get: () => ({ records: [
    { type: 'NiTexturingProperty', textures: [{ source: 1 }] }, { external:true, fileName:texture }] }) });
  const first = make('custom.dds'), retail = make('retail.dds');
  const reports = [];
  const choose = exists => texturedPartBytes(path, [first, retail], first, arc => arc.get(), bytes => bytes, exists, file => reports.push(file));
  assert.equal((await choose(key => key === 'textures/retail.dds')).records[1].fileName, 'retail.dds');
  assert.equal((await choose(() => true)).records[1].fileName, 'custom.dds');
  assert.equal((await choose(() => false)).records[1].fileName, 'custom.dds');
  assert.deepEqual(reports, ['custom.dds']);
});

test('covering one knee keeps the other knee from a bilateral Better Bodies section', () => {
  const batch = { positions: new Float32Array(18), indices: Uint16Array.of(0, 1, 2, 3, 4, 5),
    skin: { bones: [{ name: 'bip01 l calf', indices: [0, 1, 2], weights: [1, 1, 1] },
      { name: 'bip01 r calf', indices: [3, 4, 5], weights: [1, 1, 1] }] } };
  const left = visibleBodyLegBatch(batch, 'knee:right', ['knee:right']);
  assert.equal(left.key, 'knee:left');
  assert.deepEqual([...left.batch.indices], [0, 1, 2]);
  const right = visibleBodyLegBatch(batch, 'knee:right', ['knee:left']);
  assert.equal(right.key, 'knee:right');
  assert.deepEqual([...right.batch.indices], [3, 4, 5]);
  assert.equal(visibleBodyLegBatch(batch, 'knee:right', []).batch, batch);
  assert.equal(visibleBodyLegBatch(batch, 'knee:right', ['knee:left', 'knee:right']), null);
});
