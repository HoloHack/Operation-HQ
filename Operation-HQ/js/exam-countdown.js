// exam-countdown.js — Roadmap §7, H2: "not just a countdown, but a
// reverse-engineered study plan working backward from an exam date using
// the same capacity-learning engine already built for daily planning."
//
// Deliberately does NOT guess how many hours a given exam "needs" — that
// would be overclaiming knowledge this app doesn't have about any
// specific subject or curriculum. The person supplies a real target
// (total hours they want to study before the exam); this only solves the
// honestly-answerable part: given that real number, how should it be
// distributed across the days remaining, respecting what's actually been
// achievable on days like each one — a Tuesday with a job shift gets
// proportionally less than a free Saturday, from real data, not a guess.

const ExamCountdown = {
  DEFAULT_DAILY_MINUTES_FALLBACK: 60, // used only for a day-of-week with no capacity data yet — clearly flagged as a default, not learned, everywhere it's shown
  UNDO_KEY: "hq_exam_countdown_undo_v1",
  initialized: false,

  async getAll() {
    const { hq_exam_countdowns } = await chrome.storage.local.get("hq_exam_countdowns");
    return hq_exam_countdowns || [];
  },

  async add(subject, examDate, targetHours) {
    if (!subject || !subject.trim() || !examDate || !(targetHours > 0)) return null;
    const countdowns = await this.getAll();
    const entry = { id: crypto.randomUUID(), subject: subject.trim(), examDate, targetHours, createdAt: Date.now() };
    countdowns.push(entry);
    await chrome.storage.local.set({ hq_exam_countdowns: countdowns });
    return entry;
  },

  async remove(id, { skipConfirmation = false } = {}) {
    const countdowns = await this.getAll();
    const index = countdowns.findIndex(c => c.id === id);
    if (index < 0) return false;
    const removed = countdowns[index];
    if (!skipConfirmation && !confirm(`Delete the ${removed.subject} exam plan? You can undo this once.`)) return false;
    await chrome.storage.local.set({
      hq_exam_countdowns: countdowns.filter(c => c.id !== id),
      [this.UNDO_KEY]: { item: removed, index, deletedAt: Date.now() },
    });
    this.status(`${removed.subject} removed. Undo is available.`);
    return true;
  },

  async undoRemove() {
    const saved = await chrome.storage.local.get(this.UNDO_KEY);
    const undo = saved[this.UNDO_KEY];
    if (!undo?.item?.id) return false;
    const countdowns = await this.getAll();
    if (!countdowns.some(item => item.id === undo.item.id)) {
      const index = Math.max(0, Math.min(Number(undo.index) || 0, countdowns.length));
      countdowns.splice(index, 0, undo.item);
      await chrome.storage.local.set({ hq_exam_countdowns: countdowns });
    }
    await chrome.storage.local.remove(this.UNDO_KEY);
    this.status(`${undo.item.subject} restored.`);
    return true;
  },

  status(message) {
    const node = document.getElementById("exam-countdown-status");
    if (node) node.textContent = message;
  },

  // Whole calendar days between today and examDate, exclusive of the exam
  // day itself (you're not studying new material during the exam).
  daysUntil(examDate) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exam = new Date(examDate + "T00:00:00");
    return Math.round((exam - today) / 86400000);
  },

  // Distributes targetHours across every remaining day, weighted by each
  // day-of-week's real historical completion capacity (DailyPlanner's own
  // learned data — nothing duplicated here, just reused). A day that's
  // historically completed more gets proportionally more study minutes; a
  // day that's historically light (job shifts, tuition) gets less. The
  // total always sums to exactly the person's stated target, regardless
  // of how the weighting shakes out day-to-day.
  async computeStudyPlan(countdown) {
    const daysRemaining = this.daysUntil(countdown.examDate);
    if (daysRemaining <= 0) return { days: [], daysRemaining, warning: null, todayMinutes: 0 };

    const days = [];
    for (let i = 0; i < daysRemaining; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const dow = date.getDay();
      const capacity = await DailyPlanner.getHistoricalCapacity(dow);
      const isDefault = capacity.sampleSize < 2;
      const weight = isDefault ? this.DEFAULT_DAILY_MINUTES_FALLBACK : capacity.avgCompletedMinutes;
      days.push({ date: hqLocalDateKey(date), dow, weight, isDefault });
    }

    const totalWeight = days.reduce((s, d) => s + d.weight, 0);
    const targetTotalMinutes = countdown.targetHours * 60;
    days.forEach(d => {
      d.studyMinutes = totalWeight > 0
        ? Math.round(targetTotalMinutes * d.weight / totalWeight)
        : Math.round(targetTotalMinutes / days.length);
    });

    // Honest realism check, the same actuarial spirit as the daily
    // pre-mortem: if any single day's share implies MORE study time than
    // you've ever completed of ANYTHING on a day like that, say so
    // plainly instead of quietly handing over a schedule set up to fail.
    let warning = null;
    let worstDay = null;
    days.forEach(d => {
      if (d.weight > 0 && d.studyMinutes > d.weight && (!worstDay || d.studyMinutes - d.weight > worstDay.studyMinutes - worstDay.weight)) {
        worstDay = d;
      }
    });
    if (worstDay) {
      const weekday = new Date(worstDay.date + "T00:00:00").toLocaleDateString([], { weekday: "long" });
      warning = `On ${weekday}s this averages to ${worstDay.studyMinutes} minutes of ${countdown.subject} — more than the ${worstDay.weight} minutes you've historically completed of ANYTHING on days like that. Worth a lower target or starting earlier, not just hoping this one's different.`;
    }

    return {
      days,
      daysRemaining,
      warning,
      todayMinutes: days[0] ? days[0].studyMinutes : 0,
      learnedDays: days.filter(day => !day.isDefault).length,
      defaultDays: days.filter(day => day.isDefault).length,
    };
  },

  // Today's suggested minutes across every active countdown — this is
  // what feeds into Today's Plan generation as extra context, and what
  // the panel's own "today" summary line shows.
  async todaysTargets() {
    const countdowns = await this.getAll();
    const upcoming = countdowns.filter(c => this.daysUntil(c.examDate) > 0);
    const results = [];
    for (const c of upcoming) {
      const plan = await this.computeStudyPlan(c);
      if (plan.days.length) results.push({ subject: c.subject, minutes: plan.todayMinutes, daysRemaining: plan.daysRemaining, examDate: c.examDate });
    }
    return results;
  },

  // --- UI ---

  async render() {
    const list = document.getElementById("exam-countdown-list");
    if (!list) return;
    const countdowns = await this.getAll();
    const undoState = await chrome.storage.local.get(this.UNDO_KEY);
    document.getElementById("exam-undo-delete")?.classList.toggle("hidden", !undoState[this.UNDO_KEY]?.item);

    if (!countdowns.length) {
      list.innerHTML = '<li class="empty-state">No exams tracked yet.</li>';
      return;
    }

    const rows = await Promise.all(countdowns.map(async (c) => {
      const daysLeft = this.daysUntil(c.examDate);
      if (daysLeft <= 0) {
        return `<li class="exam-plan-card exam-plan-past" data-id="${escapeAttribute(c.id)}">
          <div class="exam-plan-head"><div><span class="eyebrow">Archived date</span><h3>${escapeHtml(c.subject)}</h3><p>${escapeHtml(c.examDate)} has passed. The plan is preserved until you delete it.</p></div>
          <button class="exam-delete-btn" data-exam-action="delete" aria-label="Delete ${escapeAttribute(c.subject)} exam">${Icons.span("x")}</button></div>
        </li>`;
      }
      const plan = await this.computeStudyPlan(c);
      const visibleDays = plan.days.slice(0, 90);
      const planRows = visibleDays.map((day, index) => {
        const date = new Date(`${day.date}T00:00:00`);
        const dateLabel = date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
        return `<li${index === 0 ? ' data-today="true"' : ""}><span>${escapeHtml(index === 0 ? `Today · ${dateLabel}` : dateLabel)}</span><b>${day.studyMinutes} min</b><small>${day.isDefault ? "60m default capacity" : `${Math.round(day.weight)}m learned capacity`}</small></li>`;
      }).join("");
      const capacityCopy = plan.defaultDays
        ? `${plan.learnedDays} day${plan.learnedDays === 1 ? "" : "s"} use learned capacity; ${plan.defaultDays} still use the clearly labelled 60-minute default.`
        : "Every day in this plan uses capacity learned from completed work.";
      return `<li class="exam-plan-card" data-id="${escapeAttribute(c.id)}">
        <div class="exam-plan-head">
          <div><span class="eyebrow">${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining</span><h3>${escapeHtml(c.subject)}</h3><p>${escapeHtml(c.examDate)} · ${c.targetHours}h user-set target</p></div>
          <div class="exam-today-target"><strong>${plan.todayMinutes}</strong><span>minutes today</span></div>
        </div>
        ${plan.warning ? `<div class="exam-warning">${Icons.span("triangle-alert")} <span>${escapeHtml(plan.warning)}</span></div>` : ""}
        <div class="exam-plan-assumption"><strong>Planning basis</strong><span>${escapeHtml(capacityCopy)}</span></div>
        <details class="exam-plan-details"><summary>Inspect day-by-day plan</summary><ol>${planRows}</ol>${plan.days.length > visibleDays.length ? `<p>Showing the first ${visibleDays.length} of ${plan.days.length} days to keep this view usable.</p>` : ""}</details>
        <div class="exam-plan-actions">
          <button class="primary-btn" data-exam-action="task">Add today to Tasks</button>
          <button class="secondary-btn exam-delete-btn" data-exam-action="delete">Delete plan</button>
        </div>
      </li>`;
    }));

    list.innerHTML = rows.join("");
  },

  async addTodayTask(id) {
    const countdown = (await this.getAll()).find(item => item.id === id);
    if (!countdown || this.daysUntil(countdown.examDate) <= 0) return;
    if (typeof Tasks === "undefined") {
      this.status("Tasks are still loading. Try again in a moment.");
      return;
    }
    const plan = await this.computeStudyPlan(countdown);
    const todayKey = hqLocalDateKey(new Date());
    const sourceId = `${countdown.id}:${todayKey}`;
    const existing = Tasks.data.find(task => !task.done && task.source === "exam-plan" && task.sourceId === sourceId);
    if (existing) {
      this.status(`${countdown.subject}'s ${plan.todayMinutes}-minute target is already in Tasks.`);
      return existing;
    }
    const due = new Date();
    due.setHours(18, 0, 0, 0);
    const task = Tasks.add(
      `${countdown.subject}: ${plan.todayMinutes}-minute exam session`,
      null,
      plan.todayMinutes,
      {
        priority: plan.daysRemaining <= 3 ? "high" : "medium",
        priorityReason: `${plan.daysRemaining} days until exam`,
        dueAt: due.getTime(),
        source: "exam-plan",
        sourceId,
        deferSave: true,
      },
    );
    await Tasks.save();
    this.status(`Added today's ${plan.todayMinutes}-minute ${countdown.subject} session to Tasks. No timer was changed.`);
    return task;
  },

  async onListClick(event) {
    const button = event.target.closest("button[data-exam-action]");
    if (!button) return;
    const id = button.closest("[data-id]")?.dataset.id;
    if (!id) return;
    if (button.dataset.examAction === "task") await this.addTodayTask(id);
    if (button.dataset.examAction === "delete" && await this.remove(id)) await this.render();
  },

  async addFromForm() {
    const subjectEl = document.getElementById("exam-subject-input");
    const dateEl = document.getElementById("exam-date-input");
    const hoursEl = document.getElementById("exam-hours-input");

    const entry = await this.add(subjectEl.value, dateEl.value, parseFloat(hoursEl.value));
    if (!entry) {
      Wallpaper?.toast?.("Fill in a subject, exam date, and target hours to add one.");
      return;
    }
    subjectEl.value = ""; dateEl.value = ""; hoursEl.value = "";
    this.status(`${entry.subject} plan added. Open it to inspect how every day was calculated.`);
    await this.render();
  },

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    const addBtn = document.getElementById("exam-add-btn");
    if (addBtn) addBtn.onclick = () => this.addFromForm();
    document.getElementById("exam-countdown-list")?.addEventListener("click", event => this.onListClick(event));
    document.getElementById("exam-undo-delete")?.addEventListener("click", async () => {
      if (await this.undoRemove()) await this.render();
    });
    await this.render();
  },
};
