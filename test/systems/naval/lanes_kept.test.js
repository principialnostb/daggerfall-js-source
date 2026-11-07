// The lanes' packets with what they keep between calls - a lane's draws, her way reversed, each leg's length, the
// class pools - held to the packets as a fresh draw makes them on every call (freshLanes.mjs). Lanes in the Bay and
// past it, at many clocks: out, at the far port, home, at home, a voyage turning, and a lane asked for one packet
// between its lists; with ARENA2, every lane of the world's book.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { packetsAt, packetAt, LANE_LEVEL, LANE_CRUISE, LANE_DWELL_S } from '../../../src/systems/naval/seaLanes.js';
import { SHIP_CLASSES, classFor } from '../../../src/systems/naval/navalShips.js';
import { freshClassFor, freshPacketAt, freshPacketsAt, someLanes, clocks, sameList, worldLanesOn } from './freshLanes.mjs';

const ARENA2 = process.env.ARENA2_PATH ?? '';
const HAVE = !!ARENA2 && existsSync(join(ARENA2, 'MAPS.BSA'));

test('SEA-LANES KEPT the packets of every lane are the ones a fresh draw makes, at every clock - in the Bay and past it, out, at the far port, home and at home, a voyage turned, and a lane asked for one packet between its lists', () => {
  const lanes = someLanes();
  assert.ok(lanes.some(({ lane }) => lane.a.px > 999 && lane.b.px > 999), 'a lane past the Bay');
  const phases = new Set();
  for (const ms of clocks()) {
    for (const { lane, way } of lanes) {
      const want = freshPacketsAt(lane, way, ms);
      sameList(packetsAt(lane, way, ms), want, `${lane.key} at ${ms}`);
      for (const p of want) phases.add(`${p.phase} ${p.from === lane.a ? 'out' : 'home'}`);
      // one packet asked alone, one past the lane's count and one of another count, between its lists
      sameList([packetAt(lane, way, ms)], [freshPacketAt(lane, way, ms)], `${lane.key} alone at ${ms}`);
      sameList([packetAt(lane, way, ms, 999, 3)], [freshPacketAt(lane, way, ms, 999, 3)], `${lane.key} past its count`);
      sameList([packetAt(lane, way, ms, 2, 5)], [freshPacketAt(lane, way, ms, 2, 5)], `${lane.key} of another count`);
    }
  }
  assert.deepEqual([...phases].sort(), ['dwell home', 'dwell out', 'sail home', 'sail out'], 'every leg of the cycle was asked');
});

test('SEA-LANES KEPT a class is the one a fresh draw gives, for every faction, level and draw', () => {
  const levels = [-5, 0, 1, 2, 3, 5, 9, 10, 11, 20, 40, 60, 99, 998, 999, 1000, 5000, 2.7, NaN, Infinity, 1e12];
  const draws = [0, 1e-9, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999999, 1, 1.5, -1, NaN];
  for (const faction of ['navy', 'merchant', 'pirate', 'nobody', undefined])
    for (const level of levels) for (const r of draws) assert.equal(classFor(faction, level, r), freshClassFor(faction, level, r), `${faction} ${level} ${r}`);
});

test('SEA-LANES KEPT a packet is drawn once a voyage: her seeds the same list from call to call and her way home the same points, both drawn again when her voyage turns; a class drawn with the classes unfiltered', () => {
  const { lane, way } = someLanes()[7];
  const ms = 1.7e12;
  const one = packetsAt(lane, way, ms), two = packetsAt(lane, way, ms + 2000);
  const same = two.filter((p, k) => p.voyage === one[k].voyage);
  assert.ok(same.length > one.length / 2, 'most voyages hold over two seconds');
  for (const p of same) assert.equal(p.seeds, one[p.k].seeds, `${p.id}: her seeds kept`);
  const homeward = same.filter((p) => p.leg !== way.pts);
  assert.ok(homeward.length > 0, 'one homeward');
  for (const p of homeward) assert.equal(p.leg, one[p.k].leg, `${p.id}: her way home kept`);
  assert.equal(new Set(homeward.map((p) => p.leg)).size, 1, 'every packet home sails the one way reversed');
  // her voyage turned: another ship, her seeds drawn again
  const period = 2 * (way.len / (one[0].cls.speed * LANE_CRUISE) + LANE_DWELL_S);
  const next = packetsAt(lane, way, ms + period * 1000);
  assert.notEqual(next[0].voyage, one[0].voyage);
  assert.notEqual(next[0].seeds, one[0].seeds);
  sameList(next, freshPacketsAt(lane, way, ms + period * 1000), 'the next voyage');
  // the classes are filtered once a faction and level, never again for a draw
  classFor('navy', LANE_LEVEL, 0.5);
  const filter = Array.prototype.filter;
  let filtered = 0;
  Array.prototype.filter = function counted(...args) {
    if (this === SHIP_CLASSES) filtered++;
    return filter.apply(this, args);
  };
  try {
    for (let i = 0; i < 100; i++) classFor('navy', LANE_LEVEL, i / 100);
  } finally {
    Array.prototype.filter = filter;
  }
  assert.equal(filtered, 0, 'a hundred draws, the classes unfiltered');
});

/** What `run` gives, and how many lengths it measured (Math.hypot) and hashes it drew (Math.imul) on the way. */
function counted(run) {
  const hypot = Math.hypot, imul = Math.imul;
  let measured = 0, drawn = 0;
  Math.hypot = (...args) => (measured++, hypot(...args));
  Math.imul = (a, b) => (drawn++, imul(a, b));
  try {
    const value = run();
    return { value, measured, drawn };
  } finally {
    Math.hypot = hypot;
    Math.imul = imul;
  }
}

test('SEA-LANES KEPT a lane asked again draws no packet and measures no leg - her first packet, each packet and each leg\'s length kept - in the Bay and past it; two seconds on, as the next list asks, still no leg measured', () => {
  const lanes = someLanes();
  for (const { lane, way } of [lanes[2], lanes[7]]) {
    const ms = 1.7e12;
    const first = counted(() => packetsAt(lane, way, ms));
    assert.ok(first.value.some((p) => p.phase === 'sail'), `${lane.key}: one under way`);
    assert.ok(first.measured > 0 && first.drawn > 0, `${lane.key}: the first list measures her legs and draws her packets`);
    const again = counted(() => packetsAt(lane, way, ms));
    assert.equal(again.measured, 0, `${lane.key}: no leg measured again`);
    assert.equal(again.drawn, 0, `${lane.key}: no packet drawn again`);
    sameList(again.value, freshPacketsAt(lane, way, ms), `${lane.key}: the same packets`);
    const later = counted(() => packetsAt(lane, way, ms + 2000));
    assert.ok(later.value.some((p) => p.phase === 'sail'), `${lane.key}: one under way two seconds on`);
    assert.equal(later.measured, 0, `${lane.key}: two seconds on, no leg measured`);
    sameList(later.value, freshPacketsAt(lane, way, ms + 2000), `${lane.key}: two seconds on`);
  }
});

test('SEA-LANES KEPT with ARENA2: every lane of the world\'s book, the Bay\'s and past it, sails as a fresh draw has her', { skip: HAVE ? false : 'ARENA2_PATH not set' }, async () => {
  const { lanes } = await worldLanesOn(ARENA2);
  const sailed = lanes.all().filter((lane) => lanes.way(lane));
  const past = sailed.filter((lane) => lane.a.region > 61 || lane.b.region > 61);
  assert.ok(sailed.length > 300 && past.length > 20, `${sailed.length} lanes sailed, ${past.length} past the Bay`);
  let packets = 0;
  for (const ms of [1.7e12, 1.7e12 + 2000, 1.7e12 + 3.6e6 + 2000, 1.75e12]) {
    for (const lane of sailed) {
      const way = lanes.way(lane);
      const want = freshPacketsAt(lane, way, ms);
      sameList(packetsAt(lane, way, ms), want, `${lane.key} at ${ms}`);
      packets += want.length;
    }
  }
  assert.ok(packets > 20000, `${packets} packets`);
});
