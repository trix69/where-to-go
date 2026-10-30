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
import { buildTripUrl, summarise, tfCoord } from "../proxy/core.mjs";

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

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
