import { test } from 'node:test';
import {setDfLookPalette} from '../../src/world/dfLook.js';
import assert from 'node:assert/strict';
import { buildCampfireBody, buildCampfireFlame, campfirePaint, campfireFlameState, CAMPFIRE_FRAMES } from '../../src/world/campfireModel.js';
import { createCampfireVisual, campfireMatrix, campfirePulse, drawCampWorldFx } from '../../src/scenes/campfireVisual.js';

test('background flame geometry uses transferable buffers and preserves frames drawn before it arrives', async t => {
  const oldWorker = globalThis.Worker, oldSelf = globalThis.self;
  t.after(() => {
    if (oldWorker === undefined) delete globalThis.Worker; else globalThis.Worker = oldWorker;
    if (oldSelf === undefined) delete globalThis.self; else globalThis.self = oldSelf;
  });
  let client, closed = false, messages = 0, starts = 0;
  globalThis.Worker = class {
    constructor() { client = this; }
    postMessage() { starts++; }
  };
  globalThis.self = {
    postMessage(value, buffers) {
      const data = structuredClone(value,{transfer:buffers});
      assert.equal(value.mesh.positions.byteLength,0);
      client.onmessage({data});
      messages++;
    },
    close() { closed = true; }
  };
  const {prepareCampfireFlames,campfireLayerGeometry} = await import('../../src/world/campfireFlameCache.js?worker-test');
  await import('../../src/world/campfireFlameWorker.js');
  prepareCampfireFlames();
  prepareCampfireFlames();
  const visible = campfireLayerGeometry(0,'core');
  globalThis.self.onmessage();
  assert.equal(starts,1);
  assert.equal(messages,48);
  assert.ok(closed);
  assert.equal(campfireLayerGeometry(0,'core'),visible);
  assert.deepEqual(campfireLayerGeometry(15,'outer'),buildCampfireFlame(15,'outer'));
});

test('campfire meshes are finite, outward-normal unit faces with valid indices and grounded bounds', () => {
  const body = buildCampfireBody();
  for (const m of [body, ...Array.from({ length: CAMPFIRE_FRAMES }, (_, i) => buildCampfireFlame(i))]) {
    for (const field of ['positions', 'normals', 'uvs']) assert.ok(m[field].every(Number.isFinite));
    assert.ok(m.indices.every((i) => i < m.vertexCount));
    for (const sm of m.subMeshes) { assert.equal(sm.textureArchive, 38341); assert.ok(Number.isInteger(sm.textureRecord)); }
    for (let i = 0; i < m.normals.length; i += 3) assert.ok(Math.abs(Math.hypot(...m.normals.slice(i, i + 3)) - 1) < 1e-5);
    assert.ok(m.aabb.center[1] - m.aabb.extent[1] >= 0);
    assert.ok(m.indices.length < 30000);
  }
  assert.ok(body.aabb.extent[0] > .40 && body.aabb.extent[0] < .53);
  assert.notDeepEqual(buildCampfireFlame(0).positions, buildCampfireFlame(1).positions);
  assert.deepEqual(buildCampfireFlame(0), buildCampfireFlame(CAMPFIRE_FRAMES));
  for (let i = 0; i < 9; i++) { const p = campfirePaint(i); assert.equal(p.colors.length,p.width*p.height*4); }
});

test('two camp pools share GPU resources, a cold fire draws only its body, the last owner releases and can restore', () => {
  const meshes = [], freed = [], draws = [], pictures = [], released = [], emission = [];
  const r = {
    createMesh(m) { meshes.push(m); return m; }, destroyMesh(m) { freed.push(m); },
    uploadTexture(a, n) { pictures.push([a, n]); }, releaseTexture(a, n) { released.push([a, n]); },
    uploadEmissionTexture() {}, evictEmissionTexture(k) { emission.push(k); },
    drawMesh(...args) { draws.push(args); },
  };
  const a = createCampfireVisual(r), b = createCampfireVisual(r), c = { rec: { pos: [1200, 3, -200], yaw: 0 } };
  a.draw(c, true, 0); b.draw(c, false, 0);
  assert.equal(meshes.length, 4); assert.equal(pictures.length, 10); assert.equal(draws.length, 5);
  assert.deepEqual(Array.from(draws[0][1].slice(12, 15)), c.rec.pos);
  assert.equal(draws[1][3].noShadow, true);
  a.destroy(); assert.equal(freed.length, 0);
  assert.equal(draws[2][3].translucent,.47); assert.equal(draws[3][3].translucent,.26);
  assert.ok(draws[4][0].subMeshes.some(s=>s.textureRecord===9));
  b.draw(c, true, 0);
  assert.equal(meshes.length, 4);
  b.draw(c, true, .25);
  assert.equal(meshes.length, 7);
  b.destroy(); assert.deepEqual(freed, meshes); assert.equal(released.length, 10); assert.equal(emission.length, 5);
  b.destroy(); assert.equal(freed.length, 7);
  a.draw(c, false, 1); assert.equal(meshes.length, 8); a.destroy();
});

test('detached fire rises, shrinks, cools out and loops; fire geometry has top-facing surfaces', () => {
  const born = campfireFlameState(0)[0], risen = campfireFlameState(8)[0], gone = campfireFlameState(15)[0];
  assert.ok(risen.center[1] > born.center[1]); assert.ok(risen.radius < born.radius);
  assert.equal(born.active,true); assert.equal(gone.active,false);
  assert.deepEqual(campfireFlameState(0),campfireFlameState(CAMPFIRE_FRAMES));
  for(let f=0;f<CAMPFIRE_FRAMES;f++){
    const m=buildCampfireFlame(f);
    assert.ok(m.normals.some((n,i)=>i%3===1 && n>.9));
    assert.ok(m.aabb.extent[0]>.13 && m.aabb.extent[2]>.13);
  }
});

test('deck camp keeps metre scale and follows deck orientation at its resolved world position', () => {
  const c = { rec: { pos: [3, 5, 8], deck: { yaw: 0 } }, deckM: new Float32Array([2,0,0,0, 0,0,2,0, 0,-2,0,0, 50,50,50,1]) };
  const m = campfireMatrix(c);
  assert.deepEqual(Array.from(m.slice(12, 15)), [3, 5, 8]);
  for (let k = 0; k < 3; k++) assert.equal(Math.hypot(...m.slice(k * 4, k * 4 + 3)), 1);
  assert.equal(m[6], 1);
});

test('opaque core precedes the world, transparent shells flush in the late pass even without billboards',()=>{
  const draws=[];
  const r={createMesh:m=>m,uploadTexture(){},drawMesh(...args){draws.push(args);}};
  const v=createCampfireVisual(r),c={rec:{pos:[0,0,0]}};
  v.draw(c,true,0,null,'body');
  assert.equal(draws.length,2);
  assert.equal(draws[1][3].translucent,undefined);
  drawCampWorldFx({drawFlames:()=>v.draw(c,true,0,null,'glow')},{});
  assert.equal(draws.length,4);
  assert.equal(draws[2][3].translucent,.47);assert.equal(draws[3][3].translucent,.26);
  for(let t=0;t<10;t+=.03)assert.ok(campfirePulse(t)>=.94&&campfirePulse(t)<=1);
  assert.notEqual(campfirePulse(0),campfirePulse(.3));
  v.destroy();
});

test('body paint follows the shared game palette while the flame keeps its emissive ramp',()=>{
  try{
    setDfLookPalette({getRed:i=>i,getGreen:i=>i,getBlue:i=>i});
    const stone=campfirePaint(0),wood=campfirePaint(1),fire=campfirePaint(5);
    assert.equal(stone.width,16);
    for(const p of [stone,wood])for(let i=0;i<p.colors.length;i+=4){assert.equal(p.colors[i],p.colors[i+1]);assert.equal(p.colors[i],p.colors[i+2]);assert.equal(p.colors[i+3],255);}
    assert.ok(fire.colors[0]>fire.colors[1]&&fire.colors[1]>fire.colors[2]);
  }finally{setDfLookPalette(null);}
});
