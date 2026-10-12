import { UGNOT } from "./catalog";

export function formatGnot(ugnot: number): string {
  const sign = ugnot < 0 ? "-" : "";
  const v = Math.abs(Math.trunc(ugnot));
  const whole = Math.floor(v / UGNOT);
  const frac = Math.floor((v % UGNOT) / 10_000);
  return `${sign}${whole.toLocaleString("en-US")}.${String(frac).padStart(2, "0")}`;
}

export function formatFish(amount: number): string {
  return Math.trunc(amount).toLocaleString("en-US");
}

/** Whole FISH from a 6-decimal chain balance. Trailing zeros in the fraction are dropped. */
export function formatChainFish(raw: bigint): string {
  const neg = raw < 0n;
  const value = neg ? -raw : raw;
  const whole = value / 1_000_000n;
  const frac = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  const body = frac.length > 0 ? `${whole.toString()}.${frac}` : whole.toString();
  return neg ? `-${body}` : body;
}

export function formatLeft(ms: number): string {
  if (ms <= 0) return "ready";
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}
