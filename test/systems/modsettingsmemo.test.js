// modSettingsOf keeps a vendor's whole settings object until something a key's read depends on moves: the store's
// generation (a switch set, a reset), the page going online (the room's forced keys) or a room roll's scope (every key
// the room's whole). The widgets, torches and footsteps asked for theirs every frame, and each read walked every key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modSettingsOf, modSetting, setModSetting, MOD_SETTINGS, _resetModSettings, modSettingsGeneration } from '../../src/systems/modSettings.js';
import { asTheRoom } from '../../src/systems/online/onlineLane.js';

/** A vendor's settings as a fresh walk of every key reads them: the oracle. */
const walk = (vendor) => Object.fromEntries(Object.keys(MOD_SETTINGS[vendor].keys).map((k) => [k, modSetting(vendor, k)]));
/** A vendor with a boolean switch to flip. */
const [VENDOR, KEY] = (() => {
  for (const [vendor, def] of Object.entries(MOD_SETTINGS)) for (const [key, k] of Object.entries(def.keys ?? {})) if (typeof k.default === 'boolean') return [vendor, key];
  throw new Error('no vendored mod with a boolean switch');
})();

test('the kept object answers as a fresh walk does, is the same object while nothing moved, and follows a switch set and a reset (mutants: the kept object read past a set, the generation not read)', () => {
  _resetModSettings();
  const a = modSettingsOf(VENDOR);
  assert.deepEqual(a, walk(VENDOR));
  assert.equal(modSettingsOf(VENDOR), a, 'the same object while nothing moved');
  const gen = modSettingsGeneration();
  setModSetting(VENDOR, KEY, !a[KEY]);
  assert.notEqual(modSettingsGeneration(), gen, 'a set moves the generation');
  const b = modSettingsOf(VENDOR);
  assert.notEqual(b, a, 'a set gives a new object');
  assert.equal(b[KEY], !a[KEY]);
  assert.deepEqual(b, walk(VENDOR));
  assert.equal(modSettingsOf(VENDOR), b);
  _resetModSettings();
  const c = modSettingsOf(VENDOR);
  assert.deepEqual(c, walk(VENDOR));
  assert.equal(c[KEY], a[KEY], 'the default back after a reset');
  _resetModSettings();
});

test('inside a room roll the answer is the roll\'s, and after it the player\'s own again (mutants: the roll\'s scope not read)', () => {
  _resetModSettings();
  const own = modSettingsOf(VENDOR);
  const rolled = asTheRoom(() => {
    const r = modSettingsOf(VENDOR);
    assert.deepEqual(r, walk(VENDOR), 'the roll\'s own walk');
    return r;
  });
  assert.ok(rolled !== own || Object.keys(walk(VENDOR)).length === 0, 'a roll\'s scope is not served the player\'s kept object');
  const after = modSettingsOf(VENDOR);
  assert.deepEqual(after, own, 'the player\'s own answers after the roll');
  _resetModSettings();
});
