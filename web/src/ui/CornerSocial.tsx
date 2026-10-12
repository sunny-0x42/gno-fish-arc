import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { isArcAddress } from "../chain/arc";
import { syncArcParty } from "../chain/partyRoster";
import { inviteCall } from "../chain/realmCalls";
import { lastSeats, queueChat, queueFriend } from "../chain/seaLink";
import { onyxSigner, useOnyxWallet } from "../chain/session";
import { codeForCountry } from "../sim/country";
import { PLAYER_ID, type ShoalGame } from "../sim/game";
import type { ChatChannel } from "../sim/social";
import {
  PRACTICE_CHAT_KEY,
  continuesChat,
  dailyTag,
  mentionParts,
  practiceChatStorage,
  readPracticeChat,
  unreadCounts,
  writePracticeChat,
} from "./chatRoom";
import { friendStorageKey, readStoredFriends, writeStoredFriends } from "./friendStore";
import { openOnyx } from "./adena";
import { acceptPartyInvite, relayPartyInvite } from "./partyJoin";
import { SailorName } from "./sailorName";
import { SocialProfile } from "./SocialProfile";
import { useIpCountry } from "./useIpCountry";
import type { ShoalSnap } from "./useShoal";

/** Mouse activation stays quiet; keyboard activation retains normal button focus. */
function quietPress(event: { preventDefault: () => void }) {
  event.preventDefault();
}

const WALLET = /^(?:g1[0-9a-z]{38}|0x[0-9a-f]{40})$/;

function sailorAddress(id: string, address = ""): string {
  const key = id.trim().toLowerCase();
  if (WALLET.test(key)) return key;
  const card = address.trim().toLowerCase();
  return WALLET.test(card) ? card : "";
}

type SocialPane = "friends" | "chat";
type FriendToast = { id: string; kind: "request" | "accept" | "decline" | "party"; otherId: string; text: string };

export function CornerSocial({ game, snap }: {
  game: ShoalGame;
  snap: ShoalSnap;
}) {
  const [tab, setTab] = useState<SocialPane>("chat");
  const [open, setOpen] = useState(false);
  const [glass, setGlass] = useState<"chat" | "sea">("sea");
  const [toast, setToast] = useState<FriendToast | null>(null);
  const [friendWho, setFriendWho] = useState("");
  const [channel, setChannel] = useState<ChatChannel>("world");
  const [draft, setDraft] = useState("");
  const [friendNote, setFriendNote] = useState<string | null>(null);
  const [chatNote, setChatNote] = useState<string | null>(null);
  const root = useRef<HTMLElement>(null);
  const friendsButton = useRef<HTMLButtonElement>(null);
  const chatButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const chatList = useRef<HTMLUListElement>(null);
  const nearBottom = useRef(true);
  const previousRoom = useRef<string | null>(null);
  const seenRooms = useRef<Record<string, number>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [away, setAway] = useState(false);

  const mine = snap.fish.filter((fish) => fish.ownerId === PLAYER_ID && !fish.burned);
  const fish = mine.find((item) => item.id === snap.activeFishId) ?? mine[0] ?? null;
  const party = snap.parties.find((group) => group.id === fish?.partyId) ?? null;
  const friends = snap.friends.filter((link) => link.fromId === PLAYER_ID || link.toId === PLAYER_ID);
  const incoming = friends.filter((link) => link.status === "pending" && link.toId === PLAYER_ID);
  const sent = friends.filter((link) => link.status === "pending" && link.fromId === PLAYER_ID);
  const accepted = friends.filter((link) => link.status === "accepted");
  // Losing a party/clan immediately falls back to World, including the send API.
  const activeChannel = channel === "party" && !party || channel === "clan" && !fish?.clanId ? "world" : channel;
  const roomId = activeChannel === "world" ? "world" : activeChannel === "party" ? party?.id ?? "" : fish?.clanId ?? "";
  const roomKey = `${activeChannel}:${roomId}`;
  const lines = snap.chats.filter((line) => line.channel === activeChannel && line.roomId === roomId).slice(-30);
  const lastLineId = lines.at(-1)?.id;
  const presentIds = (() => {
    if (activeChannel === "party" && party) {
      return [...new Set(snap.fish.filter((item) => !item.burned && item.partyId === party.id).map((item) => item.ownerId))];
    }
    if (activeChannel === "clan" && fish?.clanId) {
      return [...new Set(snap.fish.filter((item) => !item.burned && item.clanId === fish.clanId).map((item) => item.ownerId))];
    }
    const ids = new Set<string>([PLAYER_ID]);
    for (const fish of snap.fish) {
      if (fish.ownerId !== PLAYER_ID && game.shown(fish)) ids.add(fish.ownerId);
    }
    return [...ids];
  })();
  const ip = useIpCountry();
  const wallet = useOnyxWallet();
  const profileOf = (id: string) => snap.profiles.find((profile) => profile.id === id);
  const usernameOf = (id: string) => profileOf(id)?.username ?? id;
  const countryOf = (id: string) => {
    if (id === PLAYER_ID && ip.country) return ip.country.name;
    return profileOf(id)?.country ?? "";
  };
  const knownNames = new Set(snap.profiles.map((profile) => profile.username.toLowerCase()));
  const lookingKey = open && tab === "chat" ? roomKey : null;
  const roomUnread = (item: ChatChannel) => {
    if (item === "world") return unread["world:world"] ?? 0;
    if (item === "party" && party) return unread[`party:${party.id}`] ?? 0;
    if (item === "clan" && fish?.clanId) return unread[`clan:${fish.clanId}`] ?? 0;
    return 0;
  };
  const chatUnread = (["world", "party", "clan"] as const).reduce((sum, item) => sum + roomUnread(item), 0);
  const announced = useRef(new Set<string>());
  const priorFriends = useRef(new Map<string, { status: string; fromId: string; toId: string }>());
  const friendsReady = useRef(false);

  useEffect(() => {
    const nameOf = (id: string) => snap.profiles.find((profile) => profile.id === id)?.username ?? id;
    const next = new Map(snap.friends.map((link) => [link.id, { status: link.status, fromId: link.fromId, toId: link.toId }]));
    for (const link of snap.friends) {
      if (link.status !== "pending" || link.toId !== PLAYER_ID || announced.current.has(link.id)) continue;
      announced.current.add(link.id);
      setToast({ id: link.id, kind: "request", otherId: link.fromId, text: `${nameOf(link.fromId)} sent a friend request.` });
    }
    if (friendsReady.current) {
      for (const link of snap.friends) {
        const prev = priorFriends.current.get(link.id);
        const key = `${link.id}:accepted`;
        if (link.status !== "accepted" || link.fromId !== PLAYER_ID || prev?.status !== "pending" || announced.current.has(key)) continue;
        announced.current.add(key);
        setToast({ id: link.id, kind: "accept", otherId: link.toId, text: `${nameOf(link.toId)} accepted your friend request.` });
      }
      for (const [id, prev] of priorFriends.current) {
        const key = `${id}:declined`;
        if (next.has(id) || prev.status !== "pending" || prev.fromId !== PLAYER_ID || announced.current.has(key)) continue;
        announced.current.add(key);
        setToast({ id, kind: "decline", otherId: prev.toId, text: `${nameOf(prev.toId)} declined your friend request.` });
      }
    }
    priorFriends.current = next;
    friendsReady.current = true;
  }, [snap.friends, snap.profiles]);

  const partySeen = useRef("");
  useEffect(() => {
    const invite = snap.partyInvite;
    if (!invite) {
      partySeen.current = "";
      return;
    }
    const key = `${invite.from}:${invite.name}`;
    if (partySeen.current === key) return;
    partySeen.current = key;
    setToast({ id: `party-${key}`, kind: "party", otherId: invite.from, text: `${invite.name} invited you to the party.` });
  }, [snap.partyInvite]);

  useEffect(() => {
    if (!toast || toast.kind === "request") return;
    const timer = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const down = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || root.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".friend-toast")) return;
      setGlass("sea");
    };
    window.addEventListener("pointerdown", down);
    return () => window.removeEventListener("pointerdown", down);
  }, []);

  const friendBook = useRef("");
  useEffect(() => {
    const store = practiceChatStorage();
    const saved = readPracticeChat(store?.getItem(PRACTICE_CHAT_KEY) ?? null);
    if (game.chats.length === 0 && saved.length > 0) game.restorePracticeChat(saved);
  }, [game]);

  useEffect(() => {
    const owner = (wallet.signer ?? "").toLowerCase();
    if (!owner || friendBook.current === owner) return;
    const store = practiceChatStorage();
    const saved = readStoredFriends(store?.getItem(friendStorageKey(owner)) ?? null);
    game.restoreFriends(owner, saved);
    friendBook.current = owner;
  }, [game, wallet.signer]);

  useEffect(() => {
    const owner = (wallet.signer ?? "").toLowerCase();
    if (!owner || friendBook.current !== owner) return;
    const store = practiceChatStorage();
    if (!store) return;
    store.setItem(friendStorageKey(owner), writeStoredFriends(game.exportFriends()));
  }, [game, snap.friends, wallet.signer]);

  useEffect(() => {
    const store = practiceChatStorage();
    if (!store || snap.chats.length === 0) return;
    store.setItem(PRACTICE_CHAT_KEY, writePracticeChat(snap.chats));
  }, [snap.chats]);

  useEffect(() => {
    const next = unreadCounts(snap.chats, seenRooms.current, lookingKey);
    seenRooms.current = next.seen;
    setUnread(next.unread);
  }, [snap.chats, lookingKey]);

  useLayoutEffect(() => {
    if (channel !== activeChannel) {
      setChannel(activeChannel);
      setChatNote(null);
    }
    if (!open || tab !== "chat") {
      previousRoom.current = null;
      return;
    }
    const list = chatList.current;
    if (!list) return;
    if (previousRoom.current !== roomKey || nearBottom.current) {
      list.scrollTop = list.scrollHeight;
      nearBottom.current = true;
      setAway((value) => value ? false : value);
    }
    previousRoom.current = roomKey;
  }, [activeChannel, channel, roomKey, lastLineId, open, tab]);

  const close = () => {
    const active = document.activeElement;
    // Restore only when focus is in this disclosure; a mouse click never steals outside focus.
    if (active instanceof HTMLElement && root.current?.contains(active)) {
      const trigger = tab === "friends" ? friendsButton.current : chatButton.current;
      const saved = opener.current;
      const target = saved?.isConnected && saved !== document.body && saved !== document.documentElement && !saved.closest(".social-pane") ? saved : trigger;
      target?.focus({ preventScroll: true });
    }
    setOpen(false);
  };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[data-gameplay-blocking="true"]')) return;
      const active = document.activeElement;
      // Quiet mouse opens leave focus on the sea; don't consume Escape in another control.
      if (active instanceof HTMLElement && !root.current?.contains(active) && active.matches('button, input, textarea, select, a[href], [contenteditable="true"]')) return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, tab]);

  const pick = (next: SocialPane) => {
    if (open && tab === next) {
      if (next === "chat" && glass === "sea") {
        setGlass("chat");
        return;
      }
      close();
      return;
    }
    const active = document.activeElement;
    if (!open) opener.current = active instanceof HTMLElement ? active : null;
    // A quiet mouse channel switch must not leave focus in the now-hidden pane.
    if (active instanceof HTMLElement && active.closest(".social-pane")) {
      (next === "friends" ? friendsButton.current : chatButton.current)?.focus({ preventScroll: true });
    }
    setTab(next);
    setOpen(true);
    if (next === "chat") setGlass("chat");
  };
  const mention = (id: string) => {
    const token = `@${usernameOf(id)}`;
    setDraft((current) => {
      if (current.toLowerCase().includes(token.toLowerCase())) return current;
      const next = current.trim().length === 0 ? `${token} ` : `${current.trimEnd()} ${token} `;
      return next.slice(0, 140);
    });
    setChatNote(null);
  };
  const myName = () => game.displayName({ ownerId: PLAYER_ID, name: "sailor" });
  const relayFriend = (otherId: string, kind: "request" | "accept" | "decline") => {
    const address = sailorAddress(otherId, profileOf(otherId)?.address ?? "");
    if (!address) return false;
    queueFriend(address, myName(), kind);
    return true;
  };
  const respondFriend = (otherId: string, kind: "accept" | "decline") => {
    const result = kind === "accept" ? game.requestFriend(usernameOf(otherId), Date.now()) : game.declineFriend(usernameOf(otherId), Date.now());
    if (result.detail === "accepted") relayFriend(otherId, "accept");
    if (result.detail === "declined") relayFriend(otherId, "decline");
    setFriendNote(result.ok ? (kind === "accept" ? "Friend accepted." : "Request declined.") : result.detail);
    if (result.ok) setToast((current) => current?.otherId === otherId && current.kind === "request" ? null : current);
  };
  const inviteFriend = (otherId: string) => {
    void (async () => {
      const address = sailorAddress(otherId, profileOf(otherId)?.address ?? "");
      if (!isArcAddress(address)) {
        setFriendNote("That friend needs an Arc address.");
        return;
      }
      if (!snap.arcCrew) {
        setFriendNote("Open a party before inviting a friend.");
        return;
      }
      if (snap.arcCrew.members.includes(address)) {
        setFriendNote("Already in the party.");
        return;
      }
      const tx = await openOnyx(inviteCall(address));
      if (tx === "busy") {
        setFriendNote("The wallet is already sending a call.");
        return;
      }
      if (!tx.ok) {
        setFriendNote(tx.detail);
        return;
      }
      if (wallet.signer) await syncArcParty(game, wallet.signer);
      relayPartyInvite(address, snap.arcCrew.name);
      setFriendNote("Party invite sent. Their list updates now. They join after Accept.");
    })();
  };
  const chatGlass = open && tab === "chat" ? (glass === "chat" ? " is-chat-held" : " is-chat-dim") : "";
  const wakeChat = (event: { target: EventTarget | null; currentTarget: HTMLDivElement }) => {
    setGlass("chat");
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".chat-compose") || target.closest("button, input, textarea")) return;
    event.currentTarget.querySelector<HTMLInputElement>(".chat-compose input")?.focus({ preventScroll: true });
  };

  return (
    <>
    {toast && <div className="friend-toast" role="status">
      <p>{toast.text}</p>
      <div className="friend-toast-actions">
        {toast.kind === "request" ? <>
          <button type="button" className="primary" onMouseDown={quietPress} onClick={() => respondFriend(toast.otherId, "accept")}>Accept</button>
          <button type="button" onMouseDown={quietPress} onClick={() => respondFriend(toast.otherId, "decline")}>Decline</button>
        </> : toast.kind === "party" ? <>
          <button type="button" className="primary" onMouseDown={quietPress} onClick={() => {
            const signer = wallet.signer;
            if (!signer) {
              setFriendNote("Connect the Arc wallet before accepting.");
              return;
            }
            void acceptPartyInvite(game, signer).then((detail) => {
              setFriendNote(detail);
              setToast(null);
            });
          }}>Accept</button>
          <button type="button" onMouseDown={quietPress} onClick={() => setToast(null)}>Dismiss</button>
        </> : <button type="button" onMouseDown={quietPress} onClick={() => setToast(null)}>Dismiss</button>}
      </div>
    </div>}
    <aside ref={root} className={`corner-social${open ? " is-open" : ""}${chatGlass}`} aria-label="Friends and chat" onKeyDown={(event) => {
      if (event.key !== "Escape" || !open) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    }}>
      <div className="social-tabs" aria-label="Friends and chat">
        <button ref={friendsButton} id="social-friends-toggle" type="button" aria-expanded={open && tab === "friends"} aria-controls="social-friends" className={open && tab === "friends" ? "on" : ""} onMouseDown={quietPress} onClick={() => pick("friends")}>Friends</button>
        <button ref={chatButton} id="social-chat-toggle" type="button" aria-expanded={open && tab === "chat"} aria-controls="social-chat" className={open && tab === "chat" ? "on" : ""} onMouseDown={quietPress} onClick={() => pick("chat")}>Chat{chatUnread > 0 && <span className="chat-unread">{chatUnread}<span className="sr-only"> new</span></span>}</button>
      </div>

      <div id="social-friends" role="region" aria-labelledby="social-friends-toggle" className="social-pane friend-frame" hidden={!open || tab !== "friends"}>
        <form className="row social-form friend-add" onSubmit={(event) => {
          event.preventDefault();
          const key = friendWho.trim().toLowerCase();
          const self = (onyxSigner() ?? "").trim().toLowerCase();
          const seat = lastSeats().find((item) => item.address !== self && (item.address === key || item.sailor.toLowerCase() === key));
          if (seat) game.meetSailor(seat.address, seat.sailor);
          const who = seat?.address || friendWho;
          const result = game.requestFriend(who, Date.now());
          const typed = who.trim().toLowerCase();
          const card = game.profiles.find((item) => item.id === typed || item.username === typed || item.address.toLowerCase() === typed);
          const addressed = sailorAddress(card?.id ?? "", card?.address ?? "");
          if (result.detail === "pending") {
            if (addressed) queueFriend(addressed, myName(), "request");
            setFriendNote(addressed ? "Friend request sent. They have to accept." : "No wallet in this sea has that name. The request stays in this browser.");
          } else if (result.detail === "accepted") {
            if (addressed) queueFriend(addressed, myName(), "accept");
            setFriendNote("Friend accepted.");
          } else if (result.detail === "already friends") {
            setFriendNote("Already friends.");
          } else {
            setFriendNote(result.detail);
          }
        }}>
          <input value={friendWho} placeholder="Username or address" aria-label="Friend username or address" onChange={(event) => setFriendWho(event.target.value)} />
          <button type="submit" onMouseDown={quietPress}>Add</button>
        </form>
        {friendNote && <p className="note social-wrap" role="status">{friendNote}</p>}
        <div className="friend-body">
          {incoming.length + sent.length + accepted.length === 0 ? <p className="social-empty">No friends yet.</p> : (
            <>
              {incoming.length > 0 && (
                <section className="social-friend-group" aria-label="Incoming requests">
                  <ul className="people friend-list">
                    {incoming.map((link) => {
                      const otherId = link.fromId;
                      return <li key={link.id}>
                        <i aria-hidden="true" className="dot" />
                        <b className="friend-name"><SailorName username={usernameOf(otherId)} country={countryOf(otherId)} /></b>
                        <span className="friend-actions">
                          <button type="button" onMouseDown={quietPress} onClick={() => respondFriend(otherId, "accept")}>Accept<span className="sr-only"> {usernameOf(otherId)}</span></button>
                          <button type="button" onMouseDown={quietPress} onClick={() => respondFriend(otherId, "decline")}>Decline<span className="sr-only"> {usernameOf(otherId)}</span></button>
                        </span>
                      </li>;
                    })}
                  </ul>
                </section>
              )}
              {accepted.length + sent.length > 0 && (
                <ul className="people friend-list" aria-label="Friends">
                  {[...accepted, ...sent].map((link) => {
                    const otherId = link.fromId === PLAYER_ID ? link.toId : link.fromId;
                    const online = game.isOnline(otherId);
                    const friendAddr = sailorAddress(otherId, profileOf(otherId)?.address ?? "");
                    const inParty = friendAddr !== "" && (snap.arcCrew?.members.includes(friendAddr) ?? false);
                    return <li key={link.id}>
                      <i aria-hidden="true" className={online && link.status === "accepted" ? "dot on" : "dot"} />
                      <b className="friend-name"><SailorName username={usernameOf(otherId)} country={countryOf(otherId)} /></b>
                      {link.status === "accepted" && isArcAddress(friendAddr)
                        ? (inParty
                          ? <span className="friend-meta">in party</span>
                          : <button type="button" disabled={wallet.busy} aria-label={`Invite ${usernameOf(otherId)} to party`} onMouseDown={quietPress} onClick={() => inviteFriend(otherId)}>Invite</button>)
                        : <span className="friend-meta">{link.status === "accepted" ? (online ? "online" : "offline") : "sent"}</span>}
                    </li>;
                  })}
                </ul>
              )}
            </>
          )}
          <SocialProfile game={game} snap={snap} />
        </div>
      </div>

      <div id="social-chat" role="region" aria-labelledby="social-chat-toggle" className="social-pane chat-frame" hidden={!open || tab !== "chat"} onFocus={() => setGlass("chat")} onPointerDown={wakeChat}>
        <div className="chat-bar">
          <div className="chat-rooms" role="group" aria-label="Chat channel">
            {(["world", "party", "clan"] as const).map((item) => {
              const unavailable = item === "party" && !party || item === "clan" && !fish?.clanId;
              return <button key={item} type="button" aria-pressed={activeChannel === item} disabled={unavailable} aria-describedby={unavailable ? `social-${item}-unavailable` : undefined} className={activeChannel === item ? "on" : ""} onMouseDown={quietPress} onClick={() => {
                setChannel(item);
                setChatNote(null);
              }}>{item === "world" ? "World" : item === "party" ? "Party" : "Clan"}{roomUnread(item) > 0 && <span className="chat-unread">{roomUnread(item)}<span className="sr-only"> new</span></span>}</button>;
            })}
          </div>
          <details className="chat-here">
            <summary>{presentIds.length} here</summary>
            <ul aria-label="In this room">
              {presentIds.map((id) => <li key={id}><button type="button" onMouseDown={quietPress} onClick={() => mention(id)}><b><SailorName username={usernameOf(id)} country={countryOf(id)} /></b><span>#{dailyTag(id, Date.now())}</span></button></li>)}
            </ul>
          </details>
        </div>
        <p id="social-party-unavailable" className="sr-only">Join a party to use party chat.</p>
        <p id="social-clan-unavailable" className="sr-only">Join a clan to use clan chat.</p>
        <div className="chat-log">
          <ul ref={chatList} className="chat" aria-label={`${activeChannel} messages`} tabIndex={0} onScroll={(event) => {
            const list = event.currentTarget;
            const next = list.scrollHeight - list.scrollTop - list.clientHeight <= 48;
            nearBottom.current = next;
            setAway((value) => value === !next ? value : !next);
          }}>
            <li className="chat-spacer" aria-hidden="true" />
            {lines.length === 0 && <li className="social-empty">Nobody has said anything yet — say hi.</li>}
            {lines.map((line, index) => {
              const sent = new Date(line.at);
              const clock = `${String(sent.getHours()).padStart(2, "0")}:${String(sent.getMinutes()).padStart(2, "0")}`;
              const run = continuesChat(lines[index - 1], line);
              const mine = line.fromId === PLAYER_ID;
              const age = Date.now() - line.at;
              const fresh = age < 2400 && age > -5000;
              return <li key={line.id} className={`${mine ? "social-chat-line is-mine" : "social-chat-line"}${run ? " continues" : " is-head"}${fresh ? " is-fresh" : ""}`}>
                {run
                  ? <span className="sr-only">{clock}</span>
                  : <b className="social-wrap"><SailorName username={usernameOf(line.fromId)} country={countryOf(line.fromId)} /><span className="chat-tag">#{dailyTag(line.fromId, line.at)}</span><span className="chat-time">{clock}</span></b>}
                <span className="social-wrap">{mentionParts(line.text, knownNames).map((part, index) => part.mention ? <mark key={index} className="chat-mention">{part.text}</mark> : <span key={index}>{part.text}</span>)}</span>
              </li>;
            })}
          </ul>
          {away && <button type="button" className="chat-latest" onMouseDown={quietPress} onClick={() => {
            const list = chatList.current;
            if (!list) return;
            list.scrollTop = list.scrollHeight;
            nearBottom.current = true;
            setAway(false);
          }}>Latest</button>}
        </div>
        <form className="chat-compose" onSubmit={(event) => {
          event.preventDefault();
          const now = Date.now();
          const text = draft;
          const result = game.say(activeChannel, text, now);
          if (result.ok) {
            setDraft("");
            if (activeChannel === "world") {
              const place = ip.country?.code || codeForCountry(profileOf(PLAYER_ID)?.country ?? "");
              queueChat(text, place, now, usernameOf(PLAYER_ID));
            }
          }
          setChatNote(result.ok ? null : result.detail);
        }}>
          <input value={draft} maxLength={140} placeholder="Say something" aria-label="Chat message" onChange={(event) => setDraft(event.target.value)} />
          <button type="submit" className="primary" onMouseDown={quietPress}>Send</button>
        </form>
        <p className="note social-wrap" role="status" aria-live="polite">{chatNote}</p>
      </div>
    </aside>
    </>
  );
}
