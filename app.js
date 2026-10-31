/* Where To Go — Where to? · 想去哪儿
 *
 * Two screens for the traveller (tiles, answer) and one for whoever sets it up (places, language).
 * No framework, no build step, no network beyond the transit lookup.
 */

import { getTrip, mapsUrl, usingMock, searchAddresses, reverseAddress } from "./transit.js?v=1.4";

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
    locationOff: "Your browser hasn't allowed this site to use location. Allow it in the browser, then try again.",
    locationBlocked: "Couldn't get your location. Check that device location is on, then try again.",
    locationFailed: "Couldn't get your location. Try again.",
    useMyLocation: "Use my location",
    gateChecking: "Checking your location…",
    gateAllow: "Allow location",
    gateSkip: "Look around",
    gateRetry: "Check again",
    locTitle: "Location needed",
    locAsk: "This app needs your location to tell you how to get there.",
    locPromptMsg: "Tap the button below and allow location.",
    locDeniedMsg: "Location is off for this app. Turn it on with the steps below, then come back and tap Try again.",
    locNoFixMsg: "Your phone has not given a location yet. Move near a window or outside, then try again.",
    locRetry: "Try again",
    locIosTitle: "On iPhone or iPad",
    locIos1: "Open Settings",
    locIos2: "Tap Privacy & Security, then Location Services, and turn it on",
    locIos3: "Scroll to Safari (or Where To Go) and choose While Using the App",
    locIos4: "Come back here and tap Try again",
    locAndroidTitle: "On Android",
    locAndroid1: "Open Settings, then Apps, then Chrome (or Where To Go)",
    locAndroid2: "Tap Permissions, then Location, then Allow",
    locAndroid3: "Come back here and tap Try again",
    locOtherTitle: "In this browser",
    locOther1: "Click the lock beside the address",
    locOther2: "Set Location to Allow",
    locOther3: "Reload this page",
    regionTitle: "Not here yet",
    regionMsg: "It only works in New South Wales, Australia.",
    storageWarn: "This browser isn't saving changes (private browsing?). Places will be lost when you close the tab.",
    demo: "SAMPLE DATA — no live transit yet",
    // Line, boarding stop, stops, alighting stop, then the timing: the four things a person standing
    // at a stop needs, and none of them a guess — `stops` is the ride's own stop list.
    trip: (t, arrive) => {
      const word = COPY.en.modes[t.mode] || "Bus";
      const head = `${word} ${t.line}`;
      const tail = `${t.waitMin} min` + (arrive ? `, arriving ${arrive}.` : ".");
      if (!t.board || !t.alight || !t.stops) {
        // Nothing to name (mock, or a provider without a stop list): one line, and the walk gets its own
        // clause rather than being folded into the on-board minutes (R35.3).
        const aboard = onBoardMin(t.departISO, t.alightISO) ?? t.rideMin ?? t.durationMin;
        const walk = t.walkFromStopMin > 0 ? `, ${t.walkFromStopMin} min walk` : "";
        const door = arrive ? clockAfter(t.departISO, t.arriveISO) : "";
        return `${head} in ${t.waitMin} min, ${aboard} min on board${walk}` +
          (door ? `, arriving ${door}.` : ".");
      }
      const at = (stop, platform) => (platform ? `${stop}, platform ${platform}` : stop);
      const way = t.towards ? ` towards ${t.towards}` : "";
      const platform = /^\d+[A-Za-z]?$/.test(String(t.boardPlatform || "")) ? `platform ${t.boardPlatform}` : "";
      const departs = t.departISO ? clock(t.departISO) : "";
      const service = [`${head}${way}`, platform, `in ${t.waitMin} min`, departs ? `departs ${departs}` : ""]
        .filter(Boolean).join(", ");
      const stopRaw = t.alightISO ? clock(t.alightISO) : "";
      const stopAt = t.alightISO ? clockAfter(t.departISO, t.alightISO) : "";
      const doorAt = arrive && clock(t.arriveISO) !== stopRaw
        ? clockAfter(t.alightISO || t.departISO, t.arriveISO)
        : "";
      // The change notice carries the door clock on a journey with a change, so the second time is not
      // left standing beside the first vehicle's stop (R37.2).
      const change = t.changes > 0
        ? ` Change ${t.changes} time${t.changes > 1 ? "s" : ""} on the way${doorAt ? `, arriving ${doorAt}` : ""}.`
        : "";
      if (Array.isArray(t.rides) && t.rides.length > 1) {
        const chain = `Change ${t.rides.length - 1} time${t.rides.length > 2 ? "s" : ""}: ` +
          `board at ${t.board}, ` +
          t.rides.map((r, i) => {
            const extra = i === 0 ? [] : [
              r.towards ? `towards ${r.towards}` : "",
              r.departISO ? `departs ${clockAfter(t.departISO, r.departISO)}` : "",
            ];
            const why = extra.filter(Boolean).join(", ");
            return `${i === 0 ? "first" : i === t.rides.length - 1 ? "then" : "next"} ` +
              `${(COPY.en.modes[r.mode] || "bus").toLowerCase()} ${r.line}${why ? ` (${why})` : ""} to ${r.alight}`;
          }).join(", ") + ".";
        const chainDoor = arrive ? clockAfter(t.departISO, t.arriveISO) : "";
        const arrival = chainDoor
          ? (t.walkFromStopMin > 0 ? `${t.walkFromStopMin} min walk, ${chainDoor} at the door.` : `${chainDoor} at the door.`)
          : "";
        return [service, chain, arrival].filter(Boolean).join("\n");
      }
      const tail2 = t.changes > 0
        ? stopAt ? `${stopAt} at the stop.` : ""
        : t.walkFromStopMin > 0 && stopAt && doorAt
          ? `${stopAt} at the stop. ${t.walkFromStopMin} min walk, ${doorAt} at the door.`
          : `${stopAt && doorAt ? `${stopAt} at the stop. ` : ""}${doorAt ? `${doorAt} at the door.` : ""}`;
      return `${service}\nBoard at ${t.board}, ${t.stops} stop${t.stops > 1 ? "s" : ""}, ` +
        `get off at ${t.alight}.${change}${tail2 ? ` ${tail2}` : ""}`;
    },
    modes: { bus: "Bus", train: "Train", ferry: "Ferry", lightrail: "Light rail", metro: "Metro", coach: "Coach" },
    failed: "No answer right now.",
    arrived: "You have arrived.",
    dupName: (n) => `There is already a place called "${n}".`,
    stillGo: "Open in Maps anyway",
    needAddress: "Add an address first.",
    noOrigin: "Add a starting place first.",
    share: "Share this address",
    shareTitle: "An address for Where To Go",
    shareBody: "Open this link and give the address a name of your own.",
    shareCopied: "Link copied",
    shareFailed: "Couldn't share here",
    sharedNote: "This address came from a link. Give it a name, then 完成.",
    newName: "Name, e.g. Daughter's house",
    mapOpen: "Pick on the map",
    mapTitle: "Pick on the map",
    mapHint: "Drag the map until the pin is on the door.",
    mapUse: "Use this spot",
    mapCancel: "Cancel",
    mapLooking: "Looking…",
    mapNoAddress: "No street address here — the pin itself is enough.",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
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
    reloading: "Reloading…",
    offline: "No internet — can't check",
    addHome: "Add to home screen",
    device: "Phone",
    phoneIos: "iPhone / iPad",
    phoneAndroid: "Android",
    stepsIos: [
      "Open this page in Safari.",
      "Tap the Share button.",
      "Scroll down and tap Add to Home Screen.",
      "Tap Add.",
    ],
    stepsAndroid: [
      "Open this page in Chrome.",
      "Tap the three dots at the top right.",
      "Tap Add to Home screen.",
      "Tap Add to confirm.",
    ],
    homeNote: "Once it is on the home screen, one tap opens it.",
    orderTitle: "Order of places",
    orderRow: "Order",
    moveUp: "Move up",
    moveDown: "Move down",
    movedTo: (name, n) => `${name} is now number ${n}.`,
    sizeLabel: "Text size",
    sizes: { sm: "Small", md: "Medium", lg: "Large", xl: "Extra large" },
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
    locationOff: "浏览器还没允许这个网站使用定位。请在浏览器里允许，再试一次。",
    locationBlocked: "拿不到定位。请确认设备的定位已打开，再试一次。",
    locationFailed: "暂时定位不到，请重试。",
    useMyLocation: "使用我的位置",
    gateChecking: "正在确认位置…",
    gateAllow: "允许定位",
    gateSkip: "先看看",
    gateRetry: "重新定位",
    locTitle: "需要打开定位",
    locAsk: "这个应用要用您的位置，才能告诉您怎么走。",
    locPromptMsg: "点下面的按钮，允许使用位置。",
    locDeniedMsg: "定位还没有打开。照着下面的步骤打开，再回来点「再试一次」。",
    locNoFixMsg: "手机还没给出位置。请到窗边或室外，再试一次。",
    locRetry: "再试一次",
    locIosTitle: "在 iPhone 或 iPad 上",
    locIos1: "打开手机的「设置」",
    locIos2: "点「隐私与安全性」，再点「定位服务」，把它打开",
    locIos3: "往下找到「Safari 浏览器」（或「想去哪儿」），选「使用 App 期间」",
    locIos4: "回到这里，点「再试一次」",
    locAndroidTitle: "在安卓手机上",
    locAndroid1: "打开「设置」，点「应用」，找到 Chrome（或「想去哪儿」）",
    locAndroid2: "点「权限」，再点「位置」，选「允许」",
    locAndroid3: "回到这里，点「再试一次」",
    locOtherTitle: "在这个浏览器里",
    locOther1: "点地址栏左边的锁形图标",
    locOther2: "把「位置」改成「允许」",
    locOther3: "刷新这一页",
    regionTitle: "本地区还没开通",
    regionMsg: "这个应用目前只在澳大利亚新南威尔士州（NSW）可以使用。",
    storageWarn: "当前浏览器无法保存（无痕浏览？）。关闭后这些地点会丢失。",
    demo: "示例数据 — 还没接实时公交",
    // "路" is the bus-route suffix; a train line takes "号线", and ferry/light-rail numbers take neither.
    trip: (t, arrive) => {
      const word = COPY["zh-Hans"].modes[t.mode] || "公交";
      const line = t.mode === "bus" || t.mode === "coach" ? `${word}${t.line}路` : `${word}${t.line}`;
      if (!t.board || !t.alight || !t.stops) {
        // No stop list (mock, or a provider that does not give one): keep the older, vaguer sentence.
        const ride = t.towards ? `${line}（开往${t.towards}）` : line;
        const aboard = onBoardMin(t.departISO, t.alightISO) ?? t.rideMin ?? t.durationMin;
        const then = t.walkFromStopMin > 0 ? `，下车后再走${t.walkFromStopMin}分钟` : "";
        const door = arrive ? clockAfter(t.departISO, t.arriveISO) : "";
        return `坐${ride}，${t.waitMin}分钟后有车，车上大约${aboard}分钟${then}${door ? `，${door}到` : ""}。`;
      }
      const at = (stop, platform) => (platform ? `${stop} ${platform}号站台` : stop);
      // Which way the vehicle is going: that is what its front display says, and a platform holds both
      // directions. Always shown when the provider gives a terminus (Trix).
      const way = t.towards ? `（开往${t.towards}）` : "";
      /* Line one is what a person standing at the stop needs to see: which service, which platform (only
       * when it is a real platform number — a light-rail stop reports a code like "L2", and a bus stop's
       * Stand is already in its name), how long, and the clock time it leaves (Trix). */
      const platform = /^\d+[A-Za-z]?$/.test(String(t.boardPlatform || "")) ? `${t.boardPlatform}号站台` : "";
      const departs = t.departISO ? clock(t.departISO) : "";
      /* Three short lines, one idea each (Trix's draft, tightened):
       *   1. the service you are waiting for
       *   2. the ride — board, stops, and the clock time it reaches the stop you leave at
       *   3. the walk to the door, with the one arrival time that matters
       * The draft repeated itself: "22:23到站" and "预计到达时间22:32" are the stop and the door, and
       * "8分钟后到站，22:22发车" was one departure described twice. */
      // A bus pulls up at a stop (到站), a train leaves a platform (发车), a ferry leaves a wharf (开船).
      // An unmapped mode says nothing rather than borrowing the train's verb (R37.1).
      const verb = ({ bus: "到站", coach: "到站", lightrail: "到站", metro: "到站", train: "发车", ferry: "开船" })[t.mode] || "";
      const service = [`${line}${way}`, platform,
        `${t.waitMin}分钟后${verb}${departs ? `（${departs}）` : ""}`].filter(Boolean).join("，");

      // The first clock that crosses midnight carries 次日; a later clock on the same day needs nothing
      // (R37.5). The raw clocks decide whether the stop and the door are the same instant.
      const stopRaw = t.alightISO ? clock(t.alightISO) : "";
      const stopAt = t.alightISO ? clockAfter(t.departISO, t.alightISO) : "";
      // 在…下车 is the natural word order; 到X下车 reads like a typo to a Chinese reader.
      const ride = `从${t.board}上车，坐${t.stops}站，` +
        (stopAt ? `${stopAt}在${t.alight}下车。` : `在${t.alight}下车。`);

      /* One clock when the ride ends at the door (R37.3): stopAt and arrive are then the same instant,
       * and printing both eight words apart reads as a mistake. */
      const doorAt = arrive && clock(t.arriveISO) !== stopRaw
        ? clockAfter(t.alightISO || t.departISO, t.arriveISO)
        : "";
      /* A journey with a change names every vehicle (Trix): 换乘1次：先坐…，再坐…。 The walk and the
       * door clock follow on their own line, because they belong to the last vehicle. */
      if (Array.isArray(t.rides) && t.rides.length > 1) {
        const label = (mode, line) => {
          const word = COPY["zh-Hans"].modes[mode] || "公交";
          return mode === "bus" || mode === "coach" ? `${word}${line}路` : `${word}${line}`;
        };
        /* Where to wait, then each vehicle. After the first, the direction and the departure clock
         * belong in the bracket: a platform holds both directions, and a transfer with no clock is an
         * unexplained gap between the first departure and the final arrival (R43.1-R43.3). */
        const chain = `换乘${t.rides.length - 1}次：从${t.board}上车，` + t.rides.map((r, i) => {
          const verb = i === 0 ? "先坐"
            : i === t.rides.length - 1 ? (t.rides.length > 2 ? "最后坐" : "再坐")
              : "然后坐";
          const extra = i === 0 ? [] : [
            r.towards ? `开往${r.towards}` : "",
            r.departISO ? `${clockAfter(t.departISO, r.departISO)}开` : "",
          ];
          const why = extra.filter(Boolean).join("，");
          return `${verb}${label(r.mode, r.line)}${why ? `（${why}）` : ""}到${r.alight}`;
        }).join("，") + "。";
        // No stop clock is printed in a chain card, so the door clock is dated against the service
        // clock it follows — otherwise a 23:43 departure and a 00:47 arrival sit unmarked.
        const chainDoor = arrive ? clockAfter(t.departISO, t.arriveISO) : "";
        const arrival = chainDoor
          ? (t.walkFromStopMin > 0 ? `再走${t.walkFromStopMin}分钟，${chainDoor}到。` : `${chainDoor}到。`)
          : "";
        return [service, chain, arrival].filter(Boolean).join("\n");
      }

      const walkLine = doorAt && t.changes === 0 && t.walkFromStopMin > 0
        ? `再走${t.walkFromStopMin}分钟，${doorAt}到。`
        : "";
      // With no walk line the door time belongs on the ride line — but on a journey with a change it
      // travels with the change notice, which is the thing that explains the gap (R37.2).
      const rideWithArrival = walkLine || !doorAt || t.changes > 0
        ? ride
        : `${ride.replace(/。$/, "")}，${doorAt}到。`;
      const changeNow = t.changes > 0
        ? `中途换乘${t.changes}次${doorAt ? `，${doorAt}到` : ""}。`
        : "";

      return [service, rideWithArrival + changeNow, walkLine].filter(Boolean).join("\n");
    },
    modes: { bus: "公交", train: "火车", ferry: "渡轮", lightrail: "轻轨", metro: "地铁", coach: "巴士" },
    failed: "现在查不到。",
    arrived: "您已经到了。",
    dupName: (n) => `已经有叫「${n}」的地点了。`,
    stillGo: "还是打开地图",
    needAddress: "请先填地址。",
    noOrigin: "请先填出发点。",
    share: "分享这个地址",
    shareTitle: "想去哪儿 · 一个地址",
    shareBody: "打开链接，自己给它起个名字。",
    shareCopied: "链接已复制",
    shareFailed: "这里无法分享",
    sharedNote: "这个地址来自别人分享的链接。起个名字，再点完成。",
    newName: "起个名字，例如：女儿家",
    mapOpen: "在地图上选位置",
    mapTitle: "在地图上选位置",
    mapHint: "拖动地图，把图钉对准门口。",
    mapUse: "就用这里",
    mapCancel: "取消",
    mapLooking: "正在查找…",
    mapNoAddress: "这里没有门牌，用图钉的位置也可以。",
    zoomIn: "放大",
    zoomOut: "缩小",
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
    reloading: "正在重新加载…",
    offline: "没有网络，无法检查",
    addHome: "添加到主屏幕",
    device: "手机",
    phoneIos: "iPhone / iPad",
    phoneAndroid: "安卓",
    stepsIos: [
      "用 Safari 打开这个网页。",
      "点下面的「分享」按钮。",
      "往下滑，点「添加到主屏幕」。",
      "点右上角的「添加」。",
    ],
    stepsAndroid: [
      "用 Chrome 打开这个网页。",
      "点右上角的三个点。",
      "点「添加到主屏幕」。",
      "再点一次「添加」。",
    ],
    homeNote: "放到主屏幕后，从桌面一下点开。",
    orderTitle: "排列顺序",
    orderRow: "排列顺序",
    moveUp: "上移",
    moveDown: "下移",
    movedTo: (name, n) => `「${name}」已移到第 ${n} 位。`,
    sizeLabel: "字体大小",
    sizes: { sm: "小", md: "中", lg: "大", xl: "特大" },
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
  // A chosen order wins over the seed rank (R46.4); new presets are simply appended.
  if (!stored.orderChosen) {
    stored.places.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : SEED.length) - (rank.has(b.id) ? rank.get(b.id) : SEED.length));
  }
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
        /* Sorting the presets is only right while the order is not the user's decision. Once somebody
         * drags a tile, `orderChosen` says the order is theirs and no migration may re-sort it (R46.4). */
        /* The theme default changed to light (Trix). A stored "auto" is almost always the old default
         * rather than a decision, so it is migrated once; from now on an explicit pick sets
         * `themeChosen`, which this never touches again. */
        if (!s.themeChosen && (!s.theme || s.theme === "auto")) s.theme = "light";
        return ensureDefaults(s);
      }
    }
  } catch (e) { /* private mode, corrupt value: fall through to the seed */ }
  return { lang: pickLang(), theme: "light", fontSize: "md", seedVersion: SEED_VERSION, places: SEED.map((p) => ({ ...p })) };
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

/* On-board minutes for one vehicle: its own departure and its own arrival, so the walk at the end is
 * never counted twice (R35.3). */
function onBoardMin(fromISO, toISO) {
  const a = new Date(fromISO), b = new Date(toISO);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

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
  // "2-digit", not "numeric": numeric prints 0:27 after midnight, which reads as earlier than the
  // 23:41 it follows (R37.4).
  const opts = { hour: "2-digit", minute: "2-digit", timeZone: "Australia/Sydney" };
  if (state.lang === "en") return d.toLocaleTimeString("en-AU", opts);
  return d.toLocaleTimeString("zh-CN", { ...opts, hourCycle: "h23" });
}

/* A trip that crosses midnight prints 次日 before the clock that has rolled over, because a bare 00:27
 * after 23:41 reads as a mistake rather than a next day. */
function sydneyDay(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
}
function clockAfter(fromISO, iso) {
  const text = clock(iso);
  if (!text || !fromISO) return text;
  if (state.lang === "en") return text;   // "12:04 am" is already unambiguous; 次日 is not English
  return sydneyDay(fromISO) !== sydneyDay(iso) ? `次日${text}` : text;
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
  gateSteps: $("gateSteps"),
  gateStepsTitle: $("gateStepsTitle"),
  gateStepList: $("gateStepList"),
  gear: $("settingsBtn"),
  tiles: $("tiles"),
  orderStatus: $("orderStatus"),
  order: $("order"),
  orderBtn: $("orderBtn"),
  orderTitle: $("orderTitle"),
  orderList: $("orderList"),
  orderDone: $("orderDone"),
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
  sizeRow: $("sizeRow"),
  sizeStatus: $("sizeStatus"),
  sizeLabel: $("sizeLabel"),
  install: $("install"),
  installTitle: $("installTitle"),
  installBtn: $("installBtn"),
  installDone: $("installDone"),
  installNote: $("installNote"),
  devRow: $("devRow"),
  devLabel: $("devLabel"),
  stepsIos: $("stepsIos"),
  stepsAndroid: $("stepsAndroid"),
  iconLabel: $("iconLabel"),
  place: $("place"),
  placeTitle: $("placeTitle"),
  placeName: $("placeName"),
  namePencil: $("namePencil"),
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
  placeShare: $("placeShare"),
  toast: $("toast"),
  placeMap: $("placeMap"),
  placeMapLabel: $("placeMapLabel"),
  map: $("map"),
  mapTitle: $("mapTitle"),
  mapHint: $("mapHint"),
  mapWrap: $("mapWrap"),
  mapTilesLayer: $("mapTiles"),
  mapAddr: $("mapAddr"),
  mapUse: $("mapUse"),
  mapCancel: $("mapCancel"),
  mapIn: $("mapIn"),
  mapOut: $("mapOut"),
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
  li.dataset.id = place.id;

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

/* ---------- the order of the places ----------
 * Trix: "try the up and down row in setting". No drag anywhere in the app: a list in Settings, one row
 * per place, with ↑ and ↓. Two taps to move one place, no gesture to learn, and nothing on the tile
 * screen that is not the tile.
 */

function movePlace(place, delta) {
  const from = state.places.indexOf(place);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= state.places.length) return false;
  state.places.splice(to, 0, state.places.splice(from, 1)[0]);
  state.orderChosen = true;
  save();
  render();
  el.orderStatus.textContent = t().movedTo(nameOf(place), to + 1);
  return true;
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

function openOrder() {
  const c = t();
  el.orderTitle.textContent = c.orderTitle;
  el.orderDone.textContent = c.done;
  el.orderList.replaceChildren(...state.places.map((place, i) => {
    const li = document.createElement("li");
    li.className = "order-row";
    li.dataset.id = place.id;

    const face = document.createElement("span");
    face.className = "order-face";
    face.setAttribute("aria-hidden", "true");
    face.textContent = place.glyph || "📍";

    const name = document.createElement("span");
    name.className = "order-name";
    name.textContent = nameOf(place);

    const up = document.createElement("button");
    up.type = "button";
    up.className = "arrow up";
    up.textContent = "↑";
    up.setAttribute("aria-label", `${c.moveUp}: ${nameOf(place)}`);
    up.disabled = i === 0;
    up.addEventListener("click", () => { if (movePlace(place, -1)) { openOrder(); refocus(place.id, "up"); } });

    const down = document.createElement("button");
    down.type = "button";
    down.className = "arrow down";
    down.textContent = "↓";
    down.setAttribute("aria-label", `${c.moveDown}: ${nameOf(place)}`);
    down.disabled = i === state.places.length - 1;
    down.addEventListener("click", () => { if (movePlace(place, 1)) { openOrder(); refocus(place.id, "down"); } });

    li.append(face, name, up, down);
    return li;
  }));
  show("order");
}

/* Focus follows the place being moved, so a second tap on the same arrow keeps working after the list is
 * rebuilt. At either end that arrow is now disabled and cannot take focus, so the opposite one does — the
 * direction a person wants next is the one that still moves (R50.2). */
function refocus(id, dir) {
  const row = el.orderList.querySelector(`li[data-id="${id}"]`);
  if (!row) return;
  const same = row.querySelector(`.arrow.${dir}`);
  const other = row.querySelector(`.arrow.${dir === "up" ? "down" : "up"}`);
  const target = same && !same.disabled ? same : other && !other.disabled ? other : row.querySelector(".order-name");
  target?.focus?.();
}

/* Which control opened the dialog that is open now. A screen-reader user taps the 添加到主屏幕 row,
 * the row goes hidden underneath them, and nothing is announced — so the arriving dialog takes focus
 * and the closing dialog hands it back (R38.4). */
let focusReturnTo = null;

function show(which) {
  const wasOpen = !el.sheet.hidden || !el.manage.hidden || !el.place.hidden || !el.install.hidden
    || !el.icons.hidden || !el.order.hidden || !el.map.hidden;
  if (which && !wasOpen) focusReturnTo = document.activeElement;

  el.sheet.hidden = which !== "answer";
  el.manage.hidden = which !== "manage";
  el.place.hidden = which !== "place";
  el.install.hidden = which !== "install";
  el.order.hidden = which !== "order";
  el.map.hidden = which !== "map";
  if (which !== "map") stopMap();
  if (which !== "icons") el.icons.hidden = true;
  document.body.style.overflow = which ? "hidden" : "";

  if (which) {
    const root = { answer: el.sheet, manage: el.manage, place: el.place, install: el.install,
                   icons: el.icons, order: el.order, map: el.map }[which];
    const target = root && root.querySelector(".sheet-title[tabindex], [data-focus], .icons[tabindex]");
    target?.focus?.({ preventScroll: true });
  } else if (focusReturnTo && document.contains(focusReturnTo)) {
    focusReturnTo.focus?.({ preventScroll: true });
    focusReturnTo = null;
  }
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
let myLocation = null; // {coord, at} once granted; never cache a failure, so "Use my location" can retry

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
      (err) => finish({
        error: err && err.code === 1 ? "denied" : err && err.code === 3 ? "timeout" : "unavailable",
        code: err && err.code,
      }),
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
  /* Permission can be taken away while the app is open — on iOS it is usually taken away in Settings and
     the person comes straight back. Any refusal, wherever it is asked from, raises the blocking overlay
     (Trix: "If the location permission got disabled or revoked during middle of the app usage, display
     that overlay the same way"). */
  if (!gateAskInFlight && !el.gate.hidden && gateMode === "location") return { error: "denied" };
  // The stamp is the point: without it a launch-time fix was reused for the whole page session, so a
  // trip asked 4 km away was still computed from where the phone was when the app opened (R16.1).
  if (myLocation && myLocation.coord && maxAge > 0 && Date.now() - (myLocation.at || 0) < maxAge) return myLocation;
  if (!navigator.geolocation) return { error: "unavailable" };

  let res = await askOnce(maxAge);
  if (res.error === "timeout" || res.error === "unavailable") {
    await new Promise((r) => setTimeout(r, 900));
    res = await askOnce(maxAge);
  }
  if (res.coord) return { coord: res.coord, at: Date.now() };
  if (res.error !== "denied") return res;

  /* Chrome answers PERMISSION_DENIED when the *operating system* has location switched off, even
   * though the site was granted it — so "定位已关闭。请允许定位" sent people to a permission screen
   * that already said allow (Trix, on a desktop where the site permission was granted). Ask the
   * browser what it thinks: granted + a refusal means the block is outside the browser. */
  let state = "";
  try {
    state = (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch { /* not implemented everywhere */ }
  if (state !== "granted") return res;

  /* Permission says yes and the browser said no. That is either the operating system withholding a fix
   * or a hiccup in Chrome's own positioning service, and the two are indistinguishable from here — so
   * it gets one more attempt before anything is blamed, and the sentence stays neutral (R25's
   * "设备的定位服务关着" asserted a cause the app cannot see). */
  for (let attempt = 0; attempt < 2; attempt++) {
    await new Promise((r) => setTimeout(r, 900));
    const again = await askOnce(maxAge);
    if (again.coord) return { coord: again.coord, at: Date.now() };
    res = again;
  }
  return { error: "blocked", code: res.code, perm: state };
}

async function originFor() {
  // Every lookup starts where the phone is. There is no "from home" fallback any more: guessing that
  // someone is at home sends a person standing at a bus stop to the wrong place, and the Home place
  // no longer has an address to guess with.
  const loc = await askLocation();
  // The code and the permission state travel with a failure: without them the card can only guess at a
  // cause, and ?diag=1 can only print question marks.
  return loc.coord
    ? { coord: loc.coord }
    : { error: loc.error, code: loc.code, perm: loc.perm };
}

/**
 * A card taller than the sheet has to say so. At 特大 on a 667 px phone a two-vehicle answer runs 392 px
 * past the body, and the arrival — the number this app exists to print — is the last line: an elderly
 * reader can take the vehicle line for the answer and never learn when they arrive (R66.1). The hint is
 * a sticky band, so it stays at the bottom edge while the card is scrolled rather than scrolling away
 * with the first line.
 */
function markCardOverflow() {
  const body = el.sheet.querySelector(".sheet-body");
  if (!body) return;
  body.classList.toggle("more", body.scrollHeight - body.clientHeight > 8);
}

async function openAnswer(place, opts = {}) {
  const c = t();
  const refresh = opts.refresh === true;
  currentPlace = place;
  show("answer");
  requestAnimationFrame(markCardOverflow);
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
      // ?diag=1 appends what the browser actually said, for a report like "I granted it and it still
      // fails" — the app's own sentence is deliberately vague because it cannot know the cause.
      if (new URLSearchParams(window.location.search).has("diag") && origin.error) {
        el.summary.textContent += ` [${origin.error} perm=${origin.perm || "?"} code=${origin.code ?? "?"}]`;
      }
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
      markCardOverflow();
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

/* ---------- text size ----------
 * Four steps, applied as one multiplier on the root font size, because everything above it is in rem.
 * 小 is deliberately allowed to sit just under the 20 px body floor this app was designed to: it is an
 * opt-in for someone with a large phone, whereas 中 is what the design is measured at.
 */

const SIZES = ["sm", "md", "lg", "xl"];

function applySize() {
  document.documentElement.dataset.size = SIZES.includes(state.fontSize) ? state.fontSize : "md";
  requestAnimationFrame(markCardOverflow);   // a bigger text size can push the card past the sheet
  placeNamePencil();                 // the name is set larger or smaller, and the pencil follows it
}

/* ---------- add to the home screen ----------
 * The shape is Violin Toolkit's install sheet — pick the phone, then numbered steps with the button to
 * look for drawn beside the step — without its offline promise: this app has no offline mode, and the
 * reason to install is that a person taps one icon on their own phone instead of finding the browser
 * first. The phone is guessed from the user agent and can be overridden, because the person setting the
 * app up is often on a different phone from the one it will run on.
 */

const ICON_SHARE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4l4 4"/>' +
  '<path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1"/></svg>';
const ICON_MENU =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/>' +
  '<circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>';
const ICON_ADD =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/>' +
  '<path d="M12 8.5v7M8.5 12h7"/></svg>';

let device = /android/i.test(navigator.userAgent) ? "android" : "ios";

function fillSteps(ol, lines, icons) {
  ol.replaceChildren(...lines.map((line, i) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.textContent = line;
    li.append(text);
    if (icons[i]) {
      const mark = document.createElement("span");
      mark.innerHTML = icons[i];
      li.append(mark.firstElementChild);
    }
    return li;
  }));
}

function openInstall() {
  const c = t();
  el.installTitle.textContent = c.addHome;
  el.installNote.textContent = c.homeNote;
  el.installDone.textContent = c.done;
  el.devLabel.textContent = c.device;
  el.devRow.replaceChildren(
    ...[[ "ios", c.phoneIos ], [ "android", c.phoneAndroid ]].map(([id, label]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.setAttribute("aria-pressed", String(device === id));
      b.addEventListener("click", () => { device = id; openInstall(); });
      return b;
    }),
  );
  // The icon drawn beside a step is the button the step tells them to tap, so it sits on the step
  // that names it and nowhere else.
  // The plus belongs on the step that names 添加, not on the one that opens the share sheet (R38.1).
  fillSteps(el.stepsIos, c.stepsIos, [null, ICON_SHARE, null, ICON_ADD]);
  fillSteps(el.stepsAndroid, c.stepsAndroid, [null, ICON_MENU, null, ICON_ADD]);
  el.stepsIos.hidden = device !== "ios";
  el.stepsAndroid.hidden = device !== "android";
  show("install");
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
  el.installBtn.textContent = c.addHome;
  el.orderBtn.textContent = c.orderRow;

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
  const theme = state.theme || "light";
  el.themeRow.replaceChildren(
    ...THEMES.map((th) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = th.label();
      b.setAttribute("aria-pressed", String(theme === th.id));
      b.addEventListener("click", () => {
        state.theme = th.id;
        state.themeChosen = true;      // a real choice survives future default changes
        applyTheme();
        save();
        openManage();
      });
      return b;
    }),
  );
  el.sizeLabel.textContent = c.sizeLabel;
  el.sizeRow.replaceChildren(
    ...SIZES.map((id) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.sizes[id];
      b.setAttribute("aria-pressed", String((state.fontSize || "md") === id));
      b.setAttribute("aria-label", `${c.sizeLabel}: ${c.sizes[id]}`);
      b.addEventListener("click", () => {
        state.fontSize = id;
        applySize();
        save();
        // In place: rebuilding the row destroyed the focused button and threw a keyboard or VoiceOver
        // user back to the dialog title, with nothing announced (R41.3).
        for (const [i, btn] of [...el.sizeRow.querySelectorAll("button")].entries()) {
          btn.setAttribute("aria-pressed", String(SIZES[i] === id));
        }
        el.sizeStatus.textContent = `${c.sizeLabel}: ${c.sizes[id]}`;
      });
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

function openPlace(place, opts = {}) {
  const c = t();
  // A shared address is a draft even though it arrives with a coordinate: nothing is written until the
  // person names it. opts.draft says so.
  editingIsNew = opts.draft ? true : !place;
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
  el.placeMapLabel.textContent = c.mapOpen;
  closeList();
  renderIcons();
  refreshDone();
  show("place");
  placeNamePencil();

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
  refreshShare();
}

/* Sharing is offered for a saved place with a coordinate — the URL promises a point somebody else can
 * use, and a half-filled place is not a promise. It is recomputed on every change rather than once when
 * the sheet opens: a preset place that only becomes a real address after a pin or a pick had no share
 * icon until the sheet was closed and opened again (Trix: "I cannot see the share icon"). */
function refreshShare() {
  /* A coordinate is the whole promise: the link carries the point and the receiver's app asks what is
     there. Requiring a label as well hid the icon on a place saved before its address lookup answered. */
  const shareable = !!editing && !editingIsNew && !!editing.coord;
  el.placeShare.hidden = !shareable;
  el.placeShare.setAttribute("aria-label", t().share);
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

/* ---------- sharing an address ----------
 * Trix: a saved address should be shareable as a link, and whoever receives it should land in this app
 * with that address ready and a name to fill in.
 *
 * The URL carries the coordinate and the label, nothing else: the coordinate is what a trip needs, and the
 * label is what the receiver reads before naming the place themselves. It is deliberately not signed —
 * anyone can change it, and all that changes is a place they are about to name on their own phone.
 */
const SHARE_PARAM = "add";
const SHARE_LABEL = "label";

/**
 * Trix: "The shared URL should contain a unique coordinate to avoid any duplicate name issue."
 *
 * So the link now carries the coordinate and nothing else. Two places can share a name — two "Leichhardt
 * Marketplace", two "Flood Street" — and only one of them is where this was pinned; a name in the URL let
 * the receiver inherit the wrong one. The coordinate cannot be ambiguous, and the receiver's app resolves
 * the name from the point it actually points at.
 *
 * Built by hand so the comma stays a comma: a link people read aloud or retype should look like
 * coordinates, not %2C.
 */
function shareUrlFor(place) {
  const base = `${location.origin}${location.pathname}`;
  const coord = `${place.coord.lat.toFixed(6)},${place.coord.lng.toFixed(6)}`;
  return `${base}?${SHARE_PARAM}=${coord}`;
}

let toastTimer = null;
function showToast(text) {
  el.toast.textContent = text;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2400);
}

async function sharePlace() {
  if (!editing || !editing.coord || editingIsNew) return;
  const c = t();
  const url = shareUrlFor(editing);
  const label = String(editing.resolvedName || editing.address || "");
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ title: c.shareTitle, text: label, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    showToast(c.shareCopied);
  } catch (err) {
    if (err && err.name === "AbortError") return;            // they changed their mind; not a failure
    try {
      await navigator.clipboard.writeText(url);              // a refused share sheet can still copy
      showToast(c.shareCopied);
    } catch {
      showToast(c.shareFailed);
    }
  }
}

/* A link somebody sent: {lat, lng, label} or null. Anything malformed is ignored, and the app boots
   normally — a broken link must not be able to stop the launch. */
function sharedAddress() {
  const params = new URLSearchParams(location.search);
  const raw = params.get(SHARE_PARAM);
  if (!raw) return null;
  const [lat, lng] = raw.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 85 || Math.abs(lng) > 180) return null;
  // Links sent before this change carry &label=; it is a placeholder shown while the point itself is
  // resolved, never the address that gets stored.
  const hint = (params.get(SHARE_LABEL) || "").slice(0, 120).trim();
  return { lat, lng, hint };
}

let sharedPending = sharedAddress();

/** Opens the received address as a draft the moment the app is usable, then forgets the parameters. */
function maybeOpenShared() {
  const shared = sharedPending;
  if (!shared || !el.gate.hidden) return;
  sharedPending = null;
  history.replaceState(null, "", location.pathname);   // a reload must not reopen it

  const c = t();
  const coord = { lat: shared.lat, lng: shared.lng };
  openPlace({
    id: `p${Date.now()}`,
    name: {},                                          // theirs to fill in
    glyph: "📍",
    address: shared.hint || "",                        // a placeholder at most; see below
    resolvedName: shared.hint || null,
    coord,
  }, { draft: true });

  el.placeName.value = "";
  el.placeName.placeholder = c.newName;
  el.placeNote.hidden = false;
  el.placeNote.textContent = c.sharedNote;
  el.placeName.focus();
  refreshDone();

  /* The link says where, not what: ask the point what it is called, and correct the placeholder when an
     answer arrives. If nothing answers, the draft keeps the coordinate and an empty address — which is
     enough to travel with, and says nothing untrue. */
  const seq = ++shareLookupSeq;
  reverseAddress(coord.lat, coord.lng).then((hit) => {
    if (seq !== shareLookupSeq || !editing || editing.coord !== coord) return;
    /* The receiver names the place; the app fills the *street* it was sent to (Trix: "they need to enter
       the new address name themselves. But they can get the street name already pre-generated"). A
       landmark name is not an address, and the coordinate already says exactly where. */
    const street = hit && (hit.street || hit.name) ? hit.street || hit.name : "";
    if (!street) return;
    editing.address = street;
    editing.resolvedName = street;
    el.placeAddr.value = street;
    refreshDone();
  });
}

let shareLookupSeq = 0;

/* ---------- the map: say where by pointing at it ----------
 * Trix: "also provide an option to allow user to select address by placing a pin on the map", with the
 * person's own location as where the pin starts.
 *
 * Two decisions shape this screen:
 * - the map moves and the pin does not, so the target is always the middle of the screen and nobody has
 *   to hit a 24 px teardrop with a finger;
 * - the address under the pin is read back from the exact point the trip will use, so the words and the
 *   coordinate cannot disagree. When there is no street name there, it says so and the pin still counts.
 */
const MAP_TILE = 256;
const MAP_MIN_Z = 15;
const MAP_MAX_Z = 19;
const MAP_CBD = { lat: -33.8688, lng: 151.2093 };
const mapView = { z: 17, lat: MAP_CBD.lat, lng: MAP_CBD.lng, hit: null, moved: false };

/* OpenStreetMap's own tiles: the only keyless, lawful raster left. CARTO's calm Voyager style now
 * watermarks every tile "API KEY REQUIRED"; Wikimedia's forbids third-party apps; Mapbox, Stadia and
 * Thunderforest all need a key. So the map is busier than this audience deserves — the answer they
 * read is the line under the pin, and the pin is the only thing on the map that is not a label. */
function mapTileUrl(z, x, y) {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}
const mapTileCache = new Map();
let mapDrag = null;
const mapPointers = new Map();        // every finger on the map, for pinch
let mapPinch = null;
let mapReverseTimer = null;
let mapReverseSeq = 0;

const worldSize = (z) => MAP_TILE * 2 ** z;

function toWorld(lat, lng, z) {
  const size = worldSize(z);
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: ((lng + 180) / 360) * size, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size };
}

function toLatLng(x, y, z) {
  const size = worldSize(z);
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: (x / size) * 360 - 180 };
}

/**
 * Paints the tiles that cover the viewport.
 *
 * Everything is placed in viewport-local pixels. The obvious alternative — one world-space origin with a
 * transform that pulls the whole world under the pin — is what broke the first build: at z17 the world is
 * 33 554 432 px wide, and Chromium clamps layout offsets and composited transforms at 2^24, so every tile
 * landed on the same pixel and the map painted as an empty grey rectangle. Local numbers never exceed the
 * viewport, so there is nothing to clamp.
 */
function mapOrigin() {
  const rect = el.mapWrap.getBoundingClientRect();
  const centre = toWorld(mapView.lat, mapView.lng, mapView.z);
  return { left: centre.x - rect.width / 2, top: centre.y - rect.height / 2, w: rect.width, h: rect.height };
}

function renderMap() {
  const { left, top, w, h } = mapOrigin();
  if (!w || !h) return;
  el.mapTilesLayer.style.transform = "";          // local coordinates: no world-sized offsets anywhere

  const count = 2 ** mapView.z;
  const x0 = Math.floor(left / MAP_TILE) - 1, x1 = Math.floor((left + w) / MAP_TILE) + 1;
  const y0 = Math.floor(top / MAP_TILE) - 1, y1 = Math.floor((top + h) / MAP_TILE) + 1;
  const wanted = new Set();
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (x < 0 || y < 0 || x >= count || y >= count) continue;   // past the edge of the world
      const key = `${mapView.z}/${x}/${y}`;
      wanted.add(key);
      let img = mapTileCache.get(key);
      if (!img) {
        img = document.createElement("img");
        img.className = "map-tile";
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        img.src = mapTileUrl(mapView.z, x, y);
        mapTileCache.set(key, img);
      }
      img.style.left = `${Math.round(x * MAP_TILE - left)}px`;
      img.style.top = `${Math.round(y * MAP_TILE - top)}px`;
      if (!img.isConnected) el.mapTilesLayer.append(img);
    }
  }
  for (const [key, img] of mapTileCache) {
    if (!wanted.has(key)) {
      img.remove();
      if (mapTileCache.size > 96) mapTileCache.delete(key);   // keep a little for panning back
    }
  }
}

/**
 * What is under the pin, in the order a person thinks: the place's name first (MarketPlace Leichhardt),
 * the street beneath it (Flood Street, Leichhardt). The name is what the person sees while aiming; the
 * street is what gets stored (R59 reversed R58 on that). With no name there is one line; with nothing
 * there it says so.
 */
function renderMapAddr(hit) {
  el.mapAddr.replaceChildren();
  if (!hit) { el.mapAddr.textContent = t().mapNoAddress; return; }
  if (hit.poi) {
    const title = document.createElement("span");
    title.className = "map-poi";
    title.textContent = hit.poi;
    el.mapAddr.append(title);
  }
  if (hit.street && hit.street !== hit.poi) {
    const street = document.createElement("span");
    street.className = "map-street";
    street.textContent = hit.street;
    el.mapAddr.append(street);
  }
}

/** Asks for the centre of the screen — the same point the trip will use. */
function scheduleReverse() {
  const c = t();
  clearTimeout(mapReverseTimer);
  el.mapAddr.textContent = c.mapLooking;
  mapView.hit = null;
  const seq = ++mapReverseSeq;
  mapReverseTimer = setTimeout(async () => {
    const hit = await reverseAddress(mapView.lat, mapView.lng);
    if (seq !== mapReverseSeq || el.map.hidden) return;
    mapView.hit = hit;
    renderMapAddr(hit);
  }, 450);
}

/** Clears the timers and the pointer capture when the sheet closes, so a stale lookup cannot paint. */
function stopMap() {
  clearTimeout(mapReverseTimer);
  mapReverseSeq++;
  mapPointers.clear();
  mapPinch = null;
  if (mapDrag) {
    try { el.mapWrap.releasePointerCapture(mapDrag.id); } catch { /* already gone */ }
    mapDrag = null;
  }
  el.mapWrap.classList.remove("grabbing");
}

function mapSettle(dx, dy) {
  const { left, top, w, h } = mapOrigin();
  const moved = toLatLng(left + w / 2 - dx, top + h / 2 - dy, mapView.z);
  mapView.lat = Math.min(Math.max(moved.lat, -85), 85);
  mapView.lng = ((moved.lng + 540) % 360) - 180;
  if (Math.abs(dx) + Math.abs(dy) > 4) mapView.moved = true;
  renderMap();
  scheduleReverse();
}

async function openMap(place) {
  const c = t();
  el.mapTitle.textContent = c.mapTitle;
  el.mapHint.textContent = c.mapHint;
  el.mapWrap.setAttribute("aria-label", c.mapTitle);
  el.mapUse.textContent = c.mapUse;
  el.mapCancel.textContent = c.mapCancel;
  el.mapIn.setAttribute("aria-label", c.zoomIn);
  el.mapOut.setAttribute("aria-label", c.zoomOut);
  mapView.z = 17;
  mapView.hit = null;
  mapView.moved = false;
  mapTileCache.clear();
  el.mapTilesLayer.replaceChildren();

  // Where the pin starts: the point being edited if there is one, otherwise where the person is
  // standing, otherwise the city — in that order, so editing keeps its own place.
  const stored = place && place.coord && Number.isFinite(place.coord.lat) ? place.coord : null;
  const start = stored || MAP_CBD;
  mapView.lat = start.lat;
  mapView.lng = start.lng;
  show("map");
  renderMap();
  scheduleReverse();

  if (!stored) {
    const loc = await askLocation({ maxAge: 120000 });
    // Only if they have not started aiming: a fix that arrives late must not drag the map out from
    // under a finger.
    if (loc && loc.coord && !mapView.moved && !el.map.hidden) {
      mapView.lat = loc.coord.lat;
      mapView.lng = loc.coord.lng;
      renderMap();
      scheduleReverse();
    }
  }
}

/** Takes the centre of the screen as the answer, and says what it is in the address field. */
async function useMapPoint() {
  if (!editing) { show("place"); return; }
  /* A person can aim and tap faster than the 450 ms debounce plus a lookup. Waiting briefly is better
     than saving a pin with no label when the answer was already on its way — but never long enough to
     feel stuck, and the coordinate is the answer either way. */
  let hit = mapView.hit;
  if (!hit) {
    hit = await Promise.race([
      reverseAddress(mapView.lat, mapView.lng),
      new Promise((resolve) => setTimeout(() => resolve(null), 1200)),
    ]);
    if (el.map.hidden) return;                 // they left while it was in flight
  }
  mapView.hit = hit;
  editing.coord = { lat: mapView.lat, lng: mapView.lng };
  /* The address is the street, not the landmark standing on it (Trix): MarketPlace Leichhardt is what
     the pin is on, but "Foster Lane, Leichhardt" is the address, and the name the tile carries is the
     one the person gives it. */
  const nameOfPoint = hit && (hit.street || hit.name) ? hit.street || hit.name : "";
  if (nameOfPoint) {
    editing.address = nameOfPoint;
    editing.resolvedName = nameOfPoint;
    el.placeAddr.value = nameOfPoint;
  } else if ((editing.address || el.placeAddr.value || "").trim()) {
    /* The 1.2 s race was lost, not the address (R66.2). Keep what the sheet already had, and ask again
       for the point just taken so the label eventually matches the coordinate — silently deleting a
       street the place already carried is the worse failure. */
    const later = ++mapReverseSeq;
    reverseAddress(mapView.lat, mapView.lng).then((again) => {
      if (later !== mapReverseSeq || !editing || el.place.hidden) return;
      const street = again && (again.street || again.name) ? again.street || again.name : "";
      if (!street) return;
      editing.address = street;
      editing.resolvedName = street;
      el.placeAddr.value = street;
      if (!editingIsNew) { save(); render(); }
      refreshDone();
    });
  } else {
    // No street name at this point: the coordinate is the answer, and the field must not keep text
    // that names somewhere else.
    editing.address = "";
    editing.resolvedName = null;
    el.placeAddr.value = "";
  }
  editing.suspect = false;
  closeList();
  if (!editingIsNew) { save(); render(); }
  el.placeNote.hidden = true;
  refreshDone();
  show("place");
}

/* ---------- wiring ---------- */

el.closeSheet.addEventListener("click", () => { show(null); stopRefresh(); });

/* "Use my location": forget the refused attempt and ask again. The permission prompt only appears on
 * a real gesture, which this is, so a person who just turned location back on in Settings gets a new
 * chance without reloading the app. */
el.retryLoc.addEventListener("click", () => {
  myLocation = null;
  if (currentPlace) openAnswer(currentPlace);
});
el.gear.addEventListener("click", () => { stopRefresh(); openManage(); });
el.orderBtn.addEventListener("click", () => openOrder());
el.orderDone.addEventListener("click", () => openManage());
el.installBtn.addEventListener("click", () => openInstall());
el.installDone.addEventListener("click", () => openManage());

/* ---------- the place overlay: name, icon, address, delete ---------- */

/* The pencil sits immediately after the name, wherever that ends: "Depends on how long the text is, the
 * position will be dynamic" (Trix). The width comes from a canvas measure with the input's own computed
 * font, so it is right at every size setting and in both languages; when the name is empty the pencil
 * sits at the start of the field, where the caret is. */
var pencilCtx = null;   // hoisted: applySize() can call this before the line above runs
function placeNamePencil() {
  if (!editing || el.place.hidden || !el.namePencil) return;
  const input = el.placeName;
  const cs = getComputedStyle(input);
  if (!pencilCtx) pencilCtx = document.createElement("canvas").getContext("2d");
  pencilCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const text = input.value || "";
  const padLeft = parseFloat(cs.paddingLeft) || 0;
  const room = Math.max(0, input.clientWidth - 40 - 24);     // never let it run past the field
  const width = text ? Math.min(pencilCtx.measureText(text).width, room) : 0;
  el.namePencil.style.left = `${Math.round(padLeft + width + (text ? 9 : 5))}px`;
}

el.placeName.addEventListener("input", () => {
  if (!editing) return;
  editing.name = editing.name || {};
  editing.name[state.lang] = el.placeName.value;
  el.placeTitle.textContent = el.placeName.value;
  const clash = duplicateNameOf(el.placeName.value, editing.id);
  el.placeNote.hidden = !clash;
  el.placeNote.textContent = clash ? t().dupName(norm(el.placeName.value)) : "";
  placeNamePencil();
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

window.addEventListener("resize", () => { if (!el.place.hidden) placeNamePencil(); });

el.placeClose.addEventListener("click", cancelPlace);

/* Tapping the dimmed area outside the sheet closes it, the same way X does (Trix). The icon chooser
   sits above this sheet, so a tap meant for it never reaches here. */
el.place.addEventListener("click", (e) => { if (e.target === el.place) cancelPlace(); });

/* The chooser is not a form: a tap picks, an outside tap or Escape just closes it. */
el.icons.addEventListener("click", (e) => { if (e.target === el.icons) closeIcons(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!el.icons.hidden) { e.stopPropagation(); closeIcons(); return; }
  if (!el.map.hidden) { e.stopPropagation(); show("place"); return; }
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

el.placeMap.addEventListener("click", () => { if (editing) openMap(editing); });
el.placeShare.addEventListener("click", sharePlace);
el.mapUse.addEventListener("click", useMapPoint);
el.mapCancel.addEventListener("click", () => show("place"));

/* One finger moves the map; the layer is transformed in the handler so the picture never lags the
 * finger, and the centre is only recomputed on release. */
el.mapWrap.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") return;
  mapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { el.mapWrap.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  el.mapWrap.classList.add("grabbing");

  if (mapPointers.size >= 2) {
    /* Two fingers: the pinch takes over from the pan. Trix asked for it, and it is the one gesture the
       rest of the phone's maps already taught everybody. */
    const [a, b] = [...mapPointers.values()];
    mapDrag = null;
    mapPinch = { startDist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                 scale: 1, z0: mapView.z };
    el.mapTilesLayer.style.transformOrigin = "center";
    return;
  }
  mapDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
});
el.mapWrap.addEventListener("pointermove", (e) => {
  if (mapPointers.has(e.pointerId)) mapPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (mapPinch && mapPointers.size >= 2) {
    const [a, b] = [...mapPointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    mapPinch.scale = dist / mapPinch.startDist;
    // About the middle of the gesture, so the street under the fingers stays under the fingers.
    const rect = el.mapWrap.getBoundingClientRect();
    el.mapTilesLayer.style.transformOrigin =
      `${mapPinch.mid.x - rect.left}px ${mapPinch.mid.y - rect.top}px`;
    el.mapTilesLayer.style.transform = `scale(${mapPinch.scale})`;
    return;
  }

  if (!mapDrag || e.pointerId !== mapDrag.id) return;
  mapDrag.dx = e.clientX - mapDrag.x;
  mapDrag.dy = e.clientY - mapDrag.y;
  // Only the delta: the tiles are already placed in viewport pixels, so this stays a small number.
  el.mapTilesLayer.style.transform = `translate3d(${mapDrag.dx}px, ${mapDrag.dy}px, 0)`;
});
function endMapDrag(e) {
  if (e) mapPointers.delete(e.pointerId);

  if (mapPinch) {
    // One finger left: finish the pinch. The zoom snaps to a tile level, and the point that was under
    // the fingers stays under them.
    if (mapPointers.size >= 2) return;
    const { scale, mid, z0 } = mapPinch;
    mapPinch = null;
    el.mapTilesLayer.style.transform = "";
    el.mapTilesLayer.style.transformOrigin = "";
    const steps = Math.log2(scale || 1);
    const target = Math.min(Math.max(z0 + Math.round(steps), MAP_MIN_Z), MAP_MAX_Z);
    if (target !== mapView.z) {
      const rect = el.mapWrap.getBoundingClientRect();
      const fx = mid.x - rect.left, fy = mid.y - rect.top;
      const origin = mapOrigin();
      const focal = toLatLng(origin.left + fx, origin.top + fy, mapView.z);
      mapView.z = target;
      const world = toWorld(focal.lat, focal.lng, mapView.z);
      const centre = toLatLng(world.x - fx + rect.width / 2, world.y - fy + rect.height / 2, mapView.z);
      mapView.lat = centre.lat;
      mapView.lng = centre.lng;
    }
    el.mapWrap.classList.remove("grabbing");
    renderMap();
    scheduleReverse();
    return;
  }

  if (!mapDrag || (e && e.pointerId !== mapDrag.id)) return;
  const { dx, dy, id } = mapDrag;
  mapDrag = null;
  try { el.mapWrap.releasePointerCapture(id); } catch { /* already released */ }
  el.mapWrap.classList.remove("grabbing");
  mapSettle(dx, dy);
}
el.mapWrap.addEventListener("pointerup", endMapDrag);
el.mapWrap.addEventListener("pointercancel", endMapDrag);

/* Arrow keys are the keyboard's way to aim: 40 px a press, and the address follows. */
el.mapWrap.addEventListener("keydown", (e) => {
  const step = 40;
  const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  if (e.key === "Enter") { e.preventDefault(); useMapPoint(); return; }
  const move = moves[e.key];
  if (!move) return;
  e.preventDefault();
  mapSettle(move[0], move[1]);
});

function mapZoom(delta) {
  const z = Math.min(Math.max(mapView.z + delta, MAP_MIN_Z), MAP_MAX_Z);
  if (z === mapView.z) return;
  mapView.z = z;
  renderMap();
  scheduleReverse();
}
el.mapIn.addEventListener("click", () => mapZoom(1));
el.mapOut.addEventListener("click", () => mapZoom(-1));


// No outside-tap close: the place overlay has an address being set up in it, and a stray tap that
// throws that away is worse than a screen with one extra step (Trix: "until user delete or done").

el.closeManage.addEventListener("click", () => show(null));

/* Check for updates: read version.json past any cache and compare with what is running.
   There is no service worker here (PROJECT.md §7), so a cache-busted reload is all an update needs —
   the fresh HTML carries new ?v= stamps and the browser fetches every file again. */
el.verBtn.addEventListener("click", async () => {
  const c = t();
  el.verMsg.textContent = c.checking;
  const mine = el.appVersion;
  const stamp = String(Date.now());

  /* Two attempts, because the cache-busted URL is the one that can be refused: an iOS web clip that has
     been open for days answers the plain file and not the ?t= variant (Trix, 2026-10-31: 这里查不到 while
     the site was serving 1.2 to curl and to every fresh visitor). */
  let live = null;
  for (const url of [`version.json?t=${stamp}`, "version.json"]) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      live = await res.json();
      break;
    } catch { /* the next attempt is the fallback, not a rethrow */ }
  }

  if (!live) {
    if (navigator.onLine === false) {
      el.verMsg.textContent = c.offline;
      return;
    }
    /* There is no service worker here, so a fresh navigation *is* the update. A check that cannot read
       the file reloads rather than dead-ending: 这里查不到 left Trix with no way forward from the home
       screen — one failed request and the app could never learn it was two versions behind. */
    /* A failed read is not proof the site is reachable: `onLine` stays true in a dead spot or behind a
       captive portal, and navigating would replace the app with the browser's own error page — on a
       home-screen web clip there is no way back (R52.3). Ask for the page first. */
    const reachable = await fetch(`${window.location.pathname}?probe=${stamp}`, { method: "HEAD", cache: "no-store" })
      .then((r) => r.ok)
      .catch(() => false);
    if (!reachable) {
      el.verMsg.textContent = c.offline;
      return;
    }
    el.verMsg.textContent = c.reloading;
    window.location.replace(`${window.location.pathname}?v=${stamp}`);
    return;
  }

  const same = mine.dataset.build ? live.build === mine.dataset.build : live.version === mine.textContent;
  if (same) {
    el.verMsg.textContent = c.upToDate;
    return;
  }
  el.verMsg.textContent = c.updating(live.version);
  window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(live.build || live.version)}`);
});

el.sheet.addEventListener("click", (e) => { if (e.target === el.sheet) { show(null); stopRefresh(); } });
el.manage.addEventListener("click", (e) => { if (e.target === el.manage) show(null); });
el.install.addEventListener("click", (e) => { if (e.target === el.install) openManage(); });

document.addEventListener("keydown", (e) => {
  // The place overlay is deliberately not in this list: only 删除 or 完成 leaves it.
  if (e.key !== "Escape") return;
  if (!el.install.hidden) { openManage(); return; }   // one step back, not all the way out
  if (!el.sheet.hidden || !el.manage.hidden) {
    show(null);
    stopRefresh();
  }
});

render();

/* ---------- startup: ask for location, then decide whether this region is served ---------- */

function closeGate() {
  el.gate.hidden = true;
  setGateBlocking(false);
  // A shared link opens its draft as soon as the app is usable, behind the gate rather than under it.
  setTimeout(maybeOpenShared, 0);
}

/* While the gate is up, nothing behind it can be operated: not a tile, not the gear, not a sheet that was
   somehow left open. Trix: "That overlay should block any operation to the app until the location service
   is obtained." */
function setGateBlocking(on) {
  document.body.classList.toggle("gated", on);
  const main = document.getElementById("app");
  if (main) {
    if (on) main.setAttribute("inert", "");
    else main.removeAttribute("inert");
  }
  if (on) {
    for (const sheet of document.querySelectorAll(".sheet")) sheet.hidden = true;
  }
}

let gateMode = "check";
/* The gate's own 再试一次 has to be able to ask while the gate is up; everything else is refused. */
let gateAskInFlight = false;

let permState = async () => {
  try { return (await navigator.permissions.query({ name: "geolocation" })).state; }
  catch { return "unknown"; }
};

/** Which steps a reader needs depends on the phone in their hand, not on the app. */
function gateStepsFor(c) {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return { title: c.locIosTitle, lines: [c.locIos1, c.locIos2, c.locIos3, c.locIos4] };
  if (/Android/.test(ua)) return { title: c.locAndroidTitle, lines: [c.locAndroid1, c.locAndroid2, c.locAndroid3] };
  return { title: c.locOtherTitle, lines: [c.locOther1, c.locOther2, c.locOther3] };
}

/**
 * The blocking overlay. `state` is what the browser says about the permission, or "no-fix" when permission
 * is granted but the phone has not produced a position.
 */
function locationGate(state) {
  const c = t();
  gateMode = "location";
  setGateBlocking(true);
  el.gate.hidden = false;
  el.gateTitle.textContent = c.locTitle;
  el.gateSkip.hidden = true;                       // there is no way past this, by design
  el.gateAllow.hidden = false;
  el.gateAllow.textContent = state === "prompt" ? c.gateAllow : c.locRetry;

  if (state === "prompt") {
    el.gateMsg.textContent = `${c.locAsk} ${c.locPromptMsg}`;
    el.gateSteps.hidden = true;
  } else {
    el.gateMsg.textContent = state === "no-fix" ? c.locNoFixMsg : c.locDeniedMsg;
    const steps = gateStepsFor(c);
    el.gateStepsTitle.textContent = steps.title;
    el.gateStepList.replaceChildren(...steps.lines.map((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      return li;
    }));
    el.gateSteps.hidden = false;
  }
  el.gateAllow.focus?.({ preventScroll: true });
}

function regionBlocked(c) {
  gateMode = "region";
  setGateBlocking(true);
  el.gate.hidden = false;
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
  setGateBlocking(true);
  el.gate.hidden = false;
  el.gateTitle.textContent = c.ask;
  el.gateMsg.textContent = c.locationOff;
  el.gateAllow.textContent = c.gateAllow;
  el.gateAllow.hidden = false;
  el.gateSkip.textContent = c.gateSkip;
  el.gateSkip.hidden = false;
}

/**
 * Permission revoked mid-use.
 *
 * Two hooks, because the one that fires differs by platform: the Permissions API reports `change` in
 * Chrome, and on iOS the usual path is Settings and back, which is a visibility change. Whichever notices
 * "denied" raises the same overlay the launch uses — and drops the cached fix, so nothing travels from a
 * position the person has just withdrawn.
 */
async function permissionRevoked() {
  if (!el.gate.hidden && gateMode === "location") return;
  const state = await permState();
  if (state !== "denied") return;
  myLocation = null;
  locationGate("denied");
}

async function watchPermission() {
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    status.onchange = () => { if (status.state === "denied") permissionRevoked(); };
  } catch { /* no Permissions API: the visibility and focus checks below cover it */ }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) permissionRevoked(); });
  window.addEventListener("focus", () => permissionRevoked());
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
  applySize();
  setGateBlocking(true);          // blocked from the first frame: the check itself is not a licence to tap
  const c = t();

  /* Trix: "Seek location permission when user launch the app. If location permission is not obtained,
     use an overlay to remind customer to follow the steps." So the launch asks, and a refusal is not
     something the app can work around — every answer starts from where the person is standing. */
  const state0 = await permState();
  if (state0 === "denied") return locationGate("denied");
  if (state0 === "prompt") return locationGate("prompt");

  // Permission is already granted: nothing to ask, so the launch stays instant. Gating every launch made
  // a slow fix a ten-second blank screen and then blamed location for a timeout (R13.2).
  const known = regionVerdict();
  if (known === "in") return closeGate();
  if (known === "out") return regionBlocked(c);

  el.gateTitle.textContent = c.ask;
  el.gateMsg.textContent = c.gateChecking;
  const loc = await askLocation({ maxAge: 0 });
  if (loc.coord) {
    myLocation = { coord: loc.coord, at: Date.now() };
    if (inNSW(loc.coord)) {
      setRegionVerdict("in");
      return closeGate();
    }
    setRegionVerdict("out");
    return regionBlocked(c);
  }
  // Permission is granted but the phone produced nothing: hold the app and say so, because every answer
  // starts from where the person is standing.
  locationGate("no-fix");
}

el.gateAllow.addEventListener("click", async () => {
  const c = t();
  el.gateMsg.textContent = c.gateChecking;
  el.gateAllow.hidden = true;
  el.gateSkip.hidden = true;
  el.gateSteps.hidden = true;
  gateAskInFlight = true;
  const loc = await askLocation({ maxAge: 0 });
  gateAskInFlight = false;
  if (loc.coord) {
    myLocation = { coord: loc.coord, at: Date.now() };
    if (inNSW(loc.coord)) {
      setRegionVerdict("in");
      return closeGate();
    }
    setRegionVerdict("out");
    return regionBlocked(c);
  }
  // Ask the browser what happened, rather than guessing from the error: a refusal needs the steps, a
  // granted permission with no fix needs "move near a window".
  const state = await permState();
  if (state === "granted") return locationGate("no-fix");
  if (state === "denied") return locationGate("denied");
  return locationGate("prompt");
});

el.gateSkip.addEventListener("click", () => {
  // The only remaining use is "check again" after a region verdict: there is no path that walks past a
  // missing location permission any more.
  if (gateMode !== "region") return;
  myLocation = null;
  setRegionVerdict("");
  boot();
});

boot();
watchPermission();

render();
