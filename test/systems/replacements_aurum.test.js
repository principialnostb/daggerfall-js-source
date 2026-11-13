// Anything bought with Aurum cannot be replaced. The shop's wares are drawn in code; the one meeting place is a mount
// look, which dyes the horse's own pictures - so a horse that wears one is always the game's own, never the player's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { replacementItems, itemNotes } from '../../src/systems/replacements/replacementCatalog.js';
import { setPlayerPictures } from '../../src/systems/replacements/playerPictures.js';
import { loadRidingArt } from '../../src/systems/riding.js';
import { TRANSPORT_MODES } from '../../src/systems/transport.js';
import { wearsMountLook, withMountLook, horseLookCode } from '../../src/systems/horse/horseCoats.js';
import { MOUNT_LOOKS } from '../../src/net/effectLaw.js';
import { DFPalette } from '../../src/formats/dfPalette.js';

const ARENA2 = process.env.ARENA2_PATH;
const NO_DATA = !ARENA2 || !existsSync(ARENA2) ? 'no ARENA2 (ARENA2_PATH)' : false;
const gameBytes = (name) => new Uint8Array(readFileSync(join(ARENA2, name)));
if (!NO_DATA) {
  // the game's files as the browser fetches them, from the player's ARENA2
  globalThis.fetch = async (url) => {
    const path = join(ARENA2, String(url).split('/').pop());
    if (!existsSync(path)) return { ok: false, status: 404 };
    const bytes = readFileSync(path);
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('replacements aurum: a mount look is bought with Aurum, and its horse is the game\'s own in first person', { skip: NO_DATA }, async () => {
  const plain = horseLookCode({ coat: 2, pattern: 1, legs: 0, seed: 7 });
  const paid = withMountLook(plain, MOUNT_LOOKS[0]);
  assert.equal(wearsMountLook(plain), false);
  assert.equal(wearsMountLook(paid), true);
  assert.equal(wearsMountLook('spectral'), false, 'a code or nothing');
  const palette = new DFPalette();
  palette.load(gameBytes('ART_PAL.COL'), 'ART_PAL.COL');
  const renderer = { uploadTexture: (kind, key) => key };
  let asked = 0;
  const frame = { name: 'MRED00I0.CFA_0-1', stamp: 3, load: async () => { asked++; return new Uint8Array([3]); } };
  const keysOf = async (look) => (await loadRidingArt(async (name) => gameBytes(name), palette, renderer, TRANSPORT_MODES.Horse, look)).records;
  try {
    setPlayerPictures([frame]);
    await keysOf(plain);
    assert.equal(asked, 1, 'a plain horse: the player\'s frame is asked for');
    asked = 0;
    const keys = await keysOf(paid);
    assert.equal(asked, 0, 'a mount look: never');
    assert.ok(keys.every((key) => !key.includes('#over')), 'the game\'s frames, dyed with the look');
  } finally {
    setPlayerPictures([]);
  }
});

test('replacements aurum: on horseback a mount look is dyed over the game\'s rider sprite, a plain horse over the player\'s', async () => {
  const { createEotbBody } = await import('../../src/player/eyeOfTheBeholder/eotbBody.js');
  const asked = [];
  const body = createEotbBody({
    count: () => 3035,
    urlFor: (key) => `/art/${key}.png`,
    decode: async (url, options) => {
      asked.push(options?.own ?? true);
      return { width: 4, height: 6, colors: new Uint32Array(24) };
    },
  });
  body.attach({ uploadTexture() {}, createBillboardBatch(archive, rec, size) { return { archive, rec, size, origin: [0, 0, 0] }; }, destroyBillboardBatch() {}, drawBillboards() {} }, () => ({}));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const ride = async (horseLook) => {
    for (let frame = 0; frame < 80; frame++) {
      body.tick(1 / 60, { horseLook });
      await tick();
    }
  };
  // a horse's sprites are decoded once and dyed for each look: a plain look reads the decode the body made at first
  const plain = horseLookCode({ coat: 3, pattern: 0, legs: 1, seed: 11 });
  await ride(plain);
  assert.ok(asked.length > 0 && asked.every((ownAllowed) => ownAllowed === true), 'a plain horse: the player\'s picture where they have one');
  asked.length = 0;
  await ride(withMountLook(plain, MOUNT_LOOKS[1]));
  assert.ok(asked.length > 0, 'a mount look decodes its horse again');
  assert.deepEqual([...new Set(asked)], [false], 'from the game\'s own picture, always');
});

test('replacements aurum: the riding items say a mount look draws the game\'s horse', async () => {
  const player = await replacementItems('player');
  const riding = player.find((item) => item.id === 'riding');
  assert.ok((await itemNotes(riding)).includes('mountLook'));
  const horseback = player.find((item) => item.id.startsWith('horse-'));
  if (horseback) assert.ok((await itemNotes(horseback)).includes('mountLook'));
});
