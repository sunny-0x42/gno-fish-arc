import { useState } from "react";
import { useOnyxWallet } from "../chain/session";
import { formatFish } from "../sim/format";
import { PLAYER_ID } from "../sim/game";
import { SEASON0_POOL, season0Board, season0You, season0YouLine } from "./seasonPrize";
import {
  SEASON0_EARLIEST_MS,
  formatSeasonUtc,
  isDeployWallet,
  parseSeasonUtc,
  readSeasonWindow,
  seasonWindowError,
  seasonWindowLine,
  utcFields,
  writeSeasonWindow,
  type SeasonWindow,
} from "./seasonWindow";
import type { ShoalSnap } from "./useShoal";

/** Dates the deploy wallet can store in this browser. Anyone else only reads the window. */
function SeasonWindowForm({ stored, onStored }: { stored: SeasonWindow; onStored: (next: SeasonWindow) => void }) {
  const start = utcFields(stored.start);
  const end = stored.end === null ? { date: "", time: "" } : utcFields(stored.end);
  const [startDate, setStartDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [note, setNote] = useState("");
  return (
    <form className="season-window" onSubmit={(event) => {
      event.preventDefault();
      const startMs = parseSeasonUtc(startDate, startTime);
      const endMs = parseSeasonUtc(endDate, endTime);
      if (startMs === null || endMs === null) {
        setNote("Use a real UTC date and time.");
        return;
      }
      const error = seasonWindowError(startMs, endMs);
      if (error) {
        setNote(error);
        return;
      }
      const saved = writeSeasonWindow(startMs, endMs);
      if (!saved) {
        setNote("This browser did not store the window.");
        return;
      }
      onStored(saved);
      setNote("Season window saved in this browser.");
    }}>
      <div className="season-clock">
        <label>
          Start date UTC
          <input type="date" min="2026-10-08" value={startDate} aria-label="Season start date" onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          Start time UTC
          <input type="time" step={60} value={startTime} aria-label="Season start time" onChange={(event) => setStartTime(event.target.value)} />
        </label>
        <label>
          End date UTC
          <input type="date" min="2026-10-08" value={endDate} aria-label="Season end date" onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label>
          End time UTC
          <input type="time" step={60} value={endTime} aria-label="Season end time" onChange={(event) => setEndTime(event.target.value)} />
        </label>
      </div>
      <p className="readout">The earliest start is {formatSeasonUtc(SEASON0_EARLIEST_MS)}.</p>
      <button type="submit" className="primary">Save window</button>
      <p className="note" role="status" aria-live="polite">{note}</p>
    </form>
  );
}

/** Prize ladder for Season 0. The standing counts kills in this browser only. */
export function SeasonBoard({ snap, title = true }: { snap: ShoalSnap; title?: boolean }) {
  const you = season0You(snap.fish, snap.scores, snap.profiles, PLAYER_ID);
  const rows = season0Board(snap.fish, snap.scores, snap.profiles, PLAYER_ID);
  const wallet = useOnyxWallet();
  const [window, setWindow] = useState(readSeasonWindow);
  return (
    <section className={title ? "season-board" : "season-board is-nested"} aria-label="Season 0 — Beta">
      {title ? <h2>Season 0 — Beta</h2> : null}
      <p className="season-pool">{formatFish(SEASON0_POOL)} FISH<span>for the top 20 sailors</span></p>
      <p className="season-when">{seasonWindowLine(window)}</p>
      <p className="readout">
        Kills in this browser set the order, then fewer downs. This list is not a board across wallets.
        The 100,000 FISH on this table stays a draft. That prize is not minted as a payout, and a kill does not pay it.
        This table is a draft and FISH is not paid.
        The prize cannot be withdrawn from the FISH token.
        The deploy wallet sets the start and the end. Saving that window does not send a chain call.
      </p>
      {isDeployWallet(wallet.signer) ? <SeasonWindowForm stored={window} onStored={setWindow} /> : null}
      <p className="season-you">{season0YouLine(you)}</p>
      <table className="season-table">
        <caption className="sr-only">Season 0 — Beta, 100,000 FISH for the top 20</caption>
        <thead>
          <tr>
            <th scope="col">Place</th>
            <th scope="col">Sailor</th>
            <th scope="col">Kills</th>
            <th scope="col" className="prize">FISH</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.place} className={row.open ? "open" : row.yours ? "you" : undefined}>
              <td className="place">{row.place}</td>
              <td className="sailor">{row.name}</td>
              <td className="kills" title={row.open ? undefined : `${row.downs} ${row.downs === 1 ? "down" : "downs"}`}>
                {row.open ? "—" : row.kills}
              </td>
              <td className="prize">{formatFish(row.prize)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
