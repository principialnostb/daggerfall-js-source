// The launcher's window size. The page is laid out for LAUNCHER_SIZE and holds together down to LAUNCHER_MIN, so the
// window takes its full size where the screen has room and shrinks to the screen's work area where it has not: a
// 1080p laptop at 150% has 1280x672 to give, and a 1366x768 one at 125% about 1093x576, and a window taller than that
// hid Play under the taskbar. FRAME is the title bar and borders the content size leaves out.
'use strict';

const LAUNCHER_SIZE = Object.freeze({ width: 1120, height: 680 });
const LAUNCHER_MIN = Object.freeze({ width: 900, height: 520 });
const FRAME = Object.freeze({ width: 16, height: 48 });

/** The content size for a display whose work area is `workArea` ({ width, height } in DIPs). */
function launcherSize(workArea) {
  const fit = (want, min, room) => (Number.isFinite(room) && room > 0 ? Math.max(min, Math.min(want, Math.floor(room))) : want);
  return {
    width: fit(LAUNCHER_SIZE.width, LAUNCHER_MIN.width, Number(workArea?.width) - FRAME.width),
    height: fit(LAUNCHER_SIZE.height, LAUNCHER_MIN.height, Number(workArea?.height) - FRAME.height),
  };
}

/** Where the window opens: sized for the display the player is looking at (the one under the pointer) and centred in
 *  that display's work area, since a window given no place opens on the primary display, whose room may differ. A
 *  screen that cannot answer (a compositor that keeps the pointer to itself) gets the full size wherever the platform
 *  puts it: no answer must ever stop the window from opening. `screen` is Electron's. */
function launcherBounds(screen) {
  try {
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const size = launcherSize(area);
    const x = Math.round(area.x + Math.max(0, (area.width - size.width - FRAME.width) / 2));
    const y = Math.round(area.y + Math.max(0, (area.height - size.height - FRAME.height) / 2));
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y, ...size } : size;
  } catch {
    return { ...LAUNCHER_SIZE };
  }
}

module.exports = { LAUNCHER_SIZE, LAUNCHER_MIN, FRAME, launcherSize, launcherBounds };
