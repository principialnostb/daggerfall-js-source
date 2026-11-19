// Fire follows the object dial, using the shared colour/depth grid for core and translucent shells.
import {pixelWorldDraw} from '../render/worldPixelLayer.js';
export function drawCampPixelFlame(renderer,mesh,m,opacity=1,alphaState=null){
 const draw=()=>renderer.drawMesh(mesh,m,null,{noShadow:true});
 if(pixelWorldDraw(renderer,'objects',mesh,m,draw,opacity,alphaState))return;
 if(alphaState)alphaState.previous=null;
 renderer.drawMesh(mesh,m,null,opacity<1?{noShadow:true,translucent:opacity}:{noShadow:true});
}

export function drawCampPixelFlameShells(renderer,middle,outer,model) {
  // Both composites restore the incoming state. A direct mesh draw clears the shared snapshot.
  const alphaState = { previous: null };
  drawCampPixelFlame(renderer,middle,model,.47,alphaState);
  drawCampPixelFlame(renderer,outer,model,.26,alphaState);
}
