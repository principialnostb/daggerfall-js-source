// Environment and object meshes use the corrected character colour/depth pass once each.
import {drawPixelatedCharacters,boxCorners,blockPixels} from './charPixelLayer.js';
import {worldPixelRows} from '../systems/worldPixel.js';
import {identity,transformPoint} from '../world/mat4.js';
const active=new WeakSet(),I=identity();
export const worldPixelActive=r=>active.has(r);

export function pixelWorldDraw(r,kind,mesh,m,draw,opacity=1){
 if(active.has(r)||!r.gl||r._spriteDepth>0||r._panelSaved)return false;
 const rows=worldPixelRows(kind);
 if(!rows)return false;
 const vp=r.gl.getParameter(r.gl.VIEWPORT);
 if(blockPixels(vp[3],rows)<=1)return false;
 const b=mesh?.bounds;
 const corners=b?boxCorners({minX:b[0]-b[3],maxX:b[0]+b[3],minY:b[1]-b[3],maxY:b[1]+b[3],minZ:b[2]-b[3],maxZ:b[2]+b[3]},(x,y,z)=>transformPoint(m,x,y,z)):null;
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
  },opacity);
 }finally{
  active.delete(r);r._tFrameStamp=-1;r._forgetTextureShadows?.();
  r._use(r.program);r.gl.uniformMatrix4fv(r.uProj,false,projection);
 }
 return true;
}

export function pixelWorldMesh(r,mesh,m,remap,options){
 if(options.translucent>0||mesh?.pixelKind==='effect')return false;
 return pixelWorldDraw(r,mesh?.pixelKind??'environment',mesh,m,()=>r.drawMesh(mesh,m,remap,options));
}
export function pixelWorldTerrain(r,surface,m,...args){
 return pixelWorldDraw(r,'environment',surface,m,()=>r.drawTerrain(surface,m,...args));
}
export function pixelWorldSnow(r,surface,u,tex){
 if(active.has(r)||!worldPixelRows('environment'))return false;
 const S=r._ensureTerrainSnow();
 // The outer snow batch caches polygon offset and vertex channels. Draw this isolated target as a
 // standalone snow draw so its geometry state is cleaned before the fullscreen depth write-back.
 try{return pixelWorldDraw(r,'environment',surface,I,()=>{
  const pass=r._snowPass;r._snowPass=null;
  try{S.frame=-1;r.drawSnow(surface,u,tex);}
  finally{r._snowPass=pass;}
 });}
 finally{S.frame=-1;}
}
