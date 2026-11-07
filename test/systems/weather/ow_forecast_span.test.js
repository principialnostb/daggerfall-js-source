// A place's next hours on the Overworld - standing, and on a place's card - are read from one walk of the weather map
// over those hours. Pinned against the forecast as it read them before, a walk of the map for each quarter hour and one
// for each step of the bisection that finds a change to the minute (forecastBefore.mjs): the same line, at places in
// the Bay and past it, over days of minutes, with the ground's law and without, at the ground and at a height. A span
// is walked from the minute before its first; a card's refresh allocates a fraction of what those walks made (that it
// walks the map once is ow_forecast_walks.test.js's); and a span answers for no minute it does not hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import * as weatherMap from '../../../src/systems/weather/weatherMap.js';
import { createOverworldForecast, FORECAST_EVERY_MS } from '../../../src/scenes/overworldForecastHost.js';
import { setWeatherMapLaw, mapGround } from '../../../src/systems/weather/weatherSim.js';
import { continent, pastBay, natives, forecastBefore, lineBefore } from './forecastBefore.mjs';

/** Field places: two in the Bay, the rest past it. */
const PLACES = [
  [300000, 200000],
  [150000, 120000],
  [-409600, -245760],
  [1100000, 640000],
  [900000, -700000],
  [-150000, 380000],
];

test('A PLACE\'S NEXT HOURS READ FROM ONE WALK SAY WHAT A WALK EACH READING SAID: a place\'s card and the line said standing, at places in the Bay and past it, over three days of minutes (whole and between), with the ground\'s law and without, at the ground\'s height and the traveller\'s - the same line, the change found to the same minute', () => {
  setWeatherMapLaw(true);
  try {
    let said = 0,
      changes = 0,
      pastChanges = 0;
    for (const ground of [mapGround(continent), null]) {
      let minute = 0,
        here = natives(0, 0),
        height = null,
        nowMs = 0;
      const host = createOverworldForecast({
        climateAt: continent,
        ground,
        minuteNow: () => minute,
        here: () => here,
        alt: () => height,
        tvTrip: { natives: [] },
        tvTripLive: () => false,
        travel: () => null,
      });
      for (const [x, z] of PLACES) {
        const n = natives(x, z);
        for (let k = 0; k < 16; k++) {
          minute = 2000000 + k * 263.37;
          const card = lineBefore(n, minute, ground, null);
          assert.equal(host.placeLine(n), card.line, `the card at (${x}, ${z}), minute ${minute}`);
          here = n;
          height = k % 3 ? 140 + 37 * k : null;
          nowMs += FORECAST_EVERY_MS;
          const standing = lineBefore(n, minute, ground, height);
          assert.equal(host.line(nowMs), standing.line, `standing at (${x}, ${z}), minute ${minute}, ${height} m`);
          said += 2;
          changes += Number(card.changed) + Number(standing.changed);
          if (pastBay(x, z)) pastChanges += Number(card.changed);
        }
      }
    }
    assert.ok(PLACES.filter(([x, z]) => pastBay(x, z)).length >= 4, 'most of the places past the Bay');
    assert.ok(changes >= 40 && pastChanges >= 12, `${said} lines said, ${changes} with a change found to the minute (${pastChanges} cards past the Bay)`);
  } finally {
    setWeatherMapLaw(null);
  }
});

test('A SPAN OF THE MAP ANSWERS THE MAP AT EVERY WHOLE MINUTE OF IT: walked from the minute before its first (a death\'s minute is rounded, and a system alive at the first by less than that is found), weatherAmong over weatherSpan is weatherAt at each minute from the first to the last, in the Bay and past it, with the ground\'s law and without; and forecastAt read from a span is forecastAt read a walk a quarter hour', () => {
  setWeatherMapLaw(true);
  try {
    const ground = mapGround(continent);
    let minutes = 0;
    for (const [x, z] of PLACES) {
      const first = 2000000 + Math.round(x / 1000),
        last = first + 240;
      const span = weatherMap.weatherSpan(x, z, first, last, continent);
      assert.deepEqual([span.t0, span.t1], [first - 1, last], `(${x}, ${z}): the walk from the minute before the first`);
      for (let at = first; at <= last; at++) {
        for (const law of [ground, null]) {
          const w = weatherMap.weatherAt(x, z, at, continent, { ground: law, alt: 400 });
          assert.deepEqual(weatherMap.weatherAmong(span, at, { ground: law, alt: 400 }), w, `(${x}, ${z}) at ${at}`);
          minutes++;
        }
      }
      const fc = weatherMap.forecastAt(x, z, first, continent, { hours: 4, step: 15, ground, span });
      assert.deepEqual(fc, forecastBefore(x, z, first, 4, 15, ground, null), `(${x}, ${z}): the forecast`);
      assert.deepEqual(weatherMap.forecastAt(x, z, first, continent, { hours: 4, step: 15, ground }), fc, 'and without a span');
    }
    assert.equal(minutes, PLACES.length * 241 * 2);
  } finally {
    setWeatherMapLaw(null);
  }
});

test('A SPAN ANSWERS FOR NO MINUTE IT DOES NOT HOLD: before its first minute, past its last and between whole minutes, weatherAmong is weatherAt, in the Bay and past it, with the ground\'s law and without, where the span\'s own systems said another word at many of those minutes', () => {
  setWeatherMapLaw(true);
  try {
    const ground = mapGround(continent);
    let read = 0,
      wrong = 0;
    for (const [x, z] of PLACES) {
      const first = 2000000 + Math.round(x / 1000),
        last = first + 240;
      const span = weatherMap.weatherSpan(x, z, first, last, continent);
      const outside = [first - 1440, first - 600, first - 30, first - 1, last + 1, last + 90, last + 900, last + 1440];
      for (const at of [...outside, first + 10.5, first + 120.25]) {
        for (const law of [ground, null]) {
          const want = weatherMap.weatherAt(x, z, at, continent, { ground: law, alt: 400 });
          assert.deepEqual(weatherMap.weatherAmong(span, at, { ground: law, alt: 400 }), want, `(${x}, ${z}) at ${at}`);
          const lawAt = law && ((word, px, pz) => law(word, px, pz, at)),
            air = law?.lawAir?.(at, 400) ?? null;
          const spanOnly = weatherMap.wornAmong(weatherMap.systemsAmong(span, at), x, z, lawAt, air);
          wrong += Number(spanOnly.word !== want.word);
          read++;
        }
      }
    }
    assert.ok(wrong >= 10, `the span's own systems said another word at ${wrong} of ${read} minutes`);
  } finally {
    setWeatherMapLaw(null);
  }
});

/** Bytes a call of `fn` allocates in frames of the forecast's and the weather map's own sources, by V8's sampling heap
 *  profiler over `n` calls after `warm`: every sampled allocation, collected or not. */
async function sampledBytes(fn, n, warm) {
  for (let k = 0; k < warm; k++) fn();
  const session = new Session();
  session.connect();
  await session.post('HeapProfiler.enable');
  await session.post('HeapProfiler.startSampling', {
    samplingInterval: 256,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  for (let k = 0; k < n; k++) fn();
  const { profile } = await session.post('HeapProfiler.stopSampling');
  await session.post('HeapProfiler.disable');
  session.disconnect();
  const files = ['systems/weather/weatherMap.js', 'scenes/overworldForecastHost.js', 'systems/weather/owForecast.js'];
  let bytes = 0;
  const visit = (node) => {
    if (files.some((f) => node.callFrame.url.endsWith(f))) bytes += node.selfSize;
    for (const child of node.children ?? []) visit(child);
  };
  visit(profile.head);
  return bytes / n;
}

test('A CARD\'S REFRESH ALLOCATES A FRACTION OF WHAT ITS WALKS MADE: a place\'s card read anew each minute of the weather\'s clock allocates under 2 MB a refresh in the forecast\'s and the weather map\'s frames, past the Bay and in it (a walk a quarter hour and a walk a step of the bisection made several times that)', async () => {
  setWeatherMapLaw(true);
  try {
    let minute = 2000000;
    const host = createOverworldForecast({
      climateAt: continent,
      ground: mapGround(continent),
      minuteNow: () => minute,
      here: () => natives(0, 0),
      tvTrip: { natives: [] },
      tvTripLive: () => false,
      travel: () => null,
    });
    const made = {};
    for (const [x, z] of [
      [-409600, -245760],
      [300000, 200000],
    ]) {
      const n = natives(x, z);
      const refresh = () => {
        minute += 1;
        host.placeLine(n);
      };
      made[`${x}, ${z}`] = Math.round(await sampledBytes(refresh, 30, 100));
    }
    for (const [at, bytes] of Object.entries(made)) {
      assert.ok(bytes < 2 * 1024 * 1024, `a card at (${at}) allocates ${bytes} bytes a refresh (${JSON.stringify(made)})`);
    }
  } finally {
    setWeatherMapLaw(null);
  }
});
