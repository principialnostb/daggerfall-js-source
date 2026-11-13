// The account card's Discord row: link the account to the Discord PDA with a one-time code, or see it linked and
// unlink it. Drawn with the card's own element helpers, so it wears the card's look. A registered account only.
import { t } from '../../systems/textManager.js';

/** How often the card asks whether a live code was typed in Discord, ms. */
export const DISCORD_WATCH_MS = 8000;

/** Minutes left on a code, at least one while it lives. @param {number} expiresAt @param {number} nowMs */
export const codeMinutesLeft = (expiresAt, nowMs) => Math.max(0, Math.ceil((expiresAt * 1000 - nowMs) / 60000));

/**
 * The row, or null when the account cannot link (a guest, or a service before the PDA).
 * @param {{ flow: any, el: (tag: string, cls?: string, txt?: string) => any, act: (label: string, onclick: () => any, o?: any) => any, nowMs?: number }} o
 */
export function discordRow({ flow, el, act, nowMs = Date.now() }) {
  const d = flow.discord;
  if (!d || !d.canLink || !flow.account?.handle) return null;
  const box = el('div', 'acctwear acctdiscord');
  box.append(el('span', 'fieldlabel', t('account.discord.label', 'Discord')));
  const row = el('div', 'acctwearrow');
  if (d.linked) {
    row.append(el('span', 'acctdiscordstate', t('account.discord.linked', 'Linked as {name}', { name: d.name || '?' })));
    row.append(act(t('account.discord.unlink', 'Unlink'), () => flow.unlinkDiscord(), { disabled: !!flow.busy, key: 'discord:unlink' }));
    box.append(row);
    return box;
  }
  const code = flow.discordCode;
  const left = code ? codeMinutesLeft(code.expiresAt, nowMs) : 0;
  if (code && left > 0) {
    row.append(el('span', 'acctdiscordcode', code.code));
    row.append(act(t('account.discord.newCode', 'New code'), () => flow.askDiscordCode(), { disabled: !!flow.busy, key: 'discord:code' }));
    box.append(row);
    box.append(
      el(
        'p',
        'meta',
        t('account.discord.how', 'In Discord, open the DFO Courier, press Link account, and type this code. It lasts {n, plural, one {# more minute} other {# more minutes}}.', { n: left }),
      ),
    );
    return box;
  }
  row.append(act(t('account.discord.link', 'Link Discord'), () => flow.askDiscordCode(), { disabled: !!flow.busy, key: 'discord:code' }));
  box.append(row);
  box.append(el('p', 'meta', t('account.discord.why', 'Keep your journal in Discord: letters, guild, market, expeditions and polls.')));
  return box;
}
