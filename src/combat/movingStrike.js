import { MW_WEAPON_TYPE as W } from '../formats/morrowind/mwFirstPerson.js';
// Keep the authored upper strike's turn when locomotion owns its parents.
// Re-root rotations only: the pelvis, stride, waist position and clocks stay live.
import { quatToMat33 } from '../formats/morrowind/mwSkin.js';
import { mat33ToQuat } from './heldPose.js';
import { mul, transpose } from '../characters/bodyMotion/bodyKit.js';
const identity = () => [1,0,0,0,1,0,0,0,1];
export function movingStrikeTracks(base, posed, skeleton) {
  const ref = skeleton?.byName?.get('bip01 spine1'), node = skeleton?.nodes.get(ref);
  if (!node) return posed;
  const parents = [];
  for (let p = node.parent; p != null && skeleton.nodes.has(p); p = skeleton.nodes.get(p).parent) parents.unshift(skeleton.nodes.get(p));
  posed.set('bip01 spine1', { __strikeTrunk: true, base: base?.get('bip01 spine1'), rest: node.rest, parents, raw: base, posed });
  return posed;
}
export function sampleMovingStrike(track, time, rawSample, posedSample, active) {
  const local = track.base ? rawSample(track.base, time) : {};
  if (!active) return local;
  const world = (tracks, sample) => {
    let rotation = identity();
    for (const node of track.parents) {
      const tr = tracks?.get(node.name.toLowerCase()), q = tr ? sample(tr, time).rotation : null;
      rotation = mul(rotation, q ? quatToMat33(q) : node.rest.rotation);
    }
    return rotation;
  };
  const original = world(track.raw, rawSample), moving = world(track.posed, posedSample);
  const rotation = mul(mul(transpose(moving), original), local.rotation ? quatToMat33(local.rotation) : track.rest.rotation);
  return { ...local, rotation: mat33ToQuat(rotation) };
}

// More upper-body participation compensates for the planted hip drive that
// locomotion cannot use. These are presentation gains, not reach or damage.
export const MOVING_STRIKE_GAIN = Object.freeze({
  one: Object.freeze({ yaw: 1.20, pitch: 1.10 }),
  two: Object.freeze({ yaw: 1.25, pitch: 1.15 }),
});
const unchanged = Object.freeze({ yaw: 1, pitch: 1 });
export function movingStrikeGain(word, standing) {
  if (standing || !word?.shown) return unchanged;
  switch (word.mwType) {
    case W.ShortBladeOneHand: case W.LongBladeOneHand: case W.BluntOneHand: case W.AxeOneHand: return MOVING_STRIKE_GAIN.one;
    case W.LongBladeTwoHand: case W.BluntTwoClose: case W.BluntTwoWide: case W.SpearTwoWide: case W.AxeTwoHand: return MOVING_STRIKE_GAIN.two;
    default: return unchanged;
  }
}
