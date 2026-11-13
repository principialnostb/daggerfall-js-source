import { MeshBench, prism } from './ships/galleonMesh.js';
import { dungeonHeadFiles, dungeonHumanAssetReader, dungeonHumanAssets } from './dungeonHumanDecor.js';
import { correctTexturePath, decodeTextureImage } from '../formats/morrowind/mwTexture.js';
import { addDungeonChainLink } from './dungeonChainModel.js';

const bodySlots = ['chest', 'neck', ...['upperarm', 'forearm', 'wrist', 'hand']
  .flatMap(part => [part + ':left', part + ':right'])];
const clothes = [
  ['groin', 'meshes/c/c_m_pants_g_common01.nif'],
  ['upperleg', 'meshes/c/c_m_pants_ul_common01.nif'],
  ['knee', 'meshes/c/c_m_pants_k_common01.nif'],
  ['ankle', 'meshes/c/c_m_pants_a_common01.nif'],
  ['foot', 'meshes/b/b_n_nord_m_foot.nif'],
];
const bodyPoses = [
  ['human-body', 'Death2'], ['human-body-side', 'Death3'], ['human-hanging', 'Idle'],
  ['human-bound', 'Idle'], ['human-stake', 'Idle'], ['human-stake-headless', 'Idle'],
];

export async function loadDungeonHumanBody(archives, bodyBytes, bodyTexture) {
  const read = dungeonHumanAssetReader(archives);
  const [{ assembleFirstPersonArm, poseAssembly, applyRotateController }, { parseNif }, anim] = await Promise.all([
    import('../formats/morrowind/mwFirstPerson.js'), import('../formats/morrowind/mwNifFile.js'),
    import('../formats/morrowind/mwAnim.js'),
  ]);
  const [skeletonBytes, keyBytes, parts] = await Promise.all([
    read('meshes/xbase_anim.nif'), read('meshes/xbase_anim.kf'),
    Promise.all([...clothes, ['head', dungeonHeadFiles[0]], ['hair', dungeonHeadFiles[1]]]
      .map(async ([slot, path]) => ({ slot, bytes: await read(path) }))),
  ]);
  parts.push({ slot: 'betterBodies', bones: [], bytes: bodyBytes, showSlots: bodySlots });
  const assembly = await assembleFirstPersonArm({ skeletonBytes, parts });
  const attached = new Set(assembly.pieces.map(piece => piece.bodySection ?? piece.slot));
  if (!assembly.ok || [...parts.slice(0, -1).map(part => part.slot), ...bodySlots].some(slot => !attached.has(slot))) return null;
  const keys = parseNif(keyBytes);
  const clips = anim.parseAnimGroups(anim.collectTextKeys(keys));
  const tracks = anim.extractTracks(keys);
  const textureOf = piece => piece.slot === 'betterBodies' ? '' : piece.material.textureFile;
  const names = [...new Set(assembly.pieces.map(textureOf))];
  const paints = new Map(await Promise.all(names.map(async (name, i) => {
    const path = name ? correctTexturePath(name, candidate => archives.some(archive => archive.has(candidate))) : 'skin.dds';
    const { width, height, rgba } = decodeTextureImage(path, name ? await read(path) : bodyTexture, { levels: 1 }).mips[0];
    return [88 + i, { width, height, colors: rgba }];
  })));
  const variants = new Map();
  for (const [kind, clipName] of bodyPoses) {
    const clip = clips.get(clipName);
    const end = clipName === 'Idle' ? clip?.start : clip?.stop;
    if (!Number.isFinite(end)) continue;
    const raised = kind === 'human-bound' ? ['l', 'r'] : kind === 'human-stake-headless' ? ['r'] : [];
    const aim = raised.length ? (skeleton, pose, root, matrices) => {
      for (const side of raised) {
        const shoulder = skeleton.byName.get('bip01 ' + side + ' upperarm');
        const hand = skeleton.byName.get('bip01 ' + side + ' hand');
        const world = matrices(skeleton, pose, root);
        if (!world.has(shoulder) || !world.has(hand)) continue;
        const [x, , z] = world.get(shoulder).t, [wx, , wz] = world.get(hand).t;
        const angle = Math.atan2(wz - z, wx - x) - Math.atan2(1, side === 'l' ? -.63 : .63);
        const c = Math.cos(angle), s = Math.sin(angle);
        applyRotateController(skeleton, pose, root, matrices, shoulder, [c, 0, s, 0, 1, 0, -s, 0, c]);
      }
    } : null;
    poseAssembly(assembly, { tracks, sampleTrack: anim.sampleTrack, time: end, aim });
    const visible = assembly.pieces.filter(piece => kind !== 'human-stake-headless' || (piece.slot !== 'head' && piece.slot !== 'hair'));
    variants.set(kind, {
      parts: visible.map(piece => ({
        positions: piece.positions.slice(), indices: piece.indices, uvs: piece.uvs,
        normals: piece.normals.slice(), slot: 88 + names.indexOf(textureOf(piece)),
        section: piece.bodySection,
      })), paints,
    });
  }
  return { ...variants.get('human-body'), variants };
}

const currentBodies = dungeonHumanAssets(async archives => {
  const { betterBodiesAssetUrls } = await import('../formats/morrowind/mwBetterBodies.js');
  const donor = betterBodiesAssetUrls({ race: 'Nord', female: false, underwear: true, bodyHair: false });
  if (!donor) return null;
  const read = async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Could not load Better Bodies decor donor');
    return new Uint8Array(await response.arrayBuffer());
  };
  const [bodyBytes, bodyTexture] = await Promise.all([read(donor.model), read(donor.texture)]);
  return loadDungeonHumanBody(archives, bodyBytes, bodyTexture);
});
export const dungeonHumanBodyVariants = new Map(bodyPoses.map(([kind, clip]) => [kind, {
  load: () => currentBodies()?.variants.get(kind),
  build: (archive, parts) => buildDungeonHumanBody(archive, parts, clip === 'Idle' ? kind : ''),
}]));

export function buildDungeonHumanBody(archive, parts, kind = '') {
  const b = new MeshBench(archive);
  const standing = !!kind;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { positions, indices } of parts) for (const i of indices) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const scale = .0134;
  const height = (maxZ - minZ) * scale;
  const lift = kind === 'human-hanging' ? .31 : kind === 'human-bound' ? .48 : 0;
  const hands = [];
  for (const { positions, indices, uvs, normals, slot, section } of parts) {
    const point = v => {
      const x = (positions[v * 3] - centerX) * scale;
      const y = (positions[v * 3 + 2] - minZ) * scale + lift;
      const z = (positions[v * 3 + 1] - centerY) * scale;
      return standing ? [x - (y - lift) * .035, y, -z] : [z, y, x];
    };
    if (section?.startsWith('hand:')) {
      const vertices = Array.from({ length: positions.length / 3 }, (_, i) => point(i));
      hands.push([0, 1, 2].map(axis => vertices.reduce((sum, v) => sum + v[axis], 0) / vertices.length));
    }
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i], indices[i + 1], indices[i + 2]];
      const points = ids.map(point);
      const uv = ids.map(v => [uvs[v * 2], uvs[v * 2 + 1]]);
      const normal = ids.map(v => standing
        ? [normals[v * 3], normals[v * 3 + 2], -normals[v * 3 + 1]]
        : [normals[v * 3 + 1], normals[v * 3 + 2], normals[v * 3]]);
      b.tri(slot, ...points, ...uv, null, normal);
    }
  }
  if (kind === 'human-hanging') {
    const collar = height + lift - .22;
    const x = -height * .035;
    prism(b, 5, [x, collar - .012, 0], [x, collar + .026, 0], .102, .099, 9);
    prism(b, 5, [x, collar, -.08], [x, collar + .31, -.10], .019, .017, 6);
    prism(b, 5, [x, collar + .31, -.10], [x, 2.875, -.10], .017, .017, 6);
  }
  if (kind === 'human-hanging' || kind === 'human-stake') {
    const hanging = kind === 'human-hanging';
    const x = -height * .025;
    const hem = [.83, .78, .82, .74, .81, .77, .82, .78, .87, .79, .82, .75];
    const point = (index, y, rx, rz) => {
      const angle = index * Math.PI / 6;
      const fold = index % 2 ? .012 : -.015;
      return [x + (rx + fold) * Math.cos(angle), y, (rz + fold) * Math.sin(angle)];
    };
    for (let i = 0; i < hem.length; i++) {
      const next = i + 1;
      const skirt = hanging ? .63 : .60;
      const lower = lift + hem[i] * height * skirt, lowerNext = lift + hem[next % hem.length] * height * skirt;
      const shoulder = lift + height * .865, waist = lift + height * .66, neck = lift + height * .918;
      const uv = [[0, 0], [.30, 0], [.30, 1], [0, 1]];
      const top = point(i, shoulder, .224, .200), topNext = point(next, shoulder, .224, .200);
      const mid = point(i, waist, .192, .180), midNext = point(next, waist, .192, .180);
      const fabric = hanging ? 7 : 1;
      b.quad(fabric, top, point(i, neck, .086, .100), point(next, neck, .086, .100), topNext, uv, null);
      b.quad(fabric, mid, top, topNext, midNext, uv, null);
      b.quad(fabric, point(i, lower, .205, .177), mid, midNext, point(next, lowerNext, .205, .177), uv, null);
    }
  }
  if (kind === 'human-bound') {
    const bar = Math.max(...hands.map(hand => hand[1])) + .23;
    prism(b, 3, [-.59, bar, -.09], [.59, bar, -.09], .063, .056, 4);
    prism(b, 2, [0, bar, -.09], [0, bar + .10, 0], .023, .021, 6);
    for (const [x, y, z] of hands) {
      prism(b, 5, [x, y - .045, z], [x, y + .01, z], .056, .048, 7);
      prism(b, 5, [x, y, z], [x, bar, -.09], .018, .016, 6);
    }
    for (let y = bar + .075, n = 0; y < 3.57; y += .115, n++) {
      addDungeonChainLink(b, y, .046, .065, .012, n % 2 === 0, 0, 1);
    }
  }
  if (kind === 'human-stake' || kind === 'human-stake-headless') {
    const top = kind === 'human-stake-headless' ? 2.025 : 2.10;
    prism(b, 3, [-.085, 0, -.13], [.01, top - .18, -.18], .053, .044, 5);
    prism(b, 3, [.01, top - .18, -.18], [.016, top, -.18], .044, .002, 5);
    const waist = .79;
    prism(b, 5, [-.04, waist, -.055], [-.04, waist + .035, -.055], .166, .166, 10);
    if (kind === 'human-stake-headless') {
      const [x, y, z] = hands.reduce((a, b) => a[1] > b[1] ? a : b);
      prism(b, 5, [x, y, z], [.015, y + .055, -.18], .017, .017, 6);
    }
  }
  const mesh = b.finish();
  mesh.subMeshes = mesh.subMeshes.map((sub, i) => ({ ...sub, textureArchive: archive, textureRecord: mesh.slots[i].record }));
  return mesh;
}
