export type GraphicsQuality = "low" | "balanced" | "high";

export const GRAPHICS = {
  low: { label: "Low", pixelRatio: 1, description: "Lighter ocean detail for quieter hardware." },
  balanced: { label: "Balanced", pixelRatio: 1.5, description: "Detailed fish and a balanced ocean." },
  high: { label: "High", pixelRatio: 2, description: "Sharper rendering and richer marine life." },
} as const;

let quality: GraphicsQuality = "balanced";
const listeners = new Set<() => void>();

export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === "low" || value === "balanced" || value === "high";
}

export function readQuality(): GraphicsQuality {
  return quality;
}

export function loadQuality(): GraphicsQuality {
  try {
    const saved = localStorage.getItem("shoal.graphics");
    if (isGraphicsQuality(saved)) quality = saved;
  } catch {
    // Storage is optional in private or embedded browsers.
  }
  return quality;
}

export function writeQuality(value: GraphicsQuality): void {
  if (!isGraphicsQuality(value)) return;
  quality = value;
  try {
    localStorage.setItem("shoal.graphics", value);
  } catch {
    // The current session can still change quality.
  }
  for (const listener of listeners) listener();
}

export function subscribeQuality(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
