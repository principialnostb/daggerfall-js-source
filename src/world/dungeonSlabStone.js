export const SLAB_STONE = 122;

export function slabStonePaint([red, green, blue] = [96, 91, 80]) {
  const width = 64, height = 64;
  const colors = new Uint8ClampedArray(width * height * 4);
  const hash = (x, y) => ((Math.imul(x + 37, 1103515245) ^ Math.imul(y + 19, 1234567891)) >>> 16 & 255) / 255;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const coarse = hash(x >> 3, y >> 3) - .5;
    const chips = hash(x >> 1, y >> 1) - .5;
    const pores = hash(x, y) < .055 ? -.15 : 0;
    const shade = Math.round((1 + coarse * .18 + chips * .19 + pores) * 32) / 32;
    colors.set([red * shade, green * shade, blue * shade, 255], (y * width + x) * 4);
  }
  return { width, height, colors };
}
