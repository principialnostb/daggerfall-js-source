// Original pelt mesh: the existing cloak solver drives its connected support,
// transfers motion to the fur, and spring-bends the free ends of each tuft.
import { isWolfCloakSlot } from '../../characters/ownModels/wolfCloak.js';
import { rebuildNormals, createCloakPhysics, stepCloakPhysics } from './mwCloakPhysics.js';
import { foldPieceBounds, hangAffine, placeAtBone } from './mwFirstPerson.js';
import { enableRigidBatchSkin } from './mwSkin.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v) => Number.isFinite(v) ? v : 0;
const FIXED = 1 / 120;
const ROOT = 100, HEM = 22;
const BAND_COUNT = 24;
const BAND_SPAN = (ROOT - HEM) / (BAND_COUNT - 1);
const MAX_BAND_DELTA = BAND_SPAN * .55;
const spread = Float32Array.from({ length: BAND_COUNT }, (_, i) => Math.exp(-0.5 * (i / 3) ** 2));
const mobile = (p) => /Back_Panel|Back_Locks/.test(p.batch?.name ?? p.name ?? '');

export function createWolfPeltMotion(pieces) {
  const layers = pieces.filter((p) => isWolfCloakSlot(p.slot) && p.kind === 'skinned' && p.batch?.positions?.length)
    .map((piece) => ({ piece, base: Float32Array.from(piece.batch.positions), movable: mobile(piece),
      fur: /Locks/.test(piece.batch.name),
      tips: new Float32Array(/Locks/.test(piece.batch.name) ? piece.batch.positions.length / 105 : 0),
      tipVelocity: new Float32Array(/Locks/.test(piece.batch.name) ? piece.batch.positions.length / 105 : 0),
      normals: piece.batch.normals ? Float32Array.from(piece.batch.normals) : null }));
  if (!layers.length) return null;
  for (const layer of layers) enableRigidBatchSkin(layer.piece.batch);
  const panel = layers.find((l) => /Back_Panel/.test(l.piece.batch.name));
  if (!panel) return null;
  const proxy = { batch: { positions: Float32Array.from(panel.base) }, indices: panel.piece.indices, clothPhysicsFallbackMesh: true };
  proxy.clothPhysics = createCloakPhysics(proxy);
  // Use the existing fabric solver on the connected support only. Solving
  // disconnected fur cards separately would detach them from the hide.
  for (let v = 0; v < proxy.clothPhysics.pinned.length; v++) proxy.clothPhysics.pinned[v] = panel.base[v*3+2] >= ROOT ? 1 : 0;
  for (const layer of layers.filter((l) => l.movable)) {
    const count = layer.base.length / 3;
    layer.motionWeights = new Float32Array(count * 7);
    layer.motionIndices = new Uint8Array(count * 2);
    layer.linkOffsets = new Uint32Array(layer.base.length / 3 * 4);
    layer.linkWeights = new Float32Array(layer.linkOffsets.length);
    layer.contactSamples = [];
    for (let i = 0; i < layer.base.length; i += 3) {
      // Sample the connected hide and the outer, middle and inner shafts of
      // each free fur strip. Some of these tips reach far below the hide.
      const vertex = (i / 3) % 35;
      const row = Math.floor(vertex / 5), column = vertex % 5;
      const z = layer.base[i + 2], h = clamp((ROOT - z) / (ROOT - HEM), 0, 1);
      const node = Math.min(2, Math.floor(h * 3)), band = Math.floor(h * (BAND_COUNT - 1));
      const { motionWeights: weights, motionIndices: indices } = layer;
      const w = i / 3 * 7, index = i / 3 * 2;
      const f = h * 3 - node, k = h * (BAND_COUNT - 1) - band;
      indices[index] = node; indices[index + 1] = band;
      weights[w] = f * f * (3 - 2 * f);
      weights[w + 1] = clamp((ROOT - z) / 18, 0, 1) * .65;
      weights[w + 2] = clamp((ROOT - z) / 12, 0, 1);
      weights[w + 3] = k * k * (3 - 2 * k);
      weights[w + 4] = clamp((106 - z) / 6, 0, 1);
      weights[w + 5] = weights[w + 4] * 6 * k * (1 - k) / BAND_SPAN;
      weights[w + 6] = Math.round(h * (BAND_COUNT - 1));
      if (layer.base[i + 2] < 104 && (!layer.fur || row === 6 || (row % 2 === 0 && column % 2 === 0))) {
        layer.contactSamples.push(i);
      }
      const nearest = [];
      for (let j = 0; j < panel.base.length; j += 3) {
        const d = (layer.base[i]-panel.base[j])**2 + (layer.base[i+2]-panel.base[j+2])**2;
        if (nearest.length < 4 || d < nearest[3].d) {
          nearest.push({ j, d }); nearest.sort((a,b) => a.d-b.d); nearest.length = Math.min(4,nearest.length);
        }
      }
      const sum = nearest.reduce((s,n) => s + 1/(n.d+.05),0);
      for (let k = 0; k < nearest.length; k++) {
        const link = i / 3 * 4 + k, { j, d } = nearest[k];
        layer.linkOffsets[link] = j;
        layer.linkWeights[link] = 1 / (d + .05) / sum;
      }
    }
  }
  return { layers, nodes: Array.from({ length: 3 }, () => ({ x: 0, y: 0, vx: 0, vy: 0 })),
    proxy, activity: 0, windTime: 0, windEnergy: 0, wavePhase: 0, waveEnergy: 0, waveOffsets: new Float32Array(panel.base.length),
    accumulator: 0, gait: 0, yaw: null, yawRate: 0, phase: null, contacts: 0,
    contactBands: new Float32Array(BAND_COUNT), contactTargets: new Float32Array(BAND_COUNT),
    grid: new Float32Array(0),
    gearGrid: new Float32Array(0),
    gearDepth: new Float32Array(0),
    gearRing: new Uint8Array(0),
    gearGroups: new Map(),
    pressedVertices: 0,
    contactLift: new Float32Array(BAND_COUNT),
    moving: new Set(layers.map(l => l.piece)) };
}

// Coarse rear contact envelope from live posed body/armour triangles. This is
// a bounded body-contact approximation, not self collision or fur simulation.
function envelopeFootprint(state) {
  const cell = 3;
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const layer of state.layers) if (layer.movable) {
    const p = layer.piece.positions;
    for (const i of layer.contactSamples) {
      const x = Math.floor(p[i] / cell), z = Math.floor(p[i + 2] / cell);
      left = Math.min(left, x); right = Math.max(right, x + 1);
      bottom = Math.min(bottom, z); top = Math.max(top, z + 1);
    }
  }
  const width = right - left + 1, height = top - bottom + 1;
  return { cell, left, right, bottom, top, width, height };
}

function rasterDepth(pieces, area, grid, front = false) {
  const { cell, left, right, bottom, top, width, height } = area;
  grid.fill(front ? -Infinity : Infinity, 0, width * height);
  const depth = front ? Math.max : Math.min;
  for (const piece of pieces) {
    const p = piece.positions, idx = piece.indices;
    if (!p || !idx) continue;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k] * 3, b = idx[k + 1] * 3, c = idx[k + 2] * 3;
      const ax = p[a], az = p[a + 2], bx = p[b], bz = p[b + 2], cx = p[c], cz = p[c + 2];
      const den = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(den) < 1e-6) continue;
      const xEnd = Math.min(right, Math.floor(Math.max(ax, bx, cx) / cell));
      const zEnd = Math.min(top, Math.floor(Math.max(az, bz, cz) / cell));
      const zStart = Math.max(bottom, Math.ceil(Math.min(az, bz, cz) / cell));
      for (let x = Math.max(left, Math.ceil(Math.min(ax, bx, cx) / cell)); x <= xEnd; x++) {
        for (let z = zStart; z <= zEnd; z++) {
          const u = ((bx - x * cell) * (cz - z * cell) - (cx - x * cell) * (bz - z * cell)) / den;
          const v = ((cx - x * cell) * (az - z * cell) - (ax - x * cell) * (cz - z * cell)) / den;
          const w = 1 - u - v;
          if (Math.min(u, v, w) < -1e-5) continue;
          const y = p[a + 1] * u + p[b + 1] * v + p[c + 1] * w;
          const id = (z - bottom) * width + x - left;
          grid[id] = depth(grid[id], y);
        }
      }
    }
  }
}

function rearEnvelope(state, pieces) {
  const area = envelopeFootprint(state);
  const { cell, left, bottom, width, height } = area;
  if (!(width > 0 && height > 0)) return () => Infinity;
  if (state.grid.length < width * height) state.grid = new Float32Array(width * height);
  const grid = state.grid;
  rasterDepth(pieces, area, grid);
  return (x, z, interpolate = false) => {
    const gx = x / cell - left, gz = z / cell - bottom;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    if (ix < 0 || iz < 0 || ix >= width - 1 || iz >= height - 1) return Infinity;
    const id = iz * width + ix;
    const a = grid[id], b = grid[id + 1], c = grid[id + width], d = grid[id + width + 1];
    if (!interpolate || !Number.isFinite(a + b + c + d)) return Math.min(a, b, c, d);
    const fx = gx - ix, fz = gz - iz;
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  };
}

function placeForContact(arm, piece) {
  const { fns, skeleton, pose, mats } = arm;
  if (piece.kind === 'skinned') {
    fns.skinBatch(piece.batch, skeleton, pose, mats, piece.positions, null);
  } else if (piece.kind === 'rigid') {
    const at = piece.followAt ?? fns.attachmentTransform(mats, piece.attachRef);
    placeAtBone(piece.source, piece.hang ? hangAffine(at, piece.hang) : at,
      piece.mirrored, piece.positions, piece.boneOffset);
  }
}

function pressUnderMountedGear(state, arm, backGear, rear) {
  state.pressedVertices = 0;
  if (!backGear) return;
  const groups = state.gearGroups;
  for (const group of groups.values()) group.pieces.length = 0;
  let active = false;
  for (const piece of arm.pieces) {
    if (piece.kind !== 'rigid' || !backGear(piece)) continue;
    active = true;
    const shield = /^shield-back\b/i.test(piece.slot);
    const key = shield ? 'shield' : piece.attachRef;
    if (!groups.has(key)) groups.set(key, { shield, pieces: [] });
    groups.get(key).pieces.push(piece);
    if (arm.cpuSkinned === false) placeForContact(arm, piece);
  }
  if (!active) return;
  const area = envelopeFootprint(state);
  const { cell, left, bottom, width, height } = area;
  if (!(width > 1 && height > 1)) return;
  const size = width * height;
  if (state.gearGrid.length < size) state.gearGrid = new Float32Array(size);
  if (state.gearDepth.length < size) state.gearDepth = new Float32Array(size);
  if (state.gearRing.length < size) state.gearRing = new Uint8Array(size);
  const grid = state.gearDepth;
  grid.fill(-Infinity, 0, size);
  for (const group of groups.values()) {
    if (!group.pieces.length) continue;
    rasterDepth(group.pieces, area, state.gearGrid, !group.shield);
    // Use the shield shell, allowing its grips to sink into the coat.
    const margin = group.shield ? 2.2 : .8;
    for (let i = 0; i < size; i++) {
      const depth = state.gearGrid[i];
      if (Number.isFinite(depth)) grid[i] = Math.max(grid[i], depth + margin);
    }
  }
  // Triangle edges span several samples. Carry the pressure just outside the
  // projected rim so a fur card from the next cell cannot bridge over it.
  const padded = state.gearGrid, rings = state.gearRing;
  rings.fill(0, 0, size);
  for (let ring = 1; ring <= 3; ring++) {
    padded.set(grid.subarray(0, size));
    for (let z = 1; z < height - 1; z++) for (let x = 1; x < width - 1; x++) {
      const id = z * width + x;
      if (Number.isFinite(grid[id])) continue;
      const depth = Math.max(grid[id - 1], grid[id + 1], grid[id - width], grid[id + width],
        grid[id - width - 1], grid[id - width + 1], grid[id + width - 1], grid[id + width + 1]);
      if (Number.isFinite(depth)) {
        padded[id] = depth;
        rings[id] = ring;
      }
    }
    grid.set(padded.subarray(0, size));
  }
  for (const { piece, fur } of state.layers) {
    const p = piece.positions;
    let changed = false;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i] / cell - left, z = p[i + 2] / cell - bottom;
      const ix = Math.floor(x), iz = Math.floor(z);
      if (ix < 0 || iz < 0 || ix >= width - 1 || iz >= height - 1) continue;
      const fx = x - ix, fz = z - iz;
      const lo = iz * width + ix;
      let coverage = 0, weight = 0, depth = 0;
      for (let corner = 0; corner < 4; corner++) {
        const right = corner & 1, top = corner >> 1;
        const id = lo + right + top * width, sample = grid[id];
        if (!Number.isFinite(sample)) continue;
        const w = (right ? fx : 1 - fx) * (top ? fz : 1 - fz);
        depth += sample * w;
        weight += w;
        coverage += w * (rings[id] <= 1 ? 1 : (4 - rings[id]) / 3);
      }
      if (weight <= 0) continue;
      // Raised tufts can compact into the hide. The connected hide still
      // stops short of the body surface.
      const bodyLimit = rear ? rear(p[i], p[i + 2], true) + (fur ? 4.5 : -.35) : Infinity;
      const limit = Math.min(depth / weight, bodyLimit);
      const soft = Math.max(0, Math.min(1.8, bodyLimit - limit));
      const compress = limit + soft - p[i + 1];
      if (compress <= 0) continue;
      // Soften the edge of the footprint and leave depth in the compressed fur.
      const blend = coverage * coverage * (3 - 2 * coverage);
      const push = (compress - soft * compress / (soft + compress)) * blend;
      p[i + 1] += push;
      state.pressedVertices++;
      changed = true;
    }
    if (changed && piece.normals) rebuildNormals(p, piece.indices, piece.normals, null);
  }
}

/** Called after the skeletal pose and before the third-person mesh upload. */
export function stepWolfPeltMotion(state, arm, dt, motion = {}, underSlots = new Set(), backGear = null) {
  if (!state || !arm.pose || !arm.mats || !Number.isFinite(dt) || dt <= 0) return false;
  const desiredGait = clamp(finite(motion.gait), 0, 1);
  const elapsed = Math.min(dt, .05);
  let gait = state.gait + (desiredGait - state.gait) * (1 - Math.exp(-elapsed * 15));
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
    state.gait = gait = desiredGait;
    state.yawRate = 0;
    state.phase = null;
    state.contactBands.fill(0);
    state.activity = 0;
    state.wavePhase = state.waveEnergy = 0;
    state.windEnergy = 0;
    state.waveOffsets.fill(0);
    const cloth = state.proxy.clothPhysics;
    cloth.pos.set(cloth.base); cloth.prev.set(cloth.base);
    state.layers.forEach((l) => { l.tips.fill(0); l.tipVelocity.fill(0); });
  }
  state.yawRate += (yawRate - state.yawRate) * (1 - Math.exp(-elapsed * 18));
  yawRate = state.yawRate;
  state.accumulator += elapsed;
  const acceleration = clamp((gait - state.gait) / Math.max(dt, FIXED), -3, 3);
  const targetPhase = finite(motion.gaitPhase);
  const phaseError = targetPhase - (state.phase ?? targetPhase);
  state.phase = (state.phase ?? targetPhase) + clamp(phaseError - Math.round(phaseError), -elapsed * 4, elapsed * 4);
  const phase = state.phase * Math.PI * 2;
  const attackSide = clamp(finite(motion.attackSide), -1, 1);
  const proxyMotion = { ...motion, gait, gaitPhase: state.phase, turn: yawRate / 3 };
  const attack = clamp(finite(motion.attack),0,1) * Math.sin(Math.PI*clamp(finite(motion.attackProgress),0,1));
  state.activity = Math.max(gait, Math.abs(yawRate)/3, attack, state.activity*Math.exp(-Math.min(dt,.1)*4));
  while (state.accumulator >= FIXED) {
    stepCloakPhysics(state.proxy, FIXED, proxyMotion);
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
      const targetX = weight * (gait * .75 * Math.sin(phase - lag) - yawRate * .65 + attackSide * attack * 1.1);
      const targetY = -weight * (gait * (1.5 + .65 * Math.sin(phase * 2 - lag)) + Math.max(0, acceleration) * .35 + attack * 1.3);
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
    if (!layer.movable && !layer.fur) {
      arm.fns.skinBatch(piece.batch, arm.skeleton, arm.pose, arm.mats, piece.positions, piece.normals ?? null);
      piece.sourceGen = ((piece.sourceGen | 0) + 1) >>> 0;
      continue;
    }
    const p = piece.batch.positions;
    p.set(base);
    if (layer.movable) for (let i = 0; i < p.length; i += 3) {
      const weights = layer.motionWeights, w0 = i / 3 * 7;
      const hi = layer.motionIndices[i / 3 * 2], blend = weights[w0];
      const lo = state.nodes[hi - 1], node = state.nodes[hi];
      let x = ((lo?.x ?? 0) * (1 - blend) + node.x * blend) * .2;
      let y = ((lo?.y ?? 0) * (1 - blend) + node.y * blend) * .2;
      const weight = weights[w0 + 1] * state.activity;
      let lift = 0;
      const supported = weights[w0 + 2];
      for (let k = i / 3 * 4; k < i / 3 * 4 + 4; k++) {
        const j = layer.linkOffsets[k], w = layer.linkWeights[k];
        x += (state.proxy.clothPhysics.pos[j]-state.proxy.clothPhysics.base[j])*w*weight;
        y += (state.proxy.clothPhysics.pos[j+1]-state.proxy.clothPhysics.base[j+1])*w*weight;
        // The wave is already faded/pinned on the support; do not multiply its
        // energy a second time or the visible ripple disappears at walking pace.
        x += wave[j]*w*supported;
        y += wave[j+1]*w*supported;
        lift += wave[j+2]*w*supported;
      }
      p[i] += x; p[i + 1] += y;
      p[i + 2] += lift + (x * x + y * y) / (2 * (ROOT - HEM));
    }
    // Keep each tuft root anchored; bend its free rows. This also animates the
    // shoulder/nape tips without moving their fitted attachment to the armour.
    if (layer.fur) for (let lock = 0; lock < layer.tips.length; lock++) {
      const start = lock * 105, root = start + 6;
      const height = clamp((ROOT - base[root + 2]) / (ROOT - HEM), 0, 1);
      const wind = state.windTime * 2.8 - height * 5.5 + base[root] * .09 - .8;
      for (let row = 1; row < 7; row++) {
        const weight = row / 6;
        const bend = (layer.tips[lock] - layer.tipVelocity[lock] * weight * .015) * weight * weight;
        const angle = state.windEnergy * .23 * Math.sin(wind - weight * .45) * weight;
        const cy = Math.cos(angle), sy = Math.sin(angle);
        for (let i = start + row * 15; i < Math.min(p.length, start + (row + 1) * 15); i += 3) {
          p[i] += bend * (layer.normals ? layer.normals[i] : .3);
          const dy = p[i + 1] + bend * (layer.normals ? layer.normals[i + 1] : -1) - p[root + 1];
          const dz = p[i + 2] + bend * .3 - p[root + 2];
          p[i + 1] = p[root + 1] + dy * cy - dz * sy;
          p[i + 2] = p[root + 2] + dy * sy + dz * cy;
        }
      }
    }
    if (layer.normals) rebuildNormals(p, piece.indices, piece.batch.normals, layer.normals);
    arm.fns.skinBatch(piece.batch, arm.skeleton, arm.pose, arm.mats, piece.positions, piece.normals ?? null);
    piece.sourceGen = ((piece.sourceGen | 0) + 1) >>> 0;
  }

  const body = arm.pieces.filter((p) => !isWolfCloakSlot(p.slot) && underSlots.has(p.slot)
    && !/^shield|weapon|tail/.test(p.slot));
  state.contacts = 0;
  state.maxContactDemand = 0;
  let rear = null;
  if (body.length) {
    if (arm.cpuSkinned === false) for (const piece of body) placeForContact(arm, piece);
    rear = rearEnvelope(state, body);
    // One correction per height band, shared by the base and every fur layer:
    // contact never peels a single card away from the pelt.
    const bands = state.contactTargets;
    bands.fill(0);
    for (const layer of state.layers) {
      if (!layer.movable) continue;
      const p = layer.piece.positions;
      for (const i of layer.contactSamples) {
        const y = rear(p[i], p[i + 2]);
        // Leave room for the span between a triangle's vertices where a
        // bent knee or boot meets the long free hem.
        const margin = layer.base[i + 2] < 50 ? 3.2 : 1.4;
        const demand = p[i + 1] - y + margin;
        if (demand <= 0) continue;
        state.maxContactDemand = Math.max(state.maxContactDemand, demand);
        const band = layer.motionWeights[i / 3 * 7 + 6];
        // A running heel can travel well behind the torso. Reserve a larger
        // contact envelope than the free spring sway, without lifting the roots.
        bands[band] = Math.max(bands[band], Math.min(36, demand));
        state.contacts++;
      }
    }
    for (let i = 0; i < bands.length; i++) {
      // Spread contact over a broad bend, not a narrow ridge across one fur row.
      let target = 0;
      for (let j = 0; j < bands.length; j++) {
        target = Math.max(target, bands[j] * spread[Math.abs(i - j)]);
      }
      // Keep deep contact out of the body while filtering shallow flicker.
      const previous = state.contactBands[i];
      const release = 1 - Math.exp(-elapsed * (target > previous ? 24 : 8));
      state.contactBands[i] = Math.max(target - 1.2, previous + (target - previous) * release);
    }
    // A heel bends a span of hide. A narrow depth step would shear the fur UVs.
    const depths = state.contactBands, lift = state.contactLift;
    for (let i = depths.length - 2; i >= 0; i--) depths[i] = Math.max(depths[i], depths[i + 1] - MAX_BAND_DELTA);
    for (let i = 1; i < depths.length; i++) {
      depths[i] = Math.max(depths[i], depths[i - 1] - MAX_BAND_DELTA);
      const dy = depths[i] - depths[i - 1];
      lift[i] = lift[i - 1] + .65 * (BAND_SPAN - Math.sqrt(BAND_SPAN ** 2 - dy ** 2));
    }
    const touching = depths.some(push => push > 0);
    for (const { piece, movable, fur, motionWeights: weights, motionIndices: indices } of state.layers) {
      if (!movable || !touching) continue;
      for (let i = 0; i < piece.positions.length; i += 3) {
        const index = i / 3 * 7, lo = indices[i / 3 * 2 + 1], hi = Math.min(BAND_COUNT - 1, lo + 1);
        const w = weights[index + 3], pin = weights[index + 4];
        const push = (state.contactBands[lo] * (1 - w) + state.contactBands[hi] * w) * pin;
        piece.positions[i + 1] -= push;
        piece.positions[i + 2] += (lift[lo] * (1 - w) + lift[hi] * w) * pin;
        if (fur && piece.normals && lo !== hi) {
          const dyDz = (state.contactBands[hi] - state.contactBands[lo]) * weights[index + 5];
          piece.normals[i + 2] -= piece.normals[i + 1] * dyDz;
        }
      }
      if (!fur && piece.normals) {
        rebuildNormals(piece.positions, piece.indices, piece.normals, null);
      }
    }
  }
  pressUnderMountedGear(state, arm, backGear, rear);
  const peltBounds = foldPieceBounds(state.moving);
  if (peltBounds && arm.bounds) {
    for (const axis of ['X', 'Y', 'Z']) {
      const lo = 'min' + axis, hi = 'max' + axis;
      arm.bounds[lo] = Math.min(arm.bounds[lo], peltBounds[lo]);
      arm.bounds[hi] = Math.max(arm.bounds[hi], peltBounds[hi]);
    }
  }
  return true;
}
