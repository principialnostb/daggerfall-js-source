// @ts-check
// AN INVASION'S BOSS ON A SCREEN: how it rises out of the ground and falls dead (a pose the renderer and the foe's frame
// read), and the Daedra Lord's laugh every screen hears as it rises. The fight itself - its waves, its health, its blows
// and its fall - is the cell's (net/invasion/invasionBrain.js); a screen draws what the cell says (scenes/invasionField.js).
// PURE but for the clocks and sounds handed in.
import { ENEMY_BASICS } from '../../characters/enemy/enemyBasics.js';
import { INVASION_RISE_MS, INVASION_FALL_MS } from '../../net/invasion/invasionBrain.js';

export { INVASION_RISE_MS, INVASION_FALL_MS };
/** How deep it starts, in its own heights. */
export const INVASION_RISE_DEPTH = 1;

const ease = (/** @type {number} */ x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * ITS POSE NOW: `dy` metres to add to its feet (negative while it rises out of the ground), `tilt` radians it leans
 * over as it falls (0 standing, PI/2 on the ground), `holds` true while it rises (no step, no blow, no hurt). The first
 * read starts its rise; its death's first read starts its fall. Each machine times the boss it sees.
 * @param {{ dead?: boolean, ai?: { height?: number }, _tbRiseAt?: number, _tbFellAt?: number }} foe @param {number} nowMs
 */
export function invasionBossPose(foe, nowMs) {
  foe._tbRiseAt ??= nowMs;
  const height = Number.isFinite(foe.ai?.height) && /** @type {number} */ (foe.ai?.height) > 0 ? foe.ai.height : 4;
  const up = ease((nowMs - foe._tbRiseAt) / INVASION_RISE_MS);
  const dy = -height * INVASION_RISE_DEPTH * (1 - up);
  if (!foe.dead) return { dy, tilt: 0, holds: up < 1 };
  foe._tbFellAt ??= nowMs;
  const down = ease((nowMs - foe._tbFellAt) / INVASION_FALL_MS);
  return { dy: dy - height * 0.15 * down, tilt: (Math.PI / 2) * down, holds: true };
}
/** Is this foe an invasion's boss (the field's, promoted by eliteFoes.js promoteInvasionBoss)? @param {any} foe */
export const isInvasionBossFoe = (foe) => !!foe?.entity?.invasionBoss;
/** Is it still rising? @param {any} foe @param {number} nowMs */
export const invasionBossRising = (foe, nowMs) => !foe?.dead && invasionBossPose(foe, nowMs).holds;

// ── THE LAUGH ────────────────────────────────────────────────────────────────────────────────────────────────────
/** The Daedra Lord's bark (DAGGER.SND by index, enemyBasics.js), slowed and so deepened, and its echoes. */
export const LAUGH_CLIP = ENEMY_BASICS[31]?.barkSound ?? -1;
export const LAUGH_PITCH = 0.5;
export const LAUGH_VOLUME = 1.6;
/** Each echo: this long after the last, at this share of its loudness, a touch deeper. */
export const LAUGH_ECHO_MS = 420;
export const LAUGH_ECHOES = 3;
export const LAUGH_ECHO_FADE = 0.5;

/**
 * THE LAUGH, heard on every screen as the boss rises: `play(clip, volume, pitch)` (audio.playOneShot), and the echoes
 * after it through `later(fn, ms)`. Answers how many it asked for.
 * @param {(clip: number, volume: number, pitch: number) => any} play
 * @param {(fn: () => void, ms: number) => any} [later]
 */
export function invasionLaugh(play, later = (fn, delayMs) => setTimeout(fn, delayMs)) {
  if (LAUGH_CLIP < 0 || typeof play !== 'function') return 0;
  play(LAUGH_CLIP, LAUGH_VOLUME, LAUGH_PITCH);
  for (let i = 1; i <= LAUGH_ECHOES; i++)
    later(
      () => play(LAUGH_CLIP, LAUGH_VOLUME * LAUGH_ECHO_FADE ** i, LAUGH_PITCH * (1 - 0.03 * i)),
      LAUGH_ECHO_MS * i,
    );
  return 1 + LAUGH_ECHOES;
}
