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
  let yaw = 0, zoom = 1, frame = 0, retryTimer = 0, closed = false, selectedRace = 'DarkElf', selectedFemale = true, selectedFace = 0, selectedHair = 0;
  const root = document.createElement('div');
  root.id = 'mw-appearance-editor';
  root.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(8,8,12,.88);display:flex;align-items:center;justify-content:center;padding:18px;color:#eee;font:14px system-ui,sans-serif;';
  const panel = document.createElement('section');
  panel.style.cssText = 'width:min(1320px,98vw);height:min(900px,96vh);display:grid;grid-template-columns:minmax(320px,1.05fr) minmax(360px,1fr);background:#17171c;border:1px solid #777;border-radius:8px;box-shadow:0 18px 70px #000;overflow:hidden;';
  const previewSide = document.createElement('div');
  previewSide.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:18px;background:linear-gradient(#222229,#111115);min-height:0;';
  const heading = document.createElement('div');
  heading.innerHTML = '<div style="font-size:21px;font-weight:700;letter-spacing:.03em">Редактирование внешности</div><div style="color:#aaa;margin-top:6px">Зажми модель и вращай мышью</div>';
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
  previewHint.textContent = 'Настройки сохраняются автоматически. Ползунки изменяют геометрию модели игрока.';
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
  const identity = document.createElement('fieldset'); identity.style.cssText = 'border:1px solid #45454e;border-radius:6px;margin:0 0 14px;padding:10px 12px;';
  const raceLabel = document.createElement('label'); raceLabel.textContent = 'Раса ';
  const raceSelect = document.createElement('select'); raceSelect.style.cssText = 'margin:4px;padding:7px;background:#29292f;color:#eee;';
  const races = [['Breton','Бретон'],['Redguard','Редгард'],['Nord','Норд'],['DarkElf','Данмер'],['HighElf','Альтмер'],['WoodElf','Босмер'],['Khajiit','Каджит'],['Argonian','Аргониан']];
  for (const pair of races) { const option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; raceSelect.append(option); }
  raceSelect.value = selectedRace;
  const sexSelect = document.createElement('select'); sexSelect.style.cssText = raceSelect.style.cssText;
  for (const pair of [['female','Женский'],['male','Мужской']]) { const option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; sexSelect.append(option); }
  identity.append(raceLabel, raceSelect, sexSelect);
  const faceLabel = document.createElement('div'); faceLabel.textContent = 'Лицо'; faceLabel.style.cssText = 'margin:8px 0 4px;color:#e2c98c;'; identity.append(faceLabel);
  const faceGrid = document.createElement('div'); faceGrid.style.cssText = 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;'; identity.append(faceGrid);
  const hairLabel = document.createElement('div'); hairLabel.textContent = 'Причёска'; hairLabel.style.cssText = 'margin:10px 0 4px;color:#e2c98c;'; identity.append(hairLabel);
  const hairSelect = document.createElement('select'); hairSelect.style.cssText = raceSelect.style.cssText;
  for (const pair of [['0','Короткая'],['1','Длинная'],['2','Собранная'],['3','Распущенная'],['4','Косы'],['5','Без волос']]) { const option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; hairSelect.append(option); }
  identity.append(hairSelect); controls.append(identity);
  const refreshFaces = async () => {
    faceGrid.replaceChildren();
    for (let i = 0; i < 10; i++) { const b = makeButton('Лицо ' + (i+1)); b.style.cssText += 'padding:2px;min-height:48px;'; b.addEventListener('click', () => { selectedFace=i; [...faceGrid.children].forEach((x,j)=>x.style.borderColor=j===i?'#d3b36a':'#666'); window.dispatchEvent(new CustomEvent('mw-appearance-identity-change',{detail:{race:selectedRace,female:selectedFemale,faceIndex:selectedFace,hairIndex:selectedHair}})); }); faceGrid.append(b); }
    try { const { loadFaceCanvases } = await import('./facePortrait.js'); const faces = await loadFaceCanvases(selectedRace, selectedFemale?'female':'male',{scale:2}); [...faceGrid.children].forEach((b,i)=>{ if(faces[i]) { b.textContent=''; const c=document.createElement('canvas'); c.width=56;c.height=64;c.style.cssText='width:100%;height:100%;';c.getContext('2d')?.drawImage(faces[i],0,0,56,64);b.append(c); } }); } catch {}
  };
  const updateIdentity = () => { selectedRace=raceSelect.value; selectedFemale=sexSelect.value==='female'; selectedFace=0; selectedHair=Number(hairSelect.value)||0; window.dispatchEvent(new CustomEvent('mw-appearance-identity-change',{detail:{race:selectedRace,female:selectedFemale,faceIndex:selectedFace,hairIndex:selectedHair}})); refreshFaces(); drawPreview(); };
  raceSelect.addEventListener('change', updateIdentity); sexSelect.addEventListener('change', updateIdentity); hairSelect.addEventListener('change', updateIdentity); refreshFaces();
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
    renderProceduralPreview(preview, { yaw, zoom, morphs: getBodyMorphs(), female: selectedFemale, hairIndex: selectedHair, race: selectedRace });
    previewHint.textContent = 'Независимая процедурная модель: ползунки меняют её пропорции сразу; игровой риг не используется.';
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

// Editor-owned preview geometry. This intentionally does not call fpArm.figure() or read a gameplay screenshot.
function renderProceduralPreview(canvas, state) {
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const w = canvas.width, h = canvas.height, m = state.morphs;
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, unit = Math.min(w * .38, h * .38) * state.zoom;
  const side = Math.sin(state.yaw), front = Math.cos(state.yaw);
  const oval = (x,y,rx,ry,color) => { ctx.fillStyle=color; ctx.beginPath(); ctx.ellipse(cx+x*unit,h*.52+y*unit,Math.max(1,rx*unit),Math.max(1,ry*unit),0,0,Math.PI*2); ctx.fill(); };
  const line = (x1,y1,x2,y2,r,color) => { ctx.strokeStyle=color; ctx.lineCap='round'; ctx.lineWidth=Math.max(2,r*unit*2); ctx.beginPath(); ctx.moveTo(cx+x1*unit,h*.52+y1*unit); ctx.lineTo(cx+x2*unit,h*.52+y2*unit); ctx.stroke(); };
  const tones = { Breton:'#c99578', Redguard:'#8a563a', Nord:'#dfb18c', DarkElf:'#8b6b82', HighElf:'#d9b47d', WoodElf:'#b9a77a', Khajiit:'#b78c62', Argonian:'#6d9a79' }; const skin = tones[state.race] || '#c89a7b';
  const shoulder = (.22 + (m.shoulderWidth||0)*.055) * Math.max(.18,Math.abs(front));
  const torso = (.19 + (m.torsoScale||0)*.045) * Math.max(.18,Math.abs(front));
  const hips = (.17 + (m.hipWidth||0)*.045) * Math.max(.18,Math.abs(front));
  const waist = (.14 + (m.waistWidth||0)*.04) * Math.max(.18,Math.abs(front));
  const arms = .045 + (m.armScale||0)*.016, legs = .055 + (m.legScale||0)*.018;
  ctx.fillStyle='rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(cx,h*.91,unit*.42,unit*.07,0,0,Math.PI*2); ctx.fill();
  ctx.save(); ctx.translate(0,h*.52); ctx.scale(1,1+(m.height||0)*.12); ctx.translate(0,-h*.52);
  line(-shoulder,-.19,-shoulder*1.45,.04,arms,skin); line(-shoulder*1.45,.04,-shoulder*1.3,.28,arms*.8,skin);
  line(shoulder,-.19,shoulder*1.45,.04,arms,skin); line(shoulder*1.45,.04,shoulder*1.3,.28,arms*.8,skin);
  line(-hips*.6,0,-hips*.7,.28,legs,skin); line(-hips*.7,.28,-hips*.72,.58,legs*.8,skin);
  line(hips*.6,0,hips*.7,.28,legs,skin); line(hips*.7,.28,hips*.72,.58,legs*.8,skin);
  oval(0,-.01,hips,.15,skin); oval(0,-.14,waist,.16,skin); oval(0,-.29,torso,.22,skin); oval(0,-.37,shoulder,.1,skin); oval(0,-.45,.055,.08,skin);
  const headY=-.56-(m.headScale||0)*.02, head=.095+(m.headScale||0)*.015;
  oval(side*.015,headY,head*(1+Math.abs(side)*.12),head*1.2,skin);
  if (front > -.2) { oval(side*.02+.03*front,headY+.01,.016,.023,skin); oval(-.03,headY-.012,.009,.006,'#30242a'); oval(.03,headY-.012,.009,.006,'#30242a'); oval(0,headY+.04,.018,.004,'#50302b'); }
  const hair=['#30221c','#39271f','#443027','#4b3328','#50352c','#aaa39a'][Math.max(0,Math.min(5,state.hairIndex||0))];
  if ((state.hairIndex||0)!==5) { oval(0,headY-.055,head*1.12,head*.45,hair); if ([1,3,4].includes(state.hairIndex||0)) { line(-.07,headY-.04,-.09,headY+.12,.025,hair); line(.07,headY-.04,.09,headY+.12,.025,hair); } }
  if (state.female) { oval(-.085,-.27,.07*(1+(m.breastSize||0)*.4),.065,skin); oval(.085,-.27,.07*(1+(m.breastSize||0)*.4),.065,skin); }
  if (state.race === 'Khajiit') { oval(-.045,headY-.06,.025,.04,skin); oval(.045,headY-.06,.025,.04,skin); }
  if (state.race === 'Argonian') { oval(-.06,headY-.03,.012,.025,'#527c63'); oval(.06,headY-.03,.012,.025,'#527c63'); }
  oval(0,-.01,.17*(1+(m.buttockSize||0)*.3),.1,skin);
  ctx.restore();
  ctx.fillStyle='#eee'; ctx.font='600 18px system-ui'; ctx.textAlign='center'; ctx.fillText('ПРЕДПРОСМОТР ТЕЛА',cx,30);
  ctx.fillStyle='#aaa'; ctx.font='12px system-ui'; ctx.fillText('НЕЗАВИСИМАЯ МОДЕЛЬ · БЕЗ ОДЕЖДЫ',cx,h-18);
}

function makeButton(text, primary = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = text;
  button.style.cssText = 'padding:9px 14px;border:1px solid ' + (primary ? '#d3b36a' : '#666') + ';border-radius:4px;background:' + (primary ? '#b79a58' : '#29292f') + ';color:' + (primary ? '#171717' : '#eee') + ';font-weight:650;cursor:pointer;';
  return button;
}
