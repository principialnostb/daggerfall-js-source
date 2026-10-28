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
