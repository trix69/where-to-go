#!/usr/bin/env node
/* Checks the TfNSW adapter without a network call or an API key: request shaping and response
 * parsing are pure functions, so they can be pinned down with synthetic fixtures.
 *
 *   node tools/check-core.mjs
 *
 * The fixture is written by hand from the published response schema (manual v3.2 §4), not captured
 * from the live API, so it proves the parser matches the documented shape — not that TfNSW still
 * returns that shape. That needs a real key.
 */
import { buildTripUrl, summarise, tfCoord, variantsFor } from "../proxy/core.mjs";
import { allowed } from "../proxy/worker.js";

let failures = 0;
const ok = (name, cond, detail) => {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/* --- request shape ------------------------------------------------------- */

const url = new URL(buildTripUrl({
  from: { coord: { lng: 151.20629, lat: -33.88408 } },
  to: { text: "Royal Prince Alfred Hospital, Camperdown NSW 2050" },
  now: new Date("2026-10-28T22:30:00Z"), // 09:30 next day in Sydney (AEDT)
}));

ok("endpoint is v1/tp/trip", url.origin + url.pathname === "https://api.transport.nsw.gov.au/v1/tp/trip");
ok("outputFormat=rapidJSON", url.searchParams.get("outputFormat") === "rapidJSON");
ok("depArrMacro=dep", url.searchParams.get("depArrMacro") === "dep");
ok("real-time asked for", url.searchParams.get("TfNSWTR") === "true");
ok("date in Sydney local time (AEDT +11 → 20261029)", url.searchParams.get("itdDate") === "20261029", url.searchParams.get("itdDate"));
ok("time in Sydney local time (22:30Z → 0930)", url.searchParams.get("itdTime") === "0930", url.searchParams.get("itdTime"));
ok("origin as coord, lng first", url.searchParams.get("name_origin") === "151.206290:-33.884080:EPSG:4326", url.searchParams.get("name_origin"));
ok("type_origin=coord", url.searchParams.get("type_origin") === "coord");
ok("destination geocoded from text", url.searchParams.get("type_destination") === "any");

const url2 = new URL(buildTripUrl({ to: { text: "Paddy's Markets" }, from: { text: "12 Crown Street Sydney" }, now: new Date("2026-10-29T00:00:00Z") }));
ok("address origin uses type_origin=any", url2.searchParams.get("type_origin") === "any");
ok("address origin does not send coords", url2.searchParams.get("name_origin") === "12 Crown Street Sydney");

ok("tfCoord reverses to lng:lat", tfCoord(151.2, -33.9) === "151.200000:-33.900000:EPSG:4326");

/* --- response parsing ---------------------------------------------------- */

const fixture = {
  journeys: [{
    legs: [
      {
        // walk to the stop: a transportation block of product class 100, name "footpath" (real shape)
        transportation: { number: null, product: { class: 100, name: "footpath" } },
        origin: { departureTimePlanned: "2026-10-29T21:00:00Z" },
        destination: { arrivalTimePlanned: "2026-10-29T21:05:00Z" },
      },
      {
        transportation: {
          number: "423",
          disassembledName: "423",
          product: { class: 5, name: "Sydney Buses Network" },
        },
        origin: { departureTimePlanned: "2026-10-29T21:05:00Z", departureTimeEstimated: "2026-10-29T21:08:00Z" },
        destination: { arrivalTimePlanned: "2026-10-29T21:30:00Z" },
      },
    ],
  }],
};

const t = summarise(fixture, new Date("2026-10-29T21:00:00Z"));
ok("parses a bus journey", t.ok === true, JSON.stringify(t));
ok("mode is bus", t.mode === "bus", t.mode);
ok("line is the route number", t.line === "423", String(t.line));
ok("footpath leg is not mistaken for a ride", t.mode === "bus", t.mode);
ok("wait measured to the real-time departure (8 min)", t.waitMin === 8, String(t.waitMin));
ok("duration is door to door, walk included (30 min)", t.durationMin === 30, String(t.durationMin));
ok("real-time flag set from departureTimeEstimated", t.realtime === true);
ok("arrival instant is returned for the clock line", t.arriveISO === "2026-10-29T21:30:00.000Z", String(t.arriveISO));
ok("changes counts non-walk legs minus one", t.changes === 0, String(t.changes));

const train = {
  journeys: [{
    legs: [{
      transportation: { number: "T4", product: { class: 1, name: "Train" } },
      origin: { departureTimePlanned: "2026-10-29T10:00:00Z" },
      destination: { arrivalTimePlanned: "2026-10-29T10:25:00Z" },
    }],
  }],
};
const tt = summarise(train, new Date("2026-10-29T09:55:00Z"));
ok("train detected by product name", tt.mode === "train", tt.mode);
ok("no walk leg still works", tt.ok === true && tt.waitMin === 5, JSON.stringify(tt));
ok("timetabled (not real-time) is reported as such", tt.realtime === false);

/* --- failure paths ------------------------------------------------------- */

ok("no journeys → no-route", summarise({}, new Date()).error === "no-route");
ok("walk-only journey is refused, not shown as a 0-minute bus", summarise({ journeys: [{ legs: [{ origin: { departureTimePlanned: "2026-10-29T09:30:00Z" }, destination: { arrivalTimePlanned: "2026-10-29T09:40:00Z" } }] }] }, new Date()).error === "walk-only");
ok("missing times → no-times", summarise({ journeys: [{ legs: [{ transportation: { product: { name: "Bus" } } }] }] }, new Date()).error === "no-times");


/* --- the numbers in the sentence have to agree with the clock beside them (R12.2) ------- */

{
  const j = {
    journeys: [{
      legs: [
        { origin: { departureTimePlanned: "2026-10-30T08:50:00Z" }, destination: { arrivalTimePlanned: "2026-10-30T08:53:00Z" } },
        {
          transportation: { number: "412", product: { class: 5, name: "Bus" } },
          origin: { departureTimeEstimated: "2026-10-30T08:53:00Z" },
          destination: { arrivalTimeEstimated: "2026-10-30T09:22:00Z" },
        },
      ],
    }],
  };
  const now = new Date("2026-10-30T08:46:00Z");
  const t = summarise(j, now);
  const mins = (iso) => Math.round((new Date(iso) - now) / 60000);
  ok("ride is departure → arrival (29 min)", t.rideMin === 29, String(t.rideMin));
  ok("wait + ride lands on the arrival clock (±1 min)",
    Math.abs(mins(t.arriveISO) - (t.waitMin + t.rideMin)) <= 1,
    `clock ${mins(t.arriveISO)}, wait ${t.waitMin} + ride ${t.rideMin}`);
  ok("door-to-door duration is still reported (08:50 → 09:22 = 32 min)", t.durationMin === 32, String(t.durationMin));
}

/* --- a naive timestamp is Sydney wall-clock in both halves of the year (R5.6) ----------- */

{
  const winter = summarise({ journeys: [{ legs: [{
    transportation: { number: "T4", product: { class: 1, name: "Train" } },
    origin: { departureTimePlanned: "2026-07-01T10:00:00" },      // AEDT off: +10:00
    destination: { arrivalTimePlanned: "2026-07-01T10:20:00" },
  }] }] }, new Date("2026-06-30T23:45:00Z"));
  ok("naive July stamp read as AEST (+10), so a 10:00 departure is 15 min away",
    winter.waitMin === 15, String(winter.waitMin));
  const summer = summarise({ journeys: [{ legs: [{
    transportation: { number: "T4", product: { class: 1, name: "Train" } },
    origin: { departureTimePlanned: "2026-12-01T10:00:00" },      // AEDT: +11:00
    destination: { arrivalTimePlanned: "2026-12-01T10:20:00" },
  }] }] }, new Date("2026-11-30T22:45:00Z"));
  ok("naive December stamp read as AEDT (+11), so a 10:00 departure is 15 min away",
    summer.waitMin === 15, String(summer.waitMin));
}

/* --- the address retry that makes the right park reachable (R5.4) ----------------------- */

ok("city token stripped for the retry",
  JSON.stringify(variantsFor("Centennial Park, Sydney NSW 2021")) === JSON.stringify(["Centennial Park, Sydney NSW 2021", "Centennial Park"]),
  JSON.stringify(variantsFor("Centennial Park, Sydney NSW 2021")));
ok("a bare place name is asked once, not twice",
  variantsFor("12 Crown Street").length === 1, JSON.stringify(variantsFor("12 Crown Street")));


/* --- the Worker only answers a browser page for this app (R7.5) -------------------------- */

const req = (headers) => ({ headers: { get: (k) => headers[k.toLowerCase()] || null } });
ok("github.io origin allowed", allowed(req({ origin: "https://trix69.github.io" })) === true);
ok("localhost origin allowed", allowed(req({ origin: "http://127.0.0.1:8807" })) === true);
ok("no Origin and no Referer is refused (curl, scrapers)",
  allowed(req({})) === false);
ok("another site is refused", allowed(req({ origin: "https://example.com" })) === false);
ok("a github.io referer still allowed when Origin is absent",
  allowed(req({ referer: "https://trix69.github.io/where-to-go-test/" })) === true);


/* --- where to get on, how far, where to get off (route detail) -------------------------- */

{
  const stop = (name, extra = {}) => ({ name, disassembledName: name, ...extra });
  const j = {
    journeys: [{
      legs: [
        { origin: { departureTimePlanned: "2026-10-30T08:50:00Z" }, destination: { arrivalTimePlanned: "2026-10-30T08:53:00Z" } },
        {
          transportation: { number: "T1", product: { class: 1, name: "Train" } },
          origin: {
            name: "Town Hall Station, Platform 2, Sydney", disassembledName: "Town Hall Station, Platform 2, Sydney",
            departureTimeEstimated: "2026-10-30T08:53:00Z",
          },
          destination: {
            name: "Parramatta Station, Platform 2, Sydney", disassembledName: "Parramatta Station, Platform 2, Sydney",
            arrivalTimeEstimated: "2026-10-30T09:22:00Z",
          },
          stopSequence: [stop("Town Hall"), stop("Central"), stop("Strathfield"), stop("Lidcombe"), stop("Parramatta")],
        },
      ],
    }],
  };
  const t = summarise(j, new Date("2026-10-30T08:46:00Z"));
  ok("boarding stop, without the mode suffix", t.board === "Town Hall", t.board);
  ok("platform kept apart from the name", t.boardPlatform === "2", String(t.boardPlatform));
  ok("alighting stop", t.alight === "Parramatta", t.alight);
  ok("stops travelled = stopSequence.length - 1", t.stops === 4, String(t.stops));
}

{
  // a provider (or the mock) without a stop list must not invent one
  const j = { journeys: [{ legs: [{
    transportation: { number: "343", product: { class: 5, name: "Bus" } },
    origin: { departureTimePlanned: "2026-10-30T08:50:00Z" },
    destination: { arrivalTimePlanned: "2026-10-30T09:10:00Z" },
  }] }] };
  const t = summarise(j, new Date("2026-10-30T08:46:00Z"));
  ok("no stopSequence → stops is null, not a guess", t.stops === null, String(t.stops));
}


/* --- the arrival time is the door, not the stop (R34) ----------------------------------- */

{
  const j = { journeys: [{ legs: [
    { origin: { departureTimePlanned: "2026-10-30T08:50:00Z" }, destination: { arrivalTimePlanned: "2026-10-30T08:53:00Z" } },
    {
      transportation: { number: "L1", product: { class: 4, name: "Light Rail" } },
      origin: { name: "Leichhardt North", departureTimeEstimated: "2026-10-30T08:53:00Z" },
      destination: { name: "Taverners Hill", arrivalTimeEstimated: "2026-10-30T09:05:00Z" },
      stopSequence: [{ name: "a" }, { name: "b" }, { name: "c" }, { name: "d" }],
    },
    { transportation: { product: { class: 100, name: "footpath" } },   // the walk to the door
      origin: { name: "Taverners Hill", departureTimeEstimated: "2026-10-30T09:05:00Z" },
      destination: { name: "12 Norton St, Leichhardt", arrivalTimeEstimated: "2026-10-30T09:08:00Z" } },
  ] }] };
  const t = summarise(j, new Date("2026-10-30T08:46:00Z"));
  ok("final walk measured (3 min)", t.walkFromStopMin === 3, String(t.walkFromStopMin));
  ok("arrival is the door, not the stop", t.arriveISO === "2026-10-30T09:08:00.000Z", String(t.arriveISO));
  ok("the vehicle's own arrival at the alighting stop is its own instant",
    t.alightISO === "2026-10-30T09:05:00.000Z", String(t.alightISO));
  ok("stops counted on the ride, not the walk", t.stops === 3, String(t.stops));
}


/* --- the provider's own product names map to the right noun (R37.1) ----------------------- */

{
  const leg = (cls, name, number) => ({ transportation: { number, product: { class: cls, name } } });
  const mode = (cls, name) => summarise({ journeys: [{ legs: [
    { transportation: { product: { class: 100, name: "footpath" } },
      origin: { name: "Home", departureTimeEstimated: "2026-10-29T23:46:00Z" },
      destination: { name: "A", arrivalTimeEstimated: "2026-10-29T23:50:00Z" } },
    { ...leg(cls, name, "X1"), origin: { name: "A", departureTimeEstimated: "2026-10-30T00:00:00Z" },
      destination: { name: "B", arrivalTimeEstimated: "2026-10-30T00:10:00Z" }, stopSequence: [{}, {}] },
  ] }] }, new Date("2026-10-29T23:50:00Z")).mode;

  ok("Sydney Ferries Network is a ferry", mode(9, "Sydney Ferries Network") === "ferry", mode(9, "Sydney Ferries Network"));
  ok("private ferry services are a ferry", mode(9, "Private ferry and fast ferry services") === "ferry",
    mode(9, "Private ferry and fast ferry services"));
  ok("Sydney Metro Network is metro", mode(2, "Sydney Metro Network") === "metro", mode(2, "Sydney Metro Network"));
  ok("Sydney Light Rail Network is light rail", mode(4, "Sydney Light Rail Network") === "lightrail",
    mode(4, "Sydney Light Rail Network"));
  ok("Sydney Buses Network is a bus", mode(5, "Sydney Buses Network") === "bus", mode(5, "Sydney Buses Network"));
}


/* --- every vehicle is returned, so a changed journey can be described (R31.1) ------------- */

{
  const ride = (cls, name, number, o, d, from, to, stops) => ({
    transportation: { number, product: { class: cls, name } },
    origin: { name: from, departureTimeEstimated: o },
    destination: { name: to, arrivalTimeEstimated: d },
    stopSequence: Array.from({ length: stops + 1 }, (_, i) => ({ name: "s" + i })),
  });
  const j = { journeys: [{ legs: [
    { transportation: { product: { class: 100, name: "footpath" } },
      origin: { name: "Door", departureTimeEstimated: "2026-10-30T08:00:00Z" },
      destination: { name: "Randwick", arrivalTimeEstimated: "2026-10-30T08:04:00Z" } },
    ride(4, "Sydney Light Rail Network", "L2", "2026-10-30T08:05:00Z", "2026-10-30T08:20:00Z", "Randwick", "Central Chalmers Street", 6),
    { transportation: { product: { class: 100, name: "footpath" } },
      origin: { name: "Central Chalmers Street", departureTimeEstimated: "2026-10-30T08:20:00Z" },
      destination: { name: "Central", arrivalTimeEstimated: "2026-10-30T08:25:00Z" } },
    ride(1, "Sydney Trains Network", "T1", "2026-10-30T08:30:00Z", "2026-10-30T09:10:00Z", "Central", "Parramatta", 15),
    { transportation: { product: { class: 100, name: "footpath" } },
      origin: { name: "Parramatta", departureTimeEstimated: "2026-10-30T09:10:00Z" },
      destination: { name: "Door", arrivalTimeEstimated: "2026-10-30T09:22:00Z" } },
  ] }] };
  const t = summarise(j, new Date("2026-10-30T07:55:00Z"));
  ok("both rides are returned", Array.isArray(t.rides) && t.rides.length === 2, String(t.rides?.length));
  ok("second ride keeps its own line and stop", t.rides?.[1]?.line === "T1" && t.rides?.[1]?.alight === "Parramatta",
    JSON.stringify(t.rides?.[1]));
  ok("changes counts the vehicles, not the legs", t.changes === 1, String(t.changes));
  ok("the first ride still drives the headline fields", t.line === "L2" && t.mode === "lightrail", `${t.line}/${t.mode}`);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
