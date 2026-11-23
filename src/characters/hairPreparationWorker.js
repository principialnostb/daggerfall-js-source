import { prepareHair } from './hairPreparation.js';

globalThis.onmessage = ({ data: { id, job } }) => {
  try {
    const result = prepareHair(job);
    const buffers = job.kind === 'tint' ? [...new Set(result.flatMap(mip => mip.rgba ? [mip.rgba.buffer] : []))] : [];
    globalThis.postMessage({ id, result }, buffers);
  } catch (error) {
    globalThis.postMessage({ id, error: String(error) });
  }
};
