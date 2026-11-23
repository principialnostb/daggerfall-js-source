import { hairMaterialCanTint, normalizeHairColor } from './hairColor.js';
import { prepareHair } from './hairPreparation.js';

const pending = new Map();
let worker, idle, sequence = 0, unavailable = false;

function close() {
  clearTimeout(idle);
  worker?.terminate();
  worker = null;
}

function run(job) {
  if (unavailable || typeof Worker === 'undefined') return Promise.resolve().then(() => prepareHair(job));
  clearTimeout(idle);
  if (!worker) {
    try {
      worker = new Worker(new URL('./hairPreparationWorker.js', import.meta.url), { type: 'module' });
    } catch {
      unavailable = true;
      return run(job);
    }
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id);
      if (!task) return;
      pending.delete(data.id);
      if (data.error) task.reject(new Error(data.error));
      else task.resolve(data.result);
      if (!pending.size) idle = setTimeout(close, 10000);
    };
    worker.onerror = worker.onmessageerror = () => {
      unavailable = true;
      close();
      for (const task of pending.values()) task.resolve(run(task.job));
      pending.clear();
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { job, resolve, reject });
    try {
      // An archive view may share its buffer with the entire BSA.
      if (job.kind === 'geometry') {
        const bytes = new Uint8Array(job.bytes);
        worker.postMessage({ id, job: { ...job, bytes } }, [bytes.buffer]);
      } else worker.postMessage({ id, job });
    } catch {
      pending.delete(id);
      if (!pending.size) idle = setTimeout(close, 10000);
      resolve(prepareHair(job));
    }
  });
}

export const prepareHairGeometry = bytes => run({ kind: 'geometry', bytes });

const tintCache = new WeakMap();
export async function prepareHairTints(pieces, textures, color) {
  const result = new Map();
  color = normalizeHairColor(color);
  if (!color) return result;
  for (const piece of pieces) {
    if (piece.slot !== 'hair' || !hairMaterialCanTint(piece.material)) continue;
    const mips = textures.get(piece.material?.textureFile)?.image?.mips;
    if (!mips || result.has(mips)) continue;
    let colors = tintCache.get(mips);
    if (!colors) tintCache.set(mips, colors = new Map());
    const cached = colors.get(color);
    let tinted = cached instanceof WeakRef ? cached.deref() : cached;
    if (!tinted) {
      for (const [key, entry] of colors) {
        if (entry instanceof WeakRef && !entry.deref()) colors.delete(key);
      }
      tinted = run({ kind: 'tint', mips, color }).then(value => {
        colors.set(color, new WeakRef(value));
        return value;
      }, error => {
        colors.delete(color);
        throw error;
      });
      colors.set(color, tinted);
    }
    result.set(mips, await tinted);
  }
  return result;
}
