// A reader for Skyrim Special Edition's NIFs (20.2.0.7, user 12, BS 100) - enough for an armour piece: each
// BSTriShape's name, offset, shader and texture set, its vertices (position, UV, normal) read from the shape or, for a
// skinned shape, from its NiSkinPartition, and its triangles. MW-HORN5: no Skyrim file is read from the repository -
// only from the owner's install (tools/skyrim/importIronHelmet.mjs).

const half = (h) => {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
};

export function readSseNif(buf) {
  let p = buf.indexOf(10) + 1;
  const u8 = () => buf[p++], u16 = () => { const v = buf.readUInt16LE(p); p += 2; return v; };
  const u32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; }, i32 = () => { const v = buf.readInt32LE(p); p += 4; return v; };
  const f32 = () => { const v = buf.readFloatLE(p); p += 4; return v; };
  const u64 = () => { const v = buf.readBigUInt64LE(p); p += 8; return v; };
  const sized = () => { const n = u32(); const s = buf.toString('latin1', p, p + n); p += n; return s; };
  const short = () => { const n = u8(); const s = buf.toString('latin1', p, p + n); p += n; return s; };
  const version = u32(); u8(); u32(); const nBlocks = u32(); const bs = u32();
  if (version !== 0x14020007) throw new Error(`not a Skyrim NIF (version ${version.toString(16)})`);
  short(); if (bs > 130) u32(); if (bs < 131) short(); short(); if (bs >= 103) short();
  const types = Array.from({ length: u16() }, sized);
  const blockType = Array.from({ length: nBlocks }, () => types[u16()]);
  const sizes = Array.from({ length: nBlocks }, u32);
  const nStrings = u32(); u32();
  const strings = Array.from({ length: nStrings }, sized);
  const nGroups = u32(); for (let i = 0; i < nGroups; i++) u32();
  const offsets = []; for (let i = 0; i < nBlocks; i++) { offsets.push(p); p += sizes[i]; }

  /** `count` vertices laid out by the vertex descriptor's attribute flags (bits 44 up); SSE's positions are floats. */
  const readVerts = (desc, count) => {
    const flags = Number(desc >> 44n) & 0xffff, size = Number(desc & 0xfn) * 4;
    const out = [];
    for (let i = 0; i < count; i++) {
      const s = p, v = {};
      if (flags & 1) { if (flags & 0x400 || bs === 100) { v.pos = [f32(), f32(), f32()]; f32(); } else { v.pos = [half(u16()), half(u16()), half(u16())]; u16(); } }
      if (flags & 2) v.uv = [half(u16()), half(u16())];
      if (flags & 8) { v.n = [u8() / 127.5 - 1, u8() / 127.5 - 1, u8() / 127.5 - 1]; u8(); }
      if (flags & 0x10) p += 4;   // tangent
      if (flags & 0x20) p += 4;   // vertex colour
      if (flags & 0x40) { v.w = [half(u16()), half(u16()), half(u16()), half(u16())]; v.b = [u8(), u8(), u8(), u8()]; }   // skin weights and bones
      if (flags & 0x100) p += 4;  // eye data
      if (p - s !== size) throw new Error(`vertex size ${p - s} != ${size} (flags ${flags.toString(16)})`);
      out.push(v);
    }
    return out;
  };

  const partitions = {};
  blockType.forEach((t, i) => {
    if (t !== 'NiSkinPartition') return;
    p = offsets[i];
    const nParts = u32(), dataSize = u32(), vsize = u32(), desc = u64();
    const verts = readVerts(desc, vsize ? dataSize / vsize : 0);
    const tris = [], parts = [];
    for (let k = 0; k < nParts; k++) {
      const nv = u16(), nt = u16(), nb = u16(), ns = u16(), nw = u16();
      const bones = Array.from({ length: nb }, u16);
      const map = u8() ? Array.from({ length: nv }, u16) : null;
      parts.push({ bones, map });
      if (u8()) p += nv * nw * 4;
      const strips = Array.from({ length: ns }, u16);
      if (u8()) p += ns ? strips.reduce((a, b) => a + b, 0) * 2 : nt * 6;
      if (u8()) p += nv * nw;
      u16(); u64();
      for (let j = 0; j < nt; j++) tris.push([u16(), u16(), u16()]);   // SSE's copy, in the shared vertex list
    }
    partitions[i] = { verts, tris, parts };
  });

  // the node tree: each NiNode's name, local transform and children, for a skeleton's bind
  const nodes = new Map();
  blockType.forEach((t, i) => {
    if (t !== 'NiNode' && t !== 'BSFadeNode' && t !== 'BSLeafAnimNode') return;
    p = offsets[i];
    const name = strings[i32()] ?? '';
    const extra = u32(); p += extra * 4; i32(); u32();
    const trans = [f32(), f32(), f32()], rot = Array.from({ length: 9 }, f32), scale = f32(); i32();
    const children = Array.from({ length: u32() }, i32);
    nodes.set(i, { name, trans, rot, scale, children });
  });

  const shapes = [];
  blockType.forEach((t, i) => {
    if (t !== 'BSTriShape' && t !== 'BSDynamicTriShape') return;
    p = offsets[i];
    const name = strings[i32()] ?? '';
    const extra = u32(); p += extra * 4; i32(); u32();
    const T = [f32(), f32(), f32()]; p += 36; const S = f32(); i32();
    p += 16; const skin = i32(), shader = i32(); i32();
    const desc = u64(), nt = bs >= 130 ? u32() : u16(), nv = u16(), dataSize = u32();
    let verts = [], tris = [];
    if (dataSize > 0) { verts = readVerts(desc, nv); for (let j = 0; j < nt; j++) tris.push([u16(), u16(), u16()]); }
    let dynamic = null;
    if (t === 'BSDynamicTriShape') {   // a head: its positions live after the shape, as Vector4s
      if (bs === 100) u32();   // SSE's particle data size
      dynamic = Array.from({ length: u32() / 16 }, () => { const v = [f32(), f32(), f32()]; f32(); return v; });
    }
    let skinning = null;
    if (skin >= 0) {   // NiSkinInstance's head: its NiSkinData, its partition, the root, the bones by name
      p = offsets[skin];
      const data = i32(), part = i32(); i32();
      const boneRefs = Array.from({ length: u32() }, i32);
      if (dataSize === 0) ({ verts, tris } = partitions[part]);
      p = offsets[data];
      const xform = () => ({ rot: Array.from({ length: 9 }, f32), trans: [f32(), f32(), f32()], scale: f32() });
      const overall = xform(); u32(); const weighted = u8();
      const bones = boneRefs.map((r) => { const at = p; p = offsets[r]; const name = strings[i32()] ?? ''; p = at; const x = xform(); p += 16; const n = u16(); if (weighted) p += n * 6; return { name, ...x }; });
      skinning = { overall, bones, parts: partitions[part]?.parts ?? [] };
    }
    if (dynamic) verts = verts.map((v, k) => ({ ...v, pos: dynamic[k] }));
    let textures = null;
    if (shader >= 0 && blockType[shader] === 'BSLightingShaderProperty') {
      for (let k = offsets[shader]; k < offsets[shader] + sizes[shader] - 4; k++) {   // its texture set's ref
        const r = buf.readInt32LE(k);
        if (r > 0 && r < nBlocks && blockType[r] === 'BSShaderTextureSet') { p = offsets[r]; textures = Array.from({ length: u32() }, sized); break; }
      }
    }
    shapes.push({ name, shader: blockType[shader], T, S, verts, tris, textures, skinning });
  });
  return { blockType, shapes, nodes };
}
