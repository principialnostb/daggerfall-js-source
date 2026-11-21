import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawCampPixelBody,CAMP_BODY_PIXEL_ROWS} from '../../src/scenes/campfirePixelBody.js';
import {drawPixelatedCharacters} from '../../src/render/charPixelLayer.js';
import {identity} from '../../src/world/mat4.js';
import {knownPixelBlendState,knownPixelCullState,observePixelBlendState} from '../../src/render/pixelBlendState.js';

test('pixel blend snapshots follow foreign GL passes, invalidate unknown factors and reset on restoration',()=>{
 const gl={ZERO:0,ONE:1,SRC_ALPHA:2,ONE_MINUS_SRC_ALPHA:3,SRC_COLOR:4,BLEND:5,CULL_FACE:6,canvas:new EventTarget(),
  enable(){},disable(){},blendFunc(){},blendFuncSeparate(){},depthMask(){}};
 observePixelBlendState(gl);
 assert.equal(knownPixelBlendState(gl),null);
 gl.disable(gl.BLEND);gl.depthMask(true);gl.blendFunc(gl.ONE,gl.ONE);
 const first=knownPixelBlendState(gl);
 gl.enable(gl.BLEND);gl.blendFuncSeparate(2,3,1,3);gl.depthMask(false);
 assert.deepEqual(first,{enabled:false,depthMask:true,factors:[1,1,1,1]});
 assert.deepEqual(knownPixelBlendState(gl),{enabled:true,depthMask:false,factors:[2,3,1,3]});
 gl.blendFunc(12,13);
 assert.equal(knownPixelBlendState(gl),null);
 gl.blendFunc(1,1);
 gl.enable(gl.CULL_FACE);
 assert.equal(knownPixelCullState(gl),true);
 gl.disable(gl.CULL_FACE);
 assert.equal(knownPixelCullState(gl),false);
 gl.canvas.dispatchEvent(new Event('webglcontextrestored'));
 assert.equal(knownPixelBlendState(gl),null);
 assert.equal(knownPixelCullState(gl),null);
});

test('camp body selects objects without applying a second pixel pass',()=>{
 const projection=identity(),updates=[],draws=[];
 const r={gl:{VIEWPORT:1,getParameter:()=>[0,0,960,540],uniformMatrix4fv:(loc,transpose,p)=>updates.push(p)},
  _proj:projection,_view:identity(),program:{},uProj:{},_use(){},drawMesh:(...args)=>draws.push(args)};
 const mesh={},m=identity();
 assert.equal(CAMP_BODY_PIXEL_ROWS,540);
 assert.equal(drawCampPixelBody(r,null,null,mesh,m),true);
 assert.deepEqual(draws,[[mesh,m,null,undefined]]);
 assert.equal(mesh.pixelKind,'objects');
 assert.equal(updates.length,0);
});

test('shared pixel pass preserves character drawing when no mesh callback is supplied',()=>{
 const seen=[],r={gl:{VIEWPORT:1,getParameter:()=>[0,0,960,540]},drawCharacter:(...args)=>seen.push(args)};
 const d={mesh:{},model:identity()};
 drawPixelatedCharacters(r,[d],0);
 assert.deepEqual(seen,[[d.mesh,d.model]]);
});

test('a mesh pass can reuse the viewport its caller just read', () => {
  const draws = [];
  const r = { gl: {}, drawCharacter: (...args) => draws.push(args) };
  const mesh = {}, model = identity();
  drawPixelatedCharacters(r, [{ mesh, model }], 540, null, undefined, 1, null, [0, 0, 960, 540]);
  assert.deepEqual(draws, [[mesh, model]]);
});

test('HD and nested sprite draws submit the same ordered meshes without a driver query',()=>{
 const horse={}, rider={};
 const draws=[{mesh:horse},{mesh:rider}];
 for(const [rows,depth] of [[0,0],[200,1]]){
  const seen=[];
  const r={_spriteDepth:depth,gl:{getParameter(){throw Error('unexpected GL read');}}};
  drawPixelatedCharacters(r,draws,rows,null,d=>seen.push(d.mesh));
  assert.deepEqual(seen,[horse,rider]);
 }
});
