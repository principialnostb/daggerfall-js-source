import packed from './art/gothicLantern.json' with { type: 'json' };
import { TORCH_ARCHIVE } from './torchModel.js';
import { buildFixtureChain } from './lightFixtureModel.js';
import { trs } from './mat4.js';

const IRON = 30, EDGE = 31, PANE = 32, FLAME = 34, DARK_PANE = 35;
const CHAIN_START = .867, SOCKET_SEAT = .957;
const MATERIALS = [IRON, EDGE, PANE, 33, FLAME, DARK_PANE];
const ACTIVE_MATERIALS = MATERIALS.filter(record => record !== FLAME);
// The wax top is at .625 in the source mesh, normalized by the GLB packer.
const CANDLE_FLAME = { at: [0, .351, 0], scale: .20 };

// Chandeliers, braziers, candles and floor fixtures have their own silhouettes.
export const usesGothicLantern = record => [8, 11, 12, 13, 22, 24, 25, 26, 27].includes(record);

function bytes(encoded) {
  return Uint8Array.from(globalThis.atob(encoded), char => char.charCodeAt(0));
}

export function createGothicLantern(renderer) {
  for (const [i, record] of MATERIALS.entries()) {
    if (record === FLAME) continue;
    const colors = bytes(packed.textures[i === 5 ? 2 : i]);
    if (record === DARK_PANE) {
      for (let p = 0; p < colors.length; p += 4) {
        colors[p] *= .21;
        colors[p + 1] *= .30;
        colors[p + 2] *= .55;
      }
    }
    const paint = { width: 128, height: 128, colors };
    renderer.uploadTexture(TORCH_ARCHIVE, record, paint);
    if (record === PANE) {
      renderer.uploadEmissionTexture?.(TORCH_ARCHIVE, record, paint, { white: true });
    }
  }
  let startIndex = 0;
  const subMeshes = packed.counts.map((count, i) => {
    const sub = { startIndex, primitiveCount: count / 3, textureArchive: TORCH_ARCHIVE, textureRecord: i === 5 ? IRON : MATERIALS[i] };
    startIndex += count;
    return sub;
  });
  const mesh = renderer.createMesh({
    positions: new Float32Array(bytes(packed.positions).buffer),
    normals: new Float32Array(bytes(packed.normals).buffer),
    uvs: new Float32Array(bytes(packed.uvs).buffer),
    indices: new Uint32Array(bytes(packed.indices).buffer),
    subMeshes,
  });
  mesh.pixelKind = 'objects';
  const parts = mesh.subMeshes;
  const view = selected => ({
    ...(renderer.meshView?.(mesh, selected) ?? { ...mesh, subMeshes: selected }),
    pixelKind: 'objects',
  });
  const socket = view(parts.slice(5));
  const frame = parts.slice(0, 5).filter(part => part.textureRecord !== PANE && part.textureRecord !== FLAME);
  const pane = parts.find(part => part.textureRecord === PANE);
  const chains = new Map();
  const drawOptions = { noShadow: true };
  function drawSuspension([x, y, z], height, gap) {
    const length = (SOCKET_SEAT - CHAIN_START) * height + gap;
    const count = Math.min(32, Math.ceil(length / (.031 * height)));
    if (!chains.has(count)) {
      const chain = renderer.createMesh(buildFixtureChain(count, IRON));
      chain.pixelKind = 'objects';
      chains.set(count, chain);
    }
    renderer.drawMesh(chains.get(count), trs(x, y + CHAIN_START * height, z, 0, 0, 0, height, length, height), null, drawOptions);
    renderer.drawMesh(socket, trs(x, y + gap, z, 0, 0, 0, height, height, height), null, drawOptions);
  }
  return {
    lit: { mesh: view(frame), pane: view([pane]), flames: [CANDLE_FLAME], drawSuspension },
    dark: { mesh: view([...frame, { ...pane, textureRecord: DARK_PANE }]), flames: [], drawSuspension },
    destroy() {
      renderer.destroyMesh?.(mesh);
      for (const chain of chains.values()) renderer.destroyMesh?.(chain);
      for (const record of ACTIVE_MATERIALS) renderer.releaseTexture?.(TORCH_ARCHIVE, record);
      renderer.evictEmissionTexture?.(`${TORCH_ARCHIVE}_${PANE}`);
    },
  };
}
