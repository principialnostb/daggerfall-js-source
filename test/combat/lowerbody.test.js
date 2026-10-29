// LOWER-BODY (MOTION-DOCTRINE pilot step 1, bible/05-Combat/Motion-Doctrine.md section 5): under a third-person blow the
// legs keep the movement's (or the jump's) clip - rule 26's lower half - and the switch puts the single winner back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLowerBodyLayer, lowerBodyBones, lowerBodyOwner, LOWER_BODY_EASE } from '../../src/combat/lowerBodyLayer.js';
import { MOD_SETTINGS } from '../../src/systems/modSettings.js';

/** A biped's spine: the root, the pelvis, the legs, the lower spine, spine1 and what hangs under it. */
function biped() {
  const rows = [
    ['Bip01', -1], ['Bip01 Pelvis', 0], ['Bip01 Spine', 1], ['Bip01 Spine1', 2], ['Bip01 Neck', 3], ['Bip01 Head', 4],
    ['Bip01 L Clavicle', 3], ['Bip01 L Hand', 6], ['Bip01 R Clavicle', 3], ['Weapon Bone', 8],
    ['Bip01 L Thigh', 1], ['Bip01 L Calf', 10], ['Bip01 R Thigh', 1], ['Bip01 R Calf', 12], ['Bip01 Tail', 1],
  ];
  return { nodes: new Map(rows.map(([name, parent], i) => [i, { name, parent }])) };
}

const track = (id) => ({ id });
/** A sampler that answers a track's id and the time it was asked at - enough to see whose clock a bone reads. */
const sampleTrack = (t, time) => ({ rotation: [0, 0, 0, 1], translation: [t.id, time, 0], scale: 1 });

test('LOWER-BODY: the mask is every bone not under bip01 spine1 - pelvis, legs, lower spine, tail, root (detectBlendMask\'s fallback)', () => {
  const mask = lowerBodyBones(biped());
  assert.deepEqual([...mask].sort(), ['bip01', 'bip01 l calf', 'bip01 l thigh', 'bip01 pelvis', 'bip01 r calf', 'bip01 r thigh', 'bip01 spine', 'bip01 tail'].sort());
  for (const upper of ['bip01 spine1', 'bip01 head', 'bip01 l hand', 'weapon bone']) assert.equal(mask.has(upper), false, upper);
});

test('LOWER-BODY: a skeleton with no bip01 spine1 (a creature) overlays nothing', () => {
  const creature = { nodes: new Map([[0, { name: 'Root', parent: -1 }], [1, { name: 'Leg', parent: 0 }]]) };
  assert.equal(lowerBodyBones(creature).size, 0);
  assert.equal(lowerBodyBones(null).size, 0);
});

test('LOWER-BODY: the legs go to the movement, else the jump, only while a blow wins a third-person frame', () => {
  assert.equal(lowerBodyOwner({ third: true, action: true, movement: true, jump: true }), 'movement');
  assert.equal(lowerBodyOwner({ third: true, action: true, jump: true }), 'jump');
  assert.equal(lowerBodyOwner({ third: true, action: true }), null, 'standing: the attack clip keeps its legs (WeaponLowerBody over the idle)');
  assert.equal(lowerBodyOwner({ third: true, movement: true }), null, 'no blow: the movement is the winner already');
  assert.equal(lowerBodyOwner({ third: false, action: true, movement: true }), null, 'first person: no legs to hand over');
  assert.equal(lowerBodyOwner({ third: true, action: true, movement: true, hit: true }), null, 'a recoil moves the whole body');
  assert.equal(lowerBodyOwner({ third: true, action: true, movement: true, dead: true }), null);
  assert.equal(lowerBodyOwner({ on: false, third: true, action: true, movement: true }), null, 'Как сейчас: the single winner');
});

test('LOWER-BODY: a blow on the move - the legs read the stride at the movement\'s clock, the arms stay the blow\'s', () => {
  const layer = createLowerBodyLayer({ sampleTrack });
  const mask = lowerBodyBones(biped());
  const blow = new Map([['bip01 l thigh', track('blow-thigh')], ['weapon bone', track('blow-weapon')]]);
  const run = new Map([['bip01 l thigh', track('run-thigh')], ['weapon bone', track('run-weapon')]]);
  const movement = { time: 0.42 };
  for (let i = 0; i < 60; i++) layer.stepRig(1 / 60, true, null, { time: 0.1 }, null, null, movement, { trackMap: run }, null, null);
  assert.ok(layer.weight() > 0.999, `the legs handed over within a second (weight ${layer.weight()})`);
  const tracks = layer.tracks(blow, mask);
  const sample = layer.sampler(sampleTrack);
  assert.deepEqual(sample(tracks.get('bip01 l thigh'), 0.1).translation, ['run-thigh', 0.42, 0], 'the thigh is the run\'s, at the run\'s clock');
  assert.deepEqual(sample(tracks.get('weapon bone'), 0.1).translation, ['blow-weapon', 0.1, 0], 'the weapon is the blow\'s, at the blow\'s');
});

test('LOWER-BODY: the hand-over is an ease, not a frame - half-way in after its own time constant, never a snap', () => {
  const layer = createLowerBodyLayer({ sampleTrack });
  layer.stepRig(1 / 60, true, null, {}, null, null, { time: 0 }, { trackMap: new Map() }, null, null);
  const first = layer.weight();
  assert.ok(first > 0 && first < 0.5, `one frame in, the weight is ${first}`);
  assert.ok(LOWER_BODY_EASE.in <= 0.1 && LOWER_BODY_EASE.out <= 0.15, 'SHARPNESS: short eases');
});

test('LOWER-BODY: the body stops under the blow - the weight eases out and the winner\'s tracks come back whole', () => {
  const layer = createLowerBodyLayer({ sampleTrack });
  const mask = lowerBodyBones(biped());
  const blow = new Map([['bip01 l thigh', track('blow-thigh')]]);
  for (let i = 0; i < 30; i++) layer.stepRig(1 / 60, true, null, {}, null, null, { time: 0.2 }, { trackMap: new Map([['bip01 l thigh', track('run')]]) }, null, null);
  for (let i = 0; i < 120; i++) layer.stepRig(1 / 60, true, null, {}, null, null, null, null, null, null);
  assert.equal(layer.weight(), 0);
  assert.equal(layer.tracks(blow, mask), blow, 'the blow\'s own map');
  assert.equal(layer.sampler(sampleTrack), sampleTrack, 'and the sampler the frame had');
});

test('LOWER-BODY: a clip with no source of its own poses from the third-person build\'s tracks', () => {
  const layer = createLowerBodyLayer({ sampleTrack });
  const mask = lowerBodyBones(biped());
  const built = { tracks: new Map([['bip01 pelvis', track('built-pelvis')]]) };
  for (let i = 0; i < 60; i++) layer.stepRig(1 / 60, true, built, {}, null, null, { time: 0.3 }, null, null, null);
  const t = layer.tracks(new Map([['bip01 pelvis', track('blow-pelvis')]]), mask).get('bip01 pelvis');
  assert.deepEqual(layer.sampler(sampleTrack)(t, 0).translation, ['built-pelvis', 0.3, 0]);
});

test('LOWER-BODY: the switch defaults to По формуле, and the rig wires the layer into its third-person pose', () => {
  assert.equal(MOD_SETTINGS['morrowind-animation'].keys.MotionDoctrine.default, 1);
  const src = readFileSync(new URL('../../src/combat/fpArm.js', import.meta.url), 'utf8');
  assert.match(src, /lowerBody\.stepRig\(dt, modSetting\('morrowind-animation', 'MotionDoctrine'\) !== 0 && viewMode === 'third'/);
  assert.match(src, /tracks: lowerBody\.tracks\(/);
  assert.match(src, /sampleTrack: loopSeam\.sampler\(lowerBody\.sampler\(/);   // PIN MOVED (LOOP-SEAM): carried over the seam outside it
});

test('LOWER-SWAP: the legs\u2019 clip changed under a blow is crossed over LOWER_BODY_EASE.swap from where the last stood - never in a frame', async () => {
  const { createLowerBodyLayer, LOWER_BODY_EASE } = await import('../../src/combat/lowerBodyLayer.js');
  // a clip whose thigh stands at its own time: x = time
  const sampleTrack = (track, time) => ({ rotation: null, translation: [track.k === 'clip' ? time : 0, 0, 0], scale: 1 });
  const layer = createLowerBodyLayer({ sampleTrack });
  const tracks = new Map([['bip01 l thigh', { k: 'clip' }]]);
  const base = new Map([['bip01 l thigh', { k: 'base' }]]);
  const mask = new Set(['bip01 l thigh']);
  const frame = (state) => layer.step(1 / 60, { on: true, third: true, action: {}, movement: state, movementTracks: tracks });
  for (let i = 0; i < 90; i++) frame({ group: 'walkforward2c', startTime: 10, time: 10.5 });
  const at = () => layer.sampler(sampleTrack)(layer.tracks(base, mask).get('bip01 l thigh'), 0).translation[0];
  assert.ok(Math.abs(at() - 10.5) < 1e-9, 'the walk\u2019s legs');
  frame({ group: 'runforward2c', startTime: 20, time: 20.2 });
  const first = at();
  assert.ok(first < 12, `the first frame of the run still near the walk (${first.toFixed(2)}, the run stands at 20.2)`);
  for (let i = 0; i < Math.ceil(LOWER_BODY_EASE.swap * 60 * 2); i++) frame({ group: 'runforward2c', startTime: 20, time: 20.2 });
  assert.ok(Math.abs(at() - 20.2) < 0.1, `the run\u2019s own legs once crossed (${at().toFixed(2)})`);
});
