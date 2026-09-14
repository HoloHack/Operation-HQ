// chrome-optimizer.js — opt-in tab suspender. Unlike Chrome's built-in
// Memory Saver, nothing is ever suspended without you explicitly checking
// it and clicking Suspend — no surprise reloads mid-form.

const ChromeOptimizer = {
  INACTIVE_THRESHOLD_MS: 15 * 60 * 1000,

  async getLastActivityMap() {
    const { hq_tab_activity } = await chrome.storage.local.get("hq_tab_activity");
    return hq_tab_activity || {};
  },

  normalizedUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch { return url || ""; }
  },

  async getReviewTabs() {
    const activity = await this.getLastActivityMap();
    const tabs = await chrome.tabs.query({});
    const now = Date.now();
    const counts = new Map();
    tabs.forEach(tab => {
      const key = this.normalizedUrl(tab.url);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    return tabs
      .filter(t => !t.active && !t.discarded && !t.pinned && !t.audible)
      .map(t => {
        const last = activity[t.id] || t.lastAccessed || now;
        const inactiveMs = now - last;
        return { id: t.id, title: t.title, url: t.url, favIconUrl: t.favIconUrl, inactiveMs, duplicate: (counts.get(this.normalizedUrl(t.url)) || 0) > 1 };
      })
      .filter(t => t.duplicate || t.inactiveMs >= this.INACTIVE_THRESHOLD_MS)
      .sort((a, b) => Number(b.duplicate) - Number(a.duplicate) || b.inactiveMs - a.inactiveMs);
  },

  formatDuration(ms) {
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  },

  domainOf(url) {
    try { return new URL(url).hostname; } catch { return url || "unknown"; }
  },

  async render() {
    const list = document.getElementById("optimizer-list");
    const summary = document.getElementById("optimizer-summary");
    if (!list) return;

    const inactive = await this.getReviewTabs();
    const allTabs = await chrome.tabs.query({});
    const duplicateCount = inactive.filter(tab => tab.duplicate).length;
    const staleCount = inactive.filter(tab => tab.inactiveMs >= this.INACTIVE_THRESHOLD_MS).length;
    summary.textContent = `${allTabs.length} tabs open · ${duplicateCount} duplicate · ${staleCount} inactive 15+ min`;

    if (!inactive.length) {
      list.innerHTML = '<li class="empty-state">Nothing inactive long enough to suggest suspending.</li>';
      document.getElementById("suspend-selected-btn").disabled = true;
      return;
    }

    list.innerHTML = inactive.map(t => `
      <li class="optimizer-item" data-id="${t.id}">
        <input type="checkbox" class="optimizer-check">
        <img class="optimizer-favicon" src="${escapeAttribute(t.favIconUrl || '')}" alt="">
        <div class="optimizer-info">
          <div class="optimizer-title">${escapeHtml(t.title || t.url || "")}${t.duplicate ? '<span class="optimizer-reason">Duplicate</span>' : ''}</div>
          <div class="optimizer-domain">${escapeHtml(this.domainOf(t.url))} · inactive ${this.formatDuration(t.inactiveMs)}</div>
        </div>
      </li>
    `).join("");

    // Inline onerror="..." attributes are blocked by MV3's default CSP
    // (script-src 'self', no unsafe-inline) — a real bug this shipped
    // with, not just a theoretical risk. Same effect, wired the same way
    // every other handler in this codebase is: assigned as a JS property
    // after the element exists.
    list.querySelectorAll(".optimizer-favicon").forEach(img => {
      img.onerror = () => { img.style.visibility = "hidden"; };
    });

    document.getElementById("suspend-selected-btn").disabled = false;
  },

  async suspendSelected() {
    const checked = [...document.querySelectorAll(".optimizer-item")]
      .filter(li => li.querySelector(".optimizer-check").checked)
      .map(li => parseInt(li.dataset.id));
    if (!checked.length) return;
    for (const id of checked) {
      try { await chrome.tabs.discard(id); } catch (e) { /* tab may already be gone */ }
    }
    document.getElementById("optimizer-status").textContent = `Suspended ${checked.length} tab(s).`;
    this.render();
  },

  async init() {
    document.getElementById("suspend-selected-btn").onclick = () => this.suspendSelected();
    document.getElementById("select-all-inactive").onclick = () => {
      document.querySelectorAll(".optimizer-check").forEach(c => c.checked = true);
    };
    document.getElementById("refresh-optimizer-btn").onclick = () => this.render();
    const reviewTab = document.getElementById("optimizer-review-tab");
    const workspacesTab = document.getElementById("optimizer-workspaces-tab");
    const setView = view => {
      const review = view === "review";
      document.getElementById("optimizer-review-view").classList.toggle("hidden", !review);
      document.getElementById("optimizer-workspaces-view").classList.toggle("hidden", review);
      reviewTab.classList.toggle("active", review);
      workspacesTab.classList.toggle("active", !review);
      reviewTab.setAttribute("aria-selected", String(review));
      workspacesTab.setAttribute("aria-selected", String(!review));
      reviewTab.tabIndex = review ? 0 : -1;
      workspacesTab.tabIndex = review ? -1 : 0;
    };
    reviewTab.onclick = () => setView("review");
    workspacesTab.onclick = () => setView("workspaces");
    document.querySelector(".optimizer-tabs").onkeydown = event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = event.target === reviewTab ? workspacesTab : reviewTab;
      next.click();
      next.focus();
    };
    await Workspaces.init();
    this.render();
  },
};
