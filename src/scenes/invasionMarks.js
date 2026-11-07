// @ts-check
// AN INVASION'S BLOWS ON THIS SCREEN: each blow the cell laid is a stamp on the ground (net/invasion/invasionBlows.js).
// The boss's are drawn as they wind up, draped on the land by the dragon's pass (render/dragon/dragonTelegraph.js).
// Every blow, the boss's and a wave foe's, is judged once on my own feet at its landing (egBlowVerdict, the gate's
// rule) and lands through the field's damage door. A wave foe's swing is not drawn: its own swing shows it.
import { egBlowVerdict, egInShape } from '../net/eliteGates/egShape.js';
import { INVASION_NATIVE_PER_M } from '../net/invasion/invasionBrain.js';
import { INVASION_BLOW } from '../net/invasion/invasionBlows.js';
import { fillStamp } from './eliteGates/egFight.js';
import { TELEGRAPH_STYLE, TELEGRAPH_EDGE, TELEGRAPH_POOL, TELEGRAPH_KIND } from '../render/gate/gateTelegraph.js';
import { DragonTelegraphPass, drapeBounds, drapeGrid } from '../render/dragon/dragonTelegraph.js';

/** A landing seen later than this is neither judged nor felt (ms, the gate's); a drawn shape lingers this long after. */
export const INVASION_LATE_MS = 400;
export const INVASION_LINGER_MS = 300;
/** The boss's blows' colour on the ground: a heavy physical blow's. */
export const INVASION_MARK_COLOR = Object.freeze([1.0, 0.34, 0.08]);
const MESHES_KEPT = 64;

/**
 * THE MARKS. `now()` the relay's clock; `feet()` mine in the scene; `native(x, z)` a scene point's native one;
 * `local(nx, nz)` back; `ground(x, z)` the land's height; `alive()`; `land(share)` a blow's share of my health on me;
 * `renderer` the scene's (its `gl`), `makePass(gl)` the tests'. @param {any} deps
 */
export function createInvasionMarks(deps) {
  const makePass = deps.makePass ?? ((/** @type {any} */ gl) => new DragonTelegraphPass(gl));
  /** @type {Map<string, any>} the blows in flight, `<event>:<seq>` */
  const due = new Map();
  const meshes = new Map();
  /** @type {Array<{ centre: number[], list: any[] }>} */
  let draws = [];
  /** @type {any[]} */
  const slots = [];
  let used = 0;
  /** @type {any} */
  let pass;

  /** My feet in a fight's frame (metres from its site), or null. */
  const mine = (/** @type {any} */ state) => {
    const feet = deps.feet?.();
    if (!feet) return null;
    const [nativeX, nativeZ] = deps.native(feet[0], feet[2]);
    return [(nativeX - state.sx) / INVASION_NATIVE_PER_M, (nativeZ - state.sz) / INVASION_NATIVE_PER_M];
  };
  const originOf = (/** @type {any} */ state) => deps.local(state.sx, state.sz);

  /** A stamp as the pass's slot, draped over the land about its fight's site. */
  function shapeOf(/** @type {any} */ blow, /** @type {any} */ state, /** @type {number} */ at, /** @type {number[]|null} */ me, /** @type {any[]} */ list) {
    const shape = (slots[used] ??= { kind: 0, origin: [0, 0], yaw: 0, r: 0, halfArc: 0, body: 0, end: [0, 0], halfW: 0, r0: 0, r1: 0, points: [], n: 0, t: 0, flash: 0, alpha: 0, color: INVASION_MARK_COLOR, edge: TELEGRAPH_EDGE, court: 0, style: TELEGRAPH_STYLE.weight, since: 0, span: 1, after: -1, runS: 0, pool: TELEGRAPH_POOL.blow });
    if (!fillStamp(shape, blow.st) || shape.kind === TELEGRAPH_KIND.all) return;
    const from = blow.at - blow.wu;
    shape.t = Math.max(0, Math.min(1, (at - from) / Math.max(1, blow.wu)));
    shape.flash = at >= blow.at ? 1 : 0;
    shape.alpha = at > blow.at ? Math.max(0, 1 - (at - blow.at) / INVASION_LINGER_MS) : me && egInShape(blow.st, me[0], me[1]) ? 1 : 0.85;
    shape.since = Math.max(0, (at - from) / 1000);
    shape.span = Math.max(0.001, blow.wu / 1000);
    shape.after = at >= blow.at ? (at - blow.at) / 1000 : -1;
    const origin = originOf(state);
    let mesh = meshes.get(blow.key);
    if (!mesh || mesh.ox !== origin[0] || mesh.oz !== origin[1] || (mesh.missing && at - mesh.at > 1000)) {
      const bounds = drapeBounds(shape);
      if (!bounds) return;
      const fallback = deps.feet?.()?.[1] ?? 0;
      const grid = drapeGrid(bounds, (x, z) => deps.ground?.(origin[0] + x, origin[1] + z), fallback);
      mesh = { mesh: grid, missing: grid.missing, at, ox: origin[0], oz: origin[1] };
      meshes.set(blow.key, mesh);
      if (meshes.size > MESHES_KEPT) meshes.delete(meshes.keys().next().value);
    }
    used++;
    list.push({ sh: shape, mesh: mesh.mesh });
  }

  return {
    /** A state's blows taken in: each new one kept until it is judged. @param {any} state */
    hear(state) {
      const at = deps.now();
      for (const [seq, striker, kind, landAt, windup, share, stamp] of state.b) {
        const key = `${state.id}:${seq}`;
        if (due.has(key) || landAt + INVASION_LATE_MS < at) continue;
        due.set(key, { key, id: state.id, striker, a: kind, at: landAt, wu: windup, p: share, st: stamp, s: [stamp], sp: 0, judged: false });
      }
    },
    /** A frame: every frame's shapes laid again, then each fight's blows drawn and judged. */
    begin() {
      draws = [];
      used = 0;
    },
    /** One fight's blows this frame: the boss's drawn; each judged once on my feet. @param {any} state */
    frame(state) {
      const at = deps.now();
      const me = mine(state);
      const alive = deps.alive?.() ?? true;
      const list = [];
      for (const [key, blow] of due) {
        if (blow.id !== state.id) continue;
        if (blow.striker === 0 && at >= blow.at - blow.wu && at <= blow.at + INVASION_LINGER_MS) shapeOf(blow, state, at, me, list);
        if (!blow.judged) {
          const verdict = me && alive ? egBlowVerdict(blow, me[0], me[1], at, INVASION_LATE_MS) : at >= blow.at ? 'miss' : 'wait';
          if (verdict !== 'wait') blow.judged = true;
          if (verdict === 'hit') deps.land?.(blow.p);
        }
        if (blow.judged && at > blow.at + INVASION_LINGER_MS) due.delete(key);
      }
      if (list.length) draws.push({ centre: (([x, z]) => [x, 0, z])(originOf(state)), list });
    },
    /** The boss's heavy blow winding up soonest, for its bar: its kind, how far wound (0..1), whether it holds my feet.
     *  @param {any} state */
    winding(state) {
      const at = deps.now();
      let best = null;
      for (const blow of due.values())
        if (blow.id === state.id && blow.striker === 0 && blow.a !== INVASION_BLOW.swing && at < blow.at && at >= blow.at - blow.wu && (!best || blow.at < best.at)) best = blow;
      if (!best) return null;
      const me = mine(state);
      return { a: best.a, t: Math.max(0, Math.min(1, (at - (best.at - best.wu)) / Math.max(1, best.wu))), aimed: !!me && egInShape(best.st, me[0], me[1]) };
    },
    /** The boss's blows draped on the land, after the opaque world. Answers whether anything was drawn. */
    drawMarks() {
      const gl = deps.renderer?.gl;
      if (!draws.length || !gl) return false;
      if (pass === undefined) {
        try {
          pass = makePass(gl);
        } catch (e) {
          pass = null;
          console.warn('[inv] the telegraph would not build', /** @type {any} */ (e)?.message ?? e);
        }
      }
      if (!pass) return false;
      let any = false;
      for (const { centre, list } of draws) any = pass.draw(list, deps.renderer, centre) || any;
      return any;
    },
    /** A fight's blows forgotten (it ended, or I left it). @param {string} id */
    drop(id) {
      for (const [key, blow] of due) if (blow.id === id) due.delete(key);
    },
    /** Test seam: the blows in flight. */
    _due: () => due,
  };
}
