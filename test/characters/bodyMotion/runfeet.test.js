// RUN-FEET: a lengthened stride swings the legs further and leaves each foot turned as its clip turned it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices as sm, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { mul } from '../../../src/characters/bodyMotion/bodyKit.js';
import { lengthenLegs, STRIDE, RUN_STRIDE, WALK_STRIDE } from '../../../src/characters/bodyMotion/stride.js';
import { GUARD_STRIDE } from '../../../src/characters/bodyMotion/guardStride.js';
import { rotAxisAngle } from '../../../src/combat/climbRig.js';

const quatOf = (m) => { const w = Math.sqrt(Math.max(0, 1 + m[0] + m[4] + m[8])) / 2; return [w, (m[7] - m[5]) / (4 * w), (m[2] - m[6]) / (4 * w), (m[3] - m[1]) / (4 * w)]; };
const turnBetween = (A, B) => { let t = 0; for (let i = 0; i < 9; i++) t += A[i] * B[i]; return Math.acos(Math.max(-1, Math.min(1, (t - 1) / 2))) * 180 / Math.PI; };
const rot = (m) => [...m];

test('RUN-FEET: the run\'s, the walk\'s and the guard walk\'s strides keep the feet\'s turn; the legs still swing further', () => {
  for (const [name, profile] of [['run', RUN_STRIDE], ['walk', WALK_STRIDE], ['guard', GUARD_STRIDE.walk]]) assert.equal(profile.keepFeet, true, name);
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  sk.byName ??= new Map([...sk.nodes].map(([r, n]) => [String(n.name).toLowerCase(), r]));
  const pose = new Map(), means = new Map();
  for (const [bone, turn] of [['bip01 l thigh', -0.5], ['bip01 l calf', -0.9], ['bip01 r thigh', 0.4], ['bip01 r calf', -0.3]]) {
    const ref = sk.byName.get(bone), node = sk.nodes.get(ref);
    pose.set(ref, { ...node.rest, rotation: mul(node.rest.rotation, rotAxisAngle([0, 0, 1], turn)) });
    means.set(bone, quatOf(node.rest.rotation));
  }
  const feet = STRIDE.feet.map((n) => sk.byName.get(n)), thigh = sk.byName.get('bip01 l thigh');
  const before = sm(sk, pose, GRAPH_ROOT);
  for (const keepFeet of [false, true]) {
    const p = new Map(pose);
    lengthenLegs(sk, p, GRAPH_ROOT, sm, { stride: 1.3, w: 1, means, calf: 1, keepFeet });
    const after = sm(sk, p, GRAPH_ROOT);
    const off = Math.max(...feet.map((r) => turnBetween(rot(before.get(r).a), rot(after.get(r).a))));
    const swung = turnBetween(rot(before.get(thigh).a), rot(after.get(thigh).a));
    assert.ok(swung > 5, `the leg swung further (${swung.toFixed(2)})`);
    if (keepFeet) assert.ok(off < 1.5, `kept: a foot turned ${off.toFixed(2)} degrees`);
    else assert.ok(off > 5, 'without it the foot turned with the leg');
  }
});
