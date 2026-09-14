// idea-radar.js — periodic check for whether your venture names/concepts
// are showing up elsewhere, using Claude's server-side web search tool
// through your own API key. This is a real web search, not a guess —
// Anthropic's API executes it server-side and returns synthesized results
// in one call. Manual trigger by default (uses your API credits); a weekly
// auto-check is opt-in in Settings, same pattern as Today's Plan.

const IdeaRadar = {
  systemPrompt() {
    return `You check whether a person's project/business names are being used elsewhere online, to catch potential idea overlap early. For each name given, search and report ONLY genuinely relevant matches — a different product, business, or public project using the same or a very similar name/concept, from the last few months preferably. Ignore: results about the person's own existing presence if it happens to be indexed, generic dictionary-word coincidences, and anything clearly unrelated. Paraphrase what you find in your own words — one or two sentences per finding, no direct quotes. If nothing concerning turns up for a name, say so briefly. Keep the whole report concise.`;
  },

  async getVentureNames() {
    const { hq_ventures } = await chrome.storage.local.get("hq_ventures");
    // filter out generic/non-distinctive names that would just produce noise
    const GENERIC = ["School / ATAR", "Fitness", "Chess", "Daily", "Cross Country / Fitness", "Academics", "Languages"];
    return (hq_ventures || []).filter(v => !GENERIC.includes(v));
  },

  async run({ silent = true } = {}) {
    if (!(await ClaudeClient.hasKey())) return { ok: false, reason: "no-key" };
    const names = await this.getVentureNames();
    if (!names.length) return { ok: false, reason: "no-ventures" };

    try {
      const report = await ClaudeClient.callWithTools(
        this.systemPrompt(),
        `Check these project/business names: ${names.join(", ")}`,
        [{ type: "web_search_20250305", name: "web_search" }],
        1500
      );
      await chrome.storage.local.set({
        hq_radar_report: report,
        hq_radar_checked_at: Date.now(),
        hq_radar_names: names,
      });
      return { ok: true, report };
    } catch (e) {
      console.error("Idea Radar check failed:", e);
      if (!silent && typeof Wallpaper !== "undefined") Wallpaper.toast(`Radar check failed: ${e.message}`);
      return { ok: false, reason: "api-error", error: e.message };
    }
  },

  async render() {
    const el = document.getElementById("radar-report");
    const statusEl = document.getElementById("radar-status");
    if (!el) return;
    const { hq_radar_report, hq_radar_checked_at, hq_radar_names } = await chrome.storage.local.get(
      ["hq_radar_report", "hq_radar_checked_at", "hq_radar_names"]
    );
    const hasKey = await ClaudeClient.hasKey();
    document.getElementById("radar-run-btn").disabled = !hasKey;

    if (!hasKey) {
      statusEl.textContent = "Add a Claude API key in Settings to enable Idea Radar.";
      el.textContent = "";
      return;
    }
    if (!hq_radar_report) {
      statusEl.textContent = "Never checked yet.";
      el.textContent = "";
      return;
    }
    const ago = Math.round((Date.now() - hq_radar_checked_at) / 86400000);
    statusEl.textContent = `Last checked ${ago === 0 ? "today" : ago + "d ago"} · watching: ${(hq_radar_names || []).join(", ")}`;
    el.textContent = hq_radar_report;
  },

  init() {
    document.getElementById("radar-run-btn").onclick = async () => {
      const btn = document.getElementById("radar-run-btn");
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.classList.add("loading");
      btn.innerHTML = Spinner.html(14) + "Searching…";
      document.getElementById("radar-status").textContent = "Searching… (this uses your API key and takes longer than a normal call)";
      await this.run({ silent: false });
      btn.classList.remove("loading");
      btn.textContent = originalLabel;
      this.render(); // re-enables the button based on the real hasKey check
    };
    document.getElementById("toggle-radar-weekly").onchange = (e) => {
      chrome.storage.local.set({ hq_radar_weekly_enabled: e.target.checked });
    };
    chrome.storage.local.get("hq_radar_weekly_enabled").then(({ hq_radar_weekly_enabled }) => {
      document.getElementById("toggle-radar-weekly").checked = !!hq_radar_weekly_enabled;
    });
    this.render();
  },
};
