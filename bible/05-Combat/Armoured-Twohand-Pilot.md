# Armoured two-handed sword pilot (2026-10-28)

Owner-authorised intervention on `all-animations`, starting at `76c6dd5dd7`.
This is the visual acceptance record for a pilot, not a claim of finished style.

The owner finds the new camera-driven first-person hand sway distracting. Remove
that added response; preserve the existing first-person sword choreography. The
standing overhead blow's connected legs and inertia are the accepted starting
point for third person, not something to replace wholesale.

Target: an armoured swordsman whose preparation, force and recovery read as one
action. Keep useful walking/running clips; do not stretch every stride or add
continuous trunk sway. Add only bounded, purposeful movement. One grounded
two-handed sword family first, with single blows, a series, movement into/out of
an attack, and a stop. Other weapons retain their established behaviour.

References: Motion-Doctrine.md sections 4-7; Morrowind-Rules.md rules 25-26
(lower-body ownership). DFU's WeaponManager/FPSWeapon use screen sprites, not
an articulated armoured body. The pilot deliberately adds body choreography in
presentation; damage, movement speed and attack scheduling remain unchanged.

Acceptance is the owner's in-game judgement. Numerical continuity checks support
it but cannot establish that a motion looks good. A schematic preview illustrates
intent only and is never evidence of the game's rendered result.

## Initial review sequence

1. Camera turns in first person: no added camera-follow hand sway.
2. Plate, third person, sword drawn: walk/run, strafes, starts and stops.
3. Standing overhead, side cut and thrust; single blows and a held/clicked series.
4. The same blows while moving, then stop/start during recovery.
5. Compare switch off/on in the same scene; record what the owner accepts.

All four scene hosts (world.js, exterior.js, worldModes.js, dungeonContext.js)
share the weapon rig; this pilot belongs in its modules, with no host additions.

## First implementation

- FP-INERTIA's camera yaw, pitch, roll and sideways look lag are disabled;
  acceleration and landing response remain. The original clips are unchanged.
- `armouredSword.js` adds bounded start/stop effort and a small forward posture
  at a run for a grounded, drawn two-handed sword with armour share at least 0.4.
  A moving cut adds a small trunk turn following the existing blow phases.
  Walking steadily adds no sway. Exponential settling has no spring overshoot.
- BLOW-LEGS keeps the accepted overhead exactly; the sword's side cut advances
  its lead foot slightly and turns its hips more, and its thrust uses a longer,
  shallower drive. Other weapons keep the existing key poses.
- The previous lead foot is asked home when a chained blow switches hands.

Reference read: DFU `Assets/Scripts/Game/WeaponManager.cs`, `Update` and
`ScreenWeapon` (upstream master, 2026-10-28). Its attack gating and damage
resolution are not changed. Our departure is the articulated-body presentation.
No format reader or DFU combat-law ledger row is closed by this pilot.

Validation: focused behavioural tests exercise camera-only motion, scope gates,
start/stop settling, moving cuts and preserved overhead keys. Full visual
acceptance remains open: this implementation has not been seen in the owner's
running game. Preview figures are schematic, not screenshots or clip validation.

Local checks (2026-10-28): lint and types pass; focused motion/combat tests pass,
including the composed retail skeleton's unchanged stride feet and two-hand
spacing. Production build passes with a local read-concurrency cap (the uncapped
Windows build hits EMFILE on the installed texture packs; no build-config change
is part of the pilot). The six documentation gates report the same 17 failing
test names on the starting commit and on the pilot, with 52 passing tests in
each snapshot; none of their diagnostics names a pilot source file. Existing
documentation failures are not repaired as part of this visual experiment.

## Owner review and second pass (2026-10-28, REVERTED)

The owner rejected this pass as worse and asked to return to the animation state
before the feedback quoted below. All seven changed animation source, test and
mutation files are restored exactly from `b6494cfff3`. The isolated worktree and
restored local Skyrim assets remain. The following is a historical record of
the reverted experiment; the First implementation section describes live code.

The owner sees larger overhead amplitude standing and changed amplitudes on the
move; this is recorded as an observation, not approval or a request to reduce it.
The end of every blow reads as unnatural slow motion, and the plate's weight
during travel and stops is not perceptible. The pilot is not visually accepted.

The third-person sword's follow-through now plays at a steady 1.15 times its
Speed factor. Its visible recovery finishes before returning to the stance with
a short 0.18 s blend; the continuing-series input no longer stretches the clip
or holds its last frame for up to two seconds. First-person and other weapons'
recovery profiles stay as before. Wind-up, release and damage timing are unchanged.
This deliberately departs from the earlier SERIES-FLOW presentation, not from
the attack machine's scheduling; the input buffer remains available.

Armoured locomotion now applies also while sheathed and independently of the
separate BODY-MOTION preference. Start/stop effort is stronger and longer, with
bounded pelvis compression (at most 3.5% of leg length) and knees accommodating
the load while preserving the clip's foot positions/orientations through IK.
No periodic walk sway is added. A recoil, death or airborne state immediately
returns ownership to its own animation. Compression steps aside during a blow
so it does not amplify the accepted standing attack layer.

Second-pass checks: 55 focused tests pass, with one pre-existing disabled-sway
test skipped; lint/types pass. The composed support test measures the feet's
IK error under 0.1 rig units (about 1.4 mm), keeps hand spacing, and requires
actual pelvis compression. The host-ceiling check reports the same 3577 logical
lines in createFpArm before and after the pilot (the existing ceiling is 3252).
The documentation gates retain their 17 failing test names; a separate cite
check with Git's ownership exception scoped to the command resolves 2892 of
2902 anchors, with the ten remaining diagnostics outside this pilot's changes.
Only the first selected legacy mutation was verified killed: the Windows runner
failed restoring the next file; the original was restored byte-for-byte from its
backup and the 33 recovery/support tests were rerun successfully. No all-mutants
passing claim is made. Visual acceptance of this second pass remains open.

## Amplitude experiment rejected (2026-10-28)

The owner rejected `ba6e8534cc`: intermittent leg lag during movement and a worse
thrust. Its transfer of the standing attack's full rotation from the pelvis to
the spine passed numerical pose checks but failed in-game visual review. Revert
that experiment; the four animation source/test files again match `4ad5fbbee8`
exactly. The first pilot remains the preferred baseline. Its weaker moving
attacks remain unresolved; equal angular envelopes alone are not acceptance.
Validation of the restored baseline: 44 focused motion/combat tests pass.

## Neutral guard arm clearance (2026-10-28)

Owner screenshots show the neutral sword guard's arm sinking into the cuirass.
ARM-CLEARANCE now evaluates its armour ellipse in the posed chest frame, rather
than fixed rig axes, and checks the distal upper arm and forearm between joints
as well as the elbow. The bounded shoulder-to-wrist swivel keeps both wrist
positions and hand rotations. This extends the articulated presentation
departure from DFU WeaponManager/FPSWeapon recorded above. A regression exercises
the composed two-handed neutral carry at several body headings and requires
identical clearance decisions and preserved grips. The owner's armour mesh still
needs in-game visual review; the ellipse is a clearance proxy, not mesh collision.

The owner's next screenshot still shows penetration. The neutral two-handed
carry itself placed the left wrist across the torso; elbow swivel alone could
not correct the grip location. Move the idle right shoulder flexion from 29 to
50 degrees and elbow bend from 10 to 35 degrees, carrying the shared hilt ahead
of the chest. Other gait rows retain their values. A composed neutral-carry
regression checks four points along the left forearm outside the full-armour
ellipse, rather than only preserving the existing wrist location. The installed
MAO idle probe with the carry applied now needs no clearance swivel at its
sampled pose. This remains a geometric check awaiting the owner's rendered view.

The owner accepted the arm becoming visible but rejected its extended, unnatural
pose, supplying an upright sword guard as the desired reference. Replace the
idle row with shoulder flexion 20, abduction 12, elbow bend 85 and twist 35
degrees; the blade points mostly up and slightly forward. Both hands still
share the hilt, with the left below the right. The regression now also requires
an upright blade and a comfortably bent right elbow. This supersedes the
extended-arm idle adjustment above; locomotion rows are unchanged. Thirteen
focused tests pass. Visual acceptance remains with the owner in the game.

Further owner review shows the left arm still almost straight. The neutral
carry now centres the grip through right-arm angles [30, 12, 100, 60], shortens
the idle hand separation from 0.4 to 0.2 arm lengths, and directs the left elbow
down/out rather than forward. These changes blend by idle share into the existing
moving carries. The guard regression requires BOTH elbows bent 60-120 degrees
and retains the forearm clearance check. This supersedes the earlier idle row;
the in-game screenshot remains the visual acceptance criterion.

Guard/run transition review: independent interpolation of blade and edge could
produce a nearly parallel weapon frame and an abrupt wrist flip. Transport the
edge along the blade rotation and blend its remaining axial twist instead;
the regression checks perpendicularity across 199 intermediate transition samples. The
body-weight slot also eases elbow clearance turns over 0.07 seconds rather than
switching the correction immediately. Clearance turn history belongs to the
rig and resets with it. Fourteen focused tests pass; visual review remains open.

## Guard arms by the owner's drawing (GUARD-ARMS, 2026-10-29)

The owner's screenshots of the standing guard, drawn over in red: the upper arms
hang down the sides, the elbows by the waist, and the forearms run forward to the
hilt. The row [30, 12, 100, 60] held the hilt against the cuirass, 0.19-0.21 m
ahead of the shoulder line, and the left elbow - solved onto the hilt - stood
0.1 m outside its shoulder. The idle right arm is now [25, 6, 86, 42] and the
left elbow's standing way down under the shoulder (-0.3 right, -0.9 up, 0.15
forward, by the idle share as before). On the retail rig the hands stand 0.25-0.28
m ahead at the belly, both elbows within 0.03-0.04 m of their shoulders' line;
the blade and the 0.2-arm-length hand spacing are unchanged. The Proving Ground's
fork lane photographed both from eight sides (`.proving-ground/jobs/stance.mjs`).
The neutral-carry regression now also holds the left elbow under its shoulder
(within a fifth of the shoulder width; it stood a third) and both hands three
quarters of a shoulder width ahead. Moving rows are unchanged; the owner's game
is the acceptance. The failures in `bodymotion_carry`/`_audit`/`_claims` fail on
the branch's head without this change as well (it clears two of them); they are
not this change's and remain open.

## Walk and run by the same anatomy; the spin after a run (RUN-STOP, 2026-10-29)

The owner asked for the walk and the run "with the same approach" as the guard's arms, and for the limbs that "spin
hard and wrong" after a run when the body stops or walks. The walk, by the owner's second drawing, points the blade
at the foe: a middle guard, both elbows bent (60 and 64 degrees), the hands 0.29 m ahead at the belly, the blade 34
degrees over level - nearer level bent the right wrist 52 to 60 degrees ulnar, past the audit's 40. The walk closes
the left hand as the guard does (the compact grip and the elbow down by the idle and walk shares). The run holds the
hilt at the right of the belt in both bent hands (right 70, left about 50 degrees), the point trailing down behind;
TWO-RUN's first reading, the grip under the hip joint, only a straight arm reached (the joint lies some 0.55 m from
the shoulder, the arm 0.5 m), so its pin now asks the grip at the belt with both elbows over 35 degrees. Its "chest
turned toward the weapon" pin stays red as before: `runTurn` is read by nothing since `59b984bff5` left the trunk to
the fork's clips.

The spin, measured: a stop after a run turned the weapon 29 degrees a frame in the game (31 from a run into a walk).
Three causes, each fixed: the run's true edge rolled 132 degrees about the blade against the guard's (now 46 - the
least that keeps the left wrist inside the audit); the run's share fell at the quick carry spring, normalised with the
guard's rising share (`MOTION_EASE.carryRun`, its own spring, the other shares splitting what it leaves); and the edge
was carried from the still way by one least turn although the blade goes round through `via`, so past half a turn it
flipped sides, 70 to 84 degrees of roll a step (now carried along both legs of the path). Offline every transition
now turns the blade at most 5.5 degrees a frame; a regression holds the walk-to-run edge to under 2 degrees per
1/200 of the blend (the old transport 3.1).

The owner's video of the same day: after a run the turn into the guard "bends wrong". Read frame by frame, the blade
went from the trailing carry up over the head and behind the left shoulder before it stood, and so on the run's start.
That path is the class's `via` (up and a little back). Measured offline through stand-run-stand and walk-run-walk, it
bent the wrists past their held pose - the right to 122 degrees off the forearm, the left to 88; round the right side
and back (`via` (0.7, -0.3, 0.65)) they stay within a degree of it (105 and 69). The blade still turns at most 4.9
degrees a frame. The owner's game is the acceptance.

## The grip put back (GUARD-ARMS reverted in part, 2026-10-29)

The owner, after the day's passes: moving the weapon to mend one hand had spoiled the guard and the walk; the run may
stay. The guard's and the walk's weapon are put back where they stood at the day's start - the idle row [30, 12, 100,
60] and its blade exactly; the walk's blade the same way, its grip 8 cm nearer the middle and 5 cm nearer the body
(row [32, -10, 20, 72]): at the original grip the left hand lay at the arm's full length across the chest, the arm
straight and its elbow on the breastbone; now it bends 53 degrees with its elbow at the left side. Kept from the day:
the compact grip and the left elbow's way down by the idle and walk shares (now -0.2, -0.95, -0.1), the run's row and
edge, the edge carried along the blade's two-legged path, the run's own share spring and the path round the right side.
Every transition (stand-walk-stand, stand-run-stand, walk-run-walk) turns the weapon at most 6.2 degrees a frame.

Left as they were at the start: the guard's right wrist at 51 degrees ulnar and the walk's at 43 to 46 (the audit's
limit is 40). Bringing the guard's under the limit with the grip held still means swivelling the right elbow up and
out by 9 cm - the flared elbow the owner first objected to - so the audit's EVERY CARRY ROW stays red as at the start.
The guard's left elbow hangs 8.5 cm outside its shoulder: without ARM-CLEARANCE it would hang 3.5 cm out, but the
cuirass ellipse is one width at every height and pushes it out. The GUARD-ARMS pins of the moved guard (the hands
ahead of the cuirass, the elbow under the shoulder) are withdrawn with it.

## The left hand out of the cuirass (GRIP-ANATOMY, 2026-10-29)

The owner's video of the same day: standing and walking with the claymore drawn, the left hand sinks into the body;
the run reads right but holds the left elbow against the chest. The code the video showed was the guard restored to
before the 2026-10-28 reshaping (idle [29, 7, 10, 42], walk [40, -5, 7, 56], the left hand two fifths of an arm down
the haft) - not the rows the section above names; this section starts from the code.

Measured offline on the retail biped with a full cuirass's clearance ellipse: at rest the left wrist stood at the
RIGHT hip, 4 cm ahead of the chest's middle, its arm straight (5 degrees) and its elbow on the spine's line; the walk's
left arm 12 degrees; the run's 5, its elbow on the breastbone. The cause is the grip, not the elbow's way: two fifths of
an arm toward the pommel - and every carry row stands the pommel back toward the body - is behind the right fist and
inside the trunk, and no swivel of the elbow (ARM-CLEARANCE turned it its full 0.9 rad) moves a wrist.

- **The left fist against the right** (`carry.js` TWO_HAND_CLOSE, a fifth of an arm, about 11 cm - a hand's width) in
  every carry gait; a blow keeps TWO_HAND_GRIP. The left fist stands 11-12 cm off the right forearm's line.
- **The trunk under the weapon** (`CARRY.two.trunk`, `bodySolve.js` leanUnder): the hands are asked on the trunk as the
  clip stands it, then the spine turns and leans and the arms reach from the turned shoulders to the same points - the
  weapon does not ride the turn. The guard and the walk turn 10 degrees toward the hilt and lean 8 over it, the run turns
  18 and leans 4 (`TWO-RUN-the-chest-square`'s pin, red since `59b984bff5` left the trunk to the clips, holds again).
  Turned alone, the right shoulder goes back and the right arm falls short of a hilt held fixed: at 20 degrees by 3 cm.
- **The hilt moved a little, its blade not at all.** At rest 6 cm nearer the middle, 6 ahead and 4 down (row
  [33.5, -2, 5.5, 46.5]); walking 3 nearer the middle ([40.5, -12, 2.5, 50]); running 6 cm off the belt ([-7, 17.5,
  70, 25.5]). Blade and edge rows are unchanged. These were the least moves, of 288 tried for each still gait, that
  bring the left forearm out of the ellipse with both wrists inside the audit's 40 degrees.
- **The left elbow down and forward** in the still gaits, ahead of the cuirass (down and back, it lay on the
  breastbone); the run keeps ELBOW-OUT's way.

After: the left elbow bends 40 degrees at rest, 44-46 walking and about 50 running; the left forearm is outside the
ellipse at each gait without ARM-CLEARANCE's swivel; the right wrist is 35 degrees ulnar at rest. The right arm
stays nearly straight: with the point low and ahead, a bent right elbow cocks the wrist past its range - bent 17 degrees
it stood 60 degrees ulnar - so the low guard's right arm is a long one, as a fencer's is. Every transition
(stand-walk-stand, stand-run-stand, walk-run-walk) still turns the blade at most 6.3 degrees a frame and the chest at
most 0.25; the left fist leaves the blade's line by at most 1.9 cm (the audit's limit 1.5 units, about 2 cm).

The departure from DFU stands as recorded at the head of this page (DFU draws a screen sprite, no body). Pins:
`test/characters/bodyMotion/armclearance.test.js` GRIP-ANATOMY (the left forearm clear and bent at each gait; the trunk
leant under hands that stay where they were asked) - the stale upright-guard pin it replaces was red before this change;
`bodymotion_carry.test.js` A TWO-HANDER now asks the left fist at TWO_HAND_CLOSE and passes whole. Of the
body-motion and lower-body files, 22 tests fail against 24 before; the 22 failed before as well. The owner's game is the
acceptance; nothing here was seen in it.

### The point raised; the guard clip's chest squared (2026-10-29)

The owner, on the pass above: "much better"; then a drawing - the point raised so the elbows bend - for the guard and
the walk, and a second video: standing, the left arm a straight line across the chest. Read off the drawn bones in the
game (`.proving-ground/jobs/arms.mjs`): standing, the hilt stood 23 cm right of the chest and 10 ahead, the left wrist
19 right and 3 ahead - inside the right flank; offline (the rest trunk) the same rows put the hilt 10 right and 27 ahead.
The fork's guard clip, idle2c, stands the chest about 40 degrees to the right, and the carry's rows ride the chest. The
walk's clip did not (in the game within 7 cm of offline), nor does the run need it.

- `bodySolve.js` takes the clip's chest turn off the facing before the hands are asked, by `trunk.square`
  (`CARRY.two.trunk`'s third column: 1 in the guard and the walk, 0 in the run), then leans as before - so the game's
  guard is the one tuned offline.
- The guard's and the walk's point raised 20 degrees about the blade's level line (the guard's blade now level, the
  walk's a little up), the hilt 8 cm up to the belt: guard [37, 29.5, 58.5, 76.5], walk [40, 8, 43.5, 78]. Offline: the
  guard's elbows bend 58 (right) and 56 (left), the walk's 42 and 61, both wrists inside 40 degrees, the left forearm
  outside the cuirass ellipse; every transition turns the blade at most 5.9 degrees a frame. The run is unchanged: in the
  game both its elbows already bend 68-75 degrees.

Pins: the guard's "blade forward and down" in `bodymotion_carry.test.js` and `armclearance.test.js` now ask the point at
the waist. Not yet seen in the owner's game.

### The left fist turned on the hilt (2026-10-29)

The owner's screenshot of the raised guard: the right arm settled; the left elbow pressed to the chest and the left
wrist ugly. Offline the left hand - the right's exact mirror across the blade's plane - stood 68-70 degrees off its
forearm's line, and no way of the elbow moved it (ARM-CLEARANCE turned each back to the same place). A hand on a hilt
turns round it: in the still gaits the left fist now turns 40 degrees about the blade (`carry.js` LEFT_FIST_ROLL), its
knuckles to the left, and its elbow's way is out and down. Offline: the left wrist 38 degrees off the forearm standing,
32 walking; the left elbow 17-20 cm left of the chest's middle (it stood 11, inside the shoulder's line), bent 65 and 58;
the fist stays on the blade's line through every transition. The run is unchanged. `armclearance.test.js` GRIP-ANATOMY
now also holds the left elbow out at the side and the left wrist under 50 degrees. Not yet seen in the owner's game.

### The head kept; the fists apart (2026-10-29)

The owner's four screenshots: the left elbow still against the chest, the right now off the body, and the head looking
aside. The head was this pass's: squaring the guard clip's chest carried the neck and the head round with it, and the
clip's head faced ahead over a chest turned 40 degrees - `bodySolve.js` leanUnder now keeps the head's own turn.

Then the owner: "the main problem is that the hands sit very close together, high on the hilt". So they did: the
GRIP-ANATOMY pass had closed the left fist against the right (10 cm, TWO_HAND_CLOSE), with the claymore's 31 cm from the
right fist to the pommel's end. Read against the standard descriptions of a two-handed middle guard (kendo's
chudan-no-kamae: the pommel hand on the body's middle at the navel, a fist out from the body, the arms relaxed and bent;
the German Pflug: the hilt by the right hip) - in the still gaits the left fist now closes 17 cm below the right, at the
pommel end (`TWO_HAND_STILL`, 0.35 of an arm), and the hilt stands 8 cm further out standing (4 walking): the left fist
2-7 cm right of the middle, 25-28 cm ahead of the chest - a fist ahead of the cuirass. Rows: guard [45, 8.5, 28.5, 82],
walk [40, -8.5, 25, 67.5]. Offline: the right elbow 26 standing / 22 walking, the left 68 / 59, the left elbow 18-19 cm
left of the middle, the left wrist about 40 degrees off its forearm, both wrists inside the audit; the fists 17.5 cm
apart, the left 16 cm off the right forearm. The run keeps its close grip. Not yet seen in the owner's game.

### The left wrist, the arms off the body, the right shoulder walking (2026-10-29)

The owner: better; the left wrist still sharply bent, the arms want a little room from the trunk, and walking the
right shoulder twitches and the right arm presses into the body. Measured offline with ARM-CLEARANCE's eased history:
walking, the right elbow stood 3 cm off the cuirass ellipse and the right arm swung with the stride (`swing` 0.12), so
the clearance swivel turned it in and out with every step (-0.36 to 0 rad) - the twitch, larger in the game under the
clip's sway. The walk's right row now takes none of the stride's swing (a guard holds the weapon's arm still): the
swivel stands at -0.20 to -0.15, the upper arm turns at most 0.1 degree a frame. Standing, the right row [45, 3.5, 21, 70]
holds the hilt 3 cm further out with the right elbow 6.5 cm off the cuirass (it stood 3), bent 18 degrees; the left fist
turns 70 degrees round the hilt standing and 40 walking (`LEFT_FIST_ROLL`), its elbow's way out to the left - the left
wrist 19 degrees off its forearm standing (it stood 40), 38 walking (further turned, it would bend past a wrist's radial
range). The right wrist's ulnar limit bounds the right elbow: out further, the wrist cocks past 40 degrees.
`armclearance.test.js` holds the standing left wrist under 30 degrees. Not yet seen in the owner's game.

### The walk's hilt to the middle (2026-10-29)

The owner's video: all else good; walking, the arm still sinks into the body. Frame by frame the walk's hilt stood left
of the body's middle and the right forearm lay across the chest to reach it. The walk's row is now [40, 10.5, 35, 63]:
the hilt 8 cm to the right - at the middle, where the guard's stands - its blade unchanged. Offline: the right forearm
7 cm off the cuirass ellipse at its nearest (3.5), the right elbow under the shoulder and bent 33 degrees, the left
wrist 29 degrees off its forearm (38), ARM-CLEARANCE no longer turns the right arm at all; stand-walk-stand moves the
grip under a millimetre a frame. Not yet seen in the owner's game.

### Walking: the left elbow off the body, the clearance swivel idle (2026-10-29)

The owner's video (17-46-18): walking, the left elbow (on the viewer's right) sinks into the body, both shoulders turn
forward and shake. Offline the walk's left elbow stood 3 cm off the cuirass ellipse and ARM-CLEARANCE swivelled it
(0.3 rad) - a turn that moves with the clip's sway. The walk now turns the trunk 18 degrees toward the hilt (10 before)
and asks the left elbow out and a little ahead: both elbows 4.1-4.6 cm off the ellipse with no clearance swivel at all,
the left bent 47, the wrists in range; a smaller lean only brought the arms back to the body. The shake itself the
offline rig cannot show (it has no clip under the trunk); the Proving Ground's walk read (`.proving-ground/jobs/
walkshake.mjs`, each shoulder, elbow and wrist frame by frame) did not run: the session's boot timed out streaming the
world, as earlier the same day. Not yet seen in the owner's game.

### The collarbones held (2026-10-29)

The owner's video (18-15-08, walking in the steel suit and then bare): the black (left) pauldron still, the white (right)
one rising and turning every step - "it must not". Bare, the right shoulder moves the same way, less visibly. The
pauldron rides the collarbone; since `59b984bff5` the trunk, and with it both collarbones, is the clip's, and the
two-hander's walk clip swings the right collarbone under hands the carry holds on the hilt. `bodySolve.js` holdCollars
now stands both collarbones as at rest on the chest before the hands are asked, by `trunk.collar` (`carry.js` trunkOf:
the guard's and the walk's, as their squaring; not the run's). Offline, under a stand-in clip swinging the right
collarbone 12 degrees with the stride, the right shoulder joint now moves 0.00 cm a frame walking (the run's swing still
passes, 0.48). Not yet seen in the owner's game.

### The arm's own roll held; the walk's right elbow bent (2026-10-29)

The owner: the right arm "rocks clockwise and counter-clockwise" as the body moves, and its elbow must bend at least a
little or the arm sinks into the armour's texture. The reach (bodySolve.js reachLimb) takes the least turn from the arm
as the clip stands it, so the upper arm's roll about itself rode the walk clip's arm swing - the pauldron with it.
holdCollars now also lays the arm, before the reach, as a hanging arm (the rest's on the collarbone, swung down 80
degrees along the chest's side, the forearm straight), by the same `trunk.collar` share: the reach starts from the same
arm every frame. Offline, under a stand-in clip swinging the right upper arm 25 degrees with the stride, the upper arm's
roll moves 0.00 degrees a frame walking (the run, untouched, 0.47). The walk's trunk turns 14 degrees (18 straightened
the right arm to 16 degrees) and its hilt stands 2 cm higher, row [40, 14.5, 42.5, 60]: the right elbow bends 35, 7.1 cm
off the cuirass ellipse; the left 52, 4.8 cm off; both wrists in range; no clearance swivel. Not yet seen in the
owner's game.
