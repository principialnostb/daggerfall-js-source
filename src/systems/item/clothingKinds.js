import { attachedDfmods } from '../dfmodTextures.js';
import { textureReplacementEnabled } from '../textureReplacement.js';

export const GARMENT_KINDS = Object.freeze({
  top: ['Straps', 'Challenger Straps', 'Champion Straps', 'Armbands', 'Fancy Armbands', 'Kimono', 'Short Tunic',
    'Dwynnen Surcoat', 'Anticlere Surcoat', 'Formal Tunic', 'Reversible Tunic', 'Open Tunic', 'Short Shirt', 'Long Shirt', 'Vest', 'Brassiere', 'Formal Brassiere', 'Peasant Blouse'],
  full: ['Toga', 'Formal Eodoric', 'Plain Robes', 'Priest Robes', 'Priestess Robes', 'Evening Gown',
    'Day Gown', 'Casual Dress', 'Strapless Dress', 'Khajiit Suit'],
  legs: ['Casual Pants', 'Breeches', 'Loincloth', 'Tights', 'Short Skirt', 'Long Skirt', 'Wrap'],
  feet: ['Shoes', 'Sandals', 'Boots', 'Tall Boots'],
  cloak: ['Casual Cloak', 'Formal Cloak'],
  sash: ['Sash', 'Eodoric'],
});
const KIND_OF_NAME = new Map(Object.entries(GARMENT_KINDS).flatMap(([kind, names]) => names.map((n) => [n, kind])));

export function clothingKind(template) {
  // Paperdoll Enhanced adds a skirt to the female Eodoric (235..238, record 9).
  if (template?.playerTextureArchive === 235 && template.name === 'Eodoric'
    && textureReplacementEnabled() && attachedDfmods().some(m => m.enabled && /paperdoll.*enhanced/i.test(m.title))) return 'full';
  return KIND_OF_NAME.get(template?.name) ?? null;
}
