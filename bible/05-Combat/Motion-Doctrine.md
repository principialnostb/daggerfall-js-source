# Motion Doctrine - one formula for how bodies move and fight (MOTION-DOCTRINE, 2026-10-27)

The owner, 2026-10-27, after the BLOW-FLOW arc (`05-Combat/Blow-Flow.md`): of everything the animations do now, only the
two-hander's blows in first person are "100% done"; the rest "still looks doubtful" - "foreign and modified", "smooth
but sluggish", wooden. "I want one direction for animations and combat, so that it scales clearly to the world, the
enemies and future changes ... a clear system, not a local vision of each animation." And on the legs that stand still
under a blow while the body slides: "the legs are a CONSEQUENCE, not the cause."

This page is that direction. It is a design record, not a slice: it binds every motion change from here on (the
player in both views, peers, NPCs, enemies, new weapons and armour), and each slice that follows cites it and says
which rule it serves. Nothing here changes code by itself.

The port's own (SCOPE1, `01-Overview/Port-Doctrine.md`): Daggerfall Unity draws its people as billboards and its
first-person weapon as a sprite, so for the body it is no reference; Morrowind's clips (`02-Formats/Morrowind-Rules.md`)
and OpenMW's character controller are. Every rule below is presentation: the weapon machine's hit time, damage and
cadence stay DFU's (MW-PACE1, `05-Combat/Combat.md`).

## 1. The style, in one line

**Weighty, restrained, sharp at the moment of the blow.** Closer to Blasphemous than to Dead Cells: not bustle, but
mass and intent. The owner's own words over three sessions all ask for it - "fewer blows, but smooth, calm and in
step" and "a toy fight" (MW-PACE3) are one demand from two sides: not faster, not slower, but heavy and sharp.

### Two schools - and which one we are

- **The AAA school** (the big Skyrim SE mod lists, the owner: "hothouse, under an AAA slant"): long blends, soft
  springs, much sway; motion flows. Realistic and soft.
- **The stylised school** (Blasphemous - the owner: "consistency, dynamics and a fierce style"): strong key poses,
  quick transitions, held poses, hard contrast. Motion snaps from pose to pose, but never jerks.

The mechanisms of the two are the same (inertia, hitstop, hit reactions, weight); the difference is mostly in the
tuning. **Mechanisms from Skyrim, character from Blasphemous.** "Smooth but sluggish" is the AAA tuning on our
bodies; the target is the stylised one.

## 2. The formula

> **Weight sets the rhythm -> the rhythm sets the poses -> the poses are joined by one body -> the world answers.**

Six rules; the sixth bounds the other five, and SHARPNESS says which way every dial turns.

1. **WEIGHT - the one parameter.** The weapon, the armour and the body give the motion a mass: a two-hander lower and
   heavier, fists light, plate heavier still. An enemy carries a weight of its own. A new creature or weapon gets a
   number, not a hand-tuned set of animations - this is how the doctrine scales.
2. **RHYTHM - slow, sharp, slow.** A wind-up that holds, a strike that is nearly instant, a recovery that brakes.
   Never one speed for a whole motion, never a still frame. (MW-PACE3's `PACE` is this rule for the player's blow.)
3. **SILHOUETTE - every key pose reads in the pixels.** The amplitude is large enough to read at our resolution
   (CHAR-PIX1, `04-Characters/Look-Bench.md`), and the weight shows in the pose itself. Small, polite Morrowind
   amplitudes read as wooden once pixelated.
4. **CONNECTION - one body, one flow.** Every part of the body has one owner (section 4); a motion follows from the
   state before it; nothing leaps, nothing slides. First and third person are one picture; a series is one motion.
5. **RESPONSE - the world answers.** A hit, a block and a bash are felt: a short hitstop, a recoil, the target's
   reaction. Control comes first - a motion yields to the player's input.
6. **RESTRAINT - "not dynamics for the sake of dynamics".** Nothing moves without a reason; exaggeration is bounded by
   weight. Needless shake, particles or speed break the style as surely as woodenness does.

**SHARPNESS - the axis every dial is turned on** (the owner, 2026-10-27, agreeing: "yes, exactly smooth but
sluggish"): springs stiff and close to critically damped - they catch up fast and barely overshoot, heavy and
collected, never jelly; transitions short and key poses held; a hitstop short and firm. Where a rule could be met
softly or sharply, it is met sharply.

### The formula as a diagnostic

When something looks wooden, walk the rules instead of guessing:

| Symptom | Rule broken |
| --- | --- |
| A pose does not read | SILHOUETTE |
| One speed throughout; a still frame | RHYTHM |
| A leap, a slide, a snap | CONNECTION |
| A blow "into the air" | RESPONSE |
| Bustle, sway, shake | RESTRAINT |
| Smooth but sluggish | SHARPNESS |
| A heavy thing moving like a light one | WEIGHT |

## 3. The owner's earlier fixes, read through the formula

| What the owner asked | Rule |
| --- | --- |
| "a toy fight"; blows at different speeds; "a frozen last frame" (MW-PACE2/3) | RHYTHM |
| the two-hander lower at the hip, the hands wider, the legs stiffer at a run (BODY-MOTION, THE RUN) | WEIGHT, SILHOUETTE |
| the window after a blow jerks; the sword twitches after a bash; the left arm twitches on stopping (BLOW-FLOW, BASH-EXIT, LEFT-ARM) | CONNECTION |
| held or tapped, one series (SERIES-FLOW) | CONNECTION |
| first and third person agreeing - "everything is great" | CONNECTION |
| the shield guards and bashes (SHIELD-GUARD, SHIELD-BASH) | WEIGHT, RESPONSE |
| "sprinting with my mace and shield out just makes me look incredibly stupid" (SHIELD-RUN) | SILHOUETTE, RESTRAINT |
| the legs standing still under a blow, the body sliding (this page, section 5) | CONNECTION, WEIGHT |

The owner was mending one formula all along, a piece at a time and without its name. Why the two-hander in first
person works: its long clips carry a clear arc and mass, and RHYTHM's contrast lands on a heavy weapon naturally;
the same law makes a short one-hander's or a fist's clip bustle.

## 4. Who owns the body

The layer model every slice builds on (the stylised school's and the AAA school's alike; only the tuning differs):

| Part | Owner | What it gives |
| --- | --- | --- |
| Legs and pelvis | always the locomotion (stand, walk, run), the feet planted | no sliding; standing, the legs answer a blow: a weight shift, the lead foot's step |
| Trunk | the locomotion and the blow mixed: the blow turns the trunk, the run sways it | the blow comes from the hips, not the hands alone |
| Arms | the blow, the carry, the shield | the clip's own arc; MW-PACE's laws as they stand |
| Over everything | additive reactions: a hit, a block, a landing | life without breaking the clips |

**THE CLIPS DRAW THE ARC; THE RULES ADD THE LIFE AROUND THEM.** The upstream BODY-MOTION layer drew a blow's hand path
procedurally (`melee.js`), and the fork took it out on 2026-10-21 (commits `59b984bff5`, `e0cc652438`, `20dd11a7b5`,
`579955d0c1`) because "the upstream melee hand keys made third-person strikes worse". That judgement stands: a rule
never redraws the path of the arms and the weapon. Its place is the legs, the body's weight, inertia and response.

## 5. The known gap this starts from - the legs under a blow

In third person a frame poses ONE winning clip on every bone - action over movement over jump over idle
(src/combat/fpArm.js:"const state = deathState || actionState"). While a blow plays, the attack clip owns the pelvis and the legs,
and a Morrowind attack clip stands still: the feet freeze while the capsule travels, and the body slides.
BODY-MOTION closed this by walking the legs under the blow ("The legs keep walking", `04-Characters/Body-Motion.md`),
but since the fork's 2026-10-21 commits the layer steps aside for every blow and for an unarmed body
(src/characters/bodyMotion/bodyMotion.js:"if (cls === 'free' || bp)") and no longer drives the legs at all, so the gap is open again.

The reference has no such gap: OpenMW resolves priority per bone group (rule 26, `02-Formats/Morrowind-Rules.md`) -
a weapon group plays at `Priority_WeaponLowerBody` on the lower body, below `Priority_Movement`, so while the actor
moves, its legs keep the movement clip and its torso and arms strike. Porting that vector is the first step of the
pilot (section 7), and it is CONNECTION's foundation for everything after it.

## 6. What the references gave, and what is not taken

**Mechanisms (Skyrim SE mods, read 2026-10-27 - ideas only; no mod file is ported without its author's permission):**

- *First Person (FP) Inertia* (TheShinyHaxorus, Nexus 167883, source on GitHub, MIT per its README): drag of the
  first-person hands and weapon from the camera's turn and from movement, sprint in and out, jump and landing; one
  spring per weapon type - `stiffness`, `damping`, `mass`, `maxOffset`, `maxRotation`, a pivot (wrist or clavicle) -
  and a second spring for movement. Our WEIGHT classes are its presets; SHARPNESS sets their stiffness.
- *FP Camera Settle* (the same author, 168531): the first-person camera's inertia and settle on walk, run, jump,
  landing, sneak, a shot, a hit given and taken. RESTRAINT applies hard: Daggerfall is a fast game.
- *Inertia - Physical Movement Response System* (Zzyxzz, 172783): engine-level, carry-weight-scaled acceleration,
  deceleration, reverse resistance and a turn slowdown; it changes acceleration, never top speed. A gameplay change -
  not in the pilot (section 7, decision).
- *Precision* (Ershin, 72347): the RESPONSE reference. The hitstop slows only the two actors involved, never the
  world; the hit reaction (a physics impulse on the struck limb, toward the swing) is delayed until the hitstop ends;
  the camera shake is a smooth sine; each further hit of one attack gets a shorter hitstop; a recoil when the blade
  meets stone or metal close to the hand (a graze by the tip does not), interruptible by attacking or moving; attacks
  described in a config file, creatures included.

**Character:** Blasphemous (the stylised school, section 1); Dead Cells for the pipeline - 3D models animated and
rendered down to low-resolution pixels, which is our mesh plus CHAR-PIX1. Overgrowth (David Rosen, GDC 2014, "An
Indie Approach to Procedural Animation" - a few key poses plus procedural rules) is the closest known precedent for
this doctrine's approach and is still to be studied.

**Not taken:**

- *Stepped animation* (bodies posed 12-15 times a second, Guilty Gear Xrd's limited animation) - proposed and set
  aside by the owner in favour of the polished stylised school ("not cheap retro for the sake of retro").
- *Squash and stretch of the mesh* - 2D's deformation on a body in Skyrim plate would read as absurd; weight is
  carried by pose, timing and the body's drop.
- *Rigid plate wobbling like cloth* - only loose pieces on their own bone (tassets, faulds, pauldrons where the
  Skyrim set has them separate) may lag the body, by a few degrees; whether a piece can is checked on our set when
  that step comes.

## 7. The pilot - plate and the two-hander in third person

Chosen because it is the heaviest case (WEIGHT shows clearest), the worst now (the slide, the wooden trunk), and its
armour is ready (MW-IRON1, `04-Characters/Skyrim-Iron-Set.md`). The two-hander in first person is not touched: it is
the gold standard the third person is held to.

1. **The legs under a blow** - OpenMW's per-bone-group priority (section 5).
2. **WEIGHT** - one number from the armour and the weapon, setting the lean at a start and a stop, the trunk's sway,
   the stride's width, the landing's drop.
3. **RHYTHM and SILHOUETTE of the two-hander's blows** - retimed and widened by the laws the first-person two-hander
   follows (MW-PACE3), the lead foot's step and the trunk's turn; the clip's arc untouched (section 4).
4. **RESPONSE** - a short, firm hitstop on the viewer's own screen only (multiplayer is never slowed), Precision's
   shape. Trails and the recoil off stone come later.

**Step 1 BUILT (LOWER-BODY, 2026-10-27), not yet judged in the game.** `src/combat/lowerBodyLayer.js`: rule 25's
LowerBody mask (every bone not under "bip01 spine1" - pelvis, legs, lower spine, tail, root; none on a skeleton without
it, so creatures are untouched) answered by the movement's clip, else the jump's, at its own clock, while a blow wins a
third-person frame and no recoil or death does - laid over the single winner as a weighted overlay on LEFT-ARM's
shape, eased in over `LOWER_BODY_EASE.in` (0.08 s) and out over `out` (0.12 s). The rig wires it in three lines
(src/combat/fpArm.js:"lowerBody.stepRig(dt") and wraps the third-person pose's tracks and sampler with it; peers and
NPCs pose through the same rig, so they get it too. The switch is the mod setting `morrowind-animation`
`MotionDoctrine` ("Формула движения (3-е лицо)": Как сейчас / По формуле, default По формуле). Pinned by
`test/combat/lowerbody.test.js`. Not checked in the game: the app's own browser has no Morrowind.bsa (the player
supplies it), so the owner's own game is the check.

**Step 2, its first half BUILT (BODY-WEIGHT, 2026-10-27), not yet judged in the game.**
`src/characters/bodyMotion/bodyWeight.js`. WEIGHT is one number, 0 to 1 (`bodyWeightOf`): the worn pieces' shares of
a suit (`PIECE_SHARE` - the cuirass .32, the greaves .2, helm and boots .1, each pauldron .07, gauntlets .06, a shield
.08) times their material's heft (`MATERIAL_HEFT` - leather .3, chain .6, plate 1), mixed .65 with the weapon's .35
(a two-hander 1, any other weapon .45, fists 0). THE LEAN reads the body's REAL travel (`player/motor.js` travelAt, in
the body's own facing), follows its velocity over `LEAN.velTau` (0.08 s) and asks the trunk `LEAN.accel` (0.01) radians
per m/s^2 of the change - pitched forward into a start, back against a stop, rolled toward a sidestep (`side` .6),
never past `max` (0.3 rad) - through a spring, `omega` 14 light to 9 heavy and `zeta` 0.5 to 0.42, so it overshoots a
little and settles (SHARPNESS), and `gain` .5 light to 1 heavy. Measured from a standstill: to a walk (4.4 m/s, DFU's at
Speed 50) a bare body leans 6.9 degrees, peaking in 8 frames, full plate and a two-hander 10.5 in 13; to a run
(8 m/s) 11.3 and 14.2; the stop's lean back about the same, then 0.6 to 2.7 degrees through rest. (The first cut asked
0.006 - 4 degrees at a walk - and the owner, walking in plate: "I see no difference"; SILHOUETTE: a lean the pixels do
not show is no lean.) **SWAY** carries the mass through a steady walk, where the lean has nothing to answer: a heavy
body leans into its travel (`SWAY.carry`, 0 bare to 0.07 rad full, at a walk's pace) and shifts its trunk over the
foot it stands on with every step (`SWAY.roll`, 0.012 to 0.075 rad), read off the clip's own feet each frame - the
lower foot is the standing one - so it is always in step. It is ADDITIVE: the turn spread evenly up the spine above the bone the thighs hang
from (`leanTrunk`), the legs and the hips the clip's, the arms' arc the clip's; off the ground, swimming, on the stone,
seated or dead it eases back to the clip's. The rig steps it beside the body motion
(src/combat/fpArm.js:"bodyWeight.stepRig(dt") and lays it over that layer's slot; the same switch, `MotionDoctrine`. Pinned by
`test/characters/bodyMotion/bodyweight.test.js`. Still owed in step 2: the stride's width by weight and the
landing's drop.

**IDLE-SETTLE (2026-10-27), a CONNECTION fix found on the way** (the owner: "when the character stops, the animation
into the idle plays and the feet are set a little differently - after any movement it plays twice"). The reference
restarts the idle from its start the frame a movement empties (character.cpp:646-651, MW-D29), and a stance's idle
shifts its weight: Morrowind Animation Overhaul's Idle1h moves both thighs twice in its first three seconds (0.3-0.7 s
and 2.3-2.7 s, measured off its own tracks), Idle2c the same. Every stop drew the cross-fade's settle and then the
clip's shuffles. `src/combat/idleSettle.js` begins a stop's fresh idle at its QUIET start - where its lower body
(pelvis, thighs, calves, feet, root) moves least over the next `IDLE_SETTLE.window` (1.2 s), read once per source and
group off the clip itself: Idle +1.35 s, Idle1h +0.65, Idle2c and Idle2w +1.8, Idlehh +0.75. The loop dice and the rest
of MW-D29's reset stand; only the start point departs, behind the same switch. Pinned by
`test/combat/idlesettle.test.js`. Not judged in the game yet.

Then the first-person hands' inertia (FP Inertia's shape). Every step sits behind a switch "as now / by the formula",
is judged by the owner in the game, and lives in a module of its own (HOST-SPLIT, `01-Overview/Host-Split.md`).

**Decision taken for the pilot (recommended, the owner to confirm): the motion of the character is not changed.** The
animation only reads the real velocity - the lean from the real acceleration, the stride from the real speed - so
nothing slides and control, balance and multiplayer are untouched. True inertia of plate (Inertia's shape) is a
separate decision, later.

## 8. Open

- Whether BLOW-FLOW's soft blends (`exit` 0.5 s back to the stance) lean AAA - "smooth but sluggish" may start there;
  re-tune toward SHARPNESS when the pilot reaches the blows.
- Research still owed: PLANCK (FlyingParticle - the active-ragdoll hit reactions Precision uses), a few two-hander
  movesets on Nexus, Overgrowth's talk, Blasphemous' and Dead Cells' own accounts of their timing.
- Clip selection by condition (armour weight, weapon, state - OAR's shape) is designed for now and built when the
  enemies come.
