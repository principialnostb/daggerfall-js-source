// @ts-check
// AN INVASION'S FIGHT, kept by the cell its city stands in and stepped on that cell's alarm. Every foe's health lives
// here: its waves, the boss that rises after the tenth, its three phases, the endless waves of its third and its fall.
// A player's blow is a request this brain judges by the relay's own pose of that player, the gate's reach and bucket.
// The foes' blows are the gate's stamps (invasionBlows.js), laid with their wind-up and judged on the struck player's
// machine, as the gate's host's are. It keeps the staff event's ledger, so the event's receipts, board and moments
// read it unchanged. Pure; the relay (server/src/invasionFights.js) and the offline cell both run it.
import {
  clampLv,
  dpsRef,
  BUCKET_RATE_X,
  BUCKET_DEPTH_X,
  HIT_CAP_X,
  HIT_KINDS,
  MELEE_REACH,
  POSE_SLACK,
  THREAT_PICK,
  THREAT_DECAY,
} from '../gate/gateBrain.js';
import { invasionWaveSize, INVASION_PHASE3_WAVE, INVASION_BOSS_HP } from '../staffEvent/toyboxEvent.js';
import {
  newStaffLedger,
  staffEventEarned,
  STAFF_EVENT_ACCOUNTS_MAX,
  STAFF_EVENT_STAND_TICK_MS,
  STAFF_EVENT_TOTAL_MAX,
} from '../staffEvent/staffEventLaw.js';
import { INVASION_WAVES } from '../../systems/toybox/toyboxLaw.js';
import {
  INVASION_BLOW,
  INVASION_HEAVY,
  INVASION_HEAVY_EVERY_MS,
  INVASION_SLAM_NEAR_M,
  INVASION_BOSS_SWING,
  INVASION_FOE_SWING,
  invasionPhaseOf,
  invasionHeavyPick,
  invasionHeavyStamp,
  invasionSwingStamp,
} from './invasionBlows.js';

export {
  INVASION_BLOW,
  INVASION_SLAM_EVERY_MS,
  INVASION_SLAM_WINDUP_MS,
  INVASION_SLAM_RADIUS_M,
  INVASION_SLAM_SHARE,
  INVASION_SLAM_NEAR_M,
  INVASION_BOSS_SWING,
  INVASION_FOE_SWING,
} from './invasionBlows.js';

/** The brain's version: a checkpoint of another is let go. */
export const INVASION_BRAIN_V = 2;
/** The beat, the longest step one beat takes, the checkpoint, and the whole state said at least this often (ms). */
export const INVASION_TICK_MS = 250;
export const INVASION_STEP_MAX_MS = 1000;
export const INVASION_CHECKPOINT_MS = 2000;
export const INVASION_STATE_SEND_MS = 5000;
/** A fight no beat stepped this long is taken up where it stood, its blows in flight dropped. */
export const INVASION_SLEEP_MS = 5000;
/** Native units a metre (the wire's frame; the dragon's DRAGON_NATIVE_PER_M). */
export const INVASION_NATIVE_PER_M = 40;
/** Who stands in it: a living fighter within this of its site (m). */
export const INVASION_ARENA_R = 300;
/** The most fighters, the most blows an account lands a second, and a shot's or a spell's reach (m). */
export const INVASION_FIGHTERS_MAX = 128;
export const INVASION_HIT_HZ_MAX = 6;
export const INVASION_SHOT_R = 60;
/** A screen draws a foe walking round what the relay cannot see, so a swing is believed this much farther (m). */
export const INVASION_DRAW_SLACK_M = 2;

/** The boss rises out of the ground over this long and takes no blow meanwhile; it falls over this long (ms). */
export const INVASION_RISE_MS = 9000;
export const INVASION_FALL_MS = 4500;
/** Each body's radius and pace (m, m/s); a walk said again when its goal moves this far or this long has passed. */
export const INVASION_FOE_R = 0.6;
export const INVASION_BOSS_R = 1.8;
export const INVASION_FOE_SPEED = 3.4;
export const INVASION_BOSS_SPEED = 2.6;
export const INVASION_RESAY_M = 1.5;
export const INVASION_RESAY_MS = 1000;
/** A foe keeps its mark this long before it looks again. */
export const INVASION_RETARGET_MS = 3000;
/** A wave rises on a ring this far about the fighters' heart, never this near a fighter, this long after the last fell. */
export const INVASION_RING_M = 26;
export const INVASION_SPAWN_CLEAR_M = 10;
export const INVASION_WAVE_GAP_MS = 3000;
/** The most foes standing at once (the tenth wave is fifteen). */
export const INVASION_STANDING_MAX = 16;
/** A wave foe's health: these seconds of the fighters' mean reference damage, a little more each wave, never under the
 *  floor. A fighter's bucket spends about three of those seconds a second, so a foe takes a few blows. */
export const INVASION_FOE_S = 8;
export const INVASION_FOE_WAVE_X = 0.06;
export const INVASION_FOE_HP_MIN = 30;
/** A blow is forgotten this long after it lands; the most a state names. */
export const INVASION_BLOW_KEEP_MS = 1500;
export const INVASION_BLOWS_KEPT = 24;

const dist = (/** @type {number} */ fromX, /** @type {number} */ fromZ, /** @type {number} */ toX, /** @type {number} */ toZ) =>
  Math.hypot(fromX - toX, fromZ - toZ);
const round2 = (/** @type {number} */ value) => Math.round(value * 100) / 100;

/**
 * A fight born at its first fighter's arrival: event `ev` (its id, `mt` its family's kinds, `b` its boss's kind, `hp` its
 * boss's health), its site's native point, and the moment.
 * @param {{ ev: { id: string, mt: number[], b: number, hp?: number }, sx: number, sz: number, now: number }} birth
 */
export function newInvasionFight(birth) {
  const event = birth.ev;
  return {
    v: INVASION_BRAIN_V,
    id: event.id,
    kinds: [...event.mt],
    bossKind: event.b,
    bossHp: event.hp > 0 ? event.hp : INVASION_BOSS_HP,
    sx: birth.sx,
    sz: birth.sz,
    startedAt: birth.now,
    beatAt: birth.now,
    wave: 0,
    nextWaveAt: birth.now + INVASION_WAVE_GAP_MS,
    num: 0,
    foes: /** @type {any[]} */ ([]),
    boss: /** @type {any} */ (null),
    third: 0,
    ph: 0,
    players: /** @type {Record<string, any>} */ ({}),
    threat: /** @type {Record<string, number>} */ ({}),
    blows: /** @type {any[]} */ ([]),
    seq: 0,
    led: newStaffLedger(/** @type {any} */ ({ id: event.id }), birth.now),
    fell: /** @type {any} */ (null),
    dirty: true,
    saidAt: 0,
  };
}

/** Where a body stands at `now`: its walk carried on from its word (every screen carries it the same way). */
export function invasionFoeAt(/** @type {any} */ body, /** @type {number} */ now) {
  const walk = body?.mv;
  if (!walk || !(walk.v > 0)) return [body.x, body.z];
  const len = Math.hypot(walk.tx - walk.x, walk.tz - walk.z);
  if (len < 1e-6) return [walk.tx, walk.tz];
  const along = Math.min(len, (Math.max(0, now - walk.at) / 1000) * walk.v);
  return [walk.x + ((walk.tx - walk.x) / len) * along, walk.z + ((walk.tz - walk.z) / len) * along];
}

/**
 * A fighter in. One already in is seen again; a fight over takes no one new. Answers whether it is in.
 * @param {any} fight @param {string} sub @param {string} name @param {number} level @param {number} now
 */
export function joinInvasion(fight, sub, name, level, now) {
  const known = fight.players[sub];
  if (known) {
    if (typeof name === 'string' && name) known.name = name.slice(0, 24);
    known.seenAt = now;
    return true;
  }
  if (fight.fell || Object.keys(fight.players).length >= INVASION_FIGHTERS_MAX) return false;
  const clamped = clampLv(level);
  fight.players[sub] = {
    name: String(name ?? '').slice(0, 24),
    lv: clamped,
    bucket: BUCKET_DEPTH_X * dpsRef(clamped),
    bucketAt: now,
    rate: INVASION_HIT_HZ_MAX,
    rateAt: now,
    dealt: 0,
    kills: 0,
    hits: 0,
    joinedAt: now,
    seenAt: now,
  };
  return true;
}

/** The event's ledger, as the staff event keeps it: a stand a tick, a blow (`struck`), a kill. */
function credit(/** @type {any} */ fight, /** @type {string} */ sub, /** @type {number} */ now, /** @type {boolean} */ killed) {
  const led = fight.led;
  let rec = led.a[sub];
  if (!rec) {
    if (Object.keys(led.a).length >= STAFF_EVENT_ACCOUNTS_MAX) return;
    rec = led.a[sub] = { nm: '', n: 0, s: 0, last: 0, t: 0, tAt: 0, h: 0 };
  }
  rec.nm = fight.players[sub]?.name ?? '';
  rec.last = now;
  if (now - (rec.tAt ?? 0) >= STAFF_EVENT_STAND_TICK_MS) {
    rec.t = (rec.t ?? 0) + 1;
    rec.tAt = now;
  }
  rec.s = 1;
  if (killed) {
    rec.h = (rec.h ?? 0) + 1;
    rec.n += 1;
    led.n = Math.min(STAFF_EVENT_TOTAL_MAX, led.n + 1);
  }
}

/** The foe numbered `num` standing: 0 the boss. */
const foeOf = (/** @type {any} */ fight, /** @type {number} */ num) =>
  num === 0 ? (fight.boss && !fight.boss.dead ? fight.boss : null) : (fight.foes.find((foe) => foe.i === num) ?? null);

/**
 * A BLOW from `sub` on foe `num` (0 the boss) of kind `kind` (HIT_KINDS), claiming `claim`, struck from `pose` - the
 * relay's own pose of that fighter (`{x, z}`, the site's frame), never the blow's word. Answers the damage taken, 0
 * refused: a stranger, a fight over, no such foe, a boss still rising, past the blow rate, no pose, out of reach (a swing
 * within MELEE_REACH and the slacks of its body, a shot or a spell within INVASION_SHOT_R). Then the gate's one-blow cap
 * and bucket hold it, so no claim lands more than the fighter's level can deal. @param {any} fight @param {string} sub
 * @param {number} claim @param {number} kind @param {{x: number, z: number}|null} pose @param {number} now @param {number} num
 */
export function applyInvasionHit(fight, sub, claim, kind, pose, now, num) {
  const player = fight.players[sub];
  const foe = Number.isInteger(num) ? foeOf(fight, num) : null;
  if (!player || fight.fell || !foe || !Number.isFinite(claim) || !(claim > 0)) return 0;
  if (foe === fight.boss && now < foe.up) return 0;
  player.rate = Math.min(INVASION_HIT_HZ_MAX, player.rate + ((now - player.rateAt) / 1000) * INVASION_HIT_HZ_MAX);
  player.rateAt = now;
  if (player.rate < 1) return 0;
  player.rate -= 1;
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.z)) return 0;
  const [foeX, foeZ] = invasionFoeAt(foe, now);
  const gap = dist(pose.x, pose.z, foeX, foeZ) - (foe === fight.boss ? INVASION_BOSS_R : INVASION_FOE_R);
  const reach = kind === HIT_KINDS.Melee ? MELEE_REACH + POSE_SLACK + INVASION_DRAW_SLACK_M : INVASION_SHOT_R;
  if (gap > reach) return 0;
  player.seenAt = now;
  const ref = dpsRef(player.lv);
  player.bucket = Math.min(
    BUCKET_DEPTH_X * ref,
    player.bucket + (Math.max(0, now - player.bucketAt) / 1000) * BUCKET_RATE_X * ref,
  );
  player.bucketAt = now;
  const got = Math.max(0, Math.min(claim, HIT_CAP_X * ref, player.bucket, foe.h));
  player.bucket -= got;
  if (!(got > 0)) return 0;
  player.dealt += got;
  player.hits++;
  fight.threat[sub] = (fight.threat[sub] ?? 0) + got;
  foe.h -= got;
  fight.dirty = true;
  const killed = foe.h <= 1e-6;
  credit(fight, sub, now, killed);
  if (killed) {
    player.kills++;
    if (foe === fight.boss) fall(fight, sub, now);
    else {
      fight.foes = fight.foes.filter((other) => other !== foe);
      if (!fight.foes.length) fight.nextWaveAt = now + INVASION_WAVE_GAP_MS;
    }
  }
  return got;
}

/** THE FALL: the boss dead where it stood, every foe still standing crumbled with it, the ledger's moment kept. */
function fall(/** @type {any} */ fight, /** @type {string} */ sub, /** @type {number} */ now) {
  const boss = fight.boss;
  const [bossX, bossZ] = invasionFoeAt(boss, now);
  boss.x = round2(bossX);
  boss.z = round2(bossZ);
  boss.mv = null;
  boss.h = 0;
  boss.dead = 1;
  fight.foes = [];
  fight.blows = [];
  fight.fell = { at: now, by: sub };
  const led = fight.led;
  led.bk = 1;
  led.bossN = (led.bossN ?? 0) + 1;
  led.kb = sub;
  led.fellAt = now;
}

/** Did `sub` earn the event's receipt? Only a fallen boss pays, and only a fighter whose blow the relay took. */
export function invasionEarned(/** @type {any} */ fight, /** @type {string} */ sub) {
  return !!fight.fell && staffEventEarned(fight.led, { tb: 1 }).some((row) => row.acct === sub);
}

/** A wave foe's health, over the levels of the fighters about. @param {number[]} levels @param {number} wave */
export function invasionFoeHp(levels, wave) {
  const mean = levels.length ? levels.reduce((sum, level) => sum + dpsRef(level), 0) / levels.length : dpsRef(1);
  return Math.max(INVASION_FOE_HP_MIN, Math.round(INVASION_FOE_S * mean * (1 + INVASION_FOE_WAVE_X * wave)));
}

/** The living fighters standing in it now. */
function fightersHere(/** @type {any} */ fight, /** @type {any[]} */ bodies) {
  return bodies.filter(
    (body) =>
      !body.dead &&
      fight.players[body.sub] &&
      Number.isFinite(body.x) &&
      Number.isFinite(body.z) &&
      Math.hypot(body.x, body.z) <= INVASION_ARENA_R,
  );
}

/** The fighters' heart: the mean of where they stand. */
function heartOf(/** @type {any[]} */ here) {
  return [here.reduce((sum, body) => sum + body.x, 0) / here.length, here.reduce((sum, body) => sum + body.z, 0) / here.length];
}

/** Spots for `count` risers on a ring about the fighters' heart, each clear of every fighter. */
function ringSpots(/** @type {any[]} */ here, /** @type {number} */ count, /** @type {() => number} */ rng) {
  const [heartX, heartZ] = heartOf(here);
  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 30; tries++) {
    const angle = rng() * 2 * Math.PI;
    const spotX = heartX + Math.sin(angle) * INVASION_RING_M;
    const spotZ = heartZ + Math.cos(angle) * INVASION_RING_M;
    if (Math.hypot(spotX, spotZ) > INVASION_ARENA_R) continue;
    if (here.some((body) => dist(body.x, body.z, spotX, spotZ) < INVASION_SPAWN_CLEAR_M)) continue;
    spots.push([round2(spotX), round2(spotZ)]);
  }
  for (let k = 0; spots.length < count; k++) {
    const angle = (k / count) * 2 * Math.PI;
    spots.push([round2(heartX + Math.sin(angle) * INVASION_RING_M), round2(heartZ + Math.cos(angle) * INVASION_RING_M)]);
  }
  return spots;
}

/** A wave risen: `count` of the family's kinds, dealt round in turn. */
function raiseWave(/** @type {any} */ fight, /** @type {number} */ count, /** @type {any[]} */ here, /** @type {number} */ now, /** @type {() => number} */ rng) {
  const room = Math.max(0, INVASION_STANDING_MAX - fight.foes.length);
  const health = invasionFoeHp(
    here.map((body) => fight.players[body.sub].lv),
    fight.wave,
  );
  const spots = ringSpots(here, Math.min(count, room), rng);
  for (const [x, z] of spots) {
    const kind = fight.kinds[Math.floor(rng() * fight.kinds.length) % fight.kinds.length];
    fight.foes.push({ i: ++fight.num, k: kind, h: health, m: health, x, z, mv: null, tg: null, tgAt: 0, busy: 0, up: now });
  }
  fight.dirty = true;
}

/** The boss rises at the fighters' heart: still for INVASION_RISE_MS, its ledger's moment kept. */
function raiseBoss(/** @type {any} */ fight, /** @type {any[]} */ here, /** @type {number} */ now) {
  const [heartX, heartZ] = heartOf(here);
  const angle = Math.atan2(-heartX, -heartZ);
  const riseX = heartX + Math.sin(angle) * (INVASION_RING_M / 2);
  const riseZ = heartZ + Math.cos(angle) * (INVASION_RING_M / 2);
  fight.boss = {
    i: 0,
    k: fight.bossKind,
    h: fight.bossHp,
    m: fight.bossHp,
    x: round2(riseX),
    z: round2(riseZ),
    mv: null,
    tg: null,
    tgAt: 0,
    busy: 0,
    up: now + INVASION_RISE_MS,
    heavyAt: now + INVASION_RISE_MS + INVASION_HEAVY_EVERY_MS[0],
    lastHeavy: null,
    dead: 0,
  };
  fight.ph = 1;
  fight.led.bd = 1;
  fight.led.bu = 1;
  fight.dirty = true;
}

/** A walk said toward `goal`, `stop` short of it, at `speed` - said again only when its goal has moved on. */
function walk(/** @type {any} */ body, /** @type {any} */ goal, /** @type {number} */ stop, /** @type {number} */ speed, /** @type {number} */ now) {
  const gap = dist(goal.x, goal.z, body.x, body.z);
  const go = Math.max(0, gap - stop);
  const toX = round2(body.x + (gap > 0 ? ((goal.x - body.x) / gap) * go : 0));
  const toZ = round2(body.z + (gap > 0 ? ((goal.z - body.z) / gap) * go : 0));
  const was = body.mv;
  if (was && dist(was.tx, was.tz, toX, toZ) < INVASION_RESAY_M && now - was.at < INVASION_RESAY_MS) return false;
  if (!was && dist(toX, toZ, body.x, body.z) < 0.05) return false;
  body.mv = { x: round2(body.x), z: round2(body.z), tx: toX, tz: toZ, v: speed, at: now };
  body.x = body.mv.x;
  body.z = body.mv.z;
  return true;
}
/** Has its walk come to its end? */
const walkDone = (/** @type {any} */ body, /** @type {number} */ now) =>
  !!body.mv && now - body.mv.at >= (dist(body.mv.x, body.mv.z, body.mv.tx, body.mv.tz) / body.mv.v) * 1000;

/** Its mark: kept INVASION_RETARGET_MS; the boss's the most threat THREAT_PICK of the time, a wave foe's the nearest. */
function markOf(/** @type {any} */ fight, /** @type {any} */ body, /** @type {any[]} */ here, /** @type {number} */ now, /** @type {() => number} */ rng) {
  const kept = body.tg ? here.find((other) => other.sub === body.tg) : null;
  if (kept && now - body.tgAt < INVASION_RETARGET_MS) return kept;
  let mark = null;
  if (body === fight.boss && rng() < THREAT_PICK) {
    for (const other of here) if (!mark || (fight.threat[other.sub] ?? 0) > (fight.threat[mark.sub] ?? 0)) mark = other;
  } else for (const other of here) if (!mark || dist(other.x, other.z, body.x, body.z) < dist(mark.x, mark.z, body.x, body.z)) mark = other;
  body.tg = mark?.sub ?? null;
  body.tgAt = now;
  return mark;
}

/** A blow laid: its stamp on the ground, landing after its wind-up. */
function lay(/** @type {any} */ fight, /** @type {any} */ body, /** @type {number} */ blow, /** @type {any[]} */ stamp, /** @type {number} */ windup, /** @type {number} */ share, /** @type {number} */ now) {
  fight.blows.push({ s: ++fight.seq, i: body.i, a: blow, at: now + windup, wu: windup, p: share, st: stamp });
  if (fight.blows.length > INVASION_BLOWS_KEPT) fight.blows.shift();
  fight.dirty = true;
}

/** THE BOSS'S HEAVY BLOW: one its phase allows, aimed at its mark. A charge carries it down its lane as it lands, never
 *  out of the arena. Answers whether it threw one. */
function heavy(/** @type {any} */ fight, /** @type {any} */ boss, /** @type {any} */ mark, /** @type {number} */ now, /** @type {() => number} */ rng) {
  const gap = mark ? dist(mark.x, mark.z, boss.x, boss.z) : 0;
  const yaw = mark && gap > 0.05 ? Math.atan2(mark.x - boss.x, mark.z - boss.z) : 0;
  const key = invasionHeavyPick(fight.ph, gap, boss.lastHeavy, rng);
  const laid = key ? invasionHeavyStamp(key, boss.x, boss.z, yaw, fight.ph) : null;
  if (!key || !laid) return false;
  const kit = /** @type {any} */ (INVASION_HEAVY)[key];
  lay(fight, boss, kit.a, laid.st, laid.wu, kit.share, now);
  const at = now + laid.wu;
  let dash = 0;
  if (key === 'charge') {
    const run = Math.max(0, Math.min(kit.len - INVASION_BOSS_R, INVASION_ARENA_R - Math.hypot(boss.x, boss.z)));
    dash = kit.dash;
    if (run > 0.5) {
      const toX = round2(boss.x + Math.sin(yaw) * run);
      const toZ = round2(boss.z + Math.cos(yaw) * run);
      boss.mv = { x: boss.x, z: boss.z, tx: toX, tz: toZ, v: round2(run / (dash / 1000)), at };
    }
  }
  boss.busy = at + dash + INVASION_BOSS_SWING.recover;
  boss.heavyAt = now + INVASION_HEAVY_EVERY_MS[Math.max(0, fight.ph - 1)];
  boss.lastHeavy = key;
  return true;
}

/** One body's turn: its blow in flight runs out; then the boss's heavy blow (while a fighter is near), a swing within
 *  reach of its mark, or a walk at it. */
function turn(/** @type {any} */ fight, /** @type {any} */ body, /** @type {any[]} */ here, /** @type {number} */ now, /** @type {() => number} */ rng) {
  const [bodyX, bodyZ] = invasionFoeAt(body, now);
  if (now < body.busy || now < body.up) return;
  if (walkDone(body, now)) {
    body.mv = null;
    body.x = round2(bodyX);
    body.z = round2(bodyZ);
  }
  const boss = body === fight.boss;
  const near = (/** @type {number} */ reach) => here.some((other) => dist(other.x, other.z, bodyX, bodyZ) <= reach);
  const mark = markOf(fight, body, here, now, rng);
  if (boss && now >= body.heavyAt && near(INVASION_SLAM_NEAR_M)) {
    stand(body, bodyX, bodyZ);
    if (heavy(fight, body, mark, now, rng)) return;
  }
  if (!mark) {
    if (body.mv) {
      stand(body, bodyX, bodyZ);
      fight.dirty = true;
    }
    return;
  }
  const kit = boss ? INVASION_BOSS_SWING : INVASION_FOE_SWING;
  const bodyR = boss ? INVASION_BOSS_R : INVASION_FOE_R;
  if (dist(mark.x, mark.z, bodyX, bodyZ) <= kit.r + bodyR * 0.5) {
    stand(body, bodyX, bodyZ);
    lay(fight, body, INVASION_BLOW.swing, invasionSwingStamp(body.x, body.z, kit.r), kit.windup, kit.share, now);
    body.busy = now + kit.windup + kit.recover;
    return;
  }
  body.x = bodyX;
  body.z = bodyZ;
  if (walk(body, mark, bodyR + 0.8, boss ? INVASION_BOSS_SPEED : INVASION_FOE_SPEED, now)) fight.dirty = true;
}
/** A body stopped where it has come to. */
function stand(/** @type {any} */ body, /** @type {number} */ atX, /** @type {number} */ atZ) {
  body.mv = null;
  body.x = round2(atX);
  body.z = round2(atZ);
}

/**
 * ONE BEAT over the census (`bodies`: `{sub, x, z, dead}` in the site's frame, metres): the fighters seen, the next wave
 * once the last is dead, the boss after the tenth, its third phase's endless waves, each body's turn, and the whole state
 * said when it moved. Answers the words to fan.
 * @param {any} fight @param {number} now @param {any[]} bodies @param {() => number} rng
 */
export function stepInvasion(fight, now, bodies, rng) {
  const out = [];
  if (fight.fell) return out;
  const dt = Math.max(0, Math.min(INVASION_STEP_MAX_MS, now - fight.beatAt));
  fight.beatAt = now;
  const here = fightersHere(fight, bodies);
  for (const body of here) fight.players[body.sub].seenAt = now;
  for (const sub of Object.keys(fight.threat)) fight.threat[sub] *= Math.max(0, 1 - THREAT_DECAY * (dt / 1000));
  const kept = fight.blows.filter((blow) => now < blow.at + INVASION_BLOW_KEEP_MS);
  if (kept.length !== fight.blows.length) fight.blows = kept;
  if (!fight.foes.length && now >= fight.nextWaveAt && here.length) {
    if (fight.wave < INVASION_WAVES) {
      raiseWave(fight, invasionWaveSize(fight.wave), here, now, rng);
      fight.wave++;
    } else if (!fight.boss) raiseBoss(fight, here, now);
    else if (fight.third) raiseWave(fight, INVASION_PHASE3_WAVE, here, now, rng);
  }
  const phase = fight.boss && !fight.boss.dead ? invasionPhaseOf(fight.boss.h, fight.boss.m) : fight.ph;
  if (phase > fight.ph) {
    fight.ph = phase;
    fight.boss.heavyAt = Math.min(fight.boss.heavyAt, now);
    fight.dirty = true;
  }
  if (fight.boss && !fight.third && fight.ph >= 3) {
    fight.third = 1;
    fight.nextWaveAt = now;
    fight.dirty = true;
  }
  for (const body of [...fight.foes, ...(fight.boss ? [fight.boss] : [])]) turn(fight, body, here, now, rng);
  if (fight.dirty || now - fight.saidAt >= INVASION_STATE_SEND_MS) out.push(invasionStateOf(fight));
  return out;
}

/** A fight woken past its sleep: its walks begun again from where each stands, its blows in flight dropped. */
export function invasionResume(/** @type {any} */ fight, /** @type {number} */ now) {
  if (fight.fell || now - fight.beatAt < INVASION_SLEEP_MS) return [];
  fight.beatAt = now;
  fight.blows = [];
  for (const body of [...fight.foes, ...(fight.boss ? [fight.boss] : [])]) {
    body.mv = null;
    body.busy = 0;
  }
  if (fight.boss) fight.boss.heavyAt = Math.max(fight.boss.heavyAt, now + INVASION_HEAVY_EVERY_MS[Math.max(0, fight.ph - 1)]);
  return [invasionStateOf(fight)];
}

/** A body as the state says it: `[i, kind, h, m, x, z, tx, tz, v, at, up, dead]`. */
const bodyRow = (/** @type {any} */ body) => {
  const walk = body.mv;
  return [
    body.i,
    body.k,
    Math.ceil(body.h),
    Math.round(body.m),
    walk ? walk.x : round2(body.x),
    walk ? walk.z : round2(body.z),
    walk ? walk.tx : round2(body.x),
    walk ? walk.tz : round2(body.z),
    walk ? walk.v : 0,
    walk ? walk.at : 0,
    body.up ?? 0,
    body.dead ? 1 : 0,
  ];
};

/** THE WHOLE FIGHT, as every screen draws it (the `st` word): its site, wave, the boss's phase (0 before it rises), its
 *  third phase, kills, fighters, every body standing, the blows in flight (each `[s, i, a, at, wu, p, stamp]`) and the
 *  fall. Said marks it clean. @param {any} fight */
export function invasionStateOf(fight) {
  fight.dirty = false;
  fight.saidAt = fight.beatAt;
  return {
    k: 'st',
    id: fight.id,
    sx: fight.sx,
    sz: fight.sz,
    w: fight.wave,
    ph: fight.ph,
    p3: fight.third,
    n: fight.led.n,
    np: Object.keys(fight.players).length,
    f: [...fight.foes, ...(fight.boss ? [fight.boss] : [])].map(bodyRow),
    b: fight.blows.map((blow) => [blow.s, blow.i, blow.a, blow.at, blow.wu, blow.p, [...blow.st]]),
    fl: fight.fell ? fight.fell.at : 0,
  };
}
