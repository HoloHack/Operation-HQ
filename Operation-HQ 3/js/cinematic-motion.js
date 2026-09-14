// cinematic-motion.js — layered, device-aware motion for the living dashboard.
// It is visual orchestration only: real widget state remains owned by the
// existing modules. Pointer depth is requestAnimationFrame-throttled, pauses
// off-screen, and is removed entirely for reduced-motion users.

const CinematicMotion = {
  KEY: "hq_motion_settings_v1",
  settings: { profile: "auto", depth: true },
  resolvedProfile: "balanced",
  frame: 0,
  pendingPointer: null,
  observer: null,
  previousStates: new WeakMap(),
  initialized: false,

  reduced() {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  },

  deviceProfile() {
    if (this.reduced()) return "calm";
    if (this.settings.profile !== "auto") return this.settings.profile;
    const cores = Number(navigator.hardwareConcurrency || 4);
    const memory = Number(navigator.deviceMemory || 4);
    const saveData = navigator.connection?.saveData === true;
    return !saveData && cores >= 8 && memory >= 8 ? "cinematic" : "balanced";
  },

  applyProfile() {
    this.resolvedProfile = this.deviceProfile();
    document.body.dataset.motionProfile = this.resolvedProfile;
    document.body.classList.toggle("motion-depth", this.settings.depth && !this.reduced() && this.resolvedProfile !== "calm");
    const status = document.getElementById("motion-profile-status");
    if (status) {
      const source = this.settings.profile === "auto" ? "Adaptive selected" : `${this.settings.profile[0].toUpperCase()}${this.settings.profile.slice(1)} selected`;
      status.textContent = this.reduced()
        ? `${source} · system reduced-motion is active, so state changes remain visible without continuous movement.`
        : `${source} · running ${this.resolvedProfile} motion. Background tabs pause automatically.`;
    }
  },

  decorateWidgets() {
    document.querySelectorAll(".living-widget").forEach((widget, index) => {
      widget.style.setProperty("--widget-order", String(index));
      if (widget.querySelector(":scope > .widget-tech-frame")) return;
      const frame = document.createElement("div");
      frame.className = "widget-tech-frame";
      frame.setAttribute("aria-hidden", "true");
      frame.innerHTML = '<i></i><i></i><i></i><i></i><span></span><b></b>';
      widget.prepend(frame);
      this.previousStates.set(widget, widget.dataset.state || "idle");
    });
  },

  queuePointer(event) {
    if (!document.body.classList.contains("motion-depth") || document.hidden) return;
    this.pendingPointer = { x: event.clientX, y: event.clientY };
    if (!this.frame) this.frame = requestAnimationFrame(() => this.paintPointer());
  },

  paintPointer() {
    this.frame = 0;
    if (!this.pendingPointer) return;
    const { x, y } = this.pendingPointer;
    this.pendingPointer = null;
    document.documentElement.style.setProperty("--pointer-x", `${(x / innerWidth * 100).toFixed(2)}%`);
    document.documentElement.style.setProperty("--pointer-y", `${(y / innerHeight * 100).toFixed(2)}%`);
    document.querySelectorAll(".living-widget:not(.widget-disabled)").forEach(widget => {
      const rect = widget.getBoundingClientRect();
      const dx = Math.max(-1, Math.min(1, (x - (rect.left + rect.width / 2)) / Math.max(1, rect.width / 2)));
      const dy = Math.max(-1, Math.min(1, (y - (rect.top + rect.height / 2)) / Math.max(1, rect.height / 2)));
      const distance = Math.hypot(dx, dy);
      const influence = Math.max(0, 1 - distance / 2.1);
      widget.style.setProperty("--widget-tilt-x", `${(-dy * 2.8 * influence).toFixed(2)}deg`);
      widget.style.setProperty("--widget-tilt-y", `${(dx * 3.4 * influence).toFixed(2)}deg`);
      widget.style.setProperty("--widget-shift-x", `${(dx * 2.6 * influence).toFixed(2)}px`);
      widget.style.setProperty("--widget-shift-y", `${(dy * 2.2 * influence).toFixed(2)}px`);
      widget.style.setProperty("--pointer-local-x", `${((dx + 1) * 50).toFixed(1)}%`);
      widget.style.setProperty("--pointer-local-y", `${((dy + 1) * 50).toFixed(1)}%`);
    });
  },

  resetDepth() {
    document.querySelectorAll(".living-widget").forEach(widget => {
      ["--widget-tilt-x", "--widget-tilt-y", "--widget-shift-x", "--widget-shift-y"].forEach(name => widget.style.removeProperty(name));
    });
  },

  announceState(widget) {
    const current = widget.dataset.state || "idle";
    const previous = this.previousStates.get(widget);
    if (!previous || previous === current) return;
    this.previousStates.set(widget, current);
    widget.classList.remove("widget-state-shift");
    void widget.offsetWidth;
    widget.classList.add("widget-state-shift");
    this.signalWave(widget, current);
    document.body.classList.remove("system-recompose");
    void document.body.offsetWidth;
    document.body.classList.add("system-recompose");
    setTimeout(() => widget.classList.remove("widget-state-shift"), this.reduced() ? 120 : 920);
    setTimeout(() => document.body.classList.remove("system-recompose"), this.reduced() ? 120 : 1100);
  },

  signalWave(widget, state) {
    if (this.reduced() || document.hidden || this.resolvedProfile === "calm") return;
    if (typeof AmbientCompositor !== "undefined") AmbientCompositor.signal(widget, ["attention", "critical", "running"].includes(state) ? 1 : 0.72);
    const field = document.getElementById("cinematic-field");
    if (!field) return;
    const rect = widget.getBoundingClientRect();
    const wave = document.createElement("i");
    wave.className = "cinematic-event-wave";
    wave.dataset.state = state;
    wave.setAttribute("aria-hidden", "true");
    wave.style.left = `${rect.left + rect.width / 2}px`;
    wave.style.top = `${rect.top + rect.height / 2}px`;
    wave.style.setProperty("--signal-rgb", getComputedStyle(widget).getPropertyValue("--widget-rgb").trim() || "124,92,255");
    field.appendChild(wave);
    wave.addEventListener("animationend", () => wave.remove(), { once: true });
  },

  watchState() {
    this.observer?.disconnect();
    this.observer = new MutationObserver(records => records.forEach(record => this.announceState(record.target)));
    document.querySelectorAll(".living-widget").forEach(widget => this.observer.observe(widget, { attributes: true, attributeFilter: ["data-state"] }));
  },

  bindTactileFeedback() {
    document.addEventListener("pointerdown", event => {
      const widget = event.target.closest?.(".living-widget");
      if (!widget || document.body.classList.contains("widget-arrange-mode")) return;
      const rect = widget.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "widget-touch-ripple";
      ripple.setAttribute("aria-hidden", "true");
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      widget.append(ripple);
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
      widget.classList.remove("widget-contact");
      void widget.offsetWidth;
      widget.classList.add("widget-contact");
      setTimeout(() => widget.classList.remove("widget-contact"), 360);
    }, { passive: true });
  },

  bootSequence() {
    if (this.reduced()) return;
    document.body.classList.add("cinematic-boot");
    setTimeout(() => document.body.classList.remove("cinematic-boot"), this.resolvedProfile === "cinematic" ? 1800 : 1100);
  },

  bindControls() {
    const profile = document.getElementById("motion-profile-select");
    const depth = document.getElementById("motion-depth-toggle");
    if (profile) profile.value = this.settings.profile;
    if (depth) depth.checked = this.settings.depth;
    if (profile) profile.onchange = async event => {
      this.settings.profile = event.target.value;
      await chrome.storage.local.set({ [this.KEY]: this.settings });
      this.applyProfile();
      this.bootSequence();
    };
    if (depth) depth.onchange = async event => {
      this.settings.depth = event.target.checked;
      await chrome.storage.local.set({ [this.KEY]: this.settings });
      this.applyProfile();
      if (!event.target.checked) this.resetDepth();
    };
  },

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    const saved = await chrome.storage.local.get(this.KEY);
    const value = saved[this.KEY];
    if (value && typeof value === "object") {
      if (["auto", "cinematic", "balanced", "calm"].includes(value.profile)) this.settings.profile = value.profile;
      if (typeof value.depth === "boolean") this.settings.depth = value.depth;
    }
    this.decorateWidgets();
    this.applyProfile();
    this.bindControls();
    this.bindTactileFeedback();
    this.watchState();
    window.addEventListener("pointermove", event => this.queuePointer(event), { passive: true });
    document.documentElement.addEventListener("pointerleave", () => this.resetDepth());
    document.addEventListener("visibilitychange", () => {
      document.body.classList.toggle("motion-suspended", document.hidden);
      if (document.hidden) {
        this.resetDepth();
        document.querySelectorAll(".cinematic-event-wave").forEach(wave => wave.remove());
      }
    });
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", () => {
      this.applyProfile();
      if (this.reduced()) this.resetDepth();
    });
    // The initial launch is orchestrated by BootCinematic after real modules
    // report ready. bootSequence remains available for an explicit motion-
    // profile preview, avoiding the old invisible pre-ready animation race.
  },
};
