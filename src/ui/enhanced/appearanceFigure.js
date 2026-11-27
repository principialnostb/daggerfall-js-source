import { animatedCloaksEnabled } from '../../systems/extraAppearance.js';
import { paintPreview } from './previewPixelation.js';
// A view of the live equipped rig. Subscriptions and the floating panel belong
// to the open 3D tab; closing the card or changing tabs releases both.
export function appearanceFigure(rig, anchor, { back = false } = {}) {
  if (!rig?.figure || !globalThis.document?.body) return { start() {}, stop() {}, pending() {} };
  const make = (tag, cls, text = '') => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const panel = make('aside', 'pack-shell appearance-fitting');
  panel.setAttribute('aria-label', '3D-примерка');
  const title = make('div', 'fitting-title', '3D-примерка');
  const canvas = make('canvas', 'fitting-canvas');
  canvas.setAttribute('aria-label', 'Персонаж в выбранной одежде. Потяните, чтобы повернуть.');
  const status = make('div', 'fitting-status', ''); status.setAttribute('role', 'status');
  const controls = make('div', 'fitting-controls');
  let yaw = back ? Math.PI : 0, active = false, frame = 0, unsubscribe = null, observer = null, resize = null, layoutFrame = 0, animationFrame = 0, lastAnimation = 0, down = null;
  const position = () => {
    const box = (anchor.closest('.packtip') ?? anchor).getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 16), height = Math.min(600, window.innerHeight - 16);
    const preferred = box.right - 1 + width <= window.innerWidth - 8 ? box.right - 1 : box.left - width + 1;
    panel.style.left = `${Math.max(8, Math.min(preferred, window.innerWidth - width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(box.top, window.innerHeight - height - 8))}px`;
    panel.style.width = `${width}px`; panel.style.height = `${height}px`;
  };
  const paint = () => {
    frame = 0;
    if (!active) return;
    if (!anchor.isConnected) { stop(); return; }
    position();
    let pixels = null;
    try { pixels = rig.figure({ yaw, height: 640, force: true, neutral: true, stableFrame: true }); } catch { /* a rebuild can temporarily have no rig */ }
    if (!pixels?.data) { status.textContent = 'Модель загружается…'; canvas.hidden = true; return; }
    canvas.hidden = false;
    paintPreview(canvas, pixels, canvas.clientHeight || 510);
    canvas.hidden = false; status.textContent = '';
  };
  const refresh = () => { if (active && !frame) frame = requestAnimationFrame(paint); };
  const layout = () => {
    if (!active || layoutFrame) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      if (!anchor.isConnected) { stop(); return; }
      position();
    });
  };
  const animate = (time) => {
    animationFrame = 0;
    if (!active || !animatedCloaksEnabled()) return;
    if (time - lastAnimation >= 1000 / 30) { lastAnimation = time; refresh(); }
    animationFrame = requestAnimationFrame(animate);
  };
  function stop() {
    active = false; down = null;
    if (animationFrame) cancelAnimationFrame(animationFrame); animationFrame = 0;
    if (frame) cancelAnimationFrame(frame);
    if (layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = 0; resize?.disconnect(); resize = null;
    frame = 0; unsubscribe?.(); unsubscribe = null; observer?.disconnect(); observer = null;
    window.removeEventListener('resize', layout); window.removeEventListener('scroll', layout, true);
    panel.remove();
  }
  function start() {
    if (active) return;
    active = true; document.body.append(panel);
    unsubscribe = rig.subscribe?.(refresh) ?? null;
    // The inventory positions its card on its own next frame. Mount after that
    // placement, then follow card style/size changes without another GPU read.
    panel.style.visibility = 'hidden';
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!active || !anchor.isConnected) { stop(); return; }
        const card = anchor.closest('.packtip') ?? anchor;
        observer = new globalThis.MutationObserver(layout);
        observer.observe(document.body, { childList: true, subtree: true });
        observer.observe(card, { attributes: true, attributeFilter: ['style', 'class'] });
        resize = new globalThis.ResizeObserver(layout); resize.observe(card);
        window.addEventListener('resize', layout); window.addEventListener('scroll', layout, true);
        paint(); panel.style.visibility = 'visible';
        if (animatedCloaksEnabled()) animationFrame = requestAnimationFrame(animate);
      });
    });
  }
  for (const [label, angle] of [['Спереди', 0], ['Сзади', Math.PI]]) {
    const button = make('button', 'act', label); button.type = 'button';
    button.onclick = () => { yaw = angle; refresh(); }; controls.append(button);
  }
  const close = make('button', 'act fitting-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Закрыть примерку'); close.onclick = stop;
  title.append(close);
  canvas.style.touchAction = 'none';
  canvas.onpointerdown = (event) => { down = { x: event.clientX, yaw }; canvas.setPointerCapture?.(event.pointerId); };
  canvas.onpointermove = (event) => { if (down) { yaw = down.yaw + (event.clientX - down.x) * .02; refresh(); } };
  canvas.onpointerup = canvas.onpointercancel = () => { down = null; };
  panel.append(title, canvas, status, controls);
  return { start, stop, pending() { if (active) { canvas.hidden = true; status.textContent = 'Обновление…'; } } };
}
