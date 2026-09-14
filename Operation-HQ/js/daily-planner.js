// daily-planner.js — turns the static task library into "here's your exact
// plan for today," via one Claude API call. Entirely inactive until a
// Claude API key is set in Settings.
//
// Two additions beyond basic scheduling:
// 1. CAPACITY LEARNING — tracks how much you actually complete vs. plan,
//    per day-of-week, and feeds that back in so Wednesday (job 4–7:15pm)
//    gets planned lighter than Saturday automatically, from real data
//    instead of a fixed assumption.
// 2. PRE-MORTEM — before presenting a plan as final, checks it against
//    your own historical completion capacity for that day-of-week and
//    flags it if it's meaningfully heavier than what you've actually
//    finished on days like this before. Actuarial, not motivational.

const DailyPlanner = {
  WEEKLY_RHYTHM: [
    { day: 4, label: "Tuition (afternoon)" },
    { day: 3, label: "Job 4:00–7:15pm" },
    { day: 0, label: "Unavailable from 2:00pm" },
  ],
  DAILY_NON_NEGOTIABLES: [
    "Language learning", "Piano practice", "Maths exercises",
    "NGO worksheet", "Coding lessons", "Roblox dev work",
  ],
  PRE_MORTEM_THRESHOLD: 1.4, // flag if planned minutes exceed historical avg completed by 40%+

  todayKey() {
    return hqLocalDateKey();
  },

  async getStoredPlan() {
    const { hq_daily_plan_date, hq_daily_plan_tasks } = await chrome.storage.local.get(
      ["hq_daily_plan_date", "hq_daily_plan_tasks"]
    );
    return { date: hq_daily_plan_date || null, tasks: hq_daily_plan_tasks || [] };
  },

  async isTodaysPlanReady() {
    const { date } = await this.getStoredPlan();
    return date === this.todayKey();
  },

  // --- Capacity learning ---

  async archiveYesterdayIfNeeded() {
    const { date, tasks } = await this.getStoredPlan();
    if (!date || date === this.todayKey() || !tasks.length) return;

    const plannedMinutes = tasks.reduce((s, t) => s + (t.minutes || 0), 0);
    const completedMinutes = tasks.filter(t => t.done).reduce((s, t) => s + (t.minutes || 0), 0);
    const dow = new Date(date).getDay();

    const { hq_plan_history } = await chrome.storage.local.get("hq_plan_history");
    const history = hq_plan_history || {};
    history[date] = { plannedMinutes, completedMinutes, dow };
    await chrome.storage.local.set({ hq_plan_history: history });

    await this.queueIncompleteForTaxonomy(date, tasks);
  },

  // --- Failure taxonomy (Roadmap §5, H2) ---
  // The pre-mortem above already predicts a heavy day in advance;
  // this is the retrospective half — categorizing WHY specific things
  // actually didn't get done, once a real pattern has enough data to be
  // worth naming rather than guessed at from a single bad day.
  FAILURE_REASONS: ["Overestimated", "Interrupted", "Lost interest", "Blocked by someone else"],

  // Queues yesterday's incomplete plan-items for a reason tag. Runs once
  // per real day-transition (guarded by the same date check in the caller
  // above), and is itself idempotent against being queued twice for the
  // same item — de-duped by date+objective, since plan-task ids aren't
  // guaranteed stable across a fresh generation.
  async queueIncompleteForTaxonomy(date, tasks) {
    const incomplete = tasks.filter(t => !t.done);
    if (!incomplete.length) return;

    const { hq_failure_taxonomy_pending } = await chrome.storage.local.get("hq_failure_taxonomy_pending");
    const pending = hq_failure_taxonomy_pending || [];
    const existingKeys = new Set(pending.map(p => `${p.date}::${p.objective}`));

    incomplete.forEach(t => {
      const key = `${date}::${t.objective}`;
      if (existingKeys.has(key)) return;
      pending.push({ id: crypto.randomUUID(), date, objective: t.objective, venture: t.venture, minutes: t.minutes });
    });

    await chrome.storage.local.set({ hq_failure_taxonomy_pending: pending });
  },

  async getPendingTaxonomy() {
    const { hq_failure_taxonomy_pending } = await chrome.storage.local.get("hq_failure_taxonomy_pending");
    return hq_failure_taxonomy_pending || [];
  },

  async tagFailureReason(pendingId, reason) {
    if (!this.FAILURE_REASONS.includes(reason)) return;
    const pending = await this.getPendingTaxonomy();
    const item = pending.find(p => p.id === pendingId);
    if (!item) return;

    const { hq_failure_taxonomy } = await chrome.storage.local.get("hq_failure_taxonomy");
    const tagged = hq_failure_taxonomy || [];
    tagged.push({ ...item, reason, taggedAt: Date.now() });

    await chrome.storage.local.set({
      hq_failure_taxonomy: tagged,
      hq_failure_taxonomy_pending: pending.filter(p => p.id !== pendingId),
    });
  },

  // Skipping a pending item is always a valid choice, not just tagging it
  // — forcing a category on something the person doesn't want to think
  // about right now would make this feel like a chore, defeating the
  // point of a lightweight pattern-tracker.
  async dismissPendingTaxonomy(pendingId) {
    const pending = await this.getPendingTaxonomy();
    await chrome.storage.local.set({ hq_failure_taxonomy_pending: pending.filter(p => p.id !== pendingId) });
  },

  // Looks at the most recent tagged entries and names a pattern ONLY when
  // one reason genuinely dominates — returns null otherwise rather than
  // manufacturing an insight out of noise. "Dominates" here means at
  // least 3 occurrences AND at least 60% of the recent sample, so a
  // 2-of-3 split doesn't get inflated into a confident-sounding pattern.
  async getFailurePatternInsight(sampleSize = 5) {
    const { hq_failure_taxonomy } = await chrome.storage.local.get("hq_failure_taxonomy");
    const tagged = (hq_failure_taxonomy || []).slice().sort((a, b) => b.taggedAt - a.taggedAt).slice(0, sampleSize);
    if (tagged.length < 3) return null;

    const counts = {};
    tagged.forEach(t => { counts[t.reason] = (counts[t.reason] || 0) + 1; });
    const [topReason, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    if (topCount < 3 || topCount / tagged.length < 0.6) return null;
    return { reason: topReason, count: topCount, sampleSize: tagged.length };
  },

  async getHistoricalCapacity(dow) {
    const { hq_plan_history } = await chrome.storage.local.get("hq_plan_history");
    const history = hq_plan_history || {};
    const entries = Object.values(history).filter(e => e.dow === dow && e.plannedMinutes > 0);
    if (!entries.length) return { sampleSize: 0, avgCompletedMinutes: null, avgRatio: null };
    const avgCompleted = entries.reduce((s, e) => s + e.completedMinutes, 0) / entries.length;
    const avgRatio = entries.reduce((s, e) => s + e.completedMinutes / e.plannedMinutes, 0) / entries.length;
    return { sampleSize: entries.length, avgCompletedMinutes: Math.round(avgCompleted), avgRatio };
  },

  async buildContext() {
    const { hq_tasks, hq_calendar_events } = await chrome.storage.local.get(["hq_tasks", "hq_calendar_events"]);
    const openTasks = (hq_tasks || [])
      .filter(t => !t.done)
      .map(t => ({ text: t.text, venture: t.venture, priority: t.priority || null, dueAt: t.dueAt || null, estMinutes: t.estMinutes || null }));

    const dow = new Date().getDay();
    const dayKey = typeof SCHEDULE_DAY_KEYS !== "undefined" ? SCHEDULE_DAY_KEYS[dow] : null;
    const scheduleBlocks = typeof Schedule !== "undefined" && Schedule.active && dayKey
      ? Schedule.blocksFor(Schedule.active, dayKey).map(block => `${block.s}–${block.e} ${block.t}${block.phasePriority ? ` [${block.phasePriority}]` : ""}`)
      : [];
    const rhythmToday = scheduleBlocks.length ? scheduleBlocks : this.WEEKLY_RHYTHM.filter(r => r.day === dow).map(r => r.label);
    const phase = typeof Schedule !== "undefined" ? Schedule.activePhase?.() : null;
    const todayEvents = (hq_calendar_events || {})[this.todayKey()] || [];
    const capacity = await this.getHistoricalCapacity(dow);

    // Exam-countdown targets feed in as real context (not invented tasks
    // — the generation prompt below still only draws from openTasks) so
    // Claude's rationale and task selection can actually account for
    // "there's a Chemistry exam in 4 days needing 40min today" rather
    // than these two systems knowing nothing about each other.
    const examTargets = typeof ExamCountdown !== "undefined" ? await ExamCountdown.todaysTargets() : [];

    return { openTasks, rhythmToday, phase, dailyNonNegotiables: this.DAILY_NON_NEGOTIABLES, todayEvents, capacity, dow, examTargets };
  },

  systemPrompt() {
    return `You are a planning assistant for a Year 10 student juggling school, several small businesses, and personal development goals. You turn a static list of open tasks into a specific, realistic plan for TODAY only.

Rules:
- Output ONLY valid JSON, no markdown fences, no prose before or after.
- Schema: {"tasks": [{"objective": string, "venture": string, "minutes": number, "context": string}]}
- 4 to 6 tasks total. Each "objective" must be concrete and specific — what "done" looks like today, not a restatement of the task title.
- Respect the fixed daily rhythm blocks given (tuition, job, etc.).
- Spread task types across the day rather than 6 tasks from the same venture.
- If historical capacity data is provided, treat it as the realistic ceiling for today's total — plan closer to what's actually been completed on days like this before, not the theoretical maximum. Under-planning a realistic day beats over-planning an aspirational one.
- "context" is one short clause of continuity — keep it brief.
- Never invent tasks that aren't drawn from the provided open task list.`;
  },

  systemPromptRationale() {
    return `You are a planning assistant briefly explaining your own reasoning before presenting a plan. Given the same open tasks, rhythm, and capacity context you're about to plan from, write 2-3 short sentences (plain prose, no markdown, no lists) explaining what you're weighing today — e.g. what the fixed rhythm blocks leave room for, whether historical capacity is pushing you toward a lighter day, which ventures need attention. Do not list the actual tasks — that comes next. Be specific to the real numbers given, not generic.`;
  },

  // Streams a short, real rationale BEFORE the structured plan — using the
  // same context the JSON call gets, so it's an honest preview of the
  // actual reasoning, not decorative filler. onToken(chunk, fullSoFar) is
  // called live; callers wire this straight to the DOM. Failure here is
  // non-fatal — the rationale is a nice-to-have, the structured plan
  // (via callJSON, separately, with its own retry) is the part that
  // actually has to work.
  async generateRationale(ctx, onToken) {
    const capacityLine = ctx.capacity.sampleSize >= 2
      ? `Historical capacity for this day of the week: averaged ${ctx.capacity.avgCompletedMinutes} completed minutes on days like today (${ctx.capacity.sampleSize} data points, ${Math.round(ctx.capacity.avgRatio * 100)}% average completion rate).`
      : "No historical capacity data for this day of the week yet.";
    const examLine = ctx.examTargets && ctx.examTargets.length
      ? `Exam prep due today: ${ctx.examTargets.map(e => `${e.subject} (${e.minutes}min, ${e.daysRemaining}d until exam)`).join("; ")}.`
      : "";

    const userPrompt = `Open tasks available: ${ctx.openTasks.length} (ventures: ${[...new Set(ctx.openTasks.map(t => t.venture))].join(", ") || "none"})
Today's fixed rhythm blocks: ${ctx.rhythmToday.join(", ") || "none"}
Current timetable phase: ${ctx.phase ? `${ctx.phase.label} — ${ctx.phase.focus}` : "none"}
Today's calendar events: ${ctx.todayEvents.join(", ") || "none"}
${capacityLine}
${examLine}

Briefly explain your reasoning before the plan.`;

    try {
      return await ClaudeClient.callStream(this.systemPromptRationale(), userPrompt, onToken || (() => {}), 180);
    } catch (e) {
      console.warn("Daily plan rationale stream failed (non-fatal, continuing to structured plan):", e.message);
      return "";
    }
  },

  async generate({ silent = true, onRationaleToken = null } = {}) {
    if (!(await ClaudeClient.hasKey())) return { ok: false, reason: "no-key" };

    await this.archiveYesterdayIfNeeded();

    const ctx = await this.buildContext();
    if (!ctx.openTasks.length) return { ok: false, reason: "no-tasks" };

    const rationale = await this.generateRationale(ctx, onRationaleToken);

    const capacityLine = ctx.capacity.sampleSize >= 2
      ? `Historical capacity for this day of the week: you've completed an average of ${ctx.capacity.avgCompletedMinutes} minutes of planned work on days like today (${ctx.capacity.sampleSize} data points, ${Math.round(ctx.capacity.avgRatio * 100)}% average completion rate). Plan close to this, not above it.`
      : "No historical capacity data for this day of the week yet — use your own judgment on a realistic total.";
    const examLine = ctx.examTargets && ctx.examTargets.length
      ? `\nExam prep due today (weave in as its own task if there's room, using the venture "School & Academics"): ${ctx.examTargets.map(e => `${e.subject} — ${e.minutes}min (${e.daysRemaining} days until exam)`).join("; ")}.`
      : "";

    const userPrompt = `Open task library (pick from these only):\n${JSON.stringify(ctx.openTasks, null, 2)}

Today's fixed rhythm blocks: ${ctx.rhythmToday.join(", ") || "none"}
Current timetable phase: ${ctx.phase ? `${ctx.phase.label} — ${ctx.phase.focus}` : "none"}
Today's calendar events: ${ctx.todayEvents.join(", ") || "none"}
Daily non-negotiables (already tracked separately, don't duplicate these): ${ctx.dailyNonNegotiables.join(", ")}
${capacityLine}${examLine}

Generate today's plan.`;

    try {
      const result = await ClaudeClient.callJSON(this.systemPrompt(), userPrompt, 1200);
      const tasks = (result.tasks || []).map(t => ({
        id: crypto.randomUUID(),
        objective: t.objective,
        venture: t.venture,
        minutes: t.minutes,
        context: t.context,
        done: false,
      }));

      // --- Pre-mortem: flag before presenting as final, not after failing it ---
      let preMortem = null;
      const plannedTotal = tasks.reduce((s, t) => s + (t.minutes || 0), 0);
      if (ctx.capacity.sampleSize >= 2 && plannedTotal > ctx.capacity.avgCompletedMinutes * this.PRE_MORTEM_THRESHOLD) {
        const heaviest = [...tasks].sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0];
        preMortem = {
          plannedTotal,
          historicalAvg: ctx.capacity.avgCompletedMinutes,
          pctOver: Math.round(((plannedTotal / ctx.capacity.avgCompletedMinutes) - 1) * 100),
          likelyFailPoint: heaviest?.objective || null,
        };
      }

      await chrome.storage.local.set({
        hq_daily_plan_date: this.todayKey(),
        hq_daily_plan_tasks: tasks,
        hq_daily_plan_premortem: preMortem,
        hq_daily_plan_rationale: rationale || "",
      });

      this.fireWebhook({ date: this.todayKey(), taskCount: tasks.length, plannedMinutes: plannedTotal });

      return { ok: true, tasks, preMortem, rationale };
    } catch (e) {
      console.error("Daily plan generation failed:", e);
      if (!silent && typeof Wallpaper !== "undefined") {
        Wallpaper.toast(`Couldn't generate today's plan: ${e.message}`);
      }
      return { ok: false, reason: "api-error", error: e.message };
    }
  },

  // Fire-and-forget POST to a user-supplied webhook (Zapier/Make/n8n/
  // anything) when a plan finishes generating. Free — plain fetch, no key,
  // no new host_permission needed since mode:"no-cors" doesn't require
  // CORS headers from the target and this deliberately never reads the
  // response. A missing URL, a network failure, or the endpoint being
  // down must NEVER affect plan generation itself — this always runs
  // after storage is already committed, and every failure is swallowed.
  async fireWebhook(payload) {
    const { hq_webhook_plan_url } = await chrome.storage.local.get("hq_webhook_plan_url");
    const url = (hq_webhook_plan_url || "").trim();
    if (!url) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "plan_generated", ...payload }),
      });
    } catch (e) {
      console.warn("Daily plan webhook failed (non-fatal):", e.message);
    } finally {
      clearTimeout(timer);
    }
  },

  async toggleTask(id) {
    const { hq_daily_plan_tasks } = await chrome.storage.local.get("hq_daily_plan_tasks");
    const tasks = hq_daily_plan_tasks || [];
    const t = tasks.find(x => x.id === id);
    if (t) {
      t.done = !t.done;
      if (t.done && typeof ActivityLog !== "undefined") ActivityLog.record("plan");
    }
    await chrome.storage.local.set({ hq_daily_plan_tasks: tasks });
    return tasks;
  },

  render() {
    const list = document.getElementById("daily-plan-list");
    if (!list) return;
    chrome.storage.local.get(["hq_daily_plan_date", "hq_daily_plan_tasks", "hq_daily_plan_premortem", "hq_daily_plan_rationale"]).then(async ({ hq_daily_plan_date, hq_daily_plan_tasks, hq_daily_plan_premortem, hq_daily_plan_rationale }) => {
      const hasKey = await ClaudeClient.hasKey();
      const statusEl = document.getElementById("daily-plan-status");
      const genBtn = document.getElementById("generate-plan-btn");
      const premortemEl = document.getElementById("daily-plan-premortem");
      const rationaleEl = document.getElementById("daily-plan-rationale");
      const readBtn = document.getElementById("read-plan-btn");

      if (!hasKey) {
        statusEl.textContent = "Add a Claude API key in Settings to enable daily planning.";
        list.innerHTML = "";
        premortemEl.innerHTML = "";
        if (rationaleEl) rationaleEl.innerHTML = "";
        if (readBtn) readBtn.classList.add("hidden");
        genBtn.disabled = true;
        return;
      }
      genBtn.disabled = false;

      const isToday = hq_daily_plan_date === this.todayKey();
      const tasks = hq_daily_plan_tasks || [];

      if (!isToday || !tasks.length) {
        statusEl.textContent = "No plan generated for today yet.";
        list.innerHTML = "";
        premortemEl.innerHTML = "";
        if (rationaleEl) rationaleEl.innerHTML = "";
        if (readBtn) readBtn.classList.add("hidden");
        return;
      }

      if (isToday && hq_daily_plan_premortem) {
        const p = hq_daily_plan_premortem;
        premortemEl.innerHTML = `${Icons.span("triangle-alert")} <b>Pre-mortem:</b> today's plan (${p.plannedTotal}min) runs ${p.pctOver}% heavier than what you've historically completed on days like this (~${p.historicalAvg}min). Most likely to slip: <b>${escapeHtml(p.likelyFailPoint || "the largest task")}</b>. Worth trimming now rather than finding out at 9pm.`;
      } else {
        premortemEl.innerHTML = "";
      }

      await this.renderFailurePatternBanner();
      await this.renderTaxonomyPending();

      // Persisted rationale from generation time — plain text, no cursor
      // (the live cursor only exists during the streaming call itself,
      // wired in init()/the click handler, not here).
      if (rationaleEl) rationaleEl.textContent = hq_daily_plan_rationale || "";

      // Read-aloud button only appears when there's both a key AND real
      // text to read — no point showing it over an empty rationale (e.g.
      // the stream failed silently last generation).
      if (readBtn) {
        const canRead = (await ElevenLabsClient.hasKey()) && !!(hq_daily_plan_rationale || "").trim();
        readBtn.classList.toggle("hidden", !canRead);
      }

      const totalMin = tasks.reduce((s, t) => s + (t.minutes || 0), 0);
      const doneMin = tasks.filter(t => t.done).reduce((s, t) => s + (t.minutes || 0), 0);
      statusEl.textContent = `${(doneMin / 60).toFixed(1)}h / ${(totalMin / 60).toFixed(1)}h done today`;

      list.innerHTML = tasks.map(t => `
        <li class="plan-item ${t.done ? "done" : ""}" data-id="${t.id}">
          <div class="task-check">${t.done ? Icons.span("check") : ""}</div>
          <div class="plan-body">
            <div class="plan-objective">${escapeHtml(t.objective)}</div>
            <div class="plan-meta">${escapeHtml(t.venture)} · ${t.minutes}min${t.context ? " · " + escapeHtml(t.context) : ""}</div>
          </div>
        </li>
      `).join("");

      list.querySelectorAll(".plan-item").forEach(el => {
        el.querySelector(".task-check").onclick = async () => {
          await this.toggleTask(el.dataset.id);
          this.render();
        };
      });
    });
  },

  async renderFailurePatternBanner() {
    const el = document.getElementById("failure-pattern-banner");
    if (!el) return;
    const insight = await this.getFailurePatternInsight();
    if (!insight) { el.innerHTML = ""; return; }
    el.innerHTML = `${Icons.span("triangle-alert")} <b>Pattern:</b> ${insight.count} of your last ${insight.sampleSize} unfinished tasks were tagged "<b>${escapeHtml(insight.reason)}</b>." Worth naming before it happens again.`;
  },

  async renderTaxonomyPending() {
    const container = document.getElementById("failure-taxonomy-pending");
    if (!container) return;
    const pending = await this.getPendingTaxonomy();
    if (!pending.length) { container.innerHTML = ""; return; }

    container.innerHTML = `
      <div class="settings-group">
        <h3>Yesterday's leftovers</h3>
        <p class="settings-note">Didn't get done — worth a quick reason, or skip it. Purely for spotting your own patterns over time, nothing else reads this.</p>
        ${pending.map(p => `
          <div class="taxonomy-pending-item" data-id="${p.id}">
            <div class="capture-text">${escapeHtml(p.objective)}</div>
            <div class="taxonomy-reason-buttons">
              ${this.FAILURE_REASONS.map(r => `<button class="taxonomy-reason-btn" data-id="${p.id}" data-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`).join("")}
              <button class="taxonomy-dismiss-btn" data-id="${p.id}" title="Skip — don't categorize this one">${Icons.span("x")}</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    container.querySelectorAll(".taxonomy-reason-btn").forEach(btn => {
      btn.onclick = async () => {
        await this.tagFailureReason(btn.dataset.id, btn.dataset.reason);
        this.render();
      };
    });
    container.querySelectorAll(".taxonomy-dismiss-btn").forEach(btn => {
      btn.onclick = async () => {
        await this.dismissPendingTaxonomy(btn.dataset.id);
        this.render();
      };
    });
  },

  // Wires a streaming onToken callback into a live-updating DOM element
  // with a blinking cursor, used by both the manual button click and the
  // silent auto-generate-on-load path so streaming isn't a button-only
  // feature. Returns the callback to pass into generate().
  wireLiveRationale() {
    const rationaleEl = document.getElementById("daily-plan-rationale");
    if (!rationaleEl) return null;
    rationaleEl.innerHTML = `<span class="stream-text"></span><span class="stream-cursor"></span>`;
    const streamTextEl = rationaleEl.querySelector(".stream-text");
    return (chunk, fullSoFar) => { streamTextEl.textContent = fullSoFar; };
  },

  _currentAudio: null, // tracks in-flight/playing ElevenLabs audio so a second click stops it instead of overlapping

  wireReadAloud() {
    const readBtn = document.getElementById("read-plan-btn");
    if (!readBtn) return;

    readBtn.onclick = async () => {
      // Second click while already playing (or loading) stops it — this is
      // a toggle, not a queue.
      if (this._currentAudio) {
        this._currentAudio.pause();
        this._currentAudio = null;
        readBtn.innerHTML = `<span class="icon-inline" data-icon="volume-2"></span> Read it to me`;
        if (typeof Icons !== "undefined") Icons.apply(readBtn.querySelector(".icon-inline") || readBtn, "volume-2");
        return;
      }

      const { hq_daily_plan_rationale } = await chrome.storage.local.get("hq_daily_plan_rationale");
      const text = hq_daily_plan_rationale || "";
      if (!text.trim()) return;

      readBtn.disabled = true;
      readBtn.innerHTML = `<span class="icon-inline" data-icon="loader-circle"></span> Loading…`;
      if (typeof Icons !== "undefined") Icons.apply(readBtn.querySelector(".icon-inline") || readBtn, "loader-circle");

      try {
        const audio = await ElevenLabsClient.synthesize(text);
        this._currentAudio = audio;
        readBtn.disabled = false;
        readBtn.innerHTML = `<span class="icon-inline" data-icon="volume-2"></span> Stop`;
        if (typeof Icons !== "undefined") Icons.apply(readBtn.querySelector(".icon-inline") || readBtn, "volume-2");

        audio.addEventListener("ended", () => {
          this._currentAudio = null;
          readBtn.innerHTML = `<span class="icon-inline" data-icon="volume-2"></span> Read it to me`;
          if (typeof Icons !== "undefined") Icons.apply(readBtn.querySelector(".icon-inline") || readBtn, "volume-2");
        });
        audio.play();
      } catch (e) {
        console.error("Read-aloud failed:", e);
        this._currentAudio = null;
        readBtn.disabled = false;
        readBtn.innerHTML = `<span class="icon-inline" data-icon="volume-2"></span> Read it to me`;
        if (typeof Icons !== "undefined") Icons.apply(readBtn.querySelector(".icon-inline") || readBtn, "volume-2");
        if (typeof Wallpaper !== "undefined") Wallpaper.toast(`Couldn't read the plan aloud: ${e.message}`);
      }
    };
  },

  async init() {
    document.getElementById("generate-plan-btn").onclick = async () => {
      const btn = document.getElementById("generate-plan-btn");
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.classList.add("loading");
      btn.innerHTML = Spinner.html(14) + "Generating…";
      document.getElementById("daily-plan-status").textContent = "Generating…";
      const onRationaleToken = this.wireLiveRationale();
      const result = await this.generate({ silent: false, onRationaleToken });
      if (!result.ok && result.reason === "no-tasks") {
        document.getElementById("daily-plan-status").textContent = "No open tasks in the library to plan from.";
        const rationaleEl = document.getElementById("daily-plan-rationale");
        if (rationaleEl) rationaleEl.innerHTML = "";
      }
      btn.classList.remove("loading");
      btn.textContent = originalLabel;
      this.render(); // re-enables/disables the button, and replaces the live-streamed text with the final persisted version (drops the cursor)
    };
    this.wireReadAloud();
    this.render();

    if (await ClaudeClient.hasKey() && !(await this.isTodaysPlanReady())) {
      document.getElementById("daily-plan-status").textContent = "Generating today's plan…";
      const onRationaleToken = this.wireLiveRationale();
      await this.generate({ silent: true, onRationaleToken });
      this.render();
    }
  },
};
