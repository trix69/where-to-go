/* Local dev proxy. Same contract, same parsing as the deployed worker (proxy/core.mjs).
 *
 *   TFNSW_KEY=... node proxy/server.mjs            # real calls, port 8802
 *   node proxy/server.mjs --sample                 # no key: fixed sample numbers, provider "sample"
 *
 * The browser never sees the key: CORS is open for GET, the key is added here.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fetchTrip } from "./core.mjs";

const PORT = Number(process.env.PORT || 8802);
const SAMPLE = process.argv.includes("--sample");

function readKey() {
  if (process.env.TFNSW_KEY) return process.env.TFNSW_KEY.trim();
  for (const p of [join(homedir(), ".config", "where-to-go", "tfnsw.key")]) {
    try {
      const v = readFileSync(p, "utf8").trim();
      if (v) return v;
    } catch { /* not there, keep looking */ }
  }
  return "";
}

const KEY = readKey();
const CACHE = new Map(); // "from|to" -> { at, body }
const CACHE_MS = 20_000; // real-time data goes stale fast; 20 s only dedupes impatient double taps

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "accept",
  "Cache-Control": "no-store",
};

function send(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (url.pathname !== "/trip") return send(res, 404, { ok: false, error: "not-found" });

  const to = (url.searchParams.get("to") || "").trim();
  const from = (url.searchParams.get("from") || "").trim();
  const coord = (url.searchParams.get("fromCoord") || "").trim();
  if (!to) return send(res, 400, { ok: false, error: "no-destination" });

  let fromCoord;
  if (coord) {
    const [lng, lat] = coord.split(",").map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) fromCoord = { lng, lat };
  }
  if (!from && !fromCoord) return send(res, 400, { ok: false, error: "no-origin" });

  if (SAMPLE) {
    return send(res, 200, {
      ok: true, provider: "sample", mode: "bus", line: "343",
      waitMin: 4, durationMin: 22, walkToStopMin: 3, realtime: false, changes: 0,
      departISO: new Date(Date.now() + 4 * 60000).toISOString(),
    });
  }
  if (!KEY) return send(res, 503, { ok: false, error: "no-key" });

  const ck = `${from}|${fromCoord ? `${fromCoord.lng},${fromCoord.lat}` : ""}|${to}`;
  const hit = CACHE.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.body);

  const out = await fetchTrip({ key: KEY, to, from, fromCoord });
  if (out.ok) CACHE.set(ck, { at: Date.now(), body: out });
  send(res, out.status || (out.ok ? 200 : 502), out);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`proxy on http://127.0.0.1:${PORT} ${SAMPLE ? "(sample data)" : KEY ? "(key loaded)" : "(NO KEY — /trip will answer 503)"}`);
});
