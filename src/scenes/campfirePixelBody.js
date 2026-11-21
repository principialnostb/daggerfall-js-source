// The renderer owns the shared pixel pass; a camp is an object, never a world pass inside another pass.
import {WORLD_PIXEL_DEFAULTS} from '../systems/worldPixelConfig.js';
import {drawSeen} from './decor/decorRoom.js';
export const CAMP_BODY_PIXEL_ROWS=WORLD_PIXEL_DEFAULTS.objects;
export function drawCampPixelBody(r,cull,bounds,mesh,m){
 mesh.pixelKind='objects';
 return drawSeen(r,cull,bounds,mesh,m);
}
