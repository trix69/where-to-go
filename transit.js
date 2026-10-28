/* Transit lookups.
 *
 * One exported entry point, getTrip(), so the provider can be swapped without touching the UI.
 * The provider for v1 is NOT chosen yet (PROJECT.md §7: Google Directions vs TfNSW vs
 * self-hosted OTP). Until it is, this file ships a deterministic MOCK so the screen can be built
 * and reviewed offline of any API key. `MOCK` is exported so the UI can label the numbers as
 * sample data — the app must never present invented times as if they were live.
 *
 * Rule that will outlive the mock: numbers come from the routing provider, never from a language
 * model. Localisation changes phrasing only.
 */

export const MOCK = true;

const MODES = [
  { id: "bus", lines: [343, 372, 423, 428, 440] },
  { id: "train", lines: [1, 2, 3] },
];

/** Deterministic small hash, so the mock returns the same trip for the same place every time. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * @param {{address: string, name: string}} place
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<{mode: string, line: number, waitMin: number, durationMin: number, provider: string}>}
 */
export async function getTrip(place, opts = {}) {
  if (!place || !place.address) throw new Error("no-address");
  if (MOCK) {
    const h = hash(place.address.trim().toLowerCase());
    const mode = MODES[h % MODES.length];
    return {
      mode: mode.id,
      line: mode.lines[h % mode.lines.length],
      waitMin: 2 + (h % 11),          // 2–12 minutes
      durationMin: 9 + (h % 26),      // 9–34 minutes
      provider: "mock",
    };
  }
  throw new Error("no-provider: choose one in PROJECT.md §7 before shipping");
}

/**
 * Hand-off URLs. The app decides, then delegates — it never draws a map of its own.
 * Google's universal link needs no API key; Apple's maps.apple.com daddr works from any browser
 * (iOS routes it to the installed app when there is one).
 */
export function mapsUrl(place, mode) {
  const dest = encodeURIComponent(place.address);
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent);
  if (isApple) {
    const flag = mode === "train" ? "r" : mode === "walk" ? "w" : "r";
    return `https://maps.apple.com/?daddr=${dest}&dirflg=${flag}`;
  }
  const travel = mode === "train" || mode === "bus" ? "transit" : "walking";
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${travel}`;
}
