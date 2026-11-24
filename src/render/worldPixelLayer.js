import { pixelViewport } from './pixelViewport.js';
import { fixtureHidden } from './fixtureDepth.js';
// Object meshes use the corrected character colour/depth pass once each.
import {drawPixelatedCharacters,boxCorners,blockPixels} from './charPixelLayer.js';
import {worldPixelRows} from '../systems/worldPixel.js';
import {transformPoint} from '../world/mat4.js';
const active=new WeakSet();
export const worldPixelActive=r=>active.has(r);

// Fixture meshes share one destination. Each pixel write-back restores it before
// the next mesh. Limit its lifetime to this synchronous batch (panels, shadows
// and resizes can all select a different target on the very same frame).
export function withFixturePixelTarget(renderer, draw) {
 const previous = renderer._fixturePixelTarget;
 const destination = !previous && renderer._worldFixtureDestination;
 const gl = renderer.gl;
 renderer._fixturePixelTarget = {
  ...(destination || {}),
  paneState: gl && {enabled:false, depthMask:true, factors:[gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA]}
 };
 try { return draw(); }
 finally {
  // A nested batch may have drawn a translucent pane with different blend factors.
  if (previous) previous.blendState = null;
  renderer._fixturePixelTarget = previous;
 }
}

export function pixelWorldDraw(r,kind,mesh,m,draw,opacity=1,alphaState=null){
 if(active.has(r)||!r.gl||r._spriteDepth>0||r._panelSaved)return false;
 const rows=worldPixelRows(kind)/(mesh?.pixelBlockScale??1);
 if(!rows)return false;
 const target=r._fixturePixelTarget ?? alphaState ?? {};
 const vp=target.viewport ??= pixelViewport(r.gl);
 if(blockPixels(vp[3],rows)<=1&&!mesh?.pixelFootprint)return false;
 const b=mesh?.bounds;
 const footprint=mesh?.pixelFootprint;
 const corners=footprint?boxCorners({
  minX:footprint.bounds.center[0]-footprint.bounds.extent[0],maxX:footprint.bounds.center[0]+footprint.bounds.extent[0],
  minY:footprint.bounds.center[1]-footprint.bounds.extent[1],maxY:footprint.bounds.center[1]+footprint.bounds.extent[1],
  minZ:footprint.bounds.center[2]-footprint.bounds.extent[2],maxZ:footprint.bounds.center[2]+footprint.bounds.extent[2],
 },(x,y,z)=>transformPoint(m,x,y,z)):b?boxCorners({minX:b[0]-b[3],maxX:b[0]+b[3],minY:b[1]-b[3],maxY:b[1]+b[3],minZ:b[2]-b[3],maxZ:b[2]+b[3]},(x,y,z)=>transformPoint(m,x,y,z)):null;
 if(mesh?.pixelKind==='effect' && fixtureHidden(r,corners,blockPixels(vp[3],rows)+1))return true;
 const projection=r._proj;
 active.add(r);
 // Target allocation binds 2D textures on the active unit; never let it replace snow masks or world data.
 r.gl.activeTexture(r.gl.TEXTURE0);
 try{
  drawPixelatedCharacters(r,[{mesh,model:m}],rows,corners,()=>{
   r._forgetTextureShadows?.();
   r._use(r.program);r.gl.uniformMatrix4fv(r.uProj,false,r._proj);
   r._tFrameStamp=-1;
   draw();
  },opacity,footprint,target);
 }finally{
  active.delete(r);r._tFrameStamp=-1;r._forgetTextureShadows?.();
  r._use(r.program);r.gl.uniformMatrix4fv(r.uProj,false,projection);
 }
 return true;
}

export function pixelWorldMesh(r,mesh,m,remap,options){
 if(options.translucent>0||(mesh?.pixelKind!=='objects' && mesh?.pixelKind!=='landscape' && mesh?.pixelKind!=='pond'))return false;
 return pixelWorldDraw(r,mesh.pixelKind,mesh,m,()=>r.drawMesh(mesh,m,remap,options));
}
