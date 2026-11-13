# The Proving Ground - motion and combat judged by scripted play (PROVING-GROUND, 2026-10-28)

The owner, 2026-10-28, after a day of point fixes to the third-person motion (Motion-Doctrine.md 7g, 7h) and a recorded
session of his own play read frame by frame: "the whole system is bad - the run, especially backwards, where the arms
are; the animations are bad and so is how they are put together"; "we fix one inconsistency and a hundred more appear";
"the closest to right was the two-hander's blows standing still". He stopped giving local notes ("make the elbow so,
the wrist so") because they mended one symptom and moved another, and asked for the system to be rebuilt as a whole -
"not on the knee" - in an environment where it can be built and tuned properly: not a laboratory with a body on a
grid, but the game itself in operation, with its equipment, its textures, a fight with an enemy.

This page is the record of that environment and of the rules the rebuild follows. It binds every motion change from
here on beside `Motion-Doctrine.md`, whose formula (weight sets the rhythm, the rhythm the poses, one body joins them,
the world answers) stands.

## 1. Why scripted play

What the day showed (the owner's recorded session, 192 s, 45 blows, read off the drawn bones each frame -
`Motion-Doctrine.md` 7g/7h and the session's own numbers):

- 132 single-frame leaps, 91 of them a movement clip changed under a blow (a foot 0.95 m in one frame);
- a two-hander's chop on the move stopping 0.35-0.6 m higher than standing, the trunk bent 41 degrees running forward
  and 25 running back against 59 standing;
- the out-of-stance strafe playing its legs at 3.9-4.85 times its clip.

None of it was visible from a description, and driving the live game by hand to see it cost more than it told: a tab
in the background is throttled to a frame a second, every visit waits on the world, the menus and the focus. A change
judged that way is a guess. So the rebuild is judged the way a studio judges its motion: the real game, driven by a
script on a fixed clock, every run the same frame for frame, its pictures taken from fixed cameras at the game's own
pixel size, and its numbers checked against thresholds.

## 2. What the ground is

- **The real game, not a model of it.** The same build, rig, armour, weapons, shields, textures, pixelation (CHAR-PIX1)
  and foes as a player sees - its data the owner's own (ARENA2, his Morrowind install, his `Mods/Animations`), handed
  to the browser the tool drives and never written into the repository (Port-Doctrine, Non-negotiables).
- **A fixed clock.** The frame loop stepped at 1/60 s by the script, never by the wall clock, so a run is the same run
  on any machine and in a background tab.
- **Scenarios as data.** A scenario is a timeline of inputs (keys held, the swing's drag, the camera's turn), an outfit
  (armour, weapon, shield, sheathed or drawn), a place and, where it fights, a foe. The set covers what the owner
  played: every gait in eight directions, starts, stops and turns, blows standing and moving, series held and clicked,
  a change of direction mid-blow, the shield walking, running, guarding and bashing, the draw and the sheathe, a fight.
- **Fixed cameras.** Side, front, back and three-quarter, at the game's own pixel size, and the player's own follow
  camera - so a picture here is a picture of the game.
- **Numbers with thresholds.** Each run is read off the drawn bones and meshes every frame: single-frame leaps, a
  planted foot's slide, the cadence against the ground covered, a blow's reach and the trunk's bend moving against
  standing, the shield, the blade and the elbows inside the body's capsules, the frame time. Every change states its
  numbers before and after.
- **Three lanes, always side by side.** VANILLA (the original game's own motion: Morrowind's retail clips, no pack, no
  layer - the reference the owner asked to keep looking at), FORK (what the owner assembled, as it stands) and NEW (the
  rebuild). Every finding and every change is written as "it was so - it became so", with the vanilla lane beside it.

### How it runs (built 2026-10-29)

- `tools/provingGround/run.mjs` - its own dev server (ARENA2 from `ARENA2_PATH`, default the owner's Steam install, no
  hot reload so a module path is the game's own instance), a Chromium with a profile of its own under `.proving-ground/`
  (gitignored), the owner's Morrowind `Data Files` attached into it once through the game's own door
  (`dataSource.js` storeMorrowindFiles), the lane's settings laid into localStorage before the game's code (FORK from
  the owner's own settings, snapshotted into `.proving-ground/fork-seed.json`; VANILLA every animation source and layer
  off; NEW the fork with the rebuild's switches), the game booted at `/play/?shot&play&world&test=nord-warrior` (the
  Test Room's warrior and armory, outdoors, noon, clear).
- `tools/provingGround/clock.js` - the fixed clock: performance.now, Date.now and requestAnimationFrame taken over;
  wall time while the game loads, then only `__pg.step(n)`. It also refuses pointer lock: on Windows a lock is the
  system's ClipCursor, and from the ground's hidden browser it took the owner's own mouse away (2026-10-29).
- `tools/provingGround/kit.js` - the game's doors for the script: state, bones, the pack and equip, third person, the
  camera swung round the body (LOOK-AROUND's preview), home (the open ground every scenario starts on); the foes -
  every live one cleared and one set down at a distance ahead, loose so no encounter cap refuses it, through the
  pool's own `spawnFoe` (`exteriorFoes.js` latestExteriorFoes, the ground's door alone - no host reads it); the
  player kept whole (`god`); what the body wears (`worn`).
- The ground runs OFFLINE: every request but its own server's is refused (the live accounts, POI and relay services
  are no part of a run).
- `tools/provingGround/scenario.mjs` - a scenario played (keys held, the swing dragged with the right button) and
  read: every frame's bones, place and rig state; pictures from the swung camera; the metrics; the contact sheet.
- `tools/provingGround/lane.sh <lane> <job ...>` - a lane from a cold start: boot, `ready` (steel suit, the claymore
  drawn, home set), the jobs (`baseline-2c`, `shield`, `fight` - modules under `.proving-ground/jobs/`), stop.
  `tools/provingGround/report.mjs` writes `.proving-ground/out/report.html`, the lanes side by side.

## 3. Rules for the rebuild

### Animation Lab (LAB1, 2026-11-09)

The owner asked for a shared visual and programmatic workspace: record a case once, mark its problem frame, let
Codex or Claude generate scenarios and inspect the same run without asking the owner to film it again. LAB1 extends
the ground above, not the game's hosts or an independent animation renderer. Its reference is the ground's existing
gameplay input, rig status and body-bone sampling; it adds development controls, not a departure from DFU gameplay.

Start `node tools/provingGround/run.mjs lab --headed --lane fork` with `ARENA2_PATH` and `MORROWIND_DATA` pointing to
the owner's local installs. The existing ground profile and `fork-seed.json` are needed. Open `http://localhost:5310/__lab/`.
`tools/provingGround/lab/server.mjs` mounts this route only for that command. Nothing is added to production routes.
The panel and `tools/provingGround/lab/client.mjs` share a serialized, bounded JSON command API. Agents can request
`suite`, `load <scenario.json>`, `advance <frames>`, `run`, `mark <note>`, `export` and `batch <count>` (default three).
`LAB_URL` selects another local port; `--out <file>` writes a CLI result locally. Local `ARENA2/` and `Morrowind models/`
are detected when the environment paths are unset, before falling back to the Steam paths. A cold lab boot allows
ten minutes for the world's first pixel; `/__lab/boot` and `/__lab/boot-image` expose its loading state and picture.
The known initial story notice is acknowledged before controls are handed to the lab. The old kit's missing pool
lookup is restored through `exteriorFoeProbe.js`: a weak reference registered by the existing pool constructor.
`world.js` and `exterior.js` share that constructor; neither host grows. `worldModes.js` and `dungeonContext.js` are
FLAGGED for this tool: LAB1 drives the exterior pool only, not indoor or dungeon foes.

The first slice provides 47 generated input scenarios: eight movement directions, walk/run/stop transitions,
four swing directions standing and moving, a turn, jump and sneak. JSON scenarios can select outfit names and one
mobile type (`foe`). Actual rig groups, selected source paths, pose time, player bones, foe status and warnings are
captured. Marks save a screenshot; automatic snapshots are every 30 frames. Runs and pictures are local under
`.proving-ground/lab/`, never committed. The panel can step, play in small batches, orbit, annotate, import and export.

**Limits are part of the result.** This is input replay from a repositioned player, not a world/AI/physics checkpoint.

Geometry diagnostics can opt into `globalThis.__mwPoseAssemblyProbe`: poseAssembly reports the actual assembly
after its pose and afterPose placement, on both the CPU and GPU paths
(src/formats/morrowind/mwFirstPerson.js:"export function poseAssembly(assembly, { tracks = null, sampleTrack = null,").
The callback is synchronous and read-only by contract; consumers must remove it after capture. With no callback,
no geometry copies are made. It exposes the skeleton, pose, matrices, piece binds and source vertex arrays to a
local probe, not a second renderer. test/formats/morrowind/poseprobe.test.js checks both paths.

The fist diagnosis used this to compare CPU skinBatch output with the actual GPU stream and observed palette,
and to export per-frame poses for replay. Sampling must confirm a ready drawn rig and actual attack-state coverage;
a completed input script alone does not prove a punch occurred. Bare-body, clothing and armour captures are separate
cases, and a shell fix never certifies the underlying body. Triangle edge changes locate candidates; they do not
alone distinguish natural joint deformation from defective geometry. Local pictures and exports stay ignored.

Replay does not guarantee identical random choices or settled secondary motion. The suite exercises gameplay inputs,
not every imported clip. A missing body is unmeasured, never a passing check. Bone jumps are diagnostic signals, not
an artistic verdict; surface penetration and foot contacts are not measured by LAB1. It does not yet edit bones,
record free manual play, inspect NPC skeletons, or create animation assets. Those extend this same scenario and API
contract after reproducible playback is verified, rather than adding another renderer.

`test/tooling/provingGroundLab.test.js` checks coverage, scenario bounds and known diagnostic signals. Existing
test-PR snapshot `a433274ec3` passes lint/types but has failing source pins and bible gates; snapshot preservation
does not certify that baseline as release-ready.

Live validation on the owner's Windows data: 120 frames of walk/run produced 2,040 sampled bone positions and
observed `runforward`; a 150-frame standing chop observed 54 attack-state frames and 2,550 bone samples. It flagged
three weapon-bone jumps for review, not three proven animation bugs. A rat (mobile type 0) spawned through the pool,
its health was read, and the next scenario cleared it. Marks, source/transition logs and JSON export were exercised.
The panel was rendered against that live API: 47 choices, the actual captured game frame and no page JavaScript
errors. Six lab contract tests pass, as do lint and types. The baseline's 15 bible-gate failures remain; wider source
pins also fail, including CRLF-sensitive checks and the pre-existing fpArm host ceiling. This is not a green release.

### Animation Lab 2 (LAB2, 2026-11-11)

The owner, 2026-11-10: "manual diagnosis loses in the long run"; he wants the lab to diagnose and to let him correct a
pose himself - "change a tilt, how a thing sits" - because the hard part is not the model but how a worn piece deforms
and where a motion breaks. LAB2 builds that on LAB1's ground: one start for every run, readings with frames, the
body's meshes, and an edit laid over the game's pose. DFU draws no skinned body; the reference stays OpenMW's clips and
our own presentation (Port-Doctrine, Rebuilt on our stack). No pose, timing or combat law of the game changes.

**One start, so two runs can be compared.** A scenario names its body (`body`: female or male, the rig rebuilt), its
`loadout` (twelve: fists, sword, shield, two-hander by bare, clothes, armour - every slot taken off first) and its
`seed`. Before a frame is kept the driver rests the fighter (a tired body walks slower), waits out the draw, stands
the stance through to its idle clip's loop point and seeds the dice for every frame (`tools/provingGround/clock.js`
`seed`). A scripted swing is the drag's own direction (`Controls/WeaponSwingMode` 0; `swingMode: 2` asks for the
rolled one). The game reads a drag only under a pointer lock, which the ground refuses, so the page is told the canvas
holds the pointer while the system's cursor stays free. `repeat` plays a scenario twice and says where they part.

**The readings** (`tools/provingGround/lab/measure.mjs`), each with its frames: a leap told from a fast motion by
the frames beside it, with what changed under it; a planted foot's drift over the world; a limb inside the trunk; each
blow by the game's own phases and hit time beside the hand's speed - wind-up, strike and recovery frames, sharpness
(peak over mean), the hit's distance from the peak, the hips' travel, the trunk's twist, the lead foot's step; the
stance by carry and gait. `signature` folds a fighter's runs into the numbers one fighter keeps across weapons, and
`coherence` reads a loadout against the reference fighter (`twohand-armour`, Motion-Doctrine "One fighter") in
tolerances. `baseline` keeps a run as accepted and reads the next against it, metric by metric.

**The body's meshes** (`tools/provingGround/lab/labKit.js` `geometry`), read where the pose put them: each skinned
piece's edges against their authored lengths, and one layer through another by the nearest point of the shell's
triangles. A vertex nearest the shell's border, one with a second surface at its back and one whose bone the shell
does not ride are not findings; only pieces the game draws are read. A joint always stretches its skin, so a piece
is held to its own run's median. The game draws a pose one frame after it makes it: the lab reads bones and meshes off
the pose just made and draws one still frame before each picture, so words, bones and picture are one frame.

**The edit seam** is the one change in the game's code: a tool sets `globalThis.__mwPoseAssemblyEdit`, the game never
does (src/formats/morrowind/mwPoseLab.js:"export function editPose(assembly, pose) {"). It runs after every layer and
before the matrices; a piece's `labFit` is laid over its placement on both skins
(src/formats/morrowind/mwPoseLab.js:"export function fitPieces(pieces) {",
src/formats/morrowind/mwGpuSkin.js:"function fitEntries(layout, pal) {"). The lab's layers turn a bone in the body's
axes (forward lean, side lean, turn), move it, and move, turn or size a worn piece about the bone it rides; `when`
holds a layer to a carry, a gait or a blow. A layer is exported as JSON for an agent to port into code - the lab
never writes it into the game. `world.js`, `exterior.js`, `worldModes.js` and `dungeonContext.js` pose their
bodies through this one function and need no wiring; the lab still drives the exterior alone (LAB1's flag stands).

**To run it.** `node tools/provingGround/run.mjs lab --lane fork`, then `http://localhost:5310/__lab/`. The panel has
a timeline of states and signals, a blow's start, hit and end as pictures, four views of one frame, and tabs for the
signals, the fighter, the meshes and the edit. Agents use `node tools/provingGround/lab/client.mjs`: `play
<scenario>@<loadout> --body female`, `report`, `geometry`, `views`, `repeat`, `baseline save|check`, `matrix`,
`tweak <layers.json>`, `diagnose`. `reload` takes the lab's code from disk with the game left running. A second
checkout inside the root (a worktree) is neither scanned nor watched by the ground's server.

**Limits are part of the result.** A run repeats where the world does not answer back; a foe's AI and a fight are not
a checkpoint. A layer-through-layer finding is a candidate with a place, not a proven hole. The foot's reading takes
the look's heading for the body's. A still frame moves the clock by a hundredth of a millisecond. An edit is not fed
back into the motion layers' own memory. The lab drives the player's body only: no peer, no NPC, no creature. Its fighter
has no needs (hunger, thirst, the cold) and no encumbrance: both move the live Speed a walk is paced by, and a run
under them is not one fighter.

**Live validation, the owner's Windows data, 2026-11-11.** A standing chop with the claymore on the woman's armoured body read 24 frames of wind-up, 7 of strike and 26 of recovery, the game's hit on the frame of the hand's peak; played twice it repeated to 0.1 mm over 150 frames, and a blow walking forward to 0.1 mm over 165. Four views of one frame held the body to 0.5 mm. A layer (the trunk 18 degrees forward, the helm 6 cm up and 1.15 its size) stood in the game's own picture.

**The first matrix** (fists, sword, sword and shield against the two-hander, all in steel, seven scenarios each: 28 runs, none uncovered) read 0.87, 0.82 and 0.81 tolerances from the reference. The fists stand 5 cm higher on knees bent 28 degrees against 41, and move the hips 0.8 cm in a blow against 6.7. The one-handers' walk bobs the pelvis 10.5 cm against 4.5, and their wind-up is 14% of a blow against 34%. The tolerances (`measure.mjs` `SHARED`) are a first guess for the owner's eye to set.

**Found on the way, not mended here.** Roleplay Realism's encumbrance takes its penalty from the live Speed its own last penalty lowered (src/systems/roleplayRealism/rrInstall.js:"liveSpeed: liveStat(entity, 'speed'),"): one worn set walks at Speed 45 and 11 by turns, a fold each, so the lab switches the module off for a run. At the permanent Speed 54 the two-hander's stance walk outruns its legs - a planted foot slides 2.4 cm a frame - and a foot stands up to 6.5 cm under the ground. The steel pauldrons stretch 3.8 times their authored edge with the arms raised. The same 60 test files give 673 passes and 56 failures with the seam and without it.

`test/tooling/provingGroundLab2.test.js` holds the readings to synthetic runs with known faults, the dice to their
seed, the driver's order (worn, then seeded, then watched), a blow's pictures, the baselines' names, and the seam: off
it changes nothing, on it lands a bone's edit and a piece's fit alike on the CPU skin and the palette.

1. **The original's character is kept.** The vanilla lane is the yardstick for silhouette and tempo; the rebuild may
   be smoother and more responsive, never more "AAA" (Motion-Doctrine section 1: mechanisms from the modern school,
   character from the stylised one). A change that reads foreign beside vanilla is reverted.
2. **The two-hander's blows standing are the gold standard.** Their profile - reach, bend, rhythm - is measured on the
   ground and is the target every other blow is held to, moving ones included.
3. **The shield is its own system.** The owner brought it to "not bad" walking (SHIELD-GUARD, SHIELD-RUN, SHIELD-BASH,
   `combat/shieldGuard.js`, LEFT-ARM); running and fighting it is not. Its walk is the baseline it keeps; its run, its
   guard and its bash are scenarios of their own.
4. **One change, one switch, one report.** Each piece lands behind a switch ("as now / by the rebuild"), with its
   before-and-after report from the ground, and the owner judges the pictures and, last, the game.
5. **The hosts do not grow** (HOST-SPLIT); the ground is a tool and a page of its own, wired by none of them.

### Styles, later (the owner, 2026-10-29)

The owner's idea for the future: the rebuild in several variants - "retro / classic / modern" - to compare. Decided:
one working system first, built so that its style is a set of numbers, not code - the transitions' stiffness, the
stride's length and cadence, the trunk's amplitude, how long a key pose is held, how far a blow's body travels. A
variant is then a preset of the same system, played on the ground as a lane of its own beside the others; three half
systems would leave nothing worth comparing.

## 4. Order

1. The ground itself, and its first report: the three lanes over every scenario - the baseline in numbers and pictures.
2. Locomotion: the gait's own legs for Daggerfall's speeds (the existing `gait.js` its candidate, judged on the ground,
   not assumed), eight directions blended, transitions taken at once and their remainder decayed (inertialization).
3. Combat over locomotion: the attack's upper body kept whole over the stride's hips; the gold standard's numbers.
4. The body's capsules: shield, blade and elbows kept out of the trunk and the thighs.
5. The shield: run, guard and bash.
6. The owner's game, once.
