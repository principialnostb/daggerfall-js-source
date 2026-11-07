// @ts-check
// A TOYBOX EVENT'S NEWS, on every screen: its staging (the hub's book names it), its boss rising or its dragon landing,
// and its fall - on the World Events board as kind `invasion`, whatever region the player stands in. A staff event's
// news stays regional (systems/raidingParties.js). The laugh as an invasion's boss rises goes to the host's sound.
import { eventNotice } from '../eventNotices.js';
import { t } from '../textManager.js';
import { isToyboxEvent } from '../../net/staffEvent/toyboxEvent.js';
import { validStaffEvent, TB_INVASION } from '../../net/staffEvent/staffEventLaw.js';


/** What every screen is told when an invasion is staged. @param {string} city */
export const invasionStagedText = (city) => t('toybox.invasion.staged', '{city} is under siege and calls upon the aid of all heroes!', { city });
/** ...and when its boss begins to rise. @param {string} city */
export const invasionBossText = (city) => t('toybox.invasion.boss', 'Something vast rises from the ground of {city}.', { city });
/** ...and when it falls. @param {string} city */
export const invasionWonText = (city) => t('toybox.invasion.won', 'The siege of {city} is broken. Its heroes are rewarded.', { city });
/** What every screen is told when a dragon attack is staged. @param {string} city */
export const dragonStagedText = (city) => t('toybox.dragon.staged', 'Steam and shadows fill the streets of {city}...', { city });
/** ...and when the dragon lands. @param {string} city */
export const dragonLandsText = (city) => t('toybox.dragon.lands', 'The Dwarven Dragon descends on {city}!', { city });

/** The board's kind for every toybox event's line (systems/features.js EVENT_KINDS). */
export const TOYBOX_NEWS_KIND = 'invasion';
/** A toybox event's row and line id. @param {string} id */
export const toyboxNewsId = (id) => `tb:${id}`;

/** The lines said, `<id>:<moment>`, so a book said again at every hello says nothing twice. */
let _said = new Set();
const SAID_KEPT = 64;
/** @type {((cue: 'laugh') => void) | null} */
let _sound = null;
/** @type {(kind: string, text: string, id: string) => any} */
let _say = (kind, text, id) => eventNotice(kind, text, id);

/** The host's sound for the laugh (invasionRun.js invasionLaugh over audio.playOneShot). @param {((cue: 'laugh') => void) | null} fn */
export function setToyboxSound(fn) {
  _sound = typeof fn === 'function' ? fn : null;
}

/** The host's sound asked for now (an invasion's boss laughs again as each phase turns). Answers whether one was asked.
 *  @param {'laugh'} cue */
export function toyboxCue(cue) {
  try {
    _sound?.(cue);
  } catch {
    /* a sound that fails costs nothing */
  }
  return !!_sound;
}

const once = (/** @type {string} */ key) => {
  if (_said.has(key)) return false;
  _said.add(key);
  while (_said.size > SAID_KEPT) _said.delete(_said.values().next().value);
  return true;
};

/**
 * THE HUB'S BOOK READ for news: each toybox event in it said once, staged. Answers how many lines it said.
 * @param {unknown} list the book's events
 */
export function toyboxBookNews(list) {
  let n = 0;
  for (const raw of Array.isArray(list) ? list : []) {
    const e = validStaffEvent(raw);
    if (!e || !isToyboxEvent(e) || !once(`${e.id}:staged`)) continue;
    _say(TOYBOX_NEWS_KIND, e.tb === TB_INVASION ? invasionStagedText(e.nm) : dragonStagedText(e.nm), toyboxNewsId(e.id));
    n++;
  }
  return n;
}

/**
 * A MOMENT the hub said (`{k:'tb', id, s}`) of an event I hold: `boss` - an invasion's boss rises (and laughs), a dragon
 * lands; `won` - an invasion's siege is broken. Answers whether it said a line.
 * @param {{ id: string, tb?: number, nm: string } | null | undefined} e @param {string} moment
 */
export function toyboxMomentNews(e, moment) {
  if (!e || !isToyboxEvent(e) || !once(`${e.id}:${moment}`)) return false;
  const id = toyboxNewsId(e.id);
  if (moment === 'boss' && e.tb === TB_INVASION) {
    _say(TOYBOX_NEWS_KIND, invasionBossText(e.nm), id);
    try {
      _sound?.('laugh');
    } catch {
      /* a sound that fails never costs the line */
    }
    return true;
  }
  const text = moment === 'boss' ? dragonLandsText(e.nm) : e.tb === TB_INVASION ? invasionWonText(e.nm) : null; // a dragon's fall: its place's own line
  if (text) _say(TOYBOX_NEWS_KIND, text, id);
  return !!text;
}

/** Test seam: forget what was said, and say through `say` (null: the board). @param {((kind: string, text: string, id: string) => any) | null} [say] */
export function _resetToyboxNews(say = null) {
  _said = new Set();
  _sound = null;
  _say = say ?? ((kind, text, id) => eventNotice(kind, text, id));
}
