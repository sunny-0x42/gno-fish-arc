import type { ShoalGame } from "../sim/game";
import { acceptCountry } from "../sim/country";
import { isCrest } from "../sim/social";
import { storeSailor } from "../ui/sailorStore";
import { chainAddress } from "./session";
import { onyxEval } from "./onyxStatus";
import type { QEval } from "./seaRoster";
import { PROFILE_PKG } from "./realmCalls";

function gnoQuoted(data: string): string {
  const quoted = data.match(/"((?:\\.|[^"\\])*)"/);
  if (!quoted) return "";
  return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

export type ChainCard = {
  username: string;
  country: string;
  crest: string;
};

function panicked(log: string): boolean {
  return log.includes("panic");
}

/** Username, country, and crest already stored for this address. An empty card is null. */
export function chainCardFrom(
  usernameRow: { data: string; log: string },
  countryRow: { data: string; log: string },
  crestRow: { data: string; log: string },
): ChainCard | null {
  if (panicked(usernameRow.log)) return null;
  const username = gnoQuoted(usernameRow.data).trim().toLowerCase();
  if (!/^[a-z0-9]{3,16}$/.test(username)) return null;
  return {
    username,
    country: panicked(countryRow.log) ? "" : gnoQuoted(countryRow.data),
    crest: panicked(crestRow.log) ? "" : gnoQuoted(crestRow.data),
  };
}

export async function readChainCard(who: string, evalFn: QEval = onyxEval): Promise<ChainCard | null> {
  const signer = who.trim().toLowerCase();
  if (!chainAddress(signer)) return null;
  try {
    const [username, country, crest] = await Promise.all([
      evalFn(`${PROFILE_PKG}.UsernameOf("${signer}")`),
      evalFn(`${PROFILE_PKG}.CountryOf("${signer}")`),
      evalFn(`${PROFILE_PKG}.CrestOf("${signer}")`),
    ]);
    return chainCardFrom(username, country, crest);
  } catch {
    return null;
  }
}

/** Copy the Onyx sailor card onto this browser. A missing card leaves the saved name alone. */
export async function applyChainSailor(game: ShoalGame, who: string, evalFn: QEval = onyxEval): Promise<boolean> {
  const card = await readChainCard(who, evalFn);
  if (!card) return false;
  const current = game.profileById("player");
  const country = acceptCountry(card.country) ? card.country : current?.country ?? "Sea";
  const crest = isCrest(card.crest) ? card.crest : current?.crest ?? "wave";
  if (!game.adoptProfile(card.username, country, crest)) return false;
  storeSailor({ username: card.username, country, crest });
  return true;
}

/** Usernames for fish in the sea that belong to other wallets. */
export async function rememberSeaSailors(game: ShoalGame, owners: string[], evalFn: QEval = onyxEval): Promise<number> {
  const ids = [...new Set(owners.map((id) => id.trim().toLowerCase()))].filter((id) => chainAddress(id));
  const rows = await Promise.all(ids.map(async (id) => {
    try {
      const row = await evalFn(`${PROFILE_PKG}.UsernameOf("${id}")`);
      if (panicked(row.log)) return null;
      const username = gnoQuoted(row.data).trim().toLowerCase();
      return /^[a-z0-9]{3,16}$/.test(username) ? { id, username } : null;
    } catch {
      return null;
    }
  }));
  const found = rows.filter((row): row is { id: string; username: string } => row !== null);
  return game.rememberSailors(found);
}
