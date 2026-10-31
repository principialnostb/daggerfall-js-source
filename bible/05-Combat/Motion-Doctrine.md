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
(src/characters/bodyMotion/bodyMotion.js:"if (cls === 'free' || !(entry > 1e-3))" - since BLOW-ENTRY, 7c, over its first 0.12 s) and no longer drives the legs at all, so the gap is open again.

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

**Step 1 BUILT (LOWER-BODY, 2026-10-27), JUDGED in the game (2026-10-28, the owner: "how the character walks or runs
during a blow is done very well, and the sidestep with a weapon too").** `src/combat/lowerBodyLayer.js`: rule 25's
LowerBody mask (every bone not under "bip01 spine1" - pelvis, legs, lower spine, tail, root; none on a skeleton without
it, so creatures are untouched) answered by the movement's clip, else the jump's, at its own clock, while a blow wins a
third-person frame and no recoil or death does - laid over the single winner as a weighted overlay on LEFT-ARM's
shape, eased in over `LOWER_BODY_EASE.in` (0.08 s) and out over `out` (0.12 s). The rig wires it in three lines
(src/combat/fpArm.js:"lowerBody.stepRig(dt") and wraps the third-person pose's tracks and sampler with it; peers and
NPCs pose through the same rig, so they get it too. The switch is the mod setting `morrowind-animation`
`MotionDoctrine` ("Формула движения (3-е лицо)": Как сейчас / По формуле, default По формуле). Pinned by
`test/combat/lowerbody.test.js`. Not checked in the game: the app's own browser has no Morrowind.bsa (the player
supplies it), so the owner's own game is the check.

**Step 2, its first half BUILT (BODY-WEIGHT, 2026-10-27) - its lean, carry and sway SET ASIDE at the owner's word
(7d); the weight number stays, read by ARM-CLEARANCE and BLOW-LEGS (7f).**
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

**Step 4 and step 3 BUILT together (FP-INERTIA and HIT-RESPONSE, 2026-10-27), at the owner's word ("one package"), not
yet judged in the game.** The switch covers both and is now titled «Формула движения».

- **FP-INERTIA**, `src/combat/fpInertia.js`: six springs on the first-person viewmodel (yaw, pitch, roll; right, up,
  back), pivoted at the shoulder (`FP_INERTIA.pivot`) and laid in front of the lens as the gun's kick is
  (src/combat/fpArm.js:"const view = fpInertia.view("). The look: `look.yaw` 0.018 to 0.032 rad of lag per rad/s of turn
  (a turn right swings the arms left), `look.pitch` 0.014 to 0.026 against a glance, never past `maxRot` 0.16; a slide
  against the turn and a roll into it (`slide`, `roll` .35 of the yaw lag). The body: `move.gain` 0.0009 to 0.0015 m
  per m/s^2 of its real acceleration (back toward the eye on a start, sideways against a step), never past `maxMove`
  0.05 m. A landing dips the arms (`land.dip`, full after `fall` 0.8 s aloft), a jump lifts them. Springs `omega` 18 to
  11, `zeta` 0.55 to 0.45 - light to heavy by BODY-WEIGHT's number. At rest no matrix is laid. The idea is First Person
  (FP) Inertia's (Nexus 167883, MIT), the code the port's own. Pinned by `test/combat/fpinertia.test.js`.
- **HIT-RESPONSE**, `src/combat/hitResponse.js`, on the player's landed melee blow (src/combat/playerWeapon.js:"hitResponse.hit({ foe, damage"):
  a HITSTOP of `stop` 0.05 to 0.095 s by the weapon's weight (heavy at `kg` 6), times 0.7 to 1 by the damage (full at
  `hard` 18), x `diminish` 0.6 for each further foe of one swing (`swing` 0.25 s) - holding the striking arm (the
  player's rig's clock, both views: src/combat/fpArm.js:"dt = hitResponse.armDt(dt)") and the struck foe's own frame
  (src/characters/mobile/mobileUnit.js:"dt = hitResponse.unitDt(this, dt)"), never the world; the foe's reaction - DFU's
  knockback and hurt frames, which the blow starts - plays out after the beat. A SOFT SHAKE: `shake.deg` 0.35 to 0.8
  degrees, an 18 Hz sine decaying over `tau` 0.1 s, laid and taken back on the look beside DFU's own reel
  (src/player/cameraRecoiler.js:"const hs = paused ? [0, 0] : hitResponse.shake(dt);") - DFU's recoil setting is not its switch.
  The idea is Precision's (Nexus 72347), the code the port's own. Pinned by `test/combat/hitresponse.test.js`.
  Not here yet: a Morrowind-bodied foe's own rig is not held (only a sprite unit's frame is), arrows and spells give
  no beat, and the recoil off stone is still to come.

## 7a. THE SWEEP (2026-10-27) - every movement clip, measured

The owner: "run all the animations yourself, walking to running, the neutral state with and without a combat stance -
every variation - find the problems and fix them; I see many small problem moments." The game in the app's own
browser has no Morrowind data (the player supplies it through a picker), and serving the owner's install to it was
refused as exposing a local service, so the sweep ran in Node on the player's own Morrowind.bsa (`D:/Steam/.../Data
Files`, read in place, never copied) through the port's own readers - mwBsaFile, mwNifFile, mwAnim (collectTextKeys,
normalizeTextKeys, extractTracks, sampleTrack, animVelocity), mwSkin (poseSkeleton, skeletonSpaceMatrices) - over
every idle, walk, run, sneak and turn group, bare and in each stance (1h, 2c, 2w, hh), and over the installed packs
(ReAnimation's first-person movement and idles, Morrowind Animation Overhaul). Three findings, three fixes, all
behind the same switch:

1. **THE LEGS STEPPED 2 TO 4 TIMES TOO FAST (STRIDE).** Daggerfall moves the body at 4.4 m/s walking, 8.1 running and
   about 1.9 crouched (player/motor.js at Speed 50); the clips' roots travel 2.2, 3.2 and 0.48 m/s. The reference's
   rate (body speed over clip speed) kept the feet planted by playing the legs at 2x, 2.5x and 4x - frantic little
   steps. `src/characters/bodyMotion/stride.js` shares the ratio `k`: the clip plays at `k / stride` and the thighs
   and calves swing `stride = min(maxStride 1.45, k ** (1 - cadence 0.5))` times as far about the cycle's own mean
   turn, the body lowered by however much the lower foot rose. Measured: a walk's cycle 0.50 -> 0.71 s, a run's
   0.37 -> 0.53, a sneak's 0.77 -> 1.11, the planted foot's ground speed unchanged (no new slide) and its lowest point
   the clip's own. A turn in place keeps its own rate.
2. **THE FEET SLID (FOOT-SPEED).** The reference divides by the accumulation root's travel; retail's clips do not keep
   their feet to it. The planted foot's own pace against the root's (MW units/s): walkforward 135/154 (a 12 per cent
   slide), walkleft 81/121 (33), walkright 78/121 (35), runforward 215/223 (4), runback 128/226 (44), runleft 73/104
   (30), runright 82/104 (22), sneakleft 17/27 (35). `clipFootSpeed` measures the clip's grounded foot on the rig's own
   skeleton once per source and group, and the rate divides by it (src/characters/bodyMotion/stride.js:"export function clipFootSpeed" - unwired since 7d) - PX29's law
   holds: it is the playing clip's own number.
3. **THE LOOP SEAMS (LOOP-SEAM).** Retail's sneakforward2c and sneakforward2w end with the left knee 11 units from
   where they start - a jump at every wrap; MAO's turns 2 to 4.6. `src/combat/loopSeam.js` carries a looping movement
   or idle clip's last `window` (0.15 s, at most a fifth of the loop) toward its start, per bone, by the seam's own
   difference: measured 10.9 -> 1.2 and 11.5 -> 0, no frame's step larger than before. Seams under 0.02 rad and 0.3
   units are left alone; ReAnimation's first-person clips have none.

Pinned by `test/characters/bodyMotion/stride.test.js` and `test/combat/loopseam.test.js`; PX29's, BODY-WEIGHT's and
LOWER-BODY's pins moved with the lines they read. Not done by this sweep: a look at the composed body in the game
(the layers over the clips, the cross-fades) - that needs the player's data in the browser, so it is the owner's
eye; the strafes and the run back still lean on the stride's cap where their ratio is largest.

### 7b. The sweep in the owner's own game (2026-10-28)

The owner's running game (`localhost:5173`, Claude in Chrome, ~110 frames a second; the owner's plate and horned helm,
Morrowind Animation Overhaul and OpenMW Dynamic Animations on) driven through a scene of keys while a probe read the
drawn body's bones every frame (`fpArm.thirdBones`). **TURN-GATE**, the owner's "the settle after any movement plays
twice", found there: every stop drew `walkback` -> `turnright` for six frames -> `idle` - the yaw twitches the frame a
body stops, and the port started a turn in place on any change of it (MW-D39's `d !== 0`), so the cross-fade into the
idle was cut by a turn clip whose feet step, and began again; the right foot leapt 0.45 m in one frame. A turn in
place now needs `TURN_GATE.rate` 0.6 rad/s for `frames` 2 running (src/combat/idleSettle.js:"export const TURN_GATE");
measured after: `walkforward -> idle`, `walkback -> idle`, the largest foot move in a frame 0.06-0.08 m. MW-D26's pin
moved with it (two frames of a turn). Pinned by `test/combat/idlesettle.test.js`.

**MAX-RATE**, found in the same run: the playback rates the stride and the foot's pace asked in the owner's game -
walkforward 1.65, runforward 1.63, runback 2.74, **runleft 3.86** - Daggerfall strafes at the full run, and a run
sideways's clip plants its foot at 73 units a second, so the legs scurried. The clip now plays at most
`STRIDE.maxRate` 2.4 times its own speed; the rest of a strafe's speed is a slide, the lesser evil
(src/characters/bodyMotion/stride.js:"return { rate: Math.min(STRIDE.maxRate, k / stride), stride };"). Pinned by
`test/characters/bodyMotion/stride.test.js`.

### 7c. The combat sweep (2026-10-28) - a longsword and shield, then a claymore

At the owner's word ("check everything first, then fix, then one restart"), the owner equipping each set: every
movement and stop, a jump standing and running, the sneak, single blows in each drag direction (chop, both slashes,
both diagonals, the thrust), click series every 0.25, 0.45, 0.7 and 1.0 s, the button held, blows walking, running and
strafing, a blow stopped on, a blow off a jump, a blow then a sheathe. A probe read the drawn bones and the clip state
every frame; a single-frame jump three times its neighbours' and over 7 cm was flagged. Found and fixed:

1. **SHOWN-POSE** - every cross-fade began from the RAW clip pose (mwFirstPerson.js poseAssembly's `rawPose`), so a fade
   begun while another ran jumped by the unfinished part: the second frame of every claymore blow (the hands 0.22-0.25 m,
   the blade 0.38 m, the same in every direction and series), stops after blows on the move, the landing of a running
   jump (the feet 0.4-0.5 m, the shield 0.3). Both views now fade from the pose the frame showed
   (src/combat/idleSettle.js:"export function blendSourceOf").
2. **MOVE-GRACE** - a running jump landed runforward -> idle (one frame) -> runforward: a movement that empties now
   waits 0.06 s before MW-D29's reset (src/combat/idleSettle.js:"export const MOVE_GRACE"); MW-D26's stop pin waits
   with it.
3. **ELBOW-OUT** - the claymore's left elbow stood 0.02-0.05 m off the spine's axis, inside the cuirass (the owner's
   screenshots): the grip's elbow way, once down, left and a little back, is now out to the left and forward
   (src/characters/bodyMotion/carry.js:"haf.pole = norm(add(scale(F.right, lerp(-0.55").
4. **SERIES intent 0.85** - a click every 0.7 s fell out of its series and the idle cut in for 0.09 s between blows
   (src/combat/weapon/attackSeries.js:"export const SERIES").

Measured and sound: the cadences (walk 1.68, run 1.38, strafes 1.9-2.4, back 1.6-2.2 - no scurry), the stops
(`walk -> idle`, no turn), the sneak, the series at 0.25 and 0.45 s and the held button (one blow group throughout).
**The re-run after those fixes** (the same scene, the claymore) measured what they missed: the elbow 0.08-0.12 m off
the spine (better, not clear - its way turned further forward, -0.55/-0.3/0.8); the landing flicker still there (the
grace had been off while airborne, and the landing's flicker IS an airborne frame - the grace now holds through it);
and the blow's second-frame leap unchanged at 0.38 m with the clip's own time barely moving (323.27 -> 323.28) - not a
fade at all but **BLOW-ENTRY**: BODY-MOTION stepped its carry aside in the blow's first frame, so the hands left the
carry for the clip in one; it now lets go over `MOTION_EASE.blowEntry` 0.12 s, as BLOW-RETURN takes it back.

**The third run** showed the landing clean (`runforward > jump2c > runforward`) and two misses, traced frame by frame:
the blow's leap was the cut of its own entry fade - on frame 0 the fade began (the stance still shown), on frame 1 the
action's source was picked again and the rig took that for a new transition, which within one blow blends in 0 s, so
the blade stood in the wind-up whole. **BLEND-CARRY**: a 0 s transition now lets a running fade finish
(src/combat/idleSettle.js:"export function carriesBlend"). And the elbow did not move with the haft's pole because the
stance's arm is the CLIP's: **ARM-CLEARANCE** (src/characters/bodyMotion/armClearance.js) takes an elbow inside the
trunk - an ellipse about the chest, `width` 0.5 and `depth` 0.42 of the shoulder width, `armor` 0.14 more each at full
armour - and swings the arm about its shoulder-wrist line the least way out (at most 0.9 rad), the hand's place and
turn kept; a hanging arm (14 units out on retail's 21.75-unit shoulders) is clear. It runs last in the third-person
motion slot, over the lean. Pinned by `test/characters/bodyMotion/armclearance.test.js`.

Seen and NOT changed, the owner to decide: a sheathe (Z) pressed mid-blow is dropped, not queued; a blow clicked in the
air starts on the landing. Pinned by `test/combat/idlesettle.test.js`.

### 7d. SET ASIDE - the procedural locomotion (2026-10-28)

The owner, after the sweeps: walking and running "in combat, and the sidestep with a weapon, are done very well", but
"how the character walks and runs out of the combat stance looks very bad - it sways strangely walking, the run is
strange too"; "the old walk and run were fine in quality ... now everything has gone wooden". Traced: out of a stance
the walk is OpenMW Dynamic Animations' female `WalkForward_base15` (the PlayerWalkSource default picks it for a female
body) and the run MAO's - two packs - and over them STRIDE stretched the legs and slowed their cadence, FOOT-SPEED
re-timed them, and BODY-WEIGHT leant and swayed the trunk. Procedural motion over the clips read as plastic: the
stylised school's life is the clips' own (section 1). So, at the owner's word:

- **STRIDE, FOOT-SPEED and MAX-RATE are unwired** (src/combat/fpArm.js no longer reads `strideLaw`; the rate divides by
  the playing clip's root velocity again, PX29's pin as it was). `src/characters/bodyMotion/stride.js` and its tests are
  kept - its measurements stand (the clips' slides, the 2-4x cadence) for a later, clip-based pass.
- **BODY-WEIGHT's lean, carry and sway are off** (`LEAN_ON = false`, src/characters/bodyMotion/bodyWeight.js); its slot
  still runs ARM-CLEARANCE.
- **Kept** - the fixes, none of them an added motion: LOWER-BODY, TURN-GATE, MOVE-GRACE, SHOWN-POSE, BLEND-CARRY,
  LOOP-SEAM, IDLE-SETTLE, ARM-CLEARANCE, FP-INERTIA, HIT-RESPONSE.
- **Open**: the out-of-stance walk from one pack with the run (the owner: "later we'll deal with them"); the pack's
  own variant choice (`march13/15` for armour) needs its Lua's rule, which the port does not run.

### 7e. The longsword and shield again (2026-10-28) - every blow, its seams

The owner: "a very careful, detailed analysis of third-person combat with sword and shield, again - as with the
claymore; there are many more animations and transitions here". The scene ran in the owner's game (15 000 frames): the
moves and their stops, the jumps, the sneak, each blow alone (chop, the slashes, the thrust three times - the bash in
turn - the diagonals), series clicked at 250, 450, 700 and 1000 ms, a thrust series, the button held, blows walking,
running, sidestepping and backing, a bash walking, a blow into a stop, a blow in the air, the sheathe and the draw.

Clean: every move's start and stop (one group into the next, no flicker, no leap), the landings, the sneak, the held
series (one blow group for 3 s), the bash in turn, the sheathe and draw; the stance shown 0.06-0.24 s between blows
clicked a second apart is the stance's, blended both ways. Two leaps, in every blow:

- **The entry, still** - the blade 0.41 m, the right hand 0.27 m on the blow's first frame. BLOW-ENTRY (7c) eased the
  carry by `entry`, but its weight is `w * back * entry` and BLOW-RETURN's `back` reads `sinceBlow`, which a blow holds
  at 0: the carry was multiplied out in the first frame and the ease worked on nothing. The entry now lets go of the
  carry as it stood when the blow came (src/characters/bodyMotion/bodyMotion.js:"const back = bp ? entryBack : backOf(sinceBlow);").
- **SECTION-SEAM** - the blade 0.31 m, the shield's hand 0.16 m in one frame where the release met the follow-through:
  this pack's "small follow start" is keyed 0.067 s past its "hit", and the sections of one blow blended in 0 s. A seam
  wider than `SECTION_SEAM.tolerance` (0.01 file s) between where a section stopped and the next starts is now blended
  over `SECTION_SEAM.seconds` 0.08 s from the pose shown, in both views (src/combat/blowFlow.js:"export const SECTION_SEAM");
  a backhand's sections join where each shows its time (MS1). OpenMW plays the follow from its own key and leaps there -
  the departure is named. Pinned by `test/combat/blowflow.test.js`.

### 7f. BLOW-LEGS - a blow struck standing (2026-10-28)

The owner, after the sweep: "while running it is fine because you did the legs, but standing, it looks strange that the
legs barely move and there is no feeling of one whole movement - the legs just slide, and a couple of animations". The
clip, read out of `xbase_anim.kf` (its section times are the sweep's): `weapononehand` strikes from a planted stance -
the pelvis drops 4-6 units at the hit, the knees stay straight, the chop's right foot slides 8 units and stays, the
thrust's left foot slides 13 units forward FLAT and back inside 0.13 s at the hit. LOWER-BODY gives a moving blow the
stride's legs; a standing one had that stance.

**BLOW-LEGS** (src/characters/bodyMotion/blowLegs.js:"export const BLOW_LEGS = Object.freeze") gives it the body, by key poses rather
than a running physics (7d): the wind-up LOADS (the hips back, the body turned away from the swing), the release DRIVES
- snapped (`1 - (1 - p)^3`) - the hips forward, down and turned through the swing, the lead foot STEPPING on a thrust
(0.24 of the leg) and a chop (0.15): lifted 0.06 of the leg at its middle over 0.16 s, never slid; the follow-through
holds the hit for a quarter of itself, then recovers, the foot stepping home past its middle. Both feet stand on the
anchors the stance put them on when the layer came on, so the clip's own slides are gone; the knees take up what the
hips ask (the BODY-MOTION solve, `solveBody`'s feet). A backhand's turns mirrored, a left hand's blow leading with the
right foot; a heavier body (bodyWeight.js's weight) strikes up to 0.4 deeper. Additive over the clip's hips - the trunk,
the arms and the weapon's arc stay the clip's, carried by the hips. On only standing, grounded, in third person, behind
the MotionDoctrine switch; a body set moving gives its legs to the stride over 0.12 s. Wired through BODY-WEIGHT's slot
(after the carry, before ARM-CLEARANCE) with the motion word (src/characters/bodyMotion/bodyWeight.js:"legs.step(dt, active, word, weight);").
Measured offline over the vanilla clip: the planted feet within 0.5 units, the hips at most 3.3 units a frame. Pinned by
`test/characters/bodyMotion/blowlegs.test.js`. The magnitudes are the owner's to judge in the game.

**STOP-UNDER-A-BLOW** (2026-10-29, the owner: "you run, stop without letting go of the attack, and the legs do not step -
they can stick in any position"): BLOW-LEGS anchors the feet where it finds them when it comes on, and a body that stops
under a held blow is found mid-stride - LOWER-BODY's movement legs still in the run, the feet apart or one in the air -
and was held so for the whole blow. Such a stride (the feet over a quarter of the leg apart along the way, or one over
0.04 of the leg above the other) is now stepped into a stance (src/characters/bodyMotion/blowLegs.js:"export function settleOffsets"):
the further foot first, then the other once it lands, each lifted and set down under its own hip, the left 0.05 of the
leg ahead, on the planted foot's ground and toe; a wind-up's lead foot goes too. Feet already standing are left where
they are. Pinned in `test/characters/bodyMotion/blowlegs.test.js` (a held wind-up over a stride: the feet together on
the ground, one at a time, no planted foot sliding; the old anchors kept them 43 units apart).

The owner, after that cut: the legs still froze where the run left them. The proving ground showed the held button
chaining blow after blow (slash, chop) with BLOW-LEGS whole and anchored once, at the stop - its 0.79 m stride stepped
in to 0.10 m, so the first cut did act on a full stride; what it let by was a half stride under its thresholds. A
second cut stepped every pair found within 0.6 s of moving into an invented stance; the owner's next video still held
the stopped pose through every chained blow. The cause is the moment of anchoring: the layer came on the first still
frame, while LOWER-BODY was still handing the stride back to the clip (its 0.12 s ease out), and froze that frame -
letting go of the button let the clip's stance through. BLOW-LEGS now comes on only `BLOW_LEGS_TIME.after` (0.4 s) of
standing, and anchors on the clip's own stance - the one the owner sees after letting go; the invented stance is kept
only for a stride a body standing all along is found in. Pinned (the stride handed back over 8 frames: the layer
waits, the feet on the clip's stance; anchored at once it failed). The owner's game is the acceptance.

**LEG-DRIVE** (2026-10-29, the owner: the legs under the blows "look raw - they want work"; checkpoint `2a57952166`
before it). Read off the layer over the rest pose: the hips turned 17-22 degrees through a side cut while both feet
stood toes fixed - the knees followed the toes (within 7 degrees), so the whole turn went into the hip joints; a stepped
lead foot went home in every blow's follow-through, so a series shuffled it forward, back, forward; the wind-up moved
the hips back but no weight onto the back foot. Now (src/characters/bodyMotion/blowLegs.js:"export const BLOW_PIVOT"):
each foot turns on its ball after the hips - the back foot by 0.6 of their turn, its heel going out as the strike drives
off it, the lead by 0.2 (the back foot's toe now 7 degrees off the hips' line at a slash's hit, it stood 17); the hips go
over the back foot loading and over the lead one striking (`side`, up to 4 cm and 3 cm on a sword's slash, 2 and 1.5 on
the accepted overhead); a foot stepped out stays out through the series and steps home once the blows stop, the layer
held on for that step. Planted feet are judged at the ball now (the ankle moves as the heel turns). Pinned in
`test/characters/bodyMotion/blowlegs.test.js` (LEG-DRIVE: three thrusts - the foot out through all three, home after;
the back foot turned 0.6 of the hips; the weight back, then forward). Not yet seen in the owner's game.

**WIDE-STANCE** (2026-10-29, the owner: "the feet stand wide in the stance, then as the attack begins he nearly puts them
together"). STOP-UNDER-A-BLOW's stride test was the feet a quarter of the leg apart along the way - and the guard clip's
own fighting stance is wider than that: every standing blow took it for a stride and stepped the feet in under the hips
(offline, a planted stance 32 cm deep went to 10 cm in the wind-up's first frames). A body BLOW-LEGS finds is standing
(it waits `after`), so two planted feet are its stance and are kept; only a foot still in the air is stepped down
(src/characters/bodyMotion/blowLegs.js:"WIDE-STANCE"). Offline the same stance holds 32-33 cm through the whole slash.
Pinned: the stop-under test now keeps a wide planted stance and steps a lifted foot down. Not yet seen in the owner's
game.

**LUNGE-GUARD** (2026-10-29, the owner's video: the left foot set forward "now and then deforms and bends too much").
With the wide stance kept (WIDE-STANCE), the hips loading back and over the back foot pulled the lead leg straight -
offline from a stance 30 cm deep on bent knees, 100% of its length, the knee at 175 degrees - and the step home after a
blow straightened it for a frame (the hips settling back while the foot set off; only planted feet were looked at). A
leg is now never straighter than the stance stood it or 0.96 of itself (the knee near 150 degrees): the hips sink as a
body sinks into a deep stance, up to 0.12 of the leg, the stepping foot counted too; and a step out of a deep stance goes
no further than 0.45 of the leg ahead of its hip (src/characters/bodyMotion/blowLegs.js:"export const LUNGE_GUARD").
Offline every blow from a 15 or 30 cm stance keeps the lead knee at 147-148 degrees at its most open. Pinned in
`test/characters/bodyMotion/blowlegs.test.js` (LUNGE-GUARD; with the sink taken out it fails at 175). Not yet seen in the
owner's game.

**STEP-HOP** (2026-10-29, the owner's video: the kinks gone, "the leg hops"). The owner strikes by single clicks with a
pause, and the stepped lead foot went home after every blow and out again with the next - two lifts a blow, each the full
0.06 of the leg (5 cm) however short the step, and LUNGE-GUARD's room, read off the moving hips each frame, could start a
step afresh. Now the foot waits `rest` (0.5 s) after the last blow before it steps home, so clicked blows keep it out; a
step lifts it at most 0.3 of its own length (a 9 cm side-cut step 2.7 cm, a chop's 4.5); the room is the anchoring's,
and a step with under 0.04 of the leg of room is not taken. Offline four clicked chops lift the lead foot twice in all
(eight before). Pinned in `test/characters/bodyMotion/blowlegs.test.js` (STEP-HOP). Not yet seen in the owner's game.

**BLOW-MOVE** (2026-10-29, the owner: the standing two-hander's blows "look magnificent"; next "the legs while walking,
with every problem found so far"). A blow struck moving had the stride's legs (LOWER-BODY, judged good) and nothing of the
blow below the trunk - BLOW-LEGS came on only standing - and a body stopping under a blow had the clip's legs for 0.4 s,
then the standing layer at once. Now BLOW-LEGS is on for a moving blow too (src/characters/bodyMotion/blowLegs.js:"export const BLOW_MOVE"):
the feet are the stride's, where the movement clip sets them each frame - never anchored, stepped or turned - and over
them the hips load and drive by 0.6 of the standing keys: dropped, turned and tipped through the swing, not sent forward
or aside (the stride's own). Stopping, the same hips go on and grow to the standing blow over 0.15 s, the feet anchored
where the stride last set them; a layer that comes on moving starts on the stride's feet. Offline over a walk on bent
knees: the hips drop 2.7-4.5 cm and turn up to 13 degrees under a walking blow (none before), the feet within 1 mm of the
stride's. With the armoured two-hander's own trunk share (`armouredSword.js`, 0.3 of the turn, 0.35 of the tip) a walking
blow now carries some 0.9 of the standing one's body; other weapons 0.6. Pinned in `test/characters/bodyMotion/blowlegs.test.js`
(BLOW-MOVE: the stride's feet kept, the hips dropped, no foot leaping at the stop; the stop-under test now reads the
anchoring). Known: over a stride leg locked straight (a heel strike) the hips' turn can leave the foot up to 3 cm short.
Not yet seen in the owner's game.

**GUARD-WALK** (2026-10-29, the owner's video, standing and walking blows side by side: standing "magnificent", walking
"much worse"). Frame by frame the walking blow's trunk and arms strike as standing while the walk clip strides on under
them upright, narrow and on near-straight knees - the legs no part of it. While a blow is struck moving the hips now
also sink 0.06 of the leg (the knees bending into a fighting walk), in over 0.18 s and out over 0.3 s - the layer held on
while they rise - and the blow's own hips carry 0.75 of the standing keys (0.6). Offline over the test walk the knees
under a walking blow bend to 110-114 degrees at most and 121-123 on average (standing blows reach 110-147), the hips sink
9-11 cm, the feet stay within 3 mm of the stride's, the hips move at most 0.9 cm a frame rising after it. Pinned in
`test/characters/bodyMotion/blowlegs.test.js` (BLOW-MOVE: the hips sunk by the crouch and the blow's share). Not yet seen
in the owner's game.

**STRIKE-MOVE** (2026-10-29, the owner: GUARD-WALK "still not the quality"; the game's logic to stay as it is). Daggerfall
walks at some 4.4 m/s and runs at 8 (`motor.js` walkSpeed and runSpeed at Speed 50, Running 50) - a stance's shuffle
cannot keep that pace (Skyrim walks at about 1), so a blow struck moving is treated as a blow struck on the run, one law
read by the body's speed between walk and run (src/characters/bodyMotion/blowLegs.js:"export const BLOW_MOVE"): the
stride's own feet; the hips turn, drop and tip through the swing as standing (share 1); the weight forward by half the
standing drive; the trunk leaning into the travel (0.07 rad walking, 0.14 running) and the standing leg giving (0.012 -
0.022 of the leg), both on the drive's own envelope; the stride sunk 0.03-0.045 of the leg. `armouredSword.js` no longer
adds its moving-blow trunk share (the body turned twice). Offline at 4.4 m/s: the hips tip forward 9-13 degrees, drop
10-13 cm, turn up to 22 on a side cut, the knees bend to 107-112 at most, the feet within 2.5 mm of the stride's. Filmed
on the Proving Ground (`.proving-ground/jobs/walkblow.mjs`, standing and walking side by side). The owner's game is the
acceptance.

**TRAILING-FOOT; STRIKE-MOVE softened** (2026-10-29, the owner's long video: walking "got better"; stopping under a series
the back foot "can be left well back"; the legs deforming walking). Stopped out of a blow struck moving, the feet are
anchored where the stride last set them, and a wide stride's back foot was held there for the whole series - now that
foot alone, found more than 0.3 of the leg behind its hip, steps in to 0.18 behind it, lifted, the lead foot and every
stance's own turn kept (src/characters/bodyMotion/blowLegs.js:"export function trailingStep"; a stance found standing is
still left whole - WIDE-STANCE). Over feet pinned to the stride the full standing turn (22 degrees) twisted the legs and
the sink (10-13 cm) folded them - frames of knees drawn together and a low hunched stride: `share` 0.7, `crouch` halved
(0.015-0.03): offline at 4.4 m/s the hips drop 7-9 cm, turn up to 15 degrees, the knees bend to 115-119 at most.
Pinned (TRAILING-FOOT; with the step taken out it fails). Not yet seen in the owner's game.

**RUN-FADE** (2026-10-29, the owner: the knees "lag" where the speed rises; read on the Proving Ground,
`.proving-ground/jobs/kneelag.mjs`, each knee frame by frame and the legs' clip). Walking and blows struck walking moved
the knees at most 6 degrees a frame - no lag there; walk -> run under a slash jumped them 12-15 degrees a frame, folded
them to 42 and splayed the legs into a near split: over the run's long stride the pinned feet and the guarded reach sank
the hips to the floor. The run is not this pass's (the owner): between 5.5 and 7 m/s the moving blow now fades out and a
run keeps its clip's legs (src/characters/bodyMotion/blowLegs.js:"RUN-FADE"). Measured again in the game: no knee jumps
over 8.4 degrees a frame, the split gone (the run's own clip, unchanged, still folds a knee to 55 under a thrust).

**RUN-STRIDE** (2026-10-29, the owner: the run "badly broken"; asked between capping the clip and a longer stride:
"lengthen the stride"). Read off the clip: MAO's runforward2c travels 4.57 m/s, Daggerfall runs at 8.1 (Speed and
Running 50), so the reference's rate played the run's legs at 1.77x - a 1.2 s cycle in 0.49 s, the back heel flung to
the seat, a sprinter's patter (and at Speed and Running 100, 2.6x). STRIDE's law, set aside in 7d with the out-of-stance
walk, comes back for a run alone (src/characters/bodyMotion/stride.js:"export const RUN_STRIDE"): the clip plays at
most 1.36x, the thighs swing the rest of the ratio about their cycle's mean (up to 1.3x), the calves' kick held back
(-0.8 of that share), the body lowered to the ground the clip stood it on; the walk keeps the clip the owner accepted.
Wired through BODY-WEIGHT's slot and rate (`bodyWeight.js` moveRate), so `createFpArm` keeps its 3709 logical lines.
Measured on the retail rig under the clip at 8.1 m/s: a 0.64 s cycle (0.49), the knee at its tightest 68 degrees (54),
the thighs -51..62 (-36..51; a 1.42 stride with the calves free threw them to -57..67 and folded the knee to 31), the
planted foot keeping the body's pace. Pinned in `test/characters/bodyMotion/stride.test.js` (RUN-STRIDE). Not yet seen in
the owner's game; the Proving Ground's boots timed out streaming the world.

**FEET-FREED** (2026-10-30, measured after the owner's "the legs degraded"): GUARD-WALK's rise kept the layer on after a moving
blow, `stand` climbed and the feet were anchored while the body still walked - 91 frames, up to 32 cm off the stride. Feet are
now anchored only by a body standing (a standing blow or the step home). Offline after it: never anchored walking.
Pinned in `test/characters/bodyMotion/blowlegs.test.js` (FEET-FREED). Not yet seen in the owner's game.

**MAO-SOURCE** (2026-10-30, the owner: wooden straight legs, the toes lifted). The Animation Overhaul setting did nothing: the
pack ships `Xbase_anim.kf`, the loader's case-sensitive glob asked for `xbase_anim.kf` and found nothing, silently - so the
game walked on the retail clips, whose walkforward2c locks the knee at 180 degrees and lifts the toes 38 at touchdown (MAO's:
157 and 16; earlier records of "MAO's run" here were not measured). The glob now takes either case, and the setting has
three choices for the owner to compare: Vanilla, MAO movement (walk, run, sneak, turn; the stance, idles and blows stay the
game's), MAO movement + combat. A saved 1 now means MAO movement. RUN-STRIDE's numbers were read on MAO's clip; on the retail
run (3.2 m/s) the same law plays 1.95x. Pinned in `test/formats/morrowind/mwwalkassets.test.js`. Not yet seen in the game.

The owner, comparing the three in the game: "the new run" and the stance's walk are better, MAO is the standard - but the plain walk stays as it was, and no setting: the choice was the test's. So the pack now always answers the run, sneak, turn and the walks in a stance (`isMovementAnimationGroup`); the plain walk, the stance, idles and blows are as before; the `AnimationOverhaul` key is retired.

**SHOULDER-HOLD, WALK-STRIDE, STRIDE-SMOOTH** (2026-10-30, the owner on MAO: the left shoulder shaking and sunk in the body; walking, the limbs jerk fast; the run smooth, with small jerks as the pace rises). Measured over MAO's real clips: the collarbones hang from the neck, which the clip swings, so holding them on it left the shoulders 5 cm back and 6 ahead and the left arm straight (5 degrees, its elbow 6.6 cm inside the cuirass ellipse); the neck is now laid at rest first (`bodySolve.js` holdCollars; the arm bends 50, its elbow 3.1 cm outside). A walk takes the run's law, its clip at most 1.5x and the rest in the thighs (src/characters/bodyMotion/stride.js:"export const WALK_STRIDE"), the calves left as the clip has them and the toes held to 22 degrees (a 1.66 stride raised them to 41-63). The stride's height compensation followed the lower foot at once, 13.7 cm/frame^2 of hip jerk in a steady run; it and the speed ratio are now followed (`STRIDE_SMOOTH`). Long-walk speed-up: not traced, the motor's walk speed reads only stats and the Proving Ground's run did not boot. Pinned in `test/characters/bodyMotion/stride.test.js`. Not yet seen in the owner's game.

**PROFILE-WALK** (2026-10-31, the owner's side-view recording: ordinary walking looks straight-legged, front and rear accepted).
WALK-STRIDE enlarged the thigh swing while keeping the clip's calf rotation: a longer step with the old knee bend.
The ordinary forward walk now rounds off extension by a 15-degree soft bend and gives flexion 0.2 of the extra stride,
up to 85 degrees of flexion, in the knee's existing plane
(src/characters/bodyMotion/stride.js:"export const WALK_KNEES"). The foot keeps its rig-space orientation;
the existing ground compensation includes the changed ankle height. The stance's walk, moving blows and the run do
not opt in. The motor's speed and the cadence law stay as before. Reference read: DFU `PlayerMotor.FixedUpdate`
and `UpdateSpeed` (`Assets/Scripts/Game/PlayerMotor.cs`) drive the controller and get speed from PlayerSpeedChanger;
this 3D player's knee shaping is the port's own presentation, not a DFU limb law. The four hosts (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`,
`src/scenes/dungeonContext.js`) inherit it through `createBodyWeight` in the shared weapon rig; none grows. Pinned in `test/characters/bodyMotion/stride.test.js`:
the knee must actually bend, foot orientation and the knee plane stay, the lower ankle keeps its ground, and
non-ordinary groups are unchanged. The owner judged ordinary movement generally acceptable on 2026-10-31,
then moved the focus to walking and running in the combat stance.

**GUARD-TRAVEL** (2026-10-31, the owner's 01-52-39 recording): the forward guard walk kept a shorter 1.35 stride,
with cadence taking the remainder; its real-clip checks keep foot separation under 82 MW units and hip excursion
under 17. The smaller moving-sword effort (`blowLegs.js`, `GUARD_BLOW_MOVE`) stays: less sink, no extra advance,
no anchored feet while travelling. The owner's 02-54-33 recording judged the walk partly improved but still jerky,
and the run unimproved. The attempted running knee cap is REMOVED: on MAO runforward2c it moved the ankle up to
26.9 cm relative to its hip and changed compensating hip height by 7.7 cm before temporal smoothing. Angle bounds
were not a test of a coherent trajectory. The shorter guard walk and accepted standing blows remain.

**GUARD-CONTINUITY** (2026-10-31, the owner: inspect code as well as frames, then proceed):

- A third-person movement/jump owns its lower bones continuously, before, during and after an upper-body attack
  (`src/combat/lowerBodyLayer.js:"export function createLowerBodyLayer"). Its own sampler smooths and closes the
  movement clip at the movement clock before overlay blending. Previously the outer smoothing kernel queried the
  weapon time three times but received one fixed movement sample. Starting/ending a moving attack no longer restarts
  the lower fade or holds the last movement clock. Hit/death and the off switch clear the owner; a real stop still
  eases back to the standing clip.
- `src/formats/morrowind/mwPoseContinuity.js:"export function preserveOwnedPose"` keeps fully owned lower samples out
  of the later whole-body weapon snapshot fade. Upper-body blending remains active. A real retail-skeleton test calls
  poseAssembly and checks the produced owned bones against the current movement pose during a 3% weapon blend.
- `src/combat/movementContinuity.js:"export function movementPhaseTime"` transfers the interval between left/right
  footstep markers across a walk/run change in the same direction; normalized loop phase is the fallback. The outgoing
  clip advances during LOWER-SWAP rather than holding one pose. A real MAO-state test checks both the incoming time
  and outgoing sampling clock.
- `src/combat/guardLocomotion.js:"export function guardMovementGroup"` selects the accepted ordinary `runforward`
  base for a shown two-handed sword's forward run in the third-person MotionDoctrine path when available. The
  movement source's own velocity determines cadence as before; the two-handed carry still owns the arms and weapon.
  With no plain run, other weapon types, or the switch off, the original group resolver stands. This deliberately
  leaves the armed `runforward2c` clip behind; no new knee cap warps its foot path. Full-cycle tests at 8.1 and 5.8 m/s
  compare pelvis, thighs, calves and ankles to the accepted free-run stride, rather than pinning an arbitrary knee angle.
- `src/characters/bodyMotion/travelStride.js:"export function createTravelStride"` applies ONE stride transform and
  ONE height history, selecting the accepted ordinary walk/run or shorter guard-walk profile. Outgoing and incoming
  stride instances no longer multiply one another during a transition. Ordinary-walk knee softening remains as accepted.

Reference read: DFU `PlayerMotor.FixedUpdate` / `UpdateSpeed` (`Assets/Scripts/Game/PlayerMotor.cs`) own controller
travel and read PlayerSpeedChanger; they have no articulated player gait. OpenMW's lower-body priority in
Morrowind-Rules rule 26 remains the basis: movement owns the legs under a weapon animation. The continuous owner,
phase transfer, own-clock smoothing, and chosen free-run presentation are our explicit presentation departures.
Motor speed, attack timing, damage, and the standing sword's key poses are unchanged. The four hosts
(`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, `src/scenes/dungeonContext.js`) inherit the
shared rig seam; none grows. `createFpArm` stays at its baseline 3709 logical lines (its existing ceiling failure
predates this change). Tests: `test/combat/lowerbody.test.js`, `test/combat/movementcontinuity.test.js`,
`test/characters/bodyMotion/guardstride.test.js`, and the existing standing-blow/ordinary-stride suites.
Proving Ground ran 585 frames in third person with the steel claymore: guard walk, walking attack, forward run,
running attack, run-to-walk, stop, standing attack and recovery. The recorded movement groups were `walkforward2c`
and the selected `runforward`; the rig returned to `idle2c` with the two-handed weapon equipped. Frames and bone traces
remain local under `.proving-ground/out/continuity*`. This verifies the chosen runtime path, not that every visible
jerk is gone. Visual acceptance in the owner's game remains pending.

**RUNNING-BLOW-LEGS** (2026-10-31, the owner's correction: running in the combat stance is fine; only striking
while running makes the legs lag and fling sideways). RUN-FADE was gated by speed (5.5..7 m/s), not `motionWord`'s
actual `running` flag. A running attack below that band still turned/dropped the pelvis and re-solved both legs to
their stride feet with poseFoot's toe-derived knee pole; a tail of a walking blow could do it too. The running mode
now resets and bypasses BLOW-LEGS while travelling, leaving the ready running pose untouched. No new locomotion
clip, stride, speed or upper attack change in this fix. Standing attacks keep their accepted keys, even with the run
key held; the existing still-time gate determines the handoff after stopping.

Regression in `test/characters/bodyMotion/guardstride.test.js` warms an active walking blow, then strikes in running
mode with chop/slash/thrust at six speeds including 5.8, 4.4 and 2.5 m/s. The entire produced pose must be exactly
unchanged by BLOW-LEGS and no anchor/IK weight may remain. Before this gate the test fails with changed pelvis/leg
rotations. A second RUNNING-BLOW-PIPELINE regression uses the real motionWord producer, body carry, bodyWeight,
lower overlay and poseAssembly over real MAO movement/attack tracks. At 2.5/5.8/8.1 m/s and 30/60 Hz, repeated
running blows must leave every pelvis/thigh/calf/foot matrix identical to the same run without a blow. Removing
the gate reproduces the mismatch in that full pipeline. Standing with the run flag retains a full-weight blow. Reference: DFU PlayerMotor's running mode remains
the motor's word; this is our articulated-body presentation, not a change to movement or damage. All four hosts
(`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, `src/scenes/dungeonContext.js`) inherit the
shared bodyWeight/blowLegs seam; none grows. The owner accepted this result on 2026-10-31
("everything looks excellent"), then asked to reduce the excessive vertical rocking of the guard walk.

**GUARD-WALK-LEVEL** (2026-10-31): the accepted run and running blows stay as above. The shorter armed walk still
carries a large vertical hip excursion from its clip and stride ground compensation. Increasing the ground filter
alone leaves most of that bounce and adds ankle-height error. Instead,
`src/characters/bodyMotion/guardWalkBalance.js:"export function createGuardWalkBalance"` follows the hip midpoint's
mean and retains a quarter of its oscillation, easing in/out over 0.16 s. A 3.5%-of-leg lower centre leaves knee room
at the low point; without that margin, lifting toward the mean hits the reach ceiling and leaves a sharp notch.
The layer preserves each ankle's sampled position and foot orientation, re-solves with the original knee direction,
and preserves the sampled pelvis rotation. The reach cap never asks for a straighter leg than the source or 97% reach.
It remains wired for the fallback armed forward walk through shared travelStride; when the accepted free walk is
available, GUARD-STEP-BASE below selects it instead and this correction is inactive. Other steady gait groups receive no correction. The movement clock, motor speed and attack keys are unchanged.

Real MAO/retail-hierarchy regression at 30/60/120 Hz reduces steady hip excursion from 14.5-14.8 cm to 4.7-5.5 cm,
reduces the largest frame height change below 70% of the previous one, preserves ankle position/orientation, and
keeps both knees on their original bending side. Removing the balance layer must fail that excursion check.
The running-blow full-pipeline regression and accepted free-run trajectory comparisons remain required.
DFU reference remains PlayerMotor.FixedUpdate/UpdateSpeed above: this is our articulated-body presentation departure.
The four hosts (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`,
`src/scenes/dungeonContext.js`) inherit the shared bodyWeight seam; none grows. The new leveling awaits the owner's
visual judgment in the game; the numerical bounds alone do not establish its appearance. The owner's 11-04-26 recording
then showed that the legs still lacked smoothness, independently of the reduced hip bounce.

**GUARD-STEP-BASE** (2026-10-31, owner's 11-04-26 recording): reducing hip bounce while pinning the existing ankle
path retained the armed MAO walk's abrupt foot swing. The previous height-only check did not establish smooth joint
motion. `src/combat/guardLocomotion.js:"export function guardMovementGroup"` now selects the already accepted
`walkforward` base under the two-handed carry, as it already does for `runforward`. The ordinary walk's existing stride,
knee softening and cadence are reused; the drawn weapon's carry and walking-blow effort remain. If the free walk is
absent, the shorter, leveled armed walk remains the fallback. Other weapon types and the off switch retain the original
resolver. In real-clip checks of both feet at 60 Hz the peak acceleration drops from 392 to 211 m/s² without key
smoothing, and from 358 to 172 with it. These are rig-space derivative diagnostics, not motor acceleration.

**GUARD-STEP-LOOP**: CLIP-SMOOTH used time±h outside a walking loop at its boundary, sampling adjacent keys from the
shared animation file. `src/combat/loopSeam.js:"export function smoothSampler"` accepts a loop window; createLoopSeam
passes it for walking only. Neighbour samples wrap inside that window after seam correction. Intro/exit samples and
overlay tracks retain their own clocks. Running and attack sampling retain the existing path. A real MAO sampler
regression checks the two sides of the loop, with the existing seam-angle tolerance. Removing the periodic window
fails with a root-position discontinuity; removing the chosen free walk fails the gait/foot-motion regression.

Checks exercise 30/60/120 Hz, smoothing on/off, both ankle trajectories, the actual group resolver, and equality with
the accepted ordinary gait at full and reduced walking speeds. Running-blow/standing-blow regressions remain required.
Reference remains DFU PlayerMotor.FixedUpdate/UpdateSpeed: the motor owns speed; our choice of articulated gait and
periodic walking interpolation are presentation departures. The four hosts (`src/scenes/world.js`,
`src/scenes/exterior.js`, `src/scenes/worldModes.js`, `src/scenes/dungeonContext.js`) inherit the shared weapon rig;
none grows. Proving Ground played 645 synchronized frames in third person with the steel claymore: forward guard walk,
walking blow, run, running blow, run-to-walk, stop, standing blow and recovery. After the equip transition, every walking
frame selected `walkforward`; running kept `runforward`, and stopping returned to `idle2c`. The two-handed weapon and
upper attack remained active. Local captures are `.proving-ground/out/walk-base*`; that fork lane has key smoothing off,
so the periodic smoothing fix is verified by the real-clip sampler tests above. Visual acceptance of the new walking
base was judged smooth by the owner, who rejected its identical-to-ordinary character in the next review.

**GUARD-WALK-POSE** (2026-10-31, the owner: keep the smoothness but continue the slightly bent-legged combat stance
through the walk). GUARD-STEP-BASE by itself was insufficient: reusing an ordinary gait unchanged removed the stance's
character. `src/characters/bodyMotion/guardWalkPose.js:"export function createGuardWalkPose"` now gives the drawn
two-handed forward ground walk its own posture and stride. The continuous source supplies phase and foot transfer;
the guard caps stride at 1.55 instead of ordinary walking's 1.7, lowers the hip centre by 5.5% of leg length, and retains
60% of its oscillation around a followed mean. Original knee directions and ankle goals/orientations are preserved by
the shared solve. Knees yield through the cycle rather than locking to one squat angle. The posture and stride share
ease in/out over 0.18 s. Standing attacks and running retain their accepted paths; ordinary/sheathed walking, one-handed
weapons, sideways movement, swimming, levitation and busy states do not activate this posture.

The real motionWord -> lower-body ownership -> body motion/weight -> poseAssembly regression at 30/60/120 Hz compares
ordinary and guarded walking, requiring a 3-7 cm lower mean pelvis, a supporting knee bent over 25 degrees, mean flexion
at least 8 degrees greater, and more than 30 degrees of flexion variation through the cycle. It also bounds bounce and
foot acceleration against ordinary walking. Direct real-clip checks preserve ankle goals and rotations, require an actual
lowered body, and verify gradual release back to exact ordinary cadence. Running-blow and standing-blow regressions stay
required. These numerical bounds establish a distinct coherent gait, not its final visual acceptance.

Reference remains DFU PlayerMotor.FixedUpdate/UpdateSpeed: this is our articulated combat-gait presentation departure,
not a motor or damage change. The four hosts (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`,
`src/scenes/dungeonContext.js`) inherit the shared bodyWeight/travelStride seam. No host grows.
Proving Ground ran another 645 synchronized frames with the equipped steel claymore: walking, walking blow, running,
running blow, run-to-walk, stop, standing blow and recovery. Against the preceding smooth ordinary-base capture, the
steady walking segment's mean pelvis is 5.45 cm lower and its minimum knee flexion is 34.7 rather than 5.8 degrees.
The captures/bone traces are local under `.proving-ground/out/guard-pose*`. The owner visually accepted the resulting
combat walk on 2026-10-31 ("excellent result") and requested the commit. Standing and running regression suites remain green.


Then step 3's rest: the two-hander's blows in third person. Every step sits behind a switch "as now / by the formula",
is judged by the owner in the game, and lives in a module of its own (HOST-SPLIT, `01-Overview/Host-Split.md`).

**Decision taken for the pilot (recommended, the owner to confirm): the motion of the character is not changed.** The
animation only reads the real velocity - the lean from the real acceleration, the stride from the real speed - so
nothing slides and control, balance and multiplayer are untouched. True inertia of plate (Inertia's shape) is a
separate decision, later.

## 8. Where it stands (2026-10-28) and what is next

The owner's next visual pilot and its acceptance record are in
[Armoured-Twohand-Pilot.md](Armoured-Twohand-Pilot.md): preserve the accepted
standing overhead, remove distracting camera-driven hand sway, and judge a
complete armoured two-handed sword sequence before extending its style.

THE LEDGER of every piece the doctrine has laid, by its state - the one list; the sections above carry each one's
measurements and reasons. Every piece sits behind the MotionDoctrine switch ("Формула движения").

**Judged good in the game by the owner:** LOWER-BODY (the legs walk and run under a blow, the sidestep with a weapon -
section 7); TURN-GATE (no turn in place on a stop - 7b); MOVE-GRACE (no idle flicker on a landing - 7c); the old
transition bug, gone with the revert of 7d.

**Built, measured, not yet seen in the game:**
- the blow's entry and its seam - BLOW-ENTRY made to work and SECTION-SEAM (7e): the 0.41 m and 0.31 m leaps of every
  one-hander's blow; the same entry fix should take the claymore's second-frame leap (7c);
- BLOW-LEGS (7f): a blow struck standing - the hips load and drive, the lead foot steps; its depths are the owner's to
  judge;
- ARM-CLEARANCE (7c): the claymore's left elbow out of the trunk;
- SHOWN-POSE, BLEND-CARRY, LOOP-SEAM, IDLE-SETTLE (7, 7a, 7c);
- FP-INERTIA and HIT-RESPONSE (section 7, steps 3 and 4) - built and on, never judged on their own.

**Set aside (kept in the code, unwired or off, at the owner's word - 7d):** STRIDE, FOOT-SPEED and MAX-RATE (the legs'
stride and pace over the walk and run clips); BODY-WEIGHT's lean, carry and sway (`LEAN_ON = false`).

**Next, in order (the owner sets it):**
1. The in-game check of 7e and 7f with the longsword and shield - single blows, series, blows into a stop and a start.
2. The claymore again (the owner: "we'll run more checks later"): its blows, series and transitions, the left elbow,
   BLOW-LEGS on a two-hander.
3. The out-of-stance walk and run (the owner: "we'll come back to them"): today a female body walks OpenMW Dynamic
   Animations' `WalkForward_base15` and runs MAO's - two packs; one family for both, and the pack's own variant choice
   (`march13/15` for armour), whose Lua rule the port does not run.
4. Step 3's rest: the two-hander's blows in third person (RHYTHM and SILHOUETTE - retimed by MW-PACE3's laws, the
   trunk's turn; the lead foot is BLOW-LEGS').
5. RESPONSE's rest: the recoil off stone; a Morrowind-bodied foe's own rig held by the hitstop (only a sprite unit's
   frame is now); a beat for arrows and spells; trails.
6. Step 2's rest, if the owner wants weight back in the walk: the stride's width by weight and the landing's drop -
   clip-based this time (7d), never a layer laid continuously over the clips.

**Measured and not yet fixed:** the weapon 0.18 m in a frame at a run's stop into the idle (the same clip time - 7c);
a leap at the sneak's start (7c).

**The owner's to decide:** a sheathe (Z) pressed mid-blow is dropped, not queued; a blow clicked in the air starts on
the landing (7c).

**Still open from the start:**
- Whether BLOW-FLOW's soft blends (`exit` 0.5 s back to the stance) lean AAA - "smooth but sluggish" may start there;
  re-tune toward SHARPNESS when the pilot reaches the blows.
- Research still owed: PLANCK (FlyingParticle - the active-ragdoll hit reactions Precision uses), a few two-hander
  movesets on Nexus, Overgrowth's talk, Blasphemous' and Dead Cells' own accounts of their timing.
- Clip selection by condition (armour weight, weapon, state - OAR's shape) is designed for now and built when the
  enemies come.
