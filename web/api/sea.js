import { get, put, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { SeaRoom } from "./seaRoom.js";

/** Shared room for every browser on this site. The posted address is trusted. This is not a chain fight. */

const PATH = "shoal/room.json";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("cdn-cache-control", "no-store");
  if (req.method === "GET") {
    res.status(200).json({ seats: [], friends: [] });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    res.status(503).json({ seats: [], friends: [] });
    return;
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    res.status(400).end();
    return;
  }
  if (!body) {
    res.status(400).end();
    return;
  }
  const friends = Array.isArray(body.friends)
    ? body.friends
        .filter((note) => note && typeof note.to === "string")
        .map((note) => ({ to: note.to ?? "", fromName: note.fromName ?? "", kind: note.kind ?? "" }))
    : [];
  const hits = Array.isArray(body.hits) ? body.hits : [];
  const chats = Array.isArray(body.chats) ? body.chats : [];
  const kills = Array.isArray(body.kills) ? body.kills : [];
  try {
    const result = await exchangeRoom(Date.now(), body.address ?? "", body.pose ?? null, hits, friends, chats, kills, body.boot ?? "", body.bye === true);
    if (!result) {
      res.status(400).json({ seats: [], friends: [] });
      return;
    }
    res.status(200).json(result);
  } catch {
    res.status(503).json({ seats: [], friends: [] });
  }
}

async function exchangeRoom(now, address, pose, hits, friends, chats, kills, boot, bye) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const loaded = await loadRoom();
    const result = loaded.room.exchange(now, address, pose, hits, friends, chats, kills, boot, bye);
    if (!result) return null;
    try {
      await put(PATH, JSON.stringify(loaded.room.toJSON()), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(loaded.etag),
        cacheControlMaxAge: 60,
        contentType: "application/json",
        ...(loaded.etag ? { ifMatch: loaded.etag } : {}),
      });
      return result;
    } catch (error) {
      if (conflict(error)) continue;
      throw error;
    }
  }
  throw new Error("room busy");
}

async function loadRoom() {
  try {
    const loaded = await get(PATH, { access: "private", useCache: false });
    if (!loaded || loaded.statusCode !== 200 || !loaded.stream) return { room: new SeaRoom(), etag: null };
    const text = await new Response(loaded.stream).text();
    return { room: SeaRoom.fromJSON(text), etag: loaded.blob.etag || null };
  } catch (error) {
    if (error instanceof BlobNotFoundError || error?.name === "BlobNotFoundError") {
      return { room: new SeaRoom(), etag: null };
    }
    throw error;
  }
}

function conflict(error) {
  if (error instanceof BlobPreconditionFailedError || error?.name === "BlobPreconditionFailedError") return true;
  const message = String(error?.message ?? "");
  return /exist|precondition|412|409/i.test(message);
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
    size += bytes.length;
    if (size > 16_000) return null;
    chunks.push(bytes);
  }
  const out = new Uint8Array(chunks.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return JSON.parse(new TextDecoder().decode(out) || "{}");
}
