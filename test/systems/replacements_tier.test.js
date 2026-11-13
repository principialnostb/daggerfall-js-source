// The player's own replacements: the checks a chosen file passes, the store that keeps them, and their place at the
// top of the texture door, over every overhaul and pack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pngSize, acceptedSizes, replacementRefusal, followsOriginal, drawnSize, PNG_SIGNATURE, SHAPE_ALLOWANCE } from '../../src/systems/replacements/replacementRules.js';
import { fitWithin } from '../../src/formats/resample.js';
import { readFileSync } from 'node:fs';
import {
  memoryReplacementBackend, setReplacementBackend, saveReplacement, clearReplacement, listReplacements,
  replacementKey, onReplacementsChange,
} from '../../src/systems/replacements/replacementStore.js';
import {
  setPlayerReplacements, hasPlayerReplacement, playerRecordsOf, hasTextureReplacement, textureReplacementBytes,
  addVendorTextures, clearVendorTextures, picturesCoveredBelowPlayer, pictureBelowPlayer, preloadTextureArchive,
  decodedTexture, playerReplacementBox, vendorTextureStandIn,
} from '../../src/systems/textureReplacement.js';
import { setValue } from '../../src/systems/settings/settings.js';

/** The header of a PNG of `width` x `height`: its signature and the start of its IHDR chunk. */
function pngHeader(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set(PNG_SIGNATURE, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}
/** A decoder for the tests: a picture of the size the header states, every texel the first byte after it. */
const fakeDecode = async (bytes) => {
  const { width, height } = pngSize(new Uint8Array(bytes));
  return { width, height, data: new Uint8Array(width * height * 4).fill(bytes[29] ?? 0) };
};
const withMark = (bytes, mark) => {
  const copy = new Uint8Array(bytes);
  copy[29] = mark;
  return copy;
};

test('replacements: a PNG header states its size; anything else is not a PNG', () => {
  assert.deepEqual(pngSize(pngHeader(64, 32)), { width: 64, height: 32 });
  assert.equal(pngSize(new Uint8Array(40)), null, 'no signature');
  assert.equal(pngSize(pngHeader(64, 32).slice(0, 20)), null, 'too short for its header');
  const jpeg = new Uint8Array(40);
  jpeg.set([0xff, 0xd8, 0xff]);
  assert.equal(pngSize(jpeg), null);
});

test('replacements: the sizes a picture may have are the classic record\'s and the overhaul\'s it covers', () => {
  assert.deepEqual(acceptedSizes({ width: 64, height: 64 }), [{ width: 64, height: 64 }]);
  assert.deepEqual(acceptedSizes({ width: 64, height: 64 }, { width: 256, height: 256 }), [
    { width: 256, height: 256 },
    { width: 64, height: 64 },
  ]);
  assert.deepEqual(acceptedSizes({ width: 64, height: 64 }, { width: 64, height: 64 }), [{ width: 64, height: 64 }], 'one size once');
  assert.deepEqual(acceptedSizes(null, null), []);
});

test('replacements: a picture follows its original at its size, or bigger in its proportions, within the allowance or the rounding of one scale', () => {
  const rat = { width: 65, height: 67 };
  assert.equal(followsOriginal({ width: 65, height: 67 }, rat), true, 'the same size');
  assert.equal(followsOriginal({ width: 130, height: 134 }, rat), true, 'twice the size');
  assert.equal(followsOriginal({ width: 98, height: 101 }, rat), true, 'one and a half times, rounded (97.5 x 100.5)');
  assert.equal(followsOriginal({ width: 98, height: 103 }, rat), true, 'two pixels out of shape at that size: within 2%');
  assert.equal(followsOriginal({ width: 98, height: 106 }, rat), false, 'five pixels out: past it');
  assert.equal(SHAPE_ALLOWANCE, 0.02);
  const wide = { width: 152, height: 100 };
  assert.equal(followsOriginal({ width: 302, height: 200 }, wide), true, '1.51 to 1 for a picture of 1.52 to 1');
  assert.equal(followsOriginal({ width: 151, height: 100 }, wide), true, 'at its size too, a pixel short');
  assert.equal(followsOriginal({ width: 146, height: 100 }, wide), false, 'six pixels short is not');
  assert.equal(followsOriginal({ width: 130, height: 130 }, rat), false, 'square is another shape');
  assert.equal(followsOriginal({ width: 32, height: 33 }, rat), false, 'smaller, even in its shape');
  assert.equal(followsOriginal({ width: 65, height: 64 }, { width: 64, height: 64 }), true, 'a pixel off on a small square: within 2%');
  assert.equal(followsOriginal({ width: 66, height: 64 }, { width: 64, height: 64 }), false, 'two pixels off: past it');
  assert.equal(followsOriginal({ width: 17, height: 16 }, { width: 16, height: 16 }), false, 'a pixel off a 16-pixel icon is 6%');
  assert.equal(followsOriginal({ width: 106, height: 220 }, { width: 53, height: 110 }), true, 'a body sprite at twice its size');
  const veAndClassic = acceptedSizes({ width: 64, height: 64 }, { width: 256, height: 256 });
  assert.deepEqual(drawnSize({ width: 512, height: 512 }, veAndClassic), { width: 256, height: 256 }, 'drawn at the first original it follows, the overhaul\'s');
  assert.deepEqual(drawnSize({ width: 128, height: 128 }, veAndClassic), { width: 64, height: 64 }, 'too small for the overhaul\'s, it follows the classic one');
});

test('replacements: a file is refused when it is not a PNG, out of shape or smaller than its original - never for being big', () => {
  const accepted = [{ width: 64, height: 64 }];
  assert.equal(replacementRefusal(pngHeader(64, 64), accepted), null);
  assert.equal(replacementRefusal(pngHeader(256, 256), accepted), null, 'bigger in the same proportions');
  assert.deepEqual(replacementRefusal(new Uint8Array(40), accepted), { reason: 'notPng' });
  assert.deepEqual(replacementRefusal(pngHeader(300, 64), accepted), { reason: 'wrongSize', width: 300, height: 64, accepted }, 'another shape');
  assert.deepEqual(replacementRefusal(pngHeader(32, 32), accepted), { reason: 'wrongSize', width: 32, height: 32, accepted });
  assert.equal(replacementRefusal(pngHeader(8192, 8192), accepted), null, 'past what a device takes: the game shrinks it as it loads it');
  assert.equal(replacementRefusal(pngHeader(256, 256), acceptedSizes({ width: 64, height: 64 }, { width: 256, height: 256 })), null,
    'an overhaul\'s size is accepted over the picture it covers');
});

test('replacements: a picture past the device\'s texture limit is shrunk in its proportions as it loads, never refused', () => {
  const big = { width: 3080, height: 2042, colors: new Uint8ClampedArray(3080 * 2042 * 4).fill(90), box: { width: 65, height: 67 } };
  const fitted = fitWithin(big, 2048);
  assert.deepEqual([fitted.width, fitted.height], [2048, 1358], 'its longer side at the limit, its shape kept');
  assert.equal(fitted.colors.length, 2048 * 1358 * 4);
  assert.equal(fitted.colors[0], 90, 'its colours kept');
  assert.deepEqual(fitted.box, { width: 65, height: 67 }, 'and the box it is drawn into');
  const small = { width: 64, height: 64, colors: new Uint8ClampedArray(64 * 64 * 4) };
  assert.equal(fitWithin(small, 2048), small, 'a picture that fits is itself');
  const tall = fitWithin({ width: 10, height: 5000, data: new Uint8Array(10 * 5000 * 4) }, 4096);
  assert.deepEqual([tall.width, tall.height], [8, 4096], 'a decode\'s `data` too, the longer side either way');
});

test('replacements: every texture the renderer uploads is fitted to the device first', () => {
  const renderer = readFileSync(new URL('../../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /color32 = fitWithin\(color32, this\.textureLimit\(\)\);/);
  assert.match(renderer, /this\.gl\.getParameter\(this\.gl\.MAX_TEXTURE_SIZE\)/, 'the limit is the device\'s own');
});

test('replacements: the player\'s picture outranks the overhaul\'s, with Replace Game Artwork off, for every dye', async () => {
  setValue('Enhancements', 'AssetInjection', 'False');
  const overhaulBytes = withMark(pngHeader(4, 4), 7);
  const ownBytes = withMark(pngHeader(4, 4), 9);
  addVendorTextures([{ archive: 901, record: 2, load: async () => overhaulBytes, standIn: true }]);
  try {
    assert.equal(hasTextureReplacement(901, 2, 0), true, 'the overhaul answers');
    assert.deepEqual(picturesCoveredBelowPlayer().has('901_2-0'), true);
    setPlayerReplacements([{ archive: 901, record: 2, frame: 0, stamp: 1, load: async () => ownBytes }]);
    assert.equal(hasPlayerReplacement(901, 2, 0), true);
    assert.deepEqual(await textureReplacementBytes(901, 2, 0), ownBytes, 'the player\'s bytes are drawn');
    assert.deepEqual(await textureReplacementBytes(901, 2, 0, 'Albedo', 3), ownBytes, 'whatever dye the door asks with');
    assert.equal(hasTextureReplacement(901, 2, 0, 'Normal'), false, 'a map is not the plain picture');
    await preloadTextureArchive(901, { decode: fakeDecode });
    assert.equal(decodedTexture(901, 2, 0).colors[0], 9, 'the decoded picture is the player\'s');
    const below = await pictureBelowPlayer(901, 2, 0, { decode: fakeDecode });
    assert.equal(below.width, 4);
    assert.equal(below.data[0], 7, 'what the player covers is the overhaul\'s picture');
    setPlayerReplacements([]);
    assert.deepEqual(await textureReplacementBytes(901, 2, 0), overhaulBytes, 'cleared, the overhaul draws again');
    await preloadTextureArchive(901, { decode: fakeDecode });
    assert.equal(decodedTexture(901, 2, 0).colors[0], 7);
  } finally {
    setPlayerReplacements([]);
    clearVendorTextures();
  }
});

test('replacements: a record with no overhaul has nothing below the player, and the original draws when cleared', async () => {
  setPlayerReplacements([{ archive: 902, record: 0, frame: 1, stamp: 1, load: async () => pngHeader(2, 2) }]);
  try {
    assert.equal(hasTextureReplacement(902, 0, 1), true);
    assert.equal(hasTextureReplacement(902, 0, 0), false, 'another frame is its own picture');
    assert.equal(await pictureBelowPlayer(902, 0, 1, { decode: fakeDecode }), null);
    assert.equal(picturesCoveredBelowPlayer().has('902_0-1'), false, 'the player\'s own picture is not an overhaul\'s');
  } finally {
    setPlayerReplacements([]);
  }
  assert.equal(hasTextureReplacement(902, 0, 1), false);
});

test('replacements: a bigger picture keeps its detail and stands as big as the original it replaces', async () => {
  addVendorTextures([{ archive: 903, record: 0, load: async () => withMark(pngHeader(4, 6), 5), standIn: true }]);
  setPlayerReplacements([{ archive: 903, record: 0, frame: 0, stamp: 1, box: { width: 4, height: 6 }, load: async () => withMark(pngHeader(8, 12), 9) }]);
  try {
    assert.deepEqual(playerReplacementBox(903, 0, 0), { width: 4, height: 6 });
    await preloadTextureArchive(903, { decode: fakeDecode });
    const picture = decodedTexture(903, 0, 0);
    assert.equal(picture.width, 8, 'the detail is kept');
    assert.deepEqual(picture.box, { width: 4, height: 6 });
    assert.deepEqual(vendorTextureStandIn(903).getSize(0), { width: 4, height: 6 }, 'a mod-only archive measures it at the original size');
  } finally {
    setPlayerReplacements([]);
    clearVendorTextures();
  }
});

test('replacements: the ground lays the player\'s tiles over its set, by record', () => {
  setPlayerReplacements([
    { archive: 302, record: 9, frame: 0, stamp: 1, load: async () => pngHeader(64, 64) },
    { archive: 302, record: 3, frame: 0, stamp: 1, load: async () => pngHeader(64, 64) },
    { archive: 302, record: 4, frame: 1, stamp: 1, load: async () => pngHeader(64, 64) },
  ]);
  try {
    assert.deepEqual(playerRecordsOf(302), [3, 9], 'frame 0 of each record, in order');
  } finally {
    setPlayerReplacements([]);
  }
});

test('replacements: the store keeps a picture, registers it, tells its listeners, and forgets it on Clear', async () => {
  setReplacementBackend(memoryReplacementBackend());
  let heard = 0;
  const stop = onReplacementsChange(() => heard++);
  try {
    const blob = new Blob([pngHeader(8, 8)], { type: 'image/png' });
    const kept = await saveReplacement({ archive: 255, record: 1, frame: 2, width: 8, height: 8, fileName: 'rat.png', blob });
    assert.equal(kept.key, replacementKey(255, 1, 2));
    assert.equal(kept.key, '255_1-2');
    assert.equal((await listReplacements()).length, 1);
    assert.equal(hasPlayerReplacement(255, 1, 2), true, 'registered with the texture door');
    assert.deepEqual(new Uint8Array(await textureReplacementBytes(255, 1, 2)), pngHeader(8, 8));
    await clearReplacement(255, 1, 2);
    assert.equal((await listReplacements()).length, 0);
    assert.equal(hasPlayerReplacement(255, 1, 2), false);
    assert.equal(heard, 2);
  } finally {
    stop();
    setPlayerReplacements([]);
    setReplacementBackend(null);
  }
});
