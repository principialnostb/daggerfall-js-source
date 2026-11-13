import { holdCursor, requestLook, setCursorActive } from '../player/pointerLock.js';
import { isTextEntryTarget } from './input.js';

export function bindDungeonPropPanel(active, groups, spawn, canvas) {
  if (typeof document === 'undefined') return null;
  let panel = null, form = null, output = null, release = null;
  const cameraHint = document.createElement('div');
  cameraHint.style.cssText = 'position:fixed;right:1.5rem;bottom:1.5rem;z-index:1000;pointer-events:none;background:#221b14;color:#f3dfb6;border:1px solid #927446;padding:.6rem .85rem;';
  const cameraSelection = document.createElement('strong');
  const cameraStatus = document.createElement('output');
  cameraStatus.setAttribute('aria-live', 'polite');
  cameraHint.append(cameraSelection, document.createElement('br'),
    '` / ё — список · Alt+Shift+Enter — поставить один', document.createElement('br'), cameraStatus);

  function close() {
    panel?.close();
    panel?.remove();
    cameraHint.remove();
    release?.();
    release = null;
  }

  function place(status) {
    if (!form.checkValidity()) {
      status.textContent = 'Проверьте дистанцию и подъём в списке.';
      return;
    }
    const values = new window.FormData(form);
    status.textContent = spawn([values.get('prop'), values.get('distance'), values.get('lift')],
      message => { status.textContent = message; });
  }

  function lookAround(label = form.querySelector('[name=prop]').selectedOptions[0]?.textContent ?? '') {
    close();
    cameraSelection.textContent = label;
    cameraStatus.textContent = '';
    document.body.append(cameraHint);
    if (canvas) {
      setCursorActive(false);
      requestLook(canvas);
    }
  }

  function makePanel() {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Спавнер декора');
    dialog.style.cssText = 'margin:auto 1.5rem 1.5rem auto;color:#f3dfb6;background:#221b14;border:1px solid #927446;padding:1rem;width:min(26rem,90vw);max-height:85vh;font:inherit;color-scheme:dark;';
    dialog.innerHTML = `
      <form style="display:grid;gap:.65rem">
        <strong>Спавнер декора</strong>
        <label>Раздел <select name="section" style="display:block;width:100%"></select></label>
        <label data-review-page hidden>Часть раздела <select name="reviewPage"></select></label>
        <button type="button" data-set>Расставить весь раздел</button>
        <label>Объект <select name="prop" style="display:block;width:100%"></select></label>
        <div style="display:flex;gap:.75rem;flex-wrap:wrap">
          <label>Дистанция <input name="distance" type="number" min="1" max="12" step=".1" value="3" style="width:4rem"></label>
          <label>Подъём <input name="lift" type="number" min="0" max="6" step=".05" value="0" style="width:4rem"></label>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button type="submit">Поставить</button>
          <button type="button" data-camera>Камера</button>
          <button type="button" data-clear>Убрать тестовые</button>
          <button type="button" data-close>Закрыть</button>
        </div>
        <output aria-live="polite"></output>
      </form>`;
    form = dialog.querySelector('form');
    const section = dialog.querySelector('[name=section]');
    const select = dialog.querySelector('[name=prop]');
    const reviewPage = dialog.querySelector('[name=reviewPage]');
    const reviewLabel = dialog.querySelector('[data-review-page]');
    const setButton = dialog.querySelector('[data-set]');
    output = dialog.querySelector('output');
    for (const [name, entries] of groups) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name + ' · ' + entries.length;
      section.append(option);
    }
    const selections = new Map();
    function showSection() {
      const entries = groups.find(([name]) => name === section.value)[1];
      const review = entries.length > 8 && entries.every(([id]) => id.startsWith('arch3d:'));
      reviewLabel.hidden = !review;
      setButton.textContent = review ? 'Расставить выбранную часть' : 'Расставить весь раздел';
      reviewPage.replaceChildren();
      if (review) for (let start = 0; start < entries.length; start += 8) {
        const option = document.createElement('option');
        option.value = start / 8;
        option.textContent = entries[start][0].slice(7) + '–' + entries[Math.min(start + 7, entries.length - 1)][0].slice(7);
        reviewPage.append(option);
      }
      select.replaceChildren();
      for (const [id, label] of entries) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = label + ' · ' + id;
        select.append(option);
      }
      select.value = selections.get(section.value) ?? entries[0][0];
    }
    section.addEventListener('change', showSection);
    select.addEventListener('change', () => selections.set(section.value, select.value));
    showSection();
    form.addEventListener('submit', event => {
      event.preventDefault();
      place(output);
    });
    setButton.addEventListener('click', () => {
      if (!form.reportValidity()) return;
      const values = new window.FormData(form);
      lookAround(section.value);
      cameraStatus.textContent = spawn(['set', section.value, values.get('distance'), values.get('lift'), values.get('reviewPage') ?? 0],
        message => { cameraStatus.textContent = message; output.textContent = message; });
    });
    dialog.querySelector('[data-camera]').addEventListener('click', () => lookAround());
    dialog.querySelector('[data-clear]').addEventListener('click', () => { output.textContent = spawn(['clear']); });
    dialog.querySelector('[data-close]').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); close(); });
    dialog.addEventListener('keydown', event => {
      if (event.code === 'Escape') { event.preventDefault(); close(); }
      event.stopPropagation();
    });
    return dialog;
  }

  function toggle(event) {
    if (event.repeat || !active()) return;
    const quickPlace = event.altKey && event.shiftKey && event.code === 'Enter' && cameraHint.isConnected;
    const togglePanel = !event.ctrlKey && !event.metaKey && !event.altKey &&
      (event.code === 'Backquote' || event.key === 'ё' || event.key === 'Ё');
    if (!togglePanel && !quickPlace) return;
    if (!panel?.open && isTextEntryTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (quickPlace) {
      place(cameraStatus);
      return;
    }
    if (panel?.open) {
      lookAround();
      return;
    }
    cameraHint.remove();
    panel ??= makePanel();
    release = holdCursor();
    document.body.append(panel);
    panel.showModal();
  }
  window.addEventListener('keydown', toggle, true);
  return () => {
    window.removeEventListener('keydown', toggle, true);
    close();
  };
}
