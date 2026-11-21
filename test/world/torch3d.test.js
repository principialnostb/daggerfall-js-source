import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTorchBody,torchKind,TORCH_ARCHIVE} from '../../src/world/torchModel.js';
import { identity, transformPoint } from '../../src/world/mat4.js';
import { buildLightFixture, fixtureRecord, fixtureEmits } from '../../src/world/lightFixtureModel.js';
import { Collider } from '../../src/player/collider.js';
import { findTorchMount, fixtureCeilingGap, mountTorchBatch, torchMountAt, TORCH_COLLAR_Y } from '../../src/world/torchMount.js';
import { drawCampfireBillboards, rememberCampfireBatch, releaseCampfireBatch } from '../../src/render/campfireBillboards.js';
import {createTorchVisual} from '../../src/scenes/torchVisual.js';
import { attachFixtureArchive } from '../fixtures/mw/attach.mjs';

test.before(attachFixtureArchive);
test('only the five flame torches become solid fixtures',()=>{
 assert.deepEqual(Array.from({length:30},(_,r)=>r).filter(r=>torchKind(210,r)),[6,16,17,18,20]);
 assert.equal(torchKind(211,6),null);
 for(const record of [6,16,17,18,20]) {
  const m=buildTorchBody(torchKind(210,record));
  assert.ok(m.positions.every(Number.isFinite));
  assert.ok(m.indices.every(i=>i<m.vertexCount));
  assert.ok(m.aabb.extent[0]>0 && m.aabb.extent[2]>0);
  assert.ok(m.subMeshes.every(s=>s.textureArchive===TORCH_ARCHIVE));
 }
});
test('fixtures share animation resources and release only after the final owner',()=>{
 const uploads=[],freed=[],released=[],draws=[];
 const r={createMesh:m=>m,uploadTexture:(...a)=>uploads.push(a),destroyMesh:m=>freed.push(m),releaseTexture:(...a)=>released.push(a),drawMesh:(...a)=>draws.push(a)};
 const a=createTorchVisual(r,'pole'),b=createTorchVisual(r,'wood');
 assert.equal(uploads.length,7);
 // Lifecycle can be tested without allocating a WebGL target.
 a.destroy();a.destroy();assert.equal(freed.length,0);
 b.destroy();assert.equal(freed.length,54);assert.equal(released.length,7);
 const c=createTorchVisual(r,'iron');assert.equal(uploads.length,14);c.destroy();
 assert.equal(draws.length,0);
});


test('a wall bracket reaches the authored face and pulls an embedded torch into the room', () => {
  const collider = new Collider(() => -Infinity);
  collider.addMesh('stone', [0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0], [0, 1, 2, 0, 2, 3], identity());
  const mount = findTorchMount(collider, [1, 1, -.06], 1);
  assert.ok(mount);
  assert.ok(Math.abs(mount.wall[2]) < 1e-8);
  assert.equal(mount.base[2], .16);
  assert.equal(mount.yaw, 0);
  assert.equal(findTorchMount(collider, [1, 1, 2], 1), null);
});

test('wall torches find room geometry in a separate static bucket', () => {
  const collider = new Collider(() => -Infinity);
  collider.addMesh('room-wall', [0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0], [0, 1, 2, 0, 2, 3], identity());
  const batch = { archive: 210, record: 16, size: { h: 1 } };
  mountTorchBatch(batch, [[1, 1, .7]], collider, { only: ['interior'] });
  const mount = torchMountAt(batch, 0);
  assert.ok(mount);
  assert.ok(Math.abs(mount.wall[2]) < 1e-8);
  assert.equal(mount.yaw, 0);
});

test('an anchor on a wall cap finds the wall below the collar ray', () => {
  const collider = new Collider(() => -Infinity);
  collider.addMesh('stone', [0, 0, 0, 2, 0, 0, 2, 1.4, 0, 0, 1.4, 0], [0, 1, 2, 0, 2, 3], identity());
  const mount = findTorchMount(collider, [1, 1, 0], 1);
  assert.ok(mount);
  assert.equal(mount.wall[1], 1 + TORCH_COLLAR_Y);
  assert.ok(Math.abs(mount.base[2] - .16) < 1e-6);
});

test('a recessed, sloped wall receives the bracket on its actual face', () => {
  const collider = new Collider(() => -Infinity);
  collider.addMesh('stone', [0, 0, 0, 2, 0, 0, 2, 3, .9, 0, 3, .9], [0, 1, 2, 0, 2, 3], identity());
  const mount = findTorchMount(collider, [1, 1, 1.64], 1);
  assert.ok(mount);
  assert.ok(Math.abs(mount.wall[2] - .3 * mount.wall[1]) < 1e-6);
  assert.equal(mount.base[1] + TORCH_COLLAR_Y, mount.wall[1]);
  assert.ok(mount.base[2] > mount.wall[2] + .24);
});

test('a mixed wall torch batch draws both bodies and adds a bracket only at the wall', () => {
  const collider = new Collider(() => -Infinity);
  collider.addMesh('stone', [0, 0, 0, 2, 0, 0, 2, 3, 0, 0, 3, 0], [0, 1, 2, 0, 2, 3], identity());
  const centers = [[1, 1, .08], [1, 1, 2]];
  const batch = { archive: 210, record: 16, size: { h: 1 }, vao: {}, indexCount: 12, _ibOff: 48 };
  const draws = [];
  const renderer = {
    createMesh: mesh => mesh,
    uploadTexture() {},
    drawMesh: (mesh, matrix) => draws.push({ mesh, matrix }),
  };
  rememberCampfireBatch(mountTorchBatch(batch, centers, collider), centers);
  try {
    const remaining = drawCampfireBillboards(renderer, [batch], 0);
    assert.deepEqual(remaining, []);
    assert.equal(batch.indexCount, 12);
    assert.equal(draws.length, 9);
    assert.equal(draws[5].mesh, draws[1].mesh);
    assert.equal(draws[5].matrix[14], 2);
    assert.ok(Math.abs(draws[0].matrix[14]) < 1e-8);
    const body = draws[1].matrix;
    const collar = transformPoint(body, 0, TORCH_COLLAR_Y, 0);
    assert.ok(Math.abs(collar[1] - (1 + TORCH_COLLAR_Y)) < 1e-6);
    assert.ok(Math.abs(collar[2] - .16) < 1e-6);
    const cup = transformPoint(body, 0, .74, 0);
    assert.ok(cup[2] > collar[2] + .08);
    const flame = draws[2].matrix;
    assert.ok(Math.abs(flame[14] - cup[2]) < 1e-6);
    assert.equal(flame[6], 0);
  } finally {
    releaseCampfireBatch(batch);
  }
});


test('wall torches outside the camera submit no geometry and return when visible', () => {
  const draws = [];
  const renderer = {
    _proj: identity(), _view: identity(),
    createMesh: mesh => mesh, uploadTexture() {},
    drawMesh: (...args) => draws.push(args),
  };
  const batch = { archive: 210, record: 16, size: { h: 1 }, vao: {}, indexCount: 6, origin: [10, 0, 0] };
  rememberCampfireBatch(batch, [[0, 0, 0]]);
  try {
    assert.deepEqual(drawCampfireBillboards(renderer, [batch], 0), []);
    assert.equal(draws.length, 0);
    batch.origin[0] = 0;
    assert.deepEqual(drawCampfireBillboards(renderer, [batch], 0), []);
    assert.equal(draws.length, 4);
  } finally {
    releaseCampfireBatch(batch);
  }
});


test('all archive 210 records have an original 3D visual and cold fixtures have no flame or emission', () => {
  for (let record = 0; record < 30; record++) {
    const fixture = fixtureRecord(210, record);
    if (record === 1 || torchKind(210, record)) {
      assert.equal(fixture, null);
      continue;
    }
    assert.equal(fixture, record);
    const { mesh, flames } = buildLightFixture(record);
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(mesh.indices.every(index => index < mesh.vertexCount));
    assert.ok(mesh.aabb.extent.every(extent => extent > 0));
    if (record === 8) {
      assert.equal(flames.length, 1);
      assert.ok(mesh.subMeshes.every(material => !fixtureEmits(material.textureRecord)));
    }
    if ([7, 10, 12].includes(record)) {
      assert.deepEqual(flames, []);
      assert.ok(mesh.subMeshes.every(material => !fixtureEmits(material.textureRecord)));
    }
  }
});

test('a hanging lamp extends its support to the static ceiling and frees its fixture resources', () => {
  const collider = new Collider(() => -Infinity);
  collider.addMesh('stone', [0, 1.2, 0, 2, 1.2, 0, 2, 1.2, 2, 0, 1.2, 2], [0, 1, 2, 0, 2, 3], identity());
  const centers = [[1, 0, 1]];
  const batch = { archive: 210, record: 24, size: { h: 1 }, vao: {}, indexCount: 6 };
  const draws = [], released = [], uploaded = [];
  const renderer = {
    createMesh: mesh => mesh,
    uploadTexture: (_, record) => uploaded.push(record),
    releaseTexture: (_, record) => released.push(record),
    drawMesh: (_, matrix) => draws.push(matrix),
  };
  const unsupported = { ...batch };
  mountTorchBatch(unsupported, [[3, 0, 3]], collider);
  assert.equal(fixtureCeilingGap(unsupported, 0), 0);
  rememberCampfireBatch(mountTorchBatch(batch, centers, collider), centers);
  try {
    assert.ok(Math.abs(fixtureCeilingGap(batch, 0) - .2) < 1e-6);
    assert.deepEqual(drawCampfireBillboards(renderer, [batch], 0), []);
    assert.equal(draws.length, 5);
    assert.ok(Math.abs(transformPoint(draws[2], 0, 1, 0)[1] - 1.2) < 1e-6);
    assert.ok(Math.abs(draws[0][5] - 1.05) < 1e-6);
    // The chain bridges the full gap to the moved socket, starting at the lamp eye.
    assert.ok(Math.abs(transformPoint(draws[1], 0, 0, 0)[1] - .867 * 1.05) < 1e-6);
    assert.ok(Math.abs(transformPoint(draws[1], 0, 1, 0)[1] - (1.2 - (1 - .957) * 1.05)) < 1e-6);
  } finally {
    releaseCampfireBatch(batch);
  }
  assert.deepEqual(released.sort(), uploaded.sort());
});

test('pendant lamps share the Blender geometry and the unlit vessel omits emission', () => {
  const draws = [];
  const renderer = {
    createMesh: mesh => mesh,
    uploadTexture() {},
    drawMesh: (mesh, matrix, remap, options) => draws.push({ mesh, matrix, options }),
  };
  const lamps = [8, 27, 12].map(record => createTorchVisual(renderer, record));
  try {
    lamps[0].draw([0, 0, 0], 1.2, 0);
    lamps[1].draw([0, 0, 0], 1.8, 1 / 12);
    lamps[2].draw([0, 0, 0], 1, 0);
    assert.equal(draws.length, 13);
    assert.equal(draws[0].mesh, draws[5].mesh);
    assert.deepEqual(draws[0].matrix, draws[5].matrix);
    assert.ok(draws[6].matrix[5] > draws[1].matrix[5]);
    assert.ok(Math.abs(transformPoint(draws[7].matrix, 0, 1, 0)[1] - 1.8) < 1e-6);
    assert.equal(draws[0].mesh.positions, draws[10].mesh.positions);
    assert.notEqual(draws[3].mesh, draws[8].mesh);
    assert.ok(draws[4].options.translucent > 0);
    const records = draw => draw.mesh.subMeshes.map(part => part.textureRecord);
    assert.ok(!records(draws[0]).includes(34));
    assert.ok(records(draws[3]).every(record => record >= 5 && record <= 8));
    assert.ok(records(draws[10]).includes(35));
    assert.ok(records(draws[10]).every(record => record !== 32 && record !== 34));
  } finally {
    for (const lamp of lamps) lamp.destroy();
  }
});
