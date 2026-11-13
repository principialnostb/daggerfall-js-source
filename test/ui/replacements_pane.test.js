// The Replacements pane, driven as a player drives it: the seven tabs, an item picked, a wrong file refused in red, a
// right one kept and marked green, an overhaul's change marked blue, Clear, and a whole CIF loaded in the game's
// place. Reads the player's own ARENA2.
import '../chargenDom.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { drawReplacementsPane, releaseReplacementsPane, choosePicture, chooseCifFile, importFiles, exportFiles, isPlaying, PLAY_FRAME_MS, pictureFileName } from '../../src/ui/replacementsPane.js';
import {
  REPLACEMENT_TABS, CLASSIC_TEXTURE_ARCHIVES, replacementItems, itemPictures, itemSections, itemOriginal, worldArchiveName, playerItemsFrom,
} from '../../src/systems/replacements/replacementCatalog.js';
import { memoryReplacementBackend, setReplacementBackend, listReplacements, saveReplacements, clearAllReplacements } from '../../src/systems/replacements/replacementStore.js';
import { setPlayerReplacements, addVendorTextures, clearVendorTextures, hasPlayerReplacement, hasTextureReplacement, textureDeriveContext } from '../../src/systems/textureReplacement.js';
import { setPlayerPictures, setPlayerFiles, hasPlayerPicture, hasPlayerFile } from '../../src/systems/replacements/playerPictures.js';
import { DYE_COLORS } from '../../src/characters/dyes.js';
import { testPng } from '../replacementFixtures.mjs';
import { originalSizes } from '../../src/systems/replacements/replacementImport.js';

const ARENA2 = process.env.ARENA2_PATH;
const NO_DATA = !ARENA2 || !existsSync(ARENA2) ? 'no ARENA2 (ARENA2_PATH)' : false;
if (!NO_DATA) {
  globalThis.fetch = async (url) => {
    const path = join(ARENA2, String(url).replace('./arena2/', ''));
    if (!existsSync(path)) return { ok: false, status: 404 };
    const bytes = readFileSync(path);
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
}

/** A PNG of this size, whole enough for Import's and Choose's checks. */
const pngHeader = testPng;
const fileOf = (bytes, name = 'mine.png') => ({ name, arrayBuffer: async () => bytes.buffer.slice(0) });
/** The pane's answers land over a few turns of the event loop. */
const settle = async () => {
  for (let i = 0; i < 40; i++) await new Promise((resolve) => setImmediate(resolve));
};
const all = (root, className) => root.querySelectorAll(`.${className}`);
const text = (node) => node?.textContent ?? '';
/** "Picture X of Y" as a player reads it: the words round the number box, and the number typed in it. */
const countWords = (root) => (root.querySelector('.repl-count')?.children ?? []).map((child) => (child.tagName === 'INPUT' ? child.value : child.textContent)).join('');

test('replacements: the seven tabs, in order', () => {
  assert.deepEqual([...REPLACEMENT_TABS], ['player', 'gear', 'items', 'magic', 'enemies', 'npcs', 'world']);
});

test('replacements: the archive list is the freeware data\'s own TEXTURE files', { skip: NO_DATA }, () => {
  const onDisk = readdirSync(ARENA2)
    .map((name) => /^TEXTURE\.(\d{3})$/i.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .filter((archive) => ![215, 217, 436].includes(archive))
    .sort((a, b) => a - b);
  assert.deepEqual([...CLASSIC_TEXTURE_ARCHIVES], onDisk);
});

test('replacements: a world archive is named from the climate tables', () => {
  assert.equal(worldArchiveName(2), 'Terrain, desert (002)');
  assert.equal(worldArchiveName(303), 'Terrain, temperate, winter (303)');
  assert.equal(worldArchiveName(404), 'Terrain, swamp, rain (404)');
  assert.equal(worldArchiveName(117), 'City walls, mountain (117)');
  assert.equal(worldArchiveName(504), 'Temperate woodland (504)');
  assert.equal(worldArchiveName(505), 'Temperate woodland, winter (505)');
  assert.equal(worldArchiveName(1), 'Texture 001');
});

test('replacements: every tab lists things with pictures, and no archive is listed on two tabs', { skip: NO_DATA }, async () => {
  const archivesOf = new Map();
  for (const tab of REPLACEMENT_TABS.filter((id) => id !== 'player')) {   // the body's sprites are the bundle's, listed below
    const items = await replacementItems(tab);
    assert.ok(items.length > (tab === 'magic' ? 10 : 20), `${tab} lists ${items.length}`);
    assert.ok((await itemSections(items[0])).length > 0, `${tab}'s first item has pictures`);
    // a Gear item drawn from a world flat (a Candle) names one record of a World archive; its paper doll archives are its own
    for (const item of items)
      for (const source of item.sources)
        if ((tab !== 'gear' && tab !== 'items') || (source.archive >= 233 && source.archive <= 254))
          archivesOf.set(source.archive, [...(archivesOf.get(source.archive) ?? []), tab === 'items' ? 'gear' : tab]);   // Gear and Items share the inventory archives
  }
  const twice = [...archivesOf].filter(([, tabs]) => new Set(tabs).size > 1);
  assert.deepEqual(twice, []);
  const gear = await replacementItems('gear');
  assert.deepEqual((await itemPictures(gear.find((item) => item.id === 'item-113'))).map((picture) => `${picture.archive}_${picture.record}`), ['233_5', '234_5'],
    'a Dagger: the women\'s and the men\'s icon');
});

test('replacements: the Player tab lists every body set the game ships, named as the Skin card names them', () => {
  const spriteKeys = ['eye-of-the-beholder', 'class-skins'].flatMap((pack) =>
    readdirSync(new URL(`../../vendor/${pack}/Textures/`, import.meta.url), { recursive: true })
      .map((path) => String(path).split(/[\\/]/).pop())
      .filter((name) => name.endsWith('.png'))
      .map((name) => name.replace(/\.png$/, '')),
  );
  const items = playerItemsFrom(spriteKeys);
  assert.equal(items.length, 43, '16 on-foot sets, 20 class skins, 5 riders, the werewolf and the wereboar');
  assert.equal(items[0].name, 'On foot: Light Fighter (female)');
  assert.ok(items.every((item) => item.sprites && item.pictures.length > 0));
  assert.deepEqual(items.find((item) => item.id === 'werewolf').sources.map((source) => source.archive), [112380]);
});

test('replacements: choose, refuse, keep, mark and clear', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    const tabs = all(root, 'repl-tab');
    assert.deepEqual(tabs.map(text), ['Player', 'Gear', 'Items', 'Magic', 'Enemies', 'NPCs', 'World']);
    tabs[4].click();   // Enemies
    await settle();
    const rat = all(root, 'repl-item').find((button) => text(button) === 'Rat');
    assert.ok(rat, 'the Rat is listed');
    rat.click();
    await settle();
    assert.equal(text(root.querySelector('h3')), 'Rat');
    assert.match(countWords(root), /^Picture 1 of \d+$/);
    assert.equal(text(all(root, 'repl-label')[0]), 'Original');
    assert.equal(text(root.querySelector('.repl-file')), '255_0-0.png', 'the name Import reads it by, under the label');
    const clear = root.querySelectorAll('button').find((button) => button.dataset.act === 'clear');
    assert.equal(clear.disabled, true, 'nothing to clear yet');

    const needs = /^Needs a PNG of (\d+) x (\d+), or bigger in the same proportions\.$/.exec(text(root.querySelector('.meta')));
    assert.ok(needs, 'the pane says the size it needs');
    const [width, height] = [Number(needs[1]), Number(needs[2])];
    const picture = { archive: 255, record: 0, frame: 0 };
    const accepted = [{ width, height }];
    assert.equal((await choosePicture(root, picture, accepted, fileOf(pngHeader(width + 5, height - 1)))).reason, 'wrongSize');
    await settle();
    assert.equal(text(root.querySelector('.repl-refusal')), `Rejected: this picture is ${width + 5} x ${height - 1}. It must be ${width} x ${height}, or bigger in the same proportions.`);
    assert.equal((await choosePicture(root, picture, accepted, fileOf(new Uint8Array(40), 'rat.jpg'))).reason, 'notPng');
    await settle();
    assert.equal(text(root.querySelector('.repl-refusal')), 'Rejected: this file is not a PNG.');
    assert.equal((await listReplacements()).length, 0, 'nothing refused is kept');

    assert.equal(await choosePicture(root, picture, accepted, fileOf(pngHeader(width * 3, height * 3))), null, 'three times the size, in its proportions');
    await settle();
    assert.equal(root.querySelector('.repl-refusal'), null, 'the refusal goes with a good choice');
    assert.equal((await listReplacements()).length, 1);
    assert.ok(all(root, 'repl-item').find((button) => text(button) === 'Rat').className.includes('own'), 'the Rat is green');
    const preview = root.querySelector('.repl-preview').querySelector('img');
    assert.ok(preview, 'the preview shows the chosen picture');
    assert.equal(preview.style.width, root.querySelector('.repl-slot').querySelector('canvas').style.width, 'at the original\'s size beside it');
    assert.deepEqual([(await listReplacements())[0].drawWidth, (await listReplacements())[0].drawHeight], [width, height], 'kept with the size the game draws it at');
    assert.equal(await choosePicture(root, { archive: 255, record: 0, frame: 1 }, accepted, fileOf(pngHeader(width, height))), null);
    await settle();
    assert.equal((await listReplacements()).length, 2, 'the Rat\'s second picture too');
    const button = (act) => root.querySelectorAll('button').find((node) => node.dataset.act === act);
    assert.equal(button('clear-selected').disabled, false);
    button('clear-selected').click();
    await settle();
    assert.deepEqual((await listReplacements()).map((replacement) => replacement.key), ['255_0-1'], 'Clear Selected takes away the picture shown alone');
    assert.ok(all(root, 'repl-item').find((node) => text(node) === 'Rat').className.includes('own'), 'the Rat is still green: a picture of it is replaced');
    assert.equal(button('clear-selected').disabled, true, 'nothing left on the picture shown');
    assert.equal(button('clear').disabled, false, 'but the Rat still has one');
    button('clear').click();
    await settle();
    assert.equal((await listReplacements()).length, 0, 'Clear takes away every picture of the Rat');
    assert.ok(!all(root, 'repl-item').find((button) => text(button) === 'Rat').className.includes('own'));

    const importButton = root.querySelectorAll('button').find((node) => node.dataset.act === 'import');
    assert.equal(text(importButton), 'Import', 'Import stands in the bar with the tabs');
    const fakeImport = async () => ({ kept: 3, unknown: 1, outOfShape: 0, unreadable: 2 });
    await importFiles(root, { name: 'pack.zip' }, fakeImport);
    await settle();
    assert.equal(text(root.querySelector('.repl-note')), 'Imported 3 pictures. 1 file matches no picture in the game. 2 files could not be read as PNG.');
    await importFiles(root, { name: 'pack.zip' }, async () => ({ kept: 1, unknown: 0, outOfShape: 2, unreadable: 0 }));
    await settle();
    assert.equal(text(root.querySelector('.repl-note')), 'Imported 1 picture. 2 pictures are out of shape.');
    await importFiles(root, { name: 'pack.zip' }, async () => ({ kept: 0, unknown: 0, outOfShape: 0, tooBig: 1, unreadable: 0 }));
    await settle();
    assert.equal(text(root.querySelector('.repl-note')), 'Imported 0 pictures. 1 picture is too big for the game to read.');
    await importFiles(root, { name: 'pack.png' }, async () => { throw Object.assign(new Error('no'), { code: 'not-zip' }); });
    await settle();
    assert.equal(text(root.querySelector('.repl-note')), 'Rejected: this file is not a zip.');
    assert.ok(root.querySelector('.repl-note').className.includes('repl-refusal'), 'said in red');
    await importFiles(root, { name: 'huge.zip' }, async () => { throw Object.assign(new Error('no'), { code: 'zip-too-much' }); });
    assert.equal(text(root.querySelector('.repl-note')), 'Rejected: this zip is too big. Import at most 1 GB and 20,000 files at a time.');

    addVendorTextures([{ archive: 255, record: 3, load: async () => pngHeader(4, 4) }]);
    all(root, 'repl-tab')[5].click();
    all(root, 'repl-tab')[4].click();
    await settle();
    const ratAgain = all(root, 'repl-item').find((button) => text(button) === 'Rat');
    assert.ok(ratAgain.className.includes('overhaul'), 'an overhaul\'s change is blue');
  } finally {
    releaseReplacementsPane();
    body.remove();
    clearVendorTextures();
    setPlayerReplacements([]);
    setReplacementBackend(null);
  }
});

test('replacements: Play steps through the pictures, round from the last, reads Pause while it plays, and stops on another thing', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const act = (root, name) => root.querySelectorAll('button').find((node) => node.dataset.act === name);
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    all(root, 'repl-tab')[4].click();   // Enemies
    await settle();
    all(root, 'repl-item').find((node) => text(node) === 'Rat').click();
    await settle();
    assert.equal(text(act(root, 'play')), 'Play');
    assert.equal(act(root, 'clear').parentNode.className, 'repl-head', 'Clear stands at the top of the box, by the name');
    all(root, 'repl-arrow')[0].click();   // back from the first: the last
    await settle();
    const last = /^Picture (\d+) of (\d+)$/.exec(countWords(root));
    assert.equal(last[1], last[2]);
    const play = act(root, 'play');
    play.click();
    assert.equal(isPlaying(), true);
    assert.equal(text(play), 'Pause', 'the word changes on the press, before any picture is read');
    await wait(PLAY_FRAME_MS * 1.5);
    await settle();
    assert.equal(countWords(root), `Picture 1 of ${last[2]}`, 'round from the last to the first');
    await wait(PLAY_FRAME_MS);
    await settle();
    assert.equal(countWords(root), `Picture 2 of ${last[2]}`, 'and on');
    assert.equal(act(root, 'play'), play, 'the button stands while the pictures turn: a press on it is never lost to a redraw');
    play.click();
    assert.equal(isPlaying(), false, 'Pause stops it where it stands');
    assert.equal(text(play), 'Play', 'at once');
    await wait(PLAY_FRAME_MS * 1.5);
    await settle();
    assert.equal(countWords(root), `Picture 2 of ${last[2]}`, 'and it stays stopped');
    act(root, 'play').click();
    await settle();
    all(root, 'repl-item').find((node) => text(node) === 'Imp').click();
    await settle();
    assert.equal(isPlaying(), false, 'another thing picked stops it');
    assert.equal(text(act(root, 'play')), 'Play');
    assert.match(countWords(root), /^Picture 1 of \d+$/);
  } finally {
    releaseReplacementsPane();
    body.remove();
    setReplacementBackend(null);
  }
});

test('replacements: the picture number is typed - a number from 1 to the count shows that picture, anything else is not taken', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  const act = (root, name) => root.querySelectorAll('input, button').find((node) => node.dataset.act === name);
  const type = async (input, value) => {
    input.value = value;
    input.dispatch('input', {});
    await settle();
  };
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    all(root, 'repl-tab')[4].click();   // Enemies
    await settle();
    all(root, 'repl-item').find((node) => text(node) === 'Rat').click();
    await settle();
    const number = act(root, 'picture-number');
    assert.equal(number.value, '1');
    assert.match(countWords(root), /^Picture 1 of (\d+)$/, 'the language\'s own words round the box');
    const count = Number(/of (\d+)$/.exec(countWords(root))[1]);
    act(root, 'play').click();
    number.onfocus();
    assert.equal(isPlaying(), false, 'a number taken in hand stops Play');
    await type(number, '12');
    assert.equal(number.value, '12');
    assert.equal(text(root.querySelector('.repl-file')), pictureFileName((await itemPictures((await replacementItems('enemies')).find((item) => item.name === 'Rat')))[11]),
      'the twelfth picture is shown at once');
    await type(number, `${count + 1}`);
    assert.equal(number.value, '12', 'past the count is not taken');
    await type(number, '0');
    assert.equal(number.value, '12', 'nor 0');
    await type(number, '3a');
    assert.equal(number.value, '3', 'a letter is dropped');
    await type(number, '');
    assert.equal(number.value, '', 'emptied to type another');
    number.onblur();
    assert.equal(number.value, '3', 'and left empty it reads the picture shown');
  } finally {
    releaseReplacementsPane();
    body.remove();
    setReplacementBackend(null);
  }
});

test('replacements: Export asks where first, then writes every kept replacement there in one zip, and says how many', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    const exportButton = root.querySelectorAll('button').find((node) => node.dataset.act === 'export');
    assert.equal(text(exportButton), 'Export');
    assert.equal(exportButton.disabled, true, 'nothing to export yet');
    await saveReplacements([{ archive: 255, record: 0, frame: 0, width: 65, height: 67, blob: new Blob([pngHeader(65, 67)], { type: 'image/png' }) }]);
    await settle();
    assert.equal(exportButton.disabled, false);

    const steps = [];
    const written = [];
    const target = { name: 'my pack.zip', write: async (blob) => { steps.push('write'); written.push(blob); } };
    const askTarget = async (name) => { steps.push(`ask ${name}`); return target; };
    const buildZip = async () => { steps.push('build'); return { blob: new Blob(['zip']), count: 2 }; };
    assert.equal((await exportFiles({ askTarget, buildZip })).count, 2);
    assert.match(steps[0], /^ask dfo-replacements-\d{4}-\d{2}-\d{2}\.zip$/, 'the dialog first, while the press still counts');
    assert.deepEqual(steps.slice(1), ['build', 'write']);
    assert.equal(written.length, 1);
    assert.equal(text(root.querySelector('.repl-note')), 'Exported 2 replacements to my pack.zip.');
    assert.equal(exportButton.disabled, false, 'awake again once written');

    steps.length = 0;
    assert.equal(await exportFiles({ askTarget: async () => null, buildZip }), null, 'the dialog cancelled');
    assert.deepEqual(steps, [], 'nothing built, nothing written');
    assert.equal(text(root.querySelector('.repl-note')), 'Exported 2 replacements to my pack.zip.', 'the line stands');

    const failing = { name: 'x.zip', write: async () => { throw new Error('the disk is full'); } };
    assert.equal(await exportFiles({ askTarget: async () => failing, buildZip }), null);
    assert.equal(text(root.querySelector('.repl-note')), 'The export could not be saved. Nothing was written.');
    assert.ok(root.querySelector('.repl-note').className.includes('repl-refusal'));
  } finally {
    releaseReplacementsPane();
    body.remove();
    setPlayerReplacements([]);
    setReplacementBackend(null);
  }
});

test('replacements: Choose and Load CIF refuse a file past 64 MB before reading it, a disguised PNG, and a picture too big to read', async () => {
  setReplacementBackend(memoryReplacementBackend());
  const accepted = [{ width: 65, height: 67 }];
  const picture = { archive: 255, record: 0, frame: 0 };
  try {
    let read = false;
    const huge = { name: 'huge.png', size: 65 * 1024 * 1024, arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } };
    assert.equal((await choosePicture(null, picture, accepted, huge, null)).reason, 'tooLarge');
    assert.equal(read, false, 'asked by its size, never read');
    const page = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    assert.equal((await choosePicture(null, picture, accepted, fileOf(page, 'page.png'), null)).reason, 'notPng', 'markup named .png');
    const bare = pngHeader(65, 67).slice(0, 33);
    assert.equal((await choosePicture(null, picture, accepted, fileOf(bare), null)).reason, 'notPng', 'a header with nothing behind it');
    assert.deepEqual(await choosePicture(null, picture, accepted, fileOf(pngHeader(65 * 300, 67 * 300)), null), { reason: 'tooBig', width: 19500, height: 20100 });
    assert.equal((await listReplacements()).length, 0, 'none kept');
    assert.equal((await chooseCifFile('WEAPON04.CIF', huge, null, async () => ({ counts: [1], sizes: [] }))).reason, 'tooLarge');
  } finally {
    setPlayerReplacements([]);
    setReplacementBackend(null);
  }
});

test('replacements: a picture the port builds in code (the Weir Key\'s) shows as its Original and takes a replacement with no game running', { skip: NO_DATA }, async () => {
  assert.equal(textureDeriveContext(), null, 'no game\'s pipeline is up here, as on the title screen');
  // the painting is registered once, at the key's import; a test before this one cleared the texture door
  const { registerWeirKeyArt, _resetWeirKeyArt } = await import('../../src/world/eliteGates/egKeyArt.js');
  _resetWeirKeyArt();
  registerWeirKeyArt(addVendorTextures);
  const key = (await replacementItems('items')).find((item) => item.id === 'item-575');
  assert.ok(key, 'the Weir Key is listed');
  assert.deepEqual(key.pictures, [{ archive: 38282, record: 0, frame: 0 }]);
  const original = await itemOriginal(key, key.pictures[0]);
  assert.deepEqual([original.classic, original.overhaul?.width, original.overhaul?.height], [null, 32, 22], 'the port\'s own painting, built for the pane');
  assert.deepEqual(await originalSizes({ kind: 'texture', archive: 38282, record: 0, frame: 0 }), [{ width: 32, height: 22 }], 'and Import has its size to hold a picture to');
});

test('replacements: Only show replaced keeps the things the player replaced a picture of, on every tab, and follows a change', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  let toggle = null;
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    all(root, 'repl-tab')[4].click();   // Enemies
    await settle();
    const rows = () => all(root, 'repl-item').map(text);
    const everyone = rows().length;
    assert.ok(everyone > 100);
    toggle = root.querySelectorAll('input').find((node) => node.dataset.act === 'only-replaced');
    assert.equal(text(toggle.parentNode.children[1]), 'Only show replaced', 'at the top of the list');
    assert.equal(toggle.parentNode.parentNode.className, 'repl-list');
    assert.equal(toggle.checked, false, 'off at first');
    await saveReplacements([{ archive: 255, record: 0, frame: 0, width: 65, height: 67, blob: new Blob([pngHeader(65, 67)], { type: 'image/png' }) }]);
    await settle();
    toggle.checked = true;
    toggle.onchange();
    assert.deepEqual(rows(), ['Rat'], 'the Rat alone, the one replaced');
    assert.ok(all(root, 'repl-item')[0].className.includes('own'), 'still green');
    all(root, 'repl-tab')[6].click();   // World
    await settle();
    assert.deepEqual(rows(), [], 'on every tab');
    assert.equal(text(root.querySelector('.repl-rows').children[0]), 'You have not replaced anything on this tab.');
    all(root, 'repl-tab')[4].click();
    await settle();
    assert.deepEqual(rows(), ['Rat']);
    await clearAllReplacements();
    await settle();
    assert.deepEqual(rows(), [], 'a picture cleared leaves the list');
    toggle.checked = false;
    toggle.onchange();
    assert.equal(rows().length, everyone, 'off: every thing again');
  } finally {
    if (toggle?.checked) {
      toggle.checked = false;
      toggle.onchange();
    }
    releaseReplacementsPane();
    body.remove();
    setPlayerReplacements([]);
    setReplacementBackend(null);
  }
});

test('replacements: Clear All asks first on the menu\'s Yes/No card, and Yes clears every replacement', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  const asked = [];
  const ask = (lines, onYes) => asked.push({ lines, onYes });
  try {
    drawReplacementsPane(body, { ask });
    await settle();
    let root = body.children[0];
    const clearAll = () => root.querySelectorAll('button').find((node) => node.dataset.act === 'clear-all');
    assert.equal(clearAll().disabled, true, 'nothing to clear yet');
    const blob = new Blob([pngHeader(8, 8)], { type: 'image/png' });
    await saveReplacements([
      { archive: 255, record: 0, frame: 0, width: 65, height: 67, blob },
      { archive: 112366, record: 0, frame: 0, width: 53, height: 110, blob },
    ]);
    await settle();
    root = body.children[0];
    assert.equal(clearAll().disabled, false);
    assert.ok(clearAll().parentNode.className.includes('repl-tools'), 'beside Import and Export');
    assert.deepEqual([...clearAll().parentNode.children].map((node) => node.dataset.act), ['import', 'export', 'clear-all']);
    clearAll().click();
    assert.deepEqual(asked.map((question) => question.lines), [['This will clear all replacements you have made in the game, are you sure?']]);
    assert.equal((await listReplacements()).length, 2, 'nothing cleared before Yes');
    await asked[0].onYes();
    await settle();
    assert.equal((await listReplacements()).length, 0, 'Yes clears them all');
    assert.equal(hasPlayerReplacement(112366, 0, 0), false);
  } finally {
    releaseReplacementsPane();
    body.remove();
    setPlayerReplacements([]);
    setReplacementBackend(null);
  }
});

test('replacements: only what changed is drawn again - the list, its scroll and a field being typed in stand', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  const blob = new Blob([pngHeader(8, 8)], { type: 'image/png' });
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    const tabs = all(root, 'repl-tab');
    tabs[4].click();   // Enemies
    assert.ok(all(root, 'repl-tab')[4].className.includes('on'), 'the tab is lit on the press, before its list is read');
    assert.ok(!all(root, 'repl-tab')[0].className.includes('on'), 'and the last one is not');
    assert.equal(all(root, 'repl-tab')[4], tabs[4], 'the tabs stand');
    await settle();
    const rat = all(root, 'repl-item').find((node) => text(node) === 'Rat');
    const imp = all(root, 'repl-item').find((node) => text(node) === 'Imp');
    rat.click();
    await settle();
    assert.equal(all(root, 'repl-item').find((node) => text(node) === 'Imp'), imp, 'picking a thing keeps the list\'s rows');
    assert.ok(rat.className.includes('on') && !imp.className.includes('on'), 'and lights the picked row in place');

    const filter = root.querySelector('.repl-filter');
    filter.focus();
    filter.dispatch('focus', {});
    filter.value = 'ra';
    filter.dispatch('input', {});
    const ratRow = all(root, 'repl-item').find((node) => text(node) === 'Rat');
    await saveReplacements([{ archive: 255, record: 0, frame: 0, width: 65, height: 67, blob }]);
    await settle();
    assert.equal(root.querySelector('.repl-filter'), filter, 'the store\'s answer leaves the filter standing');
    assert.equal(filter.value, 'ra');
    assert.equal(document.activeElement, filter, 'with the keyboard in it');
    assert.equal(all(root, 'repl-item').find((node) => text(node) === 'Rat'), ratRow, 'and the rows standing');
    assert.ok(ratRow.className.includes('own'), 'the Rat\'s row turned green in place');
    assert.equal(root.querySelectorAll('button').find((node) => node.dataset.act === 'clear-all').disabled, false, 'Clear All woke');

    body.replaceChildren();   // the menu's own repaint: a new pane
    drawReplacementsPane(body);
    await settle();
    const again = body.children[0].querySelector('.repl-filter');
    assert.equal(again.value, 'ra', 'the filter typed');
    assert.equal(document.activeElement, again, 'and the keyboard, in the pane drawn anew');
    body.children[0].dispatch('pointerdown', { target: body.children[0].querySelector('.repl-item') });
    body.replaceChildren();
    drawReplacementsPane(body);
    await settle();
    assert.notEqual(document.activeElement, body.children[0].querySelector('.repl-filter'), 'left for another control, it is not taken back');
  } finally {
    releaseReplacementsPane();
    body.remove();
    setPlayerReplacements([]);
    setReplacementBackend(null);
  }
});

test('replacements: a weapon\'s pictures for one metal or every one, its first-person frames plain and enchanted under them, and Clear takes all', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  const blob = (width, height) => new Blob([pngHeader(width, height)], { type: 'image/png' });
  const fileOfSize = (width, height) => fileOf(pngHeader(width, height));
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    all(root, 'repl-tab')[1].click();   // Gear
    await settle();
    const filter = root.querySelector('.repl-filter');
    filter.value = 'longsword';
    filter.dispatch('input', {});
    all(root, 'repl-item').find((node) => text(node) === 'Longsword').click();
    await settle();
    const viewers = all(root, 'repl-viewer');
    assert.equal(viewers.length, 3, 'its own pictures and its first-person frames, plain and enchanted');
    assert.deepEqual(viewers.slice(1).map((viewer) => text(viewer.querySelector('h4'))), ['First person', 'First person, enchanted']);
    assert.deepEqual(viewers.slice(1).map((viewer) => text(viewer.querySelector('.repl-file-name'))), ['CIF file: WEAPON04.CIF', 'CIF file: WEAPO104.CIF'],
      'each sheet names the CIF its frames are cut from');
    assert.equal(text(viewers[1].querySelector('.repl-caption')), 'Ready, frame 1 of 1', 'each frame named by its swing');
    const files = all(root, 'repl-file').map(text);
    assert.deepEqual(files, ['233_12-0.png', 'LONGSWORD.CIF_0-0.png', 'LONGSWORDMAGIC.CIF_0-0.png'], 'every metal at once: the bare names');
    const metal = root.querySelector('.repl-metal-select');
    metal.value = 'Daedric';
    metal.onchange();
    await settle();
    assert.deepEqual(all(root, 'repl-file').map(text), ['233_12-0_Daedric.png', 'LONGSWORD.CIF_0-0_Daedric.png', 'LONGSWORDMAGIC.CIF_0-0_Daedric.png'], 'one metal: its names');

    const iconSize = /of (\d+) x (\d+)/.exec(text(viewers[0].querySelector('.meta')));
    const frameSize = /of (\d+) x (\d+)/.exec(text(viewers[1].querySelector('.meta')));
    const icon = { archive: 233, record: 12, frame: 0, dye: 'Daedric' };
    assert.equal(await choosePicture(root, icon, [{ width: Number(iconSize[1]), height: Number(iconSize[2]) }], fileOfSize(Number(iconSize[1]), Number(iconSize[2]))), null);
    const frame = { kind: 'picture', name: 'LONGSWORD.CIF_0-0_Daedric' };
    assert.equal(await choosePicture(root, frame, [{ width: Number(frameSize[1]), height: Number(frameSize[2]) }], fileOfSize(Number(frameSize[1]) * 2, Number(frameSize[2]) * 2)), null);
    await settle();
    assert.deepEqual((await listReplacements()).map((replacement) => replacement.key).sort(), ['233_12-0_Daedric', 'name:LONGSWORD.CIF_0-0_Daedric']);
    assert.equal(hasTextureReplacement(233, 12, 0, 'Albedo', DYE_COLORS.Daedric), true, 'a Daedric longsword\'s icon is the player\'s');
    assert.equal(hasTextureReplacement(233, 12, 0, 'Albedo', DYE_COLORS.Iron), false, 'an Iron one keeps its own');
    assert.equal(hasPlayerPicture('LONGSWORD.CIF_0-0_Daedric'), true, 'the weapon in hand draws the player\'s Daedric frame');
    assert.equal(hasPlayerPicture('LONGSWORD.CIF_0-0_Iron'), false, 'and its own for Iron');
    assert.ok(all(root, 'repl-item').find((node) => text(node) === 'Longsword').className.includes('own'));

    metal.value = '';
    metal.onchange();
    await settle();
    assert.equal(text(root.querySelector('.repl-preview')), 'None', 'every metal at once has no picture of its own yet');
    await saveReplacements([{ archive: 234, record: 12, frame: 0, width: 4, height: 4, blob: blob(4, 4) }]);
    await settle();
    const clear = root.querySelectorAll('button').find((node) => node.dataset.act === 'clear');
    assert.equal(clear.disabled, false);
    clear.click();
    await settle();
    assert.deepEqual(await listReplacements(), [], 'Clear takes every picture of the longsword: each metal, both bodies, first person too');
  } finally {
    releaseReplacementsPane();
    body.remove();
    setPlayerReplacements([]);
    setPlayerPictures([]);
    setReplacementBackend(null);
  }
});

/** Pick a thing on a tab by its name, the filter typed as a player types it. */
async function pick(root, tab, name) {
  all(root, 'repl-tab')[REPLACEMENT_TABS.indexOf(tab)].click();
  await settle();
  const filter = root.querySelector('.repl-filter');
  filter.value = name.toLowerCase();
  filter.dispatch('input', {});
  all(root, 'repl-item').find((node) => text(node) === name).click();
  await settle();
}
const sectionOf = (root, id) => all(root, 'repl-viewer').find((viewer) => viewer.dataset.section === id);

test('replacements: Load CIF keeps a whole CIF in the game\'s place - refused in red when its shape is not the game file\'s - and Clear CIF takes it away', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  const cif = (name) => new Uint8Array(readFileSync(join(ARENA2, name)));
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    await pick(root, 'gear', 'Longsword');
    const choose = async (bytes, name) => {
      const input = sectionOf(root, 'first-person').querySelectorAll('input').find((node) => node.type === 'file' && node.accept.includes('cif'));
      input.files = [fileOf(bytes, name)];
      input.onchange();
      await settle();
    };
    await choose(cif('FIRE00C6.CIF'), 'FIRE00C6.CIF');
    assert.equal(text(sectionOf(root, 'first-person').querySelector('.repl-refusal')), 'Rejected: this CIF\'s records and frames do not match the game\'s WEAPON04.CIF.');
    await choose(new Uint8Array(12), 'notes.cif');
    assert.equal(text(sectionOf(root, 'first-person').querySelector('.repl-refusal')), 'Rejected: this file is not a CIF.');
    assert.deepEqual(await listReplacements(), [], 'nothing refused is kept');

    await choose(cif('WEAPON04.CIF'), 'my long blades.cif');
    const section = sectionOf(root, 'first-person');
    assert.equal(section.querySelector('.repl-refusal').hidden, true, 'the refusal goes with a good choice');
    assert.deepEqual((await listReplacements()).map((replacement) => [replacement.key, replacement.fileName]), [['file:WEAPON04.CIF', 'my long blades.cif']]);
    assert.equal(hasPlayerFile('WEAPON04.CIF'), true, 'the weapon in hand reads it in place of the game\'s');
    assert.ok(all(section, 'repl-file').map(text).includes('From your WEAPON04.CIF'), 'each frame\'s replacement is the copy\'s');
    assert.ok(section.querySelector('.repl-preview').querySelector('canvas'), 'drawn from the copy');
    assert.ok(section.querySelector('.repl-count').className.includes('own'), 'the count is green');
    assert.ok(all(root, 'repl-item').find((node) => text(node) === 'Longsword').className.includes('own'), 'the Longsword is green');
    const act = (name) => section.querySelectorAll('button').find((node) => node.dataset.act === name);
    assert.equal(act('clear-selected').disabled, true, 'a frame of the copy is not a picture of its own');
    assert.equal(act('clear-cif').disabled, false);
    act('clear-cif').click();
    await settle();
    assert.deepEqual(await listReplacements(), [], 'Clear CIF takes the copy away');
    assert.equal(hasPlayerFile('WEAPON04.CIF'), false);
    assert.equal(sectionOf(root, 'first-person').querySelector('.repl-preview').textContent, 'None');
  } finally {
    releaseReplacementsPane();
    body.remove();
    setPlayerFiles([]);
    setReplacementBackend(null);
  }
});

test('replacements: the Player tab has each race\'s paper doll, the hands and claws in first person, and the held map', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    all(root, 'repl-tab')[0].click();   // Player
    await settle();
    const names = all(root, 'repl-item').map(text);
    for (const race of ['Breton', 'Redguard', 'Nord', 'Dark Elf', 'High Elf', 'Wood Elf', 'Khajiit', 'Argonian'])
      assert.ok(names.includes(`Paper doll: ${race}`), `${race}'s paper doll is listed`);
    await pick(root, 'player', 'Paper doll: Khajiit');
    assert.deepEqual(all(root, 'repl-viewer').map((viewer) => text(viewer.querySelector('h4'))), ['Body', "Men's heads", "Women's heads", 'Background']);
    const bodyViewer = sectionOf(root, 'body');
    assert.equal(text(bodyViewer.querySelector('.repl-file')), 'BODY06I0.IMG.png', 'the race\'s own body, named as DFU names a loose IMG');
    assert.equal(text(bodyViewer.querySelector('.repl-caption')), 'Man, unclothed');
    assert.equal(text(sectionOf(root, 'heads-female').querySelector('.repl-file-name')), 'CIF file: FACE16I0.CIF');
    assert.equal(text(sectionOf(root, 'heads-female').querySelector('.repl-file')), 'FACE16I0.CIF_0-0.png');

    await pick(root, 'player', 'Hands (first person)');
    const hands = sectionOf(root, 'first-person');
    assert.equal(text(hands.querySelector('.repl-file-name')), 'CIF file: WEAPON10.CIF');
    assert.equal(text(hands.querySelector('.repl-file')), 'WEAPON10.CIF_0-0.png', 'chosen for every metal: the game asks the hands as iron');
    assert.match(countWords(root), /^Picture 1 of 31$/, 'the ready pose and six swings of five frames');
    await pick(root, 'player', 'Werebeast claws (first person)');
    assert.equal(text(sectionOf(root, 'first-person').querySelector('.repl-file-name')), 'CIF file: WEAPON11.CIF');

    const map = (await replacementItems('player')).find((item) => item.id === 'held-map');
    const [painting] = await itemSections(map);
    assert.deepEqual([painting.kind, painting.pictures[0].name], ['named', 'held-map']);

    await pick(root, 'player', 'Climbing hands');
    const climb = sectionOf(root, 'painting');
    assert.equal(text(climb.querySelector('.meta')), 'Paint a left hand. The game mirrors it for the right hand.');
    const climbing = (await replacementItems('player')).find((item) => item.id === 'climb-hands');
    assert.deepEqual((await itemSections(climbing))[0].pictures.map((picture) => picture.name), ['climb-grip', 'climb-reach'], 'named as Import reads them');
    assert.equal(text(climb.querySelector('.repl-caption')), 'Fist on the wall');
    assert.match(countWords(root), /^Picture 1 of 2$/, 'the fist and the reaching arm');
  } finally {
    releaseReplacementsPane();
    body.remove();
    setReplacementBackend(null);
  }
});

test('replacements: the curses\' paper doll art, the expansion\'s enemies and the conversation faces are listed', { skip: NO_DATA }, async () => {
  const curses = (await replacementItems('player')).find((item) => item.id === 'curses');
  const sections = await itemSections(curses);
  assert.deepEqual(sections.map((section) => section.title()), ['Werewolf', 'Wereboar', 'Vampire heads', 'Vampire backdrop']);
  assert.deepEqual(sections[0].pictures.map((picture) => [picture.name, picture.caption()]), [['WOLF00I0.IMG', 'Body'], ['WERE01I0.IMG', 'Head']]);
  const heads = sections[2].sheet;
  assert.deepEqual([heads.file, heads.counts.length, heads.captions[0](), heads.captions[15]()], ['VAMP00I0.CIF', 16, 'Breton, woman', 'Argonian, man'],
    'the women\'s heads by race, then the men\'s (vampirism.js racialOverrideHeadArt)');

  const enemies = await replacementItems('enemies');
  const archer = enemies.find((item) => item.name === 'Archer Rider');
  assert.ok(archer, 'the Enemy Expansion\'s enemies are listed');
  assert.deepEqual(archer.sources.map((source) => source.archive).sort(), [1532, 1533]);
  assert.ok((await itemPictures(archer)).length > 0, 'with their pictures');

  const npcs = await replacementItems('npcs');
  const faces = await Promise.all(npcs.slice(0, 3).map(async (item) => [item.name, (await itemSections(item))[0].sheet.counts.length]));
  assert.deepEqual(faces, [['Conversation faces', 503], ['Special faces', 61], ["Children's faces", 4]]);
});

test('replacements: the artifacts, the port\'s guns and the mounts are listed, each with its own pictures and sheets', { skip: NO_DATA }, async () => {
  const [gear, items] = await Promise.all([replacementItems('gear'), replacementItems('items')]);
  const byName = (name) => [...gear, ...items].find((item) => item.name === name);
  const blade = byName('Ebony Blade');
  assert.equal(blade.tab, 'gear');
  const bladeSections = await itemSections(blade);
  assert.deepEqual(bladeSections[0].pictures.map((picture) => `${picture.archive}_${picture.record}`), ['432_5', '433_5'], 'a man\'s and a woman\'s icon');
  assert.match(bladeSections[1].sheet.file, /^(EBONYBLADE|WEAPO104)\.CIF$/, 'its own first-person sheet (Diverse Weapons\' while it is on)');
  assert.equal(bladeSections[1].sheet.gameMetal, 'Ebony', 'in its own material');
  assert.equal(byName('Oghma Infinium').tab, 'items', 'an artifact that cannot be equipped');
  assert.ok(!(await replacementItems('world')).some((item) => ['world-432', 'world-433'].includes(item.id)), 'the artifacts\' pictures are theirs, not a set\'s');

  const thunderlock = byName('Dwarven Thunderlock');
  assert.equal(thunderlock.tab, 'gear');
  const gunSections = await itemSections(thunderlock);
  assert.deepEqual(gunSections[0].pictures.map((picture) => `${picture.archive}_${picture.record}`), ['560_0', '560_1', '560_2', '560_3'], 'the doll\'s and the list\'s, plain and gilded');
  assert.deepEqual(gunSections[1].pictures.map((picture) => picture.name), ['thunderlock-frames'], 'and its first-person strip');
  assert.equal(byName('Dwemer Pellet').tab, 'items');

  const riding = (await replacementItems('player')).find((item) => item.id === 'riding');
  const mounts = await itemSections(riding);
  assert.deepEqual(mounts.map((section) => [section.title(), section.sheet.file, section.sheet.counts[0], section.sheet.copyable]), [['Horse', 'MRED00I0.CFA', 4, false], ['Cart', 'MRED01I0.CFA', 4, false]],
    'four frames each; a CFA has no copy the game reads, so no Load CIF');
});

test('replacements: Gear lists what can be equipped, and Items what has a picture but cannot be', async () => {
  const [gear, items] = await Promise.all([replacementItems('gear'), replacementItems('items')]);
  const names = (list) => new Set(list.map((item) => item.name));
  for (const name of ['Longsword', 'Cuirass', 'Ring', 'Ruby']) assert.ok(names(gear).has(name), `${name} is Gear`);
  for (const name of ['Twigs', 'Mercury', 'Book', 'Spellbook', 'Arrow', 'Wand', 'Torch']) assert.ok(names(items).has(name), `${name} is an Item`);
  assert.ok(items.every((item) => item.tab === 'items') && gear.every((item) => item.tab === 'gear'));
  assert.equal(gear.filter((item) => items.some((other) => other.id === item.id)).length, 0, 'no thing on both');
});

test('replacements: the Magic tab has the spell icons, each element\'s casting hands and its missile', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    await pick(root, 'magic', 'Spell icons');
    assert.match(countWords(root), /^Picture 1 of 69$/);
    assert.equal(text(root.querySelector('.repl-file')), 'ICON00I0.IMG_0.png');
    assert.equal(text(all(root, 'repl-notes')[0].children[0]), 'Needs a PNG of 16 x 16, or bigger in the same proportions.');
    await pick(root, 'magic', 'Casting hands: Fire');
    assert.equal(text(root.querySelector('.repl-file-name')), 'CIF file: FIRE00C6.CIF');
    assert.match(countWords(root), /^Picture 1 of 6$/);
    await pick(root, 'magic', 'Spell missile: Shock');
    assert.equal(text(root.querySelector('.repl-file')), '378_0-0.png');
    const world = (await replacementItems('world')).map((item) => item.id);
    assert.ok(!world.includes('world-375') && !world.includes('world-379'), 'the missiles are the Magic tab\'s alone');
  } finally {
    releaseReplacementsPane();
    body.remove();
    setReplacementBackend(null);
  }
});

test('replacements: the mouse wheel over the picture number steps through the pictures, held to 1 and the count', { skip: NO_DATA }, async () => {
  setReplacementBackend(memoryReplacementBackend());
  const body = document.createElement('div');
  document.body.append(body);
  try {
    drawReplacementsPane(body);
    await settle();
    const root = body.children[0];
    all(root, 'repl-tab')[4].click();   // Enemies
    await settle();
    all(root, 'repl-item').find((node) => text(node) === 'Rat').click();
    await settle();
    const number = root.querySelectorAll('input').find((node) => node.dataset.act === 'picture-number');
    let prevented = 0;
    const wheel = async (deltaY) => {
      number.dispatch('wheel', { deltaY, preventDefault: () => { prevented++; } });
      await settle();
    };
    await wheel(-100);
    await wheel(-100);
    assert.equal(number.value, '3', 'the wheel up: on through the pictures');
    assert.equal(countWords(root).startsWith('Picture 3 of'), true);
    await wheel(100);
    assert.equal(number.value, '2', 'the wheel down: back');
    for (let i = 0; i < 4; i++) await wheel(100);
    assert.equal(number.value, '1', 'never under 1');
    assert.equal(prevented, 7, 'and the page under it never scrolls');
  } finally {
    releaseReplacementsPane();
    body.remove();
    setReplacementBackend(null);
  }
});

test('replacements: same-named clothing is told apart, men\'s or women\'s and a cut', { skip: NO_DATA }, async () => {
  const names = (await replacementItems('gear')).map((item) => item.name);
  assert.ok(names.includes('Long Shirt (men\'s, cut 1)') && names.includes('Long Shirt (women\'s, cut 5)'));
  assert.ok(names.includes('Long Skirt (women\'s)'));
  assert.equal(names.filter((name) => name === 'Long Shirt').length, 0, 'no bare Long Shirt is left');
  assert.equal(new Set(names).size, names.length, 'and no two things share a name');
});
