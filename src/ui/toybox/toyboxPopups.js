// @ts-check
// THE TOYBOX'S SMALL WINDOWS: Summon, Invasion and Dragon Attack. Each names a player or a city in a box whose list of
// matches opens above it, and its button wakes only when the box holds a name from that list. One line under the
// button says what the action answered.
import { createSuggestAbove } from './suggestAbove.js';
import { INVASION_FAMILIES, TOYBOX_EVENT_WAIT_MS } from '../../systems/toybox/toyboxLaw.js';
import {
  TOYBOX_PANEL_CSS,
  TOYBOX_BUTTON_CSS,
  keepFromGame,
  toyButton,
  paintToyButton,
  placeOnScreen,
  makeDraggable,
  titleBar,
  TOYBOX_OFFLINE_TIP,
} from './toyboxWindow.js';
import { PIXEL_FONT_CSS } from '../pixelifyFive.js';

const fold = (/** @type {unknown} */ text) => String(text ?? '').trim().toLowerCase();

/** The name in `names` the box holds, matched whole and case-blind, or null. @param {Iterable<string>} names @param {string} typed */
export function exactName(names, typed) {
  const want = fold(typed);
  if (!want) return null;
  for (const n of names) if (fold(n) === want) return n;
  return null;
}

const INPUT_CSS =
  `${PIXEL_FONT_CSS}font-size:13px;color:#e6f6f8;background:rgba(0,0,0,0.55);border:1px solid rgba(127,227,240,0.45);` +
  `border-radius:3px;padding:3px 6px;width:180px;box-sizing:border-box;`;
const SELECT_CSS = TOYBOX_BUTTON_CSS + 'width:180px;';
const LABEL_CSS = 'display:block;margin:2px 0 3px;';

/** Minutes from staging to start, said in the result line. */
const WAIT_MIN = Math.round(TOYBOX_EVENT_WAIT_MS / 60000);

/**
 * The frame every popup shares: a draggable title bar with X, a body, a status line. Escape closes it unless a list
 * above a box took the key first.
 * @param {Document} doc @param {any} win @param {string} title @param {string} tag @param {() => void} onClose
 */
function popupFrame(doc, win, title, tag, onClose) {
  const root = doc.createElement('div');
  root.setAttribute('data-toybox-popup', tag);
  root.setAttribute('role', 'dialog');
  root.style.cssText = TOYBOX_PANEL_CSS + 'z-index:38;display:none;left:220px;top:120px;';
  keepFromGame(root);
  let shown = false;
  const close = () => {
    if (!shown) return;
    shown = false;
    root.style.display = 'none';
    onClose();
  };
  const { bar } = titleBar(doc, title, close);
  makeDraggable(bar, root, win);
  const body = doc.createElement('div');
  body.style.cssText = 'padding:6px 8px;display:flex;flex-direction:column;gap:4px;';
  const status = doc.createElement('div');
  status.setAttribute('data-toybox-status', '');
  status.style.cssText = 'padding:0 8px 6px;min-height:1em;max-width:220px;white-space:normal;font-size:12px;';
  root.append(bar, body, status);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      close();
    }
  });
  doc.body.append(root);
  return {
    root,
    body,
    say: (/** @type {string} */ line) => {
      status.textContent = String(line ?? '');
    },
    close,
    isOpen: () => shown,
    /** Shows it beside `anchor` (the toybox window's box), or where it last stood. @param {{ left: number, top: number, width: number } | null} anchor */
    show(anchor) {
      shown = true;
      root.style.display = 'block';
      const left = anchor ? anchor.left + anchor.width + 8 : parseFloat(root.style.left) || 0;
      const top = anchor ? anchor.top : parseFloat(root.style.top) || 0;
      placeOnScreen(root, left, top, win);
    },
  };
}

/** A labelled box with its list above it. `onChange` hears every typed or picked change.
 *  @param {Document} doc @param {string} label @param {() => Iterable<string>} list @param {() => void} onChange */
function nameBox(doc, label, list, onChange) {
  const words = doc.createElement('label');
  words.style.cssText = LABEL_CSS;
  words.textContent = label;
  const wrap = doc.createElement('div');
  wrap.style.cssText = 'position:relative;';
  const input = /** @type {HTMLInputElement} */ (doc.createElement('input'));
  input.setAttribute('type', 'text');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.style.cssText = INPUT_CSS;
  wrap.append(input);
  const suggest = createSuggestAbove(input, { list, onPick: () => onChange() });
  input.addEventListener('input', () => onChange());
  return { words, wrap, input, suggest, picked: () => exactName(list(), input.value) };
}

/** Enter in `input` presses `run`, unless the list above took it. @param {HTMLInputElement} input @param {() => void} run */
function enterRuns(input, run) {
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.code === 'NumpadEnter') && !e.defaultPrevented) {
      e.preventDefault();
      run();
    }
  });
}

/**
 * Summon: a player's name, then the Summon button. `onSummon(name, say)` acts; `say` writes the status line.
 * @param {{ doc: Document, win?: any, players: () => Iterable<string>, onSummon: (name: string, say: (line: string) => void) => void, onClose?: () => void }} deps
 */
export function createSummonPopup({ doc, win = doc.defaultView ?? globalThis, players, onSummon, onClose = () => {} }) {
  const frame = popupFrame(doc, win, 'Summon', 'summon', onClose);
  const paint = () => paintToyButton(go, { disabled: !box.picked() });
  const box = nameBox(doc, 'Player', players, () => paint());
  const run = () => {
    const name = box.picked();
    if (!name) return;
    frame.say('');
    onSummon(name, frame.say);
  };
  const go = toyButton(doc, 'Summon', run);
  go.setAttribute('data-toybox-go', '');
  enterRuns(box.input, run);
  frame.body.append(box.words, box.wrap, go);
  paint();
  return {
    el: frame.root,
    input: box.input,
    button: go,
    suggest: box.suggest,
    /** @param {{ left: number, top: number, width: number } | null} [anchor] */
    open(anchor = null) {
      box.input.value = '';
      box.suggest.close();
      frame.say('');
      paint();
      frame.show(anchor);
      box.input.focus?.();
    },
    close: frame.close,
    isOpen: frame.isOpen,
    say: frame.say,
    dispose: () => frame.root.remove(),
  };
}

/**
 * The Teleport popup: Open Map (the portal stone's map, as the button did before), and below it a player's name and
 * To Player, which goes to where that player stands. `online()` greys the player half offline, where no one else is.
 * @param {{ doc: Document, win?: any, players: () => Iterable<string>, online?: () => boolean, onMap: () => void,
 *   onToPlayer: (name: string, say: (line: string) => void) => void, onClose?: () => void }} deps
 */
export function createTeleportPopup({ doc, win = doc.defaultView ?? globalThis, players, online = () => true, onMap, onToPlayer, onClose = () => {} }) {
  const frame = popupFrame(doc, win, 'Teleport', 'teleport', onClose);
  const map = toyButton(doc, 'Open Map', () => onMap());
  map.setAttribute('data-toybox-map', '');
  const paint = () => paintToyButton(go, { disabled: !online() || !box.picked(), tip: online() ? '' : TOYBOX_OFFLINE_TIP });
  const box = nameBox(doc, 'Player', players, () => paint());
  const run = () => {
    const name = box.picked();
    if (!name || !online()) return;
    frame.say('');
    onToPlayer(name, frame.say);
  };
  const go = toyButton(doc, 'To Player', run);
  go.setAttribute('data-toybox-go', '');
  enterRuns(box.input, run);
  frame.body.append(map, box.words, box.wrap, go);
  paint();
  return {
    el: frame.root,
    input: box.input,
    button: go,
    map,
    suggest: box.suggest,
    /** @param {{ left: number, top: number, width: number } | null} [anchor] */
    open(anchor = null) {
      box.input.value = '';
      box.input.disabled = !online();
      box.suggest.close();
      frame.say('');
      paint();
      frame.show(anchor);
      if (online()) box.input.focus?.();
    },
    close: frame.close,
    isOpen: frame.isOpen,
    say: frame.say,
    /** Re-reads online(): the player half greys or wakes. */
    refresh: paint,
    dispose: () => frame.root.remove(),
  };
}

/**
 * A city event's popup: Invasion (a city and a family of enemies) or Dragon Attack (a city). `onStart` stages it and
 * answers whether it took; the answer is said on the status line.
 * @param {{ doc: Document, win?: any, kind: 'invasion' | 'dragon', cities: () => Iterable<string>,
 *   onStart: (spec: { kind: 'invasion' | 'dragon', city: string, family?: string }) => Promise<{ ok: boolean, error?: string }> | { ok: boolean, error?: string },
 *   onClose?: () => void }} deps
 */
function createCityEventPopup({ doc, win = doc.defaultView ?? globalThis, kind, cities, onStart, onClose = () => {} }) {
  const invasion = kind === 'invasion';
  const frame = popupFrame(doc, win, invasion ? 'Invasion' : 'Dragon Attack', kind, onClose);
  let busy = false;
  const paint = () => paintToyButton(go, { disabled: busy || !box.picked() });
  const box = nameBox(doc, invasion ? 'City' : 'Location', cities, () => paint());
  /** @type {HTMLSelectElement | null} */
  let select = null;
  const run = async () => {
    const city = box.picked();
    if (!city || busy) return;
    /** @type {{ kind: 'invasion' | 'dragon', city: string, family?: string }} */
    const spec = { kind, city };
    if (select) spec.family = select.value || INVASION_FAMILIES[0].id;
    busy = true;
    paint();
    frame.say('Staging...');
    let got;
    try {
      got = await onStart(spec);
    } catch (err) {
      got = { ok: false, error: String(/** @type {any} */ (err)?.message ?? err) };
    }
    busy = false;
    paint();
    if (got?.ok) frame.say(`${invasion ? 'Invasion' : 'Dragon attack'} staged at ${city}. It starts in ${WAIT_MIN} minutes.`);
    else frame.say(got?.error || 'The event could not be staged.');
  };
  const go = toyButton(doc, invasion ? 'Commence' : 'Summon', () => void run());
  go.setAttribute('data-toybox-go', '');
  enterRuns(box.input, () => void run());
  frame.body.append(box.words, box.wrap);
  if (invasion) {
    const words = doc.createElement('label');
    words.style.cssText = LABEL_CSS;
    words.textContent = 'Enemies';
    select = /** @type {HTMLSelectElement} */ (doc.createElement('select'));
    select.setAttribute('data-toybox-family', '');
    select.style.cssText = SELECT_CSS;
    for (const fam of INVASION_FAMILIES) {
      const option = /** @type {HTMLOptionElement} */ (doc.createElement('option'));
      option.value = fam.id;
      option.textContent = fam.label;
      select.append(option);
    }
    select.value = INVASION_FAMILIES[0].id;
    frame.body.append(words, select);
  }
  frame.body.append(go);
  paint();
  return {
    el: frame.root,
    input: box.input,
    button: go,
    select,
    suggest: box.suggest,
    /** @param {{ left: number, top: number, width: number } | null} [anchor] */
    open(anchor = null) {
      box.input.value = '';
      box.suggest.close();
      frame.say('');
      paint();
      frame.show(anchor);
      box.input.focus?.();
    },
    close: frame.close,
    isOpen: frame.isOpen,
    say: frame.say,
    /** The action's press, awaited (for tests). */
    run,
    dispose: () => frame.root.remove(),
  };
}

/** Invasion: a city, the enemies' family, then Commence.
 *  @param {{ doc: Document, win?: any, cities: () => Iterable<string>, onStart: (spec: { kind: 'invasion' | 'dragon', city: string, family?: string }) => any, onClose?: () => void }} deps */
export const createInvasionPopup = (deps) => createCityEventPopup({ ...deps, kind: 'invasion' });

/** Dragon Attack: a city, then Summon.
 *  @param {{ doc: Document, win?: any, cities: () => Iterable<string>, onStart: (spec: { kind: 'invasion' | 'dragon', city: string, family?: string }) => any, onClose?: () => void }} deps */
export const createDragonPopup = (deps) => createCityEventPopup({ ...deps, kind: 'dragon' });
