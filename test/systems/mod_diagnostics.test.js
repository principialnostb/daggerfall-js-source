import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModDiagnostics } from '../../src/systems/modDiagnostics.js';

test('records structured, ordered events and sanitizes module identifiers', () => {
  const events = [];
  const diagnostics = createModDiagnostics({ sink: (event) => events.push(event), sessionId: 'test-session', now: () => new Date('2026-10-21T12:00:00.000Z') });
  diagnostics.record({ level: 'info', phase: 'registration', action: 'mod-loaded', modId: 'packs/Some Mod.dfmod', resource: 'asset/mesh', details: { count: 3 } });
  assert.equal(events.length, 1);
  assert.equal(events[0].sequence, 1);
  assert.equal(events[0].sessionId, 'test-session');
  assert.equal(events[0].timestamp, '2026-10-21T12:00:00.000Z');
  assert.equal(events[0].modId, 'Some Mod.dfmod');
  assert.equal(events[0].details.count, 3);
  diagnostics.record({ level: 'info', phase: 'registration', action: 'load-order', modId: 'core', resource: 'dfmod/load-order', details: { order: [{ key: 'base', enabled: true }, { key: 'addon', enabled: false }] } });
  assert.deepEqual(events[1].details.order, [{ key: 'base', enabled: true }, { key: 'addon', enabled: false }]);
  assert.equal(diagnostics.summary().totals.info, 1);
});

test('reports a cross-mod duplicate resource once the second owner registers it', () => {
  const events = [];
  const diagnostics = createModDiagnostics({ sink: (event) => events.push(event), sessionId: 'test' });
  diagnostics.record({ level: 'info', phase: 'texture', action: 'register', domain: 'texture', modId: 'base', resource: '003_5-0' });
  diagnostics.record({ level: 'info', phase: 'texture', action: 'register', domain: 'texture', modId: 'base', resource: '003_5-0' });
  diagnostics.record({ level: 'info', phase: 'texture', action: 'register', domain: 'texture', modId: 'override', resource: '003_5-0' });
  const conflicts = events.filter((event) => event.action === 'duplicate-registration');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].details.previousOwner, 'base');
  assert.equal(conflicts[0].details.currentOwner, 'override');
  assert.equal(diagnostics.summary().totals.conflicts, 1);
});

test('stage records success and failure while preserving the original return/throw', async () => {
  const events = [];
  const diagnostics = createModDiagnostics({ sink: (event) => events.push(event), sessionId: 'test' });
  assert.equal(await diagnostics.stage({ modId: 'body-pack', phase: 'body', resource: 'body.nif' }, async () => 42), 42);
  const failure = new Error('bad animation header');
  await assert.rejects(diagnostics.stage({ modId: 'anim-pack', phase: 'animation', resource: 'walk.kf' }, async () => { throw failure; }), failure);
  assert.deepEqual(events.map((event) => event.action), ['stage-start', 'stage-complete', 'stage-start', 'stage-failed']);
  assert.equal(events[3].level, 'error');
  assert.match(events[3].message, /bad animation header/);
});

test('a failing log destination cannot change application behavior', () => {
  const diagnostics = createModDiagnostics({ sink: () => { throw new Error('disk unavailable'); }, sessionId: 'test' });
  assert.doesNotThrow(() => diagnostics.record({ level: 'error', modId: 'broken', action: 'load-failed' }));
  assert.equal(diagnostics.summary().totals.error, 1);
});
