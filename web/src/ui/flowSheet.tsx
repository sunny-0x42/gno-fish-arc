import { useState } from "react";
import { GENESIS_FISH, GENESIS_GNOT, PLAYER_START_GNOT, RARITIES, RIVAL_PLAN, SPECIES, UGNOT, VIEWER_START_FISH, VIEWER_START_GNOT } from "../sim/catalog";
import { formatFish, formatGnot } from "../sim/format";
import {
  BUY_TAX_BPS,
  CHAIN_FISH_ALLOCATION,
  CHAIN_FISH_DECIMALS,
  CHAIN_FISH_SUPPLY,
  LAY_FEE_UGNOT,
  MINT_FEE_UGNOT,
  MINT_GNOT,
  PARTY_FISH_BONUS_CAP_BPS,
  PARTY_FISH_BONUS_FULL,
  PRACTICE_TWAP_UGNOT_PER_FISH,
  PROTOCOL_BPS,
  ROYALTY_BPS,
  SELL_TAX_BPS,
  STAKE_MIN_GNOT,
  buybackAtTwap,
  splitFailFee,
  splitKill,
  splitMint,
  upgradeTo,
  winFishReward,
} from "../sim/tokenomics";

export type FlowSlice = {
  key: string;
  label: string;
  share: string;
  amount: string;
  bps: number;
};

type UpgradeStep = {
  from: string;
  to: string;
  fee: number;
  success: string;
};

const MINT_SHARES = [
  ["upgrade", "Upgrade treasury", "60%", 6_000],
  ["lp", "Liquidity", "20%", 2_000],
  ["team", "Team", "10%", 1_000],
  ["burn", "Burn", "10%", 1_000],
] as const;

const KILL_SHARES = [
  ["killer", "Killer purse", "80%", 8_000],
  ["lp", "Liquidity", "10%", 1_000],
  ["team", "Team", "3%", 300],
  ["buyback", "FISH buyback", "3%", 300],
  ["cheer", "Cheer", "4%", 400],
] as const;

function slices(parts: { upgradeTreasury: number; lp: number; burn: number; team: number }): FlowSlice[] {
  const amounts = {
    upgrade: parts.upgradeTreasury,
    lp: parts.lp,
    team: parts.team,
    burn: parts.burn,
  };
  return MINT_SHARES.map(([key, label, share, bps]) => ({
    key,
    label,
    share,
    amount: `${formatGnot(amounts[key])} USDC`,
    bps,
  }));
}

function killSlices(parts: ReturnType<typeof splitKill>): FlowSlice[] {
  return KILL_SHARES.map(([key, label, share, bps]) => ({
    key,
    label,
    share,
    amount: `${formatGnot(parts[key])} USDC`,
    bps,
  }));
}

export function systemMap() {
  const mint = splitMint(MINT_FEE_UGNOT);
  const lay = splitMint(LAY_FEE_UGNOT);
  const covered = STAKE_MIN_GNOT * UGNOT;
  const kill = splitKill(covered);
  const bought = buybackAtTwap(kill.buyback, GENESIS_FISH);
  const win = winFishReward(covered, GENESIS_FISH);
  const fail = splitFailFee(upgradeTo("uncommon")?.fee ?? 0);
  const upgrades: UpgradeStep[] = RARITIES.slice(1).map((rarity) => {
    const from = RARITIES[RARITIES.indexOf(rarity) - 1];
    const row = upgradeTo(rarity);
    return {
      from: SPECIES[from].species,
      to: SPECIES[rarity].species,
      fee: row?.fee ?? 0,
      success: `${Math.round((row?.successBps ?? 0) / 100)}%`,
    };
  });
  return {
    mintGnot: MINT_GNOT,
    stakeMinGnot: STAKE_MIN_GNOT,
    mint: slices(mint),
    lay: slices(lay),
    layGnot: formatGnot(LAY_FEE_UGNOT),
    kill: killSlices(kill),
    killExample: `${formatGnot(covered)} USDC`,
    buybackFish: formatFish(bought.fish),
    buybackSpent: `${formatGnot(bought.spentUgnot)} USDC`,
    winFish: formatFish(win),
    partyBonus: `${PARTY_FISH_BONUS_CAP_BPS / 100}%`,
    partyBonusFull: PARTY_FISH_BONUS_FULL,
    twap: `${formatGnot(PRACTICE_TWAP_UGNOT_PER_FISH)} USDC`,
    failBurn: formatFish(fail.burn),
    failRefund: formatFish(fail.refund),
    upgrades,
    allocation: CHAIN_FISH_ALLOCATION.map((row) => ({
      ...row,
      wholeLabel: formatFish(row.whole),
    })),
    chainSupply: formatFish(CHAIN_FISH_SUPPLY),
    chainDecimals: CHAIN_FISH_DECIMALS,
    practiceFish: formatFish(GENESIS_FISH),
    practiceGnot: `${formatGnot(GENESIS_GNOT)} USDC`,
    playerStart: `${formatGnot(PLAYER_START_GNOT)} USDC`,
    viewerStart: `${formatGnot(VIEWER_START_GNOT)} USDC · ${formatFish(VIEWER_START_FISH)} FISH`,
    buyTax: `${BUY_TAX_BPS / 100}%`,
    sellTax: `${SELL_TAX_BPS / 100}%`,
    protocol: `${PROTOCOL_BPS / 100}%`,
    royalty: `${ROYALTY_BPS / 100}%`,
    rivals: RIVAL_PLAN.map((row) => ({ name: row.name, stake: row.stakeGnot })),
  };
}

export type RealmWire = {
  lane: "live" | "source";
  kind: "call" | "read" | "stay" | "spec" | "none";
  from: string;
  to: string;
  call: string;
  coins: string;
};

/** Calls the client sends, and calls that stay in this browser. A none row is a real absence. */
export const realmWires: RealmWire[] = [
  { lane: "live", kind: "call", from: "Wallet", to: "FishDuel", call: "Mint, Lock, Leave", coins: "Mint and Lock each send 1 USDC to FishDuel on Arc testnet. Leave returns the stake. This page does not send Settle." },
  { lane: "live", kind: "call", from: "Wallet", to: "FishParty", call: "Create, Invite, Accept", coins: "These go to FishParty on Arc testnet. No USDC moves." },
  { lane: "live", kind: "call", from: "Wallet", to: "FishProfile", call: "SetProfile", coins: "This goes to FishProfile on Arc testnet. No USDC moves." },
  { lane: "live", kind: "read", from: "Practice sea", to: "FishDuel", call: "Minted, Owner, Name, In sea", coins: "Read only. The sea reads FishDuel." },
  { lane: "live", kind: "stay", from: "Practice sea", to: "Practice books", call: "Bite, Cheer, Upgrade, Lay", coins: "Stays in this tab. The sea opens when 1 USDC is staked into the pool." },
  { lane: "live", kind: "call", from: "Wallet", to: "FishEarn", call: "Award", coins: "After a kill of another seated fish, the wallet takes 1 FISH per 1 USDC of the smaller stake. Once per open bout. No USDC moves. This page does not send Settle." },
  { lane: "source", kind: "spec", from: "fish", to: "party", call: "SameParty, PartyOf, MemberAt", coins: "Same crew cannot bite. Killer USDC splits by damage. Party FISH bonus uses address seats." },
  { lane: "source", kind: "spec", from: "fish", to: "Crew wallets", call: "send the killer share", coins: "USDC leaves fish. Party never holds it." },
  { lane: "source", kind: "spec", from: "fish", to: "Sink addresses", call: "mint, lay, and kill splits", coins: "Upgrade, liquidity, team, burn, season, protocol. These are addresses." },
  { lane: "source", kind: "spec", from: "FISH ledger", to: "fish", call: "Season share", coins: "FISH is the ledger, 6 decimals, 100,000,000 supply. FishEarn pays a kill from the season allocation. Upgrade FISH stays in this browser. A wallet transfer is not taxed." },
  { lane: "source", kind: "none", from: "profile", to: "fish", call: "No call", coins: "The card does not move USDC or mint an NFT." },
  { lane: "source", kind: "none", from: "Market", to: "fish collection", call: "List and Buy are on the collection", coins: "FishNFT is deployed on Arc. This page does not send List or Buy." },
];

const KIND_LABEL: Record<RealmWire["kind"], string> = {
  call: "Sends",
  read: "Reads",
  stay: "Stays",
  spec: "Source",
  none: "No call",
};

function toneOf(name: string): string {
  if (name === "Wallet" || name === "Crew wallets") return "you";
  if (name === "FishDuel" || name === "FishEarn" || name === "fish" || name === "fish collection") return "fish";
  if (name === "FishParty" || name === "party" || name === "Market") return "party";
  if (name === "FishProfile" || name === "profile") return "profile";
  if (name === "Practice sea" || name === "Practice books") return "sea";
  return "token";
}

function roleOf(lane: RealmWire["lane"], name: string): string {
  if (name === "Wallet") return "Signer";
  if (name === "Practice sea") return "Books and bites";
  if (name === "Practice books") return "In this tab";
  if (name === "FishDuel" || name === "fish") return "Pays the kill";
  if (name === "FishParty") return "Seats only";
  if (name === "FishProfile") return "Sailor card";
  if (name === "party") return lane === "source" ? "Answers SameParty" : "Seats only";
  if (name === "Crew wallets") return "Killer share";
  if (name === "Sink addresses") return "Split books";
  if (name === "fish collection") return "On the collection";
  if (name === "FISH ledger") return "Season share";
  if (lane === "source" && name === "profile") return "No call into fish";
  if (name === "FishEarn") return "Pays FISH";
  if (name === "Market") return "Not sent by this client";
  return "";
}

type BubbleSpot = { id: string; x: number; y: number; r: number };

/** Light strokes for the deep-water chart. The paper legend keeps the darker hues. */
const KIND_COLOR: Record<RealmWire["kind"], string> = {
  call: "#8ee0d2",
  read: "#9fd0ea",
  stay: "#f0b09a",
  spec: "#f0c27a",
  none: "#c5d5cf",
};

const LIVE_FIELD = {
  w: 960,
  h: 560,
  spots: [
    { id: "Wallet", x: 150, y: 250, r: 56 },
    { id: "FishDuel", x: 430, y: 90, r: 62 },
    { id: "FishParty", x: 820, y: 100, r: 58 },
    { id: "FishProfile", x: 700, y: 280, r: 58 },
    { id: "Practice sea", x: 170, y: 470, r: 58 },
    { id: "Practice books", x: 520, y: 470, r: 64 },
    { id: "FishEarn", x: 430, y: 250, r: 52 },
  ] satisfies BubbleSpot[],
};

const SOURCE_FIELD = {
  w: 960,
  h: 560,
  spots: [
    { id: "FISH ledger", x: 140, y: 80, r: 48 },
    { id: "party", x: 830, y: 80, r: 48 },
    { id: "profile", x: 140, y: 250, r: 48 },
    { id: "fish", x: 470, y: 230, r: 64 },
    { id: "Crew wallets", x: 830, y: 250, r: 54 },
    { id: "Market", x: 150, y: 470, r: 48 },
    { id: "fish collection", x: 470, y: 470, r: 52 },
    { id: "Sink addresses", x: 830, y: 450, r: 54 },
  ] satisfies BubbleSpot[],
};

const LINE_BEND: Record<string, number> = {
  "Wallet->FishParty": 36,
  "Practice sea->FishDuel": 120,
  "FISH ledger->fish": -30,
  "fish->Sink addresses": 50,
  "fish->party": -36,
};

const LABEL_NUDGE: Record<string, { x: number; y: number }> = {
  "Practice sea->FishDuel": { x: 24, y: 18 },
  "Practice sea->Practice books": { x: 0, y: -26 },
  "fish->party": { x: 0, y: -18 },
};

const MAP_LABEL: Record<string, string> = {
  "Practice sea->FishDuel": "Pool and portrait",
  "fish->party": "SameParty",
  "Market->fish collection": "List and buy",
};

type ChartNode = {
  id: string;
  x: number;
  y: number;
  r: number;
  tone: string;
  title: string;
  caption: string;
  figure: string;
  detail: string;
  aside?: boolean;
};

type ChartEdge = {
  from: string;
  to: string;
  kind: RealmWire["kind"];
  label: string;
  mapLabel?: string;
  detail: string;
};

function linkEnds(from: { x: number; y: number; r: number }, to: { x: number; y: number; r: number }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: from.x + ux * (from.r + 8),
    y1: from.y + uy * (from.r + 8),
    x2: to.x - ux * (to.r + 14),
    y2: to.y - uy * (to.r + 14),
    ux,
    uy,
  };
}

function labelLines(call: string): string[] {
  if (call.length <= 28) return [call];
  const comma = call.lastIndexOf(",", 26);
  const cut = comma > 8 ? comma + 1 : call.lastIndexOf(" ", 22);
  if (cut < 8) return [call];
  return [call.slice(0, cut).trim(), call.slice(cut).trim()];
}

function ChartMap({
  mapId,
  field,
  nodes,
  edges,
  bends,
  focus,
  active,
  onFocus,
  onHover,
}: {
  mapId: string;
  field: { w: number; h: number };
  nodes: ChartNode[];
  edges: ChartEdge[];
  bends: Record<string, number>;
  focus: string | null;
  active: string | null;
  onFocus: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  const spot = new Map(nodes.map((item) => [item.id, item]));
  const touches = (id: string) => active === null || id === active || edges.some((edge) => (
    (edge.from === id || edge.to === id) && (edge.from === active || edge.to === active)
  ));
  return (
    <div className="bubble-scroll">
      <div className="bubble-field" style={{ aspectRatio: `${field.w} / ${field.h}` }}>
        <svg className="bubble-lines" viewBox={`0 0 ${field.w} ${field.h}`} aria-hidden="true">
          <defs>
            {(Object.keys(KIND_COLOR) as RealmWire["kind"][]).map((kind) => (
              <marker key={kind} id={`bubble-arrow-${mapId}-${kind}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={KIND_COLOR[kind]} />
              </marker>
            ))}
          </defs>
          {edges.map((edge) => {
            const from = spot.get(edge.from);
            const to = spot.get(edge.to);
            if (!from || !to) return null;
            const line = linkEnds(from, to);
            const bend = bends[`${edge.from}->${edge.to}`] ?? 0;
            const cx = (line.x1 + line.x2) / 2 - line.uy * bend;
            const cy = (line.y1 + line.y2) / 2 + line.ux * bend;
            const nudge = LABEL_NUDGE[`${edge.from}->${edge.to}`] ?? { x: 0, y: 0 };
            const place = {
              x: Math.min(field.w - 16, Math.max(16, 0.25 * line.x1 + 0.5 * cx + 0.25 * line.x2 - line.uy * 18 + nudge.x)),
              y: Math.min(field.h - 12, Math.max(16, 0.25 * line.y1 + 0.5 * cy + 0.25 * line.y2 + line.ux * 18 + nudge.y)),
            };
            const drawn = edge.mapLabel || edge.label;
            const hot = active === null || edge.from === active || edge.to === active;
            return (
              <g key={`${edge.from}-${edge.to}`} className={`kind-${edge.kind}${hot ? "" : " is-dim"}`}>
                <path
                  d={`M ${line.x1} ${line.y1} Q ${cx} ${cy} ${line.x2} ${line.y2}`}
                  markerEnd={`url(#bubble-arrow-${mapId}-${edge.kind})`}
                />
                {drawn ? (
                  <text x={place.x} y={place.y} textAnchor="middle">
                    {labelLines(drawn).map((part, index) => (
                      <tspan key={part} x={place.x} dy={index === 0 ? 0 : 14}>{part}</tspan>
                    ))}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {nodes.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`bubble tone-${item.tone}${item.aside ? " is-aside" : ""}${focus === item.id ? " is-on" : ""}${touches(item.id) ? "" : " is-dim"}`}
            style={{ left: `${(item.x / field.w) * 100}%`, top: `${(item.y / field.h) * 100}%`, width: `${(item.r * 2 / field.w) * 100}%` }}
            aria-pressed={focus === item.id}
            data-realm={item.id}
            aria-label={[item.title, item.caption, item.figure, item.detail].filter(Boolean).join(". ")}
            onClick={() => onFocus(item.id)}
            onPointerEnter={() => onHover(item.id)}
            onPointerLeave={() => onHover(null)}
          >
            <b>{item.title}</b>
            {item.caption ? <small>{item.caption}</small> : null}
            {item.figure ? <small>{item.figure}</small> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function realmNodes(lane: RealmWire["lane"], spots: BubbleSpot[]): ChartNode[] {
  const wires = realmWires.filter((wire) => wire.lane === lane);
  return spots.map((spot) => {
    const own = wires.filter((wire) => wire.from === spot.id || wire.to === spot.id);
    return {
      id: spot.id,
      x: spot.x,
      y: spot.y,
      r: spot.r,
      tone: toneOf(spot.id),
      title: spot.id,
      caption: roleOf(lane, spot.id),
      figure: "",
      detail: own.map((wire) => `${wire.call}. ${wire.coins}`).join(" "),
    };
  });
}

function realmEdges(lane: RealmWire["lane"]): ChartEdge[] {
  return realmWires.filter((wire) => wire.lane === lane).map((wire) => ({
    from: wire.from,
    to: wire.to,
    kind: wire.kind,
    label: wire.call,
    mapLabel: MAP_LABEL[`${wire.from}->${wire.to}`],
    detail: wire.coins,
  }));
}

function EdgeList({ edges, focus }: { edges: ChartEdge[]; focus: string | null }) {
  const shown = focus ? edges.filter((edge) => edge.from === focus || edge.to === focus) : edges;
  return (
    <ul className="bubble-detail">
      {shown.map((edge) => (
        <li key={`${edge.from}-${edge.to}`} className={`kind-${edge.kind}`}>
          <b>{edge.from} to {edge.to}</b>
          <span>{KIND_LABEL[edge.kind]}</span>
          <span>{edge.label}</span>
          <small>{edge.detail}</small>
        </li>
      ))}
    </ul>
  );
}

function FocusLine({ focus, idle }: { focus: string | null; idle: string }) {
  return (
    <p className="realm-focus" aria-live="polite">
      {focus ? `Paths that touch ${focus}. Pick the bubble again to show every path.` : idle}
    </p>
  );
}

export function RealmBoard({ lane }: { lane: RealmWire["lane"] }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const field = lane === "live" ? LIVE_FIELD : SOURCE_FIELD;
  const nodes = realmNodes(lane, field.spots);
  const edges = realmEdges(lane);
  const toggleFocus = (name: string) => setFocus((current) => (current === name ? null : name));
  return (
    <section className="realm-board" aria-label={lane === "live" ? "How the contracts talk" : "How the contracts call each other"}>
      <h2>{lane === "live" ? "How the contracts talk" : "How the contracts call each other"}</h2>
      <FocusLine focus={focus} idle="Pick a bubble. Each line is one call." />
      <div className="chart-sea">
        <ul className="realm-legend" aria-label="Path kinds">
          {([
            ["call", "Sends"],
            ["read", "Reads"],
            ["stay", "Stays in this tab"],
            ["spec", "Local source"],
            ["none", "No call"],
          ] as const).filter(([kind]) => edges.some((edge) => edge.kind === kind)).map(([kind, name]) => (
            <li key={kind} className={`kind-${kind}`}>{name}</li>
          ))}
        </ul>
        <ChartMap
          mapId={lane}
          field={field}
          nodes={nodes}
          edges={edges}
          bends={LINE_BEND}
          focus={focus}
          active={focus ?? hover}
          onFocus={toggleFocus}
          onHover={setHover}
        />
      </div>
      {lane === "live" ? <p>The sea opens when 1 USDC is staked into the pool.</p> : <p>No call into fish.</p>}
      {focus ? <button type="button" className="chart-clear" onClick={() => setFocus(null)}>Show every path</button> : null}
      <EdgeList edges={edges} focus={focus} />
    </section>
  );
}

const MONEY_FIELD = { w: 960, h: 600 };

function moneyNodes(map: ReturnType<typeof systemMap>): ChartNode[] {
  const mint = Object.fromEntries(map.mint.map((slice) => [slice.key, slice]));
  const kill = Object.fromEntries(map.kill.map((slice) => [slice.key, slice]));
  const sink = (id: string, title: string, x: number, y: number, r: number, tone: string, slice: FlowSlice): ChartNode => ({
    id,
    x,
    y,
    r,
    tone,
    title,
    caption: slice.share,
    figure: slice.amount,
    detail: `${slice.label} receives ${slice.amount}, ${slice.share} of this flow.`,
  });
  return [
    { id: "mint", x: 160, y: 200, r: 56, tone: "you", title: "Mint", caption: `${map.mintGnot} USDC`, figure: "Spent fee", detail: "The fee is spent. It is not locked on the NFT." },
    sink("upgrade", "Upgrade", 400, 70, 48, "upgrade", mint.upgrade),
    sink("lp", "Liquidity", 400, 190, 42, "liquidity", mint.lp),
    sink("team", "Team", 400, 300, 38, "team", mint.team),
    sink("burn", "Burn", 400, 410, 38, "burn", mint.burn),
    { id: "lay", x: 160, y: 430, r: 46, tone: "sea", title: "Lay", caption: `${map.layGnot} USDC`, figure: "Same split", detail: "Same split as mint. The child copies size and tier. The trait is a practice roll, not chain entropy." },
    { id: "kill", x: 640, y: 280, r: 52, tone: "killer", title: "Kill", caption: map.killExample, figure: "Covered", detail: `Covered stake ${map.killExample}. The split uses the smaller of the two stakes.` },
    sink("killer", "Killer", 870, 60, 48, "killer", kill.killer),
    sink("kill-lp", "Liquidity", 870, 180, 40, "liquidity", kill.lp),
    sink("kill-team", "Team", 870, 290, 36, "team", kill.team),
    sink("kill-buy", "Buyback", 870, 400, 36, "buyback", kill.buyback),
    sink("kill-cheer", "Cheer", 870, 510, 42, "cheer", kill.cheer),
  ];
}

function moneyEdges(map: ReturnType<typeof systemMap>): ChartEdge[] {
  const mintDetail = Object.fromEntries(map.mint.map((slice) => [slice.key, `${slice.label} ${slice.share}, ${slice.amount}.`]));
  const killDetail = Object.fromEntries(map.kill.map((slice) => [slice.key, `${slice.label} ${slice.share}, ${slice.amount}.`]));
  return [
    { from: "mint", to: "upgrade", kind: "call", label: "", detail: mintDetail.upgrade },
    { from: "mint", to: "lp", kind: "call", label: "", detail: mintDetail.lp },
    { from: "mint", to: "team", kind: "call", label: "", detail: mintDetail.team },
    { from: "mint", to: "burn", kind: "call", label: "", detail: mintDetail.burn },
    { from: "lay", to: "mint", kind: "spec", label: "Same split", detail: `Lay ${map.layGnot} USDC uses the mint split: ${map.lay.map((slice) => `${slice.label} ${slice.amount}`).join(", ")}.` },
    { from: "kill", to: "killer", kind: "stay", label: "", detail: killDetail.killer },
    { from: "kill", to: "kill-lp", kind: "stay", label: "", detail: killDetail.lp },
    { from: "kill", to: "kill-team", kind: "stay", label: "", detail: killDetail.team },
    { from: "kill", to: "kill-buy", kind: "stay", label: "", detail: killDetail.buyback },
    { from: "kill", to: "kill-cheer", kind: "stay", label: "", detail: killDetail.cheer },
  ];
}

export function MoneyChart({ map }: { map: ReturnType<typeof systemMap> }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const nodes = moneyNodes(map);
  const edges = moneyEdges(map);
  const toggleFocus = (name: string) => setFocus((current) => (current === name ? null : name));
  return (
    <section className="realm-board" aria-label="Money flow">
      <h2>Money flow</h2>
      <FocusLine focus={focus} idle="Pick a bubble. The share and the amount sit on it." />
      <div className="chart-sea">
        <ul className="realm-legend" aria-label="Money paths">
          <li className="kind-call">Mint and lay</li>
          <li className="kind-spec">Same split</li>
          <li className="kind-stay">Kill example</li>
        </ul>
        <ChartMap
          mapId="money"
          field={MONEY_FIELD}
          nodes={nodes}
          edges={edges}
          bends={{}}
          focus={focus}
          active={focus ?? hover}
          onFocus={toggleFocus}
          onHover={setHover}
        />
      </div>
      {focus ? <button type="button" className="chart-clear" onClick={() => setFocus(null)}>Show every path</button> : null}
      <EdgeList edges={edges} focus={focus} />
      <div className="chart-reading">
        <p>The fee is spent. It is not locked on the NFT. Lay is {map.layGnot} USDC. Same split as mint. The child copies size and tier. The trait is a practice roll, not chain entropy.</p>
        <p>The split uses the smaller of the two stakes. A covered stake of 0 pays no USDC. The example covers {map.killExample}, so a practice win is {map.winFish} FISH from the browser reserve. A party adds up to {map.partyBonus} more FISH at {map.partyBonusFull} members. That extra is split across the party, and the party holds none of it. FishEarn pays 1 FISH per 1 USDC of the smaller stake from the season allocation, once per open bout. FishDuel pays a covered stake in USDC only, from three sealed samples. This page does not send Settle. The killer stake stays in the pool. Excess victim stake returns to that owner. The sea opens only when the pool holds a stake.</p>
        <p>Buyback spends {map.buybackSpent} at {map.twap} per FISH and moves {map.buybackFish} FISH from the reserve into burned FISH. Dust that cannot buy one FISH burns. Empty cheer joins the team book. A new kill does not drop watch shards.</p>
        <p>The sea opens when 1 USDC is staked into the pool. That stake is not taken from the practice purse. Leave after 5 quiet seconds. A bite starts that wait. Cheer locks at least 1 USDC or 10 FISH, capped at half of that fish's Pool X, and comes back when the fish leaves or is downed. FISH cheer is valued at {map.twap} and returns in full. Cheer does not change bite damage.</p>
        <h3>Upgrade spends FISH</h3>
        <ol className="step-bubbles">
          {map.upgrades.map((step) => (
            <li key={step.to}>
              <b>{step.fee} FISH</b>
              <span>{step.from} to {step.to}</span>
              <small>Spec success {step.success}</small>
            </li>
          ))}
        </ol>
        <p>Success burns the whole fee. A failed roll burns half and returns half. On {map.upgrades[0].fee} FISH that is {map.failBurn} burned and {map.failRefund} returned. The team takes none of an upgrade fee. These rolls are the spec. The 150/400/1000/2500/6000 ladder is the practice book. The sea page does not send Upgrade, so that payment stays in the browser. Higher tiers stay closed until a commit-reveal roll exists.</p>
        <h3>Team inflows</h3>
        <div className="chart-notes">
          <article>
            <h3>Enters the team book</h3>
            <p>10% of mint USDC, 10% of lay USDC, 3% of a covered kill, and cheer that nobody claims.</p>
          </article>
          <article>
            <h3>Stays out of the team book</h3>
            <p>Upgrade FISH, the heal-skip burn, buy and sell tax, wallet transfers, and the killer's prize. Tax is reserved for locked liquidity.</p>
          </article>
        </div>
        <h3>USDC</h3>
        <p>Mint is {map.mintGnot} USDC. Lay is {map.layGnot} USDC. A paid stake is at least {map.stakeMinGnot} USDC and has no product maximum. Cheer starts at 1 USDC. A heal skip burns its USDC.</p>
        <p>Practice genesis is {map.practiceGnot}. Your purse starts at {map.playerStart}. The watch purse starts at {map.viewerStart}.</p>
        <h3>Fish NFT</h3>
        <p>A FishNFT mint starts at Bubble. Two heads climb one tier, and any other pair stops. Tideblade, Abysswing, Embermaw, Aurelion, and Astravex are less likely. Size stays medium. The chain flips swift, fang, or hide. The token points at that tier's model, and the sea wears the compressed fish. The collection symbol is FISH. On Arc the coin you spend is native USDC. The mint is 5 USDC. Block entropy is not a VRF.</p>
        <p>A kill leaves the NFT at 30% HP. Upgrade burns two fish of the same rarity in the practice book. List, update price, cancel, and buy are on the collection. A secondary buy pays protocol {map.protocol} and creator royalty {map.royalty}. This page does not send a sale.</p>
        <h3>Arc sea</h3>
        <p>The sea has no machine fish. A wallet on Arc testnet stakes 1 USDC, then swims and bites with the other connected wallets. Bites stay in this browser.</p>
      </div>
    </section>
  );
}

const SUPPLY_FIELD = { w: 960, h: 580 };

const SUPPLY_BEND: Record<string, number> = {
  "fish->community": -40,
  "fish->ecosystem": 30,
};

export function SupplyChart({ map }: { map: ReturnType<typeof systemMap> }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const places: Record<string, { x: number; y: number; r: number }> = {
    season: { x: 470, y: 62, r: 52 },
    liquidity: { x: 830, y: 160, r: 50 },
    ecosystem: { x: 760, y: 420, r: 48 },
    community: { x: 190, y: 430, r: 66 },
    sale: { x: 300, y: 86, r: 58 },
    team: { x: 130, y: 168, r: 44 },
  };
  const nodes: ChartNode[] = [
    {
      id: "fish",
      x: 470,
      y: 250,
      r: 72,
      tone: "fish",
      title: "FISH",
      caption: map.chainSupply,
      figure: `${map.chainDecimals} decimals`,
      detail: "FISH is the ledger. 6 decimals. FishEarn pays a kill from the season share. This purse is a separate practice book.",
    },
    ...map.allocation.map((row) => ({
      id: row.key,
      x: places[row.key].x,
      y: places[row.key].y,
      r: places[row.key].r,
      tone: row.key,
      title: row.label,
      caption: `${row.bps / 100}%`,
      figure: `${row.wholeLabel} FISH`,
      detail: `${row.label} is ${row.bps / 100}% of the supply, ${row.wholeLabel} FISH.`,
    })),
    {
      id: "practice",
      x: 470,
      y: 500,
      r: 36,
      tone: "sea",
      title: "Practice",
      caption: map.practiceFish,
      figure: "Not this supply",
      detail: "This purse is not the supply in the center bubble.",
      aside: true,
    },
  ];
  const edges: ChartEdge[] = [
    ...map.allocation.map((row) => ({
      from: "fish",
      to: row.key,
      kind: "read" as const,
      label: "",
      detail: `${row.label} is ${row.bps / 100}% of the supply, ${row.wholeLabel} FISH.`,
    })),
    { from: "fish", to: "practice", kind: "none", label: "", detail: "This purse is not the supply in the center bubble." },
  ];
  const toggleFocus = (name: string) => setFocus((current) => (current === name ? null : name));
  const uses = [
    ["win", "Win", `1 FISH per 1 USDC of the covered stake. A party adds up to ${map.partyBonus} more FISH at ${map.partyBonusFull} members, and that extra is split across the party. The ${map.killExample} example with no party pays ${map.winFish} FISH from the reserve.`],
    ["upgrade", "Upgrade", `${map.upgrades.map((step) => step.fee).join(" / ")} FISH. Success burns the fee. The team takes none of it.`],
    ["buyback", "Buyback", `${map.buybackFish} FISH in that kill example, bought with ${map.buybackSpent} at ${map.twap} per FISH and burned from the reserve.`],
    ["tax", "Tax", `A buy keeps ${map.buyTax} and a sell keeps ${map.sellTax}, reserved for locked liquidity. A wallet transfer, a cheer, a season reward, and a community claim are untaxed. This browser has no pool.`],
  ] as const;
  return (
    <section className="realm-board" aria-label="Practice book">
      <h2>Practice book</h2>
      <p>The practice book shows a fixed supply of {map.chainSupply} FISH, with {map.chainDecimals} decimals. The wallet FISH is the ledger token. Fish held on the wallet card counts FishDuel fish, not this supply. This page does not send Settle. Bites stay in this browser.</p>
      <FocusLine focus={focus} idle="Pick a slice of the supply." />
      <div className="chart-sea">
        <ul className="realm-legend" aria-label="Supply marks">
          <li className="kind-read">Share of the supply</li>
          <li className="kind-none">Practice purse</li>
        </ul>
        <ChartMap
          mapId="supply"
          field={SUPPLY_FIELD}
          nodes={nodes}
          edges={edges}
          bends={SUPPLY_BEND}
          focus={focus}
          active={focus ?? hover}
          onFocus={toggleFocus}
          onHover={setHover}
        />
      </div>
      <p className="fish-practice"><b>{map.practiceFish}</b> practice FISH. This purse is not the supply in the center bubble.</p>
      {focus ? <button type="button" className="chart-clear" onClick={() => setFocus(null)}>Show every path</button> : null}
      <EdgeList edges={edges} focus={focus} />
      <ul className="fish-uses" aria-label="Where FISH moves">
        {uses.map(([key, title, copy]) => (
          <li key={key} data-k={key}>
            <b>{title}</b>
            <span>{copy}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
