/** How long the last bitten fish stays marked. Practice UI only. */
export const TARGET_LOCK_MS = 4000;

export type TargetLock = {
  id: string | null;
  until: number;
  damage: number;
};

const idle: TargetLock = { id: null, until: 0, damage: 0 };
let current: TargetLock = idle;
const listeners = new Set<(lock: TargetLock) => void>();

export function readTargetLock(): TargetLock {
  return current;
}

export function lockTarget(id: string, until: number, damage: number): void {
  if (current.id === id && current.damage === damage && until <= current.until) return;
  current = { id, until, damage };
  for (const listener of listeners) listener(current);
}

export function clearTargetLock(): void {
  current = idle;
  for (const listener of listeners) listener(current);
}

export function subscribeTargetLock(listener: (lock: TargetLock) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
