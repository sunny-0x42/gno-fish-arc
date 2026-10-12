import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { cruiseHold, subscribeCruise, toggleCruise } from "../world/cruiseHold";
import { steerHold } from "../world/steerHold";
import { COIN_FLIP_ODDS, HEALS_PER_DAY, nextRarity, RARITIES, SPECIES, TRAIT_COIN_ODDS, UGNOT, type Rarity } from "../sim/catalog";
import { BURST_COOLDOWN_MS, BURST_MS } from "../sim/rules";
import { formatChainFish, formatFish, formatGnot, formatLeft } from "../sim/format";
import { PLAYER_ID, type ShoalGame } from "../sim/game";
import { LAY_FEE_UGNOT, LAY_SETTLE_MS, PARTY_FISH_BONUS_CAP_BPS, PARTY_FISH_BONUS_FULL, TRAIT_DODGE, finalStats, upgradeTo, type Size as FishSize, type Trait } from "../sim/tokenomics";
import { arcSeaFull, claimGate, combatState, fundsCopy, healGate, layGate, liveTarget, onyxMintGate, ownedState, playStep, poolEntryGate, upgradeGate, watchReadiness } from "./actionState";
import { readAim, subscribeAim, type AimRead } from "../world/aim";
import { lockTarget, readTargetLock, subscribeTargetLock, TARGET_LOCK_MS, type TargetLock } from "../world/targetLock";
import { biteHold } from "../world/biteHold";
import { FishPreview } from "../world/FishPreview";
import { incomingBlow } from "./hurt";
import { FightCredit, LootPop, TargetHp, useKillerLoot, type Loot } from "./MatchHud";
import { SailorName } from "./sailorName";
import { ARC_COLLECTION_WHOLE, ARC_NFT, arcCall, arcFishBalance, arcFishName, arcTxOk, collectionNameOk, freeDuelSeat, poolStakeMicro, seatedDuelId } from "../chain/arc";
import { awardChainKill } from "./awardKill";
import { loadChainSea, readBestWorn } from "../chain/seaRoster";
import { collectionMintCall, duelMintCall, leaveCall, registerCall } from "../chain/realmCalls";
import { onyxSigner, useOnyxWallet, withChain } from "../chain/session";
import { ensureOnyxSigner, openOnyx } from "./adena";
import { useOnyxFish } from "./ChainLine";
import { PlatformNav, type PlatformMode } from "./PlatformNav";
import { SeasonBoard } from "./SeasonBoard";
import { SailorCard } from "./SocialProfile";
import { canCheerFish, seaFish } from "./selection";
import type { ShoalSnap } from "./useShoal";

function useAim(): AimRead {
  const [aim, setAim] = useState(readAim);
  useEffect(() => subscribeAim(setAim), []);
  return aim;
}

function useTargetLock(): TargetLock {
  const [lock, setLock] = useState(readTargetLock);
  useEffect(() => subscribeTargetLock(setLock), []);
  return lock;
}

function snapMatch(game: ShoalGame, id: string | null) {
  return game.matches.find((match) => match.id === id) ?? null;
}

function focusId(id: string) {
  const node = document.getElementById(id);
  if (!node) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  node.focus();
}

const SHOAL_MINT = `${ARC_COLLECTION_WHOLE} USDC`;

const PLAY_STEPS = [
  { n: 1 as const, title: "Wallet", detail: "Connect a wallet on Arc testnet." },
  { n: 2 as const, title: "Mint", detail: `A fish · ${SHOAL_MINT} on the Shoal collection.` },
  { n: 3 as const, title: "Stake", detail: "Choose the pool stake. At least 1 USDC." },
  { n: 4 as const, title: "Sea", detail: "Move, bite, and leave here." },
];

const WATCH_NEXT = "Next: pick a fish to follow.";

function Guide({ startOpen = false }: { startOpen?: boolean }) {
  const ready = useRef(false);
  return (
    <details
      className="guide"
      ref={(node) => {
        // React `open={}` sticks after a click. Set the attribute once, then let the browser toggle.
        if (!node || ready.current || !startOpen) return;
        node.open = true;
        ready.current = true;
      }}
    >
      <summary>
        <b>Guide</b>
        <span>How to play · Body · Sea</span>
      </summary>
      <div className="guide-cols">
        <section>
          <p className="kicker">How to play</p>
          <p><b>Move</b> with W, A, S, and D, or the pad. A and D turn. The fish eases, then glides. X holds still, then swims again.</p>
          <p><b>Click</b> the sea to bite in front of the mouth. Space bursts for one second.</p>
          <p><b>Small</b> is faster and slips a bite. Large has more HP. The trait adds its own dodge: swift {TRAIT_DODGE.swift}, hide {TRAIT_DODGE.hide}, fang {TRAIT_DODGE.fang}.</p>
          <p><b>Eat</b> to grow toward large. Keep eating and the body takes the next species. That is not an upgrade. Each species hunts one other.</p>
          <p><b>Hide</b> in a reef or a cave while small. A larger fish can break it.</p>
          <p><b>Party</b> fish cannot bite each other. A bite starts a cooldown.</p>
          <p><b>Down</b> leaves the NFT at 30% HP. Heal outside the sea. Two heals a day.</p>
          <p><b>Springs</b> restore HP in the sea. A live spring is a plus on the radar. The two daily heals still wait until you leave.</p>
          <p><b>Leave</b> after 5 quiet seconds. Leave returns the stake. Leaving does not mint another fish.</p>
        </section>
        <section>
          <p className="kicker">Body</p>
          <p><b>Trait</b> stays on the NFT. Swift is faster and slips {TRAIT_DODGE.swift}. Fang bites harder and slips {TRAIT_DODGE.fang}. Hide has more HP and slips {TRAIT_DODGE.hide}.</p>
          <p><b>Another mint</b> waits until every fish you own has finished a match.</p>
          <p><b>Upgrade</b> needs both fish to finish a match. Leaving early does not count.</p>
          <p><b>Lay</b> after 3 finished matches. The child copies size and tier. The trait stays hidden until settle.</p>
          <p className="kicker">Sea</p>
          <p><b>One sea.</b> The sea opens when 1 USDC is staked into the pool. One fish per wallet.</p>
          <p><b>A kill</b> of another seated wallet pays 1 FISH per 1 USDC of the smaller stake into the wallet, once per open bout. A covered stake of 0 pays no FISH. A party adds up to {PARTY_FISH_BONUS_CAP_BPS / 100}% more FISH at {PARTY_FISH_BONUS_FULL} members in this browser. The NFT stays. USDC in the pool stays until Leave.</p>
          <p><b>Cheer</b> comes back when that fish leaves or is downed.</p>
        </section>
      </div>
    </details>
  );
}

function Books({ snap }: { snap: ShoalSnap }) {
  return (
    <details className="books">
      <summary>Sea books</summary>
      <p>Liquidity {formatGnot(snap.books.liquidityGnot)} USDC · {formatFish(snap.books.liquidityFish)} FISH</p>
      <p>Upgrade treasury {formatGnot(snap.books.upgradeTreasuryGnot)} USDC</p>
      <p>Team {formatGnot(snap.books.devGnot)} USDC</p>
      <p>Season treasury {formatGnot(snap.books.seasonTreasuryGnot)} USDC</p>
      <p>Burn {formatGnot(snap.books.burnGnot)} USDC · {formatFish(snap.books.burnFish)} FISH</p>
      <p>Reserve {formatGnot(snap.books.reserveGnot)} USDC · {formatFish(snap.books.reserveFish)} FISH</p>
    </details>
  );
}

export function Gate({
  snap,
  mode,
  onPlay,
  onWatch,
  note,
  busy,
}: {
  snap: ShoalSnap;
  mode: PlatformMode;
  onPlay: () => void;
  onWatch: () => void;
  note?: string | null;
  busy?: boolean;
}) {
  const wallet = useOnyxWallet();
  const chainFish = snap.fish.filter((fish) => !fish.ai && !fish.burned);
  const yours = chainFish.filter((fish) => fish.ownerId === PLAYER_ID);
  const yoursSwimming = yours.filter((fish) => fish.matchId).length;
  const chainStatus = useOnyxFish();
  const portrait = chainStatus.kind === "live" ? chainStatus.portrait : "";
  const playNext = !wallet.signer
    ? "Next: connect a wallet on Arc testnet."
    : yours.length < 1
      ? `Next: mint a fish for ${SHOAL_MINT}.`
      : yoursSwimming > 0
        ? "Next: resume your fish."
        : "Next: stake 1 USDC into the pool.";
  return (
    <section className="card gate">
      <p className="sign">Shoal</p>
      <h1>Choose Play or Watch.</h1>
      <p className="readout">An Arc wallet pays the {SHOAL_MINT} collection mint. Stake 1 USDC into the pool to enter. There is no practice sea. A sailor card can be saved on Play before a mint.</p>
      <PlatformNav mode={mode} onPlay={onPlay} onWatch={onWatch} busy={busy} playNext={playNext} watchNext={WATCH_NEXT} />
      {portrait ? <img className="stand-in" src={portrait} alt="Shoal fish" width={112} height={112} /> : null}
      {note ? <p className="enter-note" role="status">{note}</p> : null}
      <div className="facts">
        <p><b>{wallet.ugnot === null ? "—" : formatGnot(wallet.ugnot)}</b><span>Wallet USDC</span></p>
        <p><b>{yours.length}</b><span>Your fish</span></p>
      </div>
      <SeasonBoard snap={snap} />
      <Guide />
    </section>
  );
}

function CareCard({
  game,
  fish,
  now,
  foods,
  fee,
  next,
  onNote,
  onEnter,
  onChainNote,
  snap,
}: {
  snap: ShoalSnap;
  game: ShoalGame;
  fish: ShoalSnap["fish"][number];
  now: number;
  foods: ShoalSnap["fish"];
  fee: number;
  next: Rarity | null;
  onNote: (value: string) => void;
  onEnter: (id: string) => void;
  onChainNote?: (text: string) => void;
}) {
  const [confirmFoodId, setConfirmFoodId] = useState<string | null>(null);
  const [staking, setStaking] = useState(false);
  const [stakeText, setStakeText] = useState("1");
  const wallet = useOnyxWallet();
  useEffect(() => {
    setConfirmFoodId(null);
    setStakeText("1");
  }, [fish.id]);
  const heal = game.healView(fish.id, now);
  const swimming = snapMatch(game, fish.matchId)?.status === "live";
  const lay = layGate(fish, snap.player.gnot);
  const layWait = fish.layCommitAt === null ? 0 : Math.max(0, fish.layCommitAt + LAY_SETTLE_MS - now);
  const entry = poolEntryGate(fish, snap);
  const steering = Boolean(fish.matchId && fish.poolUgnot > 0);
  const collectionDocked = Boolean(fish.collectionOnly && !fish.onyxSwim && !steering);
  const needsStake = !steering && !fish.onyxSwim;
  const stakeMicro = poolStakeMicro(stakeText);
  const stakeLabel = stakeMicro === null ? "" : formatGnot(stakeMicro);
  const seatsFull = !steering && !fish.onyxSwim && arcSeaFull(snap.fish, fish.id);
  const healing = healGate(fish, snap, heal);
  const hp = fish.hpMax > 0 ? Math.max(0, fish.hp / fish.hpMax) : 0;
  const layControls = (
    <div className="lay">
      <p className="kicker">Lay</p>
      <p className="readout">Spent fee {formatGnot(LAY_FEE_UGNOT)} USDC, not refundable. No cancel; wait {formatLeft(LAY_SETTLE_MS)}, then settle. Practice roll, not chain entropy.</p>
      {fish.layCommitAt !== null ? (
        <>
          <p className="readout">
            {layWait > 0
              ? `Settle opens in ${formatLeft(layWait)}. The trait stays hidden.`
              : "The trait comes from the practice roll."}
          </p>
          <button
            type="button"
            disabled={layWait > 0}
            onClick={() => {
              const result = game.settleLay(fish.id, Date.now());
              if (!result.ok) {
                onNote(result.detail);
                return;
              }
              const child = game.fishById(result.detail);
              onNote(
                child
                  ? `${child.name} hatched ${child.size} ${child.trait}. Practice roll. Not chain entropy.`
                  : "Hatched.",
              );
            }}
          >
            Settle lay
          </button>
        </>
      ) : (
        <>
          {lay.reason && <p className="action-reason">{lay.reason}</p>}
          <button
            type="button"
            disabled={!lay.ready}
            onClick={() => {
              const ok = window.confirm(
                `Lock a lay on ${fish.name} for ${formatGnot(LAY_FEE_UGNOT)} USDC? The trait stays hidden until settle. The fee does not come back.`,
              );
              if (!ok) return;
              const result = game.commitLay(fish.id, Date.now());
              onNote(result.ok ? "Lay locked." : result.detail);
            }}
          >
            Lay · {formatGnot(LAY_FEE_UGNOT)} USDC
          </button>
        </>
      )}
    </div>
  );
  return (
    <div className="care">
      <section className="stake-bay" aria-label="Stake into the pool">
        <h2>Stake</h2>
        <p className="readout">
          {collectionDocked
            ? `${fish.name} is on the Shoal collection. The wallet confirms 1 USDC to open a FishDuel seat, then ${stakeLabel || "your amount"} USDC into the pool. At least 1 USDC. The sea opens after both.`
            : swimming
              ? `In the sea. The pool holds ${formatGnot(fish.poolUgnot)} USDC.`
              : needsStake
                ? `Choose the pool stake. At least 1 USDC. The sea opens from ${stakeLabel || "that"} USDC.`
                : "Stake into the pool. The sea opens from that stake."}
        </p>
        {needsStake && (
          <label className="stake-amount">
            Pool stake
            <input
              id="play-stake-amount"
              inputMode="decimal"
              aria-label="Pool stake in USDC"
              min={1}
              step="0.01"
              value={stakeText}
              onChange={(event) => setStakeText(event.target.value)}
              disabled={staking}
            />
          </label>
        )}
        <div className="row wrap">
          {steering || fish.onyxId ? (
            <button
              id="play-stake"
              className="primary enter"
              type="button"
              disabled={wallet.busy || staking || seatsFull || (!steering && !entry.ready) || (needsStake && stakeMicro === null)}
              onClick={() => {
                if (staking) return;
                const amount = stakeMicro;
                void (async () => {
                  setStaking(true);
                  try {
                  if (needsStake) {
                    if (amount === null) {
                      onNote("Enter at least 1 USDC. Hundredths are allowed.");
                      return;
                    }
                    if (amount > game.books.reserveGnot) {
                      onNote("Choose a smaller stake. The pool book cannot mirror that amount.");
                      return;
                    }
                  }
                  const pool = amount ?? UGNOT;
                  if (seatsFull) {
                    onNote("The Arc sea already has two fish. One has to leave before this fish can stake.");
                    return;
                  }
                  if (steering) {
                    const result = game.startMatch(fish.id, Date.now());
                    if (!result.ok) {
                      onNote(result.detail);
                      return;
                    }
                    onEnter(fish.id);
                    return;
                  }
                  if (!fish.onyxSwim) {
                    const signer = onyxSigner();
                    if (!signer) {
                      onNote("Connect a wallet on Arc testnet.");
                      return;
                    }
                    let duelId = await freeDuelSeat(signer);
                    if (duelId === null) {
                      const duelName = arcFishName(fish.name) ?? "fish";
                      onNote(`Confirm 1 USDC to open the FishDuel seat. The pool stake of ${formatGnot(pool)} USDC is the next confirmation.`);
                      const minted = await openOnyx(duelMintCall(duelName));
                      if (minted === "busy") {
                        onNote("The wallet is already sending a call.");
                        return;
                      }
                      if (!minted.ok) {
                        onNote(minted.detail);
                        return;
                      }
                      if (!await arcTxOk(minted.hash)) {
                        onNote("The duel seat was not confirmed. The pool stake was not sent.");
                        return;
                      }
                      duelId = await freeDuelSeat(signer);
                      if (duelId === null) {
                        onNote("The duel seat was not found, so the pool stake was not sent.");
                        return;
                      }
                    }
                    const tx = await openOnyx(registerCall(String(duelId), String(pool)));
                    if (tx === "busy") {
                      onNote("The wallet is already sending a call.");
                      return;
                    }
                    if (!tx.ok) {
                      onNote(/RegisterClosed/i.test(tx.detail)
                        ? "Arc refused that stake. This fish may already be seated, or both sea seats are full."
                        : tx.detail);
                      return;
                    }
                    if (!await arcTxOk(tx.hash)) {
                      onNote(tx.hash ? `The stake was sent and is still confirming. ${tx.hash}` : "The stake was sent and is still confirming.");
                      return;
                    }
                    game.bindDuelSeat(fish.id, duelId);
                    game.setOnyxSwim(fish.id, true);
                  }
                  const seated = game.enterOnPoolStake(fish.id, Date.now(), pool);
                  if (!seated.ok) {
                    onNote(seated.detail);
                    return;
                  }
                  const signer = onyxSigner();
                  let enterId = fish.id;
                  if (signer) {
                    try {
                      const text = await loadChainSea(game, signer);
                      onChainNote?.(text);
                      const live = game.owned(PLAYER_ID).find((item) => item.matchId === "sea" && item.poolUgnot > 0);
                      if (live) enterId = live.id;
                    } catch {
                      enterId = fish.id;
                    }
                  }
                  onEnter(enterId);
                  } finally {
                    setStaking(false);
                  }
                })();
              }}
            >
              {staking ? "Confirm in the wallet" : steering ? "Steer" : fish.onyxSwim ? "Enter the sea" : collectionDocked ? `Open a seat, then stake ${stakeLabel || "…"} USDC` : `Stake ${stakeLabel || "…"} USDC into the pool`}
            </button>
          ) : null}
        {fish.onyxSwim && !swimming ? (
          <button
            type="button"
            disabled={wallet.busy}
            onClick={() => {
              void (async () => {
                const signer = onyxSigner();
                if (!signer) {
                  onNote("Connect a wallet on Arc testnet.");
                  return;
                }
                let seated: number | null;
                try {
                  seated = await seatedDuelId(signer);
                } catch {
                  onNote("Arc seat unread. Leave was not sent.");
                  return;
                }
                if (seated === null) {
                  game.setOnyxSwim(fish.id, false);
                  onNote("This wallet has no fish seated in the Arc sea.");
                  return;
                }
                const tx = await openOnyx(leaveCall(String(seated)));
                if (tx === "busy") {
                  onNote("The wallet is already sending a call.");
                  return;
                }
                if (!tx.ok) {
                  onNote(tx.detail);
                  return;
                }
                if (!await arcTxOk(tx.hash)) {
                  onNote(tx.hash ? `Leave was sent and is still confirming. ${tx.hash}` : "Leave was sent and is still confirming.");
                  return;
                }
                game.bindDuelSeat(fish.id, seated);
                game.setOnyxSwim(fish.id, false);
                onNote(tx.hash ? `Arc returned the stake. ${tx.hash}` : "Arc returned the stake.");
              })();
            }}
          >
            Return Arc stake
          </button>
        ) : null}
        {(fish.mustHeal || fish.hp < fish.hpMax) && (
          <button
            disabled={!healing.ready}
            onClick={() => {
              const result = game.heal(fish.id, Date.now());
              onNote(result.ok ? "Healed." : result.detail);
            }}
          >
            Heal · {heal.healsLeft}/{HEALS_PER_DAY}
          </button>
        )}
        {heal.readyIn > 0 && (
          <button
            onClick={() => {
              const result = game.rushHeal(fish.id, Date.now());
              onNote(result.ok ? "Heal opened." : result.detail);
            }}
          >
            Skip cooldown · {formatGnot(heal.rushUgnot)} USDC
          </button>
        )}
        </div>
        <p className="action-reason">{seatsFull ? "The Arc sea already has two fish. One has to leave before this fish can stake." : steering ? "The stake is already in the pool." : !fish.onyxId ? "Mint on Arc, then choose a pool stake of at least 1 USDC." : fish.onyxSwim ? "The stake is already in the pool." : needsStake && stakeMicro === null ? "Enter at least 1 USDC. Hundredths are allowed." : collectionDocked ? `The first entry confirms a FishDuel seat for 1 USDC, then ${stakeLabel} USDC into the pool.` : entry.reason ?? `Stake ${stakeLabel} USDC into the pool. That opens the sea.`}</p>
      </section>
      <h2>Care</h2>
      <p className="readout">{fish.name} · {fish.species} · {fish.size} · {fish.trait}. The NFT stays yours.</p>
      <div className="hp" role="meter" aria-valuemin={0} aria-valuemax={fish.hpMax} aria-valuenow={fish.hp}>
        <i style={{ width: `${(hp * 100).toFixed(1)}%` }} />
      </div>
      <p>
        {`${fish.hp} / ${fish.hpMax} HP · bite ${fish.bite} · heals ${heal.healsLeft}/${HEALS_PER_DAY}${heal.readyIn > 0 ? ` · heal in ${formatLeft(heal.readyIn)}` : ""}`}
        {fish.mustHeal ? " · heal before the next swim." : ""}
      </p>
      <p className="readout">The Shoal mint is {SHOAL_MINT} on the collection. The pool stake is the amount you enter, at least 1 USDC, into FishDuel. A collection fish also opens a duel seat for 1 USDC the first time. Growth, upgrade, lay, heal, and bites stay in this browser. The collection rolls species and trait on chain. This page does not send Settle.</p>
      {(fish.mustHeal || fish.hp < fish.hpMax) && <p className="action-reason">{healing.reason ?? "Free Heal restores HP outside the sea."} Skipping cooldown spends a fee; it does not heal automatically.</p>}
      {fish.alive && fish.layCommitAt !== null && layControls}
      {fish.alive && (
        <details className="brief advanced-care">
          <summary>Advanced care · Lay &amp; Upgrade</summary>
          {fish.layCommitAt === null && layControls}
          <div className="upgrade">
            {next ? (
              <>
                <p className="kicker">Upgrade</p>
                <p>
                  Use {fish.name} and one other {fish.size} {fish.trait} {fish.rarity}, plus {formatFish(fee)} FISH, to step up to {SPECIES[next].species}. Both fish have to finish a match first. Both fish burn in this browser. That does not change the Arc NFT. A failed roll still burns both in this browser and returns half the FISH.
                </p>
              </>
            ) : (
              <p>Mythic does not step up.</p>
            )}
            {next && foods.length === 0 && fish.layCommitAt === null && <p>Finish a match, then mint another {fish.size} {fish.trait} {fish.rarity} fish and finish a match with it too.</p>}
            {fish.layCommitAt !== null && <p>Settle the lay before an upgrade.</p>}
            <div className="row wrap">
              {next && foods.map((food) => {
                const eligibility = upgradeGate(fish, food, snap.player.fish);
                return (
                  <div key={food.id}>
                    <button type="button" disabled={!eligibility.ready} onClick={() => setConfirmFoodId(food.id)}>Upgrade with {food.name}</button>
                    {eligibility.reason && <p className="action-reason">{eligibility.reason}</p>}
                    {confirmFoodId === food.id && (
                      <div className="upgrade-confirm" role="group" aria-label={`Confirm upgrade with ${food.name}`}>
                        <p>Spend {formatFish(fee)} FISH and burn {fish.name} and {food.name} in this browser? Both fish are lost here even on failure. The Arc NFTs do not change. Failure returns half the FISH. This cannot be undone.</p>
                        <button type="button" disabled={!eligibility.ready} onClick={() => {
                          const result = game.upgrade(fish.id, food.id, Date.now());
                          setConfirmFoodId(null);
                          onNote(result.ok ? result.detail === "failed" ? "Upgrade failed. Both fish burned in this browser. Half the fee came back. The Arc NFTs did not change." : "Upgrade succeeded. Both old fish burned in this browser. The Arc NFTs did not change." : result.detail);
                        }}>Confirm burn &amp; upgrade</button>
                        <button type="button" onClick={() => setConfirmFoodId(null)}>Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {fish.mustHeal && <p>Heal this fish before the next swim.</p>}
          </div>
        </details>
      )}
    </div>
  );
}

export function MintPanel({
  game,
  snap,
  now,
  mode,
  onPlay,
  onWatch,
  onEnter,
  onBack,
  onInspect,
  chainNote,
  onChainNote,
}: {
  onInspect?: (fish: { rarity: Rarity; size: FishSize; trait?: Trait; name?: string; image?: string }, opener: HTMLElement) => void;
  game: ShoalGame;
  snap: ShoalSnap;
  now: number;
  mode: PlatformMode;
  onPlay: () => void;
  onWatch: () => void;
  onEnter: (id: string) => void;
  onBack: () => void;
  chainNote?: string | null;
  onChainNote?: (text: string) => void;
}) {
  const wallet = useOnyxWallet();
  const [inspected, setInspected] = useState<Rarity>("common");
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [feedId, setFeedId] = useState<string | null>(null);

  const spec = SPECIES.common;
  const sized = finalStats({ bite: spec.bite, hp: spec.hp, speed: spec.speed, range: spec.range, size: "medium", trait: "swift" });
  const mine = snap.fish.filter((fish) => fish.ownerId === PLAYER_ID && !fish.ai && !fish.burned);
  const target = mine.find((fish) => fish.id === feedId) ?? mine[0] ?? null;
  const foods = mine.filter((fish) =>
    target &&
    fish.alive &&
    fish.layCommitAt === null &&
    target.layCommitAt === null &&
    fish.id !== target.id &&
    fish.rarity === target.rarity &&
    fish.size === target.size &&
    fish.trait === target.trait,
  );
  const next = target ? nextRarity(target.rarity) : null;
  const fee = next ? upgradeTo(next)?.fee ?? 0 : 0;
  const mint = onyxMintGate(snap, wallet);
  const funds = fundsCopy(snap);
  const swimming = Boolean(target && snapMatch(game, target.matchId)?.status === "live");
  const step = playStep({ signer: Boolean(wallet.signer), fish: mine.length, swimming });
  const nextLabel = ["Next · Connect wallet", "Next · Go to mint", "Next · Stake into the pool", "Next · Enter the sea"][step - 1];
  const goNext = () => {
    if (step === 1) {
      void (async () => {
        const ready = await withChain(() => ensureOnyxSigner());
        if (ready === "busy") {
          setNote("The wallet is already sending a call.");
          return;
        }
        if (!ready.ok) {
          setNote(ready.detail);
          return;
        }
        setNote("Arc testnet is connected.");
      })();
      return;
    }
    if (step === 2) {
      focusId("play-mint");
      return;
    }
    if (step === 3) {
      if (!document.getElementById("play-stake")) {
        setNote("Mint on Arc, then stake 1 USDC into the pool.");
        return;
      }
      focusId("play-stake");
      return;
    }
    if (!target || target.poolUgnot <= 0 || !target.matchId) {
      setNote("Stake 1 USDC into the pool to enter the sea.");
      return;
    }
    const result = game.startMatch(target.id, Date.now());
    if (!result.ok) {
      setNote(result.detail);
      return;
    }
    onEnter(target.id);
  };

  const mintControls = (
    <div className="mint-act">
      <div className="mint-pick">
        <label>
          Name
          <input value={name} maxLength={20} placeholder={spec.species} onChange={(event) => setName(event.target.value)} />
        </label>
        <p className="readout">Mint is {SHOAL_MINT} on the Shoal collection, fish-arc-5. The name allows 1 to 20 letters, digits, or spaces. Two heads climb one species. Any other pair stops. The chain also flips the trait: swift {TRAIT_COIN_ODDS.swift} slips {TRAIT_DODGE.swift}, fang {TRAIT_COIN_ODDS.fang} slips {TRAIT_DODGE.fang}, hide {TRAIT_COIN_ODDS.hide} slips {TRAIT_DODGE.hide}. The sea wears that compressed model. Stake 1 USDC into the pool to enter. Block entropy is not a VRF.</p>
        {mint.reason && <p className="action-reason">{mint.reason}</p>}
        <button
          id="play-mint"
          className="primary"
          type="button"
          disabled={!mint.ready || wallet.busy}
          onClick={() => {
            void (async () => {
              const mintName = name.trim() || spec.species;
              if (!collectionNameOk(mintName)) {
                setNote("A Shoal fish name needs 1 to 20 letters, digits, or spaces.");
                return;
              }
              const tx = await openOnyx(collectionMintCall(mintName));
              if (tx === "busy") {
                setNote("The wallet is already sending a call.");
                return;
              }
              if (!tx.ok) {
                setNote(tx.detail);
                return;
              }
              const signer = onyxSigner();
              let rolled: Rarity | null = null;
              let rolledTrait = "";
              if (signer) {
                try {
                  const worn = await readBestWorn(signer, (data) => arcCall(data, ARC_NFT));
                  if (worn) {
                    rolled = worn.rarity;
                    rolledTrait = worn.trait;
                    game.wearCollection(worn.rarity, worn.trait);
                  }
                } catch {
                  rolled = null;
                }
              }
              const hash = tx.hash ? ` ${tx.hash}` : "";
              if (signer) {
                try {
                  const text = await loadChainSea(game, signer);
                  onChainNote?.(text);
                } catch {
                  onChainNote?.("Arc roster unread. The sea stays empty.");
                }
              }
              setNote(rolled
                ? `${mintName} minted as ${SPECIES[rolled].species}${rolledTrait ? `, ${rolledTrait}` : ""}. The sea wears that model. ${SHOAL_MINT} left the wallet.${hash}`
                : `${mintName} minted. Enter again so the sea can read the species. ${SHOAL_MINT} left the wallet.${hash}`);
            })();
          }}
        >
          {mine.length > 0 ? "Mint another fish" : "Mint a fish"} · {SHOAL_MINT}
        </button>
      </div>
      <ul className="stats">
        <li><b>{sized.hp}</b> HP</li>
        <li><b>{sized.speed}</b> Speed</li>
        <li><b>{sized.dodge.toFixed(1)}</b> Dodge</li>
        <li><b>{sized.bite}</b> Bite</li>
        <li><b>{sized.range.toFixed(2)}</b> Range</li>
        <li><b>{spec.skill}</b> Skill</li>
      </ul>
    </div>
  );

  return (
    <section className="card mint">
      <PlatformNav mode={mode} onPlay={onPlay} onWatch={onWatch} watchNext={WATCH_NEXT} />
      <header className="mint-lead">
        <p className="kicker">Play</p>
        <p className="purse"><small>Wallet balance</small>{wallet.ugnot === null ? "Connect wallet" : `${formatGnot(wallet.ugnot)} USDC`}</p>
      </header>
      <ol className="play-steps" aria-label="How to enter the sea">
        {PLAY_STEPS.map((item) => (
          <li key={item.n} className={item.n < step ? "done" : item.n === step ? "now" : "later"} aria-current={item.n === step ? "step" : undefined}>
            <span className="step-no">{item.n}</span>
            <b>{item.title}</b>
            <small>{item.detail}</small>
          </li>
        ))}
      </ol>
      <button className="primary play-next" type="button" disabled={wallet.busy || (step === 4 && !target)} onClick={goNext}>{nextLabel}</button>
      <SailorCard game={game} snap={snap} />
      {mine.length === 0 && mintControls}
      <div className="inventory play-roster">
        <h2>Your fish <span className="roster-count">{mine.length}</span></h2>
        <p className="readout">These fish come from the Shoal collection on Arc testnet. Stake into the pool before the sea opens.</p>
        {mine.length === 0 && <p>No Arc fish in this wallet.</p>}
        <div className="fish-cards">
          {mine.map((fish) => {
            const state = ownedState(fish, snap, now);
            const token = typeof fish.onyxId === "number" ? ` #${fish.onyxId}` : "";
            const picked = target?.id === fish.id;
            return (
              <article key={fish.id} className={`fish-card r-${fish.rarity}${picked ? " on" : ""}`}>
                <FishPreview className="chip-preview" rarity={fish.rarity} size={fish.size} trait={fish.trait} frame={0.9} fit />
                <b className="fish-card-name">{fish.name}{token}</b>
                <small className="owned-status">{fish.size} {fish.trait} · {state.status}</small>
                <small className="owned-next">{state.next}</small>
                {mine.length > 1 && (
                  <button type="button" onClick={() => setFeedId(fish.id)}>{picked ? "Selected" : "Choose this fish"}</button>
                )}
              </article>
            );
          })}
        </div>
        {target && (
          <CareCard
            snap={snap}
            game={game}
            fish={target}
            now={now}
            foods={foods}
            fee={fee}
            next={next}
            onNote={setNote}
            onEnter={onEnter}
            onChainNote={onChainNote}
          />
        )}
        {chainNote ? <p className="enter-note" role="status">{chainNote}</p> : null}
        {target && onInspect && <button className="inspect-button" type="button" onClick={(event) => onInspect({ rarity: target.rarity, size: target.size, trait: target.trait, name: target.name, image: target.image }, event.currentTarget)}>{target.image ? `View ${target.name}` : `Inspect ${target.name} in 3D`}</button>}
        <p className="funds-detail">{funds.stake}.</p>
        <p className="note" role="status" aria-live="polite">{note}</p>
        <div className="row">
          <button onClick={onBack}>Back</button>
          <Books snap={snap} />
        </div>
      </div>
      {mine.length > 0 && (
        <details className="brief mint-disclosure">
          <summary>Mint another fish <span>{SHOAL_MINT} on the Shoal collection</span></summary>
          <p className="readout">Another mint waits until every fish you own has finished a match.</p>
          {mintControls}
        </details>
      )}
      <details className="brief season-fold mint-disclosure">
        <summary>Season 0 — Beta <span>100,000 FISH for the top 20. This table is a draft and FISH is not paid.</span></summary>
        <SeasonBoard snap={snap} title={false} />
      </details>
      <Guide />
      <details className="brief species-disclosure">
        <summary>Species <span>Coin flip. Bubble is the most likely</span></summary>
        <div className="mint-grid">
          <div className={`species-inspection r-${inspected}`}>
            <p className="kicker">Species inspection</p>
            {/* 0.48 pulls the camera in. The default fit frames the sea bounds, so the model sat small. */}
            <FishPreview rarity={inspected} size="medium" frame={0.48} />
            {onInspect && <button className="inspect-button" type="button" onClick={(event) => onInspect({ rarity: inspected, size: "medium" }, event.currentTarget)}>Inspect {SPECIES[inspected].species} in 3D</button>}
            <div className="species-caption" aria-live="polite">
              <h2>{SPECIES[inspected].species}</h2>
              <p>{SPECIES[inspected].blurb}</p>
              <p className="guide-note">{inspected} · {COIN_FLIP_ODDS[inspected]}. Two heads climb. The chain rolls this.</p>
              <p className="guide-note">Trait · swift {TRAIT_COIN_ODDS.swift}, dodge {TRAIT_DODGE.swift}. Fang {TRAIT_COIN_ODDS.fang}, dodge {TRAIT_DODGE.fang}. Hide {TRAIT_COIN_ODDS.hide}, dodge {TRAIT_DODGE.hide}.</p>
            </div>
          </div>
          <div className="tiers" role="group" aria-label="Species odds">
            {RARITIES.map((key) => {
              const item = SPECIES[key];
              return (
                <button
                  key={key}
                  className={`tier r-${key}${inspected === key ? " on" : ""}`}
                  type="button"
                  aria-pressed={inspected === key}
                  onClick={() => setInspected(key)}
                >
                  <b>{item.species}</b>
                  <span>{key}</span>
                  <span>{COIN_FLIP_ODDS[key]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </details>
    </section>
  );
}

function axisHold(axis: "up" | "down" | "left" | "right") {
  const release = () => { steerHold[axis] = false; };
  return {
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      steerHold[axis] = true;
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* The hold still tracks the pointer. */ }
    },
    onPointerUp: release,
    onPointerCancel: release,
    onLostPointerCapture: release,
  };
}

/** On-screen W A S D. The same axes as the keyboard. */
function MovePad() {
  return (
    <div className="move-pad" role="group" aria-label="Move">
      <button type="button" data-key="w" aria-label="Move forward" tabIndex={-1} {...axisHold("up")}>W</button>
      <button type="button" data-key="a" aria-label="Turn left" tabIndex={-1} {...axisHold("left")}>A</button>
      <button type="button" data-key="s" aria-label="Move back" tabIndex={-1} {...axisHold("down")}>S</button>
      <button type="button" data-key="d" aria-label="Turn right" tabIndex={-1} {...axisHold("right")}>D</button>
    </div>
  );
}

export function PlayHud({
  game,
  snap,
  now,
  onMint,
  onLeave,
}: {
  game: ShoalGame;
  snap: ShoalSnap;
  now: number;
  onMint: () => void;
  onLeave: () => void;
}) {
  const fish = snap.fish.find((item) => item.id === snap.activeFishId && !item.burned);
  const [note, setNote] = useState<string | null>(null);
  const leavingRef = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [blow, setBlow] = useState<{ id: string; fishId: string; text: string; at: number } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const openedAt = useRef(Date.now());
  const aim = useAim();
  const biteLock = useTargetLock();
  const wallet = useOnyxWallet();
  const [fishBal, setFishBal] = useState<bigint | null>(null);
  const [halted, setHalted] = useState(cruiseHold.halted);
  useEffect(() => {
    const who = wallet.signer;
    if (!who) {
      setFishBal(null);
      return;
    }
    let live = true;
    void arcFishBalance(who).then((value) => {
      if (live) setFishBal(value);
    });
    return () => {
      live = false;
    };
  }, [wallet.signer, snap.log.length]);
  useEffect(() => subscribeCruise(() => setHalted(cruiseHold.halted)), []);
  useEffect(() => {
    const release = () => { biteHold.down = false; };
    window.addEventListener("blur", release);
    return () => { window.removeEventListener("blur", release); release(); };
  }, []);
  useEffect(() => {
    if (!fish) return;
    const next = incomingBlow(snap.log, fish.id, fish.name);
    if (!next) return;
    setBlow((prev) => (prev && prev.id === next.id ? prev : { ...next, fishId: fish.id }));
  }, [fish, snap.log]);
  useEffect(() => {
    if (!blow || blow.at < openedAt.current) return;
    setFlashId(blow.id);
    const timer = window.setTimeout(() => {
      setFlashId((current) => (current === blow.id ? null : current));
    }, 560);
    return () => window.clearTimeout(timer);
  }, [blow]);
  const loot = useKillerLoot(snap.log, fish?.id ?? "", openedAt.current);
  const hurt = flashId && blow && blow.id === flashId ? (
    <div key={flashId} className="hurt" role="status">
      <p>{blow.text}</p>
    </div>
  ) : null;
  if (!fish) {
    return (
      <>
      {loot ? <LootPop key={loot.id} loot={loot} /> : null}
      <section className="card eaten">
        <h1>No fish in the sea.</h1>
        <p>Mint a fish. The NFT stays yours after a kill.</p>
        <button className="primary" onClick={onMint}>Roster</button>
      </section>
      </>
    );
  }
  const live = snap.matches.find((match) => match.id === fish.matchId && match.status === "live") ?? null;
  const heal = game.healView(fish.id, now);
  if (!live) {
    return (
      <>
        {hurt}
        {loot ? <LootPop key={loot.id} loot={loot} /> : null}
        <section className="card eaten">
          <h1>{fish.mustHeal ? `${game.displayName(fish)} needs a heal.` : `${game.displayName(fish)} is out of the sea.`}</h1>
          {fish.mustHeal ? <p className="hit" role="status">You were downed. This fish left the sea.</p> : null}
          <p>
            This NFT stays yours.
            {fish.mustHeal
              ? ` HP is ${fish.hp} / ${fish.hpMax}. Heal before the next swim.`
              : " Stake 1 USDC into the pool to enter the sea again."}
          </p>
          <div className="hp" role="meter" aria-valuemin={0} aria-valuemax={fish.hpMax} aria-valuenow={fish.hp}>
            <i style={{ width: `${((fish.hp / fish.hpMax) * 100).toFixed(1)}%` }} />
          </div>
          <FightCredit log={snap.log} fishId={fish.id} since={openedAt.current} />
          <div className="row">
            <button
              disabled={heal.healsLeft === 0 || heal.readyIn > 0 || (fish.hp >= fish.hpMax && !fish.mustHeal)}
              onClick={() => {
                const result = game.heal(fish.id, Date.now());
                setNote(result.ok ? "Healed." : result.detail);
              }}
            >
              Heal · {heal.healsLeft}/{HEALS_PER_DAY}
            </button>
            {heal.readyIn > 0 && (
              <button
                onClick={() => {
                  const result = game.rushHeal(fish.id, Date.now());
                  setNote(result.ok ? "Heal opened." : result.detail);
                }}
              >
                Skip cooldown · {formatGnot(heal.rushUgnot)} USDC
              </button>
            )}
            <button
              onClick={() => {
                game.leave();
                onMint();
              }}
            >
              Roster
            </button>
          </div>
          <p className="note" role="status" aria-live="polite">{note}</p>
        </section>
      </>
    );
  }
  const hp = Math.max(0, fish.hp / fish.hpMax);
  const exitLive = (go: () => void) => {
    void (async () => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      setLeaving(true);
      const fishId = fish.id;
      try {
        const current = game.fishById(fishId);
        if (!current) return;
        const signer = onyxSigner();
        const chainSwim = Boolean(current.onyxSwim);
        if (!signer && chainSwim) {
          setNote("Connect a wallet on Arc testnet.");
          return;
        }
        let seated: number | null = null;
        if (signer) {
          try {
            seated = await seatedDuelId(signer);
          } catch {
            setNote("Arc seat unread. Leave was not sent.");
            return;
          }
        }
        let chainReturned = false;
        if (seated !== null) {
          setNote("Confirm Leave in the wallet. The stake returns after Arc mines it.");
          const tx = await openOnyx(leaveCall(String(seated)));
          if (tx === "busy") {
            setNote("The wallet is already sending a call.");
            return;
          }
          if (!tx.ok) {
            setNote(tx.detail);
            return;
          }
          if (!await arcTxOk(tx.hash)) {
            setNote(tx.hash ? `Leave was sent and is still confirming. ${tx.hash}` : "Leave was sent and is still confirming.");
            return;
          }
          const swimming = game.fishById(fishId);
          if (swimming) {
            game.bindDuelSeat(swimming.id, seated);
            game.setOnyxSwim(swimming.id, false);
          }
          chainReturned = true;
        } else if (chainSwim) {
          game.setOnyxSwim(fishId, false);
          chainReturned = true;
        }
        const result = game.leaveMatch(fishId, Date.now(), chainReturned);
        if (!result.ok) {
          setNote(result.detail);
          return;
        }
        go();
      } finally {
        leavingRef.current = false;
        setLeaving(false);
      }
    })();
  };
  const readiness = combatState(fish, now);
  const targetFish = liveTarget(snap, aim.targetId, fish.id);
  const lockedFish = biteLock.id && now < biteLock.until ? liveTarget(snap, biteLock.id, fish.id) : null;
  const aimed = lockedFish ?? targetFish;
  const cooldown = SPECIES[fish.rarity].biteCooldownMs;
  const cooling = readiness.biteLeft > 0;
  const fill = cooling ? Math.max(0, 1 - readiness.biteLeft / cooldown) : 1;
  const biteStyle = { "--fill": fill } as CSSProperties;
  const burstWindow = BURST_MS + BURST_COOLDOWN_MS;
  const burstLeft = readiness.burstLeft;
  const bursting = readiness.burstActive > 0;
  const burstFill = burstLeft > 0 ? Math.max(0, 1 - burstLeft / burstWindow) : 1;
  const burstStyle = { "--fill": burstFill } as CSSProperties;
  return (
    <>
      {hurt}
      {loot ? <LootPop key={loot.id} loot={loot} /> : null}
      <section className="hud">
        <div className={`identity r-${fish.rarity}${hp <= 0.3 ? " low" : ""}`}>
          <div className="id-top">
            <b><SailorName username={game.displayName(fish)} country={game.displayCountry(fish.ownerId)} /></b>
            <span className="pill">{fish.size} · {fish.rarity}</span>
          </div>
          <div className="hp-row">
            <div className={hp <= 0.3 ? "hp low" : "hp"} role="meter" aria-valuemin={0} aria-valuemax={fish.hpMax} aria-valuenow={fish.hp}>
              <i style={{ width: `${(hp * 100).toFixed(1)}%` }} />
            </div>
            <span>{fish.hp} / {fish.hpMax}</span>
          </div>
          <p className="funds">{wallet.ugnot === null ? "Wallet —" : `Wallet ${formatGnot(wallet.ugnot)} USDC · ${fishBal === null ? "—" : formatChainFish(fishBal)} FISH`}</p>
          <FightCredit log={snap.log} fishId={fish.id} since={openedAt.current} />
          {game.sharedSea ? <p className="funds">Connected wallets share this sea. A bite lands on their fish.</p> : null}
          {blow && blow.fishId === fish.id ? <p className="hit">{blow.text}</p> : null}
        </div>
      </section>
      <TargetHp fish={aimed} damage={lockedFish ? biteLock.damage : aim.damage} held={Boolean(lockedFish)} label={aimed ? game.displayName(aimed) : undefined} country={aimed ? game.displayCountry(aimed.ownerId) : undefined} />
      <MovePad />
      <section className={`dock r-${fish.rarity}${note ? " has-note" : ""}`}>
        <p className="clock">Sea</p>
        <div className="pad">
          <button
            className="bite"
            style={biteStyle}
            type="button"
            aria-label={`Bite · ${SPECIES[fish.rarity].skill}`}
            onClick={(event) => {
              if (event.detail === 0) {
                if (!targetFish) { setNote("Face a fish to find a bite target."); return; }
                const result = game.tryBite(fish.id, targetFish.id, Date.now());
                if (result.ok) {
                  const damage = result.detail === "kill" ? 0 : Number(result.detail);
                  lockTarget(targetFish.id, Date.now() + TARGET_LOCK_MS, Number.isFinite(damage) ? damage : 0);
                  if (result.detail === "kill") void awardChainKill(game, fish.id, targetFish.id);
                } else setNote(result.detail);
              }
            }}
            onPointerDown={(event) => {
              try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer. */ }
              biteHold.down = true;
            }}
            onPointerUp={() => { biteHold.down = false; }}
            onPointerLeave={() => { biteHold.down = false; }}
            onPointerCancel={() => { biteHold.down = false; }}
            onLostPointerCapture={() => { biteHold.down = false; }}
            onBlur={() => { biteHold.down = false; }}
          >
            <span>Bite · {SPECIES[fish.rarity].skill}</span>
            <small>
              {cooling ? `Cooldown ${formatLeft(readiness.biteLeft)}` : targetFish ? `Ready · ${aim.damage} estimated` : "Ready · find a target"}
            </small>
            <i className="cd" />
          </button>
          <button
            className={bursting ? "burst bursting" : "burst"}
            style={burstStyle}
            onClick={() => {
              if (cruiseHold.halted) {
                setNote("Swim before a burst.");
                return;
              }
              const result = game.tryBurst(fish.id, Date.now());
              if (!result.ok) setNote(result.detail);
            }}
          >
            <span>{bursting ? "Bursting" : "Burst"}</span>
            <small>{bursting ? `Active ${formatLeft(readiness.burstActive)}` : burstLeft > 0 ? `Cooldown ${formatLeft(burstLeft)}` : halted ? "Swim first" : "Ready · Space"}</small>
            <i className="cd" />
          </button>
          <button
            className={halted ? "halt on" : "halt"}
            type="button"
            aria-label={halted ? "Swim. Shortcut X" : "Stop. Shortcut X"}
            onClick={() => toggleCruise()}
          >
            {halted ? "Swim" : "Stop"}<small>X</small>
          </button>
          <button className="dock-side" type="button" disabled={wallet.busy || leaving} onClick={() => exitLive(onMint)}>Roster</button>
          <button className="dock-side" type="button" disabled={wallet.busy || leaving} onClick={() => exitLive(onLeave)}>{leaving ? "Leaving" : "Leave"}<small>{fish.onyxSwim || readiness.quietLeft <= 0 ? "Ready" : `Quiet ${formatLeft(readiness.quietLeft)}`}</small></button>
        </div>
        <p className="action-reason">{note ? note : fish.onyxSwim ? "Leave returns the pool stake to this wallet." : readiness.quietLeft > 0 ? "Roster / Leave waits for 5 quiet seconds after combat. Bites stay in this browser." : "Roster / Leave returns the remaining stake. Bites stay in this browser."}</p>
        <p className="note" role="status" aria-live="polite">{note}</p>
      </section>
    </>
  );
}

export function WatchPanel({
  game,
  snap,
  now,
  followId,
  onFollow,
  mode,
  onPlay,
  onWatch,
  onBack,
}: {
  game: ShoalGame;
  snap: ShoalSnap;
  now: number;
  followId: string | null;
  onFollow: (id: string | null) => void;
  mode: PlatformMode;
  onPlay: () => void;
  onWatch: () => void;
  onBack: () => void;
}) {
  const [asset, setAsset] = useState<"gnot" | "fish">("gnot");
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState<string | null>(null);
  const [pickup, setPickup] = useState<Loot | null>(null);
  useEffect(() => {
    if (!pickup) return;
    const id = pickup.id;
    const timer = window.setTimeout(() => {
      setPickup((current) => (current?.id === id ? null : current));
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [pickup]);
  const sea = seaFish(snap);
  const followed = sea.find((fish) => fish.id === followId) ?? null;
  const cheer = snap.cheers.find((item) => !item.returned);
  const readiness = watchReadiness(snap.watching, snap.watchStartedAt, now);
  const funds = fundsCopy(snap);
  const qty = asset === "gnot" ? Math.round(Number(amount) * UGNOT) : Math.round(Number(amount));

  return (
    <aside className="card watch">
      {pickup ? <LootPop key={pickup.id} loot={pickup} /> : null}
      <PlatformNav mode={mode} onPlay={onPlay} onWatch={onWatch} playNext="Open Play." watchNext={WATCH_NEXT} />
      <header className="watch-lead">
        <p className="kicker">Watch</p>
        <h1>Pick a fish to follow.</h1>
      </header>
      <div className="watch-overview">
        <p>{followed ? <>Following <SailorName username={game.displayName(followed)} country={game.displayCountry(followed.ownerId)} /></> : followId ? "That fish left the sea. Overview is available; choose a new fish." : "Sea overview · choose a fish to follow."}</p>
        <button type="button" onClick={() => onFollow(null)}>{followId ? "Stop following · Overview" : "Overview"}</button>
        <button type="button" onClick={onPlay}>Open Play</button>
      </div>
      <section className="watch-sea" aria-labelledby="watch-sea-title">
        <h2 id="watch-sea-title">In the sea <span className="roster-count">{sea.length}</span></h2>
        {sea.length === 0 && <p role="status">No Arc fish are in a match. The sea stays empty until someone swims.</p>}
        <div className="fishlist">
          {sea.map((fish) => {
            const ratio = fish.hpMax > 0 ? fish.hp / fish.hpMax : 0;
            return (
              <button key={fish.id} className={`chip r-${fish.rarity} ${followId === fish.id ? "on" : ""}`} onClick={() => onFollow(fish.id)}>
                {fish.image ? <img className="chip-art" src={fish.image} alt="" width={48} height={48} /> : null}
                <span>
                  <SailorName username={game.displayName(fish)} country={game.displayCountry(fish.ownerId)} />
                  <small>{fish.species} · pool {formatGnot(fish.poolUgnot)} USDC · {fish.hp}/{fish.hpMax} HP</small>
                </span>
                <span className="bar"><i style={{ width: `${(ratio * 100).toFixed(1)}%` }} /></span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="watch-actions" aria-labelledby="watch-cheer-title">
        <h2 id="watch-cheer-title">Cheer a fish</h2>
        <p className="readout">The deposit comes back when that fish leaves or is downed. The deposit is not the loot.</p>
        <p className="purse"><small>Practice viewer balance</small>{formatGnot(snap.viewer.gnot)} USDC · {formatFish(snap.viewer.fish)} FISH</p>
        {cheer ? (
          <p className="note">Cheer is locked. The deposit comes back when that fish leaves or is downed.</p>
        ) : (
          <p className="note">Watching only. Cheer a fish that is in the sea.</p>
        )}
        <p className="funds-detail">{funds.escrow}. Deposits return when the cheered fish leaves or is downed; loot is separate.</p>
        <div className="cheer-dock">
          <p className="readout" role="status" aria-live="polite">
            {followed
              ? canCheerFish(followed) ? `Following ${followed.name}. The deposit cheers this fish.` : `Following ${followed.name}. You cannot cheer your own fish.`
              : followId ? "That fish has left the sea. Select another fish to follow and cheer." : "Select a fish to follow it."}
          </p>
          <div className="row">
            <button className={asset === "gnot" ? "on" : ""} onClick={() => setAsset("gnot")}>USDC</button>
            <button className={asset === "fish" ? "on" : ""} onClick={() => setAsset("fish")}>FISH</button>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" aria-label="Cheer amount" />
          </div>
          <button
            className="primary"
            disabled={!followed || !canCheerFish(followed)}
            onClick={() => {
              if (!followed || !canCheerFish(followed)) return;
              const result = game.cheer(followed.id, asset, qty, Date.now());
              setNote(result.ok ? "Cheer locked." : result.detail);
            }}
          >
            Deposit cheer
          </button>
        </div>
      </section>
      <section className="watch-claims" aria-labelledby="watch-claims-title">
        <h2 id="watch-claims-title">Your drops</h2>
        <p className="watch-readiness">{!snap.watching ? "Watch is not active." : readiness.ready ? "Watch time ready for future kills." : `Watching · ${formatLeft(readiness.left)} until future-kill readiness.`} You must start watching at least 15 seconds before each kill. This timer does not make earlier shards eligible.</p>
        {snap.claims.length === 0 && <p>No drop to pick up.</p>}
        {snap.claims.map((claim) => {
          const eligibility = claimGate(claim, snap.claims, snap.watching, snap.watchStartedAt, now);
          return (
          <div key={claim.id}>
          <button
            disabled={!eligibility.ready}
            className={`loot-claim ${claim.kind}`}
            onClick={() => {
              const amount = formatGnot(claim.gnot);
              const result = game.claim(claim.id, Date.now());
              if (!result.ok) {
                setNote(result.detail);
                return;
              }
              setPickup({ id: claim.id, kind: claim.kind, amount });
              setNote(claim.kind === "watch" ? `Watch shard ${amount} USDC.` : `Cheer share ${amount} USDC.`);
            }}
          >
            <small>{claim.kind === "watch" ? "Watch shard" : "Cheer share"}{claim.kind === "watch" && claim.expiresAt > now ? ` · ${formatLeft(claim.expiresAt - now)}` : ""}</small>
            <b>+{formatGnot(claim.gnot)}</b>
            <span>USDC</span>
          </button>
          <p className="claim-reason">{eligibility.reason ?? (claim.kind === "watch" ? "Eligible now · one shard per wallet for this kill." : "Your cheer share · ready to collect.")}</p>
          </div>
          );
        })}
        <p className="note" role="status" aria-live="polite">{note}</p>
      </section>
      <div className="watch-secondary">
        <details className="brief">
          <summary>Cheer rules</summary>
          <p>A kill pays USDC from the 4% share, weighted by the locked value. Empty cheer goes to the team. A new kill does not drop a watch shard.</p>
        </details>
        <details className="brief">
          <summary>Sea log</summary>
          <ul className="log">
            {snap.log.map((line) => (
              <li key={line.id}>{line.text}</li>
            ))}
          </ul>
        </details>
        <button onClick={onBack}>Back</button>
        <Books snap={snap} />
      </div>
    </aside>
  );
}
