'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');
const { createBrotliDecompress } = require('node:zlib');
const { isSafeGamePath } = require('./gameChannel.cjs');

const MAX_PACK = 2 * 1024 ** 3 - 1;
const MAX_INDEX = 8 * 1024 ** 2;
const ASSET_NAME = 'DFO-13.11-EMC.pack';
const deny = { 'Cache-Control': 'no-store' };
const paperdollFiles = ['dfmod', 'index.json'].map((ext) => 'Mods/Paperdoll/Paperdoll Enhanced/paperdoll-enhanced.' + ext);
const hasPaperdoll = (files) => paperdollFiles.every((name) => files.some((file) => file.path === name));
const allowedPath = (value) => isSafeGamePath(value) && /^Mods\/[^/]+\/[^/]+\/.+/i.test(value)
  && (/\.(?:kf|nif|dds|tga|esp)$/i.test(value) || paperdollFiles.includes(value));

function readPack(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const length = fs.fstatSync(fd).size;
    const header = Buffer.alloc(4);
    if (fs.readSync(fd, header, 0, 4, 0) !== 4) throw new Error('Invalid EMC header');
    const size = header.readUInt32LE();
    if (!size || size > MAX_INDEX || size + 4 >= length || length > MAX_PACK) throw new Error('Invalid EMC archive size');
    const bytes = Buffer.alloc(size);
    if (fs.readSync(fd, bytes, 0, size, 4) !== size) throw new Error('Incomplete EMC index');
    const files = JSON.parse(bytes);
    if (!Array.isArray(files) || !files.length || files.length > 100000) throw new Error('Invalid EMC index');
    const names = new Set();
    let offset = 4 + size;
    for (const entry of files) {
      if (!allowedPath(entry?.path) || names.has(entry.path.toLowerCase()) || !Number.isSafeInteger(entry.size)
        || entry.size <= 0 || (entry.stored !== undefined && (!Number.isSafeInteger(entry.stored) || entry.stored <= 0 || entry.stored >= entry.size))
        || offset + (entry.stored ?? entry.size) > length) throw new Error('Invalid EMC file');
      names.add(entry.path.toLowerCase());
      entry.offset = offset;
      offset += entry.stored ?? entry.size;
    }
    if (offset !== length) throw new Error('Unexpected data in the EMC archive');
    return files;
  } finally { fs.closeSync(fd); }
}

function temporaryUrl(value) {
  const url = new URL(value);
  if (url.origin !== 'https://release-assets.githubusercontent.com' || url.username || url.password
    || url.hash || !url.searchParams.has('sig')) throw new Error('Expected a temporary GitHub asset link');
  return url.href;
}

function offerOf(text) {
  const offer = JSON.parse(text);
  if (!/^[a-f0-9]{64}$/.test(offer?.sha256) || !Number.isSafeInteger(offer.size)
    || offer.size <= 0 || offer.size > MAX_PACK) throw new Error('Invalid EMC download offer');
  return { ...offer, url: temporaryUrl(offer.url) };
}

function emcStore(root, net) {
  const file = path.join(root, 'emc.pack');
  let files;
  let installing = false;
  function install(text) {
    const offer = offerOf(text);
    return installFrom(offer, () => net.fetch(offer.url, { redirect: 'error', cache: 'no-store' }));
  }
  async function installFrom(offer, openDownload) {
    if (installing) throw new Error('An EMC download is in progress');
    installing = true;
    const temp = file + '.download';
    try {
      fs.mkdirSync(root, { recursive: true });
      const response = await openDownload();
      if (!response.ok || !response.body) throw new Error('EMC link expired or unavailable');
      let size = 0;
      const hash = createHash('sha256');
      const check = new Transform({ transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > offer.size) return callback(new Error('EMC download is too large'));
        hash.update(chunk);
        callback(null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), check, fs.createWriteStream(temp, { flags: 'w' }));
      if (size !== offer.size || hash.digest('hex') !== offer.sha256) throw new Error('EMC checksum failed');
      const next = readPack(temp);
      if (!hasPaperdoll(next)) throw new Error('This EMC package is outdated. Ask for a new temporary link.');
      fs.renameSync(temp, file);
      files = next;
      return { files: next.length };
    } finally {
      installing = false;
      fs.rmSync(temp, { force: true });
    }
  }

  function serve(parts) {
    if (!fs.existsSync(file)) files = undefined;
    files ??= fs.existsSync(file) ? readPack(file) : [];
    if (parts.length === 1) return Response.json(files.map((entry) => entry.path), { headers: deny });
    const id = parts[1];
    const entry = parts.length === 2 && /^\d{1,6}$/.test(id) ? files[Number(id)] : null;
    if (!entry) return new Response(null, { status: 404, headers: deny });
    const stream = fs.createReadStream(file, { start: entry.offset, end: entry.offset + (entry.stored ?? entry.size) - 1 });
    return new Response(Readable.toWeb(entry.stored ? stream.pipe(createBrotliDecompress()) : stream), { headers: { ...deny, 'Content-Type': 'application/octet-stream' } });
  }

  return {
    install, installFrom, serve,
    ready() {
      try { return fs.existsSync(file) && hasPaperdoll(files ??= readPack(file)); }
      catch { return false; }
    },
  };
}

module.exports = { ASSET_NAME, MAX_PACK, MAX_INDEX, allowedPath, readPack, temporaryUrl, offerOf, emcStore, hasPaperdoll, paperdollFiles };
