// The player's own replacement pictures, kept in this browser.
//
// A replacement is what the player chose on the Replacements pane for one of the game's pictures: a PNG for a TEXTURE
// record's frame (kind `texture`, for one metal's dye or every one), a PNG for a picture the game asks by name (kind
// `picture`: a CIF frame, an IMG, a spell icon, the held map), or a whole CIF file in place of the game's (kind
// `file`). It lives in its own IndexedDB database, never uploaded and never in the repository. A browser that refuses
// IndexedDB keeps them for the tab. Every change registers them again (systems/textureReplacement.js, ./playerPictures.js).
import { setPlayerReplacements } from '../textureReplacement.js';
import { setPlayerPictures, setPlayerFiles, canonicalPictureName } from './playerPictures.js';
import { safeFileName } from './replacementSafety.js';
import './paintedArt.js'; // the renderer's door to the port's painted pictures: the player's own in their place

export const REPLACEMENT_DB = 'dfo-replacements';
export const REPLACEMENT_STORE = 'pictures';

/**
 * @typedef {{ key: string, kind?: string, archive?: number, name?: string, file?: string, record?: number,
 *   frame?: number, dye?: string|null, width: number, height: number, drawWidth: number, drawHeight: number,
 *   fileName: string, savedAt: number, blob: Blob }} ReplacementRecord
 * @typedef {{ put: (replacement: ReplacementRecord) => Promise<void>, all: () => Promise<ReplacementRecord[]>,
 *   remove: (key: string) => Promise<void> }} ReplacementBackend
 */

/** A TEXTURE picture's store key: DFU's name unpadded, `233_5-0`, and a metal's dye, `233_5-0_Daedric`. */
export const replacementKey = (archive, record, frame = 0, dye = null) =>
  `${Number(archive)}_${Number(record)}-${Number(frame)}${dye ? `_${dye}` : ''}`;
/** The store's key for a picture the game asks by name: `name:` and the name (`name:WEAPON04.CIF_0-0_Daedric`). */
export const pictureReplacementKey = (name) => `name:${canonicalPictureName(name)}`;
/** The store's key for a whole file in place of the game's: `file:` and its name (`file:WEAPON04.CIF`). */
export const fileReplacementKey = (file) => `file:${String(file).toUpperCase()}`;
/** A picture's key, whichever kind it is - or the key it already carries. */
export function keyOfPicture(picture) {
  if (picture.key) return picture.key;
  if (picture.kind === 'picture') return pictureReplacementKey(picture.name);
  if (picture.kind === 'file') return fileReplacementKey(picture.file);
  return replacementKey(picture.archive, picture.record, picture.frame, picture.dye ?? null);
}

/** A backend held in memory: the tests', and the fallback when IndexedDB will not open. */
export function memoryReplacementBackend() {
  const rows = new Map();
  return {
    put: async (replacement) => {
      rows.set(replacement.key, { ...replacement });
    },
    all: async () => [...rows.values()].map((row) => ({ ...row })),
    remove: async (key) => {
      rows.delete(key);
    },
  };
}

/** A backend over an IndexedDB factory, or null where there is none. */
function indexedDbBackend(factory = globalThis.indexedDB) {
  if (!factory) return null;
  let opening = null;
  const open = () =>
    (opening ??= new Promise((resolve, reject) => {
      const request = factory.open(REPLACEMENT_DB, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(REPLACEMENT_STORE)) database.createObjectStore(REPLACEMENT_STORE);
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onclose = () => {
          opening = null;
        };
        database.onversionchange = () => {
          database.close();
          opening = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        opening = null;
        reject(Object.assign(new Error(`the replacements database would not open: ${request.error?.message}`), { openFailed: true }));
      };
    }));
  const transact = (mode, work) =>
    open().then(
      (database) =>
        new Promise((resolve, reject) => {
          const transaction = database.transaction(REPLACEMENT_STORE, mode);
          const request = work(transaction.objectStore(REPLACEMENT_STORE));
          transaction.oncomplete = () => resolve(request?.result);
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error ?? new Error('the transaction aborted'));
        }),
    );
  return {
    put: (replacement) => transact('readwrite', (store) => store.put(replacement, replacement.key)).then(() => undefined),
    all: () => transact('readonly', (store) => store.getAll()).then((rows) => rows ?? []),
    remove: (key) => transact('readwrite', (store) => store.delete(key)).then(() => undefined),
  };
}

/** IndexedDB while it opens, memory from the first open that fails. */
function resilientBackend(primary) {
  const memory = memoryReplacementBackend();
  let active = primary ?? memory;
  const call =
    (name) =>
    async (...args) => {
      if (active !== memory) {
        try {
          return await active[name](...args);
        } catch (e) {
          if (!e?.openFailed) throw e;
          console.warn('[replacements] IndexedDB refused - replacements last for this tab only:', e.message);
          active = memory;
        }
      }
      return memory[name](...args);
    };
  return { put: call('put'), all: call('all'), remove: call('remove') };
}

/** @type {ReplacementBackend|null} */
let backendInUse = null;
function backend() {
  if (!backendInUse) {
    let primary = null;
    try {
      primary = indexedDbBackend();
    } catch {
      primary = null;
    }
    backendInUse = resilientBackend(primary);
  }
  return backendInUse;
}
/** The tests' seam: a backend of their own, or null to go back to IndexedDB. */
export function setReplacementBackend(replacementBackend) {
  backendInUse = replacementBackend ?? null;
}

const listeners = new Set();
/** Hear every change to the kept pictures. Answers the function that stops listening. */
export function onReplacementsChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function tellListeners() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (e) {
      console.warn('[replacements] a listener failed:', e?.message ?? e);
    }
  }
}

/** Every kept replacement. */
export const listReplacements = () => backend().all();

/** What a kept replacement names, by its kind: a TEXTURE record's frame and dye, a picture's name, or a file's. */
function namedBy({ kind, archive, record = 0, frame = 0, dye = null, name, file }) {
  if (kind === 'picture') return { name: canonicalPictureName(name) };
  if (kind === 'file') return { file: String(file).toUpperCase() };
  return { archive: Number(archive), record: Number(record), frame: Number(frame), dye: dye ?? null };
}
/**
 * Keep chosen pictures and files and register them once: a TEXTURE record's (`archive`, `dye` for one metal), with
 * `kind: 'picture'` one the game asks by `name`, or with `kind: 'file'` a whole `file`. A picture is drawn at
 * `drawWidth` x `drawHeight` (its original's size).
 * @param {{ kind?: string, archive?: number, name?: string, file?: string, record?: number, frame?: number,
 *   dye?: string|null, width?: number, height?: number, drawWidth?: number, drawHeight?: number, fileName?: string,
 *   blob: Blob }[]} pictures
 */
export async function saveReplacements(pictures) {
  const savedAt = Date.now();
  const kept = pictures.map((picture) => {
    const { kind = 'texture', width = 0, height = 0, fileName = '', blob } = picture;
    return {
      key: keyOfPicture({ ...picture, kind }),
      kind,
      ...namedBy({ ...picture, kind }),
      width: Number(width),
      height: Number(height),
      drawWidth: Number(picture.drawWidth ?? width),
      drawHeight: Number(picture.drawHeight ?? height),
      fileName: safeFileName(fileName),
      savedAt,
      blob,
    };
  });
  for (const replacement of kept) await backend().put(replacement);
  await registerPlayerReplacements();
  tellListeners();
  return kept;
}
/** Keep one chosen picture: saveReplacements for one. */
export const saveReplacement = async (picture) => (await saveReplacements([picture]))[0];

/** Forget the player's replacements for these pictures (kept records, or pictures as saveReplacements takes them); the
 *  overhaul's or the original pictures draw again. */
export async function clearReplacements(pictures) {
  for (const picture of pictures) await backend().remove(keyOfPicture(picture));
  await registerPlayerReplacements();
  tellListeners();
}
/** Forget the player's replacement for one picture. */
export const clearReplacement = (archive, record, frame = 0) => clearReplacements([{ archive, record, frame }]);
/** Clear All: forget every replacement the player has made. Answers how many there were. */
export async function clearAllReplacements() {
  const kept = await listReplacements();
  await clearReplacements(kept);
  return kept.length;
}

/** Hand every kept replacement to the door that draws it: the texture door, or the doors that ask by name and by file.
 *  Answers how many there are; never throws. */
export async function registerPlayerReplacements() {
  let kept = [];
  try {
    kept = await listReplacements();
  } catch (e) {
    console.warn('[replacements] the kept pictures could not be read:', e?.message ?? e);
  }
  const load = (replacement) => async () => new Uint8Array(await replacement.blob.arrayBuffer());
  const ofKind = (kind) => kept.filter((replacement) => (replacement.kind ?? 'texture') === kind);
  const textures = setPlayerReplacements(
    ofKind('texture').map((replacement) => ({
      archive: replacement.archive,
      record: replacement.record,
      frame: replacement.frame,
      dye: replacement.dye ?? null,
      stamp: replacement.savedAt,
      box: { width: replacement.drawWidth ?? replacement.width, height: replacement.drawHeight ?? replacement.height },
      load: load(replacement),
    })),
  );
  const named = setPlayerPictures(
    ofKind('picture').map((replacement) => ({ name: replacement.name, stamp: replacement.savedAt, blob: replacement.blob, load: load(replacement) })),
  );
  const files = setPlayerFiles(
    ofKind('file').map((replacement) => ({ file: replacement.file, stamp: replacement.savedAt, load: load(replacement) })),
  );
  return textures + named + files;
}
