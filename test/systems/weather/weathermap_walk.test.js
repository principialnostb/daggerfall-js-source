// The weather map's walk builds a system only where its outline reaches the place, and keeps each lattice node's births
// under one number for the node. Pinned here three ways: a walk answers what standing every living system whole and
// then testing its reach answers; every node anywhere in Tamriel, and far past it, is served its own births; and a walk
// allocates less than naming each node it asks with a string made. That a walk copies only what it answers is
// weathermap_copies.test.js's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from 'node:inspector/promises';
import {
  systemsNear,
  systemAt,
  birthsIn,
  cellsOf,
  searchReach,
  windPath,
  shapeBound,
  shapeMax,
  SYSTEM_TYPES,
  CELL_OF,
  PRIORITY,
} from '../../../src/systems/weather/weatherMap.js';
import { pixelOfField } from '../../../src/systems/weather/weatherField.js';
import { CLIMATES } from '../../../src/formats/mapsFile.js';
import { inBay } from '../../../src/world/tamriel/tamrielFrame.js';
import { tamrielClimateAt } from '../../../src/world/tamriel/tamrielGround.js';

/** The Bay's woodlands, and past the Bay the continent's own climates. */
const continent = (px, py) => (inBay(px, py) ? CLIMATES.Woodlands : tamrielClimateAt(px, py));
const pastBay = (x, z) => {
  const p = pixelOfField(x, z);
  return !inBay(p.x, p.y);
};
/** Field places: two in the Bay, the rest past it on every side. */
const PLACES = [
  [300000, 200000],
  [650000, 120000],
  [-409600, -245760],
  [-150000, 380000],
  [1100000, 640000],
  [900000, -700000],
  [2600000, -1900000],
  [-4100000, 3300000],
];
const MINUTES = [1000003, 2000000, 2000731, 2904512.5, 4400000];

/** Bytes a call of `fn` allocates in frames of the weather map's own source, by V8's sampling heap profiler over `n`
 *  calls: every sampled allocation, collected or not. The least of `rounds` rounds, each after a warm and a pause for
 *  the optimiser's background work, so a round read before the optimised code landed is not the one judged. Where
 *  V8 runs no Maglev (Node 22's default), only TurboFan's code reads under the bounds: a walk read unoptimised wants
 *  a longer warm, never a higher bound. */
async function sampledBytes(fn, n, rounds = 3) {
  let least = Infinity;
  for (let round = 0; round < rounds; round++) {
    for (let k = 0; k < (round ? 300 : 1500); k++) fn(); // the JIT warm: an unoptimised frame boxes the numbers it makes
    await new Promise((resolve) => setTimeout(resolve, 20));
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
    let bytes = 0;
    const visit = (node) => {
      if (node.callFrame.url.endsWith('systems/weather/weatherMap.js')) bytes += node.selfSize;
      for (const child of node.children ?? []) visit(child);
    };
    visit(profile.head);
    least = Math.min(least, bytes / n);
  }
  return least;
}

// first in the file: the walks of the pins below (other ranges, systems stood whole) leave the optimised walk heavier
test('A WALK ALLOCATES LESS THAN NAMING ITS NODES MADE: under 56 KB a walk past the Bay and 40 KB a walk in it, in the weather map\'s own frames (a string to name each node it asks made 88 KB and 66 KB there; standing every living system whole made several times that)', async (t) => {
  const places = [
    { x: -409600, z: -245760, under: 56 * 1024 },
    { x: 300000, z: 200000, under: 40 * 1024 },
  ];
  assert.ok(pastBay(places[0].x, places[0].z) && !pastBay(places[1].x, places[1].z), 'one place past the Bay, one in it');
  const made = {};
  for (const { x, z } of places) {
    made[`${x}, ${z}`] = Math.round(await sampledBytes(() => systemsNear(x, z, 2000000, continent, 0), 300));
  }
  t.diagnostic(`bytes a walk: ${JSON.stringify(made)}`);
  for (const { x, z, under } of places) {
    const bytes = made[`${x}, ${z}`];
    assert.ok(bytes < under, `a walk at (${x}, ${z}) allocates ${bytes} bytes in the weather map, over ${under}`);
  }
});

/** The walk as it stood every living system whole before it tested its reach: systemAt for each birth and cell, kept
 *  where its outline reaches the disc, and a front's cells asked where they could reach it. */
function walkWhole(x, z, minutes, climateAt, range, types) {
  const out = [];
  const take = (b) => {
    const s = systemAt(b, minutes);
    if (!s) return;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d - s.reach <= range) out.push({ ...s, d });
  };
  for (const type of types) {
    const spec = SYSTEM_TYPES[type];
    if (spec.parent) continue;
    const cellType = CELL_OF[type],
      cell = cellType && SYSTEM_TYPES[cellType];
    const reach = searchReach(type, range),
      [nodeM, nodeMinutes] = spec.node;
    for (let gt = Math.floor((minutes - spec.life[1]) / nodeMinutes); gt <= Math.floor(minutes / nodeMinutes); gt++) {
      for (let gx = Math.floor((x - reach) / nodeM); gx <= Math.floor((x + reach) / nodeM); gx++) {
        for (let gz = Math.floor((z - reach) / nodeM); gz <= Math.floor((z + reach) / nodeM); gz++) {
          for (const b of birthsIn(type, gx, gz, gt, climateAt)) {
            take(b);
            if (!cell || minutes < b.bornAt || minutes >= b.bornAt + b.life) continue;
            const [rideX, rideZ] = windPath(b.bornX, b.bornZ, b.bornAt, minutes);
            const frontX = b.bornX + rideX * spec.speed + (b.ox ?? 0),
              frontZ = b.bornZ + rideZ * spec.speed + (b.oz ?? 0);
            const cellsReach = b.core * shapeBound(b.shape) + 2 * cell.core[1] * shapeMax(cellType);
            if (Math.hypot(frontX - x, frontZ - z) - cellsReach > range) continue;
            for (const c of cellsOf(b, climateAt)) take(c);
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.d - b.d);
}

test('THE WALK ANSWERS WHAT STANDING EVERY LIVING SYSTEM WHOLE ANSWERS: the same systems in the same order, each with the same values and the same keys in the same order, at places in the Bay and past it on every side, at whole minutes and a fraction, for the player (range 0), the wind (15 km) and the sky (60 km), for every type and for the wet ones alone', () => {
  let answered = 0,
    cells = 0,
    shaped = 0,
    past = 0;
  for (const [x, z] of PLACES) {
    for (const minutes of MINUTES) {
      for (const range of [0, 15000, 60000]) {
        for (const types of [PRIORITY, ['rain', 'snow']]) {
          const got = systemsNear(x, z, minutes, continent, range, types);
          const want = walkWhole(x, z, minutes, continent, range, types);
          const at = `(${x}, ${z}) at ${minutes}, range ${range}, ${types.length} types`;
          assert.deepEqual(got, want, at);
          assert.deepEqual(
            got.map((s) => Object.keys(s).join()),
            want.map((s) => Object.keys(s).join()),
            `${at}: the keys in their order`,
          );
          answered += got.length;
          cells += got.filter((s) => s.front).length;
          shaped += got.filter((s) => s.shape).length;
          if (pastBay(x, z)) past += got.length;
        }
      }
    }
  }
  assert.ok(PLACES.filter(([x, z]) => pastBay(x, z)).length >= 6, 'most of the places past the Bay');
  assert.ok(answered > 400 && past > 200, `${answered} systems answered, ${past} of them past the Bay`);
  assert.ok(cells > 5 && shaped > 50, `${cells} storm cells and ${shaped} shaped systems among them`);
});

test('EVERY NODE OF THE LATTICE IS SERVED ITS OWN BIRTHS, anywhere in Tamriel and far past it: nodes a Bay-width apart, either side of the origin, at the edge of the numbered span and past it, at old and late periods - each asked twice is the one kept answer, never another node\'s, and every birth in it names its node', () => {
  const woods = () => CLIMATES.Woodlands;
  const across = [-1000000, -3000, -2048, -2047, -1000, -1, 0, 1, 5, 999, 1000, 1005, 2047, 2048, 3000, 1000000];
  const down = [-2048, -1, 0, 3, 2047, 2048];
  const periods = [-3, 0, 1388, 2 ** 23 - 1, 2 ** 23, 2 ** 23 + 7];
  const servedTo = new Map();
  let births = 0,
    farBirths = 0;
  for (const type of ['rain', 'cloudy', 'fog']) {
    for (const gx of across) {
      for (const gz of down) {
        for (const gt of periods) {
          const node = `${type}:${gx}:${gz}:${gt}`;
          const got = birthsIn(type, gx, gz, gt, woods);
          assert.equal(birthsIn(type, gx, gz, gt, woods), got, `${node} asked again: the kept answer`);
          assert.ok(!servedTo.has(got), `${node} was served ${servedTo.get(got)}'s births`);
          servedTo.set(got, node);
          for (const b of got) assert.match(b.id, new RegExp(`^${node}:\\d+$`), `${node}: a birth of its own`);
          births += got.length;
          if (Math.abs(gx) >= 2048 || Math.abs(gz) >= 2048 || Math.abs(gt) >= 2 ** 23) farBirths += got.length;
        }
      }
    }
  }
  assert.ok(births > 300 && farBirths > 100, `${births} births asked, ${farBirths} of them at the far nodes`);
});
