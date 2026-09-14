// deepwork.js — Deep Work UI (Roadmap §3, H1): the topbar toggle button
// and the blocked-site list in Settings.
//
// This file never touches chrome.declarativeNetRequest directly — it only
// writes hq_deepwork_active / hq_deepwork_sites to storage. background.js
// is the single place that actually installs/removes the blocking rules
// (see applyDeepWorkRules() there), triggered reactively via
// chrome.storage.onChanged. That keeps exactly one source of truth for
// the real blocking mechanism, and means this UI can't ever drift out of
// sync with what's actually being blocked.

const DeepWork = {
  sites: [],
  jsDisabledSites: [],
  active: false,

  async init() {
    const s = await chrome.storage.local.get(["hq_deepwork_sites", "hq_deepwork_active", "hq_deepwork_js_disabled_sites"]);
    this.sites = s.hq_deepwork_sites || [];
    this.jsDisabledSites = s.hq_deepwork_js_disabled_sites || [];
    this.active = !!s.hq_deepwork_active;
    this.renderSiteList();
    this.renderJsDisableSiteList();
    this.renderToggle();

    document.getElementById("deepwork-btn").onclick = () => this.toggle();
    document.getElementById("add-deepwork-site-btn").onclick = () => this.addFromInput();
    document.getElementById("new-deepwork-site-input").onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.addFromInput(); }
    };
    document.getElementById("add-deepwork-jsdisable-site-btn").onclick = () => this.addJsDisableFromInput();
    document.getElementById("new-deepwork-jsdisable-site-input").onkeydown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); this.addJsDisableFromInput(); }
    };

    // Keep this tab's UI correct even if Deep Work was toggled from a
    // different open tab/window's settings drawer.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.hq_deepwork_sites) { this.sites = changes.hq_deepwork_sites.newValue || []; this.renderSiteList(); }
      if (changes.hq_deepwork_js_disabled_sites) { this.jsDisabledSites = changes.hq_deepwork_js_disabled_sites.newValue || []; this.renderJsDisableSiteList(); }
      if (changes.hq_deepwork_active) { this.active = !!changes.hq_deepwork_active.newValue; this.renderToggle(); }
    });
  },

  // Accepts "youtube.com", "www.youtube.com", "https://youtube.com/watch?..."
  // — anything a person would naturally type or paste — and reduces it to
  // a bare domain. Reuses Classifier's existing URL-parsing logic (rule 8)
  // rather than re-implementing domain extraction here.
  //
  // Also rejects anything that isn't shaped like a real domain (no dot —
  // "youtube" instead of "youtube.com", a typo Classifier.domainOf() would
  // otherwise happily accept as-is). Without this, a fat-fingered entry
  // would silently show up as "added" in the list while never actually
  // matching any real request — declarativeNetRequest's requestDomains
  // does suffix matching, so "youtube" never matches traffic to
  // "www.youtube.com". Better to reject it up front than let Deep Work
  // quietly protect against nothing.
  normalizeDomain(raw) {
    const trimmed = (raw || "").trim();
    if (!trimmed) return null;
    const withScheme = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const domain = Classifier.domainOf(withScheme);
    const looksLikeADomain = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(domain || "");
    return looksLikeADomain ? domain : null;
  },

  addFromInput() {
    const input = document.getElementById("new-deepwork-site-input");
    const domain = this.normalizeDomain(input.value);
    if (!domain) { Wallpaper?.toast?.("That doesn't look like a valid site."); return; }
    if (this.sites.includes(domain)) { input.value = ""; return; }
    this.sites.push(domain);
    this.save();
    input.value = "";
  },

  removeSite(domain) {
    this.sites = this.sites.filter(d => d !== domain);
    this.save();
  },

  async save() {
    await chrome.storage.local.set({ hq_deepwork_sites: this.sites });
    this.renderSiteList();
  },

  addJsDisableFromInput() {
    const input = document.getElementById("new-deepwork-jsdisable-site-input");
    const domain = this.normalizeDomain(input.value);
    if (!domain) { Wallpaper?.toast?.("That doesn't look like a valid site."); return; }
    if (this.jsDisabledSites.includes(domain)) { input.value = ""; return; }
    this.jsDisabledSites.push(domain);
    this.saveJsDisableSites();
    input.value = "";
  },

  removeJsDisableSite(domain) {
    this.jsDisabledSites = this.jsDisabledSites.filter(d => d !== domain);
    this.saveJsDisableSites();
  },

  async saveJsDisableSites() {
    await chrome.storage.local.set({ hq_deepwork_js_disabled_sites: this.jsDisabledSites });
    this.renderJsDisableSiteList();
  },

  async toggle() {
    this.active = !this.active;
    ModeTransitions?.play?.("deepwork", this.active ? "Deep Work online" : "Deep Work released", this.active ? "Attention perimeter deployed" : "Normal browsing restored");
    await chrome.storage.local.set({ hq_deepwork_active: this.active });
    this.renderToggle();
    Wallpaper?.toast?.(this.active
      ? (this.sites.length ? "Deep Work on — blocked sites are unreachable until you turn it off." : "Deep Work on — add sites in Settings to actually block anything.")
      : "Deep Work off.");
  },

  renderToggle() {
    const button = document.getElementById("deepwork-btn");
    button.classList.toggle("active", this.active);
    button.setAttribute("aria-pressed", String(this.active));
  },

  renderSiteList() {
    const list = document.getElementById("deepwork-site-list");
    if (!list) return;
    list.innerHTML = this.sites.map(d =>
      `<span class="venture-chip">${escapeHtml(d)}<button data-domain="${escapeAttribute(d)}" aria-label="Remove ${escapeAttribute(d)}">${Icons.span("x")}</button></span>`
    ).join("") || '<p class="settings-note" style="margin:4px 0 0;">No sites added yet — Deep Work has nothing to block until you add some.</p>';
    list.querySelectorAll("button").forEach(b => {
      b.onclick = () => this.removeSite(b.dataset.domain);
    });
  },

  renderJsDisableSiteList() {
    const list = document.getElementById("deepwork-jsdisable-site-list");
    if (!list) return;
    list.innerHTML = this.jsDisabledSites.map(d =>
      `<span class="venture-chip">${escapeHtml(d)}<button data-domain="${escapeAttribute(d)}" aria-label="Remove ${escapeAttribute(d)}">${Icons.span("x")}</button></span>`
    ).join("") || '<p class="settings-note" style="margin:4px 0 0;">No sites added yet.</p>';
    list.querySelectorAll("button").forEach(b => {
      b.onclick = () => this.removeJsDisableSite(b.dataset.domain);
    });
  },
};
