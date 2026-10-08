// tasks.js — Operation HQ task engine
// A fresh install starts empty; venture names must describe the person's real
// work rather than product-authored sample data.
const DEFAULT_VENTURES = [];
const TASK_PRIORITY_RULES = [
  { priority: "high", reason: "urgent wording", words: ["urgent", "asap", "immediately", "overdue", "final notice", "action required"] },
  { priority: "high", reason: "near deadline", words: ["due today", "due tomorrow", "deadline today", "deadline tomorrow"] },
  { priority: "medium", reason: "dated commitment", words: ["assessment", "exam", "submission", "interview", "client", "shift", "appointment", "competition"] },
  { priority: "medium", reason: "follow-up language", words: ["follow up", "reply to", "confirm", "send", "submit"] },
];

const Tasks = {
  data: [],
  ventures: [],

  inferTask(text) {
    const lower = String(text || "").toLowerCase();
    const match = TASK_PRIORITY_RULES.find(rule => rule.words.some(word => lower.includes(word)));
    const due = new Date();
    let dueAt = null;
    if (lower.includes("tomorrow")) { due.setDate(due.getDate() + 1); due.setHours(17, 0, 0, 0); dueAt = due.getTime(); }
    else if (lower.includes("today")) { due.setHours(17, 0, 0, 0); dueAt = due.getTime(); }
    return { priority: match?.priority || "low", priorityReason: match?.reason || "no deadline signal", dueAt };
  },

  taskRank(task) {
    const weight = { high: 300, medium: 180, low: 60 }[task.priority] || 60;
    const dueBoost = task.dueAt ? Math.max(0, 180 - Math.max(0, Number(task.dueAt) - Date.now()) / 3600000 * 5) : 0;
    return (task.done ? -10000 : 0) + weight + dueBoost + Math.min(50, (Date.now() - Number(task.created || Date.now())) / 86400000 * 4);
  },

  async init() {
    const stored = await chrome.storage.local.get(["hq_tasks", "hq_ventures"]);
    const needsPriorityMigration = (stored.hq_tasks || []).some(task => !task.priority);
    this.data = (stored.hq_tasks || []).map(task => {
      if (task.priority) return task;
      const inferred = this.inferTask(task.text);
      return { ...task, ...inferred };
    });
    if (needsPriorityMigration) await chrome.storage.local.set({ hq_tasks: this.data });
    this.ventures = Array.isArray(stored.hq_ventures) ? stored.hq_ventures : DEFAULT_VENTURES;
    this.renderVentureOptions();
    this.render();
    this.syncContext();
  },

  async save() {
    await chrome.storage.local.set({ hq_tasks: this.data });
    this.render();
    this.syncContext();
  },

  // Context Bus v0 — keeps the shared "what's true right now" snapshot
  // current whenever tasks change, without every caller needing to know
  // ContextBus exists. Safe no-op if context-bus.js wasn't loaded.
  syncContext() {
    if (typeof ContextBus === "undefined") return;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const doneToday = this.data.filter(t => t.done && t.completedAt && t.completedAt >= todayStart.getTime()).length;
    ContextBus.patch({
      tasksOpen: this.data.filter(t => !t.done).length,
      tasksDoneToday: doneToday,
    });
  },

  async saveVentures() {
    await chrome.storage.local.set({ hq_ventures: this.ventures });
    this.renderVentureOptions();
  },

  add(text, venture, estMinutes, options = {}) {
    const inferred = this.inferTask(text);
    const task = {
      id: crypto.randomUUID(),
      text,
      venture: venture || this.ventures[0],
      done: false,
      created: Date.now(),
      estMinutes: estMinutes || null,
      priority: ["high", "medium", "low"].includes(options.priority) ? options.priority : inferred.priority,
      priorityReason: options.priorityReason || inferred.priorityReason,
      dueAt: Number.isFinite(Number(options.dueAt)) ? Number(options.dueAt) : inferred.dueAt,
      source: options.source || null,
      sourceId: options.sourceId || null,
      trackUrl: null,       // hostname being tracked, set when "Start" is clicked
      activeSince: null,    // timestamp tracking started, null when not tracking
      trackedSeconds: 0,
      promptShown: false,   // whether the "looks done?" banner already fired for this stretch
      completedAt: null,    // timestamp, set when marked done — drives Context Bus's "done today" count
    };
    this.data.unshift(task);
    if (!options.deferSave) this.save();
    return task;
  },

  async toggle(id) {
    const t = this.data.find(t => t.id === id);
    if (t) {
      t.done = !t.done;
      if (t.done) {
        t.activeSince = null; t.trackUrl = null;
        t.completedAt = Date.now();
        if (typeof ActivityLog !== "undefined") ActivityLog.record("task");
        if (typeof Sound !== "undefined") Sound.taskComplete();
        if (typeof ContextBus !== "undefined") {
          ContextBus.recordCompletion({ text: t.text, venture: t.venture, type: "task" });
          if (ContextBus.get().activeTaskId === t.id) {
            ContextBus.patch({ activeTaskId: null, activeTaskText: null, activeVenture: null });
          }
        }
      } else {
        t.completedAt = null;
      }
      await this.save();
    }
  },

  remove(id) {
    this.data = this.data.filter(t => t.id !== id);
    if (typeof ContextBus !== "undefined" && ContextBus.get().activeTaskId === id) {
      ContextBus.patch({ activeTaskId: null, activeTaskText: null, activeVenture: null });
    }
    this.save();
  },

  // Starts/stops passive completion tracking for a task, using whichever
  // tab is currently active as the thing to watch. No page content is read
  // — just which tab is focused and for how long (see background.js).
  async toggleTracking(id) {
    const t = this.data.find(t => t.id === id);
    if (!t) return;
    if (t.activeSince) {
      t.activeSince = null;
      t.trackUrl = null;
      if (typeof ContextBus !== "undefined" && ContextBus.get().activeTaskId === t.id) {
        ContextBus.patch({ activeTaskId: null, activeTaskText: null, activeVenture: null });
      }
    } else {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      let hostname = null;
      try { hostname = tab?.url ? new URL(tab.url).hostname : null; } catch {}
      if (!hostname) { alert("Couldn't read the current tab's URL to track — try a different tab."); return; }
      t.trackUrl = hostname;
      t.activeSince = Date.now();
      t.trackedSeconds = 0;
      t.promptShown = false;
      if (typeof ContextBus !== "undefined") {
        ContextBus.patch({ activeTaskId: t.id, activeTaskText: t.text, activeVenture: t.venture });
      }
    }
    this.save();
  },

  addVenture(name) {
    if (name && !this.ventures.includes(name)) {
      this.ventures.push(name);
      this.saveVentures();
    }
  },

  removeVenture(name) {
    this.ventures = this.ventures.filter(v => v !== name);
    this.saveVentures();
  },

  renderVentureOptions() {
    const filter = document.getElementById("task-filter");
    const current = filter.value;
    filter.innerHTML = '<option value="all">All Ventures</option>' +
      this.ventures.map(v => `<option value="${escapeAttribute(v)}">${escapeHtml(v)}</option>`).join("");
    filter.value = current || "all";

    const composer = document.getElementById("task-compose-venture");
    if (composer) {
      const composerCurrent = composer.value;
      composer.innerHTML = '<option value="">No venture</option>' +
        this.ventures.map(venture => `<option value="${escapeAttribute(venture)}">${escapeHtml(venture)}</option>`).join("");
      composer.value = this.ventures.includes(composerCurrent) ? composerCurrent : "";
    }

    const list = document.getElementById("venture-list");
    if (list) {
      list.innerHTML = this.ventures.map(v =>
        `<span class="venture-chip">${escapeHtml(v)}<button data-venture="${escapeAttribute(v)}" aria-label="Remove ${escapeAttribute(v)}">${Icons.span("x")}</button></span>`
      ).join("");
      list.querySelectorAll("button").forEach(b => {
        b.onclick = () => this.removeVenture(b.dataset.venture);
      });
    }
  },

  render() {
    const filter = document.getElementById("task-filter")?.value || "all";
    const list = document.getElementById("task-list");
    let items = this.data.filter(t => filter === "all" || t.venture === filter).sort((a, b) => this.taskRank(b) - this.taskRank(a));
    if (typeof ProfessionalView !== "undefined" && ProfessionalView.isActive()) {
      items = items.filter(t => !ProfessionalView.isPersonal(t.venture));
    }

    list.innerHTML = items.map(t => {
      const tracking = !!t.activeSince;
      const pct = t.estMinutes ? Math.min(100, Math.round((t.trackedSeconds / (t.estMinutes * 60)) * 100)) : null;
      return `
      <li class="task-item priority-${escapeAttribute(t.priority || "low")} ${t.done ? "done" : ""}" data-id="${t.id}">
        <button class="task-check" aria-label="${t.done ? "Mark incomplete" : "Mark complete"}">${t.done ? Icons.span("check") : ""}</button>
        <div class="task-text">${escapeHtml(t.text)}</div>
        ${t.estMinutes ? `<button class="task-track ${tracking ? "tracking" : ""}" title="${tracking ? "Stop tracking" : "Start tracking (watches which tab you're on, not its content)"}">${tracking ? `⏸ ${pct}%` : "▶"}</button>` : ""}
        <div class="task-venture"><span class="task-priority-badge" title="${escapeAttribute(t.priorityReason || "Priority")}">${escapeHtml(t.priority || "low")}</span>${escapeHtml(t.venture || "Unassigned")}</div>
        <button class="task-del" aria-label="Delete task">${Icons.span("x")}</button>
      </li>
    `;
    }).join("") || '<li class="empty-state">No tasks here. Add one to get moving.</li>';

    list.querySelectorAll(".task-check").forEach(el => {
      el.onclick = () => this.toggle(el.closest(".task-item").dataset.id);
    });
    list.querySelectorAll(".task-del").forEach(el => {
      el.onclick = () => this.remove(el.closest(".task-item").dataset.id);
    });
    list.querySelectorAll(".task-track").forEach(el => {
      el.onclick = () => this.toggleTracking(el.closest(".task-item").dataset.id);
    });

    const total = this.data.length;
    const done = this.data.filter(t => t.done).length;
    const completionPercent = total ? Math.round((done / total) * 100) : 0;
    document.getElementById("task-progress-fill").style.width = `${completionPercent}%`;
    document.getElementById("task-progress-bar").setAttribute("aria-valuenow", String(completionPercent));
    document.getElementById("task-progress-label").textContent = `${done} / ${total} done`;
  }
};

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttribute(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}
