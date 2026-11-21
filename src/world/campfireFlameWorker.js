import { buildCampfireFlame, CAMPFIRE_FRAMES } from './campfireModel.js';

const scope = globalThis.self;
// Geometry only. The renderer still owns textures, WebGL handles and their lifetime.
scope.onmessage = () => {
  for (let frame = 0; frame < CAMPFIRE_FRAMES; frame++) {
    for (const layer of ['core','middle','outer']) {
      const mesh = buildCampfireFlame(frame, layer);
      scope.postMessage({ frame, layer, mesh }, [
        mesh.positions.buffer, mesh.normals.buffer, mesh.uvs.buffer, mesh.indices.buffer
      ]);
    }
  }
  scope.close();
};
