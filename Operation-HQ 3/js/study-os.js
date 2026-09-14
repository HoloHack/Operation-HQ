// study-os.js — Roadmap 1.9: a local study command layer.
//
// This module connects existing assignment, exam, task, focus and SRS stores.
// Research cards contain only metadata and notes the person explicitly saves;
// no page is scraped and no citation is represented as academically verified.

const StudyOS = {
  SOURCE_KEY: "hq_research_sources_v1",
  SOURCE_UNDO_KEY: "hq_research_source_undo_v1",
  PREFS_KEY: "hq_study_preferences_v1",
  stages: ["inbox", "skim", "read", "extract", "apply", "archive"],
  sources: [],
  prefs: { missionMinutes: 25 },
  lastCapture: null,
  initialized: false,
  nextAction: null,
  renderTimer: null,

  safeHttpUrl(raw) {
    try {
      const url = new URL(String(raw || "").trim());
      if (!["http:", "https:"].includes(url.protocol)) return null;
      url.username = "";
      url.password = "";
      return url.href;
    } catch { return null; }
  },

  dayDistance(dateKey) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return null;
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const date = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return Math.ceil((date - today) / 86400000);
  },

  stageLabel(stage) {
    return ({ inbox: "Inbox", skim: "Skim", read: "Read", extract: "Extract", apply: "Apply", archive: "Archive" })[stage] || "Inbox";
  },

  nextStage(stage) {
    const index = this.stages.indexOf(stage);
    return this.stages[Math.min(this.stages.length - 1, Math.max(0, index) + 1)];
  },

  citationFor(source) {
    const author = String(source.author || "").trim() || "Author unknown";
    const year = /^\d{4}-/.test(source.publishedDate || "") ? source.publishedDate.slice(0, 4) : "n.d.";
    let site = "Website";
    try { site = new URL(source.url).hostname.replace(/^www\./, ""); } catch {}
    return `${author}. (${year}). ${String(source.title || "Untitled source").trim()}. ${site}. ${source.url}`;
  },

  status(message, target = "study-overview-status") {
    const element = document.getElementById(target);
    if (element) element.textContent = message;
  },

  normalizeSource(value) {
    if (!value || typeof value !== "object") return null;
    const url = this.safeHttpUrl(value.url);
    const title = String(value.title || "").trim().slice(0, 180);
    if (!value.id || !url || !title) return null;
    return {
      id: String(value.id), title, url,
      author: String(value.author || "").trim().slice(0, 120),
      publishedDate: /^\d{4}-\d{2}-\d{2}$/.test(value.publishedDate || "") ? value.publishedDate : "",
      subject: String(value.subject || "").trim().slice(0, 48),
      kind: ["unknown", "primary", "secondary", "dataset", "official"].includes(value.kind) ? value.kind : "unknown",
      stage: this.stages.includes(value.stage) ? value.stage : "inbox",
      assignmentId: String(value.assignmentId || ""),
      notes: String(value.notes || "").trim().slice(0, 2400),
      createdAt: Number(value.createdAt) || Date.now(),
      updatedAt: Number(value.updatedAt) || Number(value.createdAt) || Date.now(),
    };
  },

  async load() {
    const saved = await chrome.storage.local.get([this.SOURCE_KEY, this.PREFS_KEY, this.SOURCE_UNDO_KEY, "hq_study_last_capture_v1"]);
    this.sources = (Array.isArray(saved[this.SOURCE_KEY]) ? saved[this.SOURCE_KEY] : []).map(value => this.normalizeSource(value)).filter(Boolean).slice(0, 500);
    const prefs = saved[this.PREFS_KEY];
    this.prefs = {
      missionMinutes: Math.max(5, Math.min(120, Number(prefs?.missionMinutes) || 25)),
    };
    this.lastCapture = saved.hq_study_last_capture_v1 || null;
    document.getElementById("study-source-undo-delete")?.classList.toggle("hidden", !saved[this.SOURCE_UNDO_KEY]);
  },

  async saveSources() {
    await chrome.storage.local.set({ [this.SOURCE_KEY]: this.sources.slice(0, 500) });
    await this.renderSources();
    await this.renderOverview();
  },

  showView(name, focus = false) {
    if (!["overview", "assignments", "research", "revision"].includes(name)) name = "overview";
    document.querySelectorAll("#study-tabs [data-study-view]").forEach(button => {
      const active = button.dataset.studyView === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    document.querySelectorAll("#assignments-flyout .study-view").forEach(view => {
      const active = view.id === `study-view-${name}`;
      view.classList.toggle("hidden", !active);
      view.hidden = !active;
    });
    if (name === "overview") this.renderOverview();
    if (name === "research") { this.updateAssignmentOptions(); this.renderSources(); }
    if (name === "revision") this.renderRevision();
  },

  bindTabs() {
    const tabs = [...document.querySelectorAll("#study-tabs [data-study-view]")];
    tabs.forEach((button, index) => {
      button.onclick = () => this.showView(button.dataset.studyView);
      button.onkeydown = event => {
        const direction = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 })[event.key];
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
        this.showView(tabs[next].dataset.studyView, true);
      };
    });
  },

  assignmentProgress(item, tasks) {
    const steps = Array.isArray(item.steps) ? item.steps : [];
    if (!steps.length) return { done: item.done ? 1 : 0, total: 1, percent: item.done ? 100 : 0 };
    const done = steps.filter((step, index) => {
      const ids = [
        `${item.id}:${step.id || index}`,
        item.intakeId ? `${item.intakeId}:${step.id || index}` : null,
      ].filter(Boolean);
      return tasks.some(task => task.done && ids.includes(task.sourceId));
    }).length;
    return { done, total: steps.length, percent: Math.round(done / steps.length * 100) };
  },

  chooseNext(assignments, tasks) {
    const linkedTasks = tasks.filter(task => !task.done && ["assignment", "assignment-step", "assessment-step", "study-step"].includes(task.source));
    if (linkedTasks.length) {
      linkedTasks.sort((a, b) => (Number(a.dueAt) || Infinity) - (Number(b.dueAt) || Infinity) || ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 2) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 2));
      const task = linkedTasks[0];
      const assignment = assignments.find(item => item.id === task.sourceId || task.sourceId?.startsWith(`${item.id}:`) || (item.intakeId && task.sourceId?.startsWith(`${item.intakeId}:`))) || null;
      return { kind: "task", task, assignment, title: task.text, subject: assignment?.subject || task.venture || "Study", minutes: Number(task.estMinutes) || 25, reason: "This is the nearest open study action already in Tasks." };
    }
    const open = assignments.filter(item => !item.done && item.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const assignment = open[0];
    if (!assignment) return null;
    const steps = Array.isArray(assignment.steps) ? assignment.steps : [];
    const step = steps.find((candidate, index) => {
      const ids = [`${assignment.id}:${candidate.id || index}`, assignment.intakeId ? `${assignment.intakeId}:${candidate.id || index}` : null].filter(Boolean);
      return !tasks.some(task => task.done && ids.includes(task.sourceId));
    });
    const days = this.dayDistance(assignment.dueDate);
    return {
      kind: "assignment", assignment, step,
      title: step?.label || `Make progress on ${assignment.title}`,
      subject: assignment.subject || "Study",
      minutes: Math.max(15, Math.min(120, Number(step?.minutes) || Math.min(50, Number(assignment.estimatedMinutes) || 25))),
      reason: `${assignment.title} is the nearest unfinished deadline${days == null ? "" : days < 0 ? ` and is ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : days === 0 ? " and is due today" : ` in ${days} day${days === 1 ? "" : "s"}`}.`,
    };
  },

  deadlineRows(assignments, exams) {
    const rows = [
      ...assignments.filter(item => !item.done && item.dueDate).map(item => ({ title: item.title, subject: item.subject, date: item.dueDate, kind: "Assignment" })),
      ...exams.filter(item => item.examDate).map(item => ({ title: `${item.subject} exam`, subject: item.subject, date: item.examDate, kind: "Exam" })),
    ].filter(item => this.dayDistance(item.date) != null).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    return rows;
  },

  async renderOverview() {
    const metrics = document.getElementById("study-command-metrics");
    if (!metrics) return;
    const saved = await chrome.storage.local.get(["hq_assignments_v1", "hq_exam_countdowns", "hq_tasks", "hq_srs_cards"]);
    const assignments = Array.isArray(saved.hq_assignments_v1) ? saved.hq_assignments_v1 : [];
    const exams = Array.isArray(saved.hq_exam_countdowns) ? saved.hq_exam_countdowns : [];
    const tasks = Array.isArray(saved.hq_tasks) ? saved.hq_tasks : [];
    const cards = Array.isArray(saved.hq_srs_cards) ? saved.hq_srs_cards : [];
    const openAssignments = assignments.filter(item => !item.done);
    const dueCards = cards.filter(card => !card.suspended && Number(card.dueDate) <= Date.now()).length;
    const activeSources = this.sources.filter(source => source.stage !== "archive");
    const highRisk = openAssignments.filter(item => {
      const days = this.dayDistance(item.dueDate);
      return days != null && (days <= 2 || (item.priority === "high" && days <= 5));
    }).length;
    metrics.innerHTML = `
      <div><strong>${openAssignments.length}</strong><span>open assignments</span></div>
      <div data-state="${highRisk ? "attention" : "steady"}"><strong>${highRisk}</strong><span>need attention</span></div>
      <div><strong>${dueCards}</strong><span>cards due</span></div>
      <div><strong>${activeSources.length}</strong><span>active sources</span></div>`;

    this.nextAction = this.chooseNext(assignments, tasks);
    const prepare = document.getElementById("study-mission-prepare");
    prepare.disabled = !this.nextAction;
    document.getElementById("study-next-title").textContent = this.nextAction?.title || "No study commitment is ready";
    document.getElementById("study-next-reason").textContent = this.nextAction?.reason || "Add an assignment, exam or due flashcard. HQ will use only real stored data.";
    document.getElementById("study-next-subject").textContent = this.nextAction?.subject || "No subject";
    document.getElementById("study-next-duration").textContent = this.nextAction ? `${this.nextAction.minutes} min estimate` : "—";

    const deadlineList = document.getElementById("study-deadline-list");
    const deadlines = this.deadlineRows(assignments, exams);
    deadlineList.innerHTML = deadlines.length ? deadlines.map(item => {
      const days = this.dayDistance(item.date);
      const timing = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : days === 1 ? "Tomorrow" : `${days} days`;
      return `<button type="button" data-study-deadline="${escapeAttribute(item.kind === "Exam" ? "revision" : "assignments")}"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subject || item.kind)}</small></span><b data-state="${days <= 2 ? "attention" : "steady"}">${escapeHtml(timing)}</b></button>`;
    }).join("") : '<p class="empty-state">No dated study commitments yet.</p>';
    deadlineList.querySelectorAll("[data-study-deadline]").forEach(button => button.onclick = () => this.showView(button.dataset.studyDeadline));
  },

  prepareMission() {
    if (!this.nextAction) return;
    const preview = document.getElementById("study-mission-preview");
    document.getElementById("study-mission-title").textContent = this.nextAction.title;
    const taskEffect = this.nextAction.task ? "Use the existing linked task" : "Create one linked task for this step";
    const timerEffect = Pomodoro?.running ? "replace the currently running timer after this confirmation" : "start a 25-minute focus timer";
    document.getElementById("study-mission-consequence").textContent = `${taskEffect}, set it as the current focus, and ${timerEffect}. Deep Work will not be changed.`;
    preview.classList.remove("hidden");
    document.getElementById("study-mission-confirm").focus();
  },

  async ensureMissionTask(action) {
    if (action.task) return action.task;
    const item = action.assignment;
    if (!item) return null;
    const stepIndex = Math.max(0, (item.steps || []).indexOf(action.step));
    const stepId = action.step?.id || stepIndex;
    const sourceId = item.intakeId ? `${item.intakeId}:${stepId}` : `${item.id}:${stepId}`;
    const existing = Tasks.data.find(task => !task.done && task.sourceId === sourceId);
    if (existing) return existing;
    Tasks.add(`${item.subject}: ${action.title}`, null, action.minutes, {
      priority: item.priority || "medium",
      dueAt: item.dueDate ? new Date(`${item.dueDate}T17:00:00`).getTime() : null,
      priorityReason: "study deadline",
      source: "study-step",
      sourceId,
      deferSave: true,
    });
    await Tasks.save();
    return Tasks.data.find(task => !task.done && task.sourceId === sourceId) || null;
  },

  async confirmMission() {
    const action = this.nextAction;
    if (!action) return;
    const button = document.getElementById("study-mission-confirm");
    button.disabled = true;
    try {
      const task = await this.ensureMissionTask(action);
      if (!task) throw new Error("No actionable task could be prepared");
      await chrome.storage.local.set({ hq_current_focus_task: { id: task.id, text: task.text, venture: task.venture || action.subject, startedAt: Date.now() } });
      await ContextBus?.patch?.({ activeTaskId: task.id, activeTaskText: task.text, activeVenture: task.venture || action.subject });
      const select = document.getElementById("pomo-mode");
      if (select) select.value = "25";
      Pomodoro.reset();
      await Pomodoro.toggle();
      document.getElementById("study-mission-preview").classList.add("hidden");
      this.status(`Mission started: ${task.text}`);
      document.querySelector('.dock-btn[data-panel="pomodoro-flyout"]')?.click();
    } catch (error) {
      this.status(`Mission stopped safely: ${error.message}`);
    } finally { button.disabled = false; }
  },

  updateAssignmentOptions() {
    const select = document.getElementById("study-source-assignment");
    if (!select) return;
    const current = select.value;
    const items = Array.isArray(Assignments?.items) ? Assignments.items : [];
    select.innerHTML = '<option value="">No linked assignment</option>' + items.filter(item => !item.done).map(item => `<option value="${escapeAttribute(item.id)}">${escapeHtml(`${item.subject}: ${item.title}`)}</option>`).join("");
    if ([...select.options].some(option => option.value === current)) select.value = current;
  },

  formValue(id) { return document.getElementById(id)?.value?.trim?.() || ""; },

  async addSource() {
    const title = this.formValue("study-source-title");
    const url = this.safeHttpUrl(this.formValue("study-source-url"));
    if (!title || !url) return this.status("Add a title and a valid http/https URL.", "study-source-status");
    if (this.sources.some(source => source.url === url)) return this.status("That exact URL is already in the research pipeline.", "study-source-status");
    const source = this.normalizeSource({
      id: crypto.randomUUID(), title, url,
      author: this.formValue("study-source-author"),
      publishedDate: this.formValue("study-source-date"),
      subject: this.formValue("study-source-subject"),
      kind: document.getElementById("study-source-kind").value,
      stage: document.getElementById("study-source-stage").value,
      assignmentId: document.getElementById("study-source-assignment").value,
      notes: this.formValue("study-source-notes"),
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    if (!source) return this.status("That source could not be saved. Check its title and URL.", "study-source-status");
    this.sources.unshift(source);
    await this.saveSources();
    document.getElementById("study-source-form").reset();
    this.updateAssignmentOptions();
    this.status("Source saved locally. Its type and citation still need your verification.", "study-source-status");
  },

  async useCurrentTab() {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tab = tabs.filter(item => this.safeHttpUrl(item.url)).sort((a, b) => Number(b.lastAccessed || 0) - Number(a.lastAccessed || 0))[0];
    const safe = this.safeHttpUrl(tab?.url);
    if (!safe) return this.status("No recent http/https page is available in this window. Paste the source URL instead.", "study-source-status");
    document.getElementById("study-source-title").value = String(tab.title || new URL(safe).hostname).slice(0, 180);
    document.getElementById("study-source-url").value = safe;
    document.getElementById("study-source-title").focus();
    this.status("Previous web-page details filled in. Add author, source type and notes before saving.", "study-source-status");
  },

  filteredSources() {
    const query = this.formValue("study-source-search").toLowerCase();
    const stage = document.getElementById("study-source-filter")?.value || "all";
    return this.sources.filter(source => {
      if (stage !== "all" && source.stage !== stage) return false;
      if (!query) return true;
      return [source.title, source.author, source.subject, source.notes, source.url].join(" ").toLowerCase().includes(query);
    });
  },

  assignmentName(id) {
    const item = Assignments?.items?.find(value => value.id === id);
    return item ? `${item.subject}: ${item.title}` : "";
  },

  async renderSources() {
    const list = document.getElementById("study-source-list");
    if (!list) return;
    const active = this.sources.filter(source => source.stage !== "archive").length;
    const apply = this.sources.filter(source => source.stage === "apply").length;
    const unverified = this.sources.filter(source => source.kind === "unknown").length;
    document.getElementById("study-source-summary").innerHTML = `<div><strong>${this.sources.length}</strong><span>saved</span></div><div><strong>${active}</strong><span>active</span></div><div><strong>${apply}</strong><span>ready to apply</span></div><div><strong>${unverified}</strong><span>type unchecked</span></div>`;
    const filtered = this.filteredSources();
    list.innerHTML = filtered.length ? filtered.map(source => {
      const host = new URL(source.url).hostname.replace(/^www\./, "");
      const linked = this.assignmentName(source.assignmentId);
      const options = this.stages.map(stage => `<option value="${stage}"${stage === source.stage ? " selected" : ""}>${this.stageLabel(stage)}</option>`).join("");
      return `<article class="study-source-card" data-source-id="${escapeAttribute(source.id)}" data-stage="${escapeAttribute(source.stage)}">
        <div class="study-source-signal"><span>${escapeHtml(source.subject || host)}</span><b>${escapeHtml(source.kind === "unknown" ? "Type unchecked" : source.kind)}</b></div>
        <div class="study-source-main"><h4>${escapeHtml(source.title)}</h4><p>${escapeHtml(source.author || "Author not recorded")} · ${escapeHtml(source.publishedDate || "Date not recorded")} · ${escapeHtml(host)}</p>${linked ? `<small>Linked to ${escapeHtml(linked)}</small>` : ""}</div>
        <label class="study-source-stage">Pipeline stage<select data-source-stage aria-label="Pipeline stage for ${escapeAttribute(source.title)}">${options}</select></label>
        <details><summary>Notes and reference</summary><textarea data-source-notes rows="4" maxlength="2400" aria-label="Notes for ${escapeAttribute(source.title)}">${escapeHtml(source.notes)}</textarea><p class="study-citation-preview">${escapeHtml(this.citationFor(source))}</p><button type="button" data-source-action="save-notes">Save notes</button></details>
        <div class="study-source-actions"><button type="button" data-source-action="open">Open original</button><button type="button" class="secondary-btn" data-source-action="cite">Copy reference</button><button type="button" class="secondary-btn" data-source-action="advance"${source.stage === "archive" ? " disabled" : ""}>Move forward</button><button type="button" class="secondary-btn" data-source-action="delete">Delete</button></div>
      </article>`;
    }).join("") : '<p class="empty-state">No source matches this view. Save real source metadata above; HQ will not generate fake references.</p>';
  },

  async changeSourceStage(select) {
    const card = select.closest("[data-source-id]");
    const source = this.sources.find(item => item.id === card?.dataset.sourceId);
    if (!source || !this.stages.includes(select.value)) return;
    source.stage = select.value; source.updatedAt = Date.now();
    await this.saveSources();
    this.status(`Moved “${source.title}” to ${this.stageLabel(source.stage)}.`, "study-source-status");
  },

  async sourceAction(button) {
    const card = button.closest("[data-source-id]");
    const source = this.sources.find(item => item.id === card?.dataset.sourceId);
    if (!source) return;
    const action = button.dataset.sourceAction;
    if (action === "open") await chrome.tabs.create({ url: source.url });
    if (action === "cite") {
      try { await navigator.clipboard.writeText(this.citationFor(source)); this.status("Reference copied. Verify the required citation style before submitting.", "study-source-status"); }
      catch { this.status("Clipboard access failed. Expand Notes and reference to copy it manually.", "study-source-status"); }
    }
    if (action === "advance") {
      source.stage = this.nextStage(source.stage); source.updatedAt = Date.now();
      await this.saveSources();
      this.status(`Moved “${source.title}” to ${this.stageLabel(source.stage)}.`, "study-source-status");
    }
    if (action === "save-notes") {
      source.notes = String(card.querySelector("[data-source-notes]")?.value || "").trim().slice(0, 2400);
      source.updatedAt = Date.now();
      await this.saveSources();
      this.status("Source notes saved locally.", "study-source-status");
    }
    if (action === "delete" && confirm(`Delete “${source.title}” from the research pipeline?`)) {
      await chrome.storage.local.set({ [this.SOURCE_UNDO_KEY]: source });
      this.sources = this.sources.filter(item => item.id !== source.id);
      await this.saveSources();
      document.getElementById("study-source-undo-delete").classList.remove("hidden");
      this.status("Source deleted. Assignments and tasks were not changed.", "study-source-status");
    }
  },

  async undoSourceDelete() {
    const saved = await chrome.storage.local.get(this.SOURCE_UNDO_KEY);
    const source = this.normalizeSource(saved[this.SOURCE_UNDO_KEY]);
    if (!source) return;
    if (!this.sources.some(item => item.id === source.id)) this.sources.unshift(source);
    await chrome.storage.local.remove(this.SOURCE_UNDO_KEY);
    document.getElementById("study-source-undo-delete").classList.add("hidden");
    await this.saveSources();
    this.status(`Restored “${source.title}”.`, "study-source-status");
  },

  exportSources() {
    if (!this.sources.length) return this.status("There are no saved sources to export.", "study-source-status");
    const body = [
      "Operation HQ — Reference Draft",
      "Generated from metadata you entered. Verify every detail and your required citation style.",
      "",
      ...this.sources.map((source, index) => `${index + 1}. ${this.citationFor(source)}${source.notes ? `\n   Notes: ${source.notes.replace(/\s+/g, " ")}` : ""}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `operation-hq-references-${hqLocalDateKey()}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.status("Reference draft exported. It remains your job to verify the required style.", "study-source-status");
  },

  async renderRevision() {
    const summary = document.getElementById("study-revision-summary");
    if (!summary) return;
    const saved = await chrome.storage.local.get(["hq_srs_cards", "hq_exam_countdowns"]);
    const cards = Array.isArray(saved.hq_srs_cards) ? saved.hq_srs_cards : [];
    const exams = Array.isArray(saved.hq_exam_countdowns) ? saved.hq_exam_countdowns : [];
    const due = cards.filter(card => !card.suspended && Number(card.dueDate) <= Date.now()).length;
    const mature = cards.filter(card => Number(card.intervalDays) >= 21).length;
    summary.innerHTML = `<article><strong>${due}</strong><span>cards due now</span></article><article><strong>${cards.length}</strong><span>total cards</span></article><article><strong>${mature}</strong><span>mature cards</span></article><article><strong>${exams.filter(exam => this.dayDistance(exam.examDate) > 0).length}</strong><span>upcoming exams</span></article>`;
    let targets = [];
    try { targets = await ExamCountdown.todaysTargets(); } catch {}
    document.getElementById("study-exam-targets").innerHTML = targets.length ? `<h4>Today’s reverse-plan targets</h4>${targets.map(target => `<div><span><strong>${escapeHtml(target.subject)}</strong><small>${target.daysRemaining} day${target.daysRemaining === 1 ? "" : "s"} remaining</small></span><b>${Number(target.minutes)} min</b></div>`).join("")}` : '<p class="empty-state">No active exam target. Add one in the exam planner when you know the date and target hours.</p>';
  },

  openPanel(id) {
    const button = document.querySelector(`.dock-btn[data-panel="${id}"]`);
    if (button) button.click();
  },

  scheduleRender() {
    clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(() => {
      this.renderOverview().catch(error => console.warn("Study overview refresh skipped:", error));
      this.renderRevision().catch(error => console.warn("Study revision refresh skipped:", error));
    }, 80);
  },

  async init() {
    if (this.initialized) { await this.load(); await this.renderOverview(); await this.renderSources(); await this.renderRevision(); return; }
    await this.load();
    this.bindTabs();
    document.getElementById("study-mission-prepare").onclick = () => this.prepareMission();
    document.getElementById("study-mission-cancel").onclick = () => document.getElementById("study-mission-preview").classList.add("hidden");
    document.getElementById("study-mission-confirm").onclick = () => this.confirmMission();
    document.getElementById("study-source-form").onsubmit = event => { event.preventDefault(); this.addSource().catch(error => this.status(`Source save failed safely: ${error.message}`, "study-source-status")); };
    document.getElementById("study-source-current-tab").onclick = () => this.useCurrentTab().catch(error => this.status(`Current tab could not be read: ${error.message}`, "study-source-status"));
    document.getElementById("study-source-search").oninput = () => this.renderSources();
    document.getElementById("study-source-filter").onchange = () => this.renderSources();
    document.getElementById("study-source-export").onclick = () => this.exportSources();
    document.getElementById("study-source-undo-delete").onclick = () => this.undoSourceDelete().catch(error => this.status(`Restore failed: ${error.message}`, "study-source-status"));
    document.getElementById("study-source-list").onclick = event => {
      const button = event.target.closest("[data-source-action]");
      if (button) this.sourceAction(button).catch(error => this.status(`Source action stopped safely: ${error.message}`, "study-source-status"));
    };
    document.getElementById("study-source-list").onchange = event => {
      const select = event.target.closest("[data-source-stage]");
      if (select) this.changeSourceStage(select).catch(error => this.status(`Stage update failed: ${error.message}`, "study-source-status"));
    };
    document.getElementById("study-open-srs").onclick = () => this.openPanel("srs-flyout");
    document.getElementById("study-open-exams").onclick = () => this.openPanel("exam-countdown-flyout");
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[this.SOURCE_KEY]) {
        this.sources = (Array.isArray(changes[this.SOURCE_KEY].newValue) ? changes[this.SOURCE_KEY].newValue : []).map(value => this.normalizeSource(value)).filter(Boolean).slice(0, 500);
        this.renderSources();
      }
      if (["hq_assignments_v1", "hq_exam_countdowns", "hq_tasks", "hq_srs_cards"].some(key => changes[key])) this.scheduleRender();
    });
    this.initialized = true;
    this.updateAssignmentOptions();
    await this.renderOverview();
    await this.renderSources();
    await this.renderRevision();
    if (this.lastCapture?.at && Date.now() - this.lastCapture.at < 86400000) this.status(`${this.lastCapture.merged ? "Updated" : "Captured"} “${String(this.lastCapture.title || "source").slice(0, 100)}” from the browser menu.`, "study-source-status");
  },
};
