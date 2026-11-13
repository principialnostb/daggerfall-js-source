// @ts-check
// The Courier's Cabinet, as a cabinet: a shelf for each kind, each ware a card showing the ware as the game draws it, a
// ribbon on what is yours. The pictures come from the game's own painters (kit/, built from
// src/journalKit/cabinetPreview.js by tools/journalKit.mjs); where the kit or WebGL2 is missing, a card shows the ware's wax seal instead. A card's
// picture opens the ware up close: an aura or armory pieces moving on the figure, a weapon piece on its blade.
// A ware is bought by pressing its seal and holding it while the wax ring fills (or, by keyboard, Enter twice), so a
// passing click never spends Seals. The purchase is the router's own press (pdaCabinet.js), as in Discord.
import { ask, AskError } from './api.js';
import { escapeHtml } from './md.js';
import { localUrl } from './render.js';
import { sounds } from './sound.js';
import { wordsFor } from './words.js';

/** @typedef {typeof import('../../src/journalKit/cabinetPreview.js')} Kit */
/** @typedef {import('../../src/journalKit/cabinetPreview.js').StagePart} StagePart */

/** How long a seal is held to buy, ms. */
const HOLD_MS = 1100;
const grouped = (/** @type {number} */ n) => Number(n).toLocaleString('en-US');
const lessMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/** The kit's address beside this page; a name, not a literal, so a checkout that has not built it still type-checks. */
const KIT_URL = new URL('./kit/cabinetPreview.js', import.meta.url).href;
/** @type {Promise<Kit | null> | null} */
let kitAsk = null;
/** The game's painters, loaded once and only when the Cabinet opens; null where the kit is not there. */
const loadKit = () =>
  (kitAsk ??= import(/* @vite-ignore */ KIT_URL).then((m) => /** @type {Kit} */ (m)).catch(() => null));
/** Stills already drawn, by ware and part, kept while the page is open (the Cabinet redraws after each purchase). */
/** @type {Map<string, string | null>} */
const stills = new Map();
/** @param {Kit} kit @param {string} id @param {number} i @param {StagePart} part */
function stillOf(kit, id, i, part) {
  const key = `${id}:${i}`;
  if (!stills.has(key))
    stills.set(
      key,
      kit.partStill(document, part, part.part === 'blade' ? { width: 120, height: 240 } : { width: 240, height: 240 }),
    );
  return stills.get(key) ?? null;
}

/**
 * The Cabinet, mounted on the chapter's page. Answers its unmount.
 * @param {HTMLElement} host @param {{ onSeals?: (n: number) => void }} [o]
 */
export function mountCabinet(host, o = {}) {
  host.innerHTML = '<div class="cabinet"><p class="margin">Loading the Cabinet…</p></div>';
  const root = /** @type {HTMLElement} */ (host.firstElementChild);
  /** @type {any} */
  let cab = null;
  let alive = true;
  let buying = false;
  /** Each draw's number: a picture still being drawn for an older one is dropped. */
  let drawn = 0;
  /** @type {{ id: string, box: HTMLElement, stop: () => void, refresh: () => void } | null} */
  let viewer = null;

  async function load() {
    try {
      cab = await ask('cabinet');
    } catch (e) {
      root.innerHTML = `<p class="margin">${escapeHtml(e instanceof AskError ? wordsFor(e.body?.error) : 'The Cabinet could not load. Try again later.')}</p>`;
      return;
    }
    if (!alive) return;
    draw();
    viewer?.refresh();
  }

  const nameOf = () => String(cab?.name || 'Your name');
  /** The words under a ware's name: its price, or that it is yours, and how to buy it. @param {any} w */
  function buyWords(w) {
    const short = !w.held && w.price > cab.seals;
    const price = w.held
      ? 'Yours'
      : `${grouped(w.price)} ${escapeHtml(cab.word)}${w.price < w.seals ? ` <s>${grouped(w.seals)}</s>` : ''}`;
    const hint = w.held
      ? ''
      : `<div class="ware-hint">${short ? `You need ${grouped(w.price - cab.seals)} more Seals` : 'Press and hold the seal to buy'}</div>`;
    return `<div class="ware-price">${price}</div>${hint}`;
  }
  /** A ware's wax seal: the buy control, its ring filling as it is held. @param {any} w */
  function sealHtml(w) {
    const art = localUrl(w.art);
    return `<div class="ware-seal">${art ? `<img src="${escapeHtml(art)}" alt="" draggable="false">` : '<span class="seal-blank"></span>'}<svg class="hold-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/></svg></div>`;
  }

  function draw() {
    const n = ++drawn;
    const shelves = cab.kinds
      .map((/** @type {any} */ k) => {
        const wares = cab.wares.filter((/** @type {any} */ w) => w.kind === k.key);
        return `<section class="shelf ink"><header><h3>${escapeHtml(k.label)}</h3><p>${escapeHtml(k.what)}</p></header><div class="wares">${wares
          .map((/** @type {any} */ w) => {
            const short = !w.held && w.price > cab.seals;
            const art = localUrl(w.art);
            return `<article class="ware ware-${escapeHtml(w.kind)}${w.held ? ' held' : ''}${short ? ' short' : ''}${w.set ? ' set' : ''}" data-id="${escapeHtml(w.id)}" tabindex="0" aria-label="${escapeHtml(w.name)}">
              <button type="button" class="ware-view" aria-label="See ${escapeHtml(w.name)} up close"><span class="ware-pic">${art ? `<img class="ware-pic-seal" src="${escapeHtml(art)}" alt="" draggable="false">` : ''}</span><span class="ware-zoom">See it up close</span></button>
              <div class="ware-name">${escapeHtml(w.name)}</div>
              <div class="ware-look">${escapeHtml(w.look)}</div>
              <div class="ware-buy">${sealHtml(w)}<div class="ware-words">${buyWords(w)}</div></div>
              ${w.held ? '<div class="ribbon">Yours</div>' : ''}
            </article>`;
          })
          .join('')}</div></section>`;
      })
      .join('');
    root.innerHTML = `<div class="purse ink"><span class="purse-seal" aria-hidden="true"></span><strong>${grouped(cab.seals)}</strong> ${escapeHtml(cab.word)}<small>Earn Seals at sea and on expeditions. Seals cannot be bought or traded.</small></div>${shelves}<p class="margin ink">All items are cosmetic. They unlock for all your characters at once, and a letter arrives in your mailbox in the game.</p>`;
    for (const card of root.querySelectorAll('.ware')) {
      const el = /** @type {HTMLElement} */ (card);
      const w = cab.wares.find((/** @type {any} */ x) => x.id === el.dataset.id);
      if (!w) continue;
      wireBuy(el, w);
      el.querySelector('.ware-view')?.addEventListener('click', () => openViewer(w, el));
    }
    dress(n);
  }

  /** Each card's picture, drawn by the game's painters: nodes at once, a stage's stills one at a time. @param {number} n */
  async function dress(n) {
    const kit = await loadKit();
    if (!kit || !alive || n !== drawn) return;
    const cards = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('.ware')]);
    /** @type {[HTMLElement, any][]} */
    const staged = [];
    for (const card of cards) {
      const id = String(card.dataset.id);
      const d = kit.wareDrawing(id);
      const pic = card.querySelector('.ware-pic');
      if (!d || !pic) continue;
      if (d.how === 'stage') {
        staged.push([card, d]);
        continue;
      }
      const node = kit.wareNode(document, id, { name: nameOf(), size: 92, still: lessMotion() });
      if (node) {
        pic.replaceChildren(node);
        card.classList.add('drawn');
      }
    }
    for (const [card, d] of staged) {
      const id = String(card.dataset.id);
      /** @type {HTMLImageElement[]} */
      const imgs = [];
      for (let i = 0; i < d.parts.length; i++) {
        if (!stills.has(`${id}:${i}`)) await nextFrame();
        if (!alive || n !== drawn) return;
        const url = stillOf(kit, id, i, d.parts[i]);
        if (!url) continue;
        const img = document.createElement('img');
        img.className = `still part-${d.parts[i].part}`;
        img.src = url;
        img.alt = '';
        img.draggable = false;
        imgs.push(img);
      }
      if (imgs.length) {
        card.querySelector('.ware-pic')?.replaceChildren(...imgs);
        card.classList.add('drawn', 'staged');
      }
    }
  }

  /**
   * A ware's seal held to buy, or two presses of Enter on `el` (a card, or the glass up close).
   * @param {HTMLElement} el @param {any} w
   */
  function wireBuy(el, w) {
    if (w.held || w.price > cab.seals) return;
    const seal = /** @type {HTMLElement | null} */ (el.querySelector('.ware-seal'));
    if (!seal) return;
    let t0 = 0;
    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--hold', '0');
      el.classList.remove('holding');
    };
    const step = (/** @type {number} */ t) => {
      const k = Math.min(1, (t - t0) / HOLD_MS);
      el.style.setProperty('--hold', k.toFixed(3));
      if (k >= 1) {
        stop();
        buy(w, el);
      } else raf = requestAnimationFrame(step);
    };
    seal.addEventListener('pointerdown', (e) => {
      if (buying) return;
      e.preventDefault();
      seal.setPointerCapture(e.pointerId);
      el.classList.add('holding');
      t0 = performance.now();
      raf = requestAnimationFrame(step);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) seal.addEventListener(ev, stop);
    let armed = 0;
    el.addEventListener('keydown', (e) => {
      // the picture's own button opens it up close; Escape and the glass's close are the glass's
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (/** @type {HTMLElement} */ (e.target).closest?.('button')) return;
      e.preventDefault();
      if (performance.now() - armed < 4000) {
        armed = 0;
        buy(w, el);
        return;
      }
      armed = performance.now();
      const hint = el.querySelector('.ware-hint');
      if (hint) hint.textContent = `Press again to buy for ${grouped(w.price)} ${cab.word}`;
    });
  }

  /** The purchase: the router's press, then the cabinet read again. @param {any} w @param {HTMLElement} el */
  async function buy(w, el) {
    if (buying) return;
    buying = true;
    el.classList.add('stamping');
    sounds.seal();
    try {
      const a = await ask('press', { id: `pda:cabinet:buy:${w.id}` });
      const said = JSON.stringify(a.components ?? []);
      if (/You bought/.test(said)) {
        sounds.coin();
        el.classList.add('bought');
      }
    } catch {
      /* the cabinet read again says how it stands */
    } finally {
      buying = false;
      await new Promise((r) => setTimeout(r, 650));
      if (alive) {
        await load();
        o.onSeals?.(cab?.seals ?? 0);
      }
    }
  }

  /**
   * A ware up close, on a glass over the book: its stage moving (still, for less motion), or its drawing large; its
   * words and its seal beside it. Escape, the close button or a click outside put it away.
   * @param {any} w0 @param {HTMLElement} opener
   */
  async function openViewer(w0, opener) {
    closeViewer();
    const kit = await loadKit();
    if (!alive) return;
    const box = document.createElement('div');
    box.className = 'viewer';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', w0.name);
    box.innerHTML = `<div class="viewer-glass"><button type="button" class="viewer-close" aria-label="Close">×</button><div class="viewer-stage"></div><div class="viewer-card ink"></div></div>`;
    const stage = /** @type {HTMLElement} */ (box.querySelector('.viewer-stage'));
    const card = /** @type {HTMLElement} */ (box.querySelector('.viewer-card'));
    /** @type {{ stop: () => void }[]} */
    const running = [];
    const d = kit?.wareDrawing(w0.id) ?? null;
    if (kit && d?.how === 'stage') {
      stage.classList.add('staged');
      d.parts.forEach((part, i) => {
        const frame = document.createElement('div');
        frame.className = `viewer-part part-${part.part}`;
        stage.append(frame);
        const still = () => {
          const url = stillOf(kit, w0.id, i, part);
          if (!url) return;
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          frame.replaceChildren(img);
        };
        if (lessMotion()) return still();
        const canvas = document.createElement('canvas');
        frame.append(canvas);
        // the stage reads its canvas's size, so it starts once the glass is laid out
        requestAnimationFrame(() => {
          if (!box.isConnected) return;
          const s = kit.startPart(canvas, part, { close: true }); // a piece seen at its slot, as its still frames it
          if (s) running.push(s);
          else still();
        });
      });
    } else {
      const node = kit?.wareNode(document, w0.id, { name: nameOf(), size: 220, still: lessMotion() }) ?? null;
      if (node) stage.append(node);
      else {
        const art = localUrl(w0.art);
        stage.innerHTML = art ? `<img class="viewer-seal" src="${escapeHtml(art)}" alt="">` : '';
      }
    }
    const refresh = () => {
      const w = cab?.wares?.find((/** @type {any} */ x) => x.id === w0.id) ?? w0;
      card.innerHTML = `<h3>${escapeHtml(w.name)}</h3><p class="viewer-look">${escapeHtml(w.look)}</p>${
        d?.how === 'stage' && d.parts.length > 1
          ? '<p class="margin">The weapon piece is shown on its own blade.</p>'
          : ''
      }<div class="ware-buy viewer-buy${!w.held && w.price > cab.seals ? ' short' : ''}"${w.held ? '' : ' tabindex="0"'}>${w.held ? '' : sealHtml(w)}<div class="ware-words">${buyWords(w)}</div></div>`;
      box.classList.toggle('held', !!w.held);
      const buyEl = /** @type {HTMLElement | null} */ (card.querySelector('.viewer-buy'));
      if (buyEl) wireBuy(buyEl, w);
    };
    const close = () => closeViewer();
    const keys = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        const f = /** @type {HTMLElement[]} */ ([...box.querySelectorAll('button, [tabindex="0"]')]);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    box.querySelector('.viewer-close')?.addEventListener('click', close);
    box.addEventListener('pointerdown', (e) => {
      if (e.target === box) close();
    });
    box.addEventListener('keydown', keys);
    box.tabIndex = 0;
    refresh();
    document.body.append(box);
    sounds.leaf();
    requestAnimationFrame(() => box.classList.add('shown'));
    /** @type {HTMLElement | null} */ (box.querySelector('.viewer-close'))?.focus();
    viewer = {
      id: w0.id,
      box,
      refresh,
      stop: () => {
        for (const s of running) s.stop();
        running.length = 0;
        box.remove();
        const back = opener.isConnected
          ? opener
          : [...root.querySelectorAll('.ware')].find((c) => /** @type {HTMLElement} */ (c).dataset.id === w0.id);
        /** @type {HTMLElement | null} */ (back?.querySelector('.ware-view') ?? null)?.focus();
      },
    };
  }
  function closeViewer() {
    const v = viewer;
    viewer = null;
    v?.stop();
  }

  load();
  return () => {
    alive = false;
    closeViewer();
  };
}
