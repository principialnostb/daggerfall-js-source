# Aura Armory

Cosmetic effects that float a little way off the body: a crown of flame over the head, a burning coal before the
chest, rings of light round the arms, a glow on the weapon. A piece is drawn over whatever body shows (the Eye of the
Beholder sprite, the Morrowind body, a peer's body) and changes none of it. The player buys pieces from the Sigil Broker and the shop,
wears them from the account card and the profile's character slots, and sees them on themselves and other players.

## How it works

- **The law** (`src/net/armoryLaw.js`, pure, importing nothing). Five slots (`ARMORY_SLOTS`): head, torso, arms, legs,
  weapon. Lines (`ARMORY_LINES`): Dagonfire (Crown of the Burning Door, Ember Heart, Ashbound Bracers, Cinderstride,
  Brand of the Breach), Eternal (Eternal Halo, Sigil, Armlets, Greaves, Edge), the guild's Insignia Armlet, the
  gifted Crystal Spurs (both arms pieces) and Tidebound (Tidebound Circlet, Pearl, Bracers, Greaves, Edge). A kit is
  five characters, one a slot: the piece's code or `0` (`ARMORY_EMPTY`).
- **Had.** A piece is the account's: every character may wear it. The Sigil Broker sells the Dagonfire pieces as
  insignia at 75 Deadlands Embers each (`ARMORY_BROKER_PRICE`, `src/net/insignia.js`). The shop sells the Eternal
  pieces at 600 Aurum each, or the set at 2,000 (`src/net/shopLaw.js`). The Insignia Armlet is bought in the guild
  window's shop; the Crystal Spurs were a gift to every account (`src/net/giftLaw.js`). The Tidebound pieces are sold
  only in the Courier's Cabinet in Discord, for Seals: 500 each, or the set at 2,000 (`src/net/discordShopLaw.js`). The
  service reads them off `players.discord_wares` (`server-account/src/titles.js` `cabinetKeys`). A ware already held is
  not sold again.
- **Worn.** `POST /v1/account/armory` takes a slot and piece, `null` to bare it, or a whole kit. The service refuses a
  piece not held or not of its slot, and a kit with one such piece whole. The kit worn is checked against what is
  held at every ask, so a refunded piece is not signed.
- **Online.** The service signs the kit as the token claim `ak` (omitted when none is worn); `src/net/identityToken.js`
  refuses unknown pieces; the relay badges it on the peer row. A change says hello again on a fresh token, so the room
  sees it at once.
- **Drawn** by `src/render/armoryPass.js` after each mode's opaque world, beside the auras, wired by
  `src/scenes/auraHost.js`. `src/render/armoryPose.js` turns the drawn body into seventeen points: a rig's bone origins,
  or on a sprite rows of the frame moved by the picture's own marks (head, chest, pelvis, arm edges, legs) read once at
  upload. Pieces add light, test depth without writing it, and take fog. Their light is cut to the auras' levels
  through the ordered dither (`src/render/auraPixel.js`), never snapped to texels: a piece is a hand's breadth of fine
  work, and blocked it was noise.
- **The hover law** (`src/render/armoryHover.js`). Every body piece floats a gap off its part and never touches it: 7 cm
  over the head or round it, 7 cm before the chest and behind the back, 6 cm round an arm, 5 cm round a shin
  (`ARMORY_HOVER`), measured from the body's own reach round the line the piece hangs on (`ARMORY_BODY`). Each piece,
  side and ring bobs a centimetre on a phase of its own (`armoryPhase`), and trails its wearer's motion by at most
  under half its gap (`ARMORY_LAG`). Every rate is whole over the auras' clock (`armoryHoverWhole`). A head piece's tip
  (`armoryHeadTip`) is the top of its bob, so a name plate over it holds still.
- **A ring round a limb** is tipped a little, its tilt turning slowly round the limb (`armoryRingAxis`), and fades out on
  its side toward the body (`armoryOpen`), where an arm or a shin stands nearer the torso or the other leg than the gap.
- **The card law.** On a sprite every point is lifted toward the eye, so pieces lie on the card's near side. A sprite's
  forearm and an arm hidden behind the body draw nothing. Seen from behind under a cloak, pieces draw before the
  cloth so it lies over them.
- **A sprite's arm** (`armClip`, `armWornSide`). The card hides nothing of a piece, so each arm piece is cut at its
  arm's inner edge as the eye sees it: the line half the arm's width in from shoulder to elbow, toward the chest on the
  card. Nothing of it, embers included, lands on the body. A far arm the picture never shows clear of the body (no band
  read) wears nothing: it is behind the torso, and its trace runs on the torso's edge.
- **A sprite's chest.** The torso's pieces lay their depth, the gap with it, along the eye's line through the painted
  chest, so they stay on it from every side, before the card from the front and behind it from the back. A picture has
  no depth across it, so there the gap shows only as the bob and the lag. Seen edge on, a card's chest piece is gone. From behind and to a side, the Sigil's back stands between the back's far edge and the
  near arm's inner edge, because the chest's run there takes in that arm.
- **The body's states.** Beast form hides every piece; a rider keeps head, torso and arms; sunk to the neck only the
  head draws; the player's own first person draws no body piece.
- **The Dagonfire line.** The Crown of the Burning Door floats over the head: a band of molten iron, horns of flame and
  the Door of white fire at its front, embers lifting off the points. The Ember Heart is a cracked coal hovering before
  the chest, beating; each beat throws embers out that fall. The Ashbound Bracers are loose rings of glowing chain, two
  on each upper arm and two on each forearm, ash falling off them. The Cinderstride is two rings of burning coal round
  each shin, flames licking up off them; each footfall leaves an ember on the ground.
- **The Eternal line.** The Halo floats over the head, tipped back, its lowest point the head's gap over it. The Sigil
  hovers before the chest, its twin behind the back. The Armlets are slim rings of light round the upper arm and the
  wrist, their engraving turning round them. The Greaves are two rings round each shin with a lattice of light, the top
  one the Origin's spark at its front.
- **The guild's and the gift.** The Insignia Armlet is the guild's crest on a gilt shield floating beside the left upper
  arm, a glow of the guild's colours behind it. The shield turns round the arm toward the viewer, never past
  `ARMORY_ARMLET.turn`, so its face shows from the front and from behind. The Crystal Spurs float off both arms, each spinning slowly on its own
  line and swaying a little round the arm.
- **The Tidebound line** (`src/render/armoryTide.js`) is the sea that follows the Courier, in sea-green to pearl
  (`TIDE_RGB`). Each piece has its own shape and motion, and no other line's code draws it. Every rate and life is
  whole over the auras' clock (`tideboundWhole`). The Edge is the weapon glow's (`Weapon-Glow.md`).
- **The Circlet** is a ring of sea-glass beads round the head at the brow, tipped lower at the front, with a pearl at
  the front. Each bead drifts up and down on its own (`tideBeadDrift`), a light runs round them, and drops of spray leap
  up in short arcs off the front and fall back (`tideSprayAt`). **The Pearl** is a nautilus shell hovering before the
  chest. Its whorls, chamber walls and mouth turn slowly, and a light runs in along the spiral to the pearl at its eye,
  which flares (`tideSpiralAt`, `tideShellPulse`).
- **The Bracers** are a stream of water coiling round each forearm, the arms' gap off it. Its ripples run toward the
  hand with foam on their crests, and drops fall from the hand (`tideStreamAt`). On a sprite it coils the upper arm about
  its band. **The Greaves** are surf on a sleeve of water round each shin, over the foot: wavy lines of foam wash up and
  fade, and drops run back down (`tideSurfLine`, `tideSurfAt`). Each footfall leaves a ripple on the ground
  (`tideRippleAt`).
- **The wolf** wears the torso, arm and leg pieces fitted to it (`ARMORY_BEAST_FIT`), its gap at its scale. Its legs'
  rings stand one to a shank, near the hock.
- **The weapon slot** is drawn by the weapon glow, not the pass (`Weapon-Glow.md`): every weapon in the player's hand
  wears it, and peers see it. A Gilded weapon's crimson shows first, then an element, then the armory piece, then the
  arcane look.
- **The profile's character slots** (`src/ui/characterSlots.js`): the character on a stage
  (`src/render/characterStage.js`) between eight slots (Head, Torso, Arms, Legs, Over the head, Weapon, Portrait,
  Aura). A choice is tried on the stage and worn through the account flow. The stage draws the body as the world does,
  by the world's own aura and armory passes.

## Rules

- Free mix: any piece fits beside any other, and there is no set bonus (the owner).
- Earned and bought: the Dagonfire set is the Sigil Broker's alone and very expensive; the Eternal set is the shop's,
  priced as the owner's $20 for the set (the owner). The Tidebound set is sold only in the Courier's Cabinet, for
  Seals. Players earn Seals in Discord and cannot buy them (the owner).
- Cosmetic always: a piece moves no number. The Wardrobe changes what gear is drawn as; the armory draws on top, and the
  two never read each other.
- A piece code is never reused and a stored bit never renumbered.
- At most `ARMORY_DRAW_MAX` (24) wearers draw, nearest first, within `ARMORY_RANGE_M` (60 m); past `ARMORY_DETAIL_M`
  (25 m) embers and motes stop. Others' Aura Armory (`armoryOthers`: All, Near within `ARMORY_NEAR_M` 20 m, None)
  limits peers; the player's own kit always draws.

## Daggerfall Unity

DFU has no accounts and no cosmetic effects. The Broker's sale extends the port's Sigil Broker.

## Code and tests

- `src/net/armoryLaw.js` - slots, pieces, kits
- `src/net/insignia.js`, `src/net/shopLaw.js`, `src/net/discordShopLaw.js` - the Broker's, the shop's and the
  Courier's Cabinet's offers
- `src/render/armoryPass.js`, `src/render/armoryPose.js` - drawing and the body's points
- `src/render/armoryHover.js` - the hover law: the gap, the bob, the lag, a ring's tilt and its fade
- `src/render/armoryTide.js` - the Tidebound line's shapes, their laws and their shaders
- `src/scenes/auraHost.js` - wearers each frame, auras and armory
- `src/ui/characterSlots.js`, `src/render/characterStage.js` - the profile's slots and stage
- `src/render/weaponPiecePreview.js` - a weapon piece's shop stage
- `test/render/armory.test.js`, `test/render/armorymirror.test.js` - drawing, sprite points, the card's right
- `test/render/armbehind.test.js`, `test/render/auditaurapixel.test.js` - the arm's cut, the chest from every side
- `tools/armoryProbe.mjs`, `tools/armorySpriteProbe.mjs` - the pieces on a real GPU; the first measures each piece's
  gap off the stand-in, the Morrowind body, the wolf and a sprite (`--scale 2` for sharp shots); the second on Layered
  Gearing in all eight views (`SETS=1`, `ANIM=Move:2` for a walk's frame), the arms and the chest read against the
  picture
- `test/server/armory_service.test.js`, `test/net/armorylive.test.js` - the service and the live room
- `test/ui/profileslots.test.js` - the character slots
- `test/net/courierscabinet.test.js` - the Tidebound line's pieces, their drawing and their holding
- `test/render/armorytide.test.js` - the Tidebound line's laws, each held to its shader
- `test/render/armoryhover.test.js` - the hover law, held to its shader, and every piece's gap on each body
