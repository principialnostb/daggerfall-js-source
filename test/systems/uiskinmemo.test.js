// The skin is asked many times a frame. Each half of its answer is kept until what it is made of changes - the
// override until the page's search string does, the stored choice's reading until getPref answers something else - and
// after every kind of change the answer is the one the formula gives read fresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uiSkin, isEnhanced, setUiSkin, skinOverride, SKINS, DEFAULT_SKIN } from '../../src/systems/uiSkin.js';
import { getPref, setPref, resetPrefs, _resetForTests } from '../../src/systems/uiPrefs.js';
import { declareOnlinePrefs } from '../../src/systems/online/onlineLane.js';

const shelf = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (k) => (shelf.has(k) ? shelf.get(k) : null),
    setItem: (k, v) => void shelf.set(k, String(v)),
    removeItem: (k) => void shelf.delete(k),
  },
});
const SEARCHES = ['', '?skin=classic', '?skin=enhanced', '?skin=modern', '?online', '?online&skin=classic', undefined, null];

/** The skin as the formula reads it with nothing kept: the oracle. */
const freshSkin = (search) => {
  const stored = getPref('skin');
  return skinOverride(search) ?? (SKINS.includes(stored) ? stored : null) ?? DEFAULT_SKIN;
};
/** Every search, twice over (the second ask is the kept one), against the oracle. */
const sweep = (why) => {
  for (const search of SEARCHES)
    for (let ask = 0; ask < 2; ask++) {
      assert.equal(uiSkin(search), freshSkin(search), `${why}: ${search}`);
      assert.equal(isEnhanced(search), freshSkin(search) === 'enhanced', `${why}: ${search}`);
    }
};

test('after every kind of change the skin is the one a fresh read gives (mutants: either half latched on its first answer)', () => {
  _resetForTests();
  shelf.clear();
  sweep('nothing stored');
  setUiSkin('classic');
  sweep('the skin switched to classic');
  setUiSkin('enhanced');
  sweep('and back');
  setPref('skin', 'classic');
  sweep('the pref written');
  setPref('skin', 'modern');
  sweep('a typo stored');
  setPref('skin', null);
  sweep('nothing stored on the key');
  resetPrefs();
  sweep('the prefs reset');
  setUiSkin('classic');
  shelf.set('dagger.ui.v1', JSON.stringify({ skin: 'enhanced' }));
  sweep('another tab wrote the shelf (read at the next load, as ever)');
  assert.equal(uiSkin(''), 'classic');
  _resetForTests();
  sweep('the next load');
  assert.equal(uiSkin(''), 'enhanced');
  const page = { search: '?skin=classic' };
  globalThis.location = page;
  try {
    sweep('the page asks for classic');
    page.search = '';
    sweep('a replaceState took the override away');
    page.search = '?online&skin=enhanced';
    sweep('and put the other one up');
    page.search = '?online';
    declareOnlinePrefs({ skin: true });
    sweep('the online lane forcing the key');
    declareOnlinePrefs({ skin: 'player' });
    sweep('and leaving it to the player again');
  } finally {
    delete globalThis.location;
  }
  sweep('no page');
});

test('a steady page and choice are read from what was kept: the search parsed and the choice cleaned once, not every ask (mutants: either half made again on every ask)', () => {
  _resetForTests();
  shelf.clear();
  setUiSkin('classic');
  uiSkin();
  uiSkin('?skin=enhanced');
  const gets = URLSearchParams.prototype.get,
    includes = Array.prototype.includes;
  let parsed = 0,
    cleaned = 0;
  URLSearchParams.prototype.get = function (...args) {
    parsed++;
    return gets.apply(this, args);
  };
  Array.prototype.includes = function (...args) {
    if (this === SKINS) cleaned++;
    return includes.apply(this, args);
  };
  let enhanced = 0;
  try {
    for (let i = 0; i < 500; i++) enhanced += isEnhanced();
    for (let i = 0; i < 500; i++) enhanced += isEnhanced('?skin=enhanced') * 2;
  } finally {
    URLSearchParams.prototype.get = gets;
    Array.prototype.includes = includes;
  }
  assert.equal(enhanced, 1000, 'the stored choice answers classic, the override enhanced');
  assert.ok(parsed <= 2, `the search asked of ${parsed} times in 1000 asks`);
  assert.ok(cleaned <= 2, `the stored choice cleaned ${cleaned} times in 500 asks`);
});
