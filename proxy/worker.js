/* Cloudflare Worker: the deployed transit proxy. Same contract and parser as proxy/server.mjs.
 *
 *   wrangler deploy --name where-to-go
 *   wrangler secret put TFNSW_KEY        # the key never enters the repo
 *
 * GET /trip?to=<address>&from=<address>|fromCoord=<lng>,<lat>
 */
import { fetchTrip, resolvePlaces } from "./core.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*", // GET only, no credentials, no cookies: nothing to protect
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "accept",
  "Cache-Control": "no-store",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });

/* Who may call this: the two github.io origins and localhost. Not security — a Referer is trivially
 * forged — but it stops the URL being found and spent by anything that is not this app, which is the
 * failure that matters (the family's TfNSW quota). R7.5. */
const ALLOWED_HOSTS = [/^trix69\.github\.io$/, /^localhost(:\d+)?$/, /^127\.0\.0\.1(:\d+)?$/];

export function allowed(request) {
  const origin = request.headers.get("Origin") || "";
  const referer = request.headers.get("Referer") || "";
  let host = "";
  try {
    host = origin ? new URL(origin).host : referer ? new URL(referer).host : "";
  } catch { return false; }
  if (!host) return false;                       // no Origin and no Referer: not a browser page
  return ALLOWED_HOSTS.some((re) => re.test(host));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json(405, { ok: false, error: "method" });

    // curl and friends send neither header; that is the traffic this turns away.
    if (!allowed(request)) return json(403, { ok: false, error: "origin" });

    const url = new URL(request.url);

    // Setup-time geocoding: the helper screen shows the match and the person confirms it.
    if (url.pathname === "/resolve") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return json(400, { ok: false, error: "no-query" });
      const all = await resolvePlaces({ key: env.TFNSW_KEY, text: q });
      if (!all.length) return json(200, { ok: false, error: "not-found" });
      const [best, ...rest] = all;
      return json(200, {
        ok: true, provider: "tfnsw", name: best.name, coord: best.coord, locality: best.locality,
        matches: rest.map((m) => ({ name: m.name, coord: m.coord, locality: m.locality })),
      });
    }

    if (url.pathname !== "/trip") return json(404, { ok: false, error: "not-found" });

    const to = (url.searchParams.get("to") || "").trim();
    const from = (url.searchParams.get("from") || "").trim();
    const coord = (url.searchParams.get("fromCoord") || "").trim();
    const tc = (url.searchParams.get("toCoord") || "").trim();

    let toCoord;
    if (tc) {
      const [lng, lat] = tc.split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) toCoord = { lng, lat };
    }
    if (!to && !toCoord) return json(400, { ok: false, error: "no-destination" });

    let fromCoord;
    if (coord) {
      const [lng, lat] = coord.split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) fromCoord = { lng, lat };
    }
    if (!from && !fromCoord) return json(400, { ok: false, error: "no-origin" });

    const out = await fetchTrip({ key: env.TFNSW_KEY, to, from, fromCoord, toCoord });
    return json(out.status || (out.ok ? 200 : 502), out);
  },
};
