import { createHash } from 'node:crypto';
import { brotliCompressSync, constants } from 'node:zlib';
import { createReadStream, createWriteStream, closeSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, resolve } from 'node:path';
import pack from '../app/lib/emcReleasePack.cjs';
import { packForPath } from '../src/systems/enhancedModCatalog.js';

const { ASSET_NAME, MAX_PACK, MAX_INDEX, allowedPath, hasPaperdoll, paperdollFiles } = pack;
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node tools/prepareEmcOffer.mjs <approved-resource-root> <output-folder>');
const root = resolve(source);
const names = [];
function scan(parent) {
  for (const entry of readdirSync(join(root, parent), { withFileTypes: true })) {
    const file = parent + '/' + entry.name;
    if (entry.isDirectory()) scan(file);
    if (entry.isFile() && allowedPath(file) && (paperdollFiles.includes(file) || packForPath('/' + file))) names.push(file);
  }
}
scan('Mods');
if (!hasPaperdoll(names.map((path) => ({ path })))) throw new Error('Paperdoll Enhanced bundle and index are required');
names.sort((a, b) => a.localeCompare(b));
if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) throw new Error('Duplicate EMC paths');
const output = join(resolve(destination), ASSET_NAME);
const temp = output + '.body';
const files = [];
let size = 0;
const fd = openSync(temp, 'wx');
try {
  try {
    for (const name of names) {
      const original = readFileSync(join(root, name));
      if (!original.length) continue;
      const compressed = brotliCompressSync(original, { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
      const useCompressed = compressed.length < original.length;
      const data = useCompressed ? compressed : original;
      size += data.length;
      if (size >= MAX_PACK) throw new Error('Select a smaller approved EMC package to fit the GitHub asset limit');
      files.push({ path: name, size: original.length, ...(useCompressed ? { stored: data.length } : {}) });
      writeFileSync(fd, data);
    }
  } finally { closeSync(fd); }
  const index = Buffer.from(JSON.stringify(files));
  if (!files.length || index.length > MAX_INDEX || size + index.length + 4 > MAX_PACK) throw new Error('Invalid EMC package size');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(index.length);
  const hash = createHash('sha256');
  async function* chunks() {
    yield length;
    yield index;
    yield* createReadStream(temp);
  }
  await pipeline(Readable.from(chunks()).map((chunk) => { hash.update(chunk); return chunk; }), createWriteStream(output, { flags: 'wx' }));
  pack.readPack(output);
  console.log(JSON.stringify({ output, files: files.length, size: size + index.length + 4, sha256: hash.digest('hex') }));
} finally {
  rmSync(temp, { force: true });
}
