// @ts-check
// AN INVASION, THE RELAY'S HALF. The fight lives in the cell its city stands in, one an event, its brain beating on the
// cell's alarm (net/invasion/invasionBrain.js through net/bossSeam.js INVASION_SEAM). A fighter's `in` and `hit` come
// here; the cell reads the fighter's own pose, never a word's, and every foe's health is its own. The fight keeps the
// event's staff ledger, so the place's meter, its board, its receipts (`tb` 1) and the hub's moments and end go through
// the staff event's own door (server/src/staffEvents.js keepStaffLedger). An event the hub no longer holds ends its fight.
// index.js holds the few hooks that call in here; the state rides the room under `_inv`.
import { INVASION_SEAM } from '../../src/net/bossSeam.js';
import {
  invasionResume,
  INVASION_TICK_MS,
  INVASION_CHECKPOINT_MS,
  INVASION_NATIVE_PER_M,
  INVASION_BRAIN_V,
} from '../../src/net/invasion/invasionBrain.js';
import { validInvasionOut } from '../../src/net/invasion/invasionWire.js';
import { staffEventBegun, staffEventLapsed, TB_INVASION } from '../../src/net/staffEvent/staffEventLaw.js';
import { worldRoom, mapPixelOfWire, isCellRoom } from '../../src/net/wire.js';
import { junkOutsideCover } from './cellNodes.js';
import { staffEventHeld, keepStaffLedger } from './staffEvents.js';

/** A fight in storage, and the index of the cell's fights. */
export const INVASION_FIGHT_PREFIX = 'invf:';
export const INVASION_FIGHTS_KEY = 'invfs';
/** The most fights a cell keeps (one an event of the hub's book). */
export const INVASION_FIGHTS_MAX = 8;
/** A fight beats this often while nobody stands in it, and is forgotten this long after its boss fell (ms). */
export const INVASION_IDLE_MS = 5000;
export const INVASION_KEEP_MS = 10 * 60 * 1000;
const rand01 = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const storeKey = (/** @type {string} */ id) => `${INVASION_FIGHT_PREFIX}${id}`;
const frameText = (/** @type {any} */ word) => JSON.stringify({ t: 'inv', ...word });

/** The room's invasion state, made on first use. @param {any} room */
const stateOf = (room) => (room._inv ??= { fights: undefined, savedAt: new Map(), falling: new Map(), armedTo: 0 });

/** The fights this cell holds, by event id - the instance's while it is awake, else storage's. A fight another brain
 *  made is let go: its numbers were that brain's. @param {any} room @returns {Promise<Map<string, any>>} */
export async function invasionFights(room) {
  const held = stateOf(room);
  if (held.fights === undefined) {
    const ids = await room.state.storage.get(INVASION_FIGHTS_KEY);
    const list = Array.isArray(ids) ? ids.filter((id) => typeof id === 'string').slice(0, INVASION_FIGHTS_MAX) : [];
    const got = list.length ? await room.state.storage.get(list.map(storeKey)) : new Map();
    held.fights = new Map();
    for (const id of list) {
      const fight = got.get(storeKey(id));
      if (fight && typeof fight === 'object' && fight.v === INVASION_BRAIN_V) held.fights.set(id, fight);
    }
  }
  return held.fights;
}
const index = (/** @type {any} */ room, /** @type {Map<string, any>} */ fights) =>
  room.state.storage.put(INVASION_FIGHTS_KEY, [...fights.keys()]);
async function forget(/** @type {any} */ room, /** @type {Map<string, any>} */ fights, /** @type {string} */ id) {
  fights.delete(id);
  stateOf(room).savedAt.delete(id);
  await room.state.storage.delete(storeKey(id));
  await index(room, fights);
}
async function save(/** @type {any} */ room, /** @type {any} */ fight, /** @type {number} */ now, /** @type {boolean} */ force) {
  const held = stateOf(room);
  if (!force && now - (held.savedAt.get(fight.id) ?? 0) < INVASION_CHECKPOINT_MS) return;
  held.savedAt.set(fight.id, now);
  await room.state.storage.put(storeKey(fight.id), fight);
}
/** Every word said to everyone the cell holds: the invasion was told to every screen, so its fight is no secret. */
function fan(/** @type {any} */ room, /** @type {any[]} */ words) {
  const texts = words.filter((word) => validInvasionOut(word)).map(frameText);
  if (texts.length) room._fanFrames(texts, (/** @type {any} */ attach) => !!attach.id);
}
const sayTo = (/** @type {any} */ room, /** @type {any} */ ws, /** @type {any} */ word) => room._send(ws, frameText(word));
/** A pose (native units) in a fight's site frame, metres. */
const frameOf = (/** @type {any} */ fight, /** @type {any} */ pose) => ({
  x: (pose.x - fight.sx) / INVASION_NATIVE_PER_M,
  z: (pose.z - fight.sz) / INVASION_NATIVE_PER_M,
});
/** The fight's bodies now: one a fighter, its newest socket speaking for it. */
function bodiesOf(/** @type {any} */ room, /** @type {any} */ fight) {
  const out = [];
  for (const [sub, [, attach]] of room._siegeSockets()) {
    if (!attach.pose || !fight.players[sub]) continue;
    out.push({ sub, ...frameOf(fight, attach.pose), dead: !!attach.pose.dd });
  }
  return out;
}
async function arm(/** @type {any} */ room, /** @type {number} */ now) {
  const held = stateOf(room);
  if (held.armedTo > now) return;
  held.armedTo = now + INVASION_TICK_MS;
  const at = await room.state.storage.getAlarm();
  if (at == null || at > now + INVASION_TICK_MS) await room.state.storage.setAlarm(now + INVASION_TICK_MS);
}

/**
 * A fighter's word (`in` or `hit`, validInvasionIn's shape), from a verified account in a cell. Heard only in the cell
 * its city stands in, never in a layer, for an invasion the hub's book holds and that has begun. An `in` from a pose on
 * the city's pixel joins it - the first one names the fight's site - and is told the whole fight. A `hit` is judged by
 * the brain on this socket's own pose; a boss it fells pays the earners at once.
 * @param {any} room @param {any} ws @param {any} attach @param {any} msg @param {number} now
 */
export async function invasionWord(room, ws, attach, msg, now) {
  if (!isCellRoom(attach.key)) {
    room._junk(ws);
    return;
  }
  if (attach.ly) return;
  const event = await staffEventHeld(room, msg.id, now);
  if (!event || event.tb !== TB_INVASION || !staffEventBegun(event, now) || staffEventLapsed(event, now)) {
    sayTo(room, ws, { k: 'no', id: msg.id, m: 'gone' });
    return;
  }
  if (junkOutsideCover(room, ws, attach, worldRoom(event.px, event.py))) return;
  const fights = await invasionFights(room);
  let fight = fights.get(event.id) ?? null;
  const own = room._siegeSocketOf(attach.sub)?.[0] === ws;
  const pose = own && attach.pose && !attach.pose.dd ? attach.pose : null;
  if (fight) fan(room, invasionResume(fight, now));
  if (msg.k === 'in') {
    const [px, py] = pose ? mapPixelOfWire(pose.x, pose.z) : [-1, -1];
    if (px !== event.px || py !== event.py) {
      sayTo(room, ws, fight ? INVASION_SEAM.stateOf(fight) : { k: 'no', id: event.id, m: 'far' });
      return;
    }
    if (!fight) {
      if (fights.size >= INVASION_FIGHTS_MAX) {
        sayTo(room, ws, { k: 'no', id: event.id, m: 'full' });
        return;
      }
      fight = INVASION_SEAM.new({ ev: event, sx: Math.round(pose.x), sz: Math.round(pose.z), now });
      fights.set(event.id, fight);
      await index(room, fights);
    }
    const level = Number.isSafeInteger(attach.cl) && attach.cl >= 1 ? Math.min(msg.lv, attach.cl) : msg.lv;
    const joined = INVASION_SEAM.join(fight, attach.sub, attach.name ?? '', level, now);
    sayTo(room, ws, INVASION_SEAM.stateOf(fight));
    if (!joined) sayTo(room, ws, { k: 'no', id: event.id, m: 'full' });
    await save(room, fight, now, true);
    if (!fight.fell) await arm(room, now);
    return;
  }
  if (!fight?.players?.[attach.sub] || fight.fell) return;
  INVASION_SEAM.hit(fight, attach.sub, msg.d, msg.r, pose ? frameOf(fight, pose) : null, now, null, { i: msg.i });
  if (fight.fell) await settle(room, fight, event, now);
  else await arm(room, now);
}

/** The ledger to the place and the hub when it moved: at once when its boss rose or fell. At the fall the staff door
 *  pays the earners before a word of it is said, then the fall is said to everyone. */
async function settle(/** @type {any} */ room, /** @type {any} */ fight, /** @type {any} */ event, /** @type {number} */ now) {
  const led = fight.led;
  const mark = `${led.n}|${led.bu}|${led.bk}`;
  if (mark === fight.keptMark) return;
  const urgent = !fight.keptMark || fight.keptMark.split('|')[1] !== String(led.bu) || led.bk === 1;
  const held = stateOf(room);
  const was = held.falling.get(fight.id) ?? Promise.resolve();
  const next = was.then(() => keepStaffLedger(room, led, event, now, urgent));
  held.falling.set(fight.id, next.catch(() => {}));
  await next;
  fight.keptMark = mark;
  if (led.bk) {
    fan(room, [INVASION_SEAM.stateOf(fight)]);
    await save(room, fight, now, true);
  }
}

/**
 * ONE BEAT of the cell's invasions: each fight stepped over its fighters, its words fanned, its ledger kept, it
 * checkpointed - and forgotten once its event is gone from the hub's book or long after its fall. Null when the cell
 * holds none; else when the next firing is due and whether one still beats.
 * @param {any} room
 */
export async function invasionTick(room) {
  const fights = await invasionFights(room);
  if (!fights.size) return null;
  const now = Date.now();
  let at = Infinity,
    live = false;
  for (const [id, fight] of [...fights]) {
    try {
      const event = await staffEventHeld(room, id, now);
      if (!event || (fight.fell && now >= fight.fell.at + INVASION_KEEP_MS)) {
        await forget(room, fights, id);
        continue;
      }
      if (fight.fell) continue;
      const bodies = bodiesOf(room, fight);
      fan(room, INVASION_SEAM.step(fight, now, bodies, rand01));
      await settle(room, fight, event, now);
      await save(room, fight, now, false);
      const busy = bodies.length > 0 && !fight.fell;
      live ||= busy;
      at = Math.min(at, now + (busy ? INVASION_TICK_MS : INVASION_IDLE_MS));
    } catch (e) {
      console.warn('[inv] beat failed', /** @type {any} */ (e)?.message ?? e);
      at = Math.min(at, now + INVASION_IDLE_MS);
    }
  }
  return fights.size ? { at: Number.isFinite(at) ? at : now + INVASION_IDLE_MS, live } : null;
}
