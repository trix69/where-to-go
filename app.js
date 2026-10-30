/* Where To Go — Where to? · 想去哪儿
 *
 * Two screens for the traveller (tiles, answer) and one for whoever sets it up (places, language).
 * No framework, no build step, no network beyond the transit lookup.
 */

import { getTrip, mapsUrl, usingMock, searchAddresses } from "./transit.js?v=0.1";

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
    locationBlocked: "Location is switched off for this device. Turn it on in Settings, then try again.",
    locationFailed: "Couldn't get your location. Try again.",
    useMyLocation: "Use my location",
    gateChecking: "Checking your location…",
    gateAllow: "Allow location",
    gateSkip: "Look around",
    gateRetry: "Check again",
    regionTitle: "Not here yet",
    regionMsg: "It only works in New South Wales, Australia.",
    storageWarn: "This browser isn't saving changes (private browsing?). Places will be lost when you close the tab.",
    demo: "SAMPLE DATA — no live transit yet",
    // waitMin + rideMin is the arithmetic that lands on the arrival time printed beside it; the
    // door-to-door figure includes the wait and made the three numbers disagree (R12.2).
    trip: (t, arrive) =>
      `${t.mode in COPY.en.modes ? COPY.en.modes[t.mode] : "Bus"} ${t.line} in ${t.waitMin} min, ` +
      `${t.rideMin ?? t.durationMin} min on board` +
      (arrive ? `, arriving ${arrive}.` : "."),
    modes: { bus: "Bus", train: "Train", ferry: "Ferry", lightrail: "Light rail", metro: "Metro", coach: "Coach" },
    failed: "No answer right now.",
    arrived: "You have arrived.",
    dupName: (n) => `There is already a place called "${n}".`,
    stillGo: "Open in Maps anyway",
    needAddress: "Add an address first.",
    noOrigin: "Add a starting place first.",
    noMatches: "No match — try another spelling.",
    searching: "Searching…",
    mockNoSave: "Sample mode: addresses can't be saved here.",
    repick: "Pick this address again to confirm it.",
    settingsTitle: "Settings",
    language: "Language",
    appearance: "Appearance",
    themeAuto: "Automatic",
    themeLight: "Light",
    themeDark: "Dark",
    newPlace: "New place",
    editPlace: "Edit",
    addPlace: "Add a place",
    deleteConfirm: "Delete now",
    deleteWarn: (n) => `This can't be undone: ${n}. Tap "Delete now" if you mean it.`,
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
    locationBlocked: "设备的定位服务关着。请在设置里打开定位，再试一次。",
    locationFailed: "暂时定位不到，请重试。",
    useMyLocation: "使用我的位置",
    gateChecking: "正在确认位置…",
    gateAllow: "允许定位",
    gateSkip: "先看看",
    gateRetry: "重新定位",
    regionTitle: "本地区还没开通",
    regionMsg: "这个应用目前只在澳大利亚新南威尔士州（NSW）可以使用。",
    storageWarn: "当前浏览器无法保存（无痕浏览？）。关闭后这些地点会丢失。",
    demo: "示例数据 — 还没接实时公交",
    // "路" is the bus-route suffix; a train line takes "号线", and ferry/light-rail numbers take neither.
    trip: (t, arrive) => {
      const word = COPY["zh-Hans"].modes[t.mode] || "公交";
      // A rail "line" is a code (CCN, T9), which says nothing to this audience; where it goes does.
      const named = !/^\d+[A-Za-z]?$/.test(String(t.line)) && t.towards;
      const ride = named
        ? (t.mode === "train" || t.mode === "metro" ? `开往${t.towards}的${word}` : `${word}（开往${t.towards}）`)
        : t.mode === "train" || t.mode === "metro" ? `${t.line}号线`
        : t.mode === "bus" || t.mode === "coach" ? `${word}${t.line}路`
        : `${word}${t.line}`;
      // 车上 (on board) rather than 路上 (door to door): 等车时间 + 车上时间 = 到站时间 (R12.2).
      return `坐${ride}，${t.waitMin}分钟后有车，车上大约${t.rideMin ?? t.durationMin}分钟${arrive ? `，${arrive}到` : ""}。`;
    },
    modes: { bus: "公交", train: "火车", ferry: "渡轮", lightrail: "轻轨", metro: "地铁", coach: "巴士" },
    failed: "现在查不到。",
    arrived: "您已经到了。",
    dupName: (n) => `已经有叫「${n}」的地点了。`,
    stillGo: "还是打开地图",
    needAddress: "请先填地址。",
    noOrigin: "请先填出发点。",
    noMatches: "没有找到，请换个写法。",
    searching: "正在查找…",
    mockNoSave: "示例模式：这里无法保存地址。",
    repick: "这个地址需要重新选一次。",
    settingsTitle: "设置",
    language: "语言",
    appearance: "外观",
    themeAuto: "自动",
    themeLight: "浅色",
    themeDark: "深色",
    newPlace: "新地点",
    editPlace: "编辑",
    addPlace: "添加地点",
    deleteConfirm: "确认删除",
    deleteWarn: (n) => `删除后不能恢复：${n}。确定要删除，请再点「确认删除」。`,
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

/* Presets ship with a name and an icon only. Addresses are left empty on purpose: the app cannot know
 * where a family's doctor, school or market actually is, and a plausible-looking wrong address is worse
 * than an empty one. The helper fills them in, and each one is geocoded and confirmed there. */
const SEED = [
  { id: "home", name: { en: "Home", "zh-Hans": "家" }, glyph: "🏠", address: "" },
  { id: "doctor", name: { en: "Family doctor", "zh-Hans": "家庭医生" }, glyph: "🧑‍⚕️", address: "" },
  { id: "market", name: { en: "Supermarket", "zh-Hans": "超市" }, glyph: "🛒", address: "" },
  { id: "daughter", name: { en: "Daughter's", "zh-Hans": "女儿家" }, glyph: "👨‍👩‍👧", address: "" },
  { id: "school", name: { en: "School", "zh-Hans": "学校" }, glyph: "🏫", address: "" },
  { id: "park", name: { en: "Park", "zh-Hans": "公园" }, glyph: "🌳", address: "" },
];

/* What the presets used to ship with. Used only to clear an untouched address when the presets move
 * to "empty until someone fills it in" — a place the helper has set or geocoded is never touched. */
const SEED_ADDRESSES = {
  home: "12 Crown Street, Sydney NSW 2000",
  doctor: "Royal Prince Alfred Hospital, Missenden Road, Camperdown NSW 2050",
  market: "Paddy's Markets, 9-13 Hay Street, Haymarket NSW 2000",
  daughter: "8 Belmore Road, Randwick NSW 2031",
  school: "Randwick Public School, Cowper Street, Randwick NSW 2031",
  park: "Centennial Park, Sydney NSW 2021",
};

// Bumped when a preset is added, so an existing set of places picks it up without a wipe.
const SEED_VERSION = 6;

/** Add presets introduced since this browser's places were saved, keeping tile order. */
/* Presets that were renamed after they shipped. Only a preset nobody touched is rewritten: the old
 * glyph AND the old name have to match, so a helper's own "Dr Chan" is left alone. */
const RENAMED = [
  {
    // 市场 became 超市: the older word reads as a wet market to this audience.
    id: "market",
    was: { glyph: "🛒", names: ["市场", "市場", "Market"] },
    now: { name: { en: "Supermarket", "zh-Hans": "超市" }, glyph: "🛒" },
  },
  {
    id: "doctor",
    was: { glyph: "🏥", names: ["医生", "醫生", "Doctor"] },
    now: { name: { en: "Family doctor", "zh-Hans": "家庭医生" }, glyph: "🧑‍⚕️", address: "" },
    // the address that shipped with the hospital preset; only an untouched one is cleared
    wasAddress: "Royal Prince Alfred Hospital, Missenden Road, Camperdown NSW 2050",
  },
];

function renamePresets(stored) {
  for (const r of RENAMED) {
    const place = stored.places.find((p) => p.id === r.id);
    if (!place || place.glyph !== r.was.glyph) continue;
    // A coordinate means a person geocoded and accepted this place: not ours to rewrite (R14.1).
    if (place.coord) continue;
    // Every name has to be the shipped one. "any name matches" let a helper who renamed only the
    // Chinese label (陈医生, with name.en still "Doctor") look untouched, and their label was lost.
    const names = Object.values(place.name || {});
    if (!names.length || !names.every((n) => r.was.names.includes(n))) continue;
    place.name = { ...r.now.name };
    place.glyph = r.now.glyph;
    // Address text only: whatever else this place carries stays (R14.1, part 2).
    if (r.wasAddress !== undefined && (place.address || "") === r.wasAddress) place.address = "";
  }
}

function ensureDefaults(stored) {
  if ((stored.seedVersion || 1) >= SEED_VERSION) return stored;
  renamePresets(stored);
  const have = new Set(stored.places.map((p) => p.id));
  for (const p of SEED) if (!have.has(p.id)) stored.places.push({ ...p });
  // Presets keep their declared order; anything the helper added stays after them.
  for (const p of stored.places) {
    if (p.coord) continue;                                    // already confirmed or geocoded
    if (SEED_ADDRESSES[p.id] && (p.address || "") === SEED_ADDRESSES[p.id]) p.address = "";
  }
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
        // `suspect` was written by builds before R26 and nothing reads it now; left in place it would
        // keep an old place opening its editor for ever, with no line saying why.
        for (const place of s.places) delete place.suspect;
        return ensureDefaults(s);
      }
    }
  } catch (e) { /* private mode, corrupt value: fall through to the seed */ }
  return { lang: pickLang(), theme: "auto", seedVersion: SEED_VERSION, places: SEED.map((p) => ({ ...p })) };
}

function save() {
  // Private browsing (iOS Safari especially) throws on write. Swallowing that silently is how a
  // helper spends ten minutes setting up places that vanish — so the failure is recorded and shown.
  const before = storageOk;
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
  // Painted here rather than on sheet open: the helper is still typing when the write fails, and a
  // warning that appears only after 完成 → gear arrives too late (R10.2). `el` may not exist yet —
  // save() is called at module scope — hence the lookup.
  if (before !== storageOk) {
    const warn = document.getElementById("storageWarn");
    if (warn) {
      warn.hidden = storageOk;
      warn.textContent = t().storageWarn;
    }
  }
}

const t = () => COPY[state.lang] || COPY[DEFAULT_LANG];

/* ---------- light / dark / automatic ---------- */

const THEMES = [
  // Order is Trix's: light, dark, then automatic — which is still what a new install gets.
  { id: "light", label: () => t().themeLight },
  { id: "dark", label: () => t().themeDark },
  { id: "auto", label: () => t().themeAuto },
];

function applyTheme() {
  if (!window.__themeWatch) {
    window.__themeWatch = true;
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (!state.theme || state.theme === "auto") applyTheme();
    });
  }
  const theme = state.theme === "light" || state.theme === "dark" ? state.theme : "";
  // No attribute means "follow the phone", which is what the media query keys off.
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = theme || "light dark";
  const dark = theme === "dark" ||
    (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#101312" : "#ffffff";
}

/* Arrival as a clock time in the reader's own convention (zh: 17:42, en: 5:42 pm), and always in
 * Sydney time: the app only runs in NSW, and a phone left on 北京时间 read three hours early (R12.1). */
function clock(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const opts = { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" };
  if (state.lang === "en") return d.toLocaleTimeString("en-AU", opts);
  return d.toLocaleTimeString("zh-CN", { ...opts, hourCycle: "h23" });
}
const nameOf = (place) => (place.name && (place.name[state.lang] || place.name.en)) || place.address;

/* ---------- elements ---------- */

const $ = (id) => document.getElementById(id);
const el = {
  ask: $("ask"),
  gate: $("gate"),
  gateTitle: $("gateTitle"),
  gateMsg: $("gateMsg"),
  gateAllow: $("gateAllow"),
  gateSkip: $("gateSkip"),
  gear: $("settingsBtn"),
  tiles: $("tiles"),
  sheet: $("sheet"),
  sheetTitle: $("sheetTitle"),
  destAddr: $("destAddr"),
  summary: $("summary"),
  stamp: $("stamp"),
  go: $("goBtn"),
  closeSheet: $("closeSheet"),
  retryLoc: $("retryLoc"),
  storageWarn: $("storageWarn"),
  manage: $("manage"),
  manageTitle: $("manageTitle"),
  langRow: $("langRow"),
  langLabel: $("langLabel"),
  themeRow: $("themeRow"),
  themeLabel: $("themeLabel"),
  iconLabel: $("iconLabel"),
  place: $("place"),
  placeTitle: $("placeTitle"),
  placeName: $("placeName"),
  icons: $("icons"),
  placeIcons: $("placeIcons"),
  glyphView: $("glyphView"),
  placeClose: $("placeClose"),
  nameLabel: $("nameLabel"),
  addrLabel: $("addrLabel"),
  placeAddr: $("placeAddr"),
  addrList: $("addrList"),
  placeNote: $("placeNote"),
  placeWarn: $("placeWarn"),
  placeDel: $("placeDel"),
  placeDone: $("placeDone"),
  editPlace: $("editPlace"),
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

  el.tiles.replaceChildren(...state.places.map(tile), addTile());
}

function tile(place) {
  const li = document.createElement("li");
  li.className = "tile-wrap";

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
  b.addEventListener("click", () => {
    // Nothing to answer with yet: sending someone to a card that says 请先填地址 is a dead end, so
    // the tap opens the place itself and the address field is right there to fill in.
    // Pick-only saving (R18) means a confirmed place always has a coordinate. An address without one
    // is data from a build before that rule — text that would be geocoded at travel time and answered
    // silently from whatever stop_finder chose (R18.1). So it opens its editor instead of answering.
    // A stored coordinate is the only thing that makes a place answerable. `suspect` is gone (R26),
    // and a place whose address text and matched name disagree predates pick-only saving (R18.1).
    const drifted = place.resolvedName && place.address && place.resolvedName !== place.address;
    if (!place.coord || drifted) return openPlace(place);
    openAnswer(place);
  });
  li.append(b);
  return li;
}

function addTile() {
  const c = t();
  const li = document.createElement("li");
  li.className = "tile-wrap";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tile tile-add";
  b.setAttribute("aria-label", c.addPlace);
  b.innerHTML = `<span class="face" aria-hidden="true">＋</span><span class="name">${c.addPlace}</span>`;
  b.addEventListener("click", () => openPlace(null));
  li.append(b);
  return li;
}

function show(which) {
  el.sheet.hidden = which !== "answer";
  el.manage.hidden = which !== "manage";
  el.place.hidden = which !== "place";
  document.body.style.overflow = which ? "hidden" : "";
}

/* ---------- region gate ----------
 * TfNSW only covers New South Wales, so the app is not useful outside it. The provider's own API
 * cannot answer "am I in NSW?" — its coord endpoint returns points in Melbourne and Brisbane too —
 * so the test is geographic. This is a coarse outline of the state: accurate at city scale, and it
 * deliberately accepts the ACT, which sits inside NSW and shares part of the network.
 */
const NSW = [
  [141.0, -29.0], [148.0, -29.0], [149.0, -28.7], [150.5, -28.5], [152.0, -28.3],
  // The old straight edge ran inland of Tweed Heads and Byron Bay, so the app refused towns the
  // provider answers for. These follow the coast (R13.1).
  [152.9, -28.25], [153.55, -28.16], [153.65, -28.35], [153.63, -29.0],
  [152.5, -32.5], [151.5, -34.0],
  [150.2, -36.0], [149.9, -37.5], [148.0, -36.5], [146.0, -36.0], [144.0, -35.5],
  [142.0, -34.6], [141.0, -34.0],
];

function inNSW({ lat, lng }) {
  let inside = false;
  for (let i = 0, j = NSW.length - 1; i < NSW.length; j = i++) {
    const [xi, yi] = NSW[i];
    const [xj, yj] = NSW[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* ---------- the answer ---------- */

let lookSeq = 0;
let currentPlace = null;
let location = null; // {coord, at} once granted; never cache a failure, so "Use my location" can retry

/**
 * Ask the device where it is. A failure is a state to report, not a reason to invent an origin:
 * the old code returned null and the caller quietly assumed "you are at home", which is exactly the
 * wrong assumption for someone already out, and produced "add a starting place" on the Home tile —
 * an error about a place when the missing thing was permission.
 */
function askOnce(maxAge) {
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
      { timeout: 10000, maximumAge: maxAge, enableHighAccuracy: false },
    );
  });
}

/**
 * The device, asked once — and once more if the first answer could be a hiccup.
 *
 * A failed first fix is common on a desk with no window and on desktop Chrome; a single retry a
 * second later turns most of those into an answer. A refusal is not retried.
 */
async function askLocation(opts = {}) {
  const maxAge = opts.maxAge == null ? 60000 : opts.maxAge;
  // The stamp is the point: without it a launch-time fix was reused for the whole page session, so a
  // trip asked 4 km away was still computed from where the phone was when the app opened (R16.1).
  if (location && location.coord && maxAge > 0 && Date.now() - (location.at || 0) < maxAge) return location;
  if (!navigator.geolocation) return { error: "unavailable" };

  let res = await askOnce(maxAge);
  if (res.error === "timeout" || res.error === "unavailable") {
    await new Promise((r) => setTimeout(r, 900));
    res = await askOnce(maxAge);
  }
  if (res.coord) res = { coord: res.coord, at: Date.now() };
  if (res.error !== "denied") return res;

  /* Chrome answers PERMISSION_DENIED when the *operating system* has location switched off, even
   * though the site was granted it — so "定位已关闭。请允许定位" sent people to a permission screen
   * that already said allow (Trix, on a desktop where the site permission was granted). Ask the
   * browser what it thinks: granted + a refusal means the block is outside the browser. */
  let state = "";
  try {
    state = (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch { /* not implemented everywhere */ }
  return state === "granted" ? { error: "blocked" } : res;
}

async function originFor() {
  // Every lookup starts where the phone is. There is no "from home" fallback any more: guessing that
  // someone is at home sends a person standing at a bus stop to the wrong place, and the Home place
  // no longer has an address to guess with.
  const loc = await askLocation();
  return loc.coord ? { coord: loc.coord } : { error: loc.error };
}

async function openAnswer(place, opts = {}) {
  const c = t();
  const refresh = opts.refresh === true;
  currentPlace = place;
  show("answer");
  el.sheetTitle.textContent = nameOf(place);
  if (!refresh) {
    el.summary.textContent = c.locating;
    el.stamp.hidden = true;
    el.retryLoc.hidden = true;
  }
  // Where this trip is going, in the words that were picked from the address list. Nothing typed
  // reaches here, so there is nothing to qualify: the address and the coordinate are the same place.
  const addr = (place.address || "").trim();
  const matched = (place.resolvedName || "").trim();
  el.destAddr.textContent = addr || matched;
  el.destAddr.hidden = !(addr || matched);
  const seq = ++lookSeq;
  let mode = "transit";
  el.closeSheet.textContent = c.back;
  el.editPlace.setAttribute("aria-label", `${c.editPlace} ${nameOf(place)}`);
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
    const origin = await originFor();
    if (seq !== lookSeq) return;
    if (origin.error && !origin.address) {
      // Permission is the blocker, so say that and offer the one action that can fix it.
      el.summary.textContent = origin.error === "denied" ? c.locationOff
        : origin.error === "blocked" ? c.locationBlocked
        : c.locationFailed;
      el.retryLoc.textContent = c.useMyLocation;
      el.retryLoc.hidden = false;
      el.go.textContent = c.stillGo;
    } else {
      if (!refresh) el.summary.textContent = c.looking;
      const trip = await getTrip(place, { origin });
      if (seq !== lookSeq) return;
      mode = trip.mode;
      // Standing at the destination is not a failed lookup: there is no bus to name.
      el.summary.textContent = trip.arrived ? c.arrived : c.trip(trip, clock(trip.arriveISO));
      // Anything that is not the live provider gets said out loud, in the answer card.
      if (trip.provider !== "tfnsw" && trip.provider !== "nearby") {
        el.stamp.textContent = c.demo;
        el.stamp.dataset.kind = "demo";
        el.stamp.hidden = false;
      }
    }
  } catch (err) {
    if (seq !== lookSeq) return;
    // No answer is still a decision the user can act on — unless there is no destination at all.
    const why = err && err.message;
    // The provider says "walk-only" when the only way there is to walk: that is an arrival, not an error.
    el.summary.textContent = why === "walk-only" ? c.arrived
      : why === "no-address" ? c.needAddress
      : why === "no-origin" ? c.noOrigin
      : c.failed;
    el.go.textContent = c.stillGo;
    el.go.hidden = !(place.address || place.coord);
  }
  if (el.go.hidden) return;
  el.go.href = mapsUrl(place, mode);
  if (!refresh) startRefresh(place);
}

/* ---------- settings: language and version only ---------- */

function openManage() {
  const c = t();
  el.manageTitle.textContent = c.settingsTitle;
  el.closeManage.textContent = c.done;
  el.verLabel.textContent = c.versionLabel;
  el.storageWarn.hidden = storageOk;
  el.storageWarn.textContent = c.storageWarn;
  el.verMsg.textContent = c.checkUpdates;

  el.langLabel.textContent = c.language;
  el.themeLabel.textContent = c.appearance;
  el.langRow.replaceChildren(
    ...LANGS.map((lang) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = lang.label;
      b.setAttribute("aria-pressed", String(state.lang === lang.id));
      b.setAttribute("aria-label", `${c.language}: ${lang.label}`);
      b.addEventListener("click", () => { state.lang = lang.id; save(); render(); openManage(); });
      return b;
    }),
  );
  const theme = state.theme || "auto";
  el.themeRow.replaceChildren(
    ...THEMES.map((th) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = th.label();
      b.setAttribute("aria-pressed", String(theme === th.id));
      b.addEventListener("click", () => { state.theme = th.id; applyTheme(); save(); openManage(); });
      return b;
    }),
  );
  show("manage");
}

/* ---------- keeping the answer current ----------
 * A bus answer ages: "6分钟后有车" is wrong within two minutes. The sheet refreshes itself once a
 * minute while it is open, and the refresh does not blank the answer first — a flicker to
 * 正在查询… every sixty seconds would look like the app had lost the answer.
 */

let refreshTimer = 0;

function startRefresh(place) {
  stopRefresh();
  refreshTimer = setInterval(() => {
    if (document.hidden || el.sheet.hidden) return;
    openAnswer(place, { refresh: true });
  }, 60_000);
}

function stopRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = 0;
}

/* ---------- one place, in its own overlay ----------
 * Address maintenance lives next to the place it belongs to: a pencil on the tile opens this sheet.
 * Settings keeps only language and version, because editing a place is a place-shaped job.
 */

let editing = null;       // the place currently in the overlay
let snapshot = null;      // what this place looked like when the overlay opened
let editingIsNew = false; // a draft that is not in state.places yet, so it cannot be deleted either
let deleteArmed = false;  // first tap arms the delete, second confirms it
let resolveTimer = null;

function closePlace() {
  closeIcons();
  editing = null;          // a draft is simply dropped: it was never in state.places
  snapshot = null;
  editingIsNew = false;
  deleteArmed = false;
  show(null);
}

function openPlace(place) {
  const c = t();
  editingIsNew = !place;
  if (!place) {
    // A draft. Nothing is added to the tiles, and nothing is written to storage, until 完成 — closing
    // the overlay any other way throws it away (Trix).
    place = { id: `p${Date.now()}`, name: { [state.lang]: c.newPlace }, glyph: "📍", address: "" };
  }
  editing = place;
  // Taken before anything is typed, so X can put the place back exactly as it was. Existing places
  // save as you type; without this, "close without saving" would be a lie.
  snapshot = JSON.stringify({ name: place.name, glyph: place.glyph, address: place.address,
                              coord: place.coord, resolvedName: place.resolvedName, suspect: place.suspect });
  deleteArmed = false;
  el.placeTitle.textContent = nameOf(place);
  el.nameLabel.textContent = c.name;
  el.addrLabel.textContent = c.address;
  el.iconLabel.textContent = c.glyph;
  el.placeAddr.placeholder = c.address;      // the field's own hint, not a label above it
  el.placeName.value = nameOf(place);
  el.glyphView.textContent = place.glyph || "📍";
  el.glyphView.setAttribute("aria-label", `${c.glyph}: ${place.glyph || "📍"}`);
  el.placeAddr.value = place.address || "";
  el.placeDel.textContent = c.delete;
  el.placeDel.classList.remove("confirm");
  el.placeDel.hidden = false;             // on a draft it discards, which is the only way out besides 完成
  el.placeWarn.hidden = true;
  el.placeNote.hidden = true;
  const clashAtOpen = duplicateNameOf(nameOf(place), place.id);
  if (clashAtOpen) {
    // Old data can hold two places with one name; 完成 is disabled from the first frame, so the reason
    // has to be on screen from the first frame too (R20.1).
    el.placeNote.hidden = false;
    el.placeNote.textContent = c.dupName(norm(nameOf(place)));
  }
  el.placeDone.textContent = c.done;
  el.placeDone.disabled = false;
  closeList();
  renderIcons();
  refreshDone();
  show("place");

  /* Two states where the sheet has to explain itself:
   * - no provider (mock/sample): nothing can be saved, and the field would refuse every keystroke
   *   silently (R18.2);
   * - a stored address with no coordinate: the list is opened with that text so the helper can pick the
   *   real place in one tap (R18.1). */
  if (usingMock()) {
    el.placeNote.hidden = false;
    el.placeNote.textContent = c.mockNoSave;
  } else if (place.address && (!place.coord || place.resolvedName !== place.address)) {
    // Text from an older build: the list is opened on it, and the note says why 完成 is disabled.
    el.placeNote.hidden = false;
    el.placeNote.textContent = c.repick;
    scheduleSearch();
  }
}

/* ---------- the address list ----------
 * Typing searches; picking is the only way an address is stored. A free-text address is what sent
 * people to another suburb, so the field is a combobox whose only outcomes are the geocoder's own
 * answers — and 完成 stays disabled until one of them is chosen.
 */

const ICONS = [
  "🏠", "🧑‍⚕️", "🛒", "👨‍👩‍👧", "🏫", "🌳",
  "🏥", "🏦", "⛪", "🕌", "🏛️", "🚉",
  "🛍️", "🧺", "🍜", "☕", "🎓", "🏋️",
  "💊", "📮", "🎯", "📍", "🧓", "🐕",
];

let searchTimer = null;
let searchSeq = 0;
let results = [];

function openIcons() {
  renderIcons();
  el.icons.hidden = false;
}

function closeIcons() {
  el.icons.hidden = true;
}

function renderIcons() {
  const chosen = (editing && editing.glyph) || "";
  el.placeIcons.replaceChildren(
    ...ICONS.map((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon";
      b.textContent = g;
      b.setAttribute("aria-pressed", String(g === chosen));
      b.addEventListener("click", () => {
        if (!editing) return;
        editing.glyph = g;
        if (!editingIsNew) { save(); render(); }
        el.glyphView.textContent = g;
        el.glyphView.setAttribute("aria-label", `${t().glyph}: ${g}`);   // the name follows the symbol
        renderIcons();
        closeIcons();
      });
      return b;
    }),
  );
}

function closeList() {
  el.addrList.hidden = true;
  el.addrList.replaceChildren();
  el.placeAddr.setAttribute("aria-expanded", "false");
  results = [];
}

function showRow(node) {
  const li = document.createElement("li");
  li.append(node);
  el.addrList.append(li);
  el.addrList.hidden = false;
  el.placeAddr.setAttribute("aria-expanded", "true");
}

function renderEmpty() {
  el.addrList.replaceChildren();
  const p = document.createElement("p");
  p.className = "a-empty";
  p.textContent = t().noMatches;
  showRow(p);
}

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** The other place already using this name. Names are unique; addresses and icons are not: two people
 *  can live at one address, and two destinations can share a glyph (Trix). */
function duplicateNameOf(name, exceptId) {
  const key = norm(name);
  if (!key) return null;
  return state.places.find((p) => {
    if (p.id === exceptId) return false;
    const names = p.name ? Object.values(p.name) : [];
    return names.some((n) => norm(n) === key);
  }) || null;
}

function pick(index) {
  const hit = results[index];
  if (!hit || !editing) return;
  // Picking from the list is the confirmation (Trix). The name was on screen and the finger chose it;
  // a second line asking to confirm it second-guesses the only decision the helper just made.
  editing.address = hit.name;
  editing.coord = hit.coord;
  editing.resolvedName = hit.name;
  editing.suspect = false;
  el.placeAddr.value = hit.name;
  closeList();
  el.placeNote.hidden = true;
  el.placeNote.textContent = "";
  if (!editingIsNew) { save(); render(); }
  refreshDone();
}

function renderList() {
  el.addrList.replaceChildren();
  results.forEach((m, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "option");
    const name = document.createElement("span");
    name.className = "a-name";
    name.textContent = m.name;
    b.append(name);
    if (m.locality && !m.name.includes(m.locality)) {
      // The suburb is what tells two identically named places apart.
      const loc = document.createElement("span");
      loc.className = "a-loc";
      loc.textContent = m.locality;
      b.append(loc);
    }
    b.addEventListener("click", () => pick(i));
    showRow(b);
  });
}

function refreshDone() {
  el.placeDone.disabled = !canSave();
}

function canSave() {
  if (!editing) return false;
  // A tile needs a name, and no two tiles may share one.
  const name = (el.placeName.value || "").trim();
  if (!name || duplicateNameOf(name, editing.id)) return false;
  const typed = el.placeAddr.value.trim();
  if (!typed) return true;                                  // no address is a valid, honest state
  if (!editing.coord || typed !== (editing.address || "").trim()) return false;
  return true;
}

function scheduleSearch() {
  clearTimeout(searchTimer);
  closeList();                 // stale rows from the previous query must not stay tappable
  const text = el.placeAddr.value;
  const seq = ++searchSeq;
  if (!text.trim() || usingMock()) {
    refreshDone();
    return;
  }
  // The field looks dead for seconds while stop_finder thinks; one row says it is working (R18.4).
  el.addrList.replaceChildren();
  const waiting = document.createElement("p");
  waiting.className = "a-empty";
  waiting.textContent = t().searching;
  showRow(waiting);

  searchTimer = setTimeout(async () => {
    let found = [];
    try {
      found = await searchAddresses(text);
    } catch { /* a timeout is "no match", not an exception on screen */ }
    if (seq !== searchSeq || !editing) return;              // a newer keystroke or another place
    // Only candidates that share something with what was typed. stop_finder answers almost anything
    // ("12 Crown Street" → a cafe called "Where Ya Bean?" by word shape), and a list of plausible-
    // looking nonsense is how a wrong destination gets picked.
    results = found.filter((hit) => plausible(text, hit));
    if (!results.length) renderEmpty();
    else renderList();
  }, 350);
}

/** Does this candidate have anything to do with what was typed? */
function plausible(text, hit) {
  const typed = new Set(words(text));
  if (words(hit.name).some((w) => typed.has(w))) return true;
  return words(hit.locality || "").some((w) => typed.has(w));
}

/* ---------- what a candidate has to share with the typed text ----------
 * stop_finder answers word-shapes as places ("12 Crown Street" once returned a cafe called
 * "Where Ya Bean?"), so a candidate joins the list only if it shares a word or a suburb with what was
 * typed. That filter is the whole guard now: a pick from the list is confirmation and nothing is
 * questioned afterwards (Trix).
 */
// Words too generic to prove anything: "Sydney" and "Park" are in half the suburbs.
const GENERIC = new Set([
  "sydney", "nsw", "new", "south", "wales", "australia", "the", "and", "of",
  "street", "st", "road", "rd", "avenue", "ave", "drive", "dr", "lane", "ln", "place", "pl",
  "park", "parade", "pde", "highway", "hwy", "level", "shop", "suite", "unit",
]);

function words(s) {
  return String(s || "").toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

/* ---------- wiring ---------- */

el.closeSheet.addEventListener("click", () => { show(null); stopRefresh(); });

/* "Use my location": forget the refused attempt and ask again. The permission prompt only appears on
 * a real gesture, which this is, so a person who just turned location back on in Settings gets a new
 * chance without reloading the app. */
el.retryLoc.addEventListener("click", () => {
  location = null;
  if (currentPlace) openAnswer(currentPlace);
});
el.gear.addEventListener("click", () => { stopRefresh(); openManage(); });

/* ---------- the place overlay: name, icon, address, delete ---------- */

el.placeName.addEventListener("input", () => {
  if (!editing) return;
  editing.name = editing.name || {};
  editing.name[state.lang] = el.placeName.value;
  el.placeTitle.textContent = el.placeName.value;
  const clash = duplicateNameOf(el.placeName.value, editing.id);
  el.placeNote.hidden = !clash;
  el.placeNote.textContent = clash ? t().dupName(norm(el.placeName.value)) : "";
  refreshDone();
  if (!editingIsNew && !clash) { save(); render(); }
});

el.placeAddr.addEventListener("input", () => {
  if (!editing) return;
  // Typing invalidates the confirmed address at once: the coordinate belonged to the old text, and
  // nothing typed is stored until a candidate is picked.
  editing.coord = null;
  editing.resolvedName = null;
  editing.suspect = false;
  el.placeNote.hidden = true;
  refreshDone();
  scheduleSearch();
});

el.placeAddr.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeList(); return; }
  if (e.key === "Enter" && results.length) { e.preventDefault(); pick(0); }
});

/* Tapping elsewhere closes the list without losing what was picked. */
document.addEventListener("click", (e) => {
  if (!el.addrList.hidden && !el.addrList.contains(e.target) && e.target !== el.placeAddr) closeList();
});

el.placeDone.addEventListener("click", () => {
  if (!canSave()) return;          // guarded in the button, and again here
  if (editingIsNew && editing) {
    state.places.push(editing);
    editingIsNew = false;
    save();
    render();
  }
  closePlace();
});

el.glyphView.addEventListener("click", () => { if (editing) openIcons(); });

/* Close without saving. X, an outside tap and Escape all do the same thing: an existing place goes
   back to the snapshot taken when the sheet opened, and a draft — never written anywhere — just goes
   away. 完成 is the only path that keeps what was typed. */
function cancelPlace() {
  if (!editing) return;
  if (!editingIsNew && snapshot) {
    const was = JSON.parse(snapshot);
    // Every field the sheet can touch, restored or removed — a key the place did not have before must
    // not survive the cancel (suspect, for instance).
    for (const k of ["name", "glyph", "address", "coord", "resolvedName", "suspect"]) {
      if (k in was) editing[k] = was[k];
      else delete editing[k];
    }
    save();
    render();
  }
  closePlace();
}

el.placeClose.addEventListener("click", cancelPlace);

/* Tapping the dimmed area outside the sheet closes it, the same way X does (Trix). The icon chooser
   sits above this sheet, so a tap meant for it never reaches here. */
el.place.addEventListener("click", (e) => { if (e.target === el.place) cancelPlace(); });

/* The chooser is not a form: a tap picks, an outside tap or Escape just closes it. */
el.icons.addEventListener("click", (e) => { if (e.target === el.icons) closeIcons(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!el.icons.hidden) { e.stopPropagation(); closeIcons(); return; }
  if (!el.place.hidden) { e.stopPropagation(); cancelPlace(); }
}, true);

el.placeDel.addEventListener("click", () => {
  const c = t();
  if (!editing) return;
  if (editingIsNew) {
    // Nothing was written, so there is nothing to warn about: dropping the draft loses nothing.
    closePlace();
    return;
  }
  if (!deleteArmed) {
    // Arming, not deleting: the danger is a second deliberate tap.
    deleteArmed = true;
    el.placeDel.classList.add("confirm");
    el.placeDel.textContent = c.deleteConfirm;
    el.placeWarn.hidden = false;
    el.placeWarn.textContent = c.deleteWarn(nameOf(editing));
    return;
  }
  const gone = editing.id;
  state.places = state.places.filter((q) => q.id !== gone);
  save();
  render();
  closePlace();
});

el.editPlace.addEventListener("click", () => {
  if (currentPlace) openPlace(currentPlace);
});


// No outside-tap close: the place overlay has an address being set up in it, and a stray tap that
// throws that away is worse than a screen with one extra step (Trix: "until user delete or done").

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

el.sheet.addEventListener("click", (e) => { if (e.target === el.sheet) { show(null); stopRefresh(); } });
el.manage.addEventListener("click", (e) => { if (e.target === el.manage) show(null); });

document.addEventListener("keydown", (e) => {
  // The place overlay is deliberately not in this list: only 删除 or 完成 leaves it.
  if (e.key === "Escape" && (!el.sheet.hidden || !el.manage.hidden)) {
    show(null);
    stopRefresh();
  }
});

render();

/* ---------- startup: ask for location, then decide whether this region is served ---------- */

function closeGate() {
  el.gate.hidden = true;
}

let gateMode = "check";

function regionBlocked(c) {
  gateMode = "region";
  el.gateTitle.textContent = c.regionTitle;
  el.gateMsg.textContent = c.regionMsg;
  el.gateAllow.hidden = true;
  // Not an escape hatch: the app cannot answer outside NSW. Offer a re-check instead, in case the
  // fix was wrong (a cached location, a VPN, a device that reported somewhere else).
  el.gateSkip.textContent = c.gateRetry;
  el.gateSkip.hidden = false;
}

function gateNeedsGesture(c) {
  gateMode = "check";
  el.gateTitle.textContent = c.ask;
  el.gateMsg.textContent = c.locationOff;
  el.gateAllow.textContent = c.gateAllow;
  el.gateAllow.hidden = false;
  el.gateSkip.textContent = c.gateSkip;
  el.gateSkip.hidden = false;
}

/* What the last region check concluded, so a launch does not pay for the same answer twice. */
const REGION_KEY = "whereToGo.region.v1";   // rewritten for the test build, like STORE
function regionVerdict() {
  try { return localStorage.getItem(REGION_KEY) || ""; } catch { return ""; }
}
function setRegionVerdict(v) {
  try { localStorage.setItem(REGION_KEY, v); } catch { /* private mode: the gate just re-checks */ }
}

async function boot() {
  applyTheme();
  const c = t();

  // A site-level refusal cannot be re-prompted, and it is not a reason to block the app: the
  // traveller may still want the Maps hand-off.
  let state0 = "prompt";
  try {
    state0 = (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch { /* the query is not implemented everywhere */ }
  if (state0 === "denied") return closeGate();

  // Seen before: nothing to gate on, so the launch is instant. Gating every launch made a slow fix a
  // ten-second blank screen and then blamed location for a timeout (R13.2).
  const known = regionVerdict();
  if (known === "in") return closeGate();
  if (known === "out") return regionBlocked(c);

  el.gateTitle.textContent = c.ask;
  el.gateMsg.textContent = c.gateChecking;
  const loc = await askLocation({ maxAge: 0 });
  if (loc.coord) {
    location = { coord: loc.coord, at: Date.now() };
    if (inNSW(loc.coord)) {
      setRegionVerdict("in");
      return closeGate();
    }
    setRegionVerdict("out");
    return regionBlocked(c);
  }
  // No fix on a first run is not a reason to hold the tiles back. The answer path has its own, more
  // accurate thing to say when someone actually taps a place.
  closeGate();
}

el.gateAllow.addEventListener("click", async () => {
  const c = t();
  el.gateMsg.textContent = c.gateChecking;
  el.gateAllow.hidden = true;
  el.gateSkip.hidden = true;
  const loc = await askLocation({ maxAge: 0 });
  if (loc.coord) {
    location = { coord: loc.coord, at: Date.now() };
    if (inNSW(loc.coord)) {
      setRegionVerdict("in");
      return closeGate();
    }
    setRegionVerdict("out");
    return regionBlocked(c);
  }
  gateNeedsGesture(c);
});

el.gateSkip.addEventListener("click", () => {
  if (gateMode === "region") {
    // 重新定位: forget both the cached fix and the verdict, then check again.
    location = null;
    setRegionVerdict("");
    boot();
    return;
  }
  closeGate();
});

boot();

render();
