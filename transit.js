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

import { CONFIG } from "./config.js";

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
    durationMin: 9 + (h % 26),      // 9–34 minutes
    walkToStopMin: h % 5,
    realtime: false,
    changes: 0,
  };
}

/**
 * @param {{address: string, name?: object}} place  destination
 * @param {{origin?: {coord?: {lng:number, lat:number}, address?: string}}} [opts]
 * @returns {Promise<{ok: true, provider: string, mode: string, line: string|number,
 *                    waitMin: number, durationMin: number, realtime: boolean, changes: number}>}
 */
export async function getTrip(place, opts = {}) {
  if (!place || !place.address) throw new Error("no-address");
  if (usingMock()) return mockTrip(place);

  const q = new URLSearchParams({ to: place.address });
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
  const dest = encodeURIComponent(place.address);
  // Unknown modes fall back to transit: this app exists for public transport, and "walking" as a
  // silent default sent a broken lookup's hand-off to a footpath.
  const transit = !["walk", "walking"].includes(mode);
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  if (isApple) return `https://maps.apple.com/?daddr=${dest}&dirflg=${transit ? "r" : "w"}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${transit ? "transit" : "walking"}`;
}
