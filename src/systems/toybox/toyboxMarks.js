// @ts-check
// A TOYBOX EVENT ON THE MAP AND IN THE TIMERS, for every player: its city marked on the held map's `raids` source
// (ui/eventMapMarks.js's shape), with its countdown to its start, and its row in the Timers window and on the World
// Events board (systems/eventTimers.js `toybox`). An invasion wears its own purple mark and words ("Invasion in 0:42",
// "Invasion Active"); a dragon attack its orange one ("Dragon Attack in 0:42", "Dragon Attacking for 39:10"). Read off
// the events this machine holds (systems/staffEvents.js), online the hub's book, offline the local runner's. An event
// past its end, or a dragon attack whose dragon fell here, is gone at once, before the book says so.
import { staffRaids, staffLedgerOf } from '../staffEvents.js';
import { staffEventGo, staffEventLapsed, TB_INVASION, TB_DRAGON } from '../../net/staffEvent/staffEventLaw.js';
import { isToyboxEvent, familyOfEvent, invasionWaveOf } from '../../net/staffEvent/toyboxEvent.js';
import { INVASION_WAVES } from './toyboxLaw.js';
import { toyboxNewsId } from './toyboxNews.js';
import { t } from '../textManager.js';
import { countdownText } from '../../net/gate/gateLaw.js'; // "9:42", the gate's own countdown
import { calledFell } from '../dragon/calledDragons.js';

/** A family's name as a player reads it, by its id: each a literal, so the catalog can list it. */
const FAMILY_NAMES = Object.freeze({
  daedra: () => t('toybox.family.daedra', 'Daedra'),
  undead: () => t('toybox.family.undead', 'Undead'),
  werewolves: () => t('toybox.family.werewolves', 'Werewolves'),
  orcs: () => t('toybox.family.orcs', 'Orcs'),
  humans: () => t('toybox.family.humans', 'Humans'),
});
/** @param {{ id: string, label: string }} fam */
const familyName = (fam) => /** @type {Record<string, () => string>} */ (FAMILY_NAMES)[fam.id]?.() ?? fam.label;

/** An invasion's own mark on the held map (ui/ink/inkMap.js paintInvasionMark), and a dragon attack's (paintDragonMark). */
export const INVASION_ICON = 'invasion';
export const DRAGON_ICON = 'dragon';

/** The toybox events live here at `nowMs`: none ended, none past its end, no dragon attack whose dragon fell here.
 *  @param {number} nowMs @param {any[]} [raids] staffRaids()' */
export const toyboxRaids = (nowMs, raids = staffRaids()) =>
  raids.filter(
    (raid) =>
      !raid.cleansed &&
      isToyboxEvent(raid.staff) &&
      !staffEventLapsed(raid.staff, nowMs) &&
      !(raid.staff.tb === TB_DRAGON && calledFell(raid.staff.id)),
  );

/** A dragon attack's words, its mark's and its card's alike: its countdown to landing, then its fight's time left.
 *  @param {any} e @param {number} nowMs */
export function dragonAttackText(e, nowMs) {
  const go = staffEventGo(e);
  return nowMs < go
    ? t('toybox.map.dragonIn', 'Dragon Attack in {time}', { time: countdownText(go - nowMs) })
    : t('toybox.map.dragonFor', 'Dragon Attacking for {time}', { time: countdownText(Math.max(0, e.ue - nowMs)) });
}

/** Its title: "Invasion of Wayrest", "Dragon attack on Wayrest". @param {any} e */
export const toyboxTitle = (e) =>
  e.tb === TB_INVASION
    ? t('toybox.title.invasion', 'Invasion of {city}', { city: e.nm })
    : t('toybox.title.dragon', 'Dragon attack on {city}', { city: e.nm });

/** What it is doing now, once begun: the wave, its master risen, the dragon come. @param {any} e */
function stateLine(e) {
  if (e.tb !== TB_INVASION) return t('toybox.state.dragonIn', 'The Dwarven Dragon is in the streets');
  const led = staffLedgerOf(e.id);
  if (led?.bu) return t('toybox.state.bossUp', 'Its master has risen. Bring it down');
  const w = Math.min(INVASION_WAVES, invasionWaveOf(led?.n ?? 0) + 1);
  return t('toybox.state.wave', 'Wave {n} of {of}', { n: w, of: INVASION_WAVES });
}

/**
 * THE TIMERS' ROWS: each toybox event coming (to its start) or live (to its end), at its city's pixel. Pure but for
 * the ledgers it reads. @param {number} nowMs the relay's clock (offline, this machine's) @param {any[]} [raids]
 */
export function toyboxTimerRows(nowMs, raids = staffRaids()) {
  const rows = [];
  for (const raid of toyboxRaids(nowMs, raids)) {
    const e = raid.staff,
      go = staffEventGo(e),
      fam = familyOfEvent(e);
    const base = { id: toyboxNewsId(e.id), kind: 'invasion', title: toyboxTitle(e), where: e.nm, px: e.px, py: e.py };
    if (nowMs < go)
      rows.push({
        ...base,
        detail: fam
          ? t('toybox.detail.gather', '{family} gather. The siege begins when this runs out', { family: familyName(fam) })
          : t('toybox.detail.dragon', 'The dragon lands when this runs out'),
        live: false,
        at: go,
        until: null,
        since: e.at,
      });
    else rows.push({ ...base, detail: stateLine(e), live: true, at: e.ue, until: e.ue, since: go });
  }
  return rows;
}

/**
 * THE MAP'S MARKS: each toybox event at its city's pixel, its label with the countdown to its start, its tip what it
 * is; an invasion's `icon` and `text`, the words drawn by its mark. The held map reads them with the raided towns
 * (scenes/world.js's `raids` source).
 * @param {number} nowMs @param {any[]} [raids]
 */
export function toyboxMapMarks(nowMs, raids = staffRaids()) {
  return toyboxRaids(nowMs, raids).map((raid) => {
    const e = raid.staff,
      go = staffEventGo(e),
      fam = familyOfEvent(e);
    const coming = nowMs < go;
    const label = coming
      ? e.tb === TB_INVASION
        ? t('toybox.label.invasionIn', '{city} - invasion in {time}', { city: e.nm, time: countdownText(go - nowMs) })
        : t('toybox.label.dragonIn', '{city} - dragon in {time}', { city: e.nm, time: countdownText(go - nowMs) })
      : e.tb === TB_INVASION
        ? t('toybox.label.siege', '{city} - under siege', { city: e.nm })
        : t('toybox.label.dragon', '{city} - dragon attack', { city: e.nm });
    const lines = [e.nm];
    if (fam) lines.push(t('toybox.tip.invading', '{family} invading', { family: familyName(fam) }));
    if (e.tb !== TB_INVASION) lines.push(dragonAttackText(e, nowMs));
    else lines.push(coming ? t('toybox.tip.begins', 'Begins in {time}', { time: countdownText(go - nowMs) }) : stateLine(e));
    const icon =
      e.tb === TB_INVASION
        ? {
            icon: INVASION_ICON,
            text: coming
              ? t('toybox.map.invasionIn', 'Invasion in {time}', { time: countdownText(go - nowMs) })
              : t('toybox.map.invasionActive', 'Invasion Active'),
          }
        : { icon: DRAGON_ICON, text: dragonAttackText(e, nowMs) };
    return {
      key: toyboxNewsId(e.id),
      px: e.px,
      py: e.py,
      label,
      ...icon,
      tip: {
        title: e.tb === TB_INVASION ? t('toybox.tip.invasion', 'Invasion') : t('toybox.tip.dragon', 'Dragon Attack'),
        lines,
      },
    };
  });
}
