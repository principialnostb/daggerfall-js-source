// Player-provided Pelts o Plenty looks. Original cloak items and statistics are retained.
export const CLOAK_TEMPLATES = Object.freeze([154, 155, 191, 192]);
export const WOLF_CLOAK_LOOKS = Object.freeze(['wolf-brown', 'wolf-white', 'wolf-black']);
export const CLOAK_LOOKS_PREF = 'mwCloakLooks';
export const wolfCloakModel = (look) => look === 'wolf-grey' ? 'wolf_pelt_brown.nif' : WOLF_CLOAK_LOOKS.includes(look) ? `wolf_pelt_${look.slice(5)}.nif` : null;
export const isWolfCloakSlot = (slot) => slot === 'cloak (wolf_pelt_cloak)';
