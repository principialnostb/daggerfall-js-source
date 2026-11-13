// @ts-check
// Home: the character the PDA acts as, and one line from each part of the PDA that has news (unread letters, a guild,
// listings, revenants away, the next world event). Each line is its own module's (its `glance`), so Home never reads
// another module's tables.
import { text, section, button, STYLE, md, when, divider } from './pdaUi.js';
import { frame } from './pdaFrame.js';

/** The character card: name, level, class, race, region, and when it was last played. @param {any} who */
function characterCard(who) {
  const c = who.character;
  if (!c) {
    return [
      text(
        `**${md(who.name)}**\nYou have no online character yet. Make one in the game, and it will show here.`,
      ),
    ];
  }
  const s = c.summary ?? {};
  const kind = [s.gender, s.race, s.className].filter(Boolean).map((x) => md(x, 30)).join(' ');
  const lines = [
    `## ${md(c.name, 40)}`,
    [s.level ? `Level ${s.level}` : '', kind].filter(Boolean).join(' · ') || '-# No details yet',
    `-# ${s.region ? `${md(s.region, 40)} · ` : ''}${c.playing ? 'Playing now' : `Last played ${when(c.updatedAt, 'R')}`}`,
  ];
  return who.characters.length > 1
    ? [section(lines, button('Switch', 'pda:settings:chars'))]
    : [text(lines.join('\n'))];
}

export const homePda = {
  key: 'home',
  /** The card and the glances. @param {any} who */
  async screenParts(who) {
    const lines = who.glances ? await who.glances() : [];
    return [
      ...characterCard(who),
      ...(lines.length ? [divider(), text(lines.join('\n'))] : []),
    ];
  },
  /** Home's quick buttons: the screens most used. @param {any} who */
  actionsOf(who) {
    return [
      button('Mail', 'pda:mail', { style: STYLE.PRIMARY }),
      button('Guild', 'pda:guild'),
      button('Market', 'pda:market'),
      button('Expeditions', 'pda:exp'),
      button('Events', 'pda:events'),
      ...(who.staff ? [button('Staff desk', 'pda:staff')] : []),
    ];
  },
  /** @param {any} who */
  async screen(who) {
    return frame(who, 'home', await this.screenParts(who), { actions: this.actionsOf(who) });
  },
  acts: {
    /** Drawn again: the numbers as they stand now. @param {any} who */
    refresh: async (who) => homePda.screen(who),
  },
};
