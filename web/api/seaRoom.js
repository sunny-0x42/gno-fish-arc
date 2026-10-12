/** One sea room. Practice USDC stays in each browser. A stale report cannot heal or revive. */

/** A gno.land account, or an Arc 0x account. Practice USDC still stays in each browser. */
const ADDRESS = /^(?:g1[0-9a-z]{38}|0x[0-9a-f]{40})$/;
const SEEN_MS = 6000;
const CLOSED_MS = 30_000;
const FRIEND_MS = 10 * 60 * 1000;
const CHAT_MS = 10 * 60 * 1000;
const KILL_MS = 3 * 60 * 1000;

export class SeaRoom {
  constructor() {
    this.seats = new Map();
    this.closed = [];
    this.friends = [];
    this.friendSeq = 0;
    this.chats = [];
    this.kills = [];
  }

  exchange(now, me, pose, hits, friends, chats, kills, boot, bye) {
    const self = String(me ?? "").trim().toLowerCase();
    if (!ADDRESS.test(self)) return null;
    const tab = bootId(boot);
    if (pose) this.pose(now, self, pose, tab);
    else this.touchNone(now, self, tab, bye === true);
    for (const note of friends) this.addFriend(now, self, note.to, note.fromName, note.kind);
    for (const line of (Array.isArray(chats) ? chats : []).slice(0, 4)) this.addChat(now, self, line);
    for (const kill of (Array.isArray(kills) ? kills : []).slice(0, 2)) this.addKill(now, self, kill);
    this.sweep(now);
    for (const hit of hits) this.hit(hit);
    return {
      seats: [...this.seats.values()].map(publicSeat),
      friends: this.friends.filter((note) => note.to === self && now - note.at < FRIEND_MS),
      chats: this.chats.map(publicChat),
      kills: this.kills.map(publicKill),
    };
  }

  toJSON() {
    return {
      seats: [...this.seats.values()].map((seat) => ({ ...publicSeat(seat), seen: seat.seen, boot: seat.boot || "" })),
      closed: this.closed.map((item) => ({ ...item })),
      friends: this.friends.map((note) => ({ ...note })),
      friendSeq: this.friendSeq,
      chats: this.chats.map((line) => ({ ...line })),
      kills: this.kills.map((kill) => ({ ...kill })),
    };
  }

  static fromJSON(raw) {
    const room = new SeaRoom();
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        return room;
      }
    }
    if (!raw || typeof raw !== "object") return room;
    const seats = Array.isArray(raw.seats) ? raw.seats : [];
    for (const seat of seats) {
      if (!seat || typeof seat !== "object") continue;
      const address = String(seat.address ?? "").trim().toLowerCase();
      if (!ADDRESS.test(address)) continue;
      const clean = cleanPose(address, seat);
      const seen = typeof seat.seen === "number" && Number.isFinite(seat.seen) ? seat.seen : 0;
      room.seats.set(address, { ...clean, seen, boot: bootId(seat.boot) });
    }
    const closed = Array.isArray(raw.closed) ? raw.closed : [];
    for (const item of closed) {
      if (!item || typeof item !== "object") continue;
      const address = String(item.address ?? "").trim().toLowerCase();
      const boot = bootId(item.boot);
      const at = typeof item.at === "number" && Number.isFinite(item.at) ? item.at : 0;
      if (!ADDRESS.test(address) || !boot) continue;
      room.closed.push({ address, boot, at });
    }
    const notes = Array.isArray(raw.friends) ? raw.friends : [];
    let seq = Number.isInteger(raw.friendSeq) && raw.friendSeq > 0 ? raw.friendSeq : 0;
    for (const note of notes) {
      if (!note || typeof note !== "object") continue;
      const from = String(note.from ?? "").trim().toLowerCase();
      const to = String(note.to ?? "").trim().toLowerCase();
      if (!ADDRESS.test(from) || !ADDRESS.test(to) || from === to) continue;
      const at = typeof note.at === "number" && Number.isFinite(note.at) ? note.at : 0;
      const idNum = Number(String(note.id ?? "").replace(/\D/g, ""));
      if (Number.isInteger(idNum) && idNum > seq) seq = idNum;
      room.friends.push({
        id: `f-${Number.isInteger(idNum) && idNum > 0 ? idNum : seq}`,
        from,
        fromName: clip(note.fromName, 16) || "sailor",
        to,
        at,
        kind: friendKind(note.kind),
      });
    }
    room.friendSeq = seq;
    const chats = Array.isArray(raw.chats) ? raw.chats : [];
    for (const line of chats) room.addChat(line?.at ?? 0, line?.from, line);
    const kills = Array.isArray(raw.kills) ? raw.kills : [];
    for (const kill of kills) room.addKill(kill?.at ?? 0, kill?.from, kill);
    return room;
  }

  /** A bite changes hp only. It does not count as the sailor still being here. */
  hit(hit) {
    const address = String(hit?.address ?? "").trim().toLowerCase();
    const seat = this.seats.get(address);
    if (!seat) return;
    const next = clamp(hit.hp, 0, Math.max(1, seat.hpMax));
    const dying = hit.alive !== true || next <= 0;
    if (dying) {
      const hp = Math.min(seat.hp, next);
      if (!seat.alive && hp === seat.hp) return;
      seat.hp = hp;
      seat.alive = false;
      seat.seq += 1;
      return;
    }
    if (next > seat.hp || !seat.alive || next === seat.hp) return;
    seat.hp = next;
    seat.alive = true;
    seat.seq += 1;
  }

  pose(now, self, pose, boot) {
    if (boot && this.closed.some((item) => item.address === self && item.boot === boot && now - item.at < CLOSED_MS)) return;
    if (boot) this.closed = this.closed.filter((item) => !(item.address === self && item.boot === boot));
    const clean = cleanPose(self, pose);
    const prev = this.seats.get(self);
    if (prev && clean.seq < prev.seq) {
      clean.hp = prev.hp;
      clean.alive = prev.alive;
      clean.seq = prev.seq;
    }
    if (prev && !prev.alive) {
      clean.alive = false;
      clean.hp = Math.min(clean.hp, prev.hp);
      if (clean.seq < prev.seq) clean.seq = prev.seq;
    }
    this.seats.set(self, { ...clean, seen: now, boot: boot || "" });
  }

  /** Drop this tab's seat. `bye` rejects a late pose from the same tab after the browser closes. */
  touchNone(now, self, boot, bye) {
    if (bye && boot) this.noteClosed(self, boot, now);
    const seat = this.seats.get(self);
    if (!seat) return;
    if (boot && seat.boot && seat.boot !== boot) return;
    this.seats.delete(self);
  }

  noteClosed(self, boot, now) {
    const prior = this.closed.find((item) => item.address === self && item.boot === boot);
    if (prior) prior.at = now;
    else this.closed.push({ address: self, boot, at: now });
  }

  addFriend(now, from, toRaw, fromName, kindRaw) {
    const to = String(toRaw ?? "").trim().toLowerCase();
    if (!ADDRESS.test(to) || to === from) return;
    const kind = friendKind(kindRaw);
    const name = clip(fromName, 16) || "sailor";
    if (kind === "accept" || kind === "decline") {
      this.friends = this.friends.filter((note) => !(note.kind === "request" && note.from === to && note.to === from));
    }
    const recent = this.friends.some((note) => note.from === from && note.to === to && note.kind === kind && now - note.at < 30_000);
    if (recent) return;
    this.friendSeq += 1;
    this.friends.push({ id: `f-${this.friendSeq}`, from, fromName: name, to, at: now, kind });
  }

  addChat(now, fromRaw, line) {
    const from = String(fromRaw ?? line?.from ?? "").trim().toLowerCase();
    if (!ADDRESS.test(from) || !line || typeof line !== "object") return;
    const id = clip(line.id, 24).toLowerCase();
    if (!/^c[a-z0-9]{4,20}$/.test(id)) return;
    if (this.chats.some((item) => item.id === id)) return;
    const text = clip(line.text, 140);
    if (!text) return;
    const seat = this.seats.get(from);
    const at = typeof line.at === "number" && Number.isFinite(line.at) ? Math.trunc(line.at) : now;
    this.chats.push({
      id,
      from,
      fromName: clip(seat?.sailor, 16) || clip(line.fromName, 16) || "sailor",
      country: countryCode(seat?.country) || countryCode(line.country),
      text,
      at,
    });
    if (this.chats.length > 24) this.chats.splice(0, this.chats.length - 24);
  }

  addKill(now, fromRaw, kill) {
    const from = String(fromRaw ?? kill?.from ?? "").trim().toLowerCase();
    if (!ADDRESS.test(from) || !kill || typeof kill !== "object") return;
    const id = clip(kill.id, 24).toLowerCase();
    if (!/^k[a-z0-9]{4,20}$/.test(id)) return;
    if (this.kills.some((item) => item.id === id)) return;
    const seat = this.seats.get(from);
    const victimAddress = String(kill.victimAddress ?? "").trim().toLowerCase();
    const victimSeat = ADDRESS.test(victimAddress) ? this.seats.get(victimAddress) : undefined;
    const at = typeof kill.at === "number" && Number.isFinite(kill.at) ? Math.trunc(kill.at) : now;
    this.kills.push({
      id,
      from,
      at,
      attacker: seatLabel(seat, kill.attacker),
      attackerCountry: countryCode(seat?.country) || countryCode(kill.attackerCountry),
      victim: seatLabel(victimSeat, kill.victim),
      victimCountry: countryCode(victimSeat?.country) || countryCode(kill.victimCountry),
      gnot: whole(kill.gnot, 0, 1e16),
      fish: whole(kill.fish, 0, 1e15),
    });
    if (this.kills.length > 12) this.kills.splice(0, this.kills.length - 12);
  }

  sweep(now) {
    for (const [address, seat] of this.seats) {
      if (now - seat.seen > SEEN_MS) this.seats.delete(address);
    }
    this.closed = this.closed.filter((item) => now - item.at < CLOSED_MS);
    this.friends = this.friends.filter((note) => now - note.at < FRIEND_MS);
    this.chats = this.chats.filter((line) => now - line.at < CHAT_MS);
    this.kills = this.kills.filter((kill) => now - kill.at < KILL_MS);
  }
}

function publicSeat(seat) {
  return {
    address: seat.address,
    onyxId: seat.onyxId,
    name: seat.name,
    sailor: seat.sailor,
    country: seat.country,
    rarity: seat.rarity,
    size: seat.size,
    trait: seat.trait,
    x: seat.x,
    z: seat.z,
    fx: seat.fx,
    fz: seat.fz,
    hp: seat.hp,
    hpMax: seat.hpMax,
    bite: seat.bite,
    alive: seat.alive,
    seq: seat.seq,
  };
}

function publicChat(line) {
  return {
    id: line.id,
    from: line.from,
    fromName: line.fromName,
    country: line.country,
    text: line.text,
    at: line.at,
  };
}

function publicKill(kill) {
  return {
    id: kill.id,
    attacker: kill.attacker,
    attackerCountry: kill.attackerCountry,
    victim: kill.victim,
    victimCountry: kill.victimCountry,
    gnot: kill.gnot,
    fish: kill.fish,
    at: kill.at,
  };
}

function cleanPose(self, pose) {
  const hpMax = clamp(pose.hpMax, 1, 100_000);
  return {
    address: self,
    onyxId: Number.isInteger(pose.onyxId) && pose.onyxId > 0 ? pose.onyxId : 0,
    name: clip(pose.name, 20) || "Fish",
    sailor: clip(pose.sailor, 16),
    country: countryCode(pose.country),
    rarity: clip(pose.rarity, 16) || "common",
    size: clip(pose.size, 16) || "medium",
    trait: clip(pose.trait, 16) || "fang",
    x: clamp(pose.x, -400, 400),
    z: clamp(pose.z, -400, 400),
    fx: clamp(pose.fx, -1, 1),
    fz: clamp(pose.fz, -1, 1),
    hp: clamp(pose.hp, 0, hpMax),
    hpMax,
    bite: clamp(pose.bite, 1, 10_000),
    alive: pose.alive !== false && pose.hp > 0,
    seq: Number.isInteger(pose.seq) && pose.seq > 0 ? pose.seq : 0,
  };
}

function seatLabel(seat, fallback) {
  if (!seat) return clip(fallback, 16) || "sailor";
  return clip(seat.sailor, 16) || clip(seat.name, 16) || clip(fallback, 16) || "sailor";
}

function bootId(value) {
  const boot = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9]{8}$/.test(boot) ? boot : "";
}

function friendKind(value) {
  if (value === "accept" || value === "decline" || value === "party" || value === "joined") return value;
  return "request";
}

function countryCode(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function clamp(value, min, max) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, n));
}

function whole(value, min, max) {
  return Math.trunc(clamp(value, min, max));
}

function clip(value, max) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, max);
}
