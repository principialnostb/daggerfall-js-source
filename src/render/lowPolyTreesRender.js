// @ts-check
// LPT1 (bible/07-Rendering/Low-Poly-Trees.md): THE LOW-POLY TREES' BUFFERS - every mesh of the mod in one vertex buffer
// and one index buffer (uploaded once, ~2 MB), and the frame's instances in a third. The billboard program draws them in
// its mesh mode (render/renderer.js BB_VS, `_drawLowPolyTrees`), so this module owns buffers and a vertex array, never
// a program: a tree is lit, fogged and shadowed by the very shader that lights the flats, under either lane.
//
// THE LAYOUT, the billboard program's: location 0 the vertex (BB_VS aCenter), 1 its uv (aCorner), 2 its normal (aNormal)
// - the vendored f32 x 8 a vertex as it stands (tools/lowPolyTreesExtract.mjs packMeshes); 3 and 4 the instance, a
// divisor each: [x, y, z, yaw] (aInst) and its scale (aScale) - LPT_INSTANCE_FLOATS a tree (world/lowPolyTrees.js's).
import { LPT_INSTANCE_FLOATS } from '../world/lowPolyTrees.js';

export class LowPolyTreesGpu {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {{vertexBytes:number, meshes:{vertex:number,vertices:number,index:number,subs:number[][]}[]}} index trees.json's
   * @param {Uint8Array} bin trees.bin
   */
  constructor(gl, index, bin) {
    this.gl = gl;
    const { vertexBytes } = index;
    if (!Number.isSafeInteger(vertexBytes) || vertexBytes < 0 || vertexBytes % 32 || vertexBytes > bin.byteLength) {
      throw new RangeError('Invalid tree vertex byte range');
    }
    // WebGL reads these bytes synchronously; even an unaligned slice needs no float copy.
    const verts = bin.subarray(0, vertexBytes);
    // Rebase each mesh's local u16 indices to the one global u32 element buffer.
    let total = 0;
    for (const m of index.meshes) for (const [, n] of m.subs) {
      if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Invalid tree submesh index count');
      total += n;
    }
    if (total * 2 > bin.byteLength - vertexBytes) throw new RangeError('Truncated tree index data');
    const offset = bin.byteOffset + vertexBytes;
    const words = offset % 2 === 0 ? new Uint16Array(bin.buffer, offset, total) : null;
    const idx = new Uint32Array(total);
    /** each mesh's submeshes as [byte offset into the index buffer, count] */
    this.subs = index.meshes.map((m) =>
      m.subs.map(([at, n]) => {
        const start = m.index + at;
        if (!Number.isSafeInteger(start) || start < 0 || start + n > total) throw new RangeError('Invalid tree submesh index range');
        const end = start + n;
        if (words) {
          for (let i = start; i < end; i++) idx[i] = words[i] + m.vertex;
        } else {
          // Packed little-endian u16 values may start at an odd offset inside a caller's buffer.
          for (let i = start, byte = vertexBytes + start * 2; i < end; i++, byte += 2) {
            idx[i] = (bin[byte] | (bin[byte + 1] << 8)) + m.vertex;
          }
        }
        return [start * 4, n];
      }),
    );
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vb);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 24);
    this.ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.instanceBuffer = gl.createBuffer();
    this.instanceCapacity = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribDivisor(4, 1);
    this.pointInstances(0);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** The frame's instances (the visible ones), `count` of them, packed LPT_INSTANCE_FLOATS a tree; the buffer grows by
   *  doubling. */
  setInstances(data, count) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const need = count * LPT_INSTANCE_FLOATS;
    if (need > this.instanceCapacity) {
      this.instanceCapacity = Math.max(need, this.instanceCapacity * 2, 1024 * LPT_INSTANCE_FLOATS);
      gl.bufferData(gl.ARRAY_BUFFER, this.instanceCapacity * 4, gl.DYNAMIC_DRAW);
    }
    if (need) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, need);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** The instance attributes pointed at instance `first` - a run's start (the vertex array must be bound). */
  pointInstances(first) {
    const gl = this.gl,
      stride = LPT_INSTANCE_FLOATS * 4,
      at = first * stride;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, at);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, at + 16);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    for (const b of [this.vb, this.ib, this.instanceBuffer]) gl.deleteBuffer(b);
    this.vao = null;
  }
}
