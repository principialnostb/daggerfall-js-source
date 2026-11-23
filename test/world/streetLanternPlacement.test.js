import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBlockFlats } from '../../src/world/rmbFlats.js';
import { collectCityLights, fillLanternPool, nearestLights } from '../../src/world/city/cityLights.js';
import { groundKindsOf } from '../../src/world/terrain/groundEdge.js';
import { convertTile } from '../../src/world/terrain/terrainSurface.js';
import { layoutTownFlats, layoutTownLights, townLanternRoadSurface } from '../../src/world/townLanternLayout.js';
import { groupFlats } from '../../src/scenes/pixelBuild.js';
import { placeStreetLight, streetHousingLights, STREET_LANTERN_GLOWS } from '../../src/world/streetLanternPlacement.js';
import { rememberCampfireBatch, drawCampfireBillboards, releaseCampfireBatch } from '../../src/render/campfireBillboards.js';
import { transformPoint } from '../../src/world/mat4.js';
import { countMorrowindArchives } from '../../src/scenes/dataSource.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import { lightIdOf } from '../../src/render/lightId.js';

const close = (a, b, epsilon = 1e-5) => {
  assert.equal(a.length, b.length);
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < epsilon, `${a} != ${b}`));
};
function block(record = 14) {
  const groundData = { groundScenery: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ textureRecord: 0 }))) };
  Object.defineProperty(groundData, 'groundTiles', { configurable: true, get() { throw new Error('street lantern read road tiles'); } });
  return { rmbBlock: {
    miscFlatObjectRecords: [{ textureArchive: 210, textureRecord: record, xPos: 1920, yPos: -40, zPos: -1920 }],
    subRecords: [],
    fldHeader: { groundData },
  } };
}

test.before(async () => {
  const previous = globalThis.indexedDB;
  const request = result => { const req = { result }; queueMicrotask(() => req.onsuccess?.()); return req; };
  globalThis.indexedDB = { open: () => request({ transaction: () => ({ objectStore: () => ({ getAllKeys: () => request(['Morrowind.bsa']) }) }) }) };
  try { await countMorrowindArchives(); }
  finally { if (previous) globalThis.indexedDB = previous; else delete globalThis.indexedDB; }
});

test('street draw and both city-light paths put two lights in the fixed housings without reading roads', () => {
  const b = block(), flat = collectBlockFlats(b, 504)[0];
  const h = 4.415, light = collectCityLights(b, () => ({ w: 1, h }))[0];
  const shift = [300, 12, -500], lift = .24;
  const center = [flat.x + shift[0], flat.y + shift[1] + lift, flat.z + shift[2]];
  const { groups } = groupFlats([{ c: center, block: 0, yaw: 90 }, { c: [...center], block: 1 }, { c: [...center] }], [[210, 14], [210, 14], [210, 14]]);
  const source = placeStreetLight({ ...light, yaw: 90 }, [light.x + shift[0], light.y + shift[1], light.z + shift[2]], lift);
  const batch = rememberCampfireBatch({ archive: 210, record: 14, vao: {}, size: { w: 1, h } }, groups.get('210_14'));
  const draws = [];
  const r = { createMesh: m => m, uploadTexture() {}, drawMesh: (...args) => draws.push(args), destroyMesh() {}, releaseTexture() {} };
  assert.deepEqual(drawCampfireBillboards(r, [batch], 0), []);
  assert.equal(draws.length, 3);
  const pane = 2;
  assert.deepEqual(draws.map(([mesh]) => mesh.subMeshes[pane].primitiveCount), [24, 24, 12]);
  const housings = STREET_LANTERN_GLOWS.map(p => transformPoint(draws[0][1], ...p));
  close(housings[0].map((v, i) => v - housings[1][i]), [0, 0, -1.47]);
  const pair = streetHousingLights(source);
  const pool = [], floating = [1000, 20, -2000];
  const filled = fillLanternPool([{ px: 1200, py: 500, lights: [source] }], () => floating, pool, new Float32Array(1), new Float32Array([18]));
  assert.equal(filled.n, 2);
  assert.deepEqual([...filled.ranges.slice(0, filled.n)], [18, 18]);
  assert.notEqual(lightIdOf(pool[0]), lightIdOf(pool[1]));
  for (let i = 0; i < 2; i++) {
    close(pair[i], housings[i]);
    close([pool[i].x, pool[i].y, pool[i].z], housings[i].map((v, j) => v + floating[j]));
    assert.equal(lightIdOf(pool[i]), lightIdOf(pair[i]));
  }
  const standalone = placeStreetLight({ ...light, yaw: 90 }, { x: source[0], y: source[1], z: source[2] }, lift);
  const nearest = nearestLights([standalone], center, 2, new Float32Array([21]), () => [1, .7, .4]);
  close([...nearest.data], [...housings[0], 21, ...housings[1], 21].map(Math.fround), 4e-5);
  close([...nearest.colors], [1, .7, .4, 1, .7, .4]);
  const cap = nearestLights([standalone], housings[1], 1, 21);
  close([...cap], [...housings[1], 21].map(Math.fround), 4e-5);
  assert.equal(cap.ids[0], nearest.data.ids[1]);
  releaseCampfireBatch(batch);
});

test('classic sprites keep one authored light and other fixtures are unchanged', () => {
  const getSize = () => ({ w: 1, h: 3 });
  const light = collectCityLights(block(), getSize)[0];
  const target = placeStreetLight(light, { x: light.x, y: light.y, z: light.z });
  const other = collectCityLights(block(21), getSize)[0], pos = [1, 2, 3];
  assert.equal(placeStreetLight(other, pos), pos);
  assert.equal(streetHousingLights(pos), undefined);
  setPref('enhancedCampfire', false);
  try {
    assert.deepEqual([...nearestLights([target], [0, 0, 0])], [light.x, light.y, light.z, 18].map(Math.fround));
    const entry = placeStreetLight(light, [1, 2, 3]);
    const pool = [];
    assert.equal(fillLanternPool([{ px: 0, py: 0, lights: [entry] }], () => [0, 0, 0], pool, new Float32Array(1), [18]).n, 1);
    assert.deepEqual(pool[0], { x: 1, y: 2, z: 3 });
  } finally { setPref('enhancedCampfire', true); }
});

test('town posts follow dry road edges and elevated posts also lose their lights', () => {
  const b = block();
  const { fldHeader, miscFlatObjectRecords } = b.rmbBlock;
  Object.defineProperty(fldHeader.groundData, 'groundTiles', { value: Array.from({ length: 16 }, () =>
    Array.from({ length: 16 }, (_, row) => ({ textureRecord: row === 7 ? 46 : 2 }))) });
  const anchor = miscFlatObjectRecords[0];
  miscFlatObjectRecords.push({ ...anchor, yPos: -137 }, { ...anchor, textureRecord: 21 });
  const flats = collectBlockFlats(b, 504);
  const laid = layoutTownFlats(b, flats);
  const lights = layoutTownLights(laid, collectCityLights(b, () => ({ w: 1, h: 4.415 })));
  assert.deepEqual(laid.map(f => [f.record, f.hiddenStreetLantern ?? false]), [[14, false], [14, true], [21, false]]);
  assert.equal(laid[0].yaw, 90);
  assert.ok(laid[0].z < 51.2 || laid[0].z >= 57.6);
  assert.deepEqual(lights.map(l => l.record), [14, 21]);
  close([lights[0].x, lights[0].foot - .15, lights[0].z], [laid[0].x, laid[0].y, laid[0].z]);
  assert.equal(lights[0].yaw, 90);
  for (const tile of fldHeader.groundData.groundTiles) tile[7].textureRecord = 1;
  const dirt = layoutTownFlats(b, flats);
  close([dirt[0].x, dirt[0].y, dirt[0].z, dirt[0].yaw], [laid[0].x, laid[0].y, laid[0].z, laid[0].yaw]);
  const flooded = layoutTownFlats(b, flats, null, null, 0, 0, () => true);
  assert.equal(flooded[0].hiddenStreetLantern, true);
  const blocked = layoutTownFlats(b, flats, () => true);
  assert.deepEqual(blocked.map(f => f.hiddenStreetLantern ?? false), [true, true, false]);
  assert.deepEqual(layoutTownLights(blocked, lights).map(l => l.record), [21]);
});

test('the streamed placement clears a rendered dirt road and its blended shoulder', () => {
  const b = block();
  Object.defineProperty(b.rmbBlock.fldHeader.groundData, 'groundTiles', { value:
    Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ textureRecord: 2 }))) });
  const bytes = new Uint8Array(128 * 128).fill(convertTile(2));
  const paths = new Uint8Array(bytes.length);
  paths.fill(1, 6 * 128, 7 * 128);
  bytes.fill(convertTile(1), 7 * 128, 10 * 128);
  const shoulder = Array.from({ length: 256 }, (_, i) => i).find(i => {
    const k = groundKindsOf(i);
    return k?.a === 2 && k.b === 1 && k.mask === 3;
  });
  assert.ok(shoulder != null);
  bytes.fill(shoulder, 10 * 128, 11 * 128);
  const road = townLanternRoadSurface(bytes, paths);
  assert.equal(road(48, 64.8), true);
  assert.equal(road(48, 69.8), false);
  const flats = collectBlockFlats(b, 504);
  assert.equal(road(flats[0].x, flats[0].z), true);
  const [post] = layoutTownFlats(b, flats, null, null, 0, 0, null, road);
  assert.equal(post.hiddenStreetLantern, undefined);
  assert.equal(post.yaw, 90);
  assert.equal(road(post.x, post.z), false);
  assert.equal(road(post.x, post.z - .45), false);
  assert.equal(road(post.x, post.z + .45), false);
});