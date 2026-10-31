// @ts-check
// DIRECTION-WALK-SMOOTH: round the armed back/side steps on their own loop clock, before lower-body blending.
export const DIRECTION_WALK_SMOOTH = Object.freeze({ armed: 0.12, back: 0.045, share: 0.16 });
const WEIGHTS = Object.freeze([1, 6, 15, 20, 15, 6, 1]);

export function createDirectionalWalkSampler({ loopWindow }) {
  let memo = null;
  return {
    sampler(under, state, source) {
      const group = String(state?.group ?? '').toLowerCase();
      const h = /^walk(?:back|left|right)2c$/.test(group) ? DIRECTION_WALK_SMOOTH.armed :
        group === 'walkback' ? DIRECTION_WALK_SMOOTH.back : 0;
      if (!h || !source?.keys) return under;
      const win = loopWindow(state, source.keys), span = win.stop - win.start;
      if (!(span > 0)) return under;
      if (memo && memo.under === under && memo.group === group && memo.start === win.start && memo.stop === win.stop) return memo.fn;
      const width = Math.min(h, span * DIRECTION_WALK_SMOOTH.share), cache = new WeakMap();
      const fn = (track, time) => {
        if (!track || track.__overlay || time < win.start || time > win.stop) return under(track, time);
        const hit = cache.get(track);
        if (hit?.time === time) return hit.value;
        const center = under(track, time);
        if (!center) return center;
        const rotation = center.rotation ? [0, 0, 0, 0] : null, translation = center.translation ? [0, 0, 0] : null;
        for (let i = 0; i < WEIGHTS.length; i++) {
          const t = win.start + ((time + (i - 3) * width / 3 - win.start) % span + span) % span;
          const sample = t === time ? center : under(track, t), w = WEIGHTS[i] / 64;
          if (rotation && sample?.rotation) {
            const a = sample.rotation, b = center.rotation, sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
            for (let j = 0; j < 4; j++) rotation[j] += sample.rotation[j] * w * sign;
          }
          if (translation && sample?.translation) for (let j = 0; j < 3; j++) translation[j] += sample.translation[j] * w;
        }
        const length = rotation ? Math.hypot(rotation[0], rotation[1], rotation[2], rotation[3]) || 1 : 1;
        const value = { ...center, rotation: rotation ? rotation.map((x) => x / length) : center.rotation,
          translation: translation ?? center.translation };
        cache.set(track, { time, value });
        return value;
      };
      memo = { under, group, start: win.start, stop: win.stop, fn };
      return fn;
    },
  };
}
