import woodland from '../../assets/trees/helbenar/woodland.json' with { type: 'json' };
import assets from '../../assets/trees/helbenar/trees.json' with { type: 'json' };
import { townLanternRoadSurface } from '../townLanternLayout.js';
import { TILE_UNITS } from '../water/waterBed.js';
import { TERRAIN_TILE_DIM } from '../terrain/terrainSurface.js';
import { isTreeRecord, TREE_RECORDS } from '../terrain/terrainNature.js';
import { LPT_SCALE_MAX, lptVariety } from '../lowPolyTrees.js';

export const TREE_STUDY_URL = new URL('../../assets/trees/helbenar/study.idx', import.meta.url).href;
export const TREE_LIBRARY_URL = new URL('../../assets/trees/helbenar/trees.bin', import.meta.url).href;
export const VILLAGE_TREE_ATLAS = 'helbenar-woodland';

export const WOODLAND_MESH_URL = new URL('../../assets/trees/helbenar/woodland.mesh.gz', import.meta.url).href;
export const WOODLAND_INK_URL = new URL('../../assets/trees/helbenar/woodland.idx', import.meta.url).href;
const allMeshes = [...assets.meshes, ...woodland.meshes];

export function villageTreeLitter(archive, record) {
  const form = villageTreeForm(archive, record);
  if (form < 0) return 0;
  if (form === 0) return 3;
  if (form === 2) return 4;
  return form === 3 || allMeshes[form]?.needles ? 2 : 1;
}

export async function unpackWoodlandMesh(bytes) {
  // Some asset servers apply Content-Encoding to .gz files and fetch has already decoded them.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const TREE_SETBACK = 0.55;
export const MAX_TREE_CLEARANCE = TREE_SETBACK + LPT_SCALE_MAX * Math.max(...allMeshes.map((m) => m.radius));

export function villageTreeForm(archive, record) {
  const base = archive >= 505 && archive % 2 ? archive - 1 : archive;
  // Match each record to its own silhouette. Several winter images depict the bare summer tree.
  if (base === 504 && [12, 16, 17, 18].includes(record) || base === 506 && record === 16)
    return (record ^ (record >> 2)) & 1;
  if (base === 504 && [13, 25].includes(record) || [506, 510].includes(base) && [12, 13, 25, 30].includes(record))
    return 2 + ((record ^ (record >> 1)) & 1);
  const id = woodland.records[archive + ':' + record] ?? woodland.records[base + ':' + record];
  return id == null ? -1 : assets.meshes.length + id;
}

// An in-memory extension. The original records remain available to every other pixel.
export function addVillageTreeLibrary(json, original, extra, woodlandData = null) {
  const packs = [[json, original], [assets, extra]];
  if (woodlandData) packs.push([woodland, woodlandData]);
  const vertexBytes = packs.reduce((n, [index]) => n + index.vertexBytes, 0);
  const data = new Uint8Array(packs.reduce((n, [, bytes]) => n + bytes.length, 0));
  const meshes = [];
  let vertexOffset = 0, indexOffset = 0;
  for (const [index, bytes] of packs) {
    data.set(bytes.subarray(0, index.vertexBytes), vertexOffset);
    data.set(bytes.subarray(index.vertexBytes), vertexBytes + indexOffset);
    for (const m of index.meshes)
      meshes.push({ ...m, vertex: m.vertex + vertexOffset / 32, index: m.index + indexOffset / 2 });
    vertexOffset += index.vertexBytes;
    indexOffset += bytes.length - index.vertexBytes;
  }
  const prefabs = { ...json.prefabs },
    atlases = { ...json.atlases },
    materials = { ...json.materials };
  for (const suffix of ['', '-winter', '-study', '-study-winter', '-spruce', '-spruce-winter']) {
    const name = VILLAGE_TREE_ATLAS + suffix;
    atlases[name] = { alpha: name.includes('-study') };
    materials[name] = { tex: name, cull: 0 };
  }
  if (woodlandData) {
    for (const suffix of ['-canopy', '-canopy-winter']) {
      const name = VILLAGE_TREE_ATLAS + suffix;
      atlases[name] = { alpha: true };
      materials[name] = { tex: name, cull: 0 };
    }
  }
  for (let archive = 500; archive <= 511; archive++)
    for (let record = 0; record <= 30; record++) {
      const form = villageTreeForm(archive, record);
      if (form < 0 || (!woodlandData && form >= assets.meshes.length)) continue;
      const winter = archive >= 505 && archive % 2;
      const suffix = ['-study', '', '-study', '-spruce'][form] ?? '-canopy';
      prefabs[`${archive}_${record}_helbenar`] = {
        mesh: json.meshes.length + form,
        materials: [VILLAGE_TREE_ATLAS + suffix + (winter ? '-winter' : '')],
        spruceFoliage: form === 2 ? 1 : form === 3 ? 2 : 0,
        scale: [1, 1, 1],
      };
    }
  return { json: { ...json, vertexBytes, meshes, prefabs, atlases, materials }, data };
}

export function villageTreePicture(name, study, woodlandInk = null) {
  if (name.includes('-canopy')) {
    const width = 1024, height = 512;
    if (woodlandInk?.length !== width * height) throw new Error('Incomplete Helbenar woodland atlas');
    const data = new Uint8Array(width * height * 4);
    const palette = name.endsWith('-winter') ? woodland.winter : woodland.colors;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ink = woodlandInk[(height - 1 - y) * width + x];
        if (ink === 255) continue;
        const at = (y * width + x) * 4;
        data.set(palette[ink], at);
        data[at + 3] = 255;
      }
    }
    return { width, height, data, missing: 0 };
  }
  if (name.includes('-study')) {
    if (study?.length !== 256*512) throw new Error('Incomplete Helbenar study atlas');
    const data = new Uint8Array(study.length*4);
    const winter = name.endsWith('-winter');
    for (let y=0; y<512; y++) for (let x=0; x<256; x++) {
      const at = y*256+x;
      const ink = study[(511-y)*256+x];
      if (ink === 255) continue;
      const color = assets.studyColors[ink];
      const frost = winter && y<128 ? .35 : 0;
      for(let c=0;c<3;c++) data[4*at+c] = color[c]*(1-frost)+[204,218,216][c]*frost;
      data[4*at+3]=255;
    }
    return {width:256,height:512,data,missing:0};
  }
  if (name.includes('-spruce')) {
    if (study?.length !== 256 * 512) throw new Error('Incomplete Helbenar study atlas');
    const width = 256, height = 32, data = new Uint8Array(width * height * 4);
    const winter = name.endsWith('-winter');
    // The narrow spruce uses opaque cards with one 16px strip per shade.
    // Reuse the larger spruce's painted needles and bark plates at that scale.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const slot = x >> 4, col = x % 16, bark = slot < 2;
      const start = bark ? 7 : 21;
      const sx = (col * 4 + slot * 31 + (bark ? 0 : y)) % 128;
      const sy = bark ? 55 + (31 - y) * 5 : 384 + ((31 - y) * 3 + slot * 17) % 128;
      const ink = study[sy * 256 + 128 + sx];
      const shade = ink === 255 ? 1 : ink - start;
      const tone = Math.max(0, Math.min(6, shade + (bark ? slot : Math.min(slot, 8) - 7)));
      const color = assets.studyColors[start + tone];
      const frost = winter && !bark ? 0.24 + .04 * tone : 0;
      const i = (y * width + x) * 4;
      data[i] = color[0] * (1 - frost) + 204 * frost;
      data[i + 1] = color[1] * (1 - frost) + 218 * frost;
      data[i + 2] = color[2] * (1 - frost) + 216 * frost;
      data[i + 3] = 255;
    }
    return { width, height, data, missing: 0 };
  }
  const rgb = globalThis.atob(assets.palette);
  const data = new Uint8Array(256 * 32 * 4);
  const winter = name.endsWith('-winter');
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4,
        j = ((31 - y) * 256 + x) * 3;
      const frost = winter && x >= 32 ? 0.24 + 0.25 * ((x % 16) / 16) : 0;
      for (let c = 0; c < 3; c++) data[i + c] = rgb.charCodeAt(j + c) * (1 - frost) + [204, 218, 216][c] * frost;
      data[i + 3] = 255;
    }
  return { width: 256, height: 32, data, missing: 0 };
}

function canopyOverlapsTile(x, z, radius, buildingAt, paths, bytes) {
  const last = TERRAIN_TILE_DIM - 1;
  const x0 = Math.max(0, Math.floor((x - radius) / TILE_UNITS)),
    x1 = Math.min(last, Math.floor((x + radius) / TILE_UNITS));
  const z0 = Math.max(0, Math.floor((z - radius) / TILE_UNITS)),
    z1 = Math.min(last, Math.floor((z + radius) / TILE_UNITS));
  for (let row = z0; row <= z1; row++)
    for (let col = x0; col <= x1; col++) {
      const index = row * TERRAIN_TILE_DIM + col;
      const dx = Math.max(0, col * TILE_UNITS - x, x - (col + 1) * TILE_UNITS);
      const dz = Math.max(0, row * TILE_UNITS - z, z - (row + 1) * TILE_UNITS);
      if (dx * dx + dz * dz <= radius * radius && (paths?.[index] || bytes[index] >> 2 === 0 || buildingAt?.(col, row)))
        return true;
    }
  return false;
}

// Prefer the authored layout. Only the town's blocked decorative trees may move to a nearby dry verge.
// Logged wilderness trees keep stable identities and roots. Re-skins, near meshes and far pictures use this log.
export function selectVillageTrees(log, clearance, roofs, buildingAt, paths, bytes, groundAt, town) {
  const stands = new Map(),
    rejected = new Set();
  const roadAt = townLanternRoadSurface(bytes, paths);
  const bound = TERRAIN_TILE_DIM * TILE_UNITS;
  function reserve(flat, form, x, z, height) {
    if (x < 0 || z < 0 || x >= bound || z >= bound || roadAt(x, z)) return false;
    if (groundAt && !Number.isFinite(height)) return false;
    const radius = allMeshes[form].radius * lptVariety(town?.px ?? 0, town?.py ?? 0, x, z, flat.wild == null).scale;
    const room = radius + TREE_SETBACK;
    if (
      clearance.blocks(x, z, room) ||
      roofs.blocks(x, z, room) ||
      canopyOverlapsTile(x, z, room, buildingAt, paths, bytes)
    )
      return false;
    const cx = Math.floor(x / 16),
      cz = Math.floor(z / 16);
    const cells = Math.ceil(.8 * (radius + MAX_TREE_CLEARANCE - TREE_SETBACK) / 16);
    for (let j = -cells; j <= cells; j++)
      for (let i = -cells; i <= cells; i++) {
        const nearby = stands.get((cz + j) * 128 + cx + i);
        if (nearby?.some((t) => Math.hypot(x - t.x, z - t.z) < 0.8 * (radius + t.radius))) return false;
      }
    const key = cz * 128 + cx;
    if (!stands.has(key)) stands.set(key, []);
    stands.get(key).push({ x, z, radius });
    return true;
  }
  for (const flat of log) {
    const form = villageTreeForm(flat.archive, flat.record);
    const base = flat.archive >= 505 && flat.archive % 2 ? flat.archive-1 : flat.archive;
    if (!isTreeRecord(base, flat.record)) continue;
    const height = groundAt?.(flat.c[0], flat.c[2]);
    if (!reserve(flat, Math.max(form, 0), flat.c[0], flat.c[2], height)) rejected.add(flat);
    else if (form >= 0 && groundAt) flat.c[1] = height - .12;
    if (flat.tree && !rejected.has(flat)) flat.tree.y = flat.c[1];
  }
  if (groundAt)
    for (const flat of rejected) {
      if (flat.block == null || flat.wild != null) continue;
      const [x, , z] = flat.c;
      const start = lptVariety(town?.px ?? 0, town?.py ?? 0, x, z, true).yaw,
        form = villageTreeForm(flat.archive, flat.record);
      let moved = false;
      for (const distance of [4, 8, 12]) {
        for (let i = 0; i < 8; i++) {
          const angle = start + (i * Math.PI) / 4 + distance * 0.07;
          const nx = x + distance * Math.cos(angle),
            nz = z + distance * Math.sin(angle);
          if (nx < 0 || nz < 0 || nx >= bound || nz >= bound) continue;
          const height = groundAt(nx, nz);
          if (!Number.isFinite(height) || !reserve(flat, Math.max(form, 0), nx, nz, height)) continue;
          flat.c[0] = nx;
          flat.c[1] = height - (form >= 0 ? .12 : 0);
          flat.c[2] = nz;
          rejected.delete(flat);
          moved = true;
          break;
        }
        if (moved) break;
      }
    }
  let kept = 0;
  for (const flat of log) if (!rejected.has(flat)) log[kept++] = flat;
  log.length = kept;
  if (!town || !groundAt) return;
  // Two specimen trees per 16-tile town block at most. Choose the open grass within the
  // block, leaving small yards and paved courtyards free when even the narrow crown cannot fit.
  const townRoots = log.filter((f) => villageTreeForm(f.archive, f.record) >= 0).map((f) => f.c);
  for (const block of town.blocks) {
    const x0 = town.origin[0] + 16 * TILE_UNITS * block.x,
      z0 = town.origin[2] + 16 * TILE_UNITS * block.y;
    const side = 16 * TILE_UNITS;
    let count = townRoots.filter(([x, , z]) => x >= x0 && x < x0 + side && z >= z0 && z < z0 + side).length;
    for (let i = 0; count < 2 && i < 80; i++) {
      const col = (i * 7 + block.y * 5) % 16,
        row = (i * 9 + Math.floor(i / 16) * 3 + block.x * 3) % 16;
      const x = x0 + (col + 0.42) * TILE_UNITS,
        z = z0 + (row + 0.57) * TILE_UNITS;
      const at = Math.floor(z / TILE_UNITS) * TERRAIN_TILE_DIM + Math.floor(x / TILE_UNITS);
      if (bytes[at] >> 2 !== 2 || townRoots.some((c) => Math.hypot(c[0] - x, c[2] - z) < 17)) continue;
      const y = groundAt(x, z);
      if (!Number.isFinite(y) || town.blocked([x, y + 18, z], [x, y + 0.16, z])) continue;
      const species = col + row + count + block.x;
      const base = town.natureArchive ?? 504;
      const records = TREE_RECORDS[base];
      if (!records?.length) continue;
      const record = records[species % records.length];
      const flat = { archive: town.archiveOf(base), record, c: [x, y-.12, z], planted: base };
      if (!reserve(flat, villageTreeForm(base, record), x, z, y)) continue;
      townRoots.push(flat.c);
      log.push(flat);
      count++;
    }
  }
}
