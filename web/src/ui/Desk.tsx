import { useEffect, useState } from "react";
import { loadWatch, WATCH_ADDRESS, watchAllowed, type WatchSnap } from "../chain/watchDesk";
import { clearSession, readSession, withChain } from "../chain/session";
import { formatGnot } from "../sim/format";
import { ensureOnyxSigner, shortAddress } from "./adena";
import { SailorName } from "./sailorName";
import { MoneyChart, RealmBoard, SupplyChart, systemMap } from "./flowSheet";

export type DeskView =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "denied"; address: string }
  | { kind: "error"; detail: string }
  | { kind: "open"; ugnot: number | null; snap: WatchSnap | null; reading: boolean };

function figure(value: number | null, suffix = ""): string {
  if (value === null) return "unread";
  return suffix ? `${value.toLocaleString("en-US")}${suffix}` : value.toLocaleString("en-US");
}

function WatchPanel({ view, onConnect, onRead }: { view: DeskView; onConnect: () => void; onRead: () => void }) {
  if (view.kind === "open") {
    const snap = view.snap;
    const swimming = snap ? snap.fish.filter((fish) => fish.inMatch === true).length : null;
    const party = !snap || snap.partyId === null
      ? "unread"
      : snap.partyId === 0
        ? "No crew"
        : snap.partyName || `Crew ${snap.partyId}`;
    const sailor = !snap ? "unread" : snap.username ? snap.username : "No sailor card";
    return (
      <section className="desk-watch" aria-label="Watch wallet">
        <header>
          <h2>This wallet</h2>
          <p>View only. {WATCH_ADDRESS}</p>
        </header>
        <ul className="desk-gauges">
          <li className="desk-gauge"><span>Wallet USDC</span><b>{view.ugnot === null ? "unread" : `${formatGnot(view.ugnot)} USDC`}</b></li>
          <li className="desk-gauge"><span>Fish held</span><b>{snap ? figure(snap.held) : "…"}</b></li>
          <li className="desk-gauge"><span>Fish minted</span><b>{snap ? figure(snap.minted) : "…"}</b></li>
          <li className="desk-gauge"><span>Mint price</span><b>{snap && snap.mintPriceUgnot !== null ? `${formatGnot(snap.mintPriceUgnot)} USDC` : snap ? "unread" : "…"}</b></li>
          <li className="desk-gauge"><span>NFT supply</span><b>{snap ? figure(snap.supply) : "…"}</b></li>
          <li className="desk-gauge"><span>Royalty</span><b>{snap && snap.royaltyBps !== null ? `${snap.royaltyBps / 100}%` : snap ? "unread" : "…"}</b></li>
          <li className="desk-gauge"><span>In a match</span><b>{swimming === null ? "…" : String(swimming)}</b></li>
          <li className="desk-gauge wide"><span>Party</span><b>{party}{snap && snap.members !== null ? ` · ${snap.members}` : ""}</b></li>
          <li className="desk-gauge wide"><span>Sailor card</span><b>{snap?.username ? <SailorName username={snap.username} country={snap.country} /> : sailor}</b></li>
        </ul>
        <p className="desk-quiet">These figures are Arc reads for this address. Practice purses stay on the sea page. This page sends no chain call.</p>
        {snap && snap.fish.length === 0 ? <p>This wallet holds no fish on FishDuel.</p> : null}
        {snap && snap.fish.length > 0 ? (
          <ul className="held-bubbles" aria-label="Fish held by this wallet">
            {snap.fish.map((fish) => (
              <li key={fish.id} className={fish.inMatch ? "is-sea" : fish.inMatch === false ? "is-dock" : "is-unread"}>
                <b>{fish.name || `Fish ${fish.id}`}</b>
                <span>{fish.rarity || "unread"}</span>
                <small>{fish.poolUgnot === null ? "unread" : `${formatGnot(fish.poolUgnot)} USDC`}</small>
                <small>{fish.inMatch === null ? "unread" : fish.inMatch ? "In a match" : "Docked"}</small>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" onClick={onRead} disabled={view.reading}>{view.reading ? "Reading Arc" : "Read again"}</button>
      </section>
    );
  }
  return (
    <section className="desk-watch" aria-label="Watch wallet">
      <h2>View one wallet</h2>
      <p>View only. Connect the wallet. This desk only views {WATCH_ADDRESS}.</p>
      <p>This page sends no chain call.</p>
      {view.kind === "denied" ? <p role="status">The wallet returned {view.address}. This desk does not open that account.</p> : null}
      {view.kind === "error" ? <p role="status">{view.detail}</p> : null}
      <button type="button" className="primary" onClick={onConnect} disabled={view.kind === "busy"}>
        {view.kind === "busy" ? "Connecting" : "Connect to view"}
      </button>
    </section>
  );
}

export function DeskBoard({ view, onConnect, onRead }: { view: DeskView; onConnect: () => void; onRead: () => void }) {
  const map = systemMap();
  const signed = view.kind === "open";
  const [lens, setLens] = useState<"client" | "packages" | "money" | "supply">("client");
  const lenses = [
    ["client", "Client", "Site calls"],
    ["packages", "Packages", "Contract calls"],
    ["money", "Money", "Where USDC moves"],
    ["supply", "Supply", "Practice FISH book"],
  ] as const;
  return (
    <main className="desk">
      <header className="desk-top">
        <div>
          <p className="desk-kicker">Arc testnet</p>
          <h1>Shoal desk</h1>
          <div className="desk-origin">
            <p>Shoal is one shared sea: big fish eat little fish.</p>
            <p>Stake USDC, swim with other wallets, and grow by what you catch.</p>
          </div>
        </div>
        <div className="desk-actions">
          <a className="desk-sea" href="/">Sea</a>
          {signed ? <span className="desk-who" title={WATCH_ADDRESS}>{shortAddress(WATCH_ADDRESS)} · view only</span> : null}
        </div>
      </header>

      <section className="desk-chain" aria-label="Plain rules">
        <p>This page shows how the contracts talk, and it reads one wallet from Arc testnet.</p>
        <ul>
          <li>The sea sends the 5 USDC mint to FishNFT. The 1 USDC stake still goes to FishDuel. The money map's labeled mint is {map.mintGnot} USDC.</li>
          <li>The sea opens only when 1 USDC is staked into the pool. There is no practice sea.</li>
          <li>A covered kill splits 80 / 10 / 3 / 3 / 4.</li>
          <li>Practice Common to Uncommon spends {map.upgrades[0].fee} FISH. That ladder stays in this browser. Higher tiers are not sent on chain.</li>
          <li>FISH is the ledger token, 6 decimals, 100,000,000 supply. FishEarn pays 1 FISH per 1 USDC of the smaller stake, once per open bout. A party bonus stays in this browser.</li>
          <li>FishNFT mint is 5 USDC. Two heads climb one tier, from Bubble to Astravex. The chain also flips the trait. The sea wears that compressed model. Live duel fish stay on FishDuel. This desk does not send that call.</li>
          <li>A covered kill on FishDuel checks three sealed samples and does not see the swim between them. This page does not send Settle.</li>
          <li>Profile and party move no USDC. Bites stay in this browser.</li>
          <li>There is no swim button into the sea. The sea opens only after the 1 USDC pool stake. This desk does not send that call.</li>
        </ul>
        <p className="desk-quiet" role="status">FishDuel, FishProfile, FishParty, FishNFT, FISH, and FishEarn run on Arc testnet. A kill of another seated fish asks the wallet to take FISH. This page does not send Settle. Bites stay in this browser.</p>
      </section>

      <WatchPanel view={view} onConnect={onConnect} onRead={onRead} />

      <div className="chart-tools" role="group" aria-label="Desk maps">
        {lenses.map(([id, title, hint]) => (
          <button key={id} type="button" aria-pressed={lens === id} onClick={() => setLens(id)}>
            <b>{title}</b>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      <div className="chart-lens" hidden={lens !== "client"}><RealmBoard lane="live" /></div>
      <div className="chart-lens" hidden={lens !== "packages"}><RealmBoard lane="source" /></div>
      <div className="chart-lens" hidden={lens !== "money"}><MoneyChart map={map} /></div>
      <div className="chart-lens" hidden={lens !== "supply"}><SupplyChart map={map} /></div>
    </main>
  );
}

export function Desk() {
  const [view, setView] = useState<DeskView>({ kind: "idle" });
  useEffect(() => {
    document.title = "Shoal desk";
  }, []);

  const pull = async (ugnot: number | null) => {
    setView({ kind: "open", ugnot, snap: null, reading: true });
    try {
      const snap = await loadWatch();
      setView({ kind: "open", ugnot, snap, reading: false });
    } catch {
      setView({ kind: "error", detail: "Arc unread. The diagram below stays on the spec." });
    }
  };

  const onConnect = () => {
    setView({ kind: "busy" });
    void (async () => {
      const ready = await withChain(async () => ensureOnyxSigner(typeof window === "undefined" ? undefined : window.adena));
      if (ready === "busy") {
        setView({ kind: "error", detail: "The wallet is already sending a call." });
        return;
      }
      if (!ready.ok) {
        setView({ kind: "error", detail: ready.detail });
        return;
      }
      if (!watchAllowed(ready.signer)) {
        clearSession();
        setView({ kind: "denied", address: ready.signer });
        return;
      }
      const ugnot = readSession().ugnot ?? null;
      await pull(ugnot);
    })();
  };

  const onRead = () => {
    if (view.kind !== "open" || view.reading) return;
    void pull(view.ugnot);
  };

  return <DeskBoard view={view} onConnect={onConnect} onRead={onRead} />;
}
