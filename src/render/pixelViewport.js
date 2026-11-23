// Keep the driver's answer for recently used viewport rectangles. The pixel
// pass needs a stable snapshot while it switches to its own smaller target.
const contexts = new WeakMap();
const isGLint = n => typeof n === 'number' && n === (n | 0);

export function pixelViewport(gl) {
  let state = contexts.get(gl);
  if (!state) {
    if (typeof gl.viewport !== 'function' || !gl.canvas?.addEventListener) return gl.getParameter(gl.VIEWPORT);
    state = { recent: [], keyed: false, lost: false };
    contexts.set(gl, state);
    const viewport = gl.viewport;
    gl.viewport = function(x, y, w, h) {
      const result = viewport.apply(this, arguments);
      if (this === gl) {
        state.keyed = arguments.length === 4 && isGLint(x) && isGLint(y) && isGLint(w) && isGLint(h) && w >= 0 && h >= 0;
        state.x = x; state.y = y; state.w = w; state.h = h;
      }
      return result;
    };
    const reset = lost => { state.recent.length = 0; state.keyed = false; state.lost = lost; };
    gl.canvas.addEventListener('webglcontextlost', () => reset(true));
    gl.canvas.addEventListener('webglcontextrestored', () => reset(false));
  }
  if (!state.keyed || state.lost) return gl.getParameter(gl.VIEWPORT);
  for (const row of state.recent) {
    if (row.x === state.x && row.y === state.y && row.w === state.w && row.h === state.h) return row.value;
  }
  const value = gl.getParameter(gl.VIEWPORT);
  if (value) {
    if (state.recent.length === 8) state.recent.pop();
    state.recent.unshift({ x: state.x, y: state.y, w: state.w, h: state.h, value });
  }
  return value;
}
