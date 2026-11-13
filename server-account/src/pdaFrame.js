// @ts-check
// The journal's frame: its pages, the worn-paper heading each page opens with, the menu that turns between them, and the
// words a refusal is said in. The router (pdaRouter.js) wires each page to its module; this file knows only their names,
// so a module may draw its page in the frame without importing the router. Code keeps the `pda` names; players read
// "journal" everywhere.
import {
  container,
  text,
  divider,
  select,
  rows,
  button,
  STYLE,
  ACCENT,
  md,
  when,
  line,
  section,
  reply,
  picture,
} from './pdaUi.js';
import { artUrl } from './journalArt.js';

/**
 * Every screen, in the menu's order. `staff` screens show to staff alone; `open` screens need no link.
 * @type {ReadonlyArray<{ key: string, label: string, hint: string, staff?: boolean, open?: boolean }>}
 */
export const SCREENS = Object.freeze([
  { key: 'home', label: 'Journal', hint: 'Your character and recent news' },
  { key: 'mail', label: 'Letters', hint: 'Letters from players and the developers' },
  { key: 'friends', label: 'Friends', hint: 'Friends online and friend requests' },
  { key: 'guild', label: 'Guild', hint: 'Members, ranks, the notice board and invites' },
  { key: 'market', label: 'Market', hint: 'Buy and sell items from your Stores' },
  { key: 'events', label: 'World events', hint: 'Current and upcoming world events', open: true },
  { key: 'map', label: 'Map of Tamriel', hint: 'The provinces and the events on them', open: true },
  { key: 'exp', label: 'Expeditions', hint: 'Send your revenants on missions' },
  { key: 'sea', label: 'Eltheric Ocean', hint: 'Sail your ship and fight other captains' },
  { key: 'cabinet', label: 'Courier’s Cabinet', hint: 'Buy cosmetics for the game with Seals' },
  { key: 'polls', label: 'Polls', hint: 'Vote on what comes next', open: true },
  { key: 'feedback', label: 'Feedback', hint: 'Ideas, bugs and your reports' },
  { key: 'settings', label: 'Settings', hint: 'Messages, profile card and character' },
  { key: 'staff', label: 'Staff desk', hint: 'Cases, players, polls and feedback', staff: true },
]);
export const SCREEN_KEYS = Object.freeze(SCREENS.map((s) => s.key));
/** A screen's row in the table, or null. */
export const screenOf = (/** @type {string} */ key) => SCREENS.find((s) => s.key === key) ?? null;

/** The words a refusal is said in. A module may pass its own beside these. */
export const REFUSALS = Object.freeze({
  'not-linked': 'Link your DFO account to open your journal.',
  'discord-needs-account': 'Register your account in the game first. A guest account cannot be linked.',
  'discord-rate': 'Too many tries. Wait a few minutes, then try again.',
  'bad-code': 'That code is wrong or has expired. Ask the game for a new one.',
  banned: 'Your account is banned.',
  frozen: 'Your account is on hold. Contact the staff.',
  muted: 'You are muted and cannot send that now.',
  'not-staff': 'That is for the staff.',
  'no-character': 'You have no online character yet. Make one in the game.',
  'in-game': 'Finish that in the game. It changes your character.',
  rate: 'Slow down a little, then try again.',
  gone: 'That is no longer there.',
  closed: 'That is closed.',
  down: 'Discord did not answer. Try again in a minute.',
});
/** One refusal in words. @param {string} error @param {Record<string, string>} [own] */
export const refusalText = (error, own = {}) =>
  own[error] ?? /** @type {Record<string, string>} */ (REFUSALS)[error] ?? `That did not work (${line(error, 40)}).`;

/** The character the journal is kept for, in plain words: name, level, race and class, region. @param {any} who */
export function characterWords(who) {
  const c = who?.character;
  if (!c) return who?.player ? `${who.name} · no online character yet` : '';
  const s = c.summary ?? {};
  return [c.name, s.level ? `Level ${s.level}` : '', [s.race, s.className].filter(Boolean).join(' '), s.region ?? '']
    .filter(Boolean)
    .join(' · ');
}
/** The line under a page's name when it has no picture. @param {any} who */
export function characterLine(who) {
  const w = characterWords(who);
  return w ? `-# ${md(w, 160)}` : '-# Not linked';
}

/**
 * A page's worn-paper heading: its name in blackletter and the character it is kept for, as a picture the service
 * draws. Null where no picture can be signed (no service address, no key), and the page names itself in words.
 * @param {any} env @param {string} origin @param {string} title @param {string} sub
 */
export function headingPicture(env, origin, title, sub) {
  const url = origin ? artUrl(env, origin, 'header', { t: title, s: sub, m: 'The Journal' }) : null;
  return url ? picture(url, `${title}${sub ? ` - ${sub}` : ''}`) : null;
}

/** The menu at the foot of every screen, the screen shown chosen. @param {string} current @param {any} who */
export function navMenu(current, who) {
  const staff = !!who?.staff;
  return select(
    'pda:nav',
    SCREENS.filter((s) => !s.staff || staff).map((s) => ({
      label: s.label,
      value: s.key,
      description: s.hint,
      default: s.key === current,
    })),
    { placeholder: 'Turn to a page…' },
  );
}

/**
 * A screen in the frame: header, the character line, the body, the actions, the menu.
 * @param {any} who @param {string} key @param {any[]} bodyParts @param {{ actions?: any[], title?: string, accent?: number, nav?: boolean }} [o]
 */
export function frame(who, key, bodyParts, { actions = [], title, accent, nav = true } = {}) {
  const s = screenOf(key);
  const name = title ?? s?.label ?? 'Journal';
  const heading = headingPicture(who?.env, who?.origin, name, characterWords(who));
  return [
    container(
      [
        heading ?? text(`### ❦ The Journal › ${md(name, 60)}\n${characterLine(who)}`),
        ...bodyParts,
        ...(actions.length ? [divider(), ...rows(actions)] : []),
        ...(nav ? [divider(), navMenu(key, who)] : []),
      ],
      accent ?? (s?.staff ? ACCENT.STAFF : Number(who?.link?.pda_theme) || ACCENT.JOURNAL), // a colour bought with expedition points
    ),
  ];
}

/** The page an unlinked user meets: what linking is, and the button that takes the code. @param {string} [why] @param {any} [who] */
export function linkScreen(why = '', who = null) {
  const heading = headingPicture(who?.env, who?.origin, 'Your Journal', 'Link your DFO Online account');
  return [
    container(
      [
        heading ?? text('### ❦ The Journal › Link your account'),
        ...(why ? [text(why)] : []),
        text(
          [
            'Link your DFO Online account to open your journal.',
            '1. In the game, open **Account** and press **Link Discord**.',
            '2. Press **Enter code** below and type the code the game shows.',
            '-# The code works once and lasts ten minutes. You can unlink at any time.',
          ].join('\n'),
        ),
        divider(),
        ...rows([button('Enter code', 'pda:link:code', { style: STYLE.PRIMARY }), button('World events', 'pda:events')]),
      ],
      ACCENT.JOURNAL,
    ),
  ];
}

/** A refusal drawn as its own small screen, with a way back. */
export function refusalScreen(/** @type {any} */ who, /** @type {string} */ words, back = 'home') {
  return frame(who, back, [text(words)], { accent: ACCENT.WARN, actions: [button('Back', `pda:${back}`)] });
}

/** A private answer of a refusal, for a press on a public card (a poll, the Courier). */
export const refusalNote = (/** @type {string} */ words) =>
  reply([container([text(words)], ACCENT.WARN)]);

/** The Courier: the pinned card every player opens the journal from. Its words change with TERMINAL_VERSION. Where the
 *  journal's Activity is on, its first press opens the book inside Discord; the pages in Discord stay a press away.
 *  @param {any} [env] @param {string} [origin] the service's own address, for its heading @param {boolean} [activity] */
export const TERMINAL_VERSION = 3;
export function terminalCard(env = null, origin = '', activity = false) {
  const heading = headingPicture(env, origin, 'The Courier', 'DFO Online · letters, tidings and your journal');
  return [
    container(
      [
        heading ?? text('## ❦ The Courier'),
        text(
          [
            activity
              ? 'Your DFO Online journal in Discord. Read letters, check the map, sail the Eltheric Ocean in your own ship and spend Seals in the Courier’s Cabinet.'
              : 'Your DFO Online journal in Discord. Read and write letters, manage your guild, trade from your Stores, send revenants on missions and vote in polls.',
            '-# Only you see your journal. Link your account once to begin.',
          ].join('\n'),
        ),
        divider(),
        ...(activity
          ? [
              section(['**Open the journal**', '-# The full journal app inside Discord, with the map and the sea.'], button('Open the journal', 'open:activity', { style: STYLE.PRIMARY })),
              section(['**Quick pages**', '-# The same pages as messages in this channel.'], button('Pages', 'open:home')),
            ]
          : [section(['**Your journal**', '-# Every page in one place.'], button('Open your journal', 'open:home', { style: STYLE.PRIMARY }))]),
        section(['**World events**', '-# Current and upcoming events.'], button('Events', 'open:events')),
        section(['**The map**', '-# Tamriel and its events.'], button('Map', 'open:map')),
        section(['**Polls**', '-# Vote on what comes next.'], button('Polls', 'open:polls')),
        section(['**Feedback**', '-# Ideas, bugs and balance.'], button('Feedback', 'open:feedback')),
        divider(),
        ...rows([button('Link account', 'open:link', { style: STYLE.SUCCESS })]),
      ],
      ACCENT.JOURNAL,
    ),
  ];
}

/** A short "as of" line for a screen that shows live numbers. */
export const asOf = (/** @type {number} */ nowS) => `-# As of ${when(nowS, 't')}`;
