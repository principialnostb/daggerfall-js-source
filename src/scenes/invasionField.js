// @ts-check
// AN INVASION ON THIS SCREEN: the cell's fight drawn in the street's foe pool. While a begun invasion's city is my
// pixel, it says `in` to the cell (the relay's, or offline the local cell, systems/toybox/localInvasion.js) and draws
// the cell's state: each foe stood in the pool as the family's own kind, walked where the cell says it walks
// (scenes/invasionBossHost.js), its health the cell's, killed only by the cell's word; the boss at its size, rising
// and falling. My blows on them go to the cell to be judged. Their blows are stamps the cell lays (scenes/invasionMarks.js):
// the boss's drawn as they wind up, each judged on my feet through the one damage door, so god mode spares me. Near
// its city it shows the side panel (waves left, the boss's state) and, once the boss rises, its bar with three phases.
import { setInvasionStrike } from './invasionBossHost.js';
import { createInvasionMarks } from './invasionMarks.js';
import { invasionTrackerModel, invasionBarModel, invasionBossRow, invasionBossName, INVASION_HUD_TEXT, INVASION_HUD_FELL_MS } from '../ui/toybox/invasionHud.js';
import { drawInvasionTracker } from '../ui/toybox/invasionTracker.js';
import { drawGateBossBar } from '../ui/gate/gateBossBar.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { toyboxCue } from '../systems/toybox/toyboxNews.js';
import { createLocalInvasion } from '../systems/toybox/localInvasion.js';
import { INVASION_LV_MAX } from '../net/invasion/invasionWire.js';
import { invasionFoeAt, INVASION_NATIVE_PER_M, INVASION_RISE_MS } from '../net/invasion/invasionBrain.js';
import { INVASION_BOSS_SIZE } from '../net/staffEvent/toyboxEvent.js';
import { staffEventBegun, staffEventLapsed, TB_INVASION } from '../net/staffEvent/staffEventLaw.js';
import { worldRoom } from '../net/wire.js';
import { promoteInvasionBoss } from '../systems/eliteFoes.js';
import { staffRaids } from '../systems/staffEvents.js';
import { raidRelayWord } from '../systems/raidingParties.js';
import { hurtPlayer } from '../characters/playerEntity.js';
import { flashPlayerDamage } from '../ui/damageFlash.js';

/** `in` is said again this often while I stand in it, and sooner when the cell has said nothing this long (ms). */
export const INVASION_IN_EVERY_MS = 10_000;
export const INVASION_QUIET_MS = 15_000;
/** A swing at me turns its foe to face me within this (m). */
const FACE_M = 12;
/** The panel shows within this many map pixels of the city's; a phase's line stays up this long (s). */
export const INVASION_HUD_NEAR_PX = 1;
const PHASE_LINE_S = 4;
/** The blow kinds the cell reads (net/gate/gateBrain.js HIT_KINDS). */
const KIND_OF = Object.freeze({ melee: 0, arrow: 1, spell: 2 });

/**
 * THE FIELD. `now()` the relay's clock (offline, this machine's), `clock()` the frame clock the pool draws on;
 * `online.ready(cell)` / `online.send(word, cell)` the relay's door; `offline()` whether no relay is there; `pixel()` the
 * map pixel I stand on outdoors in the street (null anywhere else); `pool()` the street's foe pool; `local(nx, nz)` a
 * native point in this scene, `native(x, z)` back; `ground(x, z)` the ground's height; `feet()` mine; `player` my
 * entity; `level()`, `name()`; `onHurt(n)` what reached my health; `renderer` the scene's, for the boss's marks;
 * `barBlocked()` another boss's bar up; `barHidden()` the HUD hidden (the dragon's word for it). The rest are seams. @param {any} deps
 */
/** Whether I stand at a live invasion now (its panel is up): the city's guards spare the walkers then, as in a raid. */
let fightHereNow = false;
export const invasionFightHere = () => fightHereNow;

export function createInvasionField(deps) {
  const now = deps.now ?? Date.now;
  const clock = deps.clock ?? (() => performance.now());
  const events = deps.events ?? (() => staffRaids().map((raid) => raid.staff));
  const drawBar = deps.drawBar ?? drawGateBossBar;
  const drawTracker = deps.drawTracker ?? drawInvasionTracker;
  const mid = deps.mid ?? setMidScreenText;
  let barUp = false;
  let trackerUp = false;
  const cell = createLocalInvasion({
    events,
    pose: () => {
      const feet = deps.feet?.();
      if (!feet) return null;
      const [nativeX, nativeZ] = deps.native(feet[0], feet[2]);
      return { x: nativeX, z: nativeZ, dd: !((deps.player?.health ?? 1) > 0) };
    },
    deliver: (word) => word && hear(word),
    sev: deps.sev ?? ((frame, room) => raidRelayWord({ k: 'sev', sev: frame }, room)),
    now,
    rand: deps.rand,
    name: deps.name,
  });
  /** @type {Map<string, { state: any, heardAt: number, foes: Map<number, any>, seen: Set<number>, inAt: number, ph: number }>} */
  const fights = new Map();
  const marks = createInvasionMarks({
    now,
    feet: () => deps.feet?.(),
    native: (/** @type {number} */ x, /** @type {number} */ z) => deps.native(x, z),
    local: (/** @type {number} */ nativeX, /** @type {number} */ nativeZ) => deps.local(nativeX, nativeZ),
    ground: (/** @type {number} */ x, /** @type {number} */ z) => deps.ground?.(x, z),
    alive: () => (deps.player?.health ?? 0) > 0,
    land: (/** @type {number} */ share) => landOnMe(Math.max(1, Math.round(Math.max(1, deps.player?.maxHealth ?? 1) * share))),
    get renderer() {
      return deps.renderer;
    },
    makePass: deps.makePass,
  });

  const send = (/** @type {any} */ word, /** @type {string} */ room) =>
    deps.offline?.() ? cell.send(word) : !!deps.online?.ready?.(room) && !!deps.online?.send?.(word, room);
  const fightOf = (/** @type {string} */ id) => {
    let fight = fights.get(id);
    if (!fight) fights.set(id, (fight = { state: null, heardAt: -Infinity, foes: new Map(), seen: new Set(), inAt: -Infinity, ph: 0 }));
    return fight;
  };
  /** A point of the cell's frame (metres from its site) in this scene, on the ground. */
  const sceneOf = (/** @type {any} */ state, /** @type {number} */ x, /** @type {number} */ z) => {
    const [sceneX, sceneZ] = deps.local(state.sx + x * INVASION_NATIVE_PER_M, state.sz + z * INVASION_NATIVE_PER_M);
    const height = deps.ground?.(sceneX, sceneZ);
    return [sceneX, Number.isFinite(height) ? height : (deps.feet?.()?.[1] ?? 0), sceneZ];
  };
  const landOnMe = (/** @type {number} */ damage) => {
    if (deps.hurt) return deps.hurt(damage);
    const player = deps.player;
    if (!player) return;
    const before = player.health;
    hurtPlayer(player, damage);
    const took = before - player.health;
    if (took > 0) {
      deps.onHurt?.(took);
      flashPlayerDamage(took);
    }
  };

  /** A cell's foe killed by the cell's word: through the pool's own death, its corpse and its fall. */
  function kill(/** @type {any} */ foe) {
    if (!foe || foe === 'pending' || foe.dead) return;
    foe._inv.dying = true;
    foe.entity.health = Math.max(1, foe.entity.health);
    deps.pool?.()?.damageFoe?.(foe, foe.entity.health, null, null, { fromPlayer: false, bypassShield: true });
  }
  /** Every foe of a fight taken off the screen (the event over, or I am gone from the street). */
  function drop(/** @type {string} */ id) {
    const fight = fights.get(id);
    if (!fight) return;
    for (const foe of fight.foes.values()) if (foe !== 'pending' && !foe.dead) deps.pool?.()?.removeFoe?.(foe);
    marks.drop(id);
    fights.delete(id);
  }

  /** A body of the state: stood when new, else its health and its goal set; dead, killed. */
  function body(/** @type {any} */ fight, /** @type {any} */ state, /** @type {number[]} */ row, /** @type {number} */ at) {
    const [num, kind, health, most, fromX, fromZ, toX, toZ, pace, walkAt, up, dead] = row;
    const [x, z] = invasionFoeAt({ x: fromX, z: fromZ, mv: pace > 0 ? { x: fromX, z: fromZ, tx: toX, tz: toZ, v: pace, at: walkAt } : null }, at);
    const goal = sceneOf(state, x, z);
    const foe = fight.foes.get(num);
    if (foe === 'pending') return;
    if (foe) {
      if (foe.dead) return;
      foe.entity.maxHealth = most;
      if (health < foe.entity.health) foe._inv.hurt = true;
      foe.entity.health = Math.max(dead ? 1 : 0, Math.min(most, health));
      foe._inv.goal = goal;
      if (dead) kill(foe);
      return;
    }
    if (dead) return;
    const pool = deps.pool?.();
    if (!pool?.spawnFoe) return;
    fight.foes.set(num, 'pending');
    const boss = num === 0;
    Promise.resolve(
      pool.spawnFoe(kind, goal, { placed: true, transient: true, managed: true, loose: true, eliteFoe: false, champion: null, band: false, eventFoe: boss }),
    )
      .then((/** @type {any} */ made) => {
        if (!made) return void fight.foes.delete(num);
        const standing = fight.state?.f?.some((/** @type {number[]} */ one) => one[0] === num && !one[11]);
        if (fights.get(state.id) !== fight || !standing) {
          fight.foes.delete(num);
          return void pool.removeFoe?.(made);
        }
        if (boss) {
          promoteInvasionBoss(made.entity, { own: false, sizePct: INVASION_BOSS_SIZE, hp: most });
          made._tbRiseAt = clock() - Math.max(0, now() - (up - INVASION_RISE_MS));
        }
        made.entity.maxHealth = most;
        made.entity.health = Math.max(1, health);
        made._inv = { ev: state.id, i: num, goal, t: null, strike: false, hurt: false, face: null, dying: false };
        fight.foes.set(num, made);
      })
      .catch(() => fight.foes.delete(num));
  }

  /** The cell's word: a phase turned since the last is said and laughed (not the first phase I hear). @param {any} word */
  function hear(word) {
    if (word.k === 'no') {
      if (word.m === 'gone') drop(word.id);
      return;
    }
    const fight = fightOf(word.id);
    fight.state = word;
    fight.heardAt = now();
    if (word.ph > fight.ph && fight.ph >= 1 && !word.fl) {
      const name = invasionBossName(invasionBossRow(word)?.[1]);
      mid(word.ph >= 3 ? INVASION_HUD_TEXT.phase3(name) : INVASION_HUD_TEXT.phase2(name), PHASE_LINE_S);
      toyboxCue('laugh');
    }
    fight.ph = Math.max(fight.ph, word.ph | 0);
    marks.hear(word);
    sync(fight);
  }

  /** The state onto the pool: every body, the ones gone killed, each new blow's striker swinging. */
  function sync(/** @type {any} */ fight) {
    const state = fight.state;
    if (!state || !deps.pool?.()) return;
    const at = now();
    const named = new Set();
    for (const row of state.f) {
      named.add(row[0]);
      body(fight, state, row, at);
    }
    for (const [num, foe] of [...fight.foes]) {
      if (named.has(num)) continue;
      kill(foe);
      if (foe !== 'pending') fight.foes.delete(num);
    }
    const me = deps.feet?.();
    for (const [seq, striker, , landAt, , , stamp] of state.b) {
      if (fight.seen.has(seq) || landAt < at) continue;
      fight.seen.add(seq);
      const foe = fight.foes.get(striker);
      const centre = sceneOf(state, stamp[1], stamp[2]);
      if (foe && foe !== 'pending' && foe._inv) {
        foe._inv.strike = true;
        if (me && Math.hypot(me[0] - centre[0], me[2] - centre[2]) <= FACE_M) foe._inv.face = me;
      }
    }
    if (fight.seen.size > 256) fight.seen = new Set([...fight.seen].slice(-128));
  }

  /** The panel and the bar for the fight I stand in or near: the panel until a while after the fall, the bar once the
   *  boss has risen while no other boss's bar is up. */
  function readouts(/** @type {any[]} */ near, /** @type {number} */ at) {
    const hidden = !!(deps.barHidden ?? deps.hudHidden)?.();
    const event = near.find((one) => {
      const fell = fights.get(one.id)?.state?.fl ?? 0;
      return !fell || at < fell + INVASION_HUD_FELL_MS;
    });
    const state = event ? (fights.get(event.id)?.state ?? null) : null;
    const tracker = event ? invasionTrackerModel(event, state, at) : null;
    if (tracker || trackerUp) drawTracker(tracker, { hidden });
    trackerUp = fightHereNow = !!tracker;
    const bar = state ? invasionBarModel(state, at, marks.winding(state)) : null;
    if ((bar || barUp) && !deps.barBlocked?.()) {
      drawBar(bar, { hidden });
      barUp = !!bar;
    }
  }
  function readoutsOff() {
    if (trackerUp) drawTracker(null);
    if (barUp) drawBar(null);
    trackerUp = barUp = fightHereNow = false;
  }

  setInvasionStrike((foe, damage, kind) => {
    const link = foe?._inv;
    const event = link ? events().find((one) => one?.id === link.ev) : null;
    if (!event) return;
    send({ k: 'hit', id: link.ev, i: link.i, d: Math.max(1, Math.round(damage)), r: KIND_OF[/** @type {'melee'} */ (kind)] ?? 0 }, worldRoom(event.px, event.py));
  });

  return {
    /** A cell's word from the relay (online.onInvasion). @param {any} word */
    word: (word) => word && hear(word),
    /** Each frame: offline the local cell beats; I say `in` to an invasion begun on my pixel; its foes are synced, its
     *  blows drawn and judged; the panel and the bar read; a fight whose event ended, or whose street I left, is taken
     *  off the screen. */
    frame() {
      if (deps.offline?.()) cell.tick();
      const at = now();
      const pixel = deps.pixel?.() ?? null;
      const pool = deps.pool?.() ?? null;
      const live = new Set();
      const near = [];
      marks.begin();
      for (const event of events()) {
        if (event?.tb !== TB_INVASION || !staffEventBegun(event, at) || staffEventLapsed(event, at)) continue;
        live.add(event.id);
        if (pixel && Math.max(Math.abs(pixel.x - event.px), Math.abs(pixel.y - event.py)) <= INVASION_HUD_NEAR_PX) near.push(event);
        if (!pixel || !pool || pixel.x !== event.px || pixel.y !== event.py) continue;
        const fight = fightOf(event.id);
        if (at - fight.inAt >= INVASION_IN_EVERY_MS || (at - fight.heardAt >= INVASION_QUIET_MS && at - fight.inAt >= 1000)) {
          if (send({ k: 'in', id: event.id, lv: Math.max(1, Math.min(INVASION_LV_MAX, Math.floor(deps.level?.() ?? 1))) }, worldRoom(event.px, event.py)))
            fight.inAt = at;
        }
      }
      for (const [id, fight] of [...fights]) {
        if (!live.has(id) || !pool) {
          drop(id);
          continue;
        }
        sync(fight);
        if (fight.state) marks.frame(fight.state);
      }
      readouts(near, at);
    },
    /** The boss's blows draped on the land, after the opaque world (the dragon's pass). */
    drawMarks: () => marks.drawMarks(),
    /** Is the boss's bar mine now (another boss's bar waits)? */
    barUp: () => barUp,
    /** Off the street, or the game left: every drawn foe taken off, the panel and the bar down. */
    away() {
      for (const id of [...fights.keys()]) drop(id);
      readoutsOff();
    },
    /** Test seams: the local cell, the fights drawn and the blows in flight. */
    _cell: cell,
    _fights: () => fights,
    _marks: marks,
  };
}
