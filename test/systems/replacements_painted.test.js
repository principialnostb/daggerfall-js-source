// The pictures the port paints in code, replaceable as any picture is: listed on the World tab with a preview painted
// when asked, held to their size on Import, and put up by the renderer in a painted one's place, with a glow taken from
// the player's own pixels wherever the painted one glowed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PAINTED_SETS, paintedPicture, glowFrom, forgetPaintedPictures } from '../../src/systems/replacements/paintedArt.js';
import { replacementItems, itemPictures, itemOriginal } from '../../src/systems/replacements/replacementCatalog.js';
import { originalSizes } from '../../src/systems/replacements/replacementImport.js';
import { setPlayerReplacements } from '../../src/systems/textureReplacement.js';
import { STAR_ARCHIVE } from '../../src/world/starfall/starArt.js';
import { FISSURE_ARCHIVE } from '../../src/world/fissureArt.js';
import { GUILD_ART_ARCHIVE } from '../../src/world/guildFurnitureArt.js';
import { SD_REALM_ARCHIVE } from '../../src/world/superDungeon/sdRealm.js';
import { SD_REMNANT_ARCHIVE } from '../../src/world/superDungeon/sdRemnantArt.js';
import { GATE_ARCHIVE } from '../../src/world/gate/gateModel.js';
import { COURT_ARCHIVE } from '../../src/world/gate/gateArena.js';
import { EG_BAND_ARCHIVES } from '../../src/world/eliteGates/pseudoArchives.js';
import { KT_ARCHIVE } from '../../src/world/ketch/ketchArt.js';
import { FIGUREHEAD_ARCHIVE } from '../../src/world/ships/figureheadArt.js';
import { BLOOD_ATLAS_ARCHIVE } from '../../src/combat/blood/bloodArt.js';
import { GHOSTFENCE_ARCHIVE } from '../../src/world/tamriel/ghostfenceModel.js';
import { encodePng } from '../../src/poi/poiThumb.js';
import { readPng } from '../../tools/pngIO.mjs';

const ARENA2 = process.env.ARENA2_PATH;
const NO_DATA = !ARENA2 || !existsSync(ARENA2) ? 'no ARENA2 (ARENA2_PATH)' : false;
if (!NO_DATA) {
  // the game's files as the browser fetches them, from the player's ARENA2
  globalThis.fetch = async (url) => {
    const path = join(ARENA2, String(url).replace('./arena2/', ''));
    if (!existsSync(path)) return { ok: false, status: 404 };
    const bytes = readFileSync(path);
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
}
const landed = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 5));
};
/** A picture of one colour, as a painter or a PNG decode hands it. */
const solid = (width, height, rgba) => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
  return { width, height, colors: data, data };
};

test('replacements painted: each set is the archive its hosts upload it under', () => {
  const byId = Object.fromEntries(PAINTED_SETS.map((set) => [set.id, set.archive]));
  assert.deepEqual(byId, {
    starfall: STAR_ARCHIVE,
    fissures: FISSURE_ARCHIVE,
    guild: GUILD_ART_ARCHIVE,
    abyss: SD_REALM_ARCHIVE,
    remnants: SD_REMNANT_ARCHIVE,
    gate: GATE_ARCHIVE,
    court: COURT_ARCHIVE,
    'band-0': EG_BAND_ARCHIVES[0],
    'band-1': EG_BAND_ARCHIVES[1],
    'band-2': EG_BAND_ARCHIVES[2],
    'band-3': EG_BAND_ARCHIVES[3],
    ketch: KT_ARCHIVE,
    figureheads: FIGUREHEAD_ARCHIVE,
    blood: BLOOD_ATLAS_ARCHIVE,
    ghostfence: GHOSTFENCE_ARCHIVE,
  });
});

test('replacements painted: a preview is painted when asked, top-down, and a record named in words is kept by its number', async () => {
  forgetPaintedPictures();
  const star = await paintedPicture(STAR_ARCHIVE, 2);
  assert.deepEqual([star.width, star.height, star.data.length], [64, 64, 64 * 64 * 4]);
  const atlas = await paintedPicture(BLOOD_ATLAS_ARCHIVE, 0);
  assert.deepEqual([atlas.width, atlas.height], [1024, 640], 'the blood atlas, kept as record 0');
  assert.equal(await paintedPicture(STAR_ARCHIVE, 99), null, 'a record no painter paints');
  assert.equal(await paintedPicture(12345, 0), null, 'an archive no set is');
});

test('replacements painted: the glow is the player\'s own pixels where the painted map is lit, at the player\'s size', () => {
  const own = { width: 4, height: 2, colors: Uint8ClampedArray.from({ length: 32 }, (_, i) => (i % 4 === 3 ? 255 : 10 + i)) };
  const emission = { width: 2, height: 1, colors: Uint8ClampedArray.from([0, 0, 0, 255, 90, 200, 255, 255]) };
  const glow = glowFrom(own, emission);
  assert.deepEqual([glow.width, glow.height], [4, 2]);
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 4; x++) {
      const i = (y * 4 + x) * 4;
      const expected = x >= 2 ? [...own.colors.slice(i, i + 4)] : [0, 0, 0, 0];
      assert.deepEqual([...glow.colors.slice(i, i + 4)], expected, `texel ${x},${y}: lit on the right half only`);
    }
});

function uploadRenderer(Renderer) {
  let made = 0;
  const uploads = [];
  const gl = new Proxy({}, {
    get: (_, k) => (k === 'createTexture' ? () => ({ id: ++made })
      : k === 'texImage2D' ? (...args) => uploads.push([args[3], args[4]])
        : typeof k === 'string' && /^[A-Z_0-9]+$/.test(k) ? 1 : () => {}),
  });
  const renderer = Object.create(Renderer.prototype);
  Object.assign(renderer, { gl, textures: new Map(), emissionTextures: new Map(), emissionWhite: new Set(), _texKeysByBase: new Map(), _texBaseOf: new Map(), _replacements: new Set(), _placeholders: new Set(), _texGen: 0, _retroMips: false });
  return { renderer, uploads };
}

test('replacements painted: the renderer puts the player\'s picture up in a painted one\'s place, and its glow - landing late when not yet decoded', async (t) => {
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
  });
  const { Renderer } = await import('../../src/render/renderer.js');
  await import('../../src/systems/replacements/replacementStore.js'); // the boot's import that puts the door up
  const blue = encodePng(solid(128, 128, [0, 0, 200, 255]));
  setPlayerReplacements([
    { archive: STAR_ARCHIVE, record: 2, frame: 0, stamp: 1, load: async () => blue },
    { archive: 4321, record: 0, frame: 0, stamp: 1, load: async () => blue },
  ]);
  const painted = solid(64, 64, [200, 0, 0, 255]);
  const glow = solid(64, 64, [0, 0, 0, 255]);
  glow.colors.set([255, 255, 255, 255], (10 * 64 + 10) * 4);

  const first = uploadRenderer(Renderer);
  first.renderer.uploadTexture(STAR_ARCHIVE, 2, painted);
  first.renderer.uploadEmissionTexture(STAR_ARCHIVE, 2, glow, { white: true });
  assert.deepEqual(first.uploads, [[64, 64], [64, 64]], 'not decoded yet: the painted picture and its glow go up');
  await landed();
  assert.deepEqual(first.uploads.slice(2), [[128, 128], [128, 128]], 'then the player\'s, and a glow at its size, in their place');

  const again = uploadRenderer(Renderer);
  again.renderer.uploadTexture(STAR_ARCHIVE, 2, painted);
  again.renderer.uploadTexture(STAR_ARCHIVE, 3, painted);
  again.renderer.uploadTexture(4321, 0, painted);
  assert.deepEqual(again.uploads, [[128, 128], [64, 64], [64, 64]], 'decoded: at once; a record not replaced and an archive no set is go up as painted');
});

test('replacements painted: the World tab lists every painted set and the studio\'s, a preview painted for each, and Import holds a picture to its size', { skip: NO_DATA }, async () => {
  const world = await replacementItems('world');
  const made = world.filter((item) => item.painted || item.studio);
  assert.deepEqual(made.filter((item) => item.painted).map((item) => item.painted.id), PAINTED_SETS.map((set) => set.id));
  assert.deepEqual(made.filter((item) => item.studio).map((item) => item.studio.id), ['wagons', 'galleon', 'carrack', 'largeboat', 'hangings', 'yards', 'port', 'lefay']);
  const archives = world.map((item) => item.sources[0]?.archive);
  assert.equal(new Set(archives).size, archives.length, 'no archive listed twice');
  for (const item of made) {
    const pictures = await itemPictures(item);
    assert.ok(pictures.length > 0, item.id);
    const original = await itemOriginal(item, pictures[0]);
    assert.equal(original.classic, null, `${item.id}: no game data under it`);
    assert.ok(original.overhaul?.width > 0, `${item.id}: painted for the pane`);
  }
  assert.deepEqual(await originalSizes({ kind: 'texture', archive: STAR_ARCHIVE, record: 2, frame: 0 }), [{ width: 64, height: 64 }]);
  assert.deepEqual(await originalSizes({ kind: 'texture', archive: 38181, record: 0, frame: 0 }), [{ width: 64, height: 64 }], 'a studio slot too');
  assert.deepEqual(await originalSizes({ kind: 'texture', archive: STAR_ARCHIVE, record: 99, frame: 0 }), [], 'a record nothing paints');
});
