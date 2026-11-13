// @ts-check
// THE TIDEBOUND LINE'S OWN SHAPES: the sea that follows the Courier, drawn by the Aura Armory's pass (armoryPass.js wires
// it in), each floating the gap off the body the hover law gives (armoryHover.js). A ring of drifting sea-glass beads
// round the head, spray leaping off its front; a nautilus shell before the chest, a light running in along its spiral to
// the pearl at its eye; a stream of water coiling round each forearm toward the hand; surf washing up a sleeve round the
// shins, drops running back down, a ripple where a foot falls. Each law is in JS for the tests and in GLSL for the GPU,
// and the tests hold the two to each other. Every rate and life is whole over the auras' clock. Not a DFU member.
import { ARMORY_PIECES } from '../net/armoryLaw.js';
import { ARMORY_BODY, ARMORY_HOVER } from './armoryHover.js';
import { TIDE_TEAL, TIDE_GLASS, TIDE_FOAM, TIDE_PEARL } from '../ui/playerBadge.js';
import { AURA_CLOCK_PERIOD } from './auraRing.js';

const TAU = 2 * Math.PI;
/** The auras' clock (s), which every rate and life here is whole over. */
export const TIDE_CLOCK_PERIOD = AURA_CLOCK_PERIOD;

/** The line's ramp, dark to hot: the deep under the light, the sea-glass teal, the glass, the foam, the pearl. */
export const TIDE_RGB = Object.freeze({
  deep: Object.freeze([0.04, 0.17, 0.19]),
  teal: Object.freeze(TIDE_TEAL.slice(0, 3)),
  glass: Object.freeze(TIDE_GLASS.slice(0, 3)),
  foam: Object.freeze(TIDE_FOAM.slice(0, 3)),
  pearl: Object.freeze(TIDE_PEARL.slice(0, 3)),
});

/** The rates (Hz): the light round the circlet's beads, the light running in along the shell, the shell's own slow turn,
 *  the stream's ripples passing a point, a new line of surf, and a circlet's bead drifting up and down. */
export const TIDEBOUND_HZ = Object.freeze({ bead: 1 / 8, shell: 1 / 6, turn: 1 / 120, stream: 2, surf: 1, drift: 1 / 4 });

/** THE CIRCLET (m, at the body's scale): its band's middle `brow` over the head's middle, `band` tall and `r` round - the
 *  head's gap off it - its axis tipped `tilt` forward so its front sits lowest, at the brow; `beads` round it, the front
 *  one a pearl, each `bead` across at most and drifting `drift` up and down on its own. Its spray leaps `spray` high and
 *  `out` outward, from within `spread` radians either side of the brow; a drop `drop` across (half). */
export const TIDE_CIRCLET = Object.freeze({
  brow: 0.07,
  band: 0.06,
  r: ARMORY_BODY.head + ARMORY_HOVER.head.gap,
  tilt: 0.25,
  beads: 20,
  bead: 0.034,
  drift: 0.008,
  spray: 0.1,
  out: 0.02,
  spread: 0.42,
  drop: 0.015,
});
/** The spray's drops: how many, the share of each one's life it is in the air, and the lives they take by turns (s). */
export const TIDE_SPRAY = Object.freeze({ count: 10, flight: 0.45, lives: Object.freeze([1.5, 2, 2.5]) });

/** THE SHELL, on a decal `size` across (half, m), the pearl's glow `glow` across at its eye: its spiral's radius `r0` at
 *  its eye, growing `grow` times a turn for `turns` turns; `septa` chamber walls a turn, none in the last `body` of a
 *  turn (the chamber the animal lives in); the pearl `pearl` across at its eye; its lines `line` wide at the eye and
 *  `lineR` more at its rim (decal units). */
export const TIDE_SHELL = Object.freeze({ size: 0.15, glow: 0.2, r0: 0.034, grow: 3, turns: 3, septa: 10, body: 0.42, pearl: 0.12, line: 0.016, lineR: 0.022 });

/** THE STREAM round a forearm (m): its coil's `pitch` along the arm a turn, its half-width `half` of a turn, `ripples` along
 *  it; the arm it coils round `fore` round at the elbow and `wrist` at the wrist, the arms' gap inside it. On a sprite,
 *  whose forearm is never drawn, it coils the upper arm (`upper` round) from `from` before the band to `to` past it.
 *  `drops` fall off its end. */
export const TIDE_STREAM = Object.freeze({ pitch: 0.16, half: 0.24, ripples: 5, fore: ARMORY_BODY.fore, wrist: 0.042, upper: ARMORY_BODY.upper, from: 0.07, to: 0.08, drops: 6 });

/** THE SURF up the shin: `lines` alive at once, each living `life` s; a line rises to `top` of the way to the knee, its
 *  wave `amp` high (of the shin's length), `waves` round the leg, its foam `width` across. Its sleeve stands the legs'
 *  gap off a leg `foot` round over the foot and `knee` at the knee (m), a painted leg's as a rig's, from `from` of the way
 *  up the shin, clear of the foot. `drops` run back down. */
export const TIDE_SURF = Object.freeze({ lines: 3, life: 3, top: 0.8, amp: 0.07, waves: 3, width: 0.05, foot: ARMORY_BODY.ankle, knee: ARMORY_BODY.shin, from: 0.2, drops: 6 });
/** A footfall's ripple: its card `r` across (half, m). It lives as long as a Cinderstride ember (armoryPass.js
 *  ARMORY_EMBER_S). */
export const TIDE_RIPPLE = Object.freeze({ r: 0.26 });
/** The drops that fall: off the stream's end at the hand and back down the shin from the surf - the lives they take by
 *  turns (s), the share of a life each falls, and how far (m). */
export const TIDE_DROPS = Object.freeze({ hand: Object.freeze([1.2, 1.5]), shin: Object.freeze([1.5, 2]), flight: 0.6, fallHand: 0.22, fallShin: 0.22 });

const fract = (/** @type {number} */ x) => x - Math.floor(x);
const mod = (/** @type {number} */ x, /** @type {number} */ y) => x - y * Math.floor(x / y);
const smooth = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const lineAt = (/** @type {number} */ d, /** @type {number} */ w) => 1 - smooth(w * 0.4, w, Math.abs(d));
/** The pass's per-wearer hash (armoryPass.js SHARED `hk`), its seed the wearer's. */
const hk = (/** @type {number} */ p, /** @type {number} */ seed) => {
  p = fract(p * 0.1031 + seed);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
};
/** The auras' cell hash (auraRing.js AURA_NOISE_GLSL `h21`). */
const h21 = (/** @type {number} */ x, /** @type {number} */ y) => {
  let px = fract(x * 123.34), py = fract(y * 456.21);
  const d = px * (px + 45.32) + py * (py + 45.32);
  px += d;
  py += d;
  return fract(px * py);
};
/** A card's life of `L` s (armoryPass.js `lifeOf`): its age 0..1 and which life it is, counted round the clock. */
const lifeOf = (/** @type {number} */ k, /** @type {number} */ L, /** @type {number} */ t, /** @type {number} */ seed) => {
  const x = (t + hk(k + 1, seed) * L) / L;
  return [fract(x), mod(Math.floor(x), TIDE_CLOCK_PERIOD / L)];
};

/** Every rate and every life whole over the clock, so nothing jumps at its wrap. Pure. */
export const tideboundWhole = () =>
  [...Object.values(TIDEBOUND_HZ).map((r) => r * TIDE_CLOCK_PERIOD), ...[...TIDE_SPRAY.lives, ...TIDE_DROPS.hand, ...TIDE_DROPS.shin, TIDE_SURF.life].map((L) => TIDE_CLOCK_PERIOD / L)].every(
    (n) => n > 0 && Math.abs(n - Math.round(n)) < 1e-9,
  );

/** A spray drop's arc at `a` of its flight (0 off the band .. 1 back on it): `[rise, out, light]` - up a short arc and
 *  down again, drifting outward, lit as it leaves and dark as it lands. Pure. */
export function tideSprayArc(/** @type {number} */ a) {
  const C = TIDE_CIRCLET;
  return [C.spray * 4 * a * (1 - a), C.out * a, smooth(0, 0.12, a) * (1 - smooth(0.7, 1, a))];
}
/** Spray drop `k` at the clock `t` for a wearer's `seed`: `[angle, rise, out, light]` - the angle round the band from the
 *  brow it leaps from, then its arc; all 0 between its leaps. Each drop leaps once a life, from a new place. Pure. */
export function tideSprayAt(/** @type {number} */ k, /** @type {number} */ t, seed = 0) {
  const L = TIDE_SPRAY.lives[k % TIDE_SPRAY.lives.length];
  const [age, life] = lifeOf(k, L, t, seed);
  const a = age / TIDE_SPRAY.flight;
  if (a >= 1) return [0, 0, 0, 0];
  const [rise, out, light] = tideSprayArc(a);
  return [(hk(life * 3.7 + k * 1.3, seed) * 2 - 1) * TIDE_CIRCLET.spread, rise * (0.7 + 0.3 * hk(life * 5.1 + k * 2.9, seed)), out, light];
}

/** How far circlet bead `id` has drifted up (m, at the body's scale) at the clock `t`: each bead on a phase of its own. Pure. */
export const tideBeadDrift = (/** @type {number} */ id, /** @type {number} */ t) =>
  TIDE_CIRCLET.drift * Math.sin(TAU * (t * TIDEBOUND_HZ.drift + h21(mod(id, TIDE_CIRCLET.beads), 5)));

/** Where (x, y) on the shell's decal stands on its spiral, the shell turned `turn` (turns): `[q, w, tin]` - q its radius
 *  in the spiral's turns less its angle's, w its share of the way out from the whorl inside it to the one outside, tin how
 *  many turns from the eye the whorl inside it is. A point on a whorl has w 0. Pure. */
export function tideSpiralAt(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ turn) {
  const r = Math.max(Math.hypot(x, y), 1e-4), a = fract(Math.atan2(y, x) / TAU - turn);
  const q = Math.log(r / TIDE_SHELL.r0) / Math.log(TIDE_SHELL.grow) - a, n = Math.floor(q);
  return [q, q - n, a + n];
}
/** The light running in along the spiral, at `T` turns from the eye at the clock `t`: it sets off from the rim, runs in
 *  to the eye in 1/TIDEBOUND_HZ.shell s with a fainter tail behind it, and fades as it arrives. Pure. */
export function tideShellPulse(/** @type {number} */ T, /** @type {number} */ t) {
  const p = fract(t * TIDEBOUND_HZ.shell), d = T - TIDE_SHELL.turns * (1 - p);
  const env = smooth(0, 0.08, p) * (1 - smooth(0.88, 1, p));
  return (Math.exp(-((d * 5) ** 2)) + (d > 0 ? 0.5 * Math.exp(-d * 2.5) : 0)) * env;
}
/** How bright the pearl flares as the light reaches it, 0..1, at the clock `t`. Pure. */
export const tidePearlFlash = (/** @type {number} */ t) => Math.exp(-(((fract(t * TIDEBOUND_HZ.shell + 0.5) - 0.5) / 0.07) ** 2));

/** A forearm's stream at (u round, v along toward the hand) on a tube `turns` coils round, `C` round and `L` long (m):
 *  `[across, crest, along]` - across 0 on the stream's middle to 1 at its edge, crest 1 on a ripple's top, along how far
 *  down the stream the point stands (0..1). The ripples run toward the hand. Pure. */
export function tideStreamAt(/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ turns, /** @type {number} */ C, /** @type {number} */ L, /** @type {number} */ t) {
  const dp = fract(u - v * turns + 0.5) - 0.5;
  const along = v + (dp * turns * C * C) / (turns * turns * C * C + L * L);
  const s = along * TIDE_STREAM.ripples - t * TIDEBOUND_HZ.stream;
  return [Math.abs(dp) / TIDE_STREAM.half, (0.5 + 0.5 * Math.cos(TAU * s)) ** 3, along];
}

/** Surf line `j` at the clock `t`: `[height, age, light]` - it washes up from the ankle (v 0) toward the knee (v 1),
 *  slowing as it rises to TIDE_SURF.top, and fades as it goes. A new line every 1/TIDEBOUND_HZ.surf s. Pure. */
export function tideSurfLine(/** @type {number} */ j, /** @type {number} */ t) {
  const S = TIDE_SURF, a = fract(t / S.life + j / S.lines);
  return [S.top * (1 - (1 - a) ** 2), a, smooth(0, 0.08, a) * (1 - a) ** 1.3];
}
/** The surf's foam at (u round from the front, v up the shin) at the clock `t`: the brightest of its lines there, each a
 *  wave round the leg, its shape new each time it rises. Pure. */
export function tideSurfAt(/** @type {number} */ u, /** @type {number} */ v, /** @type {number} */ t) {
  const S = TIDE_SURF;
  let c = 0;
  for (let j = 0; j < S.lines; j++) {
    const [h, a, light] = tideSurfLine(j, t);
    const ph = h21(mod(Math.floor(t / S.life + j / S.lines), TIDE_CLOCK_PERIOD / S.life), j + 7);
    const y = h + S.amp * (0.5 + 0.5 * a) * (0.6 * Math.sin(TAU * (S.waves * u + ph)) + 0.4 * Math.sin(TAU * (S.waves * 2 - 1) * u - TAU * 2 * ph));
    c = Math.max(c, lineAt(v - y, S.width) * light);
  }
  return c;
}
/** A footfall's ripple at `d` across its card (0 its middle .. 1 its edge) at age `a` (0 the foot down .. 1 gone): two
 *  rings spreading and fading, the second behind the first. Pure. */
export function tideRippleAt(/** @type {number} */ d, /** @type {number} */ a) {
  const r1 = 0.12 + 0.8 * (1 - (1 - a) ** 2), r2 = r1 * 0.6;
  return (Math.exp(-(((d - r1) / 0.06) ** 2)) + 0.6 * Math.exp(-(((d - r2) / 0.05) ** 2)) * smooth(0.1, 0.3, a)) * (1 - a) ** 1.5;
}

// ── THE GLSL ─────────────────────────────────────────────────────────

/** A number as GLSL writes a float. */
const g = (/** @type {number} */ x) => {
  const s = String(+x.toFixed(6));
  return /[.e]/.test(s) ? s : `${s}.0`;
};
const v3 = (/** @type {ReadonlyArray<number>} */ c) => `vec3(${c.map((x) => x.toFixed(3)).join(', ')})`;
/** A rate as GLSL multiplies by it exactly: a division by its whole period where it has one. */
const hz = (/** @type {number} */ r) => {
  const per = Math.round(1 / r);
  return Math.abs(per * r - 1) < 1e-12 ? `/ ${per.toFixed(1)}` : `* ${g(r)}`;
};
const IX = Object.fromEntries(ARMORY_PIECES.map((p, i) => [p.key, i]));
/** GLSL: whether this program's piece is the Tidebound one named. */
export const TIDE_IS = Object.freeze({
  circlet: `(uPiece == ${IX.tidecirclet})`,
  pearl: `(uPiece == ${IX.tidepearl})`,
  bracers: `(uPiece == ${IX.tidebracers})`,
  greaves: `(uPiece == ${IX.tidegreaves})`,
});
/** GLSL: whether this program's piece is any of the line's. */
export const TIDE_ANY = `(${ARMORY_PIECES.filter((p) => p.line === 'tidebound').map((p) => `uPiece == ${IX[p.key]}`).join(' || ')})`;
/** The card kind a footfall's ripple is: the vertex shader lays it on the ground. */
export const TIDE_RIPPLE_KIND = 3;

const C = TIDE_CIRCLET, SH = TIDE_SHELL, ST = TIDE_STREAM, SU = TIDE_SURF;

/** THE CARDS (the vertex shader's, inside cardAt's scope: lifeOf, ringOut, hk and the draw's uniforms). Card k's centre
 *  and size, and its age, kind and light: the circlet's spray, the pearl's glow, the stream's and the surf's drops, and a
 *  footfall's ripple. */
export const TIDE_CARDS_GLSL = `
vec3 tideSprayArc(float a) { return vec3(${g(C.spray)} * 4.0 * a * (1.0 - a), ${g(C.out)} * a, smoothstep(0.0, 0.12, a) * (1.0 - smoothstep(0.7, 1.0, a))); }
vec4 tideSpray(float k) {
  float L = ${g(TIDE_SPRAY.lives[0])} + ${g(TIDE_SPRAY.lives[1] - TIDE_SPRAY.lives[0])} * mod(k, ${g(TIDE_SPRAY.lives.length)});
  vec2 lf = lifeOf(k, L);
  float a = lf.x / ${g(TIDE_SPRAY.flight)};
  if (a >= 1.0) return vec4(0.0);
  vec3 arc = tideSprayArc(a);
  return vec4((hk(lf.y * 3.7 + k * 1.3) * 2.0 - 1.0) * ${g(C.spread)}, arc.x * (0.7 + 0.3 * hk(lf.y * 5.1 + k * 2.9)), arc.y, arc.z);
}
// a drop falling from where it formed: how far it has fallen (m at the body's scale) at age a of its fall, and its light
vec2 tideDrop(float a, float fall) { return vec2(fall * a * a, smoothstep(0.0, 0.15, a) * (1.0 - smoothstep(0.75, 1.0, a))); }
vec4 tideCardAt(float k, out vec4 info) {
  info = vec4(0.0, 0.0, 1.0, 0.0);
  if (${TIDE_IS.circlet}) {   // the crest's spray, off the band's top at the brow
    vec4 s = tideSpray(k);
    if (s.w <= 0.0) return vec4(0.0);
    info = vec4(s.y / ${g(C.spray)}, 0.0, s.w, 0.0);
    return vec4(uA + ringOut(uU, s.x) * (uR.x + s.z * uScale) + uU * s.y * uScale, ${g(C.drop)} * uScale);
  }
  if (${TIDE_IS.pearl}) { info = vec4(0.0, 1.0, 1.0, 0.0); return vec4(uA, uSize); }   // the pearl's glow
  if (${TIDE_IS.greaves} && uPart == 2) {   // a footfall's ripple, on the ground
    vec4 tr = uTrail[int(k)];
    if (tr.w < 0.0 || tr.w > 1.0) return vec4(0.0);
    info = vec4(tr.w, ${g(TIDE_RIPPLE_KIND)}, 1.0, 0.0);
    return vec4(tr.xyz + vec3(0.0, 0.01, 0.0), ${g(TIDE_RIPPLE.r)} * uScale);
  }
  // a drop: off the stream's end at the hand, or back down the shin from the surf
  bool shin = ${TIDE_IS.greaves};
  float L = shin ? ${g(TIDE_DROPS.shin[0])} + ${g(TIDE_DROPS.shin[1] - TIDE_DROPS.shin[0])} * mod(k, 2.0) : ${g(TIDE_DROPS.hand[0])} + ${g(TIDE_DROPS.hand[1] - TIDE_DROPS.hand[0])} * mod(k, 2.0);
  vec2 lf = lifeOf(k, L);
  float a = lf.x / ${g(TIDE_DROPS.flight)};
  if (a >= 1.0) return vec4(0.0);
  vec3 axis = normalize(uB - uA);
  vec3 from = shin ? mix(uA, uB, 0.3 + 0.4 * hk(lf.y * 3.1 + k)) + ringOut(axis, hk(k * 1.7 + lf.y) * TAU) * uR.x * 0.95 : uA + ringOut(axis, hk(k * 2.3 + lf.y) * TAU) * uR.x * 0.6;
  vec2 d = tideDrop(a, shin ? ${g(TIDE_DROPS.fallShin)} : ${g(TIDE_DROPS.fallHand)});
  info = vec4(a, 0.0, d.y, 0.0);
  return vec4(from - vec3(0.0, d.x, 0.0) * uScale, 0.012 * uScale);
}
`;

/** The line's ramp in GLSL, dark to hot through TIDE_RGB - before the pass's `ramp`, which reads it. */
export const TIDE_RAMP_GLSL = `
vec3 tideRamp(float v) {
  vec3 c = mix(${v3(TIDE_RGB.deep)}, ${v3(TIDE_RGB.teal)}, smoothstep(0.08, 0.4, v));
  c = mix(c, ${v3(TIDE_RGB.glass)}, smoothstep(0.4, 0.65, v));
  c = mix(c, ${v3(TIDE_RGB.foam)}, smoothstep(0.65, 0.85, v));
  return mix(c, ${v3(TIDE_RGB.pearl)}, smoothstep(0.85, 1.0, v));
}
`;

/** THE LOOKS (the fragment shader's, after the pass's own: ramp, lineAt, h21, vnoiseP). Each answers its part's light at
 *  vP: the tube's (round, along), the decal's and the card's (-1..1)². */
export const TIDE_LOOKS_GLSL = `
// the near side of a tube lit, its far side (seen past a sprite's head or arm) a little
float tideFacing() { return 0.45 + 0.55 * smoothstep(-0.35, 0.35, vS.x); }
// TIDEBOUND CIRCLET: sea-glass beads floating in a ring round the head, a pearl at the front, each drifting up and down on
// its own; a slow light runs round them
float tideBeadDrift(float id) { return ${g(C.drift)} * sin(TAU * (uTime ${hz(TIDEBOUND_HZ.drift)} + h21(vec2(mod(id, ${g(C.beads)}), 5.0)))); }
vec3 circletLight() {
  float cell = vP.x * ${g(C.beads)} + 0.5, id = floor(cell);
  float W = TAU * uR.x / ${g(C.beads)}, H = vS.y;   // a bead's cell round, and the band's height (m)
  vec2 p = vec2((fract(cell) - 0.5) * W, (vP.y - 0.5) * H - tideBeadDrift(id) * uScale);
  bool front = mod(id, ${g(C.beads)}) == 0.0;
  float rad = (front ? 0.62 : mod(id, 2.0) == 0.0 ? 0.52 : 0.26) * ${g(C.bead)} * uScale;
  float d = length(p) / rad, body = 1.0 - smoothstep(0.82, 1.0, d);
  float rim = smoothstep(0.5, 0.92, d) * body;
  float spec = exp(-dot(p / rad - vec2(-0.32, 0.36), p / rad - vec2(-0.32, 0.36)) / 0.05);
  float s = fract(vP.x - uTime ${hz(TIDEBOUND_HZ.bead)} - uSeed), run = exp(-min(s, 1.0 - s) * min(s, 1.0 - s) / 0.004) + 0.35 * exp(-s * 6.0);
  float pearly = front || mod(id, 2.0) == 1.0 ? 1.0 : 0.0;
  float heat = body * mix(0.38 + 0.24 * rim, 0.84, pearly) + 0.12 * run * body + 0.5 * spec * body;
  return tideRamp(clamp(heat, 0.0, 1.0)) * (body * (0.8 + 0.6 * run) + spec * body * 0.5) * tideFacing();
}
// TIDEBOUND PEARL: a nautilus shell - its spiral's whorls, the chamber walls between them, the mouth - turning slowly; a
// light runs in along the spiral to the pearl at its eye, which flares as it arrives
float tidePearlFlash() { return exp(-pow((fract(uTime ${hz(TIDEBOUND_HZ.shell)} + 0.5) - 0.5) / 0.07, 2.0)); }
float tideShellPulse(float T) {
  float p = fract(uTime ${hz(TIDEBOUND_HZ.shell)}), d = T - ${g(SH.turns)} * (1.0 - p);
  float env = smoothstep(0.0, 0.08, p) * (1.0 - smoothstep(0.88, 1.0, p));
  return (exp(-(d * 5.0) * (d * 5.0)) + (d > 0.0 ? 0.5 * exp(-d * 2.5) : 0.0)) * env;
}
vec3 tideSpiral(vec2 p, float turn) {
  float r = max(length(p), 1e-4), a = fract(atan(p.y, p.x) / TAU - turn);
  float q = log(r / ${g(SH.r0)}) / log(${g(SH.grow)}) - a, n = floor(q);
  return vec3(q, q - n, a + n);
}
vec3 shellLight() {
  float r = length(vP);
  vec3 sp = tideSpiral(vP, uTime ${hz(TIDEBOUND_HZ.turn)});
  float w = sp.y, tin = sp.z, tout = tin + 1.0, lnG = log(${g(SH.grow)});
  float lw = ${g(SH.line)} + ${g(SH.lineR)} * r;
  float inner = tin >= 0.0 && tin <= ${g(SH.turns)} ? lineAt(r * lnG * w, lw) : 0.0;   // the whorl inside the point
  float outer = tout <= ${g(SH.turns)} ? lineAt(r * lnG * (1.0 - w), lw) : 0.0;   // the one outside it
  float lip = outer * smoothstep(${g(SH.turns - 1)}, ${g(SH.turns - 0.6)}, tout);   // the last turn, the shell's rim
  float inside = tout <= ${g(SH.turns)} && tin >= 0.0 ? 1.0 : 0.0;
  float mouth = tin >= ${g(SH.turns - 1.5)} && tin < ${g(SH.turns - 0.5)} ? lineAt(r * TAU * (tout - ${g(SH.turns)}), lw) : 0.0;   // across the shell's opening
  float bow = (tin + 0.07 * sin(3.14159265 * w)) * ${g(SH.septa)};
  float septum = inside * step(tout, ${g(SH.turns - SH.body)}) * lineAt(r * TAU * (fract(bow + 0.5) - 0.5) / ${g(SH.septa)}, lw * 0.7);
  float pulse = max(inner * tideShellPulse(tin), outer * tideShellPulse(tout));
  float flash = tidePearlFlash();
  float pearl = 1.0 - smoothstep(${g(SH.pearl * 0.8)}, ${g(SH.pearl)}, r);
  float sheen = exp(-dot(vP - vec2(-0.035, 0.04), vP - vec2(-0.035, 0.04)) / 0.0012);
  float lines = max(max(inner, outer), max(mouth, septum * 0.75));
  float heat = max(lines * (0.55 + 0.2 * lip + 0.35 * pulse) + inside * (0.12 + 0.1 * w), pearl * (0.82 + 0.18 * flash));
  float k = max(lines * (0.55 + 0.25 * lip + 0.9 * pulse) + inside * (0.05 + 0.05 * w), pearl * (0.75 + 0.6 * flash + 0.4 * sheen));
  return tideRamp(clamp(heat + 0.2 * sheen * pearl, 0.0, 1.0)) * k * uFace * 0.9;
}
// TIDEBOUND BRACERS: a stream of water coiling round the forearm, its ripples running toward the hand and foam where they
// crest; its edges brighter, where the water's skin turns
vec3 tideStream(float u, float v, float turns, float C, float L) {
  float dp = fract(u - v * turns + 0.5) - 0.5;
  float along = v + dp * turns * C * C / (turns * turns * C * C + L * L);
  float s = along * ${g(ST.ripples)} - uTime * ${g(TIDEBOUND_HZ.stream)};
  return vec3(abs(dp) / ${g(ST.half)}, pow(0.5 + 0.5 * cos(TAU * s), 3.0), along);
}
vec3 streamLight() {
  float L = vS.y, C = TAU * mix(uR.x, uR.y, vP.y), turns = L / (${g(ST.pitch)} * uScale);
  vec3 st = tideStream(vP.x, vP.y, turns, C, L);
  float across = st.x, crest = st.y;
  float body = 1.0 - smoothstep(0.78, 1.0, across);
  float skin = lineAt(across - 0.82, 0.22);
  float cells = floor(st.z * ${g(ST.ripples * 5)} - uTime * ${g(TIDEBOUND_HZ.stream * 5)});
  float fleck = step(0.62, h21(vec2(floor(across * 3.0 + 3.0), mod(cells, ${g(TIDE_CLOCK_PERIOD * TIDEBOUND_HZ.stream * 5)})))) * smoothstep(0.35, 0.8, crest) * body;
  float ends = smoothstep(0.0, 0.08, vP.y) * (1.0 - smoothstep(0.92, 1.0, vP.y));
  float heat = body * (0.42 + 0.28 * crest) + 0.3 * skin + 0.45 * fleck;
  return tideRamp(clamp(heat, 0.0, 1.0)) * (body * (0.55 + 0.55 * crest) + skin * 0.5 + fleck * 0.7) * ends * tideFacing();
}
// TIDEBOUND GREAVES: surf at the shin - wavy lines of foam washing up from the ankle and fading as they rise, the water's
// sheen under each, and a swirl of it at the foot
// the surf's foam at (u, v), its lines' brightest there (tideSurfAt's law), and the water's sheen under them
vec2 tideSurf(float u, float v) {
  float foam = 0.0, wash = 0.0;
  for (int j = 0; j < ${SU.lines}; j++) {
    float x = uTime / ${g(SU.life)} + float(j) / ${g(SU.lines)}, a = fract(x);
    float h = ${g(SU.top)} * (1.0 - (1.0 - a) * (1.0 - a)), light = smoothstep(0.0, 0.08, a) * pow(1.0 - a, 1.3);
    float ph = h21(vec2(mod(floor(x), ${g(TIDE_CLOCK_PERIOD / SU.life)}), float(j) + 7.0));
    float y = h + ${g(SU.amp)} * (0.5 + 0.5 * a) * (0.6 * sin(TAU * (${g(SU.waves)} * u + ph)) + 0.4 * sin(TAU * ${g(SU.waves * 2 - 1)} * u - TAU * 2.0 * ph));
    foam = max(foam, lineAt(v - y, ${g(SU.width)}) * light);
    wash = max(wash, step(v, y) * exp(-(y - v) / 0.1) * light);
  }
  return vec2(foam, wash);
}
vec3 surfLight() {
  float u = vP.x, v = vP.y;
  vec2 sea = tideSurf(u, v);
  float foam = sea.x, wash = sea.y;
  float swirl = exp(-v / 0.07) * (0.6 + 0.4 * vnoiseP(vec2(u * 12.0 + uTime * 0.5, v * 4.0), vec2(12.0, 64.0)));
  float heat = max(foam * 0.95, max(wash * 0.5, swirl * 0.55));
  return tideRamp(heat) * (foam * 1.1 + wash * 0.3 + swirl * 0.3) * tideFacing();
}
// the line's cards: a drop of spray or water, the pearl's glow, a ripple spreading where a foot fell
vec3 tideCardLight() {
  float d = length(vP);
  if (vS.y > ${g(TIDE_RIPPLE_KIND - 0.5)}) {
    float a = vS.x, r1 = 0.12 + 0.8 * (1.0 - (1.0 - a) * (1.0 - a)), r2 = r1 * 0.6;
    float ring = (exp(-pow((d - r1) / 0.06, 2.0)) + 0.6 * exp(-pow((d - r2) / 0.05, 2.0)) * smoothstep(0.1, 0.3, a)) * pow(1.0 - a, 1.5);
    return tideRamp(0.8) * ring * 0.75;
  }
  if (vS.y > 0.5) {
    float glow = exp(-d * d * 5.0) * (1.0 - smoothstep(0.6, 1.0, d));
    return tideRamp(0.62) * glow * (0.1 + 0.3 * tidePearlFlash()) * uFace;
  }
  float e = pow(max(1.0 - d, 0.0), 1.4) * vS.z;
  return tideRamp(${TIDE_IS.circlet} ? 0.95 : 0.8) * e * (0.8 + 0.6 * exp(-d * d * 12.0));
}
vec3 tideLight() {
  if (uMesh == 1) return tideCardLight();   // the pass's CARDS
  if (${TIDE_IS.circlet}) return circletLight();
  if (${TIDE_IS.pearl}) return shellLight();
  if (${TIDE_IS.bracers}) return streamLight();
  if (${TIDE_IS.greaves}) return surfLight();
  return vec3(0.0);
}
`;
