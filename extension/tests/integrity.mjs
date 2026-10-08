import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { randomUUID } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const pass = message => console.log(`✓ ${message}`);

function storageArea(state, listeners = []) {
  return {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
      return Object.fromEntries(names.map(name => [name, structuredClone(state[name])]));
    },
    async set(values) {
      const changes = {};
      Object.entries(values).forEach(([key, value]) => {
        changes[key] = { oldValue: structuredClone(state[key]), newValue: structuredClone(value) };
        state[key] = structuredClone(value);
      });
      listeners.forEach(listener => listener(changes, "local"));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete state[key];
    },
  };
}

const listeners = [];
const shared = {};
const chrome = {
  storage: {
    local: storageArea(shared, listeners),
    session: storageArea({}, []),
    onChanged: { addListener(listener) { listeners.push(listener); } },
  },
};
const authority = vm.createContext({ chrome, console, structuredClone, crypto: { randomUUID }, Date });
vm.runInContext(read("js/context-bus.js"), authority, { filename: "context-bus.js" });
const ContextBus = vm.runInContext("ContextBus", authority);
await ContextBus.init();
await Promise.all([
  ContextBus.patch({ idle: true }),
  ContextBus.patch({ activeTaskId: "task-a", activeTaskText: "Keep both writes" }),
]);
assert.equal(shared.hq_context.idle, true);
assert.equal(shared.hq_context.activeTaskId, "task-a");
assert.equal(shared.hq_context.revision, 2);
pass("Context authority serializes concurrent typed patches without lost fields");

vm.runInContext(read("js/calendar-repository.js"), authority, { filename: "calendar-repository.js" });
const CalendarRepository = vm.runInContext("CalendarRepository", authority);
const [first] = await Promise.all([
  CalendarRepository.addLegacy("2026-09-15", "First event"),
  CalendarRepository.addLegacy("2026-09-16", "Concurrent event"),
]);
await CalendarRepository.addLegacy("2026-09-17", "Later unrelated event");
await CalendarRepository.undo(first.inverse);
assert.deepEqual(shared.hq_calendar_events, {
  "2026-09-16": ["Concurrent event"],
  "2026-09-17": ["Later unrelated event"],
});
assert.equal(shared.hq_calendar_revision_v1, 4);
pass("Calendar authority preserves concurrent and post-operation events during exact undo");

const localSecrets = { hq_key_claude: "legacy-secret", hq_key_unsplash: "photo-secret", hq_spotify_refresh_token: "music-secret", hq_spotify_token_expires_at: 12345 };
const sessionSecrets = {};
const credentialContext = vm.createContext({
  chrome: { storage: { local: storageArea(localSecrets), session: storageArea(sessionSecrets) } },
  console,
});
vm.runInContext(read("js/credential-vault.js"), credentialContext, { filename: "credential-vault.js" });
const CredentialVault = vm.runInContext("CredentialVault", credentialContext);
await CredentialVault.init();
assert.equal(localSecrets.hq_key_claude, undefined);
assert.equal(localSecrets.hq_key_unsplash, undefined);
assert.equal(localSecrets.hq_spotify_refresh_token, undefined);
assert.equal(localSecrets.hq_spotify_token_expires_at, undefined);
assert.equal(sessionSecrets.hq_key_claude, "legacy-secret");
assert.equal(sessionSecrets.hq_key_unsplash, "photo-secret");
assert.equal(sessionSecrets.hq_spotify_refresh_token, "music-secret");
pass("Legacy provider secrets migrate to session storage and leave persistent storage");

const plannerState = {
  hq_tasks: [{ text: "Real task", done: false }],
  hq_calendar_events: { "2026-09-15": ["Tomorrow event"] },
  hq_plan_history: {},
};
const plannerContext = vm.createContext({
  chrome: { storage: { local: storageArea(plannerState) } },
  console,
  Date,
  hqLocalDateKey: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
});
vm.runInContext(read("js/daily-planner.js"), plannerContext, { filename: "daily-planner.js" });
const DailyPlanner = vm.runInContext("DailyPlanner", plannerContext);
const targetContext = await DailyPlanner.buildContext(new Date(2026, 8, 15, 12));
assert.equal(targetContext.targetKey, "2026-09-15");
assert.deepEqual(Array.from(targetContext.todayEvents), ["Tomorrow event"]);
assert(read("js/background.js").includes("targetDate: tomorrow"));
assert(read("js/daily-planner.js").includes("hq_daily_plan_future_v1"));
assert(read("js/daily-planner.js").includes("prepared?.date === this.todayKey()"));
assert(read("js/daily-planner.js").includes("Target planning date: ${ctx.targetLabel} (${ctx.targetKey})"));
assert(read("js/daily-planner.js").includes("Generate the plan for the exact target date above."));
pass("Nightly planning prepares tomorrow separately and promotes it after the local date rolls over");

const html = read("newtab.html");
assert.equal([...html.matchAll(/<script\b[^>]*\bsrc=/g)].length, 2, "The HTML startup chain should contain only diagnostics and the bootstrap");
assert(read("js/newtab.js").includes("const CORE_SCRIPTS = Object.freeze(["));
for (const eager of ["js/lib/chart.umd.min.js", "js/lib/tiptap/tiptap-bundle.js", "js/gleam.js", "js/spotify-ui.js", "js/weekly-stats.js", "js/venture-dashboard.js", "js/chrome-optimizer.js"]) {
  assert(!html.includes(`<script src="${eager}"></script>`), `${eager} still blocks new-tab startup`);
  assert(read("js/newtab.js").includes(`"${eager}"`), `${eager} is not reachable through lazy loading`);
}
assert(read("js/page-scheduler.js").includes("document.hidden"));
assert(!read("js/completion-detection.js").includes("setInterval("));
assert(!read("js/living-widgets.js").includes("setInterval("));
assert(!read("js/weather.js").includes("setInterval("));
pass("Optional bundles lazy-load and passive refreshes share a hidden-tab-aware scheduler");

const css = read("css/style.css");
assert(css.includes(".cal-month-grid, .cal-weekdays { width: 100%; min-width: 0;"));
assert(!css.includes(".cal-month-grid, .cal-weekdays { min-width: 650px; }"));
assert(css.includes(".cinematic-event-wave") && css.includes("prefers-reduced-motion:reduce"));
pass("Mobile month view remains in-bounds and cinematic state feedback has a reduced-motion path");

console.log("\nOperation HQ integrity regression tests completed successfully.");
