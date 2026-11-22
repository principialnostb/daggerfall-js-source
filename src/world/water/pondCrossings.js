import { TILE } from '../road/roadPainter.js';
import { groundKindsOf } from '../terrain/groundEdge.js';
import { marchTile } from '../terrain/terrainTiles.js';
import { convertTile } from '../terrain/terrainSurface.js';
import { MAX_TERRAIN_HEIGHT, STREAMING_TERRAIN_SCALE } from '../terrain/terrainSampler.js';
import { SHORE_FAMILIES, WATER_DRAW_MASK_TABLE as masks } from './waterCorners.js';
import { pondMask, pondSites, POND_SIDE as side } from './pondSites.js';

const paved = record => record === TILE.road || record === TILE.roadDirt || record === TILE.roadGrass;
const shoreBytes = SHORE_FAMILIES.map(family => {
  const byMask = new Uint8Array(16);
  for (const record of family) for (let turn = 0; turn < 4; turn++) {
    const byte = record * 4 + turn;
    byMask[masks[byte]] = byte;
  }
  return byMask;
});

// A painted shore can carry grass and dirt on the same tile. DFU stamps its art
// whole. At a fitted pond, read the waterline from the three adjoining corners.
function mixedShore(bytes, i) {
  if (bytes[i] >> 2 !== 34) return 0;
  const x = i % side, z = Math.floor(i / side);
  if (!x || !z || x === side - 1 || z === side - 1) return 0;
  let mask = 0, grass = 0, dirt = 0;
  for (let k = 0; k < 4; k++) {
    const v = i + (k & 1) + (k >> 1) * side;
    let wet = 0, dry = 0;
    for (let n = 0; n < 4; n++) {
      if (n === k) continue;
      const b = bytes[v - (n & 1) - (n >> 1) * side];
      const water = pondMask(b);
      if (water & (1 << n)) {
        wet++;
        continue;
      }
      const g = groundKindsOf(b), rec = b >> 2;
      const kind = g ? (g.mask & (1 << n) ? g.b : g.a) : rec;
      if (kind === TILE.grass) grass++;
      if (kind === TILE.dirt) dirt++;
      if (kind === TILE.grass || kind === TILE.dirt) dry++;
    }
    if (wet >= 2) mask |= 1 << k;
    else if (dry < 2) return 0;
  }
  return mask && mask !== 15 ? shoreBytes[grass >= dirt ? 1 : 0][mask] : 0;
}

// Older blocks sometimes bake the street into the water. Read each corner from all
// available non-road neighbours. A conflict or an unknown corner leaves the tile alone.
function crossingMask(bytes, paths, x, z) {
  let mask = 0;
  for (let corner = 0; corner < 4; corner++) {
    const cx = x + (corner & 1), cz = z + (corner >> 1);
    let vote = -1;
    for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
      const nx = cx - dx, nz = cz - dz, i = nz * side + nx;
      if ((nx === x && nz === z) || paths?.[i] || paved(bytes[i] >> 2)) continue;
      const wet = (masks[bytes[i]] >> (2 * dz + dx)) & 1;
      if (vote >= 0 && vote !== wet) return 0;
      vote = wet;
    }
    if (vote < 0) return 0;
    mask |= vote << corner;
  }
  return mask;
}

function authoredTile(stamp, byte) {
  if (!stamp) return false;
  const authored = convertTile(stamp);
  return byte === authored || paved(authored >> 2);
}

function tileForMask(byte, fitted) {
  const record = byte >> 2;
  const family = SHORE_FAMILIES.findIndex(records => records.includes(record));
  const ground = family >= 0 ? family : record === 19 ? 1 : record === 29 ? 2 : 0;
  return fitted ? shoreBytes[ground][fitted] : (ground + 1) << 2;
}

// A river painter and an RMB block can end at the same vertex with different
// corner bits. Where the two water records disagree, taper both to a dry bank.
const cornerOffsets = [0, 1, side, side + 1];

function riverSeams(stamp, bytes) {
  const clear = new Map();
  for (let z = 1; z < side; z++) for (let x = 1; x < side; x++) {
    const v = z * side + x;
    if (stamp[v] && stamp[v - 1] && stamp[v - side] && stamp[v - side - 1]) continue;
    if (!(stamp[v] || stamp[v - 1] || stamp[v - side] || stamp[v - side - 1])) continue;
    let town = false, river = false, wet = 0;
    for (let k = 0; k < 4; k++) {
      const i = v - cornerOffsets[k], mask = pondMask(bytes[i]);
      if (!mask) continue;
      if (stamp[i]) town = true;
      else river = true;
      wet |= mask & (1 << k);
    }
    if (!town || !river || !wet || wet === 15) continue;
    for (let k = 0; k < 4; k++) {
      const bit = (1 << k) & wet, i = v - cornerOffsets[k];
      if (bit) clear.set(i, (clear.get(i) ?? 0) | bit);
    }
  }
  return clear;
}

// A tile on the river side may only contribute one corner to the new bank.
function approvedSeam(i, bits, accepted) {
  let clear = 0;
  for (let k = 0; k < 4; k++) {
    if (!(bits & (1 << k))) continue;
    const v = i + cornerOffsets[k];
    if (cornerOffsets.some(d => accepted.has(v - d))) clear |= 1 << k;
  }
  return clear;
}

// Some RMB blocks end a shore midway along an edge. Give its adjoining tiles one
// corner in common, keeping dry plots and independent puddle artwork intact.
function fittedShore(bytes, stamp, i) {
  const byte = bytes[i], mask = pondMask(byte);
  if (!mask || !authoredTile(stamp[i], byte)) return byte;
  const x = i % side, z = Math.floor(i / side);
  if (!x || !z || x === side - 1 || z === side - 1) return byte;
  let fitted = mask;
  for (let k = 0; k < 4; k++) {
    const v = i + (k & 1) + (k >> 1) * side;
    let votes = 0, allWater = true, authored = true;
    for (let n = 0; n < 4; n++) {
      const j = v - (n & 1) - (n >> 1) * side, m = pondMask(bytes[j]);
      if (!m) allWater = false;
      // A town outline can end inside an RMB pond. The adjoining generated
      // land or finished road supplies the dry corner along the retained bank.
      if (!authoredTile(stamp[j], bytes[j])) {
        const record = bytes[j] >> 2;
        const dryLand = (record >= TILE.dirt && record <= TILE.stone) || groundKindsOf(bytes[j])?.a === TILE.grass;
        if (!paved(record) && (stamp[j] || !dryLand)) authored = false;
      }
      votes += (m >> n) & 1;
    }
    if (authored) fitted = (fitted & ~(1 << k)) | (Number(allWater && votes >= 2) << k);
  }
  if (fitted === mask) return byte;
  return tileForMask(byte, fitted);
}

// The land side of an atlas shore has one material. Shores sharing a dry
// corner must agree on it, including where a dirt bank turns into a meadow.
function fitDryMargins(bytes, raw, accepted, paths) {
  const row = side + 1, shores = new Map(), vertices = new Set(), puddles = new Set();
  const vertex = (i, k) => (Math.floor(i / side) + (k >> 1)) * row + i % side + (k & 1);
  function neighbours(v, visit) {
    for (let k = 0; k < 4; k++) {
      const x = v % row - (k & 1), z = Math.floor(v / row) - (k >> 1);
      if (x >= 0 && z >= 0 && x < side && z < side) visit(z * side + x, k);
    }
  }
  for (const i of accepted) {
    const g = groundKindsOf(bytes[i]);
    for (let k = 0; k < 4; k++) {
      const v = vertex(i, k);
      if (g?.a === 0 && (g.mask & (1 << k))) {
        if (!shores.has(v)) shores.set(v, []);
        shores.get(v).push(i);
      }
      neighbours(v, j => {
        if (bytes[j] >> 2 === 23) puddles.add(j);
        for (let n = 0; n < 4; n++) vertices.add(vertex(j, n));
      });
    }
  }
  const puddleRim = new Set();
  for (const i of puddles) {
    for (let k = 0; k < 4; k++) puddleRim.add(vertex(i, k));
    const x = i % side, z = Math.floor(i / side);
    if (!x || !z || x === side - 1 || z === side - 1 || paths?.[i]) continue;
    // DFU TerrainHelper.SetLocationTiles stamps this grass puddle as painted.
    // Keep water only if a neighbouring water edge actually opens onto this tile.
    const connected = (masks[bytes[i - side]] & 12) || (masks[bytes[i + side]] & 3)
      || (masks[bytes[i - 1]] & 10) || (masks[bytes[i + 1]] & 5);
    if (!connected) {
      raw[i] = TILE.grass;
      bytes[i] = convertTile(TILE.grass);
    }
  }
  const fixed = new Map(), seen = new Set();
  for (const at of shores.keys()) {
    if (seen.has(at)) continue;
    const stack = [at], rim = [], tiles = new Set(), votes = [0, 0, 0, 0];
    seen.add(at);
    while (stack.length) {
      const v = stack.pop();
      rim.push(v);
      for (const i of shores.get(v)) {
        if (tiles.has(i)) continue;
        tiles.add(i);
        const g = groundKindsOf(bytes[i]);
        votes[g.b]++;
        for (let k = 0; k < 4; k++) {
          const next = vertex(i, k);
          if ((g.mask & (1 << k)) && !seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
    // A masonry bank keeps its authored material.
    if (votes[TILE.stone] && (votes[TILE.dirt] || votes[TILE.grass])) continue;
    const kind = votes[TILE.stone] ? TILE.stone : votes[TILE.dirt] > votes[TILE.grass] ? TILE.dirt : TILE.grass;
    for (const v of rim) fixed.set(v, kind);
    for (const i of tiles) {
      if (groundKindsOf(bytes[i]).b === kind) continue;
      const byte = shoreBytes[kind - 1][pondMask(bytes[i])];
      bytes[i] = byte;
      raw[i] = (byte >> 2) | ((byte & 3) << 6);
    }
  }
  // Vote from an immutable set of corners before writing any approaches.
  const updates = new Map();
  for (const v of vertices) {
    const cells = [], votes = [0, 0, 0, 0];
    neighbours(v, (i, k) => {
      const g = groundKindsOf(bytes[i]), rec = bytes[i] >> 2;
      if (paths?.[i] || (g ? g.a !== TILE.grass : rec < TILE.dirt || rec > TILE.stone)) return;
      const own = g ? (g.mask & (1 << k) ? g.b : g.a) : rec;
      cells.push([i, k, own]);
      votes[own]++;
    });
    if (!fixed.has(v) && !puddleRim.has(v) && !cells.some(([i]) => groundKindsOf(bytes[i]))) continue;
    const majority = votes.indexOf(Math.max(...votes));
    const kind = fixed.get(v) ?? (puddleRim.has(v) ? TILE.grass : majority);
    for (const [i, k, own] of cells) {
      if (kind === own) continue;
      if (!updates.has(i)) {
        const g = groundKindsOf(bytes[i]);
        updates.set(i, Array.from({length: 4}, (_, n) => g ? (g.mask & (1 << n) ? g.b : g.a) : bytes[i] >> 2));
      }
      updates.get(i)[k] = kind;
    }
  }
  for (const [i, corners] of updates) {
    if (corners.includes(TILE.dirt) && corners.includes(TILE.stone)) continue;
    raw[i] = marchTile(corners[0], corners[1], corners[2], corners[3]);
    bytes[i] = convertTile(raw[i]);
  }
}

// Resolve before the bed, billboards and navigation consume the shared tilemap.
// Only a level enclosed component can commit its candidate water tiles.
export function restorePondCrossings(stamp, raw, bytes, paths, yardPaths, samples) {
  if (!stamp) return;
  let candidate;
  const changes = [];
  for (let i = 0; i < stamp.length; i++) {
    if (!stamp[i] || (!paths?.[i] && !paved(bytes[i] >> 2))) continue;
    const authored = convertTile(stamp[i]);
    let next = authored;
    if (!masks[authored]) {
      if (!paved(authored >> 2)) continue;
      const x = i % side, z = Math.floor(i / side);
      if (!x || !z || x === side - 1 || z === side - 1) continue;
      const mask = crossingMask(bytes, paths, x, z);
      if (!mask) continue;
      next = mask === 15 ? 0 : shoreBytes[2][mask];
    }
    candidate ??= bytes.slice();
    candidate[i] = next;
    changes.push(i);
  }
  const streetFit = candidate ?? bytes;
  let mixed, mixedStamp;
  for (let i = 0; i < stamp.length; i++) {
    if (!stamp[i] || streetFit[i] >> 2 !== 34 || !authoredTile(stamp[i], streetFit[i])) continue;
    const shore = mixedShore(streetFit, i);
    if (!shore) continue;
    mixed ??= streetFit.slice();
    mixed[i] = shore;
    mixedStamp ??= stamp.slice();
    mixedStamp[i] = (shore >> 2) | ((shore & 3) << 6);
    changes.push(i);
  }
  candidate = mixed ?? candidate;
  const crossed = candidate ?? bytes;
  let fitted;
  for (let i = 0; i < stamp.length; i++) {
    if (!stamp[i]) continue;
    const byte = fittedShore(crossed, mixedStamp ?? stamp, i);
    if (byte === crossed[i]) continue;
    fitted ??= crossed.slice();
    fitted[i] = byte;
    changes.push(i);
  }
  candidate = fitted ?? candidate;
  if (!candidate && !stamp.some(byte => byte && pondMask(convertTile(byte)))) return;
  candidate ??= bytes;
  const seam = riverSeams(stamp, candidate);
  if (seam.size) {
    candidate = candidate.slice();
    for (const [i, clear] of seam) {
      candidate[i] = tileForMask(candidate[i], pondMask(candidate[i]) & ~clear);
      changes.push(i);
    }
  }
  const h = (x, z) => Math.fround(samples[x * (side + 1) + z] * MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE);
  // Use the ordinary closure test even for the hand-surveyed site.
  const accepted = new Set(pondSites(0, 0, candidate, null, null, side, null, h).flatMap(s => s.cells));
  for (const i of changes) {
    let byte = candidate[i];
    if (!accepted.has(i)) {
      // A dangling shore tip may become dry when its last wet corner closes.
      const dryTip = stamp[i] && !pondMask(byte) && pondMask(crossed[i])
        && [-side - 1, -side, -side + 1, -1, 1, side - 1, side, side + 1].some(d => accepted.has(i + d));
      if (!dryTip) {
        const clear = seam.has(i) ? approvedSeam(i, seam.get(i), accepted) : 0;
        const mask = pondMask(bytes[i]);
        if (!(mask & clear)) continue;
        byte = tileForMask(bytes[i], mask & ~clear);
      }
    }
    bytes[i] = byte;
    raw[i] = byte === 0 ? 255 : (byte >> 2) | ((byte & 3) << 6);
    if (paved(byte >> 2)) continue;
    if (paths) paths[i] = 0;
    if (yardPaths) yardPaths[i] = 0;
  }
  fitDryMargins(bytes, raw, accepted, paths);
}
