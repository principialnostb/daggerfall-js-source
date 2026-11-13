// @ts-check
// The book: a leather cover that opens, a spread of two worn pages, leather tabs on the fore-edge for every chapter,
// and the leaf that turns between them. The left page is the chapter's frontispiece (its name, the character the
// journal is kept for, the contents); the right page is the chapter itself, scrolled. A page turns when the chapter
// changes - by its tab, the contents, an arrow key, or by taking the page's corner and turning it by hand - and a
// page within a chapter is inked afresh in place. Narrow, the book is one page and the tabs run across its head.
import { renderPage } from './render.js';
import { escapeHtml } from './md.js';
import { sounds } from './sound.js';

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi'];
/** Leather for each tab, in the chapters' order: a bookbinder's dyed skins. */
const TAB_HIDES = ['#6e2a1c', '#2f4f3a', '#3b3f6b', '#7a5a1e', '#4a2f5a', '#1f4f5a', '#5a3a1e', '#2a4a6a', '#1e5a6a', '#6a4a2a', '#4a5a2a', '#5a2a3a', '#3a3a3a', '#6a2a4a'];
const TURN_MS = 760;
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const narrow = () => globalThis.matchMedia?.('(max-width: 820px)').matches ?? false;

function el(/** @type {string} */ tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/**
 * @typedef {{ key: string, label: string, hint: string }} Chapter
 * @typedef {{ chapters: Chapter[], character: any, name: string, linked: boolean, title?: string | null, seals?: number | null }} Hello
 * @typedef {{ kind: 'page' | 'view', chapter: string, body: HTMLElement, facts?: any, mount?: (pageEl: HTMLElement) => (() => void) | void }} Leaf
 */

/**
 * The book, built into `root`. `load(chapter)` answers a chapter's leaf (the router's page or a view of its own);
 * the book asks it as a tab, the contents or the corner calls for it.
 * @param {{ root: HTMLElement, hello: Hello, load: (chapter: string) => Promise<Leaf>, onError?: (e: unknown) => void }} o
 */
export function createBook({ root, hello, load, onError = () => {} }) {
  const book = el('div', 'book');
  const cover = el('div', 'cover', `<div class="cover-face"><div class="cover-tool"></div><div class="cover-mark">DFO Online</div><div class="cover-title">The Journal</div><div class="cover-of">${escapeHtml(hello.character?.name ?? hello.name ?? '')}</div></div><div class="cover-inside"></div>`);
  const spread = el('div', 'spread');
  const left = el('section', 'page left');
  const right = el('section', 'page right');
  const leftIn = el('div', 'page-in');
  const rightIn = el('div', 'page-in scroll');
  left.append(leftIn, el('div', 'gutter'));
  right.append(rightIn, el('div', 'gutter'));
  const cornerR = el('div', 'corner corner-r', '<span></span>');
  const cornerL = el('div', 'corner corner-l', '<span></span>');
  right.append(cornerR);
  left.append(cornerL);
  const quill = el('div', 'quill', '<span></span>');
  right.append(quill);
  spread.append(left, right);
  const tabs = el('nav', 'tabs');
  tabs.setAttribute('aria-label', 'Chapters');
  book.append(spread, tabs, cover);
  root.append(book);

  /** @type {string} */
  let current = '';
  /** @type {(() => void) | null} */
  let unmount = null;
  let busy = false;
  const order = hello.chapters.map((c) => c.key);
  const chapterOf = (/** @type {string} */ k) => hello.chapters.find((c) => c.key === k) ?? { key: k, label: k, hint: '' };

  hello.chapters.forEach((c, i) => {
    const t = /** @type {HTMLButtonElement} */ (el('button', 'tab'));
    t.type = 'button';
    t.dataset.key = c.key;
    t.style.setProperty('--hide', TAB_HIDES[i % TAB_HIDES.length]);
    t.style.setProperty('--n', String(i));
    t.innerHTML = `<span class="tab-initial">${escapeHtml(c.label.slice(0, 1))}</span><span class="tab-label">${escapeHtml(c.label)}</span>`;
    t.title = c.hint;
    t.addEventListener('click', () => go(c.key));
    tabs.append(t);
  });

  /** The frontispiece of a chapter: its name, the character, the contents. @param {string} key */
  function frontispiece(key) {
    const c = chapterOf(key);
    const ch = hello.character;
    const n = order.indexOf(key) + 1;
    const f = el('div', 'front');
    f.innerHTML = `
      <div class="front-mark">DFO Online</div>
      <h1 class="front-title">${escapeHtml(c.label)}</h1>
      <svg class="front-rule" viewBox="0 0 300 18" aria-hidden="true"><path d="M4 9 C70 -2 110 20 150 9 S230 -2 296 9"/><circle cx="150" cy="9" r="3"/></svg>
      <p class="front-hint">${escapeHtml(c.hint)}</p>
      <div class="keeper">
        <div class="wax-seal" aria-hidden="true"><span>${escapeHtml((ch?.name ?? hello.name ?? '?').slice(0, 1).toUpperCase())}</span></div>
        <div class="keeper-words">${hello.seals != null ? `<span class="keeper-seals" title="Seals: earn them in the journal’s games and spend them in the Courier’s Cabinet">${Number(hello.seals).toLocaleString('en-US')} Seals</span><br>` : ''}${ch ? `<strong>${escapeHtml(ch.name)}</strong><br><em>${escapeHtml([ch.level ? `Level ${ch.level}` : '', [ch.race, ch.className].filter(Boolean).join(' '), ch.region].filter(Boolean).join(' · '))}</em>` : `<em>${hello.linked ? 'No online character yet' : 'Not yet linked to an account'}</em>`}${hello.title ? `<br><span class="keeper-title">${escapeHtml(hello.title)}</span>` : ''}</div>
      </div>
      <ol class="contents">${hello.chapters
        .map((x, i) => `<li><button type="button" data-key="${escapeHtml(x.key)}" class="${x.key === key ? 'here' : ''}"><span class="num">${ROMAN[i + 1] ?? i + 1}</span><span class="lbl">${escapeHtml(x.label)}</span><span class="dots"></span></button></li>`)
        .join('')}</ol>
      <div class="folio">${ROMAN[n * 2 - 1] ?? ''}</div>`;
    for (const b of f.querySelectorAll('.contents button')) b.addEventListener('click', () => go(/** @type {HTMLElement} */ (b).dataset.key ?? 'home'));
    return f;
  }

  /** The right page's contents for a leaf: its heading (when the page names itself), then its body. @param {Leaf} leaf */
  function rightOf(leaf) {
    const wrap = el('div', 'chapter');
    const title = leaf.facts?.title;
    const label = chapterOf(leaf.chapter).label;
    wrap.append(el('h1', 'narrow-title', escapeHtml(label)));
    if (title && title !== label) wrap.append(el('h2', 'page-title ink', `${escapeHtml(title)}${leaf.facts?.sub ? `<small>${escapeHtml(leaf.facts.sub)}</small>` : ''}`));
    else wrap.append(el('div', 'page-orn ink', '<svg viewBox="0 0 120 20" aria-hidden="true"><path d="M4 10 Q30 0 60 10 T116 10"/><path d="M52 10 l8 -6 l8 6 l-8 6 z"/></svg>'));
    wrap.append(leaf.body);
    if (Number.isFinite(leaf.facts?.accent)) wrap.style.setProperty('--accent', `#${Number(leaf.facts.accent).toString(16).padStart(6, '0')}`);
    return wrap;
  }

  const markTabs = () => {
    for (const t of tabs.children) t.classList.toggle('here', /** @type {HTMLElement} */ (t).dataset.key === current);
  };

  /** Set a leaf's content on the right page now, mounting a view of its own. @param {Leaf} leaf @param {HTMLElement} content */
  function settle(leaf, content) {
    unmount?.();
    unmount = null;
    rightIn.replaceChildren(content);
    rightIn.scrollTop = 0;
    rightIn.classList.toggle('viewing', leaf.kind === 'view');
    if (leaf.mount) unmount = leaf.mount(content) ?? null;
  }

  /**
   * The leaf turning: the old page lifts from the spine and falls to the other side, the new page under it. Forward,
   * the right page turns left; back, the left page turns right. `drag` hands the turn to the pointer.
   * @param {1 | -1} dir @param {HTMLElement} newLeft @param {HTMLElement} newRight
   */
  function turn(dir, newLeft, newRight, drag = null) {
    if (reduced()) return Promise.resolve(true);
    const one = narrow();
    const leaf = el('div', `turning ${dir > 0 || one ? 'fwd' : 'back'}`);
    const front = el('div', 'face front-face');
    const back = el('div', 'face back-face');
    const shade = el('div', 'turn-shade');
    const src = dir > 0 || one ? rightIn : leftIn;
    const shot = /** @type {HTMLElement} */ (src.cloneNode(true));
    shot.classList.remove('scroll');
    shot.style.transform = `translateY(${-src.scrollTop}px)`;
    front.append(shot);
    if (!one) back.append(dir > 0 ? newLeft.cloneNode(true) : newRight.cloneNode(true));
    leaf.append(front, back, shade);
    const under = el('div', 'under page-in');
    under.append(dir > 0 || one ? newRight.cloneNode(true) : newLeft.cloneNode(true));
    (dir > 0 || one ? right : left).append(under, leaf);
    sounds.leaf();
    const sign = dir > 0 || one ? -1 : 1;
    const finish = (/** @type {boolean} */ ok) => {
      leaf.remove();
      under.remove();
      return ok;
    };
    if (drag) return drag(leaf, sign).then(finish);
    const anim = leaf.animate(
      [
        { transform: 'rotateY(0deg)' },
        { transform: `rotateY(${sign * 95}deg)`, offset: 0.55 },
        { transform: `rotateY(${sign * 180}deg)` },
      ],
      { duration: TURN_MS, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' },
    );
    shade.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.5 }, { opacity: 0 }], { duration: TURN_MS, fill: 'forwards' });
    return anim.finished.then(() => finish(true), () => finish(true));
  }

  /**
   * Go to a chapter: its leaf loaded (the quill writing meanwhile), then the page turned toward it.
   * @param {string} key @param {{ leaf?: Leaf, drag?: any }} [o]
   */
  async function go(key, o = {}) {
    if (busy || (key === current && !o.leaf)) return;
    busy = true;
    quill.classList.add('writing');
    try {
      /** @type {Leaf} */
      let leaf;
      try {
        leaf = o.leaf ?? (await load(key));
      } catch (e) {
        // a chapter that would not load leaves the page as it was, and says so
        onError(e);
        return;
      }
      const dir = order.indexOf(leaf.chapter) >= order.indexOf(current) ? 1 : -1;
      const newLeft = frontispiece(leaf.chapter);
      const newRight = rightOf(leaf);
      quill.classList.remove('writing');
      if (current && leaf.chapter !== current) {
        const ok = await turn(/** @type {1 | -1} */ (dir), newLeft, newRight, o.drag ?? null);
        if (!ok) return;
      }
      current = leaf.chapter;
      leftIn.replaceChildren(newLeft);
      settle(leaf, newRight);
      markTabs();
    } finally {
      quill.classList.remove('writing');
      busy = false;
    }
  }

  /** A page within the chapter shown, inked afresh where the last one was. @param {Leaf} leaf */
  function ink(leaf) {
    if (leaf.chapter && leaf.chapter !== current) return go(leaf.chapter, { leaf });
    const content = rightOf(leaf);
    rightIn.classList.add('washing');
    setTimeout(() => {
      settle(leaf, content);
      rightIn.classList.remove('washing');
    }, reduced() ? 0 : 160);
    return Promise.resolve();
  }

  // ── The corners: take one and turn the page by hand ──
  /** @param {HTMLElement} corner @param {1 | -1} dir */
  function handTurn(corner, dir) {
    corner.addEventListener('pointerdown', (ev) => {
      if (busy || reduced()) return;
      const i = order.indexOf(current) + dir;
      if (i < 0 || i >= order.length) return;
      ev.preventDefault();
      corner.setPointerCapture(ev.pointerId);
      const key = order[i];
      const width = right.getBoundingClientRect().width;
      const x0 = ev.clientX;
      let angle = 0;
      /** @type {HTMLElement | null} */
      let leafEl = null;
      let sign = -1;
      /** @type {(v: boolean) => void} */
      let release = () => {};
      const dragged = new Promise((r) => (release = r));
      const onMove = (/** @type {PointerEvent} */ e) => {
        const d = dir > 0 ? x0 - e.clientX : e.clientX - x0;
        angle = Math.max(0, Math.min(180, (d / width) * 180));
        if (leafEl) leafEl.style.transform = `rotateY(${sign * angle}deg)`;
      };
      const onUp = () => {
        corner.removeEventListener('pointermove', onMove);
        corner.removeEventListener('pointerup', onUp);
        corner.removeEventListener('pointercancel', onUp);
        release(angle > 60);
      };
      corner.addEventListener('pointermove', onMove);
      corner.addEventListener('pointerup', onUp);
      corner.addEventListener('pointercancel', onUp);
      go(key, {
        drag: async (/** @type {HTMLElement} */ leaf, /** @type {number} */ s) => {
          leafEl = leaf;
          sign = s;
          leaf.style.transform = `rotateY(${sign * angle}deg)`;
          const keep = await dragged;
          const to = keep ? sign * 180 : 0;
          await leaf.animate([{ transform: `rotateY(${sign * angle}deg)` }, { transform: `rotateY(${to}deg)` }], { duration: 320, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {});
          return keep;
        },
      });
    });
  }
  handTurn(cornerR, 1);
  handTurn(cornerL, -1);

  // ── Keys and the book's lean toward the hand ──
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.sheet-veil, .sea-open')) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = /** @type {HTMLElement} */ (e.target);
    // arrows inside a field, a menu, the map or its legend belong to them, not to the page
    if (t?.closest?.('input, textarea, select, .chart-wrap, .ledger, .sheet')) return;
    const i = order.indexOf(current);
    if (e.key === 'ArrowRight' && i < order.length - 1) go(order[i + 1]);
    if (e.key === 'ArrowLeft' && i > 0) go(order[i - 1]);
  });
  root.addEventListener('pointermove', (e) => {
    if (reduced() || narrow()) return;
    const r = root.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
    book.style.setProperty('--lean-x', `${(-ny * 2.2).toFixed(2)}deg`);
    book.style.setProperty('--lean-y', `${(nx * 2.6).toFixed(2)}deg`);
  });

  return {
    /** The cover opened, then the first chapter. @param {string} key */
    async open(key) {
      const first = load(key);
      await new Promise((r) => setTimeout(r, reduced() ? 0 : 500));
      cover.classList.add('opening');
      sounds.leaf();
      const leaf = await first.catch((e) => {
        onError(e);
        return null;
      });
      await new Promise((r) => setTimeout(r, reduced() ? 0 : 900));
      cover.classList.add('open');
      if (leaf) await go(leaf.chapter, { leaf });
      else {
        // the first chapter would not load: the contents stay, so the player can try another
        leftIn.replaceChildren(frontispiece(key));
        rightIn.replaceChildren(el('p', 'margin', 'This page could not load. Choose another chapter, or try again.'));
      }
    },
    go,
    ink,
    /** The Seals held, told again after a purchase. @param {number} n */
    setSeals(n) {
      hello.seals = n;
      for (const e of document.querySelectorAll('.keeper-seals')) e.textContent = `${Number(n).toLocaleString('en-US')} Seals`;
    },
    get current() {
      return current;
    },
    /** The right page, for a note pinned to it. */
    page: right,
    book,
    /** A page's leaf from a router answer: its tree drawn. @param {any[]} components @param {string} chapter @param {any} hands */
    leafOf(components, chapter, hands) {
      const { body, facts } = renderPage(components, hands);
      return /** @type {Leaf} */ ({ kind: 'page', chapter: facts.chapter ?? chapter, body, facts });
    },
  };
}
