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
