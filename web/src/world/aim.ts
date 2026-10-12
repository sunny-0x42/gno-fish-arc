export type AimRead = {
  targetId: string | null;
  targetName: string;
  targetHp: number;
  targetHpMax: number;
  targetPool: number;
  damage: number;
  cooldownMs: number;
  legal: boolean;
  sx: number;
  sz: number;
};

const idle: AimRead = {
  targetId: null,
  targetName: "",
  targetHp: 0,
  targetHpMax: 0,
  targetPool: 0,
  damage: 0,
  cooldownMs: 0,
  legal: false,
  sx: 0,
  sz: 0,
};

let current: AimRead = idle;
const listeners = new Set<(aim: AimRead) => void>();

export function readAim(): AimRead {
  return current;
}

export function publishAim(next: AimRead): void {
  if (
    next.targetId === current.targetId &&
    next.legal === current.legal &&
    next.damage === current.damage &&
    next.targetHp === current.targetHp &&
    next.targetHpMax === current.targetHpMax &&
    next.targetPool === current.targetPool &&
    next.sx === current.sx &&
    next.sz === current.sz &&
    Math.abs(next.cooldownMs - current.cooldownMs) < 80
  ) {
    return;
  }
  current = next;
  for (const listener of listeners) listener(current);
}

export function subscribeAim(listener: (aim: AimRead) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
