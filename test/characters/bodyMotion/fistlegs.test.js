// The real hand-to-hand group on the retail rig - held at the stance below the waist while a standing punch plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { collectTextKeys, normalizeTextKeys, extractTracks, sampleTrack } from '../../../src/formats/morrowind/mwAnim.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices as sm, accumRootRef, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { MW_WEAPON_TYPE } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { bodyOf, at } from '../../../src/characters/bodyMotion/bodyKit.js';
import { createFistLegs, fistsStand, FIST_LEGS } from '../../../src/characters/bodyMotion/fistLegs.js';

const nif = parseNif(readFileSync(new URL('../../../Mods/Animations/Morrowind Animation Overhaul/Data Files/Meshes/Xbase_anim.kf', import.meta.url)));
const keys = normalizeTextKeys(collectTextKeys(nif)), trackMap = extractTracks(nif);
const word = (blow, extra = {}) => ({ on: true, shown: true, hands: 'fists', mwType: MW_WEAPON_TYPE.HandToHand, speed: 0, grounded: true, blow, ...extra });
const punch = { type: 'chop', hand: 'R', section: 'release', progress: 0.5, strength: 1 };

test('FIST-LEGS: the fists stand to punch drawn, grounded and still - not walking, not a blade, not in the air', () => {
  assert.equal(fistsStand(word(null)), true);
  assert.equal(fistsStand(word(null, { speed: 4.4 })), false);
  assert.equal(fistsStand(word(null, { grounded: false })), false);
  assert.equal(fistsStand(word(null, { hands: 'single', mwType: MW_WEAPON_TYPE.LongBladeOneHand })), false);
});

test('FIST-LEGS: through the whole hand-to-hand group a standing punch\'s feet and pelvis stay where the stance had them, the arms the clip\'s; walking, and with no blow, the clip is left alone', () => {
  const sk = buildSkeleton(parseNif(retailSkeleton())), body = bodyOf(sk, GRAPH_ROOT, sm), accumRoot = accumRootRef(sk, trackMap);
  const times = keys.filter((k) => /^handtohand:/i.test(String(k.text))).map((k) => k.time), t0 = Math.min(...times), t1 = Math.max(...times);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const play = (blowOn, extra = {}) => {
    const layer = createFistLegs(); let foot = 0, clipFoot = 0, hand = 0, home = null, changed = false;
    for (let f = 0; f < Math.round((t1 - t0) * 60) + 30; f++) {
      const pose = poseSkeleton(sk, trackMap, sampleTrack, f < 30 ? t0 : t0 + (f - 30) / 60, { accumRoot }), before = sm(sk, pose, GRAPH_ROOT);
      layer.step(1 / 60, true, word(f >= 30 && blowOn ? punch : null, extra));
      if (layer.apply(sk, pose)) changed = true;
      const after = sm(sk, pose, GRAPH_ROOT);
      if (f === 29) home = { L: at(after, body.bones.L.foot), R: at(after, body.bones.R.foot) };
      if (f > 45) for (const side of ['L', 'R']) {
        foot = Math.max(foot, dist(at(after, body.bones[side].foot), home[side]));
        clipFoot = Math.max(clipFoot, dist(at(before, body.bones[side].foot), home[side]));
        hand = Math.max(hand, dist(at(after, body.bones[side].hand), at(before, body.bones[side].hand)));
      }
    }
    return { foot, clipFoot, hand, changed, weight: layer.weight() };
  };
  const held = play(true);
  assert.ok(held.clipFoot > 20, `the clip takes a foot ${held.clipFoot.toFixed(0)} units off the stance`);
  assert.ok(held.foot < 0.5, `held, a foot is ${held.foot.toFixed(3)} units off it`);
  assert.ok(held.hand < held.clipFoot && held.weight > 0.99, 'the hold full on');
  assert.equal(play(false).changed, false, 'no blow: the clip\'s legs');
  assert.equal(play(true, { speed: 4.4 }).changed, false, 'walking: the stride\'s');
  assert.ok(FIST_LEGS.in < FIST_LEGS.out);
});
