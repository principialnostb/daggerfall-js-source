// @ts-check
// The Eltheric Ocean, in the journal. The chapter's page is the captain's ledger: the fleet to set sail from, or the
// ship at sea (its damage, stores, crew, the day's bounties and the log). "Open the sea chart" spreads the chart over
// the desk: the Ocean's bands and the Veil, the isles from their seeds, other captains, raiders and legends, wakes and
// courses. Click the water to set a course, drag to pan, wheel to zoom; hover a ship for its card, press it to attack
// the guns. A fight is a side view of the two ships with the round's orders as cards; an isle is its ground, walked.
import { ask, AskError } from './api.js';
import { escapeHtml } from './md.js';
import { sounds } from './sound.js';
import { wordsFor } from './words.js';

const TAU = Math.PI * 2;
const BAND_SEA = { shallows: ['#2f6f78', '#3f8a8f'], reaches: ['#1f4f63', '#2b6274'], deep: ['#182a4f', '#22386a'], abyss: ['#120f2a', '#1d1640'] };
const HELM_WORDS = { close: ['Close in', 'Move closer. Bow guns fire.'], hold: ['Hold', 'Turn side-on. All side guns fire.'], open: ['Pull back', 'Move away. Half the side guns and the stern fire.'], flee: ['Flee', 'Run away. Only the stern fires. A faster ship escapes at long range.'] };
const HANDS_WORDS = { guns: ['Guns', 'Reload faster.'], sails: ['Sails', 'Go faster and repair sails.'], repair: ['Repair', 'Use a Carpenter’s Store to repair the hull.'], board: ['Board', 'Capture the other ship when side by side.'] };
const errWords = (/** @type {unknown} */ e) => (e instanceof AskError ? wordsFor(e.body?.error) : 'Cannot reach the sea right now. Try again.');
const pct = (/** @type {number} */ a, /** @type {number} */ b) => (b > 0 ? Math.max(0, Math.min(100, Math.round((a / b) * 100))) : 0);
const bar = (/** @type {string} */ label, /** @type {number} */ now, /** @type {number} */ max, /** @type {string} */ cls) =>
  max > 0 ? `<div class="gauge ${cls}"><span>${escapeHtml(label)}</span><i style="--p:${pct(now, max)}%"></i><b>${now} / ${max}</b></div>` : '';
const hashHue = (/** @type {string} */ s) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
};

/**
 * The sea, mounted on the chapter's page. Answers its unmount.
 * @param {HTMLElement} host @param {{ desk: HTMLElement, hands: any, frame: any }} o
 */
export function mountSea(host, { desk }) {
  /** @type {any} */
  let st = null;
  let alive = true;
  let busy = false;
  host.innerHTML = '<div class="ledger-sea"><p class="margin">Loading your ships…</p></div>';
  const ledger = /** @type {HTMLElement} */ (host.firstElementChild);
  /** @type {ReturnType<typeof openChart> | null} */
  let chart = null;
  /** The newest ask's number: an older answer arriving late never overwrites a newer state. */
  let seq = 0;
  let polling = false;
  /** The service's state taken whole: what it leaves out is gone (a fight ended, an island left), except the log,
   *  Seals and bounties, which a light read does not carry. @param {any} next */
  const take = (next) => {
    st = { ...next, log: next.log ?? st?.log, bounties: next.bounties ?? st?.bounties, seals: next.seals ?? st?.seals, today: next.today ?? st?.today };
    // the service's clock, so a round's time left is never the device's guess
    st.skew = Number.isFinite(next.now) ? next.now - Date.now() / 1000 : (st.skew ?? 0);
  };

  async function refresh(full = true) {
    if (polling || busy) return;
    polling = true;
    const mine = ++seq;
    try {
      const next = await ask(`sea/state${full ? '?full=1' : ''}`);
      if (mine !== seq || !alive) return;
      take(next);
    } catch (e) {
      if (mine === seq && !chart) ledger.innerHTML = `<p class="margin">${escapeHtml(errWords(e))}</p>`;
      return;
    } finally {
      polling = false;
    }
    drawLedger();
    chart?.update(st);
  }
  /** An act on the sea; its answer is the sea's new state. @param {string} route @param {any} [body] */
  async function act(route, body = {}) {
    if (busy) return null;
    busy = true;
    const mine = ++seq;
    try {
      const r = await ask(route, body);
      if (!alive) return r;
      if (mine === seq) take(r);
      drawLedger();
      chart?.update(st, r);
      return r;
    } catch (e) {
      if (chart) chart.say(errWords(e));
      else {
        const p = document.createElement('p');
        p.className = 'sea-err';
        p.textContent = errWords(e);
        ledger.prepend(p);
        setTimeout(() => p.remove(), 5000);
      }
      return null;
    } finally {
      busy = false;
    }
  }

  function drawLedger() {
    if (!st) return;
    const c = st.captain;
    if (!c) {
      const ships = st.fleet ?? [];
      ledger.innerHTML = `
        <h2 class="page-title ink">The Eltheric Ocean<small>West of the Bay, past the Veil</small></h2>
        <p class="words ink">Choose a ship to sail from Veilhaven. It sails as it is in your save, with its upgrades, crew and Carpenter’s Stores.</p>
        ${ships.length ? '' : '<p class="margin ink">You have no ship that can fight. A rowboat cannot sail out. Buy or build a ship in the game.</p>'}
        <div class="fleet">${ships
          .map(
            (s) => `<div class="ship-card ink"><div class="ship-name">${escapeHtml(s.ship.name)}</div><div class="ship-kind">${escapeHtml(s.ship.kind)}</div>
            ${bar('Hull', s.ship.now.hull, s.ship.max.hull, 'hull')}${bar('Sails', s.ship.now.sail, s.ship.max.sail, 'sail')}${bar('Crew', s.ship.now.crew, s.ship.max.crew, 'crew')}
            <div class="ship-facts">Carpenter’s Stores: ${s.ship.stores} · Fire barrels: ${s.ship.barrels}${s.ship.cargo.length ? `<br>Cargo: ${s.ship.cargo.map((/** @type {any} */ x) => `${escapeHtml(x.name)} ×${x.n}`).join(', ')}` : ''}</div>
            <button type="button" class="stamp ink-primary" data-sail="${escapeHtml(s.uid)}">Set sail</button></div>`,
          )
          .join('')}</div>
        <p class="margin ink">Seals: ${st.seals ?? 0}. Earn Seals at sea and on expeditions. Spend them in the Courier’s Cabinet.</p>`;
      for (const b of ledger.querySelectorAll('[data-sail]'))
        b.addEventListener('click', async () => {
          sounds.seal();
          if (await act('sea/sail', { uid: /** @type {HTMLElement} */ (b).dataset.sail })) unroll();
        });
      return;
    }
    const w = c.waters;
    const bounties = (st.bounties ?? []).map((/** @type {any} */ b) => `<li class="${b.paid ? 'paid' : b.done ? 'done' : ''}">${escapeHtml(b.words)} <em>${b.have}/${b.count}</em> <strong>${b.seals} Seals</strong>${b.paid ? ' ✓' : ''}</li>`).join('');
    const log = (st.log ?? []).map((/** @type {any} */ l) => `<li><time>${new Date(l.at * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time> ${escapeHtml(l.words)}${l.seals ? ` <strong>+${l.seals}</strong>` : ''}</li>`).join('');
    ledger.innerHTML = `
      <h2 class="page-title ink">${escapeHtml(c.ship.name)}<small>${escapeHtml(c.ship.kind)} · ${escapeHtml(w.bandName)}, ${w.leagues} leagues west of the Veil${w.peace ? ' · in the peace' : ''}</small></h2>
      <div class="ship-card wide ink">${bar('Hull', c.now.hull, c.ship.max.hull, 'hull')}${bar('Canvas', c.now.sail, c.ship.max.sail, 'sail')}${bar('Hands', c.now.crew, c.ship.max.crew, 'crew')}
        <div class="ship-facts">${c.state === 'battle' ? '<strong>In a fight.</strong> ' : c.state === 'ashore' ? '<strong>On an island.</strong> ' : c.at.moving ? 'Sailing. ' : 'Stopped. '}Carpenter’s Stores: ${c.stores} · Fire barrels: ${c.barrels} · Ammunition: ${escapeHtml(st.facts.shot[c.shot] ?? c.shot)} · Wins: ${c.wins} · Losses: ${c.losses}</div></div>
      <div class="stamps ink"><button type="button" class="stamp ink-primary" data-do="unroll">Open the sea chart</button>${c.state === 'sea' && c.stores > 0 && c.now.hull < c.ship.max.hull ? '<button type="button" class="stamp ink-good" data-do="mend">Repair (uses 1 store)</button>' : ''}${c.state === 'sea' ? '<button type="button" class="stamp ink-plain" data-do="home">Return to Veilhaven</button>' : ''}</div>
      <h3 class="ink-h3 ink">Today’s bounties</h3><ul class="bounties ink">${bounties}</ul>
      <p class="margin ink">Seals: ${st.seals ?? 0} · earned at sea today: ${st.today?.sea ?? 0} of ${st.today?.cap ?? 0}</p>
      <h3 class="ink-h3 ink">Ship’s log</h3><ul class="sealog ink">${log || '<li class="margin">No entries yet.</li>'}</ul>`;
    ledger.querySelector('[data-do="unroll"]')?.addEventListener('click', unroll);
    ledger.querySelector('[data-do="mend"]')?.addEventListener('click', () => act('sea/manage', { mend: true }).then(() => sounds.quill()));
    ledger.querySelector('[data-do="home"]')?.addEventListener('click', () => act('sea/home', {}));
  }

  function unroll() {
    if (chart || !st?.captain) return;
    chart = openChart(desk, st, { act, refresh, close: () => (chart = null) });
  }

  refresh(true);
  const timer = setInterval(() => !chart && !document.hidden && refresh(true), 12000);
  return () => {
    alive = false;
    clearInterval(timer);
    chart?.close();
  };
}

/**
 * The chart, spread over the desk: the canvas sea, the ship's card, the log, and the fight and the isle when they come.
 * @param {HTMLElement} desk @param {any} st0 @param {{ act: (r: string, b?: any) => Promise<any>, refresh: (full?: boolean) => Promise<void>, close: () => void }} io
 */
function openChart(desk, st0, io) {
  let st = st0;
  const root = document.createElement('div');
  root.className = 'sea sea-open';
  root.innerHTML = `
    <canvas class="sea-canvas"></canvas>
    <header class="sea-head"><div class="sea-title"></div><div class="wind" title="The wind"><svg viewBox="-20 -20 40 40" aria-hidden="true"><circle r="17" class="rose"/><path class="needle" d="M0 -14 L5 4 L0 1 L-5 4 Z"/><text y="-21" text-anchor="middle">N</text></svg></div><div class="sea-seals"></div><button type="button" class="sea-find" aria-label="Find my ship" title="Find my ship (Space)">⌖</button><button type="button" class="sea-close" aria-label="Close the chart">Close the chart</button></header>
    <aside class="sea-card"></aside>
    <aside class="sea-side"><h3>Today’s bounties</h3><ul class="bounties"></ul><h3>Ship’s log</h3><ul class="sealog"></ul></aside>
    <div class="sea-tip" hidden></div>
    <div class="sea-say" hidden></div>
    <div class="sea-help">Click the water to sail there. Drag to look around. Scroll to zoom. Press Space to find your ship.</div>`;
  desk.append(root);
  requestAnimationFrame(() => root.classList.add('unrolled'));
  const cv = /** @type {HTMLCanvasElement} */ (root.querySelector('.sea-canvas'));
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  const tip = /** @type {HTMLElement} */ (root.querySelector('.sea-tip'));
  const sayEl = /** @type {HTMLElement} */ (root.querySelector('.sea-say'));
  const card = /** @type {HTMLElement} */ (root.querySelector('.sea-card'));
  const side = /** @type {HTMLElement} */ (root.querySelector('.sea-side'));
  let alive = true;
  /** A player who asked the system for less motion: no swell, no bobbing. */
  const calm = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let zoom = 16;
  let cam = { x: st.captain.at.x, y: st.captain.at.y };
  let follow = true;
  let fetchedAt = performance.now();
  /** @type {{ x: number, y: number, t: number }[]} */
  const wake = [];
  /** @type {any} */
  let hover = null;
  /** @type {ReturnType<typeof openFight> | null} */
  let fight = null;
  /** @type {ReturnType<typeof openIsle> | null} */
  let isle = null;

  const say = (/** @type {string} */ w) => {
    sayEl.textContent = w;
    sayEl.hidden = false;
    sayEl.classList.remove('fade');
    void sayEl.offsetWidth;
    sayEl.classList.add('fade');
    clearTimeout(/** @type {any} */ (say).t);
    /** @type {any} */ (say).t = setTimeout(() => (sayEl.hidden = true), 5200);
  };

  /** Where the ship is now, carried on between the service's answers by its course and speed. */
  function shipNow() {
    const c = st.captain;
    if (!c) return { x: cam.x, y: cam.y };
    if (!c.to || !c.at.moving) return { x: c.at.x, y: c.at.y };
    const dt = (performance.now() - fetchedAt) / 60000;
    const dx = c.to.x - c.at.x, dy = c.to.y - c.at.y;
    const d = Math.hypot(dx, dy);
    const go = Math.min(d, c.way * dt);
    return d ? { x: c.at.x + (dx / d) * go, y: c.at.y + (dy / d) * go } : { x: c.at.x, y: c.at.y };
  }
  const headingOf = (/** @type {any} */ c) => (c?.to ? Math.atan2(c.to.y - c.at.y, c.to.x - c.at.x) : (c?.lastHeading ?? -Math.PI / 2));

  let cardKey = '';
  function drawCard() {
    const c = st.captain;
    if (!c) return;
    const w = c.waters;
    /** @type {HTMLElement} */ (root.querySelector('.sea-title')).innerHTML = `<strong>${escapeHtml(c.ship.name)}</strong> · ${escapeHtml(w.bandName)}, ${Number(w.leagues)} leagues${w.peace ? ' · <em>near Veilhaven: no fighting</em>' : ''}`;
    /** @type {HTMLElement} */ (root.querySelector('.sea-seals')).textContent = `${Number(st.seals ?? 0)} Seals`;
    const key = JSON.stringify([c.now, c.ship.max, c.stores, c.barrels, c.shot, c.posts, c.state, c.at.moving, st.landable, st.bounties, (st.log ?? []).length && st.log[0]]);
    if (key === cardKey) return;
    cardKey = key;
    const wasOpen = !!card.querySelector('details[open]');
    const posts = Object.entries(c.posts ?? {});
    card.innerHTML = `
      ${bar('Hull', c.now.hull, c.ship.max.hull, 'hull')}${bar('Canvas', c.now.sail, c.ship.max.sail, 'sail')}${bar('Hands', c.now.crew, c.ship.max.crew, 'crew')}
      <div class="ship-facts">Carpenter’s Stores: ${c.stores} · Fire barrels: ${c.barrels}</div>
      <label class="loads">Ammunition <select>${Object.entries(st.facts.shot).map(([k, v]) => `<option value="${k}"${k === c.shot ? ' selected' : ''}>${escapeHtml(String(v))}</option>`).join('')}</select></label>
      <details class="posts"><summary>Crew jobs (${posts.length})</summary>${(c.ship.hands ?? []).slice(0, 24).map((/** @type {any} */ h) => `<label>${escapeHtml(h.name)} <select data-hand="${escapeHtml(h.name)}"><option value="">—</option>${Object.entries(st.facts.posts).map(([k, v]) => `<option value="${k}" title="${escapeHtml(String(v))}"${c.posts?.[h.name] === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label>`).join('') || '<p>No hired crew on board.</p>'}</details>
      <div class="card-acts">
        ${st.landable && c.state === 'sea' ? '<button type="button" class="stamp ink-good" data-do="land">Land on the island</button>' : ''}
        ${c.state === 'sea' && c.at.moving ? '<button type="button" class="stamp ink-plain" data-do="stop">Stop</button>' : ''}
        ${c.state === 'sea' && c.stores > 0 && c.now.hull < c.ship.max.hull ? '<button type="button" class="stamp ink-good" data-do="mend">Repair (uses 1 store)</button>' : ''}
      </div>`;
    card.querySelector('.loads select')?.addEventListener('change', (e) => io.act('sea/manage', { shot: /** @type {HTMLSelectElement} */ (e.target).value }));
    for (const s of card.querySelectorAll('[data-hand]'))
      s.addEventListener('change', () => {
        /** @type {Record<string, string>} */
        const posts2 = {};
        for (const x of card.querySelectorAll('[data-hand]')) if (/** @type {HTMLSelectElement} */ (x).value) posts2[/** @type {HTMLElement} */ (x).dataset.hand ?? ''] = /** @type {HTMLSelectElement} */ (x).value;
        io.act('sea/manage', { posts: posts2 });
      });
    card.querySelector('[data-do="land"]')?.addEventListener('click', () => io.act('sea/land', {}));
    card.querySelector('[data-do="stop"]')?.addEventListener('click', () => io.act('sea/course', {}));
    card.querySelector('[data-do="mend"]')?.addEventListener('click', () => io.act('sea/manage', { mend: true }).then(() => sounds.quill()));
    if (wasOpen) card.querySelector('details')?.setAttribute('open', '');
    const bounties = /** @type {HTMLElement} */ (side.querySelector('.bounties'));
    if (st.bounties) bounties.innerHTML = st.bounties.map((/** @type {any} */ b) => `<li class="${b.paid ? 'paid' : ''}">${escapeHtml(b.words)} <em>${b.have}/${b.count}</em> · ${b.seals}${b.paid ? ' ✓' : ''}</li>`).join('');
    const log = /** @type {HTMLElement} */ (side.querySelector('.sealog'));
    if (st.log) log.innerHTML = st.log.slice(0, 10).map((/** @type {any} */ l) => `<li>${escapeHtml(l.words)}${l.seals ? ` <strong>+${l.seals}</strong>` : ''}</li>`).join('');
  }

  // ── The canvas ──
  const toScreen = (/** @type {number} */ x, /** @type {number} */ y) => [(x - cam.x) * zoom + cv.width / 2, (y - cam.y) * zoom + cv.height / 2];
  const toWorld = (/** @type {number} */ sx, /** @type {number} */ sy) => [(sx - cv.width / 2) / zoom + cam.x, (sy - cv.height / 2) / zoom + cam.y];
  const islePaths = new Map();
  function isleShape(/** @type {any} */ i) {
    if (islePaths.has(i.key)) return islePaths.get(i.key);
    let seed = hashHue(i.key) + 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = Array.from({ length: 14 }, (_, k) => {
      const a = (k / 14) * TAU;
      return [Math.cos(a) * (0.75 + rnd() * 0.45), Math.sin(a) * (0.75 + rnd() * 0.45)];
    });
    islePaths.set(i.key, pts);
    return pts;
  }
  function drawShip(/** @type {number} */ sx, /** @type {number} */ sy, /** @type {number} */ heading, /** @type {number} */ size, /** @type {{ hull: string, sail: string, flag?: string, glow?: string }} */ c) {
    g.save();
    g.translate(sx, sy);
    g.rotate(heading + Math.PI / 2);
    if (c.glow) {
      g.shadowColor = c.glow;
      g.shadowBlur = 18;
    }
    g.fillStyle = c.hull;
    g.beginPath();
    g.moveTo(0, -size);
    g.quadraticCurveTo(size * 0.55, -size * 0.2, size * 0.38, size * 0.85);
    g.lineTo(-size * 0.38, size * 0.85);
    g.quadraticCurveTo(-size * 0.55, -size * 0.2, 0, -size);
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(-size * 0.22, -size * 0.4, size * 0.44, size * 1.05);
    g.fillStyle = c.sail;
    for (const [y, w] of [[-size * 0.35, 0.72], [size * 0.25, 0.62]]) {
      g.beginPath();
      g.ellipse(0, y, size * w * 0.6, size * 0.14, 0, 0, TAU);
      g.fill();
    }
    if (c.flag) {
      g.fillStyle = c.flag;
      g.fillRect(-1, -size * 0.95, size * 0.32, size * 0.16);
    }
    g.restore();
  }
  function frame(/** @type {number} */ t) {
    if (!alive) return;
    if (!st.captain) return close();
    // under the island's view, or with the frame hidden, the sea is not drawn
    if (isle || document.hidden) return void requestAnimationFrame(frame);
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = Math.floor(cv.clientWidth * dpr), H = Math.floor(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const f = st.facts;
    const me = shipNow();
    if (follow) {
      cam.x += (me.x - cam.x) * 0.12;
      cam.y += (me.y - cam.y) * 0.12;
    }
    // the water, band by band, west to east
    const bands = f.bands.map((/** @type {any} */ b) => ({ ...b, x: f.veilX - b.from * f.leaguePx }));
    g.fillStyle = '#0d1630';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < bands.length; i++) {
      const east = bands[i].x, west = i + 1 < bands.length ? bands[i + 1].x : f.box.x0 - 200;
      const [sx0] = toScreen(west, 0), [sx1] = toScreen(east, 0);
      const cols = /** @type {Record<string, string[]>} */ (BAND_SEA)[bands[i].id] ?? BAND_SEA.reaches;
      const grd = g.createLinearGradient(sx0, 0, sx1, 0);
      grd.addColorStop(0, cols[0]);
      grd.addColorStop(1, cols[1]);
      g.fillStyle = grd;
      g.fillRect(Math.max(0, sx0), 0, Math.min(W, sx1) - Math.max(0, sx0), H);
    }
    // the Veil: still water east of it, shimmering
    {
      const [vx] = toScreen(f.veilX, 0);
      if (vx < W) {
        const grd = g.createLinearGradient(vx, 0, vx + 80 * dpr, 0);
        grd.addColorStop(0, `rgba(200,210,255,${0.18 + 0.08 * Math.sin(t / 700)})`);
        grd.addColorStop(1, 'rgba(230,235,255,0.55)');
        g.fillStyle = grd;
        g.fillRect(vx, 0, W - vx, H);
      }
    }
    // the swell: long strokes drifting with the wind
    g.strokeStyle = 'rgba(220,240,255,0.07)';
    g.lineWidth = 1.2 * dpr;
    const wind = st.wind?.bearing ?? 0;
    for (let k = 0; k < (calm ? 0 : 46); k++) {
      const yy = ((k * 97 + (t / 60) * Math.sin(wind) * 4) % H + H) % H;
      const xx = ((k * 173 + (t / 60) * Math.cos(wind) * 4) % W + W) % W;
      g.beginPath();
      g.moveTo(xx - 30 * dpr, yy);
      g.quadraticCurveTo(xx, yy - 4 * dpr * Math.sin(t / 500 + k), xx + 30 * dpr, yy);
      g.stroke();
    }
    // the peace about Veilhaven
    {
      const [hx, hy] = toScreen(f.haven.x, f.haven.y);
      g.setLineDash([6 * dpr, 6 * dpr]);
      g.strokeStyle = 'rgba(240,220,160,0.5)';
      g.beginPath();
      g.arc(hx, hy, f.peace * zoom, 0, TAU);
      g.stroke();
      g.setLineDash([]);
    }
    // the isles
    for (const i of st.near?.isles ?? []) {
      const [sx, sy] = toScreen(i.x, i.y);
      const r = Math.max(4, i.r * zoom);
      if (sx < -r * 2 || sy < -r * 2 || sx > W + r * 2 || sy > H + r * 2) continue;
      const pts = isleShape(i);
      const blob = (/** @type {number} */ k, /** @type {string} */ fill) => {
        g.fillStyle = fill;
        g.beginPath();
        pts.forEach(([px, py], n) => (n ? g.lineTo(sx + px * r * k, sy + py * r * k) : g.moveTo(sx + px * r * k, sy + py * r * k)));
        g.closePath();
        g.fill();
      };
      blob(1.45, 'rgba(120,200,200,0.22)');
      blob(1.12, '#d9c48f');
      blob(0.88, i.kind === 'rock' ? '#7c766a' : i.kind === 'ruin' ? '#6f7a52' : '#5f8a4a');
      g.fillStyle = '#2b1d12';
      g.font = `${Math.round(11 * dpr)}px Fell, serif`;
      g.textAlign = 'center';
      const mark = i.haven ? '⚓' : i.kind === 'port' ? '⌂' : i.kind === 'ruin' ? '♜' : i.kind === 'wild' ? '✿' : '▲';
      g.fillText(mark, sx, sy + 4 * dpr);
      if (zoom >= 10) {
        g.fillStyle = 'rgba(250,240,210,0.92)';
        g.font = `${Math.round(13 * dpr)}px Fell, serif`;
        g.fillText(i.name, sx, sy + r * 1.2 + 14 * dpr);
      }
    }
    // the reach of sight: beyond it, the dark
    {
      const [mx, my] = toScreen(me.x, me.y);
      const sight = (st.near?.sight ?? 18) * zoom;
      const grd = g.createRadialGradient(mx, my, sight * 0.82, mx, my, sight * 1.25);
      grd.addColorStop(0, 'rgba(5,8,20,0)');
      grd.addColorStop(1, 'rgba(5,8,20,0.62)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    // the course
    const c = st.captain;
    if (c?.to) {
      const [ax, ay] = toScreen(me.x, me.y), [bx, by] = toScreen(c.to.x, c.to.y);
      g.setLineDash([4 * dpr, 7 * dpr]);
      g.lineDashOffset = -t / 40;
      g.strokeStyle = 'rgba(255,240,200,0.7)';
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = 'rgba(255,240,200,0.85)';
      g.beginPath();
      g.arc(bx, by, 6 * dpr, 0, TAU);
      g.stroke();
    }
    // the wake
    if (!wake.length || Math.hypot(wake[wake.length - 1].x - me.x, wake[wake.length - 1].y - me.y) > 0.08) wake.push({ x: me.x, y: me.y, t });
    while (wake.length && t - wake[0].t > 9000) wake.shift();
    for (const p of wake) {
      const [sx, sy] = toScreen(p.x, p.y);
      const a = 1 - (t - p.t) / 9000;
      g.fillStyle = `rgba(235,250,255,${(a * 0.35).toFixed(3)})`;
      g.beginPath();
      g.arc(sx, sy, (2 + (1 - a) * 6) * dpr, 0, TAU);
      g.fill();
    }
    // others: captains, raiders, legends
    const bob = calm ? 0 : Math.sin(t / 600) * 0.06;
    for (const o of st.near?.captains ?? []) {
      const [sx, sy] = toScreen(o.x, o.y);
      const hue = hashHue(o.id);
      drawShip(sx, sy, o.to ? Math.atan2(o.to.y - o.y, o.to.x - o.x) : 0, (11 + o.hull * 2.6) * dpr, { hull: `hsl(${hue},30%,28%)`, sail: o.awake ? '#efe6cf' : '#a9a294', flag: `hsl(${hue},70%,55%)` });
      g.fillStyle = 'rgba(255,245,220,0.9)';
      g.font = `${Math.round(12 * dpr)}px Fell, serif`;
      g.textAlign = 'center';
      g.fillText(`${o.name}${o.awake ? '' : ' (offline)'}`, sx, sy - 18 * dpr);
    }
    for (const o of st.near?.foes ?? []) {
      const [sx, sy] = toScreen(o.x, o.y);
      const legend = o.kind === 'legend';
      drawShip(sx, sy, Math.sin(t / 3000 + o.x) * 0.6 + bob, (11 + o.hull * 2.6) * dpr * (legend ? 1.5 : 1), { hull: legend ? '#1c2a26' : '#2a1d18', sail: legend ? 'rgba(160,255,210,0.75)' : '#26201c', flag: legend ? '#9effd0' : '#b02a1e', glow: legend ? 'rgba(120,255,200,0.8)' : undefined });
      g.fillStyle = legend ? '#bfffe4' : '#ffd0c0';
      g.font = `${Math.round((legend ? 15 : 12) * dpr)}px ${legend ? 'Jacquard' : 'Fell'}, serif`;
      g.textAlign = 'center';
      g.fillText(o.name, sx, sy - 22 * dpr);
    }
    // your ship
    if (c) {
      const [sx, sy] = toScreen(me.x, me.y);
      if (c.to) c.lastHeading = headingOf(c);
      drawShip(sx, sy, headingOf(c) + bob, (13 + c.ship.hull * 3) * dpr, { hull: '#4a2c18', sail: '#f6eed8', flag: '#c9a227', glow: 'rgba(255,230,160,0.55)' });
    }
    // what the hand hovers
    if (hover) {
      const [sx, sy] = toScreen(hover.x, hover.y);
      g.strokeStyle = 'rgba(255,230,160,0.9)';
      g.lineWidth = 1.5 * dpr;
      g.beginPath();
      g.arc(sx, sy, 22 * dpr, 0, TAU);
      g.stroke();
    }
    // the scale: a league, as the chart is drawn now
    {
      const len = f.leaguePx * zoom;
      const x0 = 18 * dpr, y0 = 78 * dpr;
      g.strokeStyle = 'rgba(242,230,200,0.85)';
      g.fillStyle = 'rgba(242,230,200,0.85)';
      g.lineWidth = 2 * dpr;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + len, y0);
      g.moveTo(x0, y0 - 5 * dpr);
      g.lineTo(x0, y0 + 5 * dpr);
      g.moveTo(x0 + len, y0 - 5 * dpr);
      g.lineTo(x0 + len, y0 + 5 * dpr);
      g.stroke();
      g.font = `italic ${Math.round(12 * dpr)}px Fell, serif`;
      g.textAlign = 'left';
      g.fillText('one league', x0, y0 - 9 * dpr);
    }
    // the wind rose
    /** @type {SVGElement} */ (root.querySelector('.wind .needle')).setAttribute('transform', `rotate(${(((wind + Math.PI / 2) * 180) / Math.PI).toFixed(1)})`);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── The hand ──
  let drag = /** @type {{ x: number, y: number, moved: number } | null} */ (null);
  const pick = (/** @type {number} */ wx, /** @type {number} */ wy) => {
    const near = (/** @type {any} */ o) => Math.hypot(o.x - wx, o.y - wy) <= 18 / zoom + 0.6;
    return (st.near?.foes ?? []).find(near) ?? (st.near?.captains ?? []).find(near) ?? null;
  };
  /** A ship's card held open by a press: what it is, and what can be done about it. */
  function pinShip(/** @type {any} */ hit, /** @type {number} */ x, /** @type {number} */ y) {
    const me = shipNow();
    const d = Math.hypot(hit.x - me.x, hit.y - me.y);
    const inRange = d <= st.facts.hail + (hit.kind ? 1 : 0);
    const peace = !hit.kind && hit.peace;
    tip.hidden = false;
    tip.classList.add('pinned');
    tip.style.left = `${Math.min(x + 16, cv.clientWidth - 240)}px`;
    tip.style.top = `${Math.min(y + 10, cv.clientHeight - 140)}px`;
    tip.innerHTML = `${hit.kind ? `<strong>${escapeHtml(hit.name)}</strong><br>${hit.kind === 'legend' ? 'Legendary ship' : 'Raider'} · ${Number(hit.seals)} Seals` : `<strong>${escapeHtml(hit.name)}</strong> · ${escapeHtml(hit.ship)}<br>Hull ${Number(hit.hp)}%${hit.awake ? '' : ' · offline'}`}
      <div class="tip-acts">${inRange && !peace ? '<button type="button" class="stamp ink-bad" data-tip="attack">Attack</button>' : ''}${!inRange ? '<button type="button" class="stamp ink-primary" data-tip="sail">Sail to it</button>' : ''}<button type="button" class="stamp ink-plain" data-tip="close">Close</button></div>`;
    tip.querySelector('[data-tip="attack"]')?.addEventListener('click', async () => {
      tip.hidden = true;
      sounds.cannon();
      await io.act('sea/engage', { target: hit.id });
    });
    tip.querySelector('[data-tip="sail"]')?.addEventListener('click', async () => {
      tip.hidden = true;
      await io.act('sea/course', { x: hit.x, y: hit.y });
      say(`Sailing toward ${hit.name}.`);
      follow = true;
    });
    tip.querySelector('[data-tip="close"]')?.addEventListener('click', () => (tip.hidden = true));
  }
  /** Two fingers on the chart: the pinch zooms. */
  const fingers = new Map();
  let pinch0 = 0;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      drag = null;
      return;
    }
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
  });
  const lift = (/** @type {PointerEvent} */ e) => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch0 = 0;
  };
  cv.addEventListener('pointercancel', lift);
  cv.addEventListener('pointermove', (e) => {
    const dpr = cv.width / cv.clientWidth;
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2 && pinch0) {
      const [a, b] = [...fingers.values()];
      const dd = Math.hypot(a.x - b.x, a.y - b.y);
      zoom = Math.max(4, Math.min(48, zoom * (dd / pinch0)));
      pinch0 = dd;
      return;
    }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) {
        follow = false;
        cam.x -= (dx * dpr) / zoom;
        cam.y -= (dy * dpr) / zoom;
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    const r = cv.getBoundingClientRect();
    const [wx, wy] = toWorld((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    hover = pick(wx, wy);
    if (tip.classList.contains('pinned') && !tip.hidden) return;
    if (hover) {
      const me = shipNow();
      const d = Math.hypot(hover.x - me.x, hover.y - me.y);
      tip.hidden = false;
      tip.style.left = `${e.clientX - r.left + 16}px`;
      tip.style.top = `${e.clientY - r.top + 10}px`;
      tip.innerHTML = hover.kind
        ? `<strong>${escapeHtml(hover.name)}</strong><br>${hover.kind === 'legend' ? 'Legendary ship' : escapeHtml(String(hover.cls).replace(/^\w/, (m) => m.toUpperCase()))} · ${hover.seals} Seals<br><em>${d <= st.facts.hail + 1 ? 'In range: click to attack' : `${(d / st.facts.leaguePx).toFixed(1)} leagues away`}</em>`
        : `<strong>${escapeHtml(hover.name)}</strong> · ${escapeHtml(hover.ship)}<br>${escapeHtml(hover.kind)} · hull ${hover.hp}%${hover.awake ? '' : ' · offline'}<br><em>${hover.peace ? 'Near Veilhaven: no fighting' : d <= st.facts.hail ? 'In range: click to attack' : `${(d / st.facts.leaguePx).toFixed(1)} leagues away`}</em>`;
    } else tip.hidden = true;
  });
  cv.addEventListener('pointerup', async (e) => {
    lift(e);
    const was = drag;
    drag = null;
    if (!was || was.moved > 6) return;
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / cv.clientWidth;
    const [wx, wy] = toWorld((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    const hit = pick(wx, wy);
    if (hit) return pinShip(hit, e.clientX - r.left, e.clientY - r.top);
    if (!tip.hidden && tip.classList.contains('pinned')) {
      tip.hidden = true;
      tip.classList.remove('pinned');
      return;
    }
    if (st.captain?.state !== 'sea') return;
    await io.act('sea/course', { x: wx, y: wy });
    follow = true;
    sounds.splash();
  });
  cv.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoom = Math.max(4, Math.min(48, zoom * Math.exp(-e.deltaY * 0.0015)));
    },
    { passive: false },
  );
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (fight || isle) return;
    if (e.key === 'Escape') return close();
    const t = /** @type {HTMLElement} */ (e.target);
    if (t?.closest?.('button, summary, select, input, textarea, a') || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ') {
      e.preventDefault();
      follow = true;
    }
    const m = /** @type {Record<string, number[]>} */ ({ ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0], ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] })[e.key];
    if (m) {
      follow = false;
      cam.x += (m[0] * 60) / zoom;
      cam.y += (m[1] * 60) / zoom;
    }
  };
  document.addEventListener('keydown', onKey);
  /** @type {HTMLElement} */ (root.querySelector('.sea-close')).addEventListener('click', () => close());
  /** @type {HTMLElement} */ (root.querySelector('.sea-find')).addEventListener('click', () => {
    follow = true;
    zoom = Math.max(zoom, 12);
  });

  // ── The service's word, kept fresh ──
  let n = 0;
  const poll = setInterval(async () => {
    if (!alive) return;
    n++;
    const inFight = st.captain?.state === 'battle' || !!st.battle;
    if (document.hidden || (!inFight && n % 2)) return;
    await io.refresh(n % 4 === 0);
  }, 1300);

  function close() {
    alive = false;
    clearInterval(poll);
    document.removeEventListener('keydown', onKey);
    fight?.close();
    isle?.close();
    root.classList.remove('unrolled');
    setTimeout(() => root.remove(), 450);
    io.close();
  }

  drawCard();
  return {
    /** The sea's new state, and the answer that brought it (a walk's path, a visit's words). @param {any} s @param {any} [r] */
    update(s, r = null) {
      const before = st;
      st = { ...s, captain: s.captain ? { ...s.captain, lastHeading: before.captain?.lastHeading } : s.captain };
      fetchedAt = performance.now();
      drawCard();
      if (st.battle && !fight) fight = openFight(root, st, io, () => (fight = null));
      else if (fight && st.battle) fight.update(st);
      if (st.captain?.state === 'ashore' && st.ground && !isle) isle = openIsle(root, st, io, () => (isle = null));
      else if (isle && st.ground) isle.update(st, r);
      else if (isle && !st.ground) isle.close();
      if (r?.said) say(`${r.said}${r.paid ? `  (+${r.paid} Seals)` : ''}`);
    },
    say,
    close,
  };
}

/**
 * The fight: the two ships side by side on the swell, closer as the range shortens; the round's orders as cards; the
 * broadsides played out when the round resolves; the end, and its Seals.
 * @param {HTMLElement} root @param {any} st0 @param {any} io @param {() => void} done
 */
function openFight(root, st0, io, done) {
  let st = st0;
  const el = document.createElement('div');
  el.className = 'sea-fight';
  el.innerHTML = `<canvas class="fight-canvas"></canvas><div class="fight-head"></div><div class="fight-orders"></div><ol class="fight-log"></ol>`;
  root.append(el);
  requestAnimationFrame(() => el.classList.add('shown'));
  const cv = /** @type {HTMLCanvasElement} */ (el.querySelector('canvas'));
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  let alive = true;
  /** @type {{ helm: string, shot: string, hands: string, brace: boolean }} */
  let orders = { helm: st.battle.last?.helm ?? 'close', shot: st.battle.last?.shot ?? st.captain?.shot ?? 'round', hands: st.battle.last?.hands ?? 'guns', brace: false };
  let shownRound = st.battle.round;
  /** @type {{ x: number, y: number, vx: number, vy: number, life: number, kind: string }[]} */
  const fx = [];
  const RANGE_GAP = { long: 0.62, medium: 0.45, short: 0.3, grapple: 0.14 };
  let gap = /** @type {Record<string, number>} */ (RANGE_GAP)[st.battle.range] ?? 0.6;

  function drawHead() {
    const b = st.battle;
    const bars = (/** @type {any} */ s, /** @type {string} */ who) =>
      `<div class="fight-side"><div class="ship-name">${escapeHtml(s.ship)}</div><div class="ship-kind">${escapeHtml(who)} · ${escapeHtml(s.kind)}${s.fire ? ' · <b class="afire">on fire</b>' : ''}</div>${bar('Hull', s.now.hull, s.max.hull, 'hull')}${bar('Canvas', s.now.sail, s.max.sail, 'sail')}${bar('Hands', s.now.crew, s.max.crew, 'crew')}</div>`;
    const left = Math.max(0, b.due - Math.floor(Date.now() / 1000 + (st.skew ?? 0)));
    el.querySelector('.give')?.setAttribute('style', `--left:${Math.min(1, left / (st.facts.roundDue || 45)).toFixed(3)}`);
    /** @type {HTMLElement} */ (el.querySelector('.fight-head')).innerHTML = `${bars(b.me, 'Your ship')}<div class="fight-mid"><div class="round">Round ${b.round}</div><div class="range">${escapeHtml({ long: 'Long range', medium: 'Medium range', short: 'Close range', grapple: 'Side by side' }[/** @type {'long'} */ (b.range)] ?? b.range)}</div>${b.over ? '' : `<div class="due">${b.given ? 'Orders sent. Waiting for the other ship.' : `${left} seconds to choose`}</div>`}</div>${bars(b.foe, b.foe.kind_of === 'legend' ? 'Legend' : b.foe.kind_of === 'raider' ? 'Raider' : 'Captain')}`;
  }
  function drawOrders() {
    const b = st.battle;
    const box = /** @type {HTMLElement} */ (el.querySelector('.fight-orders'));
    if (b.over) {
      const paid = (st.log ?? []).find((/** @type {any} */ l) => l.seals > 0 && l.at >= (b.due ?? 0) - 120);
      box.innerHTML = `<div class="fight-over ${b.over.mine ? 'won' : ''}"><h2>${b.over.mine ? 'Victory' : b.over.winner ? 'Defeat' : 'Draw'}</h2><p>${b.over.mine ? (paid ? `+${paid.seals} Seals` : 'See your ship’s log.') : b.over.winner ? 'Repair your ship before the next fight.' : 'Neither ship won.'}</p><button type="button" class="wax" data-ack>Done</button></div>`;
      box.querySelector('[data-ack]')?.addEventListener('click', async () => {
        await io.act('sea/ack', {});
        close();
      });
      if (b.over.mine) sounds.coin();
      return;
    }
    const cards = (/** @type {string} */ name, /** @type {string} */ key, /** @type {Record<string, string[]>} */ words) =>
      `<div class="order-row"><span class="order-name">${name}</span>${Object.entries(words)
        .map(([k, [label, hint]]) => `<button type="button" class="order${/** @type {any} */ (orders)[key] === k ? ' on' : ''}" data-k="${key}" data-v="${k}" title="${escapeHtml(hint)}"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(hint)}</small></button>`)
        .join('')}</div>`;
    const shotWords = Object.fromEntries(Object.entries(st.facts.shot).map(([k, v]) => [k, [String(v), k === 'grape' ? 'Hits the crew.' : k === 'chain' ? 'Tears the sails.' : k === 'heated' ? 'Can start a fire. Slower to reload.' : 'Damages the hull.']]));
    box.innerHTML = `${cards('Move', 'helm', HELM_WORDS)}${cards('Ammo', 'shot', shotWords)}${cards('Crew', 'hands', HANDS_WORDS)}
      <div class="order-row last"><label class="brace"><input type="checkbox"${orders.brace ? ' checked' : ''}> Brace <small>(take half damage, but your guns do not fire)</small></label><button type="button" class="wax give"${b.given ? ' disabled' : ''}>${b.given ? 'Sent' : 'Send orders'}</button></div>`;
    for (const o of box.querySelectorAll('.order'))
      o.addEventListener('click', () => {
        /** @type {any} */ (orders)[/** @type {HTMLElement} */ (o).dataset.k ?? ''] = /** @type {HTMLElement} */ (o).dataset.v;
        drawOrders();
      });
    box.querySelector('.brace input')?.addEventListener('change', (e) => (orders.brace = /** @type {HTMLInputElement} */ (e.target).checked));
    box.querySelector('.give')?.addEventListener('click', async () => {
      sounds.seal();
      await io.act('sea/orders', { ...orders, round: b.round });
    });
  }
  function drawLog() {
    /** @type {HTMLElement} */ (el.querySelector('.fight-log')).innerHTML = (st.battle.log ?? []).slice(-14).map((/** @type {string} */ l) => `<li class="${/^Round/.test(l) ? 'round' : ''}">${escapeHtml(l)}</li>`).join('');
    const ol = /** @type {HTMLElement} */ (el.querySelector('.fight-log'));
    ol.scrollTop = ol.scrollHeight;
  }
  /** A round's broadsides played: shot from each ship that fired, smoke, splashes and splinters. */
  function playRound(/** @type {string[]} */ lines) {
    const W = cv.width, H = cv.height;
    const meX = W * (0.5 - gap / 2), foeX = W * (0.5 + gap / 2), y = H * 0.58;
    for (const l of lines) {
      const mine = l.startsWith(st.battle.me.label ?? st.battle.me.ship);
      const theirs = !mine && l.startsWith(st.battle.foe.label ?? st.battle.foe.ship);
      if (!/fires|rakes|falls short/.test(l) || (!mine && !theirs)) continue;
      const from = mine ? meX : foeX, to = mine ? foeX : meX;
      const hits = Number((/(\d+) shots? strikes?/.exec(l) ?? [])[1] ?? 0);
      for (let k = 0; k < Math.max(3, Math.min(10, hits + 2)); k++) {
        const t0 = k * 70;
        setTimeout(() => {
          sounds.cannon();
          fx.push({ x: from, y: y - 16, vx: (to - from) / 42, vy: -3 - Math.random() * 2, life: 42, kind: k < hits ? 'ball' : 'miss' });
          for (let s = 0; s < 6; s++) fx.push({ x: from + (mine ? 20 : -20), y: y - 12, vx: (Math.random() - 0.5) * 2, vy: -Math.random() * 1.5, life: 70, kind: 'smoke' });
        }, t0);
      }
    }
  }
  function drawShipSide(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ s, /** @type {boolean} */ flip, /** @type {any} */ side, /** @type {number} */ t, /** @type {string} */ sailCol) {
    g.save();
    g.translate(x, y + Math.sin(t / 700 + (flip ? 1 : 0)) * 4);
    g.rotate(Math.sin(t / 900 + (flip ? 2 : 0)) * 0.03);
    if (flip) g.scale(-1, 1);
    g.fillStyle = '#3b2414';
    g.beginPath();
    g.moveTo(-s, 0);
    g.lineTo(s * 1.05, -s * 0.05);
    g.quadraticCurveTo(s * 0.9, s * 0.42, s * 0.55, s * 0.45);
    g.lineTo(-s * 0.75, s * 0.45);
    g.quadraticCurveTo(-s * 1.05, s * 0.3, -s, 0);
    g.fill();
    g.fillStyle = '#c9a227';
    g.fillRect(-s * 0.85, s * 0.08, s * 1.7, s * 0.04);
    g.fillStyle = '#111';
    for (let k = 0; k < 5; k++) g.fillRect(-s * 0.6 + k * s * 0.3, s * 0.16, s * 0.08, s * 0.07);
    const sails = side.max.sail ? side.now.sail / side.max.sail : 1;
    g.strokeStyle = '#2a1a0e';
    g.lineWidth = 3;
    for (const mx of [-0.35, 0.2, 0.65]) {
      g.beginPath();
      g.moveTo(s * mx, 0);
      g.lineTo(s * mx, -s * 1.35);
      g.stroke();
      g.fillStyle = sailCol;
      g.globalAlpha = 0.35 + 0.65 * sails;
      g.beginPath();
      g.moveTo(s * mx - s * 0.24, -s * 1.25);
      g.quadraticCurveTo(s * mx + s * 0.12, -s * 0.85, s * mx - s * 0.24, -s * 0.35);
      g.lineTo(s * mx + s * 0.26, -s * 0.35);
      g.quadraticCurveTo(s * mx + s * 0.4, -s * 0.85, s * mx + s * 0.26, -s * 1.25);
      g.fill();
      g.globalAlpha = 1;
    }
    if (side.fire) {
      for (let k = 0; k < 6; k++) {
        g.fillStyle = `rgba(255,${120 + Math.random() * 100},40,${0.6 + Math.random() * 0.3})`;
        g.beginPath();
        g.arc(-s * 0.3 + Math.random() * s * 0.8, -Math.random() * s * 0.4, 4 + Math.random() * 6, 0, TAU);
        g.fill();
      }
    }
    g.restore();
  }
  let lastT = 0;
  function frame(/** @type {number} */ t) {
    if (!alive) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = Math.floor(cv.clientWidth * dpr), H = Math.floor(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const want = /** @type {Record<string, number>} */ (RANGE_GAP)[st.battle.range] ?? 0.6;
    gap += (want - gap) * 0.04;
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#3a4a66');
    sky.addColorStop(0.55, '#c8a878');
    sky.addColorStop(0.56, '#21485a');
    sky.addColorStop(1, '#0f2433');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const y = H * 0.58, s = Math.min(W, H) * 0.12;
    g.strokeStyle = 'rgba(220,240,255,0.12)';
    for (let k = 0; k < 18; k++) {
      const yy = H * 0.6 + k * H * 0.025;
      g.beginPath();
      for (let x = 0; x <= W; x += 20) g.lineTo(x, yy + Math.sin(x / 60 + t / 500 + k) * 3);
      g.stroke();
    }
    const b = st.battle;
    drawShipSide(W * (0.5 - gap / 2), y, s, false, b.me, t, '#f3ead2');
    drawShipSide(W * (0.5 + gap / 2), y, s * (b.foe.kind_of === 'legend' ? 1.2 : 1), true, b.foe, t, b.foe.kind_of === 'legend' ? 'rgba(170,255,215,0.85)' : b.foe.kind_of === 'raider' ? '#2b2420' : '#e8dcc0');
    // the shot and smoke move by the time passed, so a fast screen does not play the fight faster
    const step = lastT ? Math.min(3, (t - lastT) / 16.7) : 1;
    lastT = t;
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.vy += (p.kind === 'smoke' ? -0.01 : 0.12) * step;
      p.life -= step;
      if (p.kind === 'smoke') {
        g.fillStyle = `rgba(230,225,215,${Math.max(0, p.life / 140)})`;
        g.beginPath();
        g.arc(p.x, p.y, 10 + (70 - p.life) * 0.4, 0, TAU);
        g.fill();
      } else if (p.kind === 'ball' || p.kind === 'miss') {
        g.fillStyle = '#111';
        g.beginPath();
        g.arc(p.x, p.y, 3 * dpr, 0, TAU);
        g.fill();
        if (p.life <= 0) {
          for (let s2 = 0; s2 < 8; s2++) fx.push({ x: p.x, y: p.kind === 'ball' ? p.y : H * 0.6, vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 4, life: 30, kind: p.kind === 'ball' ? 'splinter' : 'splash' });
          if (p.kind === 'miss') sounds.splash();
        }
      } else {
        g.fillStyle = p.kind === 'splinter' ? '#7a4a22' : 'rgba(220,240,255,0.8)';
        g.fillRect(p.x, p.y, 3, 3);
      }
      if (p.life <= 0) fx.splice(i, 1);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const tick = setInterval(() => !st.battle.over && drawHead(), 1000);
  function close() {
    alive = false;
    clearInterval(tick);
    el.classList.remove('shown');
    setTimeout(() => el.remove(), 350);
    done();
  }
  drawHead();
  drawOrders();
  drawLog();
  return {
    /** @param {any} s */
    update(s) {
      if (!s.battle) return close();
      const before = st.battle;
      st = s;
      if (s.battle.round !== shownRound || (s.battle.over && !before.over)) {
        const fresh = s.battle.log.slice((before.log ?? []).length ? s.battle.log.lastIndexOf(`Round ${shownRound}`) : 0);
        playRound(fresh);
        shownRound = s.battle.round;
      }
      drawHead();
      if (before.given !== s.battle.given || before.round !== s.battle.round || !!before.over !== !!s.battle.over) drawOrders();
      drawLog();
    },
    close,
  };
}

/**
 * Ashore: the isle's ground from above, the landing party walking it tile by tile; its spots marked; a spot stood by
 * shows what it offers.
 * @param {HTMLElement} root @param {any} st0 @param {any} io @param {() => void} done
 */
function openIsle(root, st0, io, done) {
  let st = st0;
  const el = document.createElement('div');
  el.className = 'sea-isle';
  el.innerHTML = `<div class="isle-head"><h2></h2><button type="button" class="stamp ink-primary" data-embark>Back to the ship</button></div><canvas class="isle-canvas"></canvas><div class="isle-spot"></div>`;
  root.append(el);
  requestAnimationFrame(() => el.classList.add('shown'));
  const cv = /** @type {HTMLCanvasElement} */ (el.querySelector('canvas'));
  const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d'));
  let alive = true;
  let pos = { x: st.captain.ix, y: st.captain.iy };
  /** @type {number[][]} */
  let path = [];
  let stepAt = 0;
  const TILE = { ' ': '#16384a', '~': '#2f6f78', '.': '#d9c48f', ',': '#6f9a52', T: '#3f6a34', '^': '#8a8478', '#': '#b9a98a', H: '#7a4a2a', D: '#6b4a2a' };
  const ICON = { harbour: '⚓', tavern: '🍺', board: '📜', ruin: '♜', good: '✦', lookout: '👁', cairn: '⛬' };

  function drawSpot() {
    const gr = st.ground;
    const s = gr.spots.find((/** @type {any} */ x) => Math.abs(x.x - pos.x) + Math.abs(x.y - pos.y) <= 1);
    /** @type {HTMLElement} */ (el.querySelector('.isle-head h2')).innerHTML = `${escapeHtml(gr.name)} <small>${escapeHtml(gr.words)}${gr.good ? `, with ${escapeHtml(gr.good)} on its beach` : ''}</small>`;
    const box = /** @type {HTMLElement} */ (el.querySelector('.isle-spot'));
    if (!s) {
      box.innerHTML = `<p class="margin">Click the ground to walk there. ${gr.spots.map((/** @type {any} */ x) => `${/** @type {Record<string, string>} */ (ICON)[x.kind] ?? '•'} ${escapeHtml(String(st.facts.spots[x.kind] ?? x.kind).split(':')[0])}`).join(' · ')}</p>`;
      return;
    }
    const doneToday = gr.done?.[s.kind] === Math.floor((Date.now() / 1000 + (st.skew ?? 0)) / 86400);
    box.innerHTML = `<p><strong>${escapeHtml(String(st.facts.spots[s.kind] ?? s.kind))}</strong></p>${s.kind === 'board' ? `<ul class="bounties">${(st.bounties ?? []).map((/** @type {any} */ b) => `<li>${escapeHtml(b.words)} <em>${b.have}/${b.count}</em> · ${b.seals}</li>`).join('')}</ul>` : ''}<button type="button" class="stamp ink-primary" data-visit="${s.kind}"${doneToday ? ' disabled' : ''}>${doneToday ? 'Done for today' : 'Visit'}</button>`;
    box.querySelector('[data-visit]')?.addEventListener('click', async () => {
      sounds.quill();
      await io.act('sea/visit', { spot: s.kind });
    });
  }
  function frame(/** @type {number} */ t) {
    if (!alive) return;
    const gr = st.ground;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const W = Math.floor(cv.clientWidth * dpr), H = Math.floor(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const ts = Math.floor(Math.min(W / gr.w, H / gr.h));
    const ox = Math.floor((W - ts * gr.w) / 2), oy = Math.floor((H - ts * gr.h) / 2);
    if (path.length && t - stepAt > 140) {
      const nx = /** @type {number[]} */ (path.shift());
      pos = { x: nx[0], y: nx[1] };
      stepAt = t;
      sounds.step();
      if (!path.length) drawSpot();
    }
    for (let y = 0; y < gr.h; y++)
      for (let x = 0; x < gr.w; x++) {
        const c = gr.tiles[y][x];
        g.fillStyle = /** @type {Record<string, string>} */ (TILE)[c] ?? '#16384a';
        g.fillRect(ox + x * ts, oy + y * ts, ts + 1, ts + 1);
        const n = ((x * 73856093) ^ (y * 19349663)) & 255;
        g.fillStyle = `rgba(${n & 1 ? '255,255,255' : '0,0,0'},${((n % 7) / 100).toFixed(2)})`;
        g.fillRect(ox + x * ts, oy + y * ts, ts + 1, ts + 1);
        if (c === ',' && n % 3 === 0) {
          g.strokeStyle = 'rgba(40,70,30,0.55)';
          g.beginPath();
          g.moveTo(ox + x * ts + ts * 0.3, oy + y * ts + ts * 0.7);
          g.lineTo(ox + x * ts + ts * 0.35, oy + y * ts + ts * 0.45);
          g.moveTo(ox + x * ts + ts * 0.5, oy + y * ts + ts * 0.72);
          g.lineTo(ox + x * ts + ts * 0.55, oy + y * ts + ts * 0.42);
          g.stroke();
        }
        if (c === '.' && n % 5 === 0) {
          g.fillStyle = 'rgba(140,110,60,0.35)';
          g.fillRect(ox + x * ts + ts * 0.6, oy + y * ts + ts * 0.3, 2, 2);
        }
        if (c === '~' || c === ' ') {
          g.fillStyle = `rgba(255,255,255,${0.05 + 0.05 * Math.sin(t / 400 + x * 0.7 + y)})`;
          g.fillRect(ox + x * ts, oy + y * ts + ts * 0.4, ts, 2);
        } else if (c === 'T') {
          g.fillStyle = '#2c4f27';
          g.beginPath();
          g.arc(ox + x * ts + ts / 2, oy + y * ts + ts / 2, ts * 0.42, 0, TAU);
          g.fill();
        } else if (c === 'H') {
          g.fillStyle = '#9a3a24';
          g.beginPath();
          g.moveTo(ox + x * ts, oy + y * ts + ts * 0.45);
          g.lineTo(ox + x * ts + ts / 2, oy + y * ts + ts * 0.1);
          g.lineTo(ox + x * ts + ts, oy + y * ts + ts * 0.45);
          g.fill();
        } else if (c === '^') {
          g.fillStyle = '#a8a294';
          g.beginPath();
          g.moveTo(ox + x * ts + ts * 0.15, oy + y * ts + ts * 0.85);
          g.lineTo(ox + x * ts + ts / 2, oy + y * ts + ts * 0.15);
          g.lineTo(ox + x * ts + ts * 0.85, oy + y * ts + ts * 0.85);
          g.fill();
        }
      }
    g.font = `${Math.round(ts * 0.8)}px serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const s of gr.spots) {
      g.fillStyle = `rgba(255,230,150,${0.25 + 0.2 * Math.sin(t / 500 + s.x)})`;
      g.beginPath();
      g.arc(ox + s.x * ts + ts / 2, oy + s.y * ts + ts / 2, ts * 0.7, 0, TAU);
      g.fill();
      g.fillStyle = '#2b1d12';
      g.fillText(/** @type {Record<string, string>} */ (ICON)[s.kind] ?? '•', ox + s.x * ts + ts / 2, oy + s.y * ts + ts / 2);
    }
    // the landing party: a figure with a lantern
    const px = ox + pos.x * ts + ts / 2, py = oy + pos.y * ts + ts / 2 + Math.sin(t / 120) * (path.length ? 1.5 : 0);
    g.fillStyle = 'rgba(255,220,140,0.35)';
    g.beginPath();
    g.arc(px, py, ts * 1.1, 0, TAU);
    g.fill();
    g.fillStyle = '#3b2a1a';
    g.beginPath();
    g.arc(px, py - ts * 0.18, ts * 0.22, 0, TAU);
    g.fill();
    g.fillRect(px - ts * 0.18, py, ts * 0.36, ts * 0.38);
    g.fillStyle = '#ffd27a';
    g.fillRect(px + ts * 0.2, py + ts * 0.02, ts * 0.12, ts * 0.16);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  cv.addEventListener('click', async (e) => {
    const gr = st.ground;
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / cv.clientWidth;
    const ts = Math.floor(Math.min(cv.width / gr.w, cv.height / gr.h));
    const ox = Math.floor((cv.width - ts * gr.w) / 2), oy = Math.floor((cv.height - ts * gr.h) / 2);
    const x = Math.floor(((e.clientX - r.left) * dpr - ox) / ts), y = Math.floor(((e.clientY - r.top) * dpr - oy) / ts);
    if (x < 0 || y < 0 || x >= gr.w || y >= gr.h) return;
    await io.act('sea/walk', { x, y });
  });
  /** @type {HTMLElement} */ (el.querySelector('[data-embark]')).addEventListener('click', () => io.act('sea/embark', {}));
  function close() {
    alive = false;
    el.classList.remove('shown');
    setTimeout(() => el.remove(), 350);
    done();
  }
  drawSpot();
  return {
    /** @param {any} s @param {any} r */
    update(s, r) {
      st = s;
      if (r?.path) path = r.path.slice(1);
      else if (!path.length) pos = { x: s.captain.ix ?? pos.x, y: s.captain.iy ?? pos.y };
      drawSpot();
    },
    close,
  };
}
