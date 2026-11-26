import { unpackArenaRoads } from '../arenaRoads.js';

// Region keys are produced in two sorted runs: road pixels in raster order,
// then the remaining track pixels in raster order. Read directly from those
// arrays for installation, map ink and queries of already built terrain.
class PackedMask {
  constructor(keys, bytes, split, size) {
    this.pixels = keys;
    this.bytes = bytes;
    this.split = split;
    this.size = size;
  }

  get(key) {
    const keys = this.pixels;
    for (let run = 0; run < 2; run++) {
      let left = run ? this.split : 0;
      let right = (run ? keys.length : this.split) - 1;
      if (left > right || key < keys[left] || key > keys[right]) continue;
      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (keys[mid] === key) return this.bytes[mid] || undefined;
        if (keys[mid] < key) left = mid + 1;
        else right = mid - 1;
      }
    }
    return undefined;
  }

  has(key) { return this.get(key) !== undefined; }

  forEach(fn, receiver) {
    for (let i = 0; i < this.bytes.length; i++) {
      if (this.bytes[i]) fn.call(receiver, this.bytes[i], this.pixels[i], this);
    }
  }

  *keys() {
    for (let i = 0; i < this.bytes.length; i++) if (this.bytes[i]) yield this.pixels[i];
  }

  *values() {
    for (const byte of this.bytes) if (byte) yield byte;
  }

  [Symbol.iterator]() { return this.entries(); }

  *entries() {
    for (let i = 0; i < this.bytes.length; i++) if (this.bytes[i]) yield [this.pixels[i], this.bytes[i]];
  }
}

export function packedTerrainRoads(packed) {
  const { keys, roads, tracks } = packed;
  if (roads.length !== keys.length || tracks.length !== keys.length) return unpackArenaRoads(packed);
  let split = keys.length;
  let roadCount = 0, trackCount = 0;
  for (let i = 0; i < keys.length; i++) {
    if (i && keys[i] <= keys[i - 1]) {
      // Keep the old decoder for other producers with arbitrary insertion order.
      if (split !== keys.length || keys[i] === keys[i - 1]) return unpackArenaRoads(packed);
      split = i;
    }
    if (roads[i]) roadCount++;
    if (tracks[i]) trackCount++;
  }
  // Repeated keys in different runs must retain the decoder's last-write semantics.
  if (split < keys.length) {
    let lo = 0, hi = split;
    while (lo < split && hi < keys.length) {
      if (keys[lo] === keys[hi]) return unpackArenaRoads(packed);
      if (keys[lo] < keys[hi]) lo++; else hi++;
    }
  }
  const join = new Map();
  for (let i = 0; i < (packed.joinKeys?.length ?? 0); i++) join.set(packed.joinKeys[i], packed.join[i]);
  return {
    roads: new PackedMask(keys, roads, split, roadCount),
    tracks: new PackedMask(keys, tracks, split, trackCount),
    join,
  };
}
