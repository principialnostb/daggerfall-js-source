import { MeshBench, box } from './ships/galleonMesh.js';

export const VIOLET_SARCOPHAGUS_ID = 41324;
export const VIOLET_SARCOPHAGUS_SHELL = 'violet-sarcophagus-shell';
export const CLOSED_SARCOPHAGUS_SHELL = 'closed-sarcophagus-shell';
export const SHIFTED_SARCOPHAGUS_SHELL = 'shifted-sarcophagus-shell';
export const isVioletSarcophagusShell = shell => [VIOLET_SARCOPHAGUS_SHELL, CLOSED_SARCOPHAGUS_SHELL, SHIFTED_SARCOPHAGUS_SHELL].includes(shell);
export const VIOLET_SARCOPHAGUS_RIM = .91;
export const violetSarcophagusShells = new Map([
  [41319, CLOSED_SARCOPHAGUS_SHELL], [41320, SHIFTED_SARCOPHAGUS_SHELL],
  [41321, VIOLET_SARCOPHAGUS_SHELL], [VIOLET_SARCOPHAGUS_ID, VIOLET_SARCOPHAGUS_SHELL],
  [41327, VIOLET_SARCOPHAGUS_SHELL],
]);
export const VIOLET_SARCOPHAGUS_REMAINS = 'burial-violet';

function buildVioletShell(b, shell) {
  const stone = 117, trim = 118;
  const rim = VIOLET_SARCOPHAGUS_RIM;
  const wallHeight = rim - .07;
  // X and Z are normalized to the cavity; Y is already in world units.
  // Use shorter repeats along the length, where the pose stretches the mesh most.
  const block = (record, center, half, options) => box(b, record, center, half, {
    tile: [.42, .68], ...options,
  });
  block(stone, [0, -.065, 0], [.558, .065, .528]);
  for (const sign of [-1, 1]) {
    block(stone, [sign * .532, wallHeight / 2, 0], [.032, wallHeight / 2, .50], { skip: [2] });
    block(stone, [0, wallHeight / 2, sign * .518], [.564, wallHeight / 2, .018], { skip: [2] });
    block(trim, [sign * .532, rim - .035, 0], [.042, .035, .538]);
    block(trim, [0, rim - .035, sign * .518], [.490, .035, .021]);
    block(trim, [sign * .554, .10, 0], [.014, .042, .536]);
  }
  // Keep the original 92:8 artwork and its ARCH3D UV orientation on the outward face.
  const lid = (center, half, axes) => {
    block(stone, center, half, { axes, skip: [2] });
    box(b, 119, center, half, { axes, skip: [0, 1, 3, 4, 5],
      uvFace: (_, k) => [[.03846, -.98889], [.03846, -.03333], [.98077, -.03333], [.98077, -.98889]][k] });
  };
  if (shell === CLOSED_SARCOPHAGUS_SHELL || shell === SHIFTED_SARCOPHAGUS_SHELL) {
    // ARCH3D 41320 moves the lid sideways and yaws it on the rim.
    // Apply the rotation in metres, before converting back to cavity units.
    const shifted = shell === SHIFTED_SARCOPHAGUS_SHELL;
    const yaw = shifted ? Math.atan2(.424, 1.229) : 0;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const aspect = 2.70 / 1.30;
    lid([shifted ? .274 : 0, rim + .04, shifted ? -.027 : 0], [.55, .04, .50],
      [[c, 0, -s / aspect], [0, 1, 0], [s * aspect, 0, c]]);
  } else {
    const axes = [[.422, .906, 0], [-.906, .422, 0], [0, 0, 1]];
    const half = .76;
    const centerY = half * axes[0][1] + .037 * axes[1][1] - .13;
    lid([-.719, centerY, 0], [half, .037, .50], axes);
  }
}

export function buildDungeonSarcophagus(archive, shell = null) {
  const b = new MeshBench(archive);
  if (shell) {
    buildVioletShell(b, shell);
    return finishShell(b, archive);
  }
  const wall = 110;
  const trim = 11;
  const height = .35;
  box(b, trim, [0, -.135, 0], [.62, .048, .557], { tile: [.8, .8] });
  box(b, wall, [0, -.069, 0], [.571, .069, .533], { tile: [.7, .7] });
  for (const sign of [-1, 1]) {
    box(b, wall, [sign * .55, height / 2, 0], [.05, height / 2, .5], { tile: [.65, .65], skip: [2, 3] });
    box(b, wall, [0, height / 2, sign * .522], [.60, height / 2, .022], { tile: [.65, .65], skip: [2, 3] });
    box(b, trim, [sign * .548, height, 0], [.064, .027, .545], { tile: [.55, .55] });
    box(b, trim, [0, height, sign * .529], [.483, .027, .027], { tile: [.55, .55] });
    for (const z of [-.39, 0, .39]) {
      box(b, trim, [sign * .605, height * .46, z], [.008, height * .28, .027]);
    }
  }
  // The lid rests outside the cavity, leaning against the rim.
  const lidAxes = [[.19, -.982, 0], [.982, .19, 0], [0, 0, 1]];
  box(b, wall, [-.735, height * .66, 0], [.34, .047, .525], { axes: lidAxes, tile: [.65, .65] });
  for (const z of [-.38, .38]) {
    box(b, trim, [-.685, height * .66 + .010, z], [.32, .016, .024], { axes: lidAxes });
  }
  return finishShell(b, archive);
}

function finishShell(b, archive) {
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => {
    const record = mesh.slots[i].record;
    const original = record === 119 ? 8 : record === 117 ? 11 : null;
    return { ...sub, textureArchive: original === null ? archive : 92, textureRecord: original ?? record };
  });
  return mesh;
}
