// @ts-check
// THE OFFLINE COMMAND BAR: one line for slash commands where no chat runs. Offline play has no chat panel, so a
// developer's /toybox needs its own box. Enter sends the line and closes the box; Escape closes it. While it is open,
// its keys are its own: the game never walks or acts on them.
import { PIXEL_FONT_CSS, PIXEL_TEXT_SHADOW } from './pixelifyFive.js';

const ROOT_CSS =
  `position:fixed;left:12px;bottom:12px;z-index:42;display:none;flex-direction:column;gap:3px;${PIXEL_FONT_CSS}` +
  `font-size:13px;color:#e6f6f8;text-shadow:${PIXEL_TEXT_SHADOW};pointer-events:auto;`;
const INPUT_CSS =
  `${PIXEL_FONT_CSS}font-size:14px;color:#e6f6f8;background:rgba(10,12,16,0.78);border:1px solid rgba(127,227,240,0.55);` +
  `border-radius:3px;padding:4px 8px;width:320px;box-sizing:border-box;outline:none;`;
const LINE_CSS = 'background:rgba(10,12,16,0.66);border-radius:3px;padding:2px 8px;max-width:320px;';
/** How long the answer line stays after the box closes, ms. */
export const OFFLINE_LINE_MS = 6000;

/**
 * `onSubmit(text)` hears the line and answers a line to show, or null. `setTimer`/`clearTimer` stand in for the
 * window's in tests.
 * @param {{ doc: Document, win?: any, onSubmit: (text: string) => (string | null | undefined),
 *   setTimer?: (f: () => void, ms: number) => any, clearTimer?: (t: any) => void }} deps
 */
export function createOfflineCommandBar({
  doc,
  win = doc.defaultView ?? globalThis,
  onSubmit,
  setTimer = (fn, delayMs) => setTimeout(fn, delayMs),
  clearTimer = (handle) => clearTimeout(handle),
}) {
  const root = doc.createElement('div');
  root.setAttribute('data-offline-command-bar', '');
  root.style.cssText = ROOT_CSS;
  const line = doc.createElement('div');
  line.setAttribute('data-offline-command-line', '');
  line.style.cssText = LINE_CSS + 'display:none;';
  const input = /** @type {HTMLInputElement} */ (doc.createElement('input'));
  input.setAttribute('type', 'text');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('placeholder', 'Type a command');
  input.style.cssText = INPUT_CSS;
  root.append(line, input);
  doc.body.append(root);
  let shown = false;
  /** @type {any} */
  let timer = null;

  const showLine = (/** @type {string} */ text) => {
    if (timer != null) clearTimer(timer);
    timer = null;
    line.textContent = text;
    line.style.display = text ? 'block' : 'none';
    root.style.display = shown || text ? 'flex' : 'none';
    if (text)
      timer = setTimer(() => {
        timer = null;
        line.textContent = '';
        line.style.display = 'none';
        if (!shown) root.style.display = 'none';
      }, OFFLINE_LINE_MS);
  };
  const close = () => {
    if (!shown) return;
    shown = false;
    input.style.display = 'none';
    input.blur?.();
    win.removeEventListener?.('keydown', onWinKey, true);
    if (!line.textContent) root.style.display = 'none';
  };
  const submit = () => {
    const text = String(input.value ?? '').trim();
    input.value = '';
    close();
    if (!text) return;
    const said = onSubmit(text);
    showLine(typeof said === 'string' ? said : '');
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (!e.repeat) submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  // The game's own capture listeners read keys on the window before they reach the box; this one, while the box is
  // open, ends the trip for any key meant for the box, so later listeners never act on it.
  const onWinKey = (/** @type {KeyboardEvent} */ e) => {
    if (!shown || e.target !== input) return;
    e.stopImmediatePropagation?.();
    onKey(e);
  };
  input.addEventListener('keydown', onKey);
  for (const k of ['keyup', 'keypress', 'pointerdown', 'mousedown', 'click'])
    root.addEventListener(k, (e) => e.stopPropagation());
  input.addEventListener('blur', () => close());
  input.style.display = 'none';

  return {
    el: root,
    input,
    /** Opens the box holding `start`, the caret after it (the key that opened it, typed as it would be in a chat). @param {string} [start] */
    open(start = '') {
      if (shown) return;
      shown = true;
      input.value = String(start);
      input.style.display = '';
      root.style.display = 'flex';
      win.addEventListener?.('keydown', onWinKey, true);
      input.focus?.();
      input.setSelectionRange?.(input.value.length, input.value.length);
    },
    close,
    isOpen: () => shown,
    /** Shows a line above the box for a while, the box open or not. @param {string} text */
    say: (text) => showLine(String(text ?? '')),
    dispose() {
      close();
      if (timer != null) clearTimer(timer);
      root.remove();
    },
  };
}
