"""Pack the approved Blender GLB into synchronous DFO mesh and texture data."""
import argparse
import base64
import io
import json
import struct
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("glb", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
raw = args.glb.read_bytes()
length = struct.unpack_from("<I", raw, 12)[0]
document = json.loads(raw[20:20 + length])
binary = raw[28 + length:]

def view(index):
    entry = document["bufferViews"][index]
    start = entry.get("byteOffset", 0)
    return entry, binary[start:start + entry["byteLength"]]

def accessor(index):
    entry = document["accessors"][index]
    layout, data = view(entry["bufferView"])
    assert "byteStride" not in layout
    code = {5126: "f", 5123: "H", 5125: "I"}[entry["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[entry["type"]]
    return struct.unpack_from("<" + code * width * entry["count"], data, entry.get("byteOffset", 0))

def pack(code, values):
    return base64.b64encode(struct.pack("<" + code * len(values), *values)).decode()

positions, normals, uvs = [], [], []
groups = [[] for _ in range(6)]
for node in document["nodes"]:
    if node["name"] == "Suspension vertical shank":
        continue
    assert not any(key in node for key in ("translation", "scale", "rotation", "matrix"))
    for primitive in document["meshes"][node["mesh"]]["primitives"]:
        attrs = primitive["attributes"]
        offset = len(positions) // 3
        positions.extend(accessor(attrs["POSITION"]))
        normals.extend(accessor(attrs["NORMAL"]))
        uvs.extend(accessor(attrs["TEXCOORD_0"]))
        material = document["materials"][primitive["material"]]["name"]
        slot = 5 if node["name"] == "Ceiling socket" else int(material[:2]) - 1
        assert slot != 5 or material.startswith("01")
        groups[slot].extend(offset + i for i in accessor(primitive["indices"]))

low = min(positions[1::3])
high = max(positions[1::3])
height = high - low
positions = [(v - low if i % 3 == 1 else v) / height for i, v in enumerate(positions)]
textures = []
for material in sorted(document["materials"], key=lambda m: m["name"]):
    if material["name"].startswith("05"):
        slot = material["emissiveTexture"]
    else:
        slot = material["pbrMetallicRoughness"]["baseColorTexture"]
    image_index = document["textures"][slot["index"]]["source"]
    _, encoded = view(document["images"][image_index]["bufferView"])
    image = Image.open(io.BytesIO(encoded)).convert("RGBA")
    assert image.size == (128, 128)
    image.putalpha(255)
    textures.append(base64.b64encode(image.tobytes()).decode())

result = {
    "positions": pack("f", positions), "normals": pack("f", normals),
    "uvs": pack("f", uvs), "indices": pack("I", sum(groups, [])),
    "counts": [len(group) for group in groups], "textures": textures,
}
args.output.write_text(json.dumps(result, separators=(",", ":")) + "\n", encoding="utf-8")
