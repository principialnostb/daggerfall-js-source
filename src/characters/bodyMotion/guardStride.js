// @ts-check
// GUARD-CONTINUITY: keep the accepted shorter guard walk. Running uses the free-run base through guardLocomotion.js.

export const GUARD_STRIDE = Object.freeze({
  walk: Object.freeze({ maxRate: 1.7, maxStride: 1.35, calf: 0, toeMax: 22 }),
});
export const GUARD_WALK = /^walkforward2c$/i;

export function guardStrideShare(k) {
  if (!(k > 1)) return { rate: Math.max(0, k || 0), stride: 1 };
  const cfg = GUARD_STRIDE.walk;
  const stride = Math.min(cfg.maxStride, Math.max(1, k / cfg.maxRate));
  return { rate: k / stride, stride };
}
