import { buildCampfireFlame } from './campfireModel.js';

// The animation is the same for every camp, renderer and light setting. Only
// geometry is shared. A layer requested before the worker is ready is exact too.
const frames = [];
let started = false;

export function prepareCampfireFlames() {
  if (started || typeof Worker === 'undefined') return;
  started = true;
  let worker;
  try {
    worker = new Worker(new URL('./campfireFlameWorker.js', import.meta.url), { type:'module' });
    worker.onmessage = ({ data: {frame, layer, mesh} }) => {
      const layers = frames[frame] ??= {};
      layers[layer] ??= mesh;
    };
    worker.onerror = () => worker.terminate();
    worker.postMessage(null);
  } catch {
    worker?.terminate();
  }
}

export function campfireLayerGeometry(frame, layer) {
  const layers = frames[frame] ??= {};
  return layers[layer] ??= buildCampfireFlame(frame, layer);
}
