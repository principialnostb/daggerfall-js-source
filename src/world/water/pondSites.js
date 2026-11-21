import { CORNER_DRAWN, ISLAND_DRAWN, SHORE_FAMILIES, WATER_DRAW_MASK_TABLE as masks } from './waterCorners.js';

export const POND_SIDE = 128;
const basinWater = new Set([0, ...ISLAND_DRAWN, ...CORNER_DRAWN, ...SHORE_FAMILIES.flat()]);
const softWater = new Set([0, 4, 19, ...SHORE_FAMILIES[0], ...SHORE_FAMILIES[1]]);
const naturalGround = new Set([1, 2, 10, 11, 12, 51]);
const overlaps = (a, b) => a.west < b.east && b.west < a.east && a.south < b.north && b.south < a.north;

function levelOf(site, heightAt) {
  const level = heightAt(site.west, site.south);
  for (let z = site.south; z <= site.north; z++) for (let x = site.west; x <= site.east; x++) {
    if (!(Math.abs(heightAt(x, z) - level) <= .001)) return null;
  }
  return level;
}

// The four records meeting a corner must agree before a continuous floor can be cut there.
function closedSite(site, bytes, side) {
  for (let z = site.south; z < site.north; z++) for (let x = site.west; x < site.east; x++) {
    const i = z * side + x, record = bytes[i] >> 2, m = masks[bytes[i]];
    if (record >= 56 || (m && !basinWater.has(record))) return false;
    if (x === site.west || x === site.east - 1 || z === site.south || z === site.north - 1) {
      if (m) return false;
    }
    if (x > site.west && ((masks[bytes[i - 1]] >> 1 ^ m) & 5)) return false;
    if (z > site.south && ((masks[bytes[i - side]] >> 2 ^ m) & 3)) return false;
  }
  return true;
}

function occupiedBank(site, bytes, paths, side, buildingAt) {
  const occupied = new Set();
  for (let z = site.south; z < site.north; z++) for (let x = site.west; x < site.east; x++) {
    const i = z * side + x, record = bytes[i] >> 2;
    if (paths?.[i] || buildingAt?.(x, z) || !(masks[bytes[i]] ? softWater : naturalGround).has(record)) occupied.add(i);
  }
  return occupied;
}

// A footprint in tile coordinates. Hard ground still belongs to the basin's dry margin.
export function clearPondBank(site, x, z, radius = 0) {
  if (!site.occupied?.size) return true;
  for (let j = Math.floor(z - radius); j <= Math.floor(z + radius); j++) {
    for (let i = Math.floor(x - radius); i <= Math.floor(x + radius); i++) {
      if (site.occupied.has(j * site.side + i)) return false;
    }
  }
  return true;
}

// DFU TerrainHelper.SetLocationTiles stamps the block's artwork. We inspect the final
// painted map, including tracks over dirt, before replacing a compact, enclosed basin.
export function pondSites(px, py, bytes, sheet, paths, side = POND_SIDE, buildingAt = null,
  heightAt = (x, z) => sheet[3 * (z * (side + 1) + x) + 1]) {
  const sites = [];
  if (side === POND_SIDE && px === 1551 && py === -372 && bytes[68 * side + 70] >> 2 === 0
    && bytes[66 * side + 67] === 89 && bytes[69 * side + 71] === 91) {
    const pilot = { west: 66, south: 65, east: 73, north: 71, pilot: true };
    const level = levelOf(pilot, heightAt);
    if (level != null) sites.push({ ...pilot, level, cells: [], side, occupied: occupiedBank(pilot, bytes, paths, side, buildingAt) });
  }
  let visited;
  for (let start = 0; start < bytes.length; start++) {
    const first = masks[bytes[start]];
    if (!first || first === 15 || visited?.[start]) continue;
    visited ??= new Uint8Array(bytes.length);
    const cells = [start];
    visited[start] = 1;
    let minX = side, minZ = side, maxX = 0, maxZ = 0;
    for (let read = 0; read < cells.length; read++) {
      const i = cells[read], x = i % side, z = Math.floor(i / side);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      for (let nz = Math.max(0, z - 1); nz <= Math.min(side - 1, z + 1); nz++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(side - 1, x + 1); nx++) {
          const next = nz * side + nx;
          if (visited[next] || !masks[bytes[next]]) continue;
          visited[next] = 1;
          cells.push(next);
        }
      }
    }
    const site = { west: minX - 1, south: minZ - 1, east: maxX + 2, north: maxZ + 2 };
    if (cells.length < 4 || site.west < 0 || site.south < 0 || site.east >= side || site.north >= side
      || (site.east - site.west) * (site.north - site.south) > 100 || sites.some(other => overlaps(site, other))) continue;
    if (!closedSite(site, bytes, side)) continue;
    const level = levelOf(site, heightAt);
    if (level == null) continue;
    sites.push({ ...site, level, cells, pilot: false, occupied: occupiedBank(site, bytes, paths, side, buildingAt), side });
  }
  return sites;
}
