import { CLOAK_TEMPLATES, WOLF_CLOAK_LOOKS, isWolfCloakSlot } from './wolfCloak.js';

// Called after the equipment key changed. The first equipped cloak owns the visible mesh.
export function cloakPaletteChange(before, after, slot) {
  if (!slot || !before || !after || before.length !== after.length) return null;
  const index = before.findIndex(piece => piece.kind === 'clothing' && CLOAK_TEMPLATES.includes(piece.templateIndex));
  if (index < 0) return null;
  for (let i = 0; i < before.length; i++) {
    const a = before[i], b = after[i];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] === b[key]) continue;
      if (i !== index || (key !== 'cosmeticDye' && key !== 'ownStyle')) return null;
    }
  }
  const current = before[index], next = after[index];
  if (isWolfCloakSlot(slot)) {
    if (!WOLF_CLOAK_LOOKS.includes(next.ownStyle)) return null;
    return { fur: next.ownStyle.slice(5) };
  }
  if (next.ownStyle !== current.ownStyle) return null;
  return { dye: next.cosmeticDye ?? null };
}

export const WOLF_FUR_RAMP = {
  brown: [[31, 20, 16], [105, 77, 58], [234, 205, 177]],
  white: [[57, 52, 50], [162, 154, 146], [247, 238, 220]],
  black: [[19, 18, 20], [67, 63, 64], [143, 132, 121]],
};

// Show the new colour on the next paint while the authored DDS loads. The small
// preview samples the current fur's shading and retains its cutout and leather trim.
export function interimFurTexture(entry, colour) {
  const source = /wolf_pelt_(brown|white|black)_(clumps|hide)/i.exec(entry?.path ?? '');
  const mips = entry?.image?.mips;
  if (!source || !mips?.length || source[1] === colour) return entry;
  const from = WOLF_FUR_RAMP[source[1]], to = WOLF_FUR_RAMP[colour];
  const lum = rgb => .299*rgb[0]+.587*rgb[1]+.114*rgb[2];
  const levels = source[1] === 'brown' ? [0,128,255] : from.map(lum);
  const ramp = new Uint8ClampedArray(768);
  for (let n=0; n<256; n++) {
    const half = Number(n >= levels[1]);
    const mix = Math.max(0,Math.min(1,(n-levels[half])/(levels[half+1]-levels[half])));
    for (let c=0; c<3; c++) ramp[3*n+c] = to[half][c]+mix*(to[half+1][c]-to[half][c]);
  }
  const first = mips.findIndex(m => m.width<=256 && m.height<=256);
  if (first<0 || !mips[first].rgba) return entry;
  const preview = mips.slice(first).map(m => {
    const rgba = m.rgba.slice();
    for (let i=0; i<rgba.length; i+=4) {
      if (!rgba[i+3] || source[2]==='hide' && (i/4 % m.width)/m.width>.818) continue;
      const k = 3*((77*rgba[i]+150*rgba[i+1]+29*rgba[i+2]+128)>>8);
      rgba[i] = ramp[k];
      rgba[i+1] = ramp[k+1];
      rgba[i+2] = ramp[k+2];
    }
    return { ...m, rgba };
  });
  return { ...entry, image: { ...entry.image, mips: preview } };
}
