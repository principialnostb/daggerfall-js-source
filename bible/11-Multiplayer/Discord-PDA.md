# Discord Journal

The game's own bot in Discord: one application for players and staff. A player links their account once and then
keeps a private journal inside Discord: Journal, Letters, Friends, Guild, Market, World events, Map of Tamriel,
Expeditions, the Courier's Cabinet, Polls, Feedback and Settings. The same journal opens as a book inside Discord,
with the Eltheric Ocean beside it (`Journal-Activity.md`). Staff get a Staff desk in the same journal. Nothing is typed as a command.
The moderators' case cards and `/mod` (`Chat-Safety-Arc.md`) are the same bot. The code keeps the `pda` names; every
word a player reads says journal.

## How it works

**The bot.** One Discord application. Its presses, menus, forms and commands reach the account service at
`/v1/discord/interactions`, signed by Discord and checked over the exact bytes (`server-account/src/discord.js`
`discordSigned`). `discordInteraction` hands everything the PDA owns to `server-account/src/pdaRouter.js`
`pdaInteraction` first; anything else stays the moderators' queue. The bot's own calls to Discord go through one door,
`server-account/src/pdaDiscordApi.js` `discordApi`, with a timeout and the User-Agent Discord asks for. Discord
waits three seconds for an answer: one not ready in `PDA_ANSWER_MS` is deferred, the pressed screen kept (or a private
one promised), and drawn after through the interaction's own token (`editOriginal`).

**No typed commands** (the owner). A player opens the journal from the Courier's buttons, from a direct message's
button, or from a member's Apps menu (**DFO Profile**, `server-account/src/discordCommands.js` `PROFILE_COMMAND`, a
user command that takes no words). Forms are Discord's pop-up forms.

**The Courier** (`server-account/src/pdaTerminal.js`). One pinned card in a read-only channel, kept by the service:
it finds the server from the moderators' channel, finds or makes `#dfo-courier`, posts the card, pins it, and redraws
it when `TERMINAL_VERSION` moves. What it found is kept in `discord_state`. A channel it made under the old name
`#dfo-terminal` is renamed once. The card's heading picture needs the service's own address, which the clock does not
know: the first interaction keeps it (`discord_state` `self`), and the card is drawn again with its picture. `DISCORD_TERMINAL_CHANNEL`,
`DISCORD_POLL_CHANNEL` and `DISCORD_FEEDBACK_CHANNEL` in `server-account/wrangler.toml` override its choices; empty,
polls go beside the Courier and feedback cards to the moderators' channel. The deploy's Discord step says whether
the bot holds Manage Channels, Pin Messages and Send Messages, never red (`tools/discordModCommands.mjs` `PDA_SERVER_NEEDS`).

**The look** (`server-account/src/pdaUi.js`, `server-account/src/pdaFrame.js`, `server-account/src/journalArt.js`).
Every page is one container of Discord's layout components, edged in sepia: a worn-paper heading picture, the body,
the page's buttons, and a menu at the foot that turns between pages. The heading carries the page's name in
blackletter and the character the journal is kept for.

**The worn paper** (`server-account/src/journalArt.js`). The service draws each heading itself at a signed address,
`GET /v1/journal/art/header.png?p=<words>&s=<signature>`. The letters are Jacquard 12 (SIL OFL), baked into
`server-account/src/journalFont.js` by `tools/journalFontBake.mjs`. The signature is an HMAC under a key derived from
`IDENTITY_PRIVATE_KEY`, so no one else can have the service draw their words. With no address or key, a page names
itself in words. A screen opened from a public card is a new private message; a press inside it redraws it in
place. The builders hold Discord's bounds: 40 components, 4,000 characters of text, 100-character custom ids.
Player-written words are escaped outside a code block and fenced inside one, and no message pings anyone.

## The link

A Discord user acts as one registered account (`server-account/src/pdaLink.js`). The game's account card has a
Discord row (`src/ui/enhanced/discordRow.js`): **Link Discord** asks `POST /v1/discord/code` for a one-time code, shown
as `ABCD-EFGH`. In Discord, **Enter code** on the link screen takes it. A code lives `LINK_CODE_TTL_S` (ten minutes),
works once, and is kept only as its hash. A Discord user has `LINK_TRY_MAX` tries in ten minutes. The game proves the
account and Discord proves the user, so no Discord login page or second secret is needed.

One Discord user holds one account and an account one Discord user: a new link moves an old one. Every link and every
move is told to the account in its mailbox, so a stolen code cannot link unseen. Either side unlinks:
`POST /v1/discord/unlink`, or Settings. A guest cannot link. A banned or frozen account sees only that it is barred,
and may still unlink. The account read carries the link's state (`discord`), and `GET /v1/discord/link` answers it alone.

## Who acts, and what never moves

Every act runs the game's own code as the linked account and the PDA's character: the realm character chosen in
Settings while it lives, else the one played last (`pdaRouter.js` `whoOf`). So the game's ranks, powers, rates,
blocks, mutes, holds and switches hold unchanged. A player's presses are bounded at `PDA_PRESS_MAX` a minute.

A save moves only under its playing tab's lease (`06-Systems/Realm-Arc.md`), so no Discord act writes a realm record.
What moves a save is shown read-only with "Finish that in the game": claiming the developers' post, the guild's
founding, treasury and vault pieces, rename, handover and disband, market pieces, pack items, gold and auctions.

Staff are the account's own staff rights (`server-account/src/titles.js` `canModerate`, `isDeveloper`). A Discord user
listed in `DISCORD_MODERATORS` still acts on the case cards; the Staff desk needs a link.

## The screens

**Home** (`server-account/src/pdaHome.js`). The character card (level, race, class, region, last played) and one line
from each screen that has news, each module's own `glance`, asked together and each bounded by `GLANCE_MS`.

**Mail** (`server-account/src/pdaMail.js`). The inbox in pages, a letter opened, **Reply** by the sender's account,
**Write**, **Delete**, and the developers' post. Every act is `server-account/src/letters.js` or
`server-account/src/post.js`, so a blocked sender's letter never arrives and the sender is never told. An item in the
post is claimed in the game.

**Friends** (`server-account/src/pdaFriends.js`). Friends and presence live in the relay's hub. The service asks for
them through a signed ask (below). Online friends first, then the rest, with incoming and outgoing requests:
**Accept**, **Decline**, **Withdraw** and **Remove** act through the hub's own social code, so the friend's game hears
at once. A new friendship starts in the game, as the hub's rule says. Hidden staff never show online.

**Profile.** **DFO Profile** on a member shows their card (name, character, guild tag) with **Write letter**, only if
they chose to show it in Settings. A hidden member and an unlinked one get the same answer; a block either way hides it.

**Guild** (`server-account/src/pdaGuild.js`). The guild of the PDA's character: rank, members against the cap, who is
online, the roster in pages with **Promote**, **Demote** and **Remove** where the rank may, **Invite** by name, join
requests, the board (read, pin a note, take one down), and the vault, hall and castles read-only. With no guild:
invitations, asking by tag, withdrawing a request. A membership change reaches the rooms with the player's next token,
within minutes.

**Market** (`server-account/src/pdaMarket.js`). Silver, the Stores, listings and buy orders, open where
`marketOpenFor` is. From Discord: list a material from the Stores, search materials across every region or the chosen
board's, buy a silver material listing with the courier's fee, and post, fill and withdraw buy orders. The board is
chosen once from all 71 regions (`pda_boards`).

**World events** (`server-account/src/pdaEvents.js`). Every gate lane, the serpent, the Sky-Ketch's stations, the Abyss
Dungeons, Battlespire breaches and seat battles: live now and next, when, and where it is public. Times come from the
game's own clocks; places from the relay's live read. An Abyss Dungeon has no place until it is found (Mac).
**Remind me** sends a direct message `REMIND_LEAD_S` (ten minutes) before a start, once a user and event.

**Map of Tamriel** (`server-account/src/pdaMap.js`, `server-account/src/journalMap.js`). A worn-paper chart the
service draws at `GET /v1/pda/map.png`, 1280 by 800. Land and coast are the owner's relief of Tamriel
(`src/world/tamriel/tamrielReliefData.js`, shipped by the owner's permission), the same coast the game's traced map
shows. Morrowind's Inner Sea is filled as land, as on Daggerfall's own map. Borders, capitals and names are the
authored geography of `src/world/tamriel/tamrielGeography.js`, in the lore's spelling (`pdaUi.js` `loreName`:
Summerset). Each live event is an inked pin in its family's colour; one known only by its province is a dashed ring.
No game file is read: a render of the game's map is game data (Port-Doctrine).

**Expeditions** (`server-account/src/pdaExpeditions.js`, `server-account/src/pdaExpLaw.js`). The revenant errands
(`06-Systems/Revenants.md`), sent from Discord. The service reads the sworn companions from the latest realm save
read-only and keeps its own ledger (`exp_errands`). **Send** asks who, where, what and confirms, by the game's own
rules: sworn and home, not resting, at most two abroad, Renown 10. The return is the world minute the game would set,
with a fresh seed. The game takes a Discord errand up through `sendOnErrand` on its next wake
(`src/systems/revenant/revenantRemote.js`, `GET /v1/expeditions/pending`, `POST /v1/expeditions/ack`), so the haul is
still the game's own at return. **Recall** cancels an errand not yet taken up, or asks the game to recall it.

Errands sent in the game are told to the service (`POST /v1/expeditions/game`), so the PDA shows everyone abroad;
they are shown and earn nothing, since the service did not send or time them. A Discord errand the game already took
home is never set out again: its seed is among the save's paid ones.
On top sits a Discord-only game: `CONTRACTS_A_DAY` contracts an account a day, drawn the same for everyone that day,
and one encounter half-way on each PDA errand, answered from a direct message. The choice changes the report's words
and points, never the haul. Points come once at return and buy only PDA frame colours and profile titles (`THEMES`,
`TITLES`). An errand the game never takes up is let go after `EXP_WAIT_S` and earns nothing.

**Seals.** What the journal's games pay: errands, contracts, the road and the sea. They are the ledger
`exp_points`, one line an earning or a spend, each with a reference written once. They are never sold, never traded,
and never turned into Aurum, gold or items.

**The Courier's Cabinet** (`server-account/src/pdaCabinet.js`, `src/net/discordShopLaw.js`). Cosmetics for the
game, sold here alone for Seals: the Eltheric Tide and Veilwake auras, the Courier of the Veil title, the Courier's
Seal badge, two portraits, and the Tidebound line of the Aura Armory. A ware is the account's at once
(`players.discord_wares`), on every character, and a letter in the game's mailbox says so. A purchase is one guarded
batch: the Seals leave the ledger once a ware and only while the balance holds them, and the ware is written only
beside its spend. A set costs less what is already held of it, never below a fifth.

**Polls** (`server-account/src/pdaPolls.js`). An Admin opens one from the Staff desk: a question, 2 to 10 choices,
1 to 336 hours, and who may vote (any registered account, or one with an online character). The clock posts its public
card, redraws it at most every `POLL_REDRAW_S` while votes come, and closes it. One vote an account, changeable until
it closes, from the card, the PDA or the game (`GET /v1/polls`, `POST /v1/polls/vote`).

**Feedback** (`server-account/src/pdaFeedback.js`). Idea, Balance, Bug, Exploit or security, or Other. Bugs and
exploits go to the private reports (`06-Systems/Private-Reports.md`) and are never posted. The rest become a staff card
with **Seen**, **Planned**, **Done** and **Won't do**; the player is told of each status. `FEEDBACK_SEND_MAX` sends an
hour. The game sends through `POST /v1/feedback/send` and reads through `POST /v1/feedback/mine`.

**Settings** (`server-account/src/pdaSettings.js`). The direct messages wanted, the profile card shown or hidden, the
character the PDA acts as, a test message, and unlinking.

**Staff desk** (`server-account/src/pdaStaff.js`). Open chat cases, worst first, drawn in the PDA's layout with
**Mute 30 min**, **Mute 1 day**, **Mute 7 days**, **Ban 30 days** and **Dismiss**, acting through
`server-account/src/safety.js` `modAct` as the case cards do. Player lookup by id, then name, with mute, unmute, ban,
unban and staff notes. Polls and the feedback queue. A Moderator sees no Admin-only data.

## Direct messages

Each module writes what a player should hear into the outbox (`server-account/src/pdaNotices.js`, `discord_notices`),
one row a user, kind and subject, so nothing is told twice. Kinds are switched in Settings (`pdaLink.js`
`NOTICE_KINDS`): letters, the developers' post, market sales, expeditions, guild news, polls, feedback. Each scan moves
the link's mark even where the kind is off, and a kind turned on starts from now. A scan reads a page at a time and
stops before a full page's last second (`noticeBound`), and leaves the last `NOTICE_SETTLE_S`, so nothing is passed
over. The clock takes at most `NOTICES_A_MINUTE` in one statement before sending, so two firings never send one twice,
and a player's own news goes before a poll announced to everyone. A user Discord will not deliver to is marked and asked
nothing more until **Test** in Settings delivers. Every message's button opens the PDA where the news is.

## The clock

`server-account/src/pdaClock.js` is a job on each of the service's clocks (`server-account/src/cron.js`). Each
minute: the Terminal kept, the outbox sent, then the mail's news and each module's own minute (polls posted, redrawn
and closed, feedback cards, sales, guild news, reminders, expeditions). The firing's statements are shared: each job's
share is what the firing has left over the jobs still to run, and the PDA stops between steps once its share is spent.
Each hour: each module's sweep, sent notices past `NOTICE_KEEP_S`, spent codes. A module that throws stops no other.

## The relay's two doors

`server/src/pdaRelay.js`, wired by one line in the Worker's fetch and one in the Room's. `GET /v1/pda/live` is public:
each gate lane's breach with its place once two accounts agree, the serpent's site, each Abyss Dungeon's region once
found, and the Battlespire's live count, kept 20 seconds an isolate. `POST /v1/pda/friends` takes an ask the service
signs with its identity key over `dfo-pda-ask1` (`server/src/pdaRelayLaw.js`), living 60 seconds, its nonce refused
twice. The service reaches the relay through its `RELAY` binding; without it, events show times alone and Friends says
it cannot be reached.

## Rules

- One bot for players and staff; no typed commands (the owner).
- Discord acts as the linked account through the game's own code; no Discord act writes a realm record.
- Discord's games pay Seals and nothing else (the owner: a Discord shop of cosmetics redeemable in the game). Seals
  are never sold, traded or turned into Aurum, gold or items; Aurum is never earned outside the seated game
  (`06-Systems/Aurum.md`).
- The map draws the owner's relief and authored geometry only (Port-Doctrine). LOOT-GATE holds for every card and message.
- No message pings anyone; player words are escaped or fenced.

## Daggerfall Unity

Daggerfall Unity has no Discord and no online service; none of this is a DFU member.

## Code and tests

- `server-account/src/pdaRouter.js`, `server-account/src/pdaFrame.js`, `server-account/src/pdaUi.js` - the door, the frame, the look
- `server-account/src/journalArt.js`, `server-account/src/journalMap.js`, `server-account/src/journalFont.js`, `tools/journalFontBake.mjs` - the worn paper, the chart, the lettering
- `server-account/src/pdaCabinet.js`, `src/net/discordShopLaw.js` - the Courier's Cabinet and its catalogue; `test/server/pda_cabinet.test.js`
- `server-account/src/pdaLink.js`, `server-account/src/pdaRoutes.js`, `server-account/src/pdaTerminal.js`, `server-account/src/pdaNotices.js`, `server-account/src/pdaClock.js` - the link, the game's routes, the Courier, the outbox, the clock
- each screen's module, named above; `server/src/pdaRelay.js` and `server/src/pdaRelayLaw.js` - the relay
- `server-account/migrations/0215_discord_pda.sql` and the PDA's migrations after it
- `test/pdaRig.mjs` - the rig: linked players and the interactions Discord sends
- `src/systems/revenant/revenantRemote.js`, `src/systems/revenant/revenantRemoteLaw.js` - the game's side of expeditions
- `test/server/pda_crawl.test.js` - every screen reachable from Home pressed, held to Discord's layout law
- `test/server/pda_core.test.js` (the core and Mail), `pda_staff.test.js`, `pda_feedback.test.js`, `pda_polls.test.js`, `pda_guild.test.js`, `pda_market.test.js`, `pda_events.test.js`, `pda_map.test.js`, `pda_friends.test.js`, `pda_relay.test.js`, `pda_exp.test.js`, `pda_journal.test.js`, `rvn_remote.test.js`, `test/ui/enhanced/discord_row.test.js`

## Open

- The Privacy Policy does not yet name a linked Discord id; adding it re-dates the policy, which is the owner's call.
- The herald's world-event cards still post through a webhook and carry no PDA buttons.
- A save rolled back past a taken-up errand loses that errand rather than sending it twice.
