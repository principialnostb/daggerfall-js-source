import { buildFixtureCeilingLink, buildLightFixture, FIXTURE_PAINT, fixtureEmits, fixturePaint } from '../world/lightFixtureModel.js';
import { buildTorchBracket, buildTorchBody, TORCH_ARCHIVE } from '../world/torchModel.js';
import { campfirePaint, buildCampfireFlame, CAMPFIRE_FRAMES } from '../world/campfireModel.js';
import { transformPoint, trs } from '../world/mat4.js';
import { drawCampPixelFlame, drawCampPixelFlameShells } from './campfirePixelFlame.js';
import { createGothicLantern, usesGothicLantern } from '../world/gothicLantern.js';
import { TORCH_COLLAR_Y } from '../world/torchMount.js';
import { createClassicStreetLantern, usesClassicStreetLantern } from '../world/classicStreetLantern.js';

const WALL_TORCH_TILT = 18;
const caches = new WeakMap();

function getFixture(renderer, cache, record) {
  if (!cache.ceiling) {
    for (const material of FIXTURE_PAINT.keys()) {
      const paint = fixturePaint(material);
      renderer.uploadTexture(TORCH_ARCHIVE, material, paint);
      if (fixtureEmits(material)) renderer.uploadEmissionTexture?.(TORCH_ARCHIVE, material, paint, { white: true });
    }
    cache.ceiling = renderer.createMesh(buildFixtureCeilingLink());
    cache.ceiling.pixelKind = 'objects';
    cache.meshes.push(cache.ceiling);
  }
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
    const gpu = renderer.createMesh(mesh);
    gpu.pixelKind = 'objects';
    cache.meshes.push(gpu);
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
    renderer.drawMesh(cache.ceiling, link, null, { noShadow: true });
  }
  for (const flame of fixture.flames) {
    const at = flame.at.map((v, i) => v * height + pos[i]);
    const size = flame.scale * height;
    const model = trs(at[0], at[1] - .12 * size, at[2], 0, 0, 0, size, size, size);
    const layers = cache.frames[frame];
    drawCampPixelFlame(renderer, layers[0], model);
    if (flame.broad) drawCampPixelFlameShells(renderer, layers[1], layers[2], model);
  }
  if (fixture.pane) renderer.drawMesh(fixture.pane, model, null, { translucent: .42, noShadow: true });
}

export function createTorchVisual(r, kind) {
  let cache=caches.get(r);
  if(!cache) {
    const meshes=[], bodies=new Map(), frames=[];
    for(const record of [1,3,4,5,6,7,8]) {
      const paint=campfirePaint(record);
      r.uploadTexture(TORCH_ARCHIVE,record,paint);
      if(record>=5)r.uploadEmissionTexture?.(TORCH_ARCHIVE,record,paint,{white:true});
    }
    for(const name of ['pole','wood','iron','cage','poleIron']) {
      const mesh=r.createMesh(buildTorchBody(name));mesh.pixelKind='objects';bodies.set(name,mesh);meshes.push(mesh);
    }
    const bracket = r.createMesh(buildTorchBracket());
    bracket.pixelKind = 'objects';
    meshes.push(bracket);
    for(let frame=0;frame<CAMPFIRE_FRAMES;frame++) {
      const layers=['core','middle','outer'].map(layer=>{
        const m=buildCampfireFlame(frame,layer);
        m.subMeshes=m.subMeshes.map(s=>({...s,textureArchive:TORCH_ARCHIVE}));
        m.slots=m.slots.map(s=>({...s,archive:TORCH_ARCHIVE}));
        const mesh=r.createMesh(m);mesh.pixelKind='effect';meshes.push(mesh);return mesh;
      });
      frames.push(layers);
    }
    cache={users:0,meshes,bodies,frames,bracket,fixtures:new Map(),ceiling:null,gothic:null};caches.set(r,cache);
  }
  const fixture = typeof kind === 'number' ? getFixture(r, cache, kind) : null;
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
      r.drawMesh(cache.bodies.get(kind), body, null, { noShadow: true });
      // Camp tongues are narrowed and seated in the torch cup; their animation is shared.
      const cup = transformPoint(body, 0, .74, 0);
      const m = trs(...cup, 0, 0, 0, .36*h, .40*h, .36*h);
      const [core, middle, outer] = cache.frames[frame];
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
      if (cache.ceiling) for (const record of FIXTURE_PAINT.keys()) {
        r.releaseTexture?.(TORCH_ARCHIVE, record);
        if (fixtureEmits(record)) r.evictEmissionTexture?.(`${TORCH_ARCHIVE}_${record}`);
      }
      for(const record of [1,3,4,5,6,7,8]) {
        r.releaseTexture?.(TORCH_ARCHIVE,record);
        if(record>=5)r.evictEmissionTexture?.(`${TORCH_ARCHIVE}_${record}`);
      }
    },
  };
}
