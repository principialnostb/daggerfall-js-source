// A DDS cut to its first level no larger than a cap decodes to exactly the full file's levels from there down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDds, ddsAtMost } from '../../../src/formats/morrowind/mwDdsFile.js';
import { textureGen, CHAR_TEXTURE_MAX } from '../../../src/combat/fpArm.js';

/** A DXT1 file `size` square with a full mip chain, each level's blocks a colour of its own. */
function dxt1(size) {
  const levels = [];
  for (let s = size; s >= 1; s >>= 1) levels.push(s);
  const blocks = levels.map((s) => Math.max(1, s >> 2) ** 2 * 8);
  const out = new Uint8Array(128 + blocks.reduce((a, b) => a + b, 0));
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x20534444, true);
  v.setUint32(4, 124, true);
  v.setUint32(12, size, true);
  v.setUint32(16, size, true);
  v.setUint32(28, levels.length, true);
  v.setUint32(80, 0x4, true);
  v.setUint32(84, 0x31545844, true);
  let off = 128;
  levels.forEach((s, i) => {
    for (let b = 0; b < blocks[i]; b += 8) v.setUint16(off + b, (i * 2731) & 0xffff, true);
    off += blocks[i];
  });
  return out;
}

test('a file larger than the cap starts at the cap, and its levels are the full chain\'s from there (mutant: the cut level off by one)', () => {
  const file = dxt1(64);
  const full = decodeDds(file);
  const cut = decodeDds(ddsAtMost(file, 16));
  assert.equal(cut.width, 16);
  assert.equal(cut.mips.length, full.mips.length - 2);
  cut.mips.forEach((m, i) => assert.deepEqual(m.rgba, full.mips[i + 2].rgba));
});

test('a file within the cap, one with no chain and a bad cap are handed back untouched', () => {
  const file = dxt1(16);
  assert.equal(ddsAtMost(file, 16), file);
  assert.equal(ddsAtMost(file, 0), file);
  const flat = file.slice();
  new DataView(flat.buffer).setUint32(28, 1, true);
  assert.equal(ddsAtMost(flat, 4), flat);
});

test('a capped body keys its pictures apart from a full one, and no generation stays no generation', () => {
  assert.equal(textureGen(7, CHAR_TEXTURE_MAX), `7#tex${CHAR_TEXTURE_MAX}`);
  assert.equal(textureGen(7, null), 7);
  assert.equal(textureGen(null, CHAR_TEXTURE_MAX), null);
});
