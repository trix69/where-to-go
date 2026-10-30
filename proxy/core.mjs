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
 * @param {{from: {coord?: {lng: number, lat: number}, text?: string},
 *          to: {coord?: {lng: number, lat: number}, text?: string}, now?: Date}} q
 */
export function buildTripUrl({ from, to, now = new Date() }) {
  const { itdDate, itdTime } = sydneyStamp(now);
  const p = new URLSearchParams({
    outputFormat: "rapidJSON",
    coordOutputFormat: "EPSG:4326",
    depArrMacro: "dep",
    itdDate,
    itdTime,
    TfNSWTR: "true",
    calcNumberOfTrips: "3",
    version: "10.2.1.42",
  });
  // Coordinates when we have them (naming a stop or a geocoded address is exact); text otherwise.
  for (const [prefix, place] of [["origin", from], ["destination", to]]) {
    if (place?.coord) {
      p.set(`type_${prefix}`, "coord");
      p.set(`name_${prefix}`, tfCoord(place.coord.lng, place.coord.lat));
    } else {
      p.set(`type_${prefix}`, "any");
      p.set(`name_${prefix}`, place?.text || "");
    }
  }
  return `${ENDPOINT}/trip?${p.toString()}`;
}

/**
 * Geocode a saved address with stop_finder and return a coordinate.
 *
 * The trip endpoint cannot be trusted with a full postal address: "12 Crown Street, Sydney NSW 2000"
 * was answered by stop_finder with a school in Crows Nest, and as a `type_origin=any` string it
 * failed outright ("origin: ", code -8010). Resolving here first makes one round trip and lets us
 * report the name TfNSW matched, so a wrong match is visible instead of silently wrong.
 */
export async function resolvePlace({ key, text, timeoutMs = 6000 }) {
  const all = await resolvePlaces({ key, text, timeoutMs });
  return all[0] || null;
}

/**
 * The same lookup, keeping the runner-up matches.
 *
 * stop_finder is an autocomplete: it returns several candidates and the first is not always the right
 * one ("Centennial Park" came back as a park 258 km away). Returning up to three lets the helper pick
 * the address they meant instead of being told a confident wrong answer.
 */
export async function resolvePlaces({ key, text, timeoutMs = 6000, limit = 3 }) {
  if (!text) return [];
  const p = new URLSearchParams({
    outputFormat: "rapidJSON",
    coordOutputFormat: "EPSG:4326",
    type_sf: "any",
    name_sf: text,
    anyMaxSizeHitList: "3",
  });
  let res;
  try {
    res = await fetch(`${ENDPOINT}/stop_finder?${p.toString()}`, {
      headers: { Authorization: `apikey ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const json = await res.json().catch(() => null);
  // [lat, lng] in the response — the reverse of what the trip endpoint wants.
  return (json?.locations || [])
    .filter((l) => Array.isArray(l?.coord) && l.coord.length >= 2)
    .slice(0, limit)
    .map((l) => ({ coord: { lat: Number(l.coord[0]), lng: Number(l.coord[1]) }, name: l.name || text }));
}

const MODE_BY_NAME = [
  ["footpath", "walk"],
  ["walk", "walk"],
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
  if (cls === 5) return "bus";      // Sydney Buses Network
  if (cls === 9) return "bus";
  if (cls === 100) return "walk";   // footpath: a real product class, with a transportation block
  return "transit";
}

const isWalk = (leg) => !leg?.transportation || modeOf(leg) === "walk" || leg.transportation?.product?.class === 100;

function when(time) {
  // TfNSW rapidJSON returns UTC with a Z (verified against a live call: 21:09Z was 5 minutes away
  // at 08:04 Sydney). Read it as the ISO instant it is — the earlier code stripped the Z and pinned
  // +11:00, which turned a 5-minute wait into 13 hours.
  const s = String(time);
  const zoned = /[zZ]$|[+-]\d\d:?\d\d$/.test(s);
  const d = new Date(zoned ? s : `${s}+11:00`); // a naive stamp is Sydney wall-clock
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
  const ride = firstRide.transportation || {};
  const shortName = ride.disassembledName || ride.number || "";
  return {
    ok: true,
    provider: "tfnsw",
    mode: modeOf(firstRide),
    // disassembledName is the route short name ("M1", "343"); number can be the full line title
    // ("M1 Metro North West & Bankstown Line"), which does not fit a one-sentence answer.
    line: shortName.length <= 8 ? shortName : ride.number || shortName,
    waitMin: mins(now, depart),
    durationMin: mins(start, arrive),
    arriveISO: arrive.toISOString(),
    walkToStopMin: mins(start, depart) > 0 ? mins(start, depart) : 0,
    departISO: depart.toISOString(),
    realtime: Boolean(firstRide.origin?.departureTimeEstimated),
    changes: legs.filter((l) => !isWalk(l)).length - 1,
  };
}

/** TfNSW answers a bad key with an XML SOAP fault and HTTP 500, not a 401 — hence the sniffing. */
export async function fetchTrip({ key, to, from, fromCoord, toCoord, now = new Date(), timeoutMs = 6000 }) {
  if (!key) return { ok: false, error: "no-key", status: 503 };

  let origin = fromCoord ? { coord: fromCoord } : from ? { text: from } : null;
  let dest = toCoord ? { coord: toCoord } : to ? { text: to } : null;
  if (!origin) return { ok: false, error: "no-origin", status: 400 };
  if (!dest) return { ok: false, error: "no-destination", status: 400 };

  // Text endpoints are geocoded first; a coordinate is already exact.
  const [resolvedFrom, resolvedTo] = await Promise.all([
    origin.text ? resolvePlace({ key, text: origin.text, timeoutMs }) : null,
    dest.text ? resolvePlace({ key, text: dest.text, timeoutMs }) : null,
  ]);
  if (origin.text) {
    if (!resolvedFrom) return { ok: false, error: "origin-not-found", status: 200 };
    origin = { coord: resolvedFrom.coord };
  }
  if (dest.text) {
    if (!resolvedTo) return { ok: false, error: "place-not-found", status: 200 };
    dest = { coord: resolvedTo.coord };
  }

  const url = buildTripUrl({ from: origin, to: dest, now });
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
    return { ok: false, error: refused ? "bad-key" : `upstream-${res.status}`, status: 502 };
  }
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, error: "bad-upstream-json", status: 502 };
  }
  const summary = summarise(json, now);
  if (!summary.ok) {
    // TfNSW says why in systemMessages; keep its words, they are more useful than a bare code.
    const why = (json?.systemMessages || []).map((m) => m.text).filter(Boolean).join("; ");
    return { ...summary, upstream: why || undefined, status: 200 };
  }
  return { ...summary, resolvedName: resolvedTo?.name || undefined };
}
