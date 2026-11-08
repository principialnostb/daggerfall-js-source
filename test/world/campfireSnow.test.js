import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SnowfallRuntime} from '../../src/systems/snowfallRuntime.js';
import {mountCampSnow,unmountCampSnow,pressCampSnow} from '../../src/scenes/campfireSnow.js';
function fixture(){
 const renderer={},runtime=new SnowfallRuntime({world:{toGlobal:(x,z)=>[409600+x,204800+z]},coverage:null});
 runtime.local.meshReady=true;runtime.local.staticReady=true;runtime.lastEnvironmentEligible=true;
 const frame={enabled:true,inside:false,player:{x:0,z:0}},camp={rec:{kind:'fire',pos:[0,0,0]}};
 mountCampSnow(renderer,camp);
 return {renderer,runtime,frame,camp};
}
const reds=rt=>rt.local.dynamic.filter((_,i)=>i%4===0);
test('a camp uses the real footstep field, clears its centre and maintains it after refill',()=>{
 const {renderer,runtime,frame,camp}=fixture();
 pressCampSnow(renderer,runtime,frame);
 assert.equal(Math.min(...reds(runtime)),0);assert.equal(runtime.local.hasDeformation,true);
 assert.equal(runtime.tracks.hasDeformation,true,'the normal persistent track field owns the impression');
 assert.equal(reds(runtime)[0],255,'distant snow stays full');
 runtime.local.dynamic.fill(255);pressCampSnow(renderer,runtime,frame);
 assert.equal(Math.min(...reds(runtime)),0,'occupied ground is pressed again after refill');
 unmountCampSnow(renderer,camp);runtime.local.dynamic.fill(255);pressCampSnow(renderer,runtime,frame);
 assert.equal(Math.min(...reds(runtime)),255,'removal stops maintaining the footprint');
});
test('cold fires still press snow; decks, indoors, disabled snow, distant or unready terrain do not',()=>{
 const {renderer,runtime,frame,camp}=fixture();
 for(const change of [()=>{camp.rec.deck={};},()=>{camp.rec.deck=null;frame.inside=true;},()=>{frame.inside=false;frame.enabled=false;},()=>{frame.enabled=true;runtime.local.meshReady=false;},()=>{runtime.local.meshReady=true;camp.rec.pos=[1000,0,1000];}]){
  change();pressCampSnow(renderer,runtime,frame);assert.equal(Math.min(...reds(runtime)),255);
 }
 camp.rec.pos=[0,0,0];camp.rec.litUntil=0;pressCampSnow(renderer,runtime,frame);
 assert.equal(Math.min(...reds(runtime)),0);
});
