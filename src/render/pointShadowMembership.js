// @ts-check
// A point-shadow list needs only the answer of each light's cube test.
// Rank is the bit index, so moving a carried light leaves other ranks reusable.
export class PointShadowMembership {
  /** @param {number} maxLights
   * @param {(limits: Float64Array, rank: number, x: number, y: number, z: number, radius: number) => boolean} keeps */
  constructor(maxLights, keeps) {
    this.keeps = keeps;
    this.previous = new Float64Array(maxLights * 5);
    /** @type {WeakMap<object, {generation: number, mask: number, x: number, y: number, z: number, r: number}>} */
    this.spheres = new WeakMap();
    this.generation = 0;
    this.active = 0;
    this.unchanged = 0;
  }

  /** @param {ArrayLike<number>} limits Five values per light: centre, far distance and slack.
   * @param {number} active Bit mask of active light ranks. */
  begin(limits, active) {
    let unchanged = 0;
    for (let bits = active & this.active; bits; bits &= bits - 1) {
      const bit = bits & -bits;
      const o = (31 - Math.clz32(bit)) * 5;
      if (this.previous[o] === limits[o] && this.previous[o + 1] === limits[o + 1]
          && this.previous[o + 2] === limits[o + 2] && this.previous[o + 3] === limits[o + 3]
          && this.previous[o + 4] === limits[o + 4]) unchanged |= bit;
    }
    this.previous.set(limits);
    this.active = active;
    this.unchanged = unchanged;
    this.generation++;
  }

  /** @param {object} owner Persistent caster record or billboard batch.
   * @param {ArrayLike<number>|null} sphere World centre and radius, or null for an unbounded caster.
   * @returns {number} Bit mask of lights that keep this caster. */
  ranks(owner, sphere) {
    if (!sphere) return this.active;
    const x = sphere[0], y = sphere[1], z = sphere[2], r = sphere[3];
    let saved = this.spheres.get(owner);
    let reuse = 0;
    if (!saved) {
      saved = { generation: -1, mask: 0, x, y, z, r };
      this.spheres.set(owner, saved);
    } else if (x === saved.x && y === saved.y && z === saved.z && r === saved.r) {
      if (saved.generation === this.generation) return saved.mask;
      if (saved.generation === this.generation - 1) reuse = this.unchanged;
    }
    let mask = saved.mask & reuse;
    for (let bits = this.active & ~reuse; bits; bits &= bits - 1) {
      const bit = bits & -bits;
      const rank = 31 - Math.clz32(bit);
      if (this.keeps(this.previous, rank, x, y, z, r)) mask |= bit;
    }
    saved.generation = this.generation;
    saved.x = x; saved.y = y; saved.z = z; saved.r = r; saved.mask = mask;
    return mask;
  }
}
