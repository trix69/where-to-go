/* TfNSW Trip Planner adapter: request building and response parsing, no runtime assumptions.
 *
 * Runs unchanged in Node (proxy/server.mjs) and in a Cloudflare Worker (proxy/worker.js), so the
 * numbers the app shows are parsed in exactly one place. See PROJECT.md §7 for why TfNSW.
 *
 * Contract returned to the client (deliberately tiny — the app renders a sentence, not a table):
 *   { ok, provider, mode, line, waitMin, durationMin, departISO, realtime, walkToStopMin }
 */

const ENDPOINT = "https://api.transport.nsw.gov.au/v1/tp";

/** TfNSW wants lng:lat:EPSG, not lat,lng — the reversal is in the manual §7.2.1 and is a classic bug. */
export function tfCoord(lng, lat) {
  return `${Number(lng).toFixed(6)}:${Number(lat).toFixed(6)}:EPSG:4326`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** itdDate/itdTime are local Sydney wall-clock, not UTC. */
function sydneyStamp(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return { itdDate: `${get("year")}${get("month")}${get("day")}`, itdTime: `${get("hour")}${get("minute")}` };
}

/**
 * @param {{to: string, from?: string, fromCoord?: {lng: number, lat: number}, now?: Date}} q
 */
export function buildTripUrl({ to, from, fromCoord, now = new Date() }) {
  const { itdDate, itdTime } = sydneyStamp(now);
  const p = new URLSearchParams({
    outputFormat: "rapidJSON",
    coordOutputFormat: "EPSG:4326",
    depArrMacro: "dep",
    itdDate,
    itdTime,
    // `any` lets TfNSW geocode the saved address string; we never store coordinates.
    type_origin: fromCoord ? "coord" : "any",
    name_origin: fromCoord ? tfCoord(fromCoord.lng, fromCoord.lat) : from,
    type_destination: "any",
    name_destination: to,
    TfNSWTR: "true",
    calcNumberOfTrips: "3",
    version: "10.2.1.42",
  });
  return `${ENDPOINT}/trip?${p.toString()}`;
}

const MODE_BY_NAME = [
  ["metro", "metro"],
  ["light rail", "lightrail"],
  ["tram", "lightrail"],
  ["train", "train"],
  ["ferry", "ferry"],
  ["bus", "bus"],
  ["coach", "coach"],
];

function modeOf(leg) {
  const name = (leg?.transportation?.product?.name || "").toLowerCase();
  for (const [k, v] of MODE_BY_NAME) if (name.includes(k)) return v;
  const cls = leg?.transportation?.product?.class;
  if (cls === 1) return "train";
  if (cls === 5) return "coach";   // On Demand
  if (cls === 9) return "bus";
  if (cls === 99) return "walk";
  return "transit";
}

const isWalk = (leg) => modeOf(leg) === "walk" || (leg?.transportation?.product?.class === 99) || !leg?.transportation;

function when(time) {
  // HAFAS returns local time without a zone, e.g. "2026-10-29T08:42:00Z" where the Z is a lie.
  const d = new Date(String(time).replace(/Z$/, "+11:00"));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** First journey only: the app shows one answer. `journeys` is ordered earliest-departing first. */
export function summarise(json, now = new Date()) {
  const journey = json?.journeys?.[0];
  if (!journey?.legs?.length) return { ok: false, error: "no-route" };

  const legs = journey.legs;
  const firstRide = legs.find((l) => !isWalk(l));
  if (!firstRide) return { ok: false, error: "walk-only" };

  const depart = when(firstRide.origin?.departureTimeEstimated || firstRide.origin?.departureTimePlanned);
  const arriveRaw = legs[legs.length - 1].destination;
  const arrive = when(arriveRaw?.arrivalTimeEstimated || arriveRaw?.arrivalTimePlanned);
  const start = when(legs[0].origin?.departureTimeEstimated || legs[0].origin?.departureTimePlanned);
  if (!depart || !arrive || !start) return { ok: false, error: "no-times" };

  const mins = (a, b) => Math.max(0, Math.round((b - a) / 60000));
  return {
    ok: true,
    provider: "tfnsw",
    mode: modeOf(firstRide),
    line: firstRide.transportation?.number || firstRide.transportation?.disassembledName || "",
    waitMin: mins(now, depart),
    durationMin: mins(start, arrive),
    walkToStopMin: mins(start, depart) > 0 ? mins(start, depart) : 0,
    departISO: depart.toISOString(),
    realtime: Boolean(firstRide.origin?.departureTimeEstimated),
    changes: legs.filter((l) => !isWalk(l)).length - 1,
  };
}

/** TfNSW answers a bad key with an XML SOAP fault and HTTP 500, not a 401 — hence the sniffing. */
export async function fetchTrip({ key, to, from, fromCoord, now = new Date(), timeoutMs = 6000 }) {
  if (!key) return { ok: false, error: "no-key", status: 503 };
  const url = buildTripUrl({ to, from, fromCoord, now });
  let res;
  try {
    res = await fetch(url, {
      headers: { Authorization: `apikey ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { ok: false, error: e?.name === "TimeoutError" ? "timeout" : "network", status: 504 };
  }
  const body = await res.text();
  if (!res.ok) {
    const refused = /Policy Falsified|Invalid API|Missing API/i.test(body);
    return { ok: false, error: refused ? "bad-key" : `upstream-${res.status}`, status: refused ? 502 : 502 };
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, error: "bad-upstream-json", status: 502 };
  }
  const summary = summarise(json, now);
  if (!summary.ok) return { ...summary, status: 200 };
  return summary;
}
