// Check the animated steel cloak against the posed armour and the back-mounted shield.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARMOR_MATERIAL } from '../../../src/systems/armorMaterials.js';
import { assembleFirstPersonArm, poseAssembly } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { composeWornArmor } from '../../../src/formats/morrowind/mwItemMap.js';
import { fitCloakOver, fitStowedGear, cloakSheet, posePiecePositions, CLOAK_FIT_POSES, CLOAK_STILL_POSES, SHIELD_PRESS, SHIELD_BODY_GAP } from '../../../src/formats/morrowind/mwCloakFit.js';
import { createCloakPhysics, stepCloakPhysics, resolveCloakShieldContact } from '../../../src/formats/morrowind/mwCloakPhysics.js';
import { clearCloakFaces, cloakColliders, meetCloakBody, bodyBackAt, cloakGearDue, CLOAK_CONTACT } from '../../../src/formats/morrowind/mwCloakColliders.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';
import { body, set, CLOAK, isCloak, isUnder, SWEEP, turned, crossings } from '../../fixtures/mw/cloakRig.mjs';

import { affineApply, affineMul } from '../../../src/formats/morrowind/mwAffine.js';
import { skinPost } from '../../../src/formats/morrowind/mwSkin.js';

const fitted = async () => {
  const a = await body(ARMOR_MATERIAL.Steel);
  fitCloakOver(a, { isCloak, isUnder, poses: CLOAK_STILL_POSES });
  const piece = a.pieces.find(isCloak);
  piece.clothPhysics = createCloakPhysics(piece); piece.clothPhysicsFallbackMesh = true;
  poseAssembly(a);
  return { a, piece, st: piece.clothPhysics };
};

test('an armour ridge between cloth vertices clears the whole face', () => {
  const field = { ox: 0, oz: 0, w: 11, h: 11, back: new Float32Array(121).fill(4) };
  field.back[3 * field.w + 3] = -2;
  const pos = Float32Array.from([0, 0, 0, 9, 0, 0, 0, 0, 9]);
  const state = { pos, prev: pos.slice(), edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 0, b: 2 }] };
  const expected = Float32Array.from([0, -3, 0, 9, -3, 0, 0, -3, 9]);
  clearCloakFaces(state, { field }, [0, 1, 2]);
  assert.deepEqual(state.pos, expected);
  assert.deepEqual(state.prev, expected);
});

test('a posed plate enters the contact grid in the rendered cloak mesh frame', async () => {
  const { a, piece, st } = await fitted();
  const skin = piece.batch.skin, bone = skin.bones[0];
  const affine = affineMul(skinPost(skin, a.skeleton, a.pose), affineMul(a.mats.get(bone.ref), bone.invBind));
  const z = Math.round((st.minZ + st.maxZ) * .5), y = -12;
  const patch = Float32Array.from([[-3, y, z - 3], [3, y, z - 3], [3, y, z + 3], [-3, y, z + 3]]
    .flatMap(([x, depth, height]) => Array.from(affineApply(affine, x, depth, height))));
  const plate = { kind: 'rigid', source: patch, positions: patch, indices: Uint16Array.of(0, 1, 2, 0, 2, 3) };
  a.pieces.push(plate);
  const { field } = cloakColliders(a, piece, p => p === plate);
  assert.ok(Math.abs(bodyBackAt(field, 0, z) - y) < .001);
});

test('CLOAK-BODY: the body field pushes a free vertex back behind the body, takes its speed into it, and leaves a fixed one, a far one and one deep through alone', () => {
  const back = new Float32Array(9 * 9).fill(Infinity);
  for (let j = 2; j <= 6; j++) for (let i = 2; i <= 6; i++) back[j * 9 + i] = 0;   // a plate at y 0 over x, z 2..6
  const field = { ox: 0, oz: 0, w: 9, h: 9, back };
  assert.equal(bodyBackAt(field, 4.5, 4.5), 0);
  assert.equal(bodyBackAt(field, 0.5, 0.5), Infinity);
  const state = { pos: new Float32Array([4, 0.2, 4, 4, 0.2, 4, 0.5, 0.2, 0.5, 5, 9, 5]), prev: new Float32Array([4, 1, 4, 4, 0.2, 4, 0.5, 0.2, 0.5, 5, 9, 5]) };
  assert.equal(meetCloakBody(state, { field }, (v) => v === 1), 1);
  assert.equal(state.pos[1], Math.fround(-CLOAK_CONTACT.clearance));
  assert.equal(state.prev[1], Math.fround(-CLOAK_CONTACT.clearance), 'no speed left into the body');
  assert.deepEqual([...state.pos.slice(3)], [...new Float32Array([4, 0.2, 4, 0.5, 0.2, 0.5, 5, 9, 5])]);
  assert.equal(meetCloakBody(state, null, () => false), 0);
});

test('CLOAK-CONTACT: the gear footprint is taken five times a second, not every frame', () => {
  const arm = {}; let taken = 0;
  for (let f = 0; f < 60; f++) if (cloakGearDue(arm, 1 / 60)) taken++;
  assert.ok(taken >= 5 && taken <= 6, `${taken} a second`);
  assert.equal(CLOAK_CONTACT.gearEvery, 0.2);
});

test('CLOAK-BODY: the standing cloth settles near its fit and the body clears the pose sweep', async () => {
  assert.equal(CLOAK_FIT_POSES.length, 4);
  assert.equal(CLOAK_STILL_POSES.length, 11);
  const { a, piece, st } = await fitted();
  const rest = cloakColliders(a, piece, isUnder);
  assert.ok(rest.field.back.some((y) => y !== Infinity), 'the worn pieces are in the field');
  const settled = { pos: st.base.slice(), prev: st.base.slice() };
  meetCloakBody(settled, rest, () => false);
  assert.ok(st.base.every((x, i) => Math.abs(settled.pos[i] - x) < .5), 'the standing fit needs only sub-unit contact');
  assert.equal(meetCloakBody(settled, rest, () => false), 0, 'standing contact settles in one correction');
  const off = () => { let sum = 0; for (let i = 0; i < st.pos.length; i += 3) sum += Math.hypot(st.pos[i] - st.base[i], st.pos[i + 1] - st.base[i + 1], st.pos[i + 2] - st.base[i + 2]); return sum / (st.pos.length / 3); };
  for (let i = 0; i < 180; i++) stepCloakPhysics(piece, 1 / 60, { gait: 0, gaitPhase: 0, colliders: cloakColliders(a, piece, isUnder) });
  assert.ok(off() < 1, `standing three seconds the cloth is ${off().toFixed(2)} units off its fit`);
  for (const [name, turns] of Object.entries(SWEEP)) {
    const pose = Object.keys(turns).length ? turned(a, turns) : {};
    poseAssembly(a, pose);
    for (let i = 0; i < 60; i++) stepCloakPhysics(piece, 1 / 60, { gait: 0, gaitPhase: 0, colliders: cloakColliders(a, piece, isUnder) });
    poseAssembly(a, pose);
    assert.equal(crossings(a, isUnder), 0, `${name}: nothing through the cloak`);
  }
});

test('CLOAK-BODY: in a walk and a stride, moving, no leg, tasset or arm comes through the cloak', async () => {
  // Use full stride cycles to catch intersections that appear only between the standing poses.
  const cycle = (amp, knee) => (ph) => {
    const s = Math.sin(ph * 2 * Math.PI);
    return { 'bip01 r thigh': amp * s, 'bip01 l thigh': -amp * s, 'bip01 l calf': s > 0 ? knee * s : 0, 'bip01 r calf': s < 0 ? -knee * s : 0,
      'bip01 l upperarm': 25 * s, 'bip01 r upperarm': 25 * s };
  };
  for (const [name, fn, gait] of [['walk', cycle(22, 30), 0.65], ['stride', cycle(35, 45), 1]]) {
    const { a, piece } = await fitted();
    let worst = 0;
    for (let f = 0; f < 80; f++) {
      const ph = (f / 40) % 1, pose = turned(a, fn(ph));
      poseAssembly(a, pose);
      stepCloakPhysics(piece, 1 / 60, { gait, gaitPhase: ph, colliders: cloakColliders(a, piece, isUnder) });
      if (f >= 40 && f % 4 === 0) { poseAssembly(a, pose); worst = Math.max(worst, crossings(a, isUnder)); }
    }
    assert.equal(worst, 0, `${name}: edges through the cloak at worst`);
  }
});

test('SHIELD-SINK: the cloth under a shield is pressed from its fit - the same press footprint after footprint', () => {
  const N = 9; const pos = []; const idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pos.push(i - 4, 0, 8 - j);
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { const q = j * N + i; idx.push(q, q + 1, q + N, q + 1, q + N + 1, q + N); }
  const piece = { batch: { positions: new Float32Array(pos), normals: null }, indices: new Uint16Array(idx) };
  piece.clothPhysics = createCloakPhysics(piece);
  const shield = { positions: new Float32Array([-2, 2, 2, 2, 2, 2, 0, 2, 6]), indices: new Uint16Array([0, 1, 2]) };   // 2 units body-side of the cloth
  const v = (4 * N + 4) * 3 + 1; const seen = new Set();
  for (let k = 0; k < 6; k++) {
    resolveCloakShieldContact(piece, Float32Array.from(piece.clothPhysics.pos), [shield], null, Float32Array.from(piece.clothPhysics.base));
    seen.add(piece.clothPhysics.pos[v].toFixed(3));
    for (let f = 0; f < 12; f++) stepCloakPhysics(piece, 1 / 60, { gait: 0, gaitPhase: 0 });
  }
  assert.deepEqual([...seen], ['2.380'], 'pressed past the shield, every footprint the same');
});

test('SHIELD-SEAT: a stowed steel shield over the animated cloak is drawn in, stops short of the body, and no cloth comes through it', async () => {
  const onDisk = (p) => new Uint8Array(readFileSync(new URL(`../../../${p}`, import.meta.url)));
  const worn = composeWornArmor({ pieces: [...set(ARMOR_MATERIAL.Steel), CLOAK], armors: [], bodyPool: [], helmStyle: 'open' });
  const parts = worn.adds.map((x) => ({ slot: x.slot, partName: x.partName, bones: x.bones, bytes: onDisk(`src/assets/mw/meshes/${x.model}`) }));
  const shieldBytes = process.env.DFO_TEST_STEEL_SHIELD
    ? new Uint8Array(readFileSync(process.env.DFO_TEST_STEEL_SHIELD))
    : onDisk('src/assets/mw/meshes/shield_sky_steel.nif');
  parts.push({ slot: 'shield (steel)', bones: ['Shield Bone'], bytes: shieldBytes });
  const seatOf = async (pressed) => {
    const a = await assembleFirstPersonArm({ skeletonBytes: retailSkeleton(), parts });
    assert.ok(a.ok, a.error);
    const isShieldBack = (p) => /^shield-back\b/.test(p.slot);
    const under = (p) => !isCloak(p) && !/^shield/.test(p.slot);
    fitCloakOver(a, { isCloak, isUnder: under, poses: CLOAK_STILL_POSES });
    const [row] = fitStowedGear(a, { isCloak, isGear: isShieldBack, shieldClearance: 1.5, pressed, isUnder: under });
    poseAssembly(a);
    return { a, row, shield: a.pieces.find(isShieldBack), cloak: a.pieces.find(isCloak), under, isShieldBack };
  };
  const still = await seatOf(false);
  const { a, row, shield, cloak, under, isShieldBack } = await seatOf(true);
  assert.equal(row.how, 'over');
  assert.ok(row.by < still.row.by - 3, `drawn in: ${row.by.toFixed(1)} units back, over a still cloak ${still.row.by.toFixed(1)}`);
  const sheet = cloakSheet(cloak.positions, cloak.indices);
  const flat = { pos: [], idx: [] };
  for (const p of a.pieces.filter(under)) { const o = flat.pos.length / 3; flat.pos.push(...p.positions); flat.idx.push(...Array.from(p.indices, (i) => i + o)); }
  const bodySheet = cloakSheet(Float32Array.from(flat.pos), Uint32Array.from(flat.idx));
  let past = -Infinity, intoBody = -Infinity;
  for (let o = 0; o < shield.positions.length; o += 3) {
    const x = shield.positions[o], y = shield.positions[o + 1], z = shield.positions[o + 2];
    const c = sheet.at(x, z), b = bodySheet.at(x, z);
    if (c) past = Math.max(past, y - c.back);
    if (b) intoBody = Math.max(intoBody, y - b.back);
  }
  assert.ok(past > 0 && past < SHIELD_PRESS, `its deepest point ${past.toFixed(2)} units past the cloak's back`);
  assert.ok(intoBody <= -SHIELD_BODY_GAP + 0.5, `${(-intoBody).toFixed(2)} units off the body`);
  cloak.clothPhysics = createCloakPhysics(cloak); cloak.clothPhysicsFallbackMesh = true;
  for (let f = 0; f < 60; f++) {
    stepCloakPhysics(cloak, 1 / 60, { gait: 0, gaitPhase: 0 });
    if (f % 12 === 0) {
      const posed = posePiecePositions(a, a.pose, [{ piece: shield }, { piece: cloak, batch: { ...cloak.batch, positions: cloak.clothPhysics.pos } }, { piece: cloak, batch: { ...cloak.batch, positions: cloak.clothPhysics.base } }]);
      resolveCloakShieldContact(cloak, posed[1], [{ positions: posed[0], indices: shield.indices }], null, posed[2]);
    }
  }
  poseAssembly(a);
  assert.equal(crossings(a, isShieldBack), 0, 'no cloth through the shield');
  assert.equal(crossings(a, under), 0, 'no body through the cloth');
});
