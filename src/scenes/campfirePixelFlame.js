// Fire follows the object dial, using the shared colour/depth grid for core and translucent shells.
import {pixelWorldDraw} from '../render/worldPixelLayer.js';
export function drawCampPixelFlame(renderer,mesh,m,opacity=1){
 const draw=()=>renderer.drawMesh(mesh,m,null,{noShadow:true});
 if(pixelWorldDraw(renderer,'objects',mesh,m,draw,opacity))return;
 renderer.drawMesh(mesh,m,null,opacity<1?{noShadow:true,translucent:opacity}:{noShadow:true});
}
