// PLUS6: THE GAUNTLET CURSOR (Enhanced Plus only) - the grey gauntlet, and a second frame with the pointing finger
// drawn in while a mouse button is held (click and hold, drag). Pixel art, two sizes (1x, and 2x for dense screens),
// embedded so it needs no asset. The hot spot is the fingertip in both frames, so a press never moves the point.
// CURSOR-EDGE: 31x32 (62x64 at 2x), never more than 32 on a side. Chromium shows a custom cursor larger than 32 DIP
// only while the whole image lies inside the viewport, and the OS arrow anywhere else - the gauntlet was 31x34 and went
// to the arrow within 31 px of the right edge and 34 px of the foot. Two rows of the hand were dropped to fit.
// A text field keeps the text caret. installPlusCursor() is called once, when the Plus sheet is laid on the page.

import { getPref, setPref } from '../../systems/uiPrefs.js';
import {
  GAUNTLET_POINT_1X as N1,
  GAUNTLET_POINT_2X as N2,
  GAUNTLET_PRESS_1X as P1,
  GAUNTLET_PRESS_2X as P2,
} from './gauntletArt.js';

/** PADPLUS1: the two frames at 1x, for the controller cursor (ui/gamepadInput.js), which draws its own element. */
export const GAUNTLET_POINT = N1;
export const GAUNTLET_PRESS = P1;
export const CURSOR_HOTSPOT = [0, 0];
const cur = (a, b) => `image-set(url("${a}") 1x, url("${b}") 2x) ${CURSOR_HOTSPOT[0]} ${CURSOR_HOTSPOT[1]}, auto`;
const curFallback = (a) => `url("${a}") ${CURSOR_HOTSPOT[0]} ${CURSOR_HOTSPOT[1]}, auto`;

export const CURSOR_CSS = `
/* ── PLUS6: THE GAUNTLET CURSOR ── !important on purpose: many buttons and rails (and sheets injected after this one)
   set their own cursor: pointer, which showed the system hand over them. The gauntlet is the one pointer Plus has. */
html:not(.plus-nocursor), html:not(.plus-nocursor) *, html:not(.plus-nocursor) *::before, html:not(.plus-nocursor) *::after { cursor: ${curFallback(N1)} !important; cursor: ${cur(N1, N2)} !important; }
html.plus-press:not(.plus-nocursor), html.plus-press:not(.plus-nocursor) *, html.plus-press:not(.plus-nocursor) *::before, html.plus-press:not(.plus-nocursor) *::after { cursor: ${curFallback(P1)} !important; cursor: ${cur(P1, P2)} !important; }
/* DROPS-AUDIT F7: a controller hides the pointer on the canvas (gamepadInput.js: Cursor.visible = false) - the gauntlet
   stands down there too, or it sat parked beside the controller's own cursor */
html:not(.plus-nocursor) canvas[style*="cursor: none"] { cursor: none !important; }
html:not(.plus-nocursor) input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), html:not(.plus-nocursor) textarea, html:not(.plus-nocursor) [contenteditable="true"] { cursor: text !important; }
`;

/** PLUS6: the gauntlet is ON unless the player turned it off (UI Overhaul card, Enhanced Plus). */
export const plusCursorOn = () => getPref('plusCursor') !== false;
/** Wear the stored choice on the page: off puts .plus-nocursor on the root and the rules above stand down. */
export function applyPlusCursor(doc = globalThis.document) {
  doc?.documentElement?.classList?.toggle('plus-nocursor', !plusCursorOn());
}
/** Choose: stored, and worn at once - no reload. */
export function setPlusCursor(on, doc = globalThis.document) {
  setPref('plusCursor', !!on);
  applyPlusCursor(doc);
}

let installed = false;
export function installPlusCursor(doc = globalThis.document) {
  const win = doc?.defaultView;
  if (installed || !win) return;
  installed = true;
  const root = doc.documentElement;
  applyPlusCursor(doc);
  // CLICK-STUTTER (2026-10-13, field: "when I'm spamming the left mouse button the game starts to stutter"): the press
  // frame is a class on <html>, and the rules above match EVERY element and pseudo-element under it - so each toggle
  // restyles the whole page, twice a click. With the pointer LOCKED (a swing in the world) there is no cursor to draw:
  // the press is not worn at all, and a class left on from before the lock is taken off once.
  const down = (e) => {
    if (e.pointerType === 'touch' || doc.pointerLockElement) return;
    if (!root.classList.contains('plus-press')) root.classList.add('plus-press');
  };
  const up = () => {
    if (root.classList.contains('plus-press')) root.classList.remove('plus-press');
  };
  win.addEventListener('pointerdown', down, { capture: true, passive: true });
  win.addEventListener('pointerup', up, { capture: true, passive: true });
  win.addEventListener('pointercancel', up, { capture: true, passive: true });
  win.addEventListener('blur', up);
}
