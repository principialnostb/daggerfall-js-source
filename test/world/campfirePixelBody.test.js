import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawCampPixelBody,CAMP_BODY_PIXEL_ROWS} from '../../src/scenes/campfirePixelBody.js';
import {drawPixelatedCharacters} from '../../src/render/charPixelLayer.js';
import {CHAR_PIXEL_TIERS} from '../../src/systems/charPixel.js';
import {identity} from '../../src/world/mat4.js';

test('camp body selects objects without applying a second pixel pass',()=>{
 const projection=identity(),updates=[],draws=[];
 const r={gl:{VIEWPORT:1,getParameter:()=>[0,0,960,540],uniformMatrix4fv:(loc,transpose,p)=>updates.push(p)},
  _proj:projection,_view:identity(),program:{},uProj:{},_use(){},drawMesh:(...args)=>draws.push(args)};
 const mesh={},m=identity();
 assert.equal(CAMP_BODY_PIXEL_ROWS,CHAR_PIXEL_TIERS.find(t=>t[1]==='Fine')[0]);
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
