/* Where To Go — Where to? · 想去哪儿
 *
 * Two screens for the traveller (tiles, answer) and one for whoever sets it up (places, language).
 * No framework, no build step, no network beyond the transit lookup.
 */

import { getTrip, mapsUrl, usingMock, resolveAddress } from "./transit.js?v=0.1";

const STORE = "whereToGo.v1";

/* ---------- copy ----------
 * Three locales. The summary is assembled from a template, never machine-translated at runtime,
 * so the numbers a user reads are the numbers the provider returned.
 */
const COPY = {
  en: {
    ask: "Where to?",
    settings: "Settings",
    back: "Back",
    places: "Places",
    add: "Add a place",
    done: "Done",
    delete: "Delete",
    name: "Name",
    address: "Address",
    glyph: "Symbol",
    openMaps: "Open in Maps",
    looking: "Checking…",
    locating: "Getting your location…",
    locationOff: "Location is off. Allow it for this app, then try again.",
    locationFailed: "Couldn't get your location. Try again.",
    useMyLocation: "Use my location",
    fromHome: "From home",
    fromPlace: (n) => `From ${n}`,
    chooseOrigin: "Where are you starting from?",
    storageWarn: "This browser isn't saving changes (private browsing?). Places will be lost when you close the tab.",
    demo: "SAMPLE DATA — no live transit yet",
    trip: (t) =>
      `${t.mode in COPY.en.modes ? COPY.en.modes[t.mode] : "Bus"} ${t.line} in ${t.waitMin} min, ${t.durationMin} min to get there.`,
    modes: { bus: "Bus", train: "Train", ferry: "Ferry", lightrail: "Light rail", metro: "Metro", coach: "Coach" },
    failed: "No answer right now.",
    stillGo: "Open in Maps anyway",
    needAddress: "Add an address first.",
    noOrigin: "Add a starting place first.",
    resolving: "Looking up the address…",
    matched: (n) => `Routes to: ${n}`,
    checkMatch: (n, km) => `Check this: ${n}${km ? ` (${km} km away)` : ""}`,
    notFound: "Nothing matched — check the address",
    versionLabel: "Version",
    checkUpdates: "Check for updates",
    checking: "Checking…",
    upToDate: "Up to date",
    updating: (v) => `Updating to ${v}…`,
    cantCheck: "Can't check here",
    offline: "No internet — can't check",
  },
  "zh-Hans": {
    ask: "想去哪儿?",
    settings: "设置",
    back: "返回",
    places: "我的地方",
    add: "添加地方",
    done: "完成",
    delete: "删除",
    name: "名字",
    address: "地址",
    glyph: "图标",
    openMaps: "打开地图",
    looking: "正在查询…",
    locating: "正在获取您的位置…",
    locationOff: "定位已关闭。请允许定位，再试一次。",
    locationFailed: "暂时定位不到，请重试。",
    useMyLocation: "使用我的位置",
    fromHome: "从家出发",
    fromPlace: (n) => `从${n}出发`,
    chooseOrigin: "从哪里出发？",
    storageWarn: "当前浏览器无法保存（无痕浏览？）。关闭后这些地点会丢失。",
    demo: "示例数据 — 还没接实时公交",
    // "路" is the bus-route suffix; a train line takes "号线", and ferry/light-rail numbers take neither.
    trip: (t) => {
      const word = COPY["zh-Hans"].modes[t.mode] || "公交";
      const ride = t.mode === "train" ? `${t.line}号线`
        : t.mode === "bus" || t.mode === "coach" ? `${word}${t.line}路`
        : `${word}${t.line}`;
      return `坐${ride}，${t.waitMin}分钟后有车，路上大约${t.durationMin}分钟。`;
    },
    modes: { bus: "公交", train: "火车", ferry: "渡轮", lightrail: "轻轨", metro: "地铁", coach: "巴士" },
    failed: "现在查不到。",
    stillGo: "还是打开地图",
    needAddress: "请先填地址。",
    noOrigin: "请先填出发点。",
    resolving: "正在查找地址…",
    matched: (n) => `将到：${n}`,
    checkMatch: (n, km) => `请确认：${n}${km ? `（约${km}公里）` : ""}`,
    notFound: "找不到这个地址，请检查",
    versionLabel: "版本",
    checkUpdates: "检查更新",
    checking: "正在检查…",
    upToDate: "已是最新版本",
    updating: (v) => `正在更新到 ${v}…`,
    cantCheck: "这里查不到",
    offline: "没有网络，无法检查",
  },
};

const LANGS = [
  { id: "zh-Hans", label: "简体中文" },
  { id: "en", label: "English" },
];

const SEED = [
  { id: "home", name: { en: "Home", "zh-Hans": "家" }, glyph: "🏠", address: "12 Crown Street, Sydney NSW 2000" },
  { id: "doctor", name: { en: "Doctor", "zh-Hans": "医生" }, glyph: "🏥", address: "Royal Prince Alfred Hospital, Missenden Road, Camperdown NSW 2050" },
  { id: "market", name: { en: "Market", "zh-Hans": "市场" }, glyph: "🛒", address: "Paddy's Markets, 9-13 Hay Street, Haymarket NSW 2000" },
  { id: "daughter", name: { en: "Daughter's", "zh-Hans": "女儿家" }, glyph: "👨‍👩‍👧", address: "8 Belmore Road, Randwick NSW 2031" },
  { id: "school", name: { en: "School", "zh-Hans": "学校" }, glyph: "🏫", address: "Randwick Public School, Cowper Street, Randwick NSW 2031" },
  { id: "park", name: { en: "Park", "zh-Hans": "公园" }, glyph: "🌳", address: "Centennial Park, Sydney NSW 2021" },
];

// Bumped when a preset is added, so an existing set of places picks it up without a wipe.
const SEED_VERSION = 2;

/** Add presets introduced since this browser's places were saved, keeping tile order. */
function ensureDefaults(stored) {
  if ((stored.seedVersion || 1) >= SEED_VERSION) return stored;
  const have = new Set(stored.places.map((p) => p.id));
  for (const p of SEED) if (!have.has(p.id)) stored.places.push({ ...p });
  // Presets keep their declared order; anything the helper added stays after them.
  const rank = new Map(SEED.map((p, i) => [p.id, i]));
  stored.places.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : SEED.length) - (rank.has(b.id) ? rank.get(b.id) : SEED.length));
  stored.seedVersion = SEED_VERSION;
  return stored;
}

/* ---------- state ---------- */

/* The app opens in Simplified Chinese for everyone: the audience is Chinese-speaking elders, and a
 * device set to English by a son or daughter must not leave the parent with an English screen.
 * The helper screen switches to English. */
const DEFAULT_LANG = "zh-Hans";

function pickLang() {
  return DEFAULT_LANG;
}

let storageOk = true;
let state = load();
// ensureDefaults() can add a preset to a stored set; persist that immediately, not on the next edit.
save();

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.places)) {
        if (!COPY[s.lang]) s.lang = DEFAULT_LANG;   // a locale we dropped (zh-Hant) or a typo
        return ensureDefaults(s);
      }
    }
  } catch (e) { /* private mode, corrupt value: fall through to the seed */ }
  return { lang: pickLang(), seedVersion: SEED_VERSION, places: SEED.map((p) => ({ ...p })) };
}

function save() {
  // Private browsing (iOS Safari especially) throws on write. Swallowing that silently is how a
  // helper spends ten minutes setting up places that vanish — so the failure is recorded and shown.
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
}

const t = () => COPY[state.lang] || COPY[DEFAULT_LANG];
const nameOf = (place) => (place.name && (place.name[state.lang] || place.name.en)) || place.address;

/* ---------- elements ---------- */

const $ = (id) => document.getElementById(id);
const el = {
  ask: $("ask"),
  gear: $("settingsBtn"),
  tiles: $("tiles"),
  sheet: $("sheet"),
  sheetTitle: $("sheetTitle"),
  summary: $("summary"),
  stamp: $("stamp"),
  go: $("goBtn"),
  closeSheet: $("closeSheet"),
  retryLoc: $("retryLoc"),
  storageWarn: $("storageWarn"),
  originChoices: $("originChoices"),
  originAsk: $("originAsk"),
  originList: $("originList"),
  manage: $("manage"),
  manageTitle: $("manageTitle"),
  langRow: $("langRow"),
  places: $("places"),
  addBtn: $("addBtn"),
  closeManage: $("closeManage"),
  verBtn: $("verBtn"),
  verMsg: $("verMsg"),
  verLabel: $("verLabel"),
  appVersion: $("appVersion"),
};

/* ---------- rendering ---------- */

function render() {
  const c = t();
  document.documentElement.lang = state.lang === "en" ? "en" : state.lang;
  el.ask.textContent = c.ask;
  el.gear.setAttribute("aria-label", c.settings);

  el.tiles.replaceChildren(...state.places.map(tile));
}

function tile(place) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tile";
  b.setAttribute("aria-label", nameOf(place));

  const face = document.createElement("span");
  face.className = "face";
  face.setAttribute("aria-hidden", "true");
  face.textContent = place.glyph || "📍";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = nameOf(place);

  b.append(face, name);
  b.addEventListener("click", () => openAnswer(place));
  li.append(b);
  return li;
}

function show(which) {
  el.sheet.hidden = which !== "answer";
  el.manage.hidden = which !== "manage";
  document.body.style.overflow = which ? "hidden" : "";
}

/* ---------- the answer ---------- */

let lookSeq = 0;
let currentPlace = null;
let location = null; // {coord} once granted; never cache a failure, so "Use my location" can retry

/**
 * Ask the device where it is. A failure is a state to report, not a reason to invent an origin:
 * the old code returned null and the caller quietly assumed "you are at home", which is exactly the
 * wrong assumption for someone already out, and produced "add a starting place" on the Home tile —
 * an error about a place when the missing thing was permission.
 */
function askLocation() {
  if (location && location.coord) return Promise.resolve(location);
  if (!navigator.geolocation) return Promise.resolve({ error: "unavailable" });
  return new Promise((resolve) => {
    let settled = false;
    let watchdog = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (watchdog) clearTimeout(watchdog);
      resolve(value);
    };
    // geolocation's own `timeout` is not a guarantee: with the permission prompt open the browser can
    // leave the call pending forever (seen on the public site), and an elderly user then stares at
    // "正在获取您的位置…" with no way forward. This watchdog makes the recovery state arrive.
    watchdog = setTimeout(() => finish({ error: "timeout" }), 10000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({ coord: { lng: pos.coords.longitude, lat: pos.coords.latitude } }),
      (err) => finish({ error: err && err.code === 1 ? "denied" : err && err.code === 3 ? "timeout" : "unavailable" }),
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
    );
  });
}

async function originFor(place, forced) {
  if (forced) return forced;                    // the traveller picked a starting place by hand
  const loc = await askLocation();
  if (loc.coord) {
    location = loc;
    return { coord: loc.coord };
  }
  // No device location: the place called Home is a fallback for somewhere else, but it cannot be the
  // origin when the destination IS home, and it must be said out loud rather than assumed.
  const home = state.places.find((p) => p.id === "home" && p.address);
  if (home && home.id !== place.id) return { address: home.address, label: nameOf(home), error: loc.error };
  return { error: loc.error };
}

/** When the origin is unknown, the other saved places are the only origins the app can offer. */
function renderOriginChoices(place) {
  const c = t();
  const options = state.places.filter((p) => p.id !== place.id && (p.coord || p.address));
  if (!options.length) return;
  el.originAsk.textContent = c.chooseOrigin;
  el.originList.replaceChildren(
    ...options.map((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "origin";
      b.textContent = nameOf(p);
      b.addEventListener("click", () => openAnswer(place, { coord: p.coord, address: p.address, label: nameOf(p) }));
      return b;
    }),
  );
  el.originChoices.hidden = false;
}

async function openAnswer(place, forcedOrigin = null) {
  const c = t();
  currentPlace = place;
  show("answer");
  el.sheetTitle.textContent = nameOf(place);
  el.summary.textContent = c.locating;
  el.stamp.hidden = true;
  el.retryLoc.hidden = true;
  el.originChoices.hidden = true;
  const seq = ++lookSeq;
  let mode = "transit";
  el.closeSheet.textContent = c.back;
  // The hand-off link does not depend on the trip, so it is set before the lookup: an
  // "Open in Maps" button still pointing at "#" during a slow fetch is a trap. A place with no
  // address has nowhere to hand off to, so that button is simply not offered.
  el.go.href = mapsUrl(place, mode);
  el.go.textContent = c.openMaps;
  el.go.hidden = !(place.address || place.coord);
  if (!(place.address || place.coord) && !place.coord) {
    // Nothing to hand off to, and nothing to look up: say the one useful thing and stop.
    el.summary.textContent = c.needAddress;
    return;
  }

  try {
    const origin = await originFor(place, forcedOrigin);
    if (seq !== lookSeq) return;
    if (origin.error && !origin.address) {
      // Permission is the blocker, so say that and offer the one action that can fix it.
      el.summary.textContent = origin.error === "denied" ? c.locationOff : c.locationFailed;
      el.retryLoc.textContent = c.useMyLocation;
      el.retryLoc.hidden = false;
      el.go.textContent = c.stillGo;
      // Still usable without permission: pick the place you are standing in.
      renderOriginChoices(place);
    } else {
      el.summary.textContent = c.looking;
      const trip = await getTrip(place, { origin });
      if (seq !== lookSeq) return;
      mode = trip.mode;
      el.summary.textContent = c.trip(trip);
      // Anything that is not the live provider gets said out loud, in the answer card.
      if (trip.provider !== "tfnsw") {
        el.stamp.textContent = c.demo;
        el.stamp.dataset.kind = "demo";
        el.stamp.hidden = false;
      } else if (origin.label) {
        el.stamp.textContent = c.fromPlace(origin.label);
        el.stamp.dataset.kind = "note";
        el.stamp.hidden = false;
      }
    }
  } catch (err) {
    if (seq !== lookSeq) return;
    // No answer is still a decision the user can act on — unless there is no destination at all.
    const why = err && err.message;
    el.summary.textContent = why === "no-address" ? c.needAddress : why === "no-origin" ? c.noOrigin : c.failed;
    el.go.textContent = c.stillGo;
    el.go.hidden = !(place.address || place.coord);
  }
  if (el.go.hidden) return;
  el.go.href = mapsUrl(place, mode);
}

/* ---------- places (helper screen) ---------- */

function openManage() {
  const c = t();
  el.manageTitle.textContent = c.places;
  el.addBtn.textContent = c.add;
  el.closeManage.textContent = c.done;
  el.verLabel.textContent = c.versionLabel;
  el.storageWarn.hidden = storageOk;
  el.storageWarn.textContent = c.storageWarn;
  el.verMsg.textContent = c.checkUpdates;

  el.langRow.replaceChildren(
    ...LANGS.map((lang) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = lang.label;
      b.setAttribute("aria-pressed", String(state.lang === lang.id));
      b.addEventListener("click", () => { state.lang = lang.id; save(); render(); openManage(); });
      return b;
    }),
  );

  el.places.replaceChildren(...state.places.map(placeRow));
  show("manage");
}

function field(labelText, value, onInput, extraClass) {
  const label = document.createElement("label");
  if (extraClass) label.className = extraClass;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  input.addEventListener("input", () => onInput(input.value));
  label.append(input);
  return label;
}

/* ---------- geocoding, at setup only ---------- */

const resolveTimers = new Map();

/** Look the address up while the helper is still on the screen, and say what it matched. */
function scheduleResolve(place, status) {
  if (usingMock()) return;                       // no proxy configured: nothing to ask
  clearTimeout(resolveTimers.get(place.id));
  status.hidden = false;
  if (!place.address.trim()) {
    status.hidden = true;
    return;
  }
  status.dataset.kind = "pending";
  status.textContent = t().resolving;
  resolveTimers.set(place.id, setTimeout(() => runResolve(place, status), 700));
}

/* stop_finder matches words, not places: "Centennial Park" came back as a park near Dubbo, 300 km
 * away, and "1 Grand Drive, Centennial Park" still did. Two cheap guards make that visible instead of
 * green — no shared word between what was typed and what came back, or a match outside greater
 * Sydney. Neither blocks the save; the helper can see the problem and fix the address. */
const SYDNEY = { lat: -33.8688, lng: 151.2093 };

// Words too generic to prove anything: "Sydney" and "Park" are in half the suburbs, so a match that
// shares only those is not a match. What is left is the part that identifies the place.
const GENERIC = new Set([
  "sydney", "nsw", "new", "south", "wales", "australia", "the", "and", "of",
  "street", "st", "road", "rd", "avenue", "ave", "drive", "dr", "lane", "ln", "place", "pl",
  "park", "parade", "pde", "highway", "hwy", "level", "shop", "suite", "unit",
]);

function words(s) {
  return String(s).toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

function kmApart(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function suspectMatch(address, hit) {
  const typed = new Set(words(address));
  const shared = words(hit.name).some((w) => typed.has(w));
  const away = Math.round(kmApart(hit.coord, SYDNEY));
  return { suspicious: !shared || away > 60, away: away > 60 ? away : 0 };
}

function renderAlternatives(place, status, others) {
  const wrap = document.createElement("div");
  wrap.className = "alts span2";
  for (const m of others) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "origin";
    b.textContent = m.name;
    b.addEventListener("click", () => {
      place.coord = m.coord;
      place.resolvedName = m.name;
      save();
      status.dataset.kind = "ok";
      status.textContent = t().matched(m.name);
      wrap.remove();
    });
    wrap.append(b);
  }
  status.after(wrap);
}

async function runResolve(place, status) {
  const c = t();
  status.parentElement.querySelectorAll(".alts").forEach((n) => n.remove());
  const hit = await resolveAddress(place.address);
  if (hit) {
    place.coord = hit.coord;
    place.resolvedName = hit.name;
    const { suspicious, away } = suspectMatch(place.address, hit);
    status.dataset.kind = suspicious ? "warn" : "ok";
    status.textContent = suspicious ? c.checkMatch(hit.name, away) : c.matched(hit.name);
    // A wrong first match is the common failure, and stop_finder gave us the runners-up: let the
    // helper pick the address they meant instead of leaving them to retype it.
    if (suspicious && hit.others && hit.others.length) renderAlternatives(place, status, hit.others);
  } else {
    place.coord = null;
    place.resolvedName = null;
    status.dataset.kind = "warn";
    status.textContent = c.notFound;
  }
  save();
}

function placeRow(place) {
  const c = t();
  const li = document.createElement("li");
  li.className = "place";

  const status = document.createElement("p");
  status.className = "resolved span2";
  // Only meaningful with a provider configured: in mock mode nothing was looked up, so claiming
  // "routes to X" would be a promise the app cannot keep.
  status.hidden = usingMock() || !place.resolvedName;
  if (place.resolvedName) {
    status.dataset.kind = "ok";
    status.textContent = c.matched(place.resolvedName);
  }

  const glyph = field(c.glyph, place.glyph, (v) => { place.glyph = v; save(); render(); }, "glyph");
  glyph.querySelector("input").setAttribute("maxlength", "4");
  glyph.querySelector("input").setAttribute("inputmode", "text");

  li.append(
    field(c.name, nameOf(place), (v) => {
      place.name = place.name || {};
      place.name[state.lang] = v;
      save();
      render();
    }),
    glyph,
    field(c.address, place.address, (v) => {
      place.address = v;
      // A changed address is no longer the address that was confirmed, so the confirmation goes.
      place.coord = null;
      place.resolvedName = null;
      save();
      scheduleResolve(place, status);
    }, "span2"),
    status,
  );

  const del = document.createElement("button");
  del.type = "button";
  del.className = "del span2";
  del.textContent = c.delete;
  del.addEventListener("click", () => {
    if (!confirm(`${c.delete} — ${nameOf(place)}?`)) return;
    state.places = state.places.filter((p) => p.id !== place.id);
    save();
    render();
    openManage();
  });
  li.append(del);
  return li;
}

/* ---------- wiring ---------- */

el.closeSheet.addEventListener("click", () => show(null));

/* "Use my location": forget the refused attempt and ask again. The permission prompt only appears on
 * a real gesture, which this is, so a person who just turned location back on in Settings gets a new
 * chance without reloading the app. */
el.retryLoc.addEventListener("click", () => {
  location = null;
  if (currentPlace) openAnswer(currentPlace);
});
el.gear.addEventListener("click", openManage);
el.closeManage.addEventListener("click", () => show(null));

/* Check for updates: read version.json past any cache and compare with what is running.
   There is no service worker here (PROJECT.md §7), so a cache-busted reload is all an update needs —
   the fresh HTML carries new ?v= stamps and the browser fetches every file again. */
el.verBtn.addEventListener("click", async () => {
  const c = t();
  el.verMsg.textContent = c.checking;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const live = await res.json();
    const mine = el.appVersion;
    const same = mine.dataset.build ? live.build === mine.dataset.build : live.version === mine.textContent;
    if (same) {
      el.verMsg.textContent = c.upToDate;
      return;
    }
    el.verMsg.textContent = c.updating(live.version);
    location.replace(`${location.pathname}?v=${encodeURIComponent(live.build || live.version)}`);
  } catch {
    el.verMsg.textContent = navigator.onLine === false ? c.offline : c.cantCheck;
  }
});

el.sheet.addEventListener("click", (e) => { if (e.target === el.sheet) show(null); });
el.manage.addEventListener("click", (e) => { if (e.target === el.manage) show(null); });

el.addBtn.addEventListener("click", () => {
  const newName = { en: "New place", "zh-Hans": "新地方" };
  state.places.push({
    id: `p${Date.now()}`,
    name: { [state.lang]: newName[state.lang] },
    glyph: "📍",
    address: "",
  });
  save();
  render();
  openManage();
  const inputs = el.places.querySelectorAll("input");
  const last = inputs[inputs.length - 3];
  if (last) last.focus();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (!el.sheet.hidden || !el.manage.hidden)) show(null);
});

render();
