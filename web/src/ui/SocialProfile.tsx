import { useEffect, useRef, useState } from "react";
import { partyNameOk } from "../chain/adenaTx";
import { readArcUsername, syncArcParty } from "../chain/partyRoster";
import { createPartyCall, setProfileCall } from "../chain/realmCalls";
import { useOnyxWallet } from "../chain/session";
import { chainCountryName } from "../sim/country";
import { openOnyx } from "./adena";
import { acceptPartyInvite } from "./partyJoin";
import { PLAYER_ID, type ShoalGame } from "../sim/game";
import { cleanUsername, type CrestId } from "../sim/social";
import { FlagImg, SailorName } from "./sailorName";
import { storeSailor } from "./sailorStore";
import { useIpCountry } from "./useIpCountry";
import type { ShoalSnap } from "./useShoal";

/** Sailor card. Saving it does not mint a fish, and the same card can be changed later. */
export function SailorCard({ game, snap }: { game: ShoalGame; snap: ShoalSnap }) {
  const me = snap.profiles.find((profile) => profile.id === PLAYER_ID);
  const [username, setUsername] = useState(me?.username ?? "");
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const edited = useRef(false);
  useEffect(() => {
    if (edited.current || !me) return;
    setUsername(me.username);
  }, [me]);
  // The live profile realm still requires a crest. The card no longer asks for one.
  const crest: CrestId = me?.crest ?? "wave";
  const wallet = useOnyxWallet();
  const ip = useIpCountry();
  const shownCountry = ip.country?.name ?? me?.country ?? "";

  return (
    <section className="sailor-card" aria-label="Sailor card">
      <p className="kicker">Sailor card</p>
      <p className="readout">This card is yours. A fish is not required. Save sends the name, country, and crest to Arc and keeps a copy in this browser. No USDC moves. You can change the name later. The country follows your network address.</p>
      {me?.username ? <p className="sailor-display"><SailorName username={me.username} country={shownCountry} /></p> : null}
      <p className="address social-wrap">{me?.address}</p>
      <form className="social-form" onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const clean = cleanUsername(username);
          if (!clean) {
            setProfileNote("Username needs 3 to 16 letters or digits.");
            return;
          }
          const place = ip.country;
          if (!place) {
            setProfileNote(ip.status === "loading"
              ? "Reading the country from your network address."
              : "No country from this network address.");
            return;
          }
          const chainName = chainCountryName(place.name);
          if (!chainName) {
            const result = game.setProfile(clean, place.name, crest, Date.now());
            if (result.ok) storeSailor({ username: clean, country: place.name, crest });
            setProfileNote(result.ok
              ? `${clean} saved in this browser. Arc does not store ${place.name} yet.`
              : result.detail);
            return;
          }
          const tx = await openOnyx(setProfileCall(clean, chainName, crest));
          if (tx === "busy") {
            setProfileNote("The wallet is already sending a call.");
            return;
          }
          if (!tx.ok) {
            setProfileNote(tx.detail);
            return;
          }
          const result = game.setProfile(clean, chainName, crest, Date.now());
          if (result.ok) storeSailor({ username: clean, country: chainName, crest });
          setProfileNote(result.ok ? "Profile saved on Arc and in this browser." : `Arc saved the profile. This browser did not. ${result.detail}`);
        })();
      }}>
        <label>
          Username
          <input value={username} maxLength={16} aria-label="Username" onChange={(event) => { edited.current = true; setUsername(event.target.value); }} />
        </label>
        <p className="readout" aria-live="polite">
          {ip.status === "ready" && ip.country
            ? <>Country <FlagImg code={ip.country.code} />{ip.country.name}. It follows your network address.</>
            : ip.status === "missing"
              ? "No country from this network address."
              : "Reading the country from your network address."}
        </p>
        <button type="submit" className="primary" disabled={wallet.busy || ip.status !== "ready"}>Save profile</button>
        <p className="note social-wrap" role="status" aria-live="polite">{profileNote}</p>
      </form>
    </section>
  );
}

/** Embedded social tools; not a modal and never blocks the sea. */
export function SocialProfile({ game, snap }: {
  game: ShoalGame;
  snap: ShoalSnap;
}) {
  const [partyName, setPartyName] = useState("");
  const [partyNote, setPartyNote] = useState<string | null>(null);
  const [acceptNote, setAcceptNote] = useState<string | null>(null);
  const [chainNames, setChainNames] = useState<Record<string, string>>({});
  const wallet = useOnyxWallet();
  const crew = snap.arcCrew ?? null;
  const signer = wallet.signer;

  useEffect(() => {
    if (!signer) return;
    let gone = false;
    const pull = () => {
      if (!gone) void syncArcParty(game, signer);
    };
    pull();
    const id = window.setInterval(pull, 1000);
    return () => {
      gone = true;
      window.clearInterval(id);
    };
  }, [game, signer]);

  const memberKey = snap.arcCrew?.members.join("|") ?? "";
  useEffect(() => {
    const members = memberKey ? memberKey.split("|") : [];
    if (members.length === 0) return;
    let gone = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(members.map(async (addr) => {
        try {
          const name = await readArcUsername(addr);
          if (name) next[addr] = name;
        } catch {
          // A missed card keeps the name already on this browser.
        }
      }));
      if (!gone && Object.keys(next).length > 0) setChainNames((current) => ({ ...current, ...next }));
    })();
    return () => {
      gone = true;
    };
  }, [memberKey]);

  const mine = snap.fish.filter((fish) => !fish.ai && !fish.burned && fish.alive);
  const fish = mine.find((item) => item.id === snap.activeFishId) ?? mine[0] ?? null;
  const invite = snap.partyInvite ?? null;
  const me = (signer ?? "").toLowerCase();
  const profileName = (key: string) => {
    const chain = chainNames[key];
    if (chain) return chain;
    const mineCard = snap.profiles.find((profile) => profile.id === PLAYER_ID);
    if (mineCard && (key === me || mineCard.address.toLowerCase() === key) && mineCard.username) return mineCard.username;
    const card = snap.profiles.find((profile) => profile.id === key || profile.address.toLowerCase() === key);
    return card?.username ?? "";
  };
  const fishFor = (key: string) => snap.fish.find((item) => {
    if (item.ai || item.burned) return false;
    if (item.ownerId === PLAYER_ID && (key === me || snap.profiles.find((profile) => profile.id === PLAYER_ID)?.address.toLowerCase() === key)) return true;
    if (item.ownerId.toLowerCase() === key) return true;
    return item.remoteAddress?.toLowerCase() === key;
  });

  return (
    <div className="social-profile">
      <details className="social-disclosure">
        <summary>{crew ? `Party · ${crew.name} · ${crew.members.length}` : invite ? `Party · ${invite.name} invited you` : "Party"}</summary>
        <p className="readout">{invite && !crew ? `${invite.name} invited you. Accept to join the list.` : "Same crew cannot bite. A friend joins after Accept."}</p>
        {crew && (
          <ul className="people" aria-label="Party members">
            {crew.members.map((addr) => {
              const key = addr.toLowerCase();
              const name = profileName(key) || `${key.slice(0, 6)}…${key.slice(-4)}`;
              const level = fishFor(key)?.size ?? "";
              return (
                <li key={addr}>
                  <b className="social-wrap" title={addr}>{name}</b>
                  {level ? <span className="friend-meta">{level}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
        {!crew && (
          <button
            type="button"
            disabled={wallet.busy || !signer}
            onClick={() => {
              if (!signer) return;
              void acceptPartyInvite(game, signer).then(setAcceptNote);
            }}
          >
            Accept invite
          </button>
        )}
        {!crew && acceptNote && <p className="note social-wrap" role="status">{acceptNote}</p>}
        {!crew && !fish && <p className="readout">Mint a living fish before founding a party.</p>}
        {!crew && fish && (
          <form className="row social-form" onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              const clean = partyName.trim();
              if (!partyNameOk(clean)) {
                setPartyNote("Party name needs 1 to 16 letters, digits, or spaces.");
                return;
              }
              const tx = await openOnyx(createPartyCall(clean));
              if (tx === "busy") {
                setPartyNote("The wallet is already sending a call.");
                return;
              }
              if (!tx.ok) {
                setPartyNote(tx.detail);
                return;
              }
              const seated = signer ? await syncArcParty(game, signer) : null;
              setPartyNote(seated ? `Party ${seated.name} is on Arc.` : "Party opened on Arc. The list appears when the chain read returns.");
            })();
          }}>
            <input value={partyName} maxLength={16} placeholder="Party name" aria-label="Party name" onChange={(event) => setPartyName(event.target.value)} />
            <button type="submit" className="primary" disabled={wallet.busy}>Found</button>
          </form>
        )}
        {partyNote && <p className="note social-wrap" role="status">{partyNote}</p>}
      </details>

      <details className="social-disclosure">
        <summary>Profile</summary>
        <SailorCard game={game} snap={snap} />
      </details>
    </div>
  );
}
