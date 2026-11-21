import test from 'node:test';
import assert from 'node:assert/strict';
import { garmentSideBatch, texturedPartBytes } from '../../../src/formats/morrowind/mwGarmentMaterials.js';

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
