// What the Replacements pane's tests build: a PNG whole enough for its checks (src/systems/replacements/
// replacementSafety.js cleanPng) - the signature, an IHDR, an IDAT and an IEND, each chunk with its true CRC, its pixels
// not deflated, as no test that takes it decodes them - and a zip in the shape the port's own reader reads.
import { crc32 } from '../src/systems/save/saveTransfer.js';
import { PNG_SIGNATURE } from '../src/systems/replacements/replacementRules.js';

/** One chunk: its length, type, body and the CRC of its type and body. */
export function pngChunk(type, body = new Uint8Array(0)) {
  const out = new Uint8Array(12 + body.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(body, 8);
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)));
  return out;
}

/** The IHDR body of a picture, 8-bit RGBA unless told otherwise. */
export function pngHeaderBody(width, height, { depth = 8, colour = 6 } = {}) {
  const body = new Uint8Array(13);
  const view = new DataView(body.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  body[8] = depth;
  body[9] = colour;
  return body;
}

/** Chunks joined behind the signature. */
export function pngOfChunks(chunks) {
  const out = new Uint8Array(PNG_SIGNATURE.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  out.set(PNG_SIGNATURE, 0);
  let at = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** The IDAT every test PNG carries. */
export const TEST_IDAT = new Uint8Array([120, 1, 1, 0, 0]);
/** A PNG of this size: IHDR, a few IDAT bytes, IEND. */
export const testPng = (width, height) =>
  pngOfChunks([pngChunk('IHDR', pngHeaderBody(width, height)), pngChunk('IDAT', TEST_IDAT), pngChunk('IEND')]);

/**
 * A zip of files: [[name, bytes, { method, size }]]. Stored unless `method` is 8, when the bytes are taken as already
 * deflated; `size` is the size the directory states, the bytes' own unless told otherwise.
 */
export function storedZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, bytes, { method = 0, size = bytes.length } = {}] of files) {
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(8, method, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, size, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(bytes, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, size, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directorySize = centrals.reduce((sum, central) => sum + central.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...locals, ...centrals, end]);
}

/** Bytes deflated raw, as a zip's method 8 holds them. */
export async function deflated(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
