// context-bus.js — Jarvis Core, Context Bus v0 (Roadmap §2, H1).
//
// A single `hq_context` object in chrome.storage.local that every module
// reads from and writes to, instead of each module only knowing its own
// slice. This is the foundation everything else in the Jarvis roadmap
// (local intent router, ambient suggestions, predictive agency) assumes
// exists — so it's built deliberately minimal and deliberately passive:
//
//   - It does not decide anything.
//   - It does not call any API.
//   - It does not surface any suggestion.
//
// It just keeps an honest, live snapshot of "what's true right now" so
// that work isn't wasted later. Every later Jarvis feature reads from
// this instead of re-deriving state from scratch.
//
// DOM-free, same pattern as classifier.js — works via <script src> in the
// page (newtab.js, tasks.js, pomodoro.js, dailytasks.js) AND via
// importScripts() in the service worker (background.js), unmodified.

function hqLocalDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const ContextBus = {
  KEY: "hq_context",
  MAX_COMPLETIONS: 10,

  data: null,
  _listeners: [],
  _writeQueue: Promise.resolve(),

  defaults() {
    return {
      mode: "normal",          // "normal" | "zen" | "privacy" | "lockdown"
      deepWork: false,          // independent of mode — Deep Work site-blocking on/off
      activeTaskId: null,       // task currently being passively tracked (see Tasks.toggleTracking)
      activeTaskText: null,
      activeVenture: null,
      pomodoroRunning: false,
      focusLabel: null,
      idle: false,              // mirrors chrome.idle, written by background.js
      tasksOpen: 0,
      tasksDoneToday: 0,
      recentCompletions: [],    // [{ text, venture, type, timestamp }], newest first, capped at MAX_COMPLETIONS
      currentScheduleBlock: null, // title of whatever Schedule block is active right now, per the active profile
      revision: 0,
      updated: Date.now(),
    };
  },

  // Call once per context (page boot, or top of background.js) before
  // anything reads/writes. Safe to call more than once.
  async init() {
    const stored = await chrome.storage.local.get(this.KEY);
    this.data = Object.assign(this.defaults(), stored[this.KEY] || {});

    // Pages stay live-synced, but only the service worker is allowed to
    // commit. That single-writer boundary prevents two open new tabs from
    // overwriting one another with stale full-object snapshots.
    if (!this._listening && chrome.storage && chrome.storage.onChanged) {
      this._listening = true;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[this.KEY]) return;
        this.data = changes[this.KEY].newValue || this.defaults();
        this._notify();
      });
    }
    return this.data;
  },

  // Synchronous read of the current in-memory snapshot. init() must have
  // resolved at least once before this is meaningful.
  get() {
    return this.data || this.defaults();
  },

  isAuthority() {
    return typeof document === "undefined" || typeof chrome.runtime?.sendMessage !== "function";
  },

  sanitizePartial(partial) {
    const source = partial && typeof partial === "object" && !Array.isArray(partial) ? partial : {};
    const allowed = {};
    const nullableStrings = ["activeTaskId", "activeTaskText", "activeVenture", "currentScheduleBlock", "focusLabel"];
    const booleans = ["deepWork", "pomodoroRunning", "idle"];
    const counts = ["tasksOpen", "tasksDoneToday"];
    if (["normal", "zen", "privacy", "lockdown"].includes(source.mode)) allowed.mode = source.mode;
    nullableStrings.forEach(key => {
      if (source[key] === null || typeof source[key] === "string") allowed[key] = source[key] === null ? null : source[key].slice(0, 500);
    });
    booleans.forEach(key => { if (typeof source[key] === "boolean") allowed[key] = source[key]; });
    counts.forEach(key => { if (Number.isFinite(source[key])) allowed[key] = Math.max(0, Math.floor(source[key])); });
    return allowed;
  },

  async _authoritativeCommit(operation) {
    const run = async () => {
      const stored = await chrome.storage.local.get(this.KEY);
      const latest = Object.assign(this.defaults(), stored[this.KEY] || {});
      let partial = {};

      if (operation?.kind === "completion") {
        const entry = operation.entry && typeof operation.entry === "object" ? operation.entry : {};
        const type = ["task", "daily", "plan"].includes(entry.type) ? entry.type : "task";
        const completion = {
          text: String(entry.text || "Completed item").slice(0, 500),
          venture: entry.venture == null ? null : String(entry.venture).slice(0, 180),
          type,
          timestamp: Date.now(),
        };
        partial.recentCompletions = [completion, ...(Array.isArray(latest.recentCompletions) ? latest.recentCompletions : [])]
          .slice(0, this.MAX_COMPLETIONS);
      } else {
        partial = this.sanitizePartial(operation?.partial);
      }

      this.data = Object.assign({}, latest, partial, {
        revision: (Number(latest.revision) || 0) + 1,
        updated: Date.now(),
      });
      await chrome.storage.local.set({ [this.KEY]: this.data });
      this._notify();
      return this.data;
    };

    const result = this._writeQueue.then(run, run);
    this._writeQueue = result.catch(() => {});
    return result;
  },

  async handleMessage(message) {
    if (!this.isAuthority() || message?.type !== "hq:context:commit") return null;
    return this._authoritativeCommit(message.operation);
  },

  async _request(operation) {
    if (this.isAuthority()) return this._authoritativeCommit(operation);
    const response = await chrome.runtime.sendMessage({ type: "hq:context:commit", operation });
    if (!response?.ok) throw new Error(response?.error || "Context authority did not accept the update.");
    this.data = response.data;
    this._notify();
    return this.data;
  },

  async patch(partial) {
    return this._request({ kind: "patch", partial });
  },

  async setMode(mode) {
    return this.patch({ mode });
  },

  // type: "task" | "daily" | "plan" — matches ActivityLog's existing types,
  // deliberately the same vocabulary so nothing new has to be invented.
  async recordCompletion(entry) {
    return this._request({ kind: "completion", entry });
  },

  // In-page reactive subscription (e.g. the command palette re-rendering
  // its "right now" line without polling). Not persisted, not available
  // across contexts — each page registers its own.
  onChange(cb) {
    this._listeners.push(cb);
  },

  _notify() {
    this._listeners.forEach(cb => {
      try { cb(this.data); } catch (e) { console.error("ContextBus listener error:", e); }
    });
  },
};
