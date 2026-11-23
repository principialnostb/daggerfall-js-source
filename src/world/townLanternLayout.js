import { cornerShare, GROUND_KIND, groundKindsOf } from './terrain/groundEdge.js';
import { TERRAIN_TILE_DIM } from './terrain/terrainSurface.js';
import { ROAD_RECORDS } from './road/roadEdge.js';
import { FABRIC_FACE } from './urban/townFabricModel.js';
import { tileWeight } from './city/cityNavigation.js';
import { BLOCK_FLATS_OFFSET_Y, heldFootprints } from './rmbFlats.js';
import { GLOBAL_SCALE } from './meshReader.js';
import { usesClassicStreetLantern } from './streetLanternPlacement.js';

const TILE = 256 * GLOBAL_SCALE, SIDE = 16, CELL = TILE / 4;
const FLOOR = BLOCK_FLATS_OFFSET_Y * GLOBAL_SCALE;
const MAX_MOVE = 2 * TILE, ROAD_ESCAPE = 3 * TILE, POST_GAP = 7, SETBACK = .9;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const layouts = new WeakMap();
const keyOf = (record, x, y, z) => [record, x, y, z].map(v => Math.round(v * 1024)).join(':');

// Match the finished ground, including the dirt side of a dirt/grass transition.
export function townLanternRoadSurface(bytes, paths) {
  return (x, z) => {
    const u = x / TILE, v = z / TILE, col = Math.floor(u), row = Math.floor(v);
    if (col < 0 || row < 0 || col >= TERRAIN_TILE_DIM || row >= TERRAIN_TILE_DIM) return false;
    const at = row * TERRAIN_TILE_DIM + col, byte = bytes[at];
    if (paths?.[at] || ROAD_RECORDS.includes(byte >> 2) || byte >> 2 === GROUND_KIND.dirt) return true;
    const kinds = groundKindsOf(byte);
    return kinds?.a === GROUND_KIND.grass && kinds.b === GROUND_KIND.dirt
      && cornerShare(kinds.mask, u - col, v - row) >= .42;
  };
}

// DFU RMBLayout.AddLights preserves the authored flat coordinates. Town posts
// here use those as anchors for dry verges and omit elevated decorations.
export function layoutTownFlats(block, flats, solid = null, fabric = null, originX = 0, originZ = 0, submerged = null, renderedRoad = null) {
  const posts = flats.filter(f => f.archive === 210 && usesClassicStreetLantern(f.record));
  if (!posts.length) return flats;
  const { groundData, autoMapData } = block.rmbBlock.fldHeader;
  const occupied = heldFootprints(autoMapData, block.rmbBlock.subRecords);
  const tile = (x, z) => groundData.groundTiles?.[x]?.[SIDE - 1 - z]?.textureRecord;
  const dirtRoad = (x, z) => tile(x, z) === 1 && DIRECTIONS.some(([dx, dz]) =>
    (tile(x - dx, z - dz) === 1 && tile(x + dx, z + dz) === 1)
    || (tile(x + dx, z + dz) === 1 && tile(x + 2 * dx, z + 2 * dz) === 1));
  const road = (x, z) => {
    const col = Math.floor(x / TILE), row = Math.floor(z / TILE);
    if (fabric?.faces) {
      const gx = Math.floor((originX + x) / CELL), gz = Math.floor((originZ + z) / CELL);
      const { W, H } = fabric.plan;
      if (gx >= 0 && gz >= 0 && gx < W && gz < H && fabric.faces[gz * W + gx] === FABRIC_FACE.road) return true;
    }
    return renderedRoad?.(x, z) || ROAD_RECORDS.includes(tile(col, row)) || dirtRoad(col, row);
  };
  const dry = (x, z) => {
    const record = tile(Math.floor(x / TILE), Math.floor(z / TILE));
    return record != null && tileWeight(record, { enhancedWater: true }) !== 0 && !road(x, z);
  };
  const clear = (x, y, z, yaw) => {
    if (!dry(x, z) || submerged?.(x, y, z)) return false;
    if (DIRECTIONS.some(([dx, dz]) => road(x + dx * .45, z + dz * .45))) return false;
    const col = Math.floor(x / CELL), row = SIDE * 4 - 1 - Math.floor(z / CELL);
    if (occupied && occupied(row * SIDE * 4 + col)) return false;
    if (!solid) return true;
    const dx = yaw === 0 ? .75 : 0, dz = yaw === 0 ? 0 : .75;
    return !solid(x, y + .6, z, .55) && !solid(x, y + 1.7, z, .4)
      && !solid(x + dx, y + 2.9, z + dz, .5) && !solid(x - dx, y + 2.9, z - dz, .5);
  };
  const edges = [];
  const step = fabric?.faces || renderedRoad ? CELL : TILE;
  const cells = SIDE * TILE / step;
  for (let z = 0; z < cells; z++) for (let x = 0; x < cells; x++) {
    const mx = (x + .5) * step, mz = (z + .5) * step;
    if (!road(mx, mz)) continue;
    for (const [dx, dz] of DIRECTIONS) {
      if (road(mx + dx * step, mz + dz * step)) continue;
      const cx = mx + dx * (step / 2 + SETBACK), cz = mz + dz * (step / 2 + SETBACK);
      if (!dry(cx, cz)) continue;
      const bend = !road(mx - dz * step, mz - dx * step) || !road(mx + dz * step, mz + dx * step);
      edges.push({ cx, cz, dx, dz, bend });
    }
  }
  const fixed = [], plan = new Map(), flatPlacements = new Map();
  const spaced = (x, z) => fixed.every(([a, b]) => (x - a) ** 2 + (z - b) ** 2 >= POST_GAP ** 2);
  for (const post of posts) {
    const { record, x, y, z } = post;
    const key = keyOf(record, x, y, z);
    if (plan.has(key)) continue;
    let placed = null;
    if (y <= 1 && y >= -.6) {
      const candidates = [];
      const reach = road(x, z) ? ROAD_ESCAPE : MAX_MOVE;
      for (const { cx, cz, dx, dz, bend } of edges) {
        const along = dx ? z - cz : x - cx;
        const span = Math.min(2, step * .34);
        const slide = Math.max(-span, Math.min(span, along));
        for (const offset of new Set([slide, 0, -span, span])) {
          const nx = cx + dz * offset, nz = cz + dx * offset;
          const distance = (nx - x) ** 2 + (nz - z) ** 2;
          if (distance <= reach ** 2) candidates.push({ x: nx, z: nz, yaw: dx ? 0 : 90, score: distance + (bend ? 4 : 0) });
        }
      }
      candidates.sort((a, b) => a.score - b.score);
      const match = candidates.find(c => spaced(c.x, c.z) && clear(c.x, FLOOR, c.z, c.yaw));
      if (match) placed = { x: match.x, y: FLOOR, z: match.z, yaw: match.yaw };
      else if (spaced(x, z) && clear(x, y, z, 0)) placed = { x, y, z, yaw: 0 };
    }
    if (placed) fixed.push([placed.x, placed.z]);
    plan.set(key, placed);
    if (placed) flatPlacements.set(post, placed);
  }
  const result = flats.map(f => {
    if (f.archive !== 210 || !usesClassicStreetLantern(f.record)) return f;
    const placed = flatPlacements.get(f);
    return placed ? { ...f, ...placed } : { ...f, hiddenStreetLantern: true };
  });
  layouts.set(result, plan);
  return result;
}

export function layoutTownLights(flats, lights) {
  const plan = layouts.get(flats);
  if (!plan) return lights;
  const seen = new Set();
  return lights.flatMap(light => {
    if (!usesClassicStreetLantern(light.record)) return [light];
    const key = keyOf(light.record, light.x, light.foot + FLOOR, light.z);
    const placement = plan.get(key);
    if (!placement || seen.has(key)) return [];
    seen.add(key);
    const { x, y, z, yaw } = placement, foot = y - FLOOR;
    return [{ ...light, x, y: foot + light.h, z, yaw, foot }];
  });
}
