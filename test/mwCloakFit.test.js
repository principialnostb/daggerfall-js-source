import test from 'node:test';
import assert from 'node:assert/strict';

import { cloakSheet, sheetCellKey } from '../src/formats/morrowind/mwCloakFit.js';

test('cloakSheet checks the actual triangle when the rounded grid sample falls outside it', () => {
  // The sample lies inside this projected triangle, but rounds to (1, 0), which lies outside.
  // The old integer height-field therefore returned no contact at this edge.
  const positions = new Float32Array([
    0.1, 0, 0.1,
    0.9, 2, 0.1,
    0.1, 4, 0.9,
  ]);
  const indices = new Uint16Array([0, 1, 2]);
  const sheet = cloakSheet(positions, indices);

  assert.equal(sheet.get(sheetCellKey(0.55, 0.2)), undefined);
  const contact = sheet.at(0.55, 0.2);
  assert.ok(contact);
  assert.equal(contact.frontTri, 0);
  assert.equal(contact.backTri, 0);
  assert.ok(Math.abs(contact.front - 1.625) < 1e-5);
  assert.equal(contact.front, contact.back);
});

test('cloakSheet exact queries retain both layers where the cloak folds over itself', () => {
  const positions = new Float32Array([
    0, 0, 0,
    2, 0, 0,
    0, 2, 2,
    0, 3, 0,
    2, 3, 0,
    0, 5, 2,
  ]);
  const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);
  const sheet = cloakSheet(positions, indices);
  const contact = sheet.at(0.5, 0.5);

  assert.ok(contact);
  assert.ok(contact.front > contact.back);
  assert.equal(contact.frontTri, 3);
  assert.equal(contact.backTri, 0);
});
