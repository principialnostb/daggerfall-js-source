// A dungeon's map opens the way it was closed: in the same dungeon, after
// coming back and after a relog, on both the classic window and the sheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AutomapWindow, signalAutomapReset, resetAutomapWindowState,
  automapCameraState, automapRenderMode, _setAutomapArt,
} from '../../../src/ui/automap/automapWindow.js';
import { createAutomapSheet } from '../../../src/ui/automap/automapSheet.js';
import { readKeptView } from '../../../src/ui/automap/automapViewKeep.js';
import { _resetForTests } from '../../../src/systems/settings/settings.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const at = (feet, over = {}) => ({
  record: () => ({ revealed: new Set(), visitedThisRun: new Set(), entranceDiscovered: false }),
  model: { exploredPercentage: () => 0, length: 0 },
  drawList: [], dynamicDraws: [], texRemap: null,
  player: () => ({ feet, eye: [feet[0], feet[1] + 1.7, feet[2]], yaw: 0 }),
  startMarker: null, blocks: [{ x: 0, z: 0, name: 'W0000000.RDB' }], arrowMesh: null,
  dungeonName: 'Privateer’s Hold', insideBuilding: false, viewKey: '17/Privateer’s Hold', ...over,
});
const round = (v) => v.map((x) => +x.toFixed(9));
const close = (w) => { w.input('KeyM', { code: 'KeyM' }); w.keyup('KeyM', { code: 'KeyM' }); };

function withStorage(fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: fakeStorage(), configurable: true, writable: true });
  _resetForTests(); resetAutomapWindowState(); _setAutomapArt(null);
  try { fn(); } finally {
    _resetForTests(); resetAutomapWindowState();
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  }
}

test('dungeon map view, classic: a reopen in the same dungeon does not re-centre on the player', () => withStorage(() => {
  signalAutomapReset();
  const w = new AutomapWindow(at([0, 0, 0]));
  w.runVerb('ActionRotateCameraLeft', 1);
  w.runVerb('ActionMoveForward', 0.5);
  close(w);
  const left = automapCameraState();
  new AutomapWindow(at([100, 0, -60]));   // walked a long way, no new signal
  const s = automapCameraState();
  assert.deepEqual(round(s.pos), round(left.pos), 'the camera stays where it was closed');
  assert.deepEqual(round(s.fwd), round(left.fwd), 'and looks the same way');
  assert.deepEqual(s.pivot3D, left.pivot3D, 'the turn pivot stays too');
}));

test('dungeon map view, classic: leaving and coming back, or a relog, opens the kept view', () => withStorage(() => {
  signalAutomapReset();
  const w = new AutomapWindow(at([0, 0, 0]));
  w.runVerb('ActionChangeAutomapGridMode');   // -> 2D
  w.runVerb('ActionRotateCameraLeft', 1);
  w.runVerb('ActionChangeAutomapRenderMode');
  close(w);
  const left = automapCameraState(), mode = automapRenderMode();
  assert.ok(readKeptView('dfo.automapViews', '17/Privateer’s Hold'), 'kept in storage on close');
  resetAutomapWindowState();   // a new session: nothing in memory
  signalAutomapReset();        // re-entering the dungeon raises the reset
  new AutomapWindow(at([5, 0, 5]));
  const s = automapCameraState();
  assert.equal(s.viewMode, left.viewMode, '2D/3D kept');
  assert.deepEqual(round(s.pos), round(left.pos));
  assert.deepEqual(round(s.up), round(left.up));
  assert.equal(automapRenderMode(), mode, 'render mode kept');
  // another dungeon has no kept view: it opens fresh on the player
  signalAutomapReset();
  new AutomapWindow(at([5, 0, 5], { viewKey: '3/Other Place' }));
  assert.notDeepEqual(round(automapCameraState().pos), round(left.pos));
}));

test('dungeon map view, classic: a host with no key (a building) keeps the classic re-centring', () => withStorage(() => {
  signalAutomapReset();
  const w = new AutomapWindow(at([0, 0, 0], { viewKey: undefined }));
  close(w);
  const before = [...automapCameraState().pos];
  new AutomapWindow(at([100, 0, -60], { viewKey: undefined }));
  assert.notDeepEqual(round(automapCameraState().pos), round(before), 'refocused on the player');
}));

test('dungeon map view, sheet: the held map keeps its centre and zoom per dungeon', () => withStorage(() => {
  const deps = { viewKey: 'k1', model: () => ({ rows: [] }), player: () => null };
  const limits = { mapW: 100, mapH: 100, paperW: 400, paperH: 300 };
  assert.equal(createAutomapSheet(deps).keptView(limits), null, 'nothing kept yet: the rest view');
  createAutomapSheet(deps).keepView({ ox: 10, oy: 20, scale: 2 }, { w: 400, h: 300 });
  // the paper may be another size next time: the same map point stays in the middle
  const v = createAutomapSheet(deps).keptView({ ...limits, paperW: 600, paperH: 300 });
  assert.equal(v.scale, 2);
  assert.equal(v.ox + 600 / 4, 10 + 400 / 4);
  assert.equal(v.oy + 300 / 4, 20 + 300 / 4);
  assert.equal(createAutomapSheet({ ...deps, viewKey: 'k2' }).keptView(limits), null, 'another dungeon');
  assert.equal(createAutomapSheet({ ...deps, solid: true }).keptView(limits), null, 'the flat view is not the solid map\'s');
}));
