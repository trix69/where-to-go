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

  // "…, Sydney NSW 2021" is what people type and what stop_finder gets wrong most: the city token
  // pulls the match towards the CBD. Retrying once without it turns Centennial Park into the right
  // park (measured), so both variants are asked and their hits merged.
  const seen = new Set();
  const hits = [];
  for (const variant of variantsFor(text)) {
    for (const hit of await queryStopFinder({ key, text: variant, timeoutMs, limit })) {
      const key2 = `${hit.name}|${hit.coord.lat},${hit.coord.lng}`;
      if (seen.has(key2)) continue;
      seen.add(key2);
      hits.push(hit);
    }
  }
  // A hit in the suburb that was typed beats one in another suburb — that is the signal a word check
  // cannot give ("Centennial Park" shares both words with a park 15 km away).
  const typed = new Set(words(text));
  const local = (h) => (h.locality ? words(h.locality).some((w) => typed.has(w)) : false);
  return hits
    .map((h, i) => ({ h, i, rank: local(h) ? 0 : 1 }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, limit)
    .map(({ h }) => h);
}

/** The queries worth asking for one typed address: as typed, then with the city/state tail removed. */
export function variantsFor(text) {
  const t = String(text || "").trim();
  const stripped = t
    .replace(/,\s*(greater\s+)?(sydney|new south wales|nsw|australia)\b.*$/i, "")
    .replace(/\s+(greater\s+)?(sydney|new south wales|nsw|australia)\b.*$/i, "")
    .trim();
  return stripped && stripped.toLowerCase() !== t.toLowerCase() ? [t, stripped] : [t];
}

/** One stop_finder call. [lat, lng] in the response — the reverse of what the trip endpoint wants. */
async function queryStopFinder({ key, text, timeoutMs, limit }) {
  const p = new URLSearchParams({
    outputFormat: "rapidJSON",
    coordOutputFormat: "EPSG:4326",
    type_sf: "any",
    name_sf: text,
    anyMaxSizeHitList: String(Math.max(limit, 3)),
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
  return (json?.locations || [])
    .filter((l) => Array.isArray(l?.coord) && l.coord.length >= 2)
    .map((l) => ({
      coord: { lat: Number(l.coord[0]), lng: Number(l.coord[1]) },
      name: l.name || text,
      locality: l.parent?.name || l.properties?.mainLocality || "",
    }));
}

const WORD_STOP = new Set([
  "sydney", "nsw", "new", "south", "wales", "australia", "the", "and", "of",
  "street", "st", "road", "rd", "avenue", "ave", "drive", "dr", "lane", "ln", "place", "pl",
  "park", "parade", "pde", "highway", "hwy", "level", "shop", "suite", "unit",
]);

function words(s) {
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !WORD_STOP.has(w));
}

const MODE_BY_NAME = [
  ["footpath", "walk"],
  ["walk", "walk"],
  ["metro", "metro"],
  ["light rail", "lightrail"],
  ["tram", "lightrail"],
  ["train", "train"],
  // "ferr" not "ferry": the provider's own names are "Sydney Ferries Network" and "Private ferry and
  // fast ferry services" — one is plural, so the singular never matched it and a ferry became a bus.
  ["ferr", "ferry"],
  ["bus", "bus"],
  ["coach", "coach"],
];

function modeOf(leg) {
  const name = (leg?.transportation?.product?.name || "").toLowerCase();
  for (const [k, v] of MODE_BY_NAME) if (name.includes(k)) return v;
  // Measured against the provider, 2026-10-30: 1 Intercity/Sydney Trains, 2 Sydney Metro Network,
  // 4 Sydney Light Rail Network, 5 Sydney Buses Network, 9 Sydney Ferries Network, 100 footpath.
  const cls = leg?.transportation?.product?.class;
  if (cls === 1) return "train";
  if (cls === 2) return "metro";
  if (cls === 4) return "lightrail";
  if (cls === 5) return "bus";      // Sydney Buses Network
  if (cls === 9) return "ferry";    // Sydney Ferries Network — was "bus", which is how R37.1 shipped
  if (cls === 100) return "walk";   // footpath: a real product class, with a transportation block
  return "transit";
}

const isWalk = (leg) => !leg?.transportation || modeOf(leg) === "walk" || leg.transportation?.product?.class === 100;

/** Minutes east of UTC that Sydney is at a given instant (600 in AEST, 660 in AEDT). */
function sydneyOffsetMin(date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** A timestamp with no zone is Sydney wall-clock — read it through the real offset, not +11:00.
 *  DST is not optional arithmetic here: +11:00 in July is a 60-minute error, the same class of bug
 *  the Z fix removed. */
function naiveSydney(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // Two passes: the offset at the guessed instant is the one that applies to the wall clock.
  let t = wall - sydneyOffsetMin(new Date(wall)) * 60000;
  t = wall - sydneyOffsetMin(new Date(t)) * 60000;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function when(time) {
  // TfNSW rapidJSON returns UTC with a Z (verified against a live call: 21:09Z was 5 minutes away
  // at 08:04 Sydney). Read it as the ISO instant it is — the earlier code stripped the Z and pinned
  // +11:00, which turned a 5-minute wait into 13 hours.
  const s = String(time ?? "").trim();
  if (!s) return null;
  const zoned = /[zZ]$|[+-]\d\d:?\d\d$/.test(s);
  return zoned ? (Number.isNaN(new Date(s).getTime()) ? null : new Date(s)) : naiveSydney(s);
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

  /* Where to get on, how many stops, where to get off — the three things a person needs at the stop,
   * and the three the app used to leave out. `stopSequence` is the ride's own stop list, so the count
   * is its length minus the boarding stop rather than a guess. */
  const seq = Array.isArray(firstRide.stopSequence) ? firstRide.stopSequence : null;

  /* Stop names arrive with the mode baked in — "Town Hall Light Rail", "Town Hall Station, Platform 2" —
   * and the sentence already says 轻轨 L2, so the suffix is noise. The platform is kept, separately: on a
   * train it is the one number that tells you where to stand. */
  function stopOf(place, leg = firstRide) {
    const mode = modeOf(leg);
    let name = String(place?.disassembledName || place?.name || "").replace(/,\s*Sydney$/, "").trim();
    let platform = "";
    const m = /,\s*Platform\s+(\S+)$/i.exec(name);
    if (m) { platform = m[1]; name = name.slice(0, m.index); }
    if (mode === "lightrail" || mode === "metro") name = name.replace(/\s+(Light Rail|Metro)( Station)?$/i, "");
    if (mode === "train" || mode === "metro") name = name.replace(/\s+Station$/i, "");
    return { name: name.trim(), platform };
  }
  /* Every vehicle, not just the first: a journey with a change used to name one bus and then print a
   * door clock forty minutes later (R31.1). The card now says 换乘1次：先坐…，再坐…。 */
  const rides = legs.filter((l) => !isWalk(l)).map((l) => {
    const t = l.transportation || {};
    const short = t.disassembledName || t.number || "";
    const n = Array.isArray(l.stopSequence) ? l.stopSequence.length - 1 : null;
    return {
      mode: modeOf(l),
      line: short.length <= 8 ? short : t.number || short,
      towards: String(t.destination?.name || l.destination?.name || "").split(/\svia\s/i)[0],
      board: stopOf(l.origin, l).name,
      alight: stopOf(l.destination, l).name,
      stops: n && n > 0 ? n : null,
      departISO: when(l.origin?.departureTimeEstimated || l.origin?.departureTimePlanned)?.toISOString(),
      arriveISO: when(l.destination?.arrivalTimeEstimated || l.destination?.arrivalTimePlanned)?.toISOString(),
    };
  });

  const shortName = ride.disassembledName || ride.number || "";
  return {
    ok: true,
    provider: "tfnsw",
    mode: modeOf(firstRide),
    // disassembledName is the route short name ("M1", "343"); number can be the full line title
    // ("M1 Metro North West & Bankstown Line"), which does not fit a one-sentence answer.
    line: shortName.length <= 8 ? shortName : ride.number || shortName,
    // "CCN" is a line code, not a line number: for rail the useful words are where it goes.
    // "Richmond via Parramatta" is a timetable heading, not something to read out: keep the terminus.
    towards: String(ride.destination?.name || firstRide.destination?.name || "").split(/\svia\s/i)[0],
    // The moment the vehicle reaches the stop you get off at — distinct from the journey's arrival,
    // which includes the walk at the end.
    alightISO: when(firstRide.destination?.arrivalTimeEstimated || firstRide.destination?.arrivalTimePlanned)?.toISOString(),
    board: stopOf(firstRide.origin).name,
    boardPlatform: stopOf(firstRide.origin).platform,
    alight: stopOf(firstRide.destination).name,
    alightPlatform: stopOf(firstRide.destination).platform,
    stops: seq && seq.length > 1 ? seq.length - 1 : null,
    waitMin: mins(now, depart),
    durationMin: mins(start, arrive),   // door to door, from now
    rideMin: mins(depart, arrive),      // on board; waitMin + rideMin is what lands on arriveISO
    arriveISO: arrive.toISOString(),
    walkToStopMin: mins(start, depart) > 0 ? mins(start, depart) : 0,
    /* The last leg is usually a walk from the stop to the door. The arrival time has always included it
     * — it is the journey's own arrival — but the sentence did not say so, and a reader at the stop heard
     * "22:23到" as the tram's arrival at the stop they just got off at (Trix asked). */
    walkFromStopMin: isWalk(legs[legs.length - 1]) ? mins(when(legs[legs.length - 1].origin?.departureTimeEstimated || legs[legs.length - 1].origin?.departureTimePlanned), arrive) : 0,
    departISO: depart.toISOString(),
    realtime: Boolean(firstRide.origin?.departureTimeEstimated),
    changes: rides.length - 1,
    rides,
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
  return {
    ...summary,
    resolvedName: resolvedTo?.name || undefined,
    resolvedOriginName: resolvedFrom?.name || undefined,
  };
}
