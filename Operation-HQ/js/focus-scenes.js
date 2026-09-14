// focus-scenes.js — deliberate, reversible focus environments.
const FocusScenes = {
  selected: null,
  active: null,
  previous: null,
  scenes: {
    study: { name: "Study", detail: "40 min · Deep Work · violet", minutes: 40, accent: "#8b7cff", wallpaper: "scenic", deepWork: true },
    build: { name: "Build", detail: "50 min · Deep Work · cyan", minutes: 50, accent: "#39d7ff", wallpaper: "space", deepWork: true },
    reset: { name: "Reset", detail: "5 min · calm · amber", minutes: 5, accent: "#ffb86b", wallpaper: "minimal", deepWork: false },
  },

  async record(type, detail = "") {
    try {
      const key = hqLocalDateKey();
      const { hq_focus_timeline = {} } = await chrome.storage.local.get("hq_focus_timeline");
      const entries = Array.isArray(hq_focus_timeline[key]) ? hq_focus_timeline[key] : [];
      entries.push({ id: crypto.randomUUID(), type, detail, at: Date.now() });
      hq_focus_timeline[key] = entries.slice(-30);
      await chrome.storage.local.set({ hq_focus_timeline });
      this.renderTimeline();
    } catch (error) {
      console.warn("Focus timeline could not be saved:", error);
    }
  },

  async renderTimeline() {
    const target = document.getElementById("focus-timeline");
    if (!target) return;
    const key = hqLocalDateKey();
    const { hq_focus_timeline = {} } = await chrome.storage.local.get("hq_focus_timeline");
    const entries = (hq_focus_timeline[key] || []).slice(-5).reverse();
    target.innerHTML = entries.map(entry => `<div class="focus-timeline-entry"><span>${escapeHtml(entry.type)}${entry.detail ? ` · ${escapeHtml(entry.detail)}` : ""}</span><time>${new Date(entry.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>`).join("");
  },

  preview(id) {
    const scene = this.scenes[id];
    if (!scene) return;
    this.selected = id;
    document.getElementById("focus-scene-preview-title").textContent = scene.name;
    document.getElementById("focus-scene-preview-steps").textContent = `Switch wallpaper and accent, set a ${scene.minutes}-minute timer${scene.deepWork ? ", and enable your saved Deep Work rules" : ", without changing Deep Work"}. Nothing starts until you press Start.`;
    document.getElementById("focus-scene-preview").classList.remove("hidden");
  },

  async deploy() {
    const scene = this.scenes[this.selected];
    if (!scene) return;
    const state = await chrome.storage.local.get(["hq_accent", "hq_wallpaper_category", "hq_active_focus_scene", "hq_active_mod"]);
    if (!this.active) this.previous = { accent: state.hq_accent || "#7c5cff", wallpaper: state.hq_wallpaper_category || "gaming", activeMod: state.hq_active_mod || null, deepWork: !!DeepWork.active };
    this.active = this.selected;
    document.body.dataset.focusScene = this.active;
    document.body.classList.add("scene-deploying");
    setTimeout(() => document.body.classList.remove("scene-deploying"), 700);
    setAccent(scene.accent);
    await chrome.storage.local.set({ hq_accent: scene.accent, hq_wallpaper_category: scene.wallpaper, hq_active_mod: null, hq_active_focus_scene: this.active, hq_focus_scene_previous: this.previous });
    const category = document.getElementById("wallpaper-category");
    if (category) category.value = scene.wallpaper;
    await Wallpaper.apply(true, false);
    const select = document.getElementById("pomo-mode");
    let option = select.querySelector('option[data-scene-custom="true"]');
    if (!option) { option = document.createElement("option"); option.dataset.sceneCustom = "true"; select.appendChild(option); }
    option.value = String(scene.minutes); option.textContent = `${scene.name} ${scene.minutes}`; select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    if (scene.deepWork && !DeepWork.active) await DeepWork.toggle();
    document.getElementById("focus-scene-preview").classList.add("hidden");
    document.getElementById("focus-scene-exit").classList.remove("hidden");
    await this.record("Scene deployed", scene.name);
  },

  async exit() {
    if (!this.active) return;
    if (!this.previous) {
      const state = await chrome.storage.local.get("hq_focus_scene_previous");
      this.previous = state.hq_focus_scene_previous || null;
    }
    if (!this.previous) return;
    const previous = this.previous;
    if (DeepWork.active !== previous.deepWork) await DeepWork.toggle();
    setAccent(previous.accent);
    await chrome.storage.local.set({ hq_accent: previous.accent, hq_wallpaper_category: previous.wallpaper, hq_active_mod: previous.activeMod || null, hq_active_focus_scene: null });
    const category = document.getElementById("wallpaper-category");
    if (category) category.value = previous.wallpaper;
    await chrome.storage.local.remove("hq_focus_scene_previous");
    await Wallpaper.apply(true, false);
    const name = this.scenes[this.active]?.name || "Focus";
    this.active = null; this.previous = null;
    delete document.body.dataset.focusScene;
    document.getElementById("focus-scene-exit").classList.add("hidden");
    await this.record("Scene exited", name);
  },

  async parkInterruption(text) {
    const { hq_focus_interruptions = [] } = await chrome.storage.local.get("hq_focus_interruptions");
    hq_focus_interruptions.push({ id: crypto.randomUUID(), text, createdAt: Date.now() });
    await chrome.storage.local.set({ hq_focus_interruptions: hq_focus_interruptions.slice(-100) });
    await this.record("Interruption parked", text.slice(0, 60));
    if (typeof Today !== "undefined") Today.render();
  },

  async init() {
    const grid = document.getElementById("focus-scene-grid");
    grid.innerHTML = Object.entries(this.scenes).map(([id, scene]) => `<button class="focus-scene-card" data-scene="${id}"><strong>${scene.name}</strong><small>${scene.detail}</small></button>`).join("");
    grid.querySelectorAll("[data-scene]").forEach(button => button.onclick = () => this.preview(button.dataset.scene));
    document.getElementById("focus-scene-cancel").onclick = () => { this.selected = null; document.getElementById("focus-scene-preview").classList.add("hidden"); };
    document.getElementById("focus-scene-confirm").onclick = () => this.deploy().catch(error => {
      console.error("Focus scene deployment failed:", error);
      Wallpaper.toast(`Scene could not finish: ${error.message}`);
    });
    document.getElementById("focus-scene-exit").onclick = () => this.exit().catch(error => {
      console.error("Focus scene exit failed:", error);
      Wallpaper.toast(`Scene restore could not finish: ${error.message}`);
    });
    document.getElementById("interruption-form").onsubmit = async event => {
      event.preventDefault(); const input = document.getElementById("interruption-input"); const text = input.value.trim();
      if (!text) return;
      try { await this.parkInterruption(text); input.value = ""; }
      catch (error) { Wallpaper.toast(`Could not park that interruption: ${error.message}`); }
    };
    const state = await chrome.storage.local.get(["hq_active_focus_scene", "hq_focus_scene_previous"]);
    if (state.hq_active_focus_scene && this.scenes[state.hq_active_focus_scene]) {
      this.active = state.hq_active_focus_scene;
      this.previous = state.hq_focus_scene_previous || null;
      document.body.dataset.focusScene = this.active;
      document.getElementById("focus-scene-exit").classList.remove("hidden");
    }
    await this.renderTimeline();
  },
};
