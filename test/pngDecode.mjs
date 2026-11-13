// A PNG read back, for the tests of the pictures the account service draws: each chunk's CRC checked, every row's
// filter undone, and each pixel read as [r, g, b] (an RGBA picture) or its palette index (an indexed one).
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { crc32 } from '../server-account/src/pdaPng.js';

/** A PNG read back, either kind the service writes: its size, colour type, and each pixel as [r, g, b] (or its index). */
export function decode(bytes) {
  const b = Buffer.from(bytes);
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let at = 8;
  let w = 0, h = 0, type = -1, palette = [];
  const idat = [];
  while (at < b.length) {
    const len = b.readUInt32BE(at);
    const kind = b.toString('latin1', at + 4, at + 8);
    const data = b.subarray(at + 8, at + 8 + len);
    assert.equal(b.readUInt32BE(at + 8 + len), crc32(b.subarray(at + 4, at + 8 + len)), `${kind}'s CRC`);
    if (kind === 'IHDR') [w, h, type] = [data.readUInt32BE(0), data.readUInt32BE(4), data[9]];
    if (kind === 'PLTE') for (let i = 0; i < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    if (kind === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const rows = inflateSync(Buffer.concat(idat));
  const bpp = type === 6 ? 4 : 1;
  const stride = w * bpp;
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = rows[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const raw = rows[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const up = y ? px[(y - 1) * stride + i] : 0;
      const c = y && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      assert.ok(pred !== undefined, `filter ${f}`);
      px[y * stride + i] = (raw + pred) & 255;
    }
  }
  const at2 = (x, y) => (Math.round(y) * w + Math.round(x)) * bpp;
  return {
    w,
    h,
    type,
    palette,
    at: (x, y) => (bpp === 1 ? px[at2(x, y)] : [px[at2(x, y)], px[at2(x, y) + 1], px[at2(x, y) + 2]]),
  };
}
