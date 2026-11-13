// The peers' sprite art is decoded where my own body's is: in the decode workers (systems/vanillaEnhanced/
// vanillaEnhancedPack.js decodeServedPng), this thread's decode only where the page has no worker. Driven over the
// peers' art store (net/peer/peerRiders.js createEotbArt) with its own default decode, a fake worker and a counted fetch;
// a worn-armour sprite through that decode (decodeUrl) with the vendored strips served by their own URLs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEotbArt, decodeUrl } from '../../../src/net/peer/peerRiders.js';
import { worldOrderColors, worldOrderLayered } from '../../../src/player/eyeOfTheBeholder/eotbSprite.js';
import { decodeLayered } from '../../../src/player/eyeOfTheBeholder/layeredArmor.js';
import { _setVePackIoForTests } from '../../../src/systems/vanillaEnhanced/vanillaEnhancedPack.js';

const settle = () => new Promise((r) => setTimeout(r, 10));
/** A class sprite of the mod's own set, as spriteFor answers one. */
const SPRITE = Object.freeze({ archive: 112364, record: 0, frame: 0, mirror: false, key: '112364_0-0', rec: '0-0', view: 0 });
const URL_OF = 'http://peers.test/art/112364_0-0.png';
/** The picture a decode answers: 2 x 2, top row first, every byte its own. */
const RGBA = () => ({ width: 2, height: 2, data: Uint8Array.from({ length: 16 }, (_, i) => i * 13 + 7) });
const store = (uploads) => createEotbArt({ renderer: { uploadTexture: (archive, rec, img) => uploads.push({ archive, rec, img }) }, urlFor: () => URL_OF });

test('a peer\'s sprite is decoded in a decode worker - one ask, nothing fetched on this thread - and uploaded as this thread\'s decode of the same picture would be', async () => {
  const asked = [];
  const worker = () => {
    const w = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(m) { asked.push(m); setTimeout(() => w.onmessage({ data: { id: m.id, ...RGBA() } }), 0); },
    };
    return w;
  };
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }; };
  _setVePackIoForTests({ worker });
  try {
    const uploads = [];
    const art = store(uploads);
    assert.equal(art.ensure(SPRITE), null, 'asked: loading');
    await settle();
    assert.deepEqual(asked.map((m) => [m.url, m.maxSize]), [[URL_OF, Infinity]], 'one ask of the worker, the picture whole');
    assert.equal(fetched, 0, 'no fetch on this thread');
    assert.equal(uploads.length, 1, 'uploaded once');
    const want = worldOrderColors(RGBA(), { owned: true });
    assert.deepEqual([uploads[0].archive, uploads[0].rec, uploads[0].img.width, uploads[0].img.height], [112364, '0-0', 2, 2]);
    assert.deepEqual([...uploads[0].img.colors], [...want.colors], 'the same pixels');
    assert.deepEqual(art.ensure(SPRITE)?.w, 2, 'up: its size answered');
  } finally {
    globalThis.fetch = realFetch;
    _setVePackIoForTests();
  }
});

test('with no worker, a peer\'s sprite is fetched and decoded on this thread by the same decoder: the same pixels as that decoder\'s picture turned to the world\'s rows', async () => {
  const fetched = [];
  const decoded = [];
  const bytes = Uint8Array.from([9, 8, 7, 6]);
  _setVePackIoForTests({ fetch: async (u) => { fetched.push(u); return bytes; }, decode: async (b) => { decoded.push(b); return RGBA(); } });
  try {
    const uploads = [];
    const art = store(uploads);
    art.ensure(SPRITE);
    await settle();
    assert.deepEqual(fetched, [URL_OF], 'fetched by its url');
    assert.deepEqual(decoded, [bytes], 'decoded from the fetched bytes');
    assert.deepEqual([...uploads[0].img.colors], [...worldOrderColors(RGBA(), { owned: true }).colors], 'the same pixels');
  } finally {
    _setVePackIoForTests();
  }
});

/** A worn-armour sprite with a cloak and its hood fix, its strips served under STRIPS_AT from vendor/layered-armor. */
const LAYERED = 'LA:male:chain_chain_leather:2-3:ccl~5';
const STRIPS_AT = 'http://peers.test/la/';
const STRIPS = { urlOf: (k) => `${STRIPS_AT}${k}.png`, cloakUrlOf: (k) => `${STRIPS_AT}cloak/${k}.png`, hoodFixUrlOf: (k) => `${STRIPS_AT}hoodfix/${k}.png` };
const vendored = (url) => readFileSync(fileURLToPath(new URL(`../../../vendor/layered-armor/${url.slice(STRIPS_AT.length)}`, import.meta.url)));
const bytesOf = (colors) => Buffer.from(colors.buffer, colors.byteOffset, colors.byteLength);

test('a worn-armour sprite\'s strips are decoded in a decode worker - one ask a strip, nothing fetched on this thread - and composed as this thread\'s decode of the same strips is (mutant: the strips decoded on this thread)', async (t) => {
  const { PNG } = await import('pngjs').catch(() => ({ PNG: null }));
  if (!PNG) { t.skip('pngjs not installed'); return; }
  const read = async (bytes) => PNG.sync.read(Buffer.from(bytes));
  const asked = [];
  const worker = () => {
    const w = {
      onmessage: null, onerror: null, terminate() {},
      postMessage(m) {
        asked.push([m.url, m.maxSize]);
        const img = PNG.sync.read(vendored(m.url));
        setTimeout(() => w.onmessage({ data: { id: m.id, width: img.width, height: img.height, data: new Uint8Array(img.data) } }), 0);
      },
    };
    return w;
  };
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; return { ok: false, status: 599 }; };
  _setVePackIoForTests({ worker });
  try {
    const got = await decodeUrl(LAYERED, STRIPS).catch((e) => e);
    assert.deepEqual(asked, [
      [`${STRIPS_AT}male/chain_chain_leather/2-3.png`, Infinity],
      [`${STRIPS_AT}cloak/male/2-3.png`, Infinity],
      [`${STRIPS_AT}hoodfix/male/chain_chain_leather/2-3.png`, Infinity],
    ], 'the strip, the cloak and the hood fix, each asked of a worker whole');
    assert.equal(fetched, 0, 'nothing fetched on this thread');
    assert.ok(!(got instanceof Error), `composed: ${got}`);
    const here = worldOrderLayered(await decodeLayered(LAYERED, read, { ...STRIPS, fetchUrl: async (u) => ({ ok: true, arrayBuffer: async () => vendored(u) }) }));
    assert.ok(here.width > 0 && here.height > 0, 'the fixture is real: this thread composes a picture');
    assert.deepEqual([got.width, got.height, got.held, got.shield, got.provisional], [here.width, here.height, here.held, here.shield, here.provisional]);
    assert.equal(Buffer.compare(bytesOf(got.colors), bytesOf(here.colors)), 0, 'the same pixels');
  } finally {
    globalThis.fetch = realFetch;
    _setVePackIoForTests();
  }
});
