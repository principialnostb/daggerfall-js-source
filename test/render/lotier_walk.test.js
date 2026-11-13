// The lo tier signs its lamps in one walk a frame (render/shadowPass.js _renderLo). Every lamp past the twelve asks
// its static signature to know whether its lo map is still the room's, and each ask walked every record of the frame:
// a still tavern of twenty-four lamps walked its records twelve times a frame to answer "nothing changed" twelve times.
// Now one walk answers every lamp that may ask, and each answer is the one that lamp's own walk gives - pinned here
// against a one-lamp walk on the same records, frame by frame, through a story that spends the rebuild budget, moves
// the eye so lamps leave and join the twelve, and takes a caster away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import { SHADOW_POINT_CASTERS, SHADOW_TUNING } from '../../src/render/shadowPass.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const at = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

function recordingGl() {
  const calls = [];
  let ids = 0;
  const consts = { TEXTURE0: 1000, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, FRAMEBUFFER: 36160 };
  const gl = new Proxy({}, {
    get(_, key) {
      if (key in consts) return consts[key];
      if (key === 'getProgramParameter' || key === 'getShaderParameter') return () => true;
      if (key === 'getUniformLocation') return (_p, name) => name;
      if (key === 'getAttribLocation') return () => 0;
      if (key === 'createShader' || key === 'createProgram' || key === 'createBuffer' || key === 'createVertexArray'
        || key === 'createTexture' || key === 'createFramebuffer' || key === 'createRenderbuffer') return () => ({ id: ++ids });
      if (key === 'getParameter') return () => new Float32Array(4);
      if (typeof key === 'string' && key.toUpperCase() === key) return 1;
      return (...args) => { calls.push([key, ...args.map((arg) => (ArrayBuffer.isView(arg) ? arg.slice() : arg))]); };
    },
  });
  return { calls, canvas: { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 } };
}

/** A tavern drawn whole: a room mesh reaching every lamp, a crate, `count` lamps of range 15 in a row along x. */
function tavern() {
  const { calls, canvas } = recordingGl();
  const renderer = new Renderer(canvas);
  renderer.setLightingLane(EL_LANE);
  renderer.textures.set('1_1', { id: 't11' });
  renderer.setLighting(new Float32Array([0.18, 0.18, 0.18]), 0);
  const room = { vao: { id: 'vao-room' }, buffers: [], bounds: new Float32Array([0, 2, 0, 40]), subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 2 }] };
  const crate = { vao: { id: 'vao-crate' }, buffers: [], bounds: new Float32Array([0, 0.5, 0, 0.8]), subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 2 }] };
  const lamps = (count) => {
    const list = new Float32Array(count * 4);
    for (let k = 0; k < count; k++) list.set([k * 1.5, 2, 3, 15], k * 4);
    return list;
  };
  const frame = (draw, lights, view = I) => {
    renderer.setPointLights(lights, new Float32Array([1, 1, 1]));
    renderer.everyLightCasts();
    calls.length = 0;
    renderer.beginFrame(I, view, new Float32Array([0.45, 0.8, 0.35]), WORLD_FRAME);
    const stats = { ...renderer.shadows.stats, casterOf: [...renderer.shadows.casterOf] };
    draw();
    renderer.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
    return stats;
  };
  return { renderer, shadows: renderer.shadows, room, crate, lamps, frame };
}

test('the lo tier signs every lamp in one walk a frame, each answer the one its own walk gives - a still room, a crate that spends the rebuild budget, the eye walking so lamps leave and join the twelve, the crate taken away (the base: a walk a lamp)', () => {
  const was = SHADOW_TUNING.override;
  SHADOW_TUNING.override = false;   // the plain budget, so a change takes several frames to settle
  try {
    const t = tavern();
    const sp = t.shadows;
    const walk = sp._staticSignatures.bind(sp);
    let loWalks = 0, compared = 0;
    const one = new Float64Array(4), oneOut = new Int32Array(2);
    sp._staticSignatures = (lamps, count, out, quads, anim = false) => {
      walk(lamps, count, out, quads, anim);
      if (!anim) return;   // the twelve's walk (one a frame already) - not the lo tier's
      loWalks++;
      // each lamp's answer against a walk of that lamp alone, on the same records
      for (let k = 0; k < count; k++) {
        one.set(lamps.subarray(k * 4, k * 4 + 4));
        walk(one, 1, oneOut, quads, anim);
        assert.deepEqual([out[k * 2], out[k * 2 + 1]], [oneOut[0], oneOut[1]], `lamp ${k} of ${count}: the one walk's answer is its own walk's`);
        compared++;
      }
    };
    const L = t.lamps(24);
    const still = () => t.renderer.drawMesh(t.room, I, null);
    const withCrate = () => { still(); t.renderer.drawMesh(t.crate, at(24, 0, 3), null); };
    const away = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -28.5, 0, 0, 1]);
    const story = [
      ...Array(4).fill([still, I]), ...Array(8).fill([withCrate, I]), ...Array(4).fill([withCrate, away]),
      ...Array(4).fill([withCrate, I]), ...Array(8).fill([still, I]),
    ];
    let loFaces = 0, frames = 0;
    for (const [draw, view] of story) {
      loWalks = 0;
      const st = t.frame(draw, L, view);
      const reading = st.casterOf.slice(0, 24).filter((slot) => slot >= SHADOW_POINT_CASTERS).length;
      if (st.loSlots > 0) {
        assert.ok(reading > 0, `frame ${frames}: lamps read lo maps`);
        assert.equal(loWalks, 1, `frame ${frames}: one walk for the ${reading} lamps reading lo maps, not one a lamp`);
      }
      loFaces += st.loFaces;
      frames++;
    }
    assert.ok(loFaces > 6 * 12, `the story redrew lo maps (${loFaces / 6}): the budget was spent and the answers mattered`);
    assert.ok(compared >= 12 * 20, `every lamp's answer compared (${compared})`);
  } finally { SHADOW_TUNING.override = was; }
});
