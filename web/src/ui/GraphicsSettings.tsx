import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GRAPHICS, loadQuality, readQuality, subscribeQuality, writeQuality, type GraphicsQuality } from "../world/quality";

export function GraphicsSettings({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const [quality, setQuality] = useState(readQuality);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const found = document.querySelector(".app");
    setHost(found instanceof HTMLElement ? found : null);
    setQuality(loadQuality());
    return subscribeQuality(() => setQuality(readQuality()));
  }, []);

  return (
    <>
      <button type="button" className={open ? "on" : ""} aria-expanded={open} aria-controls="graphics-settings" onClick={onToggle}>Graphics</button>
      {open && host && createPortal(
        <aside id="graphics-settings" className="card steer graphics-settings" role="dialog" aria-label="Graphics settings" tabIndex={-1} data-gameplay-blocking="true">
          <p className="kicker">Ocean detail</p>
          <h2>Graphics</h2>
          <p>Rendering only. Fish, stakes and combat rules stay the same.</p>
          <div className="quality-options" role="group" aria-label="Rendering quality">
            {(Object.keys(GRAPHICS) as GraphicsQuality[]).map((value) => (
              <button type="button" key={value} className={quality === value ? "on" : ""} aria-pressed={quality === value} onClick={() => writeQuality(value)}>
                <b>{GRAPHICS[value].label}</b>
                <small>{GRAPHICS[value].description}</small>
              </button>
            ))}
          </div>
          <p>Saved in this browser. System reduced motion is respected.</p>
          <button type="button" onClick={onClose}>Close</button>
        </aside>, host,
      )}
    </>
  );
}
