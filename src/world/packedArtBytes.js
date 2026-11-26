// Decode the authored mesh buffers and RGBA textures without an iterator allocation per byte.
export function packedArtBytes(encoded) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(encoded);
  const binary = globalThis.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
