// @ts-check
// A page of the bot's, drawn as the journal's own: the tree of Discord's layout components the router answers, read
// into a leaf of the book. Text is inked (md.js), a press is an inked stamp in the margin or at the page's foot, a menu
// is a ledger of choices, a rule is a flourish, a picture a plate. The worn-paper heading the bot draws for Discord
// becomes the book's own lettering, and the page menu becomes the book's tabs, so neither is drawn twice.
import { mdToHtml, mdToPlain, escapeHtml } from './md.js';

/** Discord's component types, as the bot builds them (server-account/src/pdaUi.js C). */
export const C = Object.freeze({ ROW: 1, BUTTON: 2, SELECT: 3, TEXT_INPUT: 4, USER_SELECT: 5, SECTION: 9, TEXT: 10, THUMB: 11, GALLERY: 12, FILE: 13, SEPARATOR: 14, CONTAINER: 17, LABEL: 18 });
/** Button styles, as inks. */
const INKS = Object.freeze({ 1: 'ink-primary', 2: 'ink-plain', 3: 'ink-good', 4: 'ink-bad', 5: 'ink-link' });
/** The heading picture's address: drawn for Discord, lettered natively here. */
const HEADER_ART = /\/v1\/journal\/art\/header\.png/;

/**
 * A picture's address as the Activity may load it: the service's own pictures by their path, through Discord's proxy
 * (any other host is refused by the frame's policy, so it is left out).
 * @param {unknown} url
 */
export function localUrl(url) {
  const u = String(url ?? '');
  const path = (/^https:\/\/[^/]+(\/v1\/[^\s"]*)$/.exec(u) ?? [])[1] ?? (u.startsWith('/v1/') ? u : null);
  // only the pictures the service draws itself: anything else would be a request signed as the player
  return path && LOCAL_PICTURES.test(path) ? path : null;
}
/** The service's own pictures: the worn-paper art, the map, the chart. */
const LOCAL_PICTURES = /^\/v1\/(journal\/art\/(header|seal)\.png\?|pda\/map\.png(\?|$)|journal\/chart\.png$)/;

/** An element with a class and, optionally, HTML. */
function el(/** @type {string} */ tag, cls = '', html = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/**
 * @typedef {{ press: (id: string, values?: string[]) => void, openLink: (url: string) => void }} Hands
 * @typedef {{ title: string, sub: string, accent: number | null, chapter: string | null }} PageFacts
 */

/** A stamp: one press, inked. @param {any} b @param {Hands} hands */
function stamp(b, hands) {
  const s = el('button', `stamp ${INKS[/** @type {1} */ (b.style)] ?? 'ink-plain'}`);
  s.type = 'button';
  s.textContent = String(b.label ?? b.emoji?.name ?? '…');
  if (b.disabled) {
    s.disabled = true;
    s.classList.add('spent');
  }
  if (b.style === 5 && /^https:\/\//.test(String(b.url ?? ''))) s.addEventListener('click', () => hands.openLink(String(b.url)));
  else if (b.custom_id) s.addEventListener('click', () => hands.press(String(b.custom_id)));
  return s;
}

/** A menu as a ledger of choices: click one, or tick several and seal them. @param {any} m @param {Hands} hands */
function ledger(m, hands) {
  const box = el('div', 'ledger');
  const many = Number(m.max_values ?? 1) > 1;
  if (m.placeholder) box.append(el('div', 'ledger-cap', escapeHtml(m.placeholder)));
  /** @type {Set<string>} */
  const picked = new Set((m.options ?? []).filter((/** @type {any} */ o) => o.default).map((/** @type {any} */ o) => String(o.value)));
  const seal = el('button', 'stamp ink-primary ledger-seal');
  /** @type {HTMLButtonElement} */ (seal).type = 'button';
  seal.textContent = 'Confirm';
  const refresh = () => {
    const min = Number(m.min_values ?? 1);
    /** @type {HTMLButtonElement} */ (seal).disabled = picked.size < min;
  };
  for (const o of m.options ?? []) {
    const v = String(o.value);
    const row = el('button', `ledger-row${picked.has(v) ? ' picked' : ''}${v === '-' ? ' spent' : ''}`);
    /** @type {HTMLButtonElement} */ (row).type = 'button';
    if (many) row.setAttribute('aria-pressed', String(picked.has(v)));
    row.innerHTML = `<span class="tick" aria-hidden="true"></span><span class="ledger-label">${escapeHtml(o.label)}</span>${o.description ? `<span class="ledger-desc">${escapeHtml(o.description)}</span>` : ''}`;
    if (v === '-' || m.disabled) /** @type {HTMLButtonElement} */ (row).disabled = true;
    row.addEventListener('click', () => {
      if (!many) return hands.press(String(m.custom_id), [v]);
      if (picked.has(v)) picked.delete(v);
      else if (picked.size < Number(m.max_values)) picked.add(v);
      row.classList.toggle('picked', picked.has(v));
      row.setAttribute('aria-pressed', String(picked.has(v)));
      refresh();
    });
    box.append(row);
  }
  if (many) {
    refresh();
    seal.addEventListener('click', () => hands.press(String(m.custom_id), [...picked]));
    box.append(seal);
  }
  return box;
}

/** A plate: one of the service's pictures, framed; null for a picture the frame may not load. */
function plate(/** @type {any} */ item) {
  const src = localUrl(item?.media?.url);
  if (!src) return null;
  const fig = el('figure', 'plate');
  const img = /** @type {HTMLImageElement} */ (el('img'));
  img.src = src;
  img.alt = String(item.description ?? '');
  img.loading = 'lazy';
  img.decoding = 'async';
  fig.append(img);
  return fig;
}

/**
 * The tree drawn into a leaf. Answers the leaf and what the page said of itself: its title and line (from the
 * heading the bot drew for Discord), its accent, and its chapter (from its menu).
 * @param {any[]} components @param {Hands} hands
 * @returns {{ body: HTMLElement, facts: PageFacts }}
 */
export function renderPage(components, hands) {
  const body = el('div', 'leaf-body');
  /** @type {PageFacts} */
  const facts = { title: '', sub: '', accent: null, chapter: null };
  let i = 0;
  const ink = (/** @type {HTMLElement} */ e) => {
    e.style.setProperty('--i', String(i++));
    e.classList.add('ink');
    return e;
  };
  /** @param {any[]} list @param {HTMLElement} into */
  const walk = (list, into) => {
    for (const c of list ?? []) {
      switch (c?.type) {
        case C.CONTAINER:
          if (Number.isFinite(c.accent_color)) facts.accent = c.accent_color;
          walk(c.components, into);
          break;
        case C.TEXT:
          into.append(ink(el('div', 'words', mdToHtml(c.content))));
          break;
        case C.SECTION: {
          const row = ink(el('div', 'section'));
          const words = el('div', 'section-words');
          for (const t of c.components ?? []) if (t?.type === C.TEXT) words.innerHTML += mdToHtml(t.content);
          row.append(words);
          const acc = c.accessory;
          if (acc?.type === C.BUTTON) row.append(stamp(acc, hands));
          else if (acc?.type === C.THUMB) {
            const p = plate(acc);
            if (p) row.append(p);
          }
          into.append(row);
          break;
        }
        case C.GALLERY: {
          const items = c.items ?? [];
          if (items.length === 1 && HEADER_ART.test(String(items[0]?.media?.url ?? ''))) {
            const [title, ...rest] = String(items[0].description ?? '').split(' - ');
            facts.title = title;
            facts.sub = rest.join(' - ');
            break;
          }
          const g = ink(el('div', 'plates'));
          for (const it of items) {
            const p = plate(it);
            if (p) g.append(p);
          }
          if (g.childElementCount) into.append(g);
          break;
        }
        case C.THUMB: {
          const p = plate(c);
          if (p) into.append(ink(p));
          break;
        }
        case C.SEPARATOR:
          into.append(ink(el('div', c.divider === false ? 'gap' : 'flourish', c.divider === false ? '' : '<svg viewBox="0 0 240 12" aria-hidden="true"><path d="M2 6 Q60 0 120 6 T238 6" /><circle cx="120" cy="6" r="2.2" /></svg>')));
          break;
        case C.ROW: {
          const kids = c.components ?? [];
          if (kids.length === 1 && kids[0]?.type === C.SELECT) {
            if (kids[0].custom_id === 'pda:nav') {
              facts.chapter = kids[0].options?.find((/** @type {any} */ o) => o.default)?.value ?? null;
              break;
            }
            into.append(ink(ledger(kids[0], hands)));
          } else if (kids.some((/** @type {any} */ k) => k?.type === C.USER_SELECT)) {
            into.append(ink(el('p', 'margin', 'Choose a member in Discord.')));
          } else {
            const r = ink(el('div', 'stamps'));
            for (const b of kids) if (b?.type === C.BUTTON) r.append(stamp(b, hands));
            into.append(r);
          }
          break;
        }
        default:
          break;
      }
    }
  };
  walk(components, body);
  return { body, facts };
}

/** A note laid over the page: a refusal, a thanks, a confirmation. Its words as plain text and as HTML. */
export function noteOf(/** @type {any[]} */ components) {
  const texts = [];
  const walk = (/** @type {any[]} */ l) => {
    for (const c of l ?? []) {
      if (c?.type === C.TEXT) texts.push(String(c.content ?? ''));
      if (c?.components) walk(c.components);
    }
  };
  walk(components);
  const src = texts.join('\n');
  return { html: mdToHtml(src), plain: mdToPlain(src) };
}
