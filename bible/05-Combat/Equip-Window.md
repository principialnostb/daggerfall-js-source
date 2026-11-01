# The equip window - the pause after a change of hands, and what an animation of it must keep

(EQUIP-WINDOW, the owner, 2026-10-28; a record of a law the port already keeps, written as the brief for the animations
that will be made for it. The law is Daggerfall's and DFU's; nothing here changes it.)

> "опиши эту механику в документации что бы под нее были сделаны анимации потом" - and the rule it stands under:
> "у нас графическая сборка которая не должна лезть менять фундаментальные принципы игры ... влияния на механики игры
> не должно быть"

## 1. The law

When what the hands hold changes, the player cannot strike for a while. Daggerfall calls it equipping; DFU keeps it per
hand (`EquipCountdownRightHand`/`LeftHand`, WeaponManager.cs); the port keeps one clock, `entity.equipCountdown` (the CH3
collapse, `equip.js:"export function equipDelayFor(item) {"`).

- **The bill.** When the inventory closes (the classic window and the enhanced pack alike) and when a quickslot or a
  hotkey changes a hand, each hand whose item CHANGED adds the leaving item's delay plus the arriving item's
  (`equip.js:"export function billEquipDelayOnClose(entity, snap) {"`, DaggerfallInventoryWindow.cs:1168-1199). An empty
  hand costs nothing. A bow switched between hands under `BowLeftHandWithSwitching` bills `(delay - 500) / 1.7` for
  each hand (`playerWeapon.js`'s `toggleHand`).
- **The table** (`weaponStates.js:"export const EQUIP_DELAY_TIMES = ["`, by the item's GroupIndex - a weapon's template
  less 113, a shield's less 102), in the clock's units:

  | item | units | item | units | item | units |
  |---|---|---|---|---|---|
  | Dagger | 500 | Longsword | 1700 | Battle Axe | 2200 |
  | Tanto | 700 | Katana | 1700 | War Axe | 2000 |
  | Staff | 1200 | Claymore | 3000 | Short Bow | 4000 |
  | Shortsword | 900 | Dai-Katana | 3400 | Long Bow | 5000 |
  | Wakazashi | 900 | Mace | 2000 | Buckler, Round Shield | 1700 |
  | Broadsword | 1800 | Flail | 2200 | Kite Shield | 3000 |
  | Saber | 1600 | Warhammer | 2000 | Tower Shield | 3400 |

- **The drain.** 980 units a second, to 0 (`weaponRig.js:"entity.equipCountdown = Math.max(0, entity.equipCountdown - dt * 980);"`,
  WeaponManager.cs:677-693) - so a Longsword for a Claymore is 1700 + 3000 = 4700 units, 4.8 s.
- **What it holds.** No swing while it runs (`weaponRig.js:"const canAttack = !playerWeapon.sheathed"`, the attack input
  and the touch button the same), and the classic hands are drawn EMPTY (`weaponRig.js:"else if ((entity?.equipCountdown ?? 0) > 0) v = false;"`,
  F025) - which in the Morrowind bodies reads as the new weapon in its scabbard at the hip, the stance unchanged, until
  the window ends.

## 2. The rule for the picture

**The window is the game's; the picture follows it, never the other way.** The client may draw the window any way it
likes, and must not lengthen it, shorten it, or hold a blow for a picture. The 3D body is graphics: a load, an
animation's length or a missing clip never decides when the player may strike or when a blow lands.

LOAD-STALL broke that once and took it back (`07-Rendering/Load-Stalls.md`, STANCE-FIRST): while a new weapon's model
was still loading the swing was held. Now the game's swing goes as it would, and only the PICTURE waits - the Morrowind
arm draws no blow with the hand the game has already put away (`fpArm.js`'s `attack`, `handSettled`), and leads none, so
the hit lands on the game's own clock (`weaponRig.js`'s `armLed` step).

## 3. The brief for the animations (not made yet)

Today the window is drawn as nothing: the weapon waits at the hip and is in the hand the frame the window ends. What
it should show, and what the animation must keep:

- **Its length is read, never chosen.** At the bill, `total = equipCountdown` (the units just added); each frame,
  `progress = 1 - equipCountdown / total`. The animation runs on `progress`, so it ends EXACTLY when the strike is
  allowed - at 0, the weapon in the hand at the ready, the idle of its stance - whatever the table says, a Dagger's
  half second or a Long Bow's five.
- **Its phases** (a proposal): the leaving item put away - sheathed, slung or set down - over the first part, as long
  as the leaving item's own share of the bill (`equipDelayFor(old) / total`); the arriving one drawn over the rest, its
  own share. A hand that changed to nothing has only the first; a hand that was empty, only the second. Both hands
  changed: both at once.
- **Morrowind's own groups** are the source: `base_anim`'s `Equip` and `Unequip` per weapon group (the rig plays them
  today at their own length, MW-D28). The window's animation is those clips STRETCHED to their share of the window -
  their text keys (`equip attach`, `unequip detach`) mark where the mesh moves between the scabbard and the hand.
- **Interrupted.** A second change mid-window adds its bill (`+=`) - the animation takes the new total and goes on from
  where the picture stands; it never restarts the clock and never shows the old weapon drawn again.
- **Blocked moments** the animation must not cover: a spell readied, climbing, a gathering tool in hand - each already
  holds the swing by its own law (`canAttack`'s other terms); the window's picture yields to theirs.
- **Both views.** The first-person arms and the third-person body show the same phase at the same `progress`; a peer
  sees it from the wire's state, not from its own clock.
