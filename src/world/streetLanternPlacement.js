import { GLOBAL_SCALE } from './meshReader.js';
import { ROAD_RECORDS } from './road/roadEdge.js';
import { adoptLight } from '../render/lightId.js';

const orientations = new WeakMap(), lightPositions = new WeakMap();
const TILE = 256 * GLOBAL_SCALE;
// The Blender housing centre, in fractions of the complete model height.
export const STREET_LANTERN_GLOW = [.735 / 4.415, 3 / 4.415, 0];
export const usesClassicStreetLantern = record => [14, 15, 28, 29].includes(record);
export const streetLanternYaw = item => orientations.get(item) ?? 0;

// DFU RMBLayout.AddLights has no road-facing rotation: its flats face the eye.
// Our asymmetric post faces the nearest road tile in the authored block.
export function streetRoadYaw(block, x, z) {
  const tiles = block.rmbBlock?.fldHeader?.groundData?.groundTiles;
  let best = Infinity, yaw = 0;
  for (let col = 0; col < 16; col++) for (let row = 0; row < 16; row++) {
    if (!ROAD_RECORDS.includes(tiles?.[col]?.[row]?.textureRecord)) continue;
    const cx = (col + .5) * TILE, cz = (15.5 - row) * TILE;
    const dx = cx - x, dz = cz - z, distance = dx * dx + dz * dz;
    if (distance >= best || distance < 1e-8) continue;
    best = distance;
    yaw = Math.abs(dx) >= Math.abs(dz) ? (dx >= 0 ? 0 : 180) : (dz >= 0 ? -90 : 90);
  }
  return yaw;
}

export function orientStreetFlats(block, flats) {
  for (const flat of flats) if (flat.archive === 210 && usesClassicStreetLantern(flat.record)) {
    orientations.set(flat, streetRoadYaw(block, flat.x, flat.z));
  }
  return flats;
}

// Preserve metadata without adding a fourth coordinate to GPU vertex arrays.
export function streetLanternCenter(source, center) {
  if (source && orientations.has(source)) orientations.set(center, orientations.get(source));
  return center;
}

export function streetLanternOffset(height, yaw) {
  const angle = yaw * Math.PI / 180, reach = STREET_LANTERN_GLOW[0] * height;
  return [Math.cos(angle) * reach, STREET_LANTERN_GLOW[1] * height, -Math.sin(angle) * reach];
}

export function orientStreetLights(block, lights) {
  for (const light of lights) if (usesClassicStreetLantern(light.record)) {
    orientations.set(light, streetRoadYaw(block, light.x, light.z));
  }
  return lights;
}

// DFU RMBLayout.AddLight puts the light above the flat. Keep that position
// for classic sprites, but use the housing centre while the 3D option is on.
export function placeStreetLight(source, target, groundLift = 0) {
  if (!orientations.has(source)) return target;
  const offset = streetLanternOffset(source.h, streetLanternYaw(source));
  const delta = [offset[0], offset[1] - source.h - 6 * GLOBAL_SCALE + groundLift, offset[2]];
  const enhanced = Array.isArray(target)
    ? target.map((v, i) => v + delta[i])
    : { ...target, x: target.x + delta[0], y: target.y + delta[1], z: target.z + delta[2] };
  adoptLight(enhanced, target);
  lightPositions.set(target, enhanced);
  return target;
}

export const streetLightPosition = (light, enabled) => enabled ? lightPositions.get(light) ?? light : light;
