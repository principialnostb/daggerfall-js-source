// The renderer owns the shared pixel pass; a camp is an object, never a world pass inside another pass.
import {CHAR_PIXEL_TIERS} from '../systems/charPixel.js';
import {drawSeen} from './decor/decorRoom.js';
export const CAMP_BODY_PIXEL_ROWS=Number(CHAR_PIXEL_TIERS.find(t=>t[1]==='Fine')?.[0]??0);
export function drawCampPixelBody(r,cull,bounds,mesh,m){
 mesh.pixelKind='objects';
 return drawSeen(r,cull,bounds,mesh,m);
}
