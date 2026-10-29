# Blow Flow - the Morrowind arm's blows, series, shield and left arm (BLOW-FLOW arc)

The record of one long working session (2026-10-24 to 2026-10-26, branch `hands-1st-person`, now `Dev`) in
which the owner played the Morrowind first-person and third-person arm and asked, round after round, for blows
that read as a fight: sharp, smooth, in step between the two views, with a shield that guards and bashes and a
free left arm that does not jitter. Everything below shipped in commits `0969ebe9bf` ("great animation update")
and `0b156c9a03` / `4d9dc4133c` (the last touches), and is pinned by the tests and mutant records named in each
section. The hands' geometry (Better Hands, the cuff, the thumb) is its sibling page,
`04-Characters/First-Person-Hands.md`.

Reference: Daggerfall Unity is the reference for WHEN a blow lands (its weapon machine's `blowSchedule`, ported as
MW-PACE1 - `05-Combat/Combat.md`, `02-Formats/Morrowind-Rules.md`), OpenMW's `CharacterController` for HOW the
Morrowind arm plays a blow (wind-up `<type> start` -> `max attack`, release `max attack` -> `hit`, follow-through
`<strength> follow start` -> `stop`). Every rule here is a DEPARTURE in presentation only: the machine's hit
time, damage and cadence are DFU's and untouched; the arm's way of showing it is ours (SCOPE1,
`01-Overview/Port-Doctrine.md`).

## 0. The shape of it - where each law lives

| Law | Module | What it decides |
| --- | --- | --- |
| MW-PACE1 (before this arc) | `src/combat/fpArm.js` blowPace | a peer's / NPC's blow fitted to the machine's schedule |
| MW-PACE2 / MW-PACE3 | `src/combat/blowFlow.js` (PACE, CALM, calmBlowPlan, recoverRate) | the PLAYER's blow: its own sections' speeds |
| ARM-LED HIT | `src/combat/weapon/armLedBlow.js` | the machine's hit waits for the arm to land it |
| BLOW-FLOW | `src/combat/blowFlow.js` (BLOW_FLOW, blowBlendSeconds, blendWeightAt) | the blends between blows and back to the stance |
| SERIES-FLOW | `src/combat/weapon/attackSeries.js`, blowFlow driftRate | held or tapped attacks as one series |
| SHIELD-GUARD / SHIELD-BASH | `src/combat/shieldGuard.js` | the guard stance with a shield, the bash |
| LEFT-ARM | `src/combat/leftArmLayer.js` | who poses the left arm (guard, shield, free) |
| BASH-EXIT | `src/combat/fpArm.js` mirrorFor / endAttack | the sword arm after a one-hander's bash |
| BLOW-RETURN, SNEAK-GUARD | `src/characters/bodyMotion/bodyMotion.js` | the third-person carry layer after a blow / crouched |
| SNEAK-STANCE | `src/formats/morrowind/mwFirstPerson.js` sneakIdleGroup | the drawn stance's own crouch |
| CLICK-VARIETY | `src/characters/weaponStates.js` CLICK_REPEAT_MAX | the click's roll never repeats a blow three times |
| FP-SHEATHE | `src/combat/weapon/weaponRig.js` armsSheathe | the unequip animation is drawn, not cut |
| CLIMB-STANCE | `src/combat/fpArm.js` stanceOf | no shield guard on the stone |

`fpArm.js` is a host with a ceiling (`test/scenes/hostceiling.test.js`, `createFpArm`): every law above lives in its
own module and the host only wires it. The host was already over its ceiling before this arc; nothing here moved
behaviour INTO it beyond one-line wiring.

## 1. MW-PACE2 - the player's blow is LED by the arm

The owner: "the blows are jerky - many animations very fast, some at different speeds; better fewer blows, but
smooth, calm and in step". MW-PACE1 fitted every section of the player's blow to the machine's schedule, so a
long clip was rushed and a short one dragged, and blows of one weapon ran at different speeds.

Since MW-PACE2 the player's melee blow carries `lead: true` (the weapon rig's `fpAttack` adds it to the machine's
schedule). A led blow:

- plays at the arm's own pace (section 2), not fitted to `hitAt`;
- holds the machine's hit until the arm has landed it: `createArmLedBlow` (`src/combat/weapon/armLedBlow.js`)
  takes the `hit` event out of the machine's frame and lets it go the frame `fpArm.takeBlowHit()` answers true
  (the release has ended). Never-traps: past `ARM_LED_HIT.max` (1.2 s) it is let go once the arm is not busy, and
  at `ARM_LED_HIT.cap` (3 s) whatever the arm does; an arm that stops leading (the classic sprite, a view with no
  body) lets a held hit go at once;
- refuses a new blow while the arm is still in it: `armCannotSwing()` (`blowBusy()` = Equipping, AttackWindUp or
  AttackRelease, or a hit still held) gates the rig - src/combat/weapon/weaponRig.js:"const armLoosing".

Peers and NPCs keep MW-PACE1 (`blowPace` returns a fitted plan when `blow.lead` is not set - src/combat/fpArm.js:"function blowPace").

## 2. MW-PACE3 - each section at its own speed (the current pace law)

The owner, after MW-PACE2's single calm speed: "it lacks the feel of a fight, sharpness, while keeping the
smoothness - a toy fight; the two-hander and the one-hander's overhead blows are slow; some first-person blows
freeze on a still last frame; the thrusts are long". One speed for the whole blow had removed the snap of the
release; and the window after the blow (section 3, first cut) was a still frame.

`PACE` - src/combat/blowFlow.js:"export const PACE" - `{ wind: 1.35, release: 2.2, recover: 1.4, settle: 0.25 }`, all times the
Speed factor `paceFactor(step)` (1 at Speed 50; faster for a quicker character, held to CALM's band `rateMin` 1 ..
`rateMax` 1.5):

- the wind-up plays at `wind` x the clip;
- the release (to the hit) at `release` x - the snap; `calmBlowPlan` (src/combat/blowFlow.js:"export function calmBlowPlan") gives
  `windRate`, `relRate`, `sf`, and `hitAt = wind/windRate + release/relRate`; `beginRelease` switches
  the rate (src/combat/fpArm.js:"else if (blowPlan) blowPlan.rate");
- after the hit the follow-through ALWAYS plays, braking: `recoverRate(plan, p, series)` -
  src/combat/blowFlow.js:"export function recoverRate" - starts at `recover` x sf and eases linearly to `settle` of it over the
  follow-through's progress `p`; the frame sets it every frame of AttackEnd (src/combat/fpArm.js:"if (paced && blowPlan.lead && upper === UPPER_BODY.AttackEnd)"). Never a
  still frame.

Measured hit times at Speed 50 (retail clip sections, file seconds): fists ~0.26 s, one-hander thrust ~0.32,
one-hander chop ~0.47, two-hander chop ~0.53. The data behind the numbers (wind-up / release / follow per group,
vanilla and ReAnimation): 2h chop wind 0.53 rel 0.27-0.33 fol 0.27-0.40; 2h thrust wind 0.47 rel 0.17-0.20; 1h chop
wind 0.40 rel 0.33-0.40; 1h thrust wind 0.27 rel 0.27; ReAnimation fists wind 0.27 rel 0.13 fol 0.47.

TUNING KNOBS (the owner may ask again): `PACE.release` is the strike's sharpness, `PACE.wind` the wind-up,
`PACE.recover`/`settle` the recovery's start and how far it brakes. `CALM` (src/combat/blowFlow.js:"export const CALM") is only the
Speed band now.

## 3. BLOW-FLOW - the window after a blow and the blends

`BLOW_FLOW` - src/combat/blowFlow.js:"export const BLOW_FLOW" - `{ hold: 0.55, thrustHold: 0.35, exit: 0.5, chain: 0.12, entry: 0.14,
wait: 2 }`.

History (so nobody re-proposes a rejected shape):

1. First cut: the window after a blow was the follow-through played slowly. The owner: "the window is a separate
   animation, not a pause at the end of the blow - it jerks".
2. Second cut: the window was a HOLD at the hit pose (the release's last frame). The owner liked the coherence
   ("everything is great, first and third person agree") - then, after MW-PACE3: "a frozen last frame instead of
   the weapon easing back".
3. Now (MW-PACE3): the follow-through plays braking (section 2), and an ended series gives way to the stance when
   the follow-through ends OR the window is spent (`holdFor(type)`: `hold`, or `thrustHold` for a thrust - a jab's
   straight arm comes back sooner), whichever first. `stepUpper` - src/combat/fpArm.js:"function stepUpper" - counts
   `recoverHeld` from the follow-through's start and ends a still-playing follow-through at the window.

The blends (both views): `poseKindOf(attacking, serial)` names a pose `blow:<serial>` or `pose`;
`blowBlendSeconds(from, to)` gives `0` for the sections of one blow (one clip), `chain` for a blow cut by the next,
`exit` back to the stance, `entry` out of the stance into a blow (the wind-up's first frame is not the stance's
pose: without it the blade leapt across the picture in a frame), and `null` (the view's own
AnimationBlendDuration) for anything else. `blendWeightAt` eases it (smoothstep). Third person reads it at
src/combat/fpArm.js:"const thirdBlendWeight", first person keeps its own `fpBlend` from the frame before
(src/combat/fpArm.js:"if (fpBlend.state !== state)") - a view switch carries nothing.

`createVariantCycle` exists for windows in turn (one per attack type, none twice running); the owner found turns of
different windows jerky, so the pick is the hash pick again and the cycle drives only the bash's alternation
(section 6).

## 4. SERIES-FLOW - held or tapped, one series

The owner: "held or tapped, the blows should run as one series - the window only when the player stops"; "not
only the held button - fast clicking too - one picture".

- `createAttackSeries()` - src/combat/weapon/attackSeries.js - `SERIES = { buffer: 0.45, intent: 0.85 }` (0.7 until 2026-10-28, Motion-Doctrine.md 7c): a press
  waits `buffer` seconds to be taken (a click during a blow is not lost), and the series "goes on" while the button
  is held or for `intent` seconds after the last press. The rig steps it every frame, takes a buffered press as a
  click attack (src/combat/weapon/weaponRig.js:"if (taken) { attackSeries.consume") and tells the arm `fpArm.setSeriesWanted(on)`.
- While the series goes on the arm does not return to the stance: the follow-through is spread over the time the
  machine still takes - `driftRate(span, left, rate)` (src/combat/blowFlow.js:"export function driftRate") gives the base rate that covers
  `SERIES_DRIFT` (0.85) of the follow-through in about `left` seconds under recoverRate's series profile
  (`seriesBase x (1.5 - p)`: quick off the hit, slow by the next blow) - src/combat/fpArm.js:"blowPlan.seriesBase". The arm waits
  at most `BLOW_FLOW.wait` seconds for the next blow.
- The machine's cadence (a DFU strike is ~1.0 s at Speed 50; the fists' left 1.6 s) is untouched - the series only
  fills it.

## 5. CLICK-VARIETY - the click's roll

DFU's click attack rolls a direction from a table half of which is a downward strike; the owner saw three chops
running. `CLICK_REPEAT_MAX` = 2 (src/characters/weaponStates.js:"export const CLICK_REPEAT_MAX"): `rollClickDirection(rolls, recent)` re-rolls
over the other directions when the last two were the same, still uniform among them; a refused click is not
counted (`playerWeapon._rollClickStrike`). A departure from DFU's uniform roll, presentation only. Pinned by
`test/combat/clickvariety.test.js`.

The fists' backhand was removed from the pool: `strikeReversed(strike, weaponType)` never reverses a hand-to-hand
blow (the owner: "one very sharp, intense animation" among the fists - the reversed slash on a fist).

## 6. SHIELD-GUARD and SHIELD-BASH

- SHIELD-GUARD: fists behind a shield stand as a one-hander does - `shieldGuardStance(type, shield)`
  (src/combat/shieldGuard.js:"export function shieldGuardStance") maps HandToHand + shield to the one-hander's guard; the blows stay the fists'.
  The owner: "when a shield is equipped and the stance is drawn with no weapon, hold the shield as when moving
  with a one-hander".
- CLIMB-STANCE: on the stone there is no guard - `stanceOf` answers None while the climb holds the hands, and the
  first-person shield is hidden there as the third person's moves to the back.
- SHIELD-BASH: a thrust behind a shield bashes - the fists' always, a one-hander's in turn with its own thrust
  (`bashesNow` + the variant cycle). The bash is the fists' own thrust clip (a one-hander's weapon group is swapped
  to hand-to-hand for the blow and restored in `endAttack`); the shield is driven out by the `hold` slot,
  `shieldBashHold(upper, progress, view)`, with `BASH` (src/combat/shieldGuard.js:"export const BASH") per view (third: back 0.14,
  reach 0.46, rise 0.1, yaw -24, wind 9, lean 7; first: back 0.1, reach 0.38, rise 0.06, no turn). The shield comes
  home over the recovery: progress is `max(recoverHeld / holdFor, clipCompletion)` in AttackEnd - home by the
  follow-through's end or the window's (src/combat/fpArm.js:"const shieldBash").
- BASH-EXIT (the owner: "after the shield bash, the one-hander in the right hand twitches", third person): the
  bash's body is the fists' thrust, and the return to the stance blends from that RAW clip (a fist's thrust in the
  right arm) while the sword arm's override (the stance's idle, `mirrorFor`) was dropped the same frame - the sword
  was pulled toward the fist pose and back. Now the override is held through the return: `bashExit =
  BLOW_FLOW.exit` in `endAttack` (src/combat/fpArm.js:"if (blowBash) { blowBash"), the idle not restarted under it
  (`resetIdleOnAttackEnd = false`), and a new blow clears it (`blowSerial++; blowHit = false; bashExit = 0;`). The
  mirror reads it at src/combat/fpArm.js:"if (((blowBash && attackingNow()) || bashExit > 0) && idle)".

## 7. LEFT-ARM - who poses the left arm

`src/combat/leftArmLayer.js`: `leftArmModeOf({ view, type, shield, dual, free })` (src/combat/leftArmLayer.js:"export function leftArmModeOf")
answers `guard` (the fists' / a two-hander's left hand on its own clip), `shield`, or `free` (a one-hander's empty
left hand); `leftArmPlan` says which clip poses it (the vanilla walk's left arm for a free hand in third person -
the owner: "the one-hander's left arm should use the Vanilla walk arm"; the stance's idle, still, under a bash);
`createLeftArmLayer` (src/combat/leftArmLayer.js:"export function createLeftArmLayer") eases it in and out (`LEFT_ARM_EASE` in 0.08 / out 0.22) as
weighted overlay tracks over the clip, so nothing snaps. A shield twitch on stopping was this layer snapping before
the ease.

## 8. Third person: BLOW-RETURN, SNEAK-GUARD, SNEAK-STANCE, the free arm

- BLOW-RETURN (the owner: "the two-hander in third person had no transition between the window and the neutral
  stance"): the BODY-MOTION carry layer comes back over `MOTION_EASE.blowReturn` (0.5 s) after a blow, `sinceBlow`
  smoothed (src/characters/bodyMotion/bodyMotion.js:"const backOf = (since) =>"), instead of in a frame.
- SNEAK-GUARD (the owner: "crouched with a one-hander, the blade to the floor"): crouched with a one-hander the
  right hand keeps the clip's carry (`sneakArm`), eased over `MOTION_EASE.sneak` (0.6).
- SNEAK-STANCE: the drawn stance's own crouch idle where a pack carries one - `sneakIdleGroup(type, hasGroup)`
  (src/formats/morrowind/mwFirstPerson.js:"export function sneakIdleGroup").
- The shield arm counts the fists too (`shieldArm` includes `fists`), and a one-hander's free left arm is the walk's
  (`freeArm = cls === 'one'`).

## 9. FP-SHEATHE

The owner: "in first person, drawing the two-hander plays an animation, but putting it away it just vanishes, hands
too - check all similar animations". The weapon rig's draw gate now counts the arm's unequip as a reason to draw
(`armsSheathe = fpArm.active() && !!fpArm.sheathing?.()`), so the sheathe plays to its end; `fpArm.sheathing()`
answers while Unequipping. Pinned by `tools/mutants/fpsheathe.json` and the FP-SHEATHE rows of
`test/combat/weapon/weaponrig.test.js`.

## 10. Tests and mutants

- `test/combat/blowflow.test.js` - pace, the arm-led hit, the blends, variants, the bash, the wiring pins, BLOW-RETURN,
  SNEAK, SERIES and BASH-EXIT.
- `test/combat/mwpace1.test.js` - the led blow end to end on the fixture longsword (wind-up and release rates, the
  braking follow-through moving every frame, the window), the series drift, the thrust's shorter window and a long
  recovery cut at the window (Math.random stubbed: the fixture's weaker thrusts have no follow-through).
- `test/combat/clickvariety.test.js`, the FP-SHEATHE and SERIES rows of `test/combat/weapon/weaponrig.test.js`, the
  shield / left-arm pins of `test/formats/morrowind/fparm.test.js` (its "spell stance" count reads 8 sites now).
- Mutant records, all killed when written: `tools/mutants/blowflow.json` (22), `shieldguard.json` (9),
  `fpsheathe.json` (2), and the updated `mwpace1.json`, `bodymotion.json`, `bodymotion_run.json`, `mwnpc9b.json`,
  `twohands_mw.json`.

## 11. Known state and pitfalls (for the next session)

- Tests already red on this branch before and after this arc (not caused by it): in `fparm.test.js` MW-D8, MW-D9f,
  MW-D24, MW-D29 "the thread is unbroken", MW-D34, AUDIT 33, MW-D38, PX23, AUDIT 36 F2, PX26, PX32, MW-FP-UNEQUIP
  (source pins on `weaponRig.js` lines an earlier commit changed); the bible gates (audit18, citedrift, ledger,
  Testing rows) and several BODY-MOTION claims in `bodymotion_carry.test.js`. Compare against a `git archive HEAD`
  export before blaming a change.
- Mutant records with multi-line `old` text fail `mutantdrift` on a Windows CRLF checkout; they hold on CI's LF.
- In the desktop sandbox, scripts could not write `src/combat/fpArm.js` (the Edit tool could): run mutants in a
  copy of the tree (robocopy to the scratchpad, `node_modules` as a junction), never in the working tree.
- `createFpArm` is over its host ceiling; keep new behaviour in modules (`blowFlow.js`, `leftArmLayer.js`,
  `shieldGuard.js`, `attackSeries.js`, `armLedBlow.js` are the shape).
