// BODY-SHAPE: the appearance editor's body sliders, as vertex morphs of the player's posed body.
//
// Every region is found the way the body itself is built, not by a fraction of its bounding box:
// - HEIGHTS come from the skeleton's own bones in the pose (pelvis, spine, spine1, spine2, neck) - the
//   chest is where Bip01 Spine2 is, the waist where Spine1 is, the hips where the Thighs join;
// - LIMBS come from the skin's own weights - a vertex is arm, leg or trunk by the bones that move it,
//   so an arm hanging at the hip is never widened by "hips", nor a thigh by "waist".
// The former masks were fractions of the body's box measured WITHOUT the head (the head is its own piece),
// against heights picked for a body WITH one: "breast" landed on the belly, "waist" on the groin, "hips"
// in the gap between the legs. REST_LANDMARKS is the fallback, measured on Better Bodies' bb_skinf_no /
// bb_skinm_no at rest (feet 0, neck top 1), for a body whose skeleton names no Bip01 bones.

export const REST_LANDMARKS = Object.freeze({
  neck: 0.929, spine2: 0.844, spine1: 0.756, spine: 0.668, pelvis: 0.605, knee: 0.363, ankle: 0.06,
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clampMorph = (value) => Math.max(-1, Math.min(1, Number(value) || 0));
const gauss = (v, center, width) => Math.exp(-(((v - center) / width) ** 2));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};

const ARM_BONE = /upperarm|upper arm|forearm|hand|finger|wrist/;
const HAND_BONE = /hand|finger|wrist/;
const LEG_BONE = /thigh|calf|foot|toe|upper leg|knee|ankle/;
const TAIL_BONE = /tail/;   // BEASTS: the Argonian's and the Khajiit's - neither trunk nor limb, and no slider's
const sideOfBone = (name) => (/\bl\b|^left|\bleft\b/.test(name) ? 1 : /\br\b|^right|\bright\b/.test(name) ? -1 : 0);

/** Per-vertex limb weights from the piece's skin: arm (hands included), hand, leg - each split left (+x) / right. */
function regionsOf(piece, skeleton) {
  const skin = piece.batch?.skin;
  if (piece._shapeRegions && piece._shapeRegions.skin === skin) return piece._shapeRegions;
  const n = piece.positions.length / 3;
  const r = { skin, armL: new Float32Array(n), armR: new Float32Array(n), handL: new Float32Array(n), handR: new Float32Array(n),
    legL: new Float32Array(n), legR: new Float32Array(n), tail: new Float32Array(n), weighted: !!skin?.bones?.length };
  for (const bone of skin?.bones ?? []) {
    const name = String(skeleton?.nodes?.get?.(bone.ref)?.name ?? bone.name ?? '').toLowerCase();
    if (TAIL_BONE.test(name)) {
      for (let k = 0; k < bone.indices.length; k++) if (bone.indices[k] < n) r.tail[bone.indices[k]] += bone.weights[k];
      continue;
    }
    const side = sideOfBone(name);
    const arm = ARM_BONE.test(name), leg = !arm && LEG_BONE.test(name);
    if (!arm && !leg) continue;
    const hand = arm && HAND_BONE.test(name);
    for (let k = 0; k < bone.indices.length; k++) {
      const v = bone.indices[k], w = bone.weights[k];
      if (v >= n) continue;
      // a side-less limb bone (a test rig's "Bip01 Thigh") goes by where its vertex stands
      const s = side || (piece.positions[v * 3] >= 0 ? 1 : -1);
      if (arm) (s > 0 ? r.armL : r.armR)[v] += w;
      if (hand) (s > 0 ? r.handL : r.handR)[v] += w;
      if (leg) (s > 0 ? r.legL : r.legR)[v] += w;
    }
  }
  piece._shapeRegions = r;
  return r;
}

// THE SEAMS: a body is several shapes (Better Bodies' "Tri Chest", "Tri Groin", "Tri Right Upper Leg"...) whose edges
// meet at coincident vertices, and two shapes may weight one seam corner differently. Moved by their own weights the
// two corners part and the body tears at the waist, the hips, the shoulders. Every corner standing where another does
// takes their average, so the seam moves as one.
const REGION_KEYS = ['armL', 'armR', 'handL', 'handR', 'legL', 'legR', 'tail'];
function weldRegions(pieces, skeleton, cell) {
  const groups = new Map();
  for (const p of pieces) {
    const r = regionsOf(p, skeleton);
    const n = p.positions.length / 3;
    if (!r.welded || r.welded.armL.length !== n) r.welded = Object.fromEntries(REGION_KEYS.map((k) => [k, new Float32Array(n)]));
    for (let v = 0; v < n; v++) {
      const key = `${Math.round(p.positions[v * 3] / cell)},${Math.round(p.positions[v * 3 + 1] / cell)},${Math.round(p.positions[v * 3 + 2] / cell)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, g = []);
      g.push(r, v);
    }
  }
  for (const g of groups.values()) {
    const count = g.length / 2;
    for (const k of REGION_KEYS) {
      let sum = 0;
      for (let j = 0; j < g.length; j += 2) sum += g[j][k][g[j + 1]];
      for (let j = 0; j < g.length; j += 2) g[j].welded[k][g[j + 1]] = sum / count;
    }
  }
}

/**
 * THE SEAMS' LIGHT: each shape's normals are recomputed from its own triangles after the morph, so the two corners of a
 * seam face two ways and the light breaks along it - a line round the waist where Tri Chest meets Tri Groin. Corners
 * standing together take one normal, their sum's. Called once all the body's shapes are deformed.
 */
export function weldMorphedNormals(pieces, frame) {
  const cell = Math.max(0.02, ((frame?.z?.neck ?? 1) - (frame?.z?.pelvis ?? 0)) * 0.004);
  const groups = new Map();
  for (const p of pieces) {
    if (!p.normals || p.normals.length !== p.positions.length) continue;
    for (let v = 0; v < p.positions.length / 3; v++) {
      const key = `${Math.round(p.positions[v * 3] / cell)},${Math.round(p.positions[v * 3 + 1] / cell)},${Math.round(p.positions[v * 3 + 2] / cell)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, g = []);
      g.push(p.normals, v * 3);
    }
  }
  for (const g of groups.values()) {
    if (g.length < 4) continue;
    let x = 0, y = 0, z = 0;
    for (let j = 0; j < g.length; j += 2) { x += g[j][g[j + 1]]; y += g[j][g[j + 1] + 1]; z += g[j][g[j + 1] + 2]; }
    const len = Math.hypot(x, y, z);
    if (len < 1e-8) continue;
    for (let j = 0; j < g.length; j += 2) { g[j][g[j + 1]] = x / len; g[j][g[j + 1] + 1] = y / len; g[j][g[j + 1] + 2] = z / len; }
  }
}

/** The frame a bounding box alone gives: the rest landmarks over its height, front along -y. */
export function bodyFrameFromBounds(bounds) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const spanZ = Math.max(1e-5, maxZ - minZ);
  const at = (f) => minZ + spanZ * f;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const torsoHalfX = Math.max(1e-5, Number(bounds.torsoHalfX) || (maxX - minX) * 0.5);
  const torsoHalfY = Math.max(1e-5, Number(bounds.torsoHalfY) || (maxY - minY) * 0.5);
  const leg = (side) => {
    const x = cx + side * torsoHalfX * 0.55;
    return { hip: [x, cy, at(REST_LANDMARKS.pelvis)], knee: [x, cy, at(REST_LANDMARKS.knee)], ankle: [x, cy, at(REST_LANDMARKS.ankle)] };
  };
  return {
    minZ, maxZ, cx, cy, front: -1, torsoHalfX, torsoHalfY,
    z: Object.fromEntries(Object.entries(REST_LANDMARKS).map(([k, f]) => [k, at(f)])),
    legs: { 1: leg(1), [-1]: leg(-1) }, arms: { 1: null, [-1]: null },
  };
}

/**
 * Measure the posed body once per pose: its box, the skeleton's landmarks in the same rig space as the
 * skinned vertices (`mats`, the pose's skeleton-space matrices), the front, and the torso's half-width and
 * half-depth from the trunk's own vertices between the pelvis and the chest.
 */
export function measureBodyFrame(pieces, skeleton = null, mats = null) {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of pieces) for (let i = 0; i + 2 < p.positions.length; i += 3) {
    const x = p.positions[i], y = p.positions[i + 1], z = p.positions[i + 2];
    if (!Number.isFinite(x + y + z)) continue;
    if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
    if (z < b.minZ) b.minZ = z; if (z > b.maxZ) b.maxZ = z;
  }
  if (!Number.isFinite(b.minX)) return null;
  const frame = bodyFrameFromBounds(b);
  const bone = (name) => {
    const ref = skeleton?.byName?.get?.(name);
    const t = ref == null ? null : mats?.get?.(ref)?.t;
    return t && Number.isFinite(t[0] + t[1] + t[2]) ? [t[0], t[1], t[2]] : null;
  };
  const neck = bone('bip01 neck'), spine2 = bone('bip01 spine2'), spine1 = bone('bip01 spine1');
  const spine = bone('bip01 spine'), pelvis = bone('bip01 pelvis');
  if (neck && spine2 && spine1 && pelvis) {
    Object.assign(frame.z, { neck: neck[2], spine2: spine2[2], spine1: spine1[2], spine: (spine ?? spine1)[2], pelvis: pelvis[2] });
    frame.cx = spine1[0]; frame.cy = spine1[1];
  }
  let toeY = 0, toes = 0;
  for (const side of [1, -1]) {
    const s = side > 0 ? 'l' : 'r';
    const hip = bone(`bip01 ${s} thigh`), knee = bone(`bip01 ${s} calf`), ankle = bone(`bip01 ${s} foot`), toe = bone(`bip01 ${s} toe0`);
    if (hip && knee && ankle) frame.legs[side] = { hip, knee, ankle };
    if (ankle && toe) { toeY += toe[1] - ankle[1]; toes++; }
    const shoulder = bone(`bip01 ${s} upperarm`), elbow = bone(`bip01 ${s} forearm`), wrist = bone(`bip01 ${s} hand`);
    if (shoulder && elbow && wrist) frame.arms[side] = { shoulder, elbow, wrist };
  }
  if (frame.legs[1].knee) frame.z.knee = (frame.legs[1].knee[2] + frame.legs[-1].knee[2]) / 2;
  if (frame.legs[1].ankle) frame.z.ankle = (frame.legs[1].ankle[2] + frame.legs[-1].ankle[2]) / 2;
  // THE FRONT: where the feet point. Retail's base_anim carries no toe bones, and its front is +y where Better Bodies'
  // own rest skeleton faces -y - so without toes the feet's own vertices answer: below the ankle the toes reach far
  // in front of the ankle bone, the heel a little behind it.
  if (!toes) {
    for (const p of pieces) {
      const r = regionsOf(p, skeleton);
      for (let i = 0, v = 0; i + 2 < p.positions.length; i += 3, v++) {
        const side = r.legL[v] >= r.legR[v] ? 1 : -1;
        const ankle = frame.legs[side].ankle;
        if (r.legL[v] + r.legR[v] < 0.5 || p.positions[i + 2] > ankle[2]) continue;
        toeY += p.positions[i + 1] - ankle[1]; toes++;
      }
    }
  }
  if (toes && Math.abs(toeY) > 1e-4) frame.front = Math.sign(toeY);
  weldRegions(pieces, skeleton, Math.max(0.02, (frame.z.neck - frame.z.pelvis) * 0.004));
  // the trunk's own width and depth, from its vertices between the pelvis and the chest
  const xs = [], ys = [];
  for (const p of pieces) {
    const r = regionsOf(p, skeleton);
    for (let i = 0, v = 0; i + 2 < p.positions.length; i += 3, v++) {
      const z = p.positions[i + 2];
      if (z < frame.z.pelvis || z > frame.z.spine2) continue;
      if (r.armL[v] + r.armR[v] + r.legL[v] + r.legR[v] > 0.5) continue;
      xs.push(Math.abs(p.positions[i] - frame.cx)); ys.push(Math.abs(p.positions[i + 1] - frame.cy));
    }
  }
  if (xs.length > 8) {
    xs.sort((a, c) => a - c); ys.sort((a, c) => a - c);
    frame.torsoHalfX = Math.max(1e-5, xs[Math.floor((xs.length - 1) * 0.9)]);
    frame.torsoHalfY = Math.max(1e-5, ys[Math.floor((ys.length - 1) * 0.9)]);
  }
  return frame;
}

/** Where along a limb segment a height falls, 0 at its top and 1 at its bottom, and the axis point there. */
function along(top, bottom, z) {
  const t = clamp01((top[2] - z) / ((top[2] - bottom[2]) || 1e-6));
  return { t, x: top[0] + (bottom[0] - top[0]) * t, y: top[1] + (bottom[1] - top[1]) * t };
}
/** The nearest point on a segment, and the distance along it (0..1). */
function nearestOnSegment(a, b, x, y, z) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len2 = dx * dx + dy * dy + dz * dz || 1e-6;
  const t = clamp01(((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / len2);
  return [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t];
}

function recalculateMorphedNormals(piece) {
  const p = piece.positions, idx = piece.indices;
  if (!p || !idx || !idx.length) return;
  const n = piece.normals && piece.normals.length === p.length ? piece.normals : new Float32Array(p.length);
  n.fill(0);
  for (let k = 0; k + 2 < idx.length; k += 3) {
    const ia = idx[k] * 3, ib = idx[k + 1] * 3, ic = idx[k + 2] * 3;
    const abx = p[ib] - p[ia], aby = p[ib + 1] - p[ia + 1], abz = p[ib + 2] - p[ia + 2];
    const acx = p[ic] - p[ia], acy = p[ic + 1] - p[ia + 1], acz = p[ic + 2] - p[ia + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const j of [ia, ib, ic]) { n[j] += nx; n[j + 1] += ny; n[j + 2] += nz; }
  }
  for (let i = 0; i + 2 < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]);
    if (len > 1e-8) { n[i] /= len; n[i + 1] /= len; n[i + 2] /= len; }
  }
  piece.normals = n;
}

const BODY_SLOTS = new Set(['betterbodies', 'chest', 'groin', 'upperleg', 'lowerleg', 'foot', 'hand']);
export const isMorphedBodySlot = (slot) => BODY_SLOTS.has(String(slot || '').toLowerCase());

/**
 * Deform one posed body piece. `frame` is measureBodyFrame's answer (a bare bounding box is read through
 * bodyFrameFromBounds); `skeleton` names the skin's bones. Never reads already-moved coordinates: every
 * mask is taken from the vertex where the pose put it.
 */
export function deformPlayerBodyGeometry(piece, morph, frame, skeleton = null) {
  if (!isMorphedBodySlot(piece.slot)) return;
  const p = piece.positions;
  if (!p || p.length < 3 || !frame) return;
  const F = frame.z ? frame : bodyFrameFromBounds(frame);
  const m = (key) => clampMorph(morph?.[key]);
  const width = m('bodyWidth'), fullness = m('bodyFullness');
  const shoulder = m('shoulderWidth'), ribcage = m('ribcageWidth');
  const breast = m('breastSize'), breastOut = m('breastProjection'), breastLift = m('breastLift'), breastSpacing = m('breastSpacing');
  const waist = m('waistWidth'), waistDepth = m('waistDepth'), belly = m('abdomenVolume');
  const hip = m('hipWidth'), butt = m('buttockSize'), buttOut = m('buttockProjection'), buttLift = m('buttockLift');
  const thigh = m('thighThickness'), calf = m('calfThickness'), legGap = m('legGap'), arms = m('armThickness');
  const { cx, cy, front, torsoHalfX: hx, torsoHalfY: hy, z: Z } = F;
  const u = Math.max(1e-5, Z.neck - Z.pelvis);   // the trunk's length: every vertical width below is a share of it
  // Measured on Better Bodies in retail's own pose (base_anim_female, its trunk u = neck - pelvis): the nipples stand
  // 0.73u over the pelvis at 0.67 of the torso's half-width, 1.08 of its half-depth in front; the buttocks' peak at the
  // pelvis, 0.75 of the half-depth behind; the belly's fullest front 0.3u over the pelvis.
  const zShoulder = Z.neck - 0.10 * u, zRib = Z.spine2 - 0.12 * u;
  const zWaist = Z.spine1 - 0.06 * u, zBelly = Z.pelvis + 0.30 * u, zHip = Z.pelvis - 0.12 * u;
  const breastC = { x: 0.62 * hx, y: cy + front * 0.40 * hy, z: Z.pelvis + 0.72 * u, r: 0.30 * u };
  const buttC = { x: 0.45 * hx, y: cy - front * 0.25 * hy, z: Z.pelvis - 0.06 * u, r: 0.40 * u };
  // a sphere's pull: 1 at its centre, 0 at its radius, smooth both ends - one volume, never a cone or a shelf
  const sphere = (c, x, y, zz, side) => {
    const dx = x - (cx + side * c.x), dy = y - c.y, dz = zz - c.z;
    const d = Math.hypot(dx, dy, dz);
    const t = 1 - (d / c.r) ** 2;
    return t <= 0 ? null : { w: t * t, dx: dx / (d || 1), dy: dy / (d || 1), dz: dz / (d || 1) };
  };
  const regions = regionsOf(piece, skeleton);
  const r = regions.welded && regions.welded.armL.length === p.length / 3 ? { ...regions.welded, weighted: regions.weighted } : regions;
  for (let i = 0, v = 0; i + 2 < p.length; i += 3, v++) {
    const ox = p[i], oy = p[i + 1], oz = p[i + 2];
    if (!Number.isFinite(ox + oy + oz)) continue;
    const side = ox >= cx ? 1 : -1;
    const lx = (ox - cx) / hx;
    // the two breasts (and buttocks) swell from their own centres, apart by the midline - which never moves sideways,
    // or the cleavage and the cleft would split down the middle
    const midline = smoothstep(0.04, 0.3, Math.abs(lx));
    const depth = ((oy - cy) * front) / hy;   // + in front of the spine, - behind it
    const frontness = smoothstep(0.05, 0.6, depth), rearness = smoothstep(0.05, 0.6, -depth);
    let armW, legW;
    if (r.weighted) {
      armW = r.armL[v] + r.armR[v]; legW = r.legL[v] + r.legR[v];
    } else {   // no skin: the trunk is what stands within it, the legs what stands below the pelvis
      armW = oz > Z.pelvis ? smoothstep(1.1, 1.5, Math.abs(lx)) : 0;
      legW = oz < Z.pelvis ? smoothstep(0.05, 0.3, Math.abs(lx)) * smoothstep(Z.pelvis, Z.pelvis - 0.25 * u, oz) : 0;
    }
    const tailW = r.tail ? r.tail[v] : 0;
    const trunk = clamp01(1 - armW - legW - tailW);
    const upperThigh = legW * smoothstep(Z.knee + 0.45 * (Z.pelvis - Z.knee), Z.pelvis, oz);   // the buttock and hip flesh the thigh bones carry
    let x = cx + (ox - cx) * (1 + width * 0.15);
    let y = cy + (oy - cy) * (1 + fullness * 0.14);
    let z = oz;

    // shoulders: the trunk widens and the arms go with it, so the joint never tears
    const shoulderDelta = shoulder * 0.22 * hx;
    x += Math.max(-1.3, Math.min(1.3, lx)) * shoulderDelta * gauss(oz, zShoulder, 0.10 * u) * trunk;
    x += side * shoulderDelta * armW;
    x += (ox - cx) * ribcage * 0.12 * gauss(oz, zRib, 0.10 * u) * trunk;

    // breasts: two spheres in front of the chest - size swells each from its own centre, the rest move it whole
    const sB = trunk > 1e-3 && depth > -0.2 ? sphere(breastC, ox, oy, oz, side) : null;
    if (sB) {
      const w = sB.w * trunk * smoothstep(-0.2, 0.4, depth);
      const swell = breast * 0.10 * u * w;
      x += (sB.dx * swell + side * breastSpacing * 0.06 * u * w) * midline;
      y += sB.dy * swell + front * breastOut * 0.10 * u * w;
      z += sB.dz * swell + breastLift * 0.06 * u * w;
    }

    // waist and belly
    const mW = gauss(oz, zWaist, 0.12 * u) * trunk;
    x += (ox - cx) * 0.22 * waist * mW;
    y += (oy - cy) * 0.18 * waistDepth * mW;
    y += front * hy * 0.35 * belly * gauss(oz, zBelly, 0.13 * u) * gauss(lx, 0, 0.7) * frontness * trunk;

    // hips and buttocks: the pelvis and the top of the thighs together
    const hipFlesh = trunk + upperThigh;
    x += (ox - cx) * 0.20 * hip * gauss(oz, zHip, 0.16 * u) * hipFlesh;
    const sBt = hipFlesh > 1e-3 && depth < 0.2 ? sphere(buttC, ox, oy, oz, side) : null;
    if (sBt) {
      const w = sBt.w * Math.min(1, hipFlesh) * smoothstep(0.2, -0.4, depth);
      const swell = butt * 0.10 * u * w;
      x += sBt.dx * swell * midline;
      y += sBt.dy * swell - front * buttOut * 0.10 * u * w;
      z += sBt.dz * swell + buttLift * 0.06 * u * w;
    }

    // legs: thickened around each leg's own axis, spread from the hip
    if (legW > 1e-4) {
      const legSide = r.weighted ? (r.legL[v] >= r.legR[v] ? 1 : -1) : side;
      const L = F.legs[legSide];
      if (oz > L.knee[2] - 0.02 * u) {
        const a = along(L.hip, L.knee, oz);
        const mT = legW * smoothstep(0.05, 0.4, a.t) * (1 - smoothstep(0.8, 1.05, a.t));   // fading in below the crotch, which the other leg shares
        x += (ox - a.x) * 0.25 * thigh * mT; y += (oy - a.y) * 0.25 * thigh * mT;
      } else {
        const a = along(L.knee, L.ankle, oz);
        const mC = legW * Math.sin(Math.PI * Math.min(1, a.t * 1.15));
        x += (ox - a.x) * 0.25 * calf * mC; y += (oy - a.y) * 0.25 * calf * mC;
      }
      x += legSide * legGap * 0.40 * hx * legW * clamp01((L.hip[2] - oz) / ((L.hip[2] - L.ankle[2]) || 1e-6));
    }

    // arms: thickened around the upper arm and forearm, never the hand
    if (armW > 1e-4 && arms) {
      const armSide = r.weighted ? (r.armL[v] >= r.armR[v] ? 1 : -1) : side;
      const thick = r.weighted ? clamp01(armW - r.handL[v] - r.handR[v]) : armW;
      const A = F.arms[armSide];
      if (A) {
        const q1 = nearestOnSegment(A.shoulder, A.elbow, ox, oy, oz), q2 = nearestOnSegment(A.elbow, A.wrist, ox, oy, oz);
        const d1 = (ox - q1[0]) ** 2 + (oy - q1[1]) ** 2 + (oz - q1[2]) ** 2, d2 = (ox - q2[0]) ** 2 + (oy - q2[1]) ** 2 + (oz - q2[2]) ** 2;
        const q = d1 <= d2 ? q1 : q2;
        x += (ox - q[0]) * 0.25 * arms * thick; y += (oy - q[1]) * 0.25 * arms * thick; z += (oz - q[2]) * 0.25 * arms * thick;
      } else {
        x += armSide * arms * 0.06 * hx * thick;
      }
    }
    p[i] = x; p[i + 1] = y; p[i + 2] = z;
  }
  recalculateMorphedNormals(piece);
}
