// What a hostile file brought into the Replacements pane meets: a PNG walked chunk by chunk and rebuilt from the chunks
// that draw it, names held to a short list of characters and never used as paths, a zip refused before it is read
// past what memory can spare, and a CIF bounded before a byte of its pixels is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPng, isPlainName, safeFileName, MAX_FILE_BYTES, MAX_ZIP_BYTES, MAX_ZIP_FILES } from '../../src/systems/replacements/replacementSafety.js';
import { importReplacementZip, pictureNamedBy } from '../../src/systems/replacements/replacementImport.js';
import { cifRefusal, replacementRefusal } from '../../src/systems/replacements/replacementRules.js';
import { memoryReplacementBackend, setReplacementBackend, listReplacements, saveReplacements } from '../../src/systems/replacements/replacementStore.js';
import { setPlayerReplacements } from '../../src/systems/textureReplacement.js';
import { setPlayerPictures } from '../../src/systems/replacements/playerPictures.js';
import { readZipEntries } from '../../src/scenes/dataSource.js';
import { pngChunk, pngHeaderBody, pngOfChunks, testPng, storedZip, deflated, TEST_IDAT } from '../replacementFixtures.mjs';

const IHDR = (width = 4, height = 4, kind) => pngChunk('IHDR', pngHeaderBody(width, height, kind));
const IDAT = () => pngChunk('IDAT', TEST_IDAT);
const IEND = () => pngChunk('IEND');
const text = (words) => new TextEncoder().encode(words);
const join = (...parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

test('replacements safety: a whole PNG stands as it came; text, metadata, an animation and bytes after its end are dropped', () => {
  const plain = testPng(4, 4);
  assert.equal(cleanPng(plain), plain, 'nothing to drop: the same bytes');
  const loaded = join(
    pngOfChunks([IHDR(), pngChunk('tEXt', text('Comment\0<script>alert(1)</script>')), pngChunk('acTL', new Uint8Array(8)), pngChunk('zzZz', text('mine')), IDAT(), IEND()]),
    text('<html><script>steal()</script></html>'),
  );
  assert.deepEqual(cleanPng(loaded), plain, 'rebuilt from IHDR, IDAT and IEND alone');
  const drawn = pngOfChunks([IHDR(4, 4, { colour: 3, depth: 8 }), pngChunk('PLTE', new Uint8Array(6)), pngChunk('tRNS', new Uint8Array(2)), pngChunk('gAMA', new Uint8Array(4)), IDAT(), IEND()]);
  assert.equal(cleanPng(drawn), drawn, 'the palette, transparency and gamma draw the picture: kept');
});

test('replacements safety: a PNG that is not whole or not true is refused', () => {
  const bad = (bytes, why) => assert.equal(cleanPng(bytes), null, why);
  bad(text('<html><body>not a picture</body></html>'), 'markup');
  bad(new Uint8Array(0), 'nothing');
  bad(testPng(4, 4).slice(0, 40), 'cut short');
  bad(testPng(4, 4).subarray(0, 33), 'a header and nothing behind it');
  const flipped = testPng(4, 4);
  flipped[20] ^= 1;
  bad(flipped, 'a CRC that does not match');
  bad(pngOfChunks([IDAT(), IHDR(), IEND()]), 'IHDR not first');
  bad(pngOfChunks([IHDR(), IHDR(), IDAT(), IEND()]), 'two IHDRs');
  bad(pngOfChunks([IHDR(), IDAT()]), 'no IEND');
  bad(pngOfChunks([IHDR(), IEND()]), 'no IDAT');
  bad(pngOfChunks([IHDR(4, 4, { colour: 2, depth: 4 }), IDAT(), IEND()]), 'a depth its colour type does not allow');
  bad(pngOfChunks([IHDR(0, 4), IDAT(), IEND()]), 'no width');
  bad(pngOfChunks([IHDR(4, 4, { colour: 3 }), IDAT(), IEND()]), 'a palette picture with no palette');
  bad(pngOfChunks([IHDR(4, 4, { colour: 3 }), IDAT(), pngChunk('PLTE', new Uint8Array(6)), IEND()]), 'the palette after the pixels');
  bad(pngOfChunks([IHDR(), pngChunk('EVIL', new Uint8Array(4)), IDAT(), IEND()]), 'an unknown critical chunk');
  bad(pngOfChunks([IHDR(), pngChunk('1234', new Uint8Array(4)), IDAT(), IEND()]), 'a type that is not four letters');
  const long = testPng(4, 4);
  new DataView(long.buffer).setUint32(33, 0xfffffff0);
  bad(long, 'a chunk longer than the file');
});

test('replacements safety: a picture or CIF record too big to read is refused before it is decoded', () => {
  assert.deepEqual(replacementRefusal(testPng(16385, 16), []), { reason: 'tooBig', width: 16385, height: 16 }, 'a side past the largest texture');
  assert.deepEqual(replacementRefusal(testPng(16384, 16384), []), { reason: 'tooBig', width: 16384, height: 16384 }, 'past 512 MB once read');
  assert.equal(replacementRefusal(testPng(16384, 8192), []), null, 'the most a picture may be');
  const cif = (width, height) => {
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    view.setInt16(4, width, true);
    view.setInt16(6, height, true);
    return bytes;
  };
  const shape = { counts: [1], sizes: [{ width: 100, height: 100 }] };
  assert.deepEqual(cifRefusal(cif(20000, 20000), 'TEST.CIF', shape), { reason: 'tooBig', record: 0, width: 20000, height: 20000 });
  assert.equal(cifRefusal(cif(-200, -200), 'TEST.CIF', shape).reason, 'notCif', 'a size below 0');
  const empties = new Uint8Array(12 * 200);
  assert.equal(cifRefusal(empties, 'TEST.CIF', { counts: Array(200).fill(1), sizes: [] }).reason, 'notCif', 'more records than a CIF holds: the reader stops at 64');
});

test('replacements safety: a name is plain or names nothing; it is matched, never used as a path', () => {
  for (const name of ['255_0-0.png', 'LONGSWORD.CIF_0-0_Daedric.png', 'WEAPON04.CIF', 'held-map.png']) assert.equal(isPlainName(name), true, name);
  for (const name of ['', '.hidden.png', '255_0-0.png ', '<img src=x onerror=alert(1)>.png', '255_0-0.png\0.exe', 'ＷＥＡＰＯＮ04.CIF', `${'a'.repeat(97)}.png`, 'a b.png'])
    assert.equal(pictureNamedBy(`pack/${name}`), null, JSON.stringify(name));
  assert.equal(pictureNamedBy('__proto__.png'), null, 'no lookup reaches an object\'s prototype');
  assert.equal(pictureNamedBy('constructor.png'), null);
  assert.equal(pictureNamedBy('<b>.CIF'), null);
  assert.deepEqual(pictureNamedBy('../../../Windows/System32/255_0-0.png'), { kind: 'texture', archive: 255, record: 0, frame: 0, dye: null }, 'the folders are dropped, never followed');
  assert.equal(safeFileName('C:\\Users\\me\\<b onclick=x>.png'), '_b onclick_x_.png', 'the last part, markup broken');
  assert.equal(safeFileName('my sword (v2).png'), 'my sword (v2).png');
  assert.equal(safeFileName(`${'a'.repeat(200)}.png`).length, 96);
});

test('replacements safety: Import keeps a PNG rebuilt clean, counts a disguised one unreadable and a huge one too big, and stores a plain name', async () => {
  setReplacementBackend(memoryReplacementBackend());
  const sizesOf = async () => [{ width: 65, height: 67 }];
  try {
    const dirty = join(pngOfChunks([pngChunk('IHDR', pngHeaderBody(65, 67)), pngChunk('iTXt', text('x')), IDAT(), IEND()]), text('PK\u0003\u0004 a zip hidden behind'));
    const zip = storedZip([
      ['../../evil/255_0-0.png', dirty],
      ['pack/255_0-1.png', text('<svg onload="alert(1)"></svg>')],
      ['pack/255_0-2.png', testPng(65 * 300, 67 * 300)],
      ['pack/__proto__.png', testPng(65, 67)],
      ['pack/<script>.png', testPng(65, 67)],
    ]);
    const result = await importReplacementZip(zip, { readZip: readZipEntries, sizesOf });
    assert.deepEqual(result, { kept: 1, files: 0, unknown: 0, outOfShape: 0, tooBig: 1, unreadable: 1, cifRefused: 0 });
    const [kept] = await listReplacements();
    assert.deepEqual(new Uint8Array(await kept.blob.arrayBuffer()), testPng(65, 67), 'the text and the hidden zip dropped');
    assert.equal(kept.fileName, '255_0-0.png', 'its own name, no folder');
    await saveReplacements([{ archive: 255, record: 1, frame: 0, fileName: '..\\..\\"><img src=x>.png', blob: new Blob([testPng(65, 67)]) }]);
    assert.equal((await listReplacements()).find((record) => record.record === 1).fileName, '___img src_x_.png', 'a chosen file\'s name kept plain');
  } finally {
    setPlayerReplacements([]);
    setPlayerPictures([]);
    setReplacementBackend(null);
  }
});

test('replacements safety: a zip is refused before it is read past what memory can spare', async () => {
  const sizesOf = async () => [{ width: 4, height: 4 }];
  const save = async () => assert.fail('nothing is kept');
  const code = (code) => (e) => e.code === code;
  let read = false;
  const spy = async () => { read = true; return []; };
  await assert.rejects(importReplacementZip({ size: MAX_ZIP_BYTES + 1 }, { readZip: spy, sizesOf, save }), code('zip-too-much'));
  assert.equal(read, false, 'a zip past 1 GB is never opened');

  const many = Array.from({ length: MAX_ZIP_FILES + 1 }, (_, i) => `255_0-${i}.png`);
  await assert.rejects(importReplacementZip(new Blob([]), { readZip: async (file, { pick }) => pick(many), sizesOf, save }), code('zip-too-much'));
  const sizes = async (file, { pick, limit }) => {
    for (const name of pick(Array.from({ length: 20 }, (_, i) => `255_0-${i}.png`))) limit(name, MAX_FILE_BYTES);
    return [];
  };
  await assert.rejects(importReplacementZip(new Blob([]), { readZip: sizes, sizesOf, save }), code('zip-too-much'), 'twenty 64 MB files: past 1 GB together');

  const lying = storedZip([['255_0-0.png', testPng(4, 4), { size: MAX_FILE_BYTES + 1 }]]);
  await assert.rejects(importReplacementZip(lying, { readZip: readZipEntries, sizesOf, save }), code('zip-too-large'), 'a file that says it is past 64 MB');
  const bomb = await deflated(new Uint8Array(4 * 1024 * 1024));
  const bombZip = storedZip([['255_0-0.png', bomb, { method: 8, size: 1000 }]]);
  await assert.rejects(importReplacementZip(bombZip, { readZip: readZipEntries, sizesOf, save }), code('zip-too-large'), 'one that inflates past what it says: stopped as it passes');
  const garbage = new Blob([text('PK\u0005\u0006'.padEnd(40, 'x'))]);
  await assert.rejects(importReplacementZip(garbage, { readZip: readZipEntries, sizesOf, save }), (e) => e.code === 'not-zip' && e.message === 'not a zip', 'its bytes never echoed back');
});
