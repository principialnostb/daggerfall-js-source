import { runSegment } from '../urban/townFabricModel.js';
import { NAV_CELLS_PER_BLOCK } from '../city/cityNavigation.js';
import { TILE_UNITS } from './waterBed.js';
import { POND_SIDE } from './pondSites.js';
import { WATER_DRAW_MASK_TABLE } from './waterCorners.js';

const reach = 2.8; // metres from the wall into the basin
const shoulder = .48; // covers even the diagonal of a detail-grid cell

// DFU RMBLayout places a house on the block datum. Limit our excavation only
// where it would expose an actual ground-storey face of that placed model.
export class PondHouseBank {
  byTile = new Map();

  // ARCH3D's three rail variants run along local Z. A mirrored or rotated
  // placement takes both ends of its contact line with it.
  addFencePiece(bounds, matrix, box, grade, bytes, read) {
    const x = (bounds[0] + bounds[3]) * .5, y = bounds[1];
    const end = z => [matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]];
    const side = [...end(bounds[2]), ...end(bounds[5]), box[1], box[4]];
    this.add({ sides: [side] }, box, grade, bytes, read);
  }

  addFences(plan, origin, blockLift, bytes, read) {
    if (!plan) return;
    for (const edge of plan.fences) {
      const { a, b } = runSegment([edge], plan.W);
      const x = edge.inner % plan.W, z = Math.floor(edge.inner / plan.W);
      const grade = origin[1] + blockLift(Math.floor(x / NAV_CELLS_PER_BLOCK), Math.floor(z / NAV_CELLS_PER_BLOCK));
      const ax = origin[0] + a[0], az = origin[2] + a[1], bx = origin[0] + b[0], bz = origin[2] + b[1];
      this.add({ sides: [[ax, az, bx, bz, grade, grade + 1]] },
        [Math.min(ax, bx), grade, Math.min(az, bz), Math.max(ax, bx), grade + 1, Math.max(az, bz)], grade, bytes, read);
    }
  }

  add(ground, box, grade, bytes, read) {
    let wet = false;
    for (let z = Math.max(0, Math.floor(box[2] / TILE_UNITS)); z <= Math.min(POND_SIDE - 1, Math.floor(box[5] / TILE_UNITS)) && !wet; z++) {
      for (let x = Math.max(0, Math.floor(box[0] / TILE_UNITS)); x <= Math.min(POND_SIDE - 1, Math.floor(box[3] / TILE_UNITS)); x++) {
        if (WATER_DRAW_MASK_TABLE[bytes[z * POND_SIDE + x]]) {
          wet = true;
          break;
        }
      }
    }
    if (!wet) return;
    for (const [ax, az, bx, bz, bottom, top] of ground.sides) {
      if (bottom > grade + .15 || top < grade - .1) continue;
      const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      if (length < .02) continue;
      const steps = Math.ceil(length / .32);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, col = read(ax + dx * t, az + dz * t);
        if (!col || col.floor >= Math.min(bottom, col.grade) - .01) continue;
        const edge = { ax, az, dx, dz, len2: length * length, bottom };
        for (let z = Math.floor((Math.min(az, bz) - reach) / TILE_UNITS); z <= Math.floor((Math.max(az, bz) + reach) / TILE_UNITS); z++) {
          for (let x = Math.floor((Math.min(ax, bx) - reach) / TILE_UNITS); x <= Math.floor((Math.max(ax, bx) + reach) / TILE_UNITS); x++) {
            const key = z * POND_SIDE + x;
            if (!this.byTile.has(key)) this.byTile.set(key, []);
            this.byTile.get(key).push(edge);
          }
        }
        break;
      }
    }
  }

  depth(x, z, level, original) {
    const edges = this.byTile.get(Math.floor(z / TILE_UNITS) * POND_SIDE + Math.floor(x / TILE_UNITS));
    if (!edges || !original) return original;
    let depth = original;
    for (const e of edges) {
      const dx = x - e.ax, dz = z - e.az;
      const t = Math.max(0, Math.min(1, (dx * e.dx + dz * e.dz) / e.len2));
      const distance = Math.hypot(dx - t * e.dx, dz - t * e.dz);
      if (distance >= reach) continue;
      const u = Math.max(0, (distance - shoulder) / (reach - shoulder));
      const atWall = Math.min(original, Math.max(0, level - e.bottom - .02));
      depth = Math.min(depth, atWall + (original - atWall) * u * u * (3 - 2 * u));
    }
    return depth;
  }
}
