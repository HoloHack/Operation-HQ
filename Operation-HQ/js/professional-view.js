// professional-view.js — different from Privacy Mode. Privacy Mode says
// "something is hidden here." Professional View makes the Daily
// Non-Negotiables/streak/gamification layer not exist at all in the
// rendered page — for when you're screen-sharing with a Momentum Academy
// co-founder or a Sydney Web Studio client and the dashboard should read as
// a clean project tracker, not a 15-year-old's homework/habit app. Also
// filters Operation HQ down to ventures you've marked "professional."

const ProfessionalView = {
  meta: {}, // in-memory cache so Tasks.render() can filter synchronously

  async loadMeta() {
    const { hq_venture_meta } = await chrome.storage.local.get("hq_venture_meta");
    this.meta = hq_venture_meta || {};
  },

  // Default: everything is hidden in Professional View except Sydney Web
  // Studio, unless explicitly overridden per-venture in Settings.
  PROFESSIONAL_DEFAULTS: ["Sydney Web Studio"],

  isPersonal(venture) {
    if (venture in this.meta) return !!this.meta[venture].personal;
    return !this.PROFESSIONAL_DEFAULTS.includes(venture);
  },

  async setPersonal(venture, personal) {
    this.meta[venture] = { personal };
    await chrome.storage.local.set({ hq_venture_meta: this.meta });
  },

  async enter() {
    ModeTransitions?.play?.("professional", "Professional view", "Personal layers secured");
    document.body.classList.add("pro-mode");
    document.getElementById("pro-view-btn")?.setAttribute("aria-pressed", "true");
    Tasks.render();
    if (typeof VentureDashboard !== "undefined") VentureDashboard.render();
  },

  exit() {
    ModeTransitions?.play?.("professional", "Full HQ restored", "All workspaces visible");
    document.body.classList.remove("pro-mode");
    document.getElementById("pro-view-btn")?.setAttribute("aria-pressed", "false");
    Tasks.render();
    if (typeof VentureDashboard !== "undefined") VentureDashboard.render();
  },

  isActive() {
    return document.body.classList.contains("pro-mode");
  },

  async renderVentureToggles() {
    const container = document.getElementById("venture-personal-list");
    if (!container) return;
    const ventures = Tasks.ventures || [];
    container.innerHTML = ventures.map(v => {
      const personal = this.isPersonal(v);
      return `<label class="venture-personal-row"><input type="checkbox" data-venture="${escapeAttribute(v)}" ${personal ? "checked" : ""}> ${escapeHtml(v)} <span class="settings-note" style="display:inline;">${personal ? "(hidden in Professional View)" : "(shown)"}</span></label>`;
    }).join("");

    container.querySelectorAll("input").forEach(cb => {
      cb.onchange = async (e) => {
        await this.setPersonal(e.target.dataset.venture, e.target.checked);
        this.renderVentureToggles();
        if (this.isActive()) Tasks.render();
      };
    });
  },

  async init() {
    await this.loadMeta();
    document.getElementById("pro-view-btn").onclick = () => {
      this.isActive() ? this.exit() : this.enter();
      document.getElementById("pro-view-btn").classList.toggle("active", this.isActive());
      document.getElementById("pro-view-btn").setAttribute("aria-pressed", String(this.isActive()));
    };
    this.renderVentureToggles();
  },
};
