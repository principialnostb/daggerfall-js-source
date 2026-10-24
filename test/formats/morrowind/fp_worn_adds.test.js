import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fpWornAdds } from '../../../src/formats/morrowind/mwItemMap.js';

test('first-person worn gear includes pauldrons attached to the clavicles', () => {
  const adds = [
    { slot: 'right pauldron', bones: ['right clavicle'] },
    { slot: 'left pauldron', bones: ['left clavicle'] },
    { slot: 'right forearm', bones: ['right forearm'] },
    { slot: 'cuirass', bones: ['chest'] },
    { slot: 'helmet', bones: ['head'] },
    { slot: 'shield', bones: ['shield bone'] },
  ];

  assert.deepEqual(
    fpWornAdds(adds).map((part) => part.slot),
    ['right pauldron', 'left pauldron', 'right forearm', 'shield'],
  );
});
