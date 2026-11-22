import { CORNER_DRAWN, ISLAND_DRAWN, SHORE_FAMILIES, WATER_DRAW_MASK_TABLE as masks } from './waterCorners.js';

export const POND_SIDE = 128;
const basinWater = new Set([0, ...ISLAND_DRAWN, ...CORNER_DRAWN, ...SHORE_FAMILIES.flat()]);
// A painted puddle has its own alpha outline, independent of the pond beside it.
export const pondMask = byte => basinWater.has(byte >> 2) ? masks[byte] : 0;
export function containsPondTile(site, x, z) {
  return x >= site.west && x < site.east && z >= site.south && z < site.north
    && (!site.footprint || site.footprint.has(Math.floor(z) * site.side + Math.floor(x)));
}
const softWater = new Set([0, 4, 19, ...SHORE_FAMILIES[0], ...SHORE_FAMILIES[1]]);
const naturalGround = new Set([1, 2, 10, 11, 12, 51]);
const shoreEdges = [[-1, 0, 5, 10], [1, 0, 10, 5], [0, -1, 3, 12], [0, 1, 12, 3]];
const overlaps = (a, b) => a.west < b.east && b.west < a.east && a.south < b.north && b.south < a.north;

function levelOf(site, heightAt) {
  const level = heightAt(site.west, site.south);
  for (let z = site.south; z <= site.north; z++) for (let x = site.west; x <= site.east; x++) {
    if (!(Math.abs(heightAt(x, z) - level) <= .001)) return null;
  }
  return level;
}

// The four records meeting a corner must agree before a continuous floor can be cut there.
function closedSite(site, bytes, side, count) {
  for (let z = site.south; z < site.north; z++) for (let x = site.west; x < site.east; x++) {
    const i = z * side + x, record = bytes[i] >> 2, m = masks[bytes[i]];
    if (record >= 56 || (m && !basinWater.has(record))) return false;
    if (m) count--;
    if (x === site.west || x === site.east - 1 || z === site.south || z === site.north - 1) {
      if (m) return false;
    }
    if (x > site.west && ((masks[bytes[i - 1]] >> 1 ^ m) & 5)) return false;
    if (z > site.south && ((masks[bytes[i - side]] >> 2 ^ m) & 3)) return false;
  }
  return count === 0;
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
    const first = pondMask(bytes[start]);
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
      // Two banks can touch at dry corners while draining into separate basins.
      const mask = pondMask(bytes[i]);
      for (const [dx, dz, edge, opposite] of shoreEdges) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nx >= side || nz < 0 || nz >= side || !(mask & edge)) continue;
        const next = nz * side + nx;
        if (visited[next] || !(pondMask(bytes[next]) & opposite)) continue;
        visited[next] = 1;
        cells.push(next);
      }
    }
    const site = { west: minX - 1, south: minZ - 1, east: maxX + 2, north: maxZ + 2 };
    if (cells.length < 4 || site.west < 0 || site.south < 0 || site.east > side || site.north > side) continue;
    if (sites.some(other => other.pilot && overlaps(site, other))) continue;
    const area = (site.east - site.west) * (site.north - site.south);
    if (area <= 100 && !sites.some(other => overlaps(site, other)) && closedSite(site, bytes, side, cells.length)) {
      const level = levelOf(site, heightAt);
      if (level != null) {
        sites.push({ ...site, level, cells, pilot: false, occupied: occupiedBank(site, bytes, paths, side, buildingAt), side });
        continue;
      }
    }
    // A winding pond can surround streets, puddles or another basin. Only replace its own tiles.
    let wetLevel, lowest = Infinity, highest = -Infinity;
    const fits = cells.every(i => {
      const x = i % side, z = Math.floor(i / side), m = pondMask(bytes[i]);
      if (((pondMask(bytes[i - 1]) >> 1 ^ m) & 5) || ((m >> 1 ^ pondMask(bytes[i + 1])) & 5)
        || ((pondMask(bytes[i - side]) >> 2 ^ m) & 3) || ((m >> 2 ^ pondMask(bytes[i + side])) & 3)) return false;
      for (let k = 0; k < 4; k++) {
        const h = heightAt(x + (k & 1), z + (k >> 1));
        if (!Number.isFinite(h)) return false;
        lowest = Math.min(lowest, h);
        highest = Math.max(highest, h);
        if (m & (1 << k)) {
          wetLevel ??= h;
          if (Math.abs(h - wetLevel) > .001) return false;
        }
      }
      return true;
    });
    if (!fits) continue;
    const bounds = { west: minX, south: minZ, east: maxX + 1, north: maxZ + 1 };
    const sub = Math.max(1, Math.min(20, Math.floor(200 / Math.sqrt((bounds.east - minX) * (bounds.north - minZ)))));
    // The lowest bank bounds the sheet. Keep the existing terrain triangles on dry approaches.
    const gradeAt = highest - lowest > .001 ? (x, z) => {
      const ix = Math.min(bounds.east - 1, Math.floor(x)), iz = Math.min(bounds.north - 1, Math.floor(z));
      const u = x - ix, v = z - iz;
      return heightAt(ix, iz) * (1 - Math.max(u, v)) + heightAt(ix + 1, iz + 1) * Math.min(u, v)
        + (u > v ? heightAt(ix + 1, iz) * (u - v) : heightAt(ix, iz + 1) * (v - u));
    } : null;
    sites.push({ ...bounds, level: lowest, gradeAt, cells, footprint: new Set(cells), sub, pilot: false, side,
      occupied: occupiedBank(bounds, bytes, paths, side, buildingAt) });
  }
  return sites;
}
