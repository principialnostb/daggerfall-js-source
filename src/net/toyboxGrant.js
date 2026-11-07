// @ts-check
// THE TOYBOX'S GRANT, AS THE GAME ASKS IT. Online, the account service mints the piece from the window's spec and sends
// it as a piece of the server's post (server-account/src/devToybox.js); a grant to the developer's own account is then
// claimed at once through the mailbox's own claim (net/serverPost.js PostBox.claim), which moves the record under this
// tab's lease and puts the piece in the pack. Offline, the piece is made here and goes straight into the pack, its
// special effects as made even where the law refuses them online; a grant to another account needs the service, so
// offline refuses it.
import { call } from './accountClient.js';
import { buildToyboxItem } from '../systems/toybox/toyboxItem.js';

/** The route (server-account/src/devToybox.js DEV_GRANT_PATH). */
export const TOYBOX_GRANT_PATH = '/v1/dev/item/grant';

/** The service's answer: `{ ok, data: { ok, post, item, to, playing } }` or `{ ok: false, error }`. @param {any} client @param {{ spec: any, to?: string|null }} body */
export const toyboxGrantCall = (client, { spec, to = null }) => call(client, TOYBOX_GRANT_PATH, { spec, to: to || null });

/** The player's words for a refusal. @param {string} error */
export function toyboxGrantText(error) {
  switch (error) {
    case 'not-developer':
      return 'Only a developer may grant items.';
    case 'no-player':
      return 'No account has that name.';
    case 'dev-target-guest':
      return 'A guest account has no mailbox. Grant it to a registered account.';
    case 'toybox-unlawful':
      return 'The item law refuses this piece.';
    case 'toybox-offline-target':
      return 'Granting to another account needs the server.';
    case 'offline':
      return 'The server did not answer.';
    case 'claim':
      return 'Sent to your mailbox. Claim it from there.';
    default:
      return `The grant was refused (${error}).`;
  }
}

/**
 * ONE GRANT: `target` null for the developer's own pack, else an account's handle. Online, `io` is the game's session
 * (the shape accountClient.js call takes) and `claim(postId)` claims a grant to oneself (the lead wires the mailbox's).
 * Offline, `addToPack(item)` takes the piece. Answers `{ ok, item?, sent?, error? }` - `sent` true when the piece waits
 * in another account's post.
 * @param {{ spec: any, target: string|null, online: boolean, io?: any, addToPack?: (item: any) => void,
 *   claim?: (postId: string) => Promise<{ ok: boolean, item?: any, error?: string }>, call?: typeof toyboxGrantCall }} o
 */
export async function toyboxGrant({ spec, target, online, io: client = null, addToPack, claim, call: ask = toyboxGrantCall }) {
  const to = typeof target === 'string' && target.trim() ? target.trim() : null;
  if (!online) {
    if (to) return { ok: false, error: 'toybox-offline-target' };
    const made = buildToyboxItem(spec);
    if (!('item' in made)) return { ok: false, error: made.error };
    if (made.baseFindings.length) return { ok: false, error: 'toybox-unlawful', findings: made.baseFindings };
    if (!addToPack) return { ok: false, error: 'no-pack' };
    addToPack(made.item);
    return { ok: true, item: made.item };
  }
  if (!client) return { ok: false, error: 'offline' };
  const answer = await ask(client, { spec, to });
  if (!answer?.ok) return { ok: false, error: answer?.error ?? 'server' };
  const data = answer.data ?? {};
  if (!data.to?.self) return { ok: true, item: data.item, sent: true };
  if (!claim) return { ok: false, error: 'claim', item: data.item };
  const claimed = await claim(data.post);
  return claimed?.ok ? { ok: true, item: claimed.item ?? data.item } : { ok: false, error: 'claim', item: data.item };
}
