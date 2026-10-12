import type { Plugin } from "vite";
import { SeaRoom, type SeaChatIn, type SeaHit, type SeaKillIn, type SeaPose } from "./src/chain/seaRoom";

type SeaRequest = {
  method?: string;
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "end", listener: () => void): void;
  destroy(): void;
};

type SeaResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
};

/** Shared sea for every browser on this dev server. Production keeps the same room in api/sea.js. */
export function seaRoomPlugin(): Plugin {
  const room = new SeaRoom();
  const handle = (req: SeaRequest, res: SeaResponse) => {
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ seats: [], friends: [] }));
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end();
      return;
    }
    const chunks: Uint8Array[] = [];
    let size = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      if (size > 16_000) req.destroy();
    });
    req.on("end", () => {
      let body: {
        address?: string;
        pose?: SeaPose | null;
        hits?: SeaHit[];
        friends?: { to?: string; fromName?: string; kind?: string }[];
        chats?: SeaChatIn[];
        kills?: SeaKillIn[];
        boot?: string;
        bye?: boolean;
      } = {};
      try {
        body = JSON.parse(new TextDecoder().decode(concatBytes(chunks)) || "{}") as typeof body;
      } catch {
        res.statusCode = 400;
        res.end();
        return;
      }
      const friends = Array.isArray(body.friends)
        ? body.friends.filter((note) => typeof note?.to === "string").map((note) => ({ to: note.to ?? "", fromName: note.fromName ?? "", kind: note.kind ?? "" }))
        : [];
      const result = room.exchange(
        Date.now(),
        body.address ?? "",
        body.pose ?? null,
        Array.isArray(body.hits) ? body.hits : [],
        friends,
        Array.isArray(body.chats) ? body.chats : [],
        Array.isArray(body.kills) ? body.kills : [],
        body.boot ?? "",
        body.bye === true,
      );
      res.setHeader("content-type", "application/json");
      if (!result) {
        res.statusCode = 400;
        res.end(JSON.stringify({ seats: [], friends: [] }));
        return;
      }
      res.end(JSON.stringify(result));
    });
  };
  return {
    name: "shoal-sea-room",
    configureServer(server) {
      server.middlewares.use("/api/sea", handle as never);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/sea", handle as never);
    },
  };
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
