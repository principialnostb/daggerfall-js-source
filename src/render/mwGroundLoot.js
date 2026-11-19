import { multiply, transformPoint, trs } from '../world/mat4.js';
import { MW_UNITS_PER_METER, pickTorchRecord } from '../formats/morrowind/mwFirstPerson.js';
import { pixelWorldDraw } from './worldPixelLayer.js';
import { groundLootRecord, usesLootPouch } from './mwGroundLootRecords.js';
import { clothingKind } from '../systems/item/clothingKinds.js';
import { templateByIndex } from '../systems/item/itemTemplates.js';
import { TEMPLATES } from '../systems/item/itemKinds.js';

export const THIRD_PERSON_HORIZONTAL_SCALE = 1.22;
export const THIRD_PERSON_HEIGHT_SCALE = 0.96;

export async function loadGroundLootModel(item, cat, renderer, {
  iconRecordOf, loadFromArchives, flattenNif, parseNif, preloadArmTextures, texturesUnread,
  stamp, NIF_TO_PASS, packFpArm, hangRangeTextures, collectArmTextures, releaseGpu,
}, decorModel = null) {
  if (!cat || !renderer || usesLootPouch(item)) return null;
  const torch = item.templateIndex === TEMPLATES.Torch
    ? pickTorchRecord(cat.allLights, { has: (path) => cat.archives.some((archive) => archive.has(path)) })
    : null;
  const rec = decorModel ? { model: decorModel } : torch ?? iconRecordOf(cat, item) ?? groundLootRecord(item);
  if (!rec?.model) return null;
  const path = `meshes/${rec.model}`;
  await loadFromArchives(cat.archives, [path]);
  const arc = cat.archives.find((a) => a.has(path));
  const bytes = arc?.get(path);
  if (!bytes) return null;
  const pieces = flattenNif(parseNif(bytes.slice())).filter((p) => p.positions?.length && p.indices?.length)
    .map((p) => ({ ...p, slot: 'item', mirrored: false }));
  if (!pieces.length) return null;
  await preloadArmTextures(pieces, cat.archives, cat.gen);
  if (stamp() !== String(cat.gen) || texturesUnread(pieces, cat.archives, cat.gen)) return null;
  // Lay weapons along the floor and fit the transformed mesh from its own bounds.
  let pose = clothingKind(templateByIndex(item.templateIndex)) === 'cloak' ? trs(0, 0, 0, 180, 0, 0) : NIF_TO_PASS;
  if (item.group === 'Weapons') {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const { positions } of pieces) {
      for (let i = 0; i < positions.length; i++) {
        const axis = i % 3;
        lo[axis] = Math.min(lo[axis], positions[i]);
        hi[axis] = Math.max(hi[axis], positions[i]);
      }
    }
    const [w, d, h] = hi.map((value, axis) => value - lo[axis]);
    // NIF is Z-up. Tip tall weapons over their thinnest horizontal side.
    if (w <= Math.min(d, h)) pose = trs(0, 0, 0, 0, 0, 90);
    else if (d <= h) pose = trs(0, 0, 0, 0, 0, 0);
  }
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { positions } of pieces) {
    for (let i = 0; i < positions.length; i += 3) {
      const p = transformPoint(pose, positions[i], positions[i + 1], positions[i + 2]);
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], p[axis]);
        max[axis] = Math.max(max[axis], p[axis]);
      }
    }
  }
  const span = Math.max(...max.map((value, axis) => value - min[axis]));
  if (!(span > 0 && Number.isFinite(span))) return null;
  const local = multiply(trs(-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2, 0, 0, 0), pose);
  const packed = packFpArm(pieces);
  const mesh = renderer.createCharacterMesh(packed.packed, { uv: true });
  mesh.ranges = packed.ranges;
  try { hangRangeTextures(mesh.ranges, collectArmTextures(pieces, cat.archives, cat.gen)); }
  catch (err) { releaseGpu(mesh); throw err; }
  const extent = max.map((v, i) => (v - min[i]) / 2);
  const pixelMesh = { pixelFootprint: { bounds: { center: [0, extent[1], 0], extent }, area: .025, maxScale: 1.5 } };
  const tabletopPixelMesh = { bounds: [0, extent[1], 0, Math.hypot(...extent)] };
  const equipment = ['Armor', 'Weapons', 'MensClothing', 'WomensClothing'].includes(item.group);
  const scaleFor = length => length > 0 ? length / span : 1 / MW_UNITS_PER_METER;
  const heightScale = equipment ? THIRD_PERSON_HEIGHT_SCALE : 1;
  return {
    heightAt: length => 2 * extent[1] * scaleFor(length) * heightScale,
    modelKey: path.toLowerCase().replaceAll('\\', '/'),
    draw(x, y, z, yaw, decorLength = 0, tabletopPixels = false) {
      const scale = scaleFor(decorLength);
      const width = scale * (equipment ? THIRD_PERSON_HORIZONTAL_SCALE : 1);
      const height = scale * heightScale;
      const root = trs(x, y, z, 0, yaw, 0, width, height, width);
      const model = multiply(root, local);
      const draw = () => renderer.drawCharacter(mesh, model);
      if (!pixelWorldDraw(renderer, 'objects', tabletopPixels ? tabletopPixelMesh : pixelMesh, root, draw)) draw();
    },
    release: () => releaseGpu(mesh),
  };
}
