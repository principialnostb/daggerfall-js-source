import { getPref } from '../systems/uiPrefs.js';
// Shared camp presentation; the pool owns its lease, the renderer owns the cache.
import { CAMPFIRE_ARCHIVE, CAMPFIRE_FRAMES, CAMPFIRE_SCALE, campfirePaint, buildCampfireBody, buildCampfireFlame } from '../world/campfireModel.js';
import { trs, multiply } from '../world/mat4.js';
import { transformedAabb } from '../render/frustum.js';
import { DECOR_DRAW } from './decor/decorRoom.js';
import {conformCampBody} from '../world/campfireGround.js';
import {drawCampPixelBody} from './campfirePixelBody.js';
import {drawCampPixelFlame} from './campfirePixelFlame.js';

const caches = new WeakMap();
const flameBounds = [-.8,0,-.8,.8,1.8,.8].map(v=>v*CAMPFIRE_SCALE);
const records = [0,1,2,3,4,5,6,7,8,9];
export const canDrawCampfire = (r) => getPref('enhancedCampfire') !== false && !!(r?.createMesh && r?.uploadTexture && r?.drawMesh);
export const campfirePulse = (time,seed=0) => .97+.02*Math.sin(time*5.1+seed)+.01*Math.sin(time*8.9+seed);

function acquire(r) {
  let cache = caches.get(r);
  if (!cache) {
    const meshes = [], frames = [];
    for (const record of records) {
      const paint = campfirePaint(record);
      r.uploadTexture(CAMPFIRE_ARCHIVE, record, paint);
      if (record >= 5 && record <= 8) r.uploadEmissionTexture?.(CAMPFIRE_ARCHIVE, record, paint, {white:true});
      if(record === 4){
        const colors = new Uint8ClampedArray(paint.colors.length);
        for(let at=0;at<colors.length;at+=4)if(paint.colors[at]>150)colors.set(paint.colors.subarray(at,at+4),at);
        r.uploadEmissionTexture?.(CAMPFIRE_ARCHIVE,record,{...paint,colors},{white:true});
      }
    }
    const cpu = buildCampfireBody();
    const body = r.createMesh(cpu);
    body.pixelKind='objects';
    // A material view shares the body's VAO/buffers; only the owning body is freed.
    const coldBody = {...body,subMeshes:body.subMeshes.map(s=>({...s,textureRecord:s.textureRecord===4?9:s.textureRecord}))};
    meshes.push(body);
    for (let i = 0; i < CAMPFIRE_FRAMES; i++) {
      const f = ['core','middle','outer'].map(layer=>{const mesh=r.createMesh(buildCampfireFlame(i,layer));mesh.pixelKind='effect';return mesh;});
      frames.push(f); meshes.push(...f);
    }
    cache = { users: 0, cpu, body, coldBody, frames, meshes };
    caches.set(r, cache);
  }
  cache.users++;
  return cache;
}

/** Deck scale belongs to the boat, never to the metre-sized camp. */
export function campfireMatrix(c) {
  const p = c.rec.pos, yaw = (c.rec.yaw ?? 0) * 180 / Math.PI;
  if (!c.deckM || !c.rec.deck) return trs(...p, 0, yaw, 0);
  const m = c.deckM, out = new Float32Array(16);
  for (let k = 0; k < 3; k++) {
    const n = Math.hypot(m[k * 4], m[k * 4 + 1], m[k * 4 + 2]) || 1;
    for (let i = 0; i < 3; i++) out[k * 4 + i] = m[k * 4 + i] / n;
  }
  out[12] = p[0]; out[13] = p[1]; out[14] = p[2]; out[15] = 1;
  return multiply(out, trs(0, 0, 0, 0, (c.rec.deck.yaw ?? 0) * 180 / Math.PI, 0));
}

export function createCampfireVisual(renderer, ground = null) {
  let cache = null;
  const fitted = new Map();
  function release(c){const old=fitted.get(c);if(old?.gpu)renderer.destroyMesh?.(old.gpu);fitted.delete(c);}
  function bodyOf(c,time){
    if(!ground||c.rec.deck)return {hot:cache.body,cold:cache.coldBody};
    const key=[...c.rec.pos,c.rec.yaw??0].join(',');let entry=fitted.get(c);
    if(entry?.key===key&&time<entry.retry)return entry;
    release(c);
    entry={key,retry:time+1,hot:cache.body,cold:cache.coldBody};
    const heights=ground(c);
    if(heights){
      entry.retry=Infinity;
      if(heights.some(y=>Math.abs(y-c.rec.pos[1])>.003)){
        entry.gpu=renderer.createMesh(conformCampBody(cache.cpu,heights,c.rec.pos[1]));
        entry.gpu.pixelKind='objects';
        entry.hot=entry.gpu;
        entry.cold={...entry.gpu,subMeshes:entry.gpu.subMeshes.map(s=>({...s,textureRecord:s.textureRecord===4?9:s.textureRecord}))};
      }
    }
    fitted.set(c,entry);return entry;
  }
  return {
    release,
    invalidateGround(){for(const c of fitted.keys())release(c);},
    draw(c, lit, time = performance.now() / 1000, cull = null, stage = 'all') {
      cache ??= acquire(renderer);
      const m = campfireMatrix(c);
      const box = cull ? transformedAabb(flameBounds, m) : null;
      const body=stage==='glow'?null:bodyOf(c,time);
      const visible = stage === 'glow' ? (!cull || cull(box)===DECOR_DRAW) : drawCampPixelBody(renderer, cull, box, lit ? body.hot : body.cold, m);
      if (lit && visible) {
        const phase = Math.abs(Math.floor((c.rec.pos[0] + c.rec.pos[2]) * 11));
        const frame = (Math.floor(time*12 + .45*Math.sin(time*1.7)) + phase) % CAMPFIRE_FRAMES;
        const [core,middle,outer] = cache.frames[frame];
        if(stage!=='glow') drawCampPixelFlame(renderer,core,m);
        if(stage!=='body'){
          drawCampPixelFlame(renderer,middle,m,.47);
          drawCampPixelFlame(renderer,outer,m,.26);
        }
      }
    },
    destroy() {
      for(const c of fitted.keys())release(c);
      if (!cache) return;
      const old = cache; cache = null;
      if (--old.users) return;
      caches.delete(renderer);
      for (const mesh of old.meshes) renderer.destroyMesh?.(mesh);
      for (const record of records) {
        renderer.releaseTexture?.(CAMPFIRE_ARCHIVE, record);
        if (record >= 4 && record <= 8) renderer.evictEmissionTexture?.(`${CAMPFIRE_ARCHIVE}_${record}`);
      }
    },
  };
}

/** Keeps the dungeon hosts' existing single pass call, with its pool's mesh seam. */
export function drawCampScene(renderer, context, batches, right, up) {
  context.camps?.draw(renderer);
  context.camps?.drawFlames?.();
  renderer.drawBillboards(batches, right, up);
}

export function drawCampWorldFx(camps,fx){
  camps.drawFlames?.();
  fx.drawFx?.();
}
