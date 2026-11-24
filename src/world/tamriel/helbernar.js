import { SHORE_FAMILIES, waterCorners, waterCoverage, WATER_DRAW_MASK_TABLE } from '../water/waterCorners.js';
import { groundEdgeAt, GROUND_KIND } from '../terrain/groundEdge.js';

// DFU StreamingWorld.UpdateTerrainNature selects a climate archive. This single
// Stonefalls settlement instead grows a meadow with mixed woodland margins.
export const isHelbernar = (x, y) => x === 3269 && y === 543;
// The class of an entire painted record misses small areas of green next to
// a path. Follow the same rotated material boundary as the terrain shader.
export const villageGrassBank = rec => SHORE_FAMILIES[1].includes(rec);

export function villageGrassAt(byte, tileX, tileZ, path, records, clearance = null) {
  if (clearance?.blocks(tileX*6.4,tileZ*6.4,.8)) return false;
  const rec = byte >> 2;
  if (rec === GROUND_KIND.grass) return !path;
  const edge = groundEdgeAt(byte, tileX, tileZ);
  if (!edge) return !path && !!records?.has(rec);
  if (villageGrassBank(rec)) {
    const wet = waterCoverage(waterCorners(byte, WATER_DRAW_MASK_TABLE), tileX % 1, tileZ % 1);
    if (wet > .25) return false;
  }
  const grass = edge.a === GROUND_KIND.grass ? 1-edge.share : edge.b === GROUND_KIND.grass ? edge.share : 0;
  return grass > (path ? .93 : .65);
}

// Only sample the surroundings of candidate shrubs while a streamed cell is built.
export function villageShrubForm(pieceAt,x,z) {
  const hit=pieceAt(x,z);
  if (!hit) return null;
  const lx=x-hit.t[0], lz=z-hit.t[2];
  return hit.p.plantClearance?.blocks(lx,lz,1.6) ? null : villageShrubSite(hit.p,lx,lz);
}

const streetSurface = new Set([GROUND_KIND.dirt, GROUND_KIND.stone, 46, 47, 55]);

export function villageShrubSite(p,x,z) {
  const tx=Math.floor(x/6.4), tz=Math.floor(z/6.4);
  let verge=false;
  for(const [dx,dz] of [[0,0],[-1,0],[1,0],[0,-1],[0,1]]) {
    const cx=tx+dx, cz=tz+dz;
    if(cx<0 || cz<0 || cx>=128 || cz>=128) continue;
    if(p.buildingAt?.(cx,cz)) return 2;
    const i=cz*128+cx, ground=p.tilemapBytes[i]>>2;
    if(p.paths?.[i] || streetSurface.has(ground)) verge=true;
  }
  return verge ? 1 : 0;
}

export function updateVillageMeadow(renderer,pieceAt,update,enabled,state,coverKeep) {
  const coverOrigin = enabled ? state.pixelTranslation(0,0) : null;
  renderer.coverOrigin=coverOrigin;
  renderer.coverKeep=coverKeep;
  renderer.shrubFormAt=enabled ? (wx,wz)=>villageShrubForm(pieceAt,wx,wz) : null;
  try { update(); return coverOrigin; }
  finally { renderer.shrubFormAt=null; renderer.coverOrigin=null; renderer.coverKeep=null; }
}

export function villageCrown(archive, record) {
  if ((archive === 510 && [11, 12, 25, 30].includes(record)) || (archive === 504 && record === 13)) return 1;
  if (archive === 504 && [12, 14, 16, 18].includes(record)) return 2;
  return 0;
}
export const helbernar = {
  blades: true,
  ground: {
    dirt: { ramp: ['#392e26', '#65503c', '#937455', '#bca083'] },
    grass: { ramp: ['#303721', '#515a32', '#78804a', '#a0a56b'] },
    stone: { ramp: ['#353530', '#57554a', '#858174', '#ada99a'] },
    surfaceDetail: true,
  },
  flora: {
    woods: 0.27, treeRate: 0.82, coverRate: 1.1,
    trees: [[510, 11, 2], [510, 25, 2], [504, 12, 3], [504, 16, 2]],
    cover: [[510, 17, 1], [510, 27, 1], [504, 1, 4], [504, 2, 3], [504, 21, 2]],
  },
  props: [],
};

// A periodic relief stamp baked once per ground set. Slender leaning blades,
// rounded grit and broad facets share the original record's colour and alpha.
export function reliefLayer(layer, record) {
  if (![1, 2, 3].includes(record) || !layer?.colors) return layer;
  const { width, height } = layer;
  const colors = new Uint8Array(layer.colors);
  const cells = record === 3 ? 14 : 32;
  for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
    let seed = Math.imul(1 + cx + cells * cy, 0x9e3779b1) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b) >>> 0;
    const x = (cx + (seed & 255) / 256) * width / cells;
    const y = (cy + ((seed >>> 8) & 255) / 256) * height / cells;
    const rx = Math.max(1, width / cells * (record === 2 ? 0.14 : 0.39));
    const ry = Math.max(1, height / cells * (record === 2 ? 0.65 : 0.29));
    const lean = ((seed >>> 16) / 65535 - 0.5) * 1.3;
    for (let j = Math.floor(y - ry); j <= y + ry; j++) {
      const v = (j - y) / ry, mid = x + (j - y) * lean;
      for (let i = Math.floor(mid - rx); i <= mid + rx; i++) {
        const u = (i - mid) / rx, depth = 1 - u * u - v * v;
        if (depth <= 0) continue;
        const k = 4 * (((j + height) % height) * width + (i + width) % width);
        const light = (record === 2 ? 8 : 12) * depth - 15 * (u + v) * Math.sqrt(depth);
        for (let c = 0; c < 3; c++) colors[k+c] = Math.max(0, Math.min(255, colors[k+c] + light));
      }
    }
  }
  return { ...layer, colors };
}

/** Place loose groups behind the grass edge of the village streets. Work in
 * pixel-local metres; reject roofs, pond cuts and occupied ground before planting. */
export function villageMargins(origin, blocks, bytes, tileSize, floorAt, blocked, taken, plant) {
  const occupied = new Map();
  const key = (cx, cz) => cx + 1024 * cz;
  function mark(x,z) {
    const k = key(Math.floor(x/tileSize), Math.floor(z/tileSize));
    if (!occupied.has(k)) occupied.set(k, []);
    occupied.get(k).push([x,z]);
  }
  for (const point of taken) mark(point[0],point[2]);
  function crowded(x,z) {
    const cx = Math.floor(x/tileSize), cz = Math.floor(z/tileSize);
    for (let j=-1;j<=1;j++) for (let i=-1;i<=1;i++) {
      if (occupied.get(key(cx+i,cz+j))?.some(p => (x-p[0])**2 + (z-p[1])**2 < 1.6**2)) return true;
    }
    return false;
  }
  for (const block of blocks) {
    const west = Math.round(origin[0] / tileSize) + block.x * 16;
    const south = Math.round(origin[2] / tileSize) + block.y * 16;
    for (let z = south; z < south + 16; z++) for (let x = west; x < west + 16; x++) {
      const i = z * 128 + x;
      if (bytes[i] >> 2 !== 2 || (x * 13 + z * 7) % 5 > 1) continue;
      const verge = [1, -1, 128, -128].some(offset => [1, 46, 47, 55].includes(bytes[i + offset] >> 2));
      if (!verge) continue;
      const pebble = (x + z) % 4 === 0;
      for (const [dx, dz, archive, record] of [[0.36, 0.39, 504, 1], [0.62, 0.54, pebble ? 510 : 504, pebble ? 17 : 21]]) {
        const mx = (x + dx) * tileSize, mz = (z + dz) * tileSize;
        const y = floorAt(mx, mz), foot = [mx, y + 0.1, mz];
        if (Math.abs(origin[1] - y) > 0.6 || crowded(mx,mz)) continue;
        if (blocked([mx, y + 16, mz], foot)) continue;
        plant(archive, record, mx, y, mz);
        mark(mx,mz);
      }
    }
  }
}

/** Keep the closest root to each tile centre. G/B locate it relative to that
 * centre in sixteenths of a metre; A distinguishes pine needles and leaf litter. */
export function treeFloorMap(bytes, flats, tileSize, treeAt, litterAt) {
  const packed = new Uint8Array(bytes.length * 4);
  const nearest = new Float32Array(bytes.length).fill(Infinity);
  for (let i = 0; i < bytes.length; i++) packed[4*i] = bytes[i];
  for (const flat of flats) {
    if (!treeAt(flat.archive, flat.record)) continue;
    const [x,,z] = flat.c;
    const tx = Math.floor(x/tileSize), tz = Math.floor(z/tileSize);
    for (let row = Math.max(0,tz-1); row <= Math.min(127,tz+1); row++)
      for (let col = Math.max(0,tx-1); col <= Math.min(127,tx+1); col++) {
        const dx = x-(col+.5)*tileSize, dz = z-(row+.5)*tileSize;
        const d = dx*dx+dz*dz, i = row*128+col;
        if (d >= nearest[i] || Math.abs(dx)>7.9 || Math.abs(dz)>7.9) continue;
        nearest[i] = d;
        packed[4*i+1] = 128 + Math.round(16*dx);
        packed[4*i+2] = 128 + Math.round(16*dz);
        const litter = litterAt?.(flat.archive, flat.record);
        packed[4*i+3] = litter || (villageCrown(flat.archive & ~1, flat.record) === 1 ? 2 : 1);
      }
  }
  return packed;
}
