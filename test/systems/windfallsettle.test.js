// The Windfall model is handed its settings every frame. The host hands it one object until a setting is written, and
// that object is not the one the model was made with. When it holds what the model already plays by, the model takes
// it, so the next frame's same object is known at once and its key is not made again; and every answer is the one the
// model gives when it is handed its own object.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindfall, windfallSettings } from '../../src/systems/windfall.js';

const WEATHERS = ['sunny', 'rain', 'thunder', 'snow'];
/** A long walk: the weather, the day, the pixel and the doors move, so every part of the model is read. */
const frame = (i, settings) => ({
  dt: 0.05,
  outside: i % 900 < 700,
  weather: WEATHERS[((i / 400) | 0) % 4],
  date: { year: 405, month: 5, day: 3 + ((i / 1200) | 0) },
  minuteOfDay: 720,
  absoluteDay: 1000,
  season: 2,
  climate: 231,
  mapPixel: { x: 100 + ((i / 500) | 0) * 8, y: 200 },
  heading: null,
  settings,
});

test('the host\'s object, holding the settings the model plays by, is keyed once and not every frame (mutants: the key match left without taking the object)', () => {
  const made = windfallSettings();
  const model = createWindfall({ settings: made });
  const hosted = windfallSettings();
  assert.notEqual(hosted, made, 'a new object, as the host reads its own');
  const stringify = JSON.stringify;
  let keyed = 0;
  JSON.stringify = function (value, ...rest) {
    if (value === hosted) keyed++;
    return stringify.call(this, value, ...rest);
  };
  try {
    for (let i = 0; i < 240; i++) model.tick(frame(i, hosted));
  } finally {
    JSON.stringify = stringify;
  }
  assert.equal(keyed, 1, `the same settings keyed ${keyed} times in 240 frames`);
});

test('a model handed an equal object every frame answers exactly as one handed its own, through a change and back (the oracle)', () => {
  const own = windfallSettings();
  const changed = Object.freeze({ ...own, gustStrength: Math.fround(own.gustStrength * 2), windDirectionDegrees: 80 });
  const off = Object.freeze({ ...own, enabled: false });
  const plain = createWindfall({ settings: own }),
    hosted = createWindfall({ settings: own });
  const copy = () => JSON.parse(JSON.stringify(own));
  const phases = [
    [0, own, copy()],
    [1500, changed, JSON.parse(JSON.stringify(changed))],
    [2600, own, copy()],
    [3300, off, { ...copy(), enabled: false }],
    [3700, own, windfallSettings()],
  ];
  let mine = null,
    theirs = null;
  for (let i = 0; i < 5000; i++) {
    for (const [at, a, b] of phases)
      if (i === at) {
        mine = a;
        theirs = b;
      }
    assert.deepEqual(hosted.tick(frame(i, theirs)), plain.tick(frame(i, mine)), `frame ${i}`);
  }
  assert.deepEqual(hosted.status(), plain.status());
});
