# Toybox

A developer's own tools in one window. A developer types `/toybox` in the chat; offline play has no chat, so there the
`/` key opens a one-line command bar that takes the same line. Anyone without the `dev` glyph gets the chat's own
"unknown command", and offline the key does nothing for them. It is staff work: no player patch notes describe the
window itself, though players do meet its invasions and dragon attacks.

## How it works

**Who.** Online, the `dev` glyph the account service signs (`server-account/src/titles.js` `glyphsOf`, from
`DEVELOPER_HANDLES`). Offline the toybox is self-contained and asks no server anything, so no service can say who is a
developer: it opens on a local build (`npm run dev`) alone, and a production page offline has none. Every act that
reaches another player is checked again by the relay or the account service. Losing the glyph closes the window and
turns Ghost and No-Clip off.

**The window** (`src/ui/toybox/toyboxWindow.js`). Semi-transparent, moved by its title bar, closed by its X or Escape.
Toggles stay lit while on. Summon is greyed offline, because no other player is there to bring.

| Option | What it does |
|---|---|
| Invincible | `/god`: no damage reaches the developer |
| No-Clip | flies through the world at `NOCLIP_RUN_MULT` times their running speed, no collision (`src/player/noClip.js`) |
| Ghost | unseen by every player but developers and moderators; drawn faint on their own screen and to staff |
| Teleport | a popup: Open Map is the world map as a portal stone opens it, its button "Teleport" and the arrival instant; To Player goes to where a named online player stands (`/tp @player`'s path), greyed offline |
| Summon | brings a named online player in front of the developer (`/tpa`'s path) |
| Create Item | the forge: any wearable piece, its fields, special effects, enchantments and side effects, granted to a pack |
| Invasion | stages a siege of a city by a family of foes |
| Dragon Attack | calls the world's Dwarven Dragon down on a city |

**Ghost** (`server/src/staffGhost.js`). The developer's socket sends `ghost`; the relay takes it only from a `dev`
glyph. While on, its poses, its place in rosters and counts, and its joins and leaves reach only sockets whose glyphs
hold `dev` or `mod`. Everyone else sees a leave when it turns on and a join when it turns off. The hub's search and
World list, chat channels and friends' presence do not hide a ghost yet.

**Create Item** (`src/ui/toybox/itemForge.js`, `src/systems/toybox/toyboxItem.js`). The editable fields are the ones a
piece carries: material, condition, weight, value, name, special effects, enchantments, side effects and Soulbound.
Damage and armour follow from the template and material, shown and not typed. The enchantment list is the item maker's
own for that piece. Online, `/v1/dev/item/grant` (`server-account/src/devToybox.js`) takes a developer's game session,
mints the piece, holds it to the item law and sends it as server post; a grant to oneself is claimed at once, another
account's waits in its mailbox. Offline the piece goes straight into the pack, and another account is refused. The
found-item banner shows with a moving rainbow border and the delve puzzle's fanfare.

**Special Effects** (`src/systems/toybox/toyboxSpecial.js`) stands above Enchantments. Set bonuses: any set's
membership at a chosen stage; an Aetheric set whose record is this template makes that record. Special moves: the
family's techniques, and the Legendary and Gilded records the piece may be. Special effects: the bonuses a found Rare
of its group can roll, at a Rare's range, and a weapon's Sigil. A piece with them and no record is a Rare. Its own
enchantment is the first Enchantments row a found Rare carries; with none, the law refuses it online. Each is laid as
the loot doors lay it. The stats and the law's findings show live: a row the law refuses is marked Offline only.
Online it blocks the grant; offline the piece goes in as made.

**Invasion and Dragon Attack** are staff events the toybox stages through `/v1/dev/event`
(`server-account/src/devEvents.js`), or through the local runner offline (`src/systems/toybox/localToyboxEvents.js`).
Every screen is told, the city is marked on the map with a countdown, and nothing stands for `TOYBOX_EVENT_WAIT_MS`
online or `TOYBOX_EVENT_WAIT_OFFLINE_MS` (a minute) offline. An invasion's purple mark reads "Invasion in 0:42", then
"Invasion Active". Online the relay hosts the invasion as it hosts Dagon's Breach: its city's cell owns every foe's
health and judges every blow first. Offline this machine runs the same brain for the one player. Its waves, rising
boss and rewards are in `Staff-Events.md`. Near its city a side panel counts the waves left, as the Starfall's does.
The risen boss has the gate's bar with three phases, and its blows are telegraphed on the ground. They run whether or not the Raiding Parties mod is on.

**Dragon Attack** calls the world dragon, not a raid boss: at `go` a real Dwarven Dragon lands at the city, with its own
roost, fight, blows, receipt, hoard and tame (`Dwarven-Dragon.md`, "A called dragon"). Online the relay hosts it; offline
this machine runs the relay's own brain for the one player, and the hoard comes with no claim and no tame.

Its orange mark reads "Dragon Attack in 0:42", then "Dragon Attacking for 39:10". The event ends with its dragon: when
it falls, or the moment it leaves unslain. Its mark and Timers row go with it.

**The city's guards** treat both fights as a raid. While I stand at a live invasion (its side panel up), or a dragon's
fight is on my street, `raidHere` in `src/scenes/cityGuards.js` answers true. My blows pass the town's walkers and
guards by, so a stray swing is no Assault or Murder and calls no watch. A natural dragon fought in a town counts too.

## Rules

- Developers only; the relay and the account service each check the glyph again.
- Every grant and every staged event writes a staff audit row.
- Online, a granted piece passes the item law. Offline, only its special effects may be what the law refuses.

## Code and tests

- `src/systems/toybox/toyboxLaw.js` - the options, the gate, the constants and the lines
- `src/net/invasion/invasionBrain.js`, `server/src/invasionFights.js`, `src/systems/toybox/localInvasion.js`,
  `src/scenes/invasionField.js` - an Invasion's fight, hosted by the relay's cell or offline by this machine, and drawn
- `src/net/invasion/invasionBlows.js`, `src/scenes/invasionMarks.js`, `src/ui/toybox/invasionHud.js`,
  `src/ui/toybox/invasionTracker.js` - its boss's phases and telegraphed blows, its side panel and its bar
- `src/systems/dragon/calledDragons.js`, `src/systems/dragon/localDragonFights.js` - a Dragon Attack as the world dragon,
  and its fight offline
- `src/scenes/toyboxHost.js`, `src/scenes/toyboxWorld.js` - the window's host and its wiring into the world
- `src/ui/toybox/`, `src/ui/offlineCommandBar.js` - the window, popups, forge and the offline bar
- `src/systems/toybox/toyboxItem.js`, `src/systems/toybox/toyboxSpecial.js` - the forge's pure maker and its special
  effects (`test/systems/toyboxitem.test.js`, `test/ui/itemforge.test.js`)
- `test/scenes/toyboxworld.test.js`, `test/scenes/toyboxhost.test.js`, `test/server/staffghost.test.js`,
  `test/server/devtoybox.test.js`, `test/systems/toyboxdragon_local.test.js`, `test/server/dragon_called_relay.test.js`
