// A placed fire occupies snow through the same persistent track field as footsteps.
// Registrations belong to live camp entries; their current position follows floating-origin moves.
import {CAMP_KIND} from '../systems/survival/camp.js';
const pools=new WeakMap();
export function mountCampSnow(renderer,camp,eligible=()=>true){
 if(!renderer||camp.rec.kind!==CAMP_KIND.Fire)return;
 let entries=pools.get(renderer);if(!entries)pools.set(renderer,entries=new Map());
 entries.set(camp,eligible);
}
export function unmountCampSnow(renderer,camp){
 const entries=renderer&&pools.get(renderer);entries?.delete(camp);
 if(entries?.size===0)pools.delete(renderer);
}
export function pressCampSnow(renderer,runtime,frame){
 const entries=renderer&&pools.get(renderer),L=runtime.local,p=frame.player;
 if(!entries||!runtime.lastEnvironmentEligible||!frame.enabled||frame.inside||!p||!L.meshReady||!L.staticReady)return;
 for(const [camp,eligible] of entries){
  if(camp.hidden||camp.rec.deck||!eligible())continue;
  const [x,,z]=camp.rec.pos;
  // Only stamp fully inside the local window: no distant pending stamps or work in travel view.
  if(Math.abs(x-L.dynCenter[0])>runtime.gridRadius-2||Math.abs(z-L.dynCenter[1])>runtime.gridRadius-2)continue;
  // Three overlapping footstep segments make a flat fuel/stone bed and the track rasterizer's soft shoulder.
  for(const dz of [-.32,0,.32])runtime._stampTrack(x-.32,z+dz,x+.32,z+dz,1.2,0,{});
 }
}
