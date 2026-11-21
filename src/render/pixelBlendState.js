// A synchronous blend query can wait for all the terrain and sprite draws
// already queued. Observe the setters on this context, including foreign
// passes, and take a copy only when a translucent pixel layer needs it.
const contexts = new WeakMap();

export function observePixelBlendState(gl) {
  if (contexts.has(gl)) return;
  const state = {enabled:null, depthMask:null, factors:null, cull:null};
  contexts.set(gl,state);
  const common = new Set([gl.ZERO,gl.ONE,gl.SRC_COLOR,gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA]);
  function observe(name, update) {
    const original = gl[name];
    gl[name] = function(...args) {
      const result = original.apply(this,args);
      if (this === gl) update(...args);
      return result;
    };
  }
  observe('enable', cap => { if (cap === gl.BLEND) state.enabled = true; else if (cap === gl.CULL_FACE) state.cull = true; });
  observe('disable', cap => { if (cap === gl.BLEND) state.enabled = false; else if (cap === gl.CULL_FACE) state.cull = false; });
  observe('depthMask', value => { state.depthMask = !!value; });
  function factors(src,dst,srcAlpha,dstAlpha) {
    // Other combinations (including invalid or extension-specific ones)
    // go through the driver's own read on demand.
    if (!common.has(src) || !common.has(dst) || !common.has(srcAlpha) || !common.has(dstAlpha)) {
      state.factors = null;
      return;
    }
    const f = state.factors ??= [];
    f[0]=src; f[1]=dst; f[2]=srcAlpha; f[3]=dstAlpha;
  }
  observe('blendFunc', (src,dst) => factors(src,dst,src,dst));
  observe('blendFuncSeparate', factors);
  gl.canvas?.addEventListener?.('webglcontextrestored', () => {
    state.enabled=null; state.depthMask=null; state.factors=null; state.cull=null;
  });
}

export function knownPixelCullState(gl) {
  return contexts.get(gl)?.cull;
}

export function knownPixelBlendState(gl) {
  const s = contexts.get(gl);
  if (s?.enabled == null || s.depthMask == null || !s.factors) return null;
  return {enabled:s.enabled,depthMask:s.depthMask,factors:s.factors.slice()};
}
