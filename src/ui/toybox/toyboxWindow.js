// @ts-check
// THE TOYBOX WINDOW: a developer's see-through panel of tools, one button per option. Its title bar drags it, and it
// stays on screen. Presses and keys inside it are the window's own: the world under it never reads them. Releases are
// left to bubble, so a drag the game began elsewhere still ends.
import { PIXEL_FONT_CSS, PIXEL_TEXT_SHADOW } from '../pixelifyFive.js';
import { STAFF_TAG_COLORS } from '../staffTags.js';
import { capturePointer, releasePointer } from '../pointerCapture.js';
import { TOYBOX_OPTIONS, TOYBOX_ONLINE_ONLY } from '../../systems/toybox/toyboxLaw.js';

export const TOYBOX_PANEL_CSS =
  `position:fixed;z-index:40;box-sizing:border-box;${PIXEL_FONT_CSS}font-size:13px;color:${STAFF_TAG_COLORS.plain};` +
  `background:rgba(10,12,16,0.72);border:1px solid rgba(127,227,240,0.45);border-radius:4px;` +
  `text-shadow:${PIXEL_TEXT_SHADOW};pointer-events:auto;user-select:none;`;
export const TOYBOX_TITLE_CSS =
  `display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 4px 3px 8px;cursor:move;` +
  `color:${STAFF_TAG_COLORS.name};background:rgba(127,227,240,0.10);border-bottom:1px solid rgba(127,227,240,0.3);` +
  `touch-action:none;`;
export const TOYBOX_BUTTON_CSS =
  `${PIXEL_FONT_CSS}font-size:13px;color:${STAFF_TAG_COLORS.plain};background:rgba(127,227,240,0.12);` +
  `border:1px solid rgba(127,227,240,0.45);border-radius:3px;padding:3px 10px;cursor:pointer;` +
  `text-shadow:${PIXEL_TEXT_SHADOW};text-align:left;`;
const LIT_BG = 'rgba(127,227,240,0.45)';
const LIT_BORDER = STAFF_TAG_COLORS.name;
const OFF_BG = 'rgba(127,227,240,0.12)';
const OFF_BORDER = 'rgba(127,227,240,0.45)';

/** The tooltip on an option offline play cannot run. */
export const TOYBOX_OFFLINE_TIP = 'Needs online play.';

/** The events a panel keeps from the game. Releases are not among them. */
const KEPT = ['pointerdown', 'mousedown', 'click', 'dblclick', 'wheel', 'contextmenu', 'keydown', 'keyup', 'keypress'];

/** Keeps the game from reading presses and keys made inside `target`. @param {HTMLElement} target */
export function keepFromGame(target) {
  for (const k of KEPT) target.addEventListener(k, (e) => e.stopPropagation());
}

/** A button that never keeps the keyboard's focus, so the space bar cannot press it again.
 *  @param {Document} doc @param {string} label @param {() => void} run */
export function toyButton(doc, label, run) {
  const b = doc.createElement('button');
  b.setAttribute('type', 'button');
  b.style.cssText = TOYBOX_BUTTON_CSS;
  b.textContent = label;
  b.tabIndex = -1;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    b.blur?.();
    if (!b.disabled) run();
  });
  return b;
}

/** Shows `b` lit or not, and enabled or greyed with `tip`. @param {HTMLButtonElement} b @param {{ lit?: boolean, disabled?: boolean, tip?: string }} s */
export function paintToyButton(b, { lit = false, disabled = false, tip = '' }) {
  b.style.background = lit ? LIT_BG : OFF_BG;
  b.style.borderColor = lit ? LIT_BORDER : OFF_BORDER;
  b.style.color = lit ? '#ffffff' : STAFF_TAG_COLORS.plain;
  b.style.opacity = disabled ? '0.4' : '1';
  b.style.cursor = disabled ? 'not-allowed' : 'pointer';
  b.disabled = disabled;
  if (tip) b.setAttribute('title', tip);
  else b.removeAttribute?.('title');
  b.setAttribute('aria-pressed', lit ? 'true' : 'false');
}

/** Puts `panel` at (left, top), held inside the viewport. @param {HTMLElement} panel @param {number} left @param {number} top @param {any} win */
export function placeOnScreen(panel, left, top, win) {
  const viewW = Number(win?.innerWidth) || 1024,
    viewH = Number(win?.innerHeight) || 768;
  const panelW = Number(panel.offsetWidth) || 0,
    panelH = Number(panel.offsetHeight) || 0;
  const x = Math.max(0, Math.min(left, viewW - panelW));
  const y = Math.max(0, Math.min(top, viewH - panelH));
  panel.style.left = `${Math.round(x)}px`;
  panel.style.top = `${Math.round(y)}px`;
  return { left: x, top: y };
}

/** Lets `handle` drag `panel`. The pointer is captured, so a fast hand never drops the drag.
 *  @param {HTMLElement} handle @param {HTMLElement} panel @param {any} win */
export function makeDraggable(handle, panel, win) {
  /** @type {{ id: number | null, x: number, y: number, left: number, top: number } | null} */
  let drag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    if (/** @type {any} */ (e.target)?.tagName === 'BUTTON') return;
    e.preventDefault();
    drag = {
      id: e.pointerId ?? null,
      x: Number(e.clientX) || 0,
      y: Number(e.clientY) || 0,
      left: parseFloat(panel.style.left) || 0,
      top: parseFloat(panel.style.top) || 0,
    };
    if (e.pointerId != null) capturePointer(handle, e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!drag || (drag.id != null && e.pointerId != null && e.pointerId !== drag.id)) return;
    placeOnScreen(panel, drag.left + (Number(e.clientX) || 0) - drag.x, drag.top + (Number(e.clientY) || 0) - drag.y, win);
  });
  const end = () => {
    if (!drag) return;
    const id = drag.id;
    drag = null;
    if (id != null) releasePointer(handle, id);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  return { dragging: () => !!drag };
}

/** A title bar with its words and a close (X) button. @param {Document} doc @param {string} title @param {() => void} onClose */
export function titleBar(doc, title, onClose) {
  const bar = doc.createElement('div');
  bar.style.cssText = TOYBOX_TITLE_CSS;
  const words = doc.createElement('span');
  words.textContent = title;
  const x = toyButton(doc, 'X', onClose);
  x.setAttribute('aria-label', 'Close');
  x.setAttribute('data-toybox-close', '');
  x.style.padding = '0 6px';
  bar.append(words, x);
  return { bar, close: x };
}

/**
 * The toybox window. `onPick(id)` hears a press of an option; `onClose()` hears the window close itself (X or Escape).
 * @param {{ doc: Document, win?: any, onPick: (id: string) => void, onClose?: () => void }} deps
 */
export function createToyboxWindow({ doc, win = doc.defaultView ?? globalThis, onPick, onClose = () => {} }) {
  const root = doc.createElement('div');
  root.setAttribute('data-toybox', '');
  root.setAttribute('role', 'dialog');
  root.style.cssText = TOYBOX_PANEL_CSS + 'display:none;left:24px;top:120px;min-width:170px;';
  keepFromGame(root);
  let shown = false;
  const close = () => {
    if (!shown) return;
    shown = false;
    root.style.display = 'none';
    onClose();
  };
  const { bar } = titleBar(doc, 'Toybox', close);
  makeDraggable(bar, root, win);
  const list = doc.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:6px 8px;';
  /** @type {Map<string, HTMLButtonElement>} */
  const buttons = new Map();
  for (const option of TOYBOX_OPTIONS) {
    const b = toyButton(doc, option.label, () => onPick(option.id));
    b.setAttribute('data-toybox-option', option.id);
    buttons.set(option.id, b);
    list.append(b);
  }
  const status = doc.createElement('div');
  status.setAttribute('data-toybox-status', '');
  status.style.cssText = 'padding:0 8px 6px;min-height:1em;max-width:220px;white-space:normal;font-size:12px;';
  root.append(bar, list, status);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });
  doc.body.append(root);
  /** @type {string} */
  let painted = '';
  return {
    el: root,
    open() {
      if (shown) return;
      shown = true;
      root.style.display = 'block';
      placeOnScreen(root, parseFloat(root.style.left) || 0, parseFloat(root.style.top) || 0, win);
    },
    close,
    isOpen: () => shown,
    /** Lights the toggles that are on and greys the online-only options offline. Writes only on a change.
     *  @param {{ lit: Record<string, boolean>, online: boolean }} s */
    paint({ lit, online }) {
      const key = JSON.stringify([TOYBOX_OPTIONS.map((option) => !!lit?.[option.id]), !!online]);
      if (key === painted) return;
      painted = key;
      for (const option of TOYBOX_OPTIONS) {
        const off = !online && TOYBOX_ONLINE_ONLY.includes(option.id);
        paintToyButton(/** @type {HTMLButtonElement} */ (buttons.get(option.id)), {
          lit: option.toggle && !!lit?.[option.id],
          disabled: off,
          tip: off ? TOYBOX_OFFLINE_TIP : '',
        });
      }
    },
    /** One line under the buttons; empty clears it. @param {string} line */
    say(line) {
      status.textContent = String(line ?? '');
    },
    /** @param {string} id */
    button: (id) => buttons.get(id) ?? null,
    dispose() {
      shown = false;
      root.remove();
    },
  };
}
