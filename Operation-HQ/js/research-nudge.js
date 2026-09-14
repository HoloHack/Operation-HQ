// research-nudge.js — the buildable slice of "notice what I keep coming
// back to and suggest researching it," scoped honestly.
//
// research-link.js's header comment explicitly flagged this as unbuilt:
// "would need real pattern analysis over notes/tasks... a genuinely
// bigger undertaking." This is that analysis, built on the data that was
// actually available without a new trust boundary:
//
//   - Notes, Tasks, and the Capture inbox — all local, already in
//     chrome.storage, already readable by this extension.
//   - Deliberately NOT actual browser/search history. That would need a
//     new "history" permission — a real, visible new ask at install/
//     update time — which is a decision Shourya should make explicitly,
//     not something this module quietly assumes. If that's wanted later,
//     this module's matching logic mostly carries over; only
//     gatherEntries() would need a chrome.history.search() branch.
//   - Deliberately NOT Idea Vault. Vault's entire premise is "this text
//     never leaves the device" — a nudge that ends in a one-click
//     Perplexity open would quietly break that promise, so Vault entries
//     are excluded from analysis entirely, not just from the outbound
//     query. Same boundary research-link.js already draws.
//
// What it actually does: a plain word-frequency check, not real topic
// modeling. If a distinctive word (4+ letters, not a stopword) shows up
// in 3+ SEPARATE entries within the last two weeks, that's treated as a
// real pattern (repeating across entries, not just repeated within one
// long note) and surfaced once, quietly, with a real Perplexity query
// pre-filled from the most recent entry that mentioned it. No local AI,
// no phrase-level clustering — that's the real §1/§7 roadmap idea and
// still isn't built. This is the honest, buildable slice under it.
//
// Opt-in, default OFF (Settings → Integrations), and hard rate-limited:
// once a word has been shown (accepted OR dismissed), it's suppressed
// for 7 days regardless, so this can't nag on every new tab.

const ResearchNudge = {
  STOPWORDS: new Set([
    "this", "that", "with", "from", "have", "just", "your", "about", "there",
    "their", "would", "could", "should", "which", "where", "when", "what",
    "been", "were", "they", "them", "then", "than", "also", "into", "onto",
    "over", "under", "after", "before", "today", "tomorrow", "yesterday",
    "still", "really", "very", "some", "more", "most", "much", "many",
    "need", "needs", "needed", "want", "wants", "wanted", "make", "made",
    "making", "like", "going", "done", "doing", "task", "tasks", "note",
    "notes", "will", "must", "these", "those", "here", "does", "doesn",
    "isn", "aren", "wasn", "each", "such", "only", "even", "once",
  ]),
  MIN_WORD_LEN: 4,
  MIN_SOURCES: 3,          // must appear in 3+ distinct entries to count as a real pattern
  COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,   // 7 days
  LOOKBACK_MS: 14 * 24 * 60 * 60 * 1000,  // 14 days

  async isEnabled() {
    const { hq_research_nudge_enabled } = await chrome.storage.local.get("hq_research_nudge_enabled");
    return hq_research_nudge_enabled === true; // opt-in, default OFF
  },

  tokenize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= this.MIN_WORD_LEN && !this.STOPWORDS.has(w) && !/^\d+$/.test(w));
  },

  // Entries: { text, ts }. Notes aren't individually timestamped in
  // storage (it's one free-text block), so every line in Notes is
  // treated as "recent" — a real limitation, not hidden: a note written
  // months ago can still contribute to a pattern today. Tasks and
  // Capture items DO have real timestamps and are filtered to the
  // lookback window properly.
  async gatherEntries() {
    const cutoff = Date.now() - this.LOOKBACK_MS;
    const entries = [];

    const { hq_notes, hq_capture_inbox, hq_tasks } = await chrome.storage.local.get([
      "hq_notes", "hq_capture_inbox", "hq_tasks",
    ]);

    (hq_notes || "").split("\n").forEach(line => {
      const t = line.replace(/^[•\-*]\s*/, "").trim();
      if (t) entries.push({ text: t, ts: Date.now() });
    });

    (hq_capture_inbox || []).forEach(item => {
      const ts = item.timestamp || 0;
      if (ts >= cutoff && (item.text || "").trim()) entries.push({ text: item.text, ts });
    });

    (hq_tasks || []).forEach(t => {
      const ts = t.created || 0;
      if (ts >= cutoff && (t.text || "").trim()) entries.push({ text: t.text, ts });
    });

    return entries;
  },

  // Returns the most-repeated qualifying word plus the most recent entry
  // that mentioned it (used as the actual Perplexity query — a single
  // word is a weak search, the full sentence it came from is a real one).
  findPattern(entries) {
    const wordToEntryIdx = {}; // word -> Set of entry indices it appears in

    entries.forEach((e, i) => {
      const uniqueWordsInThisEntry = new Set(this.tokenize(e.text));
      uniqueWordsInThisEntry.forEach(w => {
        if (!wordToEntryIdx[w]) wordToEntryIdx[w] = new Set();
        wordToEntryIdx[w].add(i);
      });
    });

    let best = null;
    for (const [word, idxSet] of Object.entries(wordToEntryIdx)) {
      if (idxSet.size >= this.MIN_SOURCES && (!best || idxSet.size > best.count)) {
        best = { word, count: idxSet.size, idxSet };
      }
    }
    if (!best) return null;

    let mostRecentIdx = -1, mostRecentTs = -1;
    best.idxSet.forEach(i => {
      if (entries[i].ts >= mostRecentTs) { mostRecentTs = entries[i].ts; mostRecentIdx = i; }
    });

    return { word: best.word, count: best.count, sampleText: entries[mostRecentIdx].text };
  },

  async getDismissed() {
    const { hq_research_nudge_dismissed } = await chrome.storage.local.get("hq_research_nudge_dismissed");
    return hq_research_nudge_dismissed || {}; // word -> last-shown timestamp
  },

  async check() {
    if (!(await this.isEnabled())) return null;

    const entries = await this.gatherEntries();
    if (entries.length < this.MIN_SOURCES) return null;

    const pattern = this.findPattern(entries);
    if (!pattern) return null;

    const dismissed = await this.getDismissed();
    const lastShown = dismissed[pattern.word];
    if (lastShown && Date.now() - lastShown < this.COOLDOWN_MS) return null;

    return pattern;
  },

  async suppress(word) {
    const dismissed = await this.getDismissed();
    dismissed[word] = Date.now();
    // cap so this map can't grow unbounded over a very long install
    const words = Object.keys(dismissed);
    if (words.length > 200) {
      words.sort((a, b) => dismissed[a] - dismissed[b]);
      words.slice(0, words.length - 200).forEach(w => delete dismissed[w]);
    }
    await chrome.storage.local.set({ hq_research_nudge_dismissed: dismissed });
  },

  async render() {
    const el = document.getElementById("research-nudge");
    if (!el) return;

    let pattern = null;
    try { pattern = await this.check(); }
    catch (e) { console.error("Research Nudge check failed:", e); }

    if (!pattern) { el.classList.add("hidden"); el.innerHTML = ""; return; }

    el.classList.remove("hidden");
    el.innerHTML = `
      <span class="nudge-text">You've mentioned "<strong>${escapeHtml(pattern.word)}</strong>" a few times lately — worth researching?</span>
      <button id="nudge-yes-btn" class="nudge-btn" title="Opens Perplexity in a new tab with this pre-filled">${Icons.span("search")} Research it</button>
      <button id="nudge-dismiss-btn" class="nudge-btn nudge-dismiss" title="Dismiss">${Icons.span("x")}</button>
    `;

    // Hide immediately on click (synchronous) rather than waiting on the
    // storage write first — chrome.storage.local.set() is fast but async,
    // and there's no reason to make the UI feel laggy waiting on it. The
    // suppress() write still happens, just not blocking the visual update.
    document.getElementById("nudge-yes-btn").onclick = () => {
      ResearchLink.open(pattern.sampleText);
      el.classList.add("hidden");
      this.suppress(pattern.word).catch(e => console.error("Research Nudge suppress failed:", e));
    };
    document.getElementById("nudge-dismiss-btn").onclick = () => {
      el.classList.add("hidden");
      this.suppress(pattern.word).catch(e => console.error("Research Nudge suppress failed:", e));
    };
  },
};
