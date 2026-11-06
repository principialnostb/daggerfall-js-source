// A mod's switch is read every frame by the hosts. Its answer is kept while the store's generation stands, and after
// every kind of change - a switch set, a reset, the page going online, a room roll - it is what a fresh read answers.
// The oracle is a second copy of the module, which has kept nothing and reads the same shelf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ALLOC_CHILD_ARGS } from '../allocChild.mjs';

const shelf = new Map();
const STORAGE = {
  getItem: (k) => (shelf.has(k) ? shelf.get(k) : null),
  setItem: (k, v) => void shelf.set(k, String(v)),
  removeItem: (k) => void shelf.delete(k),
};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: STORAGE });

const HERE = new URL('../../src/systems/modSettings.js', import.meta.url).href;
const mods = await import(HERE);
const { asTheRoom } = await import('../../src/systems/online/onlineLane.js');
const { MOD_SETTINGS, modSetting, setModSetting, _resetModSettings } = mods;
let copies = 0;
/** A copy of the module that has read nothing yet. */
const freshCopy = () => import(`${HERE}?fresh=${++copies}`);

const KEYS = Object.entries(MOD_SETTINGS).flatMap(([vendor, mod]) => Object.keys(mod.keys).map((key) => [vendor, key]));
/** Every declared key, asked twice (the second ask is the kept one), against the fresh copy's one ask. */
function sweep(fresh, why) {
  for (const [vendor, key] of KEYS) {
    const first = modSetting(vendor, key),
      again = modSetting(vendor, key),
      oracle = fresh.modSetting(vendor, key);
    assert.deepEqual(first, oracle, `${why}: ${vendor}/${key}`);
    assert.deepEqual(again, oracle, `${why}: ${vendor}/${key}, asked again`);
  }
}
/** A value for the key that is not its default, of the key's own kind. */
function another(def) {
  if (mods.isColorKey(def)) return def.default === '#123456ff' ? '#654321ff' : '#123456ff';
  if (mods.isTextKey(def)) return def.default === 'K' ? 'J' : 'K';
  if (mods.isTupleKey(def)) return [Number(def.default?.[0] ?? 0) + 1, Number(def.default?.[1] ?? 0) + 2];
  if (mods.isChoiceKey(def)) return (def.default + 1) % def.options.length;
  if (mods.isFloatKey(def) || mods.isIntKey(def)) return def.default === def.max ? def.min : def.max;
  return !def.default;
}

test('after every kind of change each key answers what a fresh read does (mutants: the generation, the roll or the room left unread; a pair kept)', async () => {
  _resetModSettings();
  shelf.clear();
  sweep(await freshCopy(), 'nothing stored');
  KEYS.forEach(([vendor, key], i) => {
    if (i % 3 === 0) setModSetting(vendor, key, another(MOD_SETTINGS[vendor].keys[key]));
  });
  sweep(await freshCopy(), 'a third of the switches set');
  KEYS.forEach(([vendor, key], i) => {
    if (i % 3 === 1) setModSetting(vendor, key, another(MOD_SETTINGS[vendor].keys[key]));
  });
  sweep(await freshCopy(), 'another third set, the kept answers of the first standing');
  const page = { search: '?online' };
  globalThis.location = page;
  try {
    sweep(await freshCopy(), 'the page online: the room owns its keys');
    page.search = '';
    sweep(await freshCopy(), 'and offline again');
  } finally {
    delete globalThis.location;
  }
  const rolled = await freshCopy();
  asTheRoom(() => sweep(rolled, 'inside a room roll'));
  sweep(await freshCopy(), 'after the roll');
  const before = KEYS.map(([vendor, key]) => modSetting(vendor, key));
  shelf.set('dfjs-mod-settings', '{}');
  assert.deepEqual(
    KEYS.map(([vendor, key]) => modSetting(vendor, key)),
    before,
    'another tab wrote the shelf: read at the next load, as ever',
  );
  _resetModSettings();
  sweep(await freshCopy(), 'the store reset');
  const pairs = KEYS.filter(([vendor, key]) => mods.isTupleKey(MOD_SETTINGS[vendor].keys[key]));
  for (const [vendor, key] of pairs) setModSetting(vendor, key, another(MOD_SETTINGS[vendor].keys[key]));
  for (const [vendor, key] of pairs) assert.notEqual(modSetting(vendor, key), modSetting(vendor, key), `${vendor}/${key}: a new pair each read`);
  _resetModSettings();
});

test('a kept key is answered without its lookups: no own-key check on an ask while nothing moved (mutants: the kept answer never asked)', () => {
  _resetModSettings();
  const [vendor, key] = KEYS.find(([v, k]) => typeof MOD_SETTINGS[v].keys[k].default === 'boolean');
  const answer = modSetting(vendor, key);
  const hasOwn = Object.hasOwn;
  let checks = 0;
  Object.hasOwn = (...args) => {
    checks++;
    return hasOwn(...args);
  };
  let same = 0;
  try {
    for (let i = 0; i < 1000; i++) same += modSetting(vendor, key) === answer;
  } finally {
    Object.hasOwn = hasOwn;
  }
  assert.equal(same, 1000);
  assert.ok(checks < 10, `${checks} own-key checks in 1000 asks of ${vendor}/${key}`);
});

test('a kept colour or dial makes nothing an ask, measured in a node of its own against a control that must show (mutants: the kept answer never asked)', () => {
  const script = `
    const shelf = new Map();
    globalThis.localStorage = { getItem: (k) => (shelf.has(k) ? shelf.get(k) : null), setItem: (k, v) => void shelf.set(k, String(v)), removeItem: (k) => void shelf.delete(k) };
    const mods = await import(${JSON.stringify(HERE)});
    const all = Object.entries(mods.MOD_SETTINGS).flatMap(([v, m]) => Object.keys(m.keys).map((k) => [v, k, m.keys[k]]));
    const colour = all.find(([, , d]) => mods.isColorKey(d)), dial = all.find(([, , d]) => mods.isFloatKey(d));
    mods.setModSetting(colour[0], colour[1], '#c08a3e');
    mods.setModSetting(dial[0], dial[1], dial[2].min + (dial[2].max - dial[2].min) * 0.37);
    const sink = [null];
    let k = 0;
    const fns = {
      colour: () => { sink[0] = mods.modSetting(colour[0], colour[1]); },
      dial: () => { sink[0] = mods.modSetting(dial[0], dial[1]); },
      control: () => { sink[0] = { a: k++, b: [k] }; },
    };
    const bytes = (fn) => {
      let least = Infinity;
      for (let r = 0; r < 5; r++) {
        for (let f = 0; f < 2000; f++) fn();
        globalThis.gc(); globalThis.gc();
        const h0 = process.memoryUsage().heapUsed;
        for (let f = 0; f < 2000; f++) fn();
        least = Math.min(least, (process.memoryUsage().heapUsed - h0) / 2000);
      }
      return least;
    };
    const out = { colourKey: colour.slice(0, 2).join('/'), dialKey: dial.slice(0, 2).join('/') };
    for (const name of Object.keys(fns)) out[name] = bytes(fns[name]);
    console.log(JSON.stringify(out));
  `;
  const run = spawnSync(process.execPath, [...ALLOC_CHILD_ARGS, '--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const m = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.ok(m.control >= 20, `the control made ${m.control.toFixed(2)} bytes a call: the measure is blind`);
  assert.ok(m.colour < 4, `${m.colourKey}: ${m.colour.toFixed(2)} bytes an ask`);
  assert.ok(m.dial < 4, `${m.dialKey}: ${m.dial.toFixed(2)} bytes an ask`);
});
