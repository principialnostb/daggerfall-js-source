import { ENEMY_BASICS } from '../characters/enemy/enemyBasics.js';
import { AETHERBRIGHT_ARCHIVE, DWARVEN_DRAGON_ARCHIVE } from '../characters/dwarvenDragonId.js';
import { ANIMALS_TEXTURE_ARCHIVE } from './flatAnimation.js';
import { boxCorners, charPixelRows, drawPixelatedCharacters } from './charPixelLayer.js';

export function drawHorsePixelated(renderer, mesh, model, box) {
  const rows = charPixelRows('npc');
  if (!rows) return renderer.drawCharacter(mesh, model);
  const [x, y, z] = box.center, w = box.halfW, h = box.halfH;
  const corners = boxCorners({ minX: x - w, maxX: x + w, minY: y - h, maxY: y + h, minZ: z - w, maxZ: z + w },
    (cx, cy, cz) => [cx, cy, cz]);
  drawPixelatedCharacters(renderer, [{ mesh, model }], rows, corners);
}

export function npcBillboardArchives() {
  const archives = new Set([ANIMALS_TEXTURE_ARCHIVE, 'hcc', AETHERBRIGHT_ARCHIVE, DWARVEN_DRAGON_ARCHIVE]);
  // Enemy Expansion registers its records at runtime alongside the original rows.
  for (const enemy of Object.values(ENEMY_BASICS)) {
    if (enemy.maleTexture > 0) archives.add(enemy.maleTexture);
    if (enemy.femaleTexture > 0) archives.add(enemy.femaleTexture);
  }
  return archives;
}

export function billboardPixelShader(source) {
  return source.replace('in vec2 vUV;', 'in vec2 vUV;\nuniform float uNpcPixelBlock;')
    .replace('vec2 uv = vUV;', `vec2 uv = vUV;
  if (uNpcPixelBlock > 1.0) {
    vec2 offset = uNpcPixelBlock * (vec2(0.5) - fract(gl_FragCoord.xy / uNpcPixelBlock));
    uv += dFdx(vUV) * offset.x + dFdy(vUV) * offset.y;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) discard;
  }`);
}
