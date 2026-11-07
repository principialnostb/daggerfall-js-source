# Staff Events

An Admin stages monsters on a town or an area from the Staff Panel's Events page. Players in the place fight packs of
the chosen kinds; a hidden kill meter fills and calls a yellow-glowing mini boss; its fall pays a reward and a board.
A staff member may steer the mini boss themselves (Play as boss). It is staff work: no player patch notes describe it.

## How it works

**What staff set** (`src/net/staffEvent/staffEventLaw.js` `validStaffEvent`):

| Field | Bounds | Default |
|---|---|---|
| Place | a town (said as a city) or an area (one map pixel; `loc` `STAFF_EVENT_AREA`) | - |
| Monsters | up to `STAFF_EVENT_KINDS_MAX` kinds, any of the game's; `STAFF_EVENT_KINDS_BARRED` (39, 146) refused | - |
| How many in all | `STAFF_EVENT_TOTAL_MIN`-`STAFF_EVENT_TOTAL_MAX` | 50 |
| Kills to fill the meter | 1 to the total | 25 |
| Mini boss | any kind | the first monster picked |
| Its size | `STAFF_BOSS_SIZE_MIN`-`STAFF_BOSS_SIZE_MAX` % | `STAFF_BOSS_SIZE_DEFAULT` % |
| Its health | 1-100 x its kind's, or an exact number up to `STAFF_BOSS_HP_MAX` (the exact number wins) | 10 x |
| Ends when it falls | yes / no | yes |
| Runs for | until ended, up to `STAFF_EVENT_LONGEST_MS` | until ended |

At most `STAFF_EVENTS_MAX` events run at once. A refused staging names its field (`staffEventFault`,
`event-bad-<field>`). The page lists each event's meter, its boss's state and fighters, with **Spawn mini boss now**,
**End**, and **Clear** for events that are over. Players never see the meter.

**The path of an order.**

1. The account service (`server-account/src/staffEvents.js`, `/v1/staff/event` with `op` start, end, boss or clear,
   and `/v1/staff/events`, Admins only) checks the event by the law, stores the row and its audit row, and pushes a
   signed `sevent` order through the relay's law door. Rows keep `STAFF_EVENT_KEEP_S`. Clear touches the history only.
2. The hub (`server/src/staffEvents.js`) verifies the order, keeps the book, lapses an event past its end, and says the
   book to everyone online (`sev`). It keeps the newest `SEV_BOARDS_KEPT` boards.
3. The place's cell keeps the kill meter by a raid ledger's law: each player there says the deaths of the monsters they
   stand, credited only from a socket whose pose is on the event's pixel, under a burst cap. At each meter fill once the
   last boss fell, and at each hand call, it calls the boss. The hub ends the event when the boss falls with "ends when
   it falls", or when every monster fell and no boss stands.

**The game** (`src/systems/staffEvents.js`, `src/systems/raidingParties.js`). Each event runs as a raid of its own
(key `s.<id>`): one player in the place runs it and stands its monsters, and the rest stand them as puppets. A town's
event runs while the player is outdoors in its rect; an area's while on its pixel. Monsters come in packs of 3-5 mixed
kinds (`staffPackStep`), led from around each player in the town in turn (`staffPackPlayer`). The cap grows by
`STAFF_PACK_CAP_PER` a player to `STAFF_PACK_CAP_MAX` (`staffPackScale`). No town guards come out. Lines name a city or
an area: "The city of X is under attack!", "A mighty KIND has come to the city of X!", and an end line.

**The mini boss** (`src/systems/eliteFoes.js` `promoteStaffBoss`). An elite with staff's size and health, named "Mighty
KIND" (`src/systems/foeTitle.js`), glowing yellow (`STAFF_BOSS_GLOW`, drawn as `STAFF_BOSS_RIM` by
`src/systems/hitFlash.js`). It stands:

- at its call once every monster stood before that call is dead or gone, or after `STAFF_BOSS_CLEAR_MAX_MS`; by hand at once;
- beside the player with the biggest group within `STAFF_BOSS_GROUP_M`, ties by level (`staffBossSpot`); about the pilot
  when one steers it (`staffBossPlace`);
- again if it stands nowhere for `STAFF_BOSS_LOST_MS` (`staffBossLost`); never twice for one call while one stands.

It is hard on purpose: no shove, Hurt, stagger or paralysis; `STAFF_BOSS_MIN_METAL` Silver to cut it and
`STAFF_BOSS_ARMOR` on every part; `STAFF_BOSS_SPELL_TAKEN` of each spell's damage; and one hit takes at most
`STAFF_BOSS_HIT_SHARE` of its maximum divided by the fighters, counted to `STAFF_BOSS_FIGHTERS_MAX` (`staffBossHit`).
Its health is exactly what staff set: the party toughness scaling skips it (`src/scenes/exteriorFoes.js`). A peer's
blow past `PEER_HIT_DMG_MAX` lands at that cap on it, and its health is said on the wire as a share of `FOE_HEALTH_MAX`.
A peer's copy is held to the event's health, not a plain elite's (`staffBossBound`).

**The reward.** At the boss's first fall the cell pays (`server/src/staffEvents.js` `payReward`). Every account with
`STAFF_EVENT_EARN_KILLS` kills of its own earns, once an event (`staffEventEarned`). The board is the top
`STAFF_EVENT_BOARD_MAX` by kills (`staffEventBoard`). Each earner gets a receipt signed with the relay's key
(`src/net/staffEvent/staffEventReceipt.js`). The spoils are rolled on the device off the receipt's seed into the pack,
from `STAFF_SPOILS_TABLE` (`src/systems/staffEventSpoils.js`): gold by level and a Magic-or-better piece for every
earner, more for the board and first place. None of Dagon's gear.

**Play as boss** (`src/systems/staffBossPilot.js`, `src/scenes/staffPilotHost.js`). The Events page posts `pilot`
through `src/net/staffHook.js`. The pilot's raid claim says `PILOT_CLAIM_AGE`, so every game hands them the run. The
boss's feet and facing follow the pilot; a left click swings at the player nearest the facing within `PILOT_TARGET_M`;
a right click lets its spell choice run for `PILOT_CAST_MS`. The pilot's own body is concealed and unsensed. The boss
bar shows its health (`src/ui/staffPilotBar.js`). Leave boss hands the boss back to its own brain. No relay or account
change: it rides words the wire already carries.

**Places past the Bay** (`src/net/staffPlaces.js`). An event's pixel is the world's (`STAFF_EVENT_PIXEL_BOUND`), so an
area event stands in any province. A town past the Bay is named by its registry location (negative) in a province
region (`STAFF_PROVINCE_REGIONS`, `staffTownPixelOk`); a town and pixel on two sides of the Bay's edge is refused. Staff
may stage one in any province's town, Cyrodiil's included.

**Toybox events** (`src/net/staffEvent/toyboxEvent.js`). A developer's toybox stages an invasion or a dragon attack at
any city of Tamriel (`src/systems/toybox/toyboxCities.js`). Each is a staff event with three more fields: `tb` (1 an
invasion, 2 a dragon attack), `fm` (the invasion's family in `INVASION_FAMILIES`) and `go`, when it begins
(`TOYBOX_EVENT_WAIT_MS` after its staging online, `TOYBOX_EVENT_WAIT_OFFLINE_MS` offline). The game's session posts
`/v1/dev/event` (`server-account/src/devEvents.js`): a developer alone (`isDeveloper`), the row stored and audited as
`toybox-event`, the order pushed as any staff event's. A relay older than `TOYBOX_EVENT_RELAY_MIN` drops the fields: the client asks
none there, and the service ends one the hub took without them (`event-relay-old`).

**Before it begins.** The hub's book says it to every player online. Every screen announces it on the World Events
board as kind `invasion`, whatever the region (`src/systems/toybox/toyboxNews.js`). The Timers window counts to `go`
(`src/systems/toybox/toyboxMarks.js`). Nothing stands and no word counts before `go`: the game holds no one in it
(`staffRaidHere`) and the cell drops the words (`staffEventBegun`).

**On the map.** An invasion has its own mark (`src/ui/ink/inkMap.js` `paintInvasionMark`, `INVASION_MARK_CSS`): a
purple ring about the city, a purple shield with crossed blades above it, and its words over the shield. They read
"Invasion in 0:42" until `go` and "Invasion Active" after it. The legend names it, and its hover card is the raid's. A
dragon attack has its own orange mark (`paintDragonMark`, `DRAGON_MARK_CSS`): a ring and a flame. Its words read
"Dragon Attack in 0:42" until the dragon lands, then "Dragon Attacking for 39:10", the time left before it leaves. Its
hover card ends with the same words, and its Timers row counts to the same instants. A mark and a row go at once when
the event ends, when its end passes or its dragon falls on this screen (`toyboxRaids`).

**An invasion is the relay's.** Its city's cell hosts the fight, as a cell hosts the Sea Serpent and the Dwarven
Dragon (`src/net/invasion/invasionBrain.js` through `src/net/bossSeam.js` `INVASION_SEAM`, run by
`server/src/invasionFights.js`). Every foe's health lives there. A fighter's `in` from the city's pixel joins it; the
first names its site. Ten waves of the family's kinds rise on a ring about the fighters, wave `k` of
`INVASION_WAVE_BASE + k`, each once the last is dead. After the tenth the family's boss rises, `INVASION_BOSS_HP` of
health, and takes no blow for `INVASION_RISE_MS`. It has three phases (`ph` 1 to 3), cut at `INVASION_PHASE_AT`: the
gate's first mark (66%) and `INVASION_PHASE3_AT` (a third). In the third, waves of `INVASION_PHASE3_WAVE` come one
after another until it falls. It falls over `INVASION_FALL_MS`, and every foe still standing crumbles with it.

Each family's boss has a name of its own (`invasionBossName` in `src/ui/toybox/invasionHud.js`), shown on its bar,
the side panel and its calls: the Daedric Commander (Daedra), the Grand Necromancer (Undead), The Grand Hunt
(Werewolves), Warlord Dagnub (Orcs) and the Fallen Knight of Akatosh (Humans). Its body in the street keeps its
creature's name.

**A blow is a request.** A screen sends `{t:'inv', k:'hit', id, i, d, r}`: the foe's number (0 the boss), the claim
and the kind. The cell reads the fighter's own pose, never the word's. A swing lands within the gate's reach of the
foe's body and `INVASION_DRAW_SLACK_M`; a shot or a spell within `INVASION_SHOT_R`. The gate's blow rate, one-blow cap
and bucket hold each claim, so no level deals more than its own.

**Its blows are telegraphed** (`src/net/invasion/invasionBlows.js`). The cell lays every blow as one of the gate's
stamps (`egShape.js`) with its wind-up, never under the gate's wind-up floor. A blow row is `[s, i, a, at, wu, p,
stamp]`, `p` the share of the struck player's maximum health. Foes swing discs. While a fighter stands within
`INVASION_SLAM_NEAR_M`, the boss throws a heavy blow every `INVASION_HEAVY_EVERY_MS` of its phase. Phase 1 has the Ground Slam, a disc about its feet. Phase 2 adds the Cleave, a cone at a near mark, and the
Charge, a lane at a far mark that carries the boss down it as it lands. Phase 3 adds the Quake Stomp, a ring that spares
its feet, and its wind-ups shorten by `INVASION_PHASE3_WINDUP_X`. Each phase it enters throws its heavy blow at once.
Every blow is physical.

**The fight keeps the event's ledger.** A kill and a blow the cell took are written to the staff ledger, so the meter,
the timers' row, the board and the receipts read it as before. A screen's own staff word on an invasion counts for
nothing. At the fall the staff door (`keepStaffLedger`) pays each earner a `tb: 1` receipt, then tells the hub.

**The fight on a screen** (`src/scenes/invasionField.js`, the foes driven by `src/scenes/invasionBossHost.js` in the
foe pool). The screen says `in` while an invasion that has begun stands on its pixel. Each foe in the cell's state is
stood in the street's pool as its kind, out of the encounter cap and the save. It is walked where the cell says, holds
the cell's health and dies only by the cell's word. My blow on it goes to the cell. The boss is promoted by
`promoteInvasionBoss` to `INVASION_BOSS_SIZE`, held and drawn sunk while it rises, and drawn tipping and sinking
through its fall before its corpse is laid. The raid's own path stands nothing of an invasion.

**Its blows on a screen** (`src/scenes/invasionMarks.js`). The boss's blows are drawn on the land as they wind up,
through the dragon's draped telegraph pass. Every blow, the boss's and a wave foe's, is judged once on my own feet at
its landing (`egBlowVerdict`). A blow that lands goes through the one damage door, so god mode and Invincible spare
the player. Each phase the boss enters is said mid-screen (`phase2`, `phase3`) and laughed.

**The side panel and the bar** (`src/ui/toybox/invasionHud.js`, `src/ui/toybox/invasionTracker.js`). Within
`INVASION_HUD_NEAR_PX` of the city, a panel stands in the right-hand column, as the Starfall's tracker does. It shows
the invasion's title, "Wave 3 of 10 - 7 left", the foes standing and the boss's state: awaited, rising, its phase,
fallen. It goes `INVASION_HUD_FELL_MS` after the fall. Once the boss rises, the gate's boss bar shows its name, its
health and its two phase marks, spent as it passes them. It reads "Rising" while the boss rises, names the heavy blow
it winds up, and says MOVE when that blow holds my feet. Online the relay's `st` feeds both; offline the local cell.

**Its moments.** The cell tells the hub as the boss rises and falls. The hub says each to every screen once
(`{t:'sev', k:'tb', id, s}`, `s` `boss` or `won`). Every screen says `invasionBossText` and plays the Daedra Lord's
bark slowed to `LAUGH_PITCH` with `LAUGH_ECHOES` quieter echoes; at the fall, `invasionWonText`. A fighter of a
toybox event earns with a blow the cell took (`s`) as well as with kills. An invasion's receipt carries `tb: 1` inside its signed
bytes, so the device rolls the invasion's own rewards.

**A dragon attack** is no raid. Its event calls the world's Dwarven Dragon to its city at `go`
(`src/net/dragon/dragonLaw.js` `dragonCalledOf`), and that dragon's own fight, blows and hoard follow
(`Dwarven-Dragon.md`, "A called dragon"). Nothing of a raid stands: `staffRaidHere` holds no one in it. Every screen
says `dragonLandsText` as it lands. The event ends with its dragon. Its end is `DRAGON_ATTACK_RUN_MS` after `go`, the
dragon's stay, so it ends the moment the dragon leaves. The hub ends it when the dragon falls (`endCalledDragon`). When
the dragon leaves unslain, its cell tells the hub at once, and the hub ends the event if its own clock agrees
(`endLeftDragon`). The dragon's climb away is drawn from the kept omen after the event ends.

**Offline** (`src/systems/toybox/localToyboxEvents.js`, `src/systems/toybox/localInvasion.js`). With no relay the
same event runs on one machine. The local runner keeps the book; the local cell runs an invasion by the relay's own
brain for the one player and answers with the relay's own frames. Its receipt is unsigned and rolled into the pack. An
invasion's row ends when its boss falls (`invasionFell`). A dragon attack's ends when its dragon falls (`calledFell`)
or leaves, since its end is the dragon's leaving.

## Rules

- Admins only; scaled by monster count, kinds, meter and boss, staged on a town or an area.
- The mini boss is one enlarged version of the event's monsters, with a yellow glow in place of the elite's blue.
- Players never see the meter; staff do.
- Every mini boss is very hard for players and cannot be stun-locked; only an event's mini boss, no other foe.
- The reward is Dagon's way without Dagon's gear; `STAFF_SPOILS_TABLE` is the one place to tune it.
- An event, a hub word and a relay older than `STAFF_EVENT_RELAY_MIN` never meet: the game sends `sev` only past it.
- A toybox event is a developer's alone, staged at a city, and announced to every screen; it runs offline too.
- A toybox event runs with the Raiding Parties mod off; every other staff event and raid needs the mod.
- An invasion's boss casts nothing: every blow it lands is physical.

## Daggerfall Unity

DFU has no staff events, no other players and no unstunnable foe. The mini boss's armour and metal rule borrow Enemy
Expansion's Troll (`MonsterBase.mdb.csv` row 272); hand-to-hand still lands, as in DFU.

## Code and tests

- `src/net/staffEvent/staffEventLaw.js` - the event's shape, words and ledger, shared by service, relay and game
- `src/net/staffEvent/staffEventReceipt.js` - the reward receipt
- `server-account/src/staffEvents.js` - routes, rows, orders
- `server/src/staffEvents.js` - the hub's book, the cell's meter, the reward
- `src/systems/staffEvents.js`, `src/systems/raidingParties.js` - the event as a raid, packs, boss placement
- `src/systems/eliteFoes.js` - the mini boss's promotion and limits
- `src/systems/staffEventSpoils.js` - the drop table
- `src/systems/staffBossPilot.js`, `src/scenes/staffPilotHost.js`, `src/ui/staffPilotBar.js` - Play as boss
- `src/net/staffPlaces.js` - the place picker over the game's maps
- `tools/eventKinds.mjs` - regenerates the panel's kind list from the game's registry
- `test/server/staffevent_relay.test.js` - the relay's half
- `src/net/staffEvent/toyboxEvent.js`, `server-account/src/devEvents.js`, `src/net/toyboxEvents.js` - a toybox event,
  its route and its start
- `src/net/invasion/invasionBrain.js`, `src/net/invasion/invasionWire.js`, `server/src/invasionFights.js` - an
  invasion's fight, its words, and the cell that hosts it
- `src/systems/toybox/` (`invasionRun.js`, `toyboxNews.js`, `toyboxMarks.js`, `toyboxCities.js`,
  `localToyboxEvents.js`, `localInvasion.js`) - the boss's rise, laugh and fall; the news; the map and the timers; the
  cities; offline
- `src/net/invasion/invasionBlows.js` - the boss's phases and its blows' stamps
- `src/scenes/invasionField.js`, `src/scenes/invasionBossHost.js`, `src/scenes/invasionMarks.js` - the cell's fight
  drawn in the foe pool: its foes walked, struck through the cell, killed by its word; its blows drawn and landed
- `src/ui/toybox/invasionHud.js`, `src/ui/toybox/invasionTracker.js` - the side panel and the boss's bar
- `src/ui/eventMapMarks.js`, `src/ui/ink/inkMap.js` - an invasion's map mark, its words and its legend
- `test/net/toyboxevent_law.test.js`, `test/server/toyboxevent_relay.test.js`, `test/systems/toyboxevent_run.test.js`,
  `test/systems/toyboxcities.test.js`, `test/systems/toyboxevent_modoff.test.js`, `test/scenes/invasionbosshost.test.js`,
  `test/net/invasion/invasion_brain.test.js`, `test/net/invasion/invasion_phases.test.js`,
  `test/ui/invasionhud.test.js`, `test/systems/invasion_offline_hud.test.js`, `test/server/invasion_relay.test.js`

The Dwarven Dragon as a staff monster and an Admin's ride: `Dwarven-Dragon.md`.

## Open

- A kill and a stand are the player's machine's word; a forged word can bring a boss early, never stage or end an event.
- If the runner changes while a boss is being stood, two may stand for one call.
- An event past its end lapses at the hub's next touch.
- A fighter who drops at the boss's fall can miss their receipt; spoils are spent once a receipt a device, not an account.
- A pilot's boss walks at the pilot's pace; a drawn weapon still swings at a click.
- A hub woken again may say a toybox event's moment twice.
