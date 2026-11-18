// PERF5 (2026-09-11). The dungeon's static models merged into one mesh
// for the main view - PERF4's batch, for the level: one call per
// resolved texture instead of one per sub-mesh per placed model, while
// the automap keeps walking the per-model list for its reveal. Text
// pins; the builder is executed by test/world/perf4.test.js. Every pin names
// its mutant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('PERF5 pins: the context adds each static placement to the builder after its remap, action objects never, uploads on the first read, keeps drawList whole for the automap, and frees the mesh in destroy (mutant: any one dropped)', () => {
  const c = read('src/scenes/dungeonContext.js');
  assert.match(c, /let staticBatch = null, staticBuilt = false;\n\s+const staticBuilder = new StaticBatchBuilder\(\{ shadowCell: SHADOW_CELL_SIZE, viewCell: SHADOW_CELL_SIZE \* 2 \}\);/);   // LA-AUDIT A1: with its shadow cells
  assert.match(c, /const texRemap = new Map\(\);\n\s+const resolveTexKey = keyResolver\(texRemap\);/, 'resolves through the level\'s remap');
  // AUDIT PRE-MERGE 1003 W4: a climate-free model's entry carries its own (empty) table, and merges through it
  assert.match(c, /configureDungeonFurnitureDraw\(drawList\[drawList\.length - 1\], staticBuilder, collider, p\.modelIdNum, cpu, matrix, climateFree \? ownTexKey : resolveTexKey\)/, "the furniture helper receives the draw entry and resolved texture key");
  const loop = c.slice(c.indexOf("if (cls === 'move') {"), c.indexOf('drawList.push({ mesh: gpu, matrix, key: `${bi}:${p.position}`, aabb, '));
  assert.ok(!loop.includes('staticBuilder.add'), 'the move and specialDoor arms `continue` before the add: an action object is never batched');
  assert.match(c, /get staticBatch\(\) \{[^\n]*\n\s+if \(!staticBuilt\) \{ staticBuilt = true; const m = staticBuilder\.finish\(\); staticBatch = m \? renderer\.createMesh\(m, LEVEL_MESH\) : null; \}/, 'merged once, on the first frame that asks');
  assert.match(c, /^const LEVEL_MESH = Object\.freeze\(\{ prepass: true \}\);$/m, 'and drawn depth first from its cells (test/render/depthprepass.test.js)');
  assert.match(c, /if \(staticBatch\) \{ renderer\.destroyMesh\(staticBatch\); staticBatch = null; \}/, 'freed with the level');
  assert.match(read('src/ui/automap/automapWindow.js'), /for \(const d of this\.deps\.drawList\) push\(d\.mesh, d\.matrix, d\.key\);/, 'the automap still reveals per model');
});

test('PERF5 pins: both dungeon hosts draw the merge with the identity before the per-model loop and skip the batched entries; the dynamic draws follow as before (mutant: a host dropped, or the skip dropped)', () => {
  for (const [f, ctx] of [['src/scenes/dungeon.js', 'ctx'], ['src/scenes/worldModes.js', 'dungeonCtx']]) {
    const s = read(f);
    assert.match(s, /^const BATCH_IDENTITY = identity\(\);/m, `${f}: the merged level is in world space`);
    const batchDraw = s.indexOf(`renderer.drawMesh(${ctx}.staticBatch, BATCH_IDENTITY, null)`);
    const movers = s.indexOf(`for (const d of ${ctx}.dynamicDraws)`, batchDraw);
    assert.ok(batchDraw >= 0 && batchDraw < movers, `${f}: static geometry draws before movable objects`);
  }
});
