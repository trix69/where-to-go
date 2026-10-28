/* Cloudflare Worker: the deployed transit proxy. Same contract and parser as proxy/server.mjs.
 *
 *   wrangler deploy --name where-to-go
 *   wrangler secret put TFNSW_KEY        # the key never enters the repo
 *
 * GET /trip?to=<address>&from=<address>|fromCoord=<lng>,<lat>
 */
import { fetchTrip } from "./core.mjs";

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

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return json(405, { ok: false, error: "method" });

    const url = new URL(request.url);
    if (url.pathname !== "/trip") return json(404, { ok: false, error: "not-found" });

    const to = (url.searchParams.get("to") || "").trim();
    const from = (url.searchParams.get("from") || "").trim();
    const coord = (url.searchParams.get("fromCoord") || "").trim();
    if (!to) return json(400, { ok: false, error: "no-destination" });

    let fromCoord;
    if (coord) {
      const [lng, lat] = coord.split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) fromCoord = { lng, lat };
    }
    if (!from && !fromCoord) return json(400, { ok: false, error: "no-origin" });

    const out = await fetchTrip({ key: env.TFNSW_KEY, to, from, fromCoord });
    return json(out.status || (out.ok ? 200 : 502), out);
  },
};
