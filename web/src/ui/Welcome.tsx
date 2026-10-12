import { useEffect, useState } from "react";
import { GRAPHICS, loadQuality, readQuality, subscribeQuality, writeQuality, type GraphicsQuality } from "../world/quality";
import { useOnyxFish } from "./ChainLine";
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
import { INTRO, PRACTICE_LINE, STORY } from "./welcomeIntro";

function PreGameSetup() {
  const [mouse, setMouse] = useState(MOUSE_DEFAULT);
  const [turn, setTurn] = useState(TURN_DEFAULT);
  const [quality, setQuality] = useState<GraphicsQuality>(readQuality);

  useEffect(() => {
    const loaded = loadSteer();
    setMouse(loaded.mouse);
    setTurn(loaded.turn);
    setQuality(loadQuality());
    return subscribeQuality(() => setQuality(readQuality()));
  }, []);

  const apply = (next: { mouse?: number; turn?: number }) => {
    const saved = writeSteer(next);
    setMouse(saved.mouse);
    setTurn(saved.turn);
  };

  return (
    <section className="welcome-setup" aria-label="Setup">
      <p className="kicker">Setup</p>
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
      <p>Turn follows W A S D. Higher is faster. Saved in this browser.</p>
      <div className="quality-options" role="group" aria-label="Graphics">
        {(Object.keys(GRAPHICS) as GraphicsQuality[]).map((value) => (
          <button
            type="button"
            key={value}
            className={quality === value ? "on" : ""}
            aria-pressed={quality === value}
            onClick={() => writeQuality(value)}
          >
            <b>{GRAPHICS[value].label}</b>
          </button>
        ))}
      </div>
      <p>{GRAPHICS[quality].description} Rendering only. Fish and combat stay the same.</p>
      <button
        type="button"
        onClick={() => {
          const saved = resetSteer();
          setMouse(saved.mouse);
          setTurn(saved.turn);
          writeQuality("balanced");
        }}
      >
        Reset
      </button>
    </section>
  );
}

/** First screen. Enter the sea asks Adena to connect, then opens the gate. */
export function Welcome({ onEnter, busy, note }: { onEnter: () => void; busy: boolean; note: string | null }) {
  const chain = useOnyxFish();
  const portrait = chain.kind === "live" ? chain.portrait : "";

  return (
    <section className="card welcome" aria-label="Welcome">
      <div className="welcome-copy">
        <p className="sign">Shoal</p>
        <h1>FISH</h1>
        <p className="lead">{INTRO[0].body}</p>
        <p className="welcome-pitch">One shared sea. Six species. Find your place in the food chain.</p>
        <button className="primary enter" type="button" onClick={onEnter} disabled={busy}>
          {busy ? "Connecting…" : "Enter the sea"} <span aria-hidden="true">↗</span>
        </button>
        <p className="welcome-practice">Connect a wallet on Arc testnet. Only those wallets swim and bite. There are no machine fish. A reload reads the fish from the Shoal collection again.</p>
        <p className="welcome-practice">{PRACTICE_LINE}</p>
        {note ? <p className="enter-note" role="status">{note}</p> : null}
      </div>
      <div className="stage">
        <div className="stage-heading"><p className="kicker">NFT</p></div>
        {portrait ? <img className="nft-portrait" src={portrait} alt="Shoal fish" /> : <p className="guide-note">No portrait is stored on chain yet. The sea shows the local fish model.</p>}
        <p className="guide-note">This image is the minted NFT.</p>
      </div>
      <div className="welcome-extras">
        <details className="welcome-disclosure">
          <summary>How to play <span aria-hidden="true">+</span></summary>
          <ul className="welcome-beats">
            {STORY.map((item) => (
              <li key={item.id}>
                <b>{item.title}</b> {item.body}
              </li>
            ))}
          </ul>
        </details>
        <details className="welcome-disclosure">
          <summary>Setup <span aria-hidden="true">+</span></summary>
          <PreGameSetup />
        </details>
      </div>
    </section>
  );
}
