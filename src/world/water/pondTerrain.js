import { POND_DEPTH_OFFSET, WATER_DRAW_MASK_TABLE, waterCoverage } from './waterCorners.js';
import { puddleWetAt, PUDDLE_RECORDS } from '../puddleMask.js';
import { convertTile } from '../terrain/terrainSurface.js';
import { bankFinishWeights } from '../terrain/earthBank.js';
import { pondShoreMesh } from './pondShore.js';
import { roadEdgeNoise } from '../road/roadEdge.js';
import { TILE_UNITS } from './waterBed.js';
import { WATER_LIFT } from '../../render/waterSurface.js';
import { MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../terrain/terrainSampler.js';

import { clearPondBank, containsPondTile, pondMask, pondSites, POND_SIDE as SIDE } from './pondSites.js';

const GRID = SIDE + 1;
const SUB = 20;
const WATERLINE = 0.44;
const BASIN_DEPTH = 1.55;


// DFU RMBLayout.AddNatureFlats draws every authored placement. The woodland-hills
// ground sprout and its winter picture are dry-land scenery. Keep their original placements.
export function visiblePondScenery(archive, record, centers, bed, bytes) {
  if ((archive !== 506 && archive !== 507) || record !== 26) return centers;
  return centers.filter(([x, , z]) => {
    const floor = bed?.pondFloor?.(x, z);
    if (floor != null) return floor >= (bed.pondWaterAt?.(x, z) ?? bed.pondWaterY);
    const u = x / TILE_UNITS, v = z / TILE_UNITS, ix = Math.floor(u), iz = Math.floor(v);
    if (ix < 0 || iz < 0 || ix >= SIDE || iz >= SIDE) return true;
    const tile = bytes[iz * SIDE + ix];
    // Painted puddles have an alpha cutout within the tile and can carry dry ground.
    return PUDDLE_RECORDS.includes(tile >> 2) || waterCoverage(WATER_DRAW_MASK_TABLE[tile], u - ix, v - iz) < .5;
  });
}

// Classify a painted puddle with the same turned alpha mask used to draw it.
export function pondPuddleContact(sample, locate, position, puddles, borderGround) {
  if (!sample || !PUDDLE_RECORDS.includes(sample.tile & 63)) return null;
  const at = locate(position[0], position[2]);
  if (!at?.entry._bed?.pondFloor) return null;
  const pixel = at.entry, byte = convertTile(sample.tile);
  const archive = pixel.ecoGround ? borderGround(pixel, at.lx, at.lz) : pixel.groundArchive;
  const layer = puddles.get(archive)?.[byte >> 2];
  return layer ? puddleWetAt(layer, byte, sample.feet[0], sample.feet[1]) : null;
}

// Shared by placement and render groups, including a far tile promoted later.
export function pondColumnReader(g) {
  let sites;
  return (x, z) => {
    const tx0 = Math.floor(x / TILE_UNITS), tz0 = Math.floor(z / TILE_UNITS);
    if (tx0 < 0 || tz0 < 0 || tx0 >= SIDE || tz0 >= SIDE || !WATER_DRAW_MASK_TABLE[g.tilemapBytes[tz0 * SIDE + tx0]]) return null;
    const floor = g.bed?.pondFloor?.(x, z);
    if (floor != null) {
      return { floor, grade: g.bed.pondGradeAt?.(x, z) ?? g.bed.pondWaterAt(x, z) + WATERLINE, water: g.bed.pondWaterAt(x, z), pilot: !!g.bed.pondPilotAt?.(x, z) };
    }
    if (g.bed?.pondFloor || !g.samples || g.clipped) return null;
    // A flat batch survives ring promotion. Resolve its basin even if the far
    // grid was built first, using the original near-ring elevation samples.
    const heightAt = (tx, tz) => Math.fround(g.samples[tx * GRID + tz] * MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
    sites ??= pondSites(g.px, g.py, g.tilemapBytes, null, null, SIDE, null, heightAt);
    const u = x / TILE_UNITS, v = z / TILE_UNITS, tx = Math.floor(u), tz = Math.floor(v);
    const site = sites.find(s => containsPondTile(s, tx, tz));
    if (!site) return null;
    const sub = site.sub ?? SUB;
    const ix = Math.floor(u * sub), iz = Math.floor(v * sub), fx = u * sub - ix, fz = v * sub - iz;
    const d = (i, j) => fittedDepth(site, g.tilemapBytes, (ix + i) / sub, (iz + j) / sub, g.houseBank);
    const depth = d(0, 0) * (1 - Math.max(fx, fz)) + d(1, 1) * Math.min(fx, fz)
      + (fx > fz ? d(1, 0) * (fx - fz) : d(0, 1) * (fz - fx));
    return { floor: site.level - depth, grade: site.gradeAt?.(u, v) ?? site.level, water: site.level - WATERLINE, pilot: site.pilot };
  };
}

export function pondSubmergedAt(g, read = pondColumnReader(g)) {
  return (x, y, z, keepPilotDeck = false) => {
    const p = read(x, z);
    return !!p && !(keepPilotDeck && p.pilot) && p.floor < p.water && y <= p.water + .9;
  };
}

// These authored town flats are a fountain, hanging sign and direction post. Drop
// submerged ground placements before either their picture or their solid is built.
export function pondClutterGroups(g) {
  const submerged = pondSubmergedAt(g);
  let groups = g.groups;
  for (const key of ['212_3', '212_4', '212_6', '212_14', '212_15', '212_16', '510_8', '511_8']) {
    const centers = g.groups.get(key);
    if (!centers) continue;
    const deck = key === '212_14' || key === '212_15' || key === '212_16';
    const shown = centers.filter(([x, y, z]) => !submerged(x, y, z, deck));
    if (shown.length === centers.length) continue;
    if (groups === g.groups) groups = new Map(groups);
    if (shown.length) groups.set(key, shown);
    else groups.delete(key);
  }
  return groups;
}

// The record between the pools has opposite wet corners. Cut a winding thalweg
// between them, tapering back into the surveyed corner depths at each end.
function channelDepth(u, v) {
  const along = (u + v) * 0.5;
  if (along <= 0 || along >= 1) return 0;
  const taper = Math.sin(Math.PI * along);
  const across = (u - v) / Math.SQRT2 - 0.10 * taper;
  const radius = (across < 0 ? 0.40 : 0.47) * Math.sqrt(taper);
  const section = Math.max(0, 1 - (across / radius) ** 2);
  return 1.12 * section ** 2 * Math.min(1, taper * 3);
}

// Sample the two rendered triangles, including their diagonal, in pixel-local metres.
function floorSampler(heights, { west: WEST, south: SOUTH, width: WIDTH, height: HEIGHT, sub = SUB }) {
  return (x, z) => {
    const gx = (x / TILE_UNITS - WEST) * sub, gz = (z / TILE_UNITS - SOUTH) * sub;
    if (gx < 0 || gz < 0 || gx >= WIDTH - 1 || gz >= HEIGHT - 1) return null;
    const ix = Math.floor(gx), iz = Math.floor(gz), i = iz * WIDTH + ix;
    const u = gx - ix, v = gz - iz;
    return heights[i] * (1 - Math.max(u, v)) + heights[i + WIDTH + 1] * Math.min(u, v)
      + (u > v ? heights[i + 1] * (u - v) : heights[i + WIDTH] * (v - u));
  };
}

function patchIndices(indices, sites, count) {
  const replaced = new Uint8Array(SIDE * SIDE);
  let length = indices.length;
  for (const { west, east, south, north, width, height, footprint, sub } of sites) {
    if (footprint) {
      for (const i of footprint) replaced[i] = 1;
      length += 6 * footprint.size * (sub * sub - 1);
      continue;
    }
    for (let z = south; z < north; z++) replaced.fill(1, z * SIDE + west, z * SIDE + east);
    length += 6 * ((width - 1) * (height - 1) - (east - west) * (north - south));
  }
  const out = new Uint32Array(length);
  let k = 0, start = 0;
  for (let i = 0; i <= replaced.length; i++) {
    if (i < replaced.length && !replaced[i]) continue;
    if (i > start) {
      out.set(indices.subarray(start * 6, i * 6), k);
      k += (i - start) * 6;
    }
    start = i + 1;
  }
  const baseIndexCount = k;
  let base = count;
  for (const { width, height, footprint, west, south, sub } of sites) {
    for (let z = 0; z < height - 1; z++) for (let x = 0; x < width - 1; x++) {
      if (footprint && !footprint.has((south + Math.floor(z / sub)) * SIDE + west + Math.floor(x / sub))) continue;
      const a = base + z * width + x;
      out[k++] = a;
      out[k++] = a + width;
      out[k++] = a + width + 1;
      out[k++] = a;
      out[k++] = a + width + 1;
      out[k++] = a + 1;
    }
    base += width * height;
  }
  return { indices: out, baseIndexCount };
}

// The streamed world translates both heights together when its origin moves.
export function pondColumnAt(locate, feet) {
  const at = locate(feet[0], feet[2]);
  const bed = at?.entry._bed;
  const floor = bed?.pondFloor?.(at.lx, at.lz);
  if (floor == null) return null;
  return { floorY: floor + at.baseY, waterY: (bed.pondWaterAt?.(at.lx, at.lz) ?? bed.pondWaterY) + at.baseY, feetY: feet[1] };
}

// DFU PlayerMotor.UpdateSpeed slows swimmers. Here a standing body can also ford a cut bed.
export function bindPondMovement(collider, player, locate) {
  collider.waterWalkFloor = feet => {
    if (feet !== player.pos || !player.waterWalking) return undefined;
    const p = pondColumnAt(locate, feet);
    return p && p.floorY < p.waterY ? p.waterY : undefined;
  };
  collider.wadingDepth = feet => {
    const p = pondColumnAt(locate, feet);
    return p ? Math.max(0, p.waterY - Math.max(p.floorY, p.feetY)) : 0;
  };
}

function basinDepthAt(site, bytes, x, z) {
  const tx = Math.min(site.east - 1, Math.floor(x)), tz = Math.min(site.north - 1, Math.floor(z));
  const mask = pondMask(bytes[tz * SIDE + tx]);
  const coverage = waterCoverage(mask, x - tx, z - tz);
  // The dry approach stays at street grade. Small lateral bites of erosion widen the cut
  // within the transition. Its single descending face joins the bowl at a flat tangent.
  const erosion = coverage > 0 && coverage < 1 ? .035 * roadEdgeNoise(x * TILE_UNITS, z * TILE_UNITS, 32, 911) : 0;
  const t = Math.max(0, Math.min(1, (coverage + erosion - .27) / .68));
  const basin = BASIN_DEPTH * t * t * (3 - 2 * t);
  const saddle = mask === 9 || mask === 6;
  if (!saddle || (site.pilot && (tx !== 68 || tz !== 67 || bytes[tz * SIDE + tx] !== 196))) return basin;
  return Math.max(basin, channelDepth(mask === 9 ? x - tx : 1 - (x - tx), z - tz));
}

function fittedDepth(site, bytes, x, z, houseBank) {
  const raw = basinDepthAt(site, bytes, x, z);
  const grade = site.gradeAt?.(x, z) ?? site.level;
  const above = grade - site.level;
  const cut = raw + above * (raw / BASIN_DEPTH);
  return (houseBank?.depth(x * TILE_UNITS, z * TILE_UNITS, grade, cut) ?? cut) - above;
}

// Fade back to the neighbouring tile's own material at every exposed footprint edge.
function footprintFade(site, x, z) {
  const tx = Math.floor(x), tz = Math.floor(z);
  let distance = 1;
  for (let j = tz - 1; j <= tz + 1; j++) for (let i = tx - 1; i <= tx + 1; i++) {
    if (site.footprint.has(j * SIDE + i)) continue;
    const dx = Math.max(i - x, x - i - 1, 0), dz = Math.max(j - z, z - j - 1, 0);
    distance = Math.min(distance, TILE_UNITS * Math.hypot(dx, dz));
  }
  return distance * distance * (3 - 2 * distance);
}

function buildBasin(site, bytes, bed, pos, norm, bankDepth, bankFinish, offset, gridVertices, houseBank) {
  const { west: WEST, south: SOUTH, east: EAST, north: NORTH, width: WIDTH, height: HEIGHT, level, sub = SUB } = site;
  const heights = new Float32Array(WIDTH * HEIGHT);
  const depths = bankDepth.subarray(offset, offset + heights.length);
  for (let iz = 0; iz < HEIGHT; iz++) for (let ix = 0; ix < WIDTH; ix++) {
    depths[iz * WIDTH + ix] = fittedDepth(site, bytes, WEST + ix / sub, SOUTH + iz / sub, houseBank);
  }
  const finishStart = offset - gridVertices;
  bankFinishWeights(depths, WIDTH, HEIGHT, TILE_UNITS / sub, WATERLINE, bankFinish.subarray(finishStart, finishStart + heights.length));
  for (let iz = 0; iz < HEIGHT; iz++) for (let ix = 0; ix < WIDTH; ix++) {
    const x = WEST + ix / sub, z = SOUTH + iz / sub;
    const k = iz * WIDTH + ix, i = (offset + k) * 3;
    pos[i] = x * TILE_UNITS;
    pos[i + 1] = level - depths[k];
    pos[i + 2] = z * TILE_UNITS;
    heights[k] = pos[i + 1];
    const tile = bytes[Math.min(NORTH - 1, Math.floor(z)) * SIDE + Math.min(EAST - 1, Math.floor(x))];
    if (!WATER_DRAW_MASK_TABLE[tile] && tile >> 2 !== 2 && !clearPondBank(site, x, z, .05)) bankFinish[offset - gridVertices + k] = 0;
    if (site.footprint && depths[k] < WATERLINE) {
      bankFinish[offset - gridVertices + k] *= footprintFade(site, x, z);
    }
    const dx = depths[k + (ix < WIDTH - 1 ? 1 : 0)] - depths[k - (ix > 0 ? 1 : 0)];
    const dz = depths[k + (iz < HEIGHT - 1 ? WIDTH : 0)] - depths[k - (iz > 0 ? WIDTH : 0)];
    const dy = 2 * TILE_UNITS / sub, len = Math.hypot(dx, dy, dz);
    norm[i] = dx / len;
    norm[i + 1] = dy / len;
    norm[i + 2] = dz / len;
  }
  for (let z = SOUTH; z <= NORTH; z++) for (let x = WEST; x <= EAST; x++) {
    if (!site.footprint && !site.pilot && (x === WEST || x === EAST || z === SOUTH || z === NORTH)) continue;
    let inside = false, shared = false;
    for (let k = 0; k < 4; k++) {
      const tx = x - (k & 1), tz = z - (k >> 1);
      if (tx < 0 || tz < 0 || tx >= SIDE || tz >= SIDE) continue;
      const b = bytes[tz * SIDE + tx];
      if (containsPondTile(site, tx, tz)) inside = true;
      else if (WATER_DRAW_MASK_TABLE[b]) shared = true;
      if (PUDDLE_RECORDS.includes(b >> 2)) shared = true;
    }
    if (!inside || shared) continue;
    const i = z * GRID + x;
    const depth = depths[(z - SOUTH) * sub * WIDTH + (x - WEST) * sub];
    bed.depths[i] = Math.max(0, depth + ((site.gradeAt?.(x, z) ?? level) - level));
    bed.sheet[i * 3 + 1] = level - WATERLINE - WATER_LIFT;
    bed.sheetDepths[i] = -POND_DEPTH_OFFSET - Math.max(0.015, depth - WATERLINE);
  }
  const sample = floorSampler(heights, site);
  if (!site.footprint) return sample;
  return (x, z) => containsPondTile(site, x / TILE_UNITS, z / TILE_UNITS) ? sample(x, z) : null;
}

// A river, puddle or second basin can share this vertex at a different elevation.
// Leave the original sheet intact there and give each basin its own copy.
function splitPondSheet(indices, bed, basins, bytes) {
  const corner = new Map(), heights = [], depths = [];
  let out;
  for (let q = 0; q < indices.length; q += 6) {
    const start = indices[q], x = start % GRID, z = Math.floor(start / GRID);
    if (!pondMask(bytes[z * SIDE + x])) continue;
    const site = basins.find(b => containsPondTile(b, x, z));
    if (!site) continue;
    for (let t = q; t < q + 6; t++) {
      const v = indices[t];
      if (bed.sheetDepths[v] < -POND_DEPTH_OFFSET) continue;
      let vertices = corner.get(site);
      if (!vertices) corner.set(site, vertices = new Map());
      let extra = vertices.get(v);
      if (extra === undefined) {
        extra = bed.sheetDepths.length + depths.length;
        vertices.set(v, extra);
        heights.push(bed.sheet[3 * v], site.waterY - WATER_LIFT, bed.sheet[3 * v + 2]);
        depths.push(-POND_DEPTH_OFFSET - .015);
      }
      out ??= indices.slice();
      out[t] = extra;
    }
  }
  if (!out) return null;
  const positions = new Float32Array(bed.sheet.length + heights.length);
  positions.set(bed.sheet);
  positions.set(heights, bed.sheet.length);
  const depth = new Float32Array(bed.sheetDepths.length + depths.length);
  depth.set(bed.sheetDepths);
  depth.set(depths, bed.sheetDepths.length);
  return { indices: out, positions, depths: depth };
}

export function pondTerrain(renderer, px, py, bytes, bed, positions, normals, indices, paths = null, allowPonds = true, buildingAt = null, houseBank = null) {
  const gridVertices = GRID * GRID;
  const land = positions.length === gridVertices * 3 ? { width: SIDE, height: SIDE, tileDim: SIDE, bytes, paths, originX: px * SIDE, originZ: -py * SIDE } : null;
  const sites = land && bed?.depths && allowPonds ? pondSites(px, py, bytes, bed.sheet, paths, SIDE, buildingAt) : [];
  if (!sites.length) return renderer.createTerrainSurface(positions, normals, indices, null, null, land);
  let vertices = gridVertices;
  const patches = sites.map(site => {
    const sub = site.sub ?? SUB;
    const width = (site.east - site.west) * sub + 1, height = (site.north - site.south) * sub + 1;
    const offset = vertices;
    vertices += width * height;
    return { ...site, width, height, offset };
  });
  const pos = new Float32Array(vertices * 3), norm = new Float32Array(pos.length);
  const bankDepth = new Float32Array(vertices), finish = new Float32Array(vertices - gridVertices);
  pos.set(positions);
  norm.set(normals);
  bed.originalSheet = bed.sheet;
  bed.sheet = bed.sheet.slice();
  bed.sheetDepths = bed.sheetDepths.slice();
  bed.depths = bed.depths.slice();
  const basins = patches.map(site => ({
    ...site, waterY: site.level - WATERLINE,
    floor: buildBasin(site, bytes, bed, pos, norm, bankDepth, finish, site.offset, gridVertices, houseBank),
  }));
  bed.splitSheet = indices => splitPondSheet(indices, bed, basins, bytes);
  const at = (x, z) => basins.find(b => containsPondTile(b, x / TILE_UNITS, z / TILE_UNITS));
  bed.pondFloor = (x, z) => at(x, z)?.floor(x, z) ?? null;
  bed.pondGradeAt = (x, z) => at(x, z)?.gradeAt?.(x / TILE_UNITS, z / TILE_UNITS);
  bed.pondPilotAt = (x, z) => !!at(x, z)?.pilot;
  bed.pondWaterAt = (x, z) => at(x, z)?.waterY;
  if (basins.length === 1) bed.pondWaterY = basins[0].waterY;
  const patched = patchIndices(indices, patches, gridVertices);
  land.baseIndexCount = patched.baseIndexCount;
  return renderer.createTerrainSurface(pos, norm, patched.indices, bankDepth, pondShoreMesh(basins, bytes, px, py), land, finish);
}
