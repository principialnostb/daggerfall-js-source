// @ts-check
// The popup a realm act raises from the Online door: the screen greys out under "Contacting server..." while the act
// runs, with a Cancel button. On success it closes. On failure it says why, and an OK button closes it. It wears the decision box's kit
// (ui/enhanced/enhancedDialog.js), so it sits over the menu and takes every press while it stands.
import { realmContactingText, realmFailureText, realmOkText } from '../../systems/realmRetry.js';
import { realmRefusalText } from '../../systems/realmSaves.js';
import { localizedText } from '../../systems/textManager.js';

/** The act a Cancel ended, answered at once. */
export const REALM_CANCELLED = Object.freeze({ ok: false, error: 'cancelled' });

/**
 * Raise the popup over `doc`. `onCancel`: a Cancel button stands while it asks, and its press closes the popup and calls
 * it. `fail(text)` puts the words and an OK button up in its place and resolves once OK is pressed.
 * @param {Document} doc @param {{ onCancel?: (() => void) | null }} [at]
 */
export function openRealmContact(doc, { onCancel = null } = {}) {
  const shell = doc.createElement('div');
  shell.className = 'dlg-shell';
  const win = doc.createElement('section');
  win.className = 'dlg-win px-win';
  win.setAttribute('role', 'alertdialog');
  win.setAttribute('aria-modal', 'true');
  win.setAttribute('aria-live', 'polite');
  const body = doc.createElement('div');
  body.className = 'dlg-body';
  const line = doc.createElement('p');
  line.className = 'dlg-row center';
  line.textContent = realmContactingText();
  body.append(line);
  win.append(body);
  shell.append(win);
  // the menu under the popup hears none of its presses
  for (const type of ['pointerdown', 'click', 'keydown']) shell.addEventListener(type, (e) => { e.stopPropagation(); });
  doc.body.append(shell);
  const close = () => { shell.remove(); };
  /** One button in the popup's foot, in place of any before it. @param {string} label @param {boolean} primary @param {() => void} press */
  /** @type {HTMLElement | null} */
  let foot = null;
  const button = (label, primary, press) => {
    foot?.remove();
    const acts = doc.createElement('footer');
    foot = acts;
    acts.className = 'dlg-acts';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = primary ? 'dlg-btn primary' : 'dlg-btn';
    btn.textContent = label;
    btn.addEventListener('click', press);
    acts.append(btn);
    win.append(acts);
    btn.focus();
  };
  if (onCancel) button(localizedText('cancel', 'Cancel'), false, () => { close(); onCancel(); });
  /** @param {string} text @returns {Promise<void>} */
  const fail = (text) => new Promise((resolve) => {
    line.textContent = text;
    button(realmOkText(), true, () => { close(); resolve(); });
  });
  return { close, fail };
}

/** A popup that only says `text`, with OK to close it. Resolves once OK is pressed. @param {Document} doc @param {string} text */
export const showRealmMessage = (doc, text) => openRealmContact(doc).fail(text);

/**
 * Run `act` under the popup. Answers the act's own answer once the popup is gone: at once on success, after OK on a
 * failure, and REALM_CANCELLED at once on Cancel. A failure of the service says the servers have issues; a refusal
 * this device made keeps its own words. `act` is handed `cancelled()`: it asks it before it writes anything, since a
 * cancelled act's answer may still arrive.
 * @template {{ ok?: boolean, error?: string, status?: number }} R
 * @param {(at: { cancelled: () => boolean }) => Promise<R>} act @param {{ doc?: Document }} [at]
 * @returns {Promise<R | { ok: false, error: string }>}
 */
export async function withRealmContact(act, { doc = globalThis.document } = {}) {
  let cancelled = false;
  /** @type {(answer: { ok: false, error: string }) => void} */
  let cancel = () => {};
  const onCancel = new Promise((resolve) => { cancel = resolve; });
  const popup = openRealmContact(doc, { onCancel: () => { cancelled = true; cancel(REALM_CANCELLED); } });
  const running = Promise.resolve().then(() => act({ cancelled: () => cancelled })).catch(() => ({ ok: false, error: 'server' }));
  /** @type {R | { ok: false, error: string }} */
  const answer = await Promise.race([running, onCancel]);
  if (cancelled) return REALM_CANCELLED;
  if (answer?.ok !== false) { popup.close(); return answer; }
  await popup.fail(realmFailureText(answer) ?? realmRefusalText(answer.error ?? 'server'));
  return answer;
}
