// The air pass's emission replay binds an emitter program each time the records turn from meshes to flats and back,
// and it sent the program's whole frame block at every bind. A uniform stays with its program, so each now goes up
// only when it differs from what the program holds: the identity view and the samplers' units once for the program's
// life, the view-projection and the depth's terms when a frame moves them, a flat record's wind when it differs from
// the last one sent. The pins drive the real replay on a fake GL that keeps every program's uniforms and every unit's
// texture. They hold the picture first, each draw made under the state it was made under before, then the count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as airPass from '../../src/render/airPass.js';

const { AirPass } = airPass;

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** A fake GL that holds the state a draw is made in: each program's uniforms by name, each unit's texture. `sent`
 *  counts the emitter programs' uniform calls by name. */
function stateGl() {
  const sent = new Map();
  const programs = new Map();
  const units = new Map();
  const draws = [];
  let active = 0;
  let current = null;
  let ids = 0;
  const consts = { TEXTURE0: 1000, TEXTURE1: 1001, TEXTURE2: 1002, TEXTURE3: 1003, TEXTURE_2D: 3553, TRIANGLES: 4, UNSIGNED_INT: 5125 };
  const keep = (loc, value) => {
    if (!loc) return;
    programs.get(loc.program).set(loc.name, value);
    if (loc.program.name.startsWith('emit')) sent.set(loc.name, (sent.get(loc.name) ?? 0) + 1);
  };
  const methods = {
    getUniformLocation: (program, name) => ({ program, name }),
    getExtension: () => null,
    useProgram: (program) => {
      current = program;
    },
    activeTexture: (unit) => {
      active = unit - consts.TEXTURE0;
    },
    bindTexture: (_target, tex) => {
      units.set(active, tex);
    },
    uniformMatrix4fv: (loc, _transpose, data) => keep(loc, Array.from(data)),
    uniform1i: (loc, value) => keep(loc, [value]),
    uniform1f: (loc, value) => keep(loc, [Math.fround(value)]),
    uniform2f: (loc, a, b) => keep(loc, [Math.fround(a), Math.fround(b)]),
    uniform3f: (loc, a, b, c) => keep(loc, [Math.fround(a), Math.fround(b), Math.fround(c)]),
    uniform2fv: (loc, data) => keep(loc, Array.from(data, Math.fround)),
    uniform3fv: (loc, data) => keep(loc, Array.from(data, Math.fround)),
    uniform4fv: (loc, data) => keep(loc, Array.from(data, Math.fround)),
    drawElements: () => {
      const held = programs.get(current);
      const uniforms = Object.fromEntries([...held.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
      draws.push({ program: current.name, uniforms, units: [units.get(0), units.get(1), units.get(2)] });
    },
  };
  const gl = new Proxy(
    {},
    {
      get(_, key) {
        if (key in consts) return consts[key];
        if (key in methods) return methods[key];
        if (typeof key === 'string' && key.startsWith('create')) return () => ({ id: ++ids });
        if (typeof key === 'string' && key.toUpperCase() === key) return 1;
        return () => {};
      },
    },
  );
  const build = () => {
    const program = { name: `program${++ids}` };
    programs.set(program, new Map());
    return program;
  };
  const reset = () => {
    sent.clear();
    draws.length = 0;
  };
  return { gl, build, sent, draws, reset };
}

/** A real air pass on the fake GL, its emitter programs named so a draw says whose it was. */
function stand() {
  const fake = stateGl();
  const air = new AirPass(fake.gl, { build: fake.build, vs: { mesh: 'meshVs', bb: 'bbVs' } });
  air.programs.emitMesh.p.name = 'emitMesh';
  air.programs.emitBb.p.name = 'emitBb';
  air.resize(320, 200);
  air._ensureFrame(320, 200);
  air.projInfo.set([0.5, 0.25, -1.002, -0.2]);
  air.rect.set([0, 0, 320, 200]);
  air.canvas.set([320, 200]);
  return { fake, air };
}

/** Meshes and flats in turn, so the replay binds each program twice a frame: a flat record without Windfall's law
 *  after one with it, and a flat record that follows another (no bind between them). */
function scene() {
  const mesh = (id, maps) => ({
    vao: { id },
    subMeshes: maps.map((emis, k) => ({ _evEmis: emis, _evWin: 0, primitiveCount: 2, startIndex: k * 6 })),
  });
  const flats = (id, count) =>
    Array.from({ length: count }, (_, k) => ({
      archive: 210,
      record: id * 10 + k,
      vao: { id: `flat${id}-${k}` },
      indexCount: 6,
      size: { w: 1, h: 2 },
      origin: [k, 0, id],
      sway: 0.5,
    }));
  const flatRecord = (id, count, wind, law) => ({
    kind: 2,
    batches: flats(id, count),
    right: new Float32Array([1, 0, 0]),
    up: new Float32Array([0, 1, 0]),
    flatWind: new Float32Array(wind),
    wfSway: law ? new Float32Array([1, 2, 3, 4]) : null,
    wfAxis: law ? new Float32Array([0, 1, 0, 1]) : null,
    windfall: null,
  });
  const records = [
    { kind: 0, bounded: false, mesh: mesh('m0', ['e0', 'e1']), matrix: I },
    flatRecord(1, 2, [0.5, 0.25, 3, 0.8], true),
    { kind: 0, bounded: false, mesh: mesh('m1', ['e2']), matrix: I },
    flatRecord(2, 1, [0.75, 0.25, 3, 0.8], false),
    flatRecord(3, 1, [0.125, 0.125, 3, 0.8], false),
  ];
  const textures = new Map(),
    emissionTextures = new Map();
  for (const record of records)
    for (const batch of record.batches ?? []) {
      textures.set(`210_${batch.record}`, `tex${batch.record}`);
      emissionTextures.set(`210_${batch.record}`, `emis${batch.record}`);
    }
  const frame = {
    blackTex: 'black',
    windowEmission: new Float32Array([0.8, 0.57, 0.18]),
    windowRooms: false,
    bindVao() {},
    textures,
    emissionTextures,
  };
  return { frame, shadows: { count: records.length, records } };
}

/** The resolve's images for a world frame whose view-projection is `vp`: the AO, the glow's clear, the emission
 *  replay (the draws the fake keeps), no lanterns and no sun. */
function images(air, frame, shadows, vp) {
  air.f = { ...frame, shadows, pointLights: new Float32Array(0), clearColor: [0, 0, 0, 1], sunScale: 0, lightDir: null, proj: I, view: I, eye: [0, 0, 0] };
  air._vp.set(vp);
  air._images();
}

const VP1 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0]);
const VP2 = new Float32Array([0.875, 0, 0.125, 0, 0, 1, 0, 0, 0.125, 0, -1, -1, 0, 0, -0.2, 0]);

/** A world viewport moved between frames (a docked bar, a resize): the depth's terms and the bloom image's size. */
function moveViewport(air, rect, canvas, projInfo, size) {
  air.rect.set(rect);
  air.canvas.set(canvas);
  air.projInfo.set(projInfo);
  air.resize(size[0], size[1]);
}

test('every draw of the replay is made under the state it was made under before: the frame\'s view-projection, the identity view, the samplers on their units, the depth\'s terms, each flat under the wind its bind sent', () => {
  const { fake, air } = stand();
  const { frame, shadows } = scene();
  const depth = air.frame.depth;
  const frames = [
    { vp: VP1 },
    { vp: VP2 },
    { vp: VP2 },
    { vp: VP2, port: [[8, 4, 300, 180], [640, 400], [0.4, 0.2, -1.004, -0.25], [640, 400]] },
    { vp: VP2 },
    { vp: VP1, port: [[0, 0, 320, 200], [320, 200], [0.5, 0.25, -1.002, -0.2], [320, 200]] },
  ];
  for (const { vp, port } of frames) {
    if (port) moveViewport(air, ...port);
    fake.reset();
    images(air, frame, shadows, vp);
    assert.equal(fake.draws.length, 3 + 4, 'three emissive sub-meshes and four flats');
    for (const draw of fake.draws) {
      const held = draw.uniforms;
      assert.deepEqual(held.uProj, Array.from(vp), `${draw.program}: this frame's view-projection`);
      assert.deepEqual(held.uView, Array.from(I), `${draw.program}: the identity view`);
      assert.deepEqual(held.uEmissionTex, [1]);
      assert.deepEqual(held.uDepth, [2], 'the depth on unit 2');
      assert.deepEqual(held.uProjInfo, Array.from(air.projInfo), `${draw.program}: this frame's depth reconstruction`);
      assert.deepEqual(held.uRect, Array.from(air.rect), `${draw.program}: this frame's world viewport`);
      assert.deepEqual(held.uCanvas, Array.from(air.canvas), `${draw.program}: this frame's canvas`);
      assert.deepEqual(held.uBloomSize, [air.targets.bloom.w, air.targets.bloom.h], `${draw.program}: this frame's bloom image`);
      assert.equal(draw.units[2], depth, 'unit 2 holds the frame\'s depth');
    }
    const flatsDrawn = fake.draws.filter((draw) => draw.program === 'emitBb');
    assert.deepEqual(
      flatsDrawn.map((draw) => draw.uniforms.uFlatWind),
      [
        [0.5, 0.25, 3, Math.fround(0.8)],
        [0.5, 0.25, 3, Math.fround(0.8)],
        [0.75, 0.25, 3, Math.fround(0.8)],
        [0.75, 0.25, 3, Math.fround(0.8)],
      ],
      'a bind sends its record\'s wind; a flat record after another keeps the wind it found, as before',
    );
    for (const draw of flatsDrawn) {
      assert.deepEqual(draw.uniforms.uTex, [0], 'the flat\'s picture on unit 0');
      assert.deepEqual(draw.uniforms.uWindfallSway, [1, 2, 3, 4], 'a record without the law leaves the last law sent');
      assert.deepEqual(draw.uniforms.uWindfallAxis, [0, 1, 0, 1]);
    }
    assert.deepEqual(flatsDrawn.map((draw) => draw.units[0]), ['tex10', 'tex11', 'tex20', 'tex30']);
    assert.deepEqual(flatsDrawn.map((draw) => draw.units[1]), ['emis10', 'emis11', 'emis20', 'emis30']);
    const meshesDrawn = fake.draws.filter((draw) => draw.program === 'emitMesh');
    assert.deepEqual(meshesDrawn.map((draw) => draw.units[1]), ['e0', 'e1', 'e2'], 'each sub-mesh\'s emission map on unit 1');
    assert.ok(meshesDrawn.every((draw) => draw.units[0] === depth), 'a mesh draws with the depth on unit 0, as the depth block bound it');
  }
});

test('the replay sends a uniform only when it differs from what its program holds: the fixed ones once for the program\'s life, the view-projection when the frame moves it, a flat\'s wind when it changes', () => {
  const { fake, air } = stand();
  const { frame, shadows } = scene();
  images(air, frame, shadows, VP1);
  const first = Object.fromEntries(fake.sent);
  // two programs, each bound twice in the frame: meshes, flats, meshes, flats
  for (const name of ['uView', 'uEmissionTex', 'uDepth', 'uProjInfo', 'uRect', 'uCanvas', 'uBloomSize', 'uProj'])
    assert.equal(first[name], 2, `${name}: once a program, not once a bind`);
  assert.equal(first.uTex, 1, 'the flat program\'s picture unit, once');
  assert.equal(first.uFlatWind, 2, 'the first flat record\'s wind, then the second\'s; the third, after no bind, sends none');
  assert.equal(first.uWindfallSway, 1);
  assert.equal(first.uWindfallAxis, 1);
  // the next frame: the camera moved, nothing else did
  fake.reset();
  images(air, frame, shadows, VP2);
  const moved = Object.fromEntries(fake.sent);
  assert.equal(moved.uProj, 2, 'the moved view-projection, once a program');
  for (const name of ['uView', 'uEmissionTex', 'uDepth', 'uTex', 'uProjInfo', 'uRect', 'uCanvas', 'uBloomSize', 'uWindfallSway', 'uWindfallAxis'])
    assert.equal(moved[name], undefined, `${name}: held from the last frame`);
  assert.equal(moved.uFlatWind, 2, 'the wind back to the first record\'s, then on to the second\'s');
  // a still frame: only what each draw carries of its own, and the wind's two turns
  fake.reset();
  images(air, frame, shadows, VP2);
  const still = Object.fromEntries(fake.sent);
  assert.deepEqual(Object.keys(still).sort(), ['uEmissionColor', 'uFlatWind', 'uModel', 'uOrigin', 'uRight', 'uRoomsLit', 'uSize', 'uSway', 'uUp']);
  // the world viewport moved: each of its terms once a program, the view-projection held
  moveViewport(air, [8, 4, 300, 180], [640, 400], [0.4, 0.2, -1.004, -0.25], [640, 400]);
  fake.reset();
  images(air, frame, shadows, VP2);
  const docked = Object.fromEntries(fake.sent);
  for (const name of ['uRect', 'uCanvas', 'uProjInfo', 'uBloomSize']) assert.equal(docked[name], 2, `${name}: the moved value, once a program`);
  assert.equal(docked.uProj, undefined, 'uProj: held');
  // one term alone moved: that one goes up, the rest are held
  air.rect[0] = 16;
  fake.reset();
  images(air, frame, shadows, VP2);
  const shifted = Object.fromEntries(fake.sent);
  assert.equal(shifted.uRect, 2, 'uRect: the moved rect, once a program');
  for (const name of ['uCanvas', 'uProjInfo', 'uBloomSize', 'uProj']) assert.equal(shifted[name], undefined, `${name}: held`);
});

test('a held uniform moves on the first ask, on any float that changes as the GL keeps it, and on -0 and NaN as values of their own', () => {
  const { heldMoved } = airPass;
  const held = { v: new Float32Array(2), sent: false };
  assert.equal(heldMoved(held, [0, 0]), true, 'never sent: it goes up');
  assert.equal(heldMoved(held, [0, 0]), false);
  assert.equal(heldMoved(held, [0, 1e-9]), true);
  assert.equal(heldMoved(held, [0, 1e-9 + 1e-25]), false, 'the same float32: the GL would hold the same value');
  assert.equal(heldMoved(held, [-0, 1e-9]), true, '-0 is not 0');
  assert.equal(heldMoved(held, [NaN, 1e-9]), true);
  assert.equal(heldMoved(held, [NaN, 1e-9]), false);
});
