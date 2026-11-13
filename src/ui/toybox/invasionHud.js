// @ts-check
// AN INVASION'S READOUTS, made from the cell's state (net/invasion/invasionBrain.js invasionStateOf): the side panel's
// lines (ui/toybox/invasionTracker.js draws them) and the boss's bar (the gate's, ui/gate/gateBossBar.js, its three
// phases marked where the brain turns them). The same state comes from the relay online and the local cell offline,
// so both read the same. Pure.
import { FELL_HOLD_MS, FELL_FADE_MS } from '../gate/gateBossBar.js';
import { LOW_HEALTH } from '../../world/gate/gateBoss.js';
import { t, getLocalizedEnemyName } from '../../systems/textManager.js';
import { enemyDisplayName } from '../../characters/enemy/enemyBasics.js';
import { INVASION_WAVES, INVASION_FAMILIES } from '../../systems/toybox/toyboxLaw.js';
import { INVASION_BLOW, INVASION_PHASE_AT, INVASION_PHASES } from '../../net/invasion/invasionBlows.js';

/** The panel stays this long after the boss falls (ms). */
export const INVASION_HUD_FELL_MS = 10_000;
/** The blows' colours on the bar (css): the heavy blows are all physical. */
export const INVASION_BAR_CSS = Object.freeze({ blow: '#ff9a5a', ring: '#e85a3a' });

/** The words, each in the player's language. */
export const INVASION_HUD_TEXT = Object.freeze({
  title: (/** @type {string} */ city) => t('toybox.invasion.hud.title', 'Invasion of {city}', { city }),
  wave: (/** @type {number} */ wave, /** @type {number} */ waves, /** @type {number} */ left) =>
    t('toybox.invasion.hud.wave', 'Wave {wave} of {waves} - {left} left', { wave, waves, left }),
  broken: (/** @type {number} */ waves) => t('toybox.invasion.hud.broken', 'All {waves} waves broken', { waves }),
  endless: () => t('toybox.invasion.hud.endless', 'The waves are endless now'),
  foes: (/** @type {number} */ n) =>
    n === 1 ? t('toybox.invasion.hud.foe', '1 foe stands') : t('toybox.invasion.hud.foes', '{n} foes stand', { n }),
  gathers: () => t('toybox.invasion.hud.gathers', 'The next wave gathers'),
  awaits: (/** @type {string} */ boss) => t('toybox.invasion.hud.awaits', '{boss} rises after the last wave', { boss }),
  rising: (/** @type {string} */ boss) => t('toybox.invasion.hud.rising', '{boss} rises from the ground', { boss }),
  phase: (/** @type {string} */ boss, /** @type {number} */ phase, /** @type {number} */ phases) =>
    t('toybox.invasion.hud.phase', '{boss} - phase {phase} of {phases}', { boss, phase, phases }),
  fallen: (/** @type {string} */ boss) => t('toybox.invasion.hud.fallen', '{boss} has fallen', { boss }),
  barTitle: () => t('toybox.invasion.bar.title', 'Lord of the Invasion'),
  barRising: () => t('toybox.invasion.bar.rising', 'Rising'),
  barFallen: () => t('toybox.invasion.bar.fallen', 'Fallen'),
  barPhase: (/** @type {number} */ phase, /** @type {number} */ phases) =>
    t('toybox.invasion.bar.phase', 'Phase {phase} of {phases}', { phase, phases }),
  defenders: (/** @type {number} */ n) =>
    n === 1 ? t('toybox.invasion.bar.defender', '1 defender') : t('toybox.invasion.bar.defenders', '{n} defenders', { n }),
  phase2: (/** @type {string} */ boss) => t('toybox.invasion.phase2', '{boss} roars. Its blows grow wide and wild!', { boss }),
  phase3: (/** @type {string} */ boss) => t('toybox.invasion.phase3', '{boss} calls its host. The waves will not end!', { boss }),
});
/** The heavy blows' names on the bar, by wire number. */
export const INVASION_BLOW_NAME = Object.freeze({
  [INVASION_BLOW.slam]: () => t('toybox.invasion.blow.slam', 'Ground Slam'),
  [INVASION_BLOW.cleave]: () => t('toybox.invasion.blow.cleave', 'Cleave'),
  [INVASION_BLOW.charge]: () => t('toybox.invasion.blow.charge', 'Charge'),
  [INVASION_BLOW.stomp]: () => t('toybox.invasion.blow.stomp', 'Quake Stomp'),
});

/** Each family's boss by a name of its own, not its creature's. */
const BOSS_NAMES = Object.freeze({
  daedra: () => t('toybox.invasion.bossName.daedra', 'Daedric Commander'),
  undead: () => t('toybox.invasion.bossName.undead', 'Grand Necromancer'),
  werewolves: () => t('toybox.invasion.bossName.werewolves', 'The Grand Hunt'),
  orcs: () => t('toybox.invasion.bossName.orcs', 'Warlord Dagnub'),
  humans: () => t('toybox.invasion.bossName.humans', 'Fallen Knight of Akatosh'),
});
/** The boss's name, by its kind: its family's own, else its creature's. @param {number} kind */
export const invasionBossName = (kind) => {
  const family = INVASION_FAMILIES.find((one) => one.boss === kind);
  const own = family ? /** @type {any} */ (BOSS_NAMES)[family.id] : null;
  return own ? own() : (getLocalizedEnemyName(kind, enemyDisplayName(kind) ?? '') ?? '');
};
/** The boss's row in a state (`[i, kind, h, m, ..., up, dead]`), or null. @param {any} state */
export const invasionBossRow = (state) => state?.f?.find((/** @type {number[]} */ row) => row[0] === 0) ?? null;

/**
 * THE PANEL'S LINES for event `event` (`nm` its city, `b` its boss's kind) and the cell's state (null before one is
 * heard) at `now` (the relay's clock): `{ title, wave, foes, boss, phase }`.
 * @param {any} event @param {any} state @param {number} now
 */
export function invasionTrackerModel(event, state, now) {
  const row = invasionBossRow(state);
  const name = invasionBossName(row ? row[1] : event?.b);
  const done = state?.w ?? 0;
  const standing = state ? state.f.filter((/** @type {number[]} */ one) => one[0] !== 0 && !one[11]).length : 0;
  let wave, boss;
  if (!row) {
    const now1 = Math.max(1, Math.min(INVASION_WAVES, done));
    wave = INVASION_HUD_TEXT.wave(now1, INVASION_WAVES, INVASION_WAVES - now1);
    boss = INVASION_HUD_TEXT.awaits(name);
  } else {
    wave = state.p3 ? INVASION_HUD_TEXT.endless() : INVASION_HUD_TEXT.broken(INVASION_WAVES);
    boss = row[11] || state.fl
      ? INVASION_HUD_TEXT.fallen(name)
      : now < row[10]
        ? INVASION_HUD_TEXT.rising(name)
        : INVASION_HUD_TEXT.phase(name, Math.max(1, state.ph), INVASION_PHASES);
  }
  const foes = standing ? INVASION_HUD_TEXT.foes(standing) : !row && done < INVASION_WAVES ? INVASION_HUD_TEXT.gathers() : '';
  return { title: INVASION_HUD_TEXT.title(event?.nm ?? ''), wave, foes, boss, phase: row ? Math.max(1, state.ph) : 0 };
}

/**
 * THE BOSS'S BAR (the gate bar's model) from the state at `now`, or null before it rises. `winding` the heavy blow it
 * winds up (scenes/invasionMarks.js winding: its kind, how far, whether it holds my feet).
 * @param {any} state @param {number} now @param {{ a: number, t: number, aimed: boolean } | null} [winding]
 */
export function invasionBarModel(state, now, winding = null) {
  const row = invasionBossRow(state);
  if (!row) return null;
  const [, kind, health, most, , , , , , , up, dead] = row;
  const fell = !!dead || state.fl > 0;
  const frac = fell ? 0 : most > 0 ? Math.max(0, Math.min(1, health / most)) : 1;
  const since = fell ? Math.max(0, now - (state.fl || now)) : 0;
  const alpha = fell ? Math.max(0, Math.min(1, 1 - (since - FELL_HOLD_MS) / FELL_FADE_MS)) : 1;
  const phase = Math.max(1, state.ph | 0);
  const rising = !fell && now < up;
  const named = winding ? /** @type {any} */ (INVASION_BLOW_NAME)[winding.a] : null;
  return {
    theme: '',
    ringCss: INVASION_BAR_CSS.ring,
    name: invasionBossName(kind),
    title: INVASION_HUD_TEXT.barTitle(),
    epithet: '',
    epithetColor: null,
    marksView: null,
    trials: '',
    frac,
    marks: [...INVASION_PHASE_AT],
    phase,
    spent: INVASION_PHASE_AT.map((_, i) => phase > i + 1),
    warded: rising,
    wardedText: INVASION_HUD_TEXT.barRising(),
    fallen: fell,
    fallenText: INVASION_HUD_TEXT.barFallen(),
    callout: !fell && !rising && named ? { text: named(), color: INVASION_BAR_CSS.blow, t: winding?.t ?? 0, dagon: false, move: !!winding?.aimed } : null,
    wrath: null,
    wrathNear: false,
    fighters: state.np | 0,
    fightersLine: INVASION_HUD_TEXT.defenders(state.np | 0),
    host: fell ? null : INVASION_HUD_TEXT.barPhase(phase, INVASION_PHASES),
    reckonIn: null,
    alpha: Math.round(alpha * 20) / 20,
    now,
    low: !fell && frac > 0 && frac < LOW_HEALTH,
  };
}
