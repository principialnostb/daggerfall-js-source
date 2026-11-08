export const WORLD_PIXEL_DEFAULTS=Object.freeze({environment:0,objects:540});
export const WORLD_PIXEL_KEYS=Object.freeze({environment:'worldPixelEnvironment',objects:'worldPixelObjects'});
// The classic 41xxx family is the interior kit's furniture/standalone props, not its walls/floors.
export const classicPixelKind=id=>Number(id)>=41000&&Number(id)<42000?'objects':'environment';
