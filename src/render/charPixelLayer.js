// @ts-check
// CHAR-PIX1 (2026-10-27, the owner: "в оригинале моделька персонажа немного пикселизируется как и у нпс ... сделай эту
// пикселизацию грамотно"): THE MORROWIND BODY, PIXELATED IN PLACE. Daggerfall's own people are sprites drawn on its
// 320x200 frame, so a body is as chunky as the world around it. The port's Morrowind bodies left that look at
// MW-TP-MESH-ALL (fpArm.js drawThird) because the old way to it was a picture pasted on a camera-facing card
// (characterSprite.js): the feet lost the ground, the card popped where the distance switched it, and the picture
// re-rounded its size each frame and shimmered.
//
// This pass keeps the mesh and only lowers its resolution: the body is drawn under the WORLD's own camera into a
// low-resolution colour + depth target, then written back block by block, each block taking its texel's colour AND its
// depth (gl_FragDepth). Nothing moves: the perspective, the ground contact and the occlusion are the mesh's own, and a
// wall or a tuft in front of a leg cuts it per block. The blocks sit on a grid locked to the screen, so a body that
// walks slides under a still grid the way a sprite did on Daggerfall's frame - no swimming, no re-rounding.
//
// The size is in ROWS PER SCREEN HEIGHT, not in pixels: 200 is Daggerfall's own frame, at any window or render scale.
// Three dials (systems/features.js char-pixel-*): the first-person hands (fpArm.js draw, the viewmodel's own sprite
// pass), the player's own body, and everyone else's - NPCs, foes, guards, other players.
import { buildProgram } from './glProgram.js';
import { getPref } from '../systems/uiPrefs.js';
import { CHAR_PIXEL_INITIAL, CHAR_PIXEL_PREFS } from '../systems/charPixel.js';

/** The rows a dial stands at (0 off) - `who` fp, player or npc. */
export function charPixelRows(who) {
  const v = Number(getPref(CHAR_PIXEL_PREFS[who] ?? CHAR_PIXEL_PREFS.npc));
  return Number.isFinite(v) && v >= 0 ? v : CHAR_PIXEL_INITIAL[who] ?? 0;
}

/** The size of a block in pixels of a target `height` tall, at `rows` (whole pixels, so every block is the same; 1 is none). */
export const blockPixels = (height, rows) => (rows > 0 ? Math.max(1, Math.round(height / rows)) : 1);

const VS = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform highp sampler2D uDepth;
uniform vec3 uGrid;   // the viewport's corner and the block size, in target pixels
out vec4 outColor;
void main() {
  ivec2 t = ivec2(floor((gl_FragCoord.xy - uGrid.xy) / uGrid.z));
  vec4 c = texelFetch(uColor, t, 0);
  if (c.a < 0.5) discard;
  outColor = vec4(c.rgb, 1.0);
  gl_FragDepth = texelFetch(uDepth, t, 0).r;
}`;

const layers = new WeakMap();   // renderer -> its target, program and buffers

function layerOf(renderer) {
  let L = layers.get(renderer);
  if (L) return L;
  const gl = renderer.gl;
  const prog = buildProgram(gl, VS, FS, 'char-pixel');
  L = {
    prog, vao: gl.createVertexArray(), fbo: gl.createFramebuffer(), color: gl.createTexture(), depth: gl.createTexture(),
    w: 0, h: 0, uColor: gl.getUniformLocation(prog, 'uColor'), uDepth: gl.getUniformLocation(prog, 'uDepth'),
    uGrid: gl.getUniformLocation(prog, 'uGrid'), proj: new Float32Array(16),
  };
  layers.set(renderer, L);
  return L;
}

function sizeLayer(gl, L, w, h) {
  if (L.w >= w && L.h >= h) return;
  L.w = Math.max(L.w, w); L.h = Math.max(L.h, h);
  const tex = (t, fmt, type, internal) => {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, L.w, L.h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  tex(L.color, gl.RGBA, gl.UNSIGNED_BYTE, gl.RGBA8);
  tex(L.depth, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, gl.DEPTH_COMPONENT24);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, L.color, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, L.depth, 0);
}

/** The screen rectangle (target pixels, relative to the viewport) the world points `corners` cover, padded a block;
 *  null when any stands behind the eye (the whole viewport then). */
function screenRect(corners, pv, vw, vh, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y, z] of corners) {
    const w = pv[3] * x + pv[7] * y + pv[11] * z + pv[15];
    if (w <= 1e-4) return null;
    const nx = (pv[0] * x + pv[4] * y + pv[8] * z + pv[12]) / w, ny = (pv[1] * x + pv[5] * y + pv[9] * z + pv[13]) / w;
    x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
  }
  const mx = (x1 - x0) * 0.1, my = (y1 - y0) * 0.1;   // a tenth more each side: a swung blade or a cape past the box
  x0 -= mx; x1 += mx; y0 -= my; y1 += my;
  const l = Math.max(0, Math.floor((x0 + 1) * 0.5 * vw) - pad), b = Math.max(0, Math.floor((y0 + 1) * 0.5 * vh) - pad);
  const r = Math.min(vw, Math.ceil((x1 + 1) * 0.5 * vw) + pad), t = Math.min(vh, Math.ceil((y1 + 1) * 0.5 * vh) + pad);
  return r > l && t > b ? [l, b, r - l, t - b] : [0, 0, 0, 0];
}

const mul4 = (a, b, out) => {   // column-major a*b
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return out;
};
const _pv = new Float32Array(16);

/**
 * Draw `draws` ({ mesh, model }, drawn in order under one picture) pixelated at `rows` per screen height, or straight
 * through renderer.drawCharacter when the dial is off or a block would be one pixel. `corners`, optional: world points
 * that hold the whole figure (its box's eight) - the write-back covers their rectangle alone, not the screen.
 */
export function drawPixelatedCharacters(renderer, draws, rows, corners = null) {
  const gl = renderer.gl;
  const vp = /** @type {Int32Array} */ (gl.getParameter(gl.VIEWPORT));
  const px = blockPixels(vp[3], rows);
  if (px <= 1 || renderer._spriteDepth > 0) {
    for (const d of draws) renderer.drawCharacter(d.mesh, d.model);
    return;
  }
  const vw = vp[2], vh = vp[3];
  const rect = corners ? screenRect(corners, mul4(renderer._proj, renderer._view, _pv), vw, vh, px * 2) : [0, 0, vw, vh];
  if (rect && rect[2] === 0) return;   // wholly off the screen
  const [rx, ry, rw, rh] = rect ?? [0, 0, vw, vh];
  const L = layerOf(renderer);
  const lw = Math.ceil(vw / px), lh = Math.ceil(vh / px);
  const fboWas = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  sizeLayer(gl, L, lw, lh);
  gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
  // The low target is lw*px wide, a little past the viewport: the clip space is squeezed to it, so each texel is exactly
  // one block of the screen, its grid anchored at the viewport's corner.
  const sx = vw / (lw * px), sy = vh / (lh * px);
  const P = renderer._proj, Q = L.proj;
  for (let c = 0; c < 4; c++) {
    Q[c * 4] = sx * P[c * 4] + (sx - 1) * P[c * 4 + 3];
    Q[c * 4 + 1] = sy * P[c * 4 + 1] + (sy - 1) * P[c * 4 + 3];
    Q[c * 4 + 2] = P[c * 4 + 2]; Q[c * 4 + 3] = P[c * 4 + 3];
  }
  const tl = Math.floor(rx / px), tb = Math.floor(ry / px), tr = Math.ceil((rx + rw) / px), tt = Math.ceil((ry + rh) / px);
  gl.viewport(0, 0, lw, lh);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(tl, tb, tr - tl, tt - tb);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const cc = renderer._clearColor;
  gl.clearColor(cc[0], cc[1], cc[2], cc[3]);
  const sp = renderer._proj;
  renderer._proj = Q; renderer._cFrameStamp = -1;   // LA-COST1's block, re-sent under the squeezed camera and again after
  try {
    for (const d of draws) renderer.drawCharacter(d.mesh, d.model);
  } finally {
    renderer._proj = sp; renderer._cFrameStamp = -1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboWas);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  }
  gl.scissor(vp[0] + rx, vp[1] + ry, rw, rh);
  renderer._use(L.prog);
  renderer._bindVao(L.vao);
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, L.depth);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, L.color);
  renderer._tex0Bound = null;   // PERF-TEX3: unit 0 is this pass's now
  gl.uniform1i(L.uColor, 0); gl.uniform1i(L.uDepth, 6);
  gl.uniform3f(L.uGrid, vp[0], vp[1], px);
  // The renderer's front face is CW for its life (renderer.js frontFace) - this triangle would be culled as a back.
  const culled = gl.isEnabled(gl.CULL_FACE);
  gl.disable(gl.CULL_FACE);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (culled) gl.enable(gl.CULL_FACE);
  gl.disable(gl.SCISSOR_TEST);
  gl.activeTexture(gl.TEXTURE6);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, null);   // the next body draws into this target - it may not sample it
}

/** The eight corners of a box in a model's space, taken to the world by `toWorld` (x, y, z) => [x, y, z]. */
export function boxCorners(box, toWorld) {
  const out = [];
  for (const x of [box.minX, box.maxX]) for (const y of [box.minY, box.maxY]) for (const z of [box.minZ, box.maxZ]) out.push(toWorld(x, y, z));
  return out;
}
