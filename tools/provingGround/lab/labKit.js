// LAB2 (bible/05-Combat/Proving-Ground.md): THE BODY ITSELF, in the booted page - found among the frame's posed
// assemblies, its meshes read where the pose put them (stretch, one piece through another), and its pose and its
// pieces' fit edited through the game's one seam (formats/morrowind/mwPoseLab.js). Laid in beside the kit.
const mod = (p) => import(p);
const RAD = Math.PI / 180;
const M = {};
const lab = { body: null, fresh: false, poses: 0, seen: new Map(), layers: [], rest: new WeakMap(), edges: new WeakMap(), shapes: new WeakMap(), soles: new WeakMap(), applied: 0 };

async function mods() {
  if (M.arm) return M;
  M.fp = await mod('/src/formats/morrowind/mwFirstPerson.js');
  M.skin = await mod('/src/formats/morrowind/mwSkin.js');
  const arm = await mod('/src/combat/fpArm.js');
  M.arm = arm.fpArm; M.toBody = arm.rigPointToBody; M.bonesIn = arm.armBonesInBody;
  M.unit = M.fp.MW_UNITS_PER_METER;
  return M;
}

// ---- small 3x3 algebra, row-major -----------------------------------------------------------------------------------
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul3 = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; };
const tr3 = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
const vec3 = (a, v) => [a[0] * v[0] + a[1] * v[1] + a[2] * v[2], a[3] * v[0] + a[4] * v[1] + a[5] * v[2], a[6] * v[0] + a[7] * v[1] + a[8] * v[2]];
const unit3 = (a) => { const s = Math.hypot(a[0], a[3], a[6]) || 1; return Array.from(a, (v) => v / s); };   // a scaled rotation's rotation
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1;
  return [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det];
}
/** A turn in the rig's own axes (x its right, y its forward, z up), degrees: `pitch` leans forward, `roll` leans to the
 *  right, `twist` turns to the left. */
function turn([pitch = 0, roll = 0, twist = 0] = []) {
  const p = -pitch * RAD, r = roll * RAD, t = twist * RAD;
  const X = [1, 0, 0, 0, Math.cos(p), -Math.sin(p), 0, Math.sin(p), Math.cos(p)];
  const Y = [Math.cos(r), 0, Math.sin(r), 0, 1, 0, -Math.sin(r), 0, Math.cos(r)];
  const Z = [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0, 0, 0, 1];
  return mul3(Z, mul3(Y, X));
}
/** [right, up, forward] centimetres as the rig's own units ([right, forward, up]). */
const rigMove = ([r = 0, u = 0, f = 0] = []) => [r, f, u].map((v) => (v / 100) * M.unit);

// ---- the body among the frame's assemblies ---------------------------------------------------------------------------
function findBody() {
  const seen = lab.seen;
  if (!seen.size) return lab.fresh ? lab.body : null;   // no pose since the last look: what stood then stands
  if (!(lab.body && seen.has(lab.body))) {
    // THE BODY IS THE ASSEMBLY THE GAME DRAWS AS THE THIRD PERSON: the one that owns the drawn mesh's pieces. (Its bones
    // would not tell it: the game answers the pose it DREW, a frame behind the pose just made.)
    const piece = M.arm.thirdMesh?.()?.ranges?.find((r) => r.piece)?.piece ?? null;
    lab.body = (piece && [...seen.keys()].find((a) => a.pieces?.includes(piece))) || lab.body;
  }
  lab.fresh = !!lab.body && seen.has(lab.body);   // a body not posed this frame is a rig since rebuilt: never read as this frame's
  lab.poses = lab.fresh ? seen.get(lab.body) : 0;
  seen.clear();
  return lab.fresh ? lab.body : null;
}

// The bones a frame is read by (the kit's own list, and the trunk's and shoulders' between them).
const BONES = ['bip01 pelvis', 'bip01 spine', 'bip01 spine1', 'bip01 spine2', 'bip01 neck', 'bip01 head', 'bip01 l clavicle', 'bip01 r clavicle',
  'bip01 l thigh', 'bip01 r thigh', 'bip01 l calf', 'bip01 r calf', 'bip01 l foot', 'bip01 r foot', 'bip01 l upperarm', 'bip01 r upperarm',
  'bip01 l forearm', 'bip01 r forearm', 'bip01 l hand', 'bip01 r hand', 'weapon bone', 'shield bone'];

/**
 * THE SOLES. An ankle is no contact: it swings low over the ground. On what the feet wear (a boot, or the body's own
 * foot), the vertices a foot bone carries are taken to the rest pose; the lowest of them are the sole, its hindmost
 * the heel and its foremost the ball. Each is kept in its bone's own space and rides the bone from then on.
 */
function solesOf(body) {
  if (lab.soles.get(body)?.pieces === body.pieces.length) return lab.soles.get(body).found;
  const { skeleton } = body, rest = restMats(skeleton), found = {};
  for (const [side, name] of [['l', 'bip01 l foot'], ['r', 'bip01 r foot']]) {
    const ref = skeleton.byName.get(name), base = rest.get(ref);
    if (ref == null || !base) continue;
    const cloud = [];   // [x, y, z in the rest pose, then x, y, z in the bone's space]
    for (const p of body.pieces) {
      if (p.kind !== 'skinned') continue;
      const bone = p.batch.skin?.bones?.find((b) => b.ref === ref);
      if (!bone) continue;
      const pos = p.batch.positions, inv = bone.invBind;
      for (let k = 0; k < bone.indices.length; k++) {
        if (bone.weights[k] < 0.6) continue;
        const v = bone.indices[k] * 3, q = vec3(inv.a, [pos[v], pos[v + 1], pos[v + 2]]).map((c, i) => c + inv.t[i]);
        cloud.push([...vec3(base.a, q).map((c, i) => c + base.t[i]), ...q]);
      }
    }
    if (cloud.length < 6) continue;
    const floor = Math.min(...cloud.map((c) => c[2])), low = cloud.filter((c) => c[2] <= floor + 0.02 * M.unit);
    const heel = low.reduce((a, c) => (c[1] < a[1] ? c : a)), ball = low.reduce((a, c) => (c[1] > a[1] ? c : a));
    found[`${side} heel`] = { ref, at: heel.slice(3) }; found[`${side} ball`] = { ref, at: ball.slice(3) };
  }
  lab.soles.set(body, { pieces: body.pieces.length, found });
  return found;
}

const slotOf = (p) => String(p.slot ?? 'piece');
/** The bone a piece rides: a rigid one's attachment, a skinned one's heaviest. */
function anchorOf(p, skeleton) {
  if (p.kind !== 'skinned') return p.attachRef ?? null;
  let best = null, top = -1;
  for (const b of p.batch?.skin?.bones ?? []) {
    if (b.ref == null) continue;
    let w = 0; for (let k = 0; k < b.weights.length; k++) w += b.weights[k];
    if (w > top) { top = w; best = b.ref; }
  }
  return best ?? skeleton.byName.get('bip01 spine1') ?? null;
}
const nameOf = (skeleton, ref) => (ref != null && skeleton.nodes.has(ref) ? skeleton.nodes.get(ref).name : null);

// ---- the edit: layers of bone turns and piece fits --------------------------------------------------------------------
function applies(layer, s) {
  const w = layer.when;
  if (!w) return true;
  const attack = /^attack/i.test(String(s.upperName ?? ''));
  const gait = s.jumpGroup ? 'air' : !s.movementGroup ? 'stand' : /^run/i.test(s.movementGroup) ? 'run' : /^sneak/i.test(s.movementGroup) ? 'sneak' : 'walk';
  return (w.cls == null || w.cls === s.motion?.cls) && (w.gait == null || w.gait === gait) && (w.attack == null || w.attack === attack);
}

function edit(assembly, pose) {
  if (assembly !== lab.body) return;
  const { skeleton, fns, pieces } = assembly;
  for (const p of pieces) if (p.labFit) p.labFit = null;
  if (!lab.layers.length) return;
  const state = lab.layers.some((l) => l.when) ? M.arm.status() : null;
  let any = false;
  for (const layer of lab.layers) {
    const want = layer.on !== false && applies(layer, state ?? {}) ? 1 : 0;
    layer.w = (layer.w ?? want) + Math.max(-0.12, Math.min(0.12, want - (layer.w ?? want)));   // eased, so a state's edge is no leap
    if (layer.w > 1e-3) any = true;
  }
  if (!any) return;
  const before = fns.skelMats(skeleton, pose, M.skin.GRAPH_ROOT);
  for (const layer of lab.layers) {
    if (!(layer.w > 1e-3)) continue;
    for (const [name, t] of Object.entries(layer.bones ?? {})) {
      const ref = skeleton.byName.get(name), node = ref != null ? skeleton.nodes.get(ref) : null;
      if (!node) continue;
      const local = pose.get(ref) ?? node.rest;
      const parent = unit3(before.get(node.parent)?.a ?? I3), back = tr3(parent);
      const delta = mul3(back, mul3(turn((t.rot ?? [0, 0, 0]).map((v) => v * layer.w)), parent));
      const move = vec3(back, rigMove((t.move ?? [0, 0, 0]).map((v) => v * layer.w)));
      const rotation = mul3(delta, Array.from(local.rotation ?? I3));
      pose.set(ref, { ...local, rotation: local.rotation instanceof Float32Array ? Float32Array.from(rotation) : rotation,
        translation: [0, 1, 2].map((i) => (local.translation?.[i] ?? 0) + move[i]),
        scale: (typeof local.scale === 'number' ? local.scale : 1) * (1 + ((t.scale ?? 1) - 1) * layer.w) });
    }
  }
  const fits = new Map();
  for (const layer of lab.layers) {
    if (!(layer.w > 1e-3)) continue;
    for (const [slot, t] of Object.entries(layer.pieces ?? {})) {
      const f = fits.get(slot) ?? { move: [0, 0, 0], rot: [0, 0, 0], scale: 1, about: null };
      for (let i = 0; i < 3; i++) { f.move[i] += (t.move?.[i] ?? 0) * layer.w; f.rot[i] += (t.rot?.[i] ?? 0) * layer.w; }
      f.scale *= 1 + ((t.scale ?? 1) - 1) * layer.w; f.about = t.about ?? f.about;
      fits.set(slot, f);
    }
  }
  if (!fits.size) { lab.applied++; return; }
  const mats = fns.skelMats(skeleton, pose, M.skin.GRAPH_ROOT);
  for (const p of pieces) {
    const f = fits.get(slotOf(p));
    if (!f) continue;
    const ref = (f.about && skeleton.byName.get(String(f.about).toLowerCase())) ?? anchorOf(p, skeleton);
    const bone = mats.get(ref);
    if (!bone) continue;
    // the fit is said in the rig's axes as the bone stands at REST, then rides the bone: "up" stays the helm's own up
    const rest = unit3(restMats(skeleton).get(ref)?.a ?? I3), toBone = tr3(rest);
    const local = mul3(toBone, mul3(turn(f.rot).map((v) => v * f.scale), rest));
    const a = mul3(Array.from(bone.a), mul3(local, inv3(Array.from(bone.a))));
    const shift = vec3(Array.from(bone.a), vec3(toBone, rigMove(f.move))), pivot = vec3(a, bone.t);
    p.labFit = { a: Float32Array.from(a), t: [0, 1, 2].map((i) => bone.t[i] + shift[i] - pivot[i]) };
  }
  lab.applied++;
}
function restMats(skeleton) {
  let m = lab.rest.get(skeleton);
  if (!m) lab.rest.set(skeleton, (m = M.skin.skeletonSpaceMatrices(skeleton, new Map(), M.skin.GRAPH_ROOT)));
  return m;
}

const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : 0);
const triple = (v, lo, hi) => [0, 1, 2].map((i) => num(v?.[i], lo, hi));
function cleanLayer(l, i) {
  const out = { name: String(l?.name ?? `layer ${i + 1}`).slice(0, 80), on: l?.on !== false, when: null, bones: {}, pieces: {} };
  if (l?.when && typeof l.when === 'object') {
    out.when = {};
    if (typeof l.when.cls === 'string') out.when.cls = l.when.cls.slice(0, 24);
    if (['stand', 'walk', 'run', 'sneak', 'air'].includes(l.when.gait)) out.when.gait = l.when.gait;
    if (typeof l.when.attack === 'boolean') out.when.attack = l.when.attack;
    if (!Object.keys(out.when).length) out.when = null;
  }
  for (const [name, t] of Object.entries(l?.bones ?? {}).slice(0, 64)) out.bones[String(name).toLowerCase().slice(0, 64)] = { rot: triple(t?.rot, -180, 180), move: triple(t?.move, -100, 100), scale: t?.scale == null ? 1 : num(t.scale, 0.2, 5) };
  for (const [slot, t] of Object.entries(l?.pieces ?? {}).slice(0, 64)) out.pieces[String(slot).slice(0, 64)] = { rot: triple(t?.rot, -180, 180), move: triple(t?.move, -100, 100), scale: t?.scale == null ? 1 : num(t.scale, 0.2, 5), about: typeof t?.about === 'string' ? t.about.slice(0, 64) : null };
  return out;
}

// ---- the meshes where the pose put them -------------------------------------------------------------------------------
/** A piece's vertices in the rig's space this pose: the CPU skin's own when it ran, else skinned or placed here. */
function posed(p, body) {
  if (body.cpuSkinned && p.positions) return p.positions;
  const { skeleton, pose, mats, fns } = body;
  let out;
  if (p.kind === 'skinned') {
    out = new Float32Array(p.batch.positions.length);
    fns.skinBatch(p.batch, skeleton, pose, mats, out, null);
  } else {
    if (!p.source) return null;
    const at = p.followAt ?? fns.attachmentTransform(mats, p.attachRef);
    out = M.fp.placeAtBone(p.source, p.hang ? M.fp.hangAffine(at, p.hang) : at, p.mirrored, new Float32Array(p.source.length), p.boneOffset);
  }
  const fit = p.labFit;
  if (fit) for (let i = 0; i < out.length; i += 3) { const v = vec3(fit.a, [out[i], out[i + 1], out[i + 2]]); out[i] = v[0] + fit.t[0]; out[i + 1] = v[1] + fit.t[1]; out[i + 2] = v[2] + fit.t[2]; }
  return out;
}

/** A skinned piece's edges with their authored lengths, and each vertex's heaviest bone - made once a piece. */
function edgesOf(p) {
  let e = lab.edges.get(p);
  if (e) return e;
  const pos = p.batch.positions, idx = p.indices ?? p.batch.indices, seen = new Set(), pairs = [], rest = [];
  for (let c = 0; c + 2 < idx.length; c += 3) {
    for (const [u, v] of [[idx[c], idx[c + 1]], [idx[c + 1], idx[c + 2]], [idx[c + 2], idx[c]]]) {
      const lo = Math.min(u, v), hi = Math.max(u, v), key = lo * 65536 + hi;
      if (seen.has(key)) continue;
      seen.add(key);
      const l = Math.hypot(pos[lo * 3] - pos[hi * 3], pos[lo * 3 + 1] - pos[hi * 3 + 1], pos[lo * 3 + 2] - pos[hi * 3 + 2]);
      if (l < 0.6) continue;   // under a centimetre: its ratio is noise
      pairs.push(lo, hi); rest.push(l);
    }
  }
  const owner = new Int32Array(pos.length / 3).fill(-1), weight = new Float32Array(pos.length / 3);
  for (const b of p.batch.skin?.bones ?? []) {
    if (b.ref == null) continue;
    for (let k = 0; k < b.indices.length; k++) if (b.weights[k] > weight[b.indices[k]]) { weight[b.indices[k]] = b.weights[k]; owner[b.indices[k]] = b.ref; }
  }
  lab.edges.set(p, (e = { pairs: Uint32Array.from(pairs), rest: Float32Array.from(rest), owner }));
  return e;
}

/** THE LAYERS a body wears, inside out, by what a piece is: 0 the body, 1 cloth, 2 armour, 3 what the hands hold. */
function layerOf(p) {
  // a slot reads `part` for the body's own piece and `part (model)` for a worn one: the model says cloth or plate
  const s = slotOf(p).toLowerCase(), model = /\(([^)]*)\)/.exec(s)?.[1] ?? null;
  if (/^(weapon|shield|arrow|quiver|torch|sheath|holster|lantern)/.test(s)) return 3;
  if (model == null) return 0;
  return /cuirass|pauldron|greave|gauntlet|bracer|boot|helm|armor|armour|steel|iron|plate|chain|leather|ebony|dwarven|orcish|daedric|glass|mithril|adamant|elven/.test(s) ? 2 : 1;
}

/** A mesh's OWN SHAPE, made once a piece from its authored vertices: which triangle edges are its border (an edge only
 *  one triangle owns, the seams welded first - a UV seam doubles a vertex and is no border), which vertices stand on
 *  it, and the bones the piece rides. */
function shapeOf(p, skeleton) {
  let shape = lab.shapes.get(p);
  if (shape) return shape;
  const pos = p.kind === 'skinned' ? p.batch.positions : p.source, idx = p.indices ?? p.batch?.indices, count = pos.length / 3, weld = new Map(), id = new Int32Array(count);
  for (let v = 0; v < count; v++) { const k = `${Math.round(pos[v * 3] * 20)},${Math.round(pos[v * 3 + 1] * 20)},${Math.round(pos[v * 3 + 2] * 20)}`; let w = weld.get(k); if (w === undefined) weld.set(k, (w = weld.size)); id[v] = w; }
  const edges = new Map(), pair = (u, v) => Math.min(id[u], id[v]) * 1048576 + Math.max(id[u], id[v]);
  for (let c = 0; c + 2 < idx.length; c += 3) for (const [u, v] of [[idx[c], idx[c + 1]], [idx[c + 1], idx[c + 2]], [idx[c + 2], idx[c]]]) if (id[u] !== id[v]) edges.set(pair(u, v), (edges.get(pair(u, v)) ?? 0) + 1);
  const open = new Uint8Array(idx.length), rimWeld = new Uint8Array(weld.size);   // open[c + k]: the triangle's edge k (AB, BC, CA) is border
  for (let c = 0; c + 2 < idx.length; c += 3) [[idx[c], idx[c + 1]], [idx[c + 1], idx[c + 2]], [idx[c + 2], idx[c]]].forEach(([u, v], k) => {
    if (id[u] !== id[v] && edges.get(pair(u, v)) === 1) { open[c + k] = 1; rimWeld[id[u]] = 1; rimWeld[id[v]] = 1; }
  });
  const rim = new Uint8Array(count);
  for (let v = 0; v < count; v++) rim[v] = rimWeld[id[v]];
  const bones = new Set(), owner = new Int32Array(count).fill(-1);
  if (p.kind === 'skinned') {
    const weight = new Float32Array(count);
    for (const b of p.batch.skin?.bones ?? []) {
      if (b.ref == null) continue;
      bones.add(b.ref);
      for (let k = 0; k < b.indices.length; k++) if (b.weights[k] > weight[b.indices[k]]) { weight[b.indices[k]] = b.weights[k]; owner[b.indices[k]] = b.ref; }
    }
  } else if (p.attachRef != null) {
    // a rigid piece rides its attachment and covers what that node hangs from (a helm on the head's node covers the head)
    for (let ref = p.attachRef, n = 0; ref != null && ref >= 0 && n < 3; ref = skeleton.nodes.get(ref)?.parent, n++) bones.add(ref);
    owner.fill(p.attachRef);
  }
  lab.shapes.set(p, (shape = { idx, open, rim, bones, owner }));
  return shape;
}

/** The point of triangle a-b-c nearest `p`, into `q`; answers where it lies: 0 inside the face, 1-3 on edge AB, BC or
 *  CA, 4-6 on corner A, B or C (Ericson's closest point). */
function nearestOnTriangle(p, a, b, c, q) {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { q[0] = a[0]; q[1] = a[1]; q[2] = a[2]; return 4; }
  const bpx = p[0] - b[0], bpy = p[1] - b[1], bpz = p[2] - b[2], d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { q[0] = b[0]; q[1] = b[1]; q[2] = b[2]; return 5; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q[0] = a[0] + abx * v; q[1] = a[1] + aby * v; q[2] = a[2] + abz * v; return 1; }
  const cpx = p[0] - c[0], cpy = p[1] - c[1], cpz = p[2] - c[2], d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { q[0] = c[0]; q[1] = c[1]; q[2] = c[2]; return 6; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q[0] = a[0] + acx * w; q[1] = a[1] + acy * w; q[2] = a[2] + acz * w; return 3; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); q[0] = b[0] + (c[0] - b[0]) * w; q[1] = b[1] + (c[1] - b[1]) * w; q[2] = b[2] + (c[2] - b[2]) * w; return 2; }
  const k = 1 / (va + vb + vc), v = vb * k, w = vc * k;
  q[0] = a[0] + abx * v + acx * w; q[1] = a[1] + aby * v + acy * w; q[2] = a[2] + abz * v + acz * w;
  return 0;
}

/**
 * ONE MESH THROUGH ANOTHER, read off the surfaces: each of `inner`'s vertices against the nearest point of `outer`'s
 * triangles. `side` 1 finds a vertex standing OUTSIDE the shell (the body out through plate), -1 one INSIDE it (a
 * blade in the body). Not a finding: a vertex nearest the shell's border (it is beside the shell), one with a second
 * surface of the shell at its back (a lining, a fold), and - with `ride` - one whose bone the shell does not ride
 * (a hand beside the trunk). Answers the count, the deepest, and where.
 */
function through(inner, outer, { side, cm, reach, ride = false }) {
  const op = outer.pos, { idx, open, rim, bones } = outer.shape, cell = reach * 2, grid = new Map();
  const tri = idx.length / 3, nx = new Float32Array(tri), ny = new Float32Array(tri), nz = new Float32Array(tri);
  const A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0], Q = [0, 0, 0], P = [0, 0, 0];
  const corner = (o, i) => { o[0] = op[i * 3]; o[1] = op[i * 3 + 1]; o[2] = op[i * 3 + 2]; };
  for (let t = 0; t < tri; t++) {
    corner(A, idx[t * 3]); corner(B, idx[t * 3 + 1]); corner(C, idx[t * 3 + 2]);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z);
    if (l < 1e-9) continue;   // a triangle with no face has no side
    nx[t] = x / l; ny[t] = y / l; nz[t] = z / l;
    const lo = (k) => Math.floor((Math.min(A[k], B[k], C[k]) - reach) / cell), hi = (k) => Math.floor((Math.max(A[k], B[k], C[k]) + reach) / cell);
    for (let i = lo(0); i <= hi(0); i++) for (let j = lo(1); j <= hi(1); j++) for (let k = lo(2); k <= hi(2); k++) { const key = `${i},${j},${k}`; let b = grid.get(key); if (!b) grid.set(key, (b = [])); b.push(t); }
  }
  const ip = inner.pos, own = inner.shape.owner, limit = (cm / 100) * M.unit, fold = 0.02 * M.unit;
  let count = 0, worst = 0, at = null;
  for (let v = 0; v < ip.length / 3; v++) {
    if (ride && !bones.has(own[v])) continue;
    P[0] = ip[v * 3]; P[1] = ip[v * 3 + 1]; P[2] = ip[v * 3 + 2];
    const near = grid.get(`${Math.floor(P[0] / cell)},${Math.floor(P[1] / cell)},${Math.floor(P[2] / cell)}`);
    if (!near) continue;
    let best = reach, hit = -1, where = 0, along = 0;
    for (const t of near) {
      corner(A, idx[t * 3]); corner(B, idx[t * 3 + 1]); corner(C, idx[t * 3 + 2]);
      const region = nearestOnTriangle(P, A, B, C, Q), d = Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]);
      if (d < best) { best = d; hit = t; where = region; along = ((P[0] - Q[0]) * nx[t] + (P[1] - Q[1]) * ny[t] + (P[2] - Q[2]) * nz[t]) * side; }
    }
    if (hit < 0 || along < limit) continue;
    if (where >= 4 ? rim[idx[hit * 3 + where - 4]] : where >= 1 && open[hit * 3 + where - 1]) continue;
    let between = false;
    for (const t of near) {
      if (t === hit || nx[t] * nx[hit] + ny[t] * ny[hit] + nz[t] * nz[hit] > -0.3) continue;
      corner(A, idx[t * 3]); corner(B, idx[t * 3 + 1]); corner(C, idx[t * 3 + 2]);
      nearestOnTriangle(P, A, B, C, Q);
      if (Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]) <= best + fold && ((P[0] - Q[0]) * nx[t] + (P[1] - Q[1]) * ny[t] + (P[2] - Q[2]) * nz[t]) * side < 0) { between = true; break; }
    }
    if (between) continue;
    count++;
    if (along > worst) { worst = along; at = [P[0], P[1], P[2]]; }
  }
  return { count, worst, at };
}

/** The lab's one ear on the mouse, ahead of the game's: it keeps a quiet move from the game and notes every move. */
function hear() {
  if (window.__labPointerHear) removeEventListener('mousemove', window.__labPointerHear, true);   // a kit laid in again hears by its own code
  window.__labPointerHear = (e) => {
    const m = (window.__labPointer ??= { moves: 0, kept: 0, movement: [0, 0], buttons: 0, held: !!document.pointerLockElement, first: [] });
    if (window.__labQuiet) { m.kept++; e.stopImmediatePropagation(); return; }
    if (m.first.length < 12) m.first.push({ at: [e.clientX, e.clientY], movement: [e.movementX, e.movementY], buttons: e.buttons });
    m.moves++; m.movement[0] += e.movementX; m.movement[1] += e.movementY; m.buttons |= e.buttons;
  };
  addEventListener('mousemove', window.__labPointerHear, true);
}

window.__labKit = {
  /** The body watched (and its edits live), or let go. */
  async watch(on = true) {
    await mods();
    if (!on) { delete globalThis.__mwPoseAssemblyProbe; delete globalThis.__mwPoseAssemblyEdit; lab.body = null; lab.fresh = false; lab.seen.clear(); return false; }
    globalThis.__mwPoseAssemblyProbe = (a) => { lab.seen.set(a, (lab.seen.get(a) ?? 0) + 1); };
    globalThis.__mwPoseAssemblyEdit = edit;
    return true;
  },
  /** THE POINTER HELD AS PLAY HOLDS IT, in the page alone. The game reads a drag only under a pointer lock, and the
   *  ground refuses the system's lock (it took the owner's own mouse - clock.js); so the page is told the canvas holds
   *  the pointer while the system's cursor stays free. The script's drag is then a swing, as a player's is. Letting go
   *  is the player's Escape to the game (player/pointerLock.js opens the pause), so a lab holds it for its session. */
  hold(on = true) {
    hear();
    const under = document.elementFromPoint(640, 360);
    const canvas = under?.tagName === 'CANVAS' ? under : [...document.querySelectorAll('canvas')].sort((p, q) => q.width * q.height - p.width * p.height)[0] ?? null;
    const held = on ? canvas : null;
    if (window.__labHeld === held) return !!held;
    window.__labHeld = held;
    Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => window.__labHeld ?? null, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
    return !!held;
  },
  /** The mouse's moves kept from the game (a jump back to the middle is no look and no swing), or let through again. */
  quiet(on = true) { hear(); window.__labQuiet = !!on; return window.__labQuiet; },
  /** WHAT THE PAGE SAW OF THE MOUSE since the last asking: its moves, their travel as the game reads it (movementX/Y),
   *  the buttons held under them, and the first few whole. */
  mouse() { hear(); const seen = window.__labPointer ?? null; window.__labPointer = null; return seen; },
  /** Why the body is or is not in hand: the watch, the frame's assemblies and the bones each was matched by. */
  async diagnose() {
    await mods();
    const s = M.arm.status(), names = ['bip01 pelvis', 'bip01 head'];
    return { watching: typeof globalThis.__mwPoseAssemblyProbe === 'function', editing: typeof globalThis.__mwPoseAssemblyEdit === 'function', seen: lab.seen.size,
      view: s.viewMode, third: s.third, raceScale: s.raceScale, want: M.arm.thirdBones(names), inHand: !!lab.body, fresh: lab.fresh, posesLastFrame: lab.poses,
      candidates: [...lab.seen].map(([a, n]) => ({ pieces: a.pieces?.length ?? 0, poses: n, mats: !!a.mats, cpu: a.cpuSkinned, isBody: a === lab.body, got: a.mats ? M.bonesIn(a, names, s.raceScale) : null })) };
  },
  /** After a frame: is the player's own body in hand. */
  async sync() { await mods(); return !!findBody(); },
  /** THE POSE JUST MADE, by bone ([right, up, forward] metres from the feet) - the frame the rig's words speak of. The
   *  game's own answer (fpArm.thirdBones) is the pose it DREW, a frame behind; null when the body is not in hand. */
  async bones(names = BONES) {
    await mods();
    const body = findBody();
    if (!body?.mats) return null;
    const scale = M.arm.status().raceScale, out = M.bonesIn(body, names, scale);
    for (const [name, sole] of Object.entries(solesOf(body))) {
      const m = body.mats.get(sole.ref);
      if (m) out[name] = M.toBody(vec3(m.a, sole.at).map((c, i) => c + m.t[i]), scale ?? undefined);
    }
    return out;
  },
  /** The rig as the lab may name it: its bones, its pieces (slot, kind, vertices, the bone each rides), its skin's home. */
  async rig() {
    await mods();
    const body = findBody();
    if (!body) return { status: 'unmeasured', why: 'the third-person body has not been posed' };
    const { skeleton, pieces } = body, slots = new Map();
    for (const p of pieces) {
      const k = slotOf(p), row = slots.get(k) ?? { slot: k, kind: p.kind, layer: layerOf(p), pieces: 0, vertices: 0, rides: nameOf(skeleton, anchorOf(p, skeleton)) };
      row.pieces++; row.vertices += (p.kind === 'skinned' ? p.batch.positions.length : p.source?.length ?? 0) / 3;
      slots.set(k, row);
    }
    return { status: 'measured', skin: body.cpuSkinned ? 'cpu' : 'gpu', built: M.arm.builtFor?.() ?? null,
      bones: [...skeleton.nodes.values()].map((n) => n.name).filter((n) => /^bip01|bone$/i.test(n)), slots: [...slots.values()] };
  },
  /** The edit's layers replaced (an array; [] or null clears): each `{ name, on, when: { cls, gait, attack }, bones:
   *  { name: { rot: [pitch, roll, twist] deg, move: [right, up, forward] cm, scale } }, pieces: { slot: { rot, move,
   *  scale, about } } }`. Answers the layers as kept. */
  async tweak(layers) {
    await mods();
    if (layers !== undefined) lab.layers = (Array.isArray(layers) ? layers : layers ? [layers] : []).slice(0, 16).map(cleanLayer);
    return { layers: lab.layers.map(({ w, ...l }) => ({ ...l, weight: +(w ?? 0).toFixed(2) })), applied: lab.applied };
  },
  /** This frame's pose by bone name: the local rotation, translation and scale, and where the bone stands in the rig. */
  async pose(names = null) {
    await mods();
    const body = findBody();
    if (!body?.pose) return null;
    const out = {};
    for (const [ref, node] of body.skeleton.nodes) {
      const name = node.name.toLowerCase();
      if (names ? !names.includes(name) : !/^bip01|bone$/.test(name)) continue;
      const l = body.pose.get(ref) ?? node.rest, m = body.mats.get(ref);
      out[name] = { rotation: Array.from(l.rotation ?? I3, (v) => +v.toFixed(5)), translation: Array.from(l.translation ?? [0, 0, 0], (v) => +v.toFixed(3)), scale: l.scale ?? 1, at: m ? M.toBody(m.t, M.arm.status().raceScale ?? undefined).map((v) => +v.toFixed(4)) : null };
    }
    return out;
  },
  /**
   * THE MESHES THIS FRAME: each skinned piece's edges against their authored lengths (a stretch, a crush), and one
   * layer through another - the body out through cloth or plate, a blade or a shield inside the body.
   */
  async geometry({ stretch = 1.8, crush = 0.4, pokeCm = 1.2, reachCm = 5 } = {}) {
    await mods();
    const body = findBody();
    if (!body?.mats) return { status: 'unmeasured', why: 'the third-person body was not posed this frame' };
    const scale = M.arm.status().raceScale ?? undefined, where = (p) => M.toBody(p, scale).map((v) => +v.toFixed(3));
    const rows = [], shells = [];
    // what the game draws this frame: a piece whose range is hidden (a sheathed blade, a shield on the back) is no mesh
    const ranges = M.arm.thirdMesh?.()?.ranges, shown = ranges?.length ? new Map(ranges.map((r) => [r.piece, !r.hidden])) : null;
    for (const p of body.pieces) {
      if (shown && shown.get(p) !== true) continue;
      const pos = posed(p, body), idx = p.indices ?? p.batch?.indices;
      if (!pos || !idx) continue;
      const row = { slot: slotOf(p), key: `${slotOf(p)}#${body.pieces.indexOf(p)}`, kind: p.kind, layer: layerOf(p), vertices: pos.length / 3 };
      if (p.kind === 'skinned' && p.batch?.positions) {
        const e = edgesOf(p);
        let max = 1, min = 1, over = 0, under = 0, top = -1;
        for (let k = 0; k < e.rest.length; k++) {
          const a = e.pairs[k * 2] * 3, b = e.pairs[k * 2 + 1] * 3;
          const r = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]) / e.rest[k];
          if (r > stretch) over++; if (r < crush) under++;
          if (r > max) { max = r; top = k; } if (r < min) min = r;
        }
        Object.assign(row, { edges: e.rest.length, maxStretch: +max.toFixed(3), minStretch: +min.toFixed(3), stretched: over, crushed: under });
        if (top >= 0) { const a = e.pairs[top * 2]; row.worstAt = where([pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]]); row.worstBone = nameOf(body.skeleton, e.owner[a]); }
      }
      rows.push(row);
      shells.push({ row, pos, shape: shapeOf(p, body.skeleton), piece: p });
    }
    const pokes = [];
    for (const outer of shells) {
      if (outer.row.layer === 0 || outer.row.layer === 3) continue;   // a shell is cloth or plate
      for (const inner of shells) {
        if (inner.row.layer >= outer.row.layer || inner.row.slot === outer.row.slot) continue;
        const hit = through(inner, outer, { side: 1, cm: pokeCm, reach: (reachCm / 100) * M.unit, ride: true });
        if (hit.count) pokes.push({ kind: 'poke', inner: inner.row.slot, outer: outer.row.slot, vertices: hit.count, cm: +((hit.worst / M.unit) * 100).toFixed(1), at: where(hit.at) });
      }
    }
    for (const held of shells) {
      if (held.row.layer !== 3) continue;
      for (const shell of shells) {
        if (shell.row.layer === 3 || shell.piece.kind !== 'skinned') continue;
        const hit = through(held, shell, { side: -1, cm: pokeCm * 2, reach: (reachCm / 100) * M.unit });
        if (hit.count) pokes.push({ kind: 'held-inside', inner: held.row.slot, outer: shell.row.slot, vertices: hit.count, cm: +((hit.worst / M.unit) * 100).toFixed(1), at: where(hit.at) });
      }
    }
    return { status: 'measured', skin: body.cpuSkinned ? 'cpu' : 'gpu', pieces: rows, pokes,
      worstStretch: Math.max(1, ...rows.map((r) => r.maxStretch ?? 1)), worstCrush: Math.min(1, ...rows.map((r) => r.minStretch ?? 1)),
      worstPokeCm: Math.max(0, ...pokes.map((p) => p.cm)) };
  },
  /** THE SAME FIGHTER EVERY RUN: health, magicka and fatigue full, and the needs (hunger, thirst, sleep, the cold) off
   *  with their entry lifted - they are rewritten every world minute and move the live Speed a walk is paced by, so
   *  one run's weather was the next run's stride. Answers the fighter as it now stands (`fighter`). */
  async rested() {
    const e = window.__playerEntity;
    if (!e) return null;
    if (e.maxHealth) e.health = e.maxHealth;
    if (e.maxMagicka) e.magicka = e.maxMagicka;
    if (e.maxFatigue) e.fatigue = e.maxFatigue;
    const prefs = await mod('/src/systems/uiPrefs.js');
    if (prefs.getPref('survival') !== false) prefs.setPref('survival', false);
    if (Array.isArray(e.activeEffects)) for (let i = e.activeEffects.length - 1; i >= 0; i--) if (e.activeEffects[i]?.kind === 'survival') e.activeEffects.splice(i, 1);
    // ENCUMBRANCE OFF FOR A RUN. Roleplay Realism's fold takes its penalty from the live Speed its own last penalty
    // already lowered (rrInstall.js encumbranceOf), so one worn set walks at Speed 45 and 11 by turns, a fold each -
    // measured here, 2026-11-11 (`fold`). A run under it is two fighters; the lab's fighter has the permanent Speed.
    const rr = await mod('/src/systems/roleplayRealism/rrRealism.js'), settings = await mod('/src/systems/modSettings.js');
    if (settings.modSetting(rr.RR_VENDOR, 'encumbranceEffects') === true) settings.setModSetting(rr.RR_VENDOR, 'encumbranceEffects', false);
    (await mod('/src/systems/entityMods.js')).computeEntityMods(e);
    return window.__labKit.fighter();
  },
  /** The worn set's fold run `times` over, the Speed it leaves each time: a fold that reads the stat it writes does not
   *  settle at once, and the lab must know whether it settles at all. */
  async foldSpeed(times = 8) {
    const e = window.__playerEntity, mods = await mod('/src/systems/entityMods.js'), { liveStat } = await mod('/src/systems/statMods.js');
    const out = [];
    for (let i = 0; i < times; i++) { mods.computeEntityMods(e); out.push({ worn: e._mods?.stats?.speed ?? 0, live: liveStat(e, 'speed') }); }
    return out;
  },
  /** THE FIGHTER'S OWN NUMBERS a motion is paced by: the live Speed, Strength and Agility, the fatigue, and the kinds
   *  of effect on the body. Two runs of one scenario are one fighter only where these agree. */
  async fighter() {
    const e = window.__playerEntity;
    if (!e) return null;
    const { liveStat } = await mod('/src/systems/statMods.js');
    const live = (k) => (e.stats?.[k] != null ? liveStat(e, k) : null);
    return { speed: live('speed'), baseSpeed: e.stats?.speed ?? null, wornSpeed: e._mods?.stats?.speed ?? 0, strength: live('strength'), agility: live('agility'), fatigue: e.fatigue ?? null,
      effects: [...new Set((e.activeEffects ?? []).filter((x) => x && !x.ended).map((x) => x.kind))].sort() };
  },
  /** HOW A SWING IS READ (Controls/WeaponSwingMode): 0 the drag's own direction - the script's swing is the blow struck;
   *  1 a click and 2 a click or a hold, the direction rolled. Answers the mode that stood before. */
  async swingMode(mode) {
    const settings = await mod('/src/systems/settings/settings.js');
    const was = settings.getInt('Controls', 'WeaponSwingMode', 0, 2);
    if (mode != null && mode !== was) settings.setValue('Controls', 'WeaponSwingMode', mode);
    return was;
  },
  /** WHOSE BODY: the rig built again as a woman's or a man's of `race` (the build is seconds long, so only when it
   *  differs). Answers what the rig was built for. */
  async identity({ female = true, race = female ? 'dark elf' : 'nord', faceIndex = 0 } = {}) {
    await mods();
    const was = M.arm.builtFor?.();
    if (was && was.female === female && String(was.race ?? '').toLowerCase() === race) return was;
    const e = window.__playerEntity, morphs = await mod('/src/characters/bodyMorphs.js'), rig = await mod('/src/combat/weapon/weaponRig.js');
    e.gender = female ? 'female' : 'male';
    morphs.setAppearanceIdentity({ race, female, faceIndex });
    const built = await rig.buildArmsFor(e);
    return { ...(M.arm.builtFor?.() ?? {}), ok: !!built?.ok };
  },
  /** Every worn slot taken off, then exactly `names` put on (each `a|b` the first pack item naming either). */
  async outfit(names = []) {
    const e = window.__playerEntity, eq = await mod('/src/systems/equip.js');
    for (let slot = 0; slot <= 26; slot++) eq.unequipSlot(e, slot);
    const list = Array.isArray(e.items) ? e.items : Object.values(e.items), done = [], used = new Set();
    for (const want of names) {
      const words = String(want).toLowerCase().split('|').map((w) => w.trim()).filter(Boolean);
      const free = list.filter((x) => !used.has(x));   // DUAL-RUN: a name asked twice takes a second item
      const it = free.find((x) => words.includes(String(x?.name ?? '').toLowerCase())) ?? free.find((x) => words.some((w) => String(x?.name ?? '').toLowerCase().includes(w)));
      if (!it) { done.push({ want, found: false }); continue; }
      used.add(it);
      const again = done.some((d) => d.want === want);
      eq.equipItem(e, it, again ? eq.EQUIP_SLOTS.LeftHand : undefined);
      done.push({ want, found: it.name });
    }
    eq.rebuildEquipState?.(e);
    return done;
  },
};
