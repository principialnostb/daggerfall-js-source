import { BODY_MORPH_FIELDS, getBodyMorphs, setBodyMorph, resetBodyMorphs, getUnderwearEnabled, setUnderwearEnabled } from '../characters/bodyMorphs.js';

const GROUPS = [
  { id: 'all', title: 'Все параметры', description: 'Полный набор пропорций', keys: ['height', 'bodyWidth', 'bodyFullness', 'shoulderWidth', 'ribcageWidth', 'breastSize', 'breastProjection', 'waistWidth', 'abdomenVolume', 'hipWidth', 'buttockSize', 'buttockProjection', 'headScale', 'armThickness', 'armLength', 'thighThickness', 'calfThickness', 'legLength', 'legGap'] },
  { id: 'shape', title: 'Силуэт', description: 'Общие пропорции', keys: ['height', 'bodyWidth', 'bodyFullness'] },
  { id: 'chest', title: 'Плечи и грудь', description: 'Плечевой пояс, грудная клетка и грудь', keys: ['shoulderWidth', 'ribcageWidth', 'breastSize', 'breastProjection'] },
  { id: 'torso', title: 'Талия и живот', description: 'Центральная часть корпуса', keys: ['waistWidth', 'abdomenVolume'] },
  { id: 'hips', title: 'Таз и ягодицы', description: 'Ширина таза и объём ягодиц', keys: ['hipWidth', 'buttockSize', 'buttockProjection'] },
  { id: 'arms', title: 'Руки', description: 'Толщина и длина рук', keys: ['armThickness', 'armLength'] },
  { id: 'legs', title: 'Ноги', description: 'Бёдра, голени, длина и постановка ног', keys: ['thighThickness', 'calfThickness', 'legLength', 'legGap'] },
  { id: 'head', title: 'Голова', description: 'Масштаб головы', keys: ['headScale'] },
];
const labelByKey = new Map(BODY_MORPH_FIELDS.map(([key, label]) => [key, label]));
const clamp = (n) => Math.max(-1, Math.min(1, n));

const STYLE = `
#mw-appearance-editor{--mw-bg:#181b18;--mw-panel:#222722;--mw-panel-raised:#2b312b;--mw-line:#465047;--mw-text:#e4e9df;--mw-muted:#aeb9aa;--mw-accent:#8ea77b;--mw-accent-strong:#c6dcae;position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:clamp(10px,2vw,28px);background:rgba(7,9,7,.82);color:var(--mw-text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
#mw-appearance-editor *{box-sizing:border-box}
#mw-appearance-editor button,#mw-appearance-editor input{font:inherit}
#mw-appearance-editor .mw-editor-shell{width:min(1440px,100%);height:min(940px,94vh);min-height:480px;display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;background:var(--mw-bg);border:2px solid #53644f;outline:1px solid #303a30;box-shadow:0 0 0 4px #100f0b,0 24px 80px #000d}
#mw-appearance-editor .mw-topbar{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px 22px;border-bottom:1px solid var(--mw-line);background:linear-gradient(#303831,#252b25 55%,#1f241f)}
#mw-appearance-editor .mw-brand{display:flex;align-items:center;gap:13px;min-width:0}
#mw-appearance-editor .mw-mark{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border:1px solid #586854;border-radius:0;color:var(--mw-accent-strong);font-size:24px;background:#1a2019;box-shadow:inset 0 0 0 3px #303a2d}
#mw-appearance-editor .mw-title{font-size:18px;font-weight:750;letter-spacing:.01em}
#mw-appearance-editor .mw-subtitle{margin-top:2px;color:var(--mw-muted);font-size:12px}
#mw-appearance-editor .mw-top-actions{display:flex;align-items:center;gap:12px}
#mw-appearance-editor .mw-state{display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border:1px solid #475342;border-radius:999px;color:#c7d3b9;background:#293126;font-size:11px;white-space:nowrap}
#mw-appearance-editor .mw-state:before{content:"";width:6px;height:6px;border-radius:50%;background:#a8c58a;box-shadow:0 0 8px #a8c58a66}
#mw-appearance-editor .mw-main{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(360px,.82fr);min-height:0}
#mw-appearance-editor .mw-preview-side{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr) auto;min-height:0;padding:18px;background:radial-gradient(ellipse at 50% 38%,#30392f 0,#222921 42%,#171b17 78%)}
#mw-appearance-editor .mw-preview-head{display:flex;justify-content:space-between;align-items:start;gap:12px;padding:0 4px 10px}
#mw-appearance-editor .mw-section-title{font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#e3dfd1}
#mw-appearance-editor .mw-section-note{font-size:12px;color:var(--mw-muted);margin-top:3px}
#mw-appearance-editor .mw-canvas-wrap{position:relative;min-height:0;overflow:hidden;border:1px solid #4c584b;border-radius:0;background:radial-gradient(ellipse at 50% 40%,#3a4437 0,#252d25 46%,#171b17 82%)}
#mw-appearance-editor canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab}
#mw-appearance-editor canvas:active{cursor:grabbing}
#mw-appearance-editor .mw-preview-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 2px 0}
#mw-appearance-editor .mw-tool-group{display:flex;align-items:center;gap:6px}
#mw-appearance-editor .mw-zoom-value{min-width:48px;text-align:center;color:#d9e3d3;font-size:12px;font-variant-numeric:tabular-nums}
#mw-appearance-editor .mw-hint{max-width:50%;text-align:right;color:var(--mw-muted);font-size:11px}
#mw-appearance-editor .mw-controls{display:flex;flex-direction:column;min-height:0;overflow:hidden;border-left:1px solid var(--mw-line);background:#1b201b}
#mw-appearance-editor .mw-controls-head{padding:20px 22px 15px;border-bottom:1px solid var(--mw-line)}
#mw-appearance-editor .mw-controls-head h2{font-size:20px;line-height:1.2;margin:0;font-weight:750}
#mw-appearance-editor .mw-controls-head p{font-size:12px;color:var(--mw-muted);margin:7px 0 0}
#mw-appearance-editor .mw-control-list{min-height:0;overflow:auto;padding:15px 18px 20px;scrollbar-color:#59604f transparent;scrollbar-width:thin}#mw-appearance-editor .mw-zone-nav{display:flex;flex-wrap:wrap;gap:5px;padding:10px 14px;border-bottom:1px solid #394239;background:#202620}#mw-appearance-editor .mw-zone-btn{min-height:29px;padding:5px 8px;font-size:11px;font-weight:600;color:#c6d2c1;background:#252d25;border-color:#3f4c3e}#mw-appearance-editor .mw-zone-btn.active{background:#52664a;color:#f1f7eb;border-color:#9ab48a;box-shadow:inset 0 -2px #c5dcb5}#mw-appearance-editor .mw-group[hidden]{display:none}#mw-appearance-editor .mw-underwear{display:flex;align-items:center;gap:10px;margin-top:12px;padding:10px 12px;border:1px solid #465047;background:#202620;color:#dfe7dc;font-size:12px}#mw-appearance-editor .mw-underwear input{width:16px;height:16px;accent-color:#8ea77b}#mw-appearance-editor .mw-underwear small{display:block;color:#aeb9aa;font-size:11px;margin-top:2px}
#mw-appearance-editor .mw-group{margin:0 0 12px;padding:0;border:1px solid var(--mw-line);border-radius:0;background:#252c25;overflow:hidden}
#mw-appearance-editor .mw-group-head{padding:11px 13px;border-bottom:1px solid #363d32;background:#2c342c}
#mw-appearance-editor .mw-group-title{font-size:13px;font-weight:700;color:#dce6d6}
#mw-appearance-editor .mw-group-note{margin-top:2px;font-size:11px;color:var(--mw-muted)}
#mw-appearance-editor .mw-group-fields{padding:6px 13px 9px}
#mw-appearance-editor .mw-slider-row{display:grid;grid-template-columns:minmax(105px,1fr) minmax(80px,1.25fr) 42px;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #34392f}
#mw-appearance-editor .mw-slider-row:last-child{border-bottom:0}
#mw-appearance-editor .mw-slider-label{font-size:12px;color:#e2e2d8}
#mw-appearance-editor input[type=range]{appearance:none;width:100%;margin:0;cursor:pointer;height:7px;border:1px solid #4d5b4b;background:linear-gradient(90deg,#8ea77b 0%,#8ea77b var(--range-fill,50%),#303830 var(--range-fill,50%),#303830 100%);outline:none}#mw-appearance-editor input[type=range]::-webkit-slider-thumb{appearance:none;width:12px;height:17px;border:1px solid #c8d9bc;background:linear-gradient(#d3e3c8,#7f9a6b);box-shadow:0 1px 3px #0008}#mw-appearance-editor input[type=range]::-moz-range-thumb{width:12px;height:17px;border:1px solid #c8d9bc;border-radius:0;background:linear-gradient(#d3e3c8,#7f9a6b);box-shadow:0 1px 3px #0008}
#mw-appearance-editor output{color:var(--mw-accent-strong);font-size:11px;text-align:right;font-variant-numeric:tabular-nums}
#mw-appearance-editor .mw-footer{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 18px;border-top:1px solid var(--mw-line);background:#1a201a}
#mw-appearance-editor .mw-footer-note{color:var(--mw-muted);font-size:11px}
#mw-appearance-editor .mw-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:34px;padding:7px 11px;border:1px solid #4c594a;border-radius:0;background:linear-gradient(#333c33,#252d25);color:#dfe7dc;font-size:12px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
#mw-appearance-editor .mw-btn:hover{background:#3a4839;border-color:#8ea77b}
#mw-appearance-editor .mw-btn:active{transform:translateY(1px)}
#mw-appearance-editor .mw-btn-primary{border-color:#a6c392;background:linear-gradient(#c4d9b4,#78986a);color:#172017}
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
  previewHead.innerHTML = '<div><div class="mw-section-title">Предпросмотр модели</div><div class="mw-section-note">Вращайте модель; щёлкните по области тела для выбора параметров</div></div>';
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
  controlsHead.innerHTML = '<h2>Пропорции тела</h2><p>Изменения видны в предпросмотре сразу после движения ползунка.</p>';
  const underwearRow = document.createElement('label'); underwearRow.className = 'mw-underwear';
  const underwearToggle = document.createElement('input'); underwearToggle.type = 'checkbox'; underwearToggle.checked = getUnderwearEnabled();
  const underwearCopy = document.createElement('span'); underwearCopy.innerHTML = '<strong>Нижнее бельё</strong><small>Выключено — голая модель; включено — вариант тела с бельём.</small>';
  underwearRow.append(underwearToggle, underwearCopy); controlsHead.append(underwearRow);
  underwearToggle.addEventListener('change', async () => {
    const enabled = setUnderwearEnabled(underwearToggle.checked);
    statusMessage.style.display = 'block'; statusMessage.textContent = 'Пересборка модели…';
    try {
      if (typeof fpArm?.setUnderwearEnabled === 'function') await fpArm.setUnderwearEnabled(enabled);
      previewRig?.unload?.(); previewRig = null; previewError = '';
      await buildPreviewRig();
    } catch (error) { previewError = String(error?.message || error); }
    drawPreview();
  });
  const zoneNav = document.createElement('nav'); zoneNav.className = 'mw-zone-nav'; zoneNav.setAttribute('aria-label', 'Выбор группы частей тела');
  const controlList = document.createElement('div'); controlList.className = 'mw-control-list';
  const inputs = new Map();
  const outputs = new Map();
  const initial = getBodyMorphs();
  let activeZone = 'all';
  const zoneButtons = new Map();
  for (const zone of GROUPS) {
    const button = makeButton(zone.id === 'all' ? 'Все параметры' : zone.title);
    button.classList.add('mw-zone-btn');
    button.classList.toggle('active', zone.id === activeZone);
    button.setAttribute('aria-pressed', zone.id === activeZone ? 'true' : 'false');
    button.addEventListener('click', () => {
      activeZone = zone.id;
      for (const [id, item] of zoneButtons) {
        item.classList.toggle('active', id === activeZone);
        item.setAttribute('aria-pressed', id === activeZone ? 'true' : 'false');
      }
      for (const item of controlList.querySelectorAll('.mw-group')) item.hidden = activeZone === 'all' ? item.dataset.zone !== 'all' : item.dataset.zone !== activeZone;
    });
    zoneButtons.set(zone.id, button); zoneNav.append(button);
  }

  for (const groupInfo of GROUPS) {
    const group = document.createElement('section'); group.className = 'mw-group'; group.dataset.zone = groupInfo.id; group.hidden = groupInfo.id !== 'all';
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
      input.style.setProperty('--range-fill', (((Number(input.value) + 1) / 2) * 100) + '%');
      input.setAttribute('aria-label', name.textContent);
      const output = document.createElement('output'); output.textContent = formatValue(Number(input.value));
      input.addEventListener('input', () => {
        const value = clamp(Number(input.value));
        setBodyMorph(key, value);
        output.textContent = formatValue(value);
        input.style.setProperty('--range-fill', (((value + 1) / 2) * 100) + '%');
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
      input.style.setProperty('--range-fill', (((Number(input.value) + 1) / 2) * 100) + '%');
    }
    window.dispatchEvent(new CustomEvent('mw-body-morph-change', { detail: state }));
    drawPreview();
  });
  const done = makeButton('Готово', true, 'mw-btn-primary'); done.addEventListener('click', close);
  footerActions.append(reset, done); footer.append(footerNote, footerActions);

  previewSide.append(previewHead, canvasWrap, previewTools);
  controls.append(controlsHead, zoneNav, controlList, footer);
  main.append(previewSide, controls);
  shell.append(topbar, main); root.append(shell);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  const keydown = (e) => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', keydown);
  document.body.append(root);
  drawPreview();
  void buildPreviewRig();

  let drag = null;
  let suppressPreviewClick = false;
  preview.addEventListener('pointerdown', (e) => {
    suppressPreviewClick = false;
    drag = { x: e.clientX, y: e.clientY, yaw };
    preview.setPointerCapture?.(e.pointerId);
    preview.style.cursor = 'grabbing';
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 4 || Math.abs(e.clientY - drag.y) > 4) suppressPreviewClick = true;
    yaw = drag.yaw + (e.clientX - drag.x) * 0.018;
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; drawPreview(); });
  });
  const release = () => { drag = null; preview.style.cursor = 'grab'; };
  preview.addEventListener('pointerup', release);
  preview.addEventListener('pointercancel', release);
  preview.addEventListener('click', (e) => {
    if (suppressPreviewClick) { suppressPreviewClick = false; return; }
    const rect = preview.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    const y = (e.clientY - rect.top) / Math.max(1, rect.height);
    let zone = 'legs';
    if (y < 0.19) zone = 'head';
    else if (x < 0.29 || x > 0.71) zone = y < 0.68 ? 'arms' : 'legs';
    else if (y < 0.40) zone = 'chest';
    else if (y < 0.53) zone = 'torso';
    else if (y < 0.66) zone = 'hips';
    zoneButtons.get(zone)?.click();
  });

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
