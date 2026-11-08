import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worldPixelRows,classicPixelKind,WORLD_PIXEL_KEYS} from '../../src/systems/worldPixel.js';
import {setPref,resetPrefs} from '../../src/systems/uiPrefs.js';
import {FEATURES,checkFeature} from '../../src/systems/features.js';
import {CHAR_PIXEL_TIERS} from '../../src/systems/charPixel.js';
import {pixelWorldDraw,pixelWorldMesh,pixelWorldSnow,worldPixelActive} from '../../src/render/worldPixelLayer.js';
import {identity} from '../../src/world/mat4.js';
import {drawCampPixelFlame} from '../../src/scenes/campfirePixelFlame.js';

test('world and object controls use shared tiers and independent preferences',()=>{
 resetPrefs();
 try {
  for(const [kind,key] of Object.entries(WORLD_PIXEL_KEYS)){
   const row=FEATURES.find(r=>r.id==='world-pixel-'+kind);
   assert.ok(row);assert.deepEqual(checkFeature(row),[]);assert.equal(row.control.key,key);assert.equal(row.control.tiers,CHAR_PIXEL_TIERS);
  }
  assert.equal(worldPixelRows('environment'),0);assert.equal(worldPixelRows('objects'),540);
  setPref(WORLD_PIXEL_KEYS.environment,200);setPref(WORLD_PIXEL_KEYS.objects,0);
  assert.equal(worldPixelRows('environment'),200);assert.equal(worldPixelRows('objects'),0);
  setPref(WORLD_PIXEL_KEYS.objects,270);
  assert.equal(worldPixelRows('environment'),200);assert.equal(worldPixelRows('objects'),270);
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
test('snow offset applies to geometry, never to pixel depth write-back, and returns to its pass',()=>{
 resetPrefs();setPref(WORLD_PIXEL_KEYS.environment,200);
 try {
  const {r,written}=passRenderer(),S={frame:0};
  const pass={offset:false};r._snowPass=pass;r._ensureTerrainSnow=()=>S;
  r.drawSnow=()=>{assert.equal(r._snowPass,null);r.gl.enable(r.gl.POLYGON_OFFSET_FILL);r.gl.disable(r.gl.POLYGON_OFFSET_FILL);};
  assert.equal(pixelWorldSnow(r,{}, {}, {}),true);
  assert.deepEqual(written,[false]);assert.equal(r.gl.isEnabled(r.gl.POLYGON_OFFSET_FILL),false);assert.equal(r._snowPass,pass);
  assert.equal(S.frame,-1);assert.equal(worldPixelActive(r),false);
 }finally{resetPrefs();}
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
test('HD flame preserves the direct translucent draw and core remains shadowless',()=>{
 resetPrefs();setPref(WORLD_PIXEL_KEYS.objects,0);
 try {
  const {r,samples}=passRenderer(),seen=[],mesh={pixelKind:'effect'},m=identity();r.drawMesh=(...args)=>seen.push(args);
  drawCampPixelFlame(r,mesh,m,.47);drawCampPixelFlame(r,mesh,m);
  assert.deepEqual(seen,[[mesh,m,null,{noShadow:true,translucent:.47}],[mesh,m,null,{noShadow:true}]]);
  assert.equal(samples.length,0);
 }finally{resetPrefs();}
});
