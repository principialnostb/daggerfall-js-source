// A reader for Skyrim SE's BSA (version 105): list, and extract by path (LZ4 frame).
import { openSync, readSync, closeSync } from 'node:fs';
const rd = (fd, off, n) => { const b = Buffer.alloc(n); readSync(fd, b, 0, n, off); return b; };
export function listBsa(path) {
  const fd = openSync(path, 'r');
  const h = rd(fd, 0, 36);
  if (h.toString('latin1', 0, 4) !== 'BSA\0') throw new Error('not a BSA');
  const version = h.readUInt32LE(4), flags = h.readUInt32LE(12), folders = h.readUInt32LE(16), files = h.readUInt32LE(20);
  const totalNames = h.readUInt32LE(28);
  const recSize = version >= 105 ? 24 : 16;
  const fr = rd(fd, 36, folders * recSize);
  const folderRecs = [];
  for (let i = 0; i < folders; i++) folderRecs.push({ count: fr.readUInt32LE(i * recSize + 8) });
  let off = 36 + folders * recSize;
  const entries = [];
  for (const f of folderRecs) {
    const len = rd(fd, off, 1)[0]; const name = rd(fd, off + 1, len - 1).toString('latin1'); off += 1 + len;
    const recs = rd(fd, off, f.count * 16); off += f.count * 16;
    for (let i = 0; i < f.count; i++) entries.push({ folder: name, size: recs.readUInt32LE(i * 16 + 8), offset: recs.readUInt32LE(i * 16 + 12) });
  }
  const names = rd(fd, off, totalNames).toString('latin1').split('\0');
  entries.forEach((e, i) => { e.path = (e.folder + '\\' + names[i]).toLowerCase(); });
  closeSync(fd);
  return { path, version, flags, entries };
}
function lz4Frame(src) {
  let p = 4; const flg = src[p]; p += 2; if (flg & 8) p += 8; if (flg & 1) p += 4; p += 1;
  const out = [];
  let total = Buffer.alloc(0);
  const chunks = [];
  while (true) {
    const bs = src.readUInt32LE(p); p += 4; if (bs === 0) break;
    const raw = bs & 0x80000000, n = bs & 0x7fffffff; const blk = src.subarray(p, p + n); p += n;
    if (flg & 0x10) p += 4;
    if (raw) { out.push(...blk); continue; }
    let q = 0;
    while (q < blk.length) {
      const tok = blk[q++]; let lit = tok >> 4;
      if (lit === 15) { let b; do { b = blk[q++]; lit += b; } while (b === 255); }
      for (let i = 0; i < lit; i++) out.push(blk[q++]);
      if (q >= blk.length) break;
      const dist = blk[q] | (blk[q + 1] << 8); q += 2;
      let ml = tok & 15; if (ml === 15) { let b; do { b = blk[q++]; ml += b; } while (b === 255); } ml += 4;
      const start = out.length - dist; for (let i = 0; i < ml; i++) out.push(out[start + i]);
    }
  }
  return Buffer.from(out);
}
export function extract(bsa, entry) {
  const fd = openSync(bsa.path, 'r');
  const compressed = !!(bsa.flags & 4) !== !!(entry.size & 0x40000000);
  let size = entry.size & 0x3fffffff, off = entry.offset;
  if (bsa.flags & 0x100) { const l = rd(fd, off, 1)[0]; off += 1 + l; size -= 1 + l; }
  let data = rd(fd, off, size);
  closeSync(fd);
  if (compressed) { const orig = data.readUInt32LE(0); data = lz4Frame(data.subarray(4)); if (data.length !== orig) throw new Error(`lz4 ${data.length} != ${orig}`); }
  return data;
}
