# Animation Blending

## Description

Adds animation blending to Morrowind, enabling smooth transitions between animations. Where before a character would abruptly teleport from one animation pose to the next, now they will seamlessly move between them.

Animation blending is automatically applied to all npc, creature, and player animations. The look and timing of each transition can be adjusted via configuration files.

Compatible with all animation replacers, this mod serves as a purely visual effect and has no influence on gameplay mechanics or timings.

## Requirements

Requires an up-to-date version of MWSE, available at <https://mwse.github.io/MWSE/>.

## Installation

Extract the contents of the archive into your /Data Files/ directory.

## Modder Notes

This mod is inspired by and based on the OpenMW implementation by Max Yari.

## Configuration

Configuration files are compatible between the two engines with one caveat:

* OpenMW configuration supports "per-key" blending rules, while MWSE only supports "per-animation" blending rules.

    These rules are currently ignored by the MWSE implementation, but will not cause errors. You can safely include them for the benefit of OpenMW users.

Animation blending rules can be configured via `.yaml` files. 

The default blending rules (those applied automatically to npc, creature, and player animations) can be overridden by creating a configuration file at `Data Files/Animations/animation-config.yaml`.

Alternatively, you can configure blending rules on a per-asset basis by creating a corresponding `.yaml` file alongside the asset `.kf` (keyframes) file. For instance to override the blending rules of guars you would use `Data Files/Meshes/r/xguar.yaml`, which corresponds to the keyframes file `Data Files/Meshes/r/xguar.kf`. 

Providing per-asset overrides as described above allows animation blending to be applied to environmental objects (like activators or containers) which do not automatically receive blending by default.

The contents of configuration files must conform to the following format:

```yaml
blending_rules:
- from: "*"
  to: "*"
  easing: sineOut
  duration: 0.25
- from: idle
  to: idleSneak
  easing: springOutWeak
  duration: 0.4
```

All blending rules are required to be inside the `blending_rules` array. 

Blending rules positioned later in the array override those positioned before them.

Each blending rule must provide the following fields:

- **from** *(string) Specifies the animation group that is being transitioning from.*
- **to** *(string) Specifies the animation group that is being transitioning to.*
- **easing** *(string) Specifies the easing function to be used for the transition.*
- **duration** *(number) Specifies the duration of the transition.*

---

The **from/to** fields are case-insensitive and support using the asterisk symbol as a wildcard marker to target multiple animation groups. This symbol is only allowed at the front or end of the string.

Examples:

- Using `idle*` would match any animation group **beginning** with `idle`. Such as `idle`, `idle2`, `idleSneak`, and so on.

- Using `*knockout` would match any animation group **ending** with `knockout`. Such as `knockOut`, `deathKnockOut`, `swimKnockOut`, and so on.

- Using `*spell*` would match any animation group that **contains** the string `spell`. Such as `idleSpell`,  `spellCast`, `spellTurnLeft`, and so on.

- Using `*` by itself with no other text will match **all** animations groups.

---

The **easing** field is case-sensitive and must match one of the following:

* "linear"
* "sineOut"
* "sineIn"
* "sineInOut"
* "cubicOut"
* "cubicIn"
* "cubicInOut"
* "quartOut"
* "quartIn"
* "quartInOut"
* "springOutWeak"
* "springOutMed"
* "springOutStrong"
* "springOutTooMuch"

See <https://easings.net/> and the OpenMW documentation for more information on these.

---

The **duration** field can be set to zero to disable blending between the specified animation groups.

## CHANGE LOG

- Version 2.0  
     Switch to YAML configuration files.  
     Add diagonal movement feature by Hrnchamd.

- Version 1.0
     Initial release.

## Permissions

All code and assets are free to use as you see fit.

## Extra Credits

Max Yari (https://www.nexusmods.com/users/11230608)  
For creating the OpenMW Animation Blending feature which inspired this mod. Easing code and config structures were adapted from his work.

Hrnchamd (https://www.nexusmods.com/morrowind/users/843673)  
For helping figure out some engine details and adding related data structures to MWSE for this mod to use.  
For contributing the diagonal movement implementation.

Melchior Dahrk (https://www.nexusmods.com/morrowind/users/962116)  
For creating the banner image and proof reading the documentation. 
