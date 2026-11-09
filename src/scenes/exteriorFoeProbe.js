// LAB1: a weak development lookup; the game host remains the pool's owner.
let latest = null;

export function registerExteriorFoeProbe(pool, inside = false) {
  if (!inside) latest = new globalThis.WeakRef(pool);
  return pool;
}

export function latestExteriorFoes() {
  return latest?.deref() ?? null;
}
