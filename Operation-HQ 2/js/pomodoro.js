// pomodoro.js — simple focus timer, resets on tab close (by design — keep it lightweight)
const Pomodoro = {
  CONTEXT_KEY: "hq_focus_context_v1",
  seconds: 25 * 60,
  interval: null,
  running: false,
  focusLabel: "",
  saveTimer: null,

  async init() {
    const saved = await chrome.storage.local.get(this.CONTEXT_KEY);
    this.focusLabel = String(saved[this.CONTEXT_KEY] || "").trim().slice(0, 160);
    const input = document.getElementById("focus-context-input");
    if (input) {
      input.value = this.focusLabel;
      input.oninput = event => {
        this.focusLabel = String(event.target.value || "").trimStart().slice(0, 160);
        this.renderMission();
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.saveMission(), 320);
      };
      input.onchange = () => this.saveMission();
    }
    this.render();
    this.renderMission();
    document.getElementById("pomo-start").onclick = () => this.toggle();
    document.getElementById("pomo-reset").onclick = () => this.reset();
    document.getElementById("pomo-mode").onchange = (e) => {
      this.seconds = parseInt(e.target.value) * 60;
      this.render();
    };
    await this.publishContext();
  },

  cleanMission(value = this.focusLabel) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
  },

  async saveMission() {
    this.focusLabel = this.cleanMission();
    const input = document.getElementById("focus-context-input");
    if (input && input.value !== this.focusLabel) input.value = this.focusLabel;
    await chrome.storage.local.set({ [this.CONTEXT_KEY]: this.focusLabel });
    await this.publishContext();
    this.renderMission();
  },

  async publishContext() {
    if (typeof ContextBus === "undefined") return;
    try { await ContextBus.patch({ focusLabel: this.focusLabel || null }); } catch (error) { console.warn("Focus context sync skipped:", error.message); }
  },

  renderMission() {
    const readout = document.getElementById("focus-mission-readout");
    if (readout) readout.textContent = this.cleanMission() || "Name what you are moving forward";
  },

  async setMission(label, { suggestTheme = true } = {}) {
    this.focusLabel = this.cleanMission(label);
    const input = document.getElementById("focus-context-input");
    if (input) input.value = this.focusLabel;
    await this.saveMission();
    if (suggestTheme && this.focusLabel && typeof AdaptiveThemes !== "undefined") AdaptiveThemes.propose(this.focusLabel);
    return this.focusLabel;
  },

  setMinutes(minutes) {
    const safeMinutes = [5, 25, 50].includes(Number(minutes)) ? Number(minutes) : Math.max(5, Math.min(180, Math.round(Number(minutes) || 25)));
    const select = document.getElementById("pomo-mode");
    if (![...select.options].some(option => Number(option.value) === safeMinutes)) {
      const option = document.createElement("option");
      option.value = String(safeMinutes);
      option.textContent = `Custom ${safeMinutes}`;
      select.append(option);
    }
    select.value = String(safeMinutes);
    this.seconds = safeMinutes * 60;
    this.render();
    return safeMinutes;
  },

  async toggle() {
    if (!this.running) {
      await this.saveMission();
      if (this.focusLabel && typeof AdaptiveThemes !== "undefined" && AdaptiveThemes.shouldSuggest(this.focusLabel)) {
        AdaptiveThemes.propose(this.focusLabel);
      }
    }
    this.running = !this.running;
    document.getElementById("pomo-start").textContent = this.running ? "Pause" : "Start";
    if (typeof ContextBus !== "undefined") ContextBus.patch({ pomodoroRunning: this.running });
    if (this.running) {
      if (typeof FocusScenes !== "undefined") FocusScenes.record("Focus started", this.focusLabel || document.getElementById("pomo-mode").selectedOptions[0]?.textContent || "Timer");
      // Ask only when the person actually starts a timer. Prompting on every
      // new tab made the dashboard feel pushy and gave no context for why the
      // permission was useful.
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch {}
      }
      this.interval = setInterval(() => {
        if (this.seconds > 0) { this.seconds--; this.render(); }
        else {
          clearInterval(this.interval);
          this.running = false;
          document.getElementById("pomo-start").textContent = "Start";
          if (typeof ContextBus !== "undefined") ContextBus.patch({ pomodoroRunning: false });
          if (typeof FocusScenes !== "undefined") FocusScenes.record("Focus completed");
          this.notify();
        }
      }, 1000);
    } else {
      clearInterval(this.interval);
      if (typeof FocusScenes !== "undefined") FocusScenes.record("Focus paused");
    }
  },

  reset() {
    clearInterval(this.interval);
    this.running = false;
    if (typeof ContextBus !== "undefined") ContextBus.patch({ pomodoroRunning: false });
    document.getElementById("pomo-start").textContent = "Start";
    this.seconds = parseInt(document.getElementById("pomo-mode").value) * 60;
    this.render();
    if (typeof FocusScenes !== "undefined") FocusScenes.record("Timer reset");
  },

  notify() {
    if (typeof Sound !== "undefined") Sound.pomodoroDone();
    if (Notification.permission === "granted") {
      new Notification("Time's up", { body: "Session complete — nice work." });
    }
  },

  render() {
    const m = Math.floor(this.seconds / 60).toString().padStart(2, "0");
    const s = (this.seconds % 60).toString().padStart(2, "0");
    document.getElementById("pomodoro-display").textContent = `${m}:${s}`;
    this.renderMission();
  }
};
