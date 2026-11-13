// @ts-check
// Settings: which direct messages the player wants, whether other members may see their card, which character the PDA
// acts as, and unlinking. Each is the player's own row in discord_links, written by the player alone.
import { text, select, button, STYLE, md, when, section, divider, ACCENT } from './pdaUi.js';
import { frame } from './pdaFrame.js';
import { NOTICE_KINDS, unlinkDiscord } from './pdaLink.js';
import { sendDirect } from './pdaNotices.js';

/** The direct messages menu: every kind, the wanted ones chosen. @param {any} who */
function dmMenu(who) {
  const dm = Number(who.link?.dm) || 0;
  return select(
    'pda:settings:dm',
    Object.entries(NOTICE_KINDS).map(([k, v]) => ({
      label: v.label,
      value: k,
      description: v.hint,
      default: (dm & v.bit) !== 0,
    })),
    { placeholder: 'No direct messages', min: 0, max: Object.keys(NOTICE_KINDS).length },
  );
}

/** The characters menu, the one acted as chosen. @param {any} who */
function characterMenu(who) {
  return select(
    'pda:settings:char',
    who.characters.map((/** @type {any} */ c) => ({
      label: c.name,
      value: c.id,
      description: [c.summary?.level ? `Level ${c.summary.level}` : '', c.summary?.className ?? '', c.summary?.region ?? '']
        .filter(Boolean)
        .join(' · '),
      default: c.id === who.character?.id,
    })),
    { placeholder: 'Choose a character' },
  );
}

/** @param {any} who @param {string} [said] */
async function settingsScreen(who, said = '') {
  const link = who.link ?? {};
  const parts = [
    ...(said ? [text(said), divider()] : []),
    text(
      `**Linked** to Discord as ${md(link.discord_name || who.user?.username || '?')} since ${when(link.linked_at, 'D')}.`,
    ),
    divider(),
    text('**Direct messages**\n-# Choose what the PDA tells you about.'),
    dmMenu(who),
    ...(Number(link.dm_dead) === 1
      ? [
          text(
            '-# Discord will not deliver our messages to you. Allow direct messages from this server, then press Test.',
          ),
        ]
      : []),
    divider(),
    section(
      [
        `**Profile card:** ${Number(link.profile_open) === 1 ? 'shown' : 'hidden'}`,
        '-# Shown, members can open your card from the Apps menu.',
      ],
      button(Number(link.profile_open) === 1 ? 'Hide' : 'Show', 'pda:settings:profile'),
    ),
    ...(who.characters.length
      ? [divider(), text('**Character**\n-# The PDA acts as this character.'), characterMenu(who)]
      : []),
  ];
  return frame(who, 'settings', parts, {
    actions: [
      button('Test message', 'pda:settings:test'),
      button('Unlink', 'pda:settings:unlink', { style: STYLE.DANGER }),
    ],
  });
}

export const settingsPda = {
  key: 'settings',
  /** @param {any} who */
  screen: async (who) => settingsScreen(who),
  acts: {
    /** The direct messages chosen. @param {any} who @param {string[]} _a @param {string[]} values */
    async dm(who, _a, values) {
      const bits = values.reduce(
        (n, k) => n | (NOTICE_KINDS[/** @type {keyof typeof NOTICE_KINDS} */ (k)]?.bit ?? 0),
        0,
      );
      // A kind turned on starts from now, so the player is not told of everything that came while it was off.
      const was = Number(who.link?.dm) || 0;
      const fresh = (/** @type {keyof typeof NOTICE_KINDS} */ k) => (bits & NOTICE_KINDS[k].bit) !== 0 && (was & NOTICE_KINDS[k].bit) === 0;
      const marks = [
        ['mail', 'mail_seen'],
        ['post', 'post_seen'],
        ['market', 'sale_seen'],
        ['guild', 'invite_seen'],
      ].filter(([k]) => fresh(/** @type {any} */ (k)));
      await who.ctx.db
        .prepare(
          `UPDATE discord_links SET dm = ?1${marks.map(([, col]) => `, ${col} = MAX(${col}, ?3)`).join('')} WHERE discord_id = ?2`,
        )
        .bind(bits, who.discordId, ...(marks.length ? [who.ctx.nowS] : []))
        .run();
      who.link = { ...who.link, dm: bits };
      return settingsScreen(who, bits ? 'Saved.' : 'Saved. The PDA will send you no direct messages.');
    },
    /** The profile card shown or hidden. @param {any} who */
    async profile(who) {
      const open = Number(who.link?.profile_open) === 1 ? 0 : 1;
      await who.ctx.db
        .prepare('UPDATE discord_links SET profile_open = ?1 WHERE discord_id = ?2')
        .bind(open, who.discordId)
        .run();
      who.link = { ...who.link, profile_open: open };
      return settingsScreen(who, open ? 'Members can now see your card.' : 'Your card is hidden.');
    },
    /** The character the PDA acts as. @param {any} who @param {string[]} _a @param {string[]} values */
    async char(who, _a, values) {
      const c = who.characters.find((/** @type {any} */ x) => x.id === values[0]);
      if (!c) return settingsScreen(who, 'That character is gone.');
      await who.ctx.db
        .prepare('UPDATE discord_links SET char_id = ?1 WHERE discord_id = ?2')
        .bind(c.id, who.discordId)
        .run();
      who.link = { ...who.link, char_id: c.id };
      who.character = c;
      return settingsScreen(who, `The PDA now acts as ${md(c.name)}.`);
    },
    /** The character menu alone, from Home's Switch. @param {any} who */
    async chars(who) {
      return frame(who, 'settings', [text('**Choose the character the PDA acts as.**'), characterMenu(who)], {
        title: 'Character',
        actions: [button('Back', 'pda:home')],
      });
    },
    /** A direct message now, so the player sees whether Discord delivers them. @param {any} who */
    async test(who) {
      const r = await sendDirect(who.ctx, who.env, who.io.fetchFn, who.link, {
        title: 'Test message',
        lines: ['Letters from your journal reach you.'],
        open: 'settings',
      });
      if (r.sent) {
        who.link = { ...who.link, dm_dead: 0 };
        return settingsScreen(who, 'Sent. Check your direct messages.');
      }
      if (r.dead) who.link = { ...who.link, dm_dead: 1 };
      return settingsScreen(
        who,
        r.dead
          ? 'Discord would not deliver it. Allow direct messages from this server in its Privacy Settings.'
          : 'Discord did not answer. Try again in a minute.',
      );
    },
    /** Unlinking, asked once more. @param {any} who */
    async unlink(who) {
      return frame(
        who,
        'settings',
        [text('**Unlink your account?**\nThe PDA will stop acting for you. You can link again with a new code.')],
        {
          title: 'Unlink',
          accent: ACCENT.WARN,
          actions: [
            button('Unlink', 'pda:settings:unlinkyes', { style: STYLE.DANGER }),
            button('Keep it', 'pda:settings'),
          ],
          nav: false,
        },
      );
    },
    /** Unlinked. @param {any} who */
    async unlinkyes(who) {
      await unlinkDiscord(who.ctx, who.player.id);
      return [
        {
          type: 17,
          accent_color: ACCENT.QUIET,
          components: [text('### ❦ The Journal\nUnlinked. Your account no longer answers to this Discord user.')],
        },
      ];
    },
  },
};
