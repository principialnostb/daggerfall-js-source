// @ts-check
// CHAR-PIX1: the pixelated bodies' three dials, a leaf - features.js lists them and render/charPixelLayer.js reads them.

/** The dials' steps: [rows per screen height, label]. 0 is the mesh at full resolution (HD); 200 is Daggerfall's 320x200
 *  frame. At 1080p a block is 2, 3, 4 and 5 pixels - Retro fills the step from Soft's 3 to Classic's 5. */
export const CHAR_PIXEL_TIERS = Object.freeze([[0, 'HD'], [540, 'Fine'], [360, 'Soft'], [270, 'Retro'], [200, 'Classic']].map((t) => Object.freeze(t)));
/** The prefs each dial is stored under, and what they start at: the hands keep the 3px of 1080p they had (MW_ARM_PIXEL),
 *  the bodies their full resolution. */
export const CHAR_PIXEL_PREFS = Object.freeze({ fp: 'charPixelFp', player: 'charPixelPlayer', npc: 'charPixelNpc' });
export const CHAR_PIXEL_INITIAL = Object.freeze({ fp: 360, player: 0, npc: 0 });
