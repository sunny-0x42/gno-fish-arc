export const INTERACTIVE_TARGET = 'button, input, textarea, select, summary, a[href], [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [role="textbox"]';

export function allowsGameplayKey(mode: string, active: boolean, interactive: boolean, overlay: boolean): boolean {
  return mode === "play" && active && !interactive && !overlay;
}

/** X stops even when a dock button has focus. Typing and an open overlay still block it. */
export function allowsStopKey(mode: string, active: boolean, typing: boolean, overlay: boolean): boolean {
  return mode === "play" && active && !typing && !overlay;
}
