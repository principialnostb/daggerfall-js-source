import { trs } from '../world/mat4.js';
import { tileDraw } from '../world/terrain/terrainNature.js';
import { villageShrubSite } from '../world/tamriel/helbernar.js';
import { shrubGeometry, shrubSurfaces } from './villageShrubs.js';

const archive = 'helbenar-shrubs';
const renderAssets = new WeakMap();

function sharedAssets(renderer) {
  let assets = renderAssets.get(renderer);
  if (assets) return assets;
  const colors = new Uint8Array(128 * 16 * 4);
  for (const [i, tile] of shrubSurfaces().entries()) {
    for (let y = 0; y < 16; y++) colors.set(tile.rgba.subarray(y * 64, (y + 1) * 64), (y * 128 + i * 16) * 4);
  }
  renderer.uploadTexture(archive, 0, { width: 128, height: 16, colors });
  assets = { refs: 0, meshes: new Map() };
  renderAssets.set(renderer, assets);
  return assets;
}

function fixtureMesh(renderer, assets, form, lod) {
  const key = form * 3 + lod;
  if (assets.meshes.has(key)) return assets.meshes.get(key);
  const corners = shrubGeometry(form, lod),
    count = corners.length / 9;
  const positions = new Float32Array(count * 3),
    normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2),
    indices = new Uint32Array(count);
  for (let i = 0; i < count; i++) {
    const p = i * 9;
    positions.set(corners.subarray(p + 3, p + 6), i * 3);
    normals.set(corners.subarray(p + 6, p + 9), i * 3);
    uvs[i * 2] = (corners[p + 2] - 23 + corners[p]) / 8;
    uvs[i * 2 + 1] = corners[p + 1];
    indices[i] = i;
  }
  const mesh = renderer.createMesh({
    positions,
    normals,
    uvs,
    indices,
    pixelKind: 'landscape',
    subMeshes: [{ textureArchive: archive, textureRecord: 0, startIndex: 0, primitiveCount: count / 3 }],
  });
  assets.meshes.set(key, mesh);
  return mesh;
}

// Small spatial batches keep the original distant picture in one draw. Only
// nearby groups acquire meshes; the same decoded form serves all placements.
export function standVillageShrubFlats(renderer, g, centers, texture, record, size, batches) {
  const cells = new Map();
  for (const center of centers) {
    const key = Math.floor(center[0] / 12) + ',' + Math.floor(center[2] / 12);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(center);
  }
  const scale = Math.min(1.9, Math.max(0.85, size.h));
  for (const cell of cells.values()) {
    const batch = renderer.createBillboardBatch(texture, record, size, cell);
    batches.push(batch);
    const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const plants = cell.map(([x, y, z]) => {
      const radius = Math.max(size.w / 2, scale);
      box[0] = Math.min(box[0], x - radius);
      box[1] = Math.min(box[1], y - 0.05);
      box[2] = Math.min(box[2], z - radius);
      box[3] = Math.max(box[3], x + radius);
      box[4] = Math.max(box[4], y + Math.max(size.h, scale * 1.5));
      box[5] = Math.max(box[5], z + radius);
      return {
        x,
        y,
        z,
        form: villageShrubSite(g, x, z),
        yaw: 360 * tileDraw(Math.floor(4 * x), Math.floor(4 * z), 67),
      };
    });
    const assets = sharedAssets(renderer);
    assets.refs++;
    batch._box = box;
    batch.villageShrubs = { assets, plants, scale };
    g.unionBox(box);
  }
}

export function releaseVillageShrubFlat(renderer, batch) {
  const held = batch.villageShrubs;
  if (!held) return;
  batch.villageShrubs = null;
  if (--held.assets.refs) return;
  for (const mesh of held.assets.meshes.values()) renderer.destroyMesh(mesh);
  renderAssets.delete(renderer);
}

export function drawVillageShrubFlat(renderer, batch, shadowOnly) {
  const { assets, plants, scale } = batch.villageShrubs;
  const [ox, oy, oz] = batch.origin ?? [0, 0, 0],
    eye = renderer._camPos,
    box = batch._box;
  const distance = Math.hypot(ox + (box[0] + box[3]) * 0.5 - eye[0], oz + (box[2] + box[5]) * 0.5 - eye[2]);
  if (distance > 60) return false;
  for (const plant of plants) {
    const x = ox + plant.x,
      y = oy + plant.y,
      z = oz + plant.z;
    const d = Math.hypot(x - eye[0], y - eye[1], z - eye[2]);
    const mesh = fixtureMesh(renderer, assets, plant.form, d < 9 ? 0 : d < 23 ? 1 : 2);
    const transform = trs(x, y, z, 0, plant.yaw, 0, scale, scale, scale);
    if (shadowOnly) renderer.recordShadowMesh(mesh, transform, null);
    else renderer.drawMesh(mesh, transform, null);
  }
  return true;
}
