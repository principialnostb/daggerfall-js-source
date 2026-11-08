import {test} from 'node:test';
import {placeCampItem} from '../../src/systems/survival/camp.js';
import {createSurvivalItem} from '../../src/systems/survival/items.js';
import {TEMPLATE} from '../../src/systems/survival/food.js';
import assert from 'node:assert/strict';
import {sampleCampGround,campGroundOffset,conformCampBody,campFootprintProbe} from '../../src/world/campfireGround.js';
import {buildCampfireBody} from '../../src/world/campfireModel.js';
import {createCampfireVisual} from '../../src/scenes/campfireVisual.js';

test('ground fitting follows a rotated slope without tilting the flame or resampling every frame',()=>{
 const height=(x,z)=>.2*x+.1*z;
 const probe=(o)=>o[1]-height(o[0],o[2]);
 const h=sampleCampGround(probe,[0,0,0]);assert.ok(h);
 assert.ok(Math.abs(campGroundOffset(h,.3,-.2,0)-height(.3,-.2))<1e-6);
 const rotated=sampleCampGround(probe,[0,0,0],Math.PI/2);
 assert.ok(Math.abs(campGroundOffset(rotated,.3,-.2,0)-height(-.2,-.3))<1e-6);
 const raw=buildCampfireBody(),fit=conformCampBody(raw,h,0);
 for(let i=0;i<raw.positions.length;i+=3)assert.ok(Math.abs(fit.positions[i+1]-raw.positions[i+1]-height(raw.positions[i],raw.positions[i+2]))<1e-6);
 assert.ok(fit.normals.every(Number.isFinite));
 let samples=0;const made=[],freed=[],draws=[];
 const r={createMesh:m=>{made.push(m);return m;},destroyMesh:m=>freed.push(m),uploadTexture(){},drawMesh:(...args)=>draws.push(args)};
 const v=createCampfireVisual(r,()=>{samples++;return h;}),c={rec:{pos:[0,0,0]}};
 v.draw(c,true,0);v.draw(c,true,.5);assert.equal(samples,1);assert.equal(made.length,50);
 assert.equal(draws[1][1][1],0);assert.equal(draws[1][1][6],0);
 v.release(c);assert.equal(freed.length,1);v.draw(c,false,1);assert.equal(samples,2);
 v.destroy();assert.equal(freed.length,51);
});

test('placement rejects voids and abrupt ledges before a camp item is spent',()=>{
 const flat=(o)=>o[1];assert.ok(Number.isFinite(campFootprintProbe(flat)([0,1,0],[0,-1,0],6)));
 const ledge=o=>o[1]-(o[0]>.1?.6:0);
 assert.equal(campFootprintProbe(ledge)([0,1,0],[0,-1,0],6),Infinity);
 assert.equal(sampleCampGround(o=>o[0]>.1?Infinity:o[1],[0,0,0]),null);
 const item=createSurvivalItem(TEMPLATE.Campfire),pack=[item],uses=item.currentCondition;
 const result=placeCampItem(item,pack,{feet:[0,1,0],probe:campFootprintProbe(ledge),place:{}});
 assert.equal(result.ok,false);assert.equal(result.spent,false);assert.deepEqual(pack,[item]);assert.equal(item.currentCondition,uses);
});
