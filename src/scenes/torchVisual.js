import { buildFixtureCeilingLink, buildLightFixture, FIXTURE_PAINT, fixtureEmits, fixturePaint } from '../world/lightFixtureModel.js';
import { buildTorchBracket, buildTorchBody, TORCH_ARCHIVE } from '../world/torchModel.js';
import { campfirePaint, CAMPFIRE_FRAMES } from '../world/campfireModel.js';
import { campfireLayerGeometry } from '../world/campfireFlameCache.js';
import { transformPoint, trs } from '../world/mat4.js';
import { drawCampPixelFlame, drawCampPixelFlameShells } from './campfirePixelFlame.js';
import { createGothicLantern, usesGothicLantern } from '../world/gothicLantern.js';
import { TORCH_COLLAR_Y } from '../world/torchMount.js';
import { createClassicStreetLantern, usesClassicStreetLantern } from '../world/classicStreetLantern.js';

const WALL_TORCH_TILT = 18;
const caches = new WeakMap();

function emits(record) {
  return fixtureEmits(record) || (record >= 5 && record <= 8);
}

function uploadMesh(renderer, cache, model, pixelKind) {
  for (const { textureRecord } of model.subMeshes) {
    if (cache.painted.has(textureRecord)) continue;
    const paint = FIXTURE_PAINT.has(textureRecord) ? fixturePaint(textureRecord) : campfirePaint(textureRecord);
    renderer.uploadTexture(TORCH_ARCHIVE, textureRecord, paint);
    if (emits(textureRecord)) renderer.uploadEmissionTexture?.(TORCH_ARCHIVE, textureRecord, paint, { white: true });
    cache.painted.add(textureRecord);
  }
  const mesh = renderer.createMesh(model);
  mesh.pixelKind = pixelKind;
  cache.meshes.push(mesh);
  return mesh;
}

function flameLayer(renderer, cache, frame, layer) {
  const layers = cache.frames[frame] ??= {};
  if (!layers[layer]) {
    const source = campfireLayerGeometry(frame, layer);
    // Camps and torches share animated vertices and indices but use separate texture archives.
    const model = {
      ...source,
      subMeshes: source.subMeshes.map(part => ({ ...part, textureArchive: TORCH_ARCHIVE })),
      slots: source.slots.map(slot => ({ ...slot, archive: TORCH_ARCHIVE })),
    };
    layers[layer] = uploadMesh(renderer, cache, model, 'effect');
  }
  return layers[layer];
}

function prepareFlameLayer(renderer, cache, layer) {
  if (cache.frames[CAMPFIRE_FRAMES - 1]?.[layer]) return;
  for (let frame = 0; frame < CAMPFIRE_FRAMES; frame++) flameLayer(renderer, cache, frame, layer);
}

function getFixture(renderer, cache, record) {
  if (usesClassicStreetLantern(record)) {
    cache.street ??= createClassicStreetLantern(renderer);
    return cache.street;
  }
  if (usesGothicLantern(record)) {
    cache.gothic ??= createGothicLantern(renderer);
    return record === 12 ? cache.gothic.dark : cache.gothic.lit;
  }
  if (!cache.fixtures.has(record)) {
    const { mesh, flames } = buildLightFixture(record);
    const gpu = uploadMesh(renderer, cache, mesh, 'objects');
    cache.fixtures.set(record, { mesh: gpu, flames });
  }
  return cache.fixtures.get(record);
}

// The pendant sprite includes its chain. Keep the body at a physical size
// and spend the remaining authored height on suspension.
const PENDANT_MODEL_HEIGHT = 1.05;

function drawFixture(renderer, cache, fixture, pos, height, frame, ceilingGap, street, yaw) {
  if (fixture.drawSuspension) {
    const extra = ceilingGap + height - PENDANT_MODEL_HEIGHT;
    if (extra < 0) pos = [pos[0], pos[1] + extra, pos[2]];
    ceilingGap = Math.max(0, extra);
    height = PENDANT_MODEL_HEIGHT;
  }
  const model = trs(...pos, 0, yaw, 0, height, height, height);
  renderer.drawMesh(street ? fixture.mesh : fixture.single ?? fixture.mesh, model, null, { noShadow: true });
  if (fixture.drawSuspension) {
    fixture.drawSuspension(pos, height, ceilingGap);
  } else if (ceilingGap > .005) {
    const link = trs(pos[0], pos[1] + height, pos[2], 0, 0, 0, height, ceilingGap, height);
    cache.ceiling ??= uploadMesh(renderer, cache, buildFixtureCeilingLink(), 'objects');
    renderer.drawMesh(cache.ceiling, link, null, { noShadow: true });
  }
  for (const flame of fixture.flames) {
    const at = flame.at.map((v, i) => v * height + pos[i]);
    const size = flame.scale * height;
    const model = trs(at[0], at[1] - .12 * size, at[2], 0, 0, 0, size, size, size);
    drawCampPixelFlame(renderer, cache.frames[frame].core, model);
    if (flame.broad) {
      drawCampPixelFlameShells(renderer, cache.frames[frame].middle, cache.frames[frame].outer, model);
    }
  }
  if (fixture.pane) renderer.drawMesh(fixture.pane, model, null, { translucent: .42, noShadow: true });
}

export function createTorchVisual(r, kind) {
  let cache = caches.get(r);
  if (!cache) {
    cache = { users: 0, meshes: [], bodies: new Map(), frames: [], fixtures: new Map(), painted: new Set() };
    caches.set(r, cache);
  }
  const fixture = typeof kind === 'number' ? getFixture(r, cache, kind) : null;
  let torchBody;
  if (!fixture) {
    torchBody = cache.bodies.get(kind);
    if (!torchBody) {
      torchBody = uploadMesh(r, cache, buildTorchBody(kind), 'objects');
      cache.bodies.set(kind, torchBody);
    }
  }
  if (!fixture || fixture.flames.length) {
    prepareFlameLayer(r, cache, 'core');
    if (!fixture || fixture.flames.some(flame => flame.broad)) {
      prepareFlameLayer(r, cache, 'middle');
      prepareFlameLayer(r, cache, 'outer');
    }
  }
  cache.users++;
  let dead=false;
  return {
    draw(pos, height, time, mount = null, origin = [0, 0, 0], ceilingGap = 0, street = false, yaw = 0) {
      const h = height || 1;
      const phase = Math.abs(Math.floor((pos[0] + pos[2]) * 11));
      const frame = ((Math.floor(time * 12) + phase) % CAMPFIRE_FRAMES + CAMPFIRE_FRAMES) % CAMPFIRE_FRAMES;
      if (fixture) {
        drawFixture(r, cache, fixture, pos, h, frame, ceilingGap, street, yaw);
        return;
      }
      if (mount) {
        const wall = mount.wall.map((value, axis) => value + origin[axis]);
        const matrix = trs(...wall, 0, mount.yaw, 0, h, h, mount.depth);
        cache.bracket ??= uploadMesh(r, cache, buildTorchBracket(), 'objects');
        r.drawMesh(cache.bracket, matrix, null, { noShadow: true });
        pos = mount.base.map((value, axis) => value + origin[axis]);
      }
      const body = trs(...pos, mount ? WALL_TORCH_TILT : 0, mount?.yaw ?? 0, 0, h, h, h);
      if (mount) {
        // Rotate about the collar held by the bracket.
        body[12] -= TORCH_COLLAR_Y * body[4];
        body[13] += TORCH_COLLAR_Y * (h - body[5]);
        body[14] -= TORCH_COLLAR_Y * body[6];
      }
      r.drawMesh(torchBody, body, null, { noShadow: true });
      // Camp tongues are narrowed and seated in the torch cup; their animation is shared.
      const cup = transformPoint(body, 0, .74, 0);
      const m = trs(...cup, 0, 0, 0, .36*h, .40*h, .36*h);
      const { core, middle, outer } = cache.frames[frame];
      drawCampPixelFlame(r, core, m);
      drawCampPixelFlameShells(r, middle, outer, m);
    },
    destroy() {
      if(dead)return;dead=true;
      if(--cache.users)return;
      caches.delete(r);
      cache.gothic?.destroy();
      cache.street?.destroy();
      for(const mesh of cache.meshes)r.destroyMesh?.(mesh);
      for (const record of cache.painted) {
        r.releaseTexture?.(TORCH_ARCHIVE, record);
        if (emits(record)) r.evictEmissionTexture?.(`${TORCH_ARCHIVE}_${record}`);
      }
    },
  };
}
