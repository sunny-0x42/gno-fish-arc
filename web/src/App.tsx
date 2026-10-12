import { useEffect, useRef, useState } from "react";
import { ARC_CHAIN_ID, chainIdOf, firstAddress, readEthereum } from "./chain/arc";
import { applyChainSailor } from "./chain/sailorCard";
import { leaveSea, queueFriend, restoreChatQueue, rotateSeaBoot, syncSea, takeChatNote, takeChatQueue, takeFriendNote } from "./chain/seaLink";
import type { SeaKill } from "./chain/seaRoom";
import { syncArcParty } from "./chain/partyRoster";
import { loadChainSea } from "./chain/seaRoster";
import { onyxSigner, readSession, subscribeSession, withChain, writeSession } from "./chain/session";
import { createPracticeGame, PLAYER_ID, SEA_ID, VIEWER_ID, type ShoalGame } from "./sim/game";
import { readSailor, SAILOR_KEY, sailorStorage } from "./ui/sailorStore";
import { ensureOnyxSigner } from "./ui/adena";
import { AdenaButton } from "./ui/AdenaButton";
import { ChainLine } from "./ui/ChainLine";
import { SteerSettings } from "./ui/SteerSettings";
import { GraphicsSettings } from "./ui/GraphicsSettings";
import { CornerSocial } from "./ui/CornerSocial";
import { KillNotice, SeaBook, SeaTicker, mergeKillFeed } from "./ui/MatchHud";
import { useIpCountry } from "./ui/useIpCountry";
import { Gate, MintPanel, PlayHud, WatchPanel } from "./ui/Panels";
import { Welcome } from "./ui/Welcome";
import { useClock, useShoal } from "./ui/useShoal";
import { hasLivePlayer, seaFish } from "./ui/selection";
import { FishInspect, type InspectFish } from "./ui/FishInspect";
import { trackPage } from "./ui/analytics";
import { SeaView, type SeaMode } from "./world/SeaView";

type Phase = "welcome" | "gate" | "mint" | "play" | "watch";

export function App() {
  const [game] = useState<ShoalGame>(() => {
    const next = createPracticeGame();
    const saved = readSailor(sailorStorage()?.getItem(SAILOR_KEY) ?? null);
    if (saved) next.adoptProfile(saved.username, saved.country, saved.crest);
    return next;
  });
  const snap = useShoal(game);
  const now = useClock();
  const ip = useIpCountry();
  const [kills, setKills] = useState<SeaKill[]>([]);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [entryNote, setEntryNote] = useState<string | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [followId, setFollowId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<"steering" | "graphics" | "inspect" | null>(null);
  const [inspectedFish, setInspectedFish] = useState<InspectFish | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const livePlayer = hasLivePlayer(snap);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const closeOverlay = () => {
    setOverlay(null);
    if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
  };
  const toggleOverlay = (next: NonNullable<typeof overlay>) => {
    if (overlay === next) { closeOverlay(); return; }
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOverlay(next);
  };
  const inspect = (fish: InspectFish, trigger: HTMLElement) => {
    if (livePlayer) return;
    opener.current = trigger;
    setInspectedFish({ ...fish });
    setOverlay("inspect");
  };

  useEffect(() => {
    if (!overlay) return;
    const panelId = overlay === "inspect" ? "fish-inspect" : `${overlay}-settings`;
    const panel = document.getElementById(panelId);
    panel?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOverlay(null);
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [overlay]);

  const mode: SeaMode = phase === "play" ? "play" : phase === "watch" ? "watch" : "overview";
  const showBook = phase === "play" || phase === "watch";
  const validFollowId = seaFish(snap).some((fish) => fish.id === followId) ? followId : null;
  const bookFishId = phase === "watch" ? validFollowId : snap.activeFishId;
  const platformMode = phase === "watch" ? "watch" : phase === "play" || phase === "mint" ? "play" : "gate";
  const enter = (next: Phase) => {
    if (entryBusy) return;
    if (livePlayer && next !== "play") return;
    setEntryBusy(true);
    setEntryNote(null);
    void (async () => {
      let signer = onyxSigner(readSession());
      const eth = readEthereum();
      if (eth) {
        try {
          const selected = firstAddress(await eth.request({ method: "eth_accounts" }));
          const chainId = chainIdOf(await eth.request({ method: "eth_chainId" }));
          if (selected && chainId === ARC_CHAIN_ID && selected.toLowerCase() !== (signer ?? "").toLowerCase()) {
            writeSession({ address: selected, chainId, ugnot: null });
            signer = selected;
          }
        } catch {
          // A late empty read must not wipe a session that already connected.
        }
      }
      if (!signer) {
        const ready = await withChain(async () => ensureOnyxSigner());
        if (ready === "busy") {
          setEntryNote("The wallet is already sending a call.");
          setEntryBusy(false);
          return;
        }
        if (!ready.ok) {
          setEntryNote(ready.detail);
          setEntryBusy(false);
          return;
        }
        signer = ready.signer;
      }
      const detail = await Promise.race([
        loadChainSea(game, signer).then(async (text) => {
          await syncArcParty(game, signer);
          return text;
        }),
        new Promise<string>((resolve) => {
          window.setTimeout(() => resolve("Arc roster unread. The sea stays empty."), 12000);
        }),
      ]);
      closeOverlay();
      const ownsChainFish = game.owned(PLAYER_ID).some((fish) => typeof fish.onyxId === "number");
      const seated = game.owned(PLAYER_ID).find((fish) => fish.alive && !fish.burned && fish.matchId === SEA_ID && fish.poolUgnot > 0);
      setEntryNote(detail);
      if (seated && (next === "gate" || next === "mint")) {
        const opened = game.startMatch(seated.id, Date.now());
        setPhase(opened.ok ? "play" : ownsChainFish ? "mint" : next);
      } else {
        setPhase(next === "gate" && ownsChainFish ? "mint" : next);
      }
      setEntryBusy(false);
    })();
  };

  useEffect(() => {
    game.setWatching(VIEWER_ID, phase === "watch");
  }, [game, phase]);

  useEffect(() => {
    if (ip.country) game.setSailCountry(ip.country.code);
  }, [game, ip.country]);

  useEffect(() => {
    let gone = false;
    let seen = "";
    const pull = () => {
      const signer = onyxSigner();
      if (!signer || gone) return;
      void applyChainSailor(game, signer);
      const key = signer.trim().toLowerCase();
      if (key === seen) return;
      seen = key;
      void loadChainSea(game, signer).then(async (text) => {
        if (gone) return;
        setEntryNote(text);
        await syncArcParty(game, signer);
        if (gone) return;
        const here = phaseRef.current;
        if (here === "welcome" || here === "watch") return;
        const mine = game.owned(PLAYER_ID).find((fish) => fish.alive && !fish.burned && fish.matchId === SEA_ID && fish.poolUgnot > 0);
        if (!mine) {
          if (here === "play") setPhase("mint");
          return;
        }
        if (game.startMatch(mine.id, Date.now()).ok) setPhase("play");
      });
    };
    pull();
    const stop = subscribeSession(pull);
    return () => {
      gone = true;
      stop();
    };
  }, [game]);

  useEffect(() => {
    let gone = false;
    let timer = 0;
    let busy = false;
    const tick = async () => {
      if (gone || busy) return;
      const signer = onyxSigner();
      if (!signer) {
        game.setSharedSea(false);
        return;
      }
      busy = true;
      try {
        const hits = game.takeRoomHits();
        const postedKills = game.takeRoomKills();
        const postedChats = takeChatQueue();
        const result = await syncSea(signer, game.roomPose(signer), hits, postedChats, postedKills);
        if (gone) return;
        game.setSharedSea(result.ok);
        if (!result.ok) {
          game.restoreRoomHits(hits);
          game.restoreRoomKills(postedKills);
          restoreChatQueue(postedChats);
          return;
        }
        const self = signer.trim().toLowerCase();
        game.mirrorRoom(result.seats, self);
        game.applyRoomSelf(result.seats.find((seat) => seat.address === self), Date.now());
        for (const note of result.friends) {
          if (!takeFriendNote(note.id)) continue;
          const at = Date.now();
          if (note.kind === "accept") {
            game.receiveFriendAccept(note.from, note.fromName, at);
            continue;
          }
          if (note.kind === "decline") {
            game.receiveFriendDecline(note.from, note.fromName, at);
            continue;
          }
          if (note.kind === "party") {
            game.notePartyInvite(note.from, note.fromName);
            continue;
          }
          if (note.kind === "joined") {
            void syncArcParty(game, self);
            continue;
          }
          const outcome = game.receiveFriendRequest(note.from, note.fromName, at);
          if (outcome === "mutual") queueFriend(note.from, game.displayName({ ownerId: PLAYER_ID, name: "sailor" }), "accept");
        }
        for (const line of result.chats) {
          if (!takeChatNote(line.id)) continue;
          game.receiveRoomChat(line, self);
        }
        setKills((current) => {
          const next = result.kills;
          if (current.length === next.length && current.every((kill, index) => kill.id === next[index]?.id)) return current;
          return next;
        });
      } finally {
        busy = false;
      }
    };
    const loop = () => {
      void tick();
      timer = window.setTimeout(loop, 200);
    };
    const hide = () => leaveSea(onyxSigner() ?? "");
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) rotateSeaBoot();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    loop();
    return () => {
      gone = true;
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      const signer = onyxSigner();
      if (signer) void syncSea(signer, null, []);
    };
  }, [game]);

  useEffect(() => {
    trackPage(`/${phase}`, `FISH Arc · ${phase}`);
  }, [phase]);

  const tickerKills = mergeKillFeed(game.killFeed(now), kills);
  return (
    <div className={`app phase-${phase}${tickerKills.length > 0 ? " has-kills" : ""}`}>
      <SeaView game={game} mode={mode} followId={validFollowId} onFollow={setFollowId} />
      <header className="topbar">
        <strong className="sign">FISH</strong>
        <ChainLine />
        <div className="top-actions">
          <AdenaButton paused={phase === "play"} />
          <a className="desk-link" href="/desk">Desk</a>
          {phase !== "welcome" && (
            <>
              <SteerSettings open={overlay === "steering"} onToggle={() => toggleOverlay("steering")} onClose={closeOverlay} />
              <GraphicsSettings open={overlay === "graphics"} onToggle={() => toggleOverlay("graphics")} onClose={closeOverlay} />
            </>
          )}
        </div>
      </header>
      <SeaTicker kills={tickerKills} />
      {showBook ? <SeaBook snap={snap} fishId={bookFishId} /> : null}
      {showBook ? <KillNotice log={snap.log} /> : null}
      {phase === "welcome" && <Welcome onEnter={() => enter("gate")} busy={entryBusy} note={entryNote} />}
      {phase === "gate" && (
        <Gate
          snap={snap}
          mode={platformMode}
          onPlay={() => enter("mint")}
          onWatch={() => enter("watch")}
          note={entryNote}
          busy={entryBusy}
        />
      )}
      {phase === "mint" && (
        <MintPanel
          game={game}
          snap={snap}
          now={now}
          mode={platformMode}
          onPlay={() => enter("mint")}
          onWatch={() => enter("watch")}
          onBack={() => setPhase("gate")}
          onEnter={() => setPhase("play")}
          onInspect={inspect}
          chainNote={entryNote}
          onChainNote={setEntryNote}
        />
      )}
      {phase === "play" && (
        <PlayHud
          game={game}
          snap={snap}
          now={now}
          onMint={() => setPhase("mint")}
          onLeave={() => setPhase("mint")}
        />
      )}
      {phase === "watch" && (
        <WatchPanel
          game={game}
          snap={snap}
          now={now}
          followId={followId}
          onFollow={setFollowId}
          mode={platformMode}
          onPlay={() => enter("mint")}
          onWatch={() => enter("watch")}
          onBack={() => setPhase("gate")}
        />
      )}
      {phase !== "welcome" && <CornerSocial game={game} snap={snap} />}
      {overlay === "inspect" && inspectedFish && <FishInspect fish={inspectedFish} onClose={closeOverlay} />}
    </div>
  );
}
