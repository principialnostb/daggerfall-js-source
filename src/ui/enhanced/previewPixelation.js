import { charPixelRows, blockPixels } from '../../render/charPixelLayer.js';
export function previewRasterSize(width, height, displayHeight, viewportHeight, rows) {
  const block = blockPixels(viewportHeight, rows);
  if (block <= 1) return { width, height };
  const scale = Math.min(1, displayHeight / (height * block));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export const previewImageRendering = () => blockPixels(globalThis.innerHeight ?? 1080, charPixelRows('player')) > 1 ? 'pixelated' : 'auto';
export const previewPixelKey = () => `${charPixelRows('player')}:${globalThis.innerHeight ?? 1080}`;
export function paintPreview(canvas, pixels, displayHeight) {
  canvas.style?.setProperty('image-rendering', previewImageRendering());
  const size = previewRasterSize(pixels.width, pixels.height, displayHeight, globalThis.innerHeight ?? 1080, charPixelRows('player'));
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const data = new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height);
  if (size.width === pixels.width && size.height === pixels.height) { ctx.putImageData(data, 0, 0); return; }
  const source = document.createElement('canvas'); source.width = pixels.width; source.height = pixels.height;
  source.getContext('2d').putImageData(data, 0, 0);
  ctx.drawImage(source, 0, 0, size.width, size.height);
}
const urls = new Map();
export function pixelatedPreviewUrl(src, displayHeight = 68) {
  const rows = charPixelRows('player'), viewport = globalThis.innerHeight ?? 1080;
  if (!rows || typeof Image === 'undefined') return Promise.resolve(src);
  const key = `${rows}:${viewport}:${displayHeight}:${src}`;
  if (!urls.has(key)) {
    if (urls.size > 256) urls.clear();
    urls.set(key, new Promise((resolve) => {
      const image = new Image(); image.onerror = () => resolve(src);
      image.onload = () => {
        try {
          const size = previewRasterSize(image.width, image.height, displayHeight, viewport, rows);
          const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
          canvas.getContext('2d').drawImage(image, 0, 0, size.width, size.height); resolve(canvas.toDataURL());
        } catch { resolve(src); }
      }; image.src = src;
    }));
  }
  return urls.get(key);
}
