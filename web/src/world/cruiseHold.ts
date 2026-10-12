/** Player cruise. SeaView and the dock read the same flag. */
export const cruiseHold = { halted: false };

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function toggleCruise(): boolean {
  cruiseHold.halted = !cruiseHold.halted;
  notify();
  return cruiseHold.halted;
}

export function setCruiseHalted(halted: boolean): void {
  if (cruiseHold.halted === halted) return;
  cruiseHold.halted = halted;
  notify();
}

export function subscribeCruise(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
