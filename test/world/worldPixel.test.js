import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldPixelRows,classicPixelKind,WORLD_PIXEL_KEYS} from '../../src/systems/worldPixel.js';
import {setPref,resetPrefs} from '../../src/systems/uiPrefs.js';
import {FEATURES,checkFeature} from '../../src/systems/features.js';
import {CHAR_PIXEL_TIERS} from '../../src/systems/charPixel.js';
import {pixelWorldDraw,pixelWorldMesh,worldPixelActive,withFixturePixelTarget} from '../../src/render/worldPixelLayer.js';
import {identity} from '../../src/world/mat4.js';
import {drawCampPixelFlame,drawCampPixelFlameShells} from '../../src/scenes/campfirePixelFlame.js';
import {drawPixelatedCharacters} from '../../src/render/charPixelLayer.js';
import {Renderer} from '../../src/render/renderer.js';

test('objects use shared tiers and saved environment preferences are ignored',()=>{
 resetPrefs();
 try {
  for(const [kind,key] of Object.entries(WORLD_PIXEL_KEYS)){
   const row=FEATURES.find(r=>r.id==='world-pixel-'+kind);
   assert.ok(row);assert.deepEqual(checkFeature(row),[]);assert.equal(row.control.key,key);if(kind==='objects')assert.equal(row.control.tiers,CHAR_PIXEL_TIERS);
   else assert.deepEqual(row.control.tiers.map(([v])=>v),[0,540]);
  }
  assert.equal(worldPixelRows('environment'),0);assert.equal(worldPixelRows('objects'),540);
  setPref('worldPixelEnvironment',200);setPref(WORLD_PIXEL_KEYS.objects,0);
  assert.equal(worldPixelRows('environment'),0);assert.equal(worldPixelRows('objects'),0);
  setPref(WORLD_PIXEL_KEYS.landscape,360);
  setPref(WORLD_PIXEL_KEYS.objects,270);
  for (const saved of [540,360,270,200,0]) {
   setPref(WORLD_PIXEL_KEYS.landscape,saved);
   assert.deepEqual([worldPixelRows('landscape'),worldPixelRows('pond')],saved ? [540,360] : [0,0]);
  }
  assert.equal(worldPixelRows('environment'),0);assert.equal(worldPixelRows('objects'),270);
  setPref(WORLD_PIXEL_KEYS.objects,123);assert.equal(worldPixelRows('objects'),540);
  assert.equal(worldPixelRows('effect'),0);
 }finally{resetPrefs();}
});
test('classic furniture is an object, buildings stay environment',()=>{
 assert.equal(classicPixelKind(41000),'objects');assert.equal(classicPixelKind(41999),'objects');
 assert.equal(classicPixelKind(42000),'environment');assert.equal(classicPixelKind(1000),'environment');
});
test('HD, one-pixel blocks, effects and UI targets bypass the world layer',()=>{
 const r={gl:{VIEWPORT:1,getParameter:()=>[0,0,960,540]}};
 const fail=()=>assert.fail('bypassed draws remain owned by caller');
 assert.equal(pixelWorldDraw(r,'environment',{},identity(),fail),false);
 assert.equal(pixelWorldDraw(r,'objects',{},identity(),fail),false);
 assert.equal(pixelWorldMesh(r,{pixelKind:'effect'},identity(),null,{}),false);
 assert.equal(pixelWorldMesh(r,{},identity(),null,{translucent:.5}),false);
 r._spriteDepth=1;assert.equal(pixelWorldDraw(r,'objects',{},identity(),fail),false);
});

// Exercise the real shared pass and its recursion with a stateful GL seam; image quality is checked by worldPixelProbe.
function passRenderer(){
 const state={depthMask:true,opacity:1},samples=[];
 const enabled=new Set(),written=[],bindings=new Map([[23,'snow-mask']]);let unit=23;
 const gl=new Proxy({
  getParameter:k=>k==='VIEWPORT'?[0,0,1440,1080]:k==='DEPTH_WRITEMASK'?state.depthMask:null,
  getProgramParameter:()=>true,
  activeTexture:u=>{unit=u==='TEXTURE0'?0:u==='TEXTURE6'?6:u;},
  bindTexture:(target,tex)=>bindings.set(unit,tex),
  isEnabled:k=>enabled.has(k),enable:k=>enabled.add(k),disable:k=>enabled.delete(k),
  uniform1f:(loc,value)=>{state.opacity=value;},
  depthMask:value=>{state.depthMask=value;},
  drawArrays:()=>{written.push(enabled.has('POLYGON_OFFSET_FILL'));samples.push({...state,blend:enabled.has('BLEND')});},
 },{get:(o,k)=>k in o?o[k]:/^[A-Z_0-9]+$/.test(k)?k:()=>({})});
 const r={gl,_proj:identity(),_view:identity(),_clearColor:[0,0,0,1],program:{},uProj:{},
  _use(){},_bindVao(){},_forgetTextureShadows(){}};
 return {r,written,bindings,state,samples};
}
test('an object enters the shared pass once and restores projection and recursion state',()=>{
 resetPrefs();const {r,written,bindings}=passRenderer(),P=r._proj;let draws=0;
 r.drawMesh=(mesh,m,remap,options)=>{
  assert.equal(worldPixelActive(r),true);
  assert.equal(pixelWorldMesh(r,mesh,m,remap,options),false);draws++;
 };
 assert.equal(pixelWorldMesh(r,{pixelKind:'objects'},identity(),null,{}),true);
 assert.equal(bindings.get(23),'snow-mask','target allocation must preserve world data units');
 assert.equal(draws,1);assert.equal(written.length,1);assert.equal(r._proj,P);assert.equal(worldPixelActive(r),false);
});

test('fixtures share one viewport and destination, scoped to each batch even after a failure',()=>{
 const {r}=passRenderer(),queries=[],restored=[];
 let viewport=[7,11,1440,1080],framebuffer=null;
 r.gl.getParameter=key=>{
  queries.push(key);
  return key==='VIEWPORT'?viewport:framebuffer;
 };
 r.gl.bindFramebuffer=(_,value)=>{framebuffer=value;};
 r.gl.viewport=(...values)=>{viewport=values;restored.push(values);};
 const draw=()=>pixelWorldDraw(r,'objects',{},identity(),()=>{});
 const pair=()=>{draw();draw();};
 assert.throws(()=>withFixturePixelTarget(r,()=>{pair();throw Error('end batch');}),/end batch/);
 assert.deepEqual(queries,['VIEWPORT','FRAMEBUFFER_BINDING']);
 assert.equal(framebuffer,null);
 assert.deepEqual(restored.at(-1),[7,11,1440,1080]);
 viewport=[3,5,1920,1200];
 const panel={};framebuffer=panel;queries.length=0;
 withFixturePixelTarget(r,pair);
 assert.deepEqual(queries,['VIEWPORT','FRAMEBUFFER_BINDING']);
 assert.deepEqual(restored.at(-1),[3,5,1920,1200]);
 assert.equal(framebuffer,panel);
});
test('pixelated flame shells blend once, keep world depth untouched and restore GL state',()=>{
 resetPrefs();
 const {r,state,samples}=passRenderer(),seen=[],mesh={pixelKind:'effect'},m=identity();
 r.drawMesh=(...args)=>seen.push(args);
 drawCampPixelFlame(r,mesh,m,.26);
 assert.deepEqual(seen,[[mesh,m,null,{noShadow:true}]],'opaque isolated target records shell depth');
 assert.deepEqual(samples,[{opacity:.26,depthMask:false,blend:true}]);
 assert.equal(state.depthMask,true);assert.equal(r.gl.isEnabled(r.gl.BLEND),false);
 assert.equal(worldPixelActive(r),false);
});
test('paired pixelated shells read the incoming blend state once and restore it after both draws',()=>{
 resetPrefs();
 const {r,state,samples}=passRenderer(), mesh={pixelKind:'effect'};
 r.drawMesh=()=>{};
 const query=r.gl.getParameter;
 const reads=[];
 const blendFactors=['BLEND_SRC_RGB','BLEND_DST_RGB','BLEND_SRC_ALPHA','BLEND_DST_ALPHA'];
 const original=[r.gl.ONE,r.gl.ZERO,r.gl.DST_ALPHA,r.gl.ONE_MINUS_DST_ALPHA];
 let factors=original;
 r.gl.blendFuncSeparate=(...values)=>{factors=values;};
 r.gl.getParameter=(key)=>{
  reads.push(key);
  const factor=blendFactors.indexOf(key);
  return factor<0?query(key):factors[factor];
 };
 r.gl.enable(r.gl.BLEND);
 state.depthMask=false;
 drawCampPixelFlameShells(r,mesh,mesh,identity());
 assert.deepEqual(reads.filter(key=>key==='DEPTH_WRITEMASK'||key.startsWith('BLEND_')),
  ['DEPTH_WRITEMASK','BLEND_SRC_RGB','BLEND_DST_RGB','BLEND_SRC_ALPHA','BLEND_DST_ALPHA']);
 assert.deepEqual(samples,[{opacity:.47,depthMask:false,blend:true},{opacity:.26,depthMask:false,blend:true}]);
 assert.equal(state.depthMask,false);
 assert.equal(r.gl.isEnabled(r.gl.BLEND),true);
 assert.deepEqual(factors,original);
});

test('flame shells reuse the actual blend state until glass or a nested fixture changes it',()=>{
 const {r,state}=passRenderer(),gl=r.gl;
 const blendKeys=[gl.BLEND_SRC_RGB,gl.BLEND_DST_RGB,gl.BLEND_SRC_ALPHA,gl.BLEND_DST_ALPHA];
 const straight=[gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA];
 const custom=[gl.ONE,gl.ZERO,gl.ZERO,gl.ONE];
 let factors=custom,reads=0;
 const parameter=gl.getParameter;
 gl.getParameter=k=>{
  const i=blendKeys.indexOf(k);
  if(i>=0){reads++;return factors[i];}
  return parameter(k);
 };
 gl.blendFuncSeparate=(...v)=>{factors=v;};
 r._drawMeshBundle=()=>{};
 r.drawMesh=()=>{};
 gl.enable(gl.BLEND);gl.depthMask(false);
 const shell=()=>drawCampPixelFlame(r,{pixelKind:'effect'},identity(),.47);
 const pane=()=>Renderer.prototype._drawTranslucent.call(r,{},identity(),null,.42);
 withFixturePixelTarget(r,()=>{
  shell();shell();
  assert.equal(reads,4);
  assert.deepEqual(factors,custom);assert.equal(state.depthMask,false);assert.equal(gl.isEnabled(gl.BLEND),true);
  pane();shell();shell();
  assert.equal(reads,4); // The pane publishes the straight-alpha state it installed.
  assert.deepEqual(factors,straight);assert.equal(state.depthMask,true);assert.equal(gl.isEnabled(gl.BLEND),false);
  withFixturePixelTarget(r,()=>{gl.blendFuncSeparate(...custom);shell();});
  shell();
  assert.equal(reads,12);assert.deepEqual(factors,custom);
 });
 shell();
 assert.equal(reads,16);
});
test('HD flame preserves the direct translucent draw and core remains shadowless',()=>{
 resetPrefs();setPref(WORLD_PIXEL_KEYS.objects,0);
 try {
  const {r,samples}=passRenderer(),seen=[],mesh={pixelKind:'effect'},m=identity();r.drawMesh=(...args)=>seen.push(args);
  drawCampPixelFlame(r,mesh,m,.47);drawCampPixelFlame(r,mesh,m);
  assert.deepEqual(seen,[[mesh,m,null,{noShadow:true,translucent:.47}],[mesh,m,null,{noShadow:true}]]);
  assert.equal(samples.length,0);
 }finally{resetPrefs();}
});

test('pixelated props keep half-covered blocks and preserve shadows when every block is empty', () => {
  resetPrefs();
  const { r, written } = passRenderer();
  r._worldFixtureDestination = { viewport: [0, 0, 1440, 1080], framebuffer: null };
  const mesh = { pixelKind: 'objects', bounds: [0, 0, 0, 1], vao: {}, subMeshes: [{}] };
  const casters = [], draws = [];
  r.recordShadowMesh = (...args) => casters.push(args);
  r.drawMesh = (...args) => draws.push(args);
  function rect(left, right, bottom, top, noShadow = false) {
    const m = identity();
    m[0] = (right - left) / 1440;
    m[5] = (top - bottom) / 1080;
    m[12] = (right + left) / 1440 - 1;
    m[13] = (top + bottom) / 1080 - 1;
    assert.equal(pixelWorldMesh(r, mesh, m, null, { noShadow }), true);
    return m;
  }
  const small = rect(720.45, 720.55, 540.45, 540.55);
  assert.deepEqual(casters, [[mesh, small, null]]);
  // Two sample centres, on opposite sides of a block boundary.
  rect(721.45, 722.55, 540.45, 540.55, true);
  assert.equal(casters.length, 1);
  assert.equal(written.length, 0);
  assert.equal(draws.length, 0);
  // The same width inside one block reaches precisely two of four samples.
  rect(720.45, 721.55, 540.45, 540.55);
  assert.equal(written.length, 1);
  assert.equal(draws.length, 1);
});

test('world and character passes resume drawing when WebGL restores the viewport', () => {
  resetPrefs();
  const {r, written} = passRenderer(), m = identity(), mesh = {pixelKind:'objects'};
  const parameter = r.gl.getParameter;
  let lost = true, draws = 0;
  r.gl.getParameter = key => key === r.gl.VIEWPORT && lost ? null : parameter(key);
  r.drawMesh = () => { draws++; };
  const body = () => drawPixelatedCharacters(r, [{mesh, model:m}], 270, null, () => { draws++; });
  assert.equal(pixelWorldMesh(r, mesh, m, null, {}), true);
  body();
  assert.equal(draws, 0);
  lost = false;
  assert.equal(pixelWorldMesh(r, mesh, m, null, {}), true);
  body();
  assert.equal(draws, 2);
  assert.equal(written.length, 2);
});
