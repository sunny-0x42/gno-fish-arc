export type Blow = { id: string; text: string; at: number };

type BlowLine = {
  id: string;
  text: string;
  at: number;
  attackerId?: string;
  victimId?: string;
};

/** Newest bite on this fish. The attacker's own line never warns. Same wording with a new log id is a new blow. */
export function incomingBlow(log: BlowLine[], fishId: string, name: string): Blow | null {
  for (const line of log) {
    if (line.attackerId === fishId) continue;
    if (line.victimId && line.victimId !== fishId) continue;
    if (!line.victimId && (line.text.startsWith(`${name} struck `) || line.text.startsWith(`${name} downed `))) continue;
    const struck = ` struck ${name} for `;
    const at = line.text.indexOf(struck);
    if (at > 0) {
      const rest = /^(\d+)\.$/.exec(line.text.slice(at + struck.length));
      if (!rest) continue;
      return { id: line.id, at: line.at, text: `${line.text.slice(0, at)} hit you for ${rest[1]}.` };
    }
    const down = ` downed ${name}.`;
    const downAt = line.text.indexOf(down);
    if (downAt > 0) return { id: line.id, at: line.at, text: `${line.text.slice(0, downAt)} downed you.` };
  }
  return null;
}
