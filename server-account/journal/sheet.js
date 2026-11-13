// @ts-check
// A form, as a sheet of letter paper laid over the book: each field a ruled line or a box of lines to write on, a menu
// a short ledger to tick, and the sheet sealed with wax to send it. Escape, or a click on the desk, puts it aside.
import { escapeHtml } from './md.js';
import { C } from './render.js';

/**
 * Lay a form on the desk. Resolves with its fields when sealed, or null when put aside.
 * @param {HTMLElement} host @param {any} form the bot's modal: `{ custom_id, title, components }`
 * @returns {Promise<Record<string, string> | null>}
 */
export function openSheet(host, form) {
  return new Promise((resolve) => {
    const opener = /** @type {HTMLElement | null} */ (document.activeElement);
    let sealed = false;
    const veil = document.createElement('div');
    veil.className = 'sheet-veil';
    const sheet = document.createElement('form');
    sheet.className = 'sheet';
    sheet.noValidate = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'sheet-title');
    sheet.innerHTML = `<h2 class="sheet-title" id="sheet-title">${escapeHtml(form?.title ?? '')}</h2>`;
    /** @type {Array<{ id: string, read: () => string, required: boolean, min: number, max: number, field: HTMLElement }>} */
    const fields = [];
    let unsupported = false;
    for (const lab of form?.components ?? []) {
      const inner = lab?.type === C.LABEL ? lab.component : lab?.components?.[0];
      if (!inner) continue;
      // a box of words is labelled by its title; a set of choices is a group, so its title never picks one
      const wrap = document.createElement(inner.type === C.TEXT_INPUT ? 'label' : 'div');
      wrap.className = 'sheet-field';
      if (inner.type !== C.TEXT_INPUT) {
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', String(lab.label ?? inner.label ?? ''));
      }
      wrap.innerHTML = `<span class="sheet-label">${escapeHtml(lab.label ?? inner.label ?? '')}</span>${lab.description ? `<span class="sheet-hint">${escapeHtml(lab.description)}</span>` : ''}`;
      if (inner.type === C.TEXT_INPUT) {
        const long = inner.style === 2;
        const box = /** @type {HTMLInputElement | HTMLTextAreaElement} */ (document.createElement(long ? 'textarea' : 'input'));
        box.className = long ? 'sheet-lines' : 'sheet-line';
        if (!long) /** @type {HTMLInputElement} */ (box).type = 'text';
        box.maxLength = Number(inner.max_length ?? 4000);
        if (inner.placeholder) box.placeholder = String(inner.placeholder);
        if (inner.value) box.value = String(inner.value);
        box.autocomplete = 'off';
        box.spellcheck = true;
        wrap.append(box);
        fields.push({ id: inner.custom_id, read: () => box.value, required: inner.required !== false, min: Number(inner.min_length ?? 0), max: box.maxLength, field: box });
      } else if (inner.type === C.SELECT) {
        const list = document.createElement('div');
        list.className = 'sheet-choices';
        let chosen = String((inner.options ?? []).find((/** @type {any} */ o) => o.default)?.value ?? '');
        for (const o of inner.options ?? []) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `sheet-choice${String(o.value) === chosen ? ' picked' : ''}`;
          b.setAttribute('aria-pressed', String(String(o.value) === chosen));
          b.innerHTML = `<span class="tick" aria-hidden="true"></span>${escapeHtml(o.label)}${o.description ? `<small>${escapeHtml(o.description)}</small>` : ''}`;
          b.addEventListener('click', () => {
            chosen = String(o.value);
            for (const x of list.children) {
              x.classList.toggle('picked', x === b);
              x.setAttribute('aria-pressed', String(x === b));
            }
          });
          list.append(b);
        }
        wrap.append(list);
        fields.push({ id: inner.custom_id, read: () => chosen, required: inner.required !== false, min: 0, max: 100, field: list });
      } else {
        unsupported = true;
        wrap.append(Object.assign(document.createElement('p'), { className: 'margin', textContent: 'Fill in this part of the form in Discord.' }));
      }
      sheet.append(wrap);
    }
    const why = document.createElement('p');
    why.className = 'sheet-why';
    const foot = document.createElement('div');
    foot.className = 'sheet-foot';
    foot.innerHTML = '<button type="button" class="stamp ink-plain sheet-aside">Cancel</button><button type="submit" class="wax">Send</button>';
    sheet.append(why, foot);
    veil.append(sheet);
    host.append(veil);
    requestAnimationFrame(() => veil.classList.add('open'));
    /** @type {HTMLElement | null} */ (sheet.querySelector('input, textarea, button.sheet-choice'))?.focus();

    const done = (/** @type {Record<string, string> | null} */ v) => {
      veil.classList.remove('open');
      veil.classList.add('closing');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => veil.remove(), 320);
      opener?.focus?.();
      resolve(v);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (sealed) return;
      if (e.key === 'Escape') done(null);
      if (e.key === 'Tab') {
        // the sheet keeps the keys while it is open
        const stops = /** @type {HTMLElement[]} */ ([...sheet.querySelectorAll('input, textarea, button:not([disabled])')]);
        if (!stops.length) return;
        const i = stops.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          stops[stops.length - 1].focus();
        } else if (!e.shiftKey && i === stops.length - 1) {
          e.preventDefault();
          stops[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    veil.addEventListener('pointerdown', (e) => {
      if (e.target === veil && !sealed) done(null);
    });
    /** @type {HTMLElement} */ (sheet.querySelector('.sheet-aside')).addEventListener('click', () => done(null));
    sheet.addEventListener('submit', (e) => {
      e.preventDefault();
      if (unsupported) {
        why.textContent = 'Part of this form only works in Discord. Use Discord to send it.';
        return;
      }
      /** @type {Record<string, string>} */
      const out = {};
      for (const f of fields) {
        const v = f.read().trim();
        if (f.required && !v) {
          why.textContent = 'Fill in every field first.';
          f.field.focus?.();
          return;
        }
        if (v && v.length < f.min) {
          why.textContent = `This field needs at least ${f.min} characters.`;
          f.field.focus?.();
          return;
        }
        out[f.id] = v.slice(0, f.max);
      }
      sealed = true;
      sheet.classList.add('sealed');
      setTimeout(() => done(out), 380);
    });
  });
}
