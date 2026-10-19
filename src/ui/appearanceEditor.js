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
  let yaw = 0, zoom = 1, frame = 0, closed = false, previewRig = null, previewBuildPending = false, previewError = '';
  const root = document.createElement('div');
  root.id = 'mw-appearance-editor';
  root.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(8,8,12,.88);display:flex;align-items:center;justify-content:center;padding:18px;color:#eee;font:14px system-ui,sans-serif;';
  const panel = document.createElement('section');
  panel.style.cssText = 'width:min(1320px,98vw);height:min(900px,96vh);display:grid;grid-template-columns:minmax(320px,1.05fr) minmax(360px,1fr);background:#17171c;border:1px solid #777;border-radius:8px;box-shadow:0 18px 70px #000;overflow:hidden;';
  const previewSide = document.createElement('div');
  previewSide.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:18px;background:linear-gradient(#222229,#111115);min-height:0;';
  const heading = document.createElement('div');
  heading.innerHTML = '<div style="font-size:21px;font-weight:700;letter-spacing:.03em">Редактирование внешности</div><div style="color:#aaa;margin-top:6px">Отдельная 3D-модель · перетаскивай для вращения</div>';
  const preview = document.createElement('canvas');
  preview.width = 720; preview.height = 820;
  preview.style.cssText = 'width:100%;height:100%;min-height:0;flex:1;object-fit:contain;cursor:grab;touch-action:none;background:radial-gradient(ellipse,#373741 0%,#17171c 68%);border:1px solid #444;border-radius:6px;';
  const previewTools = document.createElement('div');
  previewTools.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:8px;';
  const zoomOut = makeButton('−');
  const zoomLabel = document.createElement('span');
  zoomLabel.style.cssText = 'min-width:64px;text-align:center;color:#ddd;font-variant-numeric:tabular-nums;';
  const zoomIn = makeButton('+');
  const zoomReset = makeButton('Сбросить масштаб');
  const setZoom = (next) => { zoom = Math.max(0.6, Math.min(2.4, next)); zoomLabel.textContent = Math.round(zoom * 100) + '%'; drawPreview(); };
  zoomOut.addEventListener('click', () => setZoom(zoom - 0.15));
  zoomIn.addEventListener('click', () => setZoom(zoom + 0.15));
  zoomReset.addEventListener('click', () => setZoom(1));
  preview.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1)); }, { passive: false });
  previewTools.append(zoomOut, zoomLabel, zoomIn, zoomReset);
  const previewHint = document.createElement('div');
  previewHint.style.cssText = 'font-size:12px;color:#aaa;text-align:center;line-height:1.5;';
  previewHint.textContent = 'Загрузка отдельной 3D-модели персонажа…';
  const controls = document.createElement('div');
  controls.style.cssText = 'overflow:auto;min-height:0;padding:18px 20px;';
  const top = document.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;';
  top.innerHTML = '<div style="font-size:17px;font-weight:700">Внешность и пропорции</div>';
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
  setZoom(1);
  previewSide.append(heading, preview, previewTools, previewHint);
  panel.append(previewSide, controls); root.append(panel);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  const keydown = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', keydown);
  document.body.append(root);
  drawPreview();
  void buildPreviewRig();

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

  async function buildPreviewRig() {
    if (closed || previewBuildPending || previewRig || !fpArm?.createAppearancePreviewRig) {
      if (!fpArm?.createAppearancePreviewRig) { previewError = 'Отдельная 3D-сборка недоступна для этого игрового рига.'; drawPreview(); }
      return;
    }
    previewBuildPending = true;
    try {
      const result = await fpArm.createAppearancePreviewRig();
      if (closed) { result?.rig?.unload?.(); return; }
      if (result?.ok && result.rig) previewRig = result.rig;
      else previewError = result?.error || 'Не удалось собрать отдельную модель.';
    } catch (error) {
      previewError = String(error?.message || error);
    } finally {
      previewBuildPending = false;
      drawPreview();
    }
  }
  function drawPreview() {
    if (closed) return;
    if (!previewRig) {
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, preview.width, preview.height);
      ctx.fillStyle = '#ddd'; ctx.font = '16px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(previewError || 'Сборка отдельной 3D-модели…', preview.width / 2, preview.height / 2);
      previewHint.textContent = previewError || 'Собирается отдельная модель из игровых ресурсов.';
      return;
    }
    try {
      const image = previewRig.figure({ yaw, height: 760, force: true });
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, preview.width, preview.height);
      if (!image?.data) { previewHint.textContent = 'Модель собрана, но рендер предпросмотра недоступен.'; return; }
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = image.width; imageCanvas.height = image.height;
      const imageCtx = imageCanvas.getContext('2d');
      if (!imageCtx) return;
      imageCtx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      const scale = Math.min((preview.width * .94) / image.width, (preview.height * .94) / image.height) * zoom;
      const dw = image.width * scale, dh = image.height * scale;
      ctx.drawImage(imageCanvas, (preview.width - dw) / 2, (preview.height - dh) / 2, dw, dh);
      previewHint.textContent = 'Отдельная NIF-модель без экипировки. Поза — спокойная стойка без оружия.';
    } catch (error) {
      previewHint.textContent = 'Ошибка рендера модели: ' + String(error?.message || error);
    }
  }
  function close() {
    if (closed) return;
    closed = true;
    if (frame) cancelAnimationFrame(frame);
    previewRig?.unload?.(); previewRig = null;
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
