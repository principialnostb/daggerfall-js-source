// @ts-check
// THE COURIER'S CABINET'S WARES AS THE GAME DRAWS THEM, for the journal's Cabinet in Discord (server-account/journal,
// bundled for it by tools/journalKit.mjs). Each ware is drawn by the painter the game itself uses, so what a player
// buys is what they saw: an aura or Aura Armory pieces on the shop's figure (render/auraPreview.js), a weapon piece on
// the blade's stage (render/weaponPiecePreview.js), a title on its plate over a name, a glyph beside a name, a
// portrait in its bezel (ui/playerBadge.js, ui/profileIcons.js). Nothing here reads the player's game.
import { startAuraPreview } from '../render/auraPreview.js';
import { AURA_KINDLE_S } from '../render/auraRing.js';
import { startWeaponPiecePreview } from '../render/weaponPiecePreview.js';
import { armoryKitOf, armoryKitPieces } from '../net/armoryLaw.js';
import { armoryKitLook, armoryWeaponStage, armoryGlowSpec } from '../systems/weaponGlowLooks.js';
import { titleBadge, paintTitle, glyphBadges, glyphSvgNode } from './playerBadge.js';
import { profileIconNode } from './profileIcons.js';
import { sealWareOf } from '../net/discordShopLaw.js';

/** The moment a still is drawn at (s on the stage's clock): the look fully lit and the camera a quarter round. */
export const STILL_AT_S = 1.5;
/** The stage's dark, the journal's ink-black rather than the game's violet, so a picture sits on its page. */
export const STAGE_CLEAR = Object.freeze([0.055, 0.045, 0.04]);
export const STAGE_GROUND = Object.freeze([0.16, 0.13, 0.1]);

/** Where a still of one armory piece looks, by its slot: the share down the frame its middle stands at, and how far in. */
export const SLOT_FOCUS = Object.freeze({
  head: Object.freeze({ y: 0.21, zoom: 3.2 }),
  torso: Object.freeze({ y: 0.42, zoom: 2.8 }),
  arms: Object.freeze({ y: 0.5, zoom: 2.2 }),
  legs: Object.freeze({ y: 0.79, zoom: 2.3 }),
});

/** @typedef {{ y: number, zoom: number }} Focus */
/** @typedef {{ part: 'figure', aura: string | null, kit: string | null, focus?: Focus } | { part: 'blade', look: string }} StagePart */
/** @typedef {{ how: 'stage', parts: StagePart[] } | { how: 'plate', title: string } | { how: 'glyph', glyph: string } | { how: 'icon', icon: string }} WareDrawing */

/**
 * How a ware is drawn, or null for no ware. An armory weapon piece stands on the blade's stage beside the figure, or
 * alone, since the body pass never draws one. Pure. @param {unknown} id @returns {WareDrawing | null}
 */
export function wareDrawing(id) {
  const w = sealWareOf(id);
  if (!w) return null;
  if (w.kind === 'aura') return { how: 'stage', parts: [{ part: 'figure', aura: w.codes[0], kit: null }] };
  if (w.kind === 'armory') {
    const kit = armoryKitOf(w.codes);
    if (!kit) return null;
    const alone = armoryWeaponStage(kit);
    if (alone) return { how: 'stage', parts: [{ part: 'blade', look: alone }] };
    const look = armoryKitLook(kit);
    const slots = Object.entries(armoryKitPieces(kit)).filter(([, k]) => k).map(([slot]) => slot);
    const focus = slots.length === 1 ? (SLOT_FOCUS[/** @type {keyof typeof SLOT_FOCUS} */ (slots[0])] ?? null) : null;
    /** @type {StagePart} */
    const figure = focus ? { part: 'figure', aura: null, kit, focus } : { part: 'figure', aura: null, kit };
    return { how: 'stage', parts: [figure, ...(look ? [{ part: /** @type {const} */ ('blade'), look }] : [])] };
  }
  if (w.kind === 'title') return { how: 'plate', title: w.codes[0] };
  if (w.kind === 'glyph') return { how: 'glyph', glyph: w.codes[0] };
  if (w.kind === 'icon') return { how: 'icon', icon: w.codes[0] };
  return null;
}

/**
 * One part of a ware's stage, drawn live on `canvas` until stopped: `{ stop, step }`, or null where the canvas has no
 * WebGL2. A canvas taken out of the page stops its own clock. `close` draws the camera in on a part's focus, so a piece
 * is seen up close and moving, as its still frames it.
 * @param {HTMLCanvasElement} canvas @param {StagePart} part @param {{ now?: () => number, close?: boolean }} [o]
 */
export function startPart(canvas, part, o = {}) {
  const now = o.now ?? (() => performance.now() / 1000);
  if (part.part === 'blade') {
    const spec = armoryGlowSpec(part.look);
    return spec ? startWeaponPiecePreview(canvas, spec, { clear: [...STAGE_CLEAR], now }) : null;
  }
  const focus = o.close && part.focus ? part.focus : null;
  return startAuraPreview(canvas, part.aura, { kit: part.kit, now, clear: [...STAGE_CLEAR], ground: [...STAGE_GROUND], focus });
}

/**
 * The share of a stage drawn `zoom` times larger that a still keeps, about `y` down it: `[x, y, w, h]` in 0..1, kept
 * inside the frame. Pure.
 * @param {Focus} focus
 */
export function focusBox({ y, zoom }) {
  const s = 1 / Math.max(1, zoom);
  return [0.5 - s / 2, Math.min(1 - s, Math.max(0, y - s / 2)), s, s];
}

/**
 * A still of one part, drawn by the same stage at STILL_AT_S on a canvas of its own, as an image URL; null where there
 * is no WebGL2. The canvas stands in the page while it draws, since a stage stops on a canvas out of it. A part with a
 * focus is drawn larger and cut to its piece, so a circlet is seen and not a speck.
 * @param {Document} doc @param {StagePart} part @param {{ width?: number, height?: number }} [o]
 * @returns {string | null}
 */
export function partStill(doc, part, { width = 240, height = 240 } = {}) {
  const focus = part.part === 'figure' ? (part.focus ?? null) : null;
  const k = focus ? Math.max(1, focus.zoom) : 1;
  const w = Math.round(width * k), h = Math.round(height * k);
  const canvas = doc.createElement('canvas');
  canvas.style.cssText = `position:fixed;left:-${w + 64}px;top:0;width:${w}px;height:${h}px;visibility:hidden;pointer-events:none`;
  doc.body.append(canvas);
  let t = 0;
  const stage = startPart(canvas, part, { now: () => t });
  try {
    if (!stage) return null;
    t = Math.max(STILL_AT_S, AURA_KINDLE_S + 0.1);
    stage.step();
    if (!focus) return canvas.toDataURL('image/png');
    // the piece's share, cut out before the frame is let go: the drawing buffer is not kept past this task
    const [x, y, bw, bh] = focusBox(focus);
    const cut = doc.createElement('canvas');
    cut.width = Math.round(canvas.width * bw);
    cut.height = Math.round(canvas.height * bh);
    cut.getContext('2d')?.drawImage(canvas, canvas.width * x, canvas.height * y, cut.width, cut.height, 0, 0, cut.width, cut.height);
    return cut.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    stage?.stop();
    canvas.remove();
  }
}

/**
 * A ware drawn as the page draws it, as a node: a title on its plate over `name`, a glyph beside `name`, a portrait in
 * its bezel (animated unless `still`). Null for a ware drawn on a stage, or one the game has no drawing for. The page
 * names the character, in its own words when it has none.
 * @param {Document} doc @param {unknown} id @param {{ name?: string, size?: number, still?: boolean }} [o]
 * @returns {HTMLElement | null}
 */
export function wareNode(doc, id, { name = '', size = 96, still = false } = {}) {
  const d = wareDrawing(id);
  if (!d || d.how === 'stage') return null;
  const el = (/** @type {string} */ tag, /** @type {string} */ cls, /** @type {string} */ text = '') => {
    const n = doc.createElement(tag);
    n.className = cls;
    if (text) n.textContent = text;
    return n;
  };
  if (d.how === 'icon') {
    const svg = profileIconNode(doc, d.icon, 'kit-icon', size, { still });
    if (!svg) return null;
    const box = el('div', 'kit-drawn kit-portrait');
    box.append(svg);
    return box;
  }
  const card = el('div', 'kit-drawn kit-nameplate');
  const who = el('span', 'kit-who', name);
  if (d.how === 'plate') {
    const badge = titleBadge({ title: d.title });
    if (!badge) return null;
    const plate = el('span', 'kit-title', badge.text);
    paintTitle(plate, badge);
    card.append(plate, who);
    return card;
  }
  const g = glyphBadges({ glyphs: [d.glyph] })[0];
  const art = g ? glyphSvgNode(doc, g, 'kit-glyph') : null;
  if (!art) return null;
  const line = el('span', 'kit-line');
  line.append(art, who);
  card.append(line);
  return card;
}
