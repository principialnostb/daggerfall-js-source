// Original pelt mesh: the existing cloak solver drives its connected support,
// transfers motion to the fur, and spring-bends the free ends of each tuft.
import { isWolfCloakSlot } from '../../characters/ownModels/wolfCloak.js';
import { rebuildNormals, createCloakPhysics, stepCloakPhysics } from './mwCloakPhysics.js';
import { foldPieceBounds } from './mwFirstPerson.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v) => Number.isFinite(v) ? v : 0;
const FIXED = 1 / 120;
const ROOT = 100, HEM = 22;
const mobile = (p) => /Back_Panel|Back_Locks/.test(p.batch?.name ?? p.name ?? '');

export function createWolfPeltMotion(pieces) {
  const layers = pieces.filter((p) => isWolfCloakSlot(p.slot) && p.kind === 'skinned' && p.batch?.positions?.length)
    .map((piece) => ({ piece, base: Float32Array.from(piece.batch.positions), movable: mobile(piece),
      fur: /Locks/.test(piece.batch.name),
      tips: new Float32Array(/Locks/.test(piece.batch.name) ? piece.batch.positions.length / 105 : 0),
      tipVelocity: new Float32Array(/Locks/.test(piece.batch.name) ? piece.batch.positions.length / 105 : 0),
      normals: piece.batch.normals ? Float32Array.from(piece.batch.normals) : null }));
  if (!layers.length) return null;
  const panel = layers.find((l) => /Back_Panel/.test(l.piece.batch.name));
  if (!panel) return null;
  const proxy = { batch: { positions: Float32Array.from(panel.base) }, indices: panel.piece.indices, clothPhysicsFallbackMesh: true };
  proxy.clothPhysics = createCloakPhysics(proxy);
  // Use the existing fabric solver on the connected support only. Solving
  // disconnected fur cards separately would detach them from the hide.
  for (let v = 0; v < proxy.clothPhysics.pinned.length; v++) proxy.clothPhysics.pinned[v] = panel.base[v*3+2] >= ROOT ? 1 : 0;
  for (const layer of layers.filter((l) => l.movable)) {
    layer.links = [];
    for (let i = 0; i < layer.base.length; i += 3) {
      const nearest = [];
      for (let j = 0; j < panel.base.length; j += 3) {
        const d = (layer.base[i]-panel.base[j])**2 + (layer.base[i+2]-panel.base[j+2])**2;
        if (nearest.length < 4 || d < nearest[3].d) {
          nearest.push({ j, d }); nearest.sort((a,b) => a.d-b.d); nearest.length = Math.min(4,nearest.length);
        }
      }
      const sum = nearest.reduce((s,n) => s + 1/(n.d+.05),0);
      layer.links.push(nearest.map((n) => [n.j,1/(n.d+.05)/sum]));
    }
  }
  return { layers, nodes: Array.from({ length: 3 }, () => ({ x: 0, y: 0, vx: 0, vy: 0 })),
    proxy, activity: 0, windTime: 0, windEnergy: 0, wavePhase: 0, waveEnergy: 0, waveOffsets: new Float32Array(panel.base.length),
    accumulator: 0, gait: 0, yaw: null, contacts: 0, contactBands: new Float32Array(24),
    pieces: layers.map((l) => l.piece) };
}

// Shared cubic displacement by height; roots have exactly zero displacement.
function offset(nodes, z) {
  const h = clamp((ROOT - z) / (ROOT - HEM), 0, 1) * 3;
  const i = Math.min(2, Math.floor(h)), t = h - i, w = t * t * (3 - 2 * t);
  const a = i ? nodes[i - 1] : { x: 0, y: 0 }, b = nodes[i];
  return [a.x + (b.x - a.x) * w, a.y + (b.y - a.y) * w];
}

// Coarse rear contact envelope from live posed body/armour triangles. This is
// a bounded body-contact approximation, not self collision or fur simulation.
function rearEnvelope(pieces) {
  const grid = new Map(), cell = 3;
  const key = (x, z) => `${x},${z}`;
  for (const piece of pieces) {
    const p = piece.positions, idx = piece.indices;
    if (!p || !idx) continue;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const ax = p[a], az = p[a + 2], bx = p[b], bz = p[b + 2], cx = p[c], cz = p[c + 2];
      const den = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(den) < 1e-6) continue;
      for (let x = Math.floor(Math.min(ax, bx, cx) / cell); x <= Math.ceil(Math.max(ax, bx, cx) / cell); x++) {
        for (let z = Math.floor(Math.min(az, bz, cz) / cell); z <= Math.ceil(Math.max(az, bz, cz) / cell); z++) {
          const u = ((bx - x * cell) * (cz - z * cell) - (cx - x * cell) * (bz - z * cell)) / den;
          const v = ((cx - x * cell) * (az - z * cell) - (ax - x * cell) * (cz - z * cell)) / den;
          const w = 1 - u - v;
          if (Math.min(u, v, w) < -1e-5) continue;
          const y = p[a + 1] * u + p[b + 1] * v + p[c + 1] * w;
          const id = key(x, z);
          grid.set(id, Math.min(grid.get(id) ?? Infinity, y));
        }
      }
    }
  }
  return (x, z) => grid.get(key(Math.round(x / cell), Math.round(z / cell)));
}

/** Called AFTER poseAssembly, BEFORE upload; only owned wolf layers are changed. */
export function stepWolfPeltMotion(state, arm, dt, motion = {}, underSlots = new Set()) {
  if (!state || !arm.pose || !arm.mats || !Number.isFinite(dt) || dt <= 0) return false;
  const gait = clamp(finite(motion.gait), 0, 1);
  const yaw = Number.isFinite(motion.yaw) ? motion.yaw : null;
  let yawRate = 0;
  if (yaw != null && state.yaw != null && dt < .25) {
    yawRate = clamp(Math.atan2(Math.sin(yaw - state.yaw), Math.cos(yaw - state.yaw)) / dt, -3, 3);
  }
  state.yaw = yaw;
  // A tab resume must not replay seconds of forces or create a large start kick.
  if (dt > .25) {
    state.nodes.forEach((n) => { n.x = n.y = n.vx = n.vy = 0; });
    state.accumulator = 0;
    state.gait = gait;
    state.contactBands.fill(0);
    state.activity = 0;
    state.wavePhase = state.waveEnergy = 0;
    state.windEnergy = 0;
    state.waveOffsets.fill(0);
    const cloth = state.proxy.clothPhysics;
    cloth.pos.set(cloth.base); cloth.prev.set(cloth.base);
    state.layers.forEach((l) => { l.tips.fill(0); l.tipVelocity.fill(0); });
  }
  state.accumulator += Math.min(dt, .1);
  const acceleration = clamp((gait - state.gait) / Math.max(dt, FIXED), -3, 3);
  const phase = finite(motion.gaitPhase) * Math.PI * 2;
  const attack = clamp(finite(motion.attack),0,1) * Math.sin(Math.PI*clamp(finite(motion.attackProgress),0,1));
  state.activity = Math.max(gait, Math.abs(yawRate)/3, attack, state.activity*Math.exp(-Math.min(dt,.1)*4));
  while (state.accumulator >= FIXED) {
    stepCloakPhysics(state.proxy, FIXED, { ...motion, gait, turn: yawRate/3 });
    // Keep crests travelling during the release after a stop. The stride drives
    // strength/cadence, rather than freezing every crest at its last step phase.
    state.wavePhase = (state.wavePhase + FIXED*Math.PI*2*(1.1+gait*.65)) % (Math.PI*2);
    state.waveEnergy += (state.activity-state.waveEnergy)*(1-Math.exp(-FIXED*8));
    // Ambient wind has its own clock and persists while the actor stands still.
    // Two slow gust rhythms avoid locking the fur ripple to footsteps.
    state.windTime += FIXED;
    const gust = .65+.18*Math.sin(state.windTime*.73)+.12*Math.sin(state.windTime*1.37);
    state.windEnergy += (gust-state.windEnergy)*(1-Math.exp(-FIXED*2));
    for (const layer of state.layers) for (let lock = 0; lock < layer.tips.length; lock++) {
      const root = lock*105;
      const edge = Math.min(1,Math.abs(layer.base[root])/24);
      const strength = layer.movable ? 1.5+edge*1.0 : 1.25;
      const height = clamp((ROOT-layer.base[root+2])/(ROOT-HEM),0,1);
      // Same travelling field as the hide, with a delayed guard-hair response.
      const wave = state.wavePhase-height*7.5+layer.base[root]*.13-.65;
      const wind = state.windTime*2.8-height*5.5+layer.base[root]*.09-.8;
      const target = state.waveEnergy * strength * Math.sin(wave)
        + state.windEnergy*strength*1.15*Math.sin(wind) + yawRate*.16 + attack*.6;
      // Faster, more flexible guard hairs on the slower, heavier hide.
      layer.tipVelocity[lock] += ((target-layer.tips[lock])*625 - 35*layer.tipVelocity[lock])*FIXED;
      layer.tips[lock] = clamp(layer.tips[lock]+layer.tipVelocity[lock]*FIXED,-2.6,2.6);
    }
    for (let i = 0; i < state.nodes.length; i++) {
      const n = state.nodes[i], weight = (i + 1) / 3;
      const lag = i * .48;
      const targetX = weight * (gait * .75 * Math.sin(phase - lag) - yawRate * .65);
      const targetY = -weight * (gait * (1.5 + .65 * Math.sin(phase * 2 - lag)) + Math.max(0, acceleration) * .35);
      const omega = 7 - i * .8;
      n.vx += ((targetX - n.x) * omega * omega - 1.85 * omega * n.vx) * FIXED;
      n.vy += ((targetY - n.y) * omega * omega - 1.85 * omega * n.vy) * FIXED;
      n.x = clamp(n.x + n.vx * FIXED, -3.2, 3.2);
      n.y = clamp(n.y + n.vy * FIXED, -4, .15);
    }
    state.accumulator -= FIXED;
  }
  // Two-dimensional travelling bend on the connected support. The same field
  // is interpolated onto every back-fur vertex, so the pelt remains assembled.
  // Crests move outwards from the fitted back, avoiding a forward body shove.
  const rest = state.proxy.clothPhysics.base, wave = state.waveOffsets;
  for (let i = 0; i < rest.length; i += 3) {
    const h = clamp((ROOT-rest[i+2])/(ROOT-HEM),0,1);
    const pin = Math.min(1,h*5), edge = clamp(Math.abs(rest[i])/22,0,1);
    const angle = state.wavePhase-h*7.5+rest[i]*.13;
    const amplitude = state.waveEnergy*(1.3+gait*1.8)*pin*(.5+.5*edge);
    wave[i] = Math.sin(angle-.5)*amplitude*.23;
    wave[i+1] = -(1+Math.sin(angle))*amplitude*.5;
    wave[i+2] = Math.cos(angle)*amplitude*.16;
    // Broad rolls must move the contour at ordinary game-camera distance.
    // A sub-unit displacement is lost once the actor is only ~150px tall.
    const windAngle = state.windTime*2.8-h*5.5+rest[i]*.09;
    const windAmplitude = state.windEnergy*pin*(1.8+1.6*edge);
    wave[i] += Math.sin(windAngle-.4)*windAmplitude*.65;
    wave[i+1] -= (1+Math.sin(windAngle))*windAmplitude;
    wave[i+2] += Math.cos(windAngle)*windAmplitude*.2;
  }
  state.gait = gait;
  for (const layer of state.layers) {
    const { piece, base } = layer;
    const p = piece.batch.positions;
    p.set(base);
    if (layer.movable) for (let i = 0; i < p.length; i += 3) {
      let [x, y] = offset(state.nodes, base[i + 2]);
      x *= .2; y *= .2;
      const weight = clamp((ROOT-base[i+2])/18,0,1)*state.activity;
      let lift = 0;
      for (const [j,w] of layer.links[i/3]) {
        x += (state.proxy.clothPhysics.pos[j]-state.proxy.clothPhysics.base[j])*w*weight*.65;
        y += (state.proxy.clothPhysics.pos[j+1]-state.proxy.clothPhysics.base[j+1])*w*weight*.65;
        // The wave is already faded/pinned on the support; do not multiply its
        // energy a second time or the visible ripple disappears at walking pace.
        const supported = clamp((ROOT-base[i+2])/12,0,1);
        x += wave[j]*w*supported;
        y += wave[j+1]*w*supported;
        lift += wave[j+2]*w*supported;
      }
      p[i] += x; p[i + 1] += y;
      p[i + 2] += lift + (x * x + y * y) / (2 * (ROOT - HEM));
    }
    // Keep each tuft root anchored; bend its free rows. This also animates the
    // shoulder/nape tips without moving their fitted attachment to the armour.
    if (layer.fur) for (let i = 0; i < p.length; i += 3) {
      const row = Math.floor((i/3)%35/5)/6, lock = Math.floor(i/105);
      const bend = (layer.tips[lock]-layer.tipVelocity[lock]*row*.015)*row*row;
      const normal = layer.normals;
      p[i] += bend*(normal ? normal[i] : .3);
      p[i+1] += bend*(normal ? normal[i+1] : -1);
      p[i+2] += bend*.3;
      // Hinge the existing tuft around its own fixed root: changes its facing
      // and silhouette, rather than merely inflating vertices along normals.
      // Root rows remain exact; curvature increases along the free length.
      const root = lock*105+6;
      const height = clamp((ROOT-base[root+2])/(ROOT-HEM),0,1);
      const wind = state.windTime*2.8-height*5.5+base[root]*.09-.8;
      const angle = state.windEnergy*.23*Math.sin(wind-row*.45)*row;
      const cy=Math.cos(angle), sy=Math.sin(angle);
      const dy=p[i+1]-p[root+1], dz=p[i+2]-p[root+2];
      p[i+1]=p[root+1]+dy*cy-dz*sy;
      p[i+2]=p[root+2]+dy*sy+dz*cy;
    }
    if (layer.normals) rebuildNormals(p, piece.indices, piece.batch.normals, layer.normals);
    arm.fns.skinBatch(piece.batch, arm.skeleton, arm.pose, arm.mats, piece.positions, piece.normals ?? null);
    piece.sourceGen = ((piece.sourceGen | 0) + 1) >>> 0;
  }

  const body = arm.pieces.filter((p) => !isWolfCloakSlot(p.slot) && underSlots.has(p.slot)
    && !/^shield|weapon|tail/.test(p.slot));
  state.contacts = 0;
  state.maxContactDemand = 0;
  if (body.length) {
    const rear = rearEnvelope(body);
    // One correction per height band, shared by the base and every fur layer:
    // contact never peels a single card away from the pelt.
    const panel = state.layers.find((l) => /Back_Panel/.test(l.piece.batch?.name ?? l.piece.name ?? ''));
    const bands = new Float32Array(24);
    if (panel) {
      const p = panel.piece.positions;
      for (let i = 0; i < p.length; i += 3) {
        if (panel.base[i + 2] >= ROOT) continue;
        const y = rear(p[i], p[i + 2]);
        if (y == null || p[i + 1] < y - .7) continue;
        state.maxContactDemand = Math.max(state.maxContactDemand, p[i + 1] - y + .7);
        const band = clamp(Math.round((ROOT - panel.base[i + 2]) / (ROOT - HEM) * 23), 0, 23);
        // A running heel can travel well behind the torso. Reserve a larger
        // contact envelope than the free spring sway, without lifting the roots.
        bands[band] = Math.max(bands[band], Math.min(32, p[i + 1] - y + .7));
        state.contacts++;
      }
    }
    for (let i = 0; i < bands.length; i++) {
      // Spread contact over a broad bend, not a narrow ridge across one fur row.
      let target = 0;
      for (let j = 0; j < bands.length; j++) {
        const distance = (i - j) / 3;
        target = Math.max(target, bands[j] * Math.exp(-.5 * distance * distance));
      }
      // Contact is a positional constraint: do not lag behind an approaching
      // heel. Ease only the release, so the heavy hide settles after the kick.
      state.contactBands[i] = target > state.contactBands[i] ? target
        : state.contactBands[i] + (target - state.contactBands[i]) * (1 - Math.exp(-Math.min(dt, .1) * 8));
    }
    for (const { piece, base, movable } of state.layers) {
      if (!movable) continue;
      for (let i = 0; i < base.length; i += 3) {
        const h = clamp((ROOT - base[i + 2]) / (ROOT - HEM), 0, 1);
        const v = h * 23, lo = Math.floor(v), hi = Math.min(23, lo + 1);
        const f = v - lo, w = f * f * (3 - 2 * f);
        const push = (state.contactBands[lo] * (1 - w) + state.contactBands[hi] * w) * Math.min(1, h * 8);
        piece.positions[i + 1] -= push;
      }
      if (piece.normals) rebuildNormals(piece.positions, piece.indices, piece.normals, null);
    }
  }
  foldPieceBounds(state.pieces);
  return true;
}
