import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { assembleFirstPersonArm, poseAssembly } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { createWolfPeltMotion, stepWolfPeltMotion } from '../../../src/formats/morrowind/mwWolfPeltMotion.js';
import { FEMALE_SKELETON } from '../../../tools/skyrim/mwBody.mjs';

const asset = 'src/assets/mw/meshes/wolf_pelt_brown.nif';
const local = { skip: !existsSync(asset) || !existsSync(FEMALE_SKELETON) };
async function rig() {
  const arm = await assembleFirstPersonArm({ skeletonBytes: new Uint8Array(readFileSync(FEMALE_SKELETON)),
    parts: [{ slot: 'cloak (wolf_pelt_cloak)', bones: [], bytes: new Uint8Array(readFileSync(asset)) }] });
  assert.equal(arm.ok, true);
  poseAssembly(arm);
  return { arm, state: createWolfPeltMotion(arm.pieces) };
}
function frame(r, dt, motion = {}) {
  poseAssembly(r.arm);
  return stepWolfPeltMotion(r.state, r.arm, dt, motion);
}
const maxNode = (s) => Math.max(...s.nodes.map((n) => Math.hypot(n.x, n.y)));

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
