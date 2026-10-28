# Transit proxy

The app is a static site. The TfNSW Trip Planner API needs an `Authorization: apikey …` header and
sends no CORS headers, so a browser cannot call it directly — and a key in `app.js` would be public.
This proxy is the short piece of server in between: it holds the key, asks TfNSW, and returns the
small object the app renders.

Same file, two runtimes: `core.mjs` does the request building and parsing, `server.mjs` serves it
locally under Node, `worker.js` serves it as a Cloudflare Worker.

## Contract

```
GET /trip?to=<address>&from=<address>          # or &fromCoord=<lng>,<lat>
200 { ok: true, provider: "tfnsw", mode: "train"|"bus"|"ferry"|"lightrail"|"metro"|"coach",
      line: "343", waitMin: 4, durationMin: 22, walkToStopMin: 3, realtime: true, changes: 0,
      departISO: "2026-10-29T09:12:00.000Z" }
502 { ok: false, error: "bad-key" | "upstream-500" | "no-route" | "walk-only" | "no-times" | "timeout" }
503 { ok: false, error: "no-key" }
```

`waitMin` is minutes until the first vehicle leaves; `durationMin` is door to door, including the
walk at both ends. `changes` is the number of interchanges, so a later version can say "one change".

## Local

```bash
node proxy/server.mjs --sample      # no key needed: fixed numbers, provider "sample"
node proxy/server.mjs              # real calls; reads TFNSW_KEY or ~/.config/where-to-go/tfnsw.key
```

Then set `proxyBase: "http://127.0.0.1:8802"` in `config.js`, serve the site, and the app uses the
proxy instead of the mock.

## Deployed

```bash
npm i -g wrangler
wrangler deploy --name where-to-go --compatibility-date 2026-10-29   # from this directory
wrangler secret put TFNSW_KEY                                       # paste the key when prompted
```

Set `proxyBase` in `config.js` to the worker URL, e.g. `https://where-to-go.<account>.workers.dev`.
Free tier is 100k requests/day; Bronze TfNSW is 60,000 calls/day at 5/s, so the limit that matters is
TfNSW's, not Cloudflare's.

## Notes that cost time if forgotten

- TfNSW coordinates are `lng:lat:EPSG:4326`, not `lat,lng`.
- `itdDate`/`itdTime` are Sydney wall-clock, not UTC; `core.mjs` formats them in `Australia/Sydney`.
- A missing or wrong key returns **HTTP 500 with an XML SOAP fault** ("Policy Falsified"), not 401.
  The proxy sniffs the body and reports `bad-key` so the app does not blame the user's address.
- HAFAS times come back as local time with a `Z` suffix that means nothing; `core.mjs` strips it and
  pins `+11:00`.
