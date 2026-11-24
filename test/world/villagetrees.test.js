import { TREE_RECORDS } from '../../src/world/terrain/terrainNature.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addVillageTreeLibrary,
  villageTreeForm,
  villageTreeLitter,
  unpackWoodlandMesh,
  villageTreePicture,
  selectVillageTrees,
} from '../../src/world/tamriel/villageTrees.js';
import { VillagePlantClearance } from '../../src/world/tamriel/villagePlantClearance.js';
import { readLowPolyTrees, renderImpostor } from '../../src/world/lowPolyTrees.js';

const bytesOf = (path) => readFileSync(new URL(path, import.meta.url));

function checkSpruceCrown(pic, key) {
  const widths = [];
  for (let y = 0; y < Math.ceil(pic.height * .5); y++) {
    let left = pic.width, right = -1;
    for (let x = 0; x < pic.width; x++) {
      const i = 4 * (y * pic.width + x);
      if (pic.data[i + 3] && pic.data[i + 1] > pic.data[i]) {
        left = Math.min(left, x);
        right = x;
      }
    }
    widths.push(Math.max(0, right - left + 1));
    if (y >= 2 && y < pic.height / 3) assert.ok(right >= left, `${key}: bare leader at row ${y}`);
  }

  // A projecting twig can span a single row. A narrowing across a whole height band is a waist.
  let widest = 0;
  for (let band = 1; band <= 11; band++) {
    const rows = widths.slice(Math.round(pic.height * band / 25), Math.round(pic.height * (band + 1) / 25));
    rows.sort((a, b) => a - b);
    const width = rows[Math.floor(rows.length / 2)];
    assert.ok(width >= widest - 1, `${key}: crown narrows from ${widest} to ${width} pixels at band ${band}`);
    widest = Math.max(widest, width);
  }
}

test('Helbenar adds four distinct near meshes and renders their matching far pictures from the shipped buffers', () => {
  const stock = '../../vendor/low-poly-trees/Trees/';
  const index = JSON.parse(bytesOf(stock + 'trees.json'));
  const original = bytesOf(stock + 'trees.bin');
  const local = bytesOf('../../src/assets/trees/helbenar/trees.bin');
  const library = addVillageTreeLibrary(index, original, local);
  const trees = readLowPolyTrees(library.json, library.data, new Uint8Array());
  const forms = new Set();
  for (const key of ['504_12', '504_16', '506_12', '510_25']) {
    const proto = trees.protos.get(key + '_helbenar');
    assert.equal(trees.protos.get(key).mesh, index.prefabs[key].mesh);
    assert.ok(proto.mesh >= index.meshes.length);
    forms.add(proto.mesh);
    const atlas = villageTreePicture(proto.subs[0].atlas, bytesOf('../../src/assets/trees/helbenar/study.idx'));
    const pic = renderImpostor(trees, proto, () => atlas);
    assert.ok(pic.width > 20 && pic.height > 50);
    if (key === '506_12' || key === '510_25') checkSpruceCrown(pic, key);
    assert.ok(pic.data.filter((v, i) => i % 4 === 3 && v === 255).length > 400);
  }
  assert.equal(forms.size, 4);
  assert.notEqual(villageTreeForm(506, 11), villageTreeForm(506, 12));
  assert.notEqual(villageTreeForm(510, 5), villageTreeForm(510, 11));
  assert.ok(villageTreeForm(506, 12) >= 2);
  assert.notEqual(villageTreeForm(506, 24), villageTreeForm(506, 16));
  assert.notEqual(villageTreeForm(510, 16), villageTreeForm(506, 16));
  assert.equal(villageTreeForm(504, 1), -1);
  assert.equal(villageTreeForm(511, 12), villageTreeForm(510, 12));
});

test('Helbenar reserves crown clearance around roofs, fences, roads and other trees', () => {
  const ground = new Uint8Array(128 * 128).fill(2 << 2);
  const roads = new Uint8Array(ground.length);
  const footprints = new VillagePlantClearance(9),
    roofs = new VillagePlantClearance(9);
  roofs.add(41, 42, 60, 52);
  // A rail whose long axis was X in the mesh, rotated to run north/south.
  footprints.addFence([-10, 0, -0.12, 10, 1, 0.12], [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 100, 0, 100, 1]);
  const tile = (x, z) => Math.floor(z / 6.4) * 128 + Math.floor(x / 6.4);
  roads[tile(120, 120)] = 1;
  ground[tile(140, 140)] = 46 << 2;
  ground[tile(150, 150)] = 0;
  const flat = (x, z, record = 12) => ({ archive: 504, record, c: [x, 0, z] });
  const safe = flat(175, 175),
    shrub = flat(100, 100, 1),
    other = flat(195, 175);
  const log = [
    flat(39, 47),
    flat(102, 107),
    flat(120, 120),
    flat(140, 140),
    flat(150, 150),
    flat(160, 160),
    safe,
    flat(175.5, 176),
    shrub,
    other,
  ];
  selectVillageTrees(log, footprints, roofs, (x, z) => x === 25 && z === 25, roads, ground);
  assert.deepEqual(log, [safe, shrub, other]);
});

test('a blocked authored tree can move to a nearby verge at its new ground height', () => {
  const ground = new Uint8Array(128 * 128).fill(2 << 2);
  const clearance = new VillagePlantClearance(9),
    roofs = new VillagePlantClearance(9);
  roofs.add(99, 99, 101, 101);
  const tree = { archive: 504, record: 12, c: [100, 7, 100], block: {} };
  const untouched = { archive: 504, record: 12, c: [135, 7, 100], block: {} };
  const log = [tree, untouched];
  selectVillageTrees(log, clearance, roofs, null, null, ground, () => 9);
  assert.equal(log.length, 2);
  assert.equal(tree.c[1], 8.88);
  assert.ok(Math.hypot(tree.c[0] - 100, tree.c[2] - 100) <= 12.001);
  assert.ok(!roofs.blocks(tree.c[0], tree.c[2], 4));
  assert.deepEqual(untouched.c, [135, 8.88, 100]);
});

test('open town plots keep two spaced trees, a fully paved block stays open, winter keeps the species', () => {
  const grass = new Uint8Array(128 * 128).fill(8);
  const a = new VillagePlantClearance(9),
    b = new VillagePlantClearance(9);
  const town = { px: 207, py: 213, natureArchive: 506, blocks: [{ x: 0, y: 0 }], origin: [256, 0, 256], archiveOf: (n) => n + 1, blocked: () => false };
  const plant = () => {
    const log = [];
    selectVillageTrees(log, a, b, null, null, grass, () => 3, town);
    return log;
  };
  const found = plant();
  assert.equal(found.length, 2);
  assert.ok(found.every((f) => f.planted === town.natureArchive && f.archive === f.planted + 1));
  assert.deepEqual(found, plant());
  assert.ok(Math.hypot(found[0].c[0] - found[1].c[0], found[0].c[2] - found[1].c[2]) >= 17);
  grass.fill(46 << 2);
  assert.deepEqual(plant(), []);
});

test('only the two study crowns have cutout artwork and the bole stays opaque in both seasons', () => {
  const ink = bytesOf('../../src/assets/trees/helbenar/study.idx');
  const index = JSON.parse(bytesOf('../../vendor/low-poly-trees/Trees/trees.json'));
  const library = addVillageTreeLibrary(index, bytesOf('../../vendor/low-poly-trees/Trees/trees.bin'),
    bytesOf('../../src/assets/trees/helbenar/trees.bin'));
  assert.equal(library.json.atlases['helbenar-woodland'].alpha, false);
  for (const season of ['', '-winter']) {
    const name = 'helbenar-woodland-study' + season;
    assert.equal(library.json.atlases[name].alpha, true);
    const atlas = villageTreePicture(name, ink);
    for (const offset of [0, 128]) {
      let holes = 0;
      for (let y = 0; y < atlas.height; y++)
        for (let x = offset; x < offset + 128; x++) {
          const alpha = atlas.data[(y * atlas.width + x) * 4 + 3];
          if (y >= 128) assert.equal(alpha, 255);
          else if (!alpha) holes++;
        }
      assert.ok(holes > 0 && holes < 128 * 128 / 2);
    }
  }
});

test('the additional woodland binds every remaining tree record to its own near mesh and far picture', async () => {
  const shipped = '../../src/assets/trees/helbenar/';
  const stock = '../../vendor/low-poly-trees/Trees/';
  const index = JSON.parse(bytesOf(stock + 'trees.json'));
  const manifest = JSON.parse(bytesOf(shipped + 'woodland.json'));
  const added = addVillageTreeLibrary(index, bytesOf(stock + 'trees.bin'), bytesOf(shipped + 'trees.bin'),
    await unpackWoodlandMesh(bytesOf(shipped + 'woodland.mesh.gz')));
  const trees = readLowPolyTrees(added.json, added.data, new Uint8Array());
  const ink = bytesOf(shipped + 'woodland.idx');
  const picture = new Map();
  const seen = new Set();
  for (const [archive, records] of Object.entries(TREE_RECORDS)) {
    for (const record of records) {
      const key = `${archive}_${record}`;
      const summer = trees.protos.get(key + '_helbenar');
      assert.ok(summer, key);
      assert.equal(trees.protos.get(key)?.mesh, index.prefabs[key]?.mesh);
      if (Number(archive) >= 504) assert.ok(trees.protos.get(`${Number(archive) + 1}_${record}_helbenar`));
    }
  }
  for (const [key, model] of Object.entries(manifest.records)) {
    const tree = trees.protos.get(key.replace(':', '_') + '_helbenar');
    assert.equal(trees.meshes[tree.mesh].name, manifest.meshes[model].name);
    if (seen.has(tree.mesh)) continue;
    seen.add(tree.mesh);
    const atlas = tree.subs[0].atlas;
    assert.ok(atlas.includes('-canopy'));
    if (!picture.has(atlas)) picture.set(atlas, villageTreePicture(atlas, null, ink));
    const far = renderImpostor(trees, tree, () => picture.get(atlas));
    assert.ok(far.width > 3 && far.height > 20 && far.data.some((value, at) => at % 4 === 3 && value === 255), key);
  }
  assert.equal(seen.size, manifest.meshes.length);
  assert.notEqual(villageTreeForm(506, 15), villageTreeForm(507, 15));
  assert.equal(villageTreeForm(506, 14), villageTreeForm(507, 14));
  assert.equal(villageTreeLitter(510, 11), 2);
  assert.equal(villageTreeLitter(510, 16), 1);
});
