import { dfmodGeneration } from '../../systems/dfmodTextures.js';
import { paperDollDisplayIdentity, composeInventoryDollPixels } from '../paperDoll.js';
import { paperDollFaceCanvases } from '../facePortrait.js';
import { inventoryFaceIndex, inventoryFaceKey, setInventoryFaceIndex } from '../../systems/inventoryFace.js';

export const FACE_PAGE_SIZE = 3;
export function facePage(count, page = 0) {
  const pages = Math.max(1, Math.ceil(count / FACE_PAGE_SIZE));
  const current = Math.max(0, Math.min(pages - 1, page));
  return { current, pages, start: current * FACE_PAGE_SIZE, end: Math.min(count, (current + 1) * FACE_PAGE_SIZE) };
}
let pixels = null, generation = 0;
const compositeKey = (entity) => {
  const identity = paperDollDisplayIdentity(entity);
  return `${inventoryFaceKey(entity, identity)}:${inventoryFaceIndex(entity, identity)}`;
};
export const inventoryDollPixels = (entity) => pixels?.key === compositeKey(entity) ? pixels.value : null;
export async function refreshInventoryDoll(entity) {
  const request = ++generation;
  const key = compositeKey(entity);
  const identity = paperDollDisplayIdentity(entity);
  const faceIndex = inventoryFaceIndex(entity, identity);
  const result = faceIndex === null ? null : await composeInventoryDollPixels(entity, { ...identity, faceIndex });
  if (request === generation) pixels = result ? { key, value: { ...result, version: `inventory-face-${request}` } } : null;
}

let pickerCache = null;

/** Classic 2D art only: no character identity changes and no rig rebuilds. */
export function inventoryFacePicker({ entity, onChange, loadFaces = paperDollFaceCanvases }) {
  const identity = paperDollDisplayIdentity(entity);
  const key = `${inventoryFaceKey(entity, identity)}:${identity.faceIndex}:${dfmodGeneration()}`;
  if (pickerCache?.key === key) {
    pickerCache.onChange = onChange;
    pickerCache.sync();
    return pickerCache.root;
  }
  const root = document.createElement('section'); root.className = 'inventory-faces';
  root.setAttribute('aria-label', 'Лицо на карточке инвентаря');
  const status = document.createElement('span'); status.className = 'inventory-faces-status';
  status.textContent = 'Лица…'; root.append(status);
  let selected = inventoryFaceIndex(entity, identity) ?? identity.faceIndex;
  let faces = [], page = 0;
  const draw = () => {
    const range = facePage(faces.length, page); page = range.current;
    root.replaceChildren();
    const cards = document.createElement('div'); cards.className = 'inventory-face-cards';
    cards.setAttribute('role', 'group'); cards.setAttribute('aria-label', 'Варианты 2D-лица');
    for (let i = range.start; i < range.end; i++) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'inventory-face-card';
      button.title = `Лицо ${i + 1}`; button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(i === selected)); button.disabled = !faces[i];
      if (faces[i]) {
        const face = faces[i];
        // Mod portraits carry transparent margins (e.g. a 33x33 head inside
        // 44x47). Fit the visible head, as with the larger classic male heads.
        let x = 0, y = 0, width = face.width, height = face.height;
        try {
          const source = face.getContext?.('2d');
          const rgba = source?.getImageData?.(0, 0, width, height)?.data;
          if (rgba) {
            let left = width, top = height, right = -1, bottom = -1;
            for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
              if (rgba[(py * width + px) * 4 + 3] <= 16) continue;
              left = Math.min(left, px); top = Math.min(top, py);
              right = Math.max(right, px); bottom = Math.max(bottom, py);
            }
            if (right >= left && bottom >= top) {
              x = Math.max(0, left - 1); y = Math.max(0, top - 1);
              width = Math.min(face.width, right + 2) - x;
              height = Math.min(face.height, bottom + 2) - y;
            }
          }
        } catch { /* retain the full portrait if its pixels cannot be read */ }
        const image = document.createElement('canvas'); image.width = width; image.height = height;
        // Keep the mod's native resolution. Low-resolution pixel art should not
        // acquire a blurred outline when enlarged to the thumbnail's display size.
        image.style.imageRendering = faces[i].width <= 64 ? 'pixelated' : 'auto';
        const context = image.getContext('2d');
        if (context) {
          context.imageSmoothingEnabled = false;
          context.drawImage(face, x, y, width, height, 0, 0, width, height);
        }
        button.append(image);
      } else button.textContent = String(i + 1);
      button.addEventListener('click', () => {
        if (selected === i && inventoryFaceIndex(entity, identity) !== null) return;
        setInventoryFaceIndex(entity, identity, i); selected = i; draw(); entry.onChange();
      });
      cards.append(button);
    }
    const navigation = document.createElement('div'); navigation.className = 'inventory-face-pages';
    for (const [delta, label, glyph] of [[-1, 'Предыдущий ряд лиц', '▲'], [1, 'Следующий ряд лиц', '▼']]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = glyph;
      button.title = label; button.setAttribute('aria-label', label);
      button.disabled = delta < 0 ? page === 0 : page === range.pages - 1;
      button.addEventListener('click', () => { page += delta; draw(); }); navigation.append(button);
    }
    navigation.title = `Ряд ${page + 1} из ${range.pages}`;
    root.append(cards, navigation);
  };
  const entry = {
    key, root, onChange,
    sync() {
      const current = inventoryFaceIndex(entity, identity) ?? identity.faceIndex;
      if (selected !== current) { selected = current; if (faces.length) draw(); }
    },
  };
  pickerCache = entry;
  void loadFaces(identity.race, identity.gender).then((result) => {
    faces = result;
    if (!faces.length) { status.textContent = 'Лица недоступны'; return; }
    page = Math.floor(selected / FACE_PAGE_SIZE); draw();
  }).catch(() => { status.textContent = 'Не удалось загрузить лица'; });
  return root;
}
