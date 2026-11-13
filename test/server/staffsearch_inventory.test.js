// The panel's Inventories sorted by name, worth or count, a potion named as the pack names it (a bottle saved with no
// name read "(no name)"), and the census finding potions by that word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveViewOf, pieceNameOf, ITEM_ORDERS } from '../../server-account/src/staffPlayers.js';
import { findKinds, kindName, censusTally, _forgetCensusForTests } from '../../server-account/src/staffCensus.js';
import { createPotion } from '../../src/systems/loot/loot.js';
import { POTION_RECIPES, potionRecipeKey } from '../../src/systems/potionRecipes.js';
import { potionRecipeByKey } from '../../src/systems/potions.js';

const KEY = potionRecipeKey(POTION_RECIPES[0].ingredients);
const NAME = potionRecipeByKey(KEY).displayName;

test('a potion saved with no name is named as the pack names it', () => {
  const bottle = createPotion(KEY);
  assert.equal(bottle.name, undefined, 'the mint writes no name (the reason it read "(no name)")');
  assert.equal(pieceNameOf(bottle), `Potion of ${NAME}`);
  assert.equal(pieceNameOf({ ...bottle, potent: 1 }), `Potent Potion of ${NAME}`);
  assert.equal(pieceNameOf({ ...bottle, potionRecipeKey: 1 }), 'Potion of Unknown Powers');
  assert.equal(pieceNameOf({ group: 'MiscItems', templateIndex: 278, potionRecipeKey: KEY }), `Potion recipe: ${NAME}`);
  assert.equal(pieceNameOf({ group: 'Weapons', templateIndex: 120 }), 'Longsword', 'any nameless piece: its template');
  assert.equal(pieceNameOf({ name: 'Brisk\'s Blade', group: 'Weapons', templateIndex: 120 }), 'Brisk\'s Blade', 'its own name first');
  assert.equal(pieceNameOf({}), null);
  const rows = saveViewOf({ items: [bottle, { name: 'Bread', group: 'Food', templateIndex: 9999 }] }).items;
  assert.deepEqual(rows.map((r) => r.name), [`Potion of ${NAME}`, 'Bread']);
});

test('the orders: by name A to Z, by worth and by count the most first', () => {
  const rows = [{ name: 'b', worth: 5, count: 1 }, { name: 'A', worth: null, price: 9, count: 3 }, { name: 'c', worth: 1, count: 2 }];
  assert.deepEqual([...rows].sort(ITEM_ORDERS.name).map((r) => r.name), ['A', 'b', 'c']);
  assert.deepEqual([...rows].sort(ITEM_ORDERS.worth).map((r) => r.name), ['A', 'b', 'c'], 'a listing at its price');
  assert.deepEqual([...rows].sort(ITEM_ORDERS.count).map((r) => r.name), ['A', 'c', 'b']);
});

test('the census finds potions by that word, and names the bottle kind plainly', () => {
  _forgetCensusForTests();
  for (const q of ['pot', 'potion', 'Potions', 'bottle']) assert.equal(findKinds(q)[0]?.kind, 't83', q);
  assert.equal(kindName('t83'), 'Potions, every kind (and empty bottles)');
  assert.ok(findKinds('glass').some((k) => k.kind === 't83' && k.name === kindName('t83')), 'named the same found by its template');
  assert.equal(findKinds('83').filter((k) => k.kind === 't83').length, 1, 'once');
  assert.ok(findKinds('gold').some((k) => k.kind === 'gold'));
  const tally = JSON.parse(/** @type {string} */ (censusTally({ items: [createPotion(KEY), { ...createPotion(KEY), stackCount: 3 }] })));
  assert.equal(tally.t83, 4, 'every potion a save holds is counted as the bottle');
});
