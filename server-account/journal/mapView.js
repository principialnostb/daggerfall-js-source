// @ts-check
// The Map of Tamriel, unfolded on the page: the service's worn-paper chart (GET /v1/journal/chart.png), dragged to
// pan, wheeled or pinched to zoom about the hand, with every world event pinned in ink above it. A live event's pin
// breathes; hovering one shows its card, and a press on it keeps it open with its reminder. The legend beside the chart
// lists them, and a press there flies the chart to the pin.
import { ask } from './api.js';
import { escapeHtml } from './md.js';
import { timeWords, relativeWords } from './md.js';
import { sounds } from './sound.js';

const INKS = { gate: '#8a2a1c', serpent: '#2f5d5a', abyss: '#9a6a1a', spire: '#a07818', ketch: '#34507a', siege: '#5a2a5a' };
const FAMILY = { gate: 'Oblivion gate', serpent: 'Sea serpent', abyss: 'Abyss dungeon', spire: 'Battlespire', ketch: 'Sky-Ketch', siege: 'Seat battle' };
const ZOOM_MIN = 0.45, ZOOM_MAX = 3.2;

/**
 * The map's view, mounted into the page. Answers its unmount.
 * @param {HTMLElement} host @param {{ press: (id: string, values?: string[]) => Promise<void> }} hands
 */
export function mountMap(host, hands) {
  host.innerHTML = `
    <div class="chart-wrap">
      <div class="chart" tabindex="0" aria-label="Map of Tamriel">
        <div class="chart-sheet"><img class="chart-img" alt="Tamriel" draggable="false"><div class="pins"></div></div>
        <div class="chart-tools"><button type="button" data-z="in" aria-label="Closer">+</button><button type="button" data-z="out" aria-label="Farther">−</button><button type="button" data-z="home" aria-label="The whole map">⌂</button></div>
        <div class="pin-card" hidden></div>
      </div>
      <ol class="legend"></ol>
      <p class="margin chart-note"></p>
    </div>`;
  const chart = /** @type {HTMLElement} */ (host.querySelector('.chart'));
  const sheet = /** @type {HTMLElement} */ (host.querySelector('.chart-sheet'));
  const img = /** @type {HTMLImageElement} */ (host.querySelector('.chart-img'));
  const pinsEl = /** @type {HTMLElement} */ (host.querySelector('.pins'));
  const card = /** @type {HTMLElement} */ (host.querySelector('.pin-card'));
  const legend = /** @type {HTMLElement} */ (host.querySelector('.legend'));
  const note = /** @type {HTMLElement} */ (host.querySelector('.chart-note'));
  let W = 1280, H = 800;
  let z = 1, tx = 0, ty = 0;
  /** @type {any[]} */
  let pins = [];
  /** @type {string[] | null} null: not linked, so no reminders */
  let reminders = null;
  let pinned = -1;
  let alive = true;

  const fit = () => {
    const r = chart.getBoundingClientRect();
    z = Math.min(r.width / W, r.height / H);
    tx = (r.width - W * z) / 2;
    ty = (r.height - H * z) / 2;
  };
  const clamp = () => {
    const r = chart.getBoundingClientRect();
    const mw = W * z, mh = H * z;
    tx = mw < r.width ? (r.width - mw) / 2 : Math.min(0, Math.max(r.width - mw, tx));
    ty = mh < r.height ? (r.height - mh) / 2 : Math.min(0, Math.max(r.height - mh, ty));
  };
  const draw = () => {
    clamp();
    sheet.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`;
    sheet.style.setProperty('--z', String(z));
    if (pinned >= 0) placeCard(pinned);
  };
  /** Zoom by `k` about a point of the chart's box. */
  const zoomAt = (/** @type {number} */ k, /** @type {number} */ px, /** @type {number} */ py) => {
    const nz = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z * k));
    tx = px - ((px - tx) * nz) / z;
    ty = py - ((py - ty) * nz) / z;
    z = nz;
    draw();
  };
  const flyTo = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ nz) => {
    const r = chart.getBoundingClientRect();
    const [z0, x0, y0] = [z, tx, ty];
    const z1 = Math.max(z, nz), x1 = r.width / 2 - x * z1, y1 = r.height / 2 - y * z1;
    const t0 = performance.now();
    const step = (/** @type {number} */ t) => {
      const k = Math.min(1, (t - t0) / 600), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      z = z0 + (z1 - z0) * e;
      tx = x0 + (x1 - x0) * e;
      ty = y0 + (y1 - y0) * e;
      draw();
      if (k < 1 && alive) requestAnimationFrame(step);
    };
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      z = z1;
      tx = x1;
      ty = y1;
      draw();
      return;
    }
    requestAnimationFrame(step);
  };

  // ── The hand: drag, wheel, pinch ──
  /** How far the hand moved since it went down: a drag that ends is not a click on the chart. */
  let travelled = 0;
  /** @type {Map<number, { x: number, y: number }>} */
  const touches = new Map();
  let pinch0 = 0;
  chart.addEventListener('pointerdown', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('.chart-tools, .pin, .pin-card')) return;
    chart.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    chart.classList.add('grabbing');
    travelled = 0;
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  chart.addEventListener('pointermove', (e) => {
    const was = touches.get(e.pointerId);
    if (!was) return;
    const now = { x: e.clientX, y: e.clientY };
    touches.set(e.pointerId, now);
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = chart.getBoundingClientRect();
      if (pinch0) zoomAt(d / pinch0, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch0 = d;
      return;
    }
    travelled += Math.abs(now.x - was.x) + Math.abs(now.y - was.y);
    tx += now.x - was.x;
    ty += now.y - was.y;
    draw();
  });
  const up = (/** @type {PointerEvent} */ e) => {
    touches.delete(e.pointerId);
    if (!touches.size) chart.classList.remove('grabbing');
    pinch0 = 0;
  };
  chart.addEventListener('pointerup', up);
  chart.addEventListener('pointercancel', up);
  chart.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = chart.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  chart.addEventListener('keydown', (e) => {
    const r = chart.getBoundingClientRect();
    const k = { '+': 1.2, '=': 1.2, '-': 1 / 1.2 }[e.key];
    if (k) zoomAt(k, r.width / 2, r.height / 2);
    const m = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
    if (m) {
      e.stopPropagation();
      e.preventDefault();
      tx += m[0];
      ty += m[1];
      draw();
    }
    if (e.key === 'Escape') hideCard();
  });
  for (const b of host.querySelectorAll('.chart-tools button')) {
    b.addEventListener('click', () => {
      const r = chart.getBoundingClientRect();
      const k = /** @type {HTMLElement} */ (b).dataset.z;
      if (k === 'home') {
        fit();
        draw();
      } else zoomAt(k === 'in' ? 1.4 : 1 / 1.4, r.width / 2, r.height / 2);
    });
  }

  // ── The pins ──
  const whenWords = (/** @type {any} */ p) => {
    const now = Date.now();
    if (p.live) return p.endAt ? `Live now · ends ${relativeWords(p.endAt * 1000 - now)}` : 'Live now';
    return p.startAt ? `Begins ${relativeWords(p.startAt * 1000 - now)} · ${timeWords(p.startAt, 'f')}` : 'Soon';
  };
  function placeCard(/** @type {number} */ i) {
    const p = pins[i];
    if (!p) return;
    const r = chart.getBoundingClientRect();
    const x = tx + p.x * z, y = ty + p.y * z;
    card.style.left = `${Math.max(8, Math.min(r.width - 268, x + 18))}px`;
    card.style.top = `${Math.max(8, Math.min(r.height - (card.offsetHeight || 150) - 8, y - 30))}px`;
  }
  function showCard(/** @type {number} */ i, keep = false) {
    const p = pins[i];
    if (!p) return;
    const on = !!p.remind && !!reminders && reminders.includes(p.remind);
    card.hidden = false;
    card.style.setProperty('--pin', /** @type {Record<string, string>} */ (INKS)[p.family] ?? '#5a2a1c');
    card.innerHTML = `<div class="pin-family">${escapeHtml(/** @type {Record<string, string>} */ (FAMILY)[p.family] ?? p.family)}</div>
      <div class="pin-title">${escapeHtml(p.title)}</div>
      <div class="pin-where">${escapeHtml(p.where)}${p.exact ? '' : ' <em>(somewhere in this province)</em>'}</div>
      <div class="pin-when">${escapeHtml(whenWords(p))}</div>
      ${keep && p.remind && reminders !== null ? `<button type="button" class="stamp ${on ? 'ink-plain' : 'ink-primary'} pin-remind">${on ? 'Stop reminding me' : 'Remind me before it begins'}</button>` : ''}`;
    placeCard(i);
    card.querySelector('.pin-remind')?.addEventListener('click', async (e) => {
      const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
      if (btn.disabled) return;
      btn.disabled = true;
      const had = reminders ?? [];
      const next = on ? had.filter((r) => r !== p.remind) : [...had, p.remind];
      try {
        await hands.press('pda:events:remind', next);
        reminders = next;
        sounds.seal();
        showCard(i, true);
      } catch {
        btn.disabled = false;
        btn.textContent = 'That did not work. Try again.';
      }
    });
  }
  function hideCard() {
    card.hidden = true;
    pinned = -1;
    for (const e of pinsEl.querySelectorAll('.pin.open')) e.classList.remove('open');
  }
  chart.addEventListener('click', (e) => {
    if (travelled > 6) return;
    if (!(/** @type {HTMLElement} */ (e.target).closest('.pin, .pin-card'))) hideCard();
  });

  async function refresh() {
    let m;
    try {
      m = await ask('map');
    } catch {
      note.textContent = 'The map could not load. Try again later.';
      return;
    }
    if (!alive) return;
    W = m.chart?.w ?? W;
    H = m.chart?.h ?? H;
    // the card held open stays on its own event, found again by what it is, or closes if that event has gone
    const was = pinned >= 0 ? pins[pinned] : null;
    pins = m.pins ?? [];
    reminders = Array.isArray(m.reminders) ? m.reminders : null;
    const again = was ? pins.findIndex((p) => p.family === was.family && p.title === was.title && p.where === was.where && p.startAt === was.startAt) : -1;
    pinsEl.replaceChildren();
    legend.replaceChildren();
    pins.forEach((p, i) => {
      const ink = /** @type {Record<string, string>} */ (INKS)[p.family] ?? '#5a2a1c';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `pin${p.exact ? '' : ' hollow'}${p.live ? ' live' : ''}`;
      b.style.left = `${p.x}px`;
      b.style.top = `${p.y}px`;
      b.style.setProperty('--pin', ink);
      b.innerHTML = `<span class="pin-n">${p.n}</span>`;
      b.setAttribute('aria-label', `${p.title}, ${p.where}`);
      b.addEventListener('pointerenter', () => pinned < 0 && showCard(i));
      b.addEventListener('pointerleave', () => pinned < 0 && (card.hidden = true));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        hideCard();
        pinned = i;
        b.classList.add('open');
        showCard(i, true);
      });
      pinsEl.append(b);
      const li = document.createElement('li');
      li.innerHTML = `<button type="button"><span class="dot" style="--pin:${ink}"></span><strong>${p.n}.</strong> ${escapeHtml(p.title)} <em>${escapeHtml(p.where)}</em><small>${escapeHtml(whenWords(p))}</small></button>`;
      li.querySelector('button')?.addEventListener('click', () => {
        hideCard();
        pinned = i;
        pinsEl.children[i]?.classList.add('open');
        flyTo(p.x, p.y, 1.6);
        showCard(i, true);
      });
      legend.append(li);
    });
    if (again >= 0) {
      pinned = again;
      pinsEl.children[again]?.classList.add('open');
      showCard(again, true);
    } else if (pinned >= 0) hideCard();
    note.textContent = pins.length ? (m.known ? '● exact place  ○ somewhere in the province' : 'Exact places are unknown right now, so events are marked by province.') : 'No events are live or coming in the next three hours.';
  }

  img.addEventListener('load', () => {
    W = img.naturalWidth || W;
    H = img.naturalHeight || H;
    sheet.style.width = `${W}px`;
    sheet.style.height = `${H}px`;
    fit();
    draw();
    chart.classList.add('unfolded');
  });
  img.src = '/v1/journal/chart.png';
  const ro = new ResizeObserver(() => {
    fit();
    draw();
  });
  ro.observe(chart);
  refresh();
  const timer = setInterval(() => !document.hidden && refresh(), 60_000);
  return () => {
    alive = false;
    clearInterval(timer);
    ro.disconnect();
  };
}
