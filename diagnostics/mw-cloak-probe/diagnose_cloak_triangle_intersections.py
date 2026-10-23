#!/usr/bin/env python3
"""Check cloak/body triangle-surface intersections in mw-cloak-capture.json.

Uses a conservative centroid/radius broad phase, triangle AABB filtering, then
the separating-axis test (including coplanar in-plane axes). Results are
geometric surface intersections in captured coordinates, not an inside/outside
volume test. Requires numpy and scipy.
"""
from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path

try:
    import numpy as np
    from scipy.spatial import cKDTree
except ImportError:
    print("Missing dependencies. Run: python -m pip install numpy scipy", file=sys.stderr)
    raise SystemExit(2)


def mesh_geometry(mesh):
    positions = mesh.get("positions", [])
    indices = mesh.get("indices", [])
    if not isinstance(positions, list) or len(positions) < 9 or len(positions) % 3:
        return None, "invalid_positions"
    points = np.asarray(positions, dtype=np.float64).reshape((-1, 3))
    if not np.isfinite(points).all():
        return None, "non_finite_positions"
    if not isinstance(indices, list) or not indices or len(indices) % 3:
        return None, "missing_or_empty_indices"
    if any(not isinstance(i, int) or isinstance(i, bool) or i < 0 or i >= len(points)
           for i in indices):
        return None, "invalid_triangle_indices"
    triangles = points[np.asarray(indices, dtype=np.int64).reshape((-1, 3))]
    return triangles, None


def aabb_overlap(a, b, eps):
    return bool(np.all(a[0] <= b[1] + eps) and np.all(b[0] <= a[1] + eps))


def triangle_intersects(a, b, eps):
    """Triangle SAT, including in-plane axes so coplanar overlap is detected."""
    ea = (a[1] - a[0], a[2] - a[1], a[0] - a[2])
    eb = (b[1] - b[0], b[2] - b[1], b[0] - b[2])
    na = np.cross(ea[0], ea[1])
    nb = np.cross(eb[0], eb[1])
    axes = [na, nb]
    axes.extend(np.cross(x, y) for x in ea for y in eb)
    # Required for coplanar triangles: in-plane normals to each edge.
    axes.extend(np.cross(na, x) for x in ea)
    axes.extend(np.cross(nb, y) for y in eb)
    for axis in axes:
        length = np.linalg.norm(axis)
        if length <= eps:
            continue
        pa = a @ axis
        pb = b @ axis
        if float(pa.max()) < float(pb.min()) - eps or float(pb.max()) < float(pa.min()) - eps:
            return False
    return True


def intersect_meshes(a, b, eps):
    """Return exact triangle hit count and a bounded list of triangle-index pairs."""
    if not len(a) or not len(b):
        return 0, [], 0
    amin, amax = a.min(axis=1), a.max(axis=1)
    bmin, bmax = b.min(axis=1), b.max(axis=1)
    ac = a.mean(axis=1)
    bc = b.mean(axis=1)
    ar = np.linalg.norm(a - ac[:, None, :], axis=2).max(axis=1)
    br = np.linalg.norm(b - bc[:, None, :], axis=2).max(axis=1)
    tree = cKDTree(bc)
    # Radius is conservative: any intersecting triangles must have intersecting
    # bounding spheres, so the broad phase cannot discard a true hit.
    candidates = tree.query_ball_point(ac, r=ar + float(br.max()) + eps, workers=-1)
    hit_count = 0
    hit_pairs = []
    candidate_count = 0
    for i, js in enumerate(candidates):
        if not js:
            continue
        js = np.asarray(js, dtype=np.int64)
        mask = np.all(amax[i] >= bmin[js] - eps, axis=1) & np.all(bmax[js] >= amin[i] - eps, axis=1)
        for j in js[mask]:
            candidate_count += 1
            if triangle_intersects(a[i], b[int(j)], eps):
                hit_count += 1
                if len(hit_pairs) < 100:
                    hit_pairs.append([int(i), int(j)])
    return hit_count, hit_pairs, candidate_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", nargs="?", default="diagnostics/mw-cloak-probe/mw-cloak-capture.json")
    parser.add_argument("--out", default=None, help="JSON report path (default: next to capture)")
    parser.add_argument("--epsilon", type=float, default=1e-7,
                        help="intersection tolerance in captured coordinate units")
    parser.add_argument("--max-mesh-pairs", type=int, default=0,
                        help="optional cap for testing; 0 checks every eligible mesh pair")
    args = parser.parse_args()
    if args.epsilon < 0:
        parser.error("--epsilon must be non-negative")
    source = Path(args.capture)
    if not source.is_file():
        parser.error(f"Capture not found: {source}")
    out = Path(args.out) if args.out else source.with_name("cloak-triangle-intersections.json")
    print(f"Loading {source} ({source.stat().st_size:,} bytes)...", file=sys.stderr)
    with source.open(encoding="utf-8") as stream:
        data = json.load(stream)
    frames = data.get("frames") if isinstance(data, dict) else None
    if not isinstance(frames, list) or not frames:
        parser.error("Capture schema error: expected a non-empty root.frames array")

    rows = []
    skipped = {}
    total_mesh_pairs = 0
    total_triangle_candidates = 0
    total_intersections = 0
    for fi, frame in enumerate(frames):
        if not isinstance(frame, dict):
            continue
        cloaks = frame.get("cloak", [])
        bodies = frame.get("legs", [])
        if not isinstance(cloaks, list) or not isinstance(bodies, list):
            continue
        for ci, cm in enumerate(cloaks):
            if not isinstance(cm, dict):
                continue
            ct, cerror = mesh_geometry(cm)
            if cerror:
                skipped[cerror] = skipped.get(cerror, 0) + len(bodies)
                continue
            for bi, bm in enumerate(bodies):
                if not isinstance(bm, dict):
                    continue
                bt, berror = mesh_geometry(bm)
                if berror:
                    skipped[berror] = skipped.get(berror, 0) + 1
                    continue
                cb = np.stack((ct.min(axis=(0, 1)), ct.max(axis=(0, 1))))
                bb = np.stack((bt.min(axis=(0, 1)), bt.max(axis=(0, 1))))
                if not aabb_overlap(cb, bb, args.epsilon):
                    continue
                total_mesh_pairs += 1
                if args.max_mesh_pairs and total_mesh_pairs > args.max_mesh_pairs:
                    break
                hits, examples, candidates = intersect_meshes(ct, bt, args.epsilon)
                total_triangle_candidates += candidates
                total_intersections += hits
                if hits:
                    rows.append({
                        "frame": fi,
                        "time": frame.get("time"),
                        "cloak_slot": cm.get("slot", ""),
                        "cloak_name": cm.get("name", ""),
                        "body_slot": bm.get("slot", ""),
                        "body_name": bm.get("name", ""),
                        "cloak_triangle_count": len(ct),
                        "body_triangle_count": len(bt),
                        "broad_phase_triangle_pairs": candidates,
                        "intersecting_triangle_pairs": hits,
                        "example_triangle_index_pairs_first_100": examples,
                    })
            if args.max_mesh_pairs and total_mesh_pairs > args.max_mesh_pairs:
                break
        if args.max_mesh_pairs and total_mesh_pairs > args.max_mesh_pairs:
            break

    rows.sort(key=lambda row: row["intersecting_triangle_pairs"], reverse=True)
    report = {
        "schema": "mw-cloak-triangle-intersections-v1",
        "capture": str(source),
        "capture_bytes": source.stat().st_size,
        "frame_count": len(frames),
        "settings": {"epsilon": args.epsilon, "max_mesh_pairs": args.max_mesh_pairs},
        "summary": {
            "mesh_pairs_checked": min(total_mesh_pairs, args.max_mesh_pairs) if args.max_mesh_pairs else total_mesh_pairs,
            "triangle_aabb_candidates": total_triangle_candidates,
            "intersecting_triangle_pairs": total_intersections,
            "mesh_pairs_with_intersections": len(rows),
            "skipped_mesh_entries_by_reason": skipped,
        },
        "intersections": rows,
        "limitations": [
            "Reports triangle surface intersections, not volume containment or penetration depth.",
            "Numerical tolerance and degenerate triangles can affect borderline cases.",
            "Meshes without valid triangle indices or finite coordinates are skipped and listed in summary.",
            "The first 100 intersecting triangle index pairs are retained per mesh pair; total hit counts are complete for checked pairs.",
            "If --max-mesh-pairs is nonzero, the run is intentionally partial and must not be treated as exhaustive.",
        ],
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    html_out = out.with_suffix(".html")
    trs = []
    for row in rows:
        trs.append("<tr>" + "".join("<td>" + html.escape(str(v)) + "</td>" for v in (
            row["frame"], row["time"], row["cloak_slot"], row["body_slot"],
            row["intersecting_triangle_pairs"], row["broad_phase_triangle_pairs"])) + "</tr>")
    html_doc = """<!doctype html><html lang="en"><meta charset="utf-8"><title>Cloak triangle intersection report</title>
<style>body{font:14px system-ui;margin:2rem}table{border-collapse:collapse;width:100%}th,td{padding:.45rem;border:1px solid #ccc;text-align:left}th{position:sticky;top:0;background:#eee}</style>
<h1>Cloak/body triangle intersection report</h1><p>Geometric surface intersection test; not a volume-penetration verdict.</p>
<pre>""" + html.escape(json.dumps(report["summary"], ensure_ascii=False, indent=2)) + """</pre>
<h2>Mesh pairs with triangle intersections</h2><table><thead><tr><th>Frame</th><th>Time</th><th>Cloak slot</th><th>Body slot</th><th>Intersecting triangle pairs</th><th>Broad-phase candidates</th></tr></thead><tbody>""" + "".join(trs) + """</tbody></table>
<h2>Limitations</h2><ul>""" + "".join("<li>" + html.escape(x) + "</li>" for x in report["limitations"]) + """</ul></html>"""
    html_out.write_text(html_doc, encoding="utf-8")
    print(json.dumps({"summary": report["summary"], "json_report": str(out),
                      "html_report": str(html_out), "top_intersections": rows[:10]},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
