// A steady frame of the names over the others: the same heads, the same words. Each of a tag's number-made strings (its
// place, its cone's opacity, its size, a bubble's opacity) is built when its numbers change, and kept on the tag until
// they do; what the DOM is told is unchanged (test/net/name1_bubbles.test.js and the PVP, guild and ribbon pins drive
// that). These pin what a steady frame builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNameLayer } from '../../src/ui/nameLayer.js';
import { NAME_GAP_PX } from '../../src/net/remotePlayers.js';

function fakeNode(tag, doc) {
  const n = {
    tagName: tag.toUpperCase(), children: [], parent: null, id: '', attrs: {},
    append(...cs) { for (const c of cs) { c.parent = n; n.children.push(c); } },
    setAttribute(k, v) { n.attrs[k] = v; },
    remove() { if (n.parent) { n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null; } },
  };
  let text = '', cls = '';
  Object.defineProperty(n, 'textContent', { get: () => text, set: (v) => { text = String(v); doc.writes++; } });
  Object.defineProperty(n, 'className', { get: () => cls, set: (v) => { cls = String(v); doc.writes++; } });
  n.style = new Proxy({}, { set(t, k, v) { t[k] = v; doc.writes++; return true; } });
  return n;
}
function fakeDocument() {
  const doc = { writes: 0 };
  doc.createElement = (tag) => fakeNode(tag, doc);
  doc.head = fakeNode('head', doc);
  doc.body = fakeNode('body', doc);
  doc.getElementById = () => null;
  return doc;
}

/** How many times `run` asks a number for its fixed-point string. */
function fixedCalls(run) {
  const real = Number.prototype.toFixed;
  let calls = 0;
  Number.prototype.toFixed = function (digits) { calls++; return real.call(this, digits); };
  try { run(); } finally { Number.prototype.toFixed = real; }
  return calls;
}

test('a steady frame of names builds none of their number strings, and a moved head, a new size or a fading bubble builds its own at once (mutants: the place kept past a move across or up; the size or the bubble\'s opacity kept)', () => {
  const doc = fakeDocument();
  const clock = { t: 1000 };
  const layer = createNameLayer({ doc, now: () => clock.t });
  const points = [
    { id: 'a', name: 'Ada', x: 400.4, y: 300, scale: 1, off: 0, gt: 'HND', skull: '', bar: { h: 80, s: 20 } },
    { id: 'b', name: 'Bo', x: 900, y: 320.6, scale: 0.8, off: 0 },
  ];
  layer.say('a', 'hello there', clock.t);
  const frame = () => layer.render({ points, viewport: 900, hudScale: 1 });
  frame();
  clock.t += 16;
  frame();   // the cone has settled: every number stands
  const tagA = layer.tagFor('a'), tagB = layer.tagFor('b');
  assert.equal(tagA.node.style.transform, `translate(400px, ${Math.round(300 - NAME_GAP_PX)}px) translate(-50%, -100%)`, 'the fixture is real: the anchor written');
  assert.equal(tagA.bubble.style.opacity, '1.00', 'and the bubble shown in full');
  const writes = doc.writes;
  for (let i = 0; i < 5; i++) {
    clock.t += 16;
    assert.equal(fixedCalls(frame), 0, `steady frame ${i}: no number string built`);
  }
  assert.equal(doc.writes, writes, 'and nothing written to the DOM, as before');
  points[1] = { ...points[1], x: 901 };
  clock.t += 16;
  frame();
  assert.equal(tagB.node.style.transform, `translate(901px, ${Math.round(320.6 - NAME_GAP_PX)}px) translate(-50%, -100%)`, 'a moved head is moved that frame');
  points[1] = { ...points[1], y: 340.2 };
  clock.t += 16;
  frame();
  assert.equal(tagB.node.style.transform, `translate(901px, ${Math.round(340.2 - NAME_GAP_PX)}px) translate(-50%, -100%)`, 'a head moved up or down alone is moved that frame');
  points[1] = { ...points[1], scale: 0.5 };
  clock.t += 16;
  assert.equal(fixedCalls(frame), 1, 'a new scale builds its size alone');
  const sizeB = tagB.node.style.fontSize;
  assert.match(sizeB, /^\d+\.\dpx$/);
  clock.t = 1000 + 5000;   // past BUBBLE_HOLD of the window: the bubble fades
  assert.equal(fixedCalls(frame), 1, 'a fading bubble builds its opacity');
  assert.notEqual(tagA.bubble.style.opacity, '1.00');
  assert.equal(tagB.node.style.fontSize, sizeB);
});
