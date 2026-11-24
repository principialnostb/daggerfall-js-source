import { runSegment } from '../urban/townFabricModel.js';

// Pixel-local metres. Index the actual placed foundations and rails once so
// streaming the grass never needs a collision ray per blade.
export class VillagePlantClearance {
  cells = new Map();

  constructor(maxRadius = 2) { this.maxRadius = maxRadius; }

  add(ax, az, bx, bz, thickness = null) {
    const shape = { ax, az, bx, bz, thickness };
    const margin = this.maxRadius + (thickness ?? 0);
    const left = Math.floor((Math.min(ax, bx) - margin) / 8),
      right = Math.floor((Math.max(ax, bx) + margin) / 8);
    const near = Math.floor((Math.min(az, bz) - margin) / 8),
      far = Math.floor((Math.max(az, bz) + margin) / 8);
    for (let z = near; z <= far; z++)
      for (let x = left; x <= right; x++) {
        const key = z * 256 + x;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(shape);
      }
  }

  addFence(bounds, m) {
    const midX = (bounds[0] + bounds[3]) * .5, midZ = (bounds[2] + bounds[5]) * .5;
    const y = bounds[1], width = bounds[3] - bounds[0], depth = bounds[5] - bounds[2];
    const point = (x, z) => [m[0]*x + m[4]*y + m[8]*z + m[12], m[2]*x + m[6]*y + m[10]*z + m[14]];
    if (width > depth)
      this.add(...point(bounds[0],midZ), ...point(bounds[3],midZ), depth*.5*Math.hypot(m[8],m[10]));
    else
      this.add(...point(midX,bounds[2]), ...point(midX,bounds[5]), width*.5*Math.hypot(m[0],m[2]));
  }

  addYards(plan, origin) {
    for (const edge of plan.fences) {
      const { a, b } = runSegment([edge], plan.W);
      this.add(origin[0] + a[0], origin[2] + a[1], origin[0] + b[0], origin[2] + b[1], 0.22);
    }
  }

  blocks(x, z, radius) {
    const shapes = this.cells.get(Math.floor(z / 8) * 256 + Math.floor(x / 8));
    if (!shapes) return false;
    for (const { ax, az, bx, bz, thickness } of shapes) {
      let dx, dz;
      if (thickness === null) {
        dx = Math.max(ax - x, 0, x - bx);
        dz = Math.max(az - z, 0, z - bz);
      } else {
        const vx = bx - ax,
          vz = bz - az;
        const t = Math.min(1, Math.max(0, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
        dx = x - ax - t * vx;
        dz = z - az - t * vz;
      }
      if (dx * dx + dz * dz <= (radius + (thickness ?? 0)) ** 2) return true;
    }
    return false;
  }
}
