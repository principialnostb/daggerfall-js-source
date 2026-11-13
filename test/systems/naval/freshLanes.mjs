// The lanes' packets and the feed as they were drawn with nothing kept - every call drew a lane's packets, her way
// reversed and the classes afresh, and every list laid each lane's legs in the scene again - written out here so the
// kept ones can be held to them (lanes_kept.test.js, laneships_feed.test.js). And lanes to ask: in the Bay, past it
// and between the two, at many clocks.
import assert from 'node:assert/strict';
import {
  laneSeed,
  LANE_SALT,
  LANE_NAVY,
  LANE_LEVEL,
  LANE_CRUISE,
  LANE_DWELL_S,
  LANE_HEADWAY_S,
  LANE_PACKETS_MAX,
  LANE_LINEAGE,
} from '../../../src/systems/naval/seaLanes.js';
import { SHIP_CLASSES, HULL } from '../../../src/systems/naval/navalShips.js';
import { NATIVE_PIXEL } from '../../../src/systems/seaRaiders.js';
import { hash32 } from '../../../src/world/spawnedDungeons.js';
import { mulberry32 } from '../../../src/combat/blood/bloodArt.js';

const M_PER_NATIVE = 819.2 / NATIVE_PIXEL;

/** The class draw with nothing kept: the classes filtered on every call. */
export function freshClassFor(faction, level, r) {
  const pool = SHIP_CLASSES.filter((c) => c.faction === faction && c.minLevel <= Math.max(1, level | 0));
  const list = pool.length ? pool : SHIP_CLASSES.filter((c) => c.faction === faction).slice(0, 1);
  const total = list.reduce((sum, c) => sum + c.weight, 0);
  let x = Math.max(0, Math.min(0.999999, r)) * total;
  for (const c of list) if ((x -= c.weight) < 0) return c;
  return list[list.length - 1] ?? null;
}
function freshPacketOf(lane, k = 0, count = 1) {
  const seed = hash32(laneSeed(lane), k >>> 0, LANE_SALT);
  const r = mulberry32(seed);
  const faction = r() < LANE_NAVY ? 'navy' : 'merchant';
  let cls = freshClassFor(faction, LANE_LEVEL, r());
  if (cls?.hull === HULL.LargeGalley) cls = freshClassFor(faction, 1, r());
  return { seed, cls, speed: (cls?.speed ?? 4) * LANE_CRUISE, phase: (mulberry32(laneSeed(lane))() + k / Math.max(1, count)) % 1 };
}
function freshAlong(pts, s) {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z) * M_PER_NATIVE;
    if (left <= seg || i === pts.length - 1) {
      const k = seg > 0 ? Math.min(1, left / seg) : 1;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, dx: b.x - a.x, dz: b.z - a.z };
    }
    left -= seg;
  }
  const p = pts[pts.length - 1];
  return { x: p.x, z: p.z, dx: 0, dz: 0 };
}
/** A lane's `k`th packet of `count` at shared time `ms`, everything drawn on the call. */
export function freshPacketAt(lane, way, ms, k = 0, count = 1) {
  const p = freshPacketOf(lane, k, count);
  const leg = way.len / Math.max(0.1, p.speed);
  const period = 2 * (leg + LANE_DWELL_S);
  const t = ms / 1000 + p.phase * period;
  const voyage = Math.floor(t / period);
  const tau = t - voyage * period;
  const seeds = [];
  for (let j = 0; j < LANE_LINEAGE; j++) seeds.push(hash32(p.seed, (voyage - j) >>> 0, LANE_SALT));
  const base = { id: `L${lane.key}.${k}.${voyage}`, lane: lane.key, k, voyage, seed: seeds[0], seeds, cls: p.cls, region: lane.a.region ?? -1 };
  const rev = [...way.pts].reverse();
  const sailing = (pts, s, from, to) => {
    const here = freshAlong(pts, s);
    return { ...base, phase: 'sail', from, to, port: null, at: { x: here.x, z: here.z }, dir: { x: here.dx, z: here.dz }, leg: pts, until: null };
  };
  const end = (pts) => pts[pts.length - 1];
  const start = voyage * period - p.phase * period;
  if (tau < leg) return sailing(way.pts, tau * p.speed, lane.a, lane.b);
  if (tau < leg + LANE_DWELL_S) {
    const e = end(way.pts);
    return { ...base, phase: 'dwell', from: lane.a, to: lane.a, port: lane.b, at: { x: e.x, z: e.z }, dir: { x: 0, z: 0 }, leg: way.pts, until: start + leg + LANE_DWELL_S };
  }
  if (tau < 2 * leg + LANE_DWELL_S) return sailing(rev, (tau - leg - LANE_DWELL_S) * p.speed, lane.b, lane.a);
  const e = end(rev);
  return { ...base, phase: 'dwell', from: lane.b, to: lane.b, port: lane.a, at: { x: e.x, z: e.z }, dir: { x: 0, z: 0 }, leg: rev, until: start + period };
}
/** Every packet of a lane at shared time `ms`, everything drawn on the call. */
export function freshPacketsAt(lane, way, ms) {
  const first = freshPacketOf(lane);
  const leg = way.len / Math.max(0.1, first.speed);
  const count = Math.min(LANE_PACKETS_MAX, Math.max(1, Math.round((2 * (leg + LANE_DWELL_S)) / LANE_HEADWAY_S)));
  const out = [];
  for (let k = 0; k < count; k++) out.push(freshPacketAt(lane, way, ms, k, count));
  return out;
}
/** The world's feed with nothing kept: each list every two seconds, each lane's legs laid in the scene for it. */
export function freshFeed({ lanes, here, clock, naval, ready, state, now }) {
  let listedAt = -Infinity;
  return () => {
    const stamp = now();
    if (stamp - listedAt < 2000 || !naval()?.enabled || !ready()) return;
    listedAt = stamp;
    const at = here(), ms = clock();
    const list = [];
    const portOf = (p) => (p ? { key: `port:${p.id}`, name: p.name } : null);
    for (const lane of lanes.all()) {
      if (!lanes.near(lane, at)) continue;
      const way = lanes.way(lane);
      if (!way) continue;
      const out = way.pts.map((q) => state.localFromWorld(q.x, q.z)), home = [...out].reverse();
      for (const p of freshPacketsAt(lane, way, ms)) {
        const [x, z] = state.localFromWorld(p.at.x, p.at.z);
        const [dx, dz] = state.localFromWorld(p.at.x + p.dir.x, p.at.z + p.dir.z);
        list.push({ id: p.id, seed: p.seed, seeds: p.seeds, classId: p.cls.id, region: p.region, area: lane.a.area ?? -1, phase: p.phase, pos: [x, 0, z], yaw: Math.atan2(dx - x, dz - z),
          leg: p.leg === way.pts ? out : home, port: portOf(p.port), to: portOf(p.to), from: portOf(p.from) });
      }
    }
    naval().liners(list);
  };
}

/** A port: its id, its name, its region, its map pixel (past the Bay, a pixel outside the Bay's 1000 x 500). */
const port = (id, name, region, px, py) => ({ id, name, region, area: region * 10, px, py });
/** A lane between two ports along `pixels`: its way's native points and its length in metres, as laneWay gives them. */
export function laneOn(a, b, pixels) {
  const pts = pixels.map(([px, py]) => ({ x: (px + 0.5) * NATIVE_PIXEL, z: (499 - py + 0.5) * NATIVE_PIXEL }));
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) * M_PER_NATIVE;
  return { lane: { key: `${a.id}-${b.id}`, a, b }, way: { pts, len } };
}
/** Lanes in the Bay, past it and between the two, their ways wandering off a seeded draw. */
export function someLanes(seed = 7) {
  const draw = mulberry32(seed);
  const wander = (from, to, legs) => {
    const out = [[from.px, from.py]];
    for (let i = 1; i < legs; i++) {
      const along = i / legs;
      out.push([from.px + (to.px - from.px) * along + (draw() - 0.5) * 6, from.py + (to.py - from.py) * along + (draw() - 0.5) * 6]);
    }
    out.push([to.px, to.py]);
    return out;
  };
  const ports = [
    port(199200, 'Glenpoint', 1, 200, 199), port(199225, 'Wayrest', 17, 225, 199), port(218200, 'Midbrugh', 20, 200, 218),
    port(340392, 'Pallaton', 33, 392, 340), port(346474, 'Khajocconu', 44, 474, 346), port(250610, 'Sentinel', 35, 610, 250),
    port(900001, 'Vivec', 66, 2400, 640), port(900002, 'Ebonheart', 66, 2412, 630), port(900003, 'Imperial City', 70, 2069, 669),
    port(900004, 'Senchal', 64, 1900, 1120), port(900005, 'Torval', 64, 1870, 1060),
  ];
  const pairs = [[0, 1, 2], [0, 2, 9], [1, 2, 27], [3, 4, 14], [3, 5, 22], [4, 5, 5], [6, 7, 2], [6, 8, 26], [8, 9, 18], [9, 10, 11], [5, 8, 24], [2, 3, 1]];
  return pairs.map(([i, j, legs]) => laneOn(ports[i], ports[j], wander(ports[i], ports[j], legs)));
}
/** The shared clocks asked: a run of lists two seconds apart, then jumps across voyages and past every dwell. */
export function clocks(seed = 3) {
  const draw = mulberry32(seed);
  const out = [0, -12345678, 1.7e12];
  for (let i = 0; i < 30; i++) out.push(out[out.length - 1] + (i % 3 ? 2000 : 2000 + Math.floor(draw() * 9e6)));
  for (let i = 0; i < 10; i++) out.push(Math.floor(1.6e12 + draw() * 3e11));
  return out;
}
/** The same packets or entries, field for field and in the same order. */
export function sameList(got, want, what) {
  assert.deepStrictEqual(got, want, what);
  assert.deepEqual(got.map((p) => Object.keys(p).join()), want.map((p) => Object.keys(p).join()), `${what}: the order of the fields`);
}

/** The world's lanes on the freeware's map, the Bay's and past it, built as the game builds them (once a run). */
let world = null;
export const worldLanesOn = (arena2) =>
  (world ??= (async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const bytes = (n) => new Uint8Array(readFileSync(join(arena2, n)));
    const { DFPalette } = await import('../../../src/formats/dfPalette.js');
    const { preloadTamrielTrace } = await import('../../../src/ui/tamrielTrace.js');
    const { setTamrielTrace } = await import('../../../src/world/tamriel/tamrielLand.js');
    const { setTamrielFit, inBay } = await import('../../../src/world/tamriel/tamrielFrame.js');
    const { MapsFile, CLIMATES } = await import('../../../src/formats/mapsFile.js');
    const { WoodsFile } = await import('../../../src/formats/woodsFile.js');
    const { groundMaps, groundWoods } = await import('../../../src/world/tamriel/tamrielGround.js');
    const { isWaterPixel } = await import('../../../src/ui/overworldModel.js');
    const { WATER_BYTE } = await import('../../../src/world/roadsProducer.js');
    const { pastBayLakeAt, arenaPixels } = await import('../../../src/world/arenaPlaces.js');
    const { rumareSeaPixel } = await import('../../../src/world/rumareWaters.js');
    const { createWorldPlaces } = await import('../../../src/world/worldWide/worldPlaces.js');
    const { createWorldPorts } = await import('../../../src/world/worldWide/worldPorts.js');
    const { pastBayPlaceRows } = await import('../../../src/world/pastBayRows.js');
    const { buildMapDict } = await import('../../../src/systems/map/mapDirectory.js');
    const { PORT_LOCATION_IDS } = await import('../../../src/systems/travel/travelPorts.js');
    const { createWorldLanes, bayLaneWater } = await import('../../../src/scenes/naval/worldLanes.js');
    const { openSeaOf } = await import('../../../src/world/portSites.js');
    const { undilatedClimateIndex } = await import('../../../src/world/terrain/terrainHelper.js');
    const { pixelOfNative } = await import('../../../src/systems/seaRaiders.js');
    const { createKernelSea } = await import('../../../src/world/water/kernelSea.js');
    const palette = new DFPalette();
    palette.load(bytes('ART_PAL.COL'), 'ART_PAL.COL');
    setTamrielTrace(await preloadTamrielTrace({ fetchBytes: async (n) => bytes(n), palette, indexedDBRef: null }));
    setTamrielFit({ ox: 38 * 15.5, oy: 57 * 15.5, ppu: 15.5 });
    const maps = new MapsFile();
    maps.load(bytes('MAPS.BSA'), bytes('CLIMATE.PAK'), bytes('POLITIC.PAK'));
    const bayWoods = new WoodsFile();
    bayWoods.load(bytes('WOODS.WLD'));
    const woods = groundWoods(bayWoods);
    groundMaps(maps);
    const tvWater = (px, py) => woods.getHeightMapValue(px, py) <= WATER_BYTE;
    const ocean = (px, py) => (inBay(px, py) ? undilatedClimateIndex(maps, px, py) : maps.getClimateIndex(px, py)) === CLIMATES.Ocean;
    const laneOpen = bayLaneWater(tvWater, ocean);
    const laneOpenNative = (x, z) => {
      const q = pixelOfNative(x, z);
      return laneOpen(q.x, q.y);
    };
    const seaPixel = (x, y) => isWaterPixel(maps.getClimateIndex(x, y), woods.getHeightMapValue(x, y));
    let bayOpenSea = null;
    // BAY-OWN: openSeaOf answers the Bay's own grid, its rows the Bay's 1000 pixels wide
    const bayOpen = (x, y) => (bayOpenSea ??= openSeaOf(seaPixel, 1000, 500))[y * 1000 + x] === 1;
    const openSea = (x, y) => (inBay(x, y) ? bayOpen(x, y) : (seaPixel(x, y) && !pastBayLakeAt(x, y)) || rumareSeaPixel(x, y));
    const places = createWorldPlaces();
    const rows = pastBayPlaceRows({ pixels: arenaPixels(), templateOf: () => ({ exterior: { exteriorData: { width: 1, height: 1 } } }), capitals: true });
    places.register('tesa', rows);
    const ports = createWorldPorts({ places, openSea, regionAt: (x, y) => maps.getRegionIndexAt(x, y) });
    const kernel = createKernelSea(() => woods);
    const lanes = createWorldLanes({ mapDict: () => buildMapDict(maps), maps, portIds: PORT_LOCATION_IDS, ports, bayOpen: laneOpen, bayOpenNative: laneOpenNative, water: tvWater, beyond: () => true, kernel });
    return { lanes };
  })());
