// pomodoro.js — simple focus timer, resets on tab close (by design — keep it lightweight)
const Pomodoro = {
  seconds: 25 * 60,
  interval: null,
  running: false,

  init() {
    this.render();
    document.getElementById("pomo-start").onclick = () => this.toggle();
    document.getElementById("pomo-reset").onclick = () => this.reset();
    document.getElementById("pomo-mode").onchange = (e) => {
      this.seconds = parseInt(e.target.value) * 60;
      this.render();
    };
  },

  async toggle() {
    this.running = !this.running;
    document.getElementById("pomo-start").textContent = this.running ? "Pause" : "Start";
    if (typeof ContextBus !== "undefined") ContextBus.patch({ pomodoroRunning: this.running });
    if (this.running) {
      if (typeof FocusScenes !== "undefined") FocusScenes.record("Focus started", document.getElementById("pomo-mode").selectedOptions[0]?.textContent || "Timer");
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
  }
};
