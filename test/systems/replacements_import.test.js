// Import: a zip of pictures and CIF files named as the game's own, kept in one go, and every file that is not kept
// counted by why. The zip is built by the test's fixtures, in the shape the port's own reader reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { importReplacementZip, pictureNamedBy } from '../../src/systems/replacements/replacementImport.js';
import { createClassicRecords } from '../../src/systems/replacements/classicRecords.js';
import { hasPlayerFile, setPlayerFiles, setPlayerPictures } from '../../src/systems/replacements/playerPictures.js';
import { pictureFileName } from '../../src/ui/replacementsPane.js';
import { memoryReplacementBackend, setReplacementBackend, listReplacements } from '../../src/systems/replacements/replacementStore.js';
import { hasPlayerReplacement, setPlayerReplacements } from '../../src/systems/textureReplacement.js';
import { testPng, storedZip } from '../replacementFixtures.mjs';
import { readZipEntries } from '../../src/scenes/dataSource.js';

/** A PNG of this size, whole enough for Import's and Choose's checks. */
const pngHeader = testPng;

const ARENA2 = process.env.ARENA2_PATH;
const NO_DATA = !ARENA2 || !existsSync(ARENA2) ? 'no ARENA2 (ARENA2_PATH)' : false;

/** The originals the test's game has: the Rat's first record at 65 x 67, a body set's frame at 53 x 110, a longsword's
 *  first-person frame at 60 x 86 and a Breton man's body at 69 x 145. */
const sizesOf = async ({ kind, name, archive, record }) => {
  if (kind === 'picture') return name.startsWith('LONGSWORD.CIF_') ? [{ width: 60, height: 86 }] : name === 'BODY00I0.IMG' ? [{ width: 69, height: 145 }] : [];
  if (archive === 233) return [{ width: 86, height: 29 }];
  return archive === 255 && record < 2 ? [{ width: 65, height: 67 }] : archive === 112366 ? [{ width: 53, height: 110 }] : [];
};

test('replacements: a zip file is named for a picture as DFU names loose textures, in any folder', () => {
  const texture = (archive, record, frame, dye = null) => ({ kind: 'texture', archive, record, frame, dye });
  assert.deepEqual(pictureNamedBy('112366/112366_0-0.png'), texture(112366, 0, 0));
  assert.deepEqual(pictureNamedBy('Textures\\255_3-4.png'), texture(255, 3, 4));
  assert.deepEqual(pictureNamedBy('003_5-0.png'), texture(3, 5, 0), 'the archive padded to three digits');
  assert.equal(pictureNamedBy('255_0-0_Normal.png'), null, 'another texture map is not this pane\'s');
  assert.deepEqual(pictureNamedBy('233_5-0_Iron.png'), texture(233, 5, 0, 'Iron'), 'a metal\'s dye');
  assert.equal(pictureNamedBy('233_5-0_Gold.png'), null, 'a dye the game has not');
  assert.deepEqual(pictureNamedBy('CifRci/LONGSWORD.CIF_3-2_Daedric.png'), { kind: 'picture', name: 'LONGSWORD.CIF_3-2_Daedric' },
    'a first-person frame, for a metal');
  assert.deepEqual(pictureNamedBy('weapon04.cif_0-0.png'), { kind: 'picture', name: 'WEAPON04.CIF_0-0' }, 'or for every one');
  assert.equal(pictureNamedBy('LONGSWORD.CIF_0-0_Gold.png'), null, 'a metal the game has not');
  assert.deepEqual(pictureNamedBy('Img/BODY00I0.IMG.png'), { kind: 'picture', name: 'BODY00I0.IMG' }, 'a whole IMG, as DFU names it');
  assert.deepEqual(pictureNamedBy('icon00i0.img_21.png'), { kind: 'picture', name: 'ICON00I0.IMG_21' }, 'a spell icon');
  assert.deepEqual(pictureNamedBy('maps/Held-Map.png'), { kind: 'picture', name: 'held-map' }, 'the held map');
  assert.deepEqual(pictureNamedBy('climb/climb-reach.png'), { kind: 'picture', name: 'climb-reach' }, 'a climbing hand');
  assert.deepEqual(pictureNamedBy('guns/thunderlock-frames.png'), { kind: 'picture', name: 'thunderlock-frames' }, 'a gun\'s strip');
  assert.deepEqual(pictureNamedBy('CFA/MRED00I0.CFA_0-2.png'), { kind: 'picture', name: 'MRED00I0.CFA_0-2' }, 'a riding frame');
  assert.deepEqual(pictureNamedBy('faces/TFAC00I0.RCI'), { kind: 'file', file: 'TFAC00I0.RCI' }, 'a whole RCI');
  assert.deepEqual(pictureNamedBy('Weapons/weapon04.cif'), { kind: 'file', file: 'WEAPON04.CIF' }, 'a whole CIF file');
  assert.equal(pictureNamedBy('WEAPON04.CIF.bak'), null);
  assert.equal(pictureNamedBy('readme.txt'), null);
  assert.equal(pictureNamedBy('255_0-0.jpg'), null);
  for (const picture of [{ archive: 2, record: 5, frame: 0 }, { archive: 255, record: 3, frame: 4 }, { archive: 112366, record: 0, frame: 0 }])
    assert.deepEqual(pictureNamedBy(pictureFileName(picture)), { kind: 'texture', ...picture, dye: null }, 'the name the pane shows is the name Import reads');
  assert.equal(pictureFileName({ archive: 2, record: 5, frame: 0 }), '002_5-0.png');
});

test('replacements: Import keeps every picture that follows its original and counts the rest by why', async () => {
  setReplacementBackend(memoryReplacementBackend());
  try {
    const zip = storedZip([
      ['Female Orc Warrior/112366/112366_0-0.png', pngHeader(106, 220)],
      ['pack/255_0-0.png', pngHeader(65, 67)],
      ['other/255_0-0.png', pngHeader(130, 134)],
      ['pack/255_0-1.png', pngHeader(80, 80)],
      ['pack/999_0-0.png', pngHeader(8, 8)],
      ['pack/255_1-0.jpg', new Uint8Array(40)],
      ['pack/255_1-1.png', new Uint8Array(40)],
      ['pack/255_1-2.png', pngHeader(4000, 4123)],
      ['pack/255_0-0_Normal.png', pngHeader(65, 67)],
      ['pack/233_12-0_Daedric.png', pngHeader(172, 58)],
      ['CifRci/LONGSWORD.CIF_0-0_Daedric.png', pngHeader(120, 172)],
      ['CifRci/BOGUS.CIF_0-0.png', pngHeader(60, 86)],
      ['Img/BODY00I0.IMG.png', pngHeader(138, 290)],
      ['readme.txt', new TextEncoder().encode('made for the game')],
    ]);
    const result = await importReplacementZip(zip, { readZip: readZipEntries, sizesOf });
    assert.deepEqual(result, { kept: 6, files: 0, unknown: 2, outOfShape: 1, tooBig: 0, unreadable: 2, cifRefused: 0 }, 'a square picture of a taller original is the one out of shape');
    const kept = new Map((await listReplacements()).map((replacement) => [replacement.key, replacement]));
    assert.deepEqual([...kept.keys()].sort(), ['112366_0-0', '233_12-0_Daedric', '255_0-0', '255_1-2', 'name:BODY00I0.IMG', 'name:LONGSWORD.CIF_0-0_Daedric']);
    assert.deepEqual([kept.get('255_1-2').width, kept.get('255_1-2').drawWidth], [4000, 65], 'a picture past what a device takes is kept - the game shrinks it as it loads it');
    assert.equal(kept.get('255_0-0').width, 65, 'the first file of a name stands');
    const body = kept.get('112366_0-0');
    assert.deepEqual([body.width, body.drawWidth, body.drawHeight], [106, 53, 110], 'a bigger body frame, drawn at its original\'s size');
    assert.equal(body.fileName, '112366_0-0.png');
    assert.equal(kept.get('233_12-0_Daedric').dye, 'Daedric', 'a Daedric longsword\'s icon');
    const frame = kept.get('name:LONGSWORD.CIF_0-0_Daedric');
    assert.deepEqual([frame.kind, frame.name, frame.drawWidth], ['picture', 'LONGSWORD.CIF_0-0_Daedric', 60], 'and its first-person frame, twice the size');
    assert.deepEqual([kept.get('name:BODY00I0.IMG').drawWidth, kept.get('name:BODY00I0.IMG').drawHeight], [69, 145], 'a paper doll body, twice the size');
    assert.equal(hasPlayerReplacement(112366, 0, 0), true, 'registered with the texture door');
  } finally {
    setPlayerReplacements([]);
    setPlayerPictures([]);
    setReplacementBackend(null);
  }
});

test('replacements: Import keeps a CIF file named as the game\'s in its place whole, and refuses one of another shape', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const game = createClassicRecords(async (name) => readFileSync(join(ARENA2, name)));
  const shapeOf = (file) => (['WEAPON04.CIF', 'FIRE00C6.CIF'].includes(file) ? game.cifShape(file) : null);
  const longBlades = new Uint8Array(readFileSync(join(ARENA2, 'WEAPON04.CIF')));
  try {
    const zip = storedZip([
      ['Weapons/WEAPON04.CIF', longBlades],
      ['Spells/FIRE00C6.CIF', longBlades],
      ['Other/BOGUS.CIF', longBlades],
      ['Other/WEAPON05.CIF', new Uint8Array(12)],
    ]);
    const result = await importReplacementZip(zip, { readZip: readZipEntries, sizesOf, shapeOf: (file) => (file === 'WEAPON05.CIF' ? game.cifShape(file) : shapeOf(file)) });
    assert.deepEqual(result, { kept: 0, files: 1, unknown: 1, outOfShape: 0, tooBig: 0, unreadable: 0, cifRefused: 2 }, 'the long blades kept; a sheet of another shape and one that does not read refused');
    const kept = await listReplacements();
    assert.deepEqual(kept.map((replacement) => [replacement.key, replacement.kind, replacement.fileName]), [['file:WEAPON04.CIF', 'file', 'WEAPON04.CIF']]);
    assert.equal(hasPlayerFile('WEAPON04.CIF'), true, 'registered: the weapon in hand reads it in place of the game\'s');
  } finally {
    setPlayerFiles([]);
    setReplacementBackend(null);
  }
});

test('replacements: Import refuses a file that is not a zip, and keeps nothing from a zip with no game pictures', async () => {
  setReplacementBackend(memoryReplacementBackend());
  try {
    await assert.rejects(importReplacementZip(new Blob([pngHeader(8, 8)]), { readZip: readZipEntries, sizesOf }), (e) => e.code === 'not-zip');
    const result = await importReplacementZip(storedZip([['notes.txt', new Uint8Array(4)]]), { readZip: readZipEntries, sizesOf });
    assert.deepEqual(result, { kept: 0, files: 0, unknown: 0, outOfShape: 0, tooBig: 0, unreadable: 0, cifRefused: 0 });
    assert.equal((await listReplacements()).length, 0);
  } finally {
    setReplacementBackend(null);
  }
});
