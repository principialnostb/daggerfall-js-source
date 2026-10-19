import { BODY_MORPH_FIELDS, getBodyMorphs, setBodyMorph, resetBodyMorphs } from '../characters/bodyMorphs.js';

const GROUPS = [
  { title: 'Силуэт', description: 'Общие пропорции персонажа', keys: ['height', 'bodyWidth', 'shoulderWidth'] },
  { title: 'Торс', description: 'Грудная клетка, грудь и талия', keys: ['torsoScale', 'breastSize', 'waistWidth'] },
  { title: 'Таз и голова', description: 'Пропорции головы, таза и ягодиц', keys: ['hipWidth', 'buttockSize', 'headScale'] },
  { title: 'Конечности', description: 'Объём рук и ног, расстояние между ногами', keys: ['armScale', 'legScale', 'legGap'] },
];
const labelByKey = new Map(BODY_MORPH_FIELDS.map(([key, label]) => [key, label]));
const clamp = (n) => Math.max(-1, Math.min(1, n));

const STYLE = `
#mw-appearance-editor{--mw-bg:#171916;--mw-panel:#20231f;--mw-panel-raised:#292d27;--mw-line:#41483d;--mw-text:#f0eee5;--mw-muted:#a6ad9c;--mw-accent:#c5a66c;--mw-accent-strong:#e1c58b;position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:clamp(10px,2vw,28px);background:rgba(7,9,7,.82);backdrop-filter:blur(9px);color:var(--mw-text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
#mw-appearance-editor *{box-sizing:border-box}
#mw-appearance-editor button,#mw-appearance-editor input{font:inherit}
#mw-appearance-editor .mw-editor-shell{width:min(1440px,100%);height:min(940px,94vh);min-height:480px;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;background:var(--mw-bg);border:1px solid #59604f;border-radius:15px;box-shadow:0 30px 100px #000a}
#mw-appearance-editor .mw-topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px 22px;border-bottom:1px solid var(--mw-line);background:linear-gradient(105deg,#252a22,#1b1e1a)}
#mw-appearance-editor .mw-brand{display:flex;align-items:center;gap:13px;min-width:0}
#mw-appearance-editor .mw-mark{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border:1px solid #756648;border-radius:10px;color:var(--mw-accent-strong);font-size:21px;background:#353328}
#mw-appearance-editor .mw-title{font-size:18px;font-weight:750;letter-spacing:.01em}
#mw-appearance-editor .mw-subtitle{margin-top:2px;color:var(--mw-muted);font-size:12px}
#mw-appearance-editor .mw-top-actions{display:flex;align-items:center;gap:12px}
#mw-appearance-editor .mw-state{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid #475342;border-radius:999px;color:#c7d3b9;background:#293126;font-size:11px;white-space:nowrap}
#mw-appearance-editor .mw-state:before{content:"";width:6px;height:6px;border-radius:50%;background:#a8c58a;box-shadow:0 0 8px #a8c58a66}
#mw-appearance-editor .mw-main{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(360px,.82fr);min-height:0}
#mw-appearance-editor .mw-preview-side{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-height:0;padding:18px;background:radial-gradient(ellipse at 50% 38%,#363b31 0,#242920 42%,#191c18 78%)}
#mw-appearance-editor .mw-preview-head{display:flex;justify-content:space-between;align-items:start;gap:12px;padding:0 4px 10px}
#mw-appearance-editor .mw-section-title{font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#e3dfd1}
#mw-appearance-editor .mw-section-note{font-size:12px;color:var(--mw-muted);margin-top:3px}
#mw-appearance-editor .mw-canvas-wrap{position:relative;min-height:0;overflow:hidden;border:1px solid #555d4d;border-radius:11px;background:radial-gradient(ellipse at 50% 43%,#42473a 0,#292e26 46%,#20231e 78%)}
#mw-appearance-editor canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
#mw-appearance-editor canvas:active{cursor:grabbing}
#mw-appearance-editor .mw-preview-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 2px 0}
#mw-appearance-editor .mw-tool-group{display:flex;align-items:center;gap:6px}
#mw-appearance-editor .mw-zoom-value{min-width:48px;text-align:center;color:#e6e2d6;font-size:12px;font-variant-numeric:tabular-nums}
#mw-appearance-editor .mw-hint{max-width:50%;text-align:right;color:var(--mw-muted);font-size:11px}
#mw-appearance-editor .mw-controls{display:flex;flex-direction:column;min-height:0;overflow:hidden;border-left:1px solid var(--mw-line);background:#1d201c}
#mw-appearance-editor .mw-controls-head{padding:20px 22px 15px;border-bottom:1px solid var(--mw-line)}
#mw-appearance-editor .mw-controls-head h2{font-size:20px;line-height:1.2;margin:0;font-weight:750}
#mw-appearance-editor .mw-controls-head p{font-size:12px;color:var(--mw-muted);margin:7px 0 0}
#mw-appearance-editor .mw-control-list{min-height:0;overflow:auto;padding:15px 18px 20px;scrollbar-color:#59604f transparent;scrollbar-width:thin}
#mw-appearance-editor .mw-group{margin:0 0 12px;padding:0;border:1px solid var(--mw-line);border-radius:10px;background:#22251f;overflow:hidden}
#mw-appearance-editor .mw-group-head{padding:11px 13px;border-bottom:1px solid #363d32;background:#272b24}
#mw-appearance-editor .mw-group-title{font-size:13px;font-weight:700;color:#e9dfc6}
#mw-appearance-editor .mw-group-note{margin-top:2px;font-size:11px;color:var(--mw-muted)}
#mw-appearance-editor .mw-group-fields{padding:6px 13px 9px}
#mw-appearance-editor .mw-slider-row{display:grid;grid-template-columns:minmax(105px,1fr) minmax(80px,1.25fr) 42px;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #34392f}
#mw-appearance-editor .mw-slider-row:last-child{border-bottom:0}
#mw-appearance-editor .mw-slider-label{font-size:12px;color:#e2e2d8}
#mw-appearance-editor input[type=range]{width:100%;margin:0;accent-color:var(--mw-accent);cursor:pointer}
#mw-appearance-editor output{color:var(--mw-accent-strong);font-size:11px;text-align:right;font-variant-numeric:tabular-nums}
#mw-appearance-editor .mw-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 18px;border-top:1px solid var(--mw-line);background:#1a1d19}
#mw-appearance-editor .mw-footer-note{color:var(--mw-muted);font-size:11px}
#mw-appearance-editor .mw-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:7px 11px;border:1px solid #535b4b;border-radius:7px;background:#2a2f27;color:#e8e7dc;font-size:12px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
#mw-appearance-editor .mw-btn:hover{background:#363d30;border-color:#798368}
#mw-appearance-editor .mw-btn:active{transform:translateY(1px)}
#mw-appearance-editor .mw-btn-primary{border-color:#c5a66c;background:#c5a66c;color:#1e211a}
#mw-appearance-editor .mw-btn-primary:hover{background:#ddc18a;border-color:#ddc18a}
#mw-appearance-editor .mw-btn-icon{width:34px;padding:0;font-size:17px}
#mw-appearance-editor .mw-close{width:34px;height:34px;padding:0;border-radius:8px;font-size:19px}
#mw-appearance-editor .mw-status-message{position:absolute;left:18px;right:18px;top:50%;transform:translateY(-50%);text-align:center;padding:18px;color:#deded3;font-size:13px;pointer-events:none}
@media(max-width:850px){#mw-appearance-editor .mw-editor-shell{height:96vh}#mw-appearance-editor .mw-main{grid-template-columns:minmax(0,1fr) minmax(310px,.9fr)}#mw-appearance-editor .mw-preview-side{padding:12px}#mw-appearance-editor .mw-controls-head{padding:15px}#mw-appearance-editor .mw-control-list{padding:10px}#mw-appearance-editor .mw-slider-row{grid-template-columns:95px minmax(60px,1fr) 36px;gap:7px}}
@media(max-width:650px){#mw-appearance-editor{padding:0}#mw-appearance-editor .mw-editor-shell{width:100%;height:100dvh;min-height:0;border-radius:0;border:0}#mw-appearance-editor .mw-topbar{padding:12px 14px}#mw-appearance-editor .mw-title{font-size:16px}#mw-appearance-editor .mw-subtitle{font-size:11px}#mw-appearance-editor .mw-state{display:none}#mw-appearance-editor .mw-main{grid-template-columns:1fr;grid-template-rows:minmax(230px,.85fr) minmax(0,1.15fr)}#mw-appearance-editor .mw-preview-side{padding:10px;grid-template-rows:auto minmax(0,1fr) auto}#mw-appearance-editor .mw-preview-head{padding-bottom:6px}#mw-appearance-editor .mw-preview-tools{padding-top:7px}#mw-appearance-editor .mw-controls{border-left:0;border-top:1px solid var(--mw-line)}#mw-appearance-editor .mw-controls-head{padding:12px 15px}#mw-appearance-editor .mw-controls-head h2{font-size:17px}#mw-appearance-editor .mw-control-list{padding:9px 12px}#mw-appearance-editor .mw-group{margin-bottom:8px}#mw-appearance-editor .mw-footer{padding:10px 12px}#mw-appearance-editor .mw-footer-note{display:none}#mw-appearance-editor .mw-hint{max-width:46%;font-size:10px}}
`;

export function openAppearanceEditor({ fpArm, onClose = () => {} } = {}) {
  if (typeof document === 'undefined' || !document.body) return null;
  document.getElementById('mw-appearance-editor')?.remove();

  let yaw = 0, zoom = 1, frame = 0, closed = false, previewRig = null, previewBuildPending = false, previewError = '';
  const root = document.createElement('div');
  root.id = 'mw-appearance-editor';
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.append(style);

  const shell = document.createElement('section');
  shell.className = 'mw-editor-shell';
  const topbar = document.createElement('header');
  topbar.className = 'mw-topbar';
  topbar.innerHTML = '<div class="mw-brand"><div class="mw-mark" aria-hidden="true">✦</div><div><div class="mw-title">Редактор внешности</div><div class="mw-subtitle">Morrowind · персональная настройка персонажа</div></div></div><div class="mw-top-actions"><span class="mw-state">Отдельный предпросмотр · без экипировки</span></div>';
  const closeBtn = makeButton('×', false, 'mw-close');
  closeBtn.setAttribute('aria-label', 'Закрыть редактор');
  closeBtn.title = 'Закрыть';
  closeBtn.addEventListener('click', close);
  topbar.querySelector('.mw-top-actions').append(closeBtn);

  const main = document.createElement('div');
  main.className = 'mw-main';
  const previewSide = document.createElement('section');
  previewSide.className = 'mw-preview-side';
  const previewHead = document.createElement('div');
  previewHead.className = 'mw-preview-head';
  previewHead.innerHTML = '<div><div class="mw-section-title">Предпросмотр модели</div><div class="mw-section-note">Зажмите и ведите мышь, чтобы вращать</div></div>';
  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'mw-canvas-wrap';
  const preview = document.createElement('canvas');
  preview.width = 900; preview.height = 1080;
  preview.setAttribute('aria-label', '3D-предпросмотр персонажа');
  const statusMessage = document.createElement('div');
  statusMessage.className = 'mw-status-message';
  statusMessage.textContent = 'Загрузка отдельной модели…';
  canvasWrap.append(preview, statusMessage);

  const previewTools = document.createElement('div');
  previewTools.className = 'mw-preview-tools';
  const toolGroup = document.createElement('div');
  toolGroup.className = 'mw-tool-group';
  const zoomOut = makeButton('−', false, 'mw-btn-icon'); zoomOut.setAttribute('aria-label', 'Отдалить модель');
  const zoomLabel = document.createElement('span'); zoomLabel.className = 'mw-zoom-value';
  const zoomIn = makeButton('+', false, 'mw-btn-icon'); zoomIn.setAttribute('aria-label', 'Приблизить модель');
  const zoomReset = makeButton('Сбросить вид');
  const previewHint = document.createElement('div'); previewHint.className = 'mw-hint';
  const setZoom = (next) => { zoom = Math.max(0.6, Math.min(2.4, next)); zoomLabel.textContent = Math.round(zoom * 100) + '%'; drawPreview(); };
  zoomOut.addEventListener('click', () => setZoom(zoom - 0.15));
  zoomIn.addEventListener('click', () => setZoom(zoom + 0.15));
  zoomReset.addEventListener('click', () => { yaw = 0; setZoom(1); drawPreview(); });
  preview.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1)); }, { passive: false });
  toolGroup.append(zoomOut, zoomLabel, zoomIn);
  previewTools.append(toolGroup, zoomReset, previewHint);

  const controls = document.createElement('section');
  controls.className = 'mw-controls';
  const controlsHead = document.createElement('div');
  controlsHead.className = 'mw-controls-head';
  controlsHead.innerHTML = '<h2>Пропорции тела</h2><p>Настройки применяются сразу. Значения показаны относительно базовой модели.</p>';
  const controlList = document.createElement('div'); controlList.className = 'mw-control-list';
  const inputs = new Map();
  const outputs = new Map();
  const initial = getBodyMorphs();

  for (const groupInfo of GROUPS) {
    const group = document.createElement('section'); group.className = 'mw-group';
    const groupHead = document.createElement('div'); groupHead.className = 'mw-group-head';
    const groupTitle = document.createElement('div'); groupTitle.className = 'mw-group-title'; groupTitle.textContent = groupInfo.title;
    const groupNote = document.createElement('div'); groupNote.className = 'mw-group-note'; groupNote.textContent = groupInfo.description;
    groupHead.append(groupTitle, groupNote);
    const fields = document.createElement('div'); fields.className = 'mw-group-fields';
    for (const key of groupInfo.keys) {
      const row = document.createElement('label'); row.className = 'mw-slider-row';
      const name = document.createElement('span'); name.className = 'mw-slider-label'; name.textContent = labelByKey.get(key) || key;
      const input = document.createElement('input');
      input.type = 'range'; input.min = '-1'; input.max = '1'; input.step = '0.01'; input.value = String(initial[key] ?? 0);
      input.setAttribute('aria-label', name.textContent);
      const output = document.createElement('output'); output.textContent = formatValue(Number(input.value));
      input.addEventListener('input', () => {
        const value = clamp(Number(input.value));
        setBodyMorph(key, value);
        output.textContent = formatValue(value);
        window.dispatchEvent(new CustomEvent('mw-body-morph-change', { detail: getBodyMorphs() }));
        drawPreview();
      });
      inputs.set(key, input); outputs.set(key, output);
      row.append(name, input, output); fields.append(row);
    }
    group.append(groupHead, fields); controlList.append(group);
  }

  const footer = document.createElement('footer'); footer.className = 'mw-footer';
  const footerNote = document.createElement('div'); footerNote.className = 'mw-footer-note'; footerNote.textContent = 'Изменения применяются сразу';
  const footerActions = document.createElement('div'); footerActions.className = 'mw-tool-group';
  const reset = makeButton('Сбросить параметры');
  reset.addEventListener('click', () => {
    const state = resetBodyMorphs();
    for (const [key, input] of inputs) {
      input.value = String(state[key] ?? 0);
      outputs.get(key).textContent = formatValue(Number(input.value));
    }
    window.dispatchEvent(new CustomEvent('mw-body-morph-change', { detail: state }));
    drawPreview();
  });
  const done = makeButton('Готово', true, 'mw-btn-primary'); done.addEventListener('click', close);
  footerActions.append(reset, done); footer.append(footerNote, footerActions);

  previewSide.append(previewHead, canvasWrap, previewTools);
  controls.append(controlsHead, controlList, footer);
  main.append(previewSide, controls);
  shell.append(topbar, main); root.append(shell);
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
      statusMessage.style.display = 'block';
      statusMessage.textContent = previewError || 'Собирается отдельная 3D-модель из игровых ресурсов…';
      previewHint.textContent = previewError ? 'Предпросмотр недоступен' : 'Загрузка ресурсов';
      return;
    }
    try {
      const image = previewRig.figure({ yaw, height: Math.min(1024, Math.max(640, Math.round(preview.height * 0.95))), force: true, neutral: true });
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, preview.width, preview.height);
      if (!image?.data) {
        statusMessage.style.display = 'block';
        statusMessage.textContent = 'Модель собрана, но изображение недоступно.';
        previewHint.textContent = 'Ошибка отображения';
        return;
      }
      statusMessage.style.display = 'none';
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = image.width; imageCanvas.height = image.height;
      const imageCtx = imageCanvas.getContext('2d');
      if (!imageCtx) return;
      imageCtx.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);
      const scale = Math.min((preview.width * .98) / image.width, (preview.height * .98) / image.height) * zoom;
      const dw = image.width * scale, dh = image.height * scale;
      ctx.drawImage(imageCanvas, (preview.width - dw) / 2, (preview.height - dh) / 2, dw, dh);
      previewHint.textContent = 'Без экипировки · нейтральная стойка';
    } catch (error) {
      statusMessage.style.display = 'block';
      statusMessage.textContent = 'Ошибка предпросмотра: ' + String(error?.message || error);
      previewHint.textContent = 'Ошибка отображения';
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

function formatValue(value) {
  const percent = Math.round(clamp(Number(value) || 0) * 100);
  return (percent > 0 ? '+' : '') + percent + '%';
}

function makeButton(text, primary = false, extraClass = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = 'mw-btn' + (primary ? ' mw-btn-primary' : '') + (extraClass ? ' ' + extraClass : '');
  return button;
}
