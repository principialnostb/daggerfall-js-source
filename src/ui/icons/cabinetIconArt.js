// @ts-check
// THE COURIER'S CABINET'S PROFILE ICONS (net/discordShopLaw.js SEAL_WARES): a sealed letter with its quill, and a compass
// rose over the Eltheric swell - objects, never a figure, drawn in code as every icon is (ui/profileIcons.js ICON_ART).
// Bought with Seals in Discord; the game draws them as it draws the shop's.
import { starPath, glintPath, pulse, sway, mote } from './iconKit.js';

const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;
/** A closed outline through `pts`. */
const outline = (/** @type {number[][]} */ pts) => `M${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' L')} Z`;
/** A wax seal's edge about (cx, cy): `lobes` blobs of wax round a disc `r` across. */
const sealEdge = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ r, lobes = 10) =>
  outline(
    Array.from({ length: lobes * 6 }, (_, i) => {
      const a = (i / (lobes * 6)) * Math.PI * 2;
      const k = r * (0.9 + 0.1 * Math.pow(0.5 + 0.5 * Math.cos(lobes * a), 1.5));
      return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
    }),
  );
/** A feather's vane along the line from `a` to `b`, `w` its widest half, fuller on its left. */
function vane(/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ w) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const at = (/** @type {number} */ t, /** @type {number} */ s) => [a[0] + ux * t * len - uy * s, a[1] + uy * t * len + ux * s];
  const n = 18, left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, bulge = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.7) * (1 - 0.3 * t);
    left.push(at(t, -w * bulge));
    right.unshift(at(t, w * 0.7 * bulge));
  }
  return outline([...left, ...right]);
}

/** A feather's barbs: `n` short strokes off the line from `a` to `b`, swept back toward `a`, `w` long. */
function barbs(/** @type {number[]} */ a, /** @type {number[]} */ b, /** @type {number} */ w, n = 4) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  return Array.from({ length: n }, (_, i) => {
    const t = 0.35 + (0.5 * i) / (n - 1), x = a[0] + dx * t, y = a[1] + dy * t, k = w * (1 - 0.35 * t);
    return `M${r2(x)} ${r2(y)} L${r2(x + uy * k - ux * k * 0.8)} ${r2(y - ux * k - uy * k * 0.8)} M${r2(x)} ${r2(y)} L${r2(x - uy * k * 0.7 - ux * k * 0.6)} ${r2(y + ux * k * 0.7 - uy * k * 0.6)}`;
  }).join(' ');
}

// THE COURIER: the quill's line, nib to tip, laid across the letter's right clear of the seal
const NIB = [29.4, 58], QUILL_TIP = [58.6, 10.4], VANE_FOOT = [36.6, 46.4];

export const CABINET_ICON_ART = Object.freeze({
  courier: Object.freeze({
    // a letter sealed in red wax under the sea-glass light, its quill laid across it; the light breathes and the wax glints
    field: ['#2a5258', '#071417'],
    bezel: 'silver',
    defs: {
      glass: ['radialGradient', { cx: '50%', cy: '50%', r: '50%' }, [[0, '#6fd3c7', 0.5], [0.6, '#1f6f78', 0.25], [1, '#1f6f78', 0]]],
      parchment: ['linearGradient', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#fff6dc'], [0.45, '#efd9a8'], [1, '#b48f58']]],
      flap: ['linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#f6e4ba'], [1, '#c9a46a']]],
      sealWax: ['radialGradient', { cx: '38%', cy: '34%', r: '70%' }, [[0, '#e8744a'], [0.42, '#a8281e'], [1, '#4a0e0a']]],
      plume: ['linearGradient', { x1: 0, y1: 1, x2: 1, y2: 0 }, [[0, '#9fb4bc'], [0.5, '#e9eeff'], [1, '#ffffff']]],
      nib: ['linearGradient', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#f3d78a'], [1, '#5c3d12']]],
    },
    shapes: [
      ['circle', { cx: 32, cy: 34, r: 26, fill: 'url(#glass)' }, [pulse('opacity', '0.75;1;0.75', 4.8)]],
      ['g', { transform: 'rotate(-8 32 37)' }, [
        ['rect', { x: 10.6, y: 23, width: 42.8, height: 28.4, rx: 1.6, fill: 'url(#parchment)', stroke: '#5a3c18', 'stroke-width': 1.1 }],
        ['path', { d: 'M11.4 50.6 L27.6 37.6 M52.6 50.6 L36.4 37.6', stroke: '#9c7a46', 'stroke-width': 0.8, opacity: 0.85, fill: 'none' }],
        ['path', { d: 'M11.2 23.6 L32 39.6 L52.8 23.6 Z', fill: 'url(#flap)', stroke: '#5a3c18', 'stroke-width': 1, 'stroke-linejoin': 'round' }],
        ['path', { d: 'M13.4 24.6 L32 38.4', stroke: '#fffaf0', 'stroke-width': 0.7, opacity: 0.6, fill: 'none' }],
        ['path', { d: sealEdge(32, 39.4, 6.4), fill: 'url(#sealWax)', stroke: '#300806', 'stroke-width': 0.7, 'stroke-linejoin': 'round' }],
        ['circle', { cx: 32, cy: 39.4, r: 4, fill: 'none', stroke: '#5a120e', 'stroke-width': 0.8 }],
        ['path', { d: vane([29.6, 41.8], [34.6, 36.6], 1.5), fill: '#e8744a', opacity: 0.9 }],
        ['path', { d: 'M28.8 42.6 L34.2 37', stroke: '#5a120e', 'stroke-width': 0.4, fill: 'none' }],
        ['path', { d: 'M27.8 36.4 Q29.6 34 32.6 33.6', stroke: '#ffd2b8', 'stroke-width': 0.8, fill: 'none', 'stroke-linecap': 'round', opacity: 0.7 }],
      ]],
      ['g', {}, [
        ['path', { d: vane(VANE_FOOT, QUILL_TIP, 5.2), fill: 'url(#plume)', stroke: '#3e5258', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }],
        ['path', { d: `M${NIB[0]} ${NIB[1]} L${QUILL_TIP[0]} ${QUILL_TIP[1]}`, stroke: '#e8e0cc', 'stroke-width': 1.2, fill: 'none', 'stroke-linecap': 'round' }],
        ['path', { d: barbs(VANE_FOOT, QUILL_TIP, 3.4), stroke: '#9fb4bc', 'stroke-width': 0.6, fill: 'none', opacity: 0.8 }],
        ['path', { d: 'M29.4 58 L28.2 61.2 L31.6 59.2 Z M30 56.8 L33 52', fill: 'url(#nib)', stroke: '#3a2408', 'stroke-width': 0.8, 'stroke-linejoin': 'round' }],
        sway('rotate', '0 29.4 58;-2.4 29.4 58;0 29.4 58', 5.6),
      ]],
      ['path', { d: glintPath(28.2, 36.2, 2.6), fill: '#fff4ec' }, [pulse('opacity', '0;1;0', 2.8, 0.6)]],
      mote(16, 20, 0.7, '#e8fff8', 10, 4.2, 0),
      mote(48, 46, 0.6, '#6fd3c7', 9, 3.6, 1.6, -2),
      mote(12, 40, 0.5, '#e8fff8', 8, 4.8, 2.6, 1),
    ],
  }),
  tidecompass: Object.freeze({
    // a compass rose of brass and pearl over the Eltheric swell, its needle swinging; the sea rolls and its foam rises
    field: ['#1f6f78', '#041418'],
    bezel: 'brass',
    defs: {
      swell: ['linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#2aa198'], [0.5, '#145a60'], [1, '#04161a']]],
      swellFar: ['linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#6fd3c7'], [1, '#1f6f78']]],
      roseGold: ['linearGradient', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#fffbe6'], [0.45, '#f3d78a'], [1, '#a8751b']]],
      roseDeep: ['linearGradient', { x1: 0, y1: 0, x2: 1, y2: 1 }, [[0, '#c9963a'], [1, '#5c3d12']]],
      card: ['radialGradient', { cx: '50%', cy: '45%', r: '55%' }, [[0, '#f2fbff', 0.22], [0.7, '#6fd3c7', 0.12], [1, '#041418', 0.55]]],
    },
    shapes: [
      ...[[9, 12, 0.6], [53, 10, 0.5], [57, 22, 0.4], [6, 25, 0.4]].map(([x, y, r], i) => ['circle', { cx: x, cy: y, r, fill: '#e8fff8' }, i % 2 ? [pulse('opacity', '1;0.3;1', 2.6 + i * 0.4)] : []]),
      ['path', { d: 'M-6 44 Q4 39 14 44 T34 44 T54 44 T74 44 L74 64 L-6 64 Z', fill: 'url(#swellFar)', opacity: 0.75 }, [sway('translate', '0 0;-10 0;0 0', 7)]],
      ['circle', { cx: 32, cy: 29, r: 18.4, fill: 'url(#card)', stroke: 'url(#brass)', 'stroke-width': 1.8 }],
      ['circle', { cx: 32, cy: 29, r: 16, fill: 'none', stroke: '#f3d78a', 'stroke-width': 1.6, 'stroke-dasharray': '0.45 2.69', opacity: 0.85 }],
      ['circle', { cx: 32, cy: 29, r: 13.2, fill: 'none', stroke: '#2a1806', 'stroke-width': 0.5, opacity: 0.7 }],
      ['path', { d: starPath(32, 29, 10.4, 2.4, 4, -Math.PI / 4), fill: 'url(#roseDeep)', stroke: '#2a1806', 'stroke-width': 0.6, 'stroke-linejoin': 'round' }],
      ['path', { d: starPath(32, 29, 16.6, 3.4, 4), fill: 'url(#roseGold)', stroke: '#2a1806', 'stroke-width': 0.7, 'stroke-linejoin': 'round' }],
      ['path', { d: 'M32 12.4 L32 29 L34.4 26.6 Z M48.6 29 L32 29 L34.4 31.4 Z M32 45.6 L32 29 L29.6 31.4 Z M15.4 29 L32 29 L29.6 26.6 Z', fill: '#7a5420', opacity: 0.75 }],
      ['g', {}, [
        ['path', { d: 'M32 15.6 L34 29 L30 29 Z', fill: '#c0392b', stroke: '#3a0806', 'stroke-width': 0.5, 'stroke-linejoin': 'round' }],
        ['path', { d: 'M32 42.4 L34 29 L30 29 Z', fill: '#f2fbff', stroke: '#2a3a3e', 'stroke-width': 0.5, 'stroke-linejoin': 'round' }],
        sway('rotate', '-9 32 29;7 32 29;-9 32 29', 6.4, 0, { calcMode: 'spline', keyTimes: '0;0.5;1', keySplines: '0.45 0 0.55 1;0.45 0 0.55 1' }),
      ]],
      ['circle', { cx: 32, cy: 29, r: 2.2, fill: 'url(#roseGold)', stroke: '#2a1806', 'stroke-width': 0.6 }],
      ['path', { d: 'M21.4 19.6 Q26 15.4 32 14.8', stroke: '#ffffff', 'stroke-width': 1, fill: 'none', 'stroke-linecap': 'round', opacity: 0.45 }],
      ['path', { d: 'M-8 50 Q2 45 12 50 T32 50 T52 50 T72 50 L72 64 L-8 64 Z', fill: 'url(#swell)' }, [sway('translate', '0 0;8 0;0 0', 5.4)]],
      ['path', { d: 'M-8 50 Q2 45 12 50 T32 50 T52 50 T72 50', stroke: '#e8fff8', 'stroke-width': 1.1, fill: 'none', opacity: 0.85 }, [sway('translate', '0 0;8 0;0 0', 5.4)]],
      ['path', { d: 'M-4 57 Q6 53 16 57 T36 57 T56 57 T76 57 L76 64 L-4 64 Z', fill: '#0a3a40', opacity: 0.9 }, [sway('translate', '0 0;-8 0;0 0', 4.6)]],
      ['path', { d: 'M-4 57 Q6 53 16 57 T36 57 T56 57 T76 57', stroke: '#6fd3c7', 'stroke-width': 0.9, fill: 'none', opacity: 0.8 }, [sway('translate', '0 0;-8 0;0 0', 4.6)]],
      mote(18, 50, 0.7, '#e8fff8', 9, 3.4, 0, -1),
      mote(44, 49, 0.6, '#e8fff8', 8, 3.8, 1.4, 1.5),
      mote(30, 52, 0.5, '#e8fff8', 7, 4.2, 2.4),
    ],
  }),
});
