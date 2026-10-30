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
import { fetchTrip, resolvePlace, resolvePlaces } from "./core.mjs";

const PORT = Number(process.env.PORT || 8802);
const SAMPLE = process.argv.includes("--sample");

function readKey() {
  if (process.env.TFNSW_KEY) return process.env.TFNSW_KEY.trim();
  // A plain key file, or an env file in ~/projects (the shape the other projects' secrets use).
  for (const p of [join(homedir(), ".config", "where-to-go", "tfnsw.key"), join(homedir(), "projects", "tfnsw.env")]) {
    try {
      const raw = readFileSync(p, "utf8");
      const m = raw.match(/^\s*TFNSW_KEY\s*=\s*(.+?)\s*$/m);
      const v = (m ? m[1] : raw).replace(/^["']|["']$/g, "").trim();
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

  // /resolve?q=<address> — used by the helper screen while a place is being set up, where a human can
  // see and correct the match. Deliberately not called at travel time.
  if (url.pathname === "/resolve") {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return send(res, 400, { ok: false, error: "no-query" });
    // Sample mode must not look like a real match: a stored coordinate is what travel time trusts,
    // and one invented Sydney point per address is sample data escaping its stamp (R6.4).
    if (SAMPLE) return send(res, 200, { ok: false, error: "sample", provider: "sample" });
    if (!KEY) return send(res, 503, { ok: false, error: "no-key" });
    const all = await resolvePlaces({ key: KEY, text: q });
    if (!all.length) return send(res, 200, { ok: false, error: "not-found" });
    const [best, ...rest] = all;
    return send(res, 200, {
      ok: true, provider: "tfnsw", name: best.name, coord: best.coord, locality: best.locality,
      matches: rest.map((m) => ({ name: m.name, coord: m.coord, locality: m.locality })),
    });
  }

  if (url.pathname !== "/trip") return send(res, 404, { ok: false, error: "not-found" });

  const to = (url.searchParams.get("to") || "").trim();
  const from = (url.searchParams.get("from") || "").trim();
  const coord = (url.searchParams.get("fromCoord") || "").trim();
  const tc = (url.searchParams.get("toCoord") || "").trim();

  let toCoord;
  if (tc) {
    const [lng, lat] = tc.split(",").map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) toCoord = { lng, lat };
  }
  if (!to && !toCoord) return send(res, 400, { ok: false, error: "no-destination" });

  let fromCoord;
  if (coord) {
    const [lng, lat] = coord.split(",").map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) fromCoord = { lng, lat };
  }
  if (!from && !fromCoord) return send(res, 400, { ok: false, error: "no-origin" });
  if (SAMPLE) {
    return send(res, 200, {
      ok: true, provider: "sample", mode: "bus", line: "343",
      waitMin: 4, durationMin: 22, rideMin: 18, walkToStopMin: 3, realtime: false, changes: 0,
      departISO: new Date(Date.now() + 4 * 60000).toISOString(),
    });
  }
  if (!KEY) return send(res, 503, { ok: false, error: "no-key" });

  const ck = `${from}|${fromCoord ? `${fromCoord.lng},${fromCoord.lat}` : ""}|${to}|${toCoord ? `${toCoord.lng},${toCoord.lat}` : ""}`;
  const hit = CACHE.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.body);

  const out = await fetchTrip({ key: KEY, to, from, fromCoord, toCoord });
  if (out.ok) CACHE.set(ck, { at: Date.now(), body: out });
  send(res, out.status || (out.ok ? 200 : 502), out);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`proxy on http://127.0.0.1:${PORT} ${SAMPLE ? "(sample data)" : KEY ? "(key loaded)" : "(NO KEY — /trip will answer 503)"}`);
});
