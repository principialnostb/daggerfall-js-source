// A card's refresh walks the weather map once over its hours: counted call by call, against the forecast read a walk
// a reading (forecastBefore.mjs). V8's precise coverage does the counting, and started and stopped here it drops what
// a coverage tool had counted in the run, so the count has a file of its own and stands down where such a tool reads
// the run (NODE_V8_COVERAGE, as tools/mutation/cover.mjs sets it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import * as weatherMap from '../../../src/systems/weather/weatherMap.js';
import { createOverworldForecast } from '../../../src/scenes/overworldForecastHost.js';
import { setWeatherMapLaw, mapGround } from '../../../src/systems/weather/weatherSim.js';
import { continent, pastBay, natives, lineBefore } from './forecastBefore.mjs';

/** V8's precise coverage, counting calls: while it counts, the optimiser stands down, so no call goes uncounted.
 *  `count(names)` answers how often each of the weather map's functions `names` ran since the last count. */
async function callCounter() {
  const session = new Session();
  session.connect();
  await session.post('Profiler.enable');
  await session.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
  await session.post('Profiler.takePreciseCoverage');
  return {
    async count(names) {
      const { result } = await session.post('Profiler.takePreciseCoverage');
      const calls = Object.fromEntries(names.map((name) => [name, 0]));
      for (const script of result) {
        if (!script.url.endsWith('systems/weather/weatherMap.js')) continue;
        for (const fn of script.functions) {
          if (Object.hasOwn(calls, fn.functionName)) calls[fn.functionName] += fn.ranges[0].count;
        }
      }
      return calls;
    },
    async stop() {
      await session.post('Profiler.stopPreciseCoverage');
      await session.post('Profiler.disable');
      session.disconnect();
    },
  };
}

/** Where a coverage tool reads the run, the reason the count stands down. */
const COVERAGE_READ = process.env.NODE_V8_COVERAGE
  ? 'NODE_V8_COVERAGE is set: counting calls here would drop the coverage it takes of this file'
  : false;

test('A CARD\'S REFRESH WALKS THE MAP ONCE: counted call by call, each refresh of a place\'s card walks the map over its hours once (weatherSpan) and never at a single minute (systemsNear), and asks at most twice the lattice nodes one walk asks, past the Bay and in it; read a walk a quarter hour and a walk a step of the bisection, the same refreshes walked it 25 times and more each', { skip: COVERAGE_READ }, async () => {
  setWeatherMapLaw(true);
  const counter = await callCounter();
  try {
    const ground = mapGround(continent);
    let minute = 0;
    const host = createOverworldForecast({
      climateAt: continent,
      ground,
      minuteNow: () => minute,
      here: () => natives(0, 0),
      tvTrip: { natives: [] },
      tvTripLive: () => false,
      travel: () => null,
    });
    const names = ['weatherSpan', 'systemsNear', 'birthsIn'],
      places = [
        [-409600, -245760],
        [300000, 200000],
      ];
    assert.ok(pastBay(...places[0]) && !pastBay(...places[1]), 'one place past the Bay, one in it');
    let bisected = 0;
    for (const [x, z] of places) {
      const n = natives(x, z),
        at = `(${x}, ${z})`,
        minutes = Array.from({ length: 8 }, (_, k) => 2000000 + k * 263);
      await counter.count(names);
      weatherMap.systemsNear(x, z, minutes[0], continent, 0);
      const one = await counter.count(names);
      for (const m of minutes) {
        minute = m;
        host.placeLine(n);
      }
      const now = await counter.count(names);
      for (const m of minutes) bisected += Number(lineBefore(n, m, ground, null).changed);
      const before = await counter.count(names);
      assert.equal(now.weatherSpan, minutes.length, `${at}: one walk over the hours a refresh`);
      assert.equal(now.systemsNear, 0, `${at}: and no walk of a single minute`);
      const asked = `${now.birthsIn} nodes asked in ${minutes.length} refreshes, ${one.birthsIn} in one walk`;
      assert.ok(now.birthsIn <= 2 * one.birthsIn * minutes.length, `${at}: ${asked}`);
      assert.ok(before.systemsNear >= 25 * minutes.length, `${at}: a walk a reading made ${before.systemsNear} walks`);
      assert.ok(before.birthsIn >= 10 * now.birthsIn, `${at}: and asked ${before.birthsIn} nodes, where ${asked}`);
    }
    assert.ok(bisected >= 4, `${bisected} of the refreshes found a change to the minute`);
  } finally {
    await counter.stop();
    setWeatherMapLaw(null);
  }
});
