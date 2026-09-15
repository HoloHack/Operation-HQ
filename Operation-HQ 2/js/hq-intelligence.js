// hq-intelligence.js — explicit, provenance-labelled context assembly for the
// optional on-device AI. Nothing is read until the user presses the context
// button, nothing leaves the browser, and no action is applied automatically.

const HQIntelligence = {
  MAX_CONTEXT: 8800,
  sourceLabels: {
    tasks: "Tasks",
    calendar: "Calendar",
    assignments: "Assignments",
    today: "Today",
    capture: "Capture inbox",
    notes: "Notes",
    gmail: "Gmail metadata",
  },

  text(value, max = 220) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  },

  dateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },

  header(message, name) {
    return (message?.payload?.headers || []).find(item => item?.name?.toLowerCase() === name)?.value?.trim() || "";
  },

  addSection(sections, id, lines) {
    const clean = lines.map(line => this.text(line, 520)).filter(Boolean);
    if (clean.length) sections.push(`## ${this.sourceLabels[id]}\n${clean.join("\n")}`);
    return clean.length;
  },

  taskLines(tasks = []) {
    const open = tasks.filter(item => item && !item.done);
    return open
      .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 3) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 3) || Number(a.dueAt || Infinity) - Number(b.dueAt || Infinity))
      .slice(0, 30)
      .map(item => {
        const due = Number(item.dueAt) ? new Date(Number(item.dueAt)).toISOString().slice(0, 10) : "no date";
        return `- [tasks:${this.text(item.id, 60)}] ${this.text(item.text)} | ${item.priority || "unrated"} | due ${due}${item.venture ? ` | ${this.text(item.venture, 70)}` : ""}`;
      });
  },

  calendarLines(events = {}, details = {}) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + 21);
    return Object.keys(events || {})
      .filter(key => key >= this.dateKey(today) && key <= this.dateKey(end))
      .sort()
      .flatMap(key => (Array.isArray(events[key]) ? events[key] : []).slice(0, 12).map((value, index) => {
        const detail = details?.[key]?.[index];
        const id = detail?.id || `${key}-${index}`;
        return `- [calendar:${this.text(id, 70)}] ${key} | ${this.text(value)}${detail?.description ? ` | ${this.text(detail.description, 150)}` : ""}`;
      }))
      .slice(0, 45);
  },

  assignmentLines(items = []) {
    return items.filter(item => item && !item.done).sort((a, b) => String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"))).slice(0, 24).map(item => {
      const steps = Array.isArray(item.steps) ? item.steps.map(step => this.text(step.label || step, 100)).filter(Boolean).slice(0, 4).join(" → ") : "";
      return `- [assignments:${this.text(item.id, 60)}] ${this.text(item.title)} | ${this.text(item.subject || "Unassigned", 60)} | due ${item.dueDate || "unknown"} | ${item.priority || "unrated"}${steps ? ` | steps: ${steps}` : ""}`;
    });
  },

  todayLines(state) {
    const lines = [];
    (Array.isArray(state.hq_daily_plan_tasks) ? state.hq_daily_plan_tasks : []).filter(item => !item.done).slice(0, 20).forEach((item, index) => {
      lines.push(`- [today:plan-${index + 1}] ${this.text(item.text || item.task || item.title || item)}`);
    });
    (Array.isArray(state.hq_followups) ? state.hq_followups : []).filter(item => !item.done).slice(0, 15).forEach(item => {
      lines.push(`- [today:followup-${this.text(item.id, 60)}] Follow up: ${this.text(item.text || item.subject)}`);
    });
    (Array.isArray(state.hq_focus_interruptions) ? state.hq_focus_interruptions : []).slice(-10).forEach(item => {
      lines.push(`- [today:interruption-${this.text(item.id, 60)}] Parked: ${this.text(item.text)}`);
    });
    return lines;
  },

  captureLines(items = []) {
    return items.slice(0, 24).map(item => `- [capture:${this.text(item.id, 60)}] ${this.text(item.localSummary || item.text || item.url, 300)}${item.url ? ` | ${this.text(item.url, 180)}` : ""}`);
  },

  gmailLines(cache) {
    const messages = Array.isArray(cache?.messages) ? cache.messages : [];
    return messages.slice(0, 20).map(message => {
      const sender = this.header(message, "from").replace(/\s*<[^>]+>\s*$/, "") || "unknown sender";
      const subject = this.header(message, "subject") || "No subject";
      const unread = message.labelIds?.includes("UNREAD") ? "unread" : "read";
      return `- [gmail:${this.text(message.id || message.threadId, 80)}] ${unread} | ${this.text(sender, 100)} | ${this.text(subject, 220)}`;
    });
  },

  async collect(selected = []) {
    const wanted = new Set(selected.filter(id => this.sourceLabels[id]));
    const keys = [];
    if (wanted.has("tasks")) keys.push("hq_tasks");
    if (wanted.has("calendar")) keys.push("hq_calendar_events", "hq_calendar_details_v2");
    if (wanted.has("assignments")) keys.push("hq_assignments_v1");
    if (wanted.has("today")) keys.push("hq_daily_plan_tasks", "hq_followups", "hq_focus_interruptions");
    if (wanted.has("capture")) keys.push("hq_capture_inbox");
    if (wanted.has("notes")) keys.push("hq_notes_document_v2", "hq_notes");
    if (wanted.has("gmail")) keys.push("hq_gmail_cache_v1", "hq_gmail_connected");
    const state = await chrome.storage.local.get([...new Set(keys)]);
    const sections = [];
    const counts = {};
    if (wanted.has("tasks")) counts.tasks = this.addSection(sections, "tasks", this.taskLines(Array.isArray(state.hq_tasks) ? state.hq_tasks : []));
    if (wanted.has("calendar")) counts.calendar = this.addSection(sections, "calendar", this.calendarLines(state.hq_calendar_events || {}, state.hq_calendar_details_v2 || {}));
    if (wanted.has("assignments")) counts.assignments = this.addSection(sections, "assignments", this.assignmentLines(Array.isArray(state.hq_assignments_v1) ? state.hq_assignments_v1 : []));
    if (wanted.has("today")) counts.today = this.addSection(sections, "today", this.todayLines(state));
    if (wanted.has("capture")) counts.capture = this.addSection(sections, "capture", this.captureLines(Array.isArray(state.hq_capture_inbox) ? state.hq_capture_inbox : []));
    if (wanted.has("notes")) {
      const note = this.text(state.hq_notes_document_v2?.plain || state.hq_notes, 3600);
      counts.notes = this.addSection(sections, "notes", note ? [`- [notes:document] ${note}`] : []);
    }
    if (wanted.has("gmail")) counts.gmail = this.addSection(sections, "gmail", this.gmailLines(state.hq_gmail_cache_v1));
    const prefix = `# OPERATION HQ LOCAL CONTEXT\nGenerated ${new Date().toLocaleString()} from user-selected on-device sources. Evidence labels identify the source collection; missing data must not be invented.`;
    const full = `${prefix}\n\n${sections.join("\n\n")}`;
    const truncated = full.length > this.MAX_CONTEXT;
    return { text: full.slice(0, this.MAX_CONTEXT), counts, truncated, selected: [...wanted] };
  },

  async assembleInto(textarea) {
    const selected = [...document.querySelectorAll(".local-ai-source:checked")].map(input => input.value);
    if (!selected.length) throw new Error("Choose at least one local source first.");
    const snapshot = await this.collect(selected);
    const existing = textarea.value.trim();
    const request = existing ? `# YOUR REQUEST OR EXTRA CONTEXT\n${existing.slice(0, 1800)}\n\n` : "";
    textarea.value = `${request}${snapshot.text}`.slice(0, 9000);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const total = Object.values(snapshot.counts).reduce((sum, count) => sum + count, 0);
    const status = document.getElementById("local-ai-context-status");
    if (status) status.textContent = `Assembled ${total} evidence item${total === 1 ? "" : "s"} from ${snapshot.selected.length} selected source${snapshot.selected.length === 1 ? "" : "s"}${snapshot.truncated ? "; capped to fit the local model context" : ""}.`;
    return snapshot;
  },
};
