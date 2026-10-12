import {
  GENESIS_FISH,
  GENESIS_GNOT,
  HEALS_PER_DAY,
  MIN_CHEER_FISH,
  MIN_CHEER_GNOT,
  UGNOT,
  isRarity,
  nextRarity,
  PLAYER_START_GNOT,
  RIVAL_PLAN,
  rivalClanId,
  SPECIES,
  VIEWER_START_FISH,
  VIEWER_START_GNOT,
  type Rarity,
  type Species,
} from "./catalog";
import {
  escapePoint,
  ROCKS,
  SHELTER_HP,
  SHELTER_REBUILD_MS,
  SHELTERS,
  shelterAdmits,
  springSlot,
  SPRING_HEAL_PERCENT,
  SPRING_RADIUS,
  type BlockDisc,
  type ShelterLayout,
} from "./cover";
import { acceptCountry, codeForCountry, countryFromCode } from "./country";
import { formatFish, formatGnot } from "./format";
import {
  cleanUsername,
  isCrest,
  practiceAddress,
  type ChatChannel,
  type ChatLine,
  type CrestId,
  type FriendLink,
  type PartyInvite,
  type Profile,
  type SavedFriend,
} from "./social";
import type { SeaHit, SeaKill, SeaKillIn, SeaPose } from "../chain/seaRoom";
import {
  clampToSector,
  facingFromForward,
  BURST_COOLDOWN_MS,
  BURST_MS,
  moveDelayMs,
  sectorCenter,
  sectorInSea,
  sectorOf,
  sharePool,
  type Sector,
} from "./rules";
import {
  biteRadius,
  biteReach,
  coveredStake,
  cheerValueUgnot,
  COMBAT_LOCK_MS,
  DEATH_HP_PERCENT,
  aspectFor,
  finalStats,
  growthGain,
  grownSize,
  HEAL_COOLDOWN_MS,
  HEAL_HP_PERCENT,
  healSkipUgnot,
  ictDayIndex,
  isSize,
  isTrait,
  killHealGain,
  mouthBite,
  MIN_ENTER_HP_PERCENT,
  LAY_FEE_UGNOT,
  LAY_SETTLE_MS,
  layMatchesLeft,
  layShortDetail,
  MINT_FEE_UGNOT,
  buybackAtTwap,
  percentOf,
  roundStat,
  splitFailFee,
  splitKill,
  splitMint,
  STAKE_BAND,
  stakeFitsSea,
  strikeDamage,
  upgradeTo,
  VIEWER_WATCH_MS,
  partyFishBonusFish,
  splitPartyBonus,
  winFishReward,
  worldUnitsPerSecond,
  type KillSplit,
  type Size,
  type Trait,
} from "./tokenomics";

/** One shoal/fish row. The live sea copies these fields and does not invent a rival. */
export type ChainFishRow = {
  onyxId: number;
  owner: string;
  name: string;
  rarity: Rarity;
  size: Size;
  trait: Trait;
  poolUgnot: number;
  inMatch: boolean;
  bouts: number;
  /** TokenURI image. Empty when the realm has no https portrait on this id. */
  image: string;
  /** True when this id is a Shoal collection token and not a FishDuel seat. */
  collectionOnly?: boolean;
};

export const PLAYER_ID = "player";
/** One shared practice sea. It does not end on a clock. */
export const SEA_ID = "sea";
export const VIEWER_ID = "viewer";
const TRAIT_ORDER: Trait[] = ["swift", "fang", "hide"];

export type Asset = "gnot" | "fish";
export type ClaimKind = "cheer" | "watch";

export type Group = {
  id: string;
  name: string;
  founderId: string;
  crest: CrestId;
  country: string;
};

export type { ChatLine, FriendLink, PartyInvite, Profile };

export type FishNft = {
  id: string;
  ownerId: string;
  name: string;
  rarity: Rarity;
  species: string;
  size: Size;
  trait: Trait;
  hpMax: number;
  hp: number;
  bite: number;
  speed: number;
  /** Spec range before the practice world scale. */
  range: number;
  /** World units removed from an incoming bite radius. Large stays at 0. */
  dodge: number;
  /** Meals this body has finished. Stays after a leave or a down. */
  growth: number;
  /** Practice shape only. The NFT rarity does not change. */
  evolved: boolean;
  /** Next species mesh. Null until a large fish evolves once. */
  aspect: Rarity | null;
  /** Finished swims. A leave does not add one. A kill or a down counts once per swim. */
  bouts: number;
  /** Swim id already counted in bouts, so one swim counts once. */
  boutMatchId: string | null;
  /** Bouts already spent on lays. The next lay needs three bouts past this mark. */
  layBoutsUsed: number;
  /** Practice time when CommitLay locked this fish. Null when no lay is open. */
  layCommitAt: number | null;
  /** Mint principal. Stays 0. The mint fee is split, not locked on the NFT. */
  bodyUgnot: number;
  /** Stake locked on the sea. This is Pool X while the fish is swimming. */
  poolUgnot: number;
  alive: boolean;
  burned: boolean;
  ai: boolean;
  /** Set by a killing blow. The next swim waits for a heal. */
  mustHeal: boolean;
  downedAt: number;
  respawnAt: number;
  freeReviveDay: number;
  healDay: number;
  healsUsed: number;
  healReadyAt: number;
  partyId: string | null;
  clanId: string | null;
  nextBiteAt: number;
  burstUntil: number;
  nextBurstAt: number;
  streak: number;
  matchId: string | null;
  /** This swim's bout key. A new entry gets a new id. The sea id stays `sea`. */
  swimId: string | null;
  lastCombatAt: number;
  /** The fish that last bit this one. Retaliation against that fish waits until bittenByUntil. */
  bittenById: string | null;
  bittenByUntil: number;
  /** shoal/fish token id. Missing until TokensOf confirms the mint. */
  onyxId?: number;
  /** Shoal collection token. The 1 USDC FishDuel stake does not use this id. */
  collectionOnly?: boolean;
  /** shoal/fish TokenURI image. Empty for a practice fish or a token with no https art. */
  image?: string;
  /** True after Onyx Register until Onyx Leave. */
  onyxSwim?: boolean;
  /** Pool USDC came from the Arc stake, so leaving does not pay the practice purse. */
  chainPool?: boolean;
  /** Another browser's fish. This client does not steer it. */
  remote?: boolean;
  /** Wallet that published this body on the shared sea. */
  remoteAddress?: string;
  /** Server bite counter. A pose with a lower seq cannot raise HP. */
  roomSeq?: number;
  /** Continuous heading. yaw 0 faces -Z, matching yawFromDirection. */
  yaw?: number;
  sx: number;
  sz: number;
  x: number;
  z: number;
  faceDx: number;
  faceDz: number;
  nextMoveAt: number;
  placed: boolean;
};

export type MatchStatus = "waiting" | "live" | "ended";

export type Match = {
  id: string;
  startAt: number;
  endAt: number;
  status: MatchStatus;
  fishIds: string[];
};

export type Cheer = {
  id: string;
  viewerId: string;
  fishId: string;
  matchId: string;
  asset: Asset;
  amount: number;
  until: number;
  returned: boolean;
  /** USDC value locked when the cheer is deposited. */
  valueGnotAtLock: number;
};

export type Claim = {
  id: string;
  viewerId: string;
  gnot: number;
  fish: number;
  killerId: string;
  kind: ClaimKind;
  claimed: boolean;
  expiresAt: number;
  killAt: number;
  killId: string;
  killerOwnerId: string;
  victimOwnerId: string;
};

export type Wallet = { gnot: number; fish: number };

export type Books = {
  liquidityGnot: number;
  liquidityFish: number;
  devGnot: number;
  devFish: number;
  upgradeTreasuryGnot: number;
  seasonTreasuryGnot: number;
  burnGnot: number;
  /** FISH moved out of the reserve by a buyback or an upgrade. It stays inside the supply. */
  burnFish: number;
  reserveGnot: number;
  reserveFish: number;
};

export type LogLine = {
  id: string;
  text: string;
  at: number;
  attackerId?: string;
  victimId?: string;
};

export type ActionResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string };

export type KillReport = {
  killerId: string;
  victimId: string;
  victimName: string;
  gnot: KillSplit;
  fishReward: number;
  buybackFish: number;
};

/** Lifetime bites that downed a fish, and times this fish was downed. Practice display only. */
export type ScoreLine = { kills: number; downs: number };

export type SeaFxKind = "kill" | "gnot" | "grow" | "evolve" | "heal" | "collapse";

export type SeaFx = {
  id: string;
  kind: SeaFxKind;
  x: number;
  z: number;
  text: string;
  at: number;
};

export type ShelterState = ShelterLayout & {
  hp: number;
  hpMax: number;
  /** Standing again at this time. 0 while the shelter is up. */
  downUntil: number;
};

export type HealView = {
  healsLeft: number;
  readyIn: number;
  rushUgnot: number;
};

export type ReviveView = {
  downed: boolean;
  readyIn: number;
  freeReady: boolean;
  freeUsed: boolean;
  paidUgnot: number;
};

function wallet(): Wallet {
  return { gnot: 0, fish: 0 };
}

/** Practice machine fish. Sectors sit around the swimmer's home at (0, 1). */
const RIVAL_SECTORS: Sector[] = [
  { sx: 2, sz: 1 },
  { sx: -2, sz: 1 },
  { sx: 1, sz: 3 },
  { sx: -1, sz: -1 },
  { sx: 0, sz: 3 },
  { sx: 3, sz: 2 },
  { sx: -3, sz: 0 },
  { sx: 2, sz: -1 },
  { sx: 1, sz: 1 },
  { sx: -1, sz: 1 },
  { sx: 1, sz: 0 },
  { sx: 0, sz: 2 },
  { sx: -1, sz: 2 },
  { sx: 1, sz: 2 },
];

export class ShoalGame {
  readonly fish: FishNft[] = [];
  readonly cheers: Cheer[] = [];
  readonly claims: Claim[] = [];
  readonly purses = new Map<string, Wallet>();
  readonly parties = new Map<string, Group>();
  readonly clans = new Map<string, Group>();
  readonly profiles: Profile[] = [];
  readonly friends: FriendLink[] = [];
  readonly invites: PartyInvite[] = [];
  readonly chats: ChatLine[] = [];
  readonly watching = new Set<string>();
  readonly books: Books = {
    liquidityGnot: 0,
    liquidityFish: 0,
    devGnot: 0,
    devFish: 0,
    upgradeTreasuryGnot: 0,
    seasonTreasuryGnot: 0,
    burnGnot: 0,
    burnFish: 0,
    reserveGnot: GENESIS_GNOT,
    reserveFish: GENESIS_FISH,
  };
  readonly matches: Match[] = [];
  readonly log: LogLine[] = [];
  readonly fx: SeaFx[] = [];
  /** Kills and downs. A miss, a leave, and a non-killing bite do not write a row. */
  readonly scores = new Map<string, ScoreLine>();
  readonly shelters: ShelterState[] = SHELTERS.map((shelter) => ({
    ...shelter,
    hp: SHELTER_HP,
    hpMax: SHELTER_HP,
    downUntil: 0,
  }));
  private springTouch = new Set<string>();
  activeFishId: string | null = null;
  viewMatchId: string | null = null;
  /** True after `/api/sea` answers. The static site leaves this false. */
  sharedSea = false;
  /** ISO code from this browser's network address. Empty until the lookup returns. */
  private sailCountry = "";
  private roomHits: SeaHit[] = [];
  private roomKills: SeaKillIn[] = [];
  /** Kill lines this browser credited. Wall-clock `at`, so a frozen match clock does not hide them. */
  private killLines: SeaKill[] = [];
  private seq = 1;
  private entropy = 0x5e0a;
  private watchSince = new Map<string, number>();
  private listeners = new Set<() => void>();
  /** Signer whose shoal/fish rows are already mirrored. A second sync does not double-charge. */
  private rosterSigner: string | null = null;
  /** Arc FishParty crew. Members of this set do not bite each other. */
  private arcCrew = new Set<string>();
  /** Wallet whose friend list was loaded from this browser. A second load does not duplicate it. */
  private friendBook: string | null = null;
  /** Party invite heard from the sea room. Cleared once this wallet sits in a crew. */
  private partyPing: { from: string; name: string } | null = null;
  private arcCrewId: string | null = null;
  private arcCrewSigner = "";

  constructor(now: number) {
    this.purses.set(PLAYER_ID, wallet());
    this.purses.set(VIEWER_ID, wallet());
    this.clans.set("reef", { id: "reef", name: "Reef", founderId: "sea", crest: "reef", country: "Sea" });
    this.clans.set("abyss", { id: "abyss", name: "Abyss", founderId: "sea", crest: "fang", country: "Sea" });
    this.moveReserveToPurse(PLAYER_ID, "gnot", PLAYER_START_GNOT);
    this.moveReserveToPurse(VIEWER_ID, "gnot", VIEWER_START_GNOT);
    this.moveReserveToPurse(VIEWER_ID, "fish", VIEWER_START_FISH);
    this.matches.push({
      id: SEA_ID,
      startAt: now,
      endAt: 0,
      status: "live",
      fishIds: [],
    });
    this.viewMatchId = SEA_ID;
    this.seedSocial();
  }

  /**
   * Practice machine fish for the sim tests. The Arc sea does not call this.
   * A connected wallet swims only with other Arc wallets. A later call does
   * nothing while any ai fish exists. Stakes come out of the reserve.
   */
  seedPracticeCast(now: number): void {
    if (this.fish.some((fish) => fish.ai)) return;
    for (let i = 0; i < RIVAL_PLAN.length; i++) {
      const plan = RIVAL_PLAN[i];
      const clanId = rivalClanId(i);
      const minted = this.spawnRival(plan, now, clanId);
      if (!minted) throw new Error(`genesis could not fund ${plan.name}`);
    }
    for (const rival of this.fish) {
      if (!rival.ai || rival.burned || !rival.alive) continue;
      this.seat(rival);
    }
    this.seedCastSocial(now);
  }

  /**
   * Mirror shoal/fish rows into this browser. Stake comes out of the practice reserve.
   * A repeat id does not pay again. Chain fish are not marked ai, so this client does not steer them.
   */
  syncChainRoster(signer: string, rows: readonly ChainFishRow[], now: number): { added: number; seated: number; skipped: number } {
    const signerKey = signer.trim().toLowerCase();
    if (!seaWallet(signerKey)) return { added: 0, seated: 0, skipped: rows.length };
    if (this.rosterSigner && this.rosterSigner !== signerKey) this.releaseChainFish();
    this.rosterSigner = signerKey;
    const profile = this.profiles.find((item) => item.id === PLAYER_ID);
    if (profile) profile.address = signerKey;
    let added = 0;
    let skipped = 0;
    let painted = false;
    for (const row of rows) {
      const result = this.adoptChainFish(row, signerKey, now);
      if (result === "added") added += 1;
      else if (result === "skip") skipped += 1;
      else if (result === "paint") painted = true;
    }
    const stamped = this.stampArcCrew();
    if (added > 0 || painted || stamped) this.emit();
    const seated = this.fish.filter((fish) => fish.alive && !fish.burned && fish.matchId === SEA_ID).length;
    return { added, seated, skipped };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  purse(id: string): Wallet {
    return this.purses.get(id) ?? wallet();
  }

  fishById(id: string): FishNft | undefined {
    return this.fish.find((f) => f.id === id);
  }

  living(): FishNft[] {
    return this.fish.filter((f) => f.alive && !f.burned);
  }

  /** NFTs the owner still has, including a downed fish. Burned food is gone. */
  owned(ownerId: string): FishNft[] {
    return this.fish.filter((f) => !f.burned && f.ownerId === ownerId);
  }

  allied(a: FishNft, b: FishNft): boolean {
    if (a.id === b.id) return false;
    if (a.partyId && a.partyId === b.partyId) return true;
    if (a.clanId && a.clanId === b.clanId) return true;
    if (this.arcCrew.size < 2) return false;
    const left = this.walletOf(a);
    const right = this.walletOf(b);
    return Boolean(left && right && left !== right && this.arcCrew.has(left) && this.arcCrew.has(right));
  }

  /** FishParty crew for the connected wallet. Passing an empty crew clears it. */
  seatArcCrew(signer: string, crewId: number, name: string, members: readonly string[]): void {
    const me = signer.trim().toLowerCase();
    const seats = [...new Set(members.map((item) => item.trim().toLowerCase()).filter((item) => /^0x[0-9a-f]{40}$/.test(item)))];
    if (!Number.isInteger(crewId) || crewId < 1 || !/^0x[0-9a-f]{40}$/.test(me)) {
      this.clearArcCrew();
      return;
    }
    if (!seats.includes(me)) seats.push(me);
    const key = `arc-${crewId}`;
    const clean = cleanName(name) ?? `Party ${crewId}`;
    const same = this.arcCrewId === key
      && this.arcCrewSigner === me
      && this.parties.get(key)?.name === clean
      && this.arcCrew.size === seats.length
      && seats.every((item) => this.arcCrew.has(item));
    const group = this.parties.get(key);
    if (group) group.name = clean;
    else this.parties.set(key, { id: key, name: clean, founderId: PLAYER_ID, crest: "wave", country: "Sea" });
    this.arcCrewId = key;
    this.arcCrewSigner = me;
    this.arcCrew = new Set(seats);
    const stamped = this.stampArcCrew();
    const hadPing = this.partyPing !== null;
    this.partyPing = null;
    if (!same || stamped || hadPing) this.emit();
  }

  clearArcCrew(): void {
    if (!this.arcCrewId && this.arcCrew.size === 0) return;
    const key = this.arcCrewId;
    this.arcCrew.clear();
    this.arcCrewId = null;
    this.arcCrewSigner = "";
    if (key) {
      this.parties.delete(key);
      for (const fish of this.fish) if (fish.partyId === key) fish.partyId = null;
    }
    this.emit();
  }

  arcCrewView(): { id: number; name: string; members: string[] } | null {
    if (!this.arcCrewId) return null;
    const id = Number(this.arcCrewId.slice(4));
    if (!Number.isInteger(id) || id < 1) return null;
    return {
      id,
      name: this.parties.get(this.arcCrewId)?.name ?? `Party ${id}`,
      members: [...this.arcCrew],
    };
  }

  /** The other wallet invited this one. A wallet already in a crew ignores it. */
  notePartyInvite(from: string, name: string): void {
    const id = from.trim().toLowerCase();
    const clean = cleanName(name) ?? "Party";
    if (!seaWallet(id) || this.arcCrewId) return;
    if (this.partyPing?.from === id && this.partyPing.name === clean) return;
    this.partyPing = { from: id, name: clean };
    this.emit();
  }

  clearPartyInvite(): void {
    if (!this.partyPing) return;
    this.partyPing = null;
    this.emit();
  }

  partyInviteView(): { from: string; name: string } | null {
    return this.partyPing ? { from: this.partyPing.from, name: this.partyPing.name } : null;
  }

  supply(): { gnot: number; fish: number } {
    let gnot =
      this.books.liquidityGnot +
      this.books.devGnot +
      this.books.upgradeTreasuryGnot +
      this.books.seasonTreasuryGnot +
      this.books.burnGnot +
      this.books.reserveGnot;
    let fish = this.books.liquidityFish + this.books.devFish + this.books.burnFish + this.books.reserveFish;
    for (const purse of this.purses.values()) {
      gnot += purse.gnot;
      fish += purse.fish;
    }
    for (const nft of this.fish) {
      if (!nft.burned) gnot += nft.bodyUgnot;
      gnot += nft.poolUgnot;
    }
    for (const cheer of this.cheers) {
      if (cheer.returned) continue;
      if (cheer.asset === "gnot") gnot += cheer.amount;
      else fish += cheer.amount;
    }
    for (const claim of this.claims) {
      if (claim.claimed) continue;
      gnot += claim.gnot;
      fish += claim.fish;
    }
    return { gnot, fish };
  }

  /** Practice roll, 0–9999. A realm uses chain entropy instead of this counter. */
  practiceRoll(): number {
    this.entropy = (Math.imul(this.entropy, 1664525) + 1013904223) >>> 0;
    return this.entropy % 10_000;
  }

  mint(size: Size, name: string, now: number, trait?: Trait): ActionResult {
    const spec = SPECIES.common;
    const unplayed = this.owned(PLAYER_ID).find((fish) => fish.bouts < 1);
    if (unplayed) {
      return { ok: false, detail: `Finish a match with ${unplayed.name} before minting another.` };
    }
    const purse = this.purse(PLAYER_ID);
    if (purse.gnot < MINT_FEE_UGNOT) return { ok: false, detail: "Not enough USDC in the practice purse." };
    const rolled = trait ?? TRAIT_ORDER[this.practiceRoll() % TRAIT_ORDER.length];
    purse.gnot -= MINT_FEE_UGNOT;
    const split = splitMint(MINT_FEE_UGNOT);
    this.books.upgradeTreasuryGnot += split.upgradeTreasury;
    this.books.liquidityGnot += split.lp;
    this.books.burnGnot += split.burn;
    this.books.devGnot += split.team;
    const nft = this.makeFish({
      ownerId: PLAYER_ID,
      name: name.trim() || spec.species,
      spec,
      size,
      trait: rolled,
      bodyUgnot: 0,
      poolUgnot: 0,
      ai: false,
      now,
    });
    this.fish.push(nft);
    this.note(now, `Minted ${nft.name} (${nft.size} ${nft.trait}). Stake 1 USDC into the pool to enter the sea.`);
    this.emit();
    return { ok: true, detail: nft.id };
  }

  /** Browser copy after the Arc wallet already paid the mint fee. The practice purse stays put. */
  mintOnChain(size: Size, name: string, now: number, trait: Trait): ActionResult {
    const spec = SPECIES.common;
    const unplayed = this.owned(PLAYER_ID).find((fish) => fish.bouts < 1);
    if (unplayed) {
      return { ok: false, detail: `Finish a match with ${unplayed.name} before minting another.` };
    }
    const nft = this.makeFish({
      ownerId: PLAYER_ID,
      name: name.trim() || spec.species,
      spec,
      size,
      trait,
      bodyUgnot: 0,
      poolUgnot: 0,
      ai: false,
      now,
    });
    this.fish.push(nft);
    this.note(now, `Minted ${nft.name} (${nft.size} ${nft.trait}) from the Arc wallet. Stake 1 USDC into the pool to enter the sea.`);
    this.emit();
    return { ok: true, detail: nft.id };
  }

  /** The sea mesh follows this wallet's collection tier. A new trait retints combat. */
  wearCollection(rarity: string, trait?: string): void {
    if (!isRarity(rarity)) return;
    const rolled = trait && isTrait(trait) ? trait : undefined;
    let changed = false;
    for (const fish of this.owned(PLAYER_ID)) {
      if (fish.ai || fish.burned) continue;
      if (this.paintSpecies(fish, rarity, rolled)) changed = true;
    }
    if (changed) this.emit();
  }

  /** Remember a shoal/fish id. Practice fish and AI rivals are ignored. */
  attachOnyx(id: string, onyxId: number): void {
    const fish = this.fishById(id);
    if (!fish || fish.ai || !Number.isInteger(onyxId) || onyxId < 1) return;
    fish.onyxId = onyxId;
    this.emit();
  }

  /** The pool stake uses this FishDuel id. The collection token stays in the wallet. */
  bindDuelSeat(id: string, duelId: number): void {
    const fish = this.fishById(id);
    if (!fish || fish.ai || !Number.isInteger(duelId) || duelId < 1) return;
    fish.onyxId = duelId;
    fish.collectionOnly = false;
    this.emit();
  }

  /** Tracks whether this fish still holds a stake inside the Onyx sea. */
  setOnyxSwim(id: string, swimming: boolean): void {
    const fish = this.fishById(id);
    if (!fish || fish.ai) return;
    fish.onyxSwim = swimming;
    this.emit();
  }

  upgrade(targetId: string, foodId: string, now: number, rollBps?: number): ActionResult {
    const target = this.fishById(targetId);
    const food = this.fishById(foodId);
    if (!target || !food || target.burned || food.burned || !target.alive || !food.alive) {
      return { ok: false, detail: "Both fish have to be alive." };
    }
    if (target.id === food.id) return { ok: false, detail: "Pick a second fish." };
    if (target.ownerId !== PLAYER_ID || food.ownerId !== PLAYER_ID || target.ai || food.ai) {
      return { ok: false, detail: "You can upgrade only fish you own." };
    }
    if (target.matchId || food.matchId) return { ok: false, detail: "A fish in a match cannot upgrade." };
    if (target.rarity !== food.rarity || target.size !== food.size || target.trait !== food.trait) {
      return { ok: false, detail: "The two fish need the same tier, size, and trait." };
    }
    if (target.bouts < 1 || food.bouts < 1) {
      return { ok: false, detail: "Both fish have to finish a match before an upgrade." };
    }
    if (target.layCommitAt !== null || food.layCommitAt !== null) {
      return { ok: false, detail: "Settle the lay before an upgrade." };
    }
    const next = nextRarity(target.rarity);
    if (!next) return { ok: false, detail: "Mythic does not step up." };
    const offer = upgradeTo(next);
    if (!offer) return { ok: false, detail: "Mythic does not step up." };
    const purse = this.purse(PLAYER_ID);
    if (purse.fish < offer.fee) return { ok: false, detail: "Not enough FISH for the upgrade fee." };
    purse.fish -= offer.fee;
    const roll = rollBps ?? this.practiceRoll();
    const success = roll < offer.successBps;
    this.returnPool(target);
    this.returnPool(food);
    this.burnFish(target);
    this.burnFish(food);
    if (!success) {
      const fail = splitFailFee(offer.fee);
      this.books.burnFish += fail.burn;
      this.creditPurse(PLAYER_ID, "fish", fail.refund);
      this.note(now, `Upgrade failed. ${food.name} and ${target.name} burned. ${formatFish(fail.refund)} FISH returned.`);
      this.emit();
      return { ok: true, detail: "failed" };
    }
    this.books.burnFish += offer.fee;
    const nft = this.makeFish({
      ownerId: PLAYER_ID,
      name: target.name,
      spec: SPECIES[next],
      size: target.size,
      trait: target.trait,
      bodyUgnot: 0,
      poolUgnot: 0,
      ai: false,
      now,
    });
    this.fish.push(nft);
    this.note(now, `${nft.name} is now ${nft.species}. ${food.name} and the old body burned. ${formatFish(offer.fee)} FISH burned.`);
    this.emit();
    return { ok: true, detail: nft.id };
  }

  /**
   * Lock a lay. The caller does not send a trait or a seed.
   * The practice roll waits for settleLay and is not chain entropy.
   */
  commitLay(fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const fish = owned.fish;
    if (!fish.alive) return { ok: false, detail: "That fish is gone." };
    if (fish.layCommitAt !== null) return { ok: false, detail: "That lay is already locked." };
    if (fish.matchId) return { ok: false, detail: "A fish in a match cannot lay." };
    const left = layMatchesLeft(fish.bouts, fish.layBoutsUsed);
    if (left > 0) return { ok: false, detail: layShortDetail(fish.name, left) };
    const purse = this.purse(PLAYER_ID);
    if (purse.gnot < LAY_FEE_UGNOT) return { ok: false, detail: "Not enough USDC in the practice purse." };
    purse.gnot -= LAY_FEE_UGNOT;
    const split = splitMint(LAY_FEE_UGNOT);
    this.books.upgradeTreasuryGnot += split.upgradeTreasury;
    this.books.liquidityGnot += split.lp;
    this.books.burnGnot += split.burn;
    this.books.devGnot += split.team;
    fish.layBoutsUsed = fish.bouts;
    fish.layCommitAt = now;
    this.note(now, `${fish.name} lay is locked. Settle after the practice wait. This roll is not chain entropy.`);
    this.emit();
    return { ok: true, detail: "locked" };
  }

  /** Anyone may settle. The trait comes from practiceRoll at this call, not from the owner. */
  settleLay(fishId: string, now: number): ActionResult {
    const fish = this.fishById(fishId);
    if (!fish || fish.burned || !fish.alive) return { ok: false, detail: "That fish is gone." };
    if (fish.layCommitAt === null) return { ok: false, detail: "That fish has no lay to settle." };
    if (now < fish.layCommitAt + LAY_SETTLE_MS) {
      return { ok: false, detail: "Settle opens after the practice wait." };
    }
    const trait = TRAIT_ORDER[this.practiceRoll() % TRAIT_ORDER.length];
    fish.layCommitAt = null;
    const child = this.makeFish({
      ownerId: fish.ownerId,
      name: `${fish.name} fry`,
      spec: SPECIES[fish.rarity],
      size: fish.size,
      trait,
      bodyUgnot: 0,
      poolUgnot: 0,
      ai: false,
      now,
    });
    this.fish.push(child);
    this.note(now, `${child.name} hatched ${child.size} ${child.trait}. Practice roll. Not chain entropy.`);
    this.emit();
    return { ok: true, detail: child.id };
  }

  heal(fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const fish = owned.fish;
    if (!fish.alive) return { ok: false, detail: "That fish is gone." };
    if (this.matchById(fish.matchId)?.status === "live" || this.matchById(fish.matchId)?.status === "waiting") {
      return { ok: false, detail: "Heal outside a match." };
    }
    this.rollHealDay(fish, now);
    if (fish.hp >= fish.hpMax && !fish.mustHeal) return { ok: false, detail: "HP is already full." };
    if (fish.healsUsed >= HEALS_PER_DAY) return { ok: false, detail: "No free heal left today." };
    if (now < fish.healReadyAt) return { ok: false, detail: "Heal is still cooling down." };
    fish.healsUsed += 1;
    if (fish.healsUsed >= HEALS_PER_DAY) fish.healReadyAt = now + HEAL_COOLDOWN_MS;
    fish.hp = Math.min(fish.hpMax, fish.hp + percentOf(fish.hpMax, HEAL_HP_PERCENT));
    fish.mustHeal = false;
    this.note(now, `${fish.name} healed. ${Math.max(0, HEALS_PER_DAY - fish.healsUsed)} free heal left today.`);
    this.emit();
    return { ok: true, detail: "healed" };
  }

  /** Burn USDC to clear the remaining 8 hour heal cooldown. */
  rushHeal(fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const fish = owned.fish;
    this.rollHealDay(fish, now);
    if (now >= fish.healReadyAt || fish.healsUsed < HEALS_PER_DAY) {
      return { ok: false, detail: "Heal is already ready." };
    }
    const cost = healSkipUgnot(SPECIES[fish.rarity].tierId, fish.healReadyAt - now);
    const purse = this.purse(PLAYER_ID);
    if (purse.gnot < cost) return { ok: false, detail: "Not enough USDC to shorten the heal." };
    purse.gnot -= cost;
    this.books.burnGnot += cost;
    fish.healsUsed = HEALS_PER_DAY - 1;
    fish.healReadyAt = 0;
    this.note(now, `${fish.name} burned ${formatGnot(cost)} USDC to open a heal.`);
    this.emit();
    return { ok: true, detail: "rushed" };
  }

  healView(fishId: string, now: number): HealView {
    const fish = this.fishById(fishId);
    if (!fish || fish.burned) return { healsLeft: 0, readyIn: 0, rushUgnot: 0 };
    const day = ictDayIndex(now);
    let used = fish.healDay === day ? fish.healsUsed : 0;
    let readyAt = fish.healDay === day ? fish.healReadyAt : 0;
    if (used >= HEALS_PER_DAY && readyAt > 0 && now >= readyAt) used = HEALS_PER_DAY - 1;
    const readyIn = Math.max(0, readyAt - now);
    return {
      healsLeft: readyIn > 0 ? 0 : Math.max(0, HEALS_PER_DAY - used),
      readyIn,
      rushUgnot: readyIn > 0 ? healSkipUgnot(SPECIES[fish.rarity].tierId, readyIn) : 0,
    };
  }

  reviveFree(): ActionResult {
    return { ok: false, detail: "Heal outside the match. A kill leaves the NFT at 30% HP." };
  }

  revivePaid(): ActionResult {
    return { ok: false, detail: "Heal outside the match. A kill leaves the NFT at 30% HP." };
  }

  reviveView(fishId: string): ReviveView {
    const fish = this.fishById(fishId);
    if (!fish || fish.burned) {
      return { downed: false, readyIn: 0, freeReady: false, freeUsed: false, paidUgnot: 0 };
    }
    return { downed: fish.mustHeal, readyIn: 0, freeReady: false, freeUsed: false, paidUgnot: 0 };
  }

  stake(): ActionResult {
    return { ok: false, detail: `Swim in this tab needs ${STAKE_BAND} USDC. There is no maximum.` };
  }

  unstake(): ActionResult {
    return { ok: false, detail: "Leave the sea to take Pool X back." };
  }

  foundParty(
    name: string,
    fishId: string,
    now: number,
    crest: CrestId = "wave",
    country = "Sea",
  ): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    if (!owned.fish.alive) return { ok: false, detail: "A downed fish cannot join a party." };
    if (owned.fish.partyId) return { ok: false, detail: "Leave the current party first." };
    const clean = cleanName(name);
    if (!clean) return { ok: false, detail: "Party name needs 1 to 16 characters." };
    if (!isCrest(crest)) return { ok: false, detail: "Pick a party logo." };
    if (!acceptCountry(country)) return { ok: false, detail: "Country comes from the network address." };
    if ([...this.parties.values()].some((group) => group.name === clean)) {
      return { ok: false, detail: "That party name is taken." };
    }
    const id = this.nextId("party");
    this.parties.set(id, { id, name: clean, founderId: PLAYER_ID, crest, country });
    owned.fish.partyId = id;
    this.note(now, `${owned.fish.name} founded party ${clean}.`);
    this.emit();
    return { ok: true, detail: id };
  }

  joinParty(partyId: string, fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const party = this.parties.get(partyId);
    if (!party) return { ok: false, detail: "That party does not exist." };
    if (!owned.fish.alive) return { ok: false, detail: "A downed fish cannot join a party." };
    if (owned.fish.partyId === partyId) return { ok: true, detail: partyId };
    if (owned.fish.partyId) return { ok: false, detail: "Leave the current party first." };
    owned.fish.partyId = partyId;
    this.note(now, `${owned.fish.name} joined party ${party.name}.`);
    this.emit();
    return { ok: true, detail: partyId };
  }

  leaveParty(fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    if (!owned.fish.partyId) return { ok: false, detail: "That fish is not in a party." };
    owned.fish.partyId = null;
    this.note(now, `${owned.fish.name} left the party.`);
    this.emit();
    return { ok: true, detail: "left" };
  }

  foundClan(name: string, fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    if (!owned.fish.alive) return { ok: false, detail: "A downed fish cannot enlist." };
    if (owned.fish.clanId) return { ok: false, detail: "Leave the current clan first." };
    const clean = cleanName(name);
    if (!clean) return { ok: false, detail: "Clan name needs 1 to 16 characters." };
    if ([...this.clans.values()].some((group) => group.name === clean)) {
      return { ok: false, detail: "That clan name is taken." };
    }
    const id = this.nextId("clan");
    const profile = this.profileById(PLAYER_ID);
    this.clans.set(id, {
      id,
      name: clean,
      founderId: PLAYER_ID,
      crest: profile?.crest ?? "reef",
      country: profile?.country ?? "Sea",
    });
    owned.fish.clanId = id;
    this.note(now, `${owned.fish.name} founded clan ${clean}.`);
    this.emit();
    return { ok: true, detail: id };
  }

  enlist(clanId: string, fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const clan = this.clans.get(clanId);
    if (!clan) return { ok: false, detail: "That clan does not exist." };
    if (!owned.fish.alive) return { ok: false, detail: "A downed fish cannot enlist." };
    if (owned.fish.clanId === clanId) return { ok: true, detail: clanId };
    if (owned.fish.clanId) return { ok: false, detail: "Leave the current clan first." };
    owned.fish.clanId = clanId;
    this.note(now, `${owned.fish.name} enlisted in ${clan.name}.`);
    this.emit();
    return { ok: true, detail: clanId };
  }

  leaveClan(fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    if (!owned.fish.clanId) return { ok: false, detail: "That fish is not in a clan." };
    owned.fish.clanId = null;
    this.note(now, `${owned.fish.name} left the clan.`);
    this.emit();
    return { ok: true, detail: "left" };
  }

  profileById(id: string): Profile | undefined {
    return this.profiles.find((profile) => profile.id === id);
  }

  isOnline(profileId: string): boolean {
    if (profileId === PLAYER_ID) return true;
    return this.fish.some((fish) => fish.ownerId === profileId && fish.alive && !fish.burned);
  }

  /** Quiet copy of a saved or chain card. A blank game still starts as skipper. */
  adoptProfile(username: string, country: string, crest: CrestId): boolean {
    const profile = this.profileById(PLAYER_ID);
    if (!profile) return false;
    const clean = cleanUsername(username);
    if (!clean || !acceptCountry(country) || !isCrest(crest)) return false;
    if (this.profiles.some((item) => item.id !== profile.id && item.username === clean)) return false;
    if (profile.username === clean && profile.country === country && profile.crest === crest) return true;
    profile.username = clean;
    profile.country = country;
    profile.crest = crest;
    this.emit();
    return true;
  }

  /** Another sailor's chain username. A known country replaces Sea. The label over their fish reads this. */
  rememberSailor(id: string, username: string, notify = true, country = ""): boolean {
    const clean = cleanUsername(username);
    if (!clean || !id || id === PLAYER_ID) return false;
    const mine = this.profileById(PLAYER_ID);
    if (mine?.username === clean) return false;
    const named = country && acceptCountry(country) && country !== "Sea" ? country : "";
    const profile = this.profileById(id);
    if (!profile) {
      if (this.profiles.some((item) => item.username === clean)) return false;
      this.profiles.push({ id, username: clean, address: id, country: named || "Sea", crest: "wave" });
      if (notify) this.emit();
      return true;
    }
    let changed = false;
    if (profile.username !== clean) {
      if (this.profiles.some((item) => item.id !== id && item.username === clean)) return false;
      profile.username = clean;
      changed = true;
    }
    if (named && profile.country !== named) {
      profile.country = named;
      changed = true;
    }
    if (!changed) return false;
    if (notify) this.emit();
    return true;
  }

  /** Remember a wallet seen in this sea, even when the display name is already taken. */
  meetSailor(address: string, name: string): boolean {
    const id = address.trim().toLowerCase();
    if (!seaWallet(id)) return false;
    return this.ensureSailor(id, name);
  }

  /** A room sailor still gets a card when their name is already used in this browser. */
  private ensureSailor(id: string, fromName: string): boolean {
    if (this.profileById(id)) return true;
    if (this.rememberSailor(id, fromName, false)) return true;
    const taken = (name: string) => this.profiles.some((item) => item.username === name);
    let username = cleanUsername(fromName) ?? "";
    if (!username || taken(username)) username = `s${id.slice(2, 7)}`;
    if (taken(username)) username = `s${id.slice(2, 10)}`;
    if (!cleanUsername(username) || taken(username)) return false;
    this.profiles.push({ id, username, address: id, country: "Sea", crest: "wave" });
    return true;
  }

  /** Name drawn on a fish in the sea. The profile wins. The fish name is only a fallback. */
  displayName(fish: { ownerId: string; name: string }): string {
    const username = this.profileById(fish.ownerId)?.username?.trim() ?? "";
    return username || fish.name;
  }

  setSharedSea(on: boolean): void {
    if (this.sharedSea === on) return;
    this.sharedSea = on;
    this.emit();
  }

  /** Country code published with this browser's fish. The network address wins once it is known. */
  setSailCountry(raw: string): void {
    const next = countryFromCode(raw)?.code ?? "";
    if (next === this.sailCountry) return;
    this.sailCountry = next;
    this.emit();
  }

  /** ISO code drawn as a flag beside this sailor. Sea and unknown names stay blank. */
  flagCode(ownerId: string): string {
    if (ownerId === PLAYER_ID && this.sailCountry) return this.sailCountry;
    return codeForCountry(this.profileById(ownerId)?.country ?? "");
  }

  displayCountry(ownerId: string): string {
    return countryFromCode(this.flagCode(ownerId))?.name ?? "";
  }

  /** Pose of this browser's swimming fish. Null leaves the shared seat. */
  roomPose(address: string): SeaPose | null {
    const fish = this.owned(PLAYER_ID).find((item) => item.matchId === SEA_ID && item.alive && !item.mustHeal);
    if (!fish) return null;
    const yaw = fish.yaw ?? Math.atan2(-fish.faceDx, -fish.faceDz);
    return {
      address: address.trim().toLowerCase(),
      onyxId: fish.onyxId ?? 0,
      name: fish.name,
      sailor: this.profileById(PLAYER_ID)?.username ?? "",
      country: this.flagCode(PLAYER_ID),
      rarity: fish.rarity,
      size: fish.size,
      trait: fish.trait,
      x: fish.x,
      z: fish.z,
      fx: -Math.sin(yaw),
      fz: -Math.cos(yaw),
      hp: fish.hp,
      hpMax: fish.hpMax,
      bite: fish.bite,
      alive: true,
      seq: fish.roomSeq ?? 0,
    };
  }

  takeRoomHits(): SeaHit[] {
    const hits = this.roomHits;
    this.roomHits = [];
    return hits;
  }

  takeRoomKills(): SeaKillIn[] {
    const kills = this.roomKills;
    this.roomKills = [];
    return kills;
  }

  /** Ticker lines younger than the room's three-minute window. `now` is wall time, not the match clock. */
  killFeed(now = Date.now()): SeaKill[] {
    return this.killLines.filter((kill) => now - kill.at < 3 * 60 * 1000);
  }

  /** Put a kill line back when the room did not accept it. */
  restoreRoomKills(kills: SeaKillIn[]): void {
    const seen = new Set(this.roomKills.map((kill) => kill.id));
    this.roomKills = kills.filter((kill) => !seen.has(kill.id)).concat(this.roomKills).slice(0, 4);
  }

  /** Put a bite back when the room did not accept it. A newer report wins. */
  restoreRoomHits(hits: SeaHit[]): void {
    for (const hit of hits) {
      const newer = this.roomHits.find((item) => item.address === hit.address);
      if (!newer) {
        this.roomHits.push(hit);
        continue;
      }
      if (hit.hp < newer.hp) newer.hp = hit.hp;
      if (hit.alive === false) newer.alive = false;
    }
  }

  /**
   * Seat other wallets from the shared room. Their practice stake stays 0,
   * so a bite here does not pay their USDC. Positions are not emitted.
   */
  mirrorRoom(seats: readonly SeaPose[], selfAddress: string): void {
    const self = selfAddress.trim().toLowerCase();
    const seen = new Set<string>();
    let changed = false;
    for (const seat of seats) {
      if (seat.address === self) continue;
      seen.add(seat.address);
      if (this.upsertRemote(seat)) changed = true;
    }
    for (const fish of this.fish) {
      if (!fish.remote || !fish.remoteAddress || seen.has(fish.remoteAddress)) continue;
      if (fish.matchId !== SEA_ID) continue;
      this.dropRemote(fish);
      changed = true;
    }
    if (this.stampArcCrew()) changed = true;
    if (changed) this.emit();
  }

  /** Adopt a newer server seq onto this browser's fish. A lower seq cannot heal it. */
  applyRoomSelf(seat: SeaPose | undefined, now: number): boolean {
    const fish = this.owned(PLAYER_ID).find((item) => item.matchId === SEA_ID && item.alive && !item.mustHeal);
    if (!fish || !seat) return false;
    const seen = fish.roomSeq ?? -1;
    if (seat.seq <= seen) return false;
    fish.roomSeq = seat.seq;
    let changed = false;
    const hp = Math.max(0, Math.min(fish.hpMax, Math.round(seat.hp)));
    if (hp < fish.hp) {
      fish.hp = hp;
      fish.lastCombatAt = now;
      changed = true;
    }
    if (!seat.alive) {
      fish.hp = Math.max(1, percentOf(fish.hpMax, DEATH_HP_PERCENT));
      fish.mustHeal = true;
      fish.streak = 0;
      fish.downedAt = now;
      this.creditBout(fish);
      this.markScore(fish.id, "downs");
      const locked = fish.poolUgnot;
      this.returnPool(fish);
      const sea = this.sea();
      if (sea) this.dropFromMatch(fish, sea);
      const name = this.displayName(fish);
      this.note(
        now,
        locked > 0 ? `${name} was downed. The stake returned to this browser.` : `${name} was downed. This fish left the sea.`,
        undefined,
        fish.id,
      );
      changed = true;
    }
    if (changed) this.emit();
    return changed;
  }

  /**
   * Incoming request. It stays pending until this browser accepts.
   * A request that crosses one this browser already sent becomes mutual.
   */
  receiveFriendRequest(from: string, fromName: string, now: number): "pending" | "mutual" | "ignore" {
    const id = from.trim().toLowerCase();
    if (!seaWallet(id) || id === PLAYER_ID) return "ignore";
    if (!this.ensureSailor(id, fromName)) return "ignore";
    const target = this.profileById(id);
    if (!target) return "ignore";
    const existing = this.friends.find((link) => this.friendPair(link, PLAYER_ID, target.id));
    if (existing?.status === "accepted") return "ignore";
    if (existing?.status === "pending" && existing.fromId === PLAYER_ID) {
      existing.status = "accepted";
      this.note(now, `${target.username} is now a friend.`);
      this.emit();
      return "mutual";
    }
    if (existing) return "ignore";
    this.friends.push({
      id: this.nextId("friend"),
      fromId: target.id,
      toId: PLAYER_ID,
      status: "pending",
    });
    this.note(now, `${target.username} sent a friend request.`);
    this.emit();
    return "pending";
  }

  /** The other browser accepted. Only an outgoing request this browser sent can become a friend. */
  receiveFriendAccept(from: string, fromName: string, now: number): boolean {
    const id = from.trim().toLowerCase();
    if (!seaWallet(id)) return false;
    this.rememberSailor(id, fromName, false);
    const link = this.friends.find((item) => item.status === "pending" && item.fromId === PLAYER_ID && item.toId === id);
    if (!link) return false;
    link.status = "accepted";
    const name = this.profileById(id)?.username ?? fromName;
    this.note(now, `${name} accepted your friend request.`);
    this.emit();
    return true;
  }

  /** The other browser declined. The outgoing request leaves this list. */
  receiveFriendDecline(from: string, fromName: string, now: number): boolean {
    const id = from.trim().toLowerCase();
    if (!seaWallet(id)) return false;
    const index = this.friends.findIndex((item) => item.status === "pending" && item.fromId === PLAYER_ID && item.toId === id);
    if (index < 0) return false;
    this.friends.splice(index, 1);
    this.rememberSailor(id, fromName, false);
    const name = this.profileById(id)?.username ?? fromName;
    this.note(now, `${name} declined your friend request.`);
    this.emit();
    return true;
  }

  /** A world line from the shared room. The sender's own echo is not copied again. */
  receiveRoomChat(
    line: { id: string; from: string; fromName: string; country: string; text: string; at: number },
    selfAddress: string,
  ): boolean {
    const from = line.from.trim().toLowerCase();
    const text = line.text.replace(/[\u0000-\u001f]/g, "").trim();
    if (!seaWallet(from) || text.length < 1 || text.length > 140) return false;
    if (this.chats.some((item) => item.id === line.id)) return false;
    const mine = from === selfAddress.trim().toLowerCase();
    const fromId = mine ? PLAYER_ID : from;
    if (!mine) {
      const place = countryFromCode(line.country)?.name ?? "";
      this.rememberSailor(from, line.fromName, false, place);
    }
    const echo = this.chats.some((item) => item.fromId === fromId && item.text === text && item.at === line.at);
    if (echo) return false;
    this.chats.push({
      id: line.id,
      channel: "world",
      roomId: "world",
      fromId,
      text,
      at: line.at,
    });
    if (this.chats.length > 80) this.chats.shift();
    this.emit();
    return true;
  }

  setProfile(username: string, country: string, crest: CrestId, now: number): ActionResult {
    const profile = this.profileById(PLAYER_ID);
    if (!profile) return { ok: false, detail: "Profile is missing." };
    const clean = cleanUsername(username);
    if (!clean) return { ok: false, detail: "Username needs 3 to 16 letters or digits." };
    if (!acceptCountry(country)) return { ok: false, detail: "Country comes from the network address." };
    if (!isCrest(crest)) return { ok: false, detail: "Pick a logo." };
    if (this.profiles.some((item) => item.id !== profile.id && item.username === clean)) {
      return { ok: false, detail: "That username is taken." };
    }
    const changed = profile.username !== clean || profile.country !== country || profile.crest !== crest;
    if (!this.adoptProfile(clean, country, crest)) return { ok: false, detail: "Profile is missing." };
    if (changed) {
      this.note(now, `Profile saved as ${clean}.`);
      this.emit();
    }
    return { ok: true, detail: profile.address };
  }

  rememberSailors(rows: { id: string; username: string }[]): number {
    let count = 0;
    for (const row of rows) {
      if (this.rememberSailor(row.id, row.username, false)) count += 1;
    }
    if (count > 0) this.emit();
    return count;
  }

  requestFriend(who: string, now: number): ActionResult {
    const target = this.resolveProfile(who);
    if (!target) return { ok: false, detail: "No sailor with that name or address." };
    if (target.id === PLAYER_ID) return { ok: false, detail: "That is your own address." };
    const existing = this.friends.find((link) => this.friendPair(link, PLAYER_ID, target.id));
    if (existing?.status === "accepted") return { ok: true, detail: "already friends" };
    if (existing?.status === "pending" && existing.fromId === target.id) {
      existing.status = "accepted";
      this.note(now, `${target.username} is now a friend.`);
      this.emit();
      return { ok: true, detail: "accepted" };
    }
    if (existing?.status === "pending") return { ok: true, detail: "pending" };
    this.friends.push({
      id: this.nextId("friend"),
      fromId: PLAYER_ID,
      toId: target.id,
      status: "pending",
    });
    this.note(now, `Friend request sent to ${target.username}.`);
    this.emit();
    return { ok: true, detail: "pending" };
  }

  /** Refuse an incoming request. It does not enter the friend list. */
  declineFriend(who: string, now: number): ActionResult {
    const target = this.resolveProfile(who);
    if (!target) return { ok: false, detail: "No sailor with that name or address." };
    if (target.id === PLAYER_ID) return { ok: false, detail: "That is your own address." };
    const index = this.friends.findIndex((item) => item.status === "pending" && item.fromId === target.id && item.toId === PLAYER_ID);
    if (index < 0) return { ok: false, detail: "No request from that sailor." };
    this.friends.splice(index, 1);
    this.note(now, `Declined ${target.username}.`);
    this.emit();
    return { ok: true, detail: "declined" };
  }

  inviteToParty(who: string, fishId: string, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const partyId = owned.fish.partyId;
    const party = partyId ? this.parties.get(partyId) : undefined;
    if (!party) return { ok: false, detail: "Found a party before inviting." };
    const target = this.resolveProfile(who);
    if (!target) return { ok: false, detail: "No sailor with that name or address." };
    if (target.id === PLAYER_ID) return { ok: false, detail: "That is your own address." };
    const guest = this.fish.find((fish) => fish.ownerId === target.id && !fish.burned);
    if (!guest) return { ok: false, detail: "That sailor has no fish." };
    if (guest.partyId === party.id) return { ok: true, detail: "already in the party" };
    if (guest.partyId) return { ok: false, detail: "That sailor is already in a party." };
    if (!guest.alive) return { ok: false, detail: "That sailor's fish is down." };
    guest.partyId = party.id;
    this.invites.push({
      id: this.nextId("invite"),
      partyId: party.id,
      fromId: PLAYER_ID,
      toId: target.id,
      status: "accepted",
    });
    this.note(now, `${target.username} joined ${party.name}.`);
    this.emit();
    return { ok: true, detail: guest.id };
  }

  say(channel: ChatChannel, text: string, now: number): ActionResult {
    const clean = text.replace(/[\u0000-\u001f]/g, "").trim();
    if (clean.length < 1 || clean.length > 140) return { ok: false, detail: "Chat needs 1 to 140 characters." };
    const mine = this.owned(PLAYER_ID).find((fish) => fish.id === this.activeFishId) ?? this.owned(PLAYER_ID)[0];
    let roomId = "world";
    if (channel === "party") {
      if (!mine?.partyId) return { ok: false, detail: "Join a party to use party chat." };
      roomId = mine.partyId;
    } else if (channel === "clan") {
      if (!mine?.clanId) return { ok: false, detail: "Join a clan to use clan chat." };
      roomId = mine.clanId;
    } else if (channel !== "world") {
      return { ok: false, detail: "That chat channel does not exist." };
    }
    this.chats.push({
      id: this.nextId("chat"),
      channel,
      roomId,
      fromId: PLAYER_ID,
      text: clean,
      at: now,
    });
    if (this.chats.length > 80) this.chats.shift();
    this.emit();
    return { ok: true, detail: "sent" };
  }

  /** Put this browser's saved practice lines back. A sea that already has lines stays as it is. */
  restorePracticeChat(lines: { channel: ChatChannel; roomId: string; fromId: string; text: string; at: number }[]): number {
    if (this.chats.length > 0) return 0;
    let added = 0;
    for (const line of lines.slice(-80)) {
      if (line.channel !== "world" && line.channel !== "party" && line.channel !== "clan") continue;
      const text = String(line.text ?? "").replace(/[\u0000-\u001f]/g, "").trim();
      const fromId = String(line.fromId ?? "");
      const roomId = String(line.roomId ?? "");
      const at = Number(line.at);
      if (text.length < 1 || text.length > 140 || fromId.length < 1 || fromId.length > 80) continue;
      if (roomId.length < 1 || roomId.length > 80 || !Number.isFinite(at)) continue;
      this.chats.push({ id: this.nextId("chat"), channel: line.channel, roomId, fromId, text, at });
      added += 1;
    }
    if (added > 0) this.emit();
    return added;
  }

  /** Put this wallet's saved friends back. A repeat load for the same wallet does nothing. */
  restoreFriends(owner: string, rows: readonly SavedFriend[]): number {
    const key = owner.trim().toLowerCase();
    if (!seaWallet(key)) return 0;
    if (this.friendBook === key) return 0;
    const previous = this.friendBook;
    this.friendBook = key;
    if (previous) this.friends.splice(0, this.friends.length);
    let added = 0;
    for (const row of rows) {
      const other = row.other.trim().toLowerCase();
      if (!seaWallet(other) || other === key) continue;
      if (row.status !== "pending" && row.status !== "accepted") continue;
      if (!this.ensureSailor(other, row.username)) continue;
      const id = this.profileById(other)?.id ?? other;
      if (this.friends.some((link) => this.friendPair(link, PLAYER_ID, id))) continue;
      this.friends.push({
        id: this.nextId("friend"),
        fromId: row.incoming ? id : PLAYER_ID,
        toId: row.incoming ? PLAYER_ID : id,
        status: row.status,
      });
      added += 1;
    }
    if (added > 0 || previous) this.emit();
    return added;
  }

  /** Friends worth keeping on this device. Practice names without a wallet are left out. */
  exportFriends(): SavedFriend[] {
    const out: SavedFriend[] = [];
    for (const link of this.friends) {
      if (link.status !== "pending" && link.status !== "accepted") continue;
      const incoming = link.toId === PLAYER_ID && link.fromId !== PLAYER_ID;
      const otherId = link.fromId === PLAYER_ID ? link.toId : link.fromId;
      const profile = this.profileById(otherId);
      const other = (profile?.address || otherId).trim().toLowerCase();
      if (!seaWallet(other)) continue;
      let username = (profile?.username ?? "").trim().toLowerCase();
      if (!/^[a-z0-9]{3,16}$/.test(username)) username = `s${other.replace(/^0x/, "").slice(0, 6)}`;
      out.push({ other, username, status: link.status, incoming });
      if (out.length >= 40) break;
    }
    return out;
  }

  /** Read-only timing for spectator UI; eligibility remains enforced by claim(). */
  watchStartedAt(viewerId: string): number | null {
    return this.watchSince.get(viewerId) ?? null;
  }

  setWatching(viewerId: string, on: boolean, now = Date.now()): void {
    const was = this.watching.has(viewerId);
    if (on) {
      this.watching.add(viewerId);
      if (!this.watchSince.has(viewerId)) this.watchSince.set(viewerId, now);
    } else {
      this.watching.delete(viewerId);
      this.watchSince.delete(viewerId);
    }
    if (was !== this.watching.has(viewerId)) this.emit();
  }

  cheer(fishId: string, asset: Asset, amount: number, now: number): ActionResult {
    const fish = this.fishById(fishId);
    const match = this.matchById(fish?.matchId);
    if (!fish || !fish.alive || fish.burned || !match || match.status !== "live") {
      return { ok: false, detail: "Cheer a fish in the sea." };
    }
    if (fish.ownerId === VIEWER_ID || fish.ownerId === PLAYER_ID) {
      return { ok: false, detail: "You cannot cheer your own fish." };
    }
    const qty = Math.trunc(amount);
    if (!Number.isFinite(qty)) return { ok: false, detail: "Cheer amount has to be a number." };
    if (asset === "gnot" && qty < MIN_CHEER_GNOT) return { ok: false, detail: "Minimum cheer is 1 USDC." };
    if (asset === "fish" && qty < MIN_CHEER_FISH) return { ok: false, detail: "Minimum cheer is 10 FISH." };
    const value = cheerValueUgnot(asset, qty);
    const cap = Math.floor((fish.poolUgnot * 5_000) / 10_000);
    const locked = this.cheers
      .filter((c) => c.fishId === fishId && !c.returned)
      .reduce((sum, c) => sum + cheerValueUgnot(c.asset, c.amount), 0);
    if (locked + value > cap) return { ok: false, detail: "Cheer is capped at half of Pool X." };
    const active = this.cheers.find((c) => c.viewerId === VIEWER_ID && c.fishId === fishId && c.asset === asset && !c.returned);
    const purse = this.purse(VIEWER_ID);
    if (asset === "gnot" ? purse.gnot < qty : purse.fish < qty) {
      return { ok: false, detail: "Not enough in the viewer purse." };
    }
    if (asset === "gnot") purse.gnot -= qty;
    else purse.fish -= qty;
    if (active) active.amount += qty;
    else {
      this.cheers.push({
        id: this.nextId("cheer"),
        viewerId: VIEWER_ID,
        fishId,
        matchId: match.id,
        asset,
        amount: qty,
        until: 0,
        returned: false,
        valueGnotAtLock: 0,
      });
    }
    const booked = this.cheers.find((c) => c.viewerId === VIEWER_ID && c.fishId === fishId && c.asset === asset && !c.returned);
    if (booked) booked.valueGnotAtLock = cheerValueUgnot(booked.asset, booked.amount);
    this.note(now, `Cheer locked on ${fish.name} until that fish leaves or is downed.`);
    this.emit();
    return { ok: true, detail: "cheering" };
  }

  claim(claimId: string, now: number): ActionResult {
    const claim = this.claims.find((c) => c.id === claimId);
    if (!claim || claim.claimed) return { ok: false, detail: "Nothing to claim." };
    if (claim.kind === "watch") {
      if (claim.expiresAt > 0 && now > claim.expiresAt) return { ok: false, detail: "That shard expired." };
      const opened = this.watchSince.get(VIEWER_ID);
      if (!this.watching.has(VIEWER_ID) || opened === undefined || opened > claim.killAt - VIEWER_WATCH_MS) {
        return { ok: false, detail: "Watch the sea 15 seconds before the kill." };
      }
      if (VIEWER_ID === claim.killerOwnerId || VIEWER_ID === claim.victimOwnerId) {
        return { ok: false, detail: "The killer and the victim cannot pick up this shard." };
      }
      if (this.claims.some((other) => other.killId === claim.killId && other.claimed && other.viewerId === VIEWER_ID)) {
        return { ok: false, detail: "One shard per wallet on this kill." };
      }
      claim.viewerId = VIEWER_ID;
    } else if (claim.viewerId !== VIEWER_ID) {
      return { ok: false, detail: "That claim is not yours." };
    }
    claim.claimed = true;
    this.creditPurse(VIEWER_ID, "gnot", claim.gnot);
    this.creditPurse(VIEWER_ID, "fish", claim.fish);
    this.note(now, claim.kind === "watch" ? "Shard claimed." : "Cheer share claimed.");
    this.emit();
    return { ok: true, detail: "claimed" };
  }

  feed(): ActionResult {
    return { ok: false, detail: "Heal outside a match." };
  }

  register(fishId: string, ugnot: number, now: number): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const fish = owned.fish;
    if (!fish.alive) return { ok: false, detail: "That fish is gone." };
    if (fish.layCommitAt !== null) return { ok: false, detail: "Settle the lay before this fish enters a match." };
    if (fish.matchId) return { ok: false, detail: "That fish is already in a match." };
    if (fish.mustHeal) return { ok: false, detail: "Heal before the next match." };
    if (fish.hp * 100 < fish.hpMax * MIN_ENTER_HP_PERCENT) {
      return { ok: false, detail: "HP has to be at least 30% to enter." };
    }
    const stake = Math.trunc(ugnot);
    if (!stakeFitsSea(stake)) return { ok: false, detail: `Swim in this tab needs ${STAKE_BAND} USDC. There is no maximum.` };
    if (this.owned(PLAYER_ID).some((item) => item.matchId === SEA_ID)) {
      return { ok: false, detail: "One fish per wallet in the sea." };
    }
    const sea = this.sea();
    if (!sea) return { ok: false, detail: "The sea is not open." };
    const purse = this.purse(PLAYER_ID);
    if (purse.gnot < stake) return { ok: false, detail: "Not enough USDC in this tab to swim." };
    purse.gnot -= stake;
    fish.poolUgnot += stake;
    this.seat(fish);
    this.placeSwimmer(fish);
    this.viewMatchId = SEA_ID;
    this.activeFishId = fish.id;
    this.note(now, `${fish.name} swam in this tab with ${formatGnot(stake)} USDC.`);
    this.emit();
    return { ok: true, detail: SEA_ID };
  }

  /** Open the sea after the Arc pool already holds this stake. The practice purse stays put. */
  enterOnPoolStake(fishId: string, now: number, stakeUgnot = UGNOT): ActionResult {
    const owned = this.requireOwn(fishId);
    if (!owned.ok) return owned.result;
    const fish = owned.fish;
    if (!fish.alive) return { ok: false, detail: "That fish is gone." };
    if (fish.layCommitAt !== null) return { ok: false, detail: "Settle the lay before this fish enters a match." };
    if (fish.matchId) return { ok: false, detail: "That fish is already in a match." };
    if (fish.mustHeal) return { ok: false, detail: "Heal before the next match." };
    if (fish.hp * 100 < fish.hpMax * MIN_ENTER_HP_PERCENT) {
      return { ok: false, detail: "HP has to be at least 30% to enter." };
    }
    if (this.owned(PLAYER_ID).some((item) => item.matchId === SEA_ID)) {
      return { ok: false, detail: "One fish per wallet in the sea." };
    }
    const sea = this.sea();
    if (!sea) return { ok: false, detail: "The sea is not open." };
    const stake = Math.trunc(stakeUgnot);
    if (!Number.isSafeInteger(stake) || stake < UGNOT) {
      return { ok: false, detail: "The pool stake is at least 1 USDC." };
    }
    if (this.books.reserveGnot < stake) return { ok: false, detail: "The pool cannot take this stake." };
    this.books.reserveGnot -= stake;
    fish.poolUgnot += stake;
    fish.chainPool = true;
    this.seat(fish);
    this.placeSwimmer(fish);
    this.viewMatchId = SEA_ID;
    this.activeFishId = fish.id;
    this.note(now, `${fish.name} staked ${formatGnot(stake)} USDC into the pool.`);
    this.emit();
    return { ok: true, detail: SEA_ID };
  }

  /** Focus a fish that is already swimming. Register is what locks the stake. */
  startMatch(fishId: string, now: number): ActionResult {
    const fish = this.fishById(fishId);
    if (!fish || fish.ownerId !== PLAYER_ID || fish.matchId !== SEA_ID) {
      return { ok: false, detail: "Enter the sea before you swim." };
    }
    if (fish.poolUgnot <= 0) return { ok: false, detail: "Stake into the pool before the sea opens." };
    this.viewMatchId = SEA_ID;
    this.activeFishId = fish.id;
    this.placeSwimmer(fish);
    void now;
    this.emit();
    return { ok: true, detail: SEA_ID };
  }

  /**
   * Drop this fish from the browser sea.
   * `chainReturned` skips the 5 second quiet lock: FishDuel already sent the stake back.
   */
  leaveMatch(fishId: string, now: number, chainReturned = false): ActionResult {
    const fish = this.fishById(fishId);
    const match = this.matchById(fish?.matchId);
    if (!fish || !match || match.status !== "live") {
      if (chainReturned && fish && fish.ownerId === PLAYER_ID) {
        if (this.activeFishId === fish.id) this.activeFishId = null;
        this.emit();
        return { ok: true, detail: "left" };
      }
      return { ok: false, detail: "That fish is not in a match." };
    }
    if (fish.ownerId !== PLAYER_ID) return { ok: false, detail: "You do not own that fish." };
    if (!chainReturned && fish.lastCombatAt >= 0 && now - fish.lastCombatAt < COMBAT_LOCK_MS) {
      return { ok: false, detail: "Leave after 5 quiet seconds." };
    }
    const locked = fish.poolUgnot;
    this.returnPool(fish);
    this.dropFromMatch(fish, match);
    if (this.activeFishId === fish.id) this.activeFishId = null;
    this.note(now, locked > 0 ? `${fish.name} left the sea with the stake.` : `${fish.name} left the practice sea.`);
    this.emit();
    return { ok: true, detail: "left" };
  }

  leave(): void {
    this.activeFishId = null;
    this.emit();
  }

  relocate(id: string, sx: number, sz: number): void {
    const fish = this.fishById(id);
    if (!fish) return;
    fish.sx = sx;
    fish.sz = sz;
    const center = sectorCenter(sx, sz);
    fish.x = center.x;
    fish.z = center.z;
    fish.placed = true;
  }

  /**
   * One sector step. `sx`/`sz` wait for `nextMoveAt`. The body keeps the
   * continuous point so a cell edge does not stop it and snap it. Rocks and
   * closed pockets still slide the body out.
   */
  commitPose(id: string, x: number, z: number, fwdX: number, fwdZ: number, now: number): { x: number; z: number } {
    const fish = this.fishById(id);
    if (!fish || !fish.alive) return { x, z };
    const face = facingFromForward(fwdX, fwdZ);
    fish.faceDx = face.dx;
    fish.faceDz = face.dz;
    fish.placed = true;
    const prevSx = fish.sx;
    const prevSz = fish.sz;
    const prevX = fish.x;
    const prevZ = fish.z;
    const prevMove = fish.nextMoveAt;
    const desired = sectorOf(x, z);
    if (desired.sx !== fish.sx || desired.sz !== fish.sz) {
      if (now >= fish.nextMoveAt) {
        const nsx = fish.sx + Math.sign(desired.sx - fish.sx);
        const nsz = fish.sz + Math.sign(desired.sz - fish.sz);
        if (sectorInSea(nsx, nsz)) {
          fish.sx = nsx;
          fish.sz = nsz;
          fish.nextMoveAt = now + moveDelayMs(worldUnitsPerSecond(fish.speed, fish.streak), now < fish.burstUntil);
        }
      }
    }
    const blocks = this.blocksFor(fish, now);
    const stuck = (px: number, pz: number) => blocks.some((block) => Math.hypot(px - block.x, pz - block.z) < block.radius - 1e-6);
    if (stuck(x, z)) {
      const out = escapePoint(x, z, blocks);
      const sector = sectorOf(out.x, out.z);
      const placed = sectorInSea(sector.sx, sector.sz) ? clampToSector(sector.sx, sector.sz, out.x, out.z) : null;
      if (placed && !stuck(placed.x, placed.z)) {
        fish.sx = sector.sx;
        fish.sz = sector.sz;
        fish.x = placed.x;
        fish.z = placed.z;
      } else {
        fish.sx = prevSx;
        fish.sz = prevSz;
        fish.nextMoveAt = prevMove;
        fish.x = prevX;
        fish.z = prevZ;
      }
    } else {
      fish.x = x;
      fish.z = z;
    }
    fish.yaw = Math.atan2(-fwdX, -fwdZ);
    if (this.touchSprings(now)) this.emit();
    return { x: fish.x, z: fish.z };
  }

  /** Reach is still from the body center. The target also has to sit in front of the mouth. */
  private biteWindow(attacker: FishNft, victim: FishNft, reach: number): boolean {
    return mouthBite(
      attacker.x,
      attacker.z,
      attacker.faceDx,
      attacker.faceDz,
      attacker.size,
      victim.x,
      victim.z,
      reach,
    );
  }

  /** One burst. A second press during the window or the cooldown does nothing. */
  tryBurst(id: string, now: number): ActionResult {
    const fish = this.fishById(id);
    if (!fish || !fish.alive) return { ok: false, detail: "That fish is down." };
    if (now < fish.nextBurstAt) return { ok: false, detail: "Burst is still cooling down." };
    fish.burstUntil = now + BURST_MS;
    fish.nextBurstAt = now + BURST_MS + BURST_COOLDOWN_MS;
    this.emit();
    return { ok: true, detail: "burst" };
  }

  previewStrike(attackerId: string, victimId: string, now: number): { damage: number; legal: boolean } | null {
    const attacker = this.fishById(attackerId);
    const victim = this.fishById(victimId);
    if (!attacker || !victim || !attacker.alive || !victim.alive || attacker.id === victim.id) return null;
    const match = this.matchById(attacker.matchId);
    const legal =
      now >= attacker.nextBiteAt &&
      !attacker.mustHeal &&
      !victim.mustHeal &&
      !this.allied(attacker, victim) &&
      match?.id === SEA_ID &&
      match.status === "live" &&
      victim.matchId === SEA_ID &&
      this.biteWindow(attacker, victim, biteReach(biteRadius(attacker.range), victim.dodge));
    const cover = this.coverFor(victim, now);
    const shielded = this.shields(attacker, victim, cover);
    return {
      legal,
      damage: shielded && cover
        ? strikeDamage(attacker.bite, cover.hpMax, attacker.size, "medium")
        : strikeDamage(attacker.bite, victim.hpMax, attacker.size, victim.size, attacker.rarity, victim.rarity),
    };
  }

  tryBite(attackerId: string, victimId: string, now: number): ActionResult & { report?: KillReport } {
    if (attackerId === victimId) return { ok: false, detail: "A fish cannot bite itself." };
    const attacker = this.fishById(attackerId);
    const victim = this.fishById(victimId);
    if (!attacker || !victim || !attacker.alive || !victim.alive || attacker.burned || victim.burned) {
      return { ok: false, detail: "Both fish have to be alive." };
    }
    if (attacker.mustHeal || victim.mustHeal) return { ok: false, detail: "That fish is out of the match." };
    const match = this.matchById(attacker.matchId);
    if (!match || match.id !== SEA_ID || match.status !== "live" || victim.matchId !== SEA_ID) {
      return { ok: false, detail: "Both fish have to be in the sea." };
    }
    if (this.allied(attacker, victim)) return { ok: false, detail: "Allies do not bite each other." };
    const radius = biteRadius(attacker.range);
    const reached = this.biteWindow(attacker, victim, biteReach(radius, victim.dodge));
    if (!reached) {
      const slipped = victim.dodge > 0 && this.biteWindow(attacker, victim, radius);
      return { ok: false, detail: slipped ? "That fish dodged." : "That fish is outside bite range." };
    }
    if (now < attacker.nextBiteAt) return { ok: false, detail: "Bite is still cooling down." };
    if (attacker.bittenById === victim.id && now < attacker.bittenByUntil) {
      return { ok: false, detail: "That fish just bit you." };
    }
    const cover = this.coverFor(victim, now);
    attacker.nextBiteAt = now + SPECIES[attacker.rarity].biteCooldownMs;
    attacker.lastCombatAt = now;
    if (cover && this.shields(attacker, victim, cover)) {
      const dmg = this.damageShelter(attacker, cover, now, victim.name);
      this.emit();
      return { ok: true, detail: `${dmg}` };
    }
    victim.lastCombatAt = now;
    victim.bittenById = attacker.id;
    victim.bittenByUntil = attacker.nextBiteAt;
    const dmg = strikeDamage(attacker.bite, victim.hpMax, attacker.size, victim.size, attacker.rarity, victim.rarity);
    if (victim.hp > dmg) {
      this.note(now, `${attacker.name} struck ${victim.name} for ${dmg}.`, attacker.id, victim.id);
      victim.hp -= dmg;
      this.noteRoomHit(victim);
      this.emit();
      return { ok: true, detail: `${dmg}` };
    }
    const report = this.payKill(attacker, victim, now);
    this.noteRoomHit(victim);
    this.emit();
    return { ok: true, detail: "kill", report };
  }

  tick(now: number): void {
    let changed = false;
    for (const nft of this.fish) {
      if (nft.burned) continue;
      const before = nft.healsUsed;
      this.rollHealDay(nft, now);
      if (nft.healsUsed !== before) changed = true;
    }
    for (const claim of this.claims) {
      if (claim.claimed || claim.kind !== "watch" || claim.expiresAt <= 0 || now < claim.expiresAt) continue;
      this.books.seasonTreasuryGnot += claim.gnot;
      claim.gnot = 0;
      claim.claimed = true;
      changed = true;
    }
    this.refreshShelters(now);
    if (this.touchSprings(now)) changed = true;
    if (changed) this.emit();
  }

  shown(fish: FishNft): boolean {
    if (fish.burned || !fish.alive || fish.mustHeal) return false;
    return fish.matchId === SEA_ID;
  }

  /** One id for the local ticker and, when the victim is another wallet, the shared room. */
  private rememberKill(attacker: FishNft, victim: FishNft, gnot: number, fish: number): void {
    this.seq += 1;
    const at = Date.now();
    let id = `k${at.toString(36)}${this.seq.toString(36)}`;
    if (id.length < 5) id = id.padEnd(5, "0");
    id = id.slice(0, 21);
    const line: SeaKill = {
      id,
      at,
      attacker: this.displayName(attacker),
      attackerCountry: this.flagCode(attacker.ownerId),
      victim: this.displayName(victim),
      victimCountry: this.flagCode(victim.ownerId),
      gnot,
      fish,
    };
    this.killLines.push(line);
    if (this.killLines.length > 12) this.killLines.shift();
    if (!victim.remoteAddress) return;
    this.roomKills.push({
      id: line.id,
      attacker: line.attacker,
      attackerCountry: line.attackerCountry,
      victim: line.victim,
      victimCountry: line.victimCountry,
      victimAddress: victim.remoteAddress,
      gnot: line.gnot,
      fish: line.fish,
    });
    if (this.roomKills.length > 4) this.roomKills.shift();
  }

  private payKill(attacker: FishNft, victim: FishNft, now: number): KillReport {
    this.creditBout(attacker);
    this.creditBout(victim);
    const covered = coveredStake(attacker.poolUgnot, victim.poolUgnot);
    const excess = victim.poolUgnot - covered;
    const gnot = splitKill(covered);
    const purseExcess = victim.chainPool ? 0 : excess;
    if (victim.chainPool && excess > 0) this.books.reserveGnot += excess;
    victim.poolUgnot = 0;
    victim.chainPool = false;
    victim.hp = Math.max(1, percentOf(victim.hpMax, DEATH_HP_PERCENT));
    victim.mustHeal = true;
    victim.downedAt = now;
    victim.streak = 0;
    attacker.streak += 1;
    this.markScore(attacker.id, "kills");
    this.markScore(victim.id, "downs");
    const sea = this.sea();
    if (sea) this.dropFromMatch(victim, sea);
    this.creditPurse(victim.ownerId, "gnot", purseExcess);
    this.creditPurse(attacker.ownerId, "gnot", gnot.killer);
    this.books.liquidityGnot += gnot.lp;
    this.books.devGnot += gnot.team;
    const cheers = this.cheers.filter((c) => c.fishId === attacker.id && !c.returned && c.valueGnotAtLock > 0);
    if (cheers.length === 0) this.books.devGnot += gnot.cheer;
    else {
      const shares = sharePool(gnot.cheer, cheers.map((c) => c.valueGnotAtLock));
      let placed = 0;
      for (let i = 0; i < cheers.length; i++) {
        if (shares[i] <= 0) continue;
        placed += shares[i];
        this.claims.push(this.blankClaim({
          viewerId: cheers[i].viewerId,
          gnot: shares[i],
          killerId: attacker.id,
          kind: "cheer",
          killAt: now,
          killId: `${SEA_ID}-${now}-${victim.id}`,
          killerOwnerId: attacker.ownerId,
          victimOwnerId: victim.ownerId,
        }));
      }
      this.books.devGnot += gnot.cheer - placed;
    }
    const bought = buybackAtTwap(gnot.buyback, this.books.reserveFish);
    this.books.reserveFish -= bought.fish;
    this.books.burnFish += bought.fish;
    this.books.liquidityGnot += bought.spentUgnot;
    this.books.burnGnot += bought.dustUgnot;
    const members = this.partySeats(attacker);
    const baseFish = winFishReward(covered, this.books.reserveFish);
    const bonusFish = partyFishBonusFish(baseFish, members.length, this.books.reserveFish - baseFish);
    this.books.reserveFish -= baseFish + bonusFish;
    this.creditPurse(attacker.ownerId, "fish", baseFish);
    const killerIndex = members.findIndex((fish) => fish.id === attacker.id);
    const shares = splitPartyBonus(bonusFish, members.length, killerIndex);
    let ownerBonus = 0;
    for (let i = 0; i < members.length; i++) {
      if (shares[i] <= 0) continue;
      this.creditPurse(members[i].ownerId, "fish", shares[i]);
      if (members[i].ownerId === attacker.ownerId) ownerBonus += shares[i];
    }
    const fishReward = baseFish + ownerBonus;
    this.rememberKill(attacker, victim, gnot.killer, fishReward);
    const partyNote = bonusFish > 0 ? ` Party bonus ${formatFish(bonusFish)} FISH across ${members.length}.` : "";
    const fishBit = fishReward > 0 ? ` and ${formatFish(fishReward)} FISH` : "";
    this.note(now, `${attacker.name} downed ${victim.name}. Killer ${formatGnot(gnot.killer)} USDC${fishBit}. Lost ${formatGnot(covered)} USDC.${partyNote}`, attacker.id, victim.id);
    this.pushFx({ kind: "kill", x: victim.x, z: victim.z, text: "Down", at: now });
    if (gnot.killer > 0) {
      this.pushFx({ kind: "gnot", x: victim.x, z: victim.z, text: `+${formatGnot(gnot.killer)}`, at: now });
    }
    if (fishReward > 0) {
      this.pushFx({ kind: "gnot", x: victim.x, z: victim.z, text: `+${formatFish(fishReward)} FISH`, at: now });
    }
    this.growFromKill(attacker, victim, now);
    this.grantKillHeal(attacker.id, this.practiceRoll(), now);
    return { killerId: attacker.id, victimId: victim.id, victimName: victim.name, gnot, fishReward, buybackFish: bought.fish };
  }

  takeFx(): SeaFx[] {
    return this.fx.splice(0, this.fx.length);
  }

  /** A living shelter center in the mouth. Fish that fit the pocket do not gnaw it. */
  shelterInMouth(attackerId: string, now: number): string | null {
    const attacker = this.fishById(attackerId);
    if (!attacker || !this.shown(attacker)) return null;
    this.refreshShelters(now);
    const reach = biteRadius(attacker.range);
    let best = 1e9;
    let found: string | null = null;
    for (const shelter of this.shelters) {
      if (shelter.hp <= 0 || shelterAdmits(shelter.kind, attacker.size)) continue;
      if (!mouthBite(attacker.x, attacker.z, attacker.faceDx, attacker.faceDz, attacker.size, shelter.x, shelter.z, reach)) {
        continue;
      }
      const dist = Math.hypot(attacker.x - shelter.x, attacker.z - shelter.z);
      if (dist < best) {
        best = dist;
        found = shelter.id;
      }
    }
    return found;
  }

  /** Bite the shelter itself. A miss does not start cooldown. */
  tryGnaw(attackerId: string, shelterId: string, now: number): ActionResult {
    const attacker = this.fishById(attackerId);
    const shelter = this.shelters.find((item) => item.id === shelterId);
    if (!attacker || !shelter || !attacker.alive || attacker.mustHeal || attacker.matchId !== SEA_ID) {
      return { ok: false, detail: "Both fish have to be in the sea." };
    }
    this.refreshShelters(now);
    if (shelter.hp <= 0) return { ok: false, detail: "That shelter is down." };
    if (shelterAdmits(shelter.kind, attacker.size)) return { ok: false, detail: "That shelter is open." };
    const reach = biteRadius(attacker.range);
    const hit = mouthBite(
      attacker.x,
      attacker.z,
      attacker.faceDx,
      attacker.faceDz,
      attacker.size,
      shelter.x,
      shelter.z,
      reach,
    );
    if (!hit) return { ok: false, detail: "That shelter is outside bite range." };
    if (now < attacker.nextBiteAt) return { ok: false, detail: "Bite is still cooling down." };
    attacker.nextBiteAt = now + SPECIES[attacker.rarity].biteCooldownMs;
    attacker.lastCombatAt = now;
    const dmg = this.damageShelter(attacker, shelter, now, shelter.kind);
    this.emit();
    return { ok: true, detail: `${dmg}` };
  }

  /** Practice heal on a kill. A fish out of the sea, including mustHeal, gains nothing. */
  grantKillHeal(fishId: string, roll: number, now: number): number {
    const fish = this.fishById(fishId);
    if (!fish || !this.shown(fish)) return 0;
    const gain = killHealGain(roll, fish.hp, fish.hpMax);
    if (gain <= 0) return 0;
    fish.hp += gain;
    this.pushFx({ kind: "heal", x: fish.x, z: fish.z, text: `+${gain} HP`, at: now });
    this.note(now, `${fish.name} recovered ${gain} HP.`);
    return gain;
  }

  private blankClaim(input: {
    viewerId: string;
    gnot: number;
    killerId: string;
    kind: ClaimKind;
    killAt: number;
    killId: string;
    killerOwnerId: string;
    victimOwnerId: string;
    expiresAt?: number;
  }): Claim {
    return {
      id: this.nextId("claim"),
      viewerId: input.viewerId,
      gnot: input.gnot,
      fish: 0,
      killerId: input.killerId,
      kind: input.kind,
      claimed: false,
      expiresAt: input.expiresAt ?? 0,
      killAt: input.killAt,
      killId: input.killId,
      killerOwnerId: input.killerOwnerId,
      victimOwnerId: input.victimOwnerId,
    };
  }

  private pushFx(input: Omit<SeaFx, "id">) {
    this.fx.push({ ...input, id: this.nextId("fx") });
    if (this.fx.length > 24) this.fx.splice(0, this.fx.length - 24);
  }

  private blocksFor(fish: FishNft, now: number): BlockDisc[] {
    this.refreshShelters(now);
    const blocks: BlockDisc[] = ROCKS.map((rock) => ({ x: rock.x, z: rock.z, radius: rock.radius }));
    for (const shelter of this.shelters) {
      if (shelter.hp <= 0 || shelterAdmits(shelter.kind, fish.size)) continue;
      blocks.push({ x: shelter.x, z: shelter.z, radius: shelter.inner });
    }
    return blocks;
  }

  /** A fish that fits, standing inside a living pocket. */
  private coverFor(fish: FishNft, now: number): ShelterState | null {
    this.refreshShelters(now);
    for (const shelter of this.shelters) {
      if (shelter.hp <= 0 || !shelterAdmits(shelter.kind, fish.size)) continue;
      if (Math.hypot(fish.x - shelter.x, fish.z - shelter.z) <= shelter.inner + 1e-6) return shelter;
    }
    return null;
  }

  /** The attacker does not fit and is still outside the pocket. */
  private shields(attacker: FishNft, victim: FishNft, cover: ShelterState | null): boolean {
    if (!cover || !shelterAdmits(cover.kind, victim.size)) return false;
    if (shelterAdmits(cover.kind, attacker.size)) return false;
    return Math.hypot(attacker.x - cover.x, attacker.z - cover.z) > cover.inner + 1e-6;
  }

  private damageShelter(attacker: FishNft, shelter: ShelterState, now: number, via: string): number {
    const dmg = strikeDamage(attacker.bite, shelter.hpMax, attacker.size, "medium");
    shelter.hp = Math.max(0, shelter.hp - dmg);
    if (shelter.hp === 0) {
      shelter.downUntil = now + SHELTER_REBUILD_MS;
      this.pushFx({ kind: "collapse", x: shelter.x, z: shelter.z, text: "Collapsed", at: now });
      this.note(now, `${attacker.name} collapsed the ${shelter.kind}.`, attacker.id);
    } else {
      this.note(now, `${attacker.name} bit the ${shelter.kind} for ${dmg}. ${via} is covered.`, attacker.id);
    }
    return dmg;
  }

  private refreshShelters(now: number) {
    for (const shelter of this.shelters) {
      if (shelter.hp > 0 || now < shelter.downUntil) continue;
      shelter.hp = shelter.hpMax;
      shelter.downUntil = 0;
    }
  }

  /** One heal per fish per spring. Fish outside the sea stay hurt. */
  private touchSprings(now: number): boolean {
    const spring = springSlot(now);
    if (!spring) return false;
    let changed = false;
    for (const fish of this.fish) {
      if (!this.shown(fish)) continue;
      const key = `${fish.id}:${spring.born}`;
      if (this.springTouch.has(key)) continue;
      if (Math.hypot(fish.x - spring.x, fish.z - spring.z) > SPRING_RADIUS) continue;
      this.springTouch.add(key);
      const gain = Math.max(1, percentOf(fish.hpMax, SPRING_HEAL_PERCENT));
      const before = fish.hp;
      fish.hp = Math.min(fish.hpMax, fish.hp + gain);
      if (fish.hp <= before) continue;
      changed = true;
      this.pushFx({ kind: "heal", x: spring.x, z: spring.z, text: `+${fish.hp - before} HP`, at: now });
      this.note(now, `${fish.name} took a spring for ${fish.hp - before} HP.`);
    }
    return changed;
  }

  private growFromKill(attacker: FishNft, victim: FishNft, now: number) {
    if (!attacker.alive || attacker.burned) return;
    attacker.growth += growthGain(attacker.size, victim.size);
    const next = grownSize(attacker.size, attacker.growth);
    const sized = next !== attacker.size;
    attacker.size = next;
    const aspect = aspectFor(attacker.rarity, attacker.size, attacker.growth, attacker.evolved);
    const evolving = !attacker.evolved && aspect !== null;
    if (evolving && aspect) {
      attacker.evolved = true;
      attacker.aspect = aspect;
    }
    if (sized || evolving) this.writeStats(attacker);
    if (evolving && aspect) {
      this.pushFx({
        kind: "evolve",
        x: attacker.x,
        z: attacker.z,
        text: `${SPECIES[aspect].species}. Tier stays ${attacker.rarity}.`,
        at: now,
      });
      this.note(now, `${attacker.name} took the shape of ${SPECIES[aspect].species}. The tier stays ${attacker.rarity}.`);
    } else if (sized) {
      this.pushFx({ kind: "grow", x: attacker.x, z: attacker.z, text: attacker.size, at: now });
      this.note(now, `${attacker.name} grew ${attacker.size}.`);
    }
  }

  /** Size and the one aspect bump. Speed stays on the size table. HP keeps its ratio. */
  private writeStats(fish: FishNft) {
    const spec = SPECIES[fish.rarity];
    const stats = finalStats({
      bite: spec.bite,
      hp: spec.hp,
      speed: spec.speed,
      range: spec.range,
      trait: fish.trait,
      size: fish.size,
    });
    let bite = stats.bite;
    let hpMax = stats.hp;
    if (fish.evolved) {
      bite = roundStat((bite * 108) / 100);
      hpMax = roundStat((hpMax * 108) / 100);
    }
    const ratio = fish.hpMax > 0 ? fish.hp / fish.hpMax : 1;
    fish.bite = bite;
    fish.hpMax = hpMax;
    fish.speed = stats.speed;
    fish.range = stats.range;
    fish.dodge = stats.dodge;
    fish.hp = Math.min(hpMax, Math.max(1, Math.round(hpMax * ratio)));
  }

  private spawnRival(plan: (typeof RIVAL_PLAN)[number], now: number, clanId: string): boolean {
    const stake = plan.stakeGnot * 1_000_000;
    if (this.books.reserveGnot < stake) return false;
    this.books.reserveGnot -= stake;
    const ownerId = this.nextId("rival");
    if (!this.purses.has(ownerId)) this.purses.set(ownerId, wallet());
    const spot = RIVAL_SECTORS[this.fish.length % RIVAL_SECTORS.length];
    this.fish.push(
      this.makeFish({
        ownerId,
        name: plan.name,
        spec: SPECIES[plan.rarity],
        size: plan.size,
        trait: plan.trait,
        bodyUgnot: 0,
        poolUgnot: stake,
        ai: true,
        now,
        sx: spot.sx,
        sz: spot.sz,
        placed: true,
        clanId,
      }),
    );
    return true;
  }

  private makeFish(input: {
    ownerId: string;
    name: string;
    spec: Species;
    size: Size;
    trait: Trait;
    bodyUgnot: number;
    poolUgnot: number;
    ai: boolean;
    now: number;
    sx?: number;
    sz?: number;
    placed?: boolean;
    clanId?: string | null;
  }): FishNft {
    const stats = finalStats({
      bite: input.spec.bite,
      hp: input.spec.hp,
      speed: input.spec.speed,
      range: input.spec.range,
      trait: input.trait,
      size: input.size,
    });
    const sx = input.sx ?? 0;
    const sz = input.sz ?? 0;
    const center = sectorCenter(sx, sz);
    return {
      id: this.nextId("fish"),
      ownerId: input.ownerId,
      name: input.name,
      rarity: input.spec.rarity,
      species: input.spec.species,
      size: input.size,
      trait: input.trait,
      hpMax: stats.hp,
      hp: stats.hp,
      bite: stats.bite,
      speed: stats.speed,
      range: stats.range,
      dodge: stats.dodge,
      growth: 0,
      evolved: false,
      aspect: null,
      bouts: 0,
      boutMatchId: null,
      layBoutsUsed: 0,
      layCommitAt: null,
      bodyUgnot: input.bodyUgnot,
      poolUgnot: input.poolUgnot,
      alive: true,
      burned: false,
      ai: input.ai,
      mustHeal: false,
      downedAt: 0,
      respawnAt: 0,
      freeReviveDay: -1,
      healDay: ictDayIndex(input.now),
      healsUsed: 0,
      healReadyAt: 0,
      partyId: null,
      clanId: input.clanId ?? null,
      nextBiteAt: 0,
      burstUntil: 0,
      nextBurstAt: 0,
      streak: 0,
      matchId: null,
      swimId: null,
      lastCombatAt: 0,
      bittenById: null,
      bittenByUntil: 0,
      sx,
      sz,
      x: center.x,
      z: center.z,
      faceDx: 0,
      faceDz: -1,
      nextMoveAt: input.now,
      placed: input.placed ?? false,
    };
  }

  private sea(): Match | undefined {
    return this.matchById(SEA_ID);
  }

  /** Put a fish on the shared sea. Pool X is already on the NFT. */
  private seat(fish: FishNft) {
    const sea = this.sea();
    if (!sea || fish.matchId === SEA_ID) return;
    fish.matchId = SEA_ID;
    fish.swimId = this.nextId("swim");
    fish.streak = 0;
    fish.lastCombatAt = -1;
    sea.fishIds.push(fish.id);
  }

  private placeSwimmer(fish: FishNft) {
    fish.sx = 0;
    fish.sz = 1;
    fish.faceDx = 0;
    fish.faceDz = -1;
    fish.placed = true;
    fish.nextMoveAt = 0;
    const home = sectorCenter(fish.sx, fish.sz);
    fish.x = home.x;
    fish.z = home.z;
  }

  private matchById(id: string | null | undefined): Match | undefined {
    if (!id) return undefined;
    return this.matches.find((match) => match.id === id);
  }

  private markScore(id: string, field: "kills" | "downs") {
    const row = this.scores.get(id);
    if (row) {
      row[field] += 1;
      return;
    }
    this.scores.set(id, { kills: field === "kills" ? 1 : 0, downs: field === "downs" ? 1 : 0 });
  }

  private creditBout(fish: FishNft) {
    if (!fish.swimId || fish.boutMatchId === fish.swimId) return;
    fish.boutMatchId = fish.swimId;
    fish.bouts += 1;
  }

  private returnPool(fish: FishNft) {
    if (fish.poolUgnot > 0) {
      if (fish.chainPool) this.books.reserveGnot += fish.poolUgnot;
      else this.creditPurse(fish.ownerId, "gnot", fish.poolUgnot);
    }
    fish.poolUgnot = 0;
    fish.chainPool = false;
  }

  private burnFish(fish: FishNft) {
    fish.alive = false;
    fish.burned = true;
    fish.hp = 0;
    fish.matchId = null;
    if (fish.id === this.activeFishId) this.activeFishId = null;
  }

  private dropFromMatch(fish: FishNft, match: Match) {
    fish.matchId = null;
    fish.swimId = null;
    fish.streak = 0;
    match.fishIds = match.fishIds.filter((id) => id !== fish.id);
    this.returnCheers(fish.id);
  }

  private noteRoomHit(victim: FishNft): void {
    if (!victim.remoteAddress) return;
    this.roomHits.push({
      address: victim.remoteAddress,
      hp: victim.hp,
      alive: victim.alive && !victim.mustHeal,
    });
  }

  private dropRemote(fish: FishNft): void {
    const sea = this.sea();
    if (sea && fish.matchId === SEA_ID) this.dropFromMatch(fish, sea);
  }

  /** Reuse a chain fish for this wallet when one is already here. Pool goes back to the reserve. */
  private upsertRemote(seat: SeaPose): boolean {
    if (!isRarity(seat.rarity) || !isSize(seat.size) || !isTrait(seat.trait)) return false;
    let fish = this.fish.find((item) => !item.burned && item.remoteAddress === seat.address);
    if (!fish) {
      fish = this.fish.find((item) => !item.burned && !item.ai && item.ownerId === seat.address && item.ownerId !== PLAYER_ID);
    }
    let changed = false;
    if (!fish) {
      let name = seat.name.trim();
      if (!/^[A-Za-z0-9 ]{1,20}$/.test(name)) name = "Fish";
      if (this.fish.some((item) => item.name === name)) {
        const suffix = ` ${seat.address.slice(2, 6)}`;
        name = `${name.slice(0, Math.max(1, 20 - suffix.length))}${suffix}`.slice(0, 20);
      }
      const cell = sectorOf(seat.x, seat.z);
      fish = this.makeFish({
        ownerId: seat.address,
        name,
        spec: SPECIES[seat.rarity],
        size: seat.size,
        trait: seat.trait,
        bodyUgnot: 0,
        poolUgnot: 0,
        ai: false,
        now: 0,
        sx: cell.sx,
        sz: cell.sz,
        placed: true,
      });
      fish.remote = true;
      fish.remoteAddress = seat.address;
      this.fish.push(fish);
      changed = true;
    } else if (!fish.remote) {
      fish.remote = true;
      fish.remoteAddress = seat.address;
      fish.ai = false;
      changed = true;
    }
    if (fish.poolUgnot > 0) {
      this.books.reserveGnot += fish.poolUgnot;
      fish.poolUgnot = 0;
      changed = true;
    }
    if (fish.size !== seat.size) {
      fish.size = seat.size;
      this.writeStats(fish);
      changed = true;
    }
    fish.x = seat.x;
    fish.z = seat.z;
    fish.yaw = Math.atan2(-seat.fx, -seat.fz);
    const cell = sectorOf(seat.x, seat.z);
    fish.sx = cell.sx;
    fish.sz = cell.sz;
    const face = facingFromForward(seat.fx, seat.fz);
    fish.faceDx = face.dx;
    fish.faceDz = face.dz;
    fish.placed = true;
    const pending = this.roomHits.some((hit) => hit.address === seat.address);
    if (!seat.alive) {
      const showing = fish.matchId === SEA_ID;
      fish.mustHeal = true;
      fish.hp = Math.max(1, Math.min(fish.hp, percentOf(fish.hpMax, DEATH_HP_PERCENT)));
      fish.roomSeq = seat.seq;
      const sea = this.sea();
      if (sea && fish.matchId === SEA_ID) this.dropFromMatch(fish, sea);
      if (this.rememberSailor(seat.address, seat.sailor, false, countryFromCode(seat.country ?? "")?.name ?? "")) changed = true;
      return changed || showing;
    }
    if (!pending) {
      const hp = Math.max(0, Math.min(fish.hpMax, Math.round(seat.hp)));
      if (hp !== fish.hp) {
        fish.hp = hp;
        changed = true;
      }
    }
    fish.roomSeq = seat.seq;
    if (fish.mustHeal) {
      fish.mustHeal = false;
      changed = true;
    }
    if (fish.matchId !== SEA_ID) {
      this.seat(fish);
      changed = true;
    }
    if (this.rememberSailor(seat.address, seat.sailor, false, countryFromCode(seat.country ?? "")?.name ?? "")) changed = true;
    return changed;
  }

  /** Cheer deposits come back when that fish leaves or is downed. */
  private returnCheers(fishId: string) {
    for (const cheer of this.cheers) {
      if (cheer.returned || cheer.fishId !== fishId) continue;
      this.creditPurse(cheer.viewerId, cheer.asset, cheer.amount);
      cheer.returned = true;
    }
  }

  private requireOwn(fishId: string): { ok: true; fish: FishNft } | { ok: false; result: ActionResult } {
    const fish = this.fishById(fishId);
    if (!fish || fish.burned) return { ok: false, result: { ok: false, detail: "That fish is gone." } };
    if (fish.ownerId !== PLAYER_ID || fish.ai) {
      return { ok: false, result: { ok: false, detail: "You do not own that fish." } };
    }
    return { ok: true, fish };
  }

  private rollHealDay(fish: FishNft, now: number) {
    const day = ictDayIndex(now);
    if (fish.healDay !== day) {
      fish.healDay = day;
      fish.healsUsed = 0;
      fish.healReadyAt = 0;
    }
    if (fish.healsUsed >= HEALS_PER_DAY && fish.healReadyAt > 0 && now >= fish.healReadyAt) {
      fish.healsUsed = HEALS_PER_DAY - 1;
      fish.healReadyAt = 0;
    }
  }

  /** Seated fish in the killer's party. Burned fish are gone. A solo fish has no bonus. */
  private partySeats(attacker: FishNft): FishNft[] {
    if (!attacker.partyId) return [];
    const partyId = attacker.partyId;
    return this.fish.filter((fish) => !fish.burned && fish.partyId === partyId);
  }

  private moveReserveToPurse(id: string, asset: Asset, amount: number) {
    if (asset === "gnot") this.books.reserveGnot -= amount;
    else this.books.reserveFish -= amount;
    this.creditPurse(id, asset, amount);
  }

  private creditPurse(id: string, asset: Asset, amount: number) {
    if (amount === 0) return;
    let purse = this.purses.get(id);
    if (!purse) {
      purse = wallet();
      this.purses.set(id, purse);
    }
    if (asset === "gnot") purse.gnot += amount;
    else purse.fish += amount;
  }

  private seedSocial() {
    this.profiles.push({
      id: PLAYER_ID,
      username: "skipper",
      address: practiceAddress("skipper"),
      country: "Vietnam",
      crest: "wave",
    });
  }

  /** Practice names, chats, and the pending friend. Register calls this with the cast. */
  private seedCastSocial(now: number) {
    const crests: CrestId[] = ["wave", "reef", "moon", "sun", "fang", "shell", "wave", "reef"];
    const countries = ["Vietnam", "Korea", "Japan", "Brazil", "France", "Nigeria", "Canada", "Australia"];
    this.fish.forEach((fish, index) => {
      if (!fish.ai) return;
      const username = fish.name.toLowerCase();
      this.profiles.push({
        id: fish.ownerId,
        username,
        address: practiceAddress(username),
        country: countries[index % countries.length],
        crest: crests[index % crests.length],
      });
    });
    const pebble = this.fish.find((fish) => fish.name === "Pebble");
    const kelp = this.fish.find((fish) => fish.name === "Kelp");
    const current = this.fish.find((fish) => fish.name === "Current");
    if (pebble) {
      this.chats.push({
        id: this.nextId("chat"),
        channel: "world",
        roomId: "world",
        fromId: pebble.ownerId,
        text: "North sand is quiet.",
        at: now,
      });
    }
    if (kelp) {
      this.chats.push({
        id: this.nextId("chat"),
        channel: "world",
        roomId: "world",
        fromId: kelp.ownerId,
        text: "Reef is holding the east.",
        at: now,
      });
    }
    if (current) {
      this.friends.push({
        id: this.nextId("friend"),
        fromId: current.ownerId,
        toId: PLAYER_ID,
        status: "pending",
      });
    }
  }

  private walletOf(fish: FishNft): string {
    const raw = fish.ownerId === PLAYER_ID
      ? (this.profileById(PLAYER_ID)?.address || this.arcCrewSigner)
      : (fish.remoteAddress || fish.ownerId);
    const id = raw.trim().toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(id) ? id : "";
  }

  /** Put the Arc crew id on every fish whose wallet sits in it. */
  private stampArcCrew(): boolean {
    if (!this.arcCrewId) return false;
    const key = this.arcCrewId;
    let changed = false;
    for (const fish of this.fish) {
      if (fish.ai || fish.burned) continue;
      const owner = this.walletOf(fish);
      const inCrew = owner !== "" && this.arcCrew.has(owner);
      if (inCrew && fish.partyId !== key) {
        fish.partyId = key;
        changed = true;
      } else if (!inCrew && fish.partyId === key) {
        fish.partyId = null;
        changed = true;
      }
    }
    return changed;
  }

  private releaseChainFish() {
    const sea = this.sea();
    const kept: FishNft[] = [];
    for (const fish of this.fish) {
      if (!fish.onyxId) {
        kept.push(fish);
        continue;
      }
      if (sea && fish.matchId === SEA_ID) sea.fishIds = sea.fishIds.filter((id) => id !== fish.id);
      if (fish.poolUgnot > 0) {
        this.books.reserveGnot += fish.poolUgnot;
        fish.poolUgnot = 0;
      }
    }
    this.fish.splice(0, this.fish.length, ...kept);
    if (this.activeFishId && !this.fish.some((fish) => fish.id === this.activeFishId)) this.activeFishId = null;
  }

  private paintSpecies(fish: FishNft, rarity: Rarity, trait?: Trait): boolean {
    const spec = SPECIES[rarity];
    const nextTrait = trait ?? fish.trait;
    const lookSame = fish.rarity === spec.rarity && fish.species === spec.species && fish.aspect === null;
    const traitSame = fish.trait === nextTrait;
    if (lookSame && traitSame) return false;
    if (!traitSame) {
      fish.trait = nextTrait;
      this.writeStats(fish);
    }
    fish.rarity = spec.rarity;
    fish.species = spec.species;
    fish.aspect = null;
    return true;
  }

  private adoptChainFish(row: ChainFishRow, signer: string, now: number): "added" | "have" | "skip" | "paint" {
    if (!Number.isInteger(row.onyxId) || row.onyxId < 1) return "skip";
    const held = this.fish.find((fish) => fish.onyxId === row.onyxId);
    if (held) {
      held.image = row.image;
      held.collectionOnly = row.collectionOnly === true;
      return this.paintSpecies(held, row.rarity, row.trait) ? "paint" : "have";
    }
    if (!isRarity(row.rarity) || !isSize(row.size) || !isTrait(row.trait)) return "skip";
    const ownerKey = row.owner.trim().toLowerCase();
    const signerKey = signer.trim().toLowerCase();
    if (!seaWallet(ownerKey)) return "skip";
    if (ownerKey === signerKey) {
      const loose = this.fish.filter((fish) => fish.ownerId === PLAYER_ID && !fish.ai && !fish.burned && typeof fish.onyxId !== "number");
      if (loose.length === 1) {
        const fish = loose[0];
        const pool = row.inMatch ? Math.max(0, Math.trunc(row.poolUgnot)) : 0;
        const wantSeat = row.inMatch && fish.matchId !== SEA_ID;
        if (wantSeat && pool > 0 && fish.poolUgnot === 0 && pool > this.books.reserveGnot) return "skip";
        fish.onyxId = row.onyxId;
        fish.collectionOnly = row.collectionOnly === true;
        fish.image = row.image;
        this.paintSpecies(fish, row.rarity, row.trait);
        fish.bouts = Math.max(fish.bouts, Math.max(0, Math.trunc(row.bouts)));
        fish.onyxSwim = row.inMatch;
        if (wantSeat && pool > 0 && fish.poolUgnot === 0) {
          this.books.reserveGnot -= pool;
          fish.poolUgnot = pool;
          fish.chainPool = true;
          this.seat(fish);
          this.placeSwimmer(fish);
        } else if (wantSeat && fish.poolUgnot > 0) {
          this.seat(fish);
          this.placeSwimmer(fish);
        }
        return "added";
      }
    }
    const own = ownerKey === signerKey;
    const ownerId = own ? PLAYER_ID : ownerKey;
    const alreadySeated = row.inMatch && this.fish.some((fish) => fish.ownerId === ownerId && fish.matchId === SEA_ID);
    if (alreadySeated) return "skip";
    const pool = row.inMatch ? Math.max(0, Math.trunc(row.poolUgnot)) : 0;
    if (pool > this.books.reserveGnot) return "skip";
    this.books.reserveGnot -= pool;
    if (!this.purses.has(ownerId)) this.purses.set(ownerId, wallet());
    let name = row.name.trim();
    if (!/^[A-Za-z0-9 ]{1,20}$/.test(name)) name = `Fish ${row.onyxId}`;
    if (this.fish.some((fish) => fish.name === name)) {
      const suffix = ` ${row.onyxId}`;
      name = `${name.slice(0, Math.max(1, 20 - suffix.length))}${suffix}`.slice(0, 20);
    }
    const spot = row.inMatch && !own ? RIVAL_SECTORS[(row.onyxId - 1) % RIVAL_SECTORS.length] : undefined;
    const nft = this.makeFish({
      ownerId,
      name,
      spec: SPECIES[row.rarity],
      size: row.size,
      trait: row.trait,
      bodyUgnot: 0,
      poolUgnot: pool,
      ai: false,
      now,
      sx: spot?.sx,
      sz: spot?.sz,
      placed: Boolean(spot),
    });
    nft.bouts = Math.max(0, Math.trunc(row.bouts));
    nft.onyxId = row.onyxId;
    nft.collectionOnly = row.collectionOnly === true;
    nft.image = row.image;
    nft.onyxSwim = row.inMatch;
    if (pool > 0) nft.chainPool = true;
    this.fish.push(nft);
    if (row.inMatch) this.seat(nft);
    if (own && row.inMatch) this.placeSwimmer(nft);
    return "added";
  }

  private resolveProfile(who: string): Profile | undefined {
    const key = who.trim().toLowerCase();
    if (!key) return undefined;
    return this.profiles.find((profile) => profile.username === key || profile.address.toLowerCase() === key);
  }

  announce(text: string): void {
    const line = text.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 180);
    if (!line) return;
    this.note(Date.now(), line);
    this.emit();
  }

  private friendPair(link: FriendLink, a: string, b: string): boolean {
    return (link.fromId === a && link.toId === b) || (link.fromId === b && link.toId === a);
  }

  private note(at: number, text: string, attackerId?: string, victimId?: string) {
    this.log.unshift({ id: this.nextId("log"), text, at, attackerId, victimId });
    if (this.log.length > 8) this.log.pop();
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }
}

export function createPracticeGame(now = Date.now()): ShoalGame {
  return new ShoalGame(now);
}

/** A gno.land account or an Arc 0x account. Machine fish are not sea wallets. */
function seaWallet(value: string): boolean {
  const id = value.trim().toLowerCase();
  return /^g1[0-9a-z]{38}$/.test(id) || /^0x[0-9a-f]{40}$/.test(id);
}

function cleanName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 16) return null;
  return trimmed;
}
