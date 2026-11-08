// Two disjoint controls sharing the character pixel tiers, not a second global render scale.
import {getPref} from './uiPrefs.js';
import {CHAR_PIXEL_TIERS} from './charPixel.js';
import {WORLD_PIXEL_DEFAULTS,WORLD_PIXEL_KEYS} from './worldPixelConfig.js';
export {WORLD_PIXEL_DEFAULTS,WORLD_PIXEL_KEYS,classicPixelKind} from './worldPixelConfig.js';
export function worldPixelRows(kind){
 if(!(kind in WORLD_PIXEL_KEYS))return 0;
 const value=Number(getPref(WORLD_PIXEL_KEYS[kind])??WORLD_PIXEL_DEFAULTS[kind]);
 return CHAR_PIXEL_TIERS.some(t=>t[0]===value)?value:WORLD_PIXEL_DEFAULTS[kind];
}
