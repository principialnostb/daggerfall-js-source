import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOW_FLOW, CALM, PACE, holdFor, calmHitSeconds, calmBlowPlan, paceFactor, recoverRate, poseKindOf, blowBlendSeconds, blendWeightAt, createVariantCycle, bashesNow } from '../../src/combat/blowFlow.js';
import { createArmLedBlow, ARM_LED_HIT } from '../../src/combat/weapon/armLedBlow.js';
import { leftArmPlan, leftArmModeOf } from '../../src/combat/leftArmLayer.js';
import { MW_WEAPON_TYPE } from '../../src/formats/morrowind/mwFirstPerson.js';
import { createBodyMotion, sceneInput } from '../../src/characters/bodyMotion/bodyMotion.js';
import { parseNif } from '../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../src/formats/morrowind/mwSkin.js';
import { retailSkeleton } from '../fixtures/mw/retailRig.mjs';

// BLOW-FLOW / MW-PACE2 (2026-10-26, Mac: "when the character stops striking the weapon snaps back - sharp, unnatural,
// instant"; "the blows are jerky - many animations very fast, some at different speeds; better fewer blows, but smooth,
// calm and in step"; "the shield bash in the pool, in both views"; "crouched with a one-hander the blade to the floor").

const rd = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('MW-PACE3: every blow\'s sections at their own speeds - a quick wind-up, a snapped release, the recovery braking', () => {
  // (Mac: "a toy fight - no sharpness, the overhead blows slow") the clips' wind-up and release, file seconds, measured:
  // ReAnimation's fists 0.27+0.13, the one-hander's thrust 0.27+0.27, its chop 0.40+0.40, the two-hander's thrust
  // 0.47+0.20, its chop 0.53+0.33 - and Daggerfall's tick at Speed 50, 0.199 s
  const step = 0.199;
  const clips = [[0.27, 0.13], [0.27, 0.27], [0.4, 0.4], [0.47, 0.2], [0.53, 0.33]];
  const plans = clips.map(([w, r]) => ({ w, r, ...calmBlowPlan({ seconds: 5 * step, hitAt: 2 * step, step }, w, r) }));
  for (const p of plans) {
    assert.equal(p.lead, true, 'the arm leads it');
    assert.equal(p.sf, 1, 'Speed 50: the clip\'s own factor');
    assert.equal(p.rate, p.windRate, 'it begins with its wind-up');
    assert.equal(p.windRate, PACE.wind, 'the wind-up a little quicker than the clip');
    assert.equal(p.relRate, PACE.release, 'the release snapped');
    assert.ok(Math.abs(p.hitAt - (p.w / p.windRate + p.r / p.relRate)) < 1e-12, 'each section lands when it lands at its speed');
  }
  assert.ok(PACE.release > PACE.wind && PACE.wind > 1, 'quicker than the clip, the release the quickest');
  assert.ok(plans[0].hitAt < plans[4].hitAt, 'the jab first, the heavy chop last');
  assert.ok(plans[4].hitAt < 0.6 && plans[0].hitAt > 0.2, `a fighter's range (${plans[0].hitAt.toFixed(2)}-${plans[4].hitAt.toFixed(2)} s)`);
  assert.ok(calmHitSeconds(step) >= CALM.min && calmHitSeconds(step) <= CALM.max);
  assert.equal(calmHitSeconds(0.01), CALM.min, 'a very fast character: no faster than the band');
  assert.equal(calmHitSeconds(0.5), CALM.max, 'a very slow one: no slower');
  assert.equal(calmHitSeconds(undefined), CALM.max);
  assert.ok(paceFactor(0.046) > paceFactor(0.199) && paceFactor(0.01) === CALM.rateMax, 'a faster character strikes faster, to the band');
  assert.ok(calmBlowPlan({ step: 0.046 }, 0.4, 0.2).hitAt < calmBlowPlan({ step: 0.199 }, 0.4, 0.2).hitAt);
  // the unarmed left strike's eight ticks and the others' five share the one tick, so the one pace
  const left = calmBlowPlan({ seconds: 8 * step, hitAt: 3 * step, step }, 0.27, 0.13), right = calmBlowPlan({ seconds: 5 * step, hitAt: 2 * step, step }, 0.27, 0.13);
  assert.equal(left.hitAt, right.hitAt, 'the fists\' two hooks in step');
  // the recovery: quick off the hit, braking to PACE.settle of it - never stopped; a series' from 1.5x to 0.5x its base
  const plan = plans[2];
  assert.equal(recoverRate(plan, 0, false), PACE.recover);
  assert.ok(Math.abs(recoverRate(plan, 1, false) - PACE.recover * PACE.settle) < 1e-12);
  assert.ok(recoverRate(plan, 0.5, false) < recoverRate(plan, 0.2, false), 'braking');
  assert.ok(PACE.settle > 0, 'never a still frame');
  const series = { ...plan, seriesBase: 0.4 };
  assert.ok(Math.abs(recoverRate(series, 0, true) - 0.6) < 1e-12 && Math.abs(recoverRate(series, 1, true) - 0.2) < 1e-12);
  assert.equal(recoverRate(series, 0.3, false), recoverRate(plan, 0.3, false), 'the series over: the ended recovery');
  // the window a blow holds: a thrust's the shorter
  assert.equal(holdFor('thrust'), BLOW_FLOW.thrustHold);
  assert.equal(holdFor('chop'), BLOW_FLOW.hold);
  assert.ok(BLOW_FLOW.thrustHold < BLOW_FLOW.hold, 'a jab\'s straight arm comes back sooner than a cut ended low');
});

test('MW-PACE2: the machine\'s hit waits for the arm to land it - and goes late rather than never', () => {
  const led = createArmLedBlow();
  let landed = false, busy = true;
  const take = () => { const l = landed; landed = false; return l; };
  const frame = (evs, dt = 1 / 60) => led.step(evs, dt, { leads: true, takeHit: take, busy: () => busy });
  assert.deepEqual(frame(['swing', 'hit']).evs, ['swing'], 'the machine\'s hit is held for the arm');
  assert.equal(led.holding(), true);
  assert.deepEqual(frame([]).evs, [], 'still held while the arm winds up and releases');
  landed = true;
  const out = frame([]);
  assert.deepEqual(out.evs, ['hit'], 'and goes the frame the arm lands it');
  assert.equal(out.fired, true);
  assert.equal(led.holding(), false);
  // never-traps: an arm that never lands it - after max once it is free, after cap whatever
  frame(['hit']);
  for (let t = 0; t < ARM_LED_HIT.max + 0.1; t += 1 / 60) frame([]);
  assert.equal(led.holding(), true, 'an arm still throwing it keeps it past max');
  busy = false;
  assert.deepEqual(frame([]).evs, ['hit'], 'free, past max: let go');
  busy = true;
  frame(['hit']);
  let gone = false;
  for (let t = 0; t < ARM_LED_HIT.cap + 0.1 && !gone; t += 1 / 60) gone = frame([]).fired;
  assert.ok(gone, 'and at the cap whatever the arm does');
  // the arm stops leading (a view with no body, the classic sprite): a held hit is let go at once, others pass
  frame(['hit']);
  assert.deepEqual(led.step([], 1 / 60, { leads: false }).evs, ['hit']);
  assert.deepEqual(led.step(['hit'], 1 / 60, { leads: false }).evs, ['hit'], 'unled, the machine\'s own frame');
});

test('BLOW-FLOW: the blends - one blow\'s sections never, a blow cut by the next briefly, back to the stance slowly; into a blow the view\'s own', () => {
  assert.equal(poseKindOf(true, 7), 'blow:7');
  assert.equal(poseKindOf(false, 7), 'pose');
  assert.equal(blowBlendSeconds('blow:7', 'blow:7'), 0, 'wind-up, release, follow-through: one clip');
  assert.equal(blowBlendSeconds('blow:7', 'blow:8'), BLOW_FLOW.chain, 'the next blow cuts this one');
  assert.equal(blowBlendSeconds('blow:7', 'pose'), BLOW_FLOW.exit, 'back to the stance');
  // (Mac's recording: at once, the wind-up's first frame threw the blade across the picture in a frame)
  assert.equal(blowBlendSeconds('pose', 'blow:8'), BLOW_FLOW.entry, 'out of the stance: briefly, in both views');
  assert.ok(BLOW_FLOW.entry > 0.1 && BLOW_FLOW.entry < BLOW_FLOW.exit, 'quick enough to keep the blow\'s bite');
  assert.equal(blowBlendSeconds('pose', 'pose'), null, 'any other change is the view\'s own');
  assert.ok(BLOW_FLOW.exit > BLOW_FLOW.chain, 'the return the slowest of them');
  assert.ok(BLOW_FLOW.hold > 0.2, 'a window held after the blow for the next to continue from');
  assert.equal(blendWeightAt(0, 0.4), 0);
  assert.equal(blendWeightAt(0.4, 0.4), 1);
  assert.ok(blendWeightAt(0.1, 0.4) < 0.25 && blendWeightAt(0.3, 0.4) > 0.75, 'eased: leaves slowly, arrives slowly');
  assert.equal(blendWeightAt(0.1, 0), 1, 'no blend: at once');
});

test('BLOW-FLOW: the windows of one attack type play in turn - none twice running while another is there', () => {
  const c = createVariantCycle();
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(() => c.next('weapononehand|chop', 3)), [0, 1, 2, 0, 1, 2]);
  assert.deepEqual([0, 1, 2].map(() => c.next('weapontwohand|slash', 2)), [0, 1, 0], 'each key its own turn');
  assert.equal(c.next('handtohand|thrust', 1), 0, 'one window: that one');
});

test('SHIELD-BASH: the fists\' thrust behind a shield always bashes, a one-hander\'s in turn with its own thrust', () => {
  const c = createVariantCycle();
  assert.equal(bashesNow({ thrust: true, shield: true, fists: true, cycle: c }), true);
  assert.deepEqual([0, 1, 2, 3].map(() => bashesNow({ thrust: true, shield: true, cycle: c })), [false, true, false, true], 'the sword\'s thrust, the bash, in turn');
  assert.equal(bashesNow({ thrust: false, shield: true, fists: true, cycle: c }), false, 'a chop or a slash is the weapon\'s');
  assert.equal(bashesNow({ thrust: true, shield: false, cycle: c }), false, 'no shield, no bash');
  // the one-hander's bash holds the shield where the guard does, in both views; its own walk and blows otherwise
  assert.equal(leftArmModeOf({ view: 'first', type: MW_WEAPON_TYPE.LongBladeOneHand, shield: true }), 'shield');
  assert.deepEqual(leftArmPlan({ mode: 'shield', bashing: true, attacking: true }), { kind: 'movement', base: 'walkleft', stance: 'drawn', still: true });
  assert.deepEqual(leftArmPlan({ mode: 'shield', view: 'first', bashing: true, attacking: true }), { kind: 'stance', base: 'idle', stance: 'drawn', still: true });
  assert.equal(leftArmPlan({ mode: 'shield', view: 'first', moving: true, base: 'walkforward' }), null, 'the first person\'s walk is its clip\'s');
  assert.equal(leftArmPlan({ mode: 'shield', attacking: true }), null, 'the sword\'s own blow: the attack clip\'s arms');
});

test('BLOW-FLOW / MW-PACE2: the rig\'s wiring - the led blow at one speed, its hit and its busy said, the window, the blends, the bash', () => {
  const src = rd('src/combat/fpArm.js');
  // the player's led blow keeps its one rate through release and follow-through; a peer's is fitted as MW-PACE1 has it
  assert.match(src, /if \(blow\.lead\) return calmBlowPlan\(blow, wind, release\);/);
  assert.match(src, /else if \(blowPlan && !blowPlan\.lead\) blowPlan\.rate = blowRate\(actionState\.stopTime - actionState\.time, blowPlan\.seconds - blowPlan\.clock\);/);
  // MW-PACE3: the player's release snapped, its follow-through braking frame by frame
  assert.match(src, /else if \(blowPlan\) blowPlan\.rate = blowPlan\.relRate;/);
  assert.match(src, /blowPlan\.seriesBase = driftRate\(actionState\.stopTime - actionState\.startTime, blowPlan\.seconds - blowPlan\.clock, recoverRate\(blowPlan, 0, false\)\);/);
  assert.match(src, /if \(paced && blowPlan\.lead && upper === UPPER_BODY\.AttackEnd\) blowPlan\.rate = recoverRate\(blowPlan, clipCompletion\(actionState\), seriesWanted\);/);
  assert.match(src, /blowHit = true;   \/\/ MW-PACE2: the release is done/);
  assert.match(src, /takeBlowHit\(\) \{ const hit = blowHit; blowHit = false; return hit; \},/);
  assert.match(src, /pick = candidates\[\(hash >>> 0\) % candidates\.length\]\.pick;/, 'one window an attack type: no turns of windows of their own length');
  // the window: every blow plays its follow-through; an ended series' gives way to the stance by the window's end
  assert.match(src, /case UPPER_BODY\.AttackRelease:[\s\S]{0,300}\s+beginFollow\(\);\s+break;/);
  assert.match(src, /if \(recovering\) recoverHeld \+= dt;/);
  assert.match(src, /if \(playing && !\(recovering && !seriesWanted && recoverHeld >= holdFor\(attackType\)\)\) return;/);
  assert.match(src, /case UPPER_BODY\.AttackEnd:[\s\S]{0,400}if \(recovering && seriesWanted && recoverHeld < BLOW_FLOW\.wait\) break;\s+endAttack\(\);/);
  assert.match(src, /blowBusy\(\) \{\s+if \(!built \|\| !built\.ok\) return false;\s+return upper === UPPER_BODY\.Equipping \|\| upper === UPPER_BODY\.AttackWindUp \|\| upper === UPPER_BODY\.AttackRelease;\s+\}/,
    'the window is free: a next blow starts from the held pose');
  assert.match(src, /upper === UPPER_BODY\.AttackEnd && blowPlan\?\.lead \? Math\.min\(1, Math\.max\(recoverHeld \/ holdFor\(attackType\), clipCompletion\(actionState\)\)\) : clipCompletion\(actionState\)/, 'the bash\'s shield comes home over the recovery - by its follow-through\'s end or the window\'s');
  // BASH-EXIT: the stance's right arm held over the fists' clip through the return to the stance, its idle not restarted
  assert.match(src, /if \(\(\(blowBash && attackingNow\(\)\) \|\| bashExit > 0\) && idle\) \{ req\.limbs = \{ R: \{ clip: idle, side: 'R', mirror: false \} \};/);
  assert.match(src, /if \(blowBash\) \{ blowBash = false; bashExit = BLOW_FLOW\.exit; resetIdleOnAttackEnd = false; refreshWeaponGroup\(\); \}/);
  assert.match(src, /blowSerial\+\+; blowHit = false; bashExit = 0;/, 'a next blow is its own - no bash arm over it');
  assert.match(src, /bashExit = Math\.max\(0, bashExit - dt\);/);
  assert.match(src, /stepUpper\(dt\);/);
  assert.match(src, /const blendDuration = reactionRule\?\.duration \?\? thirdBlendSeconds \?\? \[0, 0\.16, 0\.25, 0\.4\]\[blendChoice\];/);
  assert.match(src, /blendFrom: fpBlend\.seconds > 0 \? fpBlend\.from : null,/);
  assert.match(src, /fpBlend\.at === frames/);
  // the bash: the right arm the stance's, a one-hander's under the fists' own clip, its group back as the blow ends
  assert.match(src, /if \(blowBash && animWeaponType\(built\.mwType, sheathed, spellReady\) !== MW_WEAPON_TYPE\.HandToHand\) weaponGroup = composeWeaponGroup\(MW_WEAPON_TYPE\.HandToHand, hasGroup\)\.group \?\? weaponGroup;/);
  assert.match(src, /if \(blowBash\) \{ blowBash = false; bashExit = BLOW_FLOW\.exit; [^}]*refreshWeaponGroup\(\); \}/);
  assert.match(src, /const shieldBash = \(\) => \(blowBash && actionState && attackingNow\(\) && !climbHands && !held/);
  // the rig: the player's melee blow led, its hit held for the arm, no blow started while the arm still throws one
  const rig = rd('src/combat/weapon/weaponRig.js');
  assert.match(rig, /const blow = schedule && !m\.ranged \? \{ \.\.\.schedule, lead: true \} : schedule;/);
  assert.match(rig, /held\.evs = armLed\.step\(held\.evs, dt, \{ leads: \(fpArm\.active\(\) \|\| fpArm\.thirdActive\(\)\) && !playerWeapon\.machine\.ranged,/);
  assert.match(rig, /return !m\.ranged && m\.state === 'Idle' && \(fpArm\.active\(\) \|\| fpArm\.thirdActive\(\)\) && \(armLed\.holding\(\) \|\| !!fpArm\.blowBusy\?\.\(\)\);/);
  assert.match(rig, /const armLoosing = armCannotDraw\(\) \|\| armCannotSwing\(\);/);
  assert.match(rig, /if \(armCannotDraw\(\) \|\| armCannotSwing\(\)\) return;/);
});

test('SNEAK-GUARD: crouched, a one-hander\'s arm is its sneak clip\'s - the carry writes none of it, and takes it back standing', () => {
  const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const written = (scene) => {
    const motion = createBodyMotion();
    let n = 0;
    for (let i = 0; i < 360; i++) {
      motion.step(1 / 60, sceneInput(scene));
      const pose = new Map();
      motion.apply(sk, pose, GRAPH_ROOT, sm);
      if (i > 330) for (const b of ['bip01 r upperarm', 'bip01 r forearm', 'bip01 r hand']) if (pose.has(sk.byName.get(b))) n++;
    }
    return n;
  };
  const T = MW_WEAPON_TYPE;
  assert.equal(written({ weapon: T.LongBladeOneHand, sneaking: true }), 0, 'crouched still');
  assert.equal(written({ weapon: T.LongBladeOneHand, sneaking: true, forward: 1, speed: 1.5 }), 0, 'crouched walking');
  assert.ok(written({ weapon: T.LongBladeOneHand }) > 0, 'standing: the carry\'s guard');
  assert.ok(written({ weapon: T.LongBladeTwoHand, sneaking: true }) > 0, 'a two-hander\'s crouch is its own row');
});

test('SNEAK-STANCE: crouched, the drawn stance\'s own crouch where a pack carries one - ReAnimation\'s, OpenMW\'s, then the bare', async () => {
  const { sneakIdleGroup } = await import('../../src/formats/morrowind/mwFirstPerson.js');
  const { idleBaseFor, FP_IDLE_SNEAK, FP_IDLE_BASE } = await import('../../src/combat/fpArm.js');
  const T = MW_WEAPON_TYPE;
  // ReAnimation v3's first-person pack (xbase_anim.1st/x1hSneakIdle.kf and its kin): one crouch a stance
  const reanim = new Set(['idle1hsneak', 'idle1ssneak', 'idle2csneak', 'idle2wsneak', 'idlebowsneak', 'idlehhsneak', 'idle1tsneak', 'idlecrossbowsneak']);
  const has = (set) => (g) => set.has(g);
  assert.equal(sneakIdleGroup(T.LongBladeOneHand, has(reanim)), 'idle1hsneak');
  assert.equal(sneakIdleGroup(T.LongBladeTwoHand, has(reanim)), 'idle2csneak');
  assert.equal(sneakIdleGroup(T.HandToHand, has(reanim)), 'idlehhsneak');
  assert.equal(sneakIdleGroup(T.MarksmanBow, has(reanim)), 'idlebowsneak');
  assert.equal(sneakIdleGroup(T.LongBladeOneHand, has(new Set(['idlesneak1h', 'idlesneak']))), 'idlesneak1h', 'OpenMW\'s spelling');
  assert.equal(sneakIdleGroup(T.LongBladeOneHand, has(new Set(['idlesneak']))), 'idlesneak', 'the reference\'s bare crouch');
  assert.equal(sneakIdleGroup(T.None, has(reanim)), null, 'sheathed, no crouch of its own in that pack');
  // and a stance's crouch is a crouch: the idle's base is the sneak's
  assert.equal(idleBaseFor({ sneaking: true, hasGroup: has(reanim), type: T.LongBladeOneHand }), FP_IDLE_SNEAK);
  assert.equal(idleBaseFor({ sneaking: true, hasGroup: has(reanim), type: T.None }), FP_IDLE_BASE);
  assert.match(rd('src/combat/fpArm.js'), /const compose = \(\) => \(base === FP_IDLE_SNEAK \? \{ group: sneakIdleGroup\(type, hasGroup\) \} : composeStanceGroup\(base, type, hasGroup\)\);/);
});

test('BLOW-RETURN: after a blow the carry takes the weapon back over BLOW_FLOW.exit - never the frame the blow ends', async () => {
  // (Mac: "the two-hander stays raised after the blow and goes back to neutral instantly") BODY-MOTION steps aside for a
  // blow, and its weight on the blow's last frame is nothing - so it took the carry's hands back at once
  const { MOTION_EASE } = await import('../../src/characters/bodyMotion/bodyMotion.js');
  assert.equal(MOTION_EASE.blowReturn, BLOW_FLOW.exit, 'as slowly as the clip goes back');
  const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const hand = sk.byName.get('bip01 r hand');
  for (const weapon of [MW_WEAPON_TYPE.LongBladeTwoHand, MW_WEAPON_TYPE.LongBladeOneHand]) {
    const motion = createBodyMotion();
    let prev = null, worst = 0, settled = null;
    for (let i = 0; i < 150; i++) {
      const blow = i < 60 ? { type: 'chop', reversed: false, hand: 'R', section: 'follow', progress: 1, strength: 1 } : null;
      motion.step(1 / 60, sceneInput({ weapon, blow }));
      const pose = new Map();
      motion.apply(sk, pose, GRAPH_ROOT, sm);
      const p = sm(sk, pose, GRAPH_ROOT).get(hand).t;
      if (prev && i >= 60) worst = Math.max(worst, Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]));
      prev = p; settled = p;
    }
    const rest = sm(sk, new Map(), GRAPH_ROOT).get(hand).t;
    const travel = Math.hypot(settled[0] - rest[0], settled[1] - rest[1], settled[2] - rest[2]);
    assert.ok(travel > 5, `type ${weapon}: the carry does hold the weapon off the clip's (${travel.toFixed(1)} units)`);
    assert.ok(worst < travel / 6, `type ${weapon}: the hand came back ${worst.toFixed(1)} units in a frame of ${travel.toFixed(1)}`);
  }
});

test('BLOW-ENTRY: into a blow the carry lets the weapon go over MOTION_EASE.blowEntry - never in the blow\'s first frame', async () => {
  // (measured in the owner's game, 2026-10-28: the longsword's blade 0.41 m on the second frame of every blow - BLOW-RETURN's
  // share read 0 inside a blow, so the entry's ease multiplied nothing)
  const sm = (sk, pose, root) => skeletonSpaceMatrices(sk, pose, root);
  const sk = buildSkeleton(parseNif(retailSkeleton()));
  const hand = sk.byName.get('bip01 r hand');
  for (const weapon of [MW_WEAPON_TYPE.LongBladeTwoHand, MW_WEAPON_TYPE.LongBladeOneHand]) {
    const motion = createBodyMotion();
    let prev = null, worst = 0, held = null;
    for (let i = 0; i < 150; i++) {
      const blow = i >= 90 ? { type: 'chop', reversed: false, hand: 'R', section: 'windUp', progress: 0, strength: 1 } : null;
      motion.step(1 / 60, sceneInput({ weapon, blow }));
      const pose = new Map();
      motion.apply(sk, pose, GRAPH_ROOT, sm);
      const p = sm(sk, pose, GRAPH_ROOT).get(hand).t;
      if (i === 89) held = p;
      if (prev && i >= 90) worst = Math.max(worst, Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]));
      prev = p;
    }
    const rest = sm(sk, new Map(), GRAPH_ROOT).get(hand).t;
    const travel = Math.hypot(held[0] - rest[0], held[1] - rest[1], held[2] - rest[2]);
    assert.ok(travel > 5, `type ${weapon}: the carry held the weapon off the clip's (${travel.toFixed(1)} units)`);
    assert.ok(worst < travel / 3, `type ${weapon}: the hand left ${worst.toFixed(1)} units in a frame of ${travel.toFixed(1)}`);
    assert.ok(Math.hypot(prev[0] - rest[0], prev[1] - rest[1], prev[2] - rest[2]) < 1e-6, 'and the blow is the clip\'s once in');
  }
});

test('SECTION-SEAM: a seam inside one blow - its follow-through keyed past its hit - is blended, a joined one never', async () => {
  const { SECTION_SEAM, sectionGap } = await import('../../src/combat/blowFlow.js');
  const release = { startTime: 314.6, stopTime: 314.733, time: 314.733, reversed: false };
  const follow = { startTime: 314.8, stopTime: 315.2, time: 314.8, reversed: false };
  assert.ok(Math.abs(sectionGap(release, follow) - 0.067) < 1e-9);
  assert.equal(blowBlendSeconds('blow:7', 'blow:7', release, follow), SECTION_SEAM.seconds, 'the longsword\'s 0.067 s past its hit');
  assert.equal(blowBlendSeconds('blow:7', 'blow:7', release, { ...follow, startTime: 314.733, time: 314.733 }), 0, 'joined: one clip');
  // MS1: a backhand's sections played backwards join where each shows its time - the release's max attack, the wind-up's
  const backRelease = { startTime: 314.5, stopTime: 314.733, time: 314.733, reversed: true };
  const backFollow = { startTime: 314.2, stopTime: 314.5, time: 314.2, reversed: true };
  assert.equal(blowBlendSeconds('blow:7', 'blow:7', backRelease, backFollow), 0);
  assert.equal(blowBlendSeconds('blow:7', 'blow:8', release, follow), BLOW_FLOW.chain, 'a next blow is the chain\'s');
  assert.ok(SECTION_SEAM.seconds < BLOW_FLOW.entry, 'shorter than a blow\'s entry: the release keeps its snap');
  const src = rd('src/combat/fpArm.js');
  assert.match(src, /blowBlendSeconds\(thirdPoseKind, kindNow, thirdPoseState, state\)/);
  assert.match(src, /blowBlendSeconds\(fpBlend\.kind, fKind, fpBlend\.state, state\)/);
});

test('SERIES-FLOW: the series and its buffer - a press waits SERIES.buffer to be taken, the series goes on SERIES.intent after it or while held', async () => {
  const { createAttackSeries, SERIES } = await import('../../src/combat/weapon/attackSeries.js');
  const { driftRate, SERIES_DRIFT } = await import('../../src/combat/blowFlow.js');
  const s = createAttackSeries();
  const dt = 1 / 60;
  assert.equal(s.wanted(), false);
  assert.equal(s.step(dt, true), true, 'the press');
  assert.equal(s.buffered(), true);
  assert.equal(s.step(dt, true), false, 'held is no second press');
  assert.equal(s.wanted(), true, 'held: the series goes on');
  s.step(dt, false);
  const frames = (sec) => Math.round(sec / dt);
  for (let i = 0; i < frames(SERIES.buffer) - 4; i++) s.step(dt, false);
  assert.equal(s.buffered(), true, 'still waiting to be taken');
  for (let i = 0; i < 4; i++) s.step(dt, false);
  assert.equal(s.buffered(), false, 'spent after SERIES.buffer');
  assert.equal(s.wanted(), true, 'the series still goes on a while');
  for (let i = 0; i < frames(SERIES.intent); i++) s.step(dt, false);
  assert.equal(s.wanted(), false, 'and ends SERIES.intent after the last press');
  s.step(dt, true); s.consume();
  assert.equal(s.buffered(), false, 'a blow begun spends the press');
  // the drift: the follow-through's share over the machine's time left, never faster than the blow, never stopped
  assert.equal(driftRate(0.5, 1, 1.5), 0.5 * SERIES_DRIFT / 1);
  assert.equal(driftRate(0.5, 0.01, 1.5), 1.5, 'no time left: the blow\'s own speed at most');
  assert.equal(driftRate(0.01, 10, 1.5), 0.05, 'never stopped');
  assert.ok(SERIES_DRIFT < 1, 'only part of the follow-through: the weapon never goes back to the stance inside a series');
});
