// Export: every kept replacement in one zip, each file named as Import reads it, so a zip Export writes is a zip
// Import keeps whole - and the system's save dialog asked where, or the file downloaded where a browser has none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportReplacementZip, exportEntryName, exportZipName } from '../../src/systems/replacements/replacementExport.js';
import { importReplacementZip, pictureNamedBy } from '../../src/systems/replacements/replacementImport.js';
import { memoryReplacementBackend, setReplacementBackend, listReplacements, saveReplacements, keyOfPicture } from '../../src/systems/replacements/replacementStore.js';
import { setPlayerReplacements } from '../../src/systems/textureReplacement.js';
import { setPlayerPictures, setPlayerFiles } from '../../src/systems/replacements/playerPictures.js';
import { readZipEntries } from '../../src/scenes/dataSource.js';
import { crc32 } from '../../src/systems/save/saveTransfer.js';
import { askSaveTarget } from '../../src/ui/saveFileAs.js';
import { testPng } from '../replacementFixtures.mjs';

const png = (width, height) => new Blob([testPng(width, height)], { type: 'image/png' });
/** A plain CIF of one 2 x 2 record, unpacked. */
function tinyCif() {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setInt16(4, 2, true);
  view.setInt16(6, 2, true);
  view.setUint16(10, 4, true);
  bytes.set([1, 2, 3, 4], 12);
  return bytes;
}
const KEPT = [
  { archive: 255, record: 0, frame: 0, width: 65, height: 67, blob: png(65, 67) },
  { archive: 233, record: 12, frame: 0, dye: 'Daedric', width: 172, height: 58, blob: png(172, 58) },
  { archive: 2, record: 5, frame: 1, width: 64, height: 64, blob: png(64, 64) },
  { kind: 'picture', name: 'LONGSWORD.CIF_0-0_Daedric', width: 120, height: 172, blob: png(120, 172) },
  { kind: 'picture', name: 'BODY00I0.IMG', width: 138, height: 290, blob: png(138, 290) },
  { kind: 'picture', name: 'ICON00I0.IMG_5', width: 32, height: 32, blob: png(32, 32) },
  { kind: 'picture', name: 'held-map', width: 1648, height: 1086, blob: png(1648, 1086) },
  { kind: 'file', file: 'TEST00I0.CIF', blob: new Blob([tinyCif()]) },
];
const SIZES = {
  '255_0-0': [65, 67], '233_12-0': [86, 29], '2_5-1': [64, 64],
  'LONGSWORD.CIF_0-0_Daedric': [60, 86], 'BODY00I0.IMG': [69, 145], 'ICON00I0.IMG_5': [16, 16], 'held-map': [1648, 1086],
};
const sizesOf = async ({ kind, name, archive, record, frame }) => {
  const size = SIZES[kind === 'picture' ? name : `${archive}_${record}-${frame}`];
  return size ? [{ width: size[0], height: size[1] }] : [];
};
const shapeOf = async (file) => (file === 'TEST00I0.CIF' ? { counts: [1], sizes: [{ width: 2, height: 2 }] } : null);
const forget = () => {
  setPlayerReplacements([]);
  setPlayerPictures([]);
  setPlayerFiles([]);
  setReplacementBackend(null);
};

test('replacements export: each kept file is named as Import reads it, in Daggerfall Unity\'s folders', () => {
  for (const kept of KEPT) {
    const name = exportEntryName(kept);
    assert.equal(keyOfPicture(pictureNamedBy(name)), keyOfPicture({ kind: 'texture', ...kept }), name);
  }
  assert.deepEqual(KEPT.map(exportEntryName), [
    'Textures/255_0-0.png', 'Textures/233_12-0_Daedric.png', 'Textures/002_5-1.png', 'Textures/CifRci/LONGSWORD.CIF_0-0_Daedric.png',
    'Textures/Img/BODY00I0.IMG.png', 'Textures/Img/ICON00I0.IMG_5.png', 'Port/held-map.png', 'Files/TEST00I0.CIF',
  ]);
  assert.equal(exportEntryName({ kind: 'other' }), null);
  assert.equal(exportZipName(new Date(2026, 10, 2)), 'dfo-replacements-2026-11-02.zip');
});

test('replacements export: a zip Export writes, Import keeps whole - every picture and file, byte for byte, each CRC true', async () => {
  setReplacementBackend(memoryReplacementBackend());
  let zip;
  try {
    await saveReplacements(KEPT);
    const { blob, count } = await exportReplacementZip();
    assert.equal(count, KEPT.length);
    zip = blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(bytes.buffer);
    for (let at = 0; view.getUint32(at, true) === 0x04034b50;) {
      const size = view.getUint32(at + 18, true);
      const nameLength = view.getUint16(at + 26, true);
      const data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
      assert.equal(view.getUint32(at + 14, true), crc32(data), 'a CRC any unzip tool checks');
      at += 30 + nameLength + size;
    }
  } finally {
    forget();
  }
  const entries = await readZipEntries(zip);
  assert.deepEqual(entries.map((entry) => entry.name), [...KEPT.map(exportEntryName)].sort(), 'sorted by name');
  setReplacementBackend(memoryReplacementBackend());
  try {
    const result = await importReplacementZip(zip, { readZip: readZipEntries, sizesOf, shapeOf });
    assert.deepEqual(result, { kept: 7, files: 1, unknown: 0, outOfShape: 0, tooBig: 0, unreadable: 0, cifRefused: 0 });
    const back = new Map((await listReplacements()).map((record) => [record.key, record]));
    for (const kept of KEPT) {
      const record = back.get(keyOfPicture({ kind: 'texture', ...kept }));
      assert.ok(record, exportEntryName(kept));
      assert.deepEqual(new Uint8Array(await record.blob.arrayBuffer()), new Uint8Array(await kept.blob.arrayBuffer()));
    }
  } finally {
    forget();
  }
});

test('replacements export: a stored picture is checked again - written clean, or left out when it is not a PNG', async () => {
  setReplacementBackend(memoryReplacementBackend());
  try {
    const dirty = new Uint8Array([...testPng(65, 67), ...new TextEncoder().encode('<script>x</script>')]);
    await saveReplacements([
      { archive: 255, record: 0, frame: 0, width: 65, height: 67, blob: new Blob([dirty]) },
      { archive: 255, record: 1, frame: 0, width: 65, height: 67, blob: new Blob(['<svg onload="x()"/>']) },
    ]);
    const { blob, count } = await exportReplacementZip();
    assert.equal(count, 1);
    const [entry] = await readZipEntries(blob);
    assert.equal(entry.name, 'Textures/255_0-0.png');
    assert.deepEqual(new Uint8Array(entry.data), testPng(65, 67));
    assert.equal((await exportReplacementZip({ list: async () => [] })).count, 0);
  } finally {
    forget();
  }
});

/** A window with the save dialog, its handle writing into `log`. */
function dialogWindow(log, { fail = null, write = null } = {}) {
  return {
    showSaveFilePicker: async (options) => {
      log.push(['ask', options]);
      if (fail) throw Object.assign(new Error(fail), { name: fail });
      return {
        name: 'chosen.zip',
        createWritable: async () => ({
          write: async (blob) => {
            log.push(['write', blob.size]);
            if (write) throw new Error(write);
          },
          close: async () => log.push(['close']),
          abort: async () => log.push(['abort']),
        }),
      };
    },
    document: linkDocument(log),
  };
}
/** A document whose links say what they download. */
function linkDocument(log) {
  return {
    createElement: () => ({ click() { log.push(['download', this.download, this.href.startsWith('blob:')]); }, remove() {} }),
    body: { append() {} },
  };
}

test('replacements export: the system\'s save dialog asked where, the file written whole there or not at all', async () => {
  const log = [];
  const target = await askSaveTarget('dfo-replacements.zip', { description: 'Zip file' }, dialogWindow(log));
  assert.equal(target.name, 'chosen.zip', 'the name the player chose');
  assert.deepEqual(log[0], ['ask', { suggestedName: 'dfo-replacements.zip', types: [{ description: 'Zip file', accept: { 'application/zip': ['.zip'] } }] }]);
  await target.write(new Blob(['zip']));
  assert.deepEqual(log.slice(1), [['write', 3], ['close']]);

  const failing = [];
  const broken = await askSaveTarget('x.zip', {}, dialogWindow(failing, { write: 'the disk is full' }));
  await assert.rejects(broken.write(new Blob(['zip'])), /the disk is full/);
  assert.deepEqual(failing.slice(1), [['write', 3], ['abort']], 'aborted: the file is left as it was');

  assert.equal(await askSaveTarget('x.zip', {}, dialogWindow([], { fail: 'AbortError' })), null, 'the player cancelled');
});

test('replacements export: where the browser has no save dialog, or will not show it, the file is downloaded', async () => {
  const refused = [];
  const target = await askSaveTarget('dfo-replacements.zip', {}, dialogWindow(refused, { fail: 'SecurityError' }));
  assert.equal(target.name, 'dfo-replacements.zip');
  await target.write(new Blob(['zip']));
  assert.deepEqual(refused.at(-1), ['download', 'dfo-replacements.zip', true]);

  const none = [];
  const plain = await askSaveTarget('dfo-replacements.zip', {}, { document: linkDocument(none) });
  await plain.write(new Blob(['zip']));
  assert.deepEqual(none, [['download', 'dfo-replacements.zip', true]]);
});
