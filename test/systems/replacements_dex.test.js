// Daggerfall Enemy Expansion on the Replacements pane: every picture the mod draws is listed with the enemies (the fifty
// new ones, and the two classic classes it redraws, named for the mod), and every one is replaceable - a frame the
// player replaced glows from the player's own picture where the mod lit it, never from the mod's map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { replacementItems } from '../../src/systems/replacements/replacementCatalog.js';
import { DEX_ART } from '../../src/systems/enemyExpansion/dexArt.js';
import { addVendorTextures, clearVendorTextures, setPlayerReplacements } from '../../src/systems/textureReplacement.js';
import { encodePng } from '../../src/poi/poiThumb.js';
import { readPng } from '../../tools/pngIO.mjs';

const ARENA2 = process.env.ARENA2_PATH;
const NO_DATA = !ARENA2 || !existsSync(ARENA2) ? 'no ARENA2 (ARENA2_PATH)' : false;
if (!NO_DATA) {
  // the game's files as the browser fetches them, from the player's ARENA2
  globalThis.fetch = async (url) => {
    const path = join(ARENA2, String(url).split('/').pop());
    if (!existsSync(path)) return { ok: false, status: 404 };
    const bytes = readFileSync(path);
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
}
const sourcesOf = (items) => new Set(items.flatMap((item) => item.sources.map((source) => source.archive)));

test('replacements dex: every archive the mod draws is listed - with the enemies, or the people where it is a walker\'s', { skip: NO_DATA }, async () => {
  const [enemies, npcs, world] = await Promise.all([replacementItems('enemies'), replacementItems('npcs'), replacementItems('world')]);
  const listed = new Set([...sourcesOf(enemies), ...sourcesOf(npcs)]);
  assert.deepEqual(Object.keys(DEX_ART).map(Number).filter((archive) => !listed.has(archive)), [], 'all 58');
  const worldArchives = sourcesOf(world);
  assert.deepEqual(Object.keys(DEX_ART).map(Number).filter((archive) => worldArchives.has(archive)), [], 'none left to the World tab');
});

test('replacements dex: the two classic classes the mod redraws stand beside the classic ones, named for the mod, each frame its own', { skip: NO_DATA }, async () => {
  const enemies = await replacementItems('enemies');
  const redrawn = enemies.filter((item) => item.id.startsWith('enemy-dex-'));
  assert.deepEqual(redrawn.map((item) => [item.id, item.sources.map((source) => source.archive)]).sort(), [['enemy-dex-140', [1519, 1520]], ['enemy-dex-143', [1507, 1508]]]);
  for (const item of redrawn) {
    const classic = enemies.find((other) => other.id === item.id.replace('enemy-dex-', 'enemy-'));
    assert.ok(classic, 'the classic one stands too');
    assert.equal(item.name, `${classic.name} (Daggerfall Enemy Expansion)`);
    const frames = item.sources.reduce((sum, { archive }) => sum + DEX_ART[archive].frames.reduce((a, b) => a + b, 0), 0);
    assert.equal(item.pictures.length, frames, 'every frame the mod draws');
  }
});

/** A PNG of one colour. */
const solid = (width, height, rgba) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return encodePng({ width, height, data });
};
function uploadRenderer(Renderer) {
  let made = 0;
  const gl = new Proxy({}, { get: (_, k) => (k === 'createTexture' ? () => ({ id: ++made }) : typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : () => {}) });
  const r = Object.create(Renderer.prototype);
  Object.assign(r, { gl, textures: new Map(), emissionTextures: new Map(), emissionWhite: new Set(), _texKeysByBase: new Map(), _texBaseOf: new Map(), _replacements: new Set(), _placeholders: new Set(), _texGen: 0, _retroMips: false });
  return r;
}

test('replacements dex: a frame the mod lights glows from the player\'s own picture once replaced, never from the mod\'s map', async (t) => {
  const was = { cib: globalThis.createImageBitmap, oc: globalThis.OffscreenCanvas };
  globalThis.createImageBitmap = async (blob) => ({ ...readPng(new Uint8Array(await blob.arrayBuffer())), close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { let bitmap = null; return { drawImage: (b) => { bitmap = b; }, getImageData: () => ({ width: bitmap.width, height: bitmap.height, data: new Uint8ClampedArray(bitmap.data) }) }; }
  };
  t.after(() => {
    globalThis.createImageBitmap = was.cib;
    globalThis.OffscreenCanvas = was.oc;
    setPlayerReplacements([]);
    clearVendorTextures();
  });
  const ARCHIVE = 9704;
  const RED = [200, 0, 0, 255];
  const GREEN = [0, 200, 0, 255];
  const BLUE = [0, 0, 200, 255];
  clearVendorTextures();
  addVendorTextures([
    { archive: ARCHIVE, record: 0, frame: 0, map: 'Albedo', standIn: true, load: async () => solid(4, 4, RED) },
    { archive: ARCHIVE, record: 0, frame: 0, map: 'Emission', standIn: true, load: async () => solid(4, 4, GREEN) },
    { archive: ARCHIVE, record: 0, frame: 1, map: 'Albedo', standIn: true, load: async () => solid(4, 4, RED) },
  ]);
  const { Renderer } = await import('../../src/render/renderer.js');
  const { createDataPipeline } = await import('../../src/scenes/dataPipeline.js');
  const renderer = uploadRenderer(Renderer);
  const lit = new Map();
  const upload = renderer.uploadEmissionTexture.bind(renderer);
  renderer.uploadEmissionTexture = (archive, key, picture, options) => {
    lit.set(`${archive}_${key}`, [...(picture.colors ?? picture.data).slice(0, 4)]);
    return upload(archive, key, picture, options);
  };
  const pipe = createDataPipeline({ renderer, arch: null, palette: null, fetch: async (name) => { throw new Error(`no ${name} here`); } });
  await pipe.getTexture(ARCHIVE);
  pipe.uploadRecordFrame(ARCHIVE, 0, 0);
  assert.deepEqual(lit.get(`${ARCHIVE}_0#0`), GREEN, 'the mod\'s frame: the mod\'s map');

  setPlayerReplacements([
    { archive: ARCHIVE, record: 0, frame: 0, stamp: 1, load: async () => solid(8, 8, BLUE) },
    { archive: ARCHIVE, record: 0, frame: 1, stamp: 1, load: async () => solid(8, 8, BLUE) },
  ]);
  lit.clear();
  renderer.textures.clear();
  renderer.emissionTextures.clear();
  await pipe.getTexture(ARCHIVE);
  pipe.uploadRecordFrame(ARCHIVE, 0, 0);
  pipe.uploadRecordFrame(ARCHIVE, 0, 1);
  assert.deepEqual(lit.get(`${ARCHIVE}_0#0`), BLUE, 'the player\'s frame glows from the player\'s picture');
  assert.equal(lit.has(`${ARCHIVE}_0#1`), false, 'a frame the mod never lit stays unlit');
});
