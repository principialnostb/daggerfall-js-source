import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCloth, stepCloth, makeCoreFn, articulatedCapsules } from '../../src/characters/clothSim.js';
import { drapedGrid, BODY_CORE } from '../../src/characters/pieces/draped.js';

const core = makeCoreFn(BODY_CORE);
const SO = 0.030;

function simulate(name, steps, wind) {
  const cloth = buildCloth(drapedGrid(name));
  for (let s = 0; s < steps; s++) {
    const gait = Math.sin(s * 0.2);
    stepCloth(cloth, 1/60, { gy: -7, gx: wind ? 0.4*gait : 0, gz: wind ? -1.6 : 0, pinDY: 0.02*Math.sin(s*0.4) }, core);
  }
  return cloth;
}


test('free cloth vertices follow abrupt torso pose changes before collision', () => {
  const c = buildCloth({
    rows: 2, cols: 1, wrap: false,
    pos: Float32Array.from([0, 1.5, -0.1, 0.12, 0.85, -0.18]),
    faces: [],
  });
  const noMotion = { gx: 0, gy: 0, gz: 0, damp: 0, maxStep: 0, iters: 0, collisionPasses: 0 };
  stepCloth(c, 1 / 60, noMotion, () => [0, 0]);
  const pose = { ...noMotion, lean: 0.48, twist: 0.31, leanPivot: 1.0, rootX: 0.14, rootY: -0.03, rootZ: 0.08, pinDY: 0.02 };
  const x = 0.12, y = 0.85, z = -0.18;
  const ct = Math.cos(pose.twist), st = Math.sin(pose.twist);
  const tx = ct*x + st*z, tz = -st*x + ct*z;
  const dy = y - pose.leanPivot, cl = Math.cos(pose.lean), sl = Math.sin(pose.lean);
  const expected = [tx + pose.rootX, pose.leanPivot + cl*dy - sl*tz + pose.rootY + pose.pinDY, sl*dy + cl*tz + pose.rootZ];
  stepCloth(c, 1 / 60, pose, () => [0, 0]);
  const actual = [c.pos[3], c.pos[4], c.pos[5]];
  for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-5,
    `free vertex axis ${axis} did not follow pose frame: ${actual[axis]} vs ${expected[axis]}`);
});

test('default settings keep secondary motion restrained', () => {
  const grid = {
    rows: 3, cols: 3, wrap: false,
    pos: Float32Array.from([
      -0.1, 2.0, 2,  0, 2.0, 2,  0.1, 2.0, 2,
      -0.1, 1.8, 2,  0, 1.8, 2,  0.1, 1.8, 2,
      -0.1, 1.6, 2,  0, 1.6, 2,  0.1, 1.6, 2,
    ]),
    faces: [],
  };
  const c = buildCloth(grid);
  const initial = c.pos.slice();
  for (let s = 0; s < 24; s++) stepCloth(c, 1 / 60, {}, () => [0, 0]);
  // The defaults should add a slight settling motion, not a visible drop.
  for (let i = 0; i < c.V; i++) {
    if (c.pinned[i]) continue;
    assert.ok(initial[i * 3 + 1] - c.pos[i * 3 + 1] < 0.04,
      `vertex ${i}: default gravity moved it too far`);
  }
});

test('cloth sim is stable (no NaN, bounded) for skirt, robe, cape', () => {
  for (const name of ['Long Skirt', 'Plain Robes', 'Casual Cloak']) {
    const c = simulate(name, 400, true);
    for (let i = 0; i < c.V*3; i++) {
      assert.ok(Number.isFinite(c.pos[i]), `${name}: non-finite at ${i}`);
      assert.ok(Math.abs(c.pos[i]) < 5, `${name}: exploded at ${i} = ${c.pos[i]}`);
    }
  }
});

test('no clipping: every free particle stays outside the body collider', () => {
  for (const name of ['Long Skirt', 'Plain Robes', 'Casual Cloak', 'Short Skirt']) {
    const c = simulate(name, 500, true);
    let worst = Infinity;
    for (let i = 0; i < c.V; i++) {
      if (c.pinned[i]) continue;
      const y = c.pos[i*3+1], px = c.pos[i*3], pz = c.pos[i*3+2];
      const [hx, hz] = core(y); const A = hx + SO, C = hz + SO;
      const e = (px*px)/(A*A) + (pz*pz)/(C*C); // >=1 means outside the standoff ellipse
      worst = Math.min(worst, e);
    }
    // allow a hair of numerical slack below the standoff shell, but never
    // inside the actual body (e >= (hx/(hx+SO))^2 ~ 0.9)
    assert.ok(worst > 0.9, `${name}: a particle clipped into the body (worst e=${worst.toFixed(3)})`);
  }
});

// Articulated limb collider for a gait phase (mirrors the viewer).
const GEOM = { legX: 0.082, hipY: 0.90, kneeY: 0.52, ankleY: 0.10, legR: [0.125, 0.112, 0.086] };
function capsFor(phase) {
  const sA = 0.44, kA = 0.9;
  return articulatedCapsules(GEOM, {
    legL: { sw: -sA*Math.sin(phase),         bd: kA*Math.max(0, Math.sin(phase+1.2)) },
    legR: { sw: -sA*Math.sin(phase+Math.PI), bd: kA*Math.max(0, Math.sin(phase+Math.PI+1.2)) },
  });
}
function capsuleDist(px, py, pz, C) {
  const p0 = C.p0, p1 = C.p1, abx=p1[0]-p0[0], aby=p1[1]-p0[1], abz=p1[2]-p0[2];
  const l2 = abx*abx+aby*aby+abz*abz || 1e-9;
  let t = ((px-p0[0])*abx + (py-p0[1])*aby + (pz-p0[2])*abz)/l2; t = Math.max(0, Math.min(1, t));
  const cx=p0[0]+abx*t, cy=p0[1]+aby*t, cz=p0[2]+abz*t, r = C.r0 + (C.r1-C.r0)*t;
  return Math.hypot(px-cx, py-cy, pz-cz) - r;   // TRUE 3D distance to the capsule surface; >0 outside
}

test('no clipping during WALKING: cloth stays out of the bent legs (arms hang outside)', () => {
  for (const name of ['Long Skirt', 'Plain Robes', 'Casual Cloak']) {
    const c = buildCloth(drapedGrid(name));
    let phase = 0;
    for (let s = 0; s < 700; s++) { phase += 0.11; const bob = 0.02*Math.sin(phase*2);
      stepCloth(c, 1/60, { gy: -7, gz: -1.6, pinDY: bob, capsules: capsFor(phase) }, core); }
    const caps = capsFor(phase);
    for (let i = 0; i < c.V; i++) {
      if (c.pinned[i]) continue;
      const px = c.pos[i*3], py = c.pos[i*3+1], pz = c.pos[i*3+2];
      for (const C of caps) assert.ok(capsuleDist(px, py, pz, C) > -0.004, `${name}: particle clipped into a leg (3D)`);
      if (py >= 0.80 && py <= 1.56) { const [hx, hz] = core(py); const A = hx+0.03, C2 = hz+0.03; const e = (px*px)/(A*A)+(pz*pz)/(C2*C2); assert.ok(e > 0.9, `${name}: particle inside the torso`); }
    }
  }
});

test('final torso projection cannot undo articulated leg clearance', () => {
  // A point starts inside a thigh capsule. Torso collision is evaluated in
  // the lean/twist frame, then the final world-space limb pass must restore
  // clearance instead of leaving the point inside the leg.
  const c = buildCloth({
    rows: 1, cols: 1, wrap: false,
    pos: Float32Array.from([0.082, 0.70, 0]),
    faces: [],
  }, 0);
  const capsules = [{
    p0: [0.082, 0.92, 0], p1: [0.082, 0.42, 0],
    r0: 0.12, r1: 0.10,
  }];
  stepCloth(c, 1/120, {
    gy: 0, damp: 0, maxStep: 0,
    lean: 0.48, twist: 0.38, leanPivot: 1.0,
    capsules, collisionPasses: 6, standoff: SO,
  }, () => [0.19, 0.12]);
  const distance = capsuleDist(c.pos[0], c.pos[1], c.pos[2], capsules[0]);
  assert.ok(distance >= -0.004, `particle remained inside thigh capsule (distance=${distance.toFixed(4)})`);
});

test('bone-driven drape: follows the legs without clipping or exploding', () => {
  const geom = { legX: 0.082, hipY: 0.90, kneeY: 0.52, ankleY: 0.10, legR: [0.125, 0.112, 0.086] };
  const ang = (ph) => ({
    legL: { sw: -0.44*Math.sin(ph),         bd: 0.9*Math.max(0, Math.sin(ph+1.2)) },
    legR: { sw: -0.44*Math.sin(ph+Math.PI), bd: 0.9*Math.max(0, Math.sin(ph+Math.PI+1.2)) },
  });
  for (const name of ['Long Skirt', 'Plain Robes']) {
    const c = buildCloth(drapedGrid(name));
    let ph = 0;
    for (let s = 0; s < 600; s++) { ph += 0.11; const a = ang(ph); const bob = 0.02*Math.sin(ph*2);
      stepCloth(c, 1/60, { gy: -7, gx: 0.3*Math.sin(ph), gz: -0.9, pinDY: bob, bones: { ...geom, ...a, strength: 0.8 } }, core); }
    const caps = capsFor(ph);   // reuse the leg-capsule geometry as a clip probe
    for (let i = 0; i < c.V; i++) {
      if (c.pinned[i]) continue;
      const px = c.pos[i*3], py = c.pos[i*3+1], pz = c.pos[i*3+2];
      assert.ok(Number.isFinite(px) && Math.abs(px) < 5, `${name}: bone-driven vertex exploded`);
      for (const C of caps) assert.ok(capsuleDist(px, py, pz, C) > -0.030, `${name}: bone-driven cloth clipped a leg`);
    }
  }
});


test('body collision follows torso lean, twist, bob, and root translation', () => {
  const lean = 0.42, twist = 0.65, pivot = 1.0, bob = 0.025;
  const root = [0.12, 0.08, -0.17];
  const posePoint = (x, y, z) => {
    const ct = Math.cos(twist), st = Math.sin(twist);
    [x, z] = [ct*x + st*z, -st*x + ct*z];
    const dy = y - pivot, cl = Math.cos(lean), sl = Math.sin(lean);
    return [x + root[0], pivot + cl*dy - sl*z + root[1] + bob, sl*dy + cl*z + root[2]];
  };
  const c = buildCloth({
    rows: 2, cols: 1, wrap: false,
    pos: Float32Array.from([0, 1.30, -0.18, 0, 0.90, 0]),
    faces: [],
  });
  c.pos.set([...posePoint(0, 1.30, -0.18), ...posePoint(0, 0.90, 0)]);
  c.prev.set(c.pos);
  stepCloth(c, 1/60, {
    gx: 0, gy: 0, gz: 0, damp: 0, maxStep: 0, pinDY: bob,
    rootX: root[0], rootY: root[1], rootZ: root[2],
    bodyBob: bob, lean, leanPivot: pivot, twist,
    capsules: null, ellipsoids: [], collisionPasses: 8,
  }, core);
  const local = (() => {
    let [x, y, z] = [c.pos[3] - root[0], c.pos[4] - root[1] - bob, c.pos[5] - root[2]];
    const dy = y - pivot, cl = Math.cos(lean), sl = Math.sin(lean);
    [y, z] = [pivot + cl*dy + sl*z, -sl*dy + cl*z];
    const ct = Math.cos(twist), st = Math.sin(twist);
    [x, z] = [ct*x - st*z, st*x + ct*z];
    return [x, y, z];
  })();
  const [hx, hz] = core(local[1]), e = local[0]**2/(hx+SO)**2 + local[2]**2/(hz+SO)**2;
  assert.ok(e >= 0.999, `animated torso collision left particle inside body (e=${e})`);
});

test('pelvis ellipsoid keeps cloak particles outside without injecting collision velocity', () => {
  const grid = {
    rows: 2, cols: 1, wrap: false,
    pos: Float32Array.from([0, 1.0, -0.02, 0, 0.88, -0.02]),
    faces: [],
  };
  const c = buildCloth(grid);
  stepCloth(c, 1 / 60, {
    gy: 0, damp: 0.88, capsules: null,
    ellipsoids: [{ x: 0, y: 0.88, z: -0.02, rx: 0.17, ry: 0.13, rz: 0.125 }],
  }, () => [0, 0]);
  const x = c.pos[3], y = c.pos[4], z = c.pos[5];
  const e = (x*x)/(0.20*0.20) + ((y-0.88)*(y-0.88))/(0.16*0.16) + ((z+0.02)*(z+0.02))/(0.155*0.155);
  assert.ok(e >= 0.999, `pelvis ellipsoid still intersects particle (e=${e})`);
  // Collision projection must not be mistaken for new Verlet velocity on the next frame.
  assert.ok(Math.hypot(c.pos[3]-c.prev[3], c.pos[4]-c.prev[4], c.pos[5]-c.prev[5]) < 1e-5,
    'collision ejection injected artificial velocity');
});
