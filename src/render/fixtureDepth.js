// Conservative visibility for crowded fixture batches. Each tile records the farthest
// depth already present, including empty pixels. A single uncovered tile keeps the draw.
import { buildProgram } from './glProgram.js';
import { multiply } from '../world/mat4.js';

const tile = 16;
const vs = `#version 300 es
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(p, 0., 1.);
}`;
const fs = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D scene;
out uvec4 color;
void main() {
  ivec2 at = ivec2(gl_FragCoord.xy) * 16;
  ivec2 last = textureSize(scene, 0) - 1;
  float farthest = 0.;
  for (int y = 0; y < 16; ++y) for (int x = 0; x < 16; ++x)
    farthest = max(farthest, texelFetch(scene, min(at + ivec2(x, y), last), 0).r);
  uint d = uint(ceil(farthest * 65535.));
  color = uvec4(d >> 8, d & 255u, 0u, 255u);
}`;

const layers = new WeakMap();
function readTiles(r, frame) {
  const gl = r.gl;
  const w = Math.ceil(frame.w / tile), h = Math.ceil(frame.h / tile);
  let l = layers.get(r);
  if (!l) {
    const prog = buildProgram(gl, vs, fs, 'fixture-depth');
    l = { prog, sampler: gl.getUniformLocation(prog, 'scene'), fbo: gl.createFramebuffer(),
      color: gl.createRenderbuffer(), w: 0, h: 0, data: new Uint8Array(0) };
    layers.set(r, l);
  }
  const vp = gl.getParameter(gl.VIEWPORT);
  if (vp[0] || vp[1] || vp[2] !== frame.w || vp[3] !== frame.h ||
      gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) !== frame.fbo ||
      gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) !== frame.fbo || gl.isEnabled(gl.SCISSOR_TEST) ||
      !gl.isEnabled(gl.DEPTH_TEST) || ![gl.LESS, gl.LEQUAL].includes(gl.getParameter(gl.DEPTH_FUNC)) ||
      gl.getParameter(gl.DEPTH_RANGE)[0] !== 0 || gl.getParameter(gl.DEPTH_RANGE)[1] !== 1 ||
      gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING) || gl.getParameter(gl.PACK_ROW_LENGTH) ||
      gl.getParameter(gl.PACK_SKIP_ROWS) || gl.getParameter(gl.PACK_SKIP_PIXELS) || gl.getParameter(gl.PACK_ALIGNMENT) > 4 ||
      gl.isEnabled(gl.STENCIL_TEST) || !gl.getParameter(gl.COLOR_WRITEMASK).every(Boolean)) return null;
  const cull = gl.isEnabled(gl.CULL_FACE), blend = gl.isEnabled(gl.BLEND);
  const program = gl.getParameter(gl.CURRENT_PROGRAM), unit = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0);
  const tex = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindFramebuffer(gl.FRAMEBUFFER, l.fbo);
  try {
    if (l.w !== w || l.h !== h) {
      const rb = gl.getParameter(gl.RENDERBUFFER_BINDING);
      gl.bindRenderbuffer(gl.RENDERBUFFER, l.color);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8UI, w, h);
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, l.color);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
      l.w = w; l.h = h; l.data = new Uint8Array(w * h * 4);
    }
    gl.viewport(0, 0, w, h);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    gl.useProgram(l.prog); gl.bindTexture(gl.TEXTURE_2D, frame.depth);
    gl.uniform1i(l.sampler, 0); gl.drawArrays(gl.TRIANGLES, 0, 3);
    l.data[3] = 0;
    gl.readPixels(0, 0, w, h, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, l.data);
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.activeTexture(unit); gl.useProgram(program);
    if (cull) gl.enable(gl.CULL_FACE);
    if (blend) gl.enable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.fbo);
    gl.viewport(vp[0], vp[1], vp[2], vp[3]);
  }
  if (l.data[3] !== 255) return null;
  return { layer: l, pv: multiply(r._proj, r._view), width: vp[2], height: vp[3] };
}

const scopes = new WeakMap();
export function withFixtureDepth(r, draw) {
  const frame = r._air?.frame;
  if (!frame?.depth || frame.fbo !== r._frameFbo || r._panelSaved || r._rwOutside || scopes.has(r)) return draw();
  scopes.set(r, { frame, count: 0, tiles: null });
  try { return draw(); } finally { scopes.delete(r); }
}

export function fixtureHidden(r, corners, pad) {
  const scope = scopes.get(r);
  if (!scope || !corners) return false;
  // Amortize a single current-frame GPU read over dense batches only.
  if (++scope.count === 24) scope.tiles = readTiles(r, scope.frame);
  return scope.tiles ? tilesHideBounds(scope.tiles, corners, pad) : false;
}

export function tilesHideBounds({ layer, pv, width, height }, corners, pad) {
  let left = width, right = 0, bottom = height, top = 0, nearest = 1;
  for (const [x, y, z] of corners) {
    const w = pv[3]*x + pv[7]*y + pv[11]*z + pv[15];
    const cz = pv[2]*x + pv[6]*y + pv[10]*z + pv[14];
    if (w <= 0 || cz <= -w) return false;
    const sx = ((pv[0]*x + pv[4]*y + pv[8]*z + pv[12])/w + 1) * width/2;
    const sy = ((pv[1]*x + pv[5]*y + pv[9]*z + pv[13])/w + 1) * height/2;
    left = Math.min(left, sx); right = Math.max(right, sx);
    bottom = Math.min(bottom, sy); top = Math.max(top, sy);
    nearest = Math.min(nearest, (cz/w + 1)/2);
  }
  const x0 = Math.max(0, Math.floor((left-pad)/tile)), x1 = Math.min(layer.w-1, Math.floor((right+pad)/tile));
  const y0 = Math.max(0, Math.floor((bottom-pad)/tile)), y1 = Math.min(layer.h-1, Math.floor((top+pad)/tile));
  // Leave room for depth quantization and projection rounding at a shared surface.
  const limit = nearest * 65535 - 2;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = 4*(y*layer.w+x);
    if (layer.data[i]*256 + layer.data[i+1] >= limit) return false;
  }
  return true;
}
