// Smart PaperDoll: convert the live RGBA paperdoll composite into a shallow voxel mesh.
// The input is the exact image already composed by ui/paperDoll.js, so dyes, armor,
// clothing, texture replacements and race-specific art stay in sync with the inventory.
import { paperDollFigurePixels } from '../ui/paperDoll.js';
import { packCharacterFaces } from '../render/characterMesh.js';
import { trs } from '../world/mat4.js';

export const SMART_PAPERDOLL_HEIGHT = 1.8;
export const SMART_PAPERDOLL_MAX_WIDTH = 56;
export const SMART_PAPERDOLL_MAX_HEIGHT = 96;
export const SMART_PAPERDOLL_DEPTH = 0.055;
const ALPHA_COVERAGE_MIN = 0.08;

function resamplePixels(image, maxWidth, maxHeight) {
  if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || image.width < 1 || image.height < 1 || !image.rgba
      || image.rgba.length < image.width * image.height * 4) return null;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const rgba = image.rgba;
  const cells = new Array(width * height).fill(null);
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y * image.height / height);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * image.height / height));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * image.width / width);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * image.width / width));
      let alpha = 0, red = 0, green = 0, blue = 0, samples = 0;
      for (let sy = sy0; sy < Math.min(sy1, image.height); sy++) {
        for (let sx = sx0; sx < Math.min(sx1, image.width); sx++) {
          const i = (sy * image.width + sx) * 4;
          const a = rgba[i + 3] / 255;
          alpha += a;
          red += rgba[i] * a;
          green += rgba[i + 1] * a;
          blue += rgba[i + 2] * a;
          samples++;
        }
      }
      if (!samples || alpha / samples < ALPHA_COVERAGE_MIN || alpha <= 0) continue;
      cells[y * width + x] = [
        Math.round(red / alpha),
        Math.round(green / alpha),
        Math.round(blue / alpha),
      ];
    }
  }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!cells[y * width + x]) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) return null;
  const croppedWidth = maxX - minX + 1, croppedHeight = maxY - minY + 1;
  const cropped = new Array(croppedWidth * croppedHeight).fill(null);
  for (let y = 0; y < croppedHeight; y++) for (let x = 0; x < croppedWidth; x++) {
    cropped[y * croppedWidth + x] = cells[(y + minY) * width + x + minX];
  }
  return { width: croppedWidth, height: croppedHeight, cells: cropped };
}

function quad(faces, points, normal, color) {
  faces.push({
    p: points.flat(),
    n: [...normal],
    c: color,
  });
}

/**
 * Pure conversion from the finished paperdoll RGBA image to exposed voxel faces.
 * The mesh is kept small enough for a real-time character draw and is 1.8 m tall.
 * Transparent pixels remain empty; each occupied pixel gets a shallow 5.5 cm depth.
 */
export function buildPaperDollVoxelFaces(image, {
  maxWidth = SMART_PAPERDOLL_MAX_WIDTH,
  maxHeight = SMART_PAPERDOLL_MAX_HEIGHT,
  heightMeters = SMART_PAPERDOLL_HEIGHT,
  depthMeters = SMART_PAPERDOLL_DEPTH,
} = {}) {
  const sampled = resamplePixels(image, maxWidth, maxHeight);
  if (!sampled || !(heightMeters > 0) || !(depthMeters > 0)) return [];
  const { width, height, cells } = sampled;
  if (!cells.some(Boolean)) return [];
  const cell = heightMeters / height;
  const halfDepth = depthMeters / 2;
  const faces = [];
  const occupied = (x, y) => x >= 0 && x < width && y >= 0 && y < height && !!cells[y * width + x];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = cells[y * width + x];
      if (!color) continue;
      const x0 = (x - width / 2) * cell;
      const x1 = x0 + cell;
      const y0 = (height - 1 - y) * cell;
      const y1 = y0 + cell;
      // Front and back faces form the portrait planes; exposed sides give it real thickness.
      quad(faces, [[x0,y0,halfDepth],[x1,y0,halfDepth],[x1,y1,halfDepth],[x0,y1,halfDepth]], [0,0,1], color);
      quad(faces, [[x1,y0,-halfDepth],[x0,y0,-halfDepth],[x0,y1,-halfDepth],[x1,y1,-halfDepth]], [0,0,-1], color);
      if (!occupied(x - 1, y)) quad(faces, [[x0,y0,-halfDepth],[x0,y0,halfDepth],[x0,y1,halfDepth],[x0,y1,-halfDepth]], [-1,0,0], color);
      if (!occupied(x + 1, y)) quad(faces, [[x1,y0,halfDepth],[x1,y0,-halfDepth],[x1,y1,-halfDepth],[x1,y1,halfDepth]], [1,0,0], color);
      if (!occupied(x, y - 1)) quad(faces, [[x0,y1,halfDepth],[x1,y1,halfDepth],[x1,y1,-halfDepth],[x0,y1,-halfDepth]], [0,1,0], color);
      if (!occupied(x, y + 1)) quad(faces, [[x0,y0,-halfDepth],[x1,y0,-halfDepth],[x1,y0,halfDepth],[x0,y0,halfDepth]], [0,-1,0], color);
    }
  }
  return faces;
}

let cachedRenderer = null;
let cachedVersion = null;
let cachedMesh = null;

export function clearSmartPaperDoll() {
  if (cachedMesh && cachedRenderer?.destroyMesh) {
    try { cachedRenderer.destroyMesh(cachedMesh); } catch { /* a lost WebGL context is already releasing its resources */ }
  }
  cachedRenderer = null;
  cachedVersion = null;
  cachedMesh = null;
}

function meshFor(renderer, image) {
  if (!renderer?.createCharacterMesh || !renderer?.drawCharacter) return null;
  const version = image.version ?? image.rgba;
  if (cachedMesh && cachedRenderer === renderer && cachedVersion === version && !cachedMesh._dead) return cachedMesh;
  clearSmartPaperDoll();
  const faces = buildPaperDollVoxelFaces(image);
  if (!faces.length) return null;
  cachedMesh = renderer.createCharacterMesh(packCharacterFaces(faces));
  cachedRenderer = renderer;
  cachedVersion = version;
  return cachedMesh;
}

/**
 * Draw the current PaperDoll at the player's feet. Returns false if the composite
 * is not ready so mwView can preserve its existing Morrowind/EotB fallback.
 */
export function drawSmartPaperDoll(renderer, { feet, yaw = 0, grow = 1 } = {}) {
  const image = paperDollFigurePixels();
  if (!image || !feet || feet.length < 3) {
    clearSmartPaperDoll();
    return false;
  }
  const mesh = meshFor(renderer, image);
  if (!mesh) return false;
  const scale = Number.isFinite(grow) && grow > 0 ? grow : 1;
  // Same world-facing convention as fpArm's thirdModel: the local portrait faces +Z.
  const model = trs(feet[0], feet[1], feet[2], 0, yaw * 180 / Math.PI, 0, scale, scale, scale);
  renderer.drawCharacter(mesh, model);
  return true;
}
