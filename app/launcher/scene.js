// The launcher's backdrop: a night over a castle, drawn in pixels by this file. It is no picture of the original
// game's art, which belongs to the player's own copy and never ships. One seed draws the same night on every start.
// The castle's lights, the clouds, the water, the mist and the fireflies move, and the layers shift a little with the
// pointer. It holds still for a player who asks for less motion, while the window is hidden, and once the game starts.
// Every colour is one the Enhanced skin already uses, as the stylesheet's are.
'use strict';

(() => {
  const canvas = document.getElementById('scene');
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return;

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const P = Object.fromEntries(Object.entries({
    sky0: '#050608', sky1: '#08070c', sky2: '#0b0e12', sky3: '#10141a', sky4: '#141922', sky5: '#1b2029', sky6: '#232a33', sky7: '#2b323b',
    starDim: '#4a4740', starLow: '#6a6353', starMid: '#9c937d', starHigh: '#c8c2b4', starTop: '#e9e4d9', streak: '#fff4e0',
    redDeep: '#7a1410', redDark: '#8a2820', redMid: '#b4553f', redLit: '#d98074', redTop: '#f2a597',
    paleDark: '#6a6353', paleMid: '#9c937d', paleLit: '#c8c2b4', paleTop: '#e9e4d9',
    cloudTop: '#39424e', cloud: '#232a33', cloudLow: '#1b2029',
    ridgeFar: '#1b2029', ridgeLit: '#232a33', snow: '#39424e', snowDim: '#2f3742', ridgeNear: '#141922',
    hill: '#10141a', crag: '#0d1014', rim: '#1b2029', castle: '#0b0e12', castleRim: '#232a33',
    pane: '#f2c46b', paneHot: '#ffd98a', paneLow: '#e0a43a', gate: '#7a5424', ember: '#c08a3e',
    flag: '#b91309', flagLow: '#7a1410',
    lakeTop: '#1b2029', lake: '#141922', lakeDeep: '#10141a', lakeLow: '#0b0e12', reflect: '#08070c', sheen: '#232a33', mist: '#3a424d',
    shore: '#050608', treeBack: '#08070c',
    fly: '#ffd98a', flyLow: '#f2c46b',
  }).map(([k, v]) => [k, { hex: v, rgb: hex(v) }]));

  /** Mulberry32: the night's own dice, the same on every start. */
  const dice = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Smooth 1D noise in 0..1, summed over octaves. */
  const noise1 = (rand, n = 512) => {
    const v = Array.from({ length: n }, rand);
    const at = (x) => { const i = Math.floor(x), f = x - i, a = v[((i % n) + n) % n], b = v[(((i + 1) % n) + n) % n]; return a + (b - a) * f * f * (3 - 2 * f); };
    return (x, oct = 3) => { let s = 0, amp = 1, norm = 0, fr = 1; for (let o = 0; o < oct; o++) { s += at(x * fr) * amp; norm += amp; amp /= 2; fr *= 2; } return s / norm; };
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** An offscreen layer drawn pixel by pixel. */
  function layer(w, h) {
    // a window shrunk to nothing still draws: a layer is never less than a pixel
    w = Math.max(1, w);
    h = Math.max(1, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    return {
      c, w, h,
      set(x, y, col, a = 255) {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = (y * w + x) * 4;
        d[i] = col.rgb[0]; d[i + 1] = col.rgb[1]; d[i + 2] = col.rgb[2]; d[i + 3] = a;
      },
      filled: (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0,
      done() { g.putImageData(img, 0, 0); return c; },
    };
  }

  // Depths: how far each layer moves with the pointer, in scene pixels; M is the margin each layer is drawn past the edge.
  const DEPTH = { moons: 1, clouds: 1, far: 2, near: 3, castle: 4, mist: 5, trees: 8 };
  const M = 10;
  let S = 3, W = 0, H = 0, world = null;

  /** The castle, built from its parts around its base's centre (0, 0), y up being negative. */
  function castleParts() {
    const solid = new Set();
    const put = (x, y) => solid.add(`${x},${y}`);
    const rect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y); };
    const cone = (cx, baseY, h, half) => { for (let i = 0; i < h; i++) { const hw = Math.round(half * (1 - i / h)); rect(Math.round(cx - hw), baseY - i, Math.round(cx + hw), baseY - i); } };
    const merlons = (x0, x1, y) => { for (let x = x0; x <= x1; x++) if ((x - x0) % 3 !== 2) rect(x, y - 2, x, y - 1); };
    rect(-6, -30, 5, 0);               // the keep
    cone(-0.5, -31, 15, 7);            // its spire
    rect(0, -50, 0, -45);              // the flagpole
    rect(-22, -22, -15, 0);            // the west tower
    cone(-18.5, -23, 11, 5);
    rect(14, -18, 21, 0);              // the east tower
    merlons(14, 21, -18);
    rect(6, -27, 8, -12);              // the keep's turret
    cone(7, -28, 6, 2);
    rect(-14, -12, -7, 0);             // the curtain walls
    merlons(-14, -7, -12);
    rect(9, -10, 13, 0);
    merlons(9, 13, -10);
    const panes = [[-3, -25], [-3, -24], [2, -25], [2, -24], [-1, -17], [0, -17], [-1, -16], [0, -16], [-19, -17], [-19, -16], [-18, -9], [17, -13], [18, -13], [7, -21], [-11, -6], [11, -5]];
    const gate = [[-2, -4], [-1, -5], [0, -5], [1, -4], [-2, -3], [-1, -3], [0, -3], [1, -3], [-2, -2], [-1, -2], [0, -2], [1, -2], [-2, -1], [-1, -1], [0, -1], [1, -1]];
    return { solid, panes, gate, flagTop: [1, -50] };
  }

  function build() {
    const dpr = window.devicePixelRatio || 1;
    S = Math.max(2, Math.round(3 * dpr));
    W = Math.max(1, Math.ceil((window.innerWidth * dpr) / S));
    H = Math.max(1, Math.ceil((window.innerHeight * dpr) / S));
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${(W * S) / dpr}px`;
    canvas.style.height = `${(H * S) / dpr}px`;

    const rand = dice(1996);
    const hy = Math.round(H * 0.56);               // the horizon
    const lakeEnd = Math.round(H * 0.8);
    const LW = W + 2 * M, LH = H + 2 * M;
    const cx = M + Math.round(W * 0.5);            // the castle stands between the headline and the notes
    const yct = Math.round(H * 0.43);               // the crag's top
    const masser = { x: M + Math.round(W * 0.5) + 3, y: M + Math.round(H * 0.27), r: Math.round(H * 0.11) };
    const secunda = { x: M + Math.round(W * 0.36), y: M + Math.round(H * 0.115), r: Math.max(5, Math.round(H * 0.032)) };

    // The sky, in dithered bands from the zenith to the horizon
    const SKY = ['sky0', 'sky1', 'sky2', 'sky3', 'sky4', 'sky5', 'sky6', 'sky7'].map((k) => P[k]);
    const sky = layer(W, H);
    for (let y = 0; y < H; y++) {
      const t = clamp(y / hy, 0, 1) ** 1.15 * (SKY.length - 1);
      const i = Math.min(SKY.length - 2, Math.floor(t)), f = t - i;
      for (let x = 0; x < W; x++) sky.set(x, y, f > bayer(x, y) ? SKY[i + 1] : SKY[i]);
    }

    // The stars, thicker towards the zenith
    const stars = [];
    for (let n = Math.round((W * hy) / 200), k = 0; k < n; k++) {
      const y = 2 + Math.floor((hy - 2) * rand() ** 1.25), x = Math.floor(rand() * W), r = rand();
      const tone = r < 0.03 ? 4 : r < 0.12 ? 3 : r < 0.35 ? 2 : r < 0.7 ? 1 : 0;
      stars.push({ x, y, tone, cross: tone === 4 && y < hy * 0.7, ph: rand() * 6.3, sp: 0.6 + rand() * 1.8 });
    }

    // The two moons: red Masser behind the castle, pale Secunda above, each with a dithered halo
    const moons = layer(LW, LH);
    const disc = (m, tones, light, craters, haloCol, haloR) => {
      const [lx, ly, lz] = light;
      for (let dy = -m.r - haloR; dy <= m.r + haloR; dy++) {
        for (let dx = -m.r - haloR; dx <= m.r + haloR; dx++) {
          const d = Math.hypot(dx, dy);
          const x = m.x + dx, y = m.y + dy;
          if (d > m.r - 0.5) {
            const k = (d - m.r) / haloR;
            if (k < 1 && bayer(x, y) < (1 - k) ** 2 * 0.9) moons.set(x, y, haloCol, k < 0.35 ? 46 : 26);
            continue;
          }
          const nx = dx / m.r, ny = dy / m.r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
          let lam = Math.max(0, nx * lx + ny * ly + nz * lz);
          for (const c of craters) if (Math.hypot(nx - c[0], ny - c[1]) < c[2]) lam *= 0.72;
          const q = clamp(lam ** 1.1 * (tones.length - 1.2) + (bayer(x, y) - 0.5) * 0.8, 0, tones.length - 1);
          moons.set(x, y, tones[Math.round(q)]);
        }
      }
    };
    disc(masser, [P.redDeep, P.redDark, P.redMid, P.redLit, P.redTop], [0.62, -0.42, 0.66],
      [[0.3, -0.2, 0.24], [-0.15, 0.35, 0.18], [0.45, 0.42, 0.13], [-0.45, -0.3, 0.14], [0.05, -0.55, 0.1], [0.62, 0.05, 0.09], [-0.1, 0.05, 0.08]], P.redLit, 11);
    disc(secunda, [P.paleDark, P.paleMid, P.paleLit, P.paleTop], [0.75, -0.35, 0.45], [[0.2, 0.25, 0.2]], P.paleTop, 5);

    // Clouds: long thin strips, lit on their tops, that drift across the moons
    const clouds = [0.09, 0.2, 0.26, 0.34].map((fy, k) => {
      const len = Math.max(4, Math.round(W * (0.16 + rand() * 0.14))), th = 3 + Math.round(rand() * 3);
      const c = layer(len, th + 2);
      const n = noise1(rand);
      for (let x = 0; x < len; x++) {
        const prof = Math.sin((Math.PI * x) / len) ** 0.7 * (0.55 + 0.45 * n(x / 9));
        const t = Math.max(0, Math.round(th * prof));
        const top = Math.round((th - t) / 2 + (n(x / 5 + 40) - 0.5) * 2);
        for (let i = 0; i < t; i++) c.set(x, top + i + 1, i === 0 ? P.cloudTop : i === t - 1 ? P.cloudLow : P.cloud, i === 0 ? 170 : 215);
      }
      return { c: c.done(), y: Math.round(H * fy), x0: rand() * (W + len), sp: 0.9 + rand() * 1.6 + k * 0.2, len };
    });

    // The far range, high at the edges and low behind the castle, moonlit on the faces towards it; then the near range
    const edge = (x) => clamp(Math.abs((x - M) / W - 0.5) / 0.5, 0, 1);
    const far = layer(LW, LH);
    const nf = noise1(rand);
    const farTop = [];
    for (let x = 0; x < LW; x++) farTop[x] = Math.round(hy + M - H * (0.045 + 0.14 * edge(x) ** 1.3) - nf(x / 14, 4) * H * 0.07);
    for (let x = 0; x < LW; x++) {
      // a face is lit when it falls away from the moon's side: the light comes over the ridge towards the viewer
      const top = farTop[x], lit = (x < masser.x ? (farTop[x + 1] ?? top) > top : (farTop[x - 1] ?? top) > top) ? 3 : 0;
      for (let y = top; y < hy + M + 3; y++) {
        const depth = y - top;
        const peak = top < hy + M - H * 0.15;
        far.set(x, y, peak && depth < 2 ? (depth === 0 || bayer(x, y) < 0.5 ? P.snow : P.snowDim) : depth < lit ? P.ridgeLit : P.ridgeFar);
      }
    }
    const near = layer(LW, LH);
    const nn = noise1(rand);
    for (let x = 0; x < LW; x++) {
      const top = Math.round(hy + M - H * (0.02 + 0.075 * edge(x) ** 1.6) - nn(x / 9, 3) * H * 0.04);
      for (let y = top; y < hy + M + 3; y++) near.set(x, y, y === top ? P.ridgeFar : P.ridgeNear);
    }

    // The hills, the crag and the castle on it, rimmed where they meet the sky
    const hold = layer(LW, LH);
    const nh = noise1(rand), nl = noise1(rand), nr = noise1(rand);
    for (let x = 0; x < LW; x++) {
      const top = Math.round(hy + M - H * 0.012 - nh(x / 11, 3) * H * 0.025);
      for (let y = top; y < hy + M + 3; y++) hold.set(x, y, P.hill);
    }
    for (let y = yct + M; y < hy + M + 3; y++) {
      const k = clamp((y - yct - M) / (hy - yct), 0, 1) ** 0.75;
      const l = Math.round(26 + 40 * k + (nl(y / 3) - 0.5) * 7), r = Math.round(24 + 42 * k + (nr(y / 3) - 0.5) * 7);
      for (let x = cx - l; x <= cx + r; x++) hold.set(x, y, P.crag);
    }
    const castle = castleParts();
    for (const key of castle.solid) { const [x, y] = key.split(',').map(Number); hold.set(cx + x, yct + M + y, P.castle); }
    const rimmed = [];
    for (let y = 1; y < LH; y++) for (let x = 1; x < LW - 1; x++) {
      if (hold.filled(x, y) && !hold.filled(x, y - 1) && !far.filled(x, y - 1) && !near.filled(x, y - 1)) rimmed.push([x, y]);
    }
    for (const [x, y] of rimmed) hold.set(x, y, y < yct + M + 2 ? P.castleRim : P.rim);
    // the path up the crag, lit by torches
    const torches = [0.92, 0.74, 0.56, 0.38, 0.2].map((f, k) => [cx + (k % 2 ? 9 : -13) + Math.round((rand() - 0.5) * 6), Math.round(yct + M + (hy - yct) * f)]);

    // The castle's reflection in the lake: its silhouette, mirrored at the waterline
    const reflH = hy - (yct - 52);
    const refl = layer(LW, reflH);
    for (let r = 0; r < reflH; r++) for (let x = 0; x < LW; x++) if (hold.filled(x, hy + M - 1 - r)) refl.set(x, r, r < 2 || bayer(x, r) > 0.2 ? P.lakeLow : P.reflect, 230);

    // The lake: brightest at the waterline
    const lake = layer(LW, LH);
    for (let y = hy + M; y < LH; y++) {
      const t = clamp((y - hy - M) / (lakeEnd - hy), 0, 1);
      for (let x = 0; x < LW; x++) lake.set(x, y, t < 0.25 ? (t / 0.25 > bayer(x, y) ? P.lake : P.lakeTop) : t < 0.7 ? P.lake : (t - 0.7) / 0.3 > bayer(x, y) ? P.lakeDeep : P.lake);
    }

    // The near shore and its pines, thick at the edges and thin where the lake shows
    const TM = M + DEPTH.trees;
    const trees = layer(W + 2 * TM, H + 2 * TM);
    const ns = noise1(rand);
    const shore = Math.round(H * 0.79) + TM;
    // a pine: three or four stacked tiers, each wider than the one above it, on a short trunk
    const pine = (x0, base, h, col) => {
      const tiers = h > 24 ? 4 : 3, top = base - h, crown = h - 2;
      for (let j = 0; j < tiers; j++) {
        const y0 = top + Math.round((j * crown) / (tiers + 1)), y1 = top + Math.round(((j + 2) * crown) / (tiers + 1));
        const wide = Math.max(1, Math.round(h * (0.12 + 0.08 * j)));
        for (let y = y0; y <= y1; y++) {
          const hw = Math.round(((y - y0 + 1) / (y1 - y0 + 1)) * wide);
          for (let x = x0 - hw; x <= x0 + hw; x++) trees.set(x, y, col);
        }
      }
      for (let y = base - 2; y <= base + 1; y++) trees.set(x0, y, col);
    };
    for (let k = 0; k < W * 0.45; k++) {
      const fx = rand(), mid = Math.abs(fx - 0.5) < 0.17;
      if (mid && rand() < 0.8) continue;
      pine(TM + Math.round(fx * W), shore - 2 - Math.round(rand() * 3), Math.round((mid ? 5 : 9) + rand() * (mid ? 5 : 14) + edge(TM + fx * W - DEPTH.trees) * 10), P.treeBack);
    }
    for (let x = 0; x < trees.w; x++) {
      const top = shore + Math.round((ns(x / 7) - 0.5) * 4);
      for (let y = top; y < trees.h; y++) trees.set(x, y, P.shore);
    }
    for (let k = 0; k < W * 0.16; k++) {
      const fx = rand(), mid = Math.abs(fx - 0.5) < 0.2;
      if (mid) continue;
      const e = clamp((Math.abs(fx - 0.5) - 0.2) / 0.3, 0, 1);
      pine(TM + Math.round(fx * W), shore + 3 + Math.round(rand() * 12), Math.round(18 + e * 36 + rand() * 16), P.shore);
    }

    // Mist: a soft dithered band, drawn twice at two depths
    const mist = layer(256, 14);
    const nm = noise1(rand);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 256; x++) {
      const a = Math.sin((Math.PI * (y + 0.5)) / 14) * nm(x / 18 + y * 0.31, 3);
      if (a > 0.32 + bayer(x, y) * 0.3) mist.set(x, y, P.mist, a > 0.62 ? 72 : 40);
    }

    // The fireflies over the shore
    const flies = Array.from({ length: 16 }, () => ({ x: rand() * W, y: H * (0.6 + rand() * 0.34), ph: rand() * 6.3, sp: 0.6 + rand() * 0.8 }));

    world = {
      hy, lakeEnd, cx, yct, masser, sky: sky.done(), stars, moons: moons.done(), clouds, far: far.done(), near: near.done(),
      hold: hold.done(), castle, torches, refl: refl.done(), reflH, lake: lake.done(), trees: trees.done(), TM, mist: mist.done(), flies,
    };
  }

  // The pointer, eased: where it is over the window, -1..1 each way
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => { look.tx = (e.clientX / window.innerWidth) * 2 - 1; look.ty = (e.clientY / window.innerHeight) * 2 - 1; });
  document.addEventListener('pointerleave', () => { look.tx = 0; look.ty = 0; });

  let streak = null, nextStreak = 6;
  const dot = (x, y, col, a = 1) => { ctx.globalAlpha = a; ctx.fillStyle = col.hex; ctx.fillRect(x, y, 1, 1); };

  function frame(t, dt) {
    const w = world;
    look.x += (look.tx - look.x) * Math.min(1, dt * 2.5);
    look.y += (look.ty - look.y) * Math.min(1, dt * 2.5);
    const off = (depth) => [Math.round(-look.x * depth) - M, Math.round(-look.y * depth * 0.5) - M];
    const draw = (img, depth) => { const [ox, oy] = off(depth); ctx.drawImage(img, ox, oy); return [ox, oy]; };
    ctx.globalAlpha = 1;
    ctx.drawImage(w.sky, 0, 0);

    const TONES = [P.starDim, P.starLow, P.starMid, P.starHigh, P.starTop];
    for (const s of w.stars) {
      const tw = Math.sin(t * s.sp + s.ph);
      const tone = TONES[Math.max(0, s.tone - (tw < -0.55 ? 1 : 0) - (tw < -0.9 ? 1 : 0))];
      dot(s.x, s.y, tone);
      if (s.cross && tw > -0.3) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(s.x + dx, s.y + dy, P.starMid, 0.7);
    }
    if (!streak && t > nextStreak) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      streak = { x: W * (0.15 + Math.random() * 0.7), y: H * (0.03 + Math.random() * 0.15), vx: dir * (55 + Math.random() * 35), vy: 22 + Math.random() * 14, born: t, life: 0.55 + Math.random() * 0.35 };
      nextStreak = t + 9 + Math.random() * 10;
    }
    if (streak) {
      const age = t - streak.born;
      if (age > streak.life) streak = null;
      else {
        const trail = [P.streak, P.starTop, P.starHigh, P.starMid, P.starLow, P.starDim];
        trail.forEach((col, i) => dot(Math.round(streak.x + streak.vx * (age - i * 0.018)), Math.round(streak.y + streak.vy * (age - i * 0.018)), col, 1 - age / streak.life / 2));
      }
    }

    draw(w.moons, DEPTH.moons);
    const [cox, coy] = off(DEPTH.clouds);
    ctx.globalAlpha = 1;
    for (const c of w.clouds) {
      const span = W + c.len + 2 * M;
      ctx.drawImage(c.c, Math.round(((c.x0 + t * c.sp) % span) - c.len - M + cox + M), c.y + coy + M);
    }
    draw(w.far, DEPTH.far);
    draw(w.near, DEPTH.near);

    // the lake, the moon's road on it, the castle's reflection broken by ripples
    const [lx, ly] = off(DEPTH.castle);
    ctx.drawImage(w.lake, lx, ly);
    const lakeH = w.lakeEnd - w.hy;
    for (let r = 2; r < lakeH; r += 2) {
      const k = r / lakeH;
      const half = Math.max(0, Math.round((1.5 + k * 9) * (0.55 + 0.45 * Math.sin(t * 1.6 + r * 0.9))));
      ctx.globalAlpha = 0.85 - k * 0.55;
      ctx.fillStyle = (r & 2 ? P.redMid : P.redLit).hex;
      ctx.fillRect(w.masser.x + lx - half, w.hy + M + ly + r, half * 2 + 1, 1);
    }
    for (let r = 0; r < w.reflH && r < lakeH; r++) {
      const dx = r % 2 ? Math.round(Math.sin(t * 2.1 + r * 0.7) * (1 + r / 40)) : 0;
      ctx.globalAlpha = 1 - (r / lakeH) * 0.6;
      ctx.drawImage(w.refl, 0, r, w.refl.width, 1, lx + dx, w.hy + M + ly + r, w.refl.width, 1);
    }
    for (let r = 4; r < lakeH; r += 5) {
      const x = Math.round(((r * 37 + t * (4 + (r % 3))) % (W + 40)) - 20);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = P.sheen.hex;
      ctx.fillRect(x + lx + M, w.hy + M + ly + r, 6 + (r % 7), 1);
    }

    ctx.globalAlpha = 1;
    ctx.drawImage(w.hold, lx, ly);
    // the castle's windows, gate and torches, and its flag
    const bx = w.cx + lx, by = w.yct + M + ly;
    w.castle.panes.forEach(([x, y], i) => {
      const on = Math.sin(t * 0.13 + i * 2.7) > -0.82;
      if (!on) return;
      const f = Math.sin(t * (3 + (i % 4)) + i) * Math.sin(t * 1.3 + i * 0.5);
      dot(bx + x, by + y, f > 0.55 ? P.paneHot : f < -0.6 ? P.paneLow : P.pane, 0.95);
      if (i % 3 === 0) dot(bx + x, w.hy + M + ly + (w.hy - w.yct) - y + 1, P.paneLow, 0.35);
    });
    for (const [x, y] of w.castle.gate) dot(bx + x, by + y, y === -5 || x === -2 || x === 1 ? P.gate : P.paneLow, 0.75 + 0.2 * Math.sin(t * 4 + x));
    w.torches.forEach(([x, y], i) => {
      const f = 0.7 + 0.3 * Math.sin(t * (7 + i) + i * 1.7);
      dot(x + lx, y + ly, f > 0.85 ? P.paneHot : P.paneLow, 1);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) dot(x + lx + dx, y + ly + dy, P.ember, 0.35 * f);
    });
    const [fx, fy] = w.castle.flagTop;
    const wave = Math.floor(t * 2.6) % 2;
    const FLAG = wave ? [[1, 0], [2, 0], [3, 0], [4, 0], [1, 1], [2, 1], [3, 1], [1, 2], [2, 2], [3, 2], [4, 2]] : [[1, 0], [2, 0], [3, 0], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2]];
    for (const [x, y] of FLAG) dot(bx + fx + x - 1, by + fy + y, y === 2 ? P.flagLow : P.flag, 1);

    // mist round the crag's foot and over the water, drifting both ways
    const [mx, my] = off(DEPTH.mist);
    for (const [y, speed, a] of [[w.hy - 7, 2.2, 0.9], [Math.round(H * 0.66), -3.4, 0.75]]) {
      ctx.globalAlpha = a;
      const s = ((t * speed) % 256 + 256) % 256;
      for (let x = -256 + s; x < W + 256; x += 256) ctx.drawImage(w.mist, Math.round(x + mx + M), y + my + M);
    }

    ctx.globalAlpha = 1;
    const tx = Math.round(-look.x * DEPTH.trees) - w.TM, ty = Math.round(-look.y * DEPTH.trees * 0.5) - w.TM;
    ctx.drawImage(w.trees, tx, ty);
    for (const f of w.flies) {
      const b = Math.sin(t * 1.3 * f.sp + f.ph);
      if (b < 0.15) continue;
      const x = Math.round(f.x + Math.sin(t * 0.31 * f.sp + f.ph) * 12 + tx + w.TM), y = Math.round(f.y + Math.sin(t * 0.47 * f.sp + f.ph * 2) * 6 + ty + w.TM);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(x + dx, y + dy, P.ember, 0.35 * b);
      dot(x, y, b > 0.6 ? P.fly : P.flyLow, 1);
    }
    ctx.globalAlpha = 1;
  }

  // The loop: about 30 frames a second, and none at all while there is nothing to see or the game is starting
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let raf = 0, last = 0, clock = 0;
  const stopped = () => document.hidden || document.body.hasAttribute('data-launching') || !!still?.matches;
  function tick(now) {
    raf = 0;
    if (stopped()) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    if (dt >= 1 / 31) {
      last = now;
      clock += dt;
      frame(clock, dt);
    }
    raf = requestAnimationFrame(tick);
  }
  const wake = () => { if (!raf && !stopped()) { last = performance.now(); raf = requestAnimationFrame(tick); } };
  const redraw = () => { build(); frame(clock, 1); wake(); };

  // the listeners first: a first draw that fails must not leave the scene deaf to the next resize
  document.addEventListener('visibilitychange', wake);
  still?.addEventListener?.('change', redraw);
  window.addEventListener('resize', redraw);
  const watchScale = () => window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`)?.addEventListener('change', () => { redraw(); watchScale(); }, { once: true });
  watchScale();
  new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ['data-launching'] });
  redraw();
})();
