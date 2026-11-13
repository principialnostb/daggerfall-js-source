import { addDungeonCage } from './dungeonCageModel.js';
import { addDungeonChainLink } from './dungeonChainModel.js';
import { VIOLET_SARCOPHAGUS_REMAINS } from './dungeonSarcophagus.js';
import { MeshBench, box, prism } from './ships/galleonMesh.js';
import { transformPoint, trs, multiply } from './mat4.js';
import { parseNif } from '../formats/morrowind/mwNifFile.js';
import { flattenNif } from '../formats/morrowind/mwNifMesh.js';
import { correctTexturePath, decodeTextureImage } from '../formats/morrowind/mwTexture.js';

const PATH = 'meshes/r/skeleton.nif';
const CRANIUM = 'Tri upperteeth02', JAW = 'Tri lowerteeth01';
const headAnchor = [0, 2, 117];
const skull = (offset, angles, jaw, scale = 1) => [
  { part: CRANIUM, offset, angles, anchor: headAnchor, scale },
  ...(jaw ? [{ part: JAW, offset, angles, anchor: headAnchor, scale }] : []),
];
const recipes = new Map([
  ['skull-0', skull([0, 0, 0], [.05, .08, -.2], true)],
  ['skull-1', skull([0, 0, 0], [.33, -.12, .46], false)],
  ['skull-2', skull([0, 0, 0], [.66, -.42, -.28], true)],
  ['bones-0', [
    ...skull([0, 0, .027], [.55, .55, .26], false, .96),
    { part: JAW, offset: [.21, -.09, .027], angles: [.58, .08, -.74] },
    { part: 'Tri ulna', offset: [-.20, -.07, .032], angles: [.55, .03, -.8] },
    { part: 'Tri humorus', offset: [-.05, -.22, .035], angles: [.1, 1.36, -.42] },
    { part: 'Tri hand01', offset: [.11, -.27, .025], angles: [.18, .07, -.6] },
  ]],
  ['bones-1', [
    { part: 'Tri sternum', offset: [0, 0, .115], angles: [1.24, .16, .61] },
    { part: 'Tri right pelv01', offset: [.26, -.11, .059], angles: [1.45, .17, .2] },
    { part: 'Tri radius01', offset: [.05, -.23, .038], angles: [.5, .14, -.73] },
    { part: 'Tri hand02', offset: [-.25, -.16, .035], angles: [.08, .1, .4] },
    ...skull([-.30, .06, .046], [.53, -.45, -.32], false, .93),
  ]],
]);
const placed = (part, offset, angles, anchor) => ({ part, offset, angles, anchor });
recipes.set('skull-side-0', skull([0, 0, 0], [.35, 1.13, -.42], true));
recipes.set('skull-open-0', [
  ...skull([0, 0, 0], [-.09, 0, .18], false),
  placed(JAW, [0, .012, -.032], [-.27, 0, .18], headAnchor),
]);
recipes.set('ribs-0', [
  placed('Tri sternum', [0, 0, 0], [1.18, .20, -.26]),
  placed('Tri right pelv01', [.23, -.09, 0], [1.45, .15, .2]),
]);
recipes.set('arm-0', [
  placed('Tri ulna', [-.08, .015, 0], [.42, .78, -.56], [18, 1, 93]),
  placed('Tri radius', [-.08, .015, 0], [.42, .78, -.56], [18, 1, 93]),
  placed('Tri hand01', [.055, -.035, 0], [.12, .16, 2.6]),
]);
recipes.set('bone-0', [placed('Tri humorus', [0, 0, 0], [.28, -1.08, .29])]);
recipes.set('stake-0', [
  ...skull([0, 0, .88], [.05, .13, -.24], true),
  { ...placed('Tri humorus', [.19, -.06, 0], [.28, -1.08, .29]), floor: true, scale: .78 },
]);
recipes.set('stakes-0', [
  ...skull([-.14, .04, .79], [.19, .05, -.28], false),
  ...skull([.12, -.03, .98], [.04, -.24, .31], true),
  { ...placed(JAW, [-.23, .12, 0], [.55, -.18, .40]), floor: true },
]);
const standingParts = [
  CRANIUM, JAW, 'Tri ulna01', 'Tri radius01', 'Tri humorus01',
  'Tri ulna', 'Tri radius', 'Tri humorus', 'Tri scapula01', 'Tri scapula02',
  'Tri sternum', 'Tri Line11', 'Tri Line10', 'Tri Line12', 'Tri Line09',
  'Tri Line08', 'Tri Line02', 'Tri Line03', 'Tri Line01',
  'Tri right pelv01', 'Tri sacrum01', 'Tri right pelv02',
];
const suspensionLift = .16;
const hangingForearms = [
  { parts: ['Tri ulna01', 'Tri radius01'], elbow: [-19, 5, 93], angle: -.82,
    wrist: [-17.4, 16.5, 82.7], hand: 'Tri hand01', handPivot: [6.3, -.6, .8], handYaw: -1.52 },
  { parts: ['Tri ulna', 'Tri radius'], elbow: [18, -6.6, 94], angle: -1.31,
    wrist: [18.1, 8.6, 90.9], hand: 'Tri hand02', handPivot: [-6.3, -.6, .8], handYaw: 1.47 },
];
const forearmParts = new Set(hangingForearms.flatMap(arm => arm.parts));
const floorAnkles = new Map([['Tri Line11', [-8, 8, 6]], ['Tri Line08', [13, -3, 6]]]);
const floorLegs = new Set(['Tri Line09', 'Tri Line01', 'Tri Line10', 'Tri Line12', 'Tri Line02', 'Tri Line03', ...floorAnkles.keys()]);
recipes.set('standing-0', [
  ...standingParts.filter(part => part !== CRANIUM && part !== JAW && !forearmParts.has(part))
    .map(part => placed(part, [0, 0, suspensionLift], [0, 0, 0], [0, 0, 0])),
  ...skull([.012, .015, 1.798], [.18, -.18, -.19], true),
  ...hangingForearms.flatMap(({ parts, elbow, angle, wrist, hand, handPivot, handYaw }) => {
    const joint = elbow.map((v, i) => v * .014 + (i === 2 ? suspensionLift : 0));
    const rotation = trs(0, 0, 0, angle * 180 / Math.PI, 0, 0);
    const wristOffset = transformPoint(rotation, ...wrist.map((v, i) => (v - elbow[i]) * .014));
    const wristJoint = joint.map((v, i) => v + wristOffset[i]);
    return [
      ...parts.map(part => placed(part, joint, [angle, 0, 0], elbow)),
      placed(hand, wristJoint, [0, handYaw, .07], handPivot),
    ];
  }),
  placed('Tri Spine', [0, .008, 1.454], [0, 0, 0]),
]);

recipes.set('cage-0', [
  ...skull([.29, -.16, .56], [.52, -.18, -.63], true),
  placed('Tri sternum', [.13, -.15, .48], [1.10, .49, .81]),
  placed('Tri right pelv01', [-.10, .08, .37], [.72, 1.34, -.23]),
  placed('Tri Line01', [-.26, .16, .39], [.37, 1.18, -.28]),
  placed('Tri Line09', [-.41, -.06, .39], [.57, -1.10, .64]),
  placed('Tri Line10', [-.48, -.27, .36], [.63, -1.42, -.28]),
  placed('Tri humorus01', [.38, -.19, .51], [.58, -.22, -.15]),
  placed('Tri ulna01', [.40, -.37, .43], [1.00, .81, .32]),
  placed('Tri hand01', [.34, -.55, .37], [.19, .28, 1.11]),
]);

const usedParts = [...new Set([...recipes.values()].flat().map(piece => piece.part))];
const DECOR_SCALE = 1.45;

const kinds = new Map([
  ['206:0', 'skull'], ['206:1', 'skull'], ['206:2', 'stake'], ['206:3', 'skull'],
  ['206:4', 'skull-open'], ['206:5', 'skull'], ['206:6', 'skull-side'],
  ['206:7', 'stakes'], ['206:8', 'bones'], ['206:10', 'standing'],
  ['206:12', 'skeleton-stake-bare'], ['206:13', 'skeleton-stake'], ['206:14', 'skeleton-floor-side'], ['206:17', 'stake'],
  ['206:29', 'ribs'], ['206:30', 'arm'], ['206:31', 'bone'], ['206:35', 'skeleton-floor'], ['206:36', 'skeleton-hanging'],
  ['206:26', 'cage'], ['100:4', 'cage'], ['211:33', 'skeleton-crossbar'], ['211:34', 'broken-cage'],
  ['100:2', 'arm'], ['100:17', 'bones'], ['100:24', 'stake'], ['100:25', 'skull'],
]);

export function dungeonRemainsKind(archive, record) {
  return kinds.get(archive + ':' + record) ?? null;
}

export const dungeonRemainsRecords = () => [...kinds];

export function dungeonRemainsVariant(kind, x, z) {
  const hash = (Math.imul(Math.round(x * 64), 73856093) ^ Math.imul(Math.round(z * 64), 19349663)) >>> 0;
  // Loose remains share a floor composition. Tall or mounted props keep
  // their authored role and clearance. The diagonal bands are spatial,
  // so neighboring floor placements change motif without a random roll.
  const floorBand = (Math.floor((x + z * .65) / 1.15) % 4 + 4) % 4;
  if (kind === 'skull' && floorBand === 3) return 'bone-0';
  if (kind === 'bones' && floorBand === 1) return 'ribs-0';
  const count = kind === 'skull' ? 3 : kind === 'bones' ? 2 : 1;
  return kind + '-' + hash % count;
}

export function readDungeonRemainsParts(bytes) {
  const parts = new Map(flattenNif(parseNif(bytes)).map(shape => [shape.name, shape]));
  return [...recipes.values()].flat().every(part => parts.get(part.part)?.indices.length) ? parts : null;
}

let assets, generation, loading, dataSource;
export function currentDungeonRemainsParts() {
  if (dataSource && dataSource.morrowindDataGeneration() === generation) return assets;
  if (!loading) {
    loading = import('../scenes/dataSource.js').then(async source => {
      dataSource = source;
      const next = source.morrowindDataGeneration();
      if (next === generation) return;
      generation = next;
      assets = null;
      const archives = await source.loadMorrowindArchives();
      const archive = archives.find(candidate => candidate.has(PATH));
      if (!archive) return;
      if (archive.load) await archive.load(PATH);
      const parts = readDungeonRemainsParts(archive.get(PATH));
      if (!parts) return;
      const paints = await loadRemainsPaints(parts, archives);
      if (source.morrowindDataGeneration() === next && paints.size === usedParts.length) assets = { parts, paints };
    }).catch(() => { assets = null; }).finally(() => { loading = null; });
  }
  return assets;
}

export async function loadRemainsPaints(parts, archives) {
  const paints = new Map();
  const pending = new Map();
  await Promise.all(usedParts.map(async (name, index) => {
    const file = parts.get(name)?.material.textureFile;
    if (!file) return;
    const path = correctTexturePath(file, candidate => archives.some(archive => archive.has(candidate)));
    const archive = archives.find(candidate => candidate.has(path));
    if (!archive) return;
    if (!pending.has(path)) pending.set(path, (async () => {
      try {
        if (archive.load) await archive.load(path);
        const { width, height, rgba } = decodeTextureImage(path, archive.get(path), { levels: 1 }).mips[0];
        return { width, height, colors: rgba };
      } catch { return null; }
    })());
    const paint = await pending.get(path);
    if (paint) paints.set(12 + index, paint);
  }));
  return paints;
}

function centerOf(positions) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], positions[i]);
    max[axis] = Math.max(max[axis], positions[i]);
  }
  return min.map((value, axis) => (value + max[axis]) / 2);
}

export function buildDungeonRemains(archive, variant, parts) {
  const b = new MeshBench(archive);
  const violet = variant === VIOLET_SARCOPHAGUS_REMAINS;
  const burial = variant === 'burial-0' || violet;
  if (burial) variant = 'skeleton-floor-0';
  const full = variant.startsWith('skeleton-');
  const lying = variant.startsWith('skeleton-floor');
  const prone = variant === 'skeleton-floor-side-0';
  const lift = variant === 'skeleton-hanging-0' ? .38 : variant === 'skeleton-crossbar-0' ? .54 : 0;
  const recipe = full ? recipes.get('standing-0').filter(({ part }) =>
    variant !== 'skeleton-stake-bare-0' || (part !== CRANIUM && part !== JAW)).map(piece => {
    const ankle = lying && floorAnkles.get(piece.part);
    if (!ankle) return piece;
    const [x, y, z] = ankle.map(value => value * .014);
    return placed(piece.part, [x, y, z + suspensionLift], [prone ? .35 : .65, 0, 0], ankle);
  }) : recipes.get(variant);
  const mounted = variant === 'stake-0' || variant === 'stakes-0';
  const standing = variant === 'standing-0';
  const caged = variant === 'cage-0';
  const whole = variant.startsWith('skull-');
  const displayScale = caged || full ? 1 : standing ? 1.04 : mounted ? 1.22 : DECOR_SCALE;
  // Burial uses the back-down roll. Heading is a separate rotation about Y.
  const face = prone || burial ? -1 : 1;
  const lay = ([x, y, z]) => [x * face, z * face, -y];
  const posed = recipe.map(({ part, offset, angles, anchor, scale = 1, floor = false }) => {
    const source = parts.get(part);
    const pivot = anchor ?? centerOf(source.positions);
    const [x, y, z] = angles.map(a => a * 180 / Math.PI);
    const rotation = multiply(trs(0, 0, 0, 0, 0, z), trs(0, 0, 0, x, y, 0));
    const vertices = [];
    for (let i = 0; i < source.positions.length; i += 3) {
      const point = transformPoint(rotation, ...pivot.map((v, j) => (source.positions[i + j] - v) * .014 * scale));
      vertices.push([point[0] + offset[0], point[2] + offset[2], -point[1] - offset[1]]);
    }
    const texture = 12 + usedParts.indexOf(part);
    const head = part === CRANIUM || part === JAW;
    const arm = /ulna|radius|humorus|hand/i.test(part);
    const leg = floorLegs.has(part);
    const group = head ? 'head' : leg || arm ? part : 'torso';
    const drift = floorAnkles.has(part) ? .12 : leg && !['Tri Line09', 'Tri Line01'].includes(part) ? .078
      : leg || part.startsWith('Tri hand') ? .038 : 0;
    const spread = burial ? [0, 0] : head ? [prone ? -.25 : .24, -.18] : leg || arm
      ? [Math.sign(vertices[0][0] * face) * (arm ? .065 : .045), drift] : [0, 0];
    return { source, vertices, rotation, texture, floor, group, spread, bottom: Math.min(...vertices.map(v => v[1])) };
  });
  // Rest each loose bone on the floor while keeping the ribcage and skull assemblies intact.
  const floorHeights = new Map();
  if (lying) for (const { group, vertices } of posed) {
    const lowest = Math.min(...vertices.map(point => lay(point)[1]));
    floorHeights.set(group, Math.min(lowest, floorHeights.get(group) ?? Infinity));
  }
  const base = mounted || standing || caged || full ? 0 : Math.min(...posed.map(part => part.bottom));
  if (caged) addDungeonCage(b);
  if (mounted) {
    const supports = variant === 'stake-0' ? [[0, 0, .88]] : [[-.14, -.04, .79], [.12, .03, .98]];
    for (const [x, z, height] of supports) {
      const top = [x * displayScale, height * displayScale, z * displayScale];
      const foot = [x * .54, 0, z + .035];
      prism(b, 3, foot, top, .025, .017, 5);
      prism(b, 5, [top[0], top[1] - .075, top[2]], [top[0], top[1] - .035, top[2]], .029, .027, 6);
    }
  }
  if (standing) {
    box(b, 3, [0, .025, .07], [.27, .025, .20]);
    prism(b, 3, [0, .035, .14], [0, 1.96, .14], .024, .019, 5);
    box(b, 3, [0, 1.80, .08], [.23, .022, .09]);
    // The loops transfer the weight to the brace over the shoulder girdle.
    for (const x of [-.128, .124]) {
      prism(b, 5, [x, 1.81, .04], [x, 1.61, .014], .014, .012, 5);
      prism(b, 5, [x, 1.81, .107], [x, 1.60, .014], .014, .012, 5);
    }
  }
  if (full) {
    if (variant.startsWith('skeleton-stake')) {
      const top = variant === 'skeleton-stake-bare-0' ? 1.82 : 2.07;
      prism(b, 3, [-.12, 0, .13], [.025, top - .15, .14], .045, .032, 5);
      prism(b, 3, [.025, top - .15, .14], [.043, top, .14], .032, .002, 5);
      for (const x of [-.14, .14]) prism(b, 5, [x * .7, 1.63, .14], [x, 1.51, -.035], .015, .015, 6);
    }
    if (lift) {
      const crossbar = variant === 'skeleton-crossbar-0';
      const hook = crossbar ? 2.54 : 2.30;
      const top = crossbar ? 3.6 : 2.875;
      if (crossbar) prism(b, 3, [-.47, hook, .035], [.47, hook, .035], .047, .041, 5);
      for (const x of [-.17, .17]) prism(b, 5, [x, 1.51 + lift, -.02], [crossbar ? x * 1.9 : 0, hook, .035], .015, .014, 6);
      for (let y = hook + .067, n = 0; y < top - .047; y += .098, n++) {
        addDungeonChainLink(b, y, .042, .060, .011, n % 2 === 0, 0, 1);
      }
      prism(b, 2, [0, top - .075, 0], [0, top, 0], .027, .029, 6);
    }
  }
  for (const { source, vertices, rotation, texture, floor, bottom, group, spread } of posed) {
    const pose = ([x, y, z]) => {
      if (!lying) return [x, y + lift, z];
      const [px, py, pz] = lay([x, y, z]);
      return [px + spread[0], py - floorHeights.get(group), pz + .96 + spread[1]];
    };
    for (let i = 0; i < source.indices.length; i += 3) {
      const ids = [...source.indices.subarray(i, i + 3)];
      const points = ids.map(id => vertices[id]);
      const [a, c, d] = points.map(([x, y, z]) => pose([x * displayScale, (y - (!floor && (whole || mounted || standing || caged || full) ? base : bottom)) * displayScale, z * displayScale]));
      const [ua, uc, ud] = ids.map(id => [source.uvs[id * 2], source.uvs[id * 2 + 1]]);
      const normals = source.normals && ids.map(id => {
        const [x, y, z] = transformPoint(rotation, ...source.normals.subarray(id * 3, id * 3 + 3));
        const normal = [x, z, -y];
        return lying ? lay(normal) : normal;
      });
      b.tri(texture, a, c, d, ua, uc, ud, normals?.[0], normals);
    }
  }
  if (burial) {
    const { center, extent } = b.finish().aabb;
    // Rotate 180 degrees about the vertical axis without changing the back-down roll.
    const sx = -.27 / extent[0], sz = -.427 / extent[2];
    const sy = violet ? 1.18 : 1;
    for (const { p, n } of b.groups.values()) for (let i = 0; i < p.length; i += 3) {
      p[i] = (p[i] - center[0]) * sx;
      p[i + 1] = violet ? (p[i + 1] - (center[1] - extent[1])) * sy + .004 : p[i + 1] + .025;
      p[i + 2] = (p[i + 2] - center[2]) * sz;
      const len = Math.hypot(n[i] / sx, n[i + 1] / sy, n[i + 2] / sz);
      n[i] /= sx * len;
      n[i + 1] /= sy * len;
      n[i + 2] /= sz * len;
    }
  }
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}
