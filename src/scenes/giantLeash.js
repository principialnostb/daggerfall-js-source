// @ts-check
// THE ZONE'S GIANTS KEPT IN IT, each frame: a giant that steps over the zone's edge is put back where it last stood
// inside, so the edge is a wall to it. At half its health, once a life, it calls its kin. When I leave the zone it
// walks back in and heals at its goal. Moved out of the world host whole; it owns no state of its own.
import { GREATER_GIANT_CALL_AT } from '../systems/wild/wildZone.js';
import { wildInside } from '../systems/wild/wildZone.js';

/** How long a retreat may run before it is given up, and how often a giant pressed at the border is sent back, ms. */
const RETREAT_MS = 60_000;
const PRESSED_MS = 10_000;
/** A retreat ends this close to its goal, metres. */
const RETREAT_DONE_M = 12;

/**
 * One frame of the leash over every stood giant.
 * @param {Iterable<any>} stood the stood giants' records ({ foe, inside?, called?, retreat?, retreated?, retreatAt? })
 * @param {{ mask: any, now: number, meOut: boolean, mapAt: (p: number[]) => number[], call: (foe: any, mask: any) => void,
 *   goal: (mask: any, feet: number[]) => (number[] | null) }} at
 */
export function giantLeashStep(stood, { mask, now, meOut, mapAt, call, goal }) {
  for (const giant of stood) {
    const foe = giant.foe,
      feet = foe?.ai?.feet;
    if (!feet || foe.entity?.health <= 0) continue;
    if (!giant.called && foe.entity.maxHealth > 0 && foe.entity.health <= foe.entity.maxHealth * GREATER_GIANT_CALL_AT) {
      giant.called = true;
      call(foe, mask);
    }
    const [mapX, mapY] = mapAt(feet);
    const inside = wildInside(mask, mapX, mapY);
    if (inside) giant.inside = [feet[0], feet[1], feet[2]];
    else if (giant.inside) {
      feet[0] = giant.inside[0];
      feet[1] = giant.inside[1];
      feet[2] = giant.inside[2];
    }
    // back in the zone: the next step out sends it back again
    if (!meOut) giant.retreated = false;
    if (giant.retreat) {
      steerRetreat(giant, foe, feet, now);
      continue;
    }
    // the moment I am out (once a step out), or it is pressed at the border while I stay out
    const pressed = !inside && now - (giant.retreatAt ?? 0) > PRESSED_MS;
    if (meOut && (!giant.retreated || pressed)) {
      const to = goal(mask, feet);
      giant.retreated = true;
      giant.retreatAt = now;
      if (!to) continue;
      giant.retreat = { to, until: now + RETREAT_MS };
      // it drops me and walks away from the point mirrored behind it, toward its goal
      foe.ai.flee([feet[0] * 2 - to[0], feet[1], feet[2] * 2 - to[2]], 60, 1.4);
    }
  }
}

/** How far a giant retreats, metres. */
export const GIANT_RETREAT_M = 200;

/**
 * Where a giant at `feet` retreats to: of sixteen ways out GIANT_RETREAT_M long, the ones whose whole line stays inside
 * the zone, the deepest at its end (the farthest from the border); null when none does. `mapAt` turns a world point into
 * a map pixel; `heightAt(x, z)` puts the goal on the ground.
 * @param {any} mask @param {number[]} feet @param {(p: number[]) => number[]} mapAt @param {(x: number, z: number) => number} heightAt
 */
export function giantRetreatGoal(mask, feet, mapAt, heightAt) {
  let best = null,
    bestDepth = -1;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2,
      dx = Math.cos(a),
      dz = Math.sin(a);
    const clear = [50, 100, 150, GIANT_RETREAT_M].every((reach) => {
      const [mapX, mapY] = mapAt([feet[0] + dx * reach, feet[1], feet[2] + dz * reach]);
      return wildInside(mask, mapX, mapY);
    });
    if (!clear) continue;
    const to = [feet[0] + dx * GIANT_RETREAT_M, feet[1], feet[2] + dz * GIANT_RETREAT_M];
    const [mapX, mapY] = mapAt(to);
    const depth = mask.depth?.[Math.floor(mapY) * mask.width + Math.floor(mapX)] ?? 0;
    if (depth > bestDepth) {
      bestDepth = depth;
      best = to;
    }
  }
  if (best) {
    const ground = heightAt(best[0], best[2]);
    if (Number.isFinite(ground)) best[1] = ground;
  }
  return best;
}

/** A retreat under way: steered at its goal every frame; done there, or when its time runs out, healed. */
function steerRetreat(/** @type {any} */ giant, /** @type {any} */ foe, /** @type {number[]} */ feet, /** @type {number} */ now) {
  const retreat = giant.retreat,
    dist = Math.hypot(retreat.to[0] - feet[0], retreat.to[2] - feet[2]);
  if (dist < RETREAT_DONE_M || now > retreat.until) {
    foe.ai.fleeLeft = 0;
    giant.retreat = null;
    if (foe.entity && foe.entity.maxHealth > 0) foe.entity.health = foe.entity.maxHealth;
    return;
  }
  const dirX = (retreat.to[0] - feet[0]) / dist,
    dirZ = (retreat.to[2] - feet[2]) / dist;
  // it runs FROM a point behind it, which steers it toward its goal
  foe.ai.fleeFrom = [feet[0] - dirX * 10, feet[1], feet[2] - dirZ * 10];
  if (!(foe.ai.fleeLeft > 1)) foe.ai.fleeLeft = 5;
}
