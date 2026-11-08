import test from 'node:test';
import assert from 'node:assert/strict';
import { figureFraming } from '../../src/render/figureFraming.js';
import { portraitWindow, visibleRangeBounds, CARRIED_SLOTS } from '../../src/combat/fpArm.js';

test('fitting body scale stays constant through a turn with a long sword', () => {
  const ranges = [{ slot: 'body', box: { minX: -.4, maxX: .4, minY: 0, maxY: 2, minZ: -.2, maxZ: .2 } }, { slot: 'weapon', box: { minX: -5, maxX: 5, minY: -.5, maxY: 3, minZ: -.1, maxZ: .1 } }];
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, c = Math.cos(a), s = Math.sin(a);
    const model = [c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];
    const win = figureFraming(ranges, model, {}, true, portraitWindow, visibleRangeBounds, CARRIED_SLOTS);
    assert.equal(win.halfH, 1.08); assert.equal(win.halfW, 1.08 * .58);
    assert.equal(win.center[1], 1);
  }
});

test('ordinary inventory framing retains its existing padding', () => {
  const expected = { center: [1,2,3], halfH: 2, halfW: 3 };
  assert.deepEqual(figureFraming([], [], {}, false, () => expected), { center: [1,2,3], halfH: 2 * 1.24, halfW: 3 * 1.55 });
});


test('moving cloak bounds cannot move or resize the fitting camera at any yaw', () => {
  const body = { slot:'body', box:{minX:-.4,maxX:.4,minY:0,maxY:2,minZ:-.2,maxZ:.2} };
  const cloth = { slot:'cloak (daggerfall_cloak)', box:{} };
  const fur = { slot:'cloak (wolf_pelt_cloak)', box:{} };
  const simulation = { slot:'cloth attachment', piece:{clothPhysics:{}}, box:{} };
  for (let turn=0;turn<12;turn++) {
    const a=turn*Math.PI/6,c=Math.cos(a),s=Math.sin(a);
    const model=[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];
    const expected=figureFraming([body],model,{},true,portraitWindow,visibleRangeBounds,CARRIED_SLOTS);
    for(let frame=0;frame<30;frame++) {
      for(const range of [cloth,fur,simulation]) Object.assign(range.box,{minX:-2-Math.sin(frame),maxX:2+Math.cos(frame),minY:-.5,maxY:3,minZ:-3-Math.cos(frame),maxZ:3+Math.sin(frame)});
      const actual=figureFraming([body,cloth,fur,simulation],model,{},true,portraitWindow,visibleRangeBounds,CARRIED_SLOTS);
      assert.deepEqual(actual,expected,`turn ${turn}, frame ${frame}`);
    }
  }
});
