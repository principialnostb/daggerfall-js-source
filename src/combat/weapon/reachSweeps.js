// A replacement rig may arrive between slices. Its predecessor must stop
// posing, and only a still-current result may update the visible weapon.
export function createReachSweeps() {
  const status = { reachSweeps: 0, obsoleteSweepsStopped: 0 };
  function schedule(res, currentBuild, currentHeld) {
    if (!res?.ok || typeof res.sweepLater !== 'function') return;
    const piecesAt = res.arm.pieces;
    const current = () => currentBuild() === res && res.arm.pieces === piecesAt;
    status.reachSweeps++;
    res.sweepLater(() => {
      if (current()) return true;
      status.obsoleteSweepsStopped++;
      return false;
    }).then(r => {
      if (r == null || !current()) return;
      const held = currentHeld();
      if (held && held.built === res) held.reach0 = r;
      else res.reach = r;
    }, () => { /* keep the idle reach */ }).finally(() => { status.reachSweeps--; });
  }
  return { schedule, status };
}
