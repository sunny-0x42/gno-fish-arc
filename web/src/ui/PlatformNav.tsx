export type PlatformMode = "play" | "watch" | "gate";

/** Wayfinding for Play and Watch. Not shown on the live play HUD. */
export function PlatformNav({
  mode,
  onPlay,
  onWatch,
  livePlay = false,
  busy = false,
  playNext = "",
  watchNext = "",
}: {
  mode: PlatformMode;
  onPlay: () => void;
  onWatch: () => void;
  livePlay?: boolean;
  busy?: boolean;
  playNext?: string;
  watchNext?: string;
}) {
  const play = mode === "play";
  const watch = mode === "watch";
  const locked = livePlay || busy;
  return (
    <div className="platform" role="group" aria-label="Choose a path">
      <button type="button" className={play ? "path on" : "path"} aria-pressed={play} disabled={locked} onClick={onPlay}>
        <span className="path-copy">
          <b>Play</b>
          {playNext ? <small>{playNext}</small> : null}
        </span>
      </button>
      <button type="button" className={watch ? "path on" : "path"} aria-pressed={watch} disabled={locked} onClick={onWatch}>
        <span className="path-copy">
          <b>Watch</b>
          {watchNext ? <small>{watchNext}</small> : null}
        </span>
      </button>
    </div>
  );
}
