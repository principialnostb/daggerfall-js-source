// A lamp whose movers did not change keeps the faces it drew (render/shadowPass.js _moversSame), and every live face
// of every lamp holds, frame after frame, what a twin renderer with the hold off (SHADOW_TUNING.moverHold false) holds.
// Each layer's contents are modelled from the GL calls: a clear empties a layer, the copy draw sets a live layer to its
// cache layer, a depth draw adds itself - named by its program, vertex array, range, picture and that picture's mip
// cap, and every uniform its program holds (a flat's wind only while it sways: the shader reads it only then). The
// story stands the card and two townsfolk still, turns the camera, animates, walks, hides and narrows them, nudges a
// lamp, caps the mip maps through the renderer's own retro source, and blows a wind through a wood and a tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, WORLD_FRAME } from '../../src/render/renderer.js';
import { EL_LANE } from '../../src/render/enhancedLighting.js';
import { SHADOW_TUNING } from '../../src/render/shadowPass.js';
import { setValue, getBool, getInt } from '../../src/systems/settings/settings.js';
import { retroFrameConfig } from '../../src/systems/retroMode.js';

const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const at = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
const GL = { TEXTURE0: 33984, TEXTURE_2D: 3553, TEXTURE_2D_ARRAY: 35866, TEXTURE_MAX_LEVEL: 33085, TRIANGLES: 4, LESS: 513, ALWAYS: 519, DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009, FRAMEBUFFER: 36160 };
const WIND = ['uFlatWind', 'uWindfallSway', 'uWindfallAxis'];

function recordingGl() {
  const calls = [];
  let ids = 0;
  const gl = new Proxy({}, {
    get(_, key) {
      if (key in GL) return GL[key];
      if (key === 'getProgramParameter' || key === 'getShaderParameter') return () => true;
      if (key === 'getUniformLocation') return (_p, name) => name;
      if (key === 'getAttribLocation') return () => 0;
      if (key === 'createShader' || key === 'createProgram' || key === 'createBuffer' || key === 'createVertexArray'
        || key === 'createTexture' || key === 'createFramebuffer' || key === 'createRenderbuffer') return () => ({ id: ++ids });
      if (key === 'getParameter') return () => new Float32Array(4);
      if (typeof key === 'string' && key.toUpperCase() === key) return 1;
      return (...args) => { calls.push([key, ...args.map((arg) => (ArrayBuffer.isView(arg) ? Array.from(arg) : arg))]); };
    },
  });
  return { calls, canvas: { getContext: () => gl, clientWidth: 320, clientHeight: 200, width: 320, height: 200 } };
}

/** The depth layers' contents from the calls ('L<n>' live, 'C<n>' cache: a Set of draw names), and each live layer's
 *  work this frame (draws and copies). */
function model(sp) {
  const content = new Map(), uniforms = new Map(), bound = new Map(), cap = new Map();
  let prog = null, fbo = null, vao = null, layer = null, unit = GL.TEXTURE0;
  const role = (p) => Object.keys(sp.programs).find((key) => sp.programs[key]?.p === p) ?? 'other';
  return {
    content,
    feed(calls) {
      const names = new Map();
      sp.pointFbos.forEach((fb, i) => names.set(fb, `L${i}`));
      (sp.cacheFbos ?? []).forEach((fb, i) => names.set(fb, `C${i}`));
      const work = new Map();
      const note = (what) => { if (fbo?.[0] !== 'L') return; const w = work.get(fbo) ?? { draws: 0, copies: 0 }; w[what]++; work.set(fbo, w); };
      for (const [key, ...args] of calls) {
        if (key === 'useProgram') prog = args[0];
        else if (key === 'bindFramebuffer' && args[0] === GL.FRAMEBUFFER) fbo = names.get(args[1]) ?? null;
        else if (key === 'bindVertexArray') vao = args[0];
        else if (key === 'activeTexture') unit = args[0];
        else if (key === 'bindTexture' && args[0] === GL.TEXTURE_2D) bound.set(unit, args[1]);
        else if (key === 'texParameteri' && args[0] === GL.TEXTURE_2D && args[1] === GL.TEXTURE_MAX_LEVEL) cap.set(bound.get(unit), args[2]);
        else if (key === 'uniform1i' && args[0] === 'uLayer') layer = args[1];
        else if (key.startsWith('uniform') && prog) {
          if (!uniforms.has(prog)) uniforms.set(prog, new Map());
          uniforms.get(prog).set(args[0], JSON.stringify(args.slice(1)));
        } else if (key === 'clear' && fbo) content.set(fbo, new Set());
        else if (key === 'drawArrays' && prog === sp.programs.copy.p && fbo) { content.set(fbo, new Set(content.get(`C${layer}`) ?? [])); note('copies'); }
        else if ((key === 'drawElements' || key === 'drawArrays') && fbo) {
          const held = uniforms.get(prog) ?? new Map();
          const still = held.get('uSway') === undefined || held.get('uSway') === '[0]';
          const named = [...held].filter(([name]) => !(still && WIND.includes(name))).map(([name, value]) => `${name}=${value}`).sort().join(' ');
          const picture = bound.get(GL.TEXTURE0);
          const sampled = ['bb', 'meshCutout', 'meshGlass', 'bodyCut', 'charCut'].includes(role(prog)) ? `${picture?.id}@${cap.get(picture) ?? 'chain'}` : '-';   // a depth draw that reads no picture is blind to the one bound
          const name = `${role(prog)} ${vao?.id} ${args.join(',')} ${sampled} ${named}`;
          if (!content.has(fbo)) content.set(fbo, new Set());
          content.get(fbo).add(name);
          note('draws');
        }
      }
      return work;
    },
  };
}

/** One renderer of the story: a room, five lamps, the player's card, a townsman by the card, a hermit by a lamp of his
 *  own, a gib and a crate by theirs, a wood along a far line and a tree that comes later. */
function world() {
  const { calls, canvas } = recordingGl();
  const r = new Renderer(canvas);
  r.setLightingLane(EL_LANE);
  r.setRetroSource(retroFrameConfig);   // as main.js wires it: the renderer caps the mip maps itself
  for (const key of ['1_1', '201_1', '201_2', '202_1', '504_1']) r.textures.set(key, { id: `t${key}` });
  r.setLighting(new Float32Array([0.12, 0.12, 0.12]), 0);
  const walls = { vao: { id: 'vao-room' }, buffers: [], bounds: new Float32Array([0, 2, 0, 40]), subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 2 }] };
  const crate = { vao: { id: 'vao-crate' }, buffers: [], bounds: new Float32Array([0, 0.5, 0, 0.6]), subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 2 }] };
  const card = { archive: 201, record: 1, vao: { id: 'vao-card' }, indexCount: 6, size: { w: 0.8, h: 1.8 }, origin: [0, 0, 0], bounds: new Float32Array([0, 0.9, 0, 1]), selfCard: true };
  const man = { archive: 201, record: 1, vao: { id: 'vao-man' }, indexCount: 6, size: { w: 0.8, h: 1.8 }, origin: [2, 0, 1], bounds: new Float32Array([0, 0.9, 0, 1]) };
  const hermit = { archive: 201, record: 1, vao: { id: 'vao-hermit' }, indexCount: 6, size: { w: 0.8, h: 1.8 }, origin: [0, 0, -29.5], bounds: new Float32Array([0, 0, 0, 1]) };
  const gib = { archive: 202, record: 1, vao: { id: 'vao-gib' }, indexCount: 6, size: { w: 0.6, h: 0.6 }, origin: null, bounds: new Float32Array([-30, 0.3, 0, 0.5]), _dyn: true };
  const tree = { archive: 202, record: 1, vao: { id: 'vao-tree' }, indexCount: 6, size: { w: 1.5, h: 4 }, origin: [0, 0, 2.5], bounds: new Float32Array([0, 0, 0, 2.2]), sway: 1 };
  const post = { vao: { id: 'vao-post' }, buffers: [], bounds: new Float32Array([0, 1, 0, 0.3]), subMeshes: [{ textureArchive: 1, textureRecord: 1, startIndex: 0, primitiveCount: 2 }] };
  // forty-one trees on a line 45 off: the wood's sphere takes in every lamp, and no tree stands in a lamp's cube
  const wood = r.createBillboardBatch(504, 1, { w: 3, h: 7 }, Array.from({ length: 41 }, (_, i) => [i * 5 - 100, 0, 45]));
  wood.sway = 1;
  return { r, sp: r.shadows, calls, m: model(r.shadows), walls, crate, card, man, hermit, gib, tree, post, wood };
}

test("a lamp whose movers did not change keeps the faces it drew, and every face of every lamp holds every frame what the redraw would have drawn - the card and townsfolk still, the camera turned, an idler's steps, a walk (not walked whole while he walks on), a lamp nudged, the mip maps capped by the renderer, a hermit hidden, shown and narrowed, a wood swaying beyond the lamps, a tree swaying by the card (the base: the card's lamps redrawn every frame)", () => {
  const was = { override: SHADOW_TUNING.override, hold: SHADOW_TUNING.moverHold, mode: getInt('Video', 'RetroRenderingMode', 0, 2), mips: getBool('Video', 'UseMipMapsInRetroMode') };
  SHADOW_TUNING.override = true;   // Steady shadows, the default: every lamp with a mover redraws every frame
  try {
    const subject = world(), twin = world();
    assert.ok(subject.wood._place, 'the wood is a placed batch');
    // the card's two lamps, the crate's, the gib's and the hermit's - the last three past every face of the card's two
    const lights = new Float32Array([1, 2.5, 0, 12, -1, 2.5, 0, 12, 30, 2.5, 0, 12, -30, 2.5, 0, 12, 0, 2.5, -30, 12]);
    const colors = new Float32Array(15).fill(1);
    const up = new Float32Array([0, 1, 0]), camRight = new Float32Array([1, 0, 0]), wind = new Float32Array(4);
    let crateX = 30.5, frames = 0, checked = 0, postOn = false, treeOn = false;
    const LAMPS = [0, 1, 2, 3, 4];
    const slotOf = (sp, light) => [...sp.shadowIndex].indexOf(light);
    const work = (w, sp, light) => {
      const k = slotOf(sp, light);
      let draws = 0, copies = 0;
      for (let face = 0; face < 6; face++) { const v = w.get(`L${k * 6 + face}`); if (v) { draws += v.draws; copies += v.copies; } }
      return { draws, copies };
    };
    // the values the subject's memo walks write in a frame, by slot
    const putsBy = new Map();
    const put = subject.sp._memoPut?.bind(subject.sp);   // none at the base, which keeps no memo
    if (put) subject.sp._memoPut = function (value) { putsBy.set(this._memoSlot, (putsBy.get(this._memoSlot) ?? 0) + 1); put(value); };
    const step = (one, hold, change) => {
      SHADOW_TUNING.moverHold = hold;
      one.r.setPointLights(lights, colors);
      one.calls.length = 0;
      one.r.beginFrame(I, I, new Float32Array([0.45, 0.8, 0.35]), WORLD_FRAME);   // the maps, from the last frame's records
      const w = one.m.feed(one.calls);
      change(one);   // what this frame draws - its maps' casters on the next
      one.r.setFlatWind(wind);
      one.r.drawMesh(one.walls, I, null);
      one.r.drawMesh(one.crate, at(crateX, 0, 1), null);
      if (postOn) one.r.drawMesh(one.post, at(0.5, 0, -2), null);
      one.r.drawBillboards([one.card], camRight, up);
      one.r.drawBillboards(treeOn ? [one.man, one.gib, one.hermit, one.tree] : [one.man, one.gib, one.hermit], new Float32Array([1, 0, 0]), up);
      one.r.drawBillboards([one.wood], new Float32Array([1, 0, 0]), up);
      one.r.drawScreenQuad({ id: 'ui' }, { x: 0, y: 0, w: 10, h: 10 });
      return w;
    };
    /** A frame of both: its maps drawn from what the last one drew, `change` made to what this one draws. Every live
     *  layer of the subject holds what the twin's holds; answers both renderers' work on the lamps. */
    const frame = (label, change = () => {}) => {
      putsBy.clear();
      const mine = step(subject, true, change), theirs = step(twin, false, change);
      crateX += 0.01;   // the crate never stops: a solid, which no memo names; the gib's corners are its own to rewrite
      frames++;
      assert.deepEqual([...subject.sp.shadowIndex], [...twin.sp.shadowIndex], `${label}: the same lamps in the same slots`);
      assert.deepEqual([...subject.sp.pointParams], [...twin.sp.pointParams], `${label}: read from the same places`);
      for (let n = 0; n < 72; n++) {
        const got = [...(subject.m.content.get(`L${n}`) ?? [])].sort(), want = [...(twin.m.content.get(`L${n}`) ?? [])].sort();
        assert.deepEqual(got, want, `${label}: live layer ${n} holds what the redraw would have drawn`);
        if (want.length) checked++;
      }
      const lampWork = LAMPS.map((light) => work(mine, subject.sp, light)), twinWork = LAMPS.map((light) => work(theirs, twin.sp, light));
      if (frames > 2) for (const light of [2, 3]) assert.ok(lampWork[light].draws > 0 && twinWork[light].draws > 0, `${label}: lamp ${light} (the crate's, the gib's) redraws every frame, in both`);
      return { lampWork, twinWork, puts: LAMPS.map((light) => putsBy.get(slotOf(subject.sp, light)) ?? 0) };
    };
    const held = (label, w, lamps = [0, 1]) => {
      for (const light of lamps) {
        assert.deepEqual(w.lampWork[light], { draws: 0, copies: 0 }, `${label}: lamp ${light} keeps its faces (the base: redrawn)`);
        assert.ok(w.twinWork[light].draws > 0, `${label}: where the redraw draws lamp ${light}'s movers again`);
      }
      return w;
    };
    const redrawn = (label, w, lamps = [0, 1]) => { for (const light of lamps) assert.ok(w.lampWork[light].draws > 0, `${label}: lamp ${light} redraws`); return w; };
    const turnTo = (angle) => (one) => { if (one === subject) { camRight[0] = Math.cos(angle); camRight[2] = Math.sin(angle); } };
    const blow = (one) => { if (one === subject) { wind[0] = 4; wind[2] += 0.05; } };   // the wind's clock runs
    for (let f = 0; f < 3; f++) frame(`settle ${f}`);
    // the townsfolk's looks change where they stand - idlers, movers for good - and the caches let them go
    frame('the townsfolk idle', (one) => { one.man.record = 2; one.hermit.record = 2; });
    redrawn('they hold the pose', frame('they hold the pose'), [0, 1, 4]);
    held('and idle back', frame('and idle back', (one) => { one.man.record = 1; one.hermit.record = 1; }), [0, 1, 4]);
    redrawn('their picture back: one step, one redraw', frame('their picture back'), [0, 1, 4]);
    for (let f = 0; f < 8; f++) held(`still ${f}`, frame(`still ${f}`), [0, 1, 4]);
    // the camera turns: the card casts as it is drawn, so each frame it is another card
    frame('the camera turns', turnTo(0.1));
    for (let f = 1; f <= 3; f++) held(`the hermit's lamp, the camera turning ${f}`, redrawn(`the camera turning ${f}`, frame(`the camera turning ${f}`, f < 3 ? turnTo(0.1 * (f + 1)) : undefined)), [4]);
    for (let f = 0; f < 4; f++) held(`still again ${f}`, frame(`still again ${f}`));
    frame('the townsman animates', (one) => { one.man.record = 2; });
    redrawn('his new frame drawn', frame('his new frame drawn'));
    for (let f = 0; f < 4; f++) held(`on his new frame ${f}`, frame(`on his new frame ${f}`));
    // a walk: his first step is walked whole; while he walks on, his lamps' walks stop at him, the redraw owed
    frame('the townsman sets off', (one) => { one.man.origin = [2, 0, 1.05]; });
    const steps = [];
    for (let f = 1; f <= 3; f++) steps.push(redrawn(`the townsman walks ${f}`, frame(`the townsman walks ${f}`, f < 3 ? (one) => { one.man.origin = [2, 0, 1 + 0.05 * (f + 1)]; } : undefined)));
    for (const light of [0, 1]) {
      assert.ok(steps[0].puts[light] > 0, `lamp ${light}: his first step walked (${steps[0].puts[light]} values)`);
      for (const f of [1, 2]) assert.ok(steps[f].puts[light] < steps[0].puts[light], `lamp ${light}, step ${f + 1}: the walk stops at him (${steps[f].puts[light]} values, the first step's ${steps[0].puts[light]})`);
    }
    redrawn('he stops: the first still frame writes the memo again', frame('he stops'));
    for (let f = 0; f < 4; f++) held(`he stands ${f}`, frame(`he stands ${f}`));
    // a lamp moved by less than the still epsilon: no change to its cache, but its faces are drawn from where it is
    lights[0] += 5e-4;
    redrawn('a lamp nudged', frame('a lamp nudged'), [0]);
    for (let f = 0; f < 3; f++) held(`after the nudge ${f}`, frame(`after the nudge ${f}`));
    // the retro mip maps off: the renderer caps every picture before its passes, and a flat's cut reads through the cap
    setValue('Video', 'RetroRenderingMode', 1); setValue('Video', 'UseMipMapsInRetroMode', false);
    assert.equal(retroFrameConfig()?.mipmaps, false, 'retro mode on, without its mip maps');
    redrawn('the mip maps off', frame('the mip maps off'), [0, 1, 4]);
    assert.ok([...subject.m.content.values()].some((names) => [...names].some((name) => name.includes('t201_1@0'))), 'the faces were drawn through the capped picture');
    for (let f = 0; f < 3; f++) held(`under retro ${f}`, frame(`under retro ${f}`), [0, 1, 4]);
    setValue('Video', 'RetroRenderingMode', 0);
    redrawn('the mip maps on again', frame('the mip maps on again'), [0, 1, 4]);
    held('and held again', frame('and held again'), [0, 1, 4]);
    // a still post set down by the card: the caches rebuilt round it - and the faces with them, never held over the old
    frame('a post set down', () => { postOn = true; });
    redrawn('the caches rebuilt for it', frame('the caches rebuilt for it'));
    for (let f = 0; f < 3; f++) held(`beside the post ${f}`, frame(`beside the post ${f}`));
    // the townsman goes in: the memo ends sooner, every value it keeps the same
    frame('the townsman goes in', (one) => { one.man.conceal = true; });
    redrawn('his shadow taken off', frame('his shadow taken off'));
    for (let f = 0; f < 3; f++) held(`the card alone ${f}`, frame(`the card alone ${f}`));
    // the hermit, his lamp's one mover, hides: the cache again. Shown where he stood, every value is the one his memo
    // keeps - but the live faces hold the cache alone, so they are drawn
    frame('the hermit hides', (one) => { one.hermit.conceal = true; });
    const hidden = frame('his lamp is its cache again');
    for (const w of [hidden.lampWork[4], hidden.twinWork[4]]) assert.ok(w.draws === 0 && w.copies > 0, `his lamp copies its cache back (${JSON.stringify(w)})`);
    const gone = frame('he stays hidden', (one) => { one.hermit.conceal = false; });
    assert.deepEqual([gone.lampWork[4], gone.twinWork[4]], [{ draws: 0, copies: 0 }, { draws: 0, copies: 0 }], 'nothing to draw while he is hidden');
    redrawn('shown again in place: drawn over the cache', frame('shown again in place'), [4]);
    for (let f = 0; f < 2; f++) held(`by his lamp ${f}`, frame(`by his lamp ${f}`), [4]);
    frame('the hermit narrows', (one) => { one.hermit.size = { w: 0.7, h: 1.8 }; });
    redrawn('drawn at his new width', frame('drawn at his new width'), [4]);
    held('narrower, held', frame('narrower, held'), [4]);
    // the wind rises: the wood sways, its sphere over every lamp and no tree in a lamp's cube - the lamps hold
    frame('the wind rises', blow);
    for (let f = 0; f < 3; f++) held(`the wood sways ${f}`, frame(`the wood sways ${f}`, blow), [0, 1, 4]);
    // a tree by the card, leaning in the wind: on a clock that runs, a new shadow every frame
    frame('a tree set by the card', (one) => { treeOn = true; blow(one); });
    for (let f = 0; f < 3; f++) held(`the hermit's lamp, the tree leaning ${f}`, redrawn(`the tree leans ${f}`, frame(`the tree leans ${f}`, blow)), [4]);
    frame('the wind holds its clock');
    for (let f = 0; f < 2; f++) held(`the clock stopped ${f}`, frame(`the clock stopped ${f}`), [0, 1, 4]);
    // the wind drops: the tree stands still, and the caches take it
    frame('the wind drops', (one) => { if (one === subject) wind.fill(0); });
    redrawn('the tree baked into the caches', frame('the tree baked into the caches'));
    for (let f = 0; f < 2; f++) held(`calm ${f}`, frame(`calm ${f}`), [0, 1, 4]);
    assert.ok(checked >= 18 * frames, `every lamp's faces compared, every frame (${checked} over ${frames} frames)`);
  } finally {
    SHADOW_TUNING.override = was.override; SHADOW_TUNING.moverHold = was.hold;
    setValue('Video', 'RetroRenderingMode', was.mode); setValue('Video', 'UseMipMapsInRetroMode', was.mips);
  }
});
