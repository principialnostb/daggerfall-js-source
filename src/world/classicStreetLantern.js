import packed from './art/classicStreetLantern.json' with { type: 'json' };
import { TORCH_ARCHIVE } from './torchModel.js';

const MATERIALS = [40, 41, 42];
export { usesClassicStreetLantern } from './streetLanternPlacement.js';
const bytes = encoded => Uint8Array.from(globalThis.atob(encoded), c => c.charCodeAt(0));

// Departure from DFU DaggerfallBillboard.SetMaterial/Update: the owner's
// reference becomes a fixed solid street fixture, with no candle or flame.
export function createClassicStreetLantern(renderer) {
  MATERIALS.forEach((record, i) => {
    const paint = { width: packed.textureSize, height: packed.textureSize, colors: bytes(packed.textures[i]) };
    renderer.uploadTexture(TORCH_ARCHIVE, record, paint);
    if (i === 2) renderer.uploadEmissionTexture?.(TORCH_ARCHIVE, record, paint, { white: true });
  });
  let startIndex = 0;
  const subMeshes = packed.counts.slice(0, 3).map((count, i) => {
    const part = { startIndex, primitiveCount: count / 3, textureArchive: TORCH_ARCHIVE, textureRecord: MATERIALS[i] };
    startIndex += count;
    return part;
  });
  const mesh = renderer.createMesh({
    positions: new Float32Array(bytes(packed.positions).buffer),
    normals: new Float32Array(bytes(packed.normals).buffer),
    uvs: new Float32Array(bytes(packed.uvs).buffer),
    indices: new Uint32Array(bytes(packed.indices).buffer),
    subMeshes,
  });
  mesh.pixelKind = 'objects';
  return {
    mesh, flames: [],
    destroy() {
      renderer.destroyMesh?.(mesh);
      for (const record of MATERIALS) renderer.releaseTexture?.(TORCH_ARCHIVE, record);
      renderer.evictEmissionTexture?.(`${TORCH_ARCHIVE}_42`);
    },
  };
}
