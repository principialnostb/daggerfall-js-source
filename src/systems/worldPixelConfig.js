export const LANDSCAPE_ROWS = Object.freeze({ vegetation: 540, pond: 360 });
export const LANDSCAPE_PIXEL_TIERS = Object.freeze([Object.freeze([0, 'HD']), Object.freeze([LANDSCAPE_ROWS.vegetation, 'Light / Medium'])]);
export const WORLD_PIXEL_DEFAULTS=Object.freeze({objects:540,landscape:LANDSCAPE_ROWS.vegetation});
export const WORLD_PIXEL_KEYS=Object.freeze({objects:'worldPixelObjects',landscape:'worldPixelLandscape'});
// The classic 41xxx family is the interior kit's furniture/standalone props, not its walls/floors.
export const classicPixelKind=id=>Number(id)>=41000&&Number(id)<42000?'objects':'environment';
