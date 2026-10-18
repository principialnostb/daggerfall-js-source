import { BODY_MORPH_FIELDS, getBodyMorphs, setBodyMorph, resetBodyMorphs } from '../characters/bodyMorphs.js';

const GROUPS = [
  ['Основные пропорции', ['height', 'bodyWidth', 'shoulderWidth']],
  ['Корпус, грудь и талия', ['torsoScale', 'breastSize', 'waistWidth', 'headScale']],
  ['Бёдра и ягодицы', ['hipWidth', 'buttockSize']],
  ['Конечности', ['armScale', 'legScale', 'legGap']],
];
const labelByKey = new Map(BODY_MORPH_FIELDS.map(([key, label]) => [key, label]));
const clamp = (n) => Math.max(-1, Math.min(1, n));

export function openAppearanceEditor({ fpArm, onClose = () => {} } = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  document.getElementById('mw-appearance-editor')?.remove();
  let yaw = 0, frame = 0, retryTimer = 0, closed = false;
  const root = document.createElement('div');
  root.id = 'mw-appearance-editor';
  root.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(8,8,12,.88);display:flex;align-items:center;justify-content:center;padding:18px;color:#eee;font:14px system-ui,sans-serif;';
  const panel = document.createElement('section');
  panel.style.cssText = 'width:min(1100px,96vw);height:min(820px,94vh);display:grid;grid-template-columns:minmax(250px,.85fr) minmax(300px,1.15fr);background:#17171c;border:1px solid #777;border-radius:8px;box-shadow:0 18px 70px #000;overflow:hidden;';
  const previewSide = document.createElement('div');
  previewSide.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:18px;background:linear-gradient(#222229,#111115);min-height:0;';
  const heading = document.createElement('div');
  heading.innerHTML = '<div style="font-size:21px;font-weight:700;letter-spacing:.03em">Редактирование внешности</div><div style="color:#aaa;margin-top:6px">Зажми модель и вращай мышью</div>';
  const preview = document.createElement('canvas');
  preview.width = 512; preview.height = 512;
  preview.style.cssText = 'width:min(100%,380px);height:auto;max-height:66%;object-fit:contain;cursor:grab;touch-action:none;background:radial-gradient(ellipse,#373741 0%,#17171c 68%);border:1px solid #444;border-radius:6px;';
  const previewHint = document.createElement('div');
  previewHint.style.cssText = 'font-size:12px;color:#aaa;text-align:center;line-height:1.5;';
  previewHint.textContent = 'Настройки сохраняются автоматически. Ползунки изменяют геометрию модели игрока.';
  const controls = document.createElement('div');
  controls.style.cssText = 'overflow:auto;min-height:0;padding:18px 20px;';
  const top = document.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;';
  top.innerHTML = '<div style="font-size:17px;font-weight:700">Параметры тела</div>';
  const closeBtn = makeButton('Закрыть');
  closeBtn.addEventListener('click', close);
  top.append(closeBtn); controls.append(top);
  const inputs = new Map();
  const initial = getBodyMorphs();
  for (const [groupName, keys] of GROUPS) {
    const group = document.createElement('fieldset');
    group.style.cssText = 'border:1px solid #45454e;border-radius:6px;margin:0 0 14px;padding:10px 12px 12px;';
    const legend = document.createElement('legend');
    legend.textContent = groupName;
    legend.style.cssText = 'padding:0 6px;color:#e2c98c;font-weight:650;';
    group.append(legend);
    for (const key of keys) {
      const row = document.createElement('label');
      row.style.cssText = 'display:grid;grid-template-columns:minmax(115px,1fr) minmax(95px,1.2fr) 42px;align-items:center;gap:9px;margin:9px 0;';
      const name = document.createElement('span'); name.textContent = labelByKey.get(key) || key;
      const input = document.createElement('input');
      input.type = 'range'; input.min = '-1'; input.max = '1'; input.step = '0.01'; input.value = String(initial[key] ?? 0);
      input.style.cssText = 'width:100%;accent-color:#d3b36a;cursor:pointer;';
      const output = document.createElement('output');
      output.style.cssText = 'text-align:right;color:#ddd;font-variant-numeric:tabular-nums;';
      output.textContent = String(Math.round(Number(input.value) * 100)) + '%';
      input.addEventListener('input', () => {
        const value = clamp(Number(input.value));
        setBodyMorph(key, value);
        output.textContent = String(Math.round(value * 100)) + '%';
        window.dispatchEvent(new CustomEvent('mw-body-morph-change', { detail: getBodyMorphs() }));
        drawPreview();
      });
      inputs.set(key, input); row.append(name, input, output); group.append(row);
    }
    controls.append(group);
  }
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;position:sticky;bottom:-18px;background:#17171c;padding:12px 0 2px;border-top:1px solid #3e3e45;';
  const reset = makeButton('Сбросить по умолчанию');
  reset.addEventListener('click', () => {
    resetBodyMorphs();
    for (const input of inputs.values()) { input.value = '0'; input.dispatchEvent(new Event('input')); }
  });
  const done = makeButton('Готово', true); done.addEventListener('click', close);
  actions.append(reset, done); controls.append(actions);
  previewSide.append(heading, preview, previewHint);
  panel.append(previewSide, controls); root.append(panel);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  const keydown = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', keydown);
  document.body.append(root);
  drawPreview();

  let drag = null;
  preview.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, yaw };
    preview.setPointerCapture?.(e.pointerId);
    preview.style.cursor = 'grabbing';
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag) return;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.018;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; drawPreview(); });
  });
  const release = () => { drag = null; preview.style.cursor = 'grab'; };
  preview.addEventListener('pointerup', release);
  preview.addEventListener('pointercancel', release);

  function drawPreview() {
    if (closed) return;
    let pixels = null;
    try { pixels = fpArm?.figure?.({ yaw, height: 512, force: true }) ?? null; } catch { pixels = null; }
    if (!pixels?.data || !pixels.width || !pixels.height) {
      // Never substitute the equipment PaperDoll here: that image is not the
      // model being morphed and cannot reflect yaw or live geometry changes.
      const ctx = preview.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, preview.width, preview.height);
        ctx.fillStyle = '#b9b9c2'; ctx.font = '14px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('Загрузка 3D-модели…', preview.width / 2, preview.height / 2);
      }
      previewHint.textContent = 'Ожидаю модель игрока из игрового рига. Ползунки сохраняются и применятся сразу после готовности модели.';
      if (!retryTimer) retryTimer = window.setTimeout(() => { retryTimer = 0; drawPreview(); }, 250);
      return;
    }
    if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = 0; }
    previewHint.textContent = 'Настройки сохраняются автоматически. Зажми модель и вращай мышью.';
    // Render the native sprite larger, then scale it to the full preview area with
    // smoothing disabled so the original Morrowind pixels stay crisp.
    if (preview.width !== 512) preview.width = 512;
    if (preview.height !== 512) preview.height = 512;
    const ctx = preview.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, preview.width, preview.height);
      try {
        const source = document.createElement('canvas');
        source.width = pixels.width; source.height = pixels.height;
        source.getContext('2d')?.putImageData(new ImageData(pixels.data, pixels.width, pixels.height), 0, 0);
        const scale = Math.min((preview.width * 0.94) / pixels.width, (preview.height * 0.94) / pixels.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, (preview.width - pixels.width * scale) / 2, (preview.height - pixels.height * scale) / 2,
          pixels.width * scale, pixels.height * scale);
      } catch { /* keep the preview canvas usable if ImageData is unavailable */ }
    }
  }
  function close() {
    if (closed) return;
    closed = true;
    if (frame) cancelAnimationFrame(frame);
    if (retryTimer) window.clearTimeout(retryTimer);
    window.removeEventListener('keydown', keydown);
    root.remove(); onClose();
  }
  return { close };
}

function makeButton(text, primary = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = text;
  button.style.cssText = 'padding:9px 14px;border:1px solid ' + (primary ? '#d3b36a' : '#666') + ';border-radius:4px;background:' + (primary ? '#b79a58' : '#29292f') + ';color:' + (primary ? '#171717' : '#eee') + ';font-weight:650;cursor:pointer;';
  return button;
}
