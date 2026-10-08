// forgotten-bookmark.js — surfaces one bookmark you saved a while ago and
// probably haven't looked at since, refreshed daily. Lives inside the
// Bookmark Sorter panel rather than the always-visible layer — this stays
// genuinely connected to your own saved content (not a generic filler
// widget), but doesn't compete for space with the two core panels.

const ForgottenBookmark = {
  MIN_AGE_DAYS: 14,

  async getAllBookmarksFlat() {
    const tree = await chrome.bookmarks.getTree();
    const nodes = [];
    const walk = (n) => n.forEach(x => {
      if (x.url) nodes.push(x);
      if (x.children) walk(x.children);
    });
    walk(tree[0].children);
    return nodes;
  },

  async pickOne() {
    const all = await this.getAllBookmarksFlat();
    const cutoff = Date.now() - this.MIN_AGE_DAYS * 86400000;
    const pool = all.filter(b => (b.dateAdded || 0) < cutoff);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  },

  todayKey() {
    return hqLocalDateKey();
  },

  async getTodaysPick() {
    const { hq_forgotten_pick } = await chrome.storage.local.get("hq_forgotten_pick");
    if (hq_forgotten_pick?.date === this.todayKey()) return hq_forgotten_pick.bookmark;
    const pick = await this.pickOne();
    await chrome.storage.local.set({ hq_forgotten_pick: { date: this.todayKey(), bookmark: pick } });
    return pick;
  },

  domainOf(url) {
    try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
  },

  async render() {
    const el = document.getElementById("forgotten-bookmark-card");
    if (!el) return;
    const pick = await this.getTodaysPick();
    if (!pick) {
      el.innerHTML = "";
      el.classList.add("hidden");
      return;
    }
    el.classList.remove("hidden");
    const days = Math.floor((Date.now() - (pick.dateAdded || 0)) / 86400000);
    // escapeHtml on the href too, not just the visible text — bookmark URLs
    // come from the user's own browser data, not arbitrary web content, but
    // an unescaped quote in a URL (e.g. from an imported/synced bookmark)
    // could still break out of the attribute. Cheap to guard against either way.
    el.innerHTML = `
      <span>${Icons.span("pin")} Remember this? <a href="${escapeAttribute(pick.url)}" target="_blank" rel="noopener">${escapeHtml(pick.title || pick.url)}</a>
      <span class="forgotten-meta">${escapeHtml(this.domainOf(pick.url))} · saved ${days}d ago</span></span>
      <button id="forgotten-shuffle-btn" title="Show a different one">${Icons.span("shuffle")}</button>
    `;
    document.getElementById("forgotten-shuffle-btn").onclick = async (e) => {
      e.preventDefault();
      const newPick = await this.pickOne();
      await chrome.storage.local.set({ hq_forgotten_pick: { date: this.todayKey(), bookmark: newPick } });
      this.render();
    };
  },

  init() {
    this.render();
  },
};
