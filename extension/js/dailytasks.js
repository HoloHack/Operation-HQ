// dailytasks.js — Daily Non-Negotiables with per-day reset, streak tracking,
// and streak-freeze recovery.
//
// Research backing the freeze mechanic: apps with freeze functionality see
// meaningfully longer streak retention (Trophy's platform data: ~48% longer
// average streak length past day 7) specifically because a single missed
// day due to ordinary life doesn't erase everything — and losing months of
// progress to one bad day is what actually drives people to give up
// entirely rather than restart. Freezes are auto-applied, not manually
// claimed, matching Duolingo's model — no extra step, no anxiety about
// "did I remember to use one."

const DAILY_TEMPLATES = [
  { id: "lang", text: "Language learning (Hindi/Tamil/Gujarati/Japanese)", target: 1 },
  { id: "piano", text: "Piano practice", target: 1 },
  { id: "maths", text: "Maths exercises", target: 4 },
  { id: "ngo", text: "NGO worksheet", target: 1, conditional: "ngoPhase" },
  { id: "coding", text: "Coding lessons", target: 3 },
  { id: "roblox", text: "Roblox dev work (Aetherforge)", target: 1 },
  { id: "chess", text: "Chess tactics practice", target: 1 },
];

const FREEZES_PER_MONTH = 3;
const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];

const DailyTasks = {
  today: null,
  log: {},
  ngoStart: null,
  frozenDates: [], // dates where a streak-freeze was auto-applied

  todayKey(date = new Date()) {
    return hqLocalDateKey(date);
  },
  monthKey(dateKey) {
    return dateKey.slice(0, 7);
  },

  async init() {
    const s = await chrome.storage.local.get(["hq_daily_log", "hq_ngo_start", "hq_streak_frozen_dates"]);
    this.log = s.hq_daily_log || {};
    this.ngoStart = s.hq_ngo_start || this.todayKey();
    this.frozenDates = s.hq_streak_frozen_dates || [];
    if (!s.hq_ngo_start) await chrome.storage.local.set({ hq_ngo_start: this.ngoStart });
    this.today = this.todayKey();
    if (!this.log[this.today]) this.log[this.today] = {};
    await this.render();
  },

  isNgoActiveToday() {
    const start = new Date(this.ngoStart);
    const now = new Date(this.today);
    const daysSince = Math.floor((now - start) / 86400000);
    if (daysSince < 14) return true;
    return now.getDay() === 6;
  },

  activeTemplates() {
    return DAILY_TEMPLATES.filter(t => t.id !== "ngo" || this.isNgoActiveToday());
  },

  async bump(id, delta) {
    const entry = this.log[this.today];
    const tpl = DAILY_TEMPLATES.find(t => t.id === id);
    const cur = entry[id] || 0;
    const wasComplete = cur >= tpl.target;
    entry[id] = Math.max(0, Math.min(tpl.target, cur + delta));
    const nowComplete = entry[id] >= tpl.target;
    await chrome.storage.local.set({ hq_daily_log: this.log });

    if (!wasComplete && nowComplete) {
      if (typeof ActivityLog !== "undefined") ActivityLog.record("daily");
      if (typeof ContextBus !== "undefined") ContextBus.recordCompletion({ text: tpl.text, venture: "Daily", type: "daily" });
      const templates = this.activeTemplates();
      const doneBefore = templates.filter(t => t.id !== id && (entry[t.id] || 0) >= t.target).length;
      const allDoneNow = doneBefore + 1 >= templates.length;
      if (typeof Sound !== "undefined") allDoneNow ? Sound.allDailyDone() : Sound.dailyComplete();
    }
    await this.render();
  },

  isTemplateDone(id) {
    const tpl = DAILY_TEMPLATES.find(t => t.id === id);
    return (this.log[this.today][id] || 0) >= tpl.target;
  },

  isDayComplete(dateKey) {
    const entry = this.log[dateKey];
    if (!entry) return false;
    return DAILY_TEMPLATES.every(t => (entry[t.id] || 0) >= t.target || t.id === "ngo");
  },

  freezesUsedThisMonth(monthKey) {
    return this.frozenDates.filter(d => this.monthKey(d) === monthKey).length;
  },

  freezesRemaining() {
    return Math.max(0, FREEZES_PER_MONTH - this.freezesUsedThisMonth(this.monthKey(this.today)));
  },

  // Walks backward from today. A missed PAST day (never today itself) auto-
  // consumes a freeze if one's available that month and hasn't already been
  // used for that exact date — persisted so re-rendering never double-spends.
  async computeStreak() {
    let streak = 0;
    let d = new Date();
    let newlyFrozen = false;

    // today only counts once fully complete; an incomplete "today" simply
    // doesn't extend the streak yet (not a miss until the day is over)
    if (this.isDayComplete(this.today)) { streak++; }
    d.setDate(d.getDate() - 1);

    while (true) {
      const key = this.todayKey(d);
      if (this.isDayComplete(key)) {
        streak++;
      } else if (this.frozenDates.includes(key)) {
        streak++; // already-recorded freeze from a previous render
      } else {
        const month = this.monthKey(key);
        if (this.freezesUsedThisMonth(month) < FREEZES_PER_MONTH) {
          this.frozenDates.push(key);
          newlyFrozen = true;
          streak++;
        } else {
          break;
        }
      }
      d.setDate(d.getDate() - 1);
    }

    if (newlyFrozen) {
      await chrome.storage.local.set({ hq_streak_frozen_dates: this.frozenDates });
    }
    return streak;
  },

  nextMilestoneGap(streak) {
    const next = MILESTONES.find(m => m > streak);
    if (!next) return null;
    return { next, gap: next - streak };
  },

  async render() {
    const list = document.getElementById("daily-list");
    if (!list) return;
    const templates = this.activeTemplates();
    list.innerHTML = templates.map(t => {
      const cur = this.log[this.today][t.id] || 0;
      const done = cur >= t.target;
      return `
        <li class="daily-item ${done ? "done" : ""}" data-id="${t.id}">
          <button class="task-check daily-check" aria-label="${done ? "Mark incomplete" : "Mark complete"}">${done ? Icons.span("check") : ""}</button>
          <div class="task-text">${t.text}</div>
          ${t.target > 1 ? `<div class="daily-counter">
              <button class="daily-minus" aria-label="Decrease ${escapeAttribute(t.text)}">−</button>
              <span>${cur}/${t.target}</span>
              <button class="daily-plus" aria-label="Increase ${escapeAttribute(t.text)}">+</button>
            </div>` : ""}
        </li>`;
    }).join("");

    list.querySelectorAll(".daily-item").forEach(el => {
      const id = el.dataset.id;
      const tpl = DAILY_TEMPLATES.find(t => t.id === id);
      if (tpl.target === 1) {
        el.querySelector(".daily-check").onclick = () => this.bump(id, this.isTemplateDone(id) ? -1 : 1);
      } else {
        el.querySelector(".daily-minus").onclick = () => this.bump(id, -1);
        el.querySelector(".daily-plus").onclick = () => this.bump(id, 1);
      }
    });

    const streak = await this.computeStreak();
    const streakEl = document.getElementById("daily-streak");
    const milestone = this.nextMilestoneGap(streak);
    streakEl.innerHTML = `${Icons.span("flame")} ${streak}`;
    streakEl.title = milestone
      ? `${milestone.gap} day${milestone.gap === 1 ? "" : "s"} to your ${milestone.next}-day milestone · ${this.freezesRemaining()} streak freeze(s) left this month`
      : `${this.freezesRemaining()} streak freeze(s) left this month`;

    if (typeof Sound !== "undefined" && MILESTONES.includes(streak)) {
      const { hq_last_milestone_streak } = await chrome.storage.local.get("hq_last_milestone_streak");
      if ((hq_last_milestone_streak || 0) < streak) {
        Sound.milestone();
        await chrome.storage.local.set({ hq_last_milestone_streak: streak });
      }
    }

    const doneCount = templates.filter(t => (this.log[this.today][t.id] || 0) >= t.target).length;
    document.getElementById("daily-progress-label").textContent = `${doneCount} / ${templates.length} done today`;
    const completionPercent = templates.length ? Math.round((doneCount / templates.length) * 100) : 0;
    document.getElementById("daily-progress-fill").style.width = `${completionPercent}%`;
    document.getElementById("daily-progress-bar").setAttribute("aria-valuenow", String(completionPercent));
  }
};
