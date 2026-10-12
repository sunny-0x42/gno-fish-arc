import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  MOUSE_DEFAULT,
  MOUSE_MAX,
  MOUSE_MIN,
  TURN_DEFAULT,
  TURN_MAX,
  TURN_MIN,
  loadSteer,
  resetSteer,
  writeSteer,
} from "./steerRates";

/** Top-bar mouse and turn rates. The values stay in this browser. */
export function SteerSettings({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const [mouse, setMouse] = useState(MOUSE_DEFAULT);
  const [turn, setTurn] = useState(TURN_DEFAULT);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const found = document.querySelector(".app");
    setHost(found instanceof HTMLElement ? found : null);
    const loaded = loadSteer();
    setMouse(loaded.mouse);
    setTurn(loaded.turn);
  }, []);

  const apply = (next: { mouse?: number; turn?: number }) => {
    const saved = writeSteer(next);
    setMouse(saved.mouse);
    setTurn(saved.turn);
  };

  const sheet = open ? (
    <aside id="steering-settings" className="card steer" role="dialog" aria-label="Steering settings" tabIndex={-1} data-gameplay-blocking="true">
      <p className="kicker">Settings</p>
      <p>Turn follows W A S D. Saved in this browser.</p>
      <p>Higher is faster.</p>
      <label>
        <span className="steer-line">
          <span>Mouse</span>
          <b>{mouse.toFixed(1)}</b>
        </span>
        <input
          type="range"
          min={MOUSE_MIN}
          max={MOUSE_MAX}
          step={0.1}
          value={mouse}
          aria-label="Mouse speed"
          onChange={(event) => apply({ mouse: Number(event.target.value) })}
        />
      </label>
      <label>
        <span className="steer-line">
          <span>Turn</span>
          <b>{turn.toFixed(1)}</b>
        </span>
        <input
          type="range"
          min={TURN_MIN}
          max={TURN_MAX}
          step={0.1}
          value={turn}
          aria-label="Turn speed"
          onChange={(event) => apply({ turn: Number(event.target.value) })}
        />
      </label>
      <div className="row">
        <button
          type="button"
          onClick={() => {
            const saved = resetSteer();
            setMouse(saved.mouse);
            setTurn(saved.turn);
          }}
        >
          Reset
        </button>
        <button type="button" onClick={onClose}>Close</button>
      </div>
    </aside>
  ) : null;

  return (
    <>
      <button type="button" className={open ? "on" : ""} aria-label="Steering settings" aria-expanded={open} aria-controls="steering-settings" onClick={onToggle}>
        <span className="settings-label">Settings</span>
        <span className="settings-short">Set</span>
      </button>
      {host && sheet ? createPortal(sheet, host) : null}
    </>
  );
}
