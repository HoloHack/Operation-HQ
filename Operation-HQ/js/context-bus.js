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

  defaults() {
    return {
      mode: "normal",          // "normal" | "zen" | "privacy" | "lockdown"
      deepWork: false,          // independent of mode — Deep Work site-blocking on/off
      activeTaskId: null,       // task currently being passively tracked (see Tasks.toggleTracking)
      activeTaskText: null,
      activeVenture: null,
      pomodoroRunning: false,
      idle: false,              // mirrors chrome.idle, written by background.js
      tasksOpen: 0,
      tasksDoneToday: 0,
      recentCompletions: [],    // [{ text, venture, type, timestamp }], newest first, capped at MAX_COMPLETIONS
      currentScheduleBlock: null, // title of whatever Schedule block is active right now, per the active profile
      updated: Date.now(),
    };
  },

  // Call once per context (page boot, or top of background.js) before
  // anything reads/writes. Safe to call more than once.
  async init() {
    const stored = await chrome.storage.local.get(this.KEY);
    this.data = Object.assign(this.defaults(), stored[this.KEY] || {});

    // Multiple contexts can be alive at once (this page, the service
    // worker, maybe a second new-tab page in another window) — whichever
    // one patches last wins, since patch() always writes the full object
    // rather than a diff. Anything already loaded stays live-synced here.
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

  async patch(partial) {
    this.data = Object.assign({}, this.get(), partial, { updated: Date.now() });
    await chrome.storage.local.set({ [this.KEY]: this.data });
    this._notify();
    return this.data;
  },

  async setMode(mode) {
    return this.patch({ mode });
  },

  // type: "task" | "daily" | "plan" — matches ActivityLog's existing types,
  // deliberately the same vocabulary so nothing new has to be invented.
  async recordCompletion(entry) {
    const list = [{ ...entry, timestamp: Date.now() }, ...this.get().recentCompletions]
      .slice(0, this.MAX_COMPLETIONS);
    return this.patch({ recentCompletions: list });
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
