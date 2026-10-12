import { useEffect, useRef, useState } from "react";
import type { SeaKill } from "../chain/seaRoom";
import { countryFromCode } from "../sim/country";
import { formatFish, formatGnot } from "../sim/format";
import type { FishNft, LogLine } from "../sim/game";
import { boardRows, fightCreditLines, fightLedger, killNotice, type KillNotice as KillNoticeCopy, seaPools } from "./board";
import { SeasonBoard } from "./SeasonBoard";
import { SailorName } from "./sailorName";
import type { ShoalSnap } from "./useShoal";

/** HP for the fish in front of the mouth, or the last bitten fish while the lock holds. */
export function TargetHp({ fish, damage, held, label, country }: { fish: FishNft | null; damage: number; held: boolean; label?: string; country?: string }) {
  if (!fish || fish.hpMax <= 0) return null;
  const ratio = Math.max(0, Math.min(1, fish.hp / fish.hpMax));
  const low = ratio <= 0.3;
  const title = label?.trim() || fish.name;
  return (
    <div className={`target-hp r-${fish.rarity}${low ? " low" : ""}${held ? " held" : ""}`} aria-label={`${title} HP`}>
      <span className="target-hp-name">
        <b>{country ? <SailorName username={title} country={country} /> : title}</b>
        <span>{fish.hp} / {fish.hpMax}</span>
      </span>
      <span className="target-hp-track" role="meter" aria-valuemin={0} aria-valuemax={fish.hpMax} aria-valuenow={fish.hp}>
        <i style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
      </span>
      {fish.mustHeal ? <span className="target-hp-hit">Down</span> : damage > 0 ? <span className="target-hp-hit">Bite {damage}</span> : held ? <span className="target-hp-hit">Locked</span> : null}
    </div>
  );
}

export type Loot = {
  id: string;
  kind: "kill" | "loss" | "watch" | "cheer";
  amount: string;
};

export function LootPop({ loot }: { loot: Loot | null }) {
  if (!loot) return null;
  const title = loot.kind === "kill" ? "Kill reward" : loot.kind === "loss" ? "Stake lost" : loot.kind === "watch" ? "Watch shard" : "Cheer share";
  const signed = loot.amount.startsWith("+") || loot.amount.startsWith("-");
  return (
    <div className={`loot-pop ${loot.kind}`} role="status" key={loot.id}>
      <span>{title}</span>
      <b>{signed ? loot.amount : `+${loot.amount}`}</b>
      {loot.kind === "kill" || loot.kind === "loss" ? null : <small>USDC</small>}
    </div>
  );
}

/** Newest kill reward or stake loss for this fish. A later strike does not hide it. */
export function useKillerLoot(log: LogLine[], fishId: string, since: number): Loot | null {
  const [loot, setLoot] = useState<Loot | null>(null);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!fishId) return;
    for (const item of log) {
      if (item.at < since) continue;
      const notice = killNotice(item.text);
      if (!notice) continue;
      if (item.attackerId !== fishId && item.victimId !== fishId) continue;
      if (item.id === seen.current) return;
      seen.current = item.id;
      if (item.attackerId === fishId) {
        setLoot({
          id: item.id,
          kind: "kill",
          amount: notice.fish && notice.fish !== "0"
            ? `+${notice.amount} USDC · +${notice.fish} FISH`
            : `+${notice.amount} USDC`,
        });
      } else if (notice.lost) {
        setLoot({ id: item.id, kind: "loss", amount: `-${notice.lost} USDC · 0 FISH` });
      }
      return;
    }
  }, [log, fishId, since]);
  useEffect(() => {
    if (!loot) return;
    const id = loot.id;
    const timer = window.setTimeout(() => {
      setLoot((current) => (current?.id === id ? null : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [loot]);
  return loot;
}

/** Newest payKill sentence, one line at a time. Later notes do not dismiss it early. */
export function useKillNotice(log: LogLine[]): (KillNoticeCopy & { id: string }) | null {
  const [notice, setNotice] = useState<(KillNoticeCopy & { id: string }) | null>(null);
  const seen = useRef<string | null>(null);
  const opened = useRef(Date.now());
  useEffect(() => {
    let next: (KillNoticeCopy & { id: string }) | null = null;
    for (const item of log) {
      if (item.at < opened.current) continue;
      const parsed = killNotice(item.text);
      if (!parsed) continue;
      next = { id: item.id, ...parsed };
      break;
    }
    if (!next || next.id === seen.current) return;
    seen.current = next.id;
    setNotice(next);
  }, [log]);
  useEffect(() => {
    if (!notice) return;
    const id = notice.id;
    const timer = window.setTimeout(() => {
      setNotice((current) => (current?.id === id ? null : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return notice;
}

/** Kill rewards and the stake lost since this card opened. The lines stay after the pop fades. */
export function FightCredit({ log, fishId, since }: { log: LogLine[]; fishId: string; since: number }) {
  const lines = fightCreditLines(fightLedger(log, fishId, since));
  if (!lines.won && !lines.lost) return null;
  return (
    <>
      {lines.won ? <p className="kill-credit">{lines.won}</p> : null}
      {lines.lost ? <p className="kill-credit loss">{lines.lost}</p> : null}
    </>
  );
}

/** Local lines win on a shared id. Newest sits at the left so it is on screen at once. */
export function mergeKillFeed(local: SeaKill[], room: SeaKill[]): SeaKill[] {
  const byId = new Map<string, SeaKill>();
  for (const kill of local) byId.set(kill.id, kill);
  for (const kill of room) {
    if (!byId.has(kill.id)) byId.set(kill.id, kill);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, 12);
}

/** Kill lines scrolling across the top. Amounts are what the killer's browser credited. */
export function SeaTicker({ kills }: { kills: SeaKill[] }) {
  if (kills.length === 0) return null;
  const latest = kills.reduce((best, kill) => (kill.at >= best.at ? kill : best), kills[0]);
  const spokenFish = latest.fish > 0 ? ` and ${formatFish(latest.fish)} FISH` : "";
  const spoken = `${latest.attacker} downed ${latest.victim}. ${formatGnot(latest.gnot)} USDC${spokenFish}.`;
  return (
    <div className="sea-ticker">
      <p className="sr-only" role="status">{spoken}</p>
      <div className="sea-ticker-track" aria-hidden="true">
        {[0, 1].map((copy) => (
          <span className="sea-ticker-copy" key={copy}>
            {kills.map((kill) => (
              <span className="sea-ticker-item" key={`${kill.id}-${copy}`}>
                <SailorName username={kill.attacker} country={countryFromCode(kill.attackerCountry)?.name ?? ""} />
                {" downed "}
                <SailorName username={kill.victim} country={countryFromCode(kill.victimCountry)?.name ?? ""} />
                <b>{` · ${formatGnot(kill.gnot)} USDC${kill.fish > 0 ? ` · ${formatFish(kill.fish)} FISH` : ""}`}</b>
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

export function KillNotice({ log }: { log: LogLine[] }) {
  const notice = useKillNotice(log);
  if (!notice) return null;
  return (
    <p className="kill-notice" role="status">
      {notice.attacker} downed {notice.victim}
      <b> · {notice.amount} USDC{notice.fish ? ` · ${notice.fish} FISH` : ""}</b>
    </p>
  );
}

export function PoolBar({ snap, youId }: { snap: ShoalSnap; youId: string | null }) {
  const pools = seaPools(snap.fish, youId);
  return (
    <div className="poolbar" aria-label="Pools">
      <div className="pool-total">
        <span>Pools</span>
        <b>{formatGnot(pools.total)}</b>
        <small>USDC</small>
      </div>
      <div className="pool-strip">
        {pools.chips.length === 0 ? <span className="empty">No stake in the sea.</span> : null}
        {pools.chips.map((chip) => (
          <span key={chip.id} className={chip.yours ? "you" : ""}>
            <b>{chip.name}</b>
            {formatGnot(chip.poolUgnot)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PracticeBoard({ snap, youId }: { snap: ShoalSnap; youId: string | null }) {
  const rows = boardRows(snap.fish, snap.scores, youId);
  return (
    <div className="boardline" aria-label="Practice board">
      <span className="eyebrow">Practice board</span>
      {rows.length === 0 ? <p>No fish on the board.</p> : null}
      <ol>
        {rows.map((row, index) => (
          <li key={row.id} className={row.yours ? "you" : ""}>
            <span>{index + 1}</span>
            <b>{row.name}</b>
            <span className="kda-mini">{row.kills}/{row.downs}/{row.assists}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function KdaLine({ snap, fishId }: { snap: ShoalSnap; fishId: string }) {
  const score = snap.scores[fishId] ?? { kills: 0, downs: 0 };
  return (
    <p className="kda kda-chip" aria-label="Kills, downs, assists" title="Assists stay 0. Practice credits the fish that landed the bite.">
      <span>KDA</span>
      <b>{score.kills}</b>
      <i>/</i>
      <b>{score.downs}</b>
      <i>/</i>
      <b>0</b>
    </p>
  );
}

/** Pools and the practice board stay closed until a tab is pressed. */
export function SeaBook({ snap, fishId }: { snap: ShoalSnap; fishId: string | null }) {
  const [tab, setTab] = useState<"pools" | "board" | "season" | null>(null);
  const pick = (next: "pools" | "board" | "season") => {
    setTab((current) => (current === next ? null : next));
  };
  return (
    <aside className="radar-side" aria-label="Sea book">
      <div className="radar-side-row">
        {fishId ? <KdaLine snap={snap} fishId={fishId} /> : null}
        <div className="sheet-tabs" role="tablist" aria-label="Pools, board, and season">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pools"}
            aria-controls="sea-pools"
            className={tab === "pools" ? "on" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick("pools")}
          >
            Pools
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "board"}
            aria-controls="sea-board"
            className={tab === "board" ? "on" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick("board")}
          >
            Board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "season"}
            aria-controls="sea-season"
            className={tab === "season" ? "on" : ""}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => pick("season")}
          >
            Season
          </button>
        </div>
      </div>
      {tab === "pools" ? (
        <div id="sea-pools" className="sea-sheet" role="tabpanel">
          <PoolBar snap={snap} youId={snap.activeFishId} />
        </div>
      ) : null}
      {tab === "board" ? (
        <div id="sea-board" className="sea-sheet" role="tabpanel">
          <PracticeBoard snap={snap} youId={snap.activeFishId} />
        </div>
      ) : null}
      {tab === "season" ? (
        <div id="sea-season" className="sea-sheet" role="tabpanel">
          <SeasonBoard snap={snap} />
        </div>
      ) : null}
    </aside>
  );
}
