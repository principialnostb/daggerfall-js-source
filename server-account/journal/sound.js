// @ts-check
// The journal's few sounds, made rather than shipped: a leaf turning, a quill's scratch, a seal pressed, the sea's
// guns. Each is noise shaped by a filter and an envelope. Nothing sounds until the player has touched the book, and a
// muted book stays muted for the next opening.

/** @type {AudioContext | null} */
let ctx = null;
let muted = false;
try {
  muted = globalThis.localStorage?.getItem('journal-muted') === '1';
} catch {
  muted = false;
}

/** The sound's context, made at the first touch (browsers keep audio asleep until then). */
export function wake() {
  if (ctx || muted) return;
  try {
    const AC = /** @type {any} */ (globalThis).AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
    ctx = AC ? new AC() : null;
  } catch {
    ctx = null;
  }
}
export const isMuted = () => muted;
/** @param {boolean} m */
export function setMuted(m) {
  muted = m;
  try {
    globalThis.localStorage?.setItem('journal-muted', m ? '1' : '0');
  } catch {
    /* no storage: the choice lasts this opening */
  }
}

/** A burst of shaped noise. */
function burst({ dur = 0.3, freq = 1800, q = 0.8, gain = 0.18, attack = 0.01, type = /** @type {BiquadFilterType} */ ('bandpass'), sweep = 0 }) {
  if (!ctx || muted) return;
  const n = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  const t0 = ctx.currentTime;
  f.frequency.setValueAtTime(freq, t0);
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq + sweep), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
}

export const sounds = Object.freeze({
  leaf: () => {
    burst({ dur: 0.42, freq: 2400, q: 0.6, gain: 0.12, attack: 0.05, sweep: -1600 });
    setTimeout(() => burst({ dur: 0.12, freq: 900, q: 1.2, gain: 0.08, attack: 0.005 }), 300);
  },
  quill: () => {
    for (let i = 0; i < 4; i++) setTimeout(() => burst({ dur: 0.05, freq: 5200 + i * 300, q: 3, gain: 0.05, attack: 0.003 }), i * 55);
  },
  seal: () => burst({ dur: 0.25, freq: 180, q: 0.9, gain: 0.3, attack: 0.004, type: 'lowpass' }),
  cannon: () => {
    burst({ dur: 0.9, freq: 140, q: 0.7, gain: 0.45, attack: 0.004, type: 'lowpass', sweep: -90 });
    burst({ dur: 0.35, freq: 900, q: 0.5, gain: 0.12, attack: 0.002 });
  },
  splash: () => burst({ dur: 0.6, freq: 1200, q: 0.4, gain: 0.12, attack: 0.02, sweep: -800 }),
  step: () => burst({ dur: 0.07, freq: 600, q: 1.5, gain: 0.05, attack: 0.004 }),
  coin: () => {
    burst({ dur: 0.12, freq: 3400, q: 12, gain: 0.08, attack: 0.002 });
    setTimeout(() => burst({ dur: 0.18, freq: 4100, q: 14, gain: 0.07, attack: 0.002 }), 90);
  },
});
