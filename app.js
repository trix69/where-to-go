/* Where To Go — Where to? · 想去哪儿
 *
 * Two screens for the traveller (tiles, answer) and one for whoever sets it up (places, language).
 * No framework, no build step, no network beyond the transit lookup.
 */

import { getTrip, mapsUrl, usingMock } from "./transit.js";

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
    demo: "SAMPLE DATA — no live transit yet",
    trip: (t) =>
      `${t.mode in COPY.en.modes ? COPY.en.modes[t.mode] : "Bus"} ${t.line} in ${t.waitMin} min, ${t.durationMin} min to get there.`,
    modes: { bus: "Bus", train: "Train", ferry: "Ferry", lightrail: "Light rail", metro: "Metro", coach: "Coach" },
    failed: "No answer right now.",
    stillGo: "Open in Maps anyway",
    needAddress: "Add an address first.",
    noOrigin: "Add a starting place first.",
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
  },
  "zh-Hant": {
    ask: "想去哪兒?",
    settings: "設定",
    back: "返回",
    places: "我的地方",
    add: "新增地方",
    done: "完成",
    delete: "刪除",
    name: "名字",
    address: "地址",
    glyph: "圖示",
    openMaps: "開啟地圖",
    looking: "正在查詢…",
    demo: "範例資料 — 還沒接實時交通",
    // Traditional form of the same rule: 號線 for a train line, 路 only for buses.
    trip: (t) => {
      const word = COPY["zh-Hant"].modes[t.mode] || "公車";
      const ride = t.mode === "train" ? `${t.line}號線`
        : t.mode === "bus" || t.mode === "coach" ? `${word}${t.line}路`
        : `${word}${t.line}`;
      return `搭${ride}，${t.waitMin}分鐘後有車，路上大約${t.durationMin}分鐘。`;
    },
    modes: { bus: "公車", train: "火車", ferry: "渡輪", lightrail: "輕軌", metro: "捷運", coach: "巴士" },
    failed: "現在查不到。",
    stillGo: "還是開啟地圖",
    needAddress: "請先填地址。",
    noOrigin: "請先填出發點。",
  },
};

const LANGS = [
  { id: "en", label: "English" },
  { id: "zh-Hans", label: "简体中文" },
  { id: "zh-Hant", label: "繁體中文" },
];

const SEED = [
  { id: "home", name: { en: "Home", "zh-Hans": "家", "zh-Hant": "家" }, glyph: "🏠", address: "12 Crown Street, Sydney NSW 2000" },
  { id: "doctor", name: { en: "Doctor", "zh-Hans": "医生", "zh-Hant": "醫生" }, glyph: "🏥", address: "Royal Prince Alfred Hospital, Missenden Road, Camperdown NSW 2050" },
  { id: "market", name: { en: "Market", "zh-Hans": "市场", "zh-Hant": "市場" }, glyph: "🛒", address: "Paddy's Markets, 9-13 Hay Street, Haymarket NSW 2000" },
  { id: "daughter", name: { en: "Daughter's", "zh-Hans": "女儿家", "zh-Hant": "女兒家" }, glyph: "👨‍👩‍👧", address: "8 Belmore Road, Randwick NSW 2031" },
  { id: "park", name: { en: "Park", "zh-Hans": "公园", "zh-Hant": "公園" }, glyph: "🌳", address: "Centennial Park, Sydney NSW 2021" },
];

/* ---------- state ---------- */

function pickLang() {
  const l = (navigator.language || "en").toLowerCase();
  if (l.startsWith("zh")) return /-(tw|hk|mo|hant)/.test(l) ? "zh-Hant" : "zh-Hans";
  if (l.startsWith("en")) return "en";
  return "en";
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.places) && COPY[s.lang]) return s;
    }
  } catch (e) { /* private mode, corrupt value: fall through to the seed */ }
  return { lang: pickLang(), places: SEED.map((p) => ({ ...p })) };
}

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
}

const t = () => COPY[state.lang] || COPY.en;
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
  manage: $("manage"),
  manageTitle: $("manageTitle"),
  langRow: $("langRow"),
  places: $("places"),
  addBtn: $("addBtn"),
  closeManage: $("closeManage"),
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
let geoAsked = null;

/** Where the traveller is starting from: the device, else the place called Home. Asked once per session. */
function askLocation() {
  if (!geoAsked) {
    geoAsked = new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      const done = setTimeout(() => resolve(null), 5000);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(done); resolve({ coord: { lng: pos.coords.longitude, lat: pos.coords.latitude } }); },
        () => { clearTimeout(done); resolve(null); },
        { timeout: 5000, maximumAge: 120000, enableHighAccuracy: false },
      );
    });
  }
  return geoAsked;
}

async function originFor(place) {
  const loc = await askLocation();
  if (loc) return loc;
  const home = state.places.find((p) => p.id === "home" && p.address);
  if (home && home.id !== place.id) return { address: home.address };
  return null;
}

async function openAnswer(place) {
  const c = t();
  show("answer");
  el.sheetTitle.textContent = nameOf(place);
  el.summary.textContent = c.looking;
  el.stamp.hidden = true;
  const seq = ++lookSeq;
  let mode = "transit";
  el.closeSheet.textContent = c.back;
  // The hand-off link does not depend on the trip, so it is set before the lookup: an
  // "Open in Maps" button still pointing at "#" during a slow fetch is a trap. A place with no
  // address has nowhere to hand off to, so that button is simply not offered.
  el.go.href = mapsUrl(place, mode);
  el.go.textContent = c.openMaps;
  el.go.hidden = !place.address;
  if (!place.address) {
    // Nothing to hand off to, and nothing to look up: say the one useful thing and stop.
    el.summary.textContent = c.needAddress;
    return;
  }

  try {
    const origin = await originFor(place);
    if (seq !== lookSeq) return;
    if (!origin) {
      el.summary.textContent = c.noOrigin;
      el.go.textContent = c.stillGo;
    } else {
      const trip = await getTrip(place, { origin });
      if (seq !== lookSeq) return;
      mode = trip.mode;
      el.summary.textContent = c.trip(trip);
      // Anything that is not the live provider gets said out loud, in the answer card.
      if (trip.provider !== "tfnsw") {
        el.stamp.textContent = c.demo;
        el.stamp.dataset.kind = "demo";
        el.stamp.hidden = false;
      }
    }
  } catch (err) {
    if (seq !== lookSeq) return;
    // No answer is still a decision the user can act on — unless there is no destination at all.
    const why = err && err.message;
    el.summary.textContent = why === "no-address" ? c.needAddress : why === "no-origin" ? c.noOrigin : c.failed;
    el.go.textContent = c.stillGo;
    el.go.hidden = !place.address;
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

function placeRow(place) {
  const c = t();
  const li = document.createElement("li");
  li.className = "place";

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
    field(c.address, place.address, (v) => { place.address = v; save(); }, "span2"),
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
el.gear.addEventListener("click", openManage);
el.closeManage.addEventListener("click", () => show(null));

el.sheet.addEventListener("click", (e) => { if (e.target === el.sheet) show(null); });
el.manage.addEventListener("click", (e) => { if (e.target === el.manage) show(null); });

el.addBtn.addEventListener("click", () => {
  const newName = { en: "New place", "zh-Hans": "新地方", "zh-Hant": "新地方" };
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
