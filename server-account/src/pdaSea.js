// @ts-check
// The Eltheric Ocean as a page of the journal in Discord's messages: the captain's ledger (the ship at sea, the fleet
// to sail from), the day's bounties and the log. The sea itself is sailed in the journal's Activity, whose chart,
// fights and isles need the hand; this page opens it where Discord will.
import { frame } from './pdaFrame.js';
import { text, button, STYLE, divider, md } from './pdaUi.js';
import { seaLedger } from './seaJournal.js';
import { stateOf } from './pdaTerminal.js';

const gauge = (/** @type {number} */ now, /** @type {number} */ max) => (max > 0 ? `${now}/${max}` : '-');

/** The ledger page. @param {any} who */
async function seaPage(who) {
  const st = await seaLedger(who.ctx, who);
  const on = (await stateOf(who.ctx.db, 'activity')) === '1';
  const open = on ? [button('Open the journal', 'open:activity', { style: STYLE.PRIMARY })] : [];
  const later = on ? '-# Open the journal to sail, fight and explore islands.' : '-# Sailing happens in the journal app inside Discord. It is not turned on yet.';
  if ('error' in st) return frame(who, 'sea', [text(st.error === 'no-character' ? 'Your account has no online character yet.' : 'Your ships could not load. Try again later.')], { actions: open });
  const c = st.captain;
  if (!c) {
    const ships = (st.fleet ?? []).map((/** @type {any} */ s) => `**${md(s.ship.name, 24)}** · ${s.ship.kind} · hull ${gauge(s.ship.now.hull, s.ship.max.hull)}, crew ${gauge(s.ship.now.crew, s.ship.max.crew)}, Carpenter’s Stores ${s.ship.stores}`);
    return frame(who, 'sea', [text(`### Your fleet\n${ships.length ? ships.join('\n') : 'You have no ship that can fight. A rowboat cannot sail out.'}\n**Seals:** ${st.seals ?? 0}`), text(later)], { actions: open });
  }
  const w = c.waters;
  const bounties = (st.bounties ?? []).map((/** @type {any} */ b) => `${b.paid ? '✓' : b.done ? '•' : '○'} ${b.words} (${b.have}/${b.count}, ${b.seals} Seals)`);
  const log = (st.log ?? []).slice(0, 8).map((/** @type {any} */ l) => `-# ${md(l.words, 160)}${l.seals ? ` (+${l.seals})` : ''}`);
  return frame(
    who,
    'sea',
    [
      text(`### ${md(c.ship.name, 24)}\n${c.ship.kind} · ${w.bandName}, ${w.leagues} leagues west of the Veil${w.peace ? ' · near Veilhaven' : ''}\nHull ${gauge(c.now.hull, c.ship.max.hull)} · sails ${gauge(c.now.sail, c.ship.max.sail)} · crew ${gauge(c.now.crew, c.ship.max.crew)} · Carpenter’s Stores ${c.stores}\n${c.state === 'battle' ? '**In a fight.**' : c.state === 'ashore' ? '**On an island.**' : c.at.moving ? 'Sailing.' : 'Stopped.'} Wins: ${c.wins} · Losses: ${c.losses} · **Seals:** ${st.seals ?? 0}`),
      divider(),
      text(`**Today’s bounties**\n${bounties.join('\n')}`),
      ...(log.length ? [text(`**Ship’s log**\n${log.join('\n')}`)] : []),
      text(later),
    ],
    { actions: [...open, button('Refresh', 'pda:sea:refresh')] },
  );
}

export const seaPda = {
  key: 'sea',
  /** @param {any} who */
  screen: (who) => seaPage(who),
  acts: {
    /** @param {any} who */
    refresh: (who) => seaPage(who),
  },
};
