// The lanes' feed to the naval host (scenes/naval/laneShips.js) beside a feed that keeps nothing (freshLanes.mjs):
// the same list every two seconds while the streaming world's floating origin moves under both - recentred, then
// laid afresh about another pixel - in the Bay and past it; with ARENA2, about the Imperial City and about Midbrugh
// on the world's own lanes. What the kept feed holds between lists is held too: a lane's legs in the scene while the
// scene's frame holds, laid again when it moves; a port's record for good.
import '../../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createLaneShips, sceneFrameOf, LANE_LIST_MS } from '../../../src/scenes/naval/laneShips.js';
import { StreamingWorldState } from '../../../src/world/streamingWorld.js';
import { freshFeed, someLanes, sameList, worldLanesOn } from './freshLanes.mjs';

const ARENA2 = process.env.ARENA2_PATH ?? '';
const HAVE = !!ARENA2 && existsSync(join(ARENA2, 'MAPS.BSA'));

/** The two feeds over `lanes` about `spot`, stepped side by side; what each handed the host, and what moved. */
function feedsAbout(lanes, spot, steps) {
  const state = new StreamingWorldState();
  state.init(spot.x, spot.y);
  let stamp = 10000, ms = 1.7e12, fresh = null, kept = null;
  const deps = { lanes, here: () => spot, clock: () => ms, ready: () => true, state, now: () => stamp };
  const freshStep = freshFeed({ ...deps, naval: () => ({ enabled: true, liners: (list) => (fresh = list) }) });
  const feed = createLaneShips({ ...deps, naval: () => ({ enabled: true, liners: (list) => (kept = list) }) });
  const runs = [];
  const half = Math.floor(steps / 2);
  // recentred as the eye goes - across and down, down alone, across alone, the eye carried by each recentre's offset
  // as the floating origin carries it - then laid afresh: about the same pixel, one a row off, one a column off
  const goes = [[900, -500], [0, -500], [900, 0]];
  const lays = [[0, 0], [0, -2], [3, -2]];
  let camera = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    stamp += LANE_LIST_MS;
    ms += 2000 + (i % 9 ? 0 : 7.3e6);
    const laid = sceneFrameOf(state);
    const lay = lays[i - half];
    if (lay) state.init(spot.x + lay[0], spot.y + lay[1]);
    else if (i % 4 === 3) {
      const [across, down] = goes[(i >> 2) % 3];
      const { offset } = state.update((camera = [camera[0] + across, 0, camera[2] + down]));
      if (offset) camera = camera.map((value, j) => value + offset[j]);
    }
    const moved = sceneFrameOf(state).flatMap((value, j) => (Object.is(value, laid[j]) ? [] : [j]));
    freshStep();
    feed.step();
    runs.push({ fresh, kept, held: !moved.length, moved });
  }
  return runs;
}
/** Each run's kept list held to the fresh one. While the frame holds, a lane's leg each way is the one the lists
 *  since it last moved handed over; where it moved, laid again. A port's record is the one every list hands over. */
function holdRuns(runs, what) {
  let held = 0, moved = 0;
  let legs = new Map();
  const ports = new Map();
  runs.forEach(({ fresh, kept, held: frameHeld }, i) => {
    assert.ok(kept.length > 0, `${what}: ships about`);
    sameList(kept, fresh, `${what}, list ${i}`);
    const before = legs;
    if (i && frameHeld) held++;
    if (i && !frameHeld) {
      moved++;
      legs = new Map();
    }
    for (const entry of kept) {
      const way = `${entry.id.slice(0, entry.id.indexOf('.'))} from ${entry.from.key}`;
      if (legs.has(way)) assert.equal(entry.leg, legs.get(way), `${what}, list ${i}: her leg kept while the frame holds`);
      else {
        if (before !== legs && before.has(way)) assert.notEqual(entry.leg, before.get(way), `${what}, list ${i}: her leg laid again`);
        legs.set(way, entry.leg);
      }
      for (const named of [entry.to, entry.from]) {
        if (ports.has(named.key)) assert.equal(named, ports.get(named.key), `${what}: a port's record kept`);
        else ports.set(named.key, named);
      }
    }
  });
  assert.ok(held >= 10 && moved >= 5, `${what}: ${held} lists in a held frame, ${moved} in a moved one`);
  const alone = new Set(runs.filter((run) => run.moved.length === 1).map((run) => run.moved[0]));
  assert.deepEqual([...alone].sort(), [0, 1, 2, 3], `${what}: the frame's column, row and either offset each moved alone`);
}

test('SEA-LANES KEPT the feed hands the naval host the list a feed keeping nothing does, every two seconds as the floating origin moves - in the Bay and past it; a lane\'s legs in the scene kept while the frame holds and laid again when it moves, a port\'s record kept', () => {
  const lanes = someLanes();
  const byLane = new Map(lanes.map(({ lane, way }) => [lane, way]));
  const book = {
    all: () => lanes.map(({ lane }) => lane),
    near: (lane, at) => [lane.a, lane.b].some((end) => Math.hypot(end.px - at.x, end.py - at.y) < 60),
    way: (lane) => byLane.get(lane) ?? null,
  };
  holdRuns(feedsAbout(book, { x: 205, y: 210 }, 60), 'in the Bay');
  holdRuns(feedsAbout(book, { x: 2069, y: 669 }, 60), 'past the Bay');
});

test('SEA-LANES KEPT the feed reads nothing more than it did: the host off or the map unread, no list; within two seconds of the last, none', () => {
  const lanes = someLanes();
  const byLane = new Map(lanes.map(({ lane, way }) => [lane, way]));
  const book = { all: () => lanes.map(({ lane }) => lane), near: () => true, way: (lane) => byLane.get(lane) };
  const state = new StreamingWorldState();
  state.init(205, 210);
  let stamp = 0, on = false, ready = false;
  const lists = [];
  const feed = createLaneShips({ lanes: book, here: () => ({ x: 205, y: 210 }), clock: () => 1.7e12, naval: () => ({ enabled: on, liners: (list) => lists.push(list) }), ready: () => ready, state, now: () => stamp });
  feed.step();
  on = true;
  feed.step();
  assert.equal(lists.length, 0, 'the map unread');
  ready = true;
  feed.step();
  stamp += LANE_LIST_MS - 1;
  feed.step();
  assert.equal(lists.length, 1, 'once within two seconds');
  stamp += 1;
  feed.step();
  assert.equal(lists.length, 2);
});

test('SEA-LANES KEPT with ARENA2: about the Imperial City and about Midbrugh the feed hands the list a feed keeping nothing does, on the world\'s own lanes', { skip: HAVE ? false : 'ARENA2_PATH not set' }, async () => {
  const { lanes } = await worldLanesOn(ARENA2);
  const imperial = lanes.all().flatMap((lane) => [lane.a, lane.b]).find((end) => end.name === 'Imperial City');
  assert.ok(imperial?.road && imperial.region > 61, 'the Imperial City, past the Bay');
  holdRuns(feedsAbout(lanes, { x: imperial.road.x, y: imperial.road.y }, 40), 'about the Imperial City');
  holdRuns(feedsAbout(lanes, { x: 200, y: 218 }, 40), 'about Midbrugh');
});
