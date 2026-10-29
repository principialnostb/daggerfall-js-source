import { HELMET_2D_COUNT, helmetPaperdollVariant, setHelmetPaperdollVariant } from '../../systems/helmetPaperdollLooks.js';
import { paperdollItemImage } from '../paperDoll.js';
import { loadIcon } from '../textureCanvas.js';

// Keep the tab/page when the inventory updates after a choice. No item/entity mutation.
const states = new Map();
const thumbnails = new Map();

/** Fit visible pixels, not the transparent paperdoll sheet around the helmet. */
export function helmetArtBounds(rgba, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (rgba[(y * width + x) * 4 + 3] <= 16) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

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
export function helmetAppearancePicker({ item, identity, modelRow, onChange, loadArt = loadIcon }) {
  const key = `${item.templateIndex}:${item.material ?? 0}`;
  const selected = helmetPaperdollVariant(item);
  if (!states.has(key)) states.set(key, { mode: '3d', page: selected === null ? 0 : Math.floor((selected + 1) / 3) });
  const state = states.get(key);
  const make = (tag, cls, text = '') => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const root = make('div', 'helmet-appearance');
  const tabs = make('div', 'look-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Внешний вид шлема');
  const panel = make('div', 'look-panel'); panel.setAttribute('role', 'tabpanel');
  const buttons = [];
  const draw = () => {
    for (const [mode, button] of buttons) {
      button.classList.toggle('on', mode === state.mode);
      button.classList.toggle('primary', mode === state.mode);
      button.setAttribute('aria-selected', String(mode === state.mode));
      button.tabIndex = mode === state.mode ? 0 : -1;
    }
    panel.replaceChildren();
    panel.setAttribute('aria-label', state.mode === '3d' ? '3D-модель' : '2D-облик');
    if (state.mode === '3d') {
      panel.append(modelRow ?? make('span', 'look-name', 'Нет других 3D-моделей'));
      return;
    }
    const current = helmetPaperdollVariant(item);
    const choices = [null, ...Array.from({ length: HELMET_2D_COUNT }, (_, i) => i)];
    const row = make('div', 'look-row helmet-2d-row');
    const cards = make('div', 'look-cards');
    for (const value of choices.slice(state.page * 3, state.page * 3 + 3)) {
      const label = value === null ? 'Исходный' : `2D-облик ${value + 1}`;
      const button = make('button', `look-pick${value === current ? ' on' : ''}`);
      button.setAttribute('data-helmet-art', String(value ?? item.variant ?? 0));
      button.type = 'button'; button.title = label;
      button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(value === current));
      const art = paperdollItemImage(item, identity, { helmetVariant: value });
      const image = make('img', ''); image.alt = label; button.append(image);
      if (art) loadArt(art.archive, art.record, { scale: 3, dye: art.dye, dyeTarget: art.target }).then((url) => {
        if (url) {
          image.src = url;
          // Browsers have Image; lightweight DOM tests need no bitmap decoder.
          if (typeof Image !== 'undefined') fitHelmetThumbnail(url).then((fitted) => { image.src = fitted; });
        }
        else { image.remove(); button.append(make('span', 'look-name', label)); }
      }).catch(() => { image.remove(); button.append(make('span', 'look-name', label)); });
      button.onclick = () => { if (setHelmetPaperdollVariant(item, value)) { draw(); onChange(); } };
      cards.append(button);
    }
    const navigation = make('div', 'look-pages');
    for (const [delta, label] of [[-1, 'Предыдущий ряд'], [1, 'Следующий ряд']]) {
      const button = make('button', delta < 0 ? 'look-page-prev' : 'look-page-next'); button.type = 'button';
      button.title = label; button.setAttribute('aria-label', label);
      button.disabled = delta < 0 ? state.page === 0 : (state.page + 1) * 3 >= choices.length;
      button.onclick = () => { state.page += delta; draw(); };
      navigation.append(button);
    }
    row.append(cards, navigation); panel.append(row);
  };
  for (const [mode, label] of [['3d', '3D-модель'], ['2d', '2D-облик']]) {
    const button = make('button', 'act look-tab', label); button.type = 'button'; button.setAttribute('role', 'tab');
    button.onclick = () => { state.mode = mode; draw(); };
    button.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? buttons[0] : event.key === 'End' ? buttons[1] : buttons.find(([other]) => other !== mode);
      state.mode = target[0]; draw(); target[1].focus();
    };
    buttons.push([mode, button]); tabs.append(button);
  }
  root.append(tabs, panel); draw(); return root;
}
