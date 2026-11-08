import { paperdollAppearancePicker, artBounds } from './paperdollAppearancePicker.js';

// PAPERDOLL-LOOKS (2026-11-08): the helm's picker is the general one now (paperdollAppearancePicker.js) - the 3D tab,
// visible-pixel crops and no duplicate cards. The 3D look row's thumbnails still fit here.
const thumbnails = new Map();

/** Fit visible pixels, not the transparent paperdoll sheet around the helmet (one home: paperdollAppearancePicker.js). */
export const helmetArtBounds = artBounds;

export function fitHelmetThumbnail(url) {
  if (!thumbnails.has(url)) thumbnails.set(url, new Promise((resolve) => {
    const source = new Image();
    source.onerror = () => resolve(url);
    source.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = source.naturalWidth; canvas.height = source.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
        const bounds = helmetArtBounds(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (!bounds) { resolve(url); return; }
        const cropped = document.createElement('canvas'); cropped.width = bounds.width; cropped.height = bounds.height;
        cropped.getContext('2d').drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
        resolve(cropped.toDataURL());
      } catch { resolve(url); }
    };
    source.src = url;
  }));
  return thumbnails.get(url);
}
/** The helm's card: its 3D tab and its 2D looks (paperdollAppearancePicker.js). */
export function helmetAppearancePicker({ item, identity, modelRow, onChange, layerPixels }) {
  return paperdollAppearancePicker({ item, identity, modelRow: modelRow ?? null, onChange, ...(layerPixels ? { layerPixels } : {}) });
}
