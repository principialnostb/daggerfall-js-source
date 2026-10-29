import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryFaceIndex, setInventoryFaceIndex, INVENTORY_FACES_PREF } from '../../src/systems/inventoryFace.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { facePage } from '../../src/ui/enhanced/inventoryFaces.js';

test('cosmetic inventory faces are isolated by character, race and sex and reject invalid records', () => {
  const previous = getPref(INVENTORY_FACES_PREF);
  try {
    setPref(INVENTORY_FACES_PREF, null);
    const entity = Object.freeze({ name: 'Test hero', race: 'Breton', gender: 'female', faceIndex: 1 });
    const identity = { race: 'Breton', gender: 'female' };
    assert.equal(inventoryFaceIndex(entity, identity), null);
    assert.equal(setInventoryFaceIndex(entity, identity, 8), true);
    assert.equal(inventoryFaceIndex(entity, identity), 8);
    assert.equal(entity.faceIndex, 1);
    assert.equal(inventoryFaceIndex({ name: 'Other hero' }, identity), null);
    assert.equal(inventoryFaceIndex(entity, { ...identity, gender: 'male' }), null);
    assert.equal(inventoryFaceIndex(entity, { ...identity, race: 'Redguard' }), null);
    for (const index of [-1, 10, 1.5, '2', null]) assert.equal(setInventoryFaceIndex(entity, identity, index), false);
    assert.equal(inventoryFaceIndex(entity, identity), 8);
  } finally { setPref(INVENTORY_FACES_PREF, previous); }
});

test('ten faces occupy four rows of three without dropping or repeating records', () => {
  const indices = [];
  for (let row = 0; row < 4; row++) {
    const page = facePage(10, row);
    assert.equal(page.pages, 4);
    for (let i = page.start; i < page.end; i++) indices.push(i);
  }
  assert.deepEqual(indices, Array.from({ length: 10 }, (_, i) => i));
  assert.equal(facePage(10, -1).current, 0);
  assert.equal(facePage(10, 20).current, 3);
  assert.equal(facePage(0).end, 0);
});

test('inventory rerenders reuse loaded face cards and preserve the browsed row', async () => {
  const previousDocument = globalThis.document;
  class Element {
    children = []; attributes = {}; handlers = {};
    style = {};
    setAttribute(key, value) { this.attributes[key] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(key, handler) { this.handlers[key] = handler; }
    getContext() { return { drawImage() {} }; }
  }
  globalThis.document = { createElement: () => new Element() };
  try {
    const { inventoryFacePicker } = await import('../../src/ui/enhanced/inventoryFaces.js');
    const entity = { name: 'Stable inventory regression', race: 'Breton', gender: 'female', faceIndex: 0 };
    let loads = 0, firstChanges = 0, latestChanges = 0;
    const loadFaces = async () => { loads++; return Array.from({ length: 10 }, () => ({ width: 128, height: 160 })); };
    const root = inventoryFacePicker({ entity, onChange: () => firstChanges++, loadFaces });
    await Promise.resolve();
    root.children[1].children[1].handlers.click(); // Browse the second row.
    const cards = root.children[0];
    assert.equal(cards.children[0].title, 'Лицо 4');
    for (let i = 0; i < 5; i++) {
      const next = inventoryFacePicker({ entity, onChange: () => latestChanges++, loadFaces });
      assert.equal(next, root, 'selector DOM is retained');
      assert.equal(next.children[0], cards, 'loaded cards are not replaced');
    }
    assert.equal(loads, 1, 'unrelated renders do not reload portraits');
    cards.children[0].handlers.click();
    assert.equal(firstChanges, 0, 'a retained selector uses the latest callback');
    assert.equal(latestChanges, 1);
    assert.equal(entity.faceIndex, 0, 'the cosmetic choice does not change the entity');
  } finally { globalThis.document = previousDocument; }
});
