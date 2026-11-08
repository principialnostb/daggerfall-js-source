import { isCloakSlot } from '../characters/ownModels/ownClothingModels.js';
// Fitting keeps the camera on the body. Carried weapons may cross its edges
// but cannot change character scale as the view turns.
export function figureFraming(ranges, model, scratch, stable, portrait, fold, carried) {
  if (!stable) {
    const win = portrait(ranges, model, scratch);
    return win ? { ...win, halfH: win.halfH * 1.24, halfW: win.halfW * 1.55 } : null;
  }
  const fixed = ranges.filter((range) => !isCloakSlot(range.slot) && !range.piece?.clothPhysics);
  const body = fold(fixed, scratch, [...carried, 'offweapon', 'shield-back']);
  if (!body) return null;
  const x = (body.minX + body.maxX) / 2, y = (body.minY + body.maxY) / 2, z = (body.minZ + body.maxZ) / 2;
  const center = [model[0]*x + model[4]*y + model[8]*z + model[12], model[1]*x + model[5]*y + model[9]*z + model[13], model[2]*x + model[6]*y + model[10]*z + model[14]];
  const halfH = (Math.abs(model[1])*(body.maxX-body.minX) + Math.abs(model[5])*(body.maxY-body.minY) + Math.abs(model[9])*(body.maxZ-body.minZ)) * .54;
  return { center, halfH, halfW: halfH * .58 };
}
