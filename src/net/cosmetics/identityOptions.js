import { CLOTHING_DYES } from '../../characters/dyes.js';
import { BODY_MORPH_FIELDS } from '../../characters/bodyMorphs.js';
import { normalizeSavedHairColor } from '../../characters/hairColor.js';

const races = new Set(['argonian', 'breton', 'dark elf', 'high elf', 'imperial', 'khajiit', 'nord', 'orc', 'redguard', 'wood elf']);
const part = (id) => typeof id === 'string' && /^[a-z0-9_ -]{1,160}$/i.test(id) ? id : null;

export function cosmeticIdentityOptions(profile) {
  const identity = profile?.body?.identity;
  if (profile?.version !== 1 || typeof identity?.race !== 'string') return {};
  const race = identity.race.toLowerCase().replace(/^(dark|high|wood)elf$/, '$1 elf');
  if (!races.has(race)) return {};
  return {
    race,
    ...(typeof identity.female === 'boolean' ? { female: identity.female } : {}),
    ...(Number.isInteger(identity.faceIndex) && identity.faceIndex >= 0 && identity.faceIndex <= 9 ? { faceIndex: identity.faceIndex } : {}),
    appearanceHeadId: part(identity.headId),
    appearanceHairId: part(identity.hairId),
    hairColor: normalizeSavedHairColor(identity.hairColor),
  };
}

export function applyCosmeticItems(slots, profile) {
  if (profile?.version !== 1 || !Array.isArray(profile.slots)) return slots;
  for (const choice of profile.slots.slice(0, 27)) {
    if (!Number.isInteger(choice?.slot) || choice.slot < 0 || choice.slot >= slots.length) continue;
    const item = slots[choice.slot];
    if (!item || item.group !== choice.group || item.templateIndex !== choice.templateIndex || (item.material ?? 0) !== choice.material) continue;
    if (typeof choice.model === 'string' && /^[a-z0-9_ .-]{1,160}$/i.test(choice.model)) item.__mwLook = choice.model;
    if (choice.paperdoll && typeof choice.paperdoll === 'object') item.cosmeticPaperdoll = choice.paperdoll;
    if (CLOTHING_DYES.includes(choice.dye)) item.cosmeticDye = choice.dye;
    if (typeof choice.style === 'string' && /^[a-z0-9_ -]{1,64}$/i.test(choice.style)) item.ownStyle = choice.style;
  }
  return slots;
}

export function cosmeticBodyMorphs(profile) {
  const source = profile?.body?.proportions;
  if (profile?.version !== 1 || !source || typeof source !== 'object') return null;
  const entries = BODY_MORPH_FIELDS.flatMap(([key]) => {
    const value = source[key];
    return Number.isFinite(value) && value !== 0 ? [[key, Math.max(-1, Math.min(1, value))]] : [];
  });
  return entries.length ? Object.fromEntries(entries) : null;
}
