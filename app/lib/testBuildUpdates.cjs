'use strict';

const { GAME_FILES } = require('./gameChannel.cjs');
const { isNewerRelease } = require('./updateCheck.cjs');

const TEST_TAG = /^dfo-1311-v13\.11\.(0|[1-9]\d*)$/;
const PART_SIZE = 1024 ** 3;
const SETUP = 'DFO-13.11-Setup.exe';
const packPartName = (index) => `${GAME_FILES.pack}.${index + 1}`;

function testReleases(releases) {
  return Array.isArray(releases)
    ? releases.filter((release) => !release?.draft && !release?.prerelease && TEST_TAG.test(release?.tag_name))
      .map((release) => ({ ...release, tag_name: release.tag_name.replace('dfo-1311-v', 'app-v') }))
    : [];
}

function testRelease(releases) {
  return testReleases(releases).reduce((latest, release) =>
    !latest || isNewerRelease(latest.tag_name.slice(5), release.tag_name) ? release : latest, null);
}

function testApi(repository) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid test release repository');
  return `https://api.github.com/repos/${repository}/releases`;
}

function assetOf(release, name) {
  return (Array.isArray(release?.assets) ? release.assets : [])
    .find((asset) => asset?.name === name && Number.isSafeInteger(asset.id) && asset.id > 0);
}

function testReleaseDownload(release, repository) {
  const tag = release?.tag_name?.replace(/^app-v/, 'dfo-1311-v');
  const releases = `https://github.com/${repository}/releases`;
  if (!TEST_TAG.test(tag)) return releases;
  return assetOf(release, SETUP) ? `${releases}/download/${tag}/${SETUP}` : `${releases}/tag/${tag}`;
}

function testGameAssets(release, repository) {
  const manifest = assetOf(release, GAME_FILES.manifest);
  const assets = `${testApi(repository)}/assets/`;
  const pack = [];
  let packSize = 0;
  for (let index = 0; index < (release?.assets?.length ?? 0); index++) {
    const name = packPartName(index);
    const part = assetOf(release, name);
    if (!part) break;
    const { size } = part;
    if (!Number.isSafeInteger(size) || size < 1 || size > PART_SIZE || packSize !== index * PART_SIZE) return null;
    pack.push({ url: assets + part.id, size });
    packSize += size;
  }
  return manifest && pack.length ? { manifest: assets + manifest.id, pack, packSize } : null;
}

async function fetchTestPackRange(pack, start, end, fetchRange) {
  const buffers = [];
  for (let offset = start; offset < end;) {
    const index = Math.floor(offset / PART_SIZE);
    const part = pack[index];
    const localStart = offset % PART_SIZE;
    if (!part || localStart >= part.size) throw new Error('Missing game pack part');
    const localEnd = Math.min(end - index * PART_SIZE, part.size);
    const result = await fetchRange(part.url, localStart, localEnd);
    if (result.status !== 206 || result.contentRange !== `bytes ${localStart}-${localEnd - 1}/${part.size}`
      || result.bytes.length !== localEnd - localStart) throw new Error('Incorrect game pack range');
    buffers.push(result.bytes);
    offset += localEnd - localStart;
  }
  const size = (pack.length - 1) * PART_SIZE + pack.at(-1).size;
  return { status: 206, contentRange: `bytes ${start}-${end - 1}/${size}`, bytes: Buffer.concat(buffers) };
}

module.exports = { PART_SIZE, testApi, packPartName, testRelease, testReleases, testReleaseDownload, testGameAssets, fetchTestPackRange };
