// PROVING-GROUND (bible/05-Combat/Proving-Ground.md): THE FIXED CLOCK, laid into the page before any of the game's own
// code (Playwright's addInitScript). While the game loads the clock is the wall's (fetches, decodes and the build queue
// run as they would); `__pg.freeze()` stops it, and from then on time moves only by `__pg.step(n)` - each step advances
// performance.now (and Date.now with it) by exactly 1/60 s and runs the frame callbacks the game asked for, so a run is
// the same run frame for frame on any machine and in a background tab. `__pg.release()` hands time back to the wall.
(() => {
  if (window.__pg) return;
  // NO POINTER LOCK: on Windows a lock is the system's ClipCursor - even from the ground's hidden browser it took the
  // owner's own mouse away (2026-10-29). The ground turns the camera through the game's hooks, never the mouse.
  Element.prototype.requestPointerLock = function () { return Promise.resolve(); };
  try { Object.defineProperty(Document.prototype, 'pointerLockElement', { get: () => null, configurable: true }); } catch { /* the page's own */ }
  const realNow = performance.now.bind(performance);
  const realDate = Date.now.bind(Date);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCancel = window.cancelAnimationFrame.bind(window);
  let manual = false, offset = 0, vnow = 0, queue = [], nextId = 1e9;
  const dateBase = realDate() - realNow();
  const now = () => (manual ? vnow : realNow() + offset);
  performance.now = now;
  Date.now = () => Math.round(dateBase + now());
  window.requestAnimationFrame = (cb) => {
    if (!manual) return realRaf(cb);
    const id = nextId++;
    queue.push([id, cb]);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (id >= 1e9) queue = queue.filter(([i]) => i !== id);
    else realCancel(id);
  };
  let frames = 0, lastMs = 0;
  window.__pg = {
    manual: () => manual,
    now,
    frames: () => frames,
    lastMs: () => lastMs,
    /** Stop the wall clock: frames from here on are the script's. A callback the wall's frame loop already holds runs on
     *  the next real frame and asks again - into the queue. */
    freeze() { if (manual) return; vnow = now(); manual = true; },
    /** `n` frames of `dt` milliseconds each: the clock advanced, then every callback asked for so far run with it. */
    step(n = 1, dt = 1000 / 60) {
      for (let i = 0; i < n; i++) {
        vnow += dt;
        const q = queue; queue = [];
        const t0 = realNow();
        for (const [, cb] of q) { try { cb(vnow); } catch (e) { console.error('[proving-ground] frame', e); } }
        lastMs = realNow() - t0;   // the frame's own cost on the wall clock: what a player's frame would spend
        frames++;
      }
      return frames;
    },
    release() {
      if (!manual) return;
      offset = vnow - realNow(); manual = false;
      const q = queue; queue = [];
      for (const [, cb] of q) realRaf(cb);
    },
  };
})();
