import { getPref } from '../../systems/uiPrefs.js';
import { extraAppearanceRequirements } from '../../systems/extraAppearance.js';
import { OWN_MW_URLS } from '../../systems/ownMwAssets.js';
import { BATTLEAXE_FIRST_PERSON } from './battleaxeFit.js';

export const AXE_FIRST_PERSON = Object.freeze({ a: BATTLEAXE_FIRST_PERSON.a, t: Object.freeze([0, -22, 0]) });
export const enhancedAxeModel = model => 'enhanced_axe_' + String(model).toLowerCase().replaceAll('\\', '/').replace(/[^a-z0-9]/g, c => '_' + c.charCodeAt(0).toString(16) + '_') + '.nif';
export const enhancedBattleaxeAvailable = (urls = OWN_MW_URLS) => Object.keys(urls).some(path => path.startsWith('meshes/enhanced_axe_'));
export function enhancedAxeRecord(record, urls = OWN_MW_URLS) {
  if (!record || record.type !== 8 || !record.model || getPref('enhancedBattleaxes') !== true || extraAppearanceRequirements('weapon').length) return record;
  const model = enhancedAxeModel(record.model);
  return urls['meshes/' + model] ? { ...record, model, firstPersonAttitude: AXE_FIRST_PERSON } : record;
}
