// getBinding and codeForAction keep their answers on the store until a binding changes (`rev`, as comboModifiers
// keeps its set): the HUD's key words ask them every frame, and each walked every entry of a dict through dictEntries.
// These pins hold the kept answers to a fresh walk across every kind of write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBindings, setBinding, shareBinding, dropBinding, getBinding, codeForAction, dictEntries } from '../../src/systems/inputActions.js';

/** The two readers as they walked before the kept answers: the oracles. */
const walkBinding = (store, action, primary = true) => {
  for (const [code, a] of dictEntries(store, primary)) if (a === action) return code;
  return null;
};
const walkCode = (store, action) => {
  for (const primary of [true, false]) {
    if (!(primary ? store?.primary : store?.secondary)) continue;
    for (const [code, act] of dictEntries(store, primary)) if (act === action) return code;
  }
  return null;
};
const ACTIONS = ['MoveForwards', 'MoveBackwards', 'Jump', 'SwingWeapon', 'ActivateCenterObject', 'Nothing'];
const same = (store, when) => {
  for (const action of ACTIONS) {
    assert.equal(getBinding(store, action), walkBinding(store, action), `${when}: getBinding ${action}`);
    assert.equal(getBinding(store, action, false), walkBinding(store, action, false), `${when}: getBinding ${action} (secondary)`);
    assert.equal(codeForAction(store, action), walkCode(store, action), `${when}: codeForAction ${action}`);
  }
};

test('the kept answers equal a fresh walk before and after every write - a bind, a share, a drop, a steal across dicts, a bind to null (mutants: a write that does not move rev, a kept answer read past a write)', () => {
  const store = createBindings();
  same(store, 'empty');
  setBinding(store, 'KeyW', 'MoveForwards');
  same(store, 'bound W');
  setBinding(store, 'KeyS', 'MoveBackwards');
  setBinding(store, 'Mouse0', 'SwingWeapon', false);
  same(store, 'three bound');
  getBinding(store, 'Jump'); codeForAction(store, 'Jump');   // answers kept: null
  shareBinding(store, 'KeyW', 'Jump');
  same(store, 'W shared with Jump');
  getBinding(store, 'SwingWeapon'); getBinding(store, 'SwingWeapon', false);
  setBinding(store, 'Mouse0', 'ActivateCenterObject');   // steals Mouse0 from the secondary dict
  same(store, 'Mouse0 stolen');
  dropBinding(store, 'KeyW', 'Jump');
  same(store, 'the share dropped');
  setBinding(store, null, 'MoveForwards');
  same(store, 'W unbound');
  assert.equal(getBinding(store, 'MoveForwards'), null);
});

test('a store without rev or dicts: codeForAction answers null for no store, and a bare store\'s answers follow a direct write once rev moves (mutants: rev read as a boolean)', () => {
  assert.equal(codeForAction(null, 'Jump'), null);
  assert.equal(codeForAction(undefined, 'Jump'), null);
  const store = createBindings();
  assert.equal(getBinding(store, 'Jump'), null);
  store.primary.set('Space', 'Jump');   // a direct write, as a loader's: the store's own writers all move rev
  store.rev++;
  assert.equal(getBinding(store, 'Jump'), 'Space');
  assert.equal(codeForAction(store, 'Jump'), 'Space');
});
