export const HAIR_SWATCHES = [
  [null, 'Исходный'], ['#161319', 'Чёрный'], ['#332018', 'Эспрессо'], ['#503124', 'Тёмный каштан'], ['#704633', 'Каштан'], ['#9a6b4d', 'Светлый каштан'],
  ['#823923', 'Тёмно-рыжий'], ['#ad522c', 'Медный'], ['#cb7845', 'Рыжий'], ['#bc9058', 'Медовый'], ['#d7ae68', 'Золотистый'], ['#b8a27b', 'Светло-русый'],
  ['#645740', 'Тёмно-русый'], ['#706762', 'Пепельный'], ['#a2a4a5', 'Серебристый'], ['#c8c2b7', 'Седой белый'],
];

export const normalizeHairColor = value =>
  typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value) ? value.toLowerCase() : null;

const previousSwatches = new Map([['#e5cb96', '#b8a27b'], ['#e4ded5', '#c8c2b7'], ['#eee8d7', '#c8c2b7']]);
const naturalColors = new Set(HAIR_SWATCHES.map(([color]) => color));
export function normalizeSavedHairColor(value) {
  const hex = normalizeHairColor(value);
  const color = previousSwatches.get(hex) ?? hex;
  return naturalColors.has(color) ? color : null;
}

const cache = new WeakMap();

// Retail heads face +Y. Ear batches stay in the side band of the head.
export function hairEarBatch(batch) {
  if (/\bears?\b/i.test(batch.name ?? '')) return true;
  const file = batch.material?.textureFile ?? '';
  if (/(?:^|[_ -])(?:ears?|skin|head|h\d+)(?:[_. -]|$)/i.test(file)
      || /\b(?:ear|skin|head)s?\b/i.test(batch.material?.name ?? '')) return true;
  const p = batch.positions;
  if (!p?.length) return false;
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i + 1] < -2.8 || p[i + 1] > 6.5 || p[i + 2] < -4.8 || p[i + 2] > 7.2) return false;
    minX = Math.min(minX, p[i]);
    maxX = Math.max(maxX, p[i]);
  }
  return minX < -4.7 && maxX > 4.7;
}

function hairTriangleKeys(batch) {
  const points = [];
  for (let i = 0; i < batch.positions.length; i += 3) {
    const p = batch.positions;
    points.push([Math.round(p[i] * 1000), Math.round(p[i + 1] * 1000), Math.round(p[i + 2] * 1000)].join(','));
  }
  const keys = [];
  for (let i = 0; i < batch.indices.length; i += 3) {
    keys.push([points[batch.indices[i]], points[batch.indices[i + 1]], points[batch.indices[i + 2]]].sort().join(';'));
  }
  return keys;
}

export function hairGeometryKey(batches, selected = selectHairBatches(batches, 'hair')) {
  return [...new Set(selected.flatMap(hairTriangleKeys))].sort().join('|');
}

export function selectHairBatches(batches, mode) {
  if (!mode) return batches;
  const selected = batches.flatMap(batch => {
    if (!hairEarBatch(batch)) return mode === 'hair' ? [batch] : [];
    if (!batch.indices?.length) return mode === 'ears' ? [batch] : [];
    const explicitSkin = !hairMaterialCanTint(batch.material);
    if (mode === 'hair' && explicitSkin) return [];
    const indices = [];
    for (let i = 0; i < batch.indices.length; i += 3) {
      const triangle = batch.indices.slice(i, i + 3);
      const xs = Array.from(triangle, index => batch.positions[index * 3]);
      // A donor batch can include the nape and sideburns. Keep the lateral
      // ear surface only, so its original texture cannot cover the new hair.
      const ear = xs.every(x => x >= 3.6) || xs.every(x => x <= -3.6);
      if (ear === (mode === 'ears')) indices.push(...triangle);
    }
    if (!indices.length) return [];
    return indices.length === batch.indices.length ? [batch] : [{ ...batch, indices: new batch.indices.constructor(indices) }];
  });
  if (mode === 'ears') return selected;

  // Coincident triangles from repeated shells compete for the same depth.
  // Keep the first surface, including its original material and UVs.
  const seen = new Set();
  return selected.flatMap(batch => {
    if (!batch.indices?.length) return [batch];
    const keys = hairTriangleKeys(batch);
    const indices = [];
    for (const [triangle, key] of keys.entries()) {
      if (seen.has(key)) continue;
      indices.push(...batch.indices.slice(triangle * 3, triangle * 3 + 3));
    }
    for (const key of keys) seen.add(key);
    if (!indices.length) return [];
    return indices.length === batch.indices.length ? [batch] : [{ ...batch, indices: new batch.indices.constructor(indices) }];
  });
}

export function hairMaterialCanTint(material) {
  const file = String(material?.textureFile ?? '').split(/[\\/]/).pop() ?? '';
  return !/(?:\b(?:ear|skin|head)s?\b)/i.test(material?.name ?? '')
    && !/(?:^|[_ -])(?:ears?|skin|head|h\d+)(?:[_. -]|$)|hair(?:pin|wrap|band)/i.test(file);
}

const luminance = (rgba, i) => (rgba[i] * .2126 + rgba[i + 1] * .7152 + rgba[i + 2] * .0722) / 255;

function hairReferenceLight(rgba) {
  let weighted = 0, coverage = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    weighted += luminance(rgba, i) * rgba[i + 3];
    coverage += rgba[i + 3];
  }
  return coverage ? weighted / coverage : .5;
}

// Boost fine strand marks without boosting the broad change in light across a lock.
function strandDetail(rgba, offset, width, height, light) {
  if (!width || !height || width * height * 4 !== rgba.length || rgba[offset + 3] < 128) return 0;
  const pixel = offset / 4, x = pixel % width, y = Math.floor(pixel / width);
  let sum = 0, coverage = 0;
  for (let row = Math.max(0, y - 2); row <= Math.min(height - 1, y + 2); row++) {
    for (let col = Math.max(0, x - 2); col <= Math.min(width - 1, x + 2); col++) {
      const i = (row * width + col) * 4;
      const alpha = rgba[i + 3];
      if (alpha < 128) continue;
      sum += luminance(rgba, i) * alpha;
      coverage += alpha;
    }
  }
  const detail = light - sum / coverage;
  return .09 * detail / (.09 + Math.abs(detail));
}

// Anchor every texture to the chosen swatch while retaining local highlights and alpha.
export function hairColorMips(mips, slot, value, material = null) {
  const color = normalizeSavedHairColor(value) ?? normalizeHairColor(value);
  if (slot !== 'hair' || !color || !hairMaterialCanTint(material)) return mips;
  const cached = cache.get(mips);
  if (cached?.color === color) return cached.mips;
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const tone = luminance(rgb, 0);
  const lightSwatch = Math.max(0, Math.min(1, (tone - .45) / .35));
  const sheenStrength = .38 - .10 * lightSwatch;
  const reference = mips[0]?.rgba ? hairReferenceLight(mips[0].rgba) : .5;
  const tinted = mips.map(mip => {
    if (!mip.rgba) return mip;
    const rgba = new Uint8ClampedArray(mip.rgba);
    for (let i = 0; i < rgba.length; i += 4) {
      const light = luminance(mip.rgba, i);
      const delta = light - reference + strandDetail(mip.rgba, i, mip.width, mip.height, light);
      // A soft shoulder keeps texture detail even at the ends of the range.
      const shade = delta / (.32 + Math.abs(delta));
      const shadow = Math.min(0, shade) * .74;
      const sheen = Math.max(0, shade) * sheenStrength;
      for (let c = 0; c < 3; c++) {
        const base = rgb[c];
        // Dark grooves retain the pigment. Brighter strands pick up a
        // less saturated reflection, especially on copper and gold.
        rgba[i + c] = base * (1 + shadow) + (255 - base) * sheen;
      }
    }
    return { ...mip, rgba };
  });
  cache.set(mips, { color, mips: tinted });
  return tinted;
}
