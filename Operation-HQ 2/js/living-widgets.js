// living-widgets.js — the ambient, reactive surface for Operation HQ.
// Widgets are projections of the existing modules. They never maintain a
// second task, weather, schedule, habit, focus, or Gmail database.

const LivingWidgets = {
  VISIBILITY_KEY: "hq_widget_visibility_v1",
  ORDER_KEY: "hq_widget_order_v1",
  widgetNames: ["briefing", "weather", "focus", "schedule", "assessment", "inbox", "habits"],
  arrangeGroups: [["briefing"], ["weather", "focus"], ["schedule", "assessment", "inbox", "habits"]],
  _renderTimer: null,
  _rendering: false,
  _initialized: false,
  arranging: false,
  draggedName: null,

  el(id) {
    return document.getElementById(id);
  },

  localDateKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },

  setText(id, value) {
    const element = this.el(id);
    if (element) element.textContent = value ?? "";
  },

  setState(id, state) {
    const element = this.el(id);
    if (element) element.dataset.state = state;
  },

  dayPhase() {
    const hour = new Date().getHours();
    if (hour < 5) return { key: "late", label: "Late-night clarity" };
    if (hour < 9) return { key: "morning", label: "Morning launch" };
    if (hour < 12) return { key: "build", label: "Momentum window" };
    if (hour < 15) return { key: "midday", label: "Midday control" };
    if (hour < 18) return { key: "afternoon", label: "Afternoon push" };
    if (hour < 22) return { key: "evening", label: "Evening close" };
    return { key: "late", label: "Wind-down horizon" };
  },

  async renderBriefing() {
    const saved = await chrome.storage.local.get(["hq_current_focus_task","hq_assignments_v1"]);
    const focus = saved.hq_current_focus_task;
    const block = typeof Today !== "undefined" ? Today.currentScheduleBlock() : null;
    const next = typeof Today !== "undefined" ? Today.chooseNextTask(block, focus?.id) : null;
    if (typeof Today !== "undefined") Today.nextTask = next?.task || null;
    const open = typeof Tasks !== "undefined" ? Tasks.data.filter(task => !task.done) : [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = this.localDateKey(tomorrow);
    const tomorrowEvents = typeof Calendar !== "undefined" ? (Calendar.events[tomorrowKey] || []).length : 0;
    const tomorrowBlocks = typeof Schedule !== "undefined" && Schedule.active
      ? Schedule.blocksFor(Schedule.active, SCHEDULE_DAY_KEYS[tomorrow.getDay()], tomorrow).length
      : 0;
    const phase = this.dayPhase();
    const context = typeof ContextBus !== "undefined" ? ContextBus.get() : {};
    const active = open.find(task => task.id === context.activeTaskId);
    const assignments = (Array.isArray(saved.hq_assignments_v1) ? saved.hq_assignments_v1 : []).filter(item => !item.done && item.dueDate).sort((a,b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    const nearestAssignment = assignments[0];
    const assignmentSignal = this.el("widget-assignment-signal");
    if (assignmentSignal) {
      assignmentSignal.classList.toggle("hidden",!nearestAssignment);
      if (nearestAssignment) {
        const due = new Date(`${nearestAssignment.dueDate}T12:00:00`);
        const today = new Date(); today.setHours(12,0,0,0);
        const days = Math.ceil((due - today) / 86400000);
        assignmentSignal.textContent = `${nearestAssignment.subject} · ${days < 0 ? "overdue" : days === 0 ? "due today" : `${days}d remaining`}`;
        assignmentSignal.dataset.risk = days <= 2 ? "high" : "steady";
      }
    }

    this.setText("widget-briefing-phase", active ? `${phase.label} · active now` : phase.label);
    this.setText("widget-next-title", next?.task?.text || "Your runway is clear");
    this.setText("widget-next-reason", next
      ? `${next.task.venture ? `${next.task.venture} · ` : ""}${next.reasons.length ? `Recommended because it is ${next.reasons.join(", ")}.` : "This is the oldest clear commitment."}`
      : "No unfinished tasks are competing for attention.");
    this.setText("widget-open-count", String(open.length));
    const tomorrowAssignments = assignments.filter(item => item.dueDate === tomorrowKey).length;
    this.setText("widget-tomorrow-count", String(tomorrowEvents + tomorrowBlocks + tomorrowAssignments));
    this.el("widget-start-next").disabled = !next;
    this.el("widget-complete-next").disabled = !next;
    this.setState("widget-briefing", context.pomodoroRunning ? "engaged" : next ? "ready" : "clear");
  },

  weatherState(code, isDay) {
    if ([95, 96, 99].includes(code)) return "storm";
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
    if ([71, 73, 75].includes(code)) return "snow";
    if ([45, 48].includes(code)) return "fog";
    if ([1, 2, 3].includes(code)) return "cloud";
    return isDay === 0 ? "night" : "clear";
  },

  async renderWeather() {
    const saved = await chrome.storage.local.get(["hq_weather_location", "hq_weather_cache"]);
    const location = saved.hq_weather_location;
    let data = saved.hq_weather_cache?.data || null;
    if (!data && location && typeof Weather !== "undefined") data = await Weather.getCachedOrFetch();
    if (!location || !data?.current) {
      this.el("widget-weather-icon").innerHTML = Icons.span("map-pin");
      this.setText("widget-weather-temp", "—");
      this.setText("widget-weather-condition", location ? "Weather is temporarily unavailable" : "Location has not been set");
      this.setText("widget-weather-location", location?.name || "Open weather settings");
      this.setText("widget-weather-range", "—");
      this.setState("widget-weather", "idle");
      return;
    }
    const settings = await Weather.settings();
    const info = Weather.codeInfo(data.current.weather_code);
    const state = this.weatherState(data.current.weather_code, data.current.is_day);
    this.el("widget-weather-icon").innerHTML = Icons.span(info.icon);
    this.setText("widget-weather-temp", Weather.formatTemperature(data.current.temperature_2m, settings.unit));
    this.setText("widget-weather-condition", info.label);
    this.setText("widget-weather-location", location.name || "Current location");
    const high = data.daily?.temperature_2m_max?.[0];
    const low = data.daily?.temperature_2m_min?.[0];
    this.setText("widget-weather-range", Number.isFinite(high) && Number.isFinite(low)
      ? `${Weather.formatTemperature(high, settings.unit)} / ${Weather.formatTemperature(low, settings.unit)}`
      : "");
    this.setState("widget-weather", state);
    document.body.dataset.weather = state;
  },

  renderFocus() {
    if (typeof Pomodoro === "undefined") return;
    const modeMinutes = Number(this.el("pomo-mode")?.value || 25);
    const total = Math.max(60, modeMinutes * 60);
    const progress = Math.max(0, Math.min(1, 1 - Pomodoro.seconds / total));
    const minutes = Math.floor(Pomodoro.seconds / 60).toString().padStart(2, "0");
    const seconds = (Pomodoro.seconds % 60).toString().padStart(2, "0");
    this.setText("widget-focus-time", `${minutes}:${seconds}`);
    this.setText("widget-focus-state", Pomodoro.running ? "Locked in" : progress > 0 ? "Paused" : "Ready");
    this.setText("widget-focus-toggle", Pomodoro.running ? "Pause focus" : progress > 0 ? "Resume focus" : `Begin ${modeMinutes} minutes`);
    this.el("widget-focus-dial")?.style.setProperty("--progress", String(progress));
    this.setState("widget-focus", Pomodoro.running ? "running" : progress > 0 ? "paused" : "idle");
    const deepWorkActive = (typeof DeepWork !== "undefined" && DeepWork.active) || (typeof ContextBus !== "undefined" && ContextBus.get().deepWork);
    document.body.classList.toggle("context-focus", Pomodoro.running || deepWorkActive);
  },

  scheduleSnapshot() {
    if (typeof Schedule === "undefined" || !Schedule.active) return null;
    const now = new Date();
    const blocks = Schedule.blocksFor(Schedule.active, SCHEDULE_DAY_KEYS[now.getDay()], now);
    const minute = now.getHours() * 60 + now.getMinutes();
    const toMinute = value => {
      const [hours, minutes] = String(value || "0:0").split(":").map(Number);
      return hours * 60 + minutes;
    };
    const index = blocks.findIndex(block => minute >= toMinute(block.s) && minute < toMinute(block.e));
    const current = index >= 0 ? blocks[index] : null;
    const next = current ? blocks[index + 1] : blocks.find(block => toMinute(block.s) > minute);
    const progress = current
      ? (minute - toMinute(current.s)) / Math.max(1, toMinute(current.e) - toMinute(current.s))
      : 0;
    return { current, next, progress };
  },

  renderSchedule() {
    const snapshot = this.scheduleSnapshot();
    const current = snapshot?.current;
    const next = snapshot?.next;
    this.setText("widget-schedule-time", current ? `${current.s}–${current.e}` : "Open time");
    this.setText("widget-schedule-current", current?.t || "No active schedule block");
    this.setText("widget-schedule-detail", current?.d || (next ? "A clear buffer before the next block." : "Nothing else is scheduled today."));
    this.setText("widget-schedule-next", next ? `${next.s} · ${next.t}` : "Clear");
    const progressPercent = Math.round((snapshot?.progress || 0) * 100);
    this.el("widget-schedule-fill")?.style.setProperty("width", `${progressPercent}%`);
    this.el("widget-schedule")?.style.setProperty("--schedule-progress", `${progressPercent}%`);
    this.setText("widget-schedule-progress", current ? `${Math.round(snapshot.progress * 100)}%` : "");
    this.setState("widget-schedule", current ? "active" : next ? "waiting" : "clear");
  },

  async renderAssessment() {
    const saved = await chrome.storage.local.get(["hq_assessment_intake_v1", "hq_assignments_v1"]);
    const intake = (Array.isArray(saved.hq_assessment_intake_v1) ? saved.hq_assessment_intake_v1 : []).filter(item => item?.analysis && item.state !== "dismissed");
    const pending = intake.filter(item => item.state === "pending");
    const accepted = intake.filter(item => item.state === "accepted");
    const tracked = (Array.isArray(saved.hq_assignments_v1) ? saved.hq_assignments_v1 : []).filter(item => !item.done && item.dueDate);
    const dateValue = item => item?.analysis?.dueDate || item?.dueDate || "9999-12-31";
    const nearest = [...pending, ...accepted].sort((a, b) => dateValue(a).localeCompare(dateValue(b)))[0] || null;
    const analysis = nearest?.analysis;
    this.setText("widget-assessment-count", String(pending.length));
    this.setText("widget-assessment-label", pending.length ? `${pending.length} file${pending.length === 1 ? "" : "s"} need review` : tracked.length ? `${tracked.length} tracked deadline${tracked.length === 1 ? "" : "s"}` : "No files waiting");
    this.setText("widget-assessment-title", analysis?.title || tracked.sort((a,b) => a.dueDate.localeCompare(b.dueDate))[0]?.title || "Intake is clear");
    let dueLabel = "Connect Downloads when you want automatic detection.";
    if (analysis?.dueDate) {
      const due = new Date(`${analysis.dueDate}T12:00:00`);
      const today = new Date(); today.setHours(12,0,0,0);
      const days = Math.ceil((due - today) / 86400000);
      dueLabel = `${analysis.subject} · ${days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "due today" : `${days} days remaining`}`;
    } else if (nearest) dueLabel = "Deadline not found — review the source file.";
    this.setText("widget-assessment-due", dueLabel);
    this.setText("widget-assessment-source", nearest?.sourceRead ? "File analysed locally" : nearest ? "Metadata detected" : "Local-only");
    const start = this.el("widget-assessment-start");
    start.disabled = !nearest;
    start.dataset.intakeId = nearest?.id || "";
    start.textContent = nearest?.state === "accepted" ? "Start next step" : nearest ? "Review intake" : "Start next step";
    this.setState("widget-assessment", pending.length ? "attention" : tracked.length ? "active" : "idle");
    this.el("widget-assessment-dot")?.classList.toggle("attention", pending.length > 0);
  },

  gmailHeader(message, name) {
    return (message?.payload?.headers || []).find(item => item.name?.toLowerCase() === name)?.value?.trim() || "";
  },

  async renderInbox() {
    const saved = await chrome.storage.local.get(["hq_gmail_connected", "hq_gmail_cache_v1"]);
    const cache = saved.hq_gmail_cache_v1;
    const messages = Array.isArray(cache?.messages) ? cache.messages : [];
    const unread = messages.filter(message => message.labelIds?.includes("UNREAD"));
    this.setText("widget-inbox-count", saved.hq_gmail_connected ? String(unread.length) : "—");
    this.setText("widget-inbox-label", saved.hq_gmail_connected
      ? unread.length ? `unread in the latest ${messages.length}` : "latest inbox view is clear"
      : "Gmail is not connected");
    const list = this.el("widget-inbox-list");
    list.replaceChildren();
    messages.slice(0, 2).forEach(message => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "widget-mail-row";
      const sender = this.gmailHeader(message, "from").replace(/\s*<[^>]+>\s*$/, "") || "Sender unavailable";
      const subject = this.gmailHeader(message, "subject") || "No subject";
      const senderEl = document.createElement("span");
      const subjectEl = document.createElement("strong");
      senderEl.textContent = sender;
      subjectEl.textContent = subject;
      button.append(senderEl, subjectEl);
      button.setAttribute("aria-label", `Open ${subject} from ${sender} in Gmail`);
      button.onclick = async () => {
        if (await LazyFeatures.ensure("gmail-flyout")) Gmail.openThread(message.threadId);
      };
      list.appendChild(button);
    });
    if (!messages.length) {
      const empty = document.createElement("p");
      empty.className = "widget-empty";
      empty.textContent = saved.hq_gmail_connected ? "Open Inbox to refresh the saved view." : "Connect Gmail from the Inbox module.";
      list.appendChild(empty);
    }
    this.setState("widget-inbox", !saved.hq_gmail_connected ? "offline" : unread.length ? "attention" : "clear");
    this.el("widget-inbox-dot")?.classList.toggle("attention", unread.length > 0);
  },

  async renderHabits() {
    if (typeof DailyTasks === "undefined" || !DailyTasks.today) return;
    const templates = DailyTasks.activeTemplates();
    const incomplete = templates.filter(template => !DailyTasks.isTemplateDone(template.id));
    const done = templates.length - incomplete.length;
    const percentage = templates.length ? Math.round(done / templates.length * 100) : 0;
    const next = incomplete[0];
    const constellation = this.el("widget-habit-constellation");
    constellation.replaceChildren(...templates.map((template, index) => {
      const point = document.createElement("i");
      point.style.setProperty("--i", String(index));
      point.classList.toggle("done", DailyTasks.isTemplateDone(template.id));
      return point;
    }));
    this.setText("widget-habit-score", `${percentage}%`);
    this.setText("widget-habit-label", next ? `${incomplete.length} rhythm${incomplete.length === 1 ? "" : "s"} still open` : "Daily rhythm complete");
    const streakRaw = this.el("daily-streak")?.textContent?.trim() || "0";
    const streak = Number.parseInt(streakRaw, 10) || 0;
    this.setText("widget-habit-streak", `${streak} day streak`);
    this.setText("widget-habit-next", next ? `Advance · ${next.text}` : "Everything complete");
    this.el("widget-habit-next").disabled = !next;
    this.el("widget-habit-next").dataset.templateId = next?.id || "";
    this.setState("widget-habits", next ? "active" : "complete");
  },

  applyEnvironment() {
    const phase = this.dayPhase();
    document.body.dataset.dayPhase = phase.key;
    document.documentElement.style.setProperty("--day-energy", ({ morning: ".84", build: "1", midday: ".94", afternoon: ".9", evening: ".72", late: ".58" })[phase.key] || ".8");
    const environment = {
      morning: [105, 211, 255],
      build: [78, 232, 190],
      midday: [96, 201, 255],
      afternoon: [255, 177, 91],
      evening: [160, 118, 255],
      late: [82, 112, 190],
    }[phase.key] || [124, 92, 255];
    document.documentElement.style.setProperty("--environment-rgb", environment.join(","));
  },

  async render() {
    if (this._rendering) return;
    this._rendering = true;
    try {
      this.applyEnvironment();
      await Promise.all([
        this.renderBriefing(),
        this.renderWeather(),
        this.renderInbox(),
        this.renderHabits(),
        this.renderAssessment(),
      ]);
      this.renderFocus();
      this.renderSchedule();
    } catch (error) {
      console.warn("Living widget refresh skipped:", error.message);
    } finally {
      this._rendering = false;
    }
  },

  queueRender() {
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => this.render(), 80);
  },

  async loadVisibility() {
    const saved = await chrome.storage.local.get(this.VISIBILITY_KEY);
    const visibility = saved[this.VISIBILITY_KEY] || {};
    this.widgetNames.forEach(name => {
      const visible = visibility[name] !== false;
      this.el(`widget-${name}`)?.classList.toggle("widget-disabled", !visible);
      const control = document.querySelector(`.widget-visibility-toggle[data-widget="${name}"]`);
      if (control) control.checked = visible;
    });
  },

  wireVisibility() {
    document.querySelectorAll(".widget-visibility-toggle").forEach(control => {
      control.onchange = async () => {
        const saved = await chrome.storage.local.get(this.VISIBILITY_KEY);
        const visibility = { ...(saved[this.VISIBILITY_KEY] || {}), [control.dataset.widget]: control.checked };
        await chrome.storage.local.set({ [this.VISIBILITY_KEY]: visibility });
        await this.loadVisibility();
      };
    });
  },

  normalizeOrder(value) {
    const supplied = Array.isArray(value) ? value.filter(name => this.widgetNames.includes(name)) : [];
    const unique = [...new Set(supplied)];
    return this.arrangeGroups.flatMap(group => [
      ...unique.filter(name => group.includes(name)),
      ...group.filter(name => !unique.includes(name)),
    ]);
  },

  applyOrder(value, animate = false) {
    const order = this.normalizeOrder(value);
    const canvas = this.el("widget-canvas");
    if (!canvas) return order;
    const mutate = () => order.forEach((name, index) => {
      const widget = this.el(`widget-${name}`);
      if (!widget) return;
      widget.dataset.slot = String(index + 1);
      widget.style.viewTransitionName = `hq-widget-${name}`;
      widget.style.setProperty("--widget-order", String(index));
      canvas.appendChild(widget);
    });
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches && document.startViewTransition) {
      try { document.startViewTransition(mutate); } catch { mutate(); }
    } else mutate();
    this.order = order;
    return order;
  },

  async loadOrder() {
    const saved = await chrome.storage.local.get(this.ORDER_KEY);
    return this.applyOrder(saved[this.ORDER_KEY]);
  },

  async saveOrder(order, animate = true) {
    const normalized = this.applyOrder(order, animate);
    await chrome.storage.local.set({ [this.ORDER_KEY]: normalized });
    const status = this.el("widget-order-status");
    if (status) status.textContent = "Layout saved on this device.";
  },

  decorateOrderControls() {
    this.widgetNames.forEach(name => {
      const widget = this.el(`widget-${name}`);
      if (!widget || widget.querySelector(":scope > .widget-order-controls")) return;
      const group = this.arrangeGroups.find(items => items.includes(name)) || [];
      if (group.length < 2) return;
      const controls = document.createElement("div");
      controls.className = "widget-order-controls";
      controls.setAttribute("aria-label", `Reorder ${name} widget`);

      const earlier = document.createElement("button");
      earlier.type = "button";
      earlier.dataset.direction = "-1";
      earlier.setAttribute("aria-label", `Move ${name} widget earlier`);
      Icons.apply(earlier, "chevron-left");

      const grip = document.createElement("span");
      grip.className = "widget-drag-grip";
      grip.setAttribute("aria-hidden", "true");
      grip.textContent = "⠿";

      const later = document.createElement("button");
      later.type = "button";
      later.dataset.direction = "1";
      later.setAttribute("aria-label", `Move ${name} widget later`);
      Icons.apply(later, "chevron-right");

      controls.append(earlier, grip, later);
      controls.addEventListener("click", event => event.stopPropagation());
      controls.querySelectorAll("button").forEach(button => {
        button.onclick = () => this.moveWidget(name, Number(button.dataset.direction));
      });
      widget.appendChild(controls);
    });
  },

  setArrangeMode(enabled) {
    this.arranging = Boolean(enabled);
    document.body.classList.toggle("widget-arrange-mode", this.arranging);
    const toggle = this.el("widget-arrange-toggle");
    if (toggle) {
      toggle.textContent = this.arranging ? "Finish arranging" : "Arrange widgets";
      toggle.setAttribute("aria-pressed", String(this.arranging));
    }
    this.widgetNames.forEach(name => {
      const widget = this.el(`widget-${name}`);
      if (!widget) return;
      widget.draggable = false;
      const grip = widget.querySelector(":scope > .widget-order-controls .widget-drag-grip");
      if (grip) grip.draggable = this.arranging;
    });
    const status = this.el("widget-order-status");
    if (status) status.textContent = this.arranging
      ? "Drag from the dotted grip or use the arrow controls. Press Escape when finished."
      : "Each widget keeps its data and behaviour when moved.";
  },

  async moveWidget(name, direction) {
    const order = this.normalizeOrder(this.order);
    const from = order.indexOf(name);
    const group = this.arrangeGroups.find(items => items.includes(name)) || [];
    const groupIndexes = order.map((item, index) => group.includes(item) ? index : -1).filter(index => index >= 0);
    const to = Math.max(groupIndexes[0], Math.min(groupIndexes.at(-1), from + direction));
    if (from < 0 || from === to) return;
    [order[from], order[to]] = [order[to], order[from]];
    await this.saveOrder(order);
  },

  wireArrangement() {
    this.decorateOrderControls();
    const toggle = this.el("widget-arrange-toggle");
    const reset = this.el("widget-order-reset");
    if (toggle) toggle.onclick = () => this.setArrangeMode(!this.arranging);
    if (reset) reset.onclick = async () => {
      await this.saveOrder(this.widgetNames);
      this.setArrangeMode(false);
      const status = this.el("widget-order-status");
      if (status) status.textContent = "Default widget layout restored.";
    };

    this.widgetNames.forEach(name => {
      const widget = this.el(`widget-${name}`);
      if (!widget) return;
      widget.addEventListener("dragstart", event => {
        if (!this.arranging || !event.target.closest?.(".widget-order-controls") || event.target.closest?.("button")) {
          event.preventDefault();
          return;
        }
        this.draggedName = name;
        widget.classList.add("widget-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", name);
      });
      widget.addEventListener("dragend", () => {
        this.draggedName = null;
        widget.classList.remove("widget-dragging");
        document.querySelectorAll(".widget-drop-target").forEach(item => item.classList.remove("widget-drop-target"));
      });
      widget.addEventListener("dragenter", () => {
        if (this.arranging && this.draggedName && this.draggedName !== name) widget.classList.add("widget-drop-target");
      });
      widget.addEventListener("dragleave", event => {
        if (!widget.contains(event.relatedTarget)) widget.classList.remove("widget-drop-target");
      });
    });

    const canvas = this.el("widget-canvas");
    canvas?.addEventListener("dragover", event => {
      if (!this.arranging || !this.draggedName) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    canvas?.addEventListener("drop", async event => {
      if (!this.arranging || !this.draggedName) return;
      event.preventDefault();
      const target = event.target.closest?.(".living-widget");
      const targetName = target?.id?.replace(/^widget-/, "");
      if (!targetName || targetName === this.draggedName || !this.widgetNames.includes(targetName)) return;
      const sameGroup = this.arrangeGroups.some(group => group.includes(targetName) && group.includes(this.draggedName));
      if (!sameGroup) {
        const status = this.el("widget-order-status");
        if (status) status.textContent = "That widget stays in its size-safe zone so cards cannot overlap or collapse.";
        return;
      }
      const order = this.normalizeOrder(this.order).filter(name => name !== this.draggedName);
      const targetIndex = order.indexOf(targetName);
      const rect = target.getBoundingClientRect();
      const before = Math.abs(event.clientY - (rect.top + rect.height / 2)) > Math.abs(event.clientX - (rect.left + rect.width / 2))
        ? event.clientY < rect.top + rect.height / 2
        : event.clientX < rect.left + rect.width / 2;
      order.splice(targetIndex + (before ? 0 : 1), 0, this.draggedName);
      await this.saveOrder(order);
      target.classList.remove("widget-drop-target");
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && this.arranging) this.setArrangeMode(false);
    });
  },

  async openPanel(panelId, trigger = null) {
    if (window.HQPanels?.open) return window.HQPanels.open(panelId, trigger);
    const proxy = document.querySelector(`.dock-btn[data-panel="${panelId}"]`);
    if (proxy) { proxy.click(); return true; }
    window.HQEarlyDiagnostics?.record?.("widget-route", `No route for ${panelId}`, "js/living-widgets.js");
    return false;
  },

  async init() {
    if (this._initialized) return;
    this._initialized = true;
    await this.loadOrder();
    await this.loadVisibility();
    this.wireVisibility();
    this.wireArrangement();
    document.querySelectorAll("[data-open-panel]").forEach(button => {
      button.addEventListener("click", event => this.openPanel(button.dataset.openPanel, event.currentTarget));
    });
    this.el("widget-start-next").onclick = async () => { await Today.startNext(); this.queueRender(); };
    this.el("widget-complete-next").onclick = async () => { await Today.completeNext(); this.queueRender(); };
    this.el("widget-focus-toggle").onclick = async () => { await Pomodoro.toggle(); this.queueRender(); };
    this.el("widget-habit-next").onclick = async event => {
      const id = event.currentTarget.dataset.templateId;
      if (id) await DailyTasks.bump(id, 1);
      this.queueRender();
    };
    this.el("widget-assessment-start").onclick = async event => {
      // Event.currentTarget is cleared after the first await in Chromium.
      // Snapshot the item ID while the click is still being dispatched.
      const intakeId = event.currentTarget.dataset.intakeId;
      const ready = await LazyFeatures.ensure("assignments-flyout");
      if (!ready) return;
      const item = AssessmentIntake.items.find(entry => entry.id === intakeId);
      if (item?.state === "accepted") await AssessmentIntake.startNow(item);
      else this.openPanel("assignments-flyout");
      this.queueRender();
    };
    if (typeof ContextBus !== "undefined") ContextBus.onChange(() => this.queueRender());
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const relevant = Object.keys(changes).some(key => /^(hq_tasks|hq_daily|hq_streak|hq_weather|hq_gmail|hq_followups|hq_calendar|hq_schedule|hq_context|hq_current_focus|hq_assignments|hq_assessment)/.test(key));
      if (relevant) this.queueRender();
    });
    PageScheduler.register("living-widgets", 60 * 1000, () => this.render());
    PageScheduler.register("living-focus", 1000, () => this.renderFocus());
    await this.render();
  },
};
