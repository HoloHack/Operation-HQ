// page-scheduler.js — one visibility-aware heartbeat for the entire new tab.
// Passive UI refresh jobs share this scheduler, pause while the tab is hidden,
// and run once immediately on return. This replaces independent intervals that
// multiplied CPU/network work across forgotten new-tab pages.

const PageScheduler = {
  jobs: new Map(),
  timer: null,
  bound: false,

  register(id, everyMs, callback, { immediate = false } = {}) {
    this.jobs.set(id, { everyMs: Math.max(1000, Number(everyMs) || 1000), callback, lastRun: immediate ? 0 : Date.now(), running: false });
    this.start();
    if (immediate && !document.hidden) this.tick();
  },

  unregister(id) {
    this.jobs.delete(id);
    if (!this.jobs.size) this.stop();
  },

  start() {
    if (!this.bound) {
      this.bound = true;
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) return;
        this.jobs.forEach(job => { job.lastRun = 0; });
        this.tick();
      });
      window.addEventListener("pagehide", () => this.stop(), { once: true });
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000);
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  tick() {
    if (document.hidden) return;
    const now = Date.now();
    this.jobs.forEach(job => {
      if (job.running || now - job.lastRun < job.everyMs) return;
      job.lastRun = now;
      job.running = true;
      Promise.resolve().then(job.callback).catch(error => console.error("Scheduled UI refresh failed:", error)).finally(() => { job.running = false; });
    });
  },
};
