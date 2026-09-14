import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const pass = (message) => console.log(`✓ ${message}`);

const manifest = JSON.parse(read("manifest.json"));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, "2.4.0");
const extensionHex = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32);
const extensionId = [...extensionHex].map(char => String.fromCharCode(97 + parseInt(char, 16))).join("");
assert.equal(extensionId, "cbgepkbfmcahdpahipkdeahppfbggjok", "Manifest key changed the OAuth-bound extension ID");
assert.equal(manifest.oauth2.client_id, "909480994423-tv8bkcfd8v8il907lph0t2b72oh165k6.apps.googleusercontent.com");
assert(fs.existsSync(path.join(root, "OAUTH_SETUP.md")), "Exact Gmail OAuth setup guide is missing");
assert.equal(manifest.chrome_url_overrides?.newtab, "newtab.html");
assert.deepEqual(manifest.oauth2?.scopes, ["https://www.googleapis.com/auth/gmail.readonly"]);
assert(!manifest.permissions.includes("history"), "History access must not be added");
assert(manifest.permissions.includes("geolocation"), "Automatic weather needs the declared geolocation permission");
assert(manifest.permissions.includes("tabGroups"), "Topic workspace restore needs tabGroups permission");
assert(!manifest.permissions.includes("downloads") && manifest.optional_permissions?.includes("downloads"), "Download-history access must remain optional and contextual");
assert(!manifest.oauth2.scopes.some(scope => scope.includes("userinfo") || scope.includes("drive")), "OAuth scope is broader than Gmail read-only");
pass("Manifest V3, new-tab override, and least-privilege Gmail scope");

const html = read("newtab.html");
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "Duplicate HTML id found");
assert(/<meta\s+name="viewport"/.test(html), "Responsive viewport metadata is missing");
assert(!/\son(?:click|change|input|keydown)=/i.test(html), "Inline event handler found; MV3 UI should use packaged JavaScript");
assert(html.includes('id="topbar-controls" role="toolbar"'), "Primary icon controls must expose toolbar semantics");
assert(html.includes('id="settings-content" role="tabpanel"'), "Settings content must expose tab-panel semantics");
pass(`${ids.length} unique element IDs and no inline event handlers`);

const panelIds = new Set([...html.matchAll(/<(?:div|section)\b[^>]*\bid=["']([^"']+-flyout)["']/g)].map(match => match[1]));
for (const match of html.matchAll(/\bdata-panel=["']([^"']+)["']/g)) {
  assert(panelIds.has(match[1]), `Dock target does not exist: ${match[1]}`);
}
assert(html.includes('<script src="js/nexus.js"></script>'), "Nexus is not packaged in the new-tab page");
pass("Every dock command resolves to a packaged flyout, including Nexus");

const unnamedButtons = [];
for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
  const attributes = match[1];
  const visibleText = match[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const runtimeNamed = /\bclass="[^"]*(?:flyout-close|dock-btn)/.test(attributes);
  if (!visibleText && !/\b(?:aria-label|title)=/.test(attributes) && !runtimeNamed) unnamedButtons.push(match[0]);
}
assert.deepEqual(unnamedButtons, [], "Found icon-only buttons without an accessible name");
pass("Static buttons have text or an accessible runtime/static label");

const labelTargets = new Set([...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/g)].map(match => match[1]));
const unnamedControls = [];
for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
  const attributes = match[2];
  const id = attributes.match(/\bid=["']([^"']+)/)?.[1];
  const type = attributes.match(/\btype=["']([^"']+)/)?.[1] || "";
  if (type !== "hidden" && !/\baria-label(?:ledby)?=/.test(attributes) && !(id && labelTargets.has(id))) {
    unnamedControls.push(id || match[0]);
  }
}
assert.deepEqual(unnamedControls, [], "Found form controls without programmatic labels");
pass("All static form controls are programmatically named");

for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/g)) {
  assert(fs.existsSync(path.join(root, match[1])), `Missing script: ${match[1]}`);
}
const packagedScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
assert.equal(packagedScripts[0], "js/early-diagnostics.js", "Early diagnostics must load before feature scripts");
assert(!packagedScripts.includes("js/lib/webllm/webllm-loader.mjs"), "The multi-megabyte local-AI runtime must not load on every new tab");
assert(read("js/local-ai.js").includes('script.src = chrome.runtime.getURL("js/lib/webllm/webllm-loader.mjs")'), "Local AI must remain available through explicit lazy loading");
for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/g)) {
  if (!/^(?:https?:|data:)/.test(match[1])) assert(fs.existsSync(path.join(root, match[1])), `Missing stylesheet: ${match[1]}`);
}
pass("All packaged HTML script and stylesheet references resolve");

const hiddenDialogs = [...html.matchAll(/<(?:div|section)\b[^>]*\brole="dialog"[^>]*>/g)].map(match => match[0]);
assert(hiddenDialogs.length >= 20, "Expected modal/flyout dialog semantics are missing");
for (const tag of hiddenDialogs) {
  if (/\bclass="[^"]*hidden/.test(tag) || /\bclass="[^"]*flyout/.test(tag)) {
    assert(/\baria-hidden="true"/.test(tag), `Initially hidden dialog lacks aria-hidden: ${tag}`);
    assert(/\binert(?:\s|>)/.test(tag), `Initially hidden dialog lacks inert: ${tag}`);
  }
  const isFlyout = /\bclass="[^"]*flyout/.test(tag);
  assert(isFlyout || /\baria-(?:label|labelledby)=/.test(tag), `Dialog lacks an accessible name: ${tag}`);
}
assert(read("js/newtab.js").includes('panel.setAttribute("aria-labelledby", heading.id)'), "Flyout runtime labels are missing");
pass(`${hiddenDialogs.length} dialogs have accessible names and safe initial focus state`);

const jsFiles = fs.readdirSync(path.join(root, "js"), { recursive: true })
  .filter(file => file.endsWith(".js") || file.endsWith(".mjs"));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, "js", file)], { encoding: "utf8" });
  assert.equal(result.status, 0, `${file} failed syntax validation:\n${result.stderr}`);
}
pass(`${jsFiles.length} JavaScript modules pass syntax validation`);

const dynamicDomIds = new Set([
  "forgotten-shuffle-btn", "nudge-yes-btn", "nudge-dismiss-btn",
  "gleam-mission-outcome", "gleam-mission-status", "gleam-mission-before", "gleam-mission-after",
]);
const missingLiteralDomIds = [];
for (const file of jsFiles.filter(file => !file.startsWith("lib/"))) {
  for (const match of read(path.join("js", file)).matchAll(/getElementById\(["']([^"']+)["']\)/g)) {
    if (!ids.includes(match[1]) && !dynamicDomIds.has(match[1])) missingLiteralDomIds.push(`${file}: ${match[1]}`);
  }
}
assert.deepEqual(missingLiteralDomIds, [], "JavaScript references a missing static DOM ID");
pass("Literal DOM references resolve or are explicitly runtime-created");

const migrationState = {
  hq_tasks: [{ id: "keep-me" }],
  hq_custom_wallpapers: "malformed",
  hq_sound_volume: 4,
  hq_wallpaper_interval_value: 0,
  hq_gleam_v1: "malformed",
  hq_notes_document_v2: "malformed",
  hq_calendar_details_v2: [],
};
const migrationContext = vm.createContext({
  chrome: { storage: { local: {
    async get() { return { ...migrationState }; },
    async set(values) { Object.assign(migrationState, values); },
  } } },
});
vm.runInContext(read("js/storage-schema.js"), migrationContext, { filename: "storage-schema.js" });
const StorageSchema = vm.runInContext("StorageSchema", migrationContext);
await StorageSchema.migrate();
assert.equal(migrationState.hq_schema_version, 8);
assert.equal(migrationState.hq_tasks[0].id, "keep-me", "Migration replaced real task data");
assert.equal(JSON.stringify(migrationState.hq_custom_wallpapers), "[]");
assert.equal(migrationState.hq_sound_volume, 1);
assert.equal(migrationState.hq_wallpaper_interval_value, 1);
assert.equal(JSON.stringify(migrationState.hq_browser_workspaces), "[]");
assert.equal(JSON.stringify(migrationState.hq_nexus_recent), "[]");
assert.equal(JSON.stringify(migrationState.hq_followups), "[]");
assert.equal(JSON.stringify(migrationState.hq_focus_interruptions), "[]");
assert.equal(JSON.stringify(migrationState.hq_focus_timeline), "{}");
assert.equal(migrationState.hq_gleam_v1, null);
assert.equal(migrationState.hq_notes_document_v2, null);
assert.equal(JSON.stringify(migrationState.hq_calendar_details_v2), "{}");
assert.equal(JSON.stringify(migrationState.hq_research_sources_v1), "[]");
assert.equal(JSON.stringify(migrationState.hq_srs_cards), "[]");
assert.equal(migrationState.hq_study_preferences_v1.missionMinutes, 25);
assert.equal(migrationState.hq_srs_settings_v2.sessionLimit, 20);
pass("Versioned storage migrations preserve real data and repair malformed settings");

const notesStorage = {};
const notesContext = vm.createContext({
  chrome: { storage: { local: {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(names.map(name => [name, notesStorage[name]]));
    },
    async set(values) { Object.assign(notesStorage, values); },
  } } },
  document: { getElementById: () => null },
  console,
  setTimeout,
  clearTimeout,
  structuredClone,
});
vm.runInContext(read("js/notes-editor.js"), notesContext, { filename: "notes-editor.js" });
const NotesEditor = vm.runInContext("NotesEditor", notesContext);
const baseNote = { version: 2, html: "<p>Base</p>", plain: "Base", revision: 1, updatedAt: 1, source: "test" };
NotesEditor.document = baseNote;
await NotesEditor.appendExternal("One capture", "test");
assert.equal(notesStorage.hq_notes, "Base\nOne capture", "One Notes append must be persisted exactly once");
assert.equal(notesStorage.hq_notes_document_v2.plain, "Base\nOne capture");
assert.deepEqual(Array.from(NotesEditor.collapseExactTriplication(["A", "B", "A", "B", "A", "B"])), ["A", "B"]);
assert.equal(NotesEditor.collapseExactTriplication(["A", "A"]), null, "Normal repeated content must not be removed");
assert(!read("js/notes-editor.js").includes("reconcileExternalAppends"), "The amplifying Notes reconciliation loop returned");
assert(read("js/capture.js").includes("NotesEditor.appendExternal") && read("js/today.js").includes("NotesEditor.appendExternal"), "Notes writers are not centralized");
pass("Notes has one serialized writer, exact-triplication recovery, compatibility mirrors, and reversible capture");

const calendarContext = vm.createContext({ chrome: {}, document: {}, console, Date, AbortController, setTimeout, clearTimeout });
vm.runInContext(read("js/calendar.js"), calendarContext, { filename: "calendar.js" });
const CalendarUnit = vm.runInContext("Calendar", calendarContext);
const quick = CalendarUnit.parseQuick("Math revision tomorrow at 4pm for 45m #school");
assert.equal(quick.title, "Math revision");
assert.equal(quick.start, "16:00");
assert.equal(quick.end, "16:45");
assert.equal(quick.category, "school");
const weekly = CalendarUnit.occurrenceKeys({ date: "2026-09-14", repeat: "weekly", repeatUntil: "2026-10-05" });
assert.deepEqual(Array.from(weekly), ["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]);
assert(!read("js/calendar.js").includes("prompt("), "Calendar regressed to a browser prompt");
for (const id of ["cal-quick-input", "cal-event-form", "cal-day-events", "cal-reminder-banner", "cal-undo"]) assert(html.includes(`id="${id}"`), `Advanced Calendar surface missing ${id}`);
pass("Calendar quick-entry, recurrence, structured editor, reminder surface, views, and undo contracts");

const shellSource = read("js/newtab.js");
assert(shellSource.includes('expand.className = "panel-expand"') && shellSource.includes('panel.classList.toggle("panel-fullscreen")'), "Universal module depth control is missing");
assert(shellSource.includes('document.getElementById("task-compose")') && html.includes('id="task-compose-due"'), "Structured task composer is missing");
assert(!/const text = prompt\("New task/.test(shellSource), "Task creation regressed to sequential native prompts");
assert(read("js/schedule.js").includes("openProfileEditor") && !/prompt\("(?:Name for|Rename this profile)/.test(read("js/schedule.js")), "Schedule profile names regressed to native prompts");
assert(read("css/style.css").includes(".flyout.panel-fullscreen") && read("css/style.css").includes("@media(prefers-reduced-motion:reduce){.flyout.panel-fullscreen"), "Full workspace layout or reduced-motion path is missing");
pass("Universal module depth, structured Task capture, and inline Schedule profile editing contracts");

const nexusSource = read("js/nexus.js");
assert(nexusSource.includes('document.getElementById("nexus-mission-preview").hidden = false'), "Mission selection must expose a review step");
assert(nexusSource.includes('document.getElementById("nexus-mission-run").onclick'), "Mission execution must require explicit confirmation");
assert(nexusSource.includes("chrome.tabs.create({ url })"), "Unsupported services must use an official-app handoff");
assert(!nexusSource.includes("fetch("), "Nexus must not scrape third-party messaging services");
assert(nexusSource.includes("capabilityRegistry()"), "Nexus capabilities must be registered rather than scattered UI branches");
assert(nexusSource.includes("previewPlan(plan)"), "Consequential parameterized commands must expose a dry-run plan");
assert(nexusSource.includes("hq_nexus_recent"), "Recognized Nexus commands should be locally discoverable and erasable");
assert(html.includes('id="nexus-telemetry-mode"') && html.includes('id="nexus-command-trace"'), "Nexus factual cortex telemetry is missing");
assert(nexusSource.includes("commandSuggestions(query") && nexusSource.includes("moveSuggestion(direction)"), "Nexus keyboard command suggestions are missing");
assert(nexusSource.includes('id:"urgent-mail"') && nexusSource.includes('id:"task-plan"') && nexusSource.includes('id:"group-tabs"'), "High-value Gmail, planning, and tab intents are missing");
assert(nexusSource.includes('scope:"Gmail read-only"') && nexusSource.includes('confirmation:"review"'), "Capability authority and confirmation metadata are missing");
assert(!read("js/seed.js").includes("SEED_TASKS"), "Fresh installs must not fabricate tasks");
assert(read("js/tasks.js").includes("const DEFAULT_VENTURES = [];"), "Fresh installs must not fabricate venture names");
pass("Nexus confirmation, safe handoffs, and honest empty-state contracts");

assert(html.includes('id="dock-more-tray" class="hidden"'), "Secondary tools need a progressively disclosed launchpad");
assert(html.includes('id="schedule-first-run"'), "Fresh schedules need an explicit first-run choice");
assert(!read("js/schedule.js").includes("this.profiles = { regular: SCHEDULE_SEED_REGULAR };"), "Schedule must not silently import personal data");
assert(read("js/newtab.js").includes("const LazyFeatures ="), "Heavy and network-backed panels must initialize on first use");
assert(read("js/newtab.js").includes("this.started.delete(panelId)"), "A transient lazy-panel failure must remain retryable");
assert(read("js/newtab.js").includes('"optimizer-flyout": ["Browser workspaces"'), "Tab queries and workspaces must initialize on first use");
assert(!read("js/newtab.js").includes('BootDiagnostics.run("Chrome optimizer"'), "Tab review must not query every new-tab startup");
pass("Progressive dock, lazy feature startup, and schedule onboarding contracts");

const gmailSource = read("js/gmail.js");
assert(gmailSource.includes("hq_gmail_cache_v1"), "Gmail metadata cache is missing");
assert(gmailSource.includes("nextPageToken"), "Gmail pagination is missing");
assert(gmailSource.includes("buildQuery()"), "Gmail search/filter query builder is missing");
assert(!gmailSource.includes("format=full"), "Gmail must not request full message bodies");
const workspaceSource = read("js/workspaces.js");
assert(workspaceSource.includes("chrome.windows.create"), "Workspace restore must open a new window");
assert(!workspaceSource.includes("chrome.tabs.remove"), "Workspace restore must not close current tabs");
assert(workspaceSource.includes("confirm(`Delete the saved workspace"), "Workspace deletion must require confirmation");
assert(read("js/integration-health.js").includes("chrome.permissions.getAll"), "Permission ledger is missing");
pass("Gmail communications, workspace recovery, and integration-health contracts");

assert(html.includes('id="today-flyout"'), "Unified Today surface is missing");
assert(read("js/newtab.js").includes('BootDiagnostics.run("Today"'), "Today must remain available as a core local tool in Safe Mode");
assert(!read("js/newtab.js").includes('"today-flyout": ["Today"'), "Today must not be paused as an optional lazy integration");
assert(read("js/today.js").includes("showUndo(label, action)"), "Today capture needs explicit undo");
assert(read("js/today.js").includes('destination === "event"'), "Today capture does not cover calendar events");
assert(read("js/gmail.js").includes("toggleFollowup(item)"), "Gmail follow-up capture is missing");
assert(read("js/today.js").includes('data-followup-action="done"'), "Today follow-ups need a completion action");
assert(read("js/today.js").includes('data-followup-action="open"'), "Gmail follow-ups need an open-original action");
assert(html.includes('id="today-foresight-title"'), "Next-action foresight surface is missing");
assert(read("js/today.js").includes("chooseNextTask(currentBlock, focusTaskId"), "Transparent next-action scoring is missing");
assert(html.includes('id="today-tomorrow"'), "Tomorrow preview is missing");
const focusSceneSource = read("js/focus-scenes.js");
assert(focusSceneSource.includes("hq_focus_scene_previous"), "Focus scene restore state must survive reload");
assert(focusSceneSource.includes("Interruption parked"), "Focus interruption capture is missing");
assert(focusSceneSource.includes("Scene deployed"), "Focus timeline is missing scene events");
assert(read("css/style.css").includes("@keyframes scene-deploy"), "Cinematic scene transition is missing");
assert(read("js/mode-transitions.js").includes("prefers-reduced-motion"), "Cinematic mode transitions need a reduced-motion path");
for (const kind of ["deepwork", "privacy", "professional", "lockdown", "zen", "theme"]) {
  assert(read("css/style.css").includes(`data-kind="${kind}"`), `Missing ${kind} transition signature`);
}
pass("Unified Today foresight, follow-up, tomorrow, reversible focus-scene, and transition contracts");

const livingWidgetSource = read("js/living-widgets.js");
for (const widget of ["briefing", "weather", "focus", "schedule", "assessment", "inbox", "habits"]) {
  assert(html.includes(`id="widget-${widget}"`), `Living ${widget} widget is missing`);
}
assert(livingWidgetSource.includes('VISIBILITY_KEY: "hq_widget_visibility_v1"'), "Widget visibility preferences are not persisted");
assert(livingWidgetSource.includes('ORDER_KEY: "hq_widget_order_v1"'), "Widget order preferences are not persisted");
assert(html.includes('id="widget-arrange-toggle"') && html.includes('id="widget-order-reset"'), "Widget arrangement controls are missing");
assert(livingWidgetSource.includes("document.startViewTransition") && livingWidgetSource.includes("widget-drop-target"), "Widget arrangement lacks animated, collision-safe feedback");
assert(livingWidgetSource.includes("chrome.storage.onChanged.addListener"), "Living widgets are not reactive to source data changes");
assert(livingWidgetSource.includes('document.body.dataset.weather = state'), "Weather does not drive the ambient dashboard state");
assert(livingWidgetSource.includes('document.body.classList.toggle("context-focus"'), "Focus mode does not recompose the widget canvas");
assert(read("js/newtab.js").includes('e.altKey && e.key.toLowerCase() === "z"'), "Cinema mode is missing its fast keyboard toggle");
assert(!html.includes('id="wallpaper-widgets"'), "The retired bottom wallpaper thumbnail pile returned");
const livingWidgetContext = vm.createContext({ document: {}, console });
vm.runInContext(livingWidgetSource, livingWidgetContext, { filename: "living-widgets.js" });
const LivingWidgetUnit = vm.runInContext("LivingWidgets", livingWidgetContext);
assert.deepEqual(Array.from(LivingWidgetUnit.normalizeOrder(["weather", "weather", "unknown", "briefing"])), ["briefing", "weather", "focus", "schedule", "assessment", "inbox", "habits"]);
assert.deepEqual(Array.from(LivingWidgetUnit.normalizeOrder(["briefing", "focus", "weather", "habits", "schedule"])), ["briefing", "focus", "weather", "habits", "schedule", "assessment", "inbox"]);
pass("Reactive living-widget canvas, customization, and Cinema clearing contracts");

const cinematicSource = read("js/cinematic-motion.js");
assert(html.includes('id="cinematic-field"'), "Layered cinematic field is missing");
assert(html.includes('id="motion-profile-select"'), "Motion profile control is missing");
assert(cinematicSource.includes('requestAnimationFrame(() => this.paintPointer())'), "Pointer depth must be animation-frame throttled");
assert(cinematicSource.includes('document.addEventListener("visibilitychange"'), "Motion must pause in background tabs");
assert(cinematicSource.includes('prefers-reduced-motion: reduce'), "Motion engine must inspect reduced-motion preference");
assert(cinematicSource.includes('navigator.hardwareConcurrency') && cinematicSource.includes('navigator.deviceMemory'), "Adaptive motion needs a device capability gate");
assert(cinematicSource.includes("initialized: false") && cinematicSource.includes("if (this.initialized) return"), "Motion controls can be wired more than once");
assert(read("css/style.css").includes('body.motion-suspended *') && read("css/style.css").includes('Cinematic Motion Engine v1'), "Cinematic CSS performance contract is missing");
pass("Adaptive cinematic motion, layered widget depth, and background-pause contracts");

const panelShellSource = read("js/newtab.js");
assert(panelShellSource.includes("window.HQPanels = Object.freeze") && panelShellSource.includes("async function requestOpen"), "Widget and dock panel routes are not centralized");
assert(panelShellSource.includes('document.querySelectorAll(".dock-btn[data-panel]")'), "Dock wiring includes controls without a panel target");
assert(html.includes('id="build-version"') && panelShellSource.includes("chrome.runtime.getManifest().version"), "Loaded build identity is not visible for stale-extension diagnosis");
pass("Central panel routing, interaction-layer safety, and loaded-build diagnostics");

const savedWorkspaceState = {};
const restoredWindows = [];
const pinnedUpdates = [];
const workspaceTabs = [
  { id: 1, url: "https://example.com/one", title: "One", pinned: true },
  { id: 2, url: "chrome://settings", title: "Settings", pinned: false },
  { id: 3, url: "https://openai.com/", title: "OpenAI", pinned: false },
];
const workspaceContext = vm.createContext({
  chrome: {
    storage: { local: {
      async get(key) { return { [key]: savedWorkspaceState[key] }; },
      async set(value) { Object.assign(savedWorkspaceState, value); },
    } },
    tabs: {
      async query(query) { return query.windowId ? [{ id: 10 }, { id: 11 }] : workspaceTabs; },
      async update(id, changes) { pinnedUpdates.push({ id, changes }); },
    },
    windows: { async create(options) { restoredWindows.push(options); return { id: 99 }; } },
  },
  crypto: globalThis.crypto,
  URL,
  confirm: () => true,
  console,
  escapeHtml: String,
  escapeAttribute: String,
  document: { getElementById: () => null },
});
vm.runInContext(workspaceSource, workspaceContext, { filename: "workspaces.js" });
const Workspaces = vm.runInContext("Workspaces", workspaceContext);
Workspaces.render = () => {};
Workspaces.setStatus = () => {};
await Workspaces.load();
await Workspaces.saveCurrent("Research");
assert.equal(Workspaces.items[0].tabs.length, 2, "Workspace included a non-restorable Chrome page");
await Workspaces.restore(Workspaces.items[0].id);
assert.deepEqual(restoredWindows[0].url, ["https://example.com/one", "https://openai.com/"]);
assert.equal(pinnedUpdates.length, 1, "Pinned workspace state was not restored");
pass("Workspace save/restore simulation preserves eligible tabs and current-window safety");

const mailContext = vm.createContext({ URL });
vm.runInContext(read("js/mail-intelligence.js"), mailContext, { filename: "mail-intelligence.js" });
const MailIntelligence = vm.runInContext("MailIntelligence", mailContext);
const urgentSchoolMail = MailIntelligence.classify({
  threadId: "school-1", labelIds: ["UNREAD", "IMPORTANT"],
  payload: { headers: [{ name: "From", value: "teacher@education.nsw.gov.au" }, { name: "Subject", value: "Assessment due tomorrow — action required" }] },
});
assert.equal(urgentSchoolMail.category, "school");
assert.equal(urgentSchoolMail.priority, "urgent");
assert(html.includes('data-smart-filter="social"') && read("js/gmail.js").includes('data-mail-action="calendar"'), "Gmail smart lanes or consequence actions are missing");
assert(read("js/gmail.js").includes("hq_gmail_category_overrides_v1"), "Gmail category corrections are not persisted");
pass("Explainable Gmail priority lanes, category correction, and local consequence actions");

const scheduleSource = read("js/schedule.js");
assert(scheduleSource.includes("MASTER_V8_PHASES") && scheduleSource.includes('masterVersion = 8'), "Master Timetable v8 is not a versioned profile");
assert(scheduleSource.includes("buildTaskPlan") && scheduleSource.includes("hq_schedule_plan_undo_v1"), "Timetable-aware planning lacks review/undo contracts");
assert(read("js/daily-planner.js").includes("Schedule.blocksFor"), "Daily Planner is still detached from the active timetable");
pass("Master Timetable v8 phase overlay and reviewed calendar planning contracts");

const assignmentSource = read("js/assignments.js");
assert(html.includes('id="assignments-flyout"') && html.includes('id="assignment-plan-apply"'), "Assignment Command Centre is missing");
assert(read("js/newtab.js").includes('"assignments-flyout": ["Study OS, assessment intake and research pipeline"'), "Study and assessment controls must stay lazy-initialized off the new-tab critical path");
assert(assignmentSource.includes("flexibleSlots(item)") && assignmentSource.includes("Schedule.isFlexibleBlock(block)"), "Assignment sessions must use genuine timetable capacity");
assert(assignmentSource.includes("this.UNDO_KEY") && html.includes("Review before calendar"), "Assignment calendar application needs review and undo");
assert(!assignmentSource.includes("fetch("), "Assignment tracking must remain local and must not scrape school services");
const todaySource = read("js/today.js");
assert(todaySource.includes("hq_assignments_v1") && todaySource.includes("tomorrowAssignments"), "Today must include real assignment workload and tomorrow signals");
assert(livingWidgetSource.includes("hq_assignments_v1") && livingWidgetSource.includes("widget-assignment-signal"), "Foresight must surface the nearest unfinished assignment");
const workspaceHealthSource = read("js/workspaces.js");
assert(workspaceHealthSource.includes("async healthCheck()") && workspaceHealthSource.includes("async refreshMetadata(id)"), "Workspace diagnostics and metadata refresh are missing");
assert(workspaceHealthSource.includes("Dedupe saved copy") && workspaceHealthSource.includes("Open tabs and bookmarks will not change"), "Saved-workspace deduplication must disclose its exact boundary");
pass("Local assignment planning and non-destructive workspace health contracts");

const studySource = read("js/study-os.js");
assert(html.includes('<script src="js/study-os.js"></script>'), "Study OS is not packaged");
for (const view of ["overview", "assignments", "research", "revision"]) {
  assert(html.includes(`id="study-view-${view}"`), `Study OS ${view} workspace is missing`);
}
for (const id of ["study-mission-preview", "study-source-form", "study-source-list", "study-revision-summary"]) {
  assert(html.includes(`id="${id}"`), `Study OS surface missing ${id}`);
}
assert(studySource.includes('SOURCE_KEY: "hq_research_sources_v1"') && !studySource.includes("fetch("), "Research cards must remain explicit local metadata without scraping");
assert(studySource.includes("Review before launch") || html.includes("Review before launch"), "Study mission consequences must be previewed");
assert(studySource.includes("Deep Work will not be changed"), "Study mission authority boundary is missing");
const studyContext = vm.createContext({ URL, Date, console, setTimeout, clearTimeout });
vm.runInContext(studySource, studyContext, { filename: "study-os.js" });
const StudyUnit = vm.runInContext("StudyOS", studyContext);
assert.equal(StudyUnit.safeHttpUrl("javascript:alert(1)"), null, "Research source accepted a dangerous scheme");
assert.equal(StudyUnit.safeHttpUrl("https://example.com/research#method"), "https://example.com/research#method");
assert.equal(StudyUnit.nextStage("read"), "extract");
assert.equal(StudyUnit.nextStage("archive"), "archive");
assert.equal(StudyUnit.citationFor({ title:"Testing evidence", author:"A. Researcher", publishedDate:"2026-04-02", url:"https://example.com/paper" }), "A. Researcher. (2026). Testing evidence. example.com. https://example.com/paper");

const assignmentContext = vm.createContext({ Date });
vm.runInContext(assignmentSource, assignmentContext, { filename: "assignments.js" });
const AssignmentUnit = vm.runInContext("Assignments", assignmentContext);
const researchSteps = AssignmentUnit.defaultSteps("research", ["Use three sources"]);
assert(researchSteps.length >= 6 && researchSteps.some(step => step.phase === "Evidence") && researchSteps.some(step => step.phase === "Rubric"), "Manual assignments lack a realistic action breakdown");
assert(assignmentSource.includes("async updateItem(item, card)") && assignmentSource.includes("async startNext(item)"), "Assignments lack editable details or next-step focus launch");

const srsSource = read("js/srs.js");
const srsContext = vm.createContext({ Date });
vm.runInContext(srsSource, srsContext, { filename: "srs.js" });
const RecallUnit = vm.runInContext("SRS", srsContext);
const failedRecall = vm.runInContext('sm2({id:"c",front:"Q",back:"A",repetitions:3,intervalDays:20,easeFactor:2.5,lapses:0},1)', srsContext);
assert.equal(failedRecall.intervalDays, 1);
assert.equal(failedRecall.repetitions, 0);
assert.equal(failedRecall.lapses, 1);
assert.deepEqual(Array.from(Array.from(RecallUnit.parseImport("cards.tsv", "Math\t2+2\t4\tarithmetic,basic"))[0].tags), ["arithmetic", "basic"]);
assert(srsSource.includes("sessionLimit") && srsSource.includes("toggleSuspend") && srsSource.includes("parseImport"), "Recall Lab session limits, suspension or import are missing");
assert(srsSource.includes("Reinforcement passes were not double-counted"), "Recall Lab must distinguish scheduled reviews from same-session retries");
assert(read("js/nexus.js").includes('id:"research-library"') && read("js/nexus.js").includes('id:"recall"'), "Nexus cannot discover Study OS research and recall capabilities");
const examSource = read("js/exam-countdown.js");
assert(html.includes('id="exam-undo-delete"') && examSource.includes('UNDO_KEY: "hq_exam_countdown_undo_v1"'), "Exam plan deletion is not recoverable");
assert(examSource.includes('source: "exam-plan"') && examSource.includes("No timer was changed"), "Exam daily targets must create a deduplicated Task without silently changing focus");
assert(examSource.includes("learnedDays") && examSource.includes("defaultDays") && examSource.includes("Planning basis"), "Exam plans must expose learned versus default capacity assumptions");
const studyBackgroundSource = read("js/background.js");
assert(studyBackgroundSource.includes('id: "hq-research-page"') && studyBackgroundSource.includes('id: "hq-research-selection"'), "Research capture context menus are missing");
assert(studyBackgroundSource.includes("chrome.contextMenus.removeAll") && studyBackgroundSource.includes("hq_study_last_capture_v1"), "Research capture installation or feedback state is not resilient");
pass("Study OS command view, research provenance, assignment breakdowns, exam recovery, safe missions, and advanced Recall Lab contracts");

const intakeSource = read("js/assessment-intake.js");
assert(html.includes('id="widget-assessment"') && html.includes('id="assessment-intake-list"'), "Assessment Radar or intake review surface is missing");
assert(intakeSource.includes("showDirectoryPicker") && intakeSource.includes("queryPermission"), "Assessment file reading must require an explicit folder capability");
assert(intakeSource.includes('chrome.permissions.request({ permissions: ["downloads"] })'), "Download-history permission must be requested only from the intake action");
assert(intakeSource.includes("full source text is not retained") && intakeSource.includes("volatileText"), "Full assessment text must remain session-only after derived extraction");
assert(intakeSource.includes("Accept + add deadline") && intakeSource.includes("undoAccept(item)"), "Assessment acceptance needs a disclosed consequence and exact undo");
assert(intakeSource.includes("Assignments.buildPlan") && intakeSource.includes("Start next step"), "Assessment plans need timetable review and a direct focus launch");
assert(intakeSource.includes('item.state === "pending" && !item.sourceRead') && intakeSource.includes("oldFingerprint"), "Download metadata must merge into its pending real-file card instead of duplicating it");
assert(intakeSource.includes('item.state === "accepted"') && intakeSource.includes("never drift apart"), "Accepted assessment fields must remain locked to their Assignment and Calendar copies");
assert(intakeSource.includes("workloadSignal(item)") && intakeSource.includes("visible flexible capacity"), "Assessment intake lacks capacity and deadline-collision intelligence");
assert(read("js/living-widgets.js").includes("const intakeId = event.currentTarget.dataset.intakeId") && read("js/living-widgets.js").includes("entry.id === intakeId"), "Assessment widget must snapshot its click context before lazy async initialization");
const backgroundSource = read("js/background.js");
assert(backgroundSource.includes("ASSESSMENT_DOWNLOAD_EVENTS_KEY") && backgroundSource.includes("assessmentLikeDownload"), "Completed likely assessment downloads are not detected");
const assessmentEventBlock = backgroundSource.slice(backgroundSource.indexOf("async function recordAssessmentDownload"), backgroundSource.indexOf("// --- Deep Work"));
assert(!/\b(?:url|referrer)\s*:/.test(assessmentEventBlock), "Assessment download events must not persist browsing URLs or referrers");
const intakeContext = vm.createContext({ Date, console });
vm.runInContext(intakeSource, intakeContext, { filename: "assessment-intake.js" });
const Intake = vm.runInContext("AssessmentIntake", intakeContext);
const extractedAssessment = Intake.analyze("Science Assessment Task 3.pdf", "SCIENCE ASSESSMENT TASK 3\nYou are required to analyse experimental data and present a scientific report.\nDue date: Monday 18 August 2026\nYou must include a graph, identify variables, discuss anomalies and submit a conclusion.", "import");
assert.equal(extractedAssessment.dueDate, "2026-08-18");
assert.equal(extractedAssessment.subject, "Science");
assert(extractedAssessment.requirements.length >= 2 && extractedAssessment.steps.length >= 5, "Assessment extraction did not produce actionable grounded steps");
const localAiSource = read("js/local-ai.js");
assert(localAiSource.includes("async assist(mode, text)") && localAiSource.includes("async analyzeAssessment"), "Native AI lacks the expanded productivity operations");
assert(localAiSource.includes("cancelActive()") && localAiSource.includes("interruptGenerate"), "Native AI generation needs cancellation");
assert(html.includes('id="local-ai-mode"') && html.includes('id="local-ai-output"'), "Native Intelligence Lab is missing");
pass("Optional local assessment intake, grounded extraction, focus launch, and cancellable native AI contracts");

const gleamSource = read("js/gleam.js");
assert(html.includes('id="gleam-flyout"') && html.includes('class="dock-btn gleam-dock-btn"'), "Gleam app or its progressively disclosed launcher is missing");
assert(!html.includes('id="widget-gleam"'), "Gleam must remain out of the default living-widget canvas");
for (const view of ["home","learn","practice","missions","rehearse","progress","privacy"]) {
  assert(html.includes(`id="gleam-view-${view}"`), `Gleam ${view} workspace is missing`);
}
assert(read("js/newtab.js").includes('"gleam-flyout": ["Gleam social confidence lab"'), "Gleam must lazy-initialize only when opened");
assert(nexusSource.includes('id:"gleam"') && nexusSource.includes('simulations never claim to predict real people'), "Nexus lacks a truthful local Gleam command");
const gleamContext = vm.createContext({ Date, console, Set, crypto:globalThis.crypto, clearTimeout, setTimeout, document:{ querySelectorAll:()=>[], getElementById:()=>null } });
vm.runInContext(gleamSource, gleamContext, { filename:"gleam.js" });
const Gleam = vm.runInContext("GleamHQ", gleamContext);
assert(Gleam.skills.length === 6 && Gleam.lessons.length >= 18 && Gleam.missions.length >= 18 && Gleam.scenarios.length >= 8, "Gleam curriculum breadth regressed");
assert(Gleam.lessons.every(lesson => lesson.method.length >= 3 && lesson.quiz.options.length === 3 && Number.isInteger(lesson.quiz.correct) && lesson.field), "Every Gleam lesson needs method, knowledge check, and real-world action");
assert(Gleam.missions.every(mission => mission.proof && ["light","balanced","stretch"].includes(mission.level)), "Every Gleam mission needs an evidence prompt and calibrated pressure");
assert(Gleam.scenarios.every(scenario => scenario.rounds.length === 3 && scenario.rounds.every(round => round.choices.length === 3 && round.choices.every(choice => Number.isInteger(choice.score) && choice.feedback))), "Every Gleam simulation needs three explainable branching decisions");
const assertiveCues = Gleam.responseCues("I see why timing matters. My concern is accuracy. Could we test both versions tomorrow?", "assertiveness");
assert(assertiveCues.hits >= 3 && assertiveCues.total === 4, "Transparent response-cue analysis regressed");
Gleam.data=Gleam.emptyData();
Gleam.data.profile={ goals:["conversation","listening"], comfort:3, createdAt:Date.now() };
Gleam.data.practiceLog=[{ skill:"conversation", type:"lesson", title:"One", at:Date.now() }];
assert.equal(Gleam.dailyMission().skill,"listening","Daily Gleam mission did not adapt toward the least-practised selected track");
Gleam.renderScenarioStage=()=>{};
Gleam.renderHome=()=>{};
Gleam.renderMissions=()=>{};
Gleam.renderGlobalSignals=()=>{};
Gleam.save=async()=>{};
Gleam.data=Gleam.emptyData();
Gleam.scenarioSession={ id:Gleam.scenarios[0].id, index:0, points:0, decisions:[] };
await Gleam.chooseScenario(0);
await Gleam.chooseScenario(0);
await Gleam.chooseScenario(1);
assert.equal(Gleam.data.scenarioAttempts.length,1,"A completed branching simulation was not recorded exactly once");
assert.equal(Gleam.data.practiceLog.filter(item=>item.type==="simulation").length,1,"Simulation evidence log duplicated or disappeared");
const missionNodes={
  "gleam-mission-outcome":{ value:"I opened from the shared worksheet and we had two useful exchanges." },
  "gleam-mission-before":{ value:"2" },
  "gleam-mission-after":{ value:"3" },
  "gleam-mission-status":{ textContent:"" },
};
gleamContext.document={ getElementById:id=>missionNodes[id] || null };
Gleam.data=Gleam.emptyData();
Gleam.data.activeMission={ id:"context-opener", startedAt:1, draft:{ before:2, after:3, outcome:"" } };
await Gleam.completeMission();
assert.equal(Gleam.data.missionHistory.length,1,"A reflected field mission was not recorded as one real rep");
assert.equal(Gleam.data.activeMission,null,"Completed field mission remained active");
const repairedGleam = Gleam.normalise({
  lessonResults:{ fake:{ completedAt:1 }, "open-context":{ completedAt:5 } },
  scenarioAttempts:[{ scenarioId:"not-real", skill:"conversation", score:100, at:5 }],
  missionHistory:[{ missionId:"context-opener", skill:"conversation", title:"Unverified", outcome:"", completedAt:5 },{ missionId:"context-opener", skill:"conversation", title:"Completed", outcome:"I used a context opener and we exchanged two replies.", before:2, after:3, completedAt:6 }],
  rehearsals:[{ id:"r1", situation:"Ask a teacher for clarification", goal:"ask", person:"teacher", context:"The deadline is near", map:{ questions:"broken" }, createdAt:7 }],
  practiceLog:[{ skill:"fake", type:"mission", title:"Bad", at:8 },{ skill:"conversation", type:"lesson", title:"Real", at:9 }],
  activeMission:{ id:"context-opener", startedAt:10, draft:{ before:99, after:-2, outcome:"local draft" } },
});
assert.deepEqual(Object.keys(repairedGleam.lessonResults), ["open-context"], "Gleam accepted fabricated lesson completion");
assert.equal(repairedGleam.scenarioAttempts.length, 0, "Gleam accepted a nonexistent scenario");
assert.equal(repairedGleam.missionHistory.length, 1, "A field rep without reflection must not count as real evidence");
assert(Array.isArray(repairedGleam.rehearsals[0].map.questions), "Gleam trusted a malformed saved rehearsal map");
assert.equal(repairedGleam.practiceLog.length, 1, "Gleam accepted a practice record for a nonexistent skill");
assert.equal(repairedGleam.activeMission.draft.before, 5);
assert.equal(repairedGleam.activeMission.draft.after, 1);
assert(gleamSource.includes("captureMissionDraft") && gleamSource.includes("Replace the active Gleam mission?"), "Active mission drafts are not loss-resistant");
assert(gleamSource.includes("saveChain") && gleamSource.includes("async cancelMission()"), "Gleam saves are not serialized or cancellation-safe");
assert(gleamSource.includes("reportError(error") && gleamSource.includes("this.initialized=true") && gleamSource.indexOf("await this.load()") < gleamSource.lastIndexOf("this.initialized=true"), "Gleam lazy-load recovery or error boundary regressed");
assert(!gleamSource.includes("fetch(") && !/mediaDevices|SpeechRecognition|getUserMedia/.test(gleamSource), "Gleam must not network, listen, or record in the background");
assert(localAiSource.includes("async coachSocial") && localAiSource.includes("Do not teach manipulation, coercion, deception") && localAiSource.includes("romantic tactics"), "Optional social coaching lacks its safety and honesty boundary");
assert(html.includes("No account, contacts, microphone, camera, cloud sync, ad profile, or passive monitoring."), "Gleam data boundary is not visible in-product");
assert(read("css/style.css").includes("#gleam-flyout") && read("css/style.css").includes("@media(prefers-reduced-motion:reduce){#gleam-flyout"), "Gleam cinematic UI or reduced-motion path is missing");
pass("Gleam curriculum, simulation, real-rep evidence, privacy, recovery, and adaptive-control contracts");

function assertBalancedCss(source) {
  let depth = 0;
  let quote = null;
  let comment = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (comment) {
      if (char === "*" && next === "/") { comment = false; i += 1; }
      continue;
    }
    if (!quote && char === "/" && next === "*") { comment = true; i += 1; continue; }
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    assert(depth >= 0, "CSS has an unmatched closing brace");
  }
  assert.equal(depth, 0, "CSS has an unmatched opening brace");
}
const css = read("css/style.css");
assertBalancedCss(css);
assert(css.includes("@media (prefers-reduced-motion: reduce)"));
assert(css.includes(":focus-visible"));
assert(css.includes("@media (max-width: 640px)"));
assert(css.includes("#wallpaper-layer {\n  z-index: 0;"), "Wallpaper layer regressed behind the page background");
assert(/#wallpaper-layer,\s*#scrim,\s*#cinematic-field\s*\{\s*pointer-events:none;\s*\}/.test(css), "An ambient visual layer can intercept dashboard clicks");
assert(css.includes("#app { z-index:3; }"), "The dashboard is not above ambient visual layers");
assert(html.includes('id="wallpaper-image"'), "Wallpaper image rendering element is missing");
assert(read("js/newtab.js").includes("ArrowRight:"), "Settings tabs are missing arrow-key navigation");
assert(read("js/newtab.js").includes('custom-wallpaper-settings'), "Custom wallpaper controls are not context-sensitive");
assert(!read("js/quotes.js").includes("Icons.element"), "Quote renderer calls an unsupported icon helper");
pass("CSS structure, focus visibility, reduced motion, and mobile breakpoint");

const source = read("js/wallpaper.js");
const makeClassList = () => {
  const values = new Set();
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    contains: name => values.has(name),
    toggle(name, force) { const next = force ?? !values.has(name); next ? values.add(name) : values.delete(name); return next; },
  };
};
const wallpaperLayer = { style: {}, classList: makeClassList() };
const wallpaperImage = { classList: makeClassList(), removeAttribute(name) { if (name === "src") delete this.src; } };
const previewElements = { "wallpaper-layer": wallpaperLayer, "wallpaper-image": wallpaperImage };
class TestImage {
  naturalWidth = 3840;
  naturalHeight = 2160;
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src; }
}
const storageState = {
  hq_wallpaper_blocklist: ["wallhaven:blocked"],
  hq_wallpaper_current: { key: "wallhaven:current", url: "https://w.example/current.jpg", category: "gaming" },
};
const storage = {
  async get(keys) {
    const names = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(names.map(name => [name, storageState[name]]));
  },
  async set(values) { Object.assign(storageState, values); },
  async remove(key) { delete storageState[key]; },
};
const context = vm.createContext({
  chrome: { storage: { local: storage } },
  console,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  queueMicrotask,
  Image: TestImage,
  document: { getElementById: id => previewElements[id] || null, createElement: () => ({}) },
  fetch: async () => { throw new Error("Unexpected network access in tests"); },
});
vm.runInContext(source, context, { filename: "wallpaper.js" });
const Wallpaper = vm.runInContext("Wallpaper", context);
const categories = vm.runInContext("CATEGORY_SOURCE", context);
for (const [name, config] of Object.entries(categories)) {
  const query = config.q || config.wallhavenQ;
  if (config.source === "wallhaven") {
    const exclusions = name === "anime"
      ? ["-ecchi", "-bikini", "-swimsuit", "-lingerie", "-cleavage"]
      : ["-girl", "-woman", "-female", "-ecchi", "-bikini", "-swimsuit"];
    for (const exclusion of exclusions) {
      assert(query.includes(exclusion), `${name} is missing ${exclusion}`);
    }
  }
}
const animeScenes = vm.runInContext("ANIME_SCENE_SOURCE", context);
for (const scene of ["sukuna", "gojo", "yuji-black-flash", "luffy-gear-5", "luffy-gear-4", "luffy-gear-2", "observation-haki", "demon-slayer"]) {
  assert(animeScenes[scene]?.q, `Anime scene channel ${scene} is missing`);
}
const sceneChannels = vm.runInContext("WALLPAPER_SCENE_SOURCE", context);
for (const [category, expected] of Object.entries({ gaming: "neon-city", cars: "skyline-night", space: "black-hole", scenic: "forest-fog", minimal: "brutalist" })) {
  assert(sceneChannels[category]?.[expected]?.q, `${category} premium channel ${expected} is missing`);
}
const filtered = await Wallpaper.filterBlocked([
  { id: "blocked", path: "https://w.example/blocked.jpg", dimension_x: 3840, dimension_y: 2160 },
  { id: "allowed", path: "https://w.example/allowed.jpg", dimension_x: 3840, dimension_y: 2160 },
]);
assert.deepEqual(filtered.map(item => item.id), ["allowed"]);
const realFetchWallhaven = Wallpaper.fetchWallhaven.bind(Wallpaper);
const searchQueries = [];
Wallpaper.fetchWallhaven = async config => {
  searchQueries.push(config.q);
  return searchQueries.length === 3 ? { key: "wallhaven:recovered", url: "https://w.example/recovered.jpg", pool: [] } : null;
};
const recoveredSearch = await Wallpaper.fetchWallhavenResilient([
  { q: "exact", categories: "100", purity: "100" },
  { q: "curated", categories: "100", purity: "100" },
  { q: "broad", categories: "100", purity: "100" },
], {});
assert.equal(recoveredSearch.searchTier, 3, "Wallpaper empty-pool recovery did not widen through the configured tiers");
assert.deepEqual(searchQueries, ["exact", "curated", "broad"]);
Wallpaper.fetchWallhaven = async () => { const error = new Error("offline"); error.code = "network"; throw error; };
await assert.rejects(() => Wallpaper.fetchWallhavenResilient([{ q: "one" }, { q: "two" }], {}), /offline/);
Wallpaper.fetchWallhaven = realFetchWallhaven;
const realWallpaperApply = Wallpaper.apply.bind(Wallpaper);
Wallpaper.apply = async () => {};
Wallpaper.toast = () => {};
Wallpaper.refreshSafetyControls = async () => {};
await Wallpaper.blockCurrent();
assert(storageState.hq_wallpaper_blocklist.includes("wallhaven:current"));
assert.equal(storageState.hq_wallpaper_current, null);
Wallpaper.apply = realWallpaperApply;
const rendered = await Wallpaper.setBackground("https://w.example/working.jpg");
assert.equal(rendered, true);
assert.equal(wallpaperImage.src, "https://w.example/working.jpg");
assert.equal(wallpaperImage.classList.contains("ready"), true);
storageState.hq_wallpaper_category = "gaming";
storageState.hq_wallpaper_cached = "https://w.example/cached.jpg";
storageState.hq_wallpaper_cached_category = "gaming";
storageState.hq_wallpaper_current = { key: "wallhaven:cached", url: storageState.hq_wallpaper_cached, category: "gaming" };
Wallpaper.fetchRandom = async () => { throw new Error("simulated provider outage"); };
await Wallpaper.apply(true, true);
assert.equal(wallpaperImage.src, "https://w.example/cached.jpg", "Forced refresh did not retain the cached wallpaper");
assert(source.includes('atleast: "3840x1440"'), "Wallhaven search must admit 4K and 5K ultrawide candidates");
assert(source.includes("fetchWallhavenResilient") && source.includes("CATEGORY_RESCUE_QUERY"), "Wallpaper search lacks a staged empty-pool recovery path");
assert(source.includes("FETCH_TIMEOUT_MS = 12000") && source.includes("Wallpaper provider timed out"), "Wallpaper timeout recovery is missing or opaque");
assert(source.includes("adaptPaletteFromBitmap"), "Wallpaper-aware adaptive palette is missing");
pass("4K wallpaper render, adaptive palette, exclusions, fallback, blocklist filtering, and persistence");

const classifierContext = vm.createContext({ URL, Set });
vm.runInContext(read("js/classifier.js"), classifierContext, { filename: "classifier.js" });
const Classifier = vm.runInContext("Classifier", classifierContext);
const aiVideo = Classifier.classify({ title: "Build an AI agent with a large language model", url: "https://youtube.com/watch?v=test" }, {}, []);
assert.deepEqual(Array.from(aiVideo.path), ["Coding & Dev", "AI Tools"]);
const unknownVideo = Classifier.classify({ title: "Watch this", url: "https://youtube.com/watch?v=other" }, {}, []);
assert.equal(unknownVideo.source, "needs-content", "Ambiguous YouTube content must not be forced into Entertainment");
assert.equal(unknownVideo.path[1], "Review Queue", "Low-confidence bookmarks need one deterministic review destination");
const mixedPlatform = Classifier.classify({ title: "Calculus tutorial for exam revision", url: "https://youtube.com/watch?v=math" }, {}, []);
assert.equal(mixedPlatform.path[0], "School & Academics", "Topic must beat platform for variable-content sites");
assert(read("js/bookmarks.js").includes("Same-site clustering is intentionally retired"), "Platform-only bookmark folders are still enabled");
assert(read("js/workspaces.js").includes("saved-only tab") && read("js/workspaces.js").includes("restoreGroups"), "Workspace sync must preserve saved-only tabs and tab groups");
pass("Topic-first bookmarks, single Review Queue, and loss-resistant workspace cross-references");

const allProjectJs = jsFiles.map(file => read(path.join("js", file))).join("\n");
assert(allProjectJs.includes("escapeAttribute(pick.url)"), "Bookmark href escaping regressed");
assert(read("js/gmail.js").includes("status.textContent = message"), "Gmail status must render API/auth errors as text");
assert(allProjectJs.includes("row.textContent = String(msg)"), "Bookmark log must render data as text");
assert(!/DOMContentLoaded[\s\S]{0,2000}Notification\.requestPermission/.test(read("js/newtab.js")), "Notifications must not be requested on page load");
assert(read("js/background.js").includes("configureWallpaperAlarm"), "Wallpaper alarm must react to setting changes");
assert(read("js/background.js").includes("function safely("), "Background event handlers need rejection boundaries");
assert(!read("js/background.js").includes("addListener(async"), "Chrome event listeners must not leak async rejections");
assert(read("js/wallpaper.js").includes("const immediate = sameCategoryCached || safeOfflineCopy"), "Forced refresh must keep a visible fallback");
for (const file of ["gmail.js", "calendar.js", "weather.js", "spotify-client.js"]) {
  assert(read(`js/${file}`).includes("AbortController"), `${file} network calls need a timeout boundary`);
}
assert(read("js/early-diagnostics.js").includes('"credential=[redacted]"'), "Diagnostic credentials must be redacted");
pass("Rendering safety, contextual permissions, async boundaries, and network timeouts");

console.log("\nOperation HQ verification completed successfully.");
