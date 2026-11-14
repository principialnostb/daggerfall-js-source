import { charPixelRows, blockPixels } from '../../render/charPixelLayer.js';
export function previewRasterSize(width, height, displayHeight, viewportHeight = globalThis.innerHeight ?? 1080, rows = charPixelRows('player')) {
  const block = blockPixels(viewportHeight, rows);
  if (block <= 1) return { width, height };
  const scale = Math.min(1, displayHeight / (height * block));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export const previewImageRendering = () => blockPixels(globalThis.innerHeight ?? 1080, charPixelRows('player')) > 1 ? 'pixelated' : 'auto';
// Match a block in the world render target to its presented size in CSS pixels.
export function editorPreviewRaster(width, height, rows, frameInfo, viewportHeight, dpr = 1) {
  const targetHeight = frameInfo?.world?.[1] || viewportHeight * dpr;
  const displayHeight = frameInfo?.worldDisplayHeight || viewportHeight;
  const block = blockPixels(targetHeight, rows);
  const pitch = block > 1 ? Math.max(1 / dpr, block * displayHeight / targetHeight) : 1 / dpr;
  return {
    width: Math.max(1, Math.round(width / pitch)),
    height: Math.max(1, Math.round(height / pitch)),
    pixelated: block > 1,
  };
}
export const previewPixelKey = () => `${charPixelRows('player')}:${globalThis.innerHeight ?? 1080}`;
// A 68px item card gets 36/27/23/20 rows, independent of the screen's height.
const ITEM_PREVIEW_ROWS = new Map([[540, 36], [360, 27], [270, 23], [200, 20]]);
export function itemPreviewRasterSize(width, height, displayHeight, rows) {
  if (rows <= 0) return { width, height };
  const block = Math.max(1, 68 / (ITEM_PREVIEW_ROWS.get(rows) ?? rows / 10));
  const scale = Math.min(1, displayHeight / (height * block));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export const itemPreviewImageRendering = () => charPixelRows('player') > 0 ? 'pixelated' : 'auto';
export function paintPreview(canvas, pixels, displayHeight) {
  canvas.style?.setProperty('image-rendering', previewImageRendering());
  const size = previewRasterSize(pixels.width, pixels.height, displayHeight);
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
          const size = itemPreviewRasterSize(image.width, image.height, displayHeight, rows);
          const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
          canvas.getContext('2d').drawImage(image, 0, 0, size.width, size.height); resolve(canvas.toDataURL());
        } catch { resolve(src); }
      }; image.src = src;
    }));
  }
  return urls.get(key);
}
