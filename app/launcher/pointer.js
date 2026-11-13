// The launcher's pointer: the game's own gauntlet (launcher.css wears it), its finger drawn in while a button is held.
// Under it, a red glow trails embers as it moves and throws a ring of sparks at a click, drawn in pixels on a canvas of
// its own over the page, in the Enhanced skin's reds. It draws nothing while the pointer rests, and nothing at all for
// a player who asks for less motion, while the window is hidden, or once the game starts.
'use strict';

(() => {
  const root = document.documentElement;
  // the press frame, as the game's gauntlet wears it; set only when it changes, since the rule restyles every element
  const press = (on) => { if (root.classList.contains('press') !== on) root.classList.toggle('press', on); };
  window.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') press(true); }, { capture: true, passive: true });
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => press(false), { capture: true, passive: true });
  window.addEventListener('blur', () => press(false));

  const canvas = document.getElementById('trail');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;

  // hot to cold: an ember is white-gold for a moment, then red, then the dark red it fades out in
  const RAMP = ['#fff4e0', '#ffd98a', '#ff6a5a', '#e0473a', '#d8342c', '#b91309', '#8a2820', '#7a1410'];
  const GLOW = ['#d8342c', '#b91309', '#8a2820', '#7a1410'];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  const MAX_EMBERS = 220;

  // Effect pixels are two screen pixels wide: finer than the night's, so the trail reads as detail over it
  let S = 2, W = 0, H = 0;
  function size() {
    const dpr = window.devicePixelRatio || 1;
    S = Math.max(1, Math.round(2 * dpr));
    W = Math.ceil((window.innerWidth * dpr) / S);
    H = Math.ceil((window.innerHeight * dpr) / S);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${(W * S) / dpr}px`;
    canvas.style.height = `${(H * S) / dpr}px`;
  }

  const at = { x: -100, y: -100, inside: false, moved: 0 };
  let heat = 0;                 // 0..1: how hard the glow burns - it rises with speed and cools at rest
  const trail = [];             // the last positions, for the streak behind a fast stroke
  const embers = [];
  const rings = [];
  const toPx = (e) => { const dpr = window.devicePixelRatio || 1; return [(e.clientX * dpr) / S, (e.clientY * dpr) / S]; };

  function spark(x, y, vx, vy, life) {
    if (embers.length >= MAX_EMBERS) embers.shift();
    embers.push({ x, y, vx, vy, age: 0, life, big: Math.random() < 0.28 });
  }

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || stopped()) return;
    const [x, y] = toPx(e);
    const dx = x - at.x, dy = y - at.y, d = Math.hypot(dx, dy);
    if (at.inside && d > 0 && d < 80) {
      heat = Math.min(1, heat + d * 0.015);
      // embers along the stroke, thrown back from it in a plume and lifting as embers do
      const n = Math.min(10, Math.floor(d / 2.5 + Math.random() * 1.5));
      for (let i = 0; i < n; i++) {
        const f = Math.random(), side = (Math.random() - 0.5) * 3;
        spark(at.x + dx * f - dy / d * side, at.y + dy * f + dx / d * side, -dx * 0.8 + (Math.random() - 0.5) * 22, -dy * 0.8 + (Math.random() - 0.5) * 22 - 8, 0.4 + Math.random() * 0.6);
      }
    }
    at.x = x;
    at.y = y;
    at.inside = true;
    at.moved = performance.now();
    trail.push([x, y, at.moved]);
    wake();
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || stopped()) return;
    const [x, y] = toPx(e);
    heat = 1;
    rings.push({ x, y, age: 0, life: 0.45 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + Math.random() * 0.3, v = 35 + Math.random() * 60;
      spark(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.3 + Math.random() * 0.4);
    }
    wake();
  }, { passive: true });
  root.addEventListener('pointerleave', () => { at.inside = false; wake(); });

  const dot = (x, y, col, a) => { ctx.globalAlpha = a; ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };

  function draw(t, dt) {
    ctx.clearRect(0, 0, W, H);
    heat = Math.max(0, heat - dt * (at.inside ? 0.9 : 3));
    // the glow under the fingertip: a dithered disc, burning brighter and wider with the heat
    if (at.inside) {
      const r = (4 + heat * 9) * (1 + 0.08 * Math.sin(t * 7));
      const level = 0.3 + 0.7 * heat;
      const cx = Math.round(at.x), cy = Math.round(at.y);
      for (let y = -Math.ceil(r); y <= r; y++) {
        for (let x = -Math.ceil(r); x <= r; x++) {
          const k = Math.hypot(x, y) / r;
          if (k > 1 || bayer(cx + x, cy + y) > (1 - k) ** 1.3 * level) continue;
          dot(cx + x, cy + y, GLOW[Math.min(GLOW.length - 1, Math.floor(k * GLOW.length))], 0.85);
        }
      }
      // its heart: hot while the pointer moves, a red coal at rest
      const core = heat > 0.45 ? RAMP[1 + Math.floor((1 - heat) * 3)] : '#b91309';
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dot(cx + ox, cy + oy, core, 0.95);
    }
    // the streak: the stroke of the last moment, thinning as it ages
    const now = performance.now();
    while (trail.length && now - trail[0][2] > 140) trail.shift();
    for (let i = 1; i < trail.length; i++) {
      const [x0, y0] = trail[i - 1], [x1, y1] = trail[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      const k = i / trail.length, a = 0.25 + 0.6 * k, head = k > 0.6;
      for (let s = 0; s < steps; s++) {
        const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
        dot(x, y, head ? '#e0473a' : '#b8322b', a);
        if (head) dot(x + 1, y + 1, '#8a2820', a * 0.8);
      }
    }
    // the rings a click throws
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.age += dt;
      const f = g.age / g.life;
      if (f >= 1) { rings.splice(i, 1); continue; }
      const rad = 2 + f * 16, steps = Math.ceil(rad * 7);
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        dot(g.x + Math.cos(a) * rad, g.y + Math.sin(a) * rad, f < 0.3 ? '#ff6a5a' : f < 0.6 ? '#e0473a' : '#8a2820', 1 - f);
      }
    }
    // the embers: they slow, rise, flicker and cool
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.age += dt;
      const f = e.age / e.life;
      if (f >= 1) { embers.splice(i, 1); continue; }
      e.vx *= 1 - dt * 3.2;
      e.vy = e.vy * (1 - dt * 3.2) - dt * 26;
      e.x += e.vx * dt + Math.sin(t * 9 + i) * dt * 4;
      e.y += e.vy * dt;
      const col = RAMP[Math.min(RAMP.length - 1, Math.floor(f * RAMP.length))];
      const a = f < 0.7 ? 1 : (1 - f) / 0.3;
      dot(e.x, e.y, col, a);
      if (e.big && f < 0.5) { dot(e.x + 1, e.y, col, a); dot(e.x, e.y + 1, col, a); dot(e.x + 1, e.y + 1, RAMP[Math.min(RAMP.length - 1, Math.floor(f * RAMP.length) + 1)], a); }
      if (f < 0.3) for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(e.x + ox * (e.big ? 2 : 1), e.y + oy * (e.big ? 2 : 1), '#b91309', 0.5);
    }
    ctx.globalAlpha = 1;
  }

  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const stopped = () => document.hidden || document.body.hasAttribute('data-launching') || !!still?.matches;
  let raf = 0, last = 0;
  const busy = () => heat > 0.01 || embers.length || rings.length || trail.length > 1 || (at.inside && performance.now() - at.moved < 1200);
  // At most 60 frames a second, whatever the screen or the frame limit (VSync off lifts it). At rest the canvas is
  // taken off the page: its blend over the whole window costs a pass on every frame the page draws, empty or not.
  function tick(now) {
    raf = 0;
    if (stopped()) { ctx.clearRect(0, 0, W, H); embers.length = 0; rings.length = 0; trail.length = 0; canvas.hidden = true; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    if (dt >= 1 / 61) {
      last = now;
      draw(now / 1000, dt);
    }
    if (busy()) raf = requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, W, H); canvas.hidden = true; }
  }
  function wake() {
    if (!raf && !stopped()) { canvas.hidden = false; last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  // a move to a screen of another scale brings no resize: the scale is watched itself
  const watchScale = () => window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`)?.addEventListener('change', () => { size(); watchScale(); }, { once: true });
  size();
  canvas.hidden = true;
  window.addEventListener('resize', size);
  watchScale();
  document.addEventListener('visibilitychange', wake);
})();
