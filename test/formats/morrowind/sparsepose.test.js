import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../../fixtures/mw/retailRig.mjs';

test('partial pose measurements compose exactly the full walk, after changes and in either root space', () => {
  const skeleton = buildSkeleton(parseNif(retailSkeleton()));
  const refs = ['bip01 l foot', 'bip01 r foot'].map((name) => skeleton.byName.get(name));
  assert.ok(refs.every((ref) => ref != null));
  const root = skeleton.byName.get('bip01');
  const pose = new Map();
  for (const space of [GRAPH_ROOT, root]) for (let frame = 0; frame < 3; frame++) {
    const rest = skeleton.nodes.get(root).rest;
    pose.set(root, { ...rest, translation: [frame * 3, -frame, 8 + frame], scale: 1 + frame * 0.1 });
    const full = skeletonSpaceMatrices(skeleton, pose, space);
    const sparse = skeletonSpaceMatrices(skeleton, pose, space, refs);
    assert.ok(sparse.size < full.size / 2, 'a feet measurement does not compose the arms, head or equipment');
    for (const [ref, matrix] of sparse) assert.deepEqual(matrix, full.get(ref));
    for (const ref of refs) assert.deepEqual(sparse.get(ref), full.get(ref));
    const unused = [...skeleton.nodes.keys()].find((ref) => !sparse.has(ref));
    const checked = new Map(pose);
    checked.get = (ref) => {
      assert.notEqual(ref, unused, 'unrelated branches are not read');
      return pose.get(ref);
    };
    skeletonSpaceMatrices(skeleton, checked, space, refs);
  }
});
