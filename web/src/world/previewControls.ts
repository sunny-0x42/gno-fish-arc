export type PreviewView = "side" | "front" | "rear";
export type PreviewMotion = "idle" | "swim";
export type PreviewAim = { yaw: number; pitch: number };

export const PREVIEW_BITE_MS = 240;
export const PREVIEW_PITCH_LIMIT = 0.85;

/** The camera sits on -Z: yaw zero presents the fish's local -Z nose. */
export function previewView(view: PreviewView): PreviewAim {
  return { yaw: view === "side" ? Math.PI / 2 : view === "rear" ? Math.PI : 0, pitch: 0 };
}

/** Pointer deltas are CSS pixels, independent of device pixel ratio. */
export function dragPreview(aim: PreviewAim, dx: number, dy: number): PreviewAim {
  const turn = Math.PI * 2;
  const yaw = aim.yaw + (Number.isFinite(dx) ? dx * 0.008 : 0);
  return {
    yaw: ((yaw + Math.PI) % turn + turn) % turn - Math.PI,
    pitch: Math.max(-PREVIEW_PITCH_LIMIT, Math.min(PREVIEW_PITCH_LIMIT, aim.pitch + (Number.isFinite(dy) ? dy * 0.008 : 0))),
  };
}

/** One presentation pulse only; no combat state or recurring trigger. */
export function previewBite(nowMs: number, startedMs: number | null): number {
  if (startedMs === null || !Number.isFinite(nowMs) || !Number.isFinite(startedMs)) return 0;
  const elapsed = nowMs - startedMs;
  if (elapsed <= 0 || elapsed >= PREVIEW_BITE_MS) return 0;
  return Math.sin(Math.PI * elapsed / PREVIEW_BITE_MS);
}
