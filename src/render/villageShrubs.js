import assets from '../assets/grass/helbenar/shrubs.json' with { type: 'json' };

const bytes = (base64) => Uint8Array.from(globalThis.atob(base64), (c) => c.charCodeAt(0));

export function shrubSurfaces() {
  return botanicalSurfaces(assets.tiles, 16);
}

export function botanicalSurfaces(tiles, size) {
  return tiles.map((tile, index) => {
    const rgb = bytes(tile),
      rgba = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      rgba.set(rgb.subarray(i * 3, i * 3 + 3), i * 4);
      rgba[i * 4 + 3] = 255;
    }
    return { name: 'Botanical pigment ' + index, width: size, height: size, rgba };
  });
}

// The meadow shader reads flat lighting from corner 2 of each triangle. Expand
// the compact Blender indices once on upload so both provoking conventions agree.
export function shrubGeometry(form, lod) {
  return botanicalGeometry(assets.models[form][lod], 23);
}

export function botanicalGeometry(mesh, firstPart) {
  const vertices = new DataView(bytes(mesh.vertices).buffer);
  const indices = new DataView(bytes(mesh.indices).buffer),
    corners = new Float32Array(mesh.triangles * 27);
  for (let i = 0; i < indices.byteLength / 2; i++) {
    const v = indices.getUint16(i * 2, true) * 9,
      k = i * 9;
    corners[k] = vertices.getUint8(v + 6) / 255;
    corners[k + 1] = vertices.getUint8(v + 7) / 255;
    corners[k + 2] = firstPart + vertices.getUint8(v + 8);
    for (let axis = 0; axis < 3; axis++) corners[k + 3 + axis] = vertices.getInt16(v + 2 * axis, true) / 4096;
    if (i % 3 !== 2) continue;
    const a = k - 18,
      b = k - 9;
    const ux = corners[b + 3] - corners[a + 3],
      uy = corners[b + 4] - corners[a + 4],
      uz = corners[b + 5] - corners[a + 5];
    const vx = corners[k + 3] - corners[a + 3],
      vy = corners[k + 4] - corners[a + 4],
      vz = corners[k + 5] - corners[a + 5];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const j of [a, b, k]) {
      corners[j + 6] = nx / len;
      corners[j + 7] = ny / len;
      corners[j + 8] = nz / len;
    }
  }
  return corners;
}

export class VillageShrubBatches {
  constructor(gl, buildVao, geometry = shrubGeometry) {
    this.geometry = geometry;
    this.gl = gl;
    this.buildVao = buildVao;
    this.slots = new Map();
    this.meshes = new Map();
  }

  clear(slot) {
    const old = this.slots.get(slot);
    if (old) {
      this.gl.deleteBuffer(old.buffer);
      this.slots.delete(slot);
    }
  }

  write(slot, groups, packs) {
    this.clear(slot);
    if (!groups) return;
    const gl = this.gl,
      data = new Uint8Array(groups.reduce((sum, g) => sum + g.length, 0) * 16);
    const positions = new Uint8Array(packs[0].buffer, packs[0].byteOffset, packs[0].byteLength);
    let offset = 0;
    for (const group of groups)
      for (const i of group) {
        data.set(positions.subarray(i * 8, i * 8 + 8), offset);
        data.set(packs[1].subarray(i * 4, i * 4 + 4), offset + 8);
        data.set(packs[2].subarray(i * 4, i * 4 + 4), offset + 12);
        offset += 16;
      }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.slots.set(slot, { buffer, groups });
  }

  draw(slot, budget, distance) {
    const batch = this.slots.get(slot);
    if (!batch) return 0;
    const gl = this.gl,
      lod = distance < 9 ? 0 : distance < 23 ? 1 : 2;
    let offset = 0,
      submitted = 0;
    batch.groups.forEach((group, form) => {
      let count = group.length;
      while (count && group[count - 1] >= budget) count--;
      if (count) {
        const key = form * 3 + lod;
        let mesh = this.meshes.get(key);
        if (!mesh) {
          const v = this.geometry(form, lod);
          mesh = this.buildVao(
            v,
            Uint16Array.from({ length: v.length / 9 }, (_, i) => i),
            true,
          );
          this.meshes.set(key, mesh);
        }
        gl.bindVertexArray(mesh.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
        gl.vertexAttribPointer(1, 4, gl.UNSIGNED_SHORT, true, 16, offset);
        gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 16, offset + 8);
        gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 16, offset + 12);
        gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, count);
        submitted += mesh.count * count;
      }
      offset += 16 * group.length;
    });
    return submitted;
  }

  destroy() {
    for (const slot of this.slots.keys()) this.clear(slot);
    for (const mesh of this.meshes.values()) {
      this.gl.deleteVertexArray(mesh.vao);
      this.gl.deleteBuffer(mesh.cb);
      this.gl.deleteBuffer(mesh.ib);
    }
    this.meshes.clear();
  }
}
