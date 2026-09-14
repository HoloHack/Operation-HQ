// today.js — one local view of what matters now, later, and is waiting.
const Today = {
  lastUndo: null,
  nextTask: null,

  dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },

  date(value) {
    return new Date(`${value}T12:00:00`);
  },

  scoreTask(task, activeTaskId, currentBlock, focusTaskId) {
    let score = 0;
    const reasons = [];
    if (task.id === activeTaskId) { score += 1000; reasons.push("already active"); }
    else if (task.id === focusTaskId) { score += 650; reasons.push("selected for focus"); }
    const priority = String(task.priority || "").toLowerCase();
    if (priority === "high") { score += 120; reasons.push("high priority"); }
    else if (priority === "medium") score += 45;
    if (task.dueAt) {
      const hours = (Number(task.dueAt) - Date.now()) / 3600000;
      if (hours <= 0) { score += 320; reasons.push("due now"); }
      else if (hours <= 24) { score += 220; reasons.push("due today"); }
      else if (hours <= 48) { score += 100; reasons.push("due tomorrow"); }
    }
    if (task.estMinutes && task.estMinutes <= 30) { score += 60; reasons.push(`${task.estMinutes} min estimate`); }
    else if (task.estMinutes && task.estMinutes <= 60) score += 28;
    const ageDays = Math.max(0, (Date.now() - Number(task.created || Date.now())) / 86400000);
    score += Math.min(55, ageDays * 4);
    if (ageDays >= 3) reasons.push(`open ${Math.floor(ageDays)} days`);
    const context = `${currentBlock?.t || ""} ${currentBlock?.d || ""}`.toLowerCase();
    if (task.venture && context.includes(String(task.venture).toLowerCase())) { score += 90; reasons.push("matches this schedule block"); }
    return { task, score, reasons };
  },

  chooseNextTask(currentBlock, focusTaskId = null) {
    const open = Tasks.data.filter(task => !task.done);
    const activeTaskId = ContextBus?.get()?.activeTaskId;
    return open.map(task => this.scoreTask(task, activeTaskId, currentBlock, focusTaskId)).sort((a, b) => b.score - a.score || Number(a.task.created || 0) - Number(b.task.created || 0))[0] || null;
  },

  item(text, meta = "") {
    return `<div class="today-item">${escapeHtml(text)}${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</div>`;
  },

  empty(text) {
    return `<p class="today-empty">${escapeHtml(text)}</p>`;
  },

  followupItem(item) {
    return `<div class="today-item" data-followup-id="${escapeAttribute(item.id)}"><span>${escapeHtml(item.subject || item.text || "Follow-up")}</span><small>${escapeHtml(item.from ? `Follow up · ${item.from}` : "Follow-up")}</small><div class="today-item-actions">${item.threadId ? '<button data-followup-action="open">Open Gmail</button>' : ""}<button data-followup-action="done">Done</button></div></div>`;
  },

  currentScheduleBlock() {
    if (!Schedule?.active) return null;
    const day = SCHEDULE_DAY_KEYS[new Date().getDay()];
    const blocks = Schedule.blocksFor(Schedule.active, day);
    const now = new Date();
    const minute = now.getHours() * 60 + now.getMinutes();
    const toMinute = value => { const [h, m] = value.split(":").map(Number); return h * 60 + m; };
    return blocks.find(block => minute >= toMinute(block.s) && minute < toMinute(block.e)) || null;
  },

  async render() {
    const nowEl = document.getElementById("today-now");
    if (!nowEl) return;
    document.getElementById("today-date-label").textContent = new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    const today = new Date();
    const todayKey = this.dateKey(today);
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const tomorrowKey = this.dateKey(tomorrow);
    const { hq_followups = [], hq_focus_interruptions = [], hq_current_focus_task = null, hq_assignments_v1 = [] } = await chrome.storage.local.get(["hq_followups", "hq_focus_interruptions", "hq_current_focus_task", "hq_assignments_v1"]);
    const openAssignments = (Array.isArray(hq_assignments_v1) ? hq_assignments_v1 : []).filter(item => !item.done && item.dueDate).sort((a,b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const block = this.currentScheduleBlock();
    const activeTask = Tasks.data.find(task => task.id === ContextBus?.get()?.activeTaskId && !task.done);
    const nowItems = [];
    if (block) nowItems.push(this.item(block.t, `${block.s}–${block.e}${block.d ? ` · ${block.d}` : ""}`));
    if (activeTask) nowItems.push(this.item(activeTask.text, "Active tracked task"));
    if (Pomodoro.running) nowItems.push(this.item(document.getElementById("pomodoro-display").textContent, "Focus timer running"));
    nowEl.innerHTML = nowItems.join("") || this.empty("Nothing is demanding attention right now. Choose one task deliberately.");

    const next = this.chooseNextTask(block, hq_current_focus_task?.id);
    this.nextTask = next?.task || null;
    const nextTitle = document.getElementById("today-next-title");
    const nextReason = document.getElementById("today-next-reason");
    const startNext = document.getElementById("today-start-next");
    const completeNext = document.getElementById("today-complete-next");
    nextTitle.textContent = next?.task.text || "No unfinished task";
    nextReason.textContent = next ? `${next.task.venture ? `${next.task.venture} · ` : ""}${next.reasons.length ? `Surfaced because it is ${next.reasons.join(", ")}.` : "Oldest clear open task."}` : "You are clear. Capture the next real commitment when it appears.";
    startNext.disabled = !next;
    completeNext.disabled = !next;

    const allIncompleteDaily = DailyTasks.activeTemplates().filter(template => !DailyTasks.isTemplateDone(template.id));
    const allOpenTasks = Tasks.data.filter(task => !task.done);
    const allEvents = Calendar.events[todayKey] || [];
    const incompleteDaily = allIncompleteDaily.slice(0, 4);
    const openTasks = allOpenTasks.slice(0, 5);
    const events = allEvents.slice(0, 3);
    const later = [
      ...events.map(event => this.item(event, "Calendar · today")),
      ...openAssignments.slice(0,3).map(item => this.item(item.title, `${item.subject} · due ${this.date(item.dueDate).toLocaleDateString([], {month:"short",day:"numeric"})}`)),
      ...openTasks.map(task => this.item(task.text, task.venture || "Task")),
      ...incompleteDaily.map(task => this.item(task.text, "Daily essential")),
    ];
    document.getElementById("today-later").innerHTML = later.join("") || this.empty("No open tasks or events yet.");

    const waiting = [
      ...hq_followups.filter(item => !item.done).slice(0, 5).map(item => this.followupItem(item)),
      ...hq_focus_interruptions.slice(-3).reverse().map(item => this.item(item.text, "Parked during focus")),
    ];
    document.getElementById("today-waiting").innerHTML = waiting.join("") || this.empty("No follow-ups or parked interruptions.");

    const tomorrowEvents = (Calendar.events[tomorrowKey] || []).map(event => this.item(event, "Calendar · tomorrow"));
    const tomorrowDay = SCHEDULE_DAY_KEYS[tomorrow.getDay()];
    const tomorrowBlocks = Schedule?.active ? Schedule.blocksFor(Schedule.active, tomorrowDay, tomorrow).slice(0, 5).map(item => this.item(item.t, `${item.s}–${item.e} · schedule`)) : [];
    const tomorrowAssignments = openAssignments.filter(item => item.dueDate === tomorrowKey).map(item => this.item(item.title, `${item.subject} · assignment due`));
    const tomorrowItems = [...tomorrowAssignments, ...tomorrowEvents, ...tomorrowBlocks].slice(0, 7);
    document.getElementById("today-tomorrow").innerHTML = tomorrowItems.join("") || this.empty("Nothing scheduled for tomorrow yet.");

    const incompleteCount = allIncompleteDaily.length;
    const openCount = allOpenTasks.length;
    const waitingCount = hq_followups.filter(item => !item.done).length + hq_focus_interruptions.length;
    document.getElementById("today-signal-open").textContent = String(openCount + openAssignments.length);
    document.getElementById("today-signal-remaining").textContent = String(openCount + openAssignments.length + incompleteCount + allEvents.length + waitingCount);
    document.getElementById("today-signal-tomorrow").textContent = String(tomorrowAssignments.length + tomorrowEvents.length + tomorrowBlocks.length);
  },

  async startNext() {
    if (!this.nextTask) return;
    await chrome.storage.local.set({ hq_current_focus_task: { id: this.nextTask.id, text: this.nextTask.text, venture: this.nextTask.venture || null, startedAt: Date.now() } });
    if (typeof FocusScenes !== "undefined") FocusScenes.record("Next action selected", this.nextTask.text);
    document.getElementById("pomo-mode").value = "25";
    Pomodoro.reset();
    if (!Pomodoro.running) await Pomodoro.toggle();
    document.querySelector('.dock-btn[data-panel="pomodoro-flyout"]')?.click();
  },

  async completeNext() {
    if (!this.nextTask) return;
    const before = structuredClone(Tasks.data);
    await Tasks.toggle(this.nextTask.id);
    await chrome.storage.local.remove("hq_current_focus_task");
    this.showUndo("Task completed.", async () => { Tasks.data = before; await Tasks.save(); await this.render(); });
    await this.render();
  },

  showUndo(label, action) {
    this.lastUndo = action;
    document.getElementById("today-undo-text").textContent = label;
    document.getElementById("today-undo").classList.remove("hidden");
  },

  async capture(text, destination) {
    if (destination === "task") {
      const before = structuredClone(Tasks.data);
      Tasks.add(text, undefined, null);
      this.showUndo("Added to Tasks.", async () => { Tasks.data = before; await Tasks.save(); });
    } else if (destination === "note") {
      const receipt = await NotesEditor.appendExternal(text, "today-capture");
      this.showUndo("Added to Notes.", () => NotesEditor.restoreSnapshot(receipt));
    } else if (destination === "followup") {
      const { hq_followups = [] } = await chrome.storage.local.get("hq_followups");
      const before = structuredClone(hq_followups);
      await chrome.storage.local.set({ hq_followups: [{ id: crypto.randomUUID(), text, subject: text, createdAt: Date.now(), done: false }, ...hq_followups].slice(0, 100) });
      this.showUndo("Added to Follow-ups.", () => chrome.storage.local.set({ hq_followups: before }));
    } else if (destination === "event") {
      const key = hqLocalDateKey();
      const result = await CalendarRepository.addLegacy(key, text, { dedupe: false });
      CalendarRepository.syncCalendar(result);
      Calendar.render().catch(error => console.warn("Calendar refresh after capture failed:", error));
      this.showUndo("Added to today’s Calendar.", async () => { const undone = await CalendarRepository.undo(result.inverse); CalendarRepository.syncCalendar(undone); Calendar.render(); });
    }
    await this.render();
  },

  async handleFollowup(event) {
    const button = event.target.closest("[data-followup-action]");
    const row = button?.closest("[data-followup-id]");
    if (!button || !row) return;
    const { hq_followups = [] } = await chrome.storage.local.get("hq_followups");
    const item = hq_followups.find(entry => entry.id === row.dataset.followupId);
    if (!item) return;
    if (button.dataset.followupAction === "open" && item.threadId) {
      if (await LazyFeatures.ensure("gmail-flyout")) Gmail.openThread(item.threadId);
    }
    if (button.dataset.followupAction === "done") {
      item.done = true;
      item.completedAt = Date.now();
      await chrome.storage.local.set({ hq_followups });
      if (typeof Gmail !== "undefined") Gmail.followups = hq_followups;
      await this.render();
    }
  },

  async init() {
    document.getElementById("today-start-next").onclick = () => this.startNext();
    document.getElementById("today-complete-next").onclick = () => this.completeNext();
    document.getElementById("today-capture-form").onsubmit = async event => {
      event.preventDefault();
      const input = document.getElementById("today-capture-input");
      const text = input.value.trim();
      if (!text) return;
      try {
        await this.capture(text, document.getElementById("today-capture-destination").value);
        input.value = "";
      } catch (error) {
        this.lastUndo = null;
        document.getElementById("today-undo-text").textContent = `Capture failed: ${error.message}`;
        document.getElementById("today-undo").classList.remove("hidden");
      }
    };
    document.getElementById("today-undo-btn").onclick = async () => {
      if (!this.lastUndo) return;
      const undo = this.lastUndo;
      this.lastUndo = null;
      try {
        await undo();
        document.getElementById("today-undo").classList.add("hidden");
        await this.render();
      } catch (error) {
        document.getElementById("today-undo-text").textContent = `Undo failed: ${error.message}`;
      }
    };
    document.getElementById("today-waiting").onclick = event => this.handleFollowup(event).catch(error => {
      document.getElementById("today-undo-text").textContent = `Follow-up action failed: ${error.message}`;
      document.getElementById("today-undo").classList.remove("hidden");
    });
    await this.render();
  },
};
