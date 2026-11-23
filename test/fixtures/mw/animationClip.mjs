import assert from 'node:assert/strict';
import { openSync, closeSync, readSync, readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { readPack } from '../../../app/lib/emcReleasePack.cjs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';

export const overhaulClip = 'Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf';

export function installedClip(path) {
  const pack = process.env.DFO_TEST_EMC_PACK;
  if (!pack) return parseNif(readFileSync(new URL('../../../' + path, import.meta.url)));
  const entry = readPack(pack).find(row => row.path === path);
  assert.ok(entry, path);
  const fd = openSync(pack, 'r');
  try {
    const bytes = Buffer.alloc(entry.stored ?? entry.size);
    assert.equal(readSync(fd, bytes, 0, bytes.length, entry.offset), bytes.length);
    return parseNif(entry.stored ? brotliDecompressSync(bytes) : bytes);
  } finally { closeSync(fd); }
}
