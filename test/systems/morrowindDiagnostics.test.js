import test from 'node:test';
import assert from 'node:assert/strict';
import { recordMorrowindDiagnostic, getMorrowindDiagnostics, clearMorrowindDiagnostics, exportMorrowindDiagnostics } from '../../src/systems/morrowindDiagnostics.js';

test('diagnostic events have a versioned structured contract', () => {
  clearMorrowindDiagnostics();
  const event = recordMorrowindDiagnostic({ subsystem: 'animation', stage: 'parse', modId: 'example.mod', outcome: 'error', reasonCode: 'KF_PARSE_FAILED' });
  assert.equal(event.schemaVersion, 2);
  assert.equal(event.subsystem, 'animation');
  assert.equal(event.modId, 'example.mod');
  assert.equal(event.reasonCode, 'KF_PARSE_FAILED');
  assert.ok(event.sessionId);
  assert.ok(event.timestamp);
  assert.ok(getMorrowindDiagnostics().some((item) => item.sequence === event.sequence));
  assert.equal(JSON.parse(exportMorrowindDiagnostics()).schemaVersion, 2);
});

test('diagnostics redact credential-like fields and bound long strings', () => {
  clearMorrowindDiagnostics();
  const event = recordMorrowindDiagnostic({ token: 'secret-token', detail: 'x'.repeat(2000) });
  assert.equal('token' in event, false);
  assert.equal(event.detail.length, 1200);
});
