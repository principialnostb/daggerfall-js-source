import { GLOBAL_SCALE } from './meshReader.js';
import { adoptLight } from '../render/lightId.js';

const housingLights = new WeakMap();
const streetCenters = new WeakMap();
// The Blender housing centres, in fractions of the complete model height.
export const STREET_LANTERN_GLOWS = [[.735 / 4.415, 3 / 4.415, 0], [-.735 / 4.415, 3 / 4.415, 0]];
export const usesClassicStreetLantern = record => record === 14 || record === 15 || record === 28 || record === 29;

export function markStreetLanternCenter(archive, record, center, yaw = 0) {
  if (archive === 210 && usesClassicStreetLantern(record)) streetCenters.set(center, yaw);
  return center;
}

export const streetLanternYaw = center => streetCenters.get(center);

// DFU RMBLayout.AddLight puts one light above the flat. DFO's double-armed
// post lights each housing separately, at the pose selected when the town is built.
export function placeStreetLight(source, target, groundLift = 0) {
  if (!usesClassicStreetLantern(source.record)) return target;
  const angle = (source.yaw ?? 0) * Math.PI / 180;
  const [first, second] = STREET_LANTERN_GLOWS.map(([x, y]) => {
    const dx = x * source.h * Math.cos(angle), dz = -x * source.h * Math.sin(angle);
    const dy = (y - 1) * source.h - 6 * GLOBAL_SCALE + groundLift;
    return Array.isArray(target)
      ? [target[0] + dx, target[1] + dy, target[2] + dz]
      : { ...target, x: target.x + dx, y: target.y + dy, z: target.z + dz };
  });
  adoptLight(first, target);
  housingLights.set(target, [first, second]);
  return target;
}

export const streetHousingLights = light => housingLights.get(light);
