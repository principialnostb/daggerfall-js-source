// The pose's arm, as world.js builds it each frame: the cast's three fields (`cn`, `cr`, `ce`) come from one
// dragonWireCast answer. The slice is mounted from comment-stripped source and driven on foot and in the saddle, so
// a second ask of the cast, or a field read off the wrong answer, fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dragonWireCast, mountDragon, dragonFire, landDragon, _resetDragonRide } from '../../src/systems/staffDragon.js';
import { POSE_STRIKES } from '../../src/net/wire.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const mount = (src, scope, tail) => {
  const k = Object.keys(scope);
  return new Function(...k, `${src}\n${tail}`)(...k.map((x) => scope[x]));
};
/** The statement that starts at `from`, through its own `;` - brackets and strings stepped over. */
function statementAt(text, from) {
  let depth = 0, quote = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '\'' || c === '"' || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return text.slice(from, i + 1);
  }
  throw new Error(`no end to the statement at ${from}`);
}

/** world.js from the live rig's choice through the arm's literal. */
function armSlice() {
  const W = strip(read('src/scenes/world.js'));
  const from = W.indexOf('const live = modes?.liveArm?.() ?? null;');
  assert.ok(from >= 0, 'world.js chooses the live rig');
  const at = W.indexOf('const arm = {', from);
  assert.ok(at > from, 'and builds the arm after it');
  return W.slice(from, at) + statementAt(W, at);
}

/** One frame's arm off `cast`, with every ask of dragonWireCast counted. */
function armOf(slice, cast) {
  const asks = [];
  const rig = {
    playerWeapon: { machine: null, sheathed: false, usingRightHand: true },
    swing: { n: 3, strike: POSE_STRIKES[1], hand: 0 },
    cast,
    shot: { n: 2 },
  };
  const scope = {
    modes: { mode: 'exterior', footstepKind: 0, liveArm: () => null }, weaponRig: rig, mv: 1, _lastFootstepKind: 0,
    POSE_STRIKES, hasDaggerfallArrows: () => false, playerEntity: { items: [], lightSource: null },
    magic: { spellArmed: () => false }, dragonWireCast: (c) => { asks.push(c); return dragonWireCast(c); },
    dragonPoseRide: () => null, riding: false, player: { transportMode: 0 }, TRANSPORT_MODES: { Cart: 2, Dragon: 9 },
    modSetting: () => 0, dragonLookOfItem: () => 0, dragonMountOf: () => null, riddenHorseLook: () => 0,
    dragonRideLook: () => 0, moved: false, _hsLatch: false, poseHandsOf: () => ({}), liveLycanthropy: () => null,
    concealBits: () => 0, waistLanternPoseBit: () => undefined, hasActiveEffect: () => false,
    torchPoseByte: () => undefined, gatherHost: null, climbPoseOf: () => ({}),
  };
  const arm = mount(`'use strict';\n${slice}`, scope, 'return arm;');
  return { arm, asks };
}

test('the pose asks dragonWireCast once a frame, and its three cast fields read that one answer (on foot and in the saddle)', () => {
  const slice = armSlice();
  _resetDragonRide();
  const cast = { n: 7, rangeType: 1, element: 0 };
  let { arm, asks } = armOf(slice, cast);
  assert.deepEqual(asks, [cast], 'one ask of the rig\'s own cast');
  assert.deepEqual([arm.cn, arm.cr, arm.ce], [7, 1, 0], 'on foot the rig\'s cast stands');
  mountDragon(false);
  assert.equal(dragonFire(1000), true);
  ({ arm, asks } = armOf(slice, cast));
  assert.equal(asks.length, 1, 'one ask in the saddle too');
  assert.deepEqual([arm.cn, arm.cr, arm.ce], [8, 2, 3], 'a volley: counted, ranged, shock');
  landDragon();
  ({ arm, asks } = armOf(slice, { n: 0xffff, rangeType: undefined, element: undefined }));
  assert.equal(asks.length, 1);
  assert.deepEqual([arm.cn, arm.cr, arm.ce], [0, 0, 4], 'landed: the count wraps, no range is 0, no element is Magic');
  _resetDragonRide();
});
