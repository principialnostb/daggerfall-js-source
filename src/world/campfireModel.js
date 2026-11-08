// HEARTH-3D: original DFO geometry and pixel paint, metres, +Y up, foot at zero.
// Deliberate departure from DFU DaggerfallBillboard.SetMaterial/Update:
// a fire has a fixed body and volumetric tongues, never a camera-facing picture.
import { MeshBench, prism, box } from './ships/galleonMesh.js';
import { dfLook, lookSeed } from './dfLook.js';

export const CAMPFIRE_ARCHIVE = 38341;
export const CAMPFIRE_FRAMES = 16;
export const CAMPFIRE_PIXEL = .04;
export const CAMPFIRE_SCALE = .66;
const TAU = Math.PI * 2;
function finish(b) {
  const m = b.finish();
  for(let i=0;i<m.positions.length;i++)m.positions[i]*=CAMPFIRE_SCALE;
  m.aabb.center=m.aabb.center.map(v=>v*CAMPFIRE_SCALE);
  m.aabb.extent=m.aabb.extent.map(v=>v*CAMPFIRE_SCALE);
  m.subMeshes = m.subMeshes.map((s, i) => ({ ...s, textureArchive: m.slots[i].archive, textureRecord: m.slots[i].record }));
  return m;
}
const noise = (x, y, seed) => {
  let n = Math.imul(x + seed * 131, 374761393) ^ Math.imul(y + 17, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Original 32px stone, bark, end grain, ash, charcoal, and flame palettes. */
export function campfirePaint(record) {
  if (record >= 5 && record <= 8) {
    const palette = [[255,123,19], [255,210,66], [255,246,201], [221,63,7]];
    const colors = new Uint8ClampedArray(16*16*4);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const shade = .92 + noise(x>>2,y>>2,record)*.08;
      const alpha = record === 7 ? 255 : record === 6 ? 220 : record === 5 ? 220 : 235;
      colors.set([...palette[record-5].map(v=>Math.round(v*shade)),alpha],(y*16+x)*4);
    }
    return {width:16,height:16,colors};
  }
  const width = record===0?16:32, height = width, colors = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const grain = noise(x, y, record), patch = noise(x >> 2, y >> 2, record);
    let rgb;
    if (record === 0) {
      const v = Math.floor(noise(x>>2,y>>2,11)*4)*4;
      const seam = Math.abs((x+2*y)%13-6)<1 && patch>.6 ? -9 : 0;
      rgb = [77+v+seam,77+v+seam,74+v+seam];
    } else if (record === 1) {
      const ridge = noise(x >> 2, Math.floor(y / 12), 5);
      const v = Math.floor(ridge * 5) * 9;
      rgb = [66 + v, 39 + v * .56, 23 + v * .3];
      if ((x+Math.floor(y/8))%13<2) rgb=[34,22,15];
    } else if (record === 2) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      const ring = Math.floor(d + grain * .7) % 4 === 0;
      rgb = ring ? [83,56,32] : [110+patch*14,74+patch*10,41+patch*7];
      if (d > 12) rgb = [40, 29, 21];
    } else if (record === 3) {
      const v = Math.floor(patch * 5) * 5;
      rgb = [33 + v, 30 + v, 27 + v];
    } else if (record === 4 || record === 9) {
      const crack = record === 4 && ((x+Math.floor(y/7))%11<2 && noise(x>>2,y>>2,9)>.48);
      rgb = crack ? [198,52+patch*35,9] : [26+patch*13,23+patch*11,21+patch*9];
    }
    const at = (y * width + x) * 4;
    colors.set([...rgb.map(Math.round), 255], at);
  }
  return dfLook({ width, height, colors },lookSeed(CAMPFIRE_ARCHIVE,record));
}

function stone(b, cx, cz, angle, seed) {
  const rings = [], sides=5+(seed%3);
  const height = .15 + noise(seed,0,29)*.065;
  const width = .17 + noise(seed,1,29)*.055, thickness = .12 + noise(seed,2,29)*.045;
  const trim = width > .20 || height > .20 ? .88 : 1;
  for (let j = 0; j < 3; j++) {
    const pts = [];
    for (let k = 0; k < sides; k++) {
      const a = k * TAU / sides, rough = .87 + noise(k, j, seed) * .22;
      const x = Math.cos(a) * width * trim * .90 * rough * (j === 2 ? .80 : 1);
      const z = Math.sin(a) * thickness * trim * .78 * rough * (j === 2 ? .80 : 1);
      pts.push([cx + Math.cos(angle) * x - Math.sin(angle) * z,
        j === 0 ? .01 : j === 1 ? height*trim*.38 : (height + noise(k,4,seed)*.025)*trim*.78,
        cz + Math.sin(angle) * x + Math.cos(angle) * z]);
    }
    rings.push(pts);
  }
  for (let j = 0; j < 2; j++) for (let k = 0; k < sides; k++) {
    const n = (k + 1) % sides;
    const p = rings[j][k];
    b.quad(0, p, rings[j][n], rings[j + 1][n], rings[j + 1][k],
      [[0, 0], [1, 0], [1, 1], [0, 1]], [p[0] - cx, 0, p[2] - cz]);
  }
  b.poly(0, rings[2], rings[2].map((_, k) => [.5 + Math.cos(k * TAU / sides) * .5, .5 + Math.sin(k * TAU / sides) * .5]), [0, 1, 0]);
  b.poly(0, rings[0], rings[0].map(() => [0, 0]), [0, -1, 0]);
}

export function buildCampfireBody() {
  const b = new MeshBench(CAMPFIRE_ARCHIVE);
  prism(b, 3, [0, .004, 0], [0, .012, 0], .46, .45, 13);
  for(let k=0;k<16;k++){
    const a=k*2.4,r=.13+(k%4)*.09,chunk=.045+(k%3)*.012;
    prism(b,4,[Math.cos(a)*r,.018,Math.sin(a)*r],[Math.cos(a)*r+.008,.065+(k%3)*.017,Math.sin(a)*r],chunk,chunk*.8,5,{tileV:.13,twist:k*.23});
  }
  for (let k = 0; k < 11; k++) {
    const a = k * TAU / 11 + .045 * Math.sin(k * 3), r = .56 + Math.sin(k * 7) * .045;
    stone(b, Math.cos(a) * r, Math.sin(a) * r, a + Math.PI / 2 + .17*Math.sin(k*3), k + 1);
  }
  for (let k = 0; k < 5; k++) {
    const [a,y,shift,left,right,r0,r1]=[[.22,.12,.03,-.40,.37,.086,.068],[2.02,.135,-.06,-.35,.40,.082,.075],[1.10,.20,.06,-.38,.33,.077,.064],[2.86,.235,-.02,-.31,.36,.081,.067],[.65,.27,-.07,-.27,.32,.075,.059]][k];
    const p = (t, dy = 0) => [Math.cos(a) * t - Math.sin(a) * shift, y + dy, Math.sin(a) * t + Math.cos(a) * shift];
    prism(b, 1, p(left*1.14), p(right*1.14, .025), r0, r1, 7, { capRec: 2, tileV: .8 });
    // Charred centre keeps the exposed sawn ends readable.
    prism(b, 4, p(left*.52, .003), p(right*.55, .018), r0+.004, r1+.006, 7, { tileV: .4 });
  }
  return finish(b);
}

/** Detached tongues have a finite life: grow apart, curl upward, cool and shrink. */
export function campfireFlameState(frame = 0) {
  frame = ((Math.floor(frame) % CAMPFIRE_FRAMES) + CAMPFIRE_FRAMES) % CAMPFIRE_FRAMES;
  return Array.from({length:3}, (_, k) => {
    const age = ((frame + k * 5) % CAMPFIRE_FRAMES) / CAMPFIRE_FRAMES;
    const angle = k * 2.4;
    return {
      age, active: age < .80,
      center: [-.12*Math.sin((frame/CAMPFIRE_FRAMES-age)*TAU)+Math.cos(angle)*.06+Math.sin(age*3+k)*age*.12,
        .89 + age*.53, .10*Math.cos((frame/CAMPFIRE_FRAMES-age)*TAU)+Math.sin(angle)*.06+Math.cos(age*4+k)*age*.10],
      radius: .052 * Math.pow(1-age,.8),
    };
  });
}

/** Exposed faces of a sampled fire volume. No camera basis, cards or inner cube faces. */
export function buildCampfireFlame(frame = 0, layer = 'core') {
  frame = ((Math.floor(frame) % CAMPFIRE_FRAMES) + CAMPFIRE_FRAMES) % CAMPFIRE_FRAMES;
  const b = new MeshBench(CAMPFIRE_ARCHIVE), cells = new Map(), step = CAMPFIRE_PIXEL;
  const phase = frame * TAU / CAMPFIRE_FRAMES, fragments = campfireFlameState(frame);
  const threshold = layer === 'core' ? .16 : layer === 'middle' ? .02 : -.18;
  const key = (x,y,z) => `${x},${y},${z}`;
  for (let iy = 0; iy < 38; iy++) for (let ix = -10; ix <= 10; ix++) for (let iz = -10; iz <= 10; iz++) {
    const x = ix * step, y = .2 + iy * step, z = iz * step;
    let material = -1, depth = -1;
    for (let k = 0; k < 4; k++) {
      const a = k * 2.4, h = (k === 0 ? .85 : .43 + (k % 3) * .08) * (1 + .08 * Math.sin(phase*2 + k));
      const t = (y - .18) / h;
      if (t < 0 || t >= 1) continue;
      const cx = (k ? Math.cos(a)*.15 : -.12*Math.sin(phase)*t*t) + Math.sin(phase+t*5+k)*.065*t;
      const cz = (k ? Math.sin(a)*.13 : .10*Math.cos(phase)*t*t) + Math.cos(phase*3+t*4+k)*.055*t;
      const radius = (k ? .20 : .28) * Math.pow(1-t,.70) * (1 + .13*Math.sin(t*11-phase*2+k));
      const d = 1 - Math.hypot(x - cx,z - cz) / radius;
      if (d <= threshold || d < depth) continue;
      depth = d;
      // Bright broad foot, yellow middle, orange tips; large coherent colour patches.
      const hotHeight = .49-.40*Math.abs(x+.04)-.40*Math.abs(z)+.07*Math.sin(phase+x*11+z*7);
      const hotPatch = y>.24 && y<hotHeight && noise(Math.floor(x/.10),Math.floor(z/.10),2)>.32;
      material = layer === 'core' ? (hotPatch ? 7 : t < .70 ? 6 : 5) : layer === 'middle' ? (t < .55 ? 6 : 5) : (t < .66 ? 5 : 8);
    }
    for (const f of fragments) {
      if (!f.active) continue;
      const t = (y - f.center[1]) / (f.radius * 1.8);
      if (Math.abs(t) > 1) continue;
      const cx = f.center[0] + Math.sin(t * 2) * .065, cz = f.center[2] + t * .035;
      if (Math.hypot(x-cx,z-cz) < f.radius * Math.sqrt(1-t*t) * (1 - t * .4) * (1-threshold)) material = f.age < .3 ? 6 : f.age < .65 ? 5 : 8;
    }
    if (material >= 0) cells.set(key(ix,iy,iz), {ix,iy,iz,x,y,z,material});
  }
  const neighbours = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (const c of cells.values()) {
    const skip = [];
    neighbours.forEach(([dx,dy,dz], i) => { if (cells.has(key(c.ix+dx,c.iy+dy,c.iz+dz))) skip.push(i); });
    if (skip.length < 6) box(b,c.material,[c.x,c.y,c.z],[step/2,step/2,step/2],{skip,tile:[.55,.55]});
  }
  // Sparks stay much smaller than the detached flames and disappear independently.
  for (let k = 0; layer === 'core' && k < 3; k++) {
    const age = ((frame + k * 5) % CAMPFIRE_FRAMES) / CAMPFIRE_FRAMES;
    if (age > .8) continue;
    const x = Math.sin(k * 2.4 + age) * (.15 + age * .23), z = Math.cos(k * 2.4) * .2, y = .65 + age * .95;
    box(b,5,[x,y,z],[.007*(1-age),.014*(1-age),.007*(1-age)]);
  }
  return finish(b);
}

