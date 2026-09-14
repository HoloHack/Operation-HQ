// background.js — service worker.
// 1) Real-time bookmark sort on creation (same Classifier as bulk sort).
// 2) Learns from manual re-files (chrome.bookmarks.onMoved), ignoring moves
//    the extension itself triggered.
// 3) Wallpaper rotation alarm.

importScripts("context-bus.js");
importScripts("calendar-repository.js");
importScripts("credential-vault.js");
importScripts("classifier.js");
importScripts("claude-client.js");
importScripts("daily-planner.js");
importScripts("idea-radar.js");

// The service worker is the sole Context Bus writer. Every tab sends a
// narrow patch here; commits are serialized inside ContextBus and merge
// against the newest persisted revision before writing.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "hq:context:commit") return false;
  ContextBus.handleMessage(message)
    .then(data => sendResponse({ ok: true, data }))
    .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "hq:calendar:commit") return false;
  CalendarRepository.handleMessage(message)
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true;
});

const INBOX_NAME = "Inbox";
const selfMovedIds = new Set(); // bookmark IDs we just moved ourselves — ignore the resulting onMoved event

async function recordBackgroundError(label, error) {
  const message = String(error?.message || error || "Unknown error").slice(0, 500);
  console.error(`[Operation HQ background] ${label}:`, error);
  try {
    const { hq_background_errors } = await chrome.storage.local.get("hq_background_errors");
    const entries = Array.isArray(hq_background_errors) ? hq_background_errors : [];
    entries.push({ at: new Date().toISOString(), label, message });
    await chrome.storage.local.set({ hq_background_errors: entries.slice(-20) });
  } catch (storageError) {
    console.error("Could not persist background diagnostic:", storageError);
  }
}

// Chrome does not consume returned promises from event listeners. Without this
// boundary, one rejected API call becomes an unhandled service-worker error and
// can interrupt unrelated background features.
function safely(label, handler) {
  return (...args) => {
    Promise.resolve().then(() => handler(...args)).catch(error => recordBackgroundError(label, error));
  };
}

// --- Assessment Intake: optional, metadata-only download detection ---
// The `downloads` permission is optional and is requested from the Assessment
// Intake UI. Even when granted, this listener stores only a basename, time,
// MIME type, size and Chrome download id. It cannot read the file contents.
const ASSESSMENT_DOWNLOAD_EVENTS_KEY = "hq_assessment_download_events_v1";

function assessmentLikeDownload(item) {
  const name = String(item?.filename || "").split(/[\\/]/).pop() || "";
  return /\.(pdf|docx|txt|md|html?|rtf)$/i.test(name) && /\b(assessment|assignment|task\s*\d|exam|test|project|rubric|notification|scope|practical|portfolio|research|presentation|multimodal)\b/i.test(name.replace(/[_-]+/g, " "));
}

async function recordAssessmentDownload(item) {
  if (item?.state !== "complete" || !assessmentLikeDownload(item)) return;
  const { [ASSESSMENT_DOWNLOAD_EVENTS_KEY]: stored } = await chrome.storage.local.get(ASSESSMENT_DOWNLOAD_EVENTS_KEY);
  const events = Array.isArray(stored) ? stored : [];
  const safe = {
    id: item.id,
    filename: String(item.filename || "").split(/[\\/]/).pop().slice(0, 220),
    mime: String(item.mime || "").slice(0, 100),
    fileSize: Number(item.fileSize || item.totalBytes || 0),
    startTime: item.startTime || new Date().toISOString(),
    state: item.state || "complete",
  };
  const next = [safe, ...events.filter(event => event.id !== safe.id)].slice(0, 60);
  await chrome.storage.local.set({ [ASSESSMENT_DOWNLOAD_EVENTS_KEY]: next });
}

let assessmentDownloadListenersRegistered = false;
function registerAssessmentDownloadListeners() {
  if (assessmentDownloadListenersRegistered || !chrome.downloads?.onCreated) return;
  assessmentDownloadListenersRegistered = true;
  chrome.downloads.onCreated.addListener(safely("Assessment download detected", recordAssessmentDownload));
  chrome.downloads.onChanged.addListener(safely("Assessment download completed", async delta => {
    if (delta.state?.current !== "complete") return;
    const [item] = await chrome.downloads.search({ id: delta.id });
    if (item) await recordAssessmentDownload(item);
  }));
}
registerAssessmentDownloadListeners();
chrome.permissions?.onAdded?.addListener(permissions => {
  if (permissions.permissions?.includes("downloads")) registerAssessmentDownloadListeners();
});

// --- Deep Work: site-level distraction blocking (Roadmap §3, H1) ---
// Uses declarativeNetRequest's dynamic rules — Chrome evaluates these
// natively, so no page content or request ever passes through this
// extension's code. Only the "declarativeNetRequest" permission is
// required for a plain block action; no host_permissions needed (that's
// only required for redirect/header-modification actions).
//
// Rule ids 1000-1999 are reserved for Deep Work so this can freely
// remove-and-recreate its own rules without touching any other feature's
// dynamic rules, if this extension ever adds more DNR-based features.
const DEEPWORK_RULE_BASE_ID = 1000;
const DEEPWORK_RULE_ID_CEILING = 2000;

function deepWorkRule(domain, id) {
  return {
    id,
    priority: 1,
    action: { type: "block" },
    condition: {
      requestDomains: [domain], // also matches subdomains, e.g. "m.youtube.com" under "youtube.com"
      resourceTypes: ["main_frame", "sub_frame"],
    },
  };
}

async function applyDeepWorkRules() {
  const { hq_deepwork_active, hq_deepwork_sites } = await chrome.storage.local.get(["hq_deepwork_active", "hq_deepwork_sites"]);
  const sites = hq_deepwork_sites || [];

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing
    .filter(r => r.id >= DEEPWORK_RULE_BASE_ID && r.id < DEEPWORK_RULE_ID_CEILING)
    .map(r => r.id);

  const addRules = hq_deepwork_active
    ? sites.slice(0, DEEPWORK_RULE_ID_CEILING - DEEPWORK_RULE_BASE_ID).map((domain, i) => deepWorkRule(domain, DEEPWORK_RULE_BASE_ID + i))
    : [];

  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
  await ContextBus.patch({ deepWork: !!hq_deepwork_active });
}

// --- Deep Work: lighter "disable JS instead of blocking" option ---
// chrome.contentSettings.clear() clears ALL rules of that content type set
// by this extension in one call (there's no per-pattern remove) — so the
// correct, safe way to keep this in sync with the current site list is
// always clear-then-reapply, never incrementally add/remove. Applied only
// while Deep Work itself is active; the JS-disable list has no effect on
// its own with Deep Work off, matching the block list's behavior exactly.
async function applyContentSettingsRules() {
  if (!chrome.contentSettings || !chrome.contentSettings.javascript) return; // defensive — permission not granted for some reason
  const { hq_deepwork_active, hq_deepwork_js_disabled_sites } = await chrome.storage.local.get(["hq_deepwork_active", "hq_deepwork_js_disabled_sites"]);
  const sites = hq_deepwork_js_disabled_sites || [];

  await chrome.contentSettings.javascript.clear({ scope: "regular" });
  if (hq_deepwork_active) {
    for (const domain of sites) {
      await chrome.contentSettings.javascript.set({
        primaryPattern: `*://*.${domain}/*`,
        setting: "block",
        scope: "regular",
      });
    }
  }
}

chrome.storage.onChanged.addListener(safely("Deep Work storage sync", async (changes, area) => {
  if (area !== "local") return;
  const operations = [];
  if (changes.hq_deepwork_active || changes.hq_deepwork_sites) operations.push(applyDeepWorkRules());
  if (changes.hq_deepwork_active || changes.hq_deepwork_js_disabled_sites) operations.push(applyContentSettingsRules());
  await Promise.all(operations);
}));

// ContextBus must finish loading any persisted state BEFORE anything else
// patches into it — otherwise a patch racing ahead of the read could
// clobber real state with defaults. Previously these two ran as
// independent unawaited fire-and-forget calls; ordering them explicitly
// here removes that race entirely rather than relying on happening to
// schedule in the right order.
(async () => {
  await ContextBus.init();
  await applyDeepWorkRules(); // also re-syncs on every service worker (re)start
  await applyContentSettingsRules();
})().catch(error => recordBackgroundError("Service worker startup", error));

async function getBarId() {
  const tree = await chrome.bookmarks.getTree();
  return tree[0].children[0].id;
}

async function getOrCreateFolderPath(pathArr, barId) {
  let parentId = barId;
  for (const name of pathArr) {
    const children = await chrome.bookmarks.getChildren(parentId);
    const existing = children.find(c => !c.url && c.title.toLowerCase() === name.toLowerCase());
    if (existing) parentId = existing.id;
    else {
      const created = await chrome.bookmarks.create({ parentId, title: name });
      parentId = created.id;
    }
  }
  return parentId;
}

async function scanLegitFolders(barId) {
  const rootChildren = await chrome.bookmarks.getChildren(barId);
  const roots = rootChildren.filter(c => !c.url && Classifier.isRoot(c.title));
  const legit = [];
  for (const root of roots) {
    const subs = await chrome.bookmarks.getChildren(root.id);
    subs.filter(s => !s.url).forEach(s => legit.push({ title: s.title, parentTitle: root.title }));
  }
  return legit;
}

async function moveSelf(id, parentId) {
  selfMovedIds.add(id);
  await chrome.bookmarks.move(id, { parentId });
  setTimeout(() => selfMovedIds.delete(id), 3000);
}

// --- Real-time sort on bookmark creation ---
chrome.bookmarks.onCreated.addListener(safely("Bookmark auto-sort", async (id, bookmark) => {
  if (!bookmark.url) return; // it's a folder, ignore

  const { hq_realtime_sort_enabled } = await chrome.storage.local.get("hq_realtime_sort_enabled");
  if (hq_realtime_sort_enabled === false) return; // user disabled it in settings

  if (Classifier.shouldNeverSort(bookmark.title)) return;

  const barId = await getBarId();
  const { hq_learned_domains } = await chrome.storage.local.get("hq_learned_domains");
  const legitFolders = await scanLegitFolders(barId);
  const result = Classifier.classify(bookmark, hq_learned_domains || {}, legitFolders);

  if (result.path && result.confidence === "high") {
    const targetParent = await getOrCreateFolderPath(result.path, barId);
    await moveSelf(id, targetParent);
  } else {
    // low confidence — real-time sort is conservative: park it in Inbox
    // rather than guess, since a wrong auto-file is worse than a short wait.
    const inboxId = await getOrCreateFolderPath([INBOX_NAME], barId);
    if (bookmark.parentId !== inboxId) await moveSelf(id, inboxId);
  }
}));

// --- Learn from manual re-files ---
chrome.bookmarks.onMoved.addListener(safely("Bookmark learning", async (id, moveInfo) => {
  if (selfMovedIds.has(id)) { selfMovedIds.delete(id); return; } // our own real-time move
  const { hq_bulk_sort_active } = await chrome.storage.local.get("hq_bulk_sort_active");
  if (hq_bulk_sort_active) return; // ignore moves happening during a bulk sort/undo run

  let bm;
  try { [bm] = await chrome.bookmarks.get(id); } catch { return; }
  if (!bm.url) return; // folder move, not a bookmark — not learnable

  // walk up to build the (root, subfolder) path relative to the bar
  const barId = await getBarId();
  const path = [];
  let cur = bm;
  while (cur.parentId && cur.parentId !== barId) {
    const [parent] = await chrome.bookmarks.get(cur.parentId);
    if (!parent || parent.id === barId) break;
    path.unshift(parent.title);
    cur = parent;
    if (path.length > 3) break; // safety cap, avoid runaway loops on odd trees
  }
  if (!path.length) return; // moved to bar root, not a meaningful category

  const domain = Classifier.domainOf(bm.url);
  const { hq_learned_domains } = await chrome.storage.local.get("hq_learned_domains");
  const map = hq_learned_domains || {};
  // Learn the specific site/path fingerprint, never a whole platform. A
  // GitHub AI repo, YouTube maths lesson and TikTok message handoff can all
  // coexist without one correction poisoning every future link.
  map[Classifier.fingerprint(bm)] = path;
  await chrome.storage.local.set({ hq_learned_domains: map });
}));

// --- Idea Radar weekly auto-check (opt-in) ---
function scheduleWeeklyRadarAlarm() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(9, 0, 0, 0);
  const daysUntilSunday = (7 - next.getDay()) % 7 || 7;
  next.setDate(next.getDate() + daysUntilSunday);
  chrome.alarms.create("hq_radar_weekly", { when: next.getTime(), periodInMinutes: 10080 });
}
scheduleWeeklyRadarAlarm();

chrome.alarms.onAlarm.addListener(safely("Idea Radar alarm", async (alarm) => {
  if (alarm.name === "hq_radar_weekly") {
    const { hq_radar_weekly_enabled } = await chrome.storage.local.get("hq_radar_weekly_enabled");
    if (hq_radar_weekly_enabled && await ClaudeClient.hasKey()) {
      await IdeaRadar.run({ silent: true });
    }
  }
}));

// --- Idle-triggered auto-privacy (opt-in) ---
// If enabled, stepping away and someone else sitting down at the machine
// re-engages Privacy Mode automatically rather than relying on remembering
// to hit Alt+H before walking off.
chrome.idle.setDetectionInterval(120); // 2 minutes
chrome.idle.onStateChanged.addListener(safely("Idle privacy", async (state) => {
  // Context Bus: mirror raw idle state regardless of the auto-privacy
  // setting below — this is a general-purpose signal other modules can
  // use later, not just the privacy feature that happens to live here too.
  await ContextBus.patch({ idle: state === "idle" || state === "locked" });

  const { hq_auto_privacy_on_idle } = await chrome.storage.local.get("hq_auto_privacy_on_idle");
  if (!hq_auto_privacy_on_idle) return;
  if (state === "idle" || state === "locked") {
    await chrome.storage.local.set({ hq_privacy_auto_trigger: Date.now() });
  }
}));

// --- Universal Capture: right-click → save to Operation HQ inbox ---
chrome.runtime.onInstalled.addListener(() => {
  // Rebuild atomically on install/update. This avoids duplicate-ID failures
  // when an unpacked extension is repeatedly reloaded during development.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "hq-capture-selection", title: 'Add "%s" to Operation HQ', contexts: ["selection"] });
    chrome.contextMenus.create({ id: "hq-capture-link", title: "Add this link to Operation HQ", contexts: ["link"] });
    chrome.contextMenus.create({ id: "hq-capture-page", title: "Add this page to Operation HQ", contexts: ["page"] });
    chrome.contextMenus.create({ id: "hq-research-page", title: "Save page to HQ Research", contexts: ["page"] });
    chrome.contextMenus.create({ id: "hq-research-selection", title: "Save selection as a source note", contexts: ["selection"] });
  });
});

chrome.contextMenus.onClicked.addListener(safely("Universal capture", async (info, tab) => {
  if (info.menuItemId === "hq-research-page" || info.menuItemId === "hq-research-selection") {
    let safeUrl = null;
    try {
      const parsed = new URL(info.pageUrl || tab?.url || "");
      if (["http:", "https:"].includes(parsed.protocol)) safeUrl = parsed.href;
    } catch {}
    if (!safeUrl) return;
    const saved = await chrome.storage.local.get("hq_research_sources_v1");
    const sources = Array.isArray(saved.hq_research_sources_v1) ? saved.hq_research_sources_v1 : [];
    const selection = info.menuItemId === "hq-research-selection" ? String(info.selectionText || "").trim().slice(0, 1200) : "";
    const existing = sources.find(source => source.url === safeUrl);
    if (existing) {
      if (selection && !String(existing.notes || "").includes(selection)) existing.notes = [existing.notes, selection].filter(Boolean).join("\n\n").slice(0, 2400);
      existing.updatedAt = Date.now();
    } else {
      sources.unshift({ id: crypto.randomUUID(), title: String(tab?.title || new URL(safeUrl).hostname).slice(0, 180), url: safeUrl, author: "", publishedDate: "", subject: "", kind: "unknown", stage: "inbox", assignmentId: "", notes: selection, createdAt: Date.now(), updatedAt: Date.now() });
    }
    await chrome.storage.local.set({ hq_research_sources_v1: sources.slice(0, 500), hq_study_last_capture_v1: { title: existing?.title || tab?.title || safeUrl, at: Date.now(), merged: !!existing } });
    return;
  }
  let text = null, url = null;
  if (info.menuItemId === "hq-capture-selection") { text = info.selectionText; url = info.pageUrl; }
  else if (info.menuItemId === "hq-capture-link") { text = info.linkUrl; url = info.linkUrl; }
  else if (info.menuItemId === "hq-capture-page") { text = tab?.title || info.pageUrl; url = info.pageUrl; }
  else return;

  const { hq_capture_inbox } = await chrome.storage.local.get("hq_capture_inbox");
  const inbox = hq_capture_inbox || [];
  inbox.unshift({ id: crypto.randomUUID(), text: (text || "").slice(0, 300), url, timestamp: Date.now() });
  await chrome.storage.local.set({ hq_capture_inbox: inbox.slice(0, 50) }); // cap so it can't grow unbounded
}));

// --- Wallpaper rotation alarm ---
chrome.alarms.onAlarm.addListener(safely("Wallpaper rotation", async (alarm) => {
  if (alarm.name === "hq_wallpaper_rotate") {
    await chrome.storage.local.set({ hq_wallpaper_cached: null });
  }
}));

async function configureWallpaperAlarm() {
  await chrome.alarms.clear("hq_wallpaper_rotate");
  const { hq_wallpaper_interval_value, hq_wallpaper_interval_unit } = await chrome.storage.local.get(["hq_wallpaper_interval_value", "hq_wallpaper_interval_unit"]);
  const unit = hq_wallpaper_interval_unit || "tab";
  const UNIT_MINUTES = { hours: 60, days: 1440, weeks: 10080, months: 43200 };
  if (unit !== "tab" && unit !== "forever") {
    const minutes = (UNIT_MINUTES[unit] || 1440) * (hq_wallpaper_interval_value || 1);
    chrome.alarms.create("hq_wallpaper_rotate", { periodInMinutes: Math.max(1, minutes) });
  }
}
configureWallpaperAlarm().catch(error => recordBackgroundError("Wallpaper alarm startup", error));

chrome.storage.onChanged.addListener(safely("Wallpaper alarm settings", async (changes, area) => {
  if (area === "local" && (changes.hq_wallpaper_interval_value || changes.hq_wallpaper_interval_unit)) {
    await configureWallpaperAlarm();
  }
}));

// --- Nightly daily-plan pre-generation (11:55pm) ---
// Best-effort: if Chrome isn't running at 11:55pm this simply doesn't fire,
// and daily-planner.js's own newtab-boot check covers that by generating
// on-demand the next time a tab opens. This is just the "have it ready
// before you even ask" path.
function scheduleNightlyPlanAlarm() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(23, 55, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  chrome.alarms.create("hq_daily_plan_nightly", { when: next.getTime(), periodInMinutes: 1440 });
}
scheduleNightlyPlanAlarm();

chrome.alarms.onAlarm.addListener(safely("Nightly plan", async (alarm) => {
  if (alarm.name === "hq_daily_plan_nightly") {
    if (await ClaudeClient.hasKey()) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await DailyPlanner.generate({ silent: true, targetDate: tomorrow });
    }
  }
}));

// --- Tab activity tracking (for the Chrome Optimizer's inactive-tab list) ---
chrome.tabs.onActivated.addListener(safely("Tab activation tracking", async ({ tabId }) => {
  const { hq_tab_activity } = await chrome.storage.local.get("hq_tab_activity");
  const map = hq_tab_activity || {};
  map[tabId] = Date.now();
  await chrome.storage.local.set({ hq_tab_activity: map });
}));

chrome.tabs.onRemoved.addListener(safely("Tab removal tracking", async (tabId) => {
  const { hq_tab_activity } = await chrome.storage.local.get("hq_tab_activity");
  const map = hq_tab_activity || {};
  delete map[tabId];
  await chrome.storage.local.set({ hq_tab_activity: map });
}));

// --- Completion tracking tick (every 1 min) ---
// Watches which tab is focused and for how long, compares it against any
// task with active tracking, and increments elapsed time — no page content
// is ever read, only which hostname is focused.
chrome.alarms.create("hq_completion_tick", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(safely("Completion tracking", async (alarm) => {
  if (alarm.name !== "hq_completion_tick") return;

  const { hq_tasks } = await chrome.storage.local.get("hq_tasks");
  const tasks = hq_tasks || [];
  const tracked = tasks.filter(t => t.activeSince && t.trackUrl && !t.done);
  if (!tracked.length) return;

  let activeHostname = null;
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    if (win && win.focused) {
      const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
      if (tab?.url) activeHostname = new URL(tab.url).hostname;
    }
  } catch (e) { /* no focused window — browser may be unfocused, skip this tick */ }

  if (!activeHostname) return;

  let changed = false;
  const { hq_completion_prompts } = await chrome.storage.local.get("hq_completion_prompts");
  const prompts = hq_completion_prompts || [];

  for (const t of tracked) {
    if (t.trackUrl !== activeHostname) continue;
    t.trackedSeconds = (t.trackedSeconds || 0) + 60;
    changed = true;
    if (t.estMinutes && !t.promptShown && t.trackedSeconds >= t.estMinutes * 60 * 0.8) {
      t.promptShown = true;
      if (!prompts.includes(t.id)) prompts.push(t.id);
    }
  }

  if (changed) {
    await chrome.storage.local.set({ hq_tasks: tasks, hq_completion_prompts: prompts });
  }
}));
