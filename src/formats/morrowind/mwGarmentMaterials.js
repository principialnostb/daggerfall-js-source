import { correctTexturePath } from './mwTexture.js';

// Some clothing replacements put both legs in a single shape named "Right Knee".
// Keep the authored weights and winding, and give each slot its own triangles.
export function garmentSideBatch(batch, slot, siblings) {
  const target = /^(left|right) (upper leg|knee|ankle|foot)$/i.exec(slot);
  const shape = /^(?:tri )?(left|right) (upper leg|knee|ankle|foot)$/i.exec(batch.name?.trim());
  if (!target || !shape || target[2].toLowerCase() !== shape[2].toLowerCase()) return undefined;
  const authored = shape[1].toLowerCase();
  const opposite = authored === 'left' ? 'right' : 'left';
  const counterpart = opposite + ' ' + shape[2].toLowerCase();
  if (siblings.some(other => other.name?.trim().toLowerCase().replace(/^tri /, '').startsWith(counterpart))) return undefined;
  const bones = batch.skin?.bones ?? [];
  if (!['l', 'r'].every(side => bones.some(b => b.name?.toLowerCase().startsWith('bip01 ' + side + ' ')))) return undefined;
  const weights = new Float32Array(batch.positions.length / 3);
  for (const b of bones) {
    const side = /^bip01 ([lr]) /i.exec(b.name)?.[1]?.toLowerCase();
    if (!side) continue;
    for (let i = 0; i < b.indices.length; i++) weights[b.indices[i]] += (side === 'l' ? 1 : -1) * b.weights[i];
  }
  const kept = [];
  const idx = batch.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const sum = weights[idx[i]] + weights[idx[i + 1]] + weights[idx[i + 2]];
    const side = sum === 0 ? authored : sum > 0 ? 'left' : 'right';
    if (side === target[1].toLowerCase()) kept.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  if (!kept.length || kept.length === idx.length) return undefined;
  return { ...batch, indices: new Uint16Array(kept) };
}

const materialFiles = new WeakMap();
function missingDiffuse(bytes, parse, exists) {
  let files = materialFiles.get(bytes);
  if (!files) {
    const nif = parse(bytes);
    files = new Set();
    for (const prop of nif.records) {
      if (prop.type !== 'NiTexturingProperty') continue;
      const source = nif.records[prop.textures[0]?.source];
      if (source?.external && source.fileName) files.add(source.fileName);
    }
    materialFiles.set(bytes, files);
  }
  for (const file of files) if (!exists(correctTexturePath(file, exists))) return file;
  return null;
}

// The first archive can supply an override NIF whose companion skin was never installed.
export async function texturedPartBytes(path, archives, first, read, parse, exists, report) {
  const original = read(first, path);
  if (!original) return original;
  let missing;
  try { missing = missingDiffuse(original, parse, exists); } catch { return original; }
  if (!missing) return original;
  for (const arc of archives.slice(archives.indexOf(first) + 1)) {
    if (!arc.has(path)) continue;
    try {
      await arc.load?.(path);
      const bytes = read(arc, path);
      if (bytes && !missingDiffuse(bytes, parse, exists)) {
        report(missing);
        return bytes;
      }
    } catch { /* Another archive can carry the same model. */ }
  }
  return original;
}
