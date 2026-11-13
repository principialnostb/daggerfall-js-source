// The player's pictures the game asks by name and their whole CIF files: the tier that answers them, the rule a CIF
// copy keeps, the spell icon sheet they are laid into, and the readers that ask them first - the weapon in hand, the
// widget's door and the casting hands. An attached mod's picture is the overhaul under them. Reads the player's own
// ARENA2 where a real CIF is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  cifPictureName, parseCifPictureName, canonicalPictureName, setPlayerPictures, setPlayerFiles, hasPlayerPicture,
  playerPictureStamp, playerPictureRgba, playerPicturesGeneration, hasPlayerFile, playerFileBytes, playerFileStamp,
  playerCifCopy,
} from '../../src/systems/replacements/playerPictures.js';
import { playerDrawsWeaponFrame } from '../../src/systems/replacements/weaponFrames.js';
import { cifRefusal } from '../../src/systems/replacements/replacementRules.js';
import { composeIconSheet, spellIconPictureName, spellIconCell, cutIcon, overhaulIconSheet } from '../../src/systems/replacements/spellIconSheet.js';
import { namesOverhauled, namedOriginal, sheetOriginal } from '../../src/systems/replacements/replacementCatalog.js';
import { setDfmodSources, clearDfmodSources, dfmodGeneration, hasDfmodCifRciFile } from '../../src/systems/dfmodTextures.js';
import { setValue } from '../../src/systems/settings/settings.js';
import { createClassicRecords } from '../../src/systems/replacements/classicRecords.js';
import { CifRciFile } from '../../src/formats/cifRciFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { loadFpsWeaponArt, WEAPON_TYPES } from '../../src/combat/fpsWeapon.js';
import { loadSpellCastArt } from '../../src/combat/fpsSpellCasting.js';
import { createClimbHands, GRIP_ART, REACH_ART } from '../../src/combat/climbHands.js';
import { PORT_PAINTINGS } from '../../src/systems/replacements/playerPictures.js';
import { ownOrModCifRecord, ownOrModImg } from '../../src/systems/replacements/ownOrMod.js';
import { playerStrip } from '../../src/systems/replacements/playerPictures.js';
import { THUNDERLOCK_STRIP } from '../../src/combat/gun/thunderlockStrip.js';
import { loadRidingArt } from '../../src/systems/riding.js';
import { createFaceLoader } from '../../src/ui/partyPanel.js';

const ARENA2 = process.env.ARENA2_PATH;
const NO_DATA = !ARENA2 || !existsSync(ARENA2) ? 'no ARENA2 (ARENA2_PATH)' : false;
const gameBytes = (name) => new Uint8Array(readFileSync(join(ARENA2, name)));
const bytesOf = (value) => async () => new Uint8Array(value);

test('replacements: a picture is named as DFU names a loose file, in one spelling', () => {
  assert.equal(cifPictureName('weapon04.cif', 3, 2, 'Daedric'), 'WEAPON04.CIF_3-2_Daedric');
  assert.deepEqual(parseCifPictureName('FACE00I0.CIF_7-0'), { file: 'FACE00I0.CIF', record: 7, frame: 0, metal: null });
  assert.equal(parseCifPictureName('BODY00I0.IMG'), null);
  assert.equal(canonicalPictureName('weapon04.cif_0-0_Iron'), 'WEAPON04.CIF_0-0_Iron');
  assert.equal(canonicalPictureName('body00i0.img'), 'BODY00I0.IMG');
  assert.equal(canonicalPictureName('icon00i0.img_21'), 'ICON00I0.IMG_21');
  assert.equal(canonicalPictureName('held-map'), 'held-map');
  assert.equal(spellIconPictureName(21), 'ICON00I0.IMG_21');
});

test('replacements: a frame chosen for one metal answers that metal, one for every metal the rest; an IMG answers by its name', async () => {
  const before = playerPicturesGeneration();
  try {
    setPlayerPictures([
      { name: 'longsword.cif_0-0', stamp: 1, load: bytesOf([1]) },
      { name: 'LONGSWORD.CIF_0-0_Daedric', stamp: 2, load: bytesOf([2]) },
      { name: 'BODY00I0.IMG', stamp: 3, load: bytesOf([3]) },
    ]);
    assert.ok(playerPicturesGeneration() > before, 'a registration is counted, so what is drawn from them is made again');
    assert.equal(playerPictureStamp('LONGSWORD.CIF_0-0_Daedric'), 2, 'the Daedric one for Daedric');
    assert.equal(playerPictureStamp('LONGSWORD.CIF_0-0_Iron'), 1, 'the one for every metal for Iron');
    assert.equal(hasPlayerPicture('LONGSWORD.CIF_0-1_Iron'), false, 'another frame is not the player\'s');
    assert.equal(hasPlayerPicture('body00i0.img'), true);
    const decode = async (bytes) => ({ width: 1, height: 1, data: new Uint8Array([bytes[0], 0, 0, 255]) });
    assert.deepEqual([...(await playerPictureRgba('LONGSWORD.CIF_0-0_Daedric', { decode })).data], [2, 0, 0, 255]);
    assert.equal(await playerPictureRgba('SCBG00I0.IMG', { decode }), null);
    const broken = async () => {
      throw new Error('no');
    };
    assert.equal(await playerPictureRgba('BODY00I0.IMG', { decode: broken }), null, 'a picture that will not decode leaves the game\'s own');
  } finally {
    setPlayerPictures([]);
  }
});

test('replacements: a whole file is the player\'s by its name, and the weapon in hand\'s door says when the player draws a frame', async () => {
  try {
    setPlayerFiles([{ file: 'weapon04.cif', stamp: 9, load: bytesOf([7, 7]) }]);
    assert.equal(hasPlayerFile('WEAPON04.CIF'), true);
    assert.equal(playerFileStamp('WEAPON04.CIF'), 9);
    assert.deepEqual([...(await playerFileBytes('Weapon04.cif'))], [7, 7]);
    assert.equal(await playerFileBytes('WEAPON05.CIF'), null);
    assert.equal(playerDrawsWeaponFrame('LONGSWORD.CIF_1-2_Iron', 'WEAPON04.CIF'), true, 'every frame of a copied file is the player\'s');
    assert.equal(playerDrawsWeaponFrame('MACE.CIF_1-2_Iron', 'WEAPON05.CIF'), false);
    setPlayerPictures([{ name: 'MACE.CIF_1-2', stamp: 1, load: bytesOf([1]) }]);
    assert.equal(playerDrawsWeaponFrame('MACE.CIF_1-2_Iron', 'WEAPON05.CIF'), true, 'and a frame of their own');
  } finally {
    setPlayerFiles([]);
    setPlayerPictures([]);
  }
});

test('replacements: a CIF copy keeps the game file\'s records, frames and their shapes, or it is refused', { skip: NO_DATA }, async () => {
  const game = createClassicRecords(async (name) => readFileSync(join(ARENA2, name)));
  const longBlades = await game.cifShape('WEAPON04.CIF');
  assert.deepEqual(longBlades.counts, [1, 5, 5, 5, 5, 5, 5], 'the ready pose and six swings');
  assert.equal(cifRefusal(gameBytes('WEAPON04.CIF'), 'WEAPON04.CIF', longBlades), null, 'the game\'s own shape stands');
  const fire = cifRefusal(gameBytes('FIRE00C6.CIF'), 'WEAPON04.CIF', longBlades);
  assert.deepEqual([fire.reason, fire.expected], ['wrongShape', 7], 'another sheet, read as the game reads this one, is refused');
  assert.equal(cifRefusal(new Uint8Array(12), 'WEAPON04.CIF', longBlades).reason, 'notCif');
  const half = { counts: longBlades.counts, sizes: longBlades.sizes.map((size) => ({ width: size.width * 2, height: size.height * 2 })) };
  assert.deepEqual(cifRefusal(gameBytes('WEAPON04.CIF'), 'WEAPON04.CIF', half), { reason: 'wrongSize', record: 0, width: 60, height: 86, accepted: [{ width: 120, height: 172 }] },
    'a record smaller than the original is out of shape');

  try {
    setPlayerFiles([{ file: 'WEAPON04.CIF', stamp: 1, load: async () => gameBytes('FIRE00C6.CIF') }]);
    const original = new CifRciFile();
    original.load(gameBytes('WEAPON04.CIF'), 'WEAPON04.CIF', null);
    assert.equal(await playerCifCopy('WEAPON04.CIF', null, original), null, 'a copy of another shape is never read in its place');
    assert.ok(await playerCifCopy('WEAPON04.CIF'), 'though it reads as a CIF');
  } finally {
    setPlayerFiles([]);
  }
});

test('replacements: the player\'s spell icons are laid into their cells, the whole sheet scaled for the biggest', () => {
  const sheet = { width: 320, height: 64, colors: new Uint8Array(320 * 64 * 4).fill(1) };
  const icon = (edge, value) => ({ width: edge, height: edge, data: new Uint8Array(edge * edge * 4).fill(value) });
  const pixel = (picture, x, y) => picture.colors[(y * picture.width + x) * 4];
  const plain = composeIconSheet(sheet, new Map([[21, icon(16, 200)]]));
  assert.deepEqual([plain.width, plain.height, plain.scale], [320, 64, 1], 'an icon of the classic size keeps the sheet\'s');
  const cell = spellIconCell(21);
  assert.deepEqual(cell, { x: 16, y: 16, width: 16, height: 16 }, 'row two, column two');
  assert.equal(pixel(plain, cell.x, cell.y), 200);
  assert.equal(pixel(plain, cell.x - 1, cell.y), 1, 'its neighbour stands');
  const sharp = composeIconSheet(sheet, new Map([[21, icon(32, 200)], [0, icon(16, 90)]]));
  assert.deepEqual([sharp.width, sharp.height, sharp.scale], [640, 128, 2], 'a 32-pixel icon doubles the sheet');
  assert.equal(pixel(sharp, 32, 32), 200, 'every cell keeps its place');
  assert.equal(pixel(sharp, 0, 0), 90, 'a classic-sized icon is scaled up into its cell');
  assert.equal(pixel(sharp, 639, 127), 1, 'and the rest of the sheet is the game\'s, scaled');
});

test('replacements: the climbing hands draw the player\'s painting over the port\'s, keyed by when it was kept', async () => {
  assert.deepEqual([PORT_PAINTINGS['climb-grip'].width, PORT_PAINTINGS['climb-grip'].height, PORT_PAINTINGS['climb-grip'].file], [GRIP_ART.w, GRIP_ART.h, GRIP_ART.file]);
  assert.deepEqual([PORT_PAINTINGS['climb-reach'].width, PORT_PAINTINGS['climb-reach'].height], [REACH_ART.w, REACH_ART.h]);
  const uploads = [];
  const fetched = [];
  const renderer = { uploadTexture: (kind, key) => { uploads.push(key); return { key }; }, drawScreenQuad: () => {} };
  const decode = async () => ({ width: 2, height: 2, data: new Uint8Array(16) });
  try {
    setPlayerPictures([{ name: 'climb-grip', stamp: 7, load: async () => new Uint8Array([1]) }]);
    const hands = createClimbHands({ renderer, fetchBytes: async (file) => { fetched.push(file); return new Uint8Array([2]); }, decode });
    const hang = { mode: 'hang', normal: [0, 0, -1], track: [0, 1, 0], feet: [0, 1, 0], grip: 1, move: null };   // facing the wall: both fists up
    for (let i = 0; i < 60; i++) hands.update(1 / 60, hang, { yaw: 0 });
    hands.draw({ width: 640, height: 400 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(uploads.includes('climbhands:climb-grip#7'), 'the player\'s fist, keyed by when it was kept');
    assert.ok(!fetched.includes('art/climb-grip.png'), 'the port\'s own is not fetched');
  } finally {
    setPlayerPictures([]);
  }
});

test('replacements: one door answers a CIF record or an IMG for every reader - the player\'s own, then an attached mod\'s', async () => {
  try {
    await attachMod([['FACES.CIF_3-0', 6, 6], ['WOLF00I0.IMG', 250, 396]]);
    setPlayerPictures([{ name: 'TFAC00I0.RCI_5-0', stamp: 1, load: async () => new Uint8Array([1]) }]);
    assert.equal((await ownOrModCifRecord('FACES.CIF', 3, null)).width, 6, 'a mod\'s special face');
    assert.equal(await ownOrModCifRecord('FACES.CIF', 4, null), null, 'one it lacks is the game\'s');
    assert.equal((await ownOrModImg('WOLF00I0.IMG')).width, 250, 'a mod\'s werewolf');
    assert.equal(await ownOrModCifRecord('TFAC00I0.RCI', 6, null), null);
  } finally {
    setPlayerPictures([]);
    clearDfmodSources();
  }
});

test('replacements: the party panel draws a player\'s face over the classic one, at the classic face\'s size', { skip: NO_DATA }, async () => {
  const palette = new DFPalette();
  palette.load(gameBytes('ART_PAL.COL'), 'ART_PAL.COL');
  const faces = createFaceLoader({ fetchBytes: async (name) => gameBytes(name), palette });
  const classic = await faces({ common: 7 });
  assert.deepEqual([classic.width, classic.height], [64, 64]);
  const decode = async () => ({ width: 128, height: 128, data: new Uint8Array(128 * 128 * 4).fill(222) });
  try {
    setPlayerPictures([{ name: 'TFAC00I0.RCI_7-0', stamp: 1, load: async () => new Uint8Array([1]) }]);
    // the loader decodes with the page's own decoder; the test hands its picture through the tier's seam instead
    const { playerPictureRgba } = await import('../../src/systems/replacements/playerPictures.js');
    assert.equal((await playerPictureRgba('TFAC00I0.RCI_7-0', { decode })).width, 128);
  } finally {
    setPlayerPictures([]);
  }
});

test('replacements: a gun\'s strip of the player\'s is read at the strip\'s own size - its frames are cut and measured in its cells', async () => {
  try {
    setPlayerPictures([{ name: 'thunderlock-frames', stamp: 3, load: async () => new Uint8Array([1]) }]);
    const decode = async () => ({ width: 2240, height: 196, data: new Uint8Array(2240 * 196 * 4).fill(50) });
    const strip = await playerStrip('thunderlock-frames', THUNDERLOCK_STRIP, decode);
    assert.deepEqual([strip.width, strip.height], [1120, 98], 'twice the size, brought to the strip\'s');
    assert.equal(await playerStrip('pistol-frames', THUNDERLOCK_STRIP, decode), null);
  } finally {
    setPlayerPictures([]);
  }
});

test('replacements: the mount draws a mod\'s riding frame over the game\'s, keyed apart', { skip: NO_DATA }, async () => {
  const palette = new DFPalette();
  palette.load(gameBytes('ART_PAL.COL'), 'ART_PAL.COL');
  const renderer = { uploadTexture: (kind, key) => key };
  const keysOf = async () => (await loadRidingArt(async (name) => gameBytes(name), palette, renderer, 'horse')).records;
  assert.deepEqual(await keysOf(), ['ride:MRED00I0.CFA:0', 'ride:MRED00I0.CFA:1', 'ride:MRED00I0.CFA:2', 'ride:MRED00I0.CFA:3']);
  try {
    await attachMod([['MRED00I0.CFA_0-1', 8, 8]]);
    const keys = await keysOf();
    assert.match(keys[1], /^ride:MRED00I0\.CFA:1#over/, 'the mod\'s frame, keyed apart');
    assert.equal(keys[0], 'ride:MRED00I0.CFA:0', 'a frame it lacks is the game\'s');
  } finally {
    clearDfmodSources();
  }
});

test('replacements: an overhaul\'s sheet of any scale is the base the player\'s icons are laid on, and an icon is cut from it at its scale', () => {
  const sheet = { width: 640, height: 128, data: new Uint8Array(640 * 128 * 4).fill(7) };
  const bare = composeIconSheet(sheet, new Map());
  assert.deepEqual([bare.width, bare.height, bare.scale], [640, 128, 2], 'a sheet twice the classic size keeps its detail');
  const laid = composeIconSheet(sheet, new Map([[21, { width: 16, height: 16, data: new Uint8Array(16 * 16 * 4).fill(99) }]]));
  assert.equal(laid.colors[(32 * 640 + 32) * 4], 99, 'a classic-sized icon fills its cell at the sheet\'s scale');
  assert.equal(laid.colors[0], 7);
  assert.deepEqual([cutIcon(laid, 21).width, cutIcon(laid, 21).data[0]], [32, 99], 'and is cut back out at that scale');
  assert.equal(cutIcon(sheet, 80), null, 'past the sheet');
});

/** A fake attached mod in unityBundleClient's shape, its pictures [[name, width, height]] each one colour. */
async function attachMod(textures) {
  setValue('Enhancements', 'AssetInjection', 'True');
  const manifest = JSON.stringify({ ModTitle: 'Test', ModVersion: '1.0', ModAuthor: 'K', GUID: 'test' });
  const bundle = {
    textAssets: [{ name: 'Test.dfmod', bytes: new TextEncoder().encode(manifest), get text() { return manifest; } }],
    textures: textures.map(([name, width, height]) => ({ name, width, height, format: 4 })),
    rgba: async (name) => {
      const found = textures.find((texture) => texture[0] === name);
      return found ? { width: found[1], height: found[2], data: new Uint8Array(found[1] * found[2] * 4).fill(180) } : null;
    },
    close() {},
  };
  const open = async (bytes) => (new TextDecoder().decode(bytes) === 'dfmod/test.dfmod' ? bundle : null);
  const load = async (key) => (key === 'dfmod/test.dfmod' ? new TextEncoder().encode(key) : null);
  await setDfmodSources(['dfmod/test.dfmod'], load, { open, saveIndex: async () => {}, background: false });
}

test('replacements: an attached mod\'s picture is the overhaul the pane shows over the original, and marks its thing blue', async () => {
  try {
    await attachMod([['ICON00I0.IMG', 640, 128], ['BODY00I0.IMG', 138, 290], ['WEAPON10.CIF_1-0_Iron', 8, 8], ['FIRE00C6.CIF_2-0', 10, 10]]);
    assert.equal(hasDfmodCifRciFile('weapon10.cif'), true, 'any frame of a CIF, for any metal, is the mod\'s file');
    assert.equal(namesOverhauled(['WEAPON10.CIF']), true, 'the hands are blue');
    assert.equal(namesOverhauled(['ICON00I0.IMG_5']), true, 'and the spell icons, the mod drawing their sheet');
    assert.equal(namesOverhauled(['BODY00I0.IMG']), true, 'and a body it draws');
    assert.equal(namesOverhauled(['BODY10I0.IMG', 'WEAPON11.CIF']), false, 'not one it does not');
    assert.equal(namesOverhauled(['LONGSWORD.CIF']), true, 'Diverse Weapons\' own sheets are an overhaul\'s too');
    assert.deepEqual([(await overhaulIconSheet()).width, (await namedOriginal({ source: { kind: 'icon', index: 21 } })).overhaul.width], [640, 32],
      'an icon is cut from the mod\'s sheet at its scale');
    assert.equal((await namedOriginal({ source: { kind: 'img', file: 'BODY00I0.IMG' } })).overhaul.width, 138, 'a body is the mod\'s');
    const casting = { file: 'FIRE00C6.CIF', classicFile: 'FIRE00C6.CIF', counts: [1, 1, 1], reader: 'mod', metals: false, gameMetal: null };
    assert.equal((await sheetOriginal(casting, { record: 2, frame: 0 })).overhaul.width, 10, 'a casting hand\'s record is the mod\'s');
    assert.equal((await sheetOriginal(casting, { record: 1, frame: 0 })).overhaul, null, 'and one it lacks is the game\'s');
  } finally {
    clearDfmodSources();
  }
});

/** The weapon's and the casting hands' loaders over the player's own ARENA2, with a renderer that answers each key. */
async function loaders() {
  const getBytes = async (name) => gameBytes(name);
  const palette = new DFPalette();
  palette.load(gameBytes('ART_PAL.COL'), 'ART_PAL.COL');
  const renderer = { uploadTexture: (archive, key) => key };
  return { getBytes, palette, renderer };
}

test('replacements: the weapon in hand draws the player\'s CIF in the classic boxes, keyed apart, and asks no mod for its frames', { skip: NO_DATA }, async () => {
  const { getBytes, palette, renderer } = await loaders();
  const asked = [];
  const customImage = async (name) => {
    asked.push(name);
    return null;
  };
  const plain = await loadFpsWeaponArt(getBytes, palette, renderer, WEAPON_TYPES.LongBlade, 0, null, { customImage });
  assert.equal(plain.records[1].frames[2], 'fpw:WEAPON04.CIF:0:1:2', 'the game\'s own, as before');
  assert.ok(asked.length > 0, 'the mods are asked while the file is the game\'s');
  try {
    setPlayerFiles([{ file: 'WEAPON04.CIF', stamp: 9, load: async () => gameBytes('WEAPON04.CIF') }]);
    asked.length = 0;
    const own = await loadFpsWeaponArt(getBytes, palette, renderer, WEAPON_TYPES.LongBlade, 0, null, { customImage });
    assert.equal(own.records[1].frames[2], 'fpw:WEAPON04.CIF#9:0:1:2', 'the copy keyed by when it was kept');
    assert.deepEqual(own.records.map((record) => [record.width, record.height]), plain.records.map((record) => [record.width, record.height]), 'in the classic boxes');
    assert.deepEqual(asked, [], 'a copied file outranks the mods');
  } finally {
    setPlayerFiles([]);
  }
});

test('replacements: the casting hands draw the player\'s CIF, keyed apart, and keep the game\'s when the copy is another shape', { skip: NO_DATA }, async () => {
  const { getBytes, palette, renderer } = await loaders();
  const keys = async () => (await loadSpellCastArt(getBytes, palette, renderer, 0)).records.map((record) => record.tex);
  assert.equal((await keys())[0], 'fpsc:FIRE00C6.CIF:0');
  try {
    setPlayerFiles([{ file: 'FIRE00C6.CIF', stamp: 4, load: async () => gameBytes('FIRE00C6.CIF') }]);
    assert.equal((await keys())[0], 'fpsc:FIRE00C6.CIF#4:0');
    setPlayerFiles([{ file: 'FIRE00C6.CIF', stamp: 5, load: async () => gameBytes('WEAPON04.CIF') }]);
    assert.equal((await keys())[0], 'fpsc:FIRE00C6.CIF:0', 'a copy of another shape is not read');
    setPlayerFiles([]);
    await attachMod([['FIRE00C6.CIF_2-0', 10, 10]]);
    const modded = await keys();
    assert.deepEqual([modded[0], modded[2]], ['fpsc:FIRE00C6.CIF:0', `fpsc:FIRE00C6.CIF_2-0#mod${dfmodGeneration()}`], 'an attached mod\'s record over the game\'s, as TryImportCifRci answers');
    setPlayerFiles([{ file: 'FIRE00C6.CIF', stamp: 6, load: async () => gameBytes('FIRE00C6.CIF') }]);
    assert.equal((await keys())[2], 'fpsc:FIRE00C6.CIF#6:2', 'the player\'s copy outranks the mod');
  } finally {
    setPlayerFiles([]);
    clearDfmodSources();
  }
});
