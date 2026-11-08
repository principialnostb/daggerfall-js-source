import { getAppearanceIdentity } from './bodyMorphs.js';
import { modGroupEnabled, modResourceSignature } from '../systems/enhancedModResources.js';

export const activeAppearanceIdentity = () => modGroupEnabled('bodies') ? getAppearanceIdentity() : null;
export const appearanceDisplayKey = () => JSON.stringify([modResourceSignature(), activeAppearanceIdentity()]);
export async function currentAppearanceResult(draw, options) {
  const key = appearanceDisplayKey();
  const result = await draw(options);
  return key === appearanceDisplayKey() ? result : null;
}
