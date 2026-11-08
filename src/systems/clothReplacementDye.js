import { decodedTexture, preloadTextureRecord } from './textureReplacement.js';
import { dyeClothPixels } from './modelDye.js';

// A mod can publish the same painted outfit under every dye name. Keep genuine
// authored colour variants; recolour only copies that equal another dye exactly.
export function clothReplacementPixels(image, reference, dye, target) {
  if (target !== 2 || !image?.colors || !reference?.colors || image.width !== reference.width || image.height !== reference.height) return image;
  const colors = image.colors, other = reference.colors;
  if (colors.length !== other.length || !colors.every((value, i) => value === other[i])) return image;
  return { ...image, colors: new Uint8ClampedArray(dyeClothPixels(colors, dye)) };
}
export async function preloadClothReplacement(archive, record, frame, map, dye, target) {
  const image = await preloadTextureRecord(archive, record, frame, map, dye);
  if (target !== 2 || !image) return image;
  const reference = await preloadTextureRecord(archive, record, frame, map, dye === 0 ? 9 : 0);
  return clothReplacementPixels(image, reference, dye, target);
}
export function clothReplacementNow(archive, record, frame, map, dye, target) {
  const image = decodedTexture(archive, record, frame, map, dye);
  return target === 2 ? clothReplacementPixels(image, decodedTexture(archive, record, frame, map, dye === 0 ? 9 : 0), dye, target) : image;
}
