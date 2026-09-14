// capture.js — renders whatever's been right-click-captured from other
// pages (see background.js's context menu handler) and lets you turn each
// item into a task, a line in Notes, or dismiss it.

const Capture = {
  async render() {
    const list = document.getElementById("capture-list");
    const badge = document.getElementById("capture-count-badge");
    if (!list) return;
    const { hq_capture_inbox } = await chrome.storage.local.get("hq_capture_inbox");
    const inbox = hq_capture_inbox || [];

    if (badge) {
      badge.textContent = inbox.length || "";
      badge.classList.toggle("hidden", inbox.length === 0);
    }

    if (!inbox.length) {
      list.innerHTML = '<li class="empty-state">Nothing captured yet — right-click any text or page and choose "Add to Operation HQ."</li>';
      return;
    }

    // Local AI's "Summarize" action only appears once the model is
    // actually loaded THIS session (typeof-guarded since local-ai.js
    // could in principle be missing, and isLoadedThisSession() is a
    // cheap in-memory check, safe to call on every render tick).
    const localAiReady = typeof LocalAI !== "undefined" && LocalAI.isLoadedThisSession();

    list.innerHTML = inbox.map(item => `
      <li class="capture-item" data-id="${item.id}">
        <div class="capture-text">${escapeHtml(item.text || item.url || "")}</div>
        ${item.localSummary ? `<div class="capture-summary">${Icons.span("sparkles")} ${escapeHtml(item.localSummary)}</div>` : ""}
        <div class="capture-actions">
          <button class="cap-task">→ Task</button>
          <button class="cap-note">→ Note</button>
          ${ResearchLink.buttonHtml("cap-research")}
          ${localAiReady && !item.localSummary ? `<button class="cap-summarize" title="Local AI — private, offline, no cost">${Icons.span("sparkles")} Summarize</button>` : ""}
          <button class="cap-dismiss">${Icons.span("x")}</button>
        </div>
      </li>
    `).join("");

    list.querySelectorAll(".capture-item").forEach(el => {
      const id = el.dataset.id;
      const item = inbox.find(i => i.id === id);
      el.querySelector(".cap-task").onclick = () => this.toTask(id, item);
      el.querySelector(".cap-note").onclick = () => this.toNote(id, item);
      el.querySelector(".cap-research").onclick = () => ResearchLink.open(item.text || item.url || "");
      el.querySelector(".cap-dismiss").onclick = () => this.dismiss(id);
      const summarizeBtn = el.querySelector(".cap-summarize");
      if (summarizeBtn) summarizeBtn.onclick = () => this.summarizeLocally(id, item, summarizeBtn);
    });
  },

  async summarizeLocally(id, item, btnEl) {
    const original = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = `${Icons.span("loader-circle")} Summarizing…`;
    try {
      const summary = await LocalAI.summarize(item.text || item.url || "");
      const { hq_capture_inbox } = await chrome.storage.local.get("hq_capture_inbox");
      const inbox = hq_capture_inbox || [];
      const target = inbox.find(i => i.id === id);
      if (target) target.localSummary = summary;
      await chrome.storage.local.set({ hq_capture_inbox: inbox });
      this.render();
    } catch (e) {
      console.error("Local summarize failed:", e);
      btnEl.disabled = false;
      btnEl.innerHTML = original;
      if (typeof Wallpaper !== "undefined") Wallpaper.toast(`Local summarize failed: ${e.message}`);
    }
  },

  async removeFromInbox(id) {
    const { hq_capture_inbox } = await chrome.storage.local.get("hq_capture_inbox");
    const inbox = (hq_capture_inbox || []).filter(i => i.id !== id);
    await chrome.storage.local.set({ hq_capture_inbox: inbox });
  },

  async toTask(id, item) {
    Tasks.add(item.text || item.url, undefined, null);
    await this.removeFromInbox(id);
    this.render();
  },

  async toNote(id, item) {
    await NotesEditor.appendExternal(item.text || item.url, "capture-inbox");
    await this.removeFromInbox(id);
    this.render();
  },

  async dismiss(id) {
    await this.removeFromInbox(id);
    this.render();
  },

  init() {
    this.render();
    setInterval(() => this.render(), 15000); // pick up captures made while a tab was already open
  },
};
