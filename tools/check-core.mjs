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
import { readFileSync } from "node:fs";
import { buildTripUrl, buildReverseUrl, labelFor, parseReverse, summarise, tfCoord, variantsFor } from "../proxy/core.mjs";
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

/* A top-level binding whose name is also a browser global shadows it for the whole file, and the call
   that breaks is silent: `location.replace()` became "not a function" because `let location` held the
   geolocation fix, so 检查更新 told Trix 这里查不到 on every installed copy since 0.1.
 *
 * The list of globals is data from a real browser (tools/browser-globals.json, 991 identifiers), not a
 * hand-typed handful: the previous 31-name list passed `let fetch = null` and missed `let opener` in the
 * shipped file (R52.1, R52.2). */
{
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const { names: globals } = JSON.parse(readFileSync(new URL("./browser-globals.json", import.meta.url), "utf8"));
  const reserved = new Set("let const var function class async await if else for while return new typeof import export default switch case break continue do try catch finally throw in of delete void this super extends static get set true false null undefined".split(" "));
  const named = [...src.matchAll(/^(?:async\s+function|let|const|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map((m) => m[1]).filter((n) => !reserved.has(n));
  const set = new Set(globals);
  const clashes = [...new Set(named)].filter((n) => set.has(n));
  ok(`app.js shadows no browser global at top level (${set.size} globals checked)`, clashes.length === 0, clashes.join(", "));
}

/* Reverse geocoding: the map pin's label. Nominatim, because TfNSW's coord endpoint answers
   {"locations":[]} for every coordinate tried — Central Station included — and Photon answers from a home
   connection but not from Cloudflare's egress. */
{
  const url = buildReverseUrl({ lng: 151.1570123, lat: -33.8840567 });
  ok("reverse URL is a Nominatim request", url.startsWith("https://nominatim.openstreetmap.org/reverse?"), url);
  ok("reverse sends lat and lon, six decimals", url.includes("lat=-33.884057") && url.includes("lon=151.157012"), url);
  ok("reverse asks for building-level detail", url.includes("zoom=18") && url.includes("addressdetails=1"), url);

  const house = labelFor({ house_number: "12", road: "Norton Street", suburb: "Leichhardt" });
  ok("a house reads number, street, suburb", house?.name === "12 Norton Street, Leichhardt", JSON.stringify(house));
  const road = labelFor({ road: "George Street", city: "Parramatta" });
  ok("a road without a number still names the suburb", road?.name === "George Street, Parramatta", JSON.stringify(road));
  const stop = labelFor({ road: "Norton Street", suburb: "Leichhardt" }, "Norton St opp Leichhardt Public School");
  ok("a bus stop's name does not replace its road", stop?.name === "Norton Street, Leichhardt", JSON.stringify(stop));
  const park = labelFor({ leisure: "park", suburb: "Centennial Park" }, "The Rose Garden");
  ok("a park with no road uses its own name", park?.name === "The Rose Garden, Centennial Park", JSON.stringify(park));
  const same = labelFor({ amenity: "marketplace" }, "Leichhardt Marketplace");
  ok("the suburb is not repeated when the name already has it", same?.name === "Leichhardt Marketplace", JSON.stringify(same));
  ok("nothing at the point returns null, not a guess", labelFor({}, "") === null, JSON.stringify(labelFor({}, "")));
  ok("an error answer returns null", parseReverse({ error: "Unable to geocode" }) === null, JSON.stringify(parseReverse({ error: "Unable to geocode" })));
  const parsed = parseReverse({ lat: "-33.8840855", lon: "151.1570293",
    name: "Norton St opp Leichhardt Public School",
    address: { road: "Norton Street", suburb: "Leichhardt", house_number: "" } });
  ok("the parsed label keeps Nominatim's own coordinate",
    parsed?.name === "Norton Street, Leichhardt" && parsed.coord.lng === 151.1570293, JSON.stringify(parsed));
}

/* Both languages carry every key. A missing one is invisible in the source and shows as an empty button
   on the served build — which is how 取消 shipped blank for one deploy (2026-10-31). */
{
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const at = src.indexOf("const COPY = {");
  const enAt = src.indexOf("  en: {", at);
  const zhAt = src.indexOf('"zh-Hans": {', at);
  const endAt = src.indexOf("\n};", zhAt);
  const keysIn = (from, to) => new Set([...src.slice(from, to).matchAll(/^\s{4}([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]));
  const en = keysIn(enAt, zhAt);
  const zh = keysIn(zhAt, endAt);
  const missingZh = [...en].filter((k) => !zh.has(k));
  const missingEn = [...zh].filter((k) => !en.has(k));
  ok("every English copy key exists in Chinese", missingZh.length === 0, missingZh.join(", "));
  ok("every Chinese copy key exists in English", missingEn.length === 0, missingEn.join(", "));
  ok("the copy table is not empty", en.size > 50, String(en.size));
}

/* Every function the app calls has to exist. `6a0122a` deleted `arrivalFirstAtXl` while its call site
   stayed: the card threw on every paint, and `node --check` passed because the syntax is fine, the copy
   gate passed because the keys were there, and the test build served a dead answer card (R70.1). A name
   that is called but never declared is always a mistake in a single-file app like this one. */
{
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const blanked = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, " ")          // whole-line and trailing comments: "a locale we dropped (zh-Hant)" is not a call
    /* strings and templates too: `translate3d(...)`, `scale(...)` and a drawn sentence with a bracket are
       text, not calls, and reading them as calls is how this check would cry wolf until someone turned it
       off. */
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  const declared = new Set([
    ...[...blanked.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
    ...[...blanked.matchAll(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]),
    // names imported from transit.js and config.js are declared elsewhere on purpose
    ...[...blanked.matchAll(/import\s*\{([^}]*)\}\s*from/g)].flatMap((m) =>
      m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean)),
    // object-literal methods (`dropped(item) {`, `render() {`) are definitions, not calls
    ...[...blanked.matchAll(/^\s{2,}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)].map((m) => m[1]),
    // callback parameters: `(resolve) =>`, `(a, b) =>`, `async (opts) =>`, `x =>`
    ...[...blanked.matchAll(/\(([^()]*)\)\s*=>/g)].flatMap((m) =>
      m[1].split(",").map((x) => x.trim().replace(/^\.\.\./, "").split(/[=\s]/)[0]).filter(Boolean)),
  ]);
  /* Everything the platform provides that this app is allowed to call by bare name. Kept short and
     explicit: a name that has to be added here is a name somebody should look at. */
  const platform = new Set([
    "fetch", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
    "cancelAnimationFrame", "addEventListener", "removeEventListener", "getComputedStyle", "matchMedia",
    "structuredClone", "queueMicrotask", "btoa", "atob", "encodeURIComponent", "decodeURIComponent",
    "parseInt", "parseFloat", "isNaN", "isFinite", "alert", "confirm", "prompt", "open", "Number",
    "String", "Boolean", "Array", "Object", "Math", "Date", "JSON", "Map", "Set", "Promise", "URL",
    "URLSearchParams", "Intl", "RegExp", "Error", "TypeError", "Response", "Request", "Headers", "Blob",
    "AbortController", "TextEncoder", "TextDecoder", "CustomEvent", "Event", "Node", "Element", "if",
    "for", "while", "switch", "catch", "return", "typeof", "function", "await", "case", "do", "else",
    "try", "new", "delete", "void", "in", "of", "instanceof", "yield", "super", "import", "constructor",
    "async",
  ]);
  const ignored = new Set([...declared, ...platform]);
  const called = [...blanked.matchAll(/(?<![.\w$])([a-z_$][\w$]*)\s*\(/g)];
  const unknown = [...new Set(called.map((m) => m[1]))].filter((n) => !ignored.has(n));
  const where = unknown.slice(0, 6).map((n) => {
    const i = called.find((m) => m[1] === n).index;
    const line = blanked.slice(0, i).split("\n").length;
    return `${n} (app.js:${line})`;
  });
  ok("every function app.js calls is declared or a platform name", unknown.length === 0, where.join(", "));
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
