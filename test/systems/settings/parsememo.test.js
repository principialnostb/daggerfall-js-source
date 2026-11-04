// The typed settings getters keep one key's last parse (src/systems/settings/settings.js parseOf): they run every frame
// (the field of view, retro mode's five, the frame cap), and each read trimmed, matched and converted the same text.
// These pins hold the kept parse to the parse it replaces - the same answers for the same text, a changed value read at
// once, a bad value said once and a new bad value said again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBool, getInt, getFloat, setValue, resetToDefaults, _resetForTests, DEFAULTS } from '../../../src/systems/settings/settings.js';

/** The getters as they parsed before the kept parse, over a raw string: the oracle. */
const oracleInt = (raw, min = null, max = null) => {
  const n = /^[+-]?\d+$/.test(String(raw ?? '').trim()) ? parseInt(raw, 10) : NaN;
  if (Number.isNaN(n)) return min === null ? 0 : min;
  return min === null ? n : Math.min(max, Math.max(min, n));
};
const oracleBool = (raw) => {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'true' ? true : s === 'false' ? false : false;
};
const oracleFloat = (raw, min = null, max = null) => {
  const n = Number(String(raw ?? '').trim());
  if (!Number.isFinite(n) || String(raw ?? '').trim() === '') return min === null ? 0 : min;
  return min === null ? n : Math.min(max, Math.max(min, n));
};
const quiet = (fn) => {
  const warn = console.warn, said = [];
  console.warn = (...a) => { said.push(a.join(' ')); };
  try { return [fn(), said]; } finally { console.warn = warn; }
};

test('the kept parse answers as the parse did: every raw text of a table, read twice, for the int, the bool and the float, with and without a range (mutants: a kept parse read for the wrong text, a range clamped on the kept number only once)', () => {
  _resetForTests();
  const raws = ['12', ' 7 ', '+3', '-4', '0', 'x', '', '1.5', '2.0', 'TRUE', 'false', ' True ', 'yes', '  -0.25', '1e3', 'NaN'];
  for (const raw of raws) {
    setValue('Video', 'FieldOfView', raw);
    setValue('Startup', 'StartInDungeon', raw);
    setValue('Video', 'ExteriorShadowDistance', raw);
    for (let k = 0; k < 2; k++) {
      const [got] = quiet(() => [getInt('Video', 'FieldOfView'), getInt('Video', 'FieldOfView', 60, 120), getBool('Startup', 'StartInDungeon'), getFloat('Video', 'ExteriorShadowDistance'), getFloat('Video', 'ExteriorShadowDistance', 1, 50)]);
      assert.deepEqual(got, [oracleInt(raw), oracleInt(raw, 60, 120), oracleBool(raw), oracleFloat(raw), oracleFloat(raw, 1, 50)], `raw ${JSON.stringify(raw)}, read ${k + 1}`);
    }
  }
  resetToDefaults();
  assert.equal(getInt('Video', 'FieldOfView'), Number(DEFAULTS.Video.FieldOfView), 'the default back after a reset');
  _resetForTests();
});

test('a changed value is read at once, a bad value is said once over many reads and a new bad value is said again (mutants: the parse kept past a change, the warning said every read)', () => {
  _resetForTests();
  setValue('Video', 'FieldOfView', '70');
  assert.equal(getInt('Video', 'FieldOfView'), 70);
  setValue('Video', 'FieldOfView', '80');
  assert.equal(getInt('Video', 'FieldOfView'), 80, 'a new value, not the kept one');
  setValue('Video', 'FieldOfView', 'eighty');
  const [, saidA] = quiet(() => { for (let i = 0; i < 5; i++) getInt('Video', 'FieldOfView'); });
  assert.equal(saidA.length, 1, `a bad value is said once over five reads (${saidA.length})`);
  setValue('Video', 'FieldOfView', 'ninety');
  const [, saidB] = quiet(() => { for (let i = 0; i < 5; i++) getInt('Video', 'FieldOfView'); });
  assert.equal(saidB.length, 1, 'a new bad value is said once more');
  setValue('Video', 'FieldOfView', 'eighty');
  const [, saidC] = quiet(() => getInt('Video', 'FieldOfView'));
  assert.equal(saidC.length, 0, 'the first bad value, back again, was said already');
  _resetForTests();
  setValue('Video', 'FieldOfView', 'eighty');
  const [, saidD] = quiet(() => getInt('Video', 'FieldOfView'));
  assert.equal(saidD.length, 1, 'a test reset forgets what was said and what was parsed');
  _resetForTests();
});
