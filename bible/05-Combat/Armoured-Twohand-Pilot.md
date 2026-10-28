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
