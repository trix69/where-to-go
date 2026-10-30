/* Transit lookups.
 *
 * One exported entry point, getTrip(), so the provider can be swapped without touching the UI.
 * Provider for v1 is TfNSW Trip Planner, Sydney only, reached through our own proxy (proxy/) so the
 * API key never ships to the browser. With no proxy configured the app falls back to a labelled
 * mock — the screen stays buildable before a key exists, and the stamp says so.
 *
 * Rule that outlives either provider: numbers come from the routing provider, never from a language
 * model. Localisation changes phrasing only.
 */

import { CONFIG } from "./config.js?v=1.4";

const MOCK_MODES = [
  { id: "bus", lines: [343, 372, 423, 428, 440] },
  { id: "train", lines: ["T4", "T1", "T2"] },
];

export const usingMock = () => !CONFIG.proxyBase;

/** Deterministic small hash, so the mock returns the same trip for the same place every time. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function mockTrip(place) {
  const h = hash(place.address.trim().toLowerCase());
  const mode = MOCK_MODES[h % MOCK_MODES.length];
  return {
    ok: true,
    provider: "mock",
    mode: mode.id,
    line: mode.lines[h % mode.lines.length],
    waitMin: 2 + (h % 11),          // 2–12 minutes
    durationMin: 9 + (h % 26),      // 9–34 minutes, door to door
    rideMin: 7 + (h % 22),          // on board; the sentence prints wait + ride
    arriveISO: new Date(Date.now() + (2 + (h % 11) + 9 + (h % 26)) * 60000).toISOString(),
    walkToStopMin: h % 5,
    realtime: false,
    changes: 0,
  };
}

/**
 * Every address the geocoder will own up to, best first.
 *
 * The helper picks from this list — nothing typed is ever stored as an address, because text that
 * merely looks like an address is what sent people to the wrong suburb. Setup time is the only place a
 * fuzzy string becomes exact, and it happens while a person is looking at the candidates.
 *
 * Returns [] in mock mode, when the provider is not TfNSW, or when nothing matched.
 */
export async function searchAddresses(text) {
  if (!text || !text.trim() || usingMock()) return [];
  const res = await fetch(`${CONFIG.proxyBase}/resolve?q=${encodeURIComponent(text.trim())}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  const body = await res.json().catch(() => null);
  // A sample or unknown provider must never hand back a coordinate: travel time trusts whatever is
  // stored here, so "sample" would leak invented data into a real answer (R6.4).
  if (!res.ok || !body || body.ok !== true || body.provider !== "tfnsw") return [];
  return [
    { name: body.name, coord: body.coord, locality: body.locality || "" },
    ...(Array.isArray(body.matches) ? body.matches : []),
  ].filter((m) => m && m.name && m.coord);
}

/**
 * What is at this point — the label under the map pin.
 *
 * Trix, after pinning Leichhardt Marketplace and getting "Flood Street, Leichhardt": a street name is
 * not where he pointed. Two sources are asked at once, because each knows something the other does not:
 *
 * - Photon names the *thing* — a mall, a shop, a park — which is what a person recognises. It is called
 *   from the browser because Cloudflare's egress gets nothing back from it;
 * - Nominatim (through our proxy) gives the clean street address, "12 Norton Street, Leichhardt".
 *
 * The name wins when there is one; the street becomes the second line under the pin and the fallback
 * when the point is only a road. Nothing is invented: no name and no street returns null, and the pin
 * still works, because a confirmed place travels on its coordinate.
 */
const POI_KEYS = new Set(["shop", "amenity", "leisure", "tourism", "building", "office", "craft", "man_made", "historic", "healthcare"]);

async function photonPlace(lat, lng) {
  try {
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1&lang=en`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) },
    );
    const body = await res.json().catch(() => null);
    const props = body && Array.isArray(body.features) && body.features[0] ? body.features[0].properties : null;
    if (!props || !props.name) return null;
    const key = String(props.osm_key || "").toLowerCase();
    // A street or a bare address is not a name; the proxy already describes those better.
    if (!POI_KEYS.has(key)) return null;
    return { name: String(props.name), suburb: String(props.district || props.city || props.locality || "") };
  } catch {
    return null;
  }
}

async function nominatimAddress(lat, lng) {
  if (usingMock()) return null;
  try {
    const res = await fetch(`${CONFIG.proxyBase}/reverse?coord=${lng},${lat}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok !== true || body.provider !== "osm") return null;
    return { name: String(body.name || ""), locality: String(body.locality || "") };
  } catch {
    return null;
  }
}

export async function reverseAddress(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const [poi, street] = await Promise.all([photonPlace(lat, lng), nominatimAddress(lat, lng)]);
  const suburb = (street && street.locality) || (poi && poi.suburb) || "";

  if (poi && poi.name) {
    // "MarketPlace Leichhardt", not "MarketPlace Leichhardt, Leichhardt".
    const name = suburb && !poi.name.toLowerCase().includes(suburb.toLowerCase())
      ? `${poi.name}, ${suburb}`
      : poi.name;
    return { name, poi: poi.name, street: (street && street.name) || "", locality: suburb };
  }
  if (street && street.name) return { name: street.name, poi: "", street: street.name, locality: suburb };
  return null;
}

/**
 * @param {{address: string, coord?: {lng: number, lat: number}, name?: object}} place  destination
 * @param {{origin?: {coord?: {lng:number, lat:number}, address?: string}}} [opts]
 * @returns {Promise<{ok: true, provider: string, mode: string, line: string|number,
 *                    waitMin: number, durationMin: number, realtime: boolean, changes: number}>}
 */
function metresBetween(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* Closer than this and there is no journey to describe: you are there. Also the threshold below which
 * asking the provider wastes a call to be told "walk-only". */
const ARRIVED_METRES = 200;

export async function getTrip(place, opts = {}) {
  if (!place || (!place.address && !place.coord)) throw new Error("no-address");
  const origin0 = opts.origin || {};
  if (place.coord && origin0.coord && Number.isFinite(place.coord.lat) && Number.isFinite(origin0.coord.lat)) {
    if (metresBetween(origin0.coord, place.coord) < ARRIVED_METRES) {
      return { ok: true, arrived: true, provider: "nearby", mode: "walk", line: "", waitMin: 0, rideMin: 0, durationMin: 0 };
    }
  }
  if (usingMock()) return mockTrip(place);

  const q = new URLSearchParams();
  // A confirmed place is sent as coordinates: no geocoding at travel time, nothing to get wrong.
  if (place.coord && Number.isFinite(place.coord.lng)) q.set("toCoord", `${place.coord.lng},${place.coord.lat}`);
  else q.set("to", place.address);
  const origin = opts.origin || {};
  if (origin.coord && Number.isFinite(origin.coord.lng)) {
    q.set("fromCoord", `${origin.coord.lng},${origin.coord.lat}`);
  } else if (origin.address) {
    q.set("from", origin.address);
  } else {
    throw new Error("no-origin");
  }

  const res = await fetch(`${CONFIG.proxyBase}/trip?${q.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(9000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    throw new Error((body && body.error) || `http-${res.status}`);
  }
  return body;
}

/**
 * Hand-off URLs. The app decides, then delegates — it never draws a map of its own.
 * Google's universal link needs no API key; Apple's maps.apple.com daddr works from any browser
 * and iOS routes it to the installed app when there is one.
 */
export function mapsUrl(place, mode) {
  // The trip is computed from the coordinate when there is one, so the hand-off has to be the same
  // point: address text and stored coordinate can name different parks, and the second tap then
  // contradicts the first (R5.3, R11.2).
  const coord = place.coord && Number.isFinite(place.coord.lat) && Number.isFinite(place.coord.lng);
  const dest = encodeURIComponent(coord ? `${place.coord.lat},${place.coord.lng}` : place.address);
  // Unknown modes fall back to transit: this app exists for public transport, and "walking" as a
  // silent default sent a broken lookup's hand-off to a footpath.
  const transit = !["walk", "walking"].includes(mode);
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  if (isApple) return `https://maps.apple.com/?daddr=${dest}&dirflg=${transit ? "r" : "w"}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${transit ? "transit" : "walking"}`;
}
