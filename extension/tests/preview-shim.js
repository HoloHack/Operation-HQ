// Browser-preview shim. Loaded only by tests/preview-server.mjs; never by the
// packaged extension page. It supplies inert Chrome API stand-ins and seeded
// data so UI/layout changes can be inspected in an ordinary browser.
(() => {
  if (globalThis.chrome?.storage?.local) return;

  const wallpaper = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#07111f"/><stop offset=".48" stop-color="#173b5a"/><stop offset="1" stop-color="#6f3fa0"/></linearGradient>
        <radialGradient id="glow"><stop stop-color="#9ce9ff" stop-opacity=".9"/><stop offset="1" stop-color="#9ce9ff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#sky)"/><circle cx="1420" cy="260" r="420" fill="url(#glow)" opacity=".42"/>
      <path d="M0 850 L350 470 L610 730 L900 350 L1250 720 L1500 500 L1920 850 V1080 H0Z" fill="#09111d" opacity=".86"/>
      <path d="M0 900 L430 650 L720 820 L1070 570 L1400 800 L1700 620 L1920 760 V1080 H0Z" fill="#101b2c" opacity=".92"/>
    </svg>`)} `;
  const state = {
    hq_layout_style: "living",
    hq_pin_daily: false,
    hq_pin_tasks: false,
    hq_wallpaper_category: "custom",
    hq_wallpaper_interval_unit: "forever",
    hq_wallpaper_interval_value: 1,
    hq_custom_wallpapers: [wallpaper.trim()],
    hq_wallpaper_blocklist: [],
    hq_tasks: [],
    hq_daily_templates: [],
    hq_ventures: ["School", "Personal"],
  };
  const listeners = [];
  const event = { addListener(fn) { listeners.push(fn); }, removeListener() {} };
  const local = {
    async get(keys) {
      if (keys == null) return { ...state };
      if (typeof keys === "string") return { [keys]: state[keys] };
      if (Array.isArray(keys)) return Object.fromEntries(keys.map(key => [key, state[key]]));
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, state[key] ?? fallback]));
    },
    async set(values) {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: state[key], newValue: value };
        state[key] = value;
      }
      listeners.forEach(fn => fn(changes, "local"));
    },
    async remove(keys) { for (const key of [].concat(keys)) delete state[key]; },
    async clear() { for (const key of Object.keys(state)) delete state[key]; },
  };
  const sessionState = {};
  const session = {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
      return Object.fromEntries(names.map(key => [key, sessionState[key]]));
    },
    async set(values) { Object.assign(sessionState, values); },
    async remove(keys) { for (const key of [].concat(keys)) delete sessionState[key]; },
  };
  const bookmarkRoot = [{ id: "0", children: [{ id: "1", children: [] }] }];
  globalThis.chrome = {
    storage: { local, session, onChanged: event },
    bookmarks: {
      getTree: async () => bookmarkRoot,
      getChildren: async () => [],
      getSubTree: async () => [],
      get: async () => [],
      create: async value => ({ id: crypto.randomUUID(), ...value }),
      move: async () => ({}), update: async () => ({}), removeTree: async () => {},
      onCreated: event, onMoved: event,
    },
    tabs: { query: async () => [], discard: async () => {}, onActivated: event, onRemoved: event },
    windows: { getLastFocused: async () => ({ focused: false }) },
    identity: {
      getRedirectURL: () => "https://preview.invalid/callback",
      getAuthToken: async () => { throw new Error("Preview mode"); },
      launchWebAuthFlow: async () => { throw new Error("Preview mode"); },
    },
    permissions: { contains: async () => false, request: async () => false },
    history: { search: async () => [] },
    idle: { onStateChanged: event, setDetectionInterval() {} },
    runtime: { getURL: value => value, onInstalled: event, onMessage: event },
    alarms: { create() {}, clear: async () => true, onAlarm: event },
    declarativeNetRequest: { getDynamicRules: async () => [], updateDynamicRules: async () => {} },
    contentSettings: { javascript: { clear: async () => {}, set: async () => {} } },
    contextMenus: { create() {}, onClicked: event },
  };
})();
