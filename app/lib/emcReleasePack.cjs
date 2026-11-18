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
const FACE_ASSET_NAME = 'DFO-13.11-EMC-faces.pack';
const FACE_ROOT = "Mods/Textures/Westly's Faces Refurbished/Data Files/";
const isFaceResource = (name) => name.toLowerCase().startsWith(FACE_ROOT.toLowerCase()) && /\.(?:nif|dds|tga)$/i.test(name);
const hasFaces = (files) => files.every((file) => isFaceResource(file.path))
  && files.some((file) => /\.nif$/i.test(file.path)) && files.some((file) => /\.(dds|tga)$/i.test(file.path));
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
  return downloadOffer(JSON.parse(text));
}

function downloadOffer(offer) {
  if (!/^[a-f0-9]{64}$/.test(offer?.sha256) || !Number.isSafeInteger(offer.size)
    || offer.size <= 0 || offer.size > MAX_PACK) throw new Error('Invalid EMC download offer');
  return { ...offer, url: temporaryUrl(offer.url) };
}

function emcStore(root, net, { requireFaces = false } = {}) {
  const locations = {
    base: { path: path.join(root, 'emc.pack'), check: hasPaperdoll },
    faces: { path: path.join(root, 'faces.pack'), check: hasFaces },
  };
  const partFiles = new Map();
  const none = [];
  let mounted;
  let installing = false;

  function inspect(part) {
    const location = locations[part];
    if (!fs.existsSync(location.path)) { partFiles.delete(part); return none; }
    if (!partFiles.has(part)) {
      const files = readPack(location.path);
      partFiles.set(part, location.check(files) ? files : none);
    }
    return partFiles.get(part);
  }

  function readyPart(part) {
    try { return inspect(part).length > 0; }
    catch { return false; }
  }

  async function install(text) {
    const data = JSON.parse(text);
    if (!data?.base && !data?.faces) {
      if (requireFaces) throw new Error('A complete EMC offer is required');
      const offer = downloadOffer(data);
      return installFrom(offer, () => openUrl(offer.url));
    }
    // Validate the complete offer before installing either component.
    const parts = Object.entries({ base: data.base, faces: data.faces })
      .filter(([, offer]) => offer !== undefined)
      .map(([part, offer]) => [part, downloadOffer(offer)]);
    let files = 0;
    for (const [part, offer] of parts) {
      if (readyPart(part)) continue;
      const result = await installFrom(offer, () => openUrl(offer.url), part);
      files += result.files;
    }
    if (!readyPart('base') || (requireFaces && !readyPart('faces'))) throw new Error('A complete EMC offer is required');
    return { files };
  }

  const openUrl = (url) => net.fetch(url, { redirect: 'error', cache: 'no-store' });

  async function installFrom(offer, openDownload, part = 'base') {
    const location = locations[part];
    if (!location) throw new Error('Unknown EMC component');
    if (installing) throw new Error('An EMC download is in progress');
    installing = true;
    const temp = location.path + '.download';
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
      if (!location.check(next)) throw new Error('This EMC package is incomplete. Ask for a new temporary link.');
      fs.renameSync(temp, location.path);
      partFiles.set(part, next);
      return { files: next.length };
    } finally {
      installing = false;
      fs.rmSync(temp, { force: true });
    }
  }

  function serve(parts) {
    const base = inspect('base');
    const faces = inspect('faces');
    if (mounted?.base !== base || mounted?.faces !== faces) {
      const sources = new Map();
      for (const [part, files] of [['base', base], ['faces', faces]]) {
        const file = locations[part].path;
        for (const entry of files) sources.set(entry.path.toLowerCase(), { entry, file });
      }
      mounted = { base, faces, entries: [...sources.values()] };
    }
    const { entries } = mounted;
    if (parts.length === 1) return Response.json(entries.map(({ entry }) => entry.path), { headers: deny });
    const id = parts[1];
    const row = parts.length === 2 && /^\d{1,6}$/.test(id) ? entries[Number(id)] : null;
    if (!row) return new Response(null, { status: 404, headers: deny });
    const { entry, file } = row;
    const stream = fs.createReadStream(file, { start: entry.offset, end: entry.offset + (entry.stored ?? entry.size) - 1 });
    return new Response(Readable.toWeb(entry.stored ? stream.pipe(createBrotliDecompress()) : stream), { headers: { ...deny, 'Content-Type': 'application/octet-stream' } });
  }

  return {
    install, installFrom, serve, readyPart,
    ready: () => readyPart('base') && (!requireFaces || readyPart('faces')),
  };
}

module.exports = { ASSET_NAME, FACE_ASSET_NAME, MAX_PACK, MAX_INDEX, allowedPath, readPack, temporaryUrl, offerOf, emcStore, hasPaperdoll, hasFaces, isFaceResource, paperdollFiles };
