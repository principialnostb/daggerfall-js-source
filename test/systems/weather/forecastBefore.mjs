// The Overworld forecast read a walk of the weather map a reading: a walk at each quarter hour, and one at each step
// of the bisection that finds a change to the minute. The oracle that ow_forecast_span.test.js and
// ow_forecast_walks.test.js hold the forecast's one walk over its hours to, with the climates and natives they share.
import * as weatherMap from '../../../src/systems/weather/weatherMap.js';
import { hereLine, HERE_HOURS, HERE_STEP_MIN } from '../../../src/systems/weather/owForecast.js';
import { nativeFromField, fieldFromNative, pixelOfField } from '../../../src/systems/weather/weatherField.js';
import { CLIMATES } from '../../../src/formats/mapsFile.js';
import { inBay } from '../../../src/world/tamriel/tamrielFrame.js';
import { tamrielClimateAt } from '../../../src/world/tamriel/tamrielGround.js';

/** The Bay's woodlands, and past the Bay the continent's own climates. */
export const continent = (px, py) => (inBay(px, py) ? CLIMATES.Woodlands : tamrielClimateAt(px, py));
/** Does a field place lie past the Bay? */
export const pastBay = (x, z) => {
  const pixel = pixelOfField(x, z);
  return !inBay(pixel.x, pixel.y);
};
/** A field place as the host is handed one: its natives. */
export const natives = (x, z) => {
  const [nx, nz] = nativeFromField(x, z);
  return { x: nx, z: nz };
};

/** The forecast's hours as they were read: a walk of the map at each quarter hour. */
export function forecastBefore(x, z, minutes, hours, step, ground, alt) {
  const read = (at) => weatherMap.weatherAt(x, z, at, continent, { ground, alt });
  const now = read(minutes),
    steps = [];
  let next = null;
  for (let at = minutes + step; at <= minutes + hours * 60; at += step) {
    const w = read(at);
    steps.push({ at, word: w.word, intensity: w.intensity });
    if (!next && w.word !== now.word) next = { at, word: w.word };
  }
  return { at: minutes, now, steps, next };
}
/** A place's line as the host said it: those hours, and the first change found to the minute by a bisection that
 *  walked the map at each of its steps. */
export function lineBefore(n, minute, ground, alt) {
  const [x, z] = fieldFromNative(n.x, n.z),
    m = Math.floor(minute);
  const fc = forecastBefore(x, z, m, HERE_HOURS, HERE_STEP_MIN, ground, alt);
  const k = fc.steps.findIndex((s) => s.word !== fc.now.word);
  if (k >= 0) {
    const word = k ? fc.steps[k - 1].word : fc.now.word;
    let lo = k ? fc.steps[k - 1].at : m,
      hi = fc.steps[k].at;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (weatherMap.weatherAt(x, z, mid, continent, { ground, alt }).word === word) lo = mid;
      else hi = mid;
    }
    fc.steps[k] = { ...fc.steps[k], at: hi };
  }
  return { line: hereLine(fc), changed: k >= 0 };
}
