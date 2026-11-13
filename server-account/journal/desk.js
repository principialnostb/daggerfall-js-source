// @ts-check
// The journal's Activity, opened inside Discord: the desk is laid, Discord is greeted, the service is asked who the
// book is kept for, and the cover opens on the first chapter. Every press, choice and form after that is the bot's
// own, answered by the router as a Discord press would be and drawn into the book; the map and the sea are views of
// their own. Outside Discord the cover stays shut and says where to open it.
import { frameQuery, clientIdOf, openFrame } from './frame.js';
import { ask, AskError, useTicket, onRenew } from './api.js';
import { dressMaterials } from './paper.js';
import { createBook } from './book.js';
import { openSheet } from './sheet.js';
import { renderPage } from './render.js';
import { escapeHtml } from './md.js';
import { wake, sounds, isMuted, setMuted } from './sound.js';
import { mountMap } from './mapView.js';
import { mountCabinet } from './cabinetView.js';
import { wordsFor } from './words.js';

const desk = /** @type {HTMLElement} */ (document.getElementById('desk'));
const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));
/** @type {ReturnType<typeof openFrame> | null} */
let frame = null;

/** Words for an ask the service refused, in the book's voice. @param {unknown} e */
function refusalWords(e) {
  const err = e instanceof AskError ? e : null;
  if (!err) return 'Something went wrong. Try again.';
  if (err.status === 429) return wordsFor('rate');
  return wordsFor(err.status === 0 ? 'offline' : err.body?.error);
}

/** The desk's candle and the dust in its light: drawn on a canvas behind the book, quietly. */
function candle() {
  const c = document.createElement('canvas');
  c.className = 'dust';
  desk.prepend(c);
  const g = c.getContext('2d');
  if (!g || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const motes = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.6, v: 0.02 + Math.random() * 0.05, p: Math.random() * 6.28 }));
  let last = performance.now();
  const step = (/** @type {number} */ t) => {
    // nothing drawn while the page is hidden or the sea chart covers the desk
    if (document.hidden || document.querySelector('.sea-open')) {
      last = t;
      return void requestAnimationFrame(step);
    }
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (c.width !== desk.clientWidth || c.height !== desk.clientHeight) {
      c.width = desk.clientWidth;
      c.height = desk.clientHeight;
    }
    g.clearRect(0, 0, c.width, c.height);
    for (const m of motes) {
      m.y -= m.v * dt;
      m.x += Math.sin(t / 2400 + m.p) * 0.004 * dt;
      if (m.y < -0.02) {
        m.y = 1.02;
        m.x = Math.random();
      }
      const a = 0.18 + 0.14 * Math.sin(t / 900 + m.p);
      g.fillStyle = `rgba(255, 226, 170, ${a.toFixed(3)})`;
      g.beginPath();
      g.arc(m.x * c.width, m.y * c.height, m.r, 0, 6.283);
      g.fill();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** The cover shut, a slip of paper tucked under its clasp with the reason. @param {string} title @param {string} words */
function shutCover(title, words) {
  desk.querySelector('.book')?.remove();
  const b = document.createElement('div');
  b.className = 'book shut';
  b.innerHTML = `<div class="cover"><div class="cover-face"><div class="cover-tool"></div><div class="cover-mark">DFO Online</div><div class="cover-title">The Journal</div></div></div>
    <div class="slip"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(words)}</p></div>`;
  desk.append(b);
}

/** Discord's sign-in, for a frame whose proxy said nothing of who is asking. */
async function signIn() {
  if (!frame) throw new Error('no frame');
  const { code } = await frame.authorize(['identify']);
  const r = await ask('oauth', { code, client_id: frame.clientId });
  useTicket(r.ticket);
  await frame.authenticate(r.access_token).catch(() => {});
}

/** Who the book is kept for, signing in through Discord where the proxy is silent. */
async function hello() {
  try {
    return await ask('hello');
  } catch (e) {
    if (!(e instanceof AskError) || e.status !== 401) throw e;
    if (e.body?.oauth && frame) {
      await signIn();
      return ask('hello');
    }
    throw e;
  }
}

/** A note pinned over the page: the bot's few words after a press, with any press of its own. */
function pinNote(/** @type {any[]} */ components, /** @type {any} */ hands, /** @type {HTMLElement} */ page) {
  const { body } = renderPage(components, hands);
  const slip = document.createElement('div');
  slip.className = 'note';
  slip.setAttribute('role', 'status');
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'note-x';
  x.setAttribute('aria-label', 'Close the note');
  x.textContent = '×';
  page.append(slip);
  // the live region is in place before its words arrive, so a screen reader says them
  requestAnimationFrame(() => slip.append(x, body));
  const away = () => {
    slip.classList.add('away');
    setTimeout(() => slip.remove(), 400);
  };
  x.addEventListener('click', away);
  if (!body.querySelector('.stamp, .ledger')) setTimeout(away, 7000);
}

async function boot() {
  const q = frameQuery(location.search);
  const clientId = clientIdOf(location.host);
  if (q && clientId) {
    frame = openFrame({ clientId, query: q });
    onRenew(() => /** @type {any} */ (frame).refreshProxyTicket());
  }
  // the paper and the candle while Discord answers: drawn after the greeting is on its way, never before it
  dressMaterials(document.documentElement).catch(() => {});
  candle();
  if (frame) await Promise.race([frame.ready, sleep(8000)]);
  if (frame?.closed) return shutCover('The journal is shut', 'Discord closed the journal. Close it and open it again.');
  /** @type {any} */
  let h;
  try {
    h = await hello();
  } catch (e) {
    const why = e instanceof AskError ? e.body?.error : '';
    if (!q) return shutCover('Open this journal in Discord', 'Open your journal from the DFO Online Discord server, in the Courier channel or with the Apps button.');
    return shutCover('The journal is shut', why ? wordsFor(why) : refusalWords(e));
  }
  if (h.barred) document.documentElement.classList.add('barred');

  /** @type {any} */
  let book = null;
  let pressing = false;
  const quill = (/** @type {boolean} */ on) => book?.page.querySelector('.quill')?.classList.toggle('writing', on);

  /** One answer from the router, drawn: a page inked, a form laid out, or a note pinned. @param {any} a @param {string} [from] the chapter the press was made in */
  async function apply(a, from = '') {
    if (a.kind === 'form') {
      const fields = await openSheet(desk, a.form);
      if (!fields) return;
      sounds.seal();
      return apply(await ask('press', { id: a.form.custom_id, fields }), from);
    }
    if (a.kind === 'page') {
      // an answer that comes after the player has turned to another chapter is not drawn over it
      if (from && book.current !== from && (a.chapter ?? from) !== book.current) return;
      await book.ink(book.leafOf(a.components, a.chapter ?? book.current, hands));
      sounds.quill();
      return;
    }
    pinNote(a.components ?? [], hands, book.page);
  }
  const hands = {
    /** @param {string} id @param {string[]} [values] */
    async press(id, values) {
      if (pressing) return;
      pressing = true;
      quill(true);
      const from = book.current;
      try {
        await apply(await ask('press', { id, values }), from);
      } catch (e) {
        pinNote([{ type: 10, content: refusalWords(e) }], hands, book.page);
      } finally {
        quill(false);
        pressing = false;
      }
    },
    /** A link out of the journal: https alone, through Discord's own prompt. @param {string} url */
    openLink(url) {
      if (!/^https:\/\//.test(String(url))) return;
      if (frame) frame.openLink(url).catch(() => {});
      else globalThis.open?.(url, '_blank', 'noopener');
    },
  };
  /** A press whose answer is not drawn: the map's reminder, kept quietly. */
  const quiet = {
    /** @param {string} id @param {string[]} [values] */
    press: async (id, values) => {
      await ask('press', { id, values });
    },
  };

  /** A chapter's leaf: its own view for the map and the sea, else the router's page. @param {string} key */
  async function load(key) {
    if (key === 'map' || key === 'sea' || key === 'cabinet') {
      const host = document.createElement('div');
      host.className = 'view-host';
      return {
        kind: 'view',
        chapter: key,
        body: host,
        facts: { title: '', sub: '', accent: null },
        mount: (/** @type {HTMLElement} */ content) => {
          const at = /** @type {HTMLElement} */ (content.querySelector('.view-host'));
          if (key === 'map') return mountMap(at, quiet);
          if (key === 'cabinet') return mountCabinet(at, { onSeals: (n) => book.setSeals(n) });
          let off = () => {};
          let gone = false;
          import('./seaView.js')
            .then((m) => {
              if (!gone) off = m.mountSea(at, { desk, hands, frame });
            })
            .catch(() => (at.textContent = 'The sea chart could not load. Try again later.'));
          return () => {
            gone = true;
            off();
          };
        },
      };
    }
    const a = await ask('press', { id: `pda:${key}` });
    if (a.kind === 'page') return book.leafOf(a.components, key, hands);
    const { body, facts } = renderPage(a.components ?? [], hands);
    return { kind: 'page', chapter: key, body, facts };
  }

  book = createBook({ root: desk, hello: h, load, onError: (e) => pinNote([{ type: 10, content: refusalWords(e) }], hands, book.page) });
  // a link inked in a page opens through Discord
  desk.addEventListener('click', (e) => {
    const a = /** @type {HTMLElement} */ (e.target)?.closest?.('a[data-href]');
    if (!a) return;
    e.preventDefault();
    hands.openLink(/** @type {HTMLElement} */ (a).dataset.href ?? '');
  });
  await book.open('home');

  // the desk's bell: the book's sounds on or off
  const bell = document.createElement('button');
  bell.type = 'button';
  bell.className = `bell${isMuted() ? ' muted' : ''}`;
  bell.setAttribute('aria-label', 'Sound');
  bell.addEventListener('click', () => {
    setMuted(!isMuted());
    bell.classList.toggle('muted', isMuted());
    wake();
    sounds.coin();
  });
  desk.append(bell);
  // a relative time ("in 3 hours") kept true while the book is open
  setInterval(async () => {
    const { relativeWords } = await import('./md.js');
    for (const t of document.querySelectorAll('time[data-f="R"]')) t.textContent = relativeWords(Number(/** @type {HTMLElement} */ (t).dataset.t) * 1000 - Date.now());
  }, 30_000);
}

document.addEventListener('pointerdown', wake, { once: true });
document.addEventListener('keydown', wake, { once: true });
boot().catch((e) => shutCover('The journal is shut', refusalWords(e)));
