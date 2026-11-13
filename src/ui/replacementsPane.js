// The Replacements pane: the player swaps one of the game's pictures for a PNG of their own.
//
// Tabs on top, a tab's things on the left, the picked thing's sections on the right, each a viewer: what the game
// draws without the player's replacement (an overhaul's, else the original) over the player's own, with Choose. A CIF
// sheet's viewer also takes a whole CIF file. A weapon's or armour's pictures are chosen for one metal or every one.
// Import keeps a zip's pictures and CIF files at once, Export saves them all in one; Clear takes every picture of the
// thing away, Clear Selected the one shown. Blue marks an overhaul's change, green the player's. Only what changed is
// drawn again.
import { t } from '../systems/textManager.js';
import {
  REPLACEMENT_TABS,
  replacementItems,
  itemSections,
  itemFileNames,
  nameIsItems,
  namesOverhauled,
  itemOriginal,
  itemNotes,
  REPLACEMENT_METALS,
  textureDyeOf,
  sheetPictures,
  sheetOriginal,
  sheetCopyPicture,
  namedOriginal,
} from '../systems/replacements/replacementCatalog.js';
import {
  listReplacements,
  saveReplacement,
  clearReplacements,
  clearAllReplacements,
  onReplacementsChange,
  textureReplacementKey,
  pictureReplacementKey,
  fileReplacementKey,
} from '../systems/replacements/replacementStore.js';
import { importReplacementZip } from '../systems/replacements/replacementImport.js';
import { exportReplacementZip, exportZipName } from '../systems/replacements/replacementExport.js';
import { acceptedSizes, replacementRefusal, cifRefusal, pngSize, drawnSize } from '../systems/replacements/replacementRules.js';
import { cleanPng, MAX_FILE_BYTES } from '../systems/replacements/replacementSafety.js';
import { askSaveTarget } from './saveFileAs.js';
import { classicRecords } from '../systems/replacements/classicRecords.js';
import { picturesCoveredBelowPlayer, textureName, isVendorArchive } from '../systems/textureReplacement.js';
import { cifPictureName } from '../systems/replacements/playerPictures.js';
import { metalLabel } from '../systems/item/itemInfo.js';

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

/** The tabs' words, each one literal call so the catalog of strings reads them off the source. */
const TAB_TITLES = Object.freeze({
  player: () => t('menu.repl.tab.player', 'Player'),
  gear: () => t('menu.repl.tab.gear', 'Gear'),
  items: () => t('menu.repl.tab.items', 'Items'),
  magic: () => t('menu.repl.tab.magic', 'Magic'),
  enemies: () => t('menu.repl.tab.enemies', 'Enemies'),
  npcs: () => t('menu.repl.tab.npcs', 'NPCs'),
  world: () => t('menu.repl.tab.world', 'World'),
});

/** The pane's state between draws: the open tab, the thing picked on each tab, the picture shown in each section's
 *  viewer, the metal chosen, the filter, a field being typed in, and what the last Import or Export did. */
const paneState = {
  tab: REPLACEMENT_TABS[0],
  pickedByTab: /** @type {Record<string, string>} */ ({}),
  /** The picture each section's viewer shows, by the section's id. */
  pictureBySection: /** @type {Record<string, number>} */ ({}),
  /** The metal a weapon's or armour's pictures are shown and chosen for (MATERIAL_NAMES), or null for every one. */
  metal: /** @type {string|null} */ (null),
  filter: '',
  /** Only show replaced: the list keeps the things the player replaced a picture of, on every tab. */
  onlyReplaced: false,
  /** The field being typed in when the pane is drawn again and its caret, so a redraw gives them back. */
  typing: /** @type {{ field: string, start: number, end: number } | null} */ (null),
  /** What the last Import or Export did, said under the tabs until the next one: `{ text, refused }`. */
  toolNote: /** @type {{ text: string, refused: boolean } | null} */ (null),
  /** An export being written: a second press waits for it. */
  exporting: false,
};
let fillSequence = 0;
let boxSequence = 0;
let stopListening = null;
/** The pane drawn now: its frame's standing parts, the open tab's things and their marks, and the box's viewers. */
const view = {
  root: null,
  box: null,
  item: null,
  tabs: /** @type {Map<string, any> | null} */ (null),
  clearAll: null,
  exportButton: null,
  note: null,
  filter: null,
  rows: null,
  items: /** @type {any[]} */ ([]),
  rowsById: new Map(),
  keptByKey: new Map(),
  /** The player's TEXTURE pictures by archive and record, the names of their other pictures, and their CIF files: the
   *  green. */
  own: new Map(),
  ownNames: /** @type {string[]} */ ([]),
  ownFiles: new Set(),
  overhauled: new Map(),
  /** Each thing's names besides its TEXTURE records on the open tab (replacementCatalog.js itemFileNames), by id. */
  itemNames: new Map(),
  boxClear: null,
  /** The box's TEXTURE pictures, and the viewers showing its sections. */
  texturePictures: /** @type {any[]} */ ([]),
  viewers: /** @type {any[]} */ ([]),
  /** The bytes of each kept CIF file read so far, by key and the time it was kept. */
  copyBytes: new Map(),
};
const NO_NAMES = Object.freeze({ names: [], files: [] });

/** How long Play shows each picture. */
export const PLAY_FRAME_MS = 300;
export const isPlaying = () => view.viewers.some((viewer) => !!viewer.playback);
/** Pause every viewer: its loop stops where it stands, and its Play says so at once. */
function stopPlayback() {
  for (const viewer of view.viewers) stopViewer(viewer);
}
function stopViewer(viewer) {
  if (viewer.playback) clearTimeout(viewer.playback.timer);
  viewer.playback = null;
  paintPlayButton(viewer);
}
function startViewer(viewer) {
  if (viewer.source.pictures.length < 2) return;
  viewer.playback = { timer: null };
  queueNextPicture(viewer);
}
/** The next picture after PLAY_FRAME_MS, round to the first after the last; drawn before the one after it is queued. */
function queueNextPicture(viewer) {
  const loop = viewer.playback;
  loop.timer = setTimeout(async () => {
    if (viewer.playback !== loop) return;
    if (!view.root?.isConnected || !view.viewers.includes(viewer)) return stopViewer(viewer);
    viewer.source.setIndex((viewer.source.getIndex() + 1) % viewer.source.pictures.length);
    await viewer.show();
    if (viewer.playback === loop) queueNextPicture(viewer);
  }, PLAY_FRAME_MS);
}

/** Let go of every viewer's preview URLs. */
function releasePreviews() {
  for (const viewer of view.viewers) releaseViewerPreviews(viewer);
}
function releaseViewerPreviews(viewer) {
  for (const url of viewer.urls) URL.revokeObjectURL(url);
  viewer.urls = new Set();
}

/** The menu's unmount: the previews, Play and the store's listener go with the menu. */
export function releaseReplacementsPane() {
  stopPlayback();
  releasePreviews();
  stopListening?.();
  stopListening = null;
}

/** The Yes/No card that asks before Clear All (the menu's own, `lines` and what Yes does), or null to ask nothing. */
let askYesNo = null;

/** The pane, into `body`. `ask` is the menu's Yes/No card (ui/enhanced/enhancedMenu.js askCard). Its frame is built
 *  once; each part - a tab's list, the box, a row's marks, a viewer's picture, a line - draws again alone. */
export function drawReplacementsPane(body, { ask = null } = {}) {
  askYesNo = ask;
  injectReplacementsStyle();
  const root = element('div', 'repl');
  root.addEventListener('pointerdown', leftTyping);
  body.append(root);
  buildFrame(root);
  if (paneState.typing?.field === 'filter') giveBackTyping(view.filter);
  stopListening?.();
  stopListening = onReplacementsChange(() => {
    if (root.isConnected) keptChanged();
    else releaseReplacementsPane();
  });
  openTab();
}

/** The overhauls and packs registered with the texture door, so the blue marks and the upper picture read them. The
 *  menu can open before a host's boot has registered them. */
async function texturePacksRegistered() {
  try {
    const { textureStoreRegistered } = await import('../scenes/dataSource.js');
    await textureStoreRegistered();
  } catch (e) {
    console.warn('[replacements] the texture packs could not be registered:', e?.message ?? e);
  }
}

/** Pictures (records with an archive and a record, or keys like `233_5-0_Daedric`) grouped by archive, then record. */
function byArchive(pictures) {
  const archives = new Map();
  for (const picture of pictures) {
    let archive = picture?.archive;
    let record = picture?.record;
    if (typeof picture === 'string') {
      const match = /^(\d+)_(\d+)-(\d+)(?:_\w+)?$/.exec(picture);
      if (!match) continue;
      archive = Number(match[1]);
      record = Number(match[2]);
    }
    if (!Number.isFinite(archive)) continue;
    if (!archives.has(archive)) archives.set(archive, new Set());
    archives.get(archive).add(Number(record));
  }
  return archives;
}
/** An item has a picture in `archives`: one of its own records, or any record of an archive it has whole. */
const itemIn = (item, archives) =>
  item.sources.some((source) => {
    const records = archives.get(source.archive);
    if (!records) return false;
    return source.records ? source.records.some((record) => records.has(record)) : records.size > 0;
  });

/** A tab's list and box, read and drawn: the tab's things, the player's replacements and the overhauls' marks. The
 *  tabs, the tools and the filter stand; a later tab opened while this one reads wins. */
async function openTab() {
  const sequence = ++fillSequence;
  const tab = paneState.tab;
  const { root } = view;
  stopPlayback();
  view.items = [];
  view.rowsById = new Map();
  view.rows.replaceChildren();
  view.item = null;
  view.viewers = [];
  view.box.replaceChildren(element('p', 'repl-wait', t('menu.repl.reading', 'Reading the pictures…')));
  const [items, kept] = await Promise.all([
    replacementItems(tab),
    listReplacements().catch(() => []),
    texturePacksRegistered(),
  ]);
  const names = await Promise.all(items.map(async (item) => [item.id, await itemFileNames(item).catch(() => NO_NAMES)]));
  if (sequence !== fillSequence || !root.isConnected) return;
  view.items = items;
  view.itemNames = new Map(names);
  setKept(kept);
  view.overhauled = byArchive([...picturesCoveredBelowPlayer()].filter((key) => !isVendorArchive(Number(key.split('_')[0]))));   // the port's own stand-ins are originals
  let picked = items.find((item) => item.id === paneState.pickedByTab[tab]) ?? null;
  if (!picked && items.length) {
    picked = items[0];
    paneState.pickedByTab[tab] = picked.id;
    paneState.pictureBySection = {};
  }
  view.item = picked;
  paintList();
  paintKeptTools();
  if (picked) await drawBox();
  else view.box.replaceChildren(element('p', 'repl-wait', t('menu.repl.empty', 'Nothing here can be replaced yet.')));
}

/** The player's kept pictures, by key, by archive, by name and by CIF file. */
function setKept(kept) {
  view.keptByKey = new Map(kept.map((replacement) => [replacement.key, replacement]));
  view.own = byArchive(kept.filter((replacement) => (replacement.kind ?? 'texture') === 'texture'));
  view.ownNames = kept.filter((replacement) => replacement.kind === 'picture').map((replacement) => replacement.name);
  view.ownFiles = new Set(kept.filter((replacement) => replacement.kind === 'file').map((replacement) => replacement.file));
}

/** The store's answer to a change (Choose, a clear, Import): the kept pictures read again, and only what shows them
 *  drawn again - the list's marks, Export and Clear All, the box's Clear, and each viewer's picture. */
async function keptChanged() {
  const kept = await listReplacements().catch(() => []);
  if (!view.root?.isConnected) return;
  setKept(kept);
  if (paneState.onlyReplaced) paintList(); // a thing replaced joins the list, one cleared leaves it
  else paintRowMarks();
  paintKeptTools();
  paintBoxClear();
  await Promise.all(view.viewers.map((viewer) => viewer.show()));
}

/** The pane's frame, built once: the tabs and the tools, the line Import and Export speak on, the filter, the list's
 *  place and the box's. */
function buildFrame(root) {
  const top = element('div', 'repl-top');
  const strip = element('div', 'repl-tabs');
  strip.setAttribute('role', 'tablist');
  const tabs = new Map();
  for (const tabId of REPLACEMENT_TABS) {
    const button = element('button', 'repl-tab', TAB_TITLES[tabId]());
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.dataset.tab = tabId;
    button.onclick = () => switchTab(tabId);
    tabs.set(tabId, button);
    strip.append(button);
  }
  const input = element('input');
  input.type = 'file';
  input.accept = '.zip,application/zip,application/x-zip-compressed';
  input.hidden = true;
  input.onchange = () => {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) importFiles(root, file);
  };
  const importButton = element('button', 'act repl-load', t('menu.repl.import', 'Import'));
  importButton.type = 'button';
  importButton.dataset.act = 'import';
  importButton.onclick = () => input.click();
  const exportButton = element('button', 'act repl-load', t('menu.repl.export', 'Export'));
  exportButton.type = 'button';
  exportButton.dataset.act = 'export';
  exportButton.disabled = true; // until any picture is replaced
  exportButton.onclick = () => exportFiles();
  const clearAll = element('button', 'act repl-load', t('menu.repl.clearAll', 'Clear All'));
  clearAll.type = 'button';
  clearAll.dataset.act = 'clear-all';
  clearAll.disabled = true; // until any picture is replaced
  clearAll.onclick = () => askClearAll();
  const tools = element('div', 'repl-tools');
  tools.append(importButton, exportButton, clearAll);
  top.append(strip, tools, input);

  const note = element('p', 'repl-note');
  const filter = element('input', 'repl-filter');
  filter.type = 'search';
  filter.placeholder = t('menu.repl.filter', 'Filter');
  filter.setAttribute('aria-label', t('menu.repl.filterLabel', 'Filter the list'));
  filter.value = paneState.filter;
  keepTyping(filter, 'filter');
  filter.oninput = () => {
    paneState.filter = filter.value;
    paintList();
  };
  const onlyBox = element('input');
  onlyBox.type = 'checkbox';
  onlyBox.checked = paneState.onlyReplaced;
  onlyBox.dataset.act = 'only-replaced';
  onlyBox.onchange = () => {
    paneState.onlyReplaced = !!onlyBox.checked;
    paintList();
  };
  const only = element('label', 'repl-only');
  only.append(onlyBox, element('span', null, t('menu.repl.onlyReplaced', 'Only show replaced')));
  const rows = element('div', 'repl-rows');
  const list = element('div', 'repl-list');
  list.append(only, filter, rows);
  const box = element('div', 'repl-main');
  const columns = element('div', 'repl-body');
  columns.append(list, box);
  root.append(top, note, columns, legend());
  Object.assign(view, { root, box, tabs, clearAll, exportButton, note, filter, rows, rowsById: new Map(), items: [], item: null, viewers: [] });
  paintTabs();
  paintToolNote();
}

/** Another tab: lit at once, its list and box read after. */
function switchTab(tabId) {
  if (paneState.tab === tabId) return;
  stopPlayback();
  Object.assign(paneState, { tab: tabId, pictureBySection: {}, filter: '' });
  view.filter.value = '';
  paintTabs();
  openTab();
}
function paintTabs() {
  for (const [tabId, button] of view.tabs ?? []) {
    const on = tabId === paneState.tab;
    button.className = `repl-tab${on ? ' on' : ''}`;
    button.setAttribute('aria-selected', String(on));
  }
}
/** Export and Clear All wake once a picture is replaced; Export sleeps while one is written. */
function paintKeptTools() {
  const none = view.keptByKey.size === 0;
  if (view.clearAll) view.clearAll.disabled = none;
  if (view.exportButton) view.exportButton.disabled = none || paneState.exporting;
}
function paintToolNote() {
  const note = view.note;
  if (!note) return;
  const said = paneState.toolNote;
  note.hidden = !said;
  note.textContent = said?.text ?? '';
  note.className = `repl-note${said?.refused ? ' repl-refusal' : ''}`;
}

/** Clear All asks first, on the menu's own Yes/No card; Yes forgets every replacement the player has made. */
function askClearAll() {
  const clear = async () => {
    stopPlayback();
    await clearAllReplacements();
  };
  if (!askYesNo) return clear();
  askYesNo([t('menu.repl.clearAllAsk', 'This will clear all replacements you have made in the game, are you sure?')], clear);
  return null;
}

/** The words for what a zip's import did. */
function importWords({ kept, files = 0, unknown, outOfShape, tooBig = 0, unreadable, cifRefused = 0 }) {
  const words = [t('menu.repl.importedCount', 'Imported {count, plural, one {# picture} other {# pictures}}.', { count: kept })];
  if (files) words.push(t('menu.repl.importedFiles', 'Imported {count, plural, one {# CIF file} other {# CIF files}}.', { count: files }));
  if (cifRefused) words.push(t('menu.repl.skippedCif', "{count, plural, one {# CIF file does} other {# CIF files do}} not match the game's.", { count: cifRefused }));
  if (unknown) words.push(t('menu.repl.skippedUnknown', '{count, plural, one {# file matches} other {# files match}} no picture in the game.', { count: unknown }));
  if (outOfShape) words.push(t('menu.repl.skippedShape', '{count, plural, one {# picture is} other {# pictures are}} out of shape.', { count: outOfShape }));
  if (tooBig) words.push(t('menu.repl.skippedTooBig', '{count, plural, one {# picture is} other {# pictures are}} too big for the game to read.', { count: tooBig }));
  if (unreadable) words.push(t('menu.repl.skippedUnreadable', '{count, plural, one {# file} other {# files}} could not be read as PNG.', { count: unreadable }));
  return words.join(' ');
}
/** The words for a zip Import refused, by the code importReplacementZip threw. */
function zipRefusalWords(code) {
  if (code === 'zip-too-large') return t('menu.repl.zipTooBig', 'Rejected: a picture in this zip is too big.');
  if (code === 'zip-too-much') return t('menu.repl.zipTooMuch', 'Rejected: this zip is too big. Import at most 1 GB and 20,000 files at a time.');
  return t('menu.repl.notZip', 'Rejected: this file is not a zip.');
}
/** Import: keep every picture of a zip that replaces a game picture, and say what became of the rest on the line
 *  under the tabs. Exported for the tests. */
export async function importFiles(root, file, importZip = importReplacementZip) {
  paneState.toolNote = { text: t('menu.repl.readingZip', 'Reading {name}…', { name: String(file.name ?? '') }), refused: false };
  paintToolNote();
  let result = null;
  try {
    result = await importZip(file);
    paneState.toolNote = { text: importWords(result), refused: result.kept === 0 && !result.files };
  } catch (e) {
    paneState.toolNote = { text: zipRefusalWords(e?.code), refused: true };
  }
  paintToolNote();
  return result;
}

/** Export: ask where first, while the press still counts as the player's, then write every kept replacement there in
 *  one zip, and say so on the line under the tabs. Exported for the tests, with the dialog and the zip as seams. */
export async function exportFiles({ askTarget = askSaveTarget, buildZip = exportReplacementZip } = {}) {
  if (paneState.exporting) return null;
  const target = await askTarget(exportZipName(), { description: t('menu.repl.zipKind', 'Zip file') }).catch(() => null);
  if (!target) return null;
  paneState.exporting = true;
  paneState.toolNote = { text: t('menu.repl.exporting', 'Exporting your replacements…'), refused: false };
  paintKeptTools();
  paintToolNote();
  let result = null;
  try {
    result = await buildZip();
    await target.write(result.blob);
    paneState.toolNote = {
      text: t('menu.repl.exported', 'Exported {count, plural, one {# replacement} other {# replacements}} to {name}.', { count: result.count, name: target.name }),
      refused: false,
    };
  } catch (e) {
    console.warn('[replacements] the export could not be saved:', e?.message ?? e);
    paneState.toolNote = { text: t('menu.repl.exportFailed', 'The export could not be saved. Nothing was written.'), refused: true };
    result = null;
  }
  paneState.exporting = false;
  paintKeptTools();
  paintToolNote();
  return result;
}

/** The list's rows for the filter typed, and only the replaced where the toggle asks: drawn again only when the tab's
 *  things, the filter or the toggle change, or what the player replaced while the toggle is on. */
function paintList() {
  const wanted = paneState.filter.trim().toLowerCase();
  view.rowsById = new Map();
  const shown = view.items.filter((item) => (!wanted || item.name.toLowerCase().includes(wanted)) && (!paneState.onlyReplaced || isMine(item)));
  view.rows.replaceChildren(
    ...shown.map((item) => {
      const button = itemButton(item);
      view.rowsById.set(item.id, button);
      return button;
    }),
  );
  if (paneState.onlyReplaced && !shown.length && !wanted)
    view.rows.append(element('p', 'repl-wait', t('menu.repl.noneReplaced', 'You have not replaced anything on this tab.')));
  paintRowMarks();
}
/** Whether the player replaced any picture of a thing: a TEXTURE record's, a picture by name, or a whole CIF file. */
function isMine(item) {
  const names = view.itemNames.get(item.id) ?? NO_NAMES;
  return itemIn(item, view.own) || view.ownNames.some((name) => nameIsItems(name, names.names)) || names.files.some((file) => view.ownFiles.has(file));
}
/** Each row's marks, in place: the one picked, green where the player replaced a picture, else blue an overhaul's. */
function paintRowMarks() {
  for (const item of view.items) {
    const button = view.rowsById.get(item.id);
    if (!button) continue;
    const names = view.itemNames.get(item.id) ?? NO_NAMES;
    const mine = isMine(item);
    const changed = !mine && (itemIn(item, view.overhauled) || namesOverhauled(names.names));
    button.className = `repl-item${item === view.item ? ' on' : ''}${mine ? ' own' : changed ? ' overhaul' : ''}`;
  }
}
function itemButton(item) {
  const button = element('button', 'repl-item', item.name);
  button.type = 'button';
  button.dataset.item = item.id;
  button.onclick = () => pickItem(item);
  return button;
}
/** Another thing picked: its row lit in place and the box drawn for it; the list and its scroll stand. */
function pickItem(item) {
  stopPlayback();
  paneState.pickedByTab[paneState.tab] = item.id;
  paneState.pictureBySection = {};
  view.item = item;
  paintRowMarks();
  drawBox();
}

function legend() {
  const line = element('p', 'repl-legend');
  line.append(
    element('span', 'repl-key overhaul', t('menu.repl.legendOverhaul', 'Blue: changed by an overhaul.')),
    document.createTextNode(' '),
    element('span', 'repl-key own', t('menu.repl.legendOwn', 'Green: your replacement.')),
  );
  return line;
}

/** A top-down RGBA picture on a canvas, scaled up by whole pixels to fit the slot. */
function pictureCanvas(picture) {
  const canvas = element('canvas', 'repl-pic');
  canvas.width = picture.width;
  canvas.height = picture.height;
  const context = canvas.getContext?.('2d');
  if (context) {
    const image = context.createImageData(picture.width, picture.height);
    image.data.set(picture.data);
    context.putImageData(image, 0, 0);
  }
  sizeToSlot(canvas, picture.width, picture.height);
  return canvas;
}
/** The slot's longest side, in CSS pixels. */
const SLOT_EDGE = 160;
function sizeToSlot(node, width, height) {
  const scale = Math.max(1, Math.floor(SLOT_EDGE / Math.max(width, height)));
  node.style.width = `${width * scale}px`;
  node.style.height = `${height * scale}px`;
}

/** The words for a catalog note (systems/replacements/replacementCatalog.js itemNotes). */
const NOTE_WORDS = Object.freeze({
  morrowind: () => t('menu.repl.morrowind', 'A Morrowind model draws this while Morrowind data is attached.'),
  morrowindNear: () => t('menu.repl.morrowindNear', 'Morrowind models draw the nearest ones. The rest use your picture.'),
  layered: () => t('menu.repl.layered', 'Layered Gearing draws you on foot. Turn it off on the Skin card to see this look.'),
  mountLook: () => t('menu.repl.mountLook', "A mount look bought with Aurum is drawn over the game's own horse, not over yours."),
});
/** The file name a replacement of a TEXTURE picture has (for a dye, or none), as DFU names loose textures and Import
 *  reads them. */
export const pictureFileName = ({ archive, record, frame, dye = null }) => `${textureName(archive, record, frame, 'Albedo', dye)}.png`;
const sizeWords = (sizes) => sizes.map((size) => `${size.width} x ${size.height}`).join(t('menu.repl.or', ' or '));

// ---- The box: the thing's name and Clear, its metal, and its viewers ------------------------------------------------

/** Every picture of the thing shown that the player has replaced, any metal, its sheets' frames and CIF files too: what
 *  Clear takes away. */
function itemKept() {
  const own = new Set(view.texturePictures.map((picture) => `${picture.archive}_${picture.record}-${picture.frame}`));
  const names = (view.item && view.itemNames.get(view.item.id)) ?? NO_NAMES;
  return [...view.keptByKey.values()].filter((replacement) => {
    if (replacement.kind === 'picture') return nameIsItems(replacement.name, names.names);
    if (replacement.kind === 'file') return names.files.includes(replacement.file);
    return own.has(`${replacement.archive}_${replacement.record}-${replacement.frame}`);
  });
}
function paintBoxClear() {
  if (view.boxClear) view.boxClear.disabled = !itemKept().length;
}

/** Draw the box again for the thing picked: built aside and put in place whole once its pictures are read, so it never
 *  flickers and the list keeps its scroll. Answers whether it was drawn (a later draw, or the pane gone, wins). */
async function drawBox() {
  const { root, box, item } = view;
  if (!root || !box || !item) return false;
  const sequence = ++boxSequence;
  const current = () => sequence === boxSequence && root.isConnected;
  const sections = await itemSections(item).catch(() => []);
  if (!current()) return false;
  const head = element('div', 'repl-head');
  const clear = element('button', 'act', t('menu.repl.clear', 'Clear'));
  clear.type = 'button';
  clear.dataset.act = 'clear';
  clear.onclick = async () => {
    await clearReplacements(itemKept());
  };
  head.append(element('h3', 'repl-title', item.name), clear);
  if (!sections.length) {
    box.replaceChildren(head, element('p', 'repl-wait', t('menu.repl.noClassic', 'This picture is not in your game files.')));
    Object.assign(view, { texturePictures: [], viewers: [], boxClear: clear });
    paintBoxClear();
    return true;
  }
  // a thing with no TEXTURE pictures has no viewer that says its notes: they stand under the box
  const footNotes = sections.some((section) => section.kind === 'texture') ? [] : await itemNotes(item).catch(() => []);
  if (!current()) return false;
  const viewers = sections.map((section) => createViewer(sourceOf(item, section)));
  const nodes = [head];
  if (item.metals) nodes.push(metalRow(viewers));
  nodes.push(...viewers.map((viewer) => viewer.section));
  const foot = element('div', 'repl-foot');
  foot.append(element('p', 'meta', t('menu.repl.later', 'A change shows when the game next loads the picture, such as in a new area or after a reload.')));
  for (const note of footNotes) if (NOTE_WORDS[note]) foot.append(element('p', 'meta repl-item-note', NOTE_WORDS[note]()));
  nodes.push(foot);
  const previous = view.viewers;
  const texturePictures = sections.find((section) => section.kind === 'texture')?.pictures ?? [];
  Object.assign(view, { texturePictures, viewers, boxClear: clear });
  for (const viewer of previous) {
    stopViewer(viewer);
    releaseViewerPreviews(viewer);
  }
  await Promise.all(viewers.map((viewer) => viewer.show()));
  if (!current()) return false;
  box.replaceChildren(...nodes);
  paintBoxClear();
  for (const viewer of viewers) if (paneState.typing?.field === viewer.typingField) giveBackTyping(viewer.number);
  return true;
}

/** The metal the pictures below are shown and chosen for: every metal, or one. Every viewer follows it. */
function metalRow(viewers) {
  const row = element('div', 'repl-metal');
  const select = element('select', 'repl-metal-select');
  select.setAttribute('aria-label', t('menu.repl.metal', 'Metal'));
  select.dataset.act = 'metal';
  const option = (value, label) => {
    const node = element('option', null, label);
    node.value = value;
    return node;
  };
  select.append(option('', t('menu.repl.allMetals', 'All metals')), ...REPLACEMENT_METALS.map((metal) => option(metal, metalLabel(metal))));
  select.value = paneState.metal ?? '';
  select.onchange = () => {
    paneState.metal = select.value || null;
    for (const viewer of viewers) {
      viewer.refusal = null;
      viewer.show();
    }
  };
  row.append(element('span', 'repl-label', t('menu.repl.metal', 'Metal')), select);
  return row;
}

/** A section's viewer source: what it shows, how each picture is named, read and kept. */
function sourceOf(item, section) {
  if (section.kind === 'cif') return sheetSource(section);
  if (section.kind === 'named') return namedSource(section);
  return mainSource(item, section);
}
/** The picture a section's viewer shows, kept between its draws. */
const indexOf = (id) => ({
  id,
  typingField: `number-${id}`,
  getIndex: () => paneState.pictureBySection[id] ?? 0,
  setIndex: (index) => {
    paneState.pictureBySection[id] = index;
  },
});
/** The thing's own pictures: its records and frames, in its metal where it has one. */
function mainSource(item, section) {
  const metal = () => (item.metals ? paneState.metal : null);
  return {
    ...indexOf(section.id),
    pictures: section.pictures,
    title: null,
    note: null,
    file: null,
    copyOf: null,
    caption: () => null,
    keyOf: (picture) => textureReplacementKey(picture.archive, picture.record, picture.frame, textureDyeOf(metal())),
    fileNameOf: (picture) => pictureFileName({ ...picture, dye: textureDyeOf(metal()) }),
    read: (picture) => itemOriginal(item, picture, metal()),
    descriptor: (picture) => ({ archive: picture.archive, record: picture.record, frame: picture.frame, dye: textureDyeOf(metal()) }),
    notes: async () => (await itemNotes(item).catch(() => [])).map((note) => NOTE_WORDS[note]?.() ?? ''),
  };
}
/** The words for each record's swing on a weapon's sheet, in WeaponStates order. */
const PART_WORDS = Object.freeze([
  () => t('menu.repl.partIdle', 'Ready'),
  () => t('menu.repl.partDown', 'Strike down'),
  () => t('menu.repl.partDownLeft', 'Strike down and left'),
  () => t('menu.repl.partLeft', 'Strike left'),
  () => t('menu.repl.partRight', 'Strike right'),
  () => t('menu.repl.partDownRight', 'Strike down and right'),
  () => t('menu.repl.partUp', 'Strike up'),
]);
/** A sheet's frame named by its swing and its place in it, where the sheet's records each have a swing. */
function partWords(sheet, { record, frame }) {
  if (sheet.captions?.[record]) return sheet.captions[record]();
  const part = sheet.parts?.[record];
  if (part == null || !PART_WORDS[part]) return null;
  return t('menu.repl.part', '{part}, frame {number} of {count}', { part: PART_WORDS[part](), number: frame + 1, count: sheet.counts[record] });
}
/** A kept CIF file's bytes, read once for each time it was kept. */
async function keptCopyBytes(file) {
  const key = fileReplacementKey(file);
  const kept = view.keptByKey.get(key);
  if (!kept?.blob) return null;
  const known = view.copyBytes.get(key);
  if (known?.savedAt === kept.savedAt) return known.bytes;
  const bytes = new Uint8Array(await kept.blob.arrayBuffer());
  view.copyBytes.set(key, { savedAt: kept.savedAt, bytes });
  return bytes;
}
/** A sheet of CIF frames: its records and frames, in its metal where one is chosen, and the player's CIF file. */
function sheetSource(section) {
  const { sheet } = section;
  const nameOf = (picture) => cifPictureName(sheet.file, picture.record, picture.frame, sheet.metals ? paneState.metal : null);
  return {
    ...indexOf(section.id),
    pictures: sheetPictures(sheet),
    title: section.title?.() ?? null,
    note: sheet.shared ? t('menu.repl.fpShared', 'Every weapon of this kind shares these pictures.') : null,
    file: sheet.copyable === false ? null : sheet.classicFile,   // a CFA has no copy the game reads
    copyOf: async (picture) => {
      const bytes = await keptCopyBytes(sheet.classicFile).catch(() => null);
      return bytes ? sheetCopyPicture(sheet, picture, paneState.metal, bytes) : null;
    },
    caption: (picture) => partWords(sheet, picture),
    keyOf: (picture) => pictureReplacementKey(nameOf(picture)),
    fileNameOf: (picture) => `${nameOf(picture)}.png`,
    read: (picture) => sheetOriginal(sheet, picture, paneState.metal),
    descriptor: (picture) => ({ kind: 'picture', name: nameOf(picture) }),
    notes: async () => [],
  };
}
/** Pictures the game asks by name: an IMG's, a spell icon's, the held map's. */
function namedSource(section) {
  return {
    ...indexOf(section.id),
    pictures: section.pictures,
    title: section.title?.() ?? null,
    note: section.note?.() ?? null,
    file: null,
    copyOf: null,
    caption: (picture) => picture.caption?.() ?? null,
    keyOf: (picture) => pictureReplacementKey(picture.name),
    fileNameOf: (picture) => `${picture.name}.png`,
    read: (picture) => namedOriginal(picture),
    descriptor: (picture) => ({ kind: 'picture', name: picture.name }),
    notes: async () => [],
  };
}

// ---- A viewer: one set of pictures, one at a time -------------------------------------------------------------------

/**
 * A viewer of one set of pictures: "Picture X of Y" with a box for X, the arrows and Play; the original (an
 * overhaul's where one covers it) over the player's replacement with Choose; Clear Selected; and the size line. Its
 * controls stand while its pictures change, so a press on them is never lost to a redraw.
 */
function createViewer(source) {
  const viewer = { source, refusal: null, fileRefusal: null, playback: null, sequence: 0, urls: new Set(), typingField: source.typingField, number: null, count: null, play: null };
  const section = element('section', 'repl-viewer');
  section.dataset.section = source.id;
  if (source.title) section.append(element('h4', 'repl-section', source.title));
  if (source.note) section.append(element('p', 'meta', source.note));
  if (source.file) section.append(...fileRow(viewer));
  if (source.pictures.length > 1) {
    viewer.count = pictureCounter(viewer);
    viewer.play = playButton(viewer);
    section.append(pictureStepper(viewer), viewer.play);
  }
  viewer.caption = element('p', 'repl-caption');
  viewer.caption.hidden = true;
  section.append(viewer.caption);
  viewer.area = element('div', 'repl-picture');
  viewer.clearSelected = clearSelectedButton(viewer);
  const actions = element('div', 'acts');
  actions.append(viewer.clearSelected);
  viewer.lines = element('div', 'repl-notes');
  section.append(viewer.area, actions, viewer.lines);
  viewer.section = section;
  viewer.show = () => showPicture(viewer);
  return viewer;
}

/** Show the picture the viewer's index names, its controls left standing: the count and the buttons change at once,
 *  the pictures when they are read. Answers whether it was drawn. */
async function showPicture(viewer) {
  const { source } = viewer;
  const count = source.pictures.length;
  if (!count) return false;
  const index = ((source.getIndex() % count) + count) % count;
  source.setIndex(index);
  const picture = source.pictures[index];
  const kept = view.keptByKey.get(source.keyOf(picture)) ?? null;
  paintViewer(viewer, index, kept);
  const sequence = ++viewer.sequence;
  const urls = new Set();
  const shown = await pictureParts(viewer, picture, kept, urls);
  if (sequence !== viewer.sequence || !view.root?.isConnected || !shown) {
    for (const url of urls) URL.revokeObjectURL(url);
    return false;
  }
  viewer.area.replaceChildren(...shown.slots);
  viewer.lines.replaceChildren(...shown.lines);
  releaseViewerPreviews(viewer);
  viewer.urls = urls;
  return true;
}

/** The parts of a viewer that change with its picture: the original and the replacement with Choose, and the size line
 *  and notes - or a line saying the game files have no such picture. */
async function pictureParts(viewer, picture, kept, urls) {
  const { source } = viewer;
  const [{ classic, overhaul }, notes, copy] = await Promise.all([
    source.read(picture),
    source.notes(),
    !kept?.blob && source.copyOf ? source.copyOf(picture) : null,
  ]);
  const shown = overhaul ?? classic;
  if (!shown) return { slots: [element('p', 'repl-wait', t('menu.repl.noClassic', 'This picture is not in your game files.'))], lines: [] };
  const accepted = acceptedSizes(classic, overhaul);
  // an overhaul draws OVER a picture of the game's; a thing that is the port's or a mod's own has its art as its original
  const overhauled = !!overhaul && !!classic;
  const upper = element('div', `repl-slot${overhauled ? ' overhaul' : ''}`);
  upper.append(
    element('div', 'repl-label', overhauled ? t('menu.repl.overhaul', 'Overhaul') : t('menu.repl.original', 'Original')),
    element('div', 'repl-file', source.fileNameOf(picture)),
    pictureCanvas(shown),
  );
  const lower = element('div', `repl-slot${kept || copy ? ' own' : ''}`);
  lower.append(element('div', 'repl-label', t('menu.repl.replacement', 'Replacement')));
  if (copy) lower.append(element('div', 'repl-file', t('menu.repl.fromCif', 'From your {name}', { name: source.file })));
  const row = element('div', 'repl-row');
  const preview = element('div', 'repl-preview');
  if (copy && !kept?.blob) {
    const canvas = pictureCanvas(copy);
    sizeToSlot(canvas, classic?.width ?? copy.width, classic?.height ?? copy.height); // drawn in the classic frame's box, as the game draws it
    preview.append(canvas);
  } else if (kept?.blob) {
    const url = URL.createObjectURL(kept.blob);
    urls.add(url);
    const image = element('img', 'repl-pic');
    image.alt = t('menu.repl.previewAlt', 'Your replacement for {name}', { name: view.item?.name ?? '' });
    image.src = url;
    sizeToSlot(image, kept.drawWidth ?? kept.width, kept.drawHeight ?? kept.height); // shown at the original's size, as the game draws it
    preview.append(image);
  } else {
    preview.append(element('span', 'repl-none', t('menu.repl.none', 'None')));
  }
  row.append(preview, chooseColumn(viewer, source.descriptor(picture), accepted));
  lower.append(row);
  const lines = [element('p', 'meta', t('menu.repl.needs', 'Needs a PNG of {sizes}, or bigger in the same proportions.', { sizes: sizeWords(accepted) }))];
  for (const note of notes) lines.push(element('p', 'meta', note));
  return { slots: [upper, lower], lines };
}

/** A viewer's standing controls brought up to the picture shown: its count, its caption, Play's word, Clear Selected
 *  and Clear CIF. */
function paintViewer(viewer, index, kept) {
  const fromCopy = !!viewer.source.file && view.ownFiles.has(viewer.source.file);
  const caption = viewer.source.caption(viewer.source.pictures[index]);
  viewer.caption.hidden = !caption;
  viewer.caption.textContent = caption ?? '';
  if (viewer.clearFile) viewer.clearFile.disabled = !fromCopy;
  if (viewer.count) {
    viewer.count.className = `repl-count${kept || fromCopy ? ' own' : ''}`;
    const shown = String(index + 1);
    if (viewer.number && viewer.number.value !== shown && globalThis.document?.activeElement !== viewer.number) viewer.number.value = shown;
  }
  paintPlayButton(viewer);
  if (viewer.clearSelected) viewer.clearSelected.disabled = !kept;
}

/** Step a viewer to another picture: Play stops, as the player has taken the pictures in hand. */
function stepTo(viewer, index) {
  stopViewer(viewer);
  viewer.refusal = null;
  viewer.source.setIndex(index);
  viewer.show();
}

/** A sheet's CIF file: its name, Load CIF to keep a whole copy in its place, and Clear CIF; a refusal above them. */
function fileRow(viewer) {
  const { source } = viewer;
  const refusal = element('p', 'repl-refusal');
  refusal.hidden = true;
  viewer.fileRefusalLine = refusal;
  const row = element('div', 'repl-file-row');
  const input = element('input');
  input.type = 'file';
  input.accept = '.cif,.CIF';
  input.hidden = true;
  input.onchange = () => {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) chooseCifFile(source.file, file, viewer);
  };
  const load = element('button', 'act', t('menu.repl.loadCif', 'Load CIF…'));
  load.type = 'button';
  load.dataset.act = 'load-cif';
  load.onclick = () => input.click();
  const clear = element('button', 'act', t('menu.repl.clearCif', 'Clear CIF'));
  clear.type = 'button';
  clear.dataset.act = 'clear-cif';
  clear.disabled = true;
  clear.onclick = async () => {
    viewer.fileRefusal = null;
    paintFileRefusal(viewer);
    await clearReplacements([{ kind: 'file', file: source.file }]);
  };
  viewer.clearFile = clear;
  row.append(element('span', 'repl-file-name', t('menu.repl.cifFile', 'CIF file: {name}', { name: source.file })), load, clear, input);
  return [refusal, row];
}
/** The words for a CIF file's refusal (systems/replacements/replacementRules.js cifRefusal). */
function cifRefusalWords(refusal, name) {
  if (refusal.reason === 'notCif') return t('menu.repl.notCif', 'Rejected: this file is not a CIF.');
  if (refusal.reason === 'wrongShape') return t('menu.repl.cifShape', "Rejected: this CIF's records and frames do not match the game's {name}.", { name });
  if (refusal.reason === 'tooLarge') return tooLargeWords();
  if (refusal.reason === 'tooBig')
    return t('menu.repl.cifTooBig', 'Rejected: record {record} is {width} x {height}. It is too big for the game to read.', {
      record: refusal.record,
      width: refusal.width,
      height: refusal.height,
    });
  if (refusal.reason === 'wrongSize')
    return t('menu.repl.cifSize', 'Rejected: record {record} is {width} x {height}. It must be {sizes}, or bigger in the same proportions.', {
      record: refusal.record,
      width: refusal.width,
      height: refusal.height,
      sizes: sizeWords(refusal.accepted),
    });
  return t('menu.repl.noClassic', 'This picture is not in your game files.');
}
function paintFileRefusal(viewer) {
  const line = viewer?.fileRefusalLine;
  if (!line) return;
  line.hidden = !viewer.fileRefusal;
  line.textContent = viewer.fileRefusal ?? '';
}
/** Load CIF: check a chosen file against the game's `classicFile` and keep it whole in its place, or say in red above
 *  the viewer's Load CIF why it was refused. Exported for the tests, with the game file's shape as a seam. */
export async function chooseCifFile(classicFile, file, viewer = null, shapeOf = (name) => classicRecords().cifShape(name)) {
  const bytes = await chosenBytes(file);
  const shape = await Promise.resolve(shapeOf(classicFile)).catch(() => null);
  const refusal = bytes === TOO_LARGE ? { reason: 'tooLarge' } : !shape ? { reason: 'noOriginal' } : cifRefusal(bytes, classicFile, shape);
  if (viewer) {
    viewer.fileRefusal = refusal ? cifRefusalWords(refusal, classicFile) : null;
    paintFileRefusal(viewer);
  }
  if (refusal) return refusal;
  try {
    await saveReplacement({ kind: 'file', file: classicFile, fileName: String(file.name ?? ''), blob: new Blob([bytes], { type: 'application/octet-stream' }) });
  } catch (e) {
    console.warn('[replacements] the CIF file could not be kept:', e?.message ?? e);
    return { reason: 'unreadable' };
  }
  return null;
}

/** The arrows round "Picture X of Y". */
function pictureStepper(viewer) {
  const stepper = element('div', 'repl-step');
  const back = element('button', 'act repl-arrow', '◀');
  back.type = 'button';
  back.setAttribute('aria-label', t('menu.repl.previous', 'Previous picture'));
  back.onclick = () => stepTo(viewer, viewer.source.getIndex() - 1);
  const forward = element('button', 'act repl-arrow', '▶');
  forward.type = 'button';
  forward.setAttribute('aria-label', t('menu.repl.next', 'Next picture'));
  forward.onclick = () => stepTo(viewer, viewer.source.getIndex() + 1);
  stepper.append(back, viewer.count, forward);
  return stepper;
}

/** A field the player types in, remembered while it has the keyboard: its caret on every key. A browser blurs a field
 *  before a redraw takes it out, so the blur cannot say the player left; a press elsewhere in the pane or a Tab does. */
function keepTyping(input, field) {
  const note = () => {
    paneState.typing = { field, start: input.selectionStart ?? input.value.length, end: input.selectionEnd ?? input.value.length };
  };
  input.addEventListener('focus', note);
  input.addEventListener('input', note);
  input.addEventListener('keyup', note);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') paneState.typing = null;
  });
}
const TYPED_FIELD = /\brepl-(filter|number)\b/;
/** A press on anything in the pane but a typed field: the player has left the field. */
function leftTyping(e) {
  if (!TYPED_FIELD.test(String(e.target?.className ?? ''))) paneState.typing = null;
}
/** The keyboard and caret back in a field drawn again while it was being typed in. */
function giveBackTyping(input) {
  if (!input || !paneState.typing) return;
  const { start, end } = paneState.typing;
  input.focus?.({ preventScroll: true });
  input.setSelectionRange?.(Math.min(start, input.value.length), Math.min(end, input.value.length));
}

/** "Picture X of Y" with X a box for the number: the language's own words round it, read from the one string. A number
 *  from 1 to the count shows that picture; the mouse wheel over the box steps through them, held to the same range. */
const NUMBER_MARK = '\u0001';
function pictureCounter(viewer) {
  const total = viewer.source.pictures.length;
  const counter = element('span', 'repl-count');
  const words = t('menu.repl.picture', 'Picture {number} of {count}', { number: NUMBER_MARK, count: total });
  const [before, after = ''] = words.split(NUMBER_MARK);
  const number = element('input', 'repl-number');
  number.type = 'text';
  number.inputMode = 'numeric';
  number.autocomplete = 'off';
  number.maxLength = String(total).length;
  number.dataset.act = 'picture-number';
  number.setAttribute('aria-label', t('menu.repl.pictureNumber', 'Picture number'));
  let lastGood = '';
  number.onfocus = () => {
    stopViewer(viewer); // typing a number takes the pictures in hand, as an arrow does
    lastGood = number.value;
    number.select?.();
  };
  number.oninput = () => {
    const digits = number.value.replace(/\D/g, '');
    if (digits === '') {
      number.value = ''; // emptied to type another: nothing to show yet
      return;
    }
    const wanted = Number(digits);
    if (wanted < 1 || wanted > total) {
      number.value = lastGood; // only a number from 1 to the count is taken
      return;
    }
    number.value = digits;
    lastGood = digits;
    viewer.refusal = null;
    viewer.source.setIndex(wanted - 1);
    viewer.show();
  };
  number.onblur = () => {
    number.value = String(viewer.source.getIndex() + 1); // left empty, it reads the picture shown again
  };
  number.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault(); // the wheel turns the pictures, not the page under them
      const next = Math.min(total - 1, Math.max(0, viewer.source.getIndex() + (e.deltaY < 0 ? 1 : -1)));
      if (next === viewer.source.getIndex()) return;
      number.value = String(next + 1);
      lastGood = number.value;
      stepTo(viewer, next);
    },
    { passive: false },
  );
  keepTyping(number, viewer.typingField);
  viewer.number = number;
  counter.append(before, number, after);
  return counter;
}

/** Play steps through the viewer's pictures, round from the last to the first; while it plays it reads Pause. It
 *  answers the press at once - the word changes before any picture is read. */
function playButton(viewer) {
  const button = element('button', 'act repl-play');
  button.type = 'button';
  button.dataset.act = 'play';
  button.onclick = () => {
    if (viewer.playback) stopViewer(viewer);
    else startViewer(viewer);
    paintPlayButton(viewer);
  };
  viewer.play = button;
  paintPlayButton(viewer);
  return button;
}
function paintPlayButton(viewer) {
  if (!viewer.play) return;
  viewer.play.textContent = viewer.playback ? t('menu.repl.pause', 'Pause') : t('menu.repl.play', 'Play');
  viewer.play.setAttribute('aria-pressed', String(!!viewer.playback));
}

/** Clear Selected: the picture the viewer shows when it is pressed, in the metal chosen then. */
function clearSelectedButton(viewer) {
  const button = element('button', 'act', t('menu.repl.clearSelected', 'Clear Selected'));
  button.type = 'button';
  button.dataset.act = 'clear-selected';
  button.onclick = async () => {
    const picture = viewer.source.pictures[viewer.source.getIndex()];
    if (!picture) return;
    viewer.refusal = null;
    await clearReplacements([{ key: viewer.source.keyOf(picture) }]);
  };
  return button;
}

/** The Choose button, with the refusal of the last choice above it. */
function chooseColumn(viewer, descriptor, accepted) {
  const column = element('div', 'repl-choose');
  if (viewer.refusal) column.append(element('p', 'repl-refusal', viewer.refusal));
  const input = element('input');
  input.type = 'file';
  input.accept = 'image/png,.png';
  input.hidden = true;
  input.onchange = () => {
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) choosePicture(view.root, descriptor, accepted, file, viewer);
  };
  const choose = element('button', 'act primary', t('menu.repl.choose', 'Choose…'));
  choose.type = 'button';
  choose.dataset.act = 'choose';
  choose.onclick = () => input.click();
  column.append(choose, input);
  return column;
}

const TOO_LARGE = Symbol('too large');
/** A chosen file's bytes, TOO_LARGE past MAX_FILE_BYTES (asked before a byte is read), or null when it cannot be read. */
async function chosenBytes(file) {
  if (Number(file?.size) > MAX_FILE_BYTES) return TOO_LARGE;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return bytes.length > MAX_FILE_BYTES ? TOO_LARGE : bytes;
  } catch {
    return null;
  }
}
const tooLargeWords = () => t('menu.repl.fileTooLarge', 'Rejected: this file is bigger than 64 MB.');

/** The words for a refusal code from systems/replacements/replacementRules.js. */
function refusalWords(refusal) {
  if (refusal.reason === 'notPng') return t('menu.repl.notPng', 'Rejected: this file is not a PNG.');
  if (refusal.reason === 'tooLarge') return tooLargeWords();
  if (refusal.reason === 'tooBig')
    return t('menu.repl.tooBig', 'Rejected: this picture is {width} x {height}. It is too big for the game to read.', {
      width: refusal.width,
      height: refusal.height,
    });
  if (refusal.reason === 'wrongSize')
    return t('menu.repl.wrongSize', 'Rejected: this picture is {width} x {height}. It must be {sizes}, or bigger in the same proportions.', {
      width: refusal.width,
      height: refusal.height,
      sizes: sizeWords(refusal.accepted),
    });
  return t('menu.repl.unreadable', 'Rejected: this picture could not be read.');
}

/** Check a chosen file and keep it for the picture `descriptor` names (saveReplacements' shape), or say in red above the
 *  viewer's Choose why it was refused. Exported for the tests; the viewer is the box's first unless one is named. */
export async function choosePicture(root, descriptor, accepted, file, viewer = view.viewers[0]) {
  const chosen = await chosenBytes(file);
  if (chosen === TOO_LARGE) return refuse(viewer, { reason: 'tooLarge' });
  const bytes = chosen && cleanPng(chosen);
  const refusal = !chosen ? { reason: 'unreadable' } : bytes ? replacementRefusal(bytes, accepted) : { reason: 'notPng' };
  const blob = new Blob([bytes ?? new Uint8Array(0)], { type: 'image/png' });
  if (!refusal && !(await decodes(blob))) return refuse(viewer, { reason: 'unreadable' });
  if (refusal) return refuse(viewer, refusal);
  if (viewer) viewer.refusal = null;
  const size = pngSize(bytes);
  const drawn = drawnSize(size, accepted);
  try {
    await saveReplacement({ ...descriptor, ...size, drawWidth: drawn.width, drawHeight: drawn.height, fileName: String(file.name ?? ''), blob });
  } catch (e) {
    console.warn('[replacements] the picture could not be kept:', e?.message ?? e);
    return refuse(viewer, { reason: 'unreadable' });
  }
  return null;
}
function refuse(viewer, refusal) {
  if (viewer) {
    viewer.refusal = refusalWords(refusal);
    paintRefusal(viewer);
  }
  return refusal;
}
/** The refusal's red line above the viewer's Choose, in place: the pictures stand. */
function paintRefusal(viewer) {
  const column = viewer.area?.querySelector?.('.repl-choose');
  if (!column) return;
  column.querySelector('.repl-refusal')?.remove();
  if (viewer.refusal) column.prepend(element('p', 'repl-refusal', viewer.refusal));
}
/** The browser can draw the picture. Where it has no decoder (the tests), the header's word stands. */
async function decodes(blob) {
  if (typeof globalThis.createImageBitmap !== 'function') return true;
  try {
    const bitmap = await globalThis.createImageBitmap(blob);
    bitmap.close?.();
    return true;
  } catch {
    return false;
  }
}
const STYLE_ID = 'replacements-pane-style';
function injectReplacementsStyle(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = REPLACEMENTS_CSS;
  doc.head.append(style);
}

/** The colours the list marks a thing with: blue an overhaul's, green the player's. */
export const OVERHAUL_BLUE = 'rgb(110, 168, 255)';
export const OWN_GREEN = 'rgb(112, 214, 110)';

export const REPLACEMENTS_CSS = `
.repl { display: flex; flex-direction: column; gap: 10px; min-height: 100%; }
.repl .repl-wait { color: var(--dim, #9c937d); }
.repl-top { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid rgba(125,116,96,0.45); padding: 0 0 6px; }
.repl-tabs { display: flex; flex-wrap: wrap; gap: 2px; flex: 1; min-width: 0; }
.repl-tools { display: flex; flex-direction: row; align-items: center; gap: 6px; flex: none; }
.repl-top .repl-load { padding: 4px 14px; min-height: 40px; font-size: 14px; }
.repl-number { font: inherit; width: 3.2em; min-height: 32px; margin: 0 4px; padding: 2px 4px; text-align: center; color: #d8cfae;
  background: rgba(0,0,0,0.45); border: 2px solid rgba(125,116,96,0.55); }
.repl-number:focus-visible { outline: none; border-color: var(--brass, #b89a4e); }
.repl .repl-note { margin: 0; font-size: 14px; }
.repl-tab { font: inherit; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; color: #d8cfae;
  background: none; border: 0; cursor: pointer; min-height: 40px; padding: 6px 12px; text-shadow: 2px 2px 0 rgba(0,0,0,0.8); }
.repl-tab { border-bottom: 2px solid transparent; }
.repl-tab:hover { color: #f3ecd2; }
.repl-tab:focus-visible { outline: 2px solid rgba(243,239,44,0.6); outline-offset: -2px; }
.repl-tab.on { color: rgb(243,239,44); text-shadow: 2px 2px 0 rgb(93,77,12); border-bottom-color: rgb(243,239,44); }
.repl-note[hidden] { display: none; }
.repl-body { display: flex; gap: 14px; flex: 1; min-height: 0; }
.repl-filter { font: inherit; font-size: 14px; width: 100%; box-sizing: border-box; min-height: 36px; margin: 0 0 6px;
  padding: 4px 8px; color: #d8cfae; background: rgba(0,0,0,0.45); border: 2px solid rgba(125,116,96,0.55); }
.repl-filter:focus-visible { outline: none; border-color: var(--brass, #b89a4e); }
.repl-only { display: flex; align-items: center; gap: 8px; min-height: 32px; margin: 0 0 4px; font-size: 14px; color: #d8cfae;
  cursor: pointer; }
.repl-only input { width: 18px; height: 18px; margin: 0; accent-color: var(--brass, #b89a4e); cursor: pointer; }
.repl-list { flex: 0 0 200px; max-height: 420px; overflow-y: auto; border-right: 2px solid rgba(125,116,96,0.45); padding-right: 8px; }
.repl-item { font: inherit; font-size: 15px; display: block; width: 100%; text-align: left; color: #d8cfae; background: none;
  border: 0; cursor: pointer; min-height: 36px; padding: 4px 8px; text-shadow: 2px 2px 0 rgba(0,0,0,0.8); }
.repl-item.overhaul, .repl-key.overhaul { color: ${OVERHAUL_BLUE}; }
.repl-item.own, .repl-key.own, .repl-count.own { color: ${OWN_GREEN}; }
.repl-item.on { outline: 2px solid var(--brass, #b89a4e); outline-offset: -2px; }
.repl-item:hover, .repl-item:focus-visible { outline: 2px solid rgba(243,239,44,0.6); outline-offset: -2px; }
.repl-main { flex: 1; min-width: 0; }
.repl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin: 0 0 8px; }
.repl-head .repl-title { margin: 0; min-width: 0; }
.repl-head .act { flex: none; padding: 4px 14px; min-height: 40px; font-size: 14px; }
.repl-metal { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; }
.repl-metal .repl-label { margin: 0; }
.repl-metal-select { font: inherit; font-size: 14px; min-height: 36px; padding: 2px 8px; color: #d8cfae;
  background: rgba(0,0,0,0.45); border: 2px solid rgba(125,116,96,0.55); }
.repl-viewer + .repl-viewer { border-top: 2px solid rgba(125,116,96,0.45); margin-top: 14px; padding-top: 12px; }
.repl-section { margin: 0 0 8px; font-size: 16px; letter-spacing: 0.12em; text-transform: uppercase; }
.repl-play { display: block; margin: 0 0 8px; padding: 4px 18px; min-height: 40px; font-size: 14px; }
.repl-file-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 10px; }
.repl-file-row .act { padding: 4px 14px; min-height: 40px; font-size: 14px; }
.repl-file-name { font-size: 14px; color: #c5bda2; user-select: text; }
.repl .repl-caption { margin: 0 0 8px; font-size: 14px; color: #c5bda2; }
.repl-caption[hidden], .repl-refusal[hidden] { display: none; }
.repl-step { display: flex; align-items: center; gap: 10px; margin: 0 0 8px; }
.repl-count { white-space: nowrap; }
.repl-step .repl-arrow { padding: 4px 12px; min-height: 36px; }
.repl-slot { border: 2px solid rgba(125,116,96,0.55); background: rgba(0,0,0,0.35); padding: 8px 10px; margin: 0 0 10px; }
.repl-slot.overhaul .repl-label { color: ${OVERHAUL_BLUE}; }
.repl-slot.own .repl-label { color: ${OWN_GREEN}; }
.repl-label { font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: #9c937d; margin: 0 0 6px; }
.repl-file { font-size: 12px; color: #c5bda2; margin: -2px 0 8px; user-select: text; overflow-wrap: anywhere; }
.repl-pic { display: block; image-rendering: pixelated; max-width: 100%; object-fit: contain; background: #000; }
.repl-row { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.repl-preview { min-width: 96px; min-height: 96px; display: flex; align-items: center; justify-content: center; background: #000; }
.repl-none { color: #9c937d; font-size: 14px; }
.repl-choose { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; max-width: 280px; }
.repl .repl-refusal { color: rgb(240, 84, 72); margin: 0; font-size: 15px; }
.repl .repl-legend { font-size: 13px; margin: 0; }
@media (max-width: 640px) {
  .repl-body { flex-direction: column; }
  .repl-list { flex: none; max-height: 180px; border-right: 0; border-bottom: 2px solid rgba(125,116,96,0.45); padding: 0 0 8px; }
}
`;
