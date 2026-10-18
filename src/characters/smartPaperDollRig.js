// SMART-PAPERDOLL: independently built, rigged body and optional garment layers.
// This deliberately does NOT derive geometry from the finished 2D inventory composite.
// The body is authored from the project's neutral loft rig, morphed to a feminine
// silhouette, and driven by the same canonical animation runtime as engine characters.
import { buildNeutralBody } from './neutralBody.js';
import { createCharacterRig } from './engineRig.js';
import { drapedPiece, DRAPE_MATERIAL } from './pieces/draped.js';
import { trs } from '../world/mat4.js';

export const SMART_PAPERDOLL_LAYERS = Object.freeze([
  'Casual Dress', 'Strapless Dress', 'Short Skirt', 'Long Skirt',
  'Plain Robes', 'Priestess Robes', 'Casual Cloak', 'Formal Cloak', 'Wrap',
]);

const SKIN = [[92, 58, 42], [130, 86, 64], [170, 121, 91], [205, 158, 125], [231, 190, 157]];
const BOOT = [[35, 27, 22], [58, 44, 34], [83, 63, 48], [112, 86, 64], [142, 112, 85]];
const DEFAULT_BUILD = Object.freeze({ torso: 1.02, shoulder: 0.94, arm: 0.96, hand: 0.94, neck: 0.96, skull: 0.96, jaw: 0.90, leg: 1.06 });

function normalOf(points) {
  const a = points.slice(0, 3), b = points.slice(3, 6), c = points.slice(6, 9);
  const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const length = Math.hypot(...n) || 1;
  return n.map((x) => x / length);
}

// Apply a gentle feminine silhouette to the independent body geometry.
// Joint heights remain untouched so the canonical animation pivots still line up.
function feminineMorph(faces) {
  return faces.map((face) => {
    const p = face.p.slice();
    for (let i = 0; i < p.length; i += 3) {
      const y = p[i + 1];
      const hip = y >= 0.78 && y <= 1.08 ? 1.13 : 1;
      const bust = y >= 1.34 && y <= 1.57 ? 1.045 : 1;
      const factor = hip * bust;
      p[i] *= factor;
      p[i + 2] *= factor;
    }
    return { ...face, p, n: normalOf(p) };
  });
}

function sphereFaces(cx, cy, cz, rx, ry, rz, color, rings = 7, segments = 12) {
  const out = [];
  for (let r = 0; r < rings; r++) {
    const a0 = -Math.PI / 2 + Math.PI * r / rings;
    const a1 = -Math.PI / 2 + Math.PI * (r + 1) / rings;
    for (let s = 0; s < segments; s++) {
      const b0 = Math.PI * 2 * s / segments;
      const b1 = Math.PI * 2 * (s + 1) / segments;
      const point = (a, b) => [cx + rx * Math.cos(a) * Math.cos(b), cy + ry * Math.sin(a), cz + rz * Math.cos(a) * Math.sin(b)];
      const p = [...point(a0,b0), ...point(a0,b1), ...point(a1,b1), ...point(a1,b0)];
      out.push({ p, n: normalOf(p), c: color, g: 'body' });
    }
  }
  return out;
}

export function buildSmartPaperDollLayers({ skin = SKIN, boot = BOOT, garments = [] } = {}) {
  const body = feminineMorph(buildNeutralBody({ skin, boot: skin }, { build: DEFAULT_BUILD }));
  // Two small, connected chest forms give the torso a female silhouette while remaining
  // in the torso animation group; they are geometry, not painted pixels.
  const bust = [
    ...sphereFaces(-0.075, 1.445, 0.105, 0.057, 0.052, 0.050, skin[skin.length - 1]),
    ...sphereFaces( 0.075, 1.445, 0.105, 0.057, 0.052, 0.050, skin[skin.length - 1]),
  ];
  const valid = [...new Set(garments)].filter((name) => SMART_PAPERDOLL_LAYERS.includes(name));
  const clothingLayers = valid.map((name) => ({
    name,
    faces: drapedPiece(name, DRAPE_MATERIAL[name]?.ramp ?? [[48,40,32],[100,84,64],[160,140,108],[210,190,154]]),
  }));
  const layers = [{ name: 'body', faces: body }, { name: 'body-detail', faces: bust }, ...clothingLayers];
  return { faces: layers.flatMap((layer) => layer.faces), garments: valid, layers };
}

let cachedRenderer = null;
let cachedRig = null;
let cachedKey = '';
let lastTick = 0;
let lastFeet = null;
let garments = [];

export function setSmartPaperDollLayers(next = []) {
  garments = [...new Set(next)].filter((name) => SMART_PAPERDOLL_LAYERS.includes(name));
  cachedKey = '';
}

export function smartPaperDollLayers() { return [...garments]; }

export function clearSmartPaperDollRig() {
  if (cachedRig && cachedRenderer?.destroyMesh) {
    try { cachedRenderer.destroyMesh(cachedRig.mesh); } catch { /* renderer/context already gone */ }
  }
  cachedRenderer = null;
  cachedRig = null;
  cachedKey = '';
  lastTick = 0;
  lastFeet = null;
}

export function drawSmartPaperDollRig(renderer, { feet, yaw = 0, grow = 1 } = {}) {
  if (!renderer?.createCharacterMesh || !renderer?.updateCharacterMesh || !renderer?.drawCharacter
      || !feet || feet.length < 3) return false;
  const key = garments.join('|');
  if (cachedRenderer !== renderer || !cachedRig || cachedKey !== key || cachedRig.mesh?._dead) {
    clearSmartPaperDollRig();
    const { faces } = buildSmartPaperDollLayers({ garments });
    cachedRig = createCharacterRig(renderer, faces);
    cachedRenderer = renderer;
    cachedKey = key;
  }
  const now = Date.now();
  const dt = lastTick ? Math.min(0.05, Math.max(0, (now - lastTick) / 1000)) : 1 / 60;
  lastTick = now;
  const moving = !!lastFeet && Math.hypot(feet[0] - lastFeet[0], feet[2] - lastFeet[2]) > 0.0005;
  lastFeet = [feet[0], feet[1], feet[2]];
  cachedRig.setGait(moving ? 1 : 3); // walk while the world position advances; idle sway otherwise
  cachedRig.update(dt);
  const scale = cachedRig.scale * (Number.isFinite(grow) && grow > 0 ? grow : 1);
  const model = trs(feet[0], feet[1] - cachedRig.liveFootY * scale, feet[2], 0, yaw * 180 / Math.PI, 0, scale, scale, scale);
  renderer.drawCharacter(cachedRig.mesh, model);
  return true;
}
