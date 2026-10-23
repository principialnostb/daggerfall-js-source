Morrowind cloak pose capture and diagnostics
==============================================

Purpose
-------
Capture posed cloak/body geometry from the running game, then run two analyses.
The first reports proximity, AABB overlap, mesh-index problems, and frame-to-
frame vertex jumps. The second checks indexed triangle-surface intersections.
Neither analysis measures penetration depth or performs a volume-containment test.

IMPORTANT: use the downloaded mw-cloak-capture.json
--------------------------------------------------
The old capture.json was an empty placeholder (sampleCount=0, frames=[]). It
has been removed to avoid accidentally analyzing it. The real capture is
downloaded by the in-game diagnostic panel as mw-cloak-capture.json.

Requirements
------------
- Node.js version accepted by package.json (Node 20.19+ or 22.12+).
- Project dependencies installed with npm install.
- Python 3.10+ recommended, with numpy and scipy:
    python -m pip install numpy scipy

Capture procedure (Windows PowerShell)
--------------------------------------
1. Open a terminal at the repository root and install dependencies if needed:
       npm install
       python -m pip install numpy scipy

2. Start the game dev server:
       npm run dev

3. In a second terminal at the repository root, launch the probe:
       npm run mwcloakprobe
   If the game is served at a different URL, pass it explicitly, for example:
       npm run mwcloakprobe -- http://localhost:5247/play/

4. In the browser, load a save/game state where the character can move and
   equip the cloak being investigated. Equip the cloak before capturing.

5. Record a useful range of animation states, not just a static pose:
   - idle and idle transitions
   - walk and run, including starts/stops
   - turns and changes of direction
   - combat stance, attacks, recovery and transitions, if available
   - crouch/jump/other relevant states if supported
   Keep the cloak visible and let each state run for several seconds.

6. Click "Stop and download capture" in the in-game diagnostic panel. Save the
   downloaded file as:
       diagnostics/mw-cloak-probe/mw-cloak-capture.json
   Ensure the download completed. Do not analyze a zero-byte or empty capture.

Run the analysis
----------------
From the repository root:
    npm run mwcloak:analyze

Or select a different capture:
    npm run mwcloak:analyze -- path/to/mw-cloak-capture.json

The screening script writes:
- diagnostics/mw-cloak-probe/cloak-diagnostic-report.json
- diagnostics/mw-cloak-probe/cloak-diagnostic-report.html

Run both analyses sequentially with one command:
    npm run mwcloak:analyze:all

Or run only the triangle-surface intersection pass:
    npm run mwcloak:intersections

Or choose a capture explicitly:
    npm run mwcloak:intersections -- path/to/mw-cloak-capture.json

It writes cloak-triangle-intersections.json and .html beside the capture. The
pass uses a conservative spatial broad phase, triangle AABB filtering, and a
separating-axis test that also handles coplanar triangle overlap. It can take
longer than the screening pass on large captures. Meshes with missing/invalid
indices or non-finite coordinates are skipped and counted in the report.

Optional screening distance (captured coordinate units; not meters):
    python diagnostics/mw-cloak-probe/diagnose_cloak_capture.py diagnostics/mw-cloak-probe/mw-cloak-capture.json --near 0.25

Do not compare thresholds across captures until model scale is understood.
AABB overlap and nearest-vertex distance are screening signals only. The
triangle pass checks surface intersection, but not penetration depth or a mesh
fully contained inside another mesh.

How to read the report
----------------------
- aabb_overlapping_pairs: cloak/legs mesh pairs whose axis-aligned bounds overlap.
- near_distance_candidates: pairs whose nearest vertex distance is <= --near.
- invalid_skinned_mesh_index_sets: skinned meshes with empty/invalid triangle
  indices or non-finite positions.
- closest_pairs: candidates to inspect first; use frame and slot names to find
  the relevant moment in the captured session.
- largest_frame_to_frame_vertex_steps: possible abrupt pose/identity changes;
  large values can also occur at animation transitions and are not automatically
  bugs.

A low vertex distance does not guarantee surface penetration: vertices can be
near while triangles remain separate, and triangles can intersect even when no
vertices are especially close. Review the rendered pose at candidate frames
before changing collision or skinning code.

Before uploading diagnostics
----------------------------
Include:
- mw-cloak-capture.json (raw capture; potentially large)
- cloak-diagnostic-report.json
- cloak-diagnostic-report.html
- a short note describing cloak/equipment, save/state, actions performed, and
  whether visible clipping was reproduced
- screenshots or a short recording of the offending pose, if available

Avoid uploading unrelated save files, account data, or other personal data.

Known limitations
-----------------
- The probe captures runtime geometry; it does not force or enumerate every
  animation clip automatically.
- The capture does not yet guarantee source KF/clip labels for every frame.
- The first-pass analyzer uses AABB overlap and nearest-vertex distance. The
  separate triangle analyzer checks surface intersections but not penetration
  depth or inside/outside volume containment.
- Rigid meshes without indices cannot be checked for triangle surface crossing.
