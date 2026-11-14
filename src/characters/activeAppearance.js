import { getAppearanceIdentity } from './bodyMorphs.js';
import { modGroupEnabled, modPackState, modResourceSignature } from '../systems/enhancedModResources.js';
import { getPref } from '../systems/uiPrefs.js';

export const appearanceEditorRequirements = () => [
  [modGroupEnabled('bodies') && modPackState('bb').connected, 'Better Bodies'],
  [modGroupEnabled('bodies') && modPackState('hands').connected, 'Better Hands'],
];
export const appearanceEditorAvailable = () => appearanceEditorEnabled() &&
  appearanceEditorRequirements().every(([ready]) => ready);
export const appearanceEditorEnabled = () => getPref('appearanceEditor') !== false;
export const playerVoiceGender = (gender) => {
  const female = activeAppearanceIdentity()?.female;
  return typeof female === 'boolean' ? (female ? 'female' : 'male') : gender;
};

export const activeAppearanceIdentity = () => appearanceEditorEnabled() && modGroupEnabled('bodies') ? getAppearanceIdentity() : null;
export const appearanceDisplayKey = () => JSON.stringify([modResourceSignature(), activeAppearanceIdentity(), appearanceEditorEnabled() && getAppearanceIdentity()?.female]);
export async function currentAppearanceResult(draw, options) {
  const key = appearanceDisplayKey();
  const result = await draw(options);
  return key === appearanceDisplayKey() ? result : null;
}
