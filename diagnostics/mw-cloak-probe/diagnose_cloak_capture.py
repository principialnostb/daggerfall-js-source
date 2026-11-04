#!/usr/bin/env python3
"""Automated first-pass diagnostics for mw-cloak-capture.json.

Checks every captured frame, validates triangle indices, reports cloak/body
bounds overlap, nearest vertex distances, and frame-to-frame vertex jumps.
This is a screening tool: proximity/AABB overlap are not proof of collision.
Requires numpy and scipy (pip install numpy scipy).
"""
from __future__ import annotations
import argparse
import html
import json
import math
import os
import sys
from pathlib import Path

try:
    import numpy as np
    from scipy.spatial import cKDTree
except ImportError:
    print("Missing dependencies. Run: python -m pip install numpy scipy", file=sys.stderr)
    raise SystemExit(2)


def vec3(mesh):
    raw = mesh.get("positions", [])
    if not isinstance(raw, list) or len(raw) < 3 or len(raw) % 3:
        return np.empty((0, 3), dtype=float)
    arr = np.asarray(raw, dtype=float).reshape((-1, 3))
    # Preserve vertex/index correspondence; reject the mesh if coordinates are non-finite.
    if not np.isfinite(arr).all():
        return np.empty((0, 3), dtype=float)
    return arr


def bounds(points):
    if not len(points):
        return None
    return [[float(x) for x in points.min(axis=0)],
            [float(x) for x in points.max(axis=0)]]


def overlap(a, b):
    if a is None or b is None:
        return False
    return all(a[0][i] <= b[1][i] and b[0][i] <= a[1][i] for i in range(3))


def mesh_info(mesh, group, index, frame_index):
    points = vec3(mesh)
    raw_indices = mesh.get("indices", [])
    vertex_count = len(mesh.get("positions", [])) // 3
    indices_present = isinstance(raw_indices, list) and len(raw_indices) > 0
    valid = indices_present and len(raw_indices) % 3 == 0 and vertex_count > 0
    if valid:
        valid = all(isinstance(i, int) and not isinstance(i, bool) and 0 <= i < vertex_count
                    for i in raw_indices)
    indices = raw_indices if valid else []
    return {
        "frame": frame_index, "group": group, "mesh_index": index,
        "slot": mesh.get("slot", ""), "name": mesh.get("name", ""),
        "kind": mesh.get("kind", ""), "points": points,
        "vertex_count": vertex_count, "triangle_count": len(indices) // 3,
        "indices_present": bool(indices_present),
        "indices_valid": bool(valid), "positions_finite": len(points) == vertex_count,
        "bounds": bounds(points), "source": mesh,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", nargs="?", default="diagnostics/mw-cloak-probe/mw-cloak-capture.json")
    parser.add_argument("--out", default=None, help="JSON report path (default: next to capture)")
    parser.add_argument("--near", type=float, default=1.0, help="screening distance in captured coordinate units")
    args = parser.parse_args()
    source = Path(args.capture)
    if not source.is_file():
        parser.error(f"Capture not found: {source}")
    out = Path(args.out) if args.out else source.with_name("cloak-diagnostic-report.json")
    print(f"Loading {source} ({source.stat().st_size:,} bytes)...", file=sys.stderr)
    with source.open(encoding="utf-8") as f:
        data = json.load(f)
    frames = data.get("frames") if isinstance(data, dict) else None
    if not isinstance(frames, list):
        parser.error("Capture schema error: expected root.frames array")
    if not frames:
        parser.error("Capture contains zero frames. Run the browser probe and download mw-cloak-capture.json; the empty placeholder is not usable.")
    declared_count = data.get("sampleCount")
    if isinstance(declared_count, int) and declared_count > 0 and declared_count != len(frames):
        print(f"Warning: sampleCount={declared_count}, but frames has {len(frames)} entries.", file=sys.stderr)

    pair_rows = []
    frame_rows = []
    previous = {}
    temporal_rows = []
    mesh_count = 0
    invalid_meshes = []
    for fi, frame in enumerate(frames):
        groups = {}
        for group in ("cloak", "legs"):
            entries = frame.get(group, []) if isinstance(frame, dict) else []
            groups[group] = [mesh_info(m, group, mi, fi) for mi, m in enumerate(entries)
                             if isinstance(m, dict)]
        for group_meshes in groups.values():
            for m in group_meshes:
                mesh_count += 1
                if (not m["indices_valid"] or not m["positions_finite"]) and m["kind"] == "skinned":
                    invalid_meshes.append({"frame": fi, "group": m["group"], "slot": m["slot"],
                                           "indices_present": m["indices_present"],
                                           "indices_count": len(m["source"].get("indices", [])),
                                           "indices_valid": m["indices_valid"],
                                           "positions_finite": m["positions_finite"],
                                           "vertices": m["vertex_count"]})
                key = (m["group"], m["mesh_index"], m["slot"])
                if key in previous and len(previous[key]) == len(m["points"]) and len(m["points"]):
                    delta = np.linalg.norm(m["points"] - previous[key], axis=1)
                    worst = int(np.argmax(delta))
                    temporal_rows.append({"frame": fi, "group": m["group"], "slot": m["slot"],
                                          "max_vertex_step": float(delta[worst]),
                                          "p99_vertex_step": float(np.percentile(delta, 99)),
                                          "vertex_index": worst})
                previous[key] = m["points"].copy()

        frame_pair_count = 0
        for c in groups["cloak"]:
            if not len(c["points"]):
                continue
            for b in groups["legs"]:
                if not len(b["points"]):
                    continue
                bounds_overlap = overlap(c["bounds"], b["bounds"])
                # Exact nearest vertex distance; this is a screening metric only.
                dist, idx = cKDTree(b["points"]).query(c["points"], k=1, workers=-1)
                ci = int(np.argmin(dist))
                row = {
                    "frame": fi,
                    "time": frame.get("time") if isinstance(frame, dict) else None,
                    "cloak_slot": c["slot"], "legs_slot": b["slot"],
                    "cloak_mesh_index": c["mesh_index"], "legs_mesh_index": b["mesh_index"],
                    "cloak_vertices": len(c["points"]), "legs_vertices": len(b["points"]),
                    "min_vertex_distance": float(dist[ci]),
                    "p01_vertex_distance": float(np.percentile(dist, 1)),
                    "closest_cloak_vertex": c["points"][ci].tolist(),
                    "closest_legs_vertex": b["points"][int(idx[ci])].tolist(),
                    "aabb_overlap": bounds_overlap,
                    "cloak_triangles": c["triangle_count"], "legs_triangles": b["triangle_count"],
                    "cloak_indices_present": c["indices_present"],
                    "legs_indices_present": b["indices_present"],
                    "triangle_indices_valid": c["indices_valid"] and b["indices_valid"],
                    "cloak_positions_finite": c["positions_finite"],
                    "legs_positions_finite": b["positions_finite"],
                    "candidate_near": float(dist[ci]) <= args.near,
                }
                pair_rows.append(row)
                frame_pair_count += 1
        frame_rows.append({"frame": fi, "time": frame.get("time") if isinstance(frame, dict) else None,
                           "cloak_meshes": len(groups["cloak"]), "legs_meshes": len(groups["legs"]),
                           "comparisons": frame_pair_count})

    pair_rows.sort(key=lambda r: (not r["aabb_overlap"], r["min_vertex_distance"]))
    temporal_rows.sort(key=lambda r: r["max_vertex_step"], reverse=True)
    report = {
        "schema": "mw-cloak-diagnostic-report-v1",
        "capture": str(source), "capture_bytes": source.stat().st_size,
        "frame_count": len(frames), "mesh_instances": mesh_count,
        "settings": {"near_threshold": args.near},
        "summary": {
            "comparisons": len(pair_rows),
            "aabb_overlapping_pairs": sum(r["aabb_overlap"] for r in pair_rows),
            "near_distance_candidates": sum(r["candidate_near"] for r in pair_rows),
            "invalid_skinned_mesh_index_sets": len(invalid_meshes),
        },
        "invalid_meshes": invalid_meshes,
        "closest_pairs": pair_rows[:100],
        "largest_frame_to_frame_vertex_steps": temporal_rows[:100],
        "frames": frame_rows,
        "limitations": [
            "AABB overlap and nearest-vertex distance are screening signals, not proof of triangle intersection.",
            "Triangle indices are validated and triangle counts reported; exact triangle-triangle intersection is not computed by this first-pass analyzer.",
            "Empty/missing triangle indices are distinct from valid indices and prevent surface checks.",
            "Meshes with non-finite vertex coordinates are excluded from spatial queries.",
            "Rigid boot meshes without indices cannot be checked for surface intersections.",
            "Frame-to-frame vertex steps are only comparable when vertex counts and mesh identity remain stable.",
        ],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    html_path = out.with_suffix(".html")
    rows = []
    for r in pair_rows[:100]:
        rows.append("<tr>" + "".join("<td>" + html.escape(str(v)) + "</td>" for v in (
            r["frame"], r["time"], r["cloak_slot"], r["legs_slot"],
            f'{r["min_vertex_distance"]:.6g}', f'{r["p01_vertex_distance"]:.6g}',
            r["aabb_overlap"], r["candidate_near"], r["triangle_indices_valid"])) + "</tr>")
    html_doc = """<!doctype html><html lang="en"><meta charset="utf-8"><title>Cloak diagnostics</title>
<style>body{font:14px system-ui;margin:2rem}table{border-collapse:collapse;width:100%}th,td{padding:.45rem;border:1px solid #ccc;text-align:left}th{position:sticky;top:0;background:#eee}code{overflow-wrap:anywhere}</style>
<h1>Cloak/body diagnostic report</h1><p>Screening report, not a definitive collision verdict.</p>
<pre>""" + html.escape(json.dumps(report["summary"], indent=2)) + """</pre>
<h2>Closest 100 cloak/legs mesh pairs</h2><table><thead><tr><th>Frame</th><th>Time</th><th>Cloak slot</th><th>Legs slot</th><th>Min vertex distance</th><th>1st percentile</th><th>AABB overlap</th><th>Near candidate</th><th>Valid indices</th></tr></thead><tbody>""" + "".join(rows) + """</tbody></table>
<h2>Largest frame-to-frame vertex steps</h2><pre>""" + html.escape(json.dumps(temporal_rows[:50], ensure_ascii=False, indent=2)) + """</pre>
<h2>Limitations</h2><ul>""" + "".join("<li>"+html.escape(x)+"</li>" for x in report["limitations"]) + """</ul></html>"""
    html_path.write_text(html_doc, encoding="utf-8")
    print(json.dumps({
        "frames": len(frames), "mesh_instances": mesh_count,
        "comparisons": len(pair_rows),
        "aabb_overlapping_pairs": report["summary"]["aabb_overlapping_pairs"],
        "near_candidates": report["summary"]["near_distance_candidates"],
        "invalid_skinned_mesh_index_sets": len(invalid_meshes),
        "json_report": str(out), "html_report": str(html_path),
        "closest_pairs": [{"frame": r["frame"], "cloak": r["cloak_slot"],
                           "legs": r["legs_slot"], "min_distance": r["min_vertex_distance"],
                           "aabb_overlap": r["aabb_overlap"]} for r in pair_rows[:10]]
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
