// venture-dashboard.js — Per-Venture Dashboards (Roadmap §6, H1).
//
// Reuses the venture-tagging system already built for Professional View
// (Tasks.ventures, the same list every task's venture dropdown pulls
// from) rather than a separate hardcoded venture list — add a venture in
// the task form and it shows up here automatically, no code change
// needed. Every number here is computed live from Tasks.data (open/done
// counts, the 7-day chart, the recent-completions list) — nothing is a
// separately-maintained shadow copy that could drift out of sync.

const VentureDashboard = {
  selected: null,
  chart: null,
  metricsChart: null,
  metrics: [], // all ventures' revenue/business-metric entries, loaded once and filtered per-venture in render

  // Same filter Tasks.render() already applies (see tasks.js) — a
  // dashboard that ignored Professional View would defeat the entire
  // point of it: showing personal ventures to a client mid-screen-share
  // because the dashboard happened to be open instead of the task list.
  visibleVentures() {
    const all = Tasks.ventures || [];
    if (typeof ProfessionalView === "undefined" || !ProfessionalView.isActive()) return all;
    return all.filter(v => !ProfessionalView.isPersonal(v));
  },

  async init() {
    const { hq_venture_dash_selected, hq_venture_metrics } = await chrome.storage.local.get(["hq_venture_dash_selected", "hq_venture_metrics"]);
    this.selected = (hq_venture_dash_selected && Tasks.ventures.includes(hq_venture_dash_selected))
      ? hq_venture_dash_selected
      : (Tasks.ventures[0] || null);
    this.metrics = hq_venture_metrics || [];
    this.renderTabs();
    this.render();

    const addBtn = document.getElementById("venture-metric-add-btn");
    if (addBtn) addBtn.onclick = () => this.addMetricFromForm();
    const reportBtn = document.getElementById("venture-report-btn");
    if (reportBtn) reportBtn.onclick = () => this.showReport();

    const reportModal = document.getElementById("venture-report-modal");
    const closeBtn = document.getElementById("venture-report-close");
    if (closeBtn) closeBtn.onclick = () => this.closeReport();
    const copyBtn = document.getElementById("venture-report-copy");
    if (copyBtn) {
      copyBtn.onclick = async () => {
        const text = document.getElementById("venture-report-text").value;
        try {
          await navigator.clipboard.writeText(text);
          Wallpaper?.toast?.("Report copied to clipboard.");
        } catch (e) {
          // Clipboard API can fail without a user-activation context in
          // some edge cases — the textarea itself is always readable and
          // selectable regardless, so this never leaves someone stuck.
          console.warn("Clipboard write failed:", e.message);
          Wallpaper?.toast?.("Couldn't copy automatically — select the text and copy manually.");
        }
      };
    }
  },

  async select(venture) {
    this.selected = venture;
    await chrome.storage.local.set({ hq_venture_dash_selected: venture });
    this.renderTabs();
    this.render();
  },

  renderTabs() {
    const el = document.getElementById("venture-dash-tabs");
    if (!el) return;
    el.innerHTML = this.visibleVentures().map(v =>
      `<button class="venture-dash-tab ${v === this.selected ? "active" : ""}" data-v="${escapeAttribute(v)}">${escapeHtml(v)}</button>`
    ).join("");
    el.querySelectorAll("button").forEach(b => {
      b.onclick = () => this.select(b.dataset.v);
    });
  },

  ventureTasks() {
    if (!this.selected) return [];
    return Tasks.data.filter(t => t.venture === this.selected);
  },

  render() {
    // Ventures can be added/removed elsewhere (task form, Settings) while
    // this panel isn't open, and Professional View can toggle at any
    // time — re-validate the selection against what's actually VISIBLE
    // right now, every render, rather than trusting stale state.
    const visible = this.visibleVentures();
    if (!this.selected || !visible.includes(this.selected)) this.selected = visible[0] || null;
    this.renderTabs();

    const stats = document.getElementById("venture-dash-stats");
    if (!this.selected) {
      const proHidingEverything = typeof ProfessionalView !== "undefined" && ProfessionalView.isActive() && Tasks.ventures.length > 0;
      stats.innerHTML = proHidingEverything
        ? '<p class="settings-note">Every venture is marked personal, so Professional View has nothing to show here.</p>'
        : '<p class="settings-note">No ventures yet — add one from the "+ Venture" field in the task form.</p>';
      document.getElementById("venture-dash-open-list").innerHTML = "";
      document.getElementById("venture-dash-recent-list").innerHTML = "";
      if (this.chart) { this.chart.destroy(); this.chart = null; }
      if (this.metricsChart) { this.metricsChart.destroy(); this.metricsChart = null; }
      const metricsList = document.getElementById("venture-metrics-list");
      if (metricsList) metricsList.innerHTML = "";
      return;
    }

    const tasks = this.ventureTasks();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const weekAgo = Date.now() - 7 * 86400000;

    const open = tasks.filter(t => !t.done).length;
    const doneToday = tasks.filter(t => t.done && t.completedAt && t.completedAt >= todayStart.getTime()).length;
    const doneWeek = tasks.filter(t => t.done && t.completedAt && t.completedAt >= weekAgo).length;
    const doneTotal = tasks.filter(t => t.done).length;

    stats.innerHTML = `
      <div class="venture-stat-card"><strong>${open}</strong><span>Open</span></div>
      <div class="venture-stat-card"><strong>${doneToday}</strong><span>Done Today</span></div>
      <div class="venture-stat-card"><strong>${doneWeek}</strong><span>Done This Week</span></div>
      <div class="venture-stat-card"><strong>${doneTotal}</strong><span>Total Completed</span></div>
    `;

    this.renderChart(tasks);
    this.renderLists(tasks);
    this.renderMetrics();
  },

  renderChart(tasks) {
    const canvas = document.getElementById("venture-dash-canvas");
    if (!canvas || typeof Chart === "undefined") return;

    const days = [];
    const d = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(d);
      day.setDate(d.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const dayStart = day.getTime();
      const dayEnd = dayStart + 86400000;
      const count = tasks.filter(t => t.done && t.completedAt && t.completedAt >= dayStart && t.completedAt < dayEnd).length;
      days.push({ label: day.toLocaleDateString([], { weekday: "short" }), count });
    }

    if (this.chart) this.chart.destroy();
    this.chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: days.map(d => d.label),
        datasets: [{ label: this.selected, data: days.map(d => d.count), backgroundColor: "#4da6ff" }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: "#a0a0b0" } },
          y: { beginAtZero: true, ticks: { color: "#a0a0b0", stepSize: 1 }, grid: { color: "rgba(255,255,255,0.06)" } },
        },
        plugins: { legend: { display: false } },
      },
    });
  },

  renderLists(tasks) {
    const openList = document.getElementById("venture-dash-open-list");
    const openTasks = tasks.filter(t => !t.done);
    openList.innerHTML = openTasks.length
      ? openTasks.map(t => `<li class="capture-item"><div class="capture-text">${escapeHtml(t.text)}</div></li>`).join("")
      : '<li class="empty-state">Nothing open for this venture.</li>';

    const recentList = document.getElementById("venture-dash-recent-list");
    const recent = tasks.filter(t => t.done && t.completedAt).sort((a, b) => b.completedAt - a.completedAt).slice(0, 5);
    recentList.innerHTML = recent.length
      ? recent.map(t => `
          <li class="capture-item">
            <div class="capture-text">${escapeHtml(t.text)}<br>
              <span style="font-size:11px; color:var(--text-dim);">${new Date(t.completedAt).toLocaleDateString()}</span>
            </div>
          </li>`).join("")
      : '<li class="empty-state">Nothing completed yet.</li>';
  },

  // --- Revenue / business-metric tracking (Roadmap §6, H2) ---
  // Manual-entry ledger per venture, reusing the same Chart.js already
  // bundled for the completion chart above — no new library needed, as
  // the roadmap specifically called for.

  metricsFor(venture) {
    return this.metrics
      .filter(m => m.venture === venture)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  async addMetricFromForm() {
    if (!this.selected) return;
    const dateEl = document.getElementById("venture-metric-date");
    const mrrEl = document.getElementById("venture-metric-mrr");
    const clientsEl = document.getElementById("venture-metric-clients");
    const hoursEl = document.getElementById("venture-metric-hours");

    const date = dateEl.value || hqLocalDateKey();
    const mrr = parseFloat(mrrEl.value);
    const clientCount = parseInt(clientsEl.value, 10);
    const hoursBilled = parseFloat(hoursEl.value);

    // At least one real number required — an entry with every field blank
    // isn't a data point, it's an accidental empty click.
    if ([mrr, clientCount, hoursBilled].every(v => Number.isNaN(v))) {
      Wallpaper?.toast?.("Enter at least one number (MRR, clients, or hours) to log an entry.");
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      venture: this.selected,
      date,
      mrr: Number.isNaN(mrr) ? null : mrr,
      clientCount: Number.isNaN(clientCount) ? null : clientCount,
      hoursBilled: Number.isNaN(hoursBilled) ? null : hoursBilled,
    };
    this.metrics.push(entry);
    await chrome.storage.local.set({ hq_venture_metrics: this.metrics });

    mrrEl.value = ""; clientsEl.value = ""; hoursEl.value = "";
    this.renderMetrics();
  },

  async deleteMetric(id) {
    this.metrics = this.metrics.filter(m => m.id !== id);
    await chrome.storage.local.set({ hq_venture_metrics: this.metrics });
    this.renderMetrics();
  },

  renderMetrics() {
    const list = document.getElementById("venture-metrics-list");
    if (!list || !this.selected) return;

    const entries = this.metricsFor(this.selected);
    list.innerHTML = entries.length
      ? entries.slice().reverse().map(m => `
          <li class="capture-item" data-id="${m.id}">
            <div class="capture-text">
              ${new Date(m.date).toLocaleDateString()} —
              ${m.mrr != null ? `$${m.mrr.toLocaleString()} MRR` : ""}
              ${m.clientCount != null ? ` · ${m.clientCount} clients` : ""}
              ${m.hoursBilled != null ? ` · ${m.hoursBilled}h billed` : ""}
            </div>
            <button class="metric-delete-btn" data-id="${escapeAttribute(m.id)}" title="Delete entry" aria-label="Delete metric entry">${Icons.span("x")}</button>
          </li>`).join("")
      : '<li class="empty-state">No revenue/metric entries logged for this venture yet.</li>';

    list.querySelectorAll(".metric-delete-btn").forEach(b => {
      b.onclick = () => this.deleteMetric(b.dataset.id);
    });

    this.renderMetricsChart(entries);
  },

  renderMetricsChart(entries) {
    const canvas = document.getElementById("venture-metrics-canvas");
    if (!canvas || typeof Chart === "undefined") return;

    const withMrr = entries.filter(m => m.mrr != null);
    if (this.metricsChart) { this.metricsChart.destroy(); this.metricsChart = null; }
    if (withMrr.length < 2) return; // a trend line needs at least 2 points to mean anything

    this.metricsChart = new Chart(canvas, {
      type: "line",
      data: {
        labels: withMrr.map(m => new Date(m.date).toLocaleDateString([], { month: "short", day: "numeric" })),
        datasets: [{ label: "MRR", data: withMrr.map(m => m.mrr), borderColor: "#4da6ff", backgroundColor: "rgba(77,166,255,0.15)", fill: true, tension: 0.25 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { color: "#a0a0b0" } },
          y: { beginAtZero: true, ticks: { color: "#a0a0b0", callback: (v) => `$${v}` }, grid: { color: "rgba(255,255,255,0.06)" } },
        },
        plugins: { legend: { display: false } },
      },
    });
  },

  // --- Client/co-founder-safe reporting export (Roadmap §6, H2) ---
  // A plain-text weekly-update summary, generated from data this panel is
  // ALREADY only showing for non-personal ventures (visibleVentures()
  // already applies Professional View's filter before a venture ever
  // becomes selectable here) — so a report generated from the currently
  // selected venture inherits that same privacy boundary automatically,
  // rather than needing a second, separately-maintained filter that could
  // drift out of sync with the first one.
  generateReport() {
    if (!this.selected) return "";
    const tasks = this.ventureTasks();
    const weekAgo = Date.now() - 7 * 86400000;
    const doneThisWeek = tasks.filter(t => t.done && t.completedAt && t.completedAt >= weekAgo);
    const openCount = tasks.filter(t => !t.done).length;
    const entries = this.metricsFor(this.selected);
    const latest = entries[entries.length - 1];

    const lines = [
      `${this.selected} — Weekly Update`,
      new Date().toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }),
      "",
      `Completed this week (${doneThisWeek.length}):`,
      ...(doneThisWeek.length ? doneThisWeek.map(t => `  - ${t.text}`) : ["  (nothing marked complete this week)"]),
      "",
      `Currently open: ${openCount}`,
    ];

    if (latest) {
      lines.push("", "Latest metrics:");
      if (latest.mrr != null) lines.push(`  MRR: $${latest.mrr.toLocaleString()}`);
      if (latest.clientCount != null) lines.push(`  Clients: ${latest.clientCount}`);
      if (latest.hoursBilled != null) lines.push(`  Hours billed: ${latest.hoursBilled}`);
      lines.push(`  (as of ${new Date(latest.date).toLocaleDateString()})`);
    }

    return lines.join("\n");
  },

  showReport() {
    const modal = document.getElementById("venture-report-modal");
    const textarea = document.getElementById("venture-report-text");
    if (!modal || !textarea) return;
    textarea.value = this.generateReport();
    modal.classList.remove("hidden");
    modal.removeAttribute("inert");
    modal.setAttribute("aria-hidden", "false");
    this._reportPreviousFocus = document.activeElement;
    document.getElementById("venture-report-copy")?.focus();
    modal.onkeydown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); this.closeReport(); }
      else trapFocus(event, modal);
    };
  },

  closeReport() {
    const modal = document.getElementById("venture-report-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("inert", "");
    modal.setAttribute("aria-hidden", "true");
    modal.onkeydown = null;
    if (this._reportPreviousFocus instanceof HTMLElement) this._reportPreviousFocus.focus();
    this._reportPreviousFocus = null;
  },
};
