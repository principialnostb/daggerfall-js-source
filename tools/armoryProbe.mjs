// ARMORY (2026-10-28; bible/04-Characters/Aura-Armory.md section 9) - THE AURA ARMORY'S PIECES, COMPILED, LINKED AND DRAWN
// IN A REAL BROWSER, on the bodies the game draws them over: a stand-in rig (render/auraPreview.js's figure, posed at
// rest), an Eye of the Beholder sprite - its own idle picture on a card through its feet that writes depth, as the game
// stands one - and a wolf. Every piece's program must link; each must light its own part and not another's; nothing
// before it has kindled; no jump at the clock's wrap; on the sprite, nothing of the chest from behind the card (THE CARD
// LAW); and every body piece floats: a dark band between the body's outline and the piece's light, measured along a line
// out from the part it belongs to, about the slot's gap (armoryHover.js) and never far past it.
// AUDIT ARMORY: and THE MORROWIND BODY - retail's own skeleton (test/fixtures/mw/retailRig.mjs) read by the game's own
// reader (fpArm armBonesInBody, what thirdBones and a peer's bonesOf answer), a mannequin on its bones for the eye, the
// pieces on its pose. Its mesh is Bethesda's and never ships; the bones are what the pieces hang on. The wolf stands on
// those bones hunched and up on its toes, its limbs as thick as the beast fit makes them.
//
//     node tools/armoryProbe.mjs [--shots <dir>] [--scale 2]     (--scale: the canvas drawn at that many pixels a CSS pixel)
import { chromium } from 'playwright';
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMORY_PIECES } from '../src/net/armoryLaw.js';
import { AURA_CLOCK_PERIOD } from '../src/render/auraRing.js';
import { REST_POINTS, POSE_AT, newPose, poseFromBones } from '../src/render/armoryPose.js';
import { ARMORY_HOVER } from '../src/render/armoryHover.js';
import { ARMORY_SPURS } from '../src/render/armoryPass.js';
import { glowSpec, ARMORY_LEVEL, armoryWeaponStage as weaponStageOf } from '../src/systems/weaponGlow.js';
import { parseNif } from '../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../src/formats/morrowind/mwSkin.js';
import { armBonesInBody } from '../src/combat/fpArm.js';
import { retailSkeleton } from '../test/fixtures/mw/retailRig.mjs';
import { ARMORY_BONES } from '../src/render/armoryPose.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (/** @type {string} */ n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const shotsAt = arg('--shots');
const SCALE = Math.max(1, Math.round(Number(arg('--scale') ?? 1)) || 1);
if (shotsAt) mkdirSync(shotsAt, { recursive: true });
const out = [];
const check = (n, ok, d = '') => {
  out.push(ok);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ` - ${d}` : ''}`);
};
const SPRITE = '/vendor/eye-of-the-beholder/Textures/112364/112364_0-0.png';
const MW_SK = buildSkeleton(parseNif(retailSkeleton()));
const MW_BONES = armBonesInBody(
  { skeleton: MW_SK, mats: skeletonSpaceMatrices(MW_SK, new Map(), GRAPH_ROOT) },
  ARMORY_BONES,
);
const BACK = '/vendor/eye-of-the-beholder/Textures/112364/112364_4-0.png';
// the wolf: retail's bones hunched forward, its head low and out, up on its toes (the hock high, the knee back)
const WOLF_BONES = (() => {
  const b = /** @type {Record<string, number[]>} */ ({});
  const lean = (/** @type {number[]} */ p) => [
    p[0],
    p[1] - Math.max(0, p[1] - 1.0) * 0.28,
    p[2] + Math.max(0, p[1] - 1.0) * 0.45,
  ];
  for (const [n, p] of Object.entries(MW_BONES)) if (p) b[n] = lean(p);
  for (const s of ['l', 'r']) {
    const k = b[`bip01 ${s} calf`],
      f = b[`bip01 ${s} foot`];
    if (k) b[`bip01 ${s} calf`] = [k[0], k[1] + 0.06, k[2] + 0.1];
    if (f) b[`bip01 ${s} foot`] = [f[0], 0.42, f[2] - 0.12];
  }
  return b;
})();

const PAGE = `<!doctype html><html><body style="margin:0;background:#000"><canvas id=c width=${480 * SCALE} height=${640 * SCALE} style="width:480px;height:640px"></canvas><script type=module>
import { ArmoryRenderer, armoryMotionStep, armoryPrograms, armoryDraws, cardRightOf, ARMORY_DETAIL_M } from '/src/render/armoryPass.js';
import { newPose, poseAtRest, poseFromFigure, poseFromBones, spriteMarks, POSE_AT as PT, ARMORY_BEAST_FIT } from '/src/render/armoryPose.js';
import { previewMesh } from '/src/render/auraPreview.js';
import { auraClock } from '/src/render/auraRing.js';
import { ARMORY_PIECES, armoryKitPieces } from '/src/net/armoryLaw.js';
const W = ${480 * SCALE}, H = ${640 * SCALE};
const gl = document.getElementById('c').getContext('webgl2', { alpha: false, preserveDrawingBuffer: true, antialias: false });
const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p; };
const boxes = prog(\`#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; uniform mat4 vp; uniform float yaw; out vec3 n;
void main(){ float c = cos(yaw), s = sin(yaw); vec3 p = vec3(c * aP.x + s * aP.z, aP.y, -s * aP.x + c * aP.z); n = vec3(c * aN.x + s * aN.z, aN.y, -s * aN.x + c * aN.z); gl_Position = vp * vec4(p, 1.0); }\`, \`#version 300 es
precision highp float; in vec3 n; out vec4 o; void main(){ o = vec4(vec3(0.05, 0.05, 0.06) + vec3(0.06) * max(dot(normalize(n), normalize(vec3(0.3, 0.8, 0.5))), 0.0), 1.0); }\`);
const card = prog(\`#version 300 es
layout(location=0) in vec2 aC; uniform mat4 vp; uniform vec3 right; uniform vec2 size; out vec2 uv;
void main(){ uv = vec2(aC.x, 1.0 - aC.y); vec3 p = right * (aC.x - 0.5) * size.x + vec3(0.0, aC.y * size.y, 0.0); gl_Position = vp * vec4(p, 1.0); }\`, \`#version 300 es
precision highp float; in vec2 uv; uniform sampler2D tex; uniform float dim; out vec4 o; void main(){ vec4 c = texture(tex, uv); if (c.a < 0.5) discard; o = vec4(c.rgb * dim, 1.0); }\`);
const mesh = previewMesh();
const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, mesh.data, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
const cvao = gl.createVertexArray(); gl.bindVertexArray(cvao);
const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
// the picture's marks as the game reads them at its upload: its color32 pixels, bottom-up
const marksOf = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, im.width, im.height).data; const u = new Uint32Array(im.width * im.height); for (let r = 0; r < im.height; r++) for (let q = 0; q < im.width; q++) { const i = ((im.height - 1 - r) * im.width + q) * 4; u[r * im.width + q] = (d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24)) >>> 0; } return spriteMarks(u, im.width, im.height); };
const load = (src) => new Promise((res) => { const im = new Image(); im.onload = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); res({ t, w: im.width, h: im.height, marks: marksOf(im) }); }; im.src = src; });
const sprites = { front: await load('${SPRITE}'), back: await load('${BACK}') };
// a mannequin of boxes on a pose's points - the Morrowind body's, and the wolf's as thick as its fit
const mannequin = (pose, k = 1, arm = 1, hock = false) => {
  const q = (n) => [pose.pts[PT[n]], pose.pts[PT[n] + 1], pose.pts[PT[n] + 2]];
  const sub = (a, b) => a.map((v, i) => v - b[i]), add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k), nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const out = [];
  const box = (a, b, rx, rz) => {
    rx *= k; rz *= k;
    const u = nrm(sub(b, a)), s = nrm(cross(u, Math.abs(u[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0])), t = cross(u, s);
    const c = (e, i, j) => add(add(e, s, i * rx), t, j * rz), A = [a, b];
    const quad = (p0, p1, p2, p3, n) => { for (const p of [p0, p1, p2, p0, p2, p3]) out.push(...p, ...n); };
    for (const [i, j, kk, l, n] of [[[0, -1, -1], [1, -1, -1], [1, 1, -1], [0, 1, -1], t.map((v) => -v)], [[0, -1, 1], [1, -1, 1], [1, 1, 1], [0, 1, 1], t], [[0, -1, -1], [1, -1, -1], [1, -1, 1], [0, -1, 1], s.map((v) => -v)], [[0, 1, -1], [1, 1, -1], [1, 1, 1], [0, 1, 1], s]])
      quad(c(A[i[0]], i[1], i[2]), c(A[j[0]], j[1], j[2]), c(A[kk[0]], kk[1], kk[2]), c(A[l[0]], l[1], l[2]), n);
    quad(c(a, -1, -1), c(a, 1, -1), c(a, 1, 1), c(a, -1, 1), u.map((v) => -v)); quad(c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1), u);
  };
  const head = q('head'), neck = q('neck');
  box(add(head, [0, -0.1, 0]), add(head, [0, 0.11, 0]), 0.085, 0.1);   // the head
  box(neck, add(head, [0, -0.08, 0]), 0.05, 0.05);
  box(q('pelvis'), add(neck, [0, -0.02, 0]), 0.16, 0.1);   // the trunk
  for (const s of ['L', 'R']) {
    box(q('sh' + s), q('el' + s), 0.052 * arm, 0.052 * arm); box(q('el' + s), q('wa' + s), 0.042 * arm, 0.042 * arm); box(q('wa' + s), add(q('wa' + s), [0, -0.1, 0.01]), 0.035, 0.045);
    box(q('hip' + s), q('kn' + s), 0.07, 0.07);
    if (hock) { box(q('kn' + s), q('ft' + s), 0.05, 0.05); box(q('ft' + s), [q('ft' + s)[0], 0.02, q('ft' + s)[2] + 0.04], 0.042, 0.042); box([q('ft' + s)[0], 0.03, q('ft' + s)[2]], [q('ft' + s)[0], 0.03, q('ft' + s)[2] + 0.16], 0.045, 0.03); }
    else { box(q('kn' + s), add(q('ft' + s), [0, 0.02, 0]), 0.055, 0.055); box(add(q('ft' + s), [0, 0.03, -0.04]), add(q('ft' + s), [0, 0.03, 0.17]), 0.045, 0.03); }
  }
  return new Float32Array(out);
};
// THE MORROWIND BODY: retail's skeleton's bones as the game reads them, and a mannequin of boxes on them for the eye
const MW_BONES = ${JSON.stringify(MW_BONES)};
const mwPose = newPose(); poseFromBones(MW_BONES, mwPose);
const WOLF_BONES = ${JSON.stringify(WOLF_BONES)};
const wolfPose = newPose(); poseFromBones(WOLF_BONES, wolfPose, true);
const bodies = {};
for (const [name, m] of [['mw', mannequin(mwPose)], ['wolf', mannequin(wolfPose, ARMORY_BEAST_FIT, wolfPose.arm, true)]]) {
  const v = gl.createVertexArray(); gl.bindVertexArray(v);
  const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb); gl.bufferData(gl.ARRAY_BUFFER, m, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); gl.bindVertexArray(null);
  bodies[name] = { vao: v, n: m.length / 6 };
}
let pass = null, err = null;
try { pass = new ArmoryRenderer(gl); } catch (e) { err = String(e.message ?? e); }
const logOf = (i) => { const [[vs, fs]] = armoryPrograms(i); const lg = []; for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) lg.push(gl.getShaderInfoLog(x)); } if (!lg.length) { const pp = gl.createProgram(); for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); gl.attachShader(pp, x); } gl.linkProgram(pp); if (!gl.getProgramParameter(pp, gl.LINK_STATUS)) lg.push(gl.getProgramInfoLog(pp)); } return lg.join(' / ') || 'no log'; };
const linked = pass ? ARMORY_PIECES.map((_, i) => { try { const P = pass.programOf(i, true); return (!!P && gl.getProgramParameter(P.prog, gl.LINK_STATUS)) || logOf(i); } catch (e) { return String(e.message ?? e); } }) : [];
const persp = (f, a, n, fa) => { const t = 1 / Math.tan(f / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]); };
const look = (e, c) => { const u = [0, 1, 0]; const z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z.forEach((v, i) => { z[i] = v / l; }); const x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x); x.forEach((v, i) => { x[i] = v / l; }); const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]]; return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]); };
const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const b64 = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(t); };
/** Draw a body - 'mw' (retail's Morrowind skeleton, a mannequin on its bones), 'wolf' (those bones hunched and fitted, turned
 *  beast), 'rig' (the stand-in, at rest) or 'sprite' (its picture on a card, 'front' or 'back') - wearing \`kit\` from \`eye\`
 *  at \`t\`, kindled \`kindle\`; read back \`pts\` (world) and the frame's brightest pixels; \`keep\` the whole frame and each
 *  worn piece's draws as the pass drew them. */
window.draw = ({ body = 'rig', kit, eye, t = 5.3, kindle = 1, pts = [], yaw = 0, side = 'front', at = [0, 1.0, 0], torn = -1, walk = 0, plain = false, arms = undefined, pixel = false, keep = false, floor = true }) => {   // pixel: the law on - the designs are read per pixel
  const proj = persp(0.8, W / H, 0.05, 100), view = look(eye, at), vp = mul(proj, view);
  gl.viewport(0, 0, W, H); gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const pose = newPose();
  if (body === 'mw' || body === 'wolf') {
    gl.useProgram(boxes); gl.uniformMatrix4fv(gl.getUniformLocation(boxes, 'vp'), false, vp); gl.uniform1f(gl.getUniformLocation(boxes, 'yaw'), yaw);
    gl.bindVertexArray(bodies[body].vao); gl.drawArrays(gl.TRIANGLES, 0, bodies[body].n);
    poseFromBones(body === 'wolf' ? WOLF_BONES : MW_BONES, pose, body === 'wolf');
  } else if (body === 'rig') {
    gl.useProgram(boxes); gl.uniformMatrix4fv(gl.getUniformLocation(boxes, 'vp'), false, vp); gl.uniform1f(gl.getUniformLocation(boxes, 'yaw'), yaw);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, floor ? 0 : mesh.floorN, floor ? mesh.count : mesh.count - mesh.floorN);
    poseAtRest(pose);
  } else {
    const sp = sprites[side], mpp = 0.019;
    const right = [view[0], view[4], view[8]];
    gl.useProgram(card); gl.uniformMatrix4fv(gl.getUniformLocation(card, 'vp'), false, vp); gl.uniform3fv(gl.getUniformLocation(card, 'right'), right);
    gl.uniform2f(gl.getUniformLocation(card, 'size'), sp.w * mpp, sp.h * mpp); gl.uniform1f(gl.getUniformLocation(card, 'dim'), plain ? 1 : 0.35);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sp.t); gl.uniform1i(gl.getUniformLocation(card, 'tex'), 0);
    gl.bindVertexArray(cvao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    poseFromFigure({ base: 0, mpp, beast: false, marks: sp.marks, shift: 0 }, pose);
  }
  gl.bindVertexArray(null);
  const w = { at: [0, 0, 0], yaw, kit, pose, seed: 0.37, kindle, torn: body === 'wolf' ? 1 : torn, mounted: false, _d: Math.hypot(...eye), ...(arms !== undefined ? { arms } : {}) };   // GUILD-SHOP: the armlet's guild's arms
  for (let i = 0; i <= 8; i++) { w.at[2] = walk * i * 0.1; armoryMotionStep(w, t - 0.8 + i * 0.1); }
  w.at[2] = walk * 0.8; w.at[2] = 0;
  pass.pixel = pixel;
  pass.draw([w], proj, view, new Float32Array(eye), t, null, true);
  pass.pixel = false;
  const px = (p) => {
    const c = [0, 1, 2, 3].map((r) => vp[r] * p[0] + vp[4 + r] * p[1] + vp[8 + r] * p[2] + vp[12 + r]);
    const x = Math.round((c[0] / c[3] * 0.5 + 0.5) * W), y = Math.round((c[1] / c[3] * 0.5 + 0.5) * H);
    if (!(c[3] > 0) || x < 0 || x >= W || y < 0 || y >= H) throw new Error('a point off the canvas: ' + p);
    let best = 0; const o = new Uint8Array(4), R = 3 * ${SCALE};
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { gl.readPixels(x + dx, y + dy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o); best = Math.max(best, o[0] + o[1] + o[2]); }
    return best;
  };
  const rows = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rows);
  let lit = 0; for (let i = 0; i < rows.length; i += 4) if (rows[i] + rows[i + 1] + rows[i + 2] > 120) lit++;
  let glow = 0, same = 0;   // the lit pixels the same as their right-hand neighbour
  for (let i = 0; i < rows.length - 4; i += 4) if (rows[i] + rows[i + 1] + rows[i + 2] > 120 && (i / 4) % W !== W - 1) { glow++; if (rows[i] === rows[i + 4] && rows[i + 1] === rows[i + 5] && rows[i + 2] === rows[i + 6]) same++; }
  const worn = keep && kit ? Object.fromEntries(Object.entries(armoryKitPieces(kit)).filter(([, k]) => k).map(([sl, k]) => [sl, { key: k, draws: armoryDraws(k, w, eye, !(w._d > ARMORY_DETAIL_M), cardRightOf(proj, view), auraClock(t)) }])) : null;
  const pt = (n) => { const i = PT[n], d = pose.card ? pose.dx[i / 3] : 0, r = cardRightOf(proj, view), c = Math.cos(yaw), s = Math.sin(yaw); return [c * pose.pts[i] + s * pose.pts[i + 2] + r[0] * d, pose.pts[i + 1], -s * pose.pts[i] + c * pose.pts[i + 2] + r[2] * d]; };
  return { error: gl.getError(), drawn: pass.drawn, lit, same: glow ? same / glow : 0, px: pts.map(px), pose: Array.from(pose.pts), dx: Array.from(pose.dx), right: [view[0], view[4], view[8]], marks: body === 'sprite' ? sprites[side].marks : null,
    ...(keep ? { frame: b64(rows), vp: Array.from(vp), worn, points: Object.fromEntries(Object.keys(PT).map((n) => [n, pt(n)])), bands: pose.bands, scale: pose.scale } : {}) };
};
window.probe = { err, linked };
window.ready = true;
</script></body></html>`;
/** The weapon piece's stage alone (render/weaponPiecePreview.js): a canvas the size the shop gives it, read at the blade's
 *  middle, a hair beside its edge and far off it. */
const STAGE_PAGE = `<!doctype html><html><body style="margin:0;background:#000"><canvas id=s style="width:300px;height:400px;display:block"></canvas><script type=module>
import { startWeaponPiecePreview, weaponPieceLayout } from '/src/render/weaponPiecePreview.js';
window.stageOf = (spec) => {
  const c = document.getElementById('s');
  window.live?.stop();
  const fresh = c.cloneNode(); c.replaceWith(fresh);
  const s = startWeaponPiecePreview(fresh, spec, { now: () => 1.5 });
  if (!s) return { ok: false };
  window.live = s; s.step();
  const gl = fresh.getContext('webgl2'), W = fresh.width, H = fresh.height, L = weaponPieceLayout(W, H, Math.max(...spec.win));
  const px = (x, y) => { const o = new Uint8Array(4); gl.readPixels(Math.round(x), Math.round(H - 1 - y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, o); return Array.from(o.slice(0, 3)); };
  const mid = L.y + L.h * 0.4, edgeX = L.x + 10 * L.cell + L.cell * 0.5;
  return { ok: true, error: gl.getError(), blade: px(L.x + 7.5 * L.cell, mid), beside: px(edgeX, mid), far: [...px(4, 4), ...px(W - 5, H - 5)] };
};
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/probe/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
    return;
  }
  if (url === '/stage/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(STAGE_PAGE);
    return;
  }
  const f = join(ROOT, url);
  if (!f.startsWith(ROOT) || !existsSync(f)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, {
    'content-type':
      extname(f) === '.js'
        ? 'text/javascript'
        : extname(f) === '.json'
          ? 'application/json'
          : extname(f) === '.png'
            ? 'image/png'
            : 'application/octet-stream',
  });
  res.end(readFileSync(f));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const at = (name) => {
  const i = POSE_AT[name];
  return [REST_POINTS[i], REST_POINTS[i + 1], REST_POINTS[i + 2]];
};
const MW_POSE = newPose();
poseFromBones(MW_BONES, MW_POSE);
const W = 480 * SCALE,
  H = 640 * SCALE;
const sub = (a, b) => a.map((v, i) => v - b[i]),
  add = (a, b, k = 1) => a.map((v, i) => v + b[i] * k),
  unit = (a) => {
    const l = Math.hypot(...a) || 1;
    return a.map((v) => v / l);
  },
  mid = (a, b) => a.map((v, i) => (v + b[i]) / 2);
/** A world point on the readback (x right, y up from the bottom), under the frame's view-projection. */
const screenOf = (vp, p) => {
  const c = [0, 1, 2, 3].map((r) => vp[r] * p[0] + vp[4 + r] * p[1] + vp[8 + r] * p[2] + vp[12 + r]);
  return [((c[0] / c[3]) * 0.5 + 0.5) * W, ((c[1] / c[3]) * 0.5 + 0.5) * H];
};
/** THE GAP ALONG A LINE: walking the screen from `from` (a world point inside the body) toward `to`, and along lines a few
 *  pixels either side of it - past the body's outline (the bare frame's), the dark run before the piece's light (the worn
 *  frame over the bare). Its widest, in pixels and in metres at `from`'s depth; `found` false where no light was met. */
function gapAlong(bare, worn, vp, from, to, { body = 12, light = 90, side = 2, across = 0 } = {}) {
  const a = screenOf(vp, from),
    z = screenOf(vp, to),
    len = Math.hypot(z[0] - a[0], z[1] - a[1]),
    u = [(z[0] - a[0]) / len, (z[1] - a[1]) / len],
    n = [-u[1], u[0]];
  const ppm = Math.hypot(...sub(screenOf(vp, add(from, unit(sub(to, from)), 0.1)), a)) / 0.1;
  side = Math.max(side * SCALE, Math.ceil(across * ppm)); // `across` (m): how far either side of the line to read
  const sum = (f, x, y) => {
    const i = (y * W + x) * 4;
    return f[i] + f[i + 1] + f[i + 2];
  };
  let best = { px: -1, found: false, edge: false, run: null };
  for (let o = -side; o <= side; o++) {
    let edge = null;
    for (let s = 0; s <= len; s++) {
      const x = Math.round(a[0] + u[0] * s + n[0] * o),
        y = Math.round(a[1] + u[1] * s + n[1] * o);
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const b = sum(bare, x, y),
        d = sum(worn, x, y) - b;
      if (b > body) {
        edge = s;
        continue;
      }
      if (edge === null) continue;
      if (d > light) {
        if (s - edge > best.px)
          best = {
            px: s - edge,
            found: true,
            edge: true,
            run: [
              a[0] + u[0] * edge + n[0] * o,
              a[1] + u[1] * edge + n[1] * o,
              a[0] + u[0] * s + n[0] * o,
              a[1] + u[1] * s + n[1] * o,
            ],
          };
        break;
      }
    }
  }
  return { ...best, m: best.px / ppm, ppm };
}
/** A ring's front at `v` of its band's height: its coal or its band, where it faces the eye before the body. */
const frontOf = (d, v = 0.15) => {
  const ax = unit(sub(d.B, d.A)),
    k = ax[2],
    front = unit([-ax[0] * k, -ax[1] * k, 1 - ax[2] * k]);
  return add(add(d.A, sub(d.B, d.A), v), front, d.r[0]);
};
/** For a ring, the line from its middle out through its side away from the body (its `I` the way in), read across its
 *  whole height: the band and the ring's sides as the eye sees them round it. */
const ringLine = (d) => {
  const m = mid(d.A, d.B),
    out = d.I && Math.hypot(...d.I) > 0 ? d.I.map((v) => -v) : [1, 0, 0];
  return [m, add(m, out, d.r[0] + 0.12), Math.hypot(...sub(d.B, d.A)) / 2 + d.r[0] * 0.7];
};
const unpack = (r) => Buffer.from(r.frame, 'base64');
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 640 }, deviceScaleFactor: SCALE });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/probe/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  const p = await page.evaluate(() => window.probe);
  check('the pass builds', !p.err, p.err ?? '');
  ARMORY_PIECES.forEach((pc, i) =>
    check(
      `${pc.key}: its program links in a real WebGL2`,
      p.linked[i] === true,
      typeof p.linked[i] === 'string' ? p.linked[i].slice(0, 400) : '',
    ),
  );
  const draw = (o) => page.evaluate((x) => window.draw(x), o);
  const shot = async (name) => {
    if (shotsAt) await page.locator('#c').screenshot({ path: join(shotsAt, `${name}.png`) });
  };
  const ARMS = {
    heraldry: { field: 'crimson', border: 'gold', device: 'dragon', division: 'quarterly', field2: 'sable' },
    logo: null,
  };
  const FRONT = [0, 1.25, 2.6],
    BEHIND = [0, 1.25, -2.6],
    SIDE = [2.6, 1.25, 0.4];
  const head = at('head'),
    chest = at('chest');
  // the bodies bare, kept to be read against a base's shots: nothing of the pass with no piece worn
  for (const [name, o] of [
    ['bare_rig_front', { body: 'rig', eye: FRONT }],
    ['bare_mw_front', { body: 'mw', eye: [0, 1.3, 3.1], at: [0, 1.1, 0] }],
    ['bare_sprite_front', { body: 'sprite', eye: FRONT, plain: true }],
    ['bare_sprite_back', { body: 'sprite', eye: BEHIND, side: 'back', plain: true }],
  ]) {
    const r = await draw({ ...o, kit: null });
    await shot(name);
    check(`${name}: nothing drawn with no piece worn`, r.drawn === 0 && r.error === 0, `drawn ${r.drawn}`);
  }
  // the rig, every Dagonfire piece at once - where each floats, read off the pass's own draws
  const dk = await draw({ kit: 'aaaa0', eye: FRONT, keep: true });
  const [crownBand] = dk.worn.head.draws,
    heartAt = dk.worn.torso.draws[0].A,
    cinderLow = dk.worn.legs.draws[0];
  const crownPt = add(add(crownBand.A, [0, 1, 0], 0.08), [0, 0, 1], 0.13),
    cinderPt = frontOf(cinderLow);
  const bare = await draw({ kit: '00000', eye: FRONT, pts: [crownPt, heartAt, cinderPt] });
  const r = await draw({ kit: 'aaaa0', eye: FRONT, pts: [crownPt, heartAt, cinderPt, [0.6, 1.0, 0], [0.5, 1.6, 0]] });
  await shot('rig_dagonfire_front');
  check(
    'the rig in Dagonfire: drawn without a GL error',
    r.error === 0 && r.drawn === 4,
    `error ${r.error}, drawn ${r.drawn}`,
  );
  check("the crown's horns burn over the head", r.px[0] > bare.px[0] + 90, `${r.px[0]} against ${bare.px[0]}`);
  check('the Ember Heart burns before the chest', r.px[1] > bare.px[1] + 90, `${r.px[1]} against ${bare.px[1]}`);
  check('the Cinderstride burns round the shins', r.px[2] > bare.px[2] + 60, `${r.px[2]} against ${bare.px[2]}`);
  check('nothing beside the body or beside the head', r.px[3] < 60 && r.px[4] < 60, `${r.px[3]}, ${r.px[4]}`);
  const backBare = await draw({ kit: '00000', eye: BEHIND, pts: [[chest[0], chest[1], -0.05]] });
  const back = await draw({ kit: '0a000', eye: BEHIND, pts: [[chest[0], chest[1], -0.05]] });
  await shot('rig_heart_behind');
  check(
    'the Ember Heart from behind: none of it through the body',
    back.px[0] <= backBare.px[0] + 12,
    `${back.px[0]} against the bare body's ${backBare.px[0]}`,
  );
  const cold = await draw({ kit: 'aaaa0', eye: FRONT, kindle: 0, pts: [crownPt, heartAt, cinderPt] });
  check('nothing at all before it kindles', cold.lit === 0 && cold.drawn === 0, `${cold.lit} lit, ${cold.drawn} drawn`);
  const beast = await draw({ kit: 'aaaa0', eye: FRONT, torn: 1, pts: [crownPt, heartAt, cinderPt] });
  await shot('rig_beast_dagonfire_front');
  check(
    'WOLF-KIT turned beast: the crown off, the heart and the stride still worn',
    beast.px[0] < bare.px[0] + 30 &&
      beast.px[1] > bare.px[1] + 90 &&
      beast.px[2] > bare.px[2] + 60 &&
      beast.drawn === 3,
    `${beast.px.join(', ')}, drawn ${beast.drawn}`,
  );
  const ek = await draw({ kit: 'bbbb0', eye: FRONT, keep: true });
  const haloSpark = ek.worn.head.draws.find((d) => d.mesh === 1 && d.part === 1).A,
    sigilAt = ek.worn.torso.draws[0].A,
    greaveTop = ek.worn.legs.draws.find((d) => d.mesh === 0 && d.part === 0);
  const e = await draw({
    kit: 'bbbb0',
    eye: FRONT,
    pts: [haloSpark, sigilAt, frontOf(greaveTop, 0.2), [0.6, 1.0, 0]],
  });
  await shot('rig_eternal_front');
  check(
    'the rig in Eternal: drawn without a GL error',
    e.error === 0 && e.drawn === 4,
    `error ${e.error}, drawn ${e.drawn}`,
  );
  check(
    "the halo's spark at its front, the sigil before the chest, the greaves round the shins",
    e.px[0] > 120 && e.px[1] > 90 && e.px[2] > 60,
    e.px.join(', '),
  );
  check('the Eternal line beside the body: nothing', e.px[3] < 60, `${e.px[3]}`);
  // THE TIDEBOUND LINE: each piece on its own part, in its own shape (render/armoryTide.js)
  const tk = await draw({ kit: 'ccec0', eye: FRONT, keep: true });
  const circ = tk.worn.head.draws[0],
    stream = tk.worn.arms.draws.find((d) => d.mesh === 0),
    surf = tk.worn.legs.draws[0];
  const tilt = unit(sub(circ.B, circ.A)),
    front = unit(
      sub(
        [0, 0, 1],
        tilt.map((v) => v * tilt[2]),
      ),
    ),
    browPt = add(mid(circ.A, circ.B), front, circ.r[0]); // the pearl, at the ring's front
  const tidePts = [
    browPt,
    tk.worn.torso.draws[0].A,
    ...[0.2, 0.5, 0.8].map((k) => add(add(stream.A, sub(stream.B, stream.A), k), [0, 0, 1], stream.r[0])),
    add(add(surf.A, sub(surf.B, surf.A), 0.15), [0, 0, 1], surf.r[0]),
    add(add(surf.A, sub(surf.B, surf.A), 0.04), [0, 0, 1], surf.r[0]),
    [0.6, 1.0, 0],
  ];
  const tBare = await draw({ kit: '00000', eye: FRONT, pts: tidePts });
  const td = await draw({ kit: 'ccec0', eye: FRONT, pts: tidePts });
  await shot('rig_tidebound_front');
  check(
    'the rig in Tidebound: drawn without a GL error',
    td.error === 0 && td.drawn === 4,
    `error ${td.error}, drawn ${td.drawn}`,
  );
  const more = (i) => td.px[i] - tBare.px[i];
  check("the circlet's pearl before the brow", more(0) > 90, `${td.px[0]} against ${tBare.px[0]}`);
  check('the shell before the chest', more(1) > 90, `${td.px[1]} against ${tBare.px[1]}`);
  check(
    'the stream round the forearm',
    Math.max(more(2), more(3), more(4)) > 60,
    `${td.px.slice(2, 5)} against ${tBare.px.slice(2, 5)}`,
  );
  check(
    'the surf round the shin and the ankle',
    Math.max(more(5), more(6)) > 60,
    `${td.px.slice(5, 7)} against ${tBare.px.slice(5, 7)}`,
  );
  check('the Tidebound line beside the body: nothing', td.px[7] < 60, `${td.px[7]}`);
  const shellBack = await draw({ kit: '0c000', eye: BEHIND, pts: [[chest[0], chest[1], -0.05]] });
  check(
    'the shell from behind: none of it through the body',
    shellBack.px[0] <= backBare.px[0] + 12,
    `${shellBack.px[0]} against ${backBare.px[0]}`,
  );
  await draw({ kit: 'c0000', eye: [0, 1.75, 1.3], at: [0, 1.7, 0], pts: [] });
  await shot('rig_circlet_close');
  await draw({ kit: '0c000', eye: [0, 1.25, 1.2], at: [0, 1.2, 0], pts: [] });
  await shot('rig_shell_close');
  await draw({ kit: '00e00', eye: [-1.1, 1.1, 1.1], at: [-0.25, 0.97, 0], pts: [] });
  await shot('rig_stream_close');
  await draw({ kit: '000c0', eye: [0.4, 0.6, 1.3], at: [0, 0.25, 0], pts: [] });
  await shot('rig_surf_close');
  const sideE = await draw({ kit: 'bbbb0', eye: SIDE, pts: [] });
  await shot('rig_eternal_side');
  const sideD = await draw({ kit: 'aaaa0', eye: SIDE, pts: [] });
  await shot('rig_dagonfire_side');
  check('from the side, both lines drawn', sideE.lit > 300 && sideD.lit > 300, `${sideE.lit}, ${sideD.lit}`);
  // the clock's wrap: the frame a hair before it and a hair after no further apart than two frames as near anywhere else
  // on the clock - the bob, the lag and every ring's turn with it (a thin spur's edge moves a pixel either way)
  const changed = (a, b) => {
    const A = unpack(a),
      B = unpack(b);
    let n = 0;
    for (let i = 0; i < A.length; i += 4)
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 30) n++;
    return n;
  };
  for (const kit of ['aaaa0', 'bbbb0', 'ccec0', '00c00', '00d00']) {
    const o = { kit, eye: FRONT, arms: ARMS, keep: true };
    const wrap = changed(await draw({ ...o, t: AURA_CLOCK_PERIOD - 1 / 240 }), await draw({ ...o, t: 1 / 240 }));
    const mid0 = changed(await draw({ ...o, t: 60 - 1 / 240 }), await draw({ ...o, t: 60 + 1 / 240 }));
    check(
      `${kit}: no jump at the clock's wrap`,
      wrap <= mid0 * 2 + 40 * SCALE * SCALE,
      `${wrap} px changed across it, ${mid0} across the same time mid-clock`,
    );
  }
  // THE SPRITE: its own picture on a card through its feet
  const sb = await draw({ body: 'sprite', kit: '00000', eye: FRONT, pts: [] });
  const sf = await draw({ body: 'sprite', kit: 'aaaa0', eye: FRONT, pts: [], plain: true });
  await shot('sprite_dagonfire_front');
  const sp = sf.pose,
    spt = (n) => [
      sp[POSE_AT[n]] + sf.right[0] * sf.dx[POSE_AT[n] / 3],
      sp[POSE_AT[n] + 1],
      sp[POSE_AT[n] + 2] + sf.right[2] * sf.dx[POSE_AT[n] / 3],
    ];
  console.log('marks', JSON.stringify(sf.marks));
  const sc = await draw({ body: 'sprite', kit: '0a000', eye: FRONT, pts: [spt('chest')] });
  const sbkBare = await draw({
    body: 'sprite',
    kit: '00000',
    eye: BEHIND,
    side: 'back',
    yaw: 0,
    pts: [[spt('chest')[0], spt('chest')[1], 0]],
  });
  const sbk = await draw({
    body: 'sprite',
    kit: '0a000',
    eye: BEHIND,
    side: 'back',
    yaw: 0,
    pts: [[spt('chest')[0], spt('chest')[1], 0]],
  });
  await shot('sprite_heart_behind');
  check(
    'the sprite: drawn without a GL error',
    sf.error === 0 && sf.drawn === 4 && sb.lit < sf.lit,
    `error ${sf.error}, drawn ${sf.drawn}`,
  );
  check("THE CARD LAW: the heart on the sprite's chest from the front", sc.px[0] > 120, `${sc.px[0]}`);
  check(
    'THE CARD LAW: none of the heart through the card from behind',
    sbk.px[0] <= sbkBare.px[0] + 12,
    `${sbk.px[0]} against the bare card's ${sbkBare.px[0]}`,
  );
  await draw({ body: 'sprite', kit: 'bbbb0', eye: FRONT, pts: [], plain: true });
  await shot('sprite_eternal_front');
  const st = await draw({ body: 'sprite', kit: 'ccec0', eye: FRONT, pts: [], plain: true });
  await shot('sprite_tidebound_front');
  check(
    'the sprite in Tidebound: drawn without a GL error',
    st.error === 0 && st.drawn === 4,
    `error ${st.error}, drawn ${st.drawn}`,
  );
  await draw({ body: 'sprite', kit: 'ccec0', eye: [1.9, 1.3, 1.9], pts: [], plain: true });
  await shot('sprite_tidebound_threequarter');
  await draw({ body: 'sprite', kit: 'aa000', eye: [0, 1.75, 1.3], at: [0, 1.7, 0], pts: [], plain: true });
  await shot('sprite_head_close');
  await draw({ body: 'sprite', kit: 'ba000', eye: [0.9, 1.75, 1.0], at: [0, 1.7, 0], pts: [], plain: true });
  await shot('sprite_halo_close');
  await draw({ body: 'sprite', kit: 'aaaa0', eye: [1.9, 1.3, 1.9], pts: [], plain: true });
  await shot('sprite_dagonfire_threequarter');
  await draw({ body: 'sprite', kit: 'bbbb0', eye: [1.9, 1.3, 1.9], pts: [], plain: true });
  await shot('sprite_eternal_threequarter');
  // GUILD-SHOP: THE INSIGNIA ARMLET - the wearer's left upper arm alone, its crest the guild's arms
  const ak = await draw({ kit: '00c00', eye: FRONT, arms: ARMS, keep: true });
  const plate = ak.worn.arms.draws.find((d) => d.part === 1).A;
  const mirrorPlate = [-plate[0], plate[1], plate[2]];
  const armBare = await draw({ kit: '00000', eye: FRONT, pts: [plate, mirrorPlate] });
  const arm = await draw({ kit: '00c00', eye: FRONT, arms: ARMS, pts: [plate, mirrorPlate] });
  await shot('rig_armlet_front');
  check(
    'the Insignia Armlet: drawn without a GL error',
    arm.error === 0 && arm.drawn === 1,
    `error ${arm.error}, drawn ${arm.drawn}`,
  );
  check(
    'the Insignia Armlet beside the left upper arm, never the right',
    arm.px[0] > armBare.px[0] + 90 && arm.px[1] <= armBare.px[1] + 12 && plate[0] < at('shL')[0],
    `${arm.px} against ${armBare.px}`,
  );
  await draw({ kit: '00c00', eye: [-1.2, 1.35, 1.1], at: [-0.22, 1.25, 0], arms: ARMS, pts: [] });
  await shot('rig_armlet_close');
  await draw({ kit: '00c00', eye: [-1.2, 1.35, 1.1], at: [-0.22, 1.25, 0], arms: null, pts: [] });
  await shot('rig_armlet_plain_close');
  await draw({ body: 'sprite', kit: '00c00', eye: FRONT, arms: ARMS, pts: [], plain: true });
  await shot('sprite_armlet_front');
  await draw({ body: 'sprite', kit: '00c00', eye: [0, 1.45, 1.2], at: [0, 1.3, 0], arms: ARMS, pts: [], plain: true });
  await shot('sprite_armlet_close');
  // THE MORROWIND BODY: the pieces on retail's skeleton as the game reads it
  const MWEYE = [0, 1.3, 3.1],
    MWAT = [0, 1.1, 0];
  const mk = await draw({ body: 'mw', kit: 'aaaa0', eye: MWEYE, at: MWAT, keep: true });
  const mwPts = [
    add(add(mk.worn.head.draws[0].A, [0, 1, 0], 0.08), [0, 0, 1], 0.13),
    mk.worn.torso.draws[0].A,
    frontOf(mk.worn.legs.draws[0]),
  ];
  const mwBare = await draw({ body: 'mw', kit: '00000', eye: MWEYE, at: MWAT, pts: mwPts });
  const mwD = await draw({ body: 'mw', kit: 'aaaa0', eye: MWEYE, at: MWAT, pts: mwPts });
  await shot('mw_dagonfire_front');
  check(
    'the Morrowind body in Dagonfire: posed off its bones, drawn without a GL error',
    mwD.error === 0 && mwD.drawn === 4,
    `error ${mwD.error}, drawn ${mwD.drawn}`,
  );
  check(
    'on the Morrowind body: the crown over its head, the heart before its chest, the fire round its shins',
    mwD.px.every((v, i) => v > mwBare.px[i] + 60),
    `${mwD.px} against ${mwBare.px}`,
  );
  const mwE = await draw({ body: 'mw', kit: 'bbbb0', eye: FRONT, at: [0, 1.0, 0], pts: [] });
  const mb = await draw({ body: 'mw', kit: '0b000', eye: BEHIND, at: [0, 1.0, 0], keep: true });
  const backAt = mb.worn.torso.draws.find((d) => d.mesh === 2 && d.N[2] < 0).A;
  const mwBackBare = await draw({ body: 'mw', kit: '00000', eye: BEHIND, at: [0, 1.0, 0], pts: [backAt] });
  const mwBack = await draw({ body: 'mw', kit: '0b000', eye: BEHIND, at: [0, 1.0, 0], pts: [backAt] });
  check(
    "the Eternal Sigil burns off the Morrowind body's back, clear of its torso (AUDIT ARMORY)",
    mwBack.px[0] > mwBackBare.px[0] + 60 && backAt[2] < mb.points.chest[2] - 0.22,
    `${mwBack.px[0]} against ${mwBackBare.px[0]}`,
  );
  await draw({ body: 'mw', kit: 'bbbb0', eye: FRONT, at: [0, 1.0, 0], pts: [] });
  await shot('mw_eternal_front');
  check('the Morrowind body in Eternal: drawn', mwE.error === 0 && mwE.drawn === 4 && mwE.lit > 300, `${mwE.lit}`);
  await draw({ body: 'mw', kit: '00c00', eye: [-1.4, 1.45, 1.4], at: [-0.2, 1.3, 0], arms: ARMS, pts: [] });
  await shot('mw_armlet_close');
  const SETS = [
    ['aaaa0', 'dagonfire'],
    ['bbbb0', 'eternal'],
    ['ccec0', 'tidebound'],
    ['00c00', 'guild'],
    ['00d00', 'crystal'],
  ];
  for (const [kit, name] of SETS) {
    await draw({ body: 'mw', kit, eye: [0, 1.3, 3.1], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`mw_${name}_framed`);
    await draw({ body: 'mw', kit, eye: [2.2, 1.4, 2.2], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`mw_${name}_threequarter`);
    await draw({ body: 'mw', kit, eye: [-2.2, 1.4, 2.2], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`mw_${name}_threequarter_left`);
    await draw({ body: 'mw', kit, eye: [0, 1.3, -3.1], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`mw_${name}_behind`);
    await draw({ body: 'mw', kit, eye: [3.1, 1.3, 0.05], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`mw_${name}_side`);
    await draw({ body: 'mw', kit, eye: [0.5, 1.85, 1.1], at: [0, 1.7, 0], arms: ARMS, pts: [] });
    await shot(`mw_${name}_head`);
    await draw({ body: 'rig', kit, eye: [0, 1.3, 3.1], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`rig_${name}_framed`);
    await draw({ body: 'rig', kit, eye: [2.2, 1.4, 2.2], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`rig_${name}_threequarter`);
    await draw({ body: 'sprite', kit, eye: [0, 1.3, 3.1], at: [0, 1.1, 0], arms: ARMS, pts: [], plain: true });
    await shot(`sprite_${name}_framed`);
    await draw({ body: 'sprite', kit, eye: [2.2, 1.4, 2.2], at: [0, 1.1, 0], arms: ARMS, pts: [], plain: true });
    await shot(`sprite_${name}_threequarter`);
  }
  await draw({ body: 'mw', kit: 'baab0', eye: [2.2, 1.4, 2.2], at: [0, 1.1, 0], pts: [] });
  await shot('mw_mixed_threequarter');
  // each body piece alone on the Morrowind body, three-quarters on, and close up on its part from the front and the side
  // (the weapon's on its stage, below)
  const PART = {
    head: { at: [0, 2.0, 0], d: 1.35 },
    torso: { at: [0, 1.45, 0.05], d: 1.1 },
    arms: { at: [0.16, 1.3, 0], d: 1.2 },
    legs: { at: [0.05, 0.38, 0], d: 1.1 },
  };
  for (const pc of ARMORY_PIECES.filter((x) => x.slot !== 'weapon')) {
    const kit = ['head', 'torso', 'arms', 'legs', 'weapon'].map((sl) => (sl === pc.slot ? pc.code : '0')).join('');
    await draw({ body: 'mw', kit, eye: [2.2, 1.4, 2.2], at: [0, 1.1, 0], arms: ARMS, pts: [] });
    await shot(`piece_${pc.key}`);
    const P = PART[pc.slot],
      lift = pc.slot === 'legs' ? 0.45 : 0.25,
      leftArm = pc.key === 'insigniaarmlet' ? -1 : 1;
    const aim = [P.at[0] * leftArm, P.at[1], P.at[2]];
    await draw({
      body: 'mw',
      kit,
      eye: [aim[0] + 0.55 * P.d * leftArm, aim[1] + lift, P.d * 0.85],
      at: aim,
      arms: ARMS,
      pts: [],
    });
    await shot(`close_${pc.key}`);
    await draw({
      body: 'mw',
      kit,
      eye: [aim[0] + P.d * leftArm, aim[1] + lift * 0.4, 0.12],
      at: aim,
      arms: ARMS,
      pts: [],
    });
    await shot(`close_${pc.key}_side`);
  }
  // THE GAP: every body piece floats - read off the pass's own draws, along a line out from the part it belongs to, a
  // dark band between the body's outline and the piece's light, about its slot's gap and never far past it
  const gaps = [];
  /** @param {string} body @param {string} kit @param {number[]} eye @param {(k: any) => Array<[string, number[], number[], string]>} lines */
  // read at two moments of the clock: a loose ring's tilt turns, so its gap as the eye sees it does too - it must show at
  // both (never touching) and read the slot's gap at one of them
  const gapCheck = async (body, kit, eye, lookAt, lines, extra = {}) => {
    const o = { body, kit, eye, at: lookAt, arms: ARMS, plain: true, floor: false, ...extra };
    const at = [];
    for (const t of [5.3, 9.1]) {
      const k = await draw({ ...o, t, keep: true }),
        b0 = await draw({ ...o, t, kit: null, keep: true });
      at.push({ k, worn: unpack(k), bare: unpack(b0) });
    }
    const marked = shotsAt && process.env.GAPSHOTS ? Buffer.from(at[0].worn) : null;
    const lineSets = at.map((x) => lines(x.k));
    lineSets[0].forEach(([what, , , slot], i) => {
      const reads = at.map((x, m) => {
        const [, from, to, , across = 0, light = 90] = lineSets[m][i];
        return gapAlong(x.bare, x.worn, x.k.vp, from, to, { across, light });
      });
      const g = reads.reduce((p, q) => (q.m > p.m ? q : p)),
        want = ARMORY_HOVER[slot].gap * (at[0].k.scale > 0 ? at[0].k.scale : 1);
      if (marked && reads[0].run)
        // GAPSHOTS=1: the dark run each line found at the first moment, drawn in green on its frame
        for (let q = 0; q <= 1; q += 0.02) {
          const x = Math.round(reads[0].run[0] + (reads[0].run[2] - reads[0].run[0]) * q),
            y = Math.round(reads[0].run[1] + (reads[0].run[3] - reads[0].run[1]) * q),
            j = (y * W + x) * 4;
          if (j >= 0 && j < marked.length) marked.set([0, 255, 0], j);
        }
      gaps.push([`${body} ${what}`, g.m, Math.min(...reads.map((r) => r.m))]);
      check(
        `THE GAP ${body}: ${what} floats clear of it`,
        reads.every((r) => r.found && r.px >= 1) && g.m >= want * 0.35 && g.m <= want * 3,
        `${reads.map((r) => (r.found ? `${r.px} px dark, ${(r.m * 100).toFixed(1)} cm` : 'no light met')).join('; ')} (the gap ${(want * 100).toFixed(1)} cm)`,
      );
    });
    if (marked) {
      const png = new PNG({ width: W, height: H });
      for (let y = 0; y < H; y++) marked.copy(png.data, (H - 1 - y) * W * 4, y * W * 4, (y + 1) * W * 4); // readPixels' rows are bottom-up
      writeFileSync(join(shotsAt, `gap_${body}_${kit}.png`), PNG.sync.write(png));
    }
  };
  const UPV = [0, 1, 0];
  /** the lines a kit's pieces are read along: each ring's out from its middle, a plate's out from its part */
  const linesOf = (k, slots) => {
    const L = [];
    const ptOf = (n) => k.points[n];
    for (const [slot, wp] of Object.entries(k.worn)) {
      if (!slots.includes(slot)) continue;
      const tubes = wp.draws.filter((d) => d.mesh === 0);
      if (wp.key === 'burningcrown' || wp.key === 'eternalhalo')
        // across the head: a helmet's narrow spike stands into the crown's hollow
        L.push([`${wp.key} over the head`, ptOf('head'), add(ptOf('crown'), UPV, 0.35), 'head', tubes[0].r[0] * 0.6]);
      else if (wp.key === 'tidecirclet') {
        const c = mid(tubes[0].A, tubes[0].B);
        L.push([
          `${wp.key} round the head`,
          [ptOf('head')[0], c[1], ptOf('head')[2]],
          add([ptOf('head')[0], c[1], ptOf('head')[2]], [1, 0, 0], tubes[0].r[0] + 0.12),
          'head',
        ]);
      } else if (slot === 'torso') {
        const plateAt = wp.draws.find((d) => d.mesh === 2).A,
          fwd = unit(sub(plateAt, ptOf('chest')));
        L.push([`${wp.key} before the chest`, add(ptOf('chest'), fwd, -0.06), add(plateAt, fwd, 0.1), 'torso']);
      } else if (wp.key === 'insigniaarmlet') {
        const pl = wp.draws.find((d) => d.part === 1).A,
          armAt = add(ptOf('shL'), sub(ptOf('elL'), ptOf('shL')), 0.36);
        L.push([`${wp.key} beside the upper arm`, armAt, add(pl, unit(sub(pl, armAt)), 0.05), 'arms']);
      } else if (wp.key === 'crystalspurs') {
        // the spurs turned out to the side, whose root the eye sees past the arm (one turned to the back stands behind it; a
        // rig's upper arm's under its shoulder, seen from above) - read out to the root, dim beside the tip
        const full = tubes.some((d) => ARMORY_SPURS[d.part].seg === 'fore');
        tubes
          .filter((d) => Math.abs(ARMORY_SPURS[d.part].turn) <= 0.35 && (ARMORY_SPURS[d.part].seg === 'fore') === full)
          .forEach((d, i) => {
            const s = d.A[0] < 0 ? 'L' : 'R',
              fore = ARMORY_SPURS[d.part].seg === 'fore',
              a = ptOf(fore ? `el${s}` : `sh${s}`),
              z = ptOf(fore ? `wa${s}` : `el${s}`),
              ax = unit(sub(z, a)),
              t = Math.max(
                0,
                Math.min(1, sub(d.A, a).reduce((q, v, j) => q + v * ax[j], 0) / Math.hypot(...sub(z, a))),
              ),
              on = add(a, sub(z, a), t);
            L.push([`${wp.key} spur ${d.part} off the arm`, on, add(d.A, unit(sub(d.A, on)), 0.05), 'arms', 0, 40]);
          });
      } else
        tubes.forEach((d, i) => {
          const [from, to, across] = ringLine(d);
          L.push([`${wp.key} ring ${i}`, from, to, slot, across]);
        });
    }
    return L;
  };
  const ABOVE = [0, 2.35, 1.35],
    HEADON = [0, 1.75, 2.0]; // a ring's gap read from well above it, where the eye sees into it past the limb
  for (const body of ['rig', 'mw']) {
    for (const kit of ['a0000', 'b0000']) await gapCheck(body, kit, HEADON, [0, 1.75, 0], (k) => linesOf(k, ['head']));
    await gapCheck(body, 'c0000', [0, 2.35, 1.1], [0, 1.75, 0], (k) => linesOf(k, ['head']));
    for (const kit of ['0a000', '0b000', '0c000'])
      await gapCheck(body, kit, [2.4, 1.4, 0.42], [0, 1.3, 0.1], (k) => linesOf(k, ['torso']));
    for (const kit of ['00a00', '00b00', '00c00', '00e00'])
      await gapCheck(body, kit, ABOVE, [0, 1.15, 0], (k) => linesOf(k, ['arms']));
    await gapCheck(body, '00d00', [0, 1.15, 2.2], [0, 1.1, 0], (k) => linesOf(k, ['arms'])); // a spur's from level with it
    for (const kit of ['000a0', '000b0', '000c0'])
      await gapCheck(body, kit, [0, 1.45, 1.05], [0, 0.3, 0], (k) => linesOf(k, ['legs']));
  }
  // the wolf: its chest, arms and legs, fitted to it
  for (const kit of ['0a000', '0b000', '0c000'])
    await gapCheck('wolf', kit, [2.6, 1.3, 0.9], [0, 1.0, 0.3], (k) => linesOf(k, ['torso']));
  for (const kit of ['00a00', '00b00', '00e00'])
    await gapCheck('wolf', kit, [0, 2.3, 1.7], [0, 1.0, 0.3], (k) => linesOf(k, ['arms']));
  for (const kit of ['000a0', '000b0', '000c0'])
    await gapCheck('wolf', kit, [0, 1.45, 1.4], [0, 0.3, 0.05], (k) => linesOf(k, ['legs']));
  // the sprite: its head's pieces over the painted head, its arms' and legs' round the painted limbs (a chest piece lies
  // on the eye's line through the painted chest: its gap is depth alone, which a picture has none of)
  for (const kit of ['a0000', 'b0000']) await gapCheck('sprite', kit, FRONT, [0, 1.2, 0], (k) => linesOf(k, ['head']));
  await gapCheck('sprite', 'c0000', [0, 2.3, 1.6], [0, 1.6, 0], (k) => linesOf(k, ['head']));
  for (const kit of ['00a00', '00b00', '00c00', '00e00'])
    await gapCheck('sprite', kit, [0, 2.3, 1.6], [0, 1.2, 0], (k) => linesOf(k, ['arms']));
  await gapCheck('sprite', '00d00', [0, 1.3, 2.2], [0, 1.2, 0], (k) => linesOf(k, ['arms']));
  for (const kit of ['000a0', '000b0', '000c0'])
    await gapCheck('sprite', kit, [0, 1.45, 1.2], [0, 0.35, 0], (k) => linesOf(k, ['legs']));
  console.log(
    'gaps',
    JSON.stringify(gaps.map(([n, m, least]) => [n, +(m * 100).toFixed(1), +(least * 100).toFixed(1)])),
  );
  // the wolf, turned: its pieces on its chest, arms and legs, never its head
  for (const [kit, name] of SETS.slice(0, 3)) {
    const wf = await draw({ body: 'wolf', kit, eye: [2.3, 1.4, 2.3], at: [0, 0.95, 0.2], pts: [] });
    await shot(`wolf_${name}_threequarter`);
    check(
      `the wolf in ${name}: its chest, arms and legs drawn, never its head`,
      wf.error === 0 && wf.drawn === 3,
      `drawn ${wf.drawn}`,
    );
    await draw({ body: 'wolf', kit, eye: [3.0, 1.2, 0.4], at: [0, 0.95, 0.2], pts: [] });
    await shot(`wolf_${name}_side`);
  }
  await draw({ body: 'wolf', kit: null, eye: [2.3, 1.4, 2.3], at: [0, 0.95, 0.2], pts: [] });
  await shot('wolf_bare');
  // the walk: a Cinderstride's footfall embers on the ground behind
  const walk = await draw({ kit: '000a0', eye: [0, 1.6, 2.6], walk: 1, pts: [] });
  await shot('rig_cinderstride_walk');
  check('the Cinderstride walking: drawn', walk.error === 0 && walk.lit > 100, `${walk.lit}`);
  const still = await draw({ kit: '000c0', eye: [1.4, 1.5, 2.6], at: [0, 0.2, 0.9], pts: [] });
  const wade = await draw({ kit: '000c0', eye: [1.4, 1.5, 2.6], at: [0, 0.2, 0.9], walk: 2, pts: [] }); // two strides walked ahead of the body, the ground looked down at
  await shot('rig_tidegreaves_walk');
  check(
    'the Tidebound Greaves walking: ripples where the feet fell',
    wade.error === 0 && wade.lit > still.lit + 40,
    `${wade.lit} lit, standing ${still.lit}`,
  );
  // THE WEAPON PIECE'S STAGE (render/weaponPiecePreview.js): the blade and the classic hand's own outline round it
  const stage = await browser.newPage({ viewport: { width: 320, height: 420 } });
  stage.on('pageerror', (x) => errs.push(x.message));
  await stage.goto(`http://127.0.0.1:${port}/stage/`);
  for (const [key, look] of [
    ['eternaledge', 'edge'],
    ['breachbrand', 'brand'],
    ['tideedge', 'tide'],
  ]) {
    const s = await stage.evaluate((spec) => window.stageOf(spec), glowSpec(look, ARMORY_LEVEL));
    if (shotsAt) await stage.locator('#s').screenshot({ path: join(shotsAt, `stage_${key}.png`) });
    check(
      `${key}: its stage starts and draws without a GL error`,
      s.ok && s.error === 0,
      JSON.stringify(s).slice(0, 200),
    );
    check(
      `${key}: the blade stands in the middle, steel`,
      s.blade[0] > 90 && Math.abs(s.blade[0] - s.blade[2]) < 60,
      s.blade.join(', '),
    );
    const [r, , b] = s.beside;
    check(
      `${key}: its light beside the blade, in its own colours`,
      look === 'edge' ? b > 150 && b > r : look === 'tide' ? s.beside[1] > 100 && s.beside[1] > r : r > 150 && r > b,
      s.beside.join(', '),
    );
    check(
      `${key}: nothing far from the blade`,
      s.far.every((v) => v < 30),
      s.far.join(', '),
    );
  }
  check(
    "an Eternal Edge kit alone takes the weapon's stage, any other kit the figure's",
    weaponStageOf('0000b') === 'edge' && weaponStageOf('b000b') === null && weaponStageOf(null) === null,
  );
  // the pieces in Daggerfall's levels - each kit drawn close with the law on: no GL error, as much of it lit as per pixel,
  // and never snapped (no more of its lit pixels the same as their neighbour than per pixel, give or take the levels'
  // own runs); a shot of each
  for (const [name, kit] of [
    ['dagonfire', 'aaaa0'],
    ['eternal', 'bbbb0'],
    ['spurs', '00d00'],
    ['armlet', '00c00'],
    ['tidebound', 'ccec0'],
  ]) {
    const close = { kit, eye: [0, 1.3, 1.5], at: [0, 1.1, 0], arms: ARMS };
    const flat = await draw(close),
      px = await draw({ ...close, pixel: true });
    await shot(`pixel_${name}`);
    check(
      `${name}: in its levels, drawn without a GL error`,
      px.error === 0 && px.drawn > 0,
      `error ${px.error}, drawn ${px.drawn}`,
    );
    check(`${name}: as much of it lit`, px.lit > flat.lit * 0.6, `${px.lit} lit, per pixel ${flat.lit}`);
    check(
      `${name}: not snapped`,
      px.same < flat.same + 0.25,
      `${px.same.toFixed(2)} as their neighbour, per pixel ${flat.same.toFixed(2)}`,
    );
  }
  const real = errs.filter((x) => !/GPU stall|fallback to software WebGL|404 \(Not Found\)/.test(x)); // the driver's own notes, and the page's missing favicon
  check('no page error', real.length === 0, real.join(' | ').slice(0, 600));
} finally {
  await browser.close();
  server.close();
}
const failed = out.filter((x) => !x).length;
console.log(`${out.length - failed}/${out.length}`);
process.exitCode = failed ? 1 : 0;
