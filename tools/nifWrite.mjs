// A MORROWIND NIF, WRITTEN. The other end of src/formats/morrowind/mwNifFile.js.
//
//     node tools/nifWrite.mjs <mesh.json> <out.nif> [--texture=NAME.dds]
//                             [--node=NAME] [--keep-v]
//
// FIELD-GUN-MW2 (2026-09-20). FIELD-GUN-MW1 baked Mac's FBX into the
// batch shape `flattenNif` emits, and then stopped, because a batch is
// not where the Morrowind lane takes a part:
//
//   bindPartsInto (mwFirstPerson.js:"for (const part of parts)") does `parseNif(part.bytes)`
//   and hands the result to `bindPart`. A part IS NIF BYTES.
//
// ═══ SO THE MESH BECOMES A NIF, AND NOT A SECOND DOOR ═════════════
//
// The obvious alternative - teach `bindPartsInto` to take pre-flattened
// batches beside NIF bytes - is the wrong one, and the file's own
// history says why: "MW7 failed by carrying a second port of one rule,
// and two copies of a rule drift." Everything a part gets on the way in
// is BEHIND that door: rule 34's discarded root transform, rule 14's
// BoneOffset, rule 13's mirror, the property chain, the attach. A
// second entrance would have to re-implement or skip every one of them,
// for ever, for one mesh.
//
// Written as a NIF, the port's own weapon is a part like any other and
// `fpArm.js` needs no arm for it at all.
//
// ═══ THE PRECEDENT ════════════════════════════════════════════════
//
// This repo already authors NIFs: `test/fixtures/mw/generate.py` writes
// its fixtures with pyffi. That is a Python dependency a bake cannot
// have, and its purpose is the opposite of this one's - it exists so
// the READER is tested against a writer sharing none of its
// assumptions. This writer shares every assumption with the reader ON
// PURPOSE, and is held to it by the strictest check available: the pin
// parses what it writes with the port's own `parseNif` and flattens it
// with the port's own `flattenNif`, and the batches must equal the
// baked mesh field for field. A 4.0.0.2 stream carries NO record sizes,
// so one byte wrong anywhere desynchronises the rest of the file - and
// the reader's own trailing-byte check means a writer that is off by
// four cannot produce a file that parses at all.
//
// ═══ WHAT IS WRITTEN, AND WHY EACH RECORD IS THERE ════════════════
//
//   NiNode              the root. Rule 34 wipes record 0's transform in
//                       the PARSER, so writing identity is not a
//                       simplification - it is the only thing that
//                       survives.
//   NiTriShape          NAMELESS, so bindPartsInto's MW-D6 arm binds it
//                       once for the part rather than once per side.
//   NiTriShapeData      the geometry.
//   NiMaterialProperty  white diffuse/ambient, no emission. The texture
//                       carries the colour; a tint here would be a
//                       second place to change it.
//   NiTexturingProperty base slot -> the source below.
//   NiSourceTexture     EXTERNAL, by name. `resolveMaterial` reads
//                       `src.external && src.fileName` and nothing else
//                       - an internal NiPixelData is parsed and dropped
//                       - so an internal texture would need the
//                       material resolver changed, which is a
//                       divergence from the reference for one asset.
//                       The name is resolved wherever the lane resolves
//                       texture names; that is the loader's problem and
//                       not this file's.
//   NiStencilProperty   drawMode 3 (Both). Rule 65's only two-sided
//                       value, and the honest answer to a mesh with 65
//                       single-shared edges: Morrowind's own artists
//                       reach for exactly this record when a shell has
//                       an open side, and the alternative - inventing
//                       geometry to close somebody else's model - is
//                       worse than drawing what they made.
//
// ═══ V GOES DOWN ══════════════════════════════════════════════════
//
// FBX puts v = 0 at the BOTTOM of the image; a NIF's uv set and a DDS's
// rows both run downward from the top. So the write is `1 - v` unless
// `--keep-v` says the mesh already holds it that way. Get this wrong
// and the model is textured upside down - which looks like a painting
// mistake and is not one.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { isMain } from './lib/isMain.mjs';

import { meshToNif } from '../src/formats/morrowind/mwNifWrite.js';
export * from '../src/formats/morrowind/mwNifWrite.js';

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d = null) =>
    args
      .find((a) => a.startsWith(`--${k}=`))
      ?.split('=')
      .slice(1)
      .join('=') ?? d;
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) {
    console.error('usage: node tools/nifWrite.mjs <mesh.json> <out.nif> [--texture=NAME.dds] [--node=NAME] [--keep-v]');
    process.exit(2);
  }
  const mesh = JSON.parse(readFileSync(files[0], 'utf8'));
  const bytes = meshToNif(mesh, { texture: opt('texture'), node: opt('node'), keepV: args.includes('--keep-v') });
  mkdirSync(dirname(files[1]), { recursive: true });
  writeFileSync(files[1], bytes);
  console.log(`${files[0]} -> ${files[1]}  ${bytes.length} bytes`);
  console.log(
    `  ${mesh.positions.length / 3} vertices, ${mesh.indices.length / 3} triangles, texture ${opt('texture') ?? '(none)'}`,
  );
}
