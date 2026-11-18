import assert from 'node:assert/strict';
import test from 'node:test';
import updates from '../../app/lib/testBuildUpdates.cjs';
import launcher from '../../app/lib/launcherState.cjs';

const { retryGitHub, PART_SIZE, packPartName, testRelease, testGameAssets, fetchTestPackRange } = updates;
const tag = 'dfo-1311-v13.11.12';
const repository = 'principialnostb/dfo-13-11-test-releases';
const download = 'https://api.github.com/repos/' + repository + '/releases/assets/';
const asset = (name, size, id) => ({ name, size, id });
const release = {
  tag_name: tag,
  assets: [asset('DFO-Online-game.json.gz', 18, 100), asset(packPartName(0), PART_SIZE, 101), asset(packPartName(1), 2, 102)],
};

test('13.11 launcher selects the newest published test-channel version', () => {
  assert.equal(testRelease([
    release,
    { tag_name: 'dfo-1311-v13.11.99', draft: true },
    { tag_name: 'dfo-1311-v13.11.98', prerelease: true },
    { tag_name: 'app-v50.1.0' },
    { tag_name: 'dfo-1311-v13.11.9' },
  ]).tag_name, 'app-v13.11.12');
});

test('13.11 pack serves a DA13 range across GitHub asset boundaries', async () => {
  const { pack } = testGameAssets(release, repository);
  const requests = [];
  const result = await fetchTestPackRange(pack, PART_SIZE - 1, PART_SIZE + 1, async (url, start, end) => {
    requests.push([url, start, end]);
    const part = pack.find((p) => p.url === url);
    return {
      status: 206, contentRange: `bytes ${start}-${end - 1}/${part.size}`,
      bytes: Buffer.alloc(end - start, part === pack[0] ? 9 : 8),
    };
  });
  assert.deepEqual(requests, [[download + '101', PART_SIZE - 1, PART_SIZE], [download + '102', 0, 1]]);
  assert.deepEqual(result, {
    status: 206, contentRange: `bytes ${PART_SIZE - 1}-${PART_SIZE}/${PART_SIZE + 2}`, bytes: Buffer.from([9, 8]),
  });
  await assert.rejects(fetchTestPackRange(pack, 0, 1, async () => ({ status: 200, bytes: Buffer.alloc(1) })),
    /HTTP 200/);
});

test('GitHub requests retry temporary failures and preserve a refusal', async () => {
  let attempts = 0;
  const response = await retryGitHub(async () => new Response(null, { status: ++attempts === 1 ? 502 : 206 }));
  assert.equal(response.status, 206);
  assert.equal(attempts, 2);
  const refused = await retryGitHub(async () => {
    attempts++;
    return new Response(null, { status: 403 });
  });
  assert.equal(refused.status, 403);
  assert.equal(attempts, 3);
});

test('test builds hold Play until an update is applied and offer a retry on failure', () => {
  const { initialState, reduce, viewOf, nextStep } = launcher;
  let state = initialState({
    current: '13.11.13', transport: 'updater', requireCurrent: true, checkEnabled: true, inGamePicker: true,
  });
  state = reduce(state, { type: 'game-available', version: '13.11.14', preparing: true });
  state = reduce(state, { type: 'game-preparing', checked: 3, files: 4 });
  assert.deepEqual(viewOf(state).progress, { percent: 75, label: '3 of 4 files checked' });
  assert.deepEqual(viewOf(state).statusActions, []);
  state = reduce(state, { type: 'progress', transferred: 0, total: 100, percent: 0 });
  assert.match(viewOf(state).status, /^Downloading/);
  state = reduce(state, { type: 'play-now' });
  assert.equal(state.launch, null);
  assert.equal(state.update.status, 'downloading');
  state = reduce(state, { type: 'game-failed' });
  assert.equal(viewOf(state).play.enabled, false);
  assert.deepEqual(viewOf(state).statusActions.map(({ id }) => id), ['retry-update']);
  state = reduce(state, { type: 'check-start' });
  state = reduce(state, { type: 'game-available', version: '13.11.14' });
  state = reduce(state, { type: 'game-applied', version: '13.11.14' });
  assert.equal(viewOf(state).play.enabled, true);
  state = reduce(state, { type: 'test-access-blocked' });
  assert.equal(viewOf(state).play.enabled, false);
  state = reduce(state, { type: 'check-available', version: '13.11.15' });
  state = reduce(state, { type: 'downloaded' });
  assert.equal(nextStep({ ...state, setup: { status: 'looking' } }), 'install');
});
