// completion-detection.js — renders the "looks done?" banner for tasks
// background.js has been passively tracking (tab focus + elapsed time only,
// never page content). Purely a UI layer; all the actual tracking logic
// lives in background.js's completion-tick alarm.

const CompletionDetection = {
  async render() {
    const container = document.getElementById("completion-banner");
    if (!container) return;

    const { hq_completion_prompts, hq_tasks } = await chrome.storage.local.get(["hq_completion_prompts", "hq_tasks"]);
    const prompts = hq_completion_prompts || [];
    const tasks = hq_tasks || [];

    const pending = prompts
      .map(id => tasks.find(t => t.id === id))
      .filter(t => t && !t.done);

    if (!pending.length) {
      container.innerHTML = "";
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");

    container.innerHTML = pending.map(t => {
      const mins = Math.round((t.trackedSeconds || 0) / 60);
      return `
        <div class="completion-card" data-id="${t.id}">
          <span>${Icons.span("bot")} You've spent ~${mins}m on "<b>${escapeHtml(t.text)}</b>" (est ${t.estMinutes}m) — looks close to done?</span>
          <div class="completion-actions">
            <button class="c-done">Mark done</button>
            <button class="c-still">Still working</button>
            <button class="c-stop">Stop tracking</button>
          </div>
        </div>`;
    }).join("");

    container.querySelectorAll(".completion-card").forEach(card => {
      const id = card.dataset.id;
      card.querySelector(".c-done").onclick = () => this.resolve(id, "done");
      card.querySelector(".c-still").onclick = () => this.resolve(id, "still");
      card.querySelector(".c-stop").onclick = () => this.resolve(id, "stop");
    });
  },

  async resolve(id, action) {
    const { hq_completion_prompts, hq_tasks } = await chrome.storage.local.get(["hq_completion_prompts", "hq_tasks"]);
    const prompts = (hq_completion_prompts || []).filter(x => x !== id);
    const tasks = hq_tasks || [];
    const t = tasks.find(x => x.id === id);

    if (t) {
      if (action === "done") {
        t.done = true;
        t.activeSince = null;
        t.trackUrl = null;
      } else if (action === "still") {
        // don't re-prompt until another 20% of estimate accumulates
        t.promptShown = false;
        t.estMinutes = Math.round(t.estMinutes * 1.2);
      } else if (action === "stop") {
        t.activeSince = null;
        t.trackUrl = null;
      }
    }

    await chrome.storage.local.set({ hq_completion_prompts: prompts, hq_tasks: tasks });
    this.render();
    Tasks.data = tasks;
    Tasks.render();
  },

  init() {
    this.render();
    // Background.js updates this roughly once a minute — poll gently so a
    // freshly-crossed threshold shows up without needing a tab reopen.
    setInterval(() => this.render(), 30000);
  },
};
