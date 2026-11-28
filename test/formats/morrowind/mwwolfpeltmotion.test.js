import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { assembleFirstPersonArm, poseAssembly } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { createWolfPeltMotion, stepWolfPeltMotion } from '../../../src/formats/morrowind/mwWolfPeltMotion.js';
import { enableRigidBatchSkin } from '../../../src/formats/morrowind/mwSkin.js';
import { fitStowedGear } from '../../../src/formats/morrowind/mwCloakFit.js';
import { packSkinStream, restreamMovedRows, skinLayout, skinnedVertex, writeSkinPalette } from '../../../src/formats/morrowind/mwGpuSkin.js';
import { FEMALE_SKELETON } from '../../../tools/skyrim/mwBody.mjs';
import { SHEATHED } from '../../fixtures/mw/cloakRig.mjs';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

const asset = 'src/assets/mw/meshes/wolf_pelt_brown.nif';
const local = { skip: !existsSync(asset) || !existsSync(FEMALE_SKELETON) };
async function rig(mesh = asset) {
  const arm = await assembleFirstPersonArm({ skeletonBytes: new Uint8Array(readFileSync(FEMALE_SKELETON)),
    parts: [{ slot: 'cloak (wolf_pelt_cloak)', bones: [], bytes: new Uint8Array(readFileSync(mesh)) }] });
  assert.equal(arm.ok, true);
  poseAssembly(arm);
  return { arm, state: createWolfPeltMotion(arm.pieces) };
}
function frame(r, dt, motion = {}) {
  poseAssembly(r.arm);
  return stepWolfPeltMotion(r.state, r.arm, dt, motion);
}
const maxNode = (s) => Math.max(...s.nodes.map((n) => Math.hypot(n.x, n.y)));

const denseAsset = 'src/assets/mw/meshes/pixal_wolf_cloak.nif';
test('dense pelt uses the single-bone CPU path without changing the fitted static pose', {
  skip: !existsSync(denseAsset) || !existsSync(FEMALE_SKELETON),
}, async () => {
  const { arm, state } = await rig(denseAsset);
  for (const { piece } of state.layers) {
    const reference = Float32Array.from(piece.positions);
    assert.equal(enableRigidBatchSkin(piece.batch), true);
    poseAssembly(arm);
    assert.ok(piece.positions.every((v, i) => Math.abs(v - reference[i]) < 0.0001));
  }
});

test('deferred skinning renders the same fur pose as the full CPU pass', local, async () => {
  const standard = await rig(), deferred = await rig();
  for (let i = 0; i < 12; i++) {
    const motion = { gait: .9, gaitPhase: i / 24, yaw: i / 20 };
    frame(standard, 1 / 60, motion);
    poseAssembly(deferred.arm, { deferSkin: deferred.state.moving });
    stepWolfPeltMotion(deferred.state, deferred.arm, 1 / 60, motion);
  }
  for (const [i, layer] of standard.state.layers.entries()) {
    const other = deferred.state.layers[i].piece;
    assert.deepEqual(other.positions, layer.piece.positions);
    assert.deepEqual(other.normals, layer.piece.normals);
  }
});

test('a gait phase reset is filtered and opposite strikes bend the pelt in opposite directions', local, async () => {
  const left = await rig(), right = await rig();
  frame(left, 1 / 60, { gait: .65, gaitPhase: .9 });
  frame(left, 1 / 60, { gait: 1, gaitPhase: .3 });
  assert.ok(Math.abs(left.state.phase - .9) <= .067);
  const strike = { attack: 1, attackProgress: .5 };
  for (let f = 0; f < 24; f++) {
    frame(left, 1 / 60, { ...strike, attackSide: -1 });
    frame(right, 1 / 60, { ...strike, attackSide: 1 });
  }
  assert.ok(left.state.nodes[2].x < -.3 && right.state.nodes[2].x > .3);
});

test('actual five-layer pelt moves as one, preserves fitted shoulders, and settles after a stop', local, async () => {
  const r = await rig();
  assert.equal(r.state.layers.length, 5);
  assert.equal(r.state.layers.filter((l) => l.movable).length, 2);
  for (let f = 0; f < 120; f++) frame(r, 1 / 60, { gait: 1, gaitPhase: f / 30, yaw: f / 180 });
  assert.ok(maxNode(r.state) > .5, 'running produces visible lower drape motion');
  for (const l of r.state.layers) {
    assert.ok(l.piece.positions.every(Number.isFinite));
    if (!l.movable && !l.fur) assert.deepEqual(l.piece.batch.positions, l.base, 'supported mantle keeps its fit');
    for (let i = 0; i < l.base.length; i += 3) if (l.base[i + 2] >= 100 && (!l.fur || Math.floor((i/3)%35/5) === 0)) {
      assert.deepEqual(Array.from(l.piece.batch.positions.subarray(i, i + 3)), Array.from(l.base.subarray(i, i + 3)));
    }
  }
  const shoulders = r.state.layers.find((l) => /Shoulder/.test(l.piece.batch.name));
  assert.ok(shoulders.piece.batch.positions.some((v,i) => Math.abs(v-shoulders.base[i])>.05), 'shoulder fur tips ripple while their roots stay fixed');
  for (let f = 0; f < 360; f++) frame(r, 1 / 60, { yaw: 119 / 180 });
  assert.ok(maxNode(r.state) < .001, 'idle has no perpetual waving');
  assert.ok(r.state.waveEnergy<.001, 'movement wave settles while ambient wind remains');
  for (const l of r.state.layers) assert.ok(l.piece.batch.positions.every((v,i) => Math.abs(v-l.base[i])<12), 'wind stays within its bounded roll and hinged-tip envelope');
});

test('ambient wind visibly ripples fur on a stationary character without moving its roots', local, async () => {
  const r=await rig();
  for(let f=0;f<120;f++) frame(r,1/60,{gait:0,yaw:0});
  const fur=r.state.layers.find((l)=>/Shoulder/.test(l.piece.batch.name));
  const before=Float32Array.from(fur.piece.batch.positions);
  for(let f=0;f<20;f++) frame(r,1/60,{gait:0,yaw:0});
  assert.ok(fur.piece.batch.positions.some((v,i)=>Math.abs(v-before[i])>.1),'wind moves the shoulder tips even with no gait input');
  const back=r.state.layers.find((l)=>/Back_Locks/.test(l.piece.batch.name));
  assert.ok(back.piece.batch.positions.some((v,i)=>Math.abs(v-back.base[i])>2),'wind moves whole fur locks enough to remain visible at game-camera scale');
  for(let i=0;i<fur.base.length;i+=105) assert.deepEqual(Array.from(fur.piece.batch.positions.subarray(i,i+15)),Array.from(fur.base.subarray(i,i+15)),'each tuft root stays anchored');
});

test('rendered pelt has spatially different moving crests rather than one rigid back displacement', local, async () => {
  const r = await rig();
  const panel = r.state.layers.find((l) => /Back_Panel/.test(l.piece.batch.name));
  const pick = (x,z) => {
    let nearest = 0, distance = Infinity;
    for (let i=0;i<panel.base.length;i+=3) {
      const d=(panel.base[i]-x)**2+(panel.base[i+2]-z)**2;
      if(d<distance) { nearest=i; distance=d; }
    }
    return nearest;
  };
  const a=pick(-8,82), b=pick(8,53), first=[], second=[];
  for(let f=0;f<150;f++) {
    frame(r,1/60,{gait:1,gaitPhase:f/36,yaw:0});
    if(f>=60) {
      first.push(panel.piece.batch.positions[a+1]-panel.base[a+1]);
      second.push(panel.piece.batch.positions[b+1]-panel.base[b+1]);
    }
  }
  const span = (s) => Math.max(...s)-Math.min(...s);
  assert.ok(span(first)>.5 && span(second)>.5,'both regions have a visible moving wave');
  const differences=first.map((v,i)=>v-second[i]);
  assert.ok(span(differences)>.5,'different heights/sides do not move as a single rigid sheet');
});

test('heavy motion is bounded, survives tab resumes and stays close at different frame rates', local, async () => {
  const slow = await rig(), fast = await rig();
  for (const [r, fps] of [[slow, 30], [fast, 120]]) {
    for (let f = 0; f < fps * 2; f++) frame(r, 1 / fps, { gait: .8, gaitPhase: f / fps * 1.6, yaw: f / fps * .2 });
  }
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(slow.state.nodes[i].x - fast.state.nodes[i].x) < .12);
    assert.ok(Math.abs(slow.state.nodes[i].y - fast.state.nodes[i].y) < .12);
  }
  assert.equal(frame(fast, NaN), false);
  frame(fast, 20, { gait: 0, yaw: 100 });
  assert.equal(maxNode(fast.state), 0, 'resuming a hidden tab resets stale inertia');
  for (let f = 0; f < 120; f++) frame(fast, 1 / 60, { gait: 1, yaw: f % 2 ? 20 : -20 });
  for (const n of fast.state.nodes) assert.ok(Math.abs(n.x) <= 3.2 && n.y >= -4 && n.y <= .15);
});

test('live rear contact pushes the continuous base and fur together, with an unchanged upper fit', local, async () => {
  const r = await rig();
  // A broad rear-facing armour surface through the lower pelt. This exercises
  // the real skinned pelt, live pose, contact raster and final rendered streams.
  const panel = r.state.layers.find((l) => l.piece.batch.name === 'Wolf_Back_Panel');
  const p = panel.piece.positions;
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < p.length; i += 3) { xs.push(p[i]); ys.push(p[i + 1]); zs.push(p[i + 2]); }
  const y = Math.min(...ys) - 1;
  const surface = { slot: 'test-armour', positions: new Float32Array([-40,y,Math.min(...zs), 40,y,Math.min(...zs), 40,y,Math.max(...zs), -40,y,Math.max(...zs)]), indices: new Uint16Array([0,1,2,0,2,3]) };
  r.arm.pieces.push(surface);
  const before = Float32Array.from(panel.piece.positions);
  assert.equal(stepWolfPeltMotion(r.state, r.arm, 1 / 60, {}, new Set(['test-armour'])), true);
  assert.ok(r.state.contacts > 0);
  assert.ok(panel.piece.positions.some((v, i) => i % 3 === 1 && v < before[i] - .1));
  for (const l of r.state.layers) if (!l.movable && !l.fur) assert.deepEqual(l.piece.batch.positions, l.base);
});

test('a heel below the solver hide still pushes the free guard coat out of its path', local, async () => {
  const r = await rig();
  const panel = r.state.layers.find((l) => l.piece.batch.name === 'Wolf_Back_Panel');
  const fur = r.state.layers.find((l) => l.piece.batch.name === 'Wolf_Back_Locks').piece;
  const lowestZ = (positions) => {
    let z = Infinity;
    for (let i = 2; i < positions.length; i += 3) z = Math.min(z, positions[i]);
    return z;
  };
  const bottom = lowestZ(fur.positions), top = lowestZ(panel.piece.positions) - 2;
  assert.ok(top > bottom + 3);
  let rear = Infinity;
  for (let i = 0; i < fur.positions.length; i += 3) {
    if (fur.positions[i + 2] < top) rear = Math.min(rear, fur.positions[i + 1]);
  }
  const y = rear - 2;
  r.arm.pieces.push({ slot: 'heel', indices: new Uint16Array([0,1,2,0,2,3]),
    positions: new Float32Array([-25,y,bottom-4, 25,y,bottom-4, 25,y,top, -25,y,top]) });
  stepWolfPeltMotion(r.state, r.arm, 1 / 60, {}, new Set(['heel']));
  assert.ok(r.state.contacts > 0);
  assert.ok(r.state.contactBands.every((depth, i, bands) => !i || Math.abs(depth - bands[i - 1]) < 1.87),
    'a contact spike is spread along the hide before it can stretch the UVs across one row');
  for (let i = 0; i < fur.positions.length; i += 3) {
    if (fur.positions[i + 2] < top - 3) assert.ok(fur.positions[i + 1] < y);
  }
});

test('the dense pelt compresses under stowed gear without changing its bone mounts', { skip: !existsSync(denseAsset) }, async () => {
  const bytes = name => new Uint8Array(readFileSync(`src/assets/mw/meshes/${name}.nif`));
  const arm = await assembleFirstPersonArm({ skeletonBytes: retailSkeleton(), parts: [
    { slot: 'cloak (wolf_pelt_cloak)', bones: [], bytes: bytes('pixal_wolf_cloak') },
    { slot: 'shield (steel)', bones: ['Shield Bone'], bytes: bytes('shield_sky_steel'), model: 'shield_sky_steel.nif' },
    { slot: 'cuirass', bones: [], bytes: bytes('pixal_barbarian_cuirass') },
    { slot: 'sheath', bones: ['Bip01 LongBladeTwoClose'], bytes: SHEATHED('w_claymore_daedric_sh.nif'), bare: true },
    { slot: 'holster', bones: ['Bip01 MarksmanBow'], bytes: SHEATHED('w_longbow_steel_sh.nif'), bare: true },
  ] });
  const isCloak = p => /^cloak/.test(p.slot), isGear = p => /^(shield-back|sheath|holster)/.test(p.slot);
  const rows = fitStowedGear(arm, { isCloak, isGear, isUnder: p => p.slot === 'cuirass', seatToBody: true, pressed: true, compressPelt: true });
  assert.equal(rows.filter(r => r.slung && r.how === 'over').length, 3);
  poseAssembly(arm);
  const mounts = new Map(arm.pieces.filter(isGear).map(p => [p, Float32Array.from(p.positions)]));
  arm.wolfPeltMotion = createWolfPeltMotion(arm.pieces);
  const state = arm.wolfPeltMotion;
  const layout = skinLayout(arm.pieces, state.moving);
  assert.equal(layout.ok, true);
  const lanes = p => new Float32Array(p.indices.length * 8);
  packSkinStream(layout, lanes);
  const heel = { slot: 'heel', indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
    positions: new Float32Array([-32, -38, 15, 32, -38, 15, 32, -38, 75, -32, -38, 75]) };
  // A heel swing sends the lower pelt out and across the stowed gear's plane.
  for (const skin of [true, false]) {
    poseAssembly(arm, { skin });
    arm.pieces.push(heel);
    stepWolfPeltMotion(state, arm, 1 / 60, { gait: 1 }, new Set(['heel', 'cuirass']), isGear);
    arm.pieces.pop();
    assert.ok(state.contacts > 0);
    assert.ok(state.pressedVertices > 0);
    writeSkinPalette(layout, arm);
    const moved = restreamMovedRows(layout, lanes);
    assert.equal(moved.length, state.moving.size);
    assert.equal(moved.reduce((sum, row) => sum + row.data.length, 0),
      [...state.moving].reduce((sum, p) => sum + p.indices.length * 6, 0));
    for (const p of state.moving) {
      assert.deepEqual(skinnedVertex(layout, p, 0), Array.from(p.positions.slice(0, 3)));
    }
    for (const [p, before] of mounts) {
      assert.deepEqual(p.positions, before);
      const rendered = skinnedVertex(layout, p, 0);
      assert.ok(Math.abs(rendered[1] - before[1]) < 0.001);
    }
  }
});
