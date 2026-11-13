// @ts-check
// AN INVASION'S SIDE PANEL, the Starfall tracker's shape (ui/starfall/starTracker.js): in the right-hand column under
// the quest card, its title, the wave and how many are left, the foes standing and the boss's state. Its lines are
// ui/toybox/invasionHud.js invasionTrackerModel's. Made once and updated: a part is written only when its words change.
// It publishes its bottom (INVASION_TRACKER_HEIGHT_VAR) so the party list steps under it, as it does for the star's.
import { PIXEL_FONT_CSS } from '../pixelifyFive.js';

export const INVASION_TRACKER_STYLE_ID = 'dagger-invasion-tracker-style';
/** The parts, in their order down the panel. */
export const INVASION_TRACKER_KEYS = Object.freeze(['title', 'wave', 'foes', 'boss']);
export const INVASION_TRACKER_HEIGHT_VAR = '--dfinv-h';
/** The party list's line (ui/partyPanel.js .dfparty) and the gap it keeps under the panel, px. */
const PARTY_TOP = 92;
const GAP = 8;

export const INVASION_TRACKER_CSS = `
.inv-hud { position: fixed; right: calc(8px + env(safe-area-inset-right, 0px)); top: max(var(--inv-floor, 0px), calc(${PARTY_TOP}px + var(--dfquest-h, 0px) + env(safe-area-inset-top, 0px)));
  width: min(300px, 72vw); box-sizing: border-box; pointer-events: none; z-index: 30; padding: 9px 12px 10px;
  background: rgba(24,10,8,0.82); border: 2px solid rgba(232,90,58,0.7); ${PIXEL_FONT_CSS} font-size: calc(14px * var(--hud-scale, 1));
  line-height: 1.35; color: #f6e8dc; text-shadow: 2px 2px 0 rgba(0,0,0,0.85); }
@media (max-width: 1100px) { .inv-hud { --inv-floor: 24%; } }
@media (max-width: 640px) { .inv-hud { --inv-floor: 16%; padding: 7px 10px 8px; } }
.inv-hud-title { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #e85a3a; }
.inv-hud-wave { font-size: 16px; margin-top: 3px; color: #ffffff; }
.inv-hud-foes { font-size: 13px; margin-top: 2px; color: #e0c8bc; }
.inv-hud-boss { font-size: 15px; margin-top: 6px; color: #ffb27a; }
.inv-hud.p3 .inv-hud-boss { color: #ff6a4a; }
.inv-hud-foes:empty { display: none; }
@media (min-width: 561px) {
  body:has(.inv-hud.on) .dfparty { top: calc(${PARTY_TOP}px + max(var(--dfquest-h, 0px), var(${INVASION_TRACKER_HEIGHT_VAR}, 0px)) + env(safe-area-inset-top, 0px)); }
}
`;

/** @type {any} */
let root = null;
/** @type {Record<string, any> | null} */
let parts = null;
/** @type {Record<string, string>} */
let shown = {};

function build(/** @type {any} */ doc) {
  if (!doc.getElementById?.(INVASION_TRACKER_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = INVASION_TRACKER_STYLE_ID;
    style.textContent = INVASION_TRACKER_CSS;
    (doc.head ?? doc.body)?.append(style);
  }
  const part = (/** @type {string} */ cls) => {
    const node = doc.createElement('div');
    node.className = cls;
    return node;
  };
  root = part('inv-hud');
  parts = Object.fromEntries(INVASION_TRACKER_KEYS.map((key) => [key, part(`inv-hud-${key}`)]));
  parts.boss.setAttribute?.('aria-live', 'polite');
  root.append(...INVASION_TRACKER_KEYS.map((key) => parts?.[key]));
  (doc.body ?? doc.documentElement)?.append(root);
}

/** Its bottom against the party list's line, published (0 while hidden). */
function publish(/** @type {any} */ doc, /** @type {boolean} */ on) {
  const style = doc?.documentElement?.style;
  if (!style?.setProperty) return;
  const box = on ? root?.getBoundingClientRect?.() : null;
  const px = box && Number.isFinite(box.bottom) && box.bottom > 0 ? Math.ceil(box.bottom) - PARTY_TOP + GAP : 0;
  style.setProperty(INVASION_TRACKER_HEIGHT_VAR, `${Math.max(0, px)}px`);
}

/**
 * The panel for a model (null hides it): `{ title, wave, foes, boss, phase }`; `hidden` the HUD's own hide.
 * @param {any} model @param {{ hidden?: boolean, doc?: any }} [opts]
 */
export function drawInvasionTracker(model, { hidden = false, doc = globalThis.document } = {}) {
  const want = !hidden && !!model;
  if (!root) {
    if (!want || !doc?.createElement) return;
    build(doc);
  }
  const vis = want ? 'on' : 'off';
  let moved = false;
  if (vis !== shown.vis) {
    shown.vis = vis;
    root.style.display = want ? '' : 'none';
    moved = true;
  }
  if (!want) {
    if (moved) {
      shown.cls = '';
      root.className = 'inv-hud';
      publish(doc, false);
    }
    return;
  }
  for (const key of INVASION_TRACKER_KEYS) {
    const text = model[key] ?? '';
    if (text === shown[key]) continue;
    shown[key] = text;
    /** @type {any} */ (parts)[key].textContent = text;
    moved = true;
  }
  const cls = `inv-hud on${model.phase >= 3 ? ' p3' : ''}`;
  if (cls !== shown.cls) {
    shown.cls = cls;
    root.className = cls;
    moved = true;
  }
  if (moved) publish(doc, true);
}

/** The panel taken down (a load, a reset). */
export function destroyInvasionTracker() {
  const doc = root?.ownerDocument;
  root?.remove?.();
  if (root) publish(doc ?? globalThis.document, false);
  root = null;
  parts = null;
  shown = {};
}
