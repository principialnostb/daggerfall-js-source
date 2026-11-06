// @ts-check
// The dungeon level drawn depth first. The level is one mesh drawn a texture at a time, so a pixel would be lit once
// for each wall drawn over it in that order: two or three times, five cube taps a lamp each time. Its shadow cells (the
// same triangles by grid cell, on the mesh's second vertex array) go first, colour off and depth pushed back by a
// polygon offset, and the lit draw after them is unchanged. On a GPU that tests depth before shading, a hidden wall
// then fails the test before it is shaded. Each laid depth is its own lit triangle's, a little behind, so the nearest
// lit fragment still passes and the depth left is the lit draw's own. It runs only when no lit fragment can be
// discarded, on the matrices the lit program holds, and only when the page asks: it is off until measured on hardware.
import { buildProgram, compiledPass } from './glProgram.js';
import { matrixScale, sphereInPlanes, spherePlanes, transformSphereScaled } from './bounds.js';
import { multiply } from '../world/mat4.js';
import { pageParam } from '../systems/pageQuery.js';

/** The depth draw's fragment stage. It reads every output of the mesh vertex stage, so the two programs link that
 *  stage alike; nothing it writes lands, the colour mask is off. With no discard, the depth test can run before it. */
export const DEPTH_FIRST_FS = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUV;
in vec3 vWorldPos;
out vec4 outColor;
void main() {
  outColor = vec4(vNormal + vWorldPos, vUV.x + vUV.y);
}`;

/** The polygon offset, [factor, units]: each laid depth goes a step and its triangle's slope behind its own lit
 *  fragment. Any push back keeps the picture; a larger one only lets more hidden fragments be shaded. */
export const DEPTH_FIRST_OFFSET = Object.freeze([1, 2]);

/** The depth draw's one program: the renderer's mesh vertex stage, and the stage above. */
export const depthFirstPrograms = (meshVs) => [/** @type {const} */ ([meshVs, DEPTH_FIRST_FS])];

/** The page's switch: `?prepass` or `?prepass=on` turns the pass on for an A/B. With no switch, or any other value
 *  (`?prepass=off`), it stays off. */
function prepassAsked() {
  const asked = pageParam('prepass');
  return asked === '' || asked === 'on';
}

/** The automap slice's "off" (renderer.js setClipY): no fragment stands that high. */
const CLIP_OFF = 1e9;

/** Per renderer: the matrices its mesh program was last given, the program they went to, and the depth draw's door. */
const FRAMES = new WeakMap();
/** Per mesh: its cells' spheres in world space, and the matrix they were placed by. */
const PLACED = new WeakMap();

function frameOf(renderer) {
  let frame = FRAMES.get(renderer);
  if (!frame) {
    frame = {
      program: null,
      proj: new Float32Array(16),
      view: new Float32Array(16),
      viewProj: new Float32Array(16),
      planes: new Float32Array(24),
      door: null,
      told: false,
    };
    FRAMES.set(renderer, frame);
  }
  return frame;
}

/** beginFrame's uploads of `proj` and `view` to the mesh program, kept for the depth draw: the lit draw is placed by
 *  these values, whatever the host does to its own arrays after. Not matrices: no depth draw until the next frame. */
export function noteFrameMatrices(renderer, proj, view) {
  const frame = frameOf(renderer);
  frame.program = null;
  if (proj?.length !== 16 || view?.length !== 16) return;
  frame.proj.set(proj);
  frame.view.set(view);
  frame.program = renderer.program;
}

/** Whether the lit draw of `mesh` that follows can lose no fragment to a discard (the view out's pane, the automap's
 *  slice, a dissolve, a cutout's hole, glass cut to the view out) and draws every sub-mesh: each one's texture stamped
 *  for this generation and this remap, as renderer.js _drawMeshBundle reads it. And the mesh program must still hold
 *  the matrices beginFrame gave it. And the page must ask for the pass (prepassAsked). */
export function depthFirstReady(renderer, mesh, modelMatrix, texRemap) {
  if (!prepassAsked()) return false;
  if (!mesh?.prepass || mesh._dead || !mesh.vao || !mesh.shadowVao || !mesh.shadowCells?.length) return false;
  if (!mesh.subMeshes?.length || modelMatrix == null) return false;
  const frame = FRAMES.get(renderer);
  if (!frame?.program || frame.program !== renderer.program) return false;
  if (renderer._rwOutside || renderer._rwPaneOn) return false;
  if (renderer._automapMode !== 0 || !(renderer._clipY >= CLIP_OFF)) return false;
  if ((renderer._dissolve ?? 1) !== 1) return false;
  const glassCut = !!renderer._rw?.live;
  for (const sub of mesh.subMeshes) {
    if (sub._evGen !== renderer._texGen || sub._evRemap !== texRemap || sub._evCut) return false;
    if (glassCut && sub._evWin) return false;
  }
  return true;
}

function depthFirstPass(gl, meshVs) {
  const program = buildProgram(gl, meshVs, DEPTH_FIRST_FS, 'depth first');
  return {
    program,
    proj: gl.getUniformLocation(program, 'uProj'),
    view: gl.getUniformLocation(program, 'uView'),
    model: gl.getUniformLocation(program, 'uModel'),
  };
}

/** The cells' spheres through `modelMatrix`, placed again only when the matrix changes. */
function placedSpheres(mesh, modelMatrix) {
  const cells = mesh.shadowCells;
  let placed = PLACED.get(mesh);
  if (!placed || placed.spheres.length !== cells.length * 4) {
    placed = { matrix: new Float64Array(16).fill(NaN), spheres: new Float32Array(cells.length * 4) };
    PLACED.set(mesh, placed);
  }
  let same = true;
  for (let k = 0; k < 16 && same; k++) same = placed.matrix[k] === modelMatrix[k];
  if (!same) {
    placed.matrix.set(modelMatrix);
    const scale = matrixScale(modelMatrix);
    for (let i = 0; i < cells.length; i++)
      transformSphereScaled(modelMatrix, cells[i]._bounds, scale, placed.spheres, i * 4);
  }
  return placed.spheres;
}

/** Lay `mesh`'s depth ahead of its lit draw when depthFirstReady allows: the cells in the view, adjacent ones as one
 *  draw. `meshVs` is the renderer's mesh vertex stage. The program and the vertex array go through the renderer's
 *  bind shadows, so the lit draw binds its own again; the colour mask and the offset are put back. Answers the
 *  draws. */
export function drawDepthFirst(renderer, mesh, modelMatrix, texRemap, meshVs) {
  if (!depthFirstReady(renderer, mesh, modelMatrix, texRemap)) return 0;
  const frame = frameOf(renderer);
  const gl = renderer.gl;
  frame.door ??= compiledPass(
    gl,
    depthFirstPrograms(meshVs),
    () => depthFirstPass(gl, meshVs),
    (e) => {
      if (!frame.told) console.warn('[render] the depth-first draw is off:', e?.message ?? e);
      frame.told = true;
    },
  );
  const pass = frame.door();
  if (!pass) return 0;
  const spheres = placedSpheres(mesh, modelMatrix);
  const planes = spherePlanes(multiply(frame.proj, frame.view, frame.viewProj), frame.planes);
  renderer._use(pass.program);
  gl.uniformMatrix4fv(pass.proj, false, frame.proj);
  gl.uniformMatrix4fv(pass.view, false, frame.view);
  gl.uniformMatrix4fv(pass.model, false, modelMatrix);
  renderer._bindVao(mesh.shadowVao);
  gl.colorMask(false, false, false, false);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(DEPTH_FIRST_OFFSET[0], DEPTH_FIRST_OFFSET[1]);
  let draws = 0;
  try {
    const cells = mesh.shadowCells;
    let start = -1,
      end = 0;
    for (let i = 0; i <= cells.length; i++) {
      const cell = cells[i];
      const seen =
        !!cell && sphereInPlanes(planes, spheres[i * 4], spheres[i * 4 + 1], spheres[i * 4 + 2], spheres[i * 4 + 3]);
      if (seen && start >= 0 && cell.startIndex === end) {
        end += cell.primitiveCount * 3;
        continue;
      }
      if (start >= 0) {
        gl.drawElements(gl.TRIANGLES, end - start, gl.UNSIGNED_INT, start * 4);
        renderer.stats.draws++;
        draws++;
        start = -1;
      }
      if (seen) {
        start = cell.startIndex;
        end = start + cell.primitiveCount * 3;
      }
    }
  } finally {
    gl.polygonOffset(0, 0);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
  }
  return draws;
}
