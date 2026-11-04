import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_MORPH_FIELDS, getUnderwearEnabled, setUnderwearEnabled } from '../../../src/characters/bodyMorphs.js';
import { deformPlayerBodyGeometry } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { REST_LANDMARKS, measureBodyFrame } from '../../../src/characters/bodyShape.js';
import { betterBodiesTextureStem } from '../../../src/formats/morrowind/mwBetterBodiesPaths.js';
import { getBool, setValue } from '../../../src/systems/settings/settings.js';
import { existsSync, readdirSync } from 'node:fs';

// BODY-SHAPE: a bare box is read with the rest landmarks (feet 0, neck top 1) and the front along -y,
// the frame Better Bodies' own rest mesh was measured in.
const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: 0, maxZ: 1 };
const u = REST_LANDMARKS.neck - REST_LANDMARKS.pelvis;
const Z = {
  breast: REST_LANDMARKS.pelvis + 0.72 * u,
  waist: REST_LANDMARKS.spine1 - 0.06 * u,
  hip: REST_LANDMARKS.pelvis - 0.12 * u,
  butt: REST_LANDMARKS.pelvis - 0.06 * u,
};

const morphState = (key, value = 1) => Object.fromEntries(BODY_MORPH_FIELDS.map(([field]) => [field, field === key ? value : 0]));
const pieceOf = (positions, extra = {}) => ({
  slot: 'betterBodies', positions: Float32Array.from(positions), indices: new Uint16Array(), normals: new Float32Array(positions.length), ...extra,
});
const moved = (piece, before, vertex, axis = null) => {
  const axes = axis === null ? [0, 1, 2] : [axis];
  return Math.max(...axes.map((a) => Math.abs(piece.positions[vertex * 3 + a] - before[vertex * 3 + a])));
};

test('every body slider except head scale moves some body vertex', () => {
  const xs = [-1.3, -0.9, -0.62, -0.45, -0.3, -0.1, 0.1, 0.3, 0.45, 0.62, 0.9, 1.3];
  const ys = [-0.9, -0.45, -0.1, 0.1, 0.3, 0.9];   // through the breasts' and the buttocks' centres
  const positions = [];
  for (let z = 0.01; z < 1; z += 0.02) for (const y of ys) for (const x of xs) positions.push(x, y, z);
  for (const [key] of BODY_MORPH_FIELDS) {
    if (key === 'headScale') continue;   // a bone scale, applied to the skeleton
    const piece = pieceOf(positions);
    const before = new Float32Array(piece.positions);
    deformPlayerBodyGeometry(piece, morphState(key), bounds);
    assert.ok(before.some((v, i) => Math.abs(v - piece.positions[i]) > 1e-6), `"${key}" must alter geometry`);
  }
});

test('breast size swells the front of the chest, not the back, the belly or the waist', () => {
  const piece = pieceOf([
    0.62, -0.45, Z.breast,  // front of the chest, over the breast's centre
    0.62, 0.45, Z.breast,   // the back at the same height
    0.1, -0.8, REST_LANDMARKS.spine,   // the belly
    0.6, 0, Z.waist,        // the waist's side
  ]);
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('breastSize'), bounds);
  assert.ok(moved(piece, before, 0) > 1e-3, 'the breast moves');
  assert.ok(moved(piece, before, 1) < 1e-6, 'the back stays');
  assert.ok(moved(piece, before, 2) < 1e-3, 'the belly stays');
  assert.ok(moved(piece, before, 3) < 1e-6, 'the waist stays');
});

test('breast projection pushes forward (-y) and lift raises', () => {
  const projection = pieceOf([0.62, -0.45, Z.breast]);
  deformPlayerBodyGeometry(projection, morphState('breastProjection'), bounds);
  assert.ok(projection.positions[1] < -0.45 - 1e-3, 'forward is -y');
  assert.equal(projection.positions[0], Math.fround(0.62));
  const lift = pieceOf([0.62, -0.45, Z.breast]);
  deformPlayerBodyGeometry(lift, morphState('breastLift'), bounds);
  assert.ok(lift.positions[2] > Math.fround(Z.breast) + 1e-3);
});

test('waist width narrows the waist and leaves the chest and the hips', () => {
  const piece = pieceOf([0.7, 0, Z.waist, 0.7, 0, Z.breast + 0.06, 0.7, 0, Z.hip - 0.12]);
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('waistWidth', -1), bounds);
  assert.ok(piece.positions[0] < before[0] - 1e-3, 'the waist narrows');
  assert.ok(moved(piece, before, 1, 0) < 0.15 * moved(piece, before, 0, 0), 'the chest barely moves');
  assert.ok(moved(piece, before, 2, 0) < 0.15 * moved(piece, before, 0, 0), 'the thighs barely move');
});

test('buttock projection pushes the rear back (+y) and never the front', () => {
  const piece = pieceOf([0.45, 0.3, Z.butt, 0.45, -0.3, Z.butt]);
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, morphState('buttockProjection'), bounds);
  assert.ok(piece.positions[1] > before[1] + 1e-3, 'the buttock goes back');
  assert.ok(moved(piece, before, 1) < 1e-6, 'the front of the pelvis stays');
});

test('skin weights keep the limbs out of the trunk controls and the trunk out of the limb controls', () => {
  const skeleton = { nodes: new Map([
    [1, { name: 'Bip01 Spine1' }], [2, { name: 'Bip01 L Forearm' }], [3, { name: 'Bip01 L Thigh' }], [4, { name: 'Bip01 L Hand' }],
  ]) };
  const make = () => pieceOf([
    0.5, 0, Z.waist,      // trunk
    0.9, 0, Z.waist,      // forearm hanging beside the waist
    0.5, 0, 0.45,         // thigh
    0.95, 0, 0.5,         // hand
  ], { batch: { skin: { bones: [1, 2, 3, 4].map((ref, v) => ({ ref, indices: [v], weights: [1] })) } } });
  const waist = make(); const wb = new Float32Array(waist.positions);
  deformPlayerBodyGeometry(waist, morphState('waistWidth'), bounds, skeleton);
  assert.ok(moved(waist, wb, 0) > 1e-3, 'waist moves the trunk');
  assert.ok(moved(waist, wb, 1) < 1e-6, 'waist leaves the arm beside it');
  const arms = make(); const ab = new Float32Array(arms.positions);
  deformPlayerBodyGeometry(arms, morphState('armThickness'), bounds, skeleton);
  assert.ok(moved(arms, ab, 1) > 1e-3, 'arm thickness moves the forearm');
  assert.ok(moved(arms, ab, 0) < 1e-6 && moved(arms, ab, 2) < 1e-6, 'arm thickness leaves trunk and thigh');
  assert.ok(moved(arms, ab, 3) < 1e-6, 'arm thickness leaves the hand');
  const thighs = make(); const tb = new Float32Array(thighs.positions);
  deformPlayerBodyGeometry(thighs, morphState('thighThickness'), bounds, skeleton);
  assert.ok(moved(thighs, tb, 0) < 1e-6 && moved(thighs, tb, 1) < 1e-6, 'thigh thickness leaves trunk and arm');
});

test('the frame takes its heights from the skeleton and its front from the feet', () => {
  const names = { 'bip01 neck': [0, 0, 90], 'bip01 spine2': [0, 0, 80], 'bip01 spine1': [0, 0, 70], 'bip01 spine': [0, 0, 62],
    'bip01 pelvis': [0, 0, 55], 'bip01 l foot': [5, 0, 5], 'bip01 l toe0': [5, 4, 1], 'bip01 r foot': [-5, 0, 5], 'bip01 r toe0': [-5, 4, 1] };
  const byName = new Map(Object.keys(names).map((n, i) => [n, i]));
  const mats = new Map(Object.values(names).map((t, i) => [i, { t }]));
  const frame = measureBodyFrame([pieceOf([-10, -5, 0, 10, 5, 100])], { byName, nodes: new Map() }, mats);
  assert.equal(frame.z.spine2, 80);
  assert.equal(frame.z.pelvis, 55);
  assert.equal(frame.front, 1, 'toes at +y: the front is +y');
});

test('NUDITY-SYNC: the editor underwear switch and Show Nudity are one value', () => {
  setUnderwearEnabled(false);
  assert.equal(getBool('ChildGuard', 'PlayerNudity'), true, 'underwear off shows nudity');
  setUnderwearEnabled(true);
  assert.equal(getBool('ChildGuard', 'PlayerNudity'), false);
  setValue('ChildGuard', 'PlayerNudity', true);   // the settings screen
  assert.equal(getUnderwearEnabled(), false, 'the settings change reaches the editor');
  setUnderwearEnabled(true);
});

test('NUDITY-SYNC: every skin variant has its own runtime texture name, as long as the NIF\'s', () => {
  const stems = ['underwear', 'nude', 'hd-underwear', 'hd-nude', 'hd-body-hair']
    .map((variant) => betterBodiesTextureStem({ genderKey: 'f', raceKey: 'no', variant }));
  assert.equal(new Set(stems).size, stems.length);
  for (const stem of stems) assert.equal(stem.length, 'bb_skinf_no'.length);
});

test('SEAMS: two shapes meeting at one corner move it as one, whatever each weights it', () => {
  const skeleton = { nodes: new Map([[1, { name: 'Bip01 Pelvis' }], [2, { name: 'Bip01 L Thigh' }]]) };
  // the same corner in two shapes: the groin weights it to the pelvis, the thigh to its own bone
  const groin = pieceOf([0.5, 0, Z.hip], { batch: { skin: { bones: [{ ref: 1, indices: [0], weights: [1] }] } } });
  const leg = pieceOf([0.5, 0, Z.hip], { batch: { skin: { bones: [{ ref: 2, indices: [0], weights: [1] }] } } });
  const frame = measureBodyFrame([groin, leg, pieceOf([-1, -1, 0, 1, 1, 1])], skeleton, null);
  for (const key of ['hipWidth', 'thighThickness', 'waistWidth']) {
    const a = pieceOf([0.5, 0, Z.hip], { batch: groin.batch, _shapeRegions: groin._shapeRegions });
    const b = pieceOf([0.5, 0, Z.hip], { batch: leg.batch, _shapeRegions: leg._shapeRegions });
    deformPlayerBodyGeometry(a, morphState(key), frame, skeleton);
    deformPlayerBodyGeometry(b, morphState(key), frame, skeleton);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(a.positions[k] - b.positions[k]) < 1e-5, `${key} must not part the seam`);
  }
});

test('the front is read from the feet when the skeleton names no toes (retail base_anim)', () => {
  const names = { 'bip01 neck': [0, 0, 90], 'bip01 spine2': [0, 0, 80], 'bip01 spine1': [0, 0, 70], 'bip01 pelvis': [0, 0, 55],
    'bip01 l thigh': [-5, 0, 55], 'bip01 l calf': [-5, 0, 30], 'bip01 l foot': [-5, 0, 6], 'bip01 r thigh': [5, 0, 55], 'bip01 r calf': [5, 0, 30], 'bip01 r foot': [5, 0, 6] };
  const refs = Object.keys(names);
  const byName = new Map(refs.map((n, i) => [n, i]));
  const nodes = new Map(refs.map((n, i) => [i, { name: n }]));
  const mats = new Map(Object.values(names).map((t, i) => [i, { t }]));
  // a foot: toes 9 units in front (+y), the heel 2 behind, all below the ankle
  const foot = pieceOf([-5, 9, 1, -5, -2, 1, -5, 4, 0], { batch: { skin: { bones: [{ ref: byName.get('bip01 l foot'), indices: [0, 1, 2], weights: [1, 1, 1] }] } } });
  const frame = measureBodyFrame([foot, pieceOf([-10, -10, 0, 10, 10, 100])], { byName, nodes }, mats);
  assert.equal(frame.front, 1);
});

test('BEASTS: the Better Bodies 3.2 beast body - its mesh by race, sex and underwear, and every skin of that race and sex', async () => {
  const { betterBeastsAssetPaths } = await import('../../../src/formats/morrowind/mwBetterBodies.js');
  const p = betterBeastsAssetPaths({ race: 'Khajiit', female: true, underwear: false });
  assert.equal(p.model, 'Mods/Bodies/Better Bodies 3.2 Beasts/Nude/Meshes/bb/bb_n_khajiit_f_skins.nif');
  assert.ok(existsSync(new URL(`../../../${p.model}`, import.meta.url)), 'the mesh is checked in');
  const skins = readdirSync(new URL('../../../Mods/Bodies/Better Bodies 3.2 Beasts/Textures/', import.meta.url)).filter((n) => p.texturePattern.test(n));
  assert.deepEqual(skins.sort(), ['q_khajiit_f_skins.dds', 'tx_b_n_khajiit_f_f.dds', 'tx_b_n_khajiit_f_hfinger.dds', 'tx_b_n_khajiit_f_hpalm.dds', 'tx_b_n_khajiit_f_hthumb.dds', 'tx_b_n_khajiit_f_t.dds']);
  assert.equal(betterBeastsAssetPaths({ race: 'Nord' }), null, 'a human is not a beast');
});

test('BEASTS: the tail is no slider\'s - the hips and buttocks leave a tail-weighted vertex where it stands', () => {
  const skeleton = { nodes: new Map([[1, { name: 'Bip01 Tail1' }]]) };
  const piece = pieceOf([0.45, 0.3, Z.butt], { batch: { skin: { bones: [{ ref: 1, indices: [0], weights: [1] }] } } });
  const before = new Float32Array(piece.positions);
  deformPlayerBodyGeometry(piece, { ...morphState('buttockSize'), hipWidth: 1, buttockProjection: 1 }, bounds, skeleton);
  assert.ok(moved(piece, before, 0) < 1e-6);
});

test('SEAMS\' LIGHT: corners standing together share one normal after the morph', async () => {
  const { weldMorphedNormals } = await import('../../../src/characters/bodyShape.js');
  const a = { positions: Float32Array.from([0, 0, 0]), normals: Float32Array.from([1, 0, 0]) };
  const b = { positions: Float32Array.from([0, 0, 0]), normals: Float32Array.from([0, 1, 0]) };
  weldMorphedNormals([a, b], { z: { neck: 90, pelvis: 55 } });
  assert.deepEqual([...a.normals], [...b.normals]);
  assert.ok(Math.abs(a.normals[0] - Math.SQRT1_2) < 1e-6);
});
