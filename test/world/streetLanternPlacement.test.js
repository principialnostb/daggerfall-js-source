import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBlockFlats } from '../../src/world/rmbFlats.js';
import { collectCityLights, fillLanternPool, nearestLights } from '../../src/world/city/cityLights.js';
import { streetRoadYaw, streetLanternCenter, streetLanternYaw, placeStreetLight, streetLightPosition, STREET_LANTERN_GLOW } from '../../src/world/streetLanternPlacement.js';
import { rememberCampfireBatch, drawCampfireBillboards, releaseCampfireBatch } from '../../src/render/campfireBillboards.js';
import { transformPoint } from '../../src/world/mat4.js';
import { countMorrowindArchives } from '../../src/scenes/dataSource.js';
import { lightIdOf } from '../../src/render/lightId.js';

const close = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-5, `${a} != ${b}`));
function block(roadCol, roadRow) {
  const groundTiles = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ textureRecord: 2 })));
  if (roadCol >= 0) groundTiles[roadCol][roadRow].textureRecord = 46;
  return { rmbBlock: {
    miscFlatObjectRecords: [{ textureArchive: 210, textureRecord: 14, xPos: 1920, yPos: -40, zPos: -1920 }],
    subRecords: [],
    fldHeader: { groundData: { groundTiles, groundScenery: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ textureRecord: 0 }))) } },
  } };
}

test.before(async () => {
  const previous = globalThis.indexedDB;
  const request = result => { const req = { result }; queueMicrotask(() => req.onsuccess?.()); return req; };
  globalThis.indexedDB = { open: () => request({ transaction: () => ({ objectStore: () => ({ getAllKeys: () => request(['Morrowind.bsa']) }) }) }) };
  try { await countMorrowindArchives(); }
  finally { if (previous) globalThis.indexedDB = previous; else delete globalThis.indexedDB; }
});

test('road-facing post uses all four compass directions and the RMB row flip', () => {
  for (const [col, row, yaw] of [[10, 7, 0], [4, 7, 180], [7, 4, -90], [7, 10, 90]]) {
    const b = block(col, row), flat = collectBlockFlats(b, 504)[0];
    assert.equal(streetRoadYaw(b, flat.x, flat.z), yaw);
    assert.equal(streetLanternYaw(flat), yaw);
  }
  assert.equal(streetRoadYaw(block(-1), 48, 54.4), 0);
});

test('actual billboard draw, point light and glow share the rotated housing centre', () => {
  for (const [col, row] of [[10, 7], [4, 7], [7, 4], [7, 10]]) {
    const b = block(col, row), flat = collectBlockFlats(b, 504)[0];
    const h = 4.415, light = collectCityLights(b, () => ({ w: 1, h }))[0];
    const shift = [300, 12, -500], lift = .24;
    const center = streetLanternCenter(flat, [flat.x + shift[0], flat.y + shift[1] + lift, flat.z + shift[2]]);
    const source = placeStreetLight(light, [light.x + shift[0], light.y + shift[1], light.z + shift[2]], lift);
    const batch = rememberCampfireBatch({ archive: 210, record: 14, vao: {}, size: { w: 1, h } }, [center]);
    const draws = [];
    const r = { createMesh: m => m, uploadTexture() {}, drawMesh: (...args) => draws.push(args), destroyMesh() {}, releaseTexture() {} };
    assert.deepEqual(drawCampfireBillboards(r, [batch], 0), []);
    assert.equal(draws.length, 1);
    const housing = transformPoint(draws[0][1], ...STREET_LANTERN_GLOW);
    close(housing, streetLightPosition(source, true));
    close(streetLightPosition(source, false), [light.x + shift[0], light.y + shift[1], light.z + shift[2]]);
    assert.equal(lightIdOf(source), lightIdOf(streetLightPosition(source, true)));
    const pool = [], floating = [1000, 20, -2000];
    fillLanternPool([{ px: 1200, py: 500, lights: [source] }], () => floating, pool, new Float32Array(1), new Float32Array([18]));
    close([pool[0].x, pool[0].y, pool[0].z], housing.map((v, i) => v + floating[i]));
    const standalone = placeStreetLight(light, { x: light.x + shift[0], y: light.y + shift[1], z: light.z + shift[2] }, lift);
    close(Array.from(nearestLights([standalone], [0, 0, 0])).slice(0, 3), housing);
    releaseCampfireBatch(batch);
  }
});

test('other lights and empty metadata keep their original coordinates', () => {
  const b = block(10, 7); b.rmbBlock.miscFlatObjectRecords[0].textureRecord = 21;
  const source = collectCityLights(b, () => ({ w: 1, h: 3 }))[0], pos = [1, 2, 3];
  assert.equal(placeStreetLight(source, pos), pos);
  assert.equal(streetLightPosition(pos, true), pos);
  assert.equal(streetLanternCenter(null, pos), pos);
});
