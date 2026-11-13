# The Journal's Activity and the Eltheric Ocean

The journal opened inside Discord as an Activity: a web page Discord runs in its own frame, on desktop, the browser
and phones. It is the same journal as the bot's pages (`Discord-PDA.md`), drawn as a book on a desk, with the Map of
Tamriel and the Eltheric Ocean as views of their own. Nothing in it is a typed command.

## How it works

**The files** (`server-account/journal/`). Plain modules served by the account Worker as its static files
(`server-account/wrangler.toml` `[assets]`): `index.html`, `desk.js` (the opening), `book.js`, `render.js`,
`sheet.js`, `mapView.js`, `seaView.js`, `cabinetView.js`, `paper.js`, `sound.js`, `frame.js`, `api.js`, `md.js`
and `journal.css`, with the kit below in `kit/`. Discord reaches them through one URL mapping, `/` to the Worker's host. Nothing loads from another host, since
Discord's frame refuses it: the lettering (Jacquard 12) and the hand (IM Fell English, SIL OFL) are in `fonts/`.

**Discord's frame** (`server-account/journal/frame.js`). The handshake, commands and events the Embedded App SDK
speaks (opcodes 0 to 3), written here rather than bundled. The book uses its READY, AUTHORIZE, AUTHENTICATE,
OPEN_EXTERNAL_LINK and REQUEST_PROXY_TICKET_REFRESH. Outside Discord the cover stays shut and says where to open it.

**Who is asking** (`server-account/src/journalDoor.js`). Discord's proxy signs each request with a payload naming
the user (`x-discord-proxy-payload`), under the application's own key, `DISCORD_PUBLIC_KEY`. The door checks the
signature (base64 or hex), that the timestamp is the payload's own, and that it has not lapsed. A lapsed one is
answered `proxy-expired`, and the Activity asks Discord for a fresh one. Where the proxy says nothing, Discord's OAuth
sign-in (`POST /v1/journal/oauth`) trades the code for the user and a ticket the service signs for twelve hours.
That needs `DISCORD_CLIENT_SECRET`, which the deploy puts where the repository has it.

**The door's routes** (`/v1/journal/`). `hello` (who the book is kept for, and its chapters), `press` (a press, a
choice or a form, answered by `pdaRouter.js` `journalPress` exactly as a Discord press is, every rule and count the
same), `map` (the pins on the chart, and the player's reminders), `chart.png` (the chart under the pins), and the
sea's routes. Each player may ask `JOURNAL_ASK_MAX` times a minute.

**The book** (`book.js`, `render.js`). A leather cover opens on a spread: the left page is the chapter's frontispiece
(its name, the character's wax seal, the contents), the right page the chapter, scrolled. Leather tabs on the
fore-edge reach every chapter. A chapter changes by a page turning on a 3D leaf, or by taking a page's corner and
dragging it over. The bot's page is drawn as the book's own: its text inked in, a press an inked stamp, a menu a
ledger of choices, a rule a flourish. Its heading picture becomes lettering, and its menu becomes the tabs.

**Forms and notes** (`sheet.js`). A form is a sheet of letter paper laid over the book: ruled lines to write on,
short ledgers to tick, and a wax seal to send it. A note after a press is a slip pinned over the page. Narrow, the
book is one page with its tabs across the top. Motion stops for a player who asks the system for less of it.

**The map** (`mapView.js`). The worn-paper chart, dragged, wheeled or pinched about the hand. Each pin breathes while
its event is live; its card says when and where, and keeps its reminder.

**The Cabinet** (`cabinetView.js`). A shelf for each kind of ware. Each card shows the ware as the game draws it, by the
game's own painters (`src/journalKit/cabinetPreview.js`). An aura stands on the shop's figure
(`render/auraPreview.js`). An armory piece is worn by the figure, framed on its slot. The weapon piece stands on the blade's stage. A title sits on
its plate over the character's name, a glyph beside the name, and a portrait in its bezel. A card's picture opens the
ware up close, moving, with its seal to buy it: a single armory piece with the camera drawn in on its slot
(`stageLens`), as its card frames it. With less motion asked for, it is a still.

**The kit** (`tools/journalKit.mjs`). The painters are bundled from the game's tree into `kit/cabinetPreview.js`,
never committed. The account deploy builds it before the Worker goes up, so the pictures are the game of that commit.
Its path filter lists every file the kit bundles. The kit stays under `KIT_BUDGET`. Without the kit, or without
WebGL2, a card shows the ware's wax seal.

## The Eltheric Ocean in the journal

**A captain** (`server-account/src/seaJournal.js`, `server-account/src/seaJournalLaw.js`). A character sets sail
from Veilhaven in a ship of their own fleet, read from the save (`shipFromSave`): its hull and refits, its damage,
its named hands and their posts, its fire barrels, and the Carpenter's Stores and cargo in its hold. A rowboat never
sails out. The captain's row is `sea_captains`. The save is read, never written. Going home ends the voyage in
Veilhaven's peace or ashore. Out on open water it sets a course for Veilhaven instead, so it never ends a chase.

**The sea** is the game's own (`src/world/ethericSea.js`): its isles, names and kinds, its bands from the Shallows to
the Abyss, the Veil, and Veilhaven's peace (`PEACE_PX`, no fight there). A course reaches `COURSE_MAX_PX` at most; a
ship's way is its build, its rigging, its canvas, a bosun, and the wind, which swings through the day (`windAt`).

**Others at sea.** Captains within sight show on the chart: a lookout sees farther. A captain heard from in the last
`AWAKE_S` may be engaged in hail (`HAIL_PX`), out of the peace. A rival is never a character of the same account,
nor a ship under `MERCY_SHARE` of its hull. Two captains who fought wait `PAIR_REST_S` before they fight again.
Raiders lie in wait, one at most in a six-pixel cell
for twenty minutes, thicker where the band's pirates are; six legends sail the deep, and one sunk rests thirty days
for the captain who sank it.

**A fight** (`resolveRound`). Each round both captains give orders: the helm (close, hold, open, flee), the shot
(round, grape, chain, heated), the hands (guns, sails, repair, board), and whether to brace. The range moves by the
helms and each ship's way. The guns that bear fire by the game's own numbers (`SEA_GUNS`, `SEA_HULLS`, pinned to
`navalShips.js` and `fleet.js` by `test/server/sea_journal.test.js`). Holding beam-on against a ship closing bow-on
rakes it. Alongside, the broadside bears.

**How a fight ends.** A ship strikes at a quarter of its hull (`STRIKE_AT`). Boarders alongside may take a deck. The
faster ship running at long range escapes. Night parts a fight after `ROUNDS_MAX`. A round is resolved once,
guarded on its number, when both have given orders or its `ROUND_DUE_S` has passed: by whoever asks first, or by the
clock's minute (`seaMinute`). The service sails raiders and legends itself (`aiOrders`).

**Ashore.** A ship within reach of an isle makes landfall, and its ground is walked (`isleGround`, `walkPath`): the
same for every captain, from the isle's seed. A port's harbourmaster mends the ship whole and reads it again from the
save; its tavern tells where a legend was seen. A ruin is searched, a wild strand gathered, a lookout watched from,
and a cairn marked, each once a day.

**In Discord's messages** (`server-account/src/pdaSea.js`). The journal's Eltheric Ocean page there is the
captain's ledger: the fleet to sail from, or the ship at sea with its bounties and log. Where the Activity is on, it
carries the press that opens it.

**Seals at sea.** A raider or legend sunk pays its worth; a rival beaten pays by the size of the beaten ship, once
a day for that rival. A first landfall on an isle pays a little, ruins and strands pay by their depth, and the day's three bounties
(`seaBounties`) pay on top. The sea pays `SEA_SEALS_A_DAY` an account at most.

## Turning the Activity on

A person does this once in the Developer Portal, since no API can: Activities, Settings, Enable Activities, with
Web, iOS and Android ticked; then Activities, URL Mappings, `/` to the account Worker's host. Discord then makes the
Activity's launcher entry. The deploy names it `/journal` (`tools/discordModCommands.mjs` `activityEntry`), and its
summary says which steps are still the Portal's. Each hour the service reads whether the entry is there
(`pdaTerminal.js` `checkActivity`). Once it is, the Courier's first press opens the book (LAUNCH_ACTIVITY).

## Rules

- No typed commands; every act is the book's own (the owner).
- Discord's play pays Seals alone, never Aurum, gold or items; the sea never writes a realm record (the owner).
- The player is the one Discord's proxy, or a ticket from Discord's sign-in, names; never the page's word.

## Daggerfall Unity

Daggerfall Unity has no Discord, no online service and no journal Activity; none of this is a DFU member.

## Code and tests

- `server-account/journal/` - the Activity
- `server-account/src/journalDoor.js` - the door; `server-account/src/pdaRouter.js` `journalPress` - its presses
- `server-account/src/seaJournal.js`, `server-account/src/seaJournalLaw.js`, `server-account/src/pdaSea.js` - the Ocean in the journal
- `server-account/migrations/0219_journal_sea_cabinet.sql` - the captains, fights and log, and the Cabinet's wares
- `src/journalKit/cabinetPreview.js` - the Cabinet's wares as the game draws them; `tools/journalKit.mjs` - its bundle
- `test/journalRig.mjs` - the proxy's signed word, driven through the Worker's own door
- `test/server/journal_activity.test.js`, `test/server/sea_journal.test.js`, `test/server/pda_journal.test.js`,
  `test/server/journal_kit.test.js`

## Open

- Whether Discord's proxy signs every request without a Portal setting has not been seen in the live client; the
  sign-in through Discord stands behind it.
- Whether a win at sea should take cargo through the game's own sea prizes (`Captains-Sea.md`) is the owner's call.
