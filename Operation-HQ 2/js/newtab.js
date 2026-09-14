// newtab.js — boots everything, wires up UI chrome (clock, settings, dock/flyouts)

const FOCUSABLE_SELECTOR = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

const BootDiagnostics = {
  issues: [],
  skipped: [],
  startedAt: Date.now(),

  async run(label, operation, options = {}) {
    if (options.optional && window.HQEarlyDiagnostics?.isSafeMode()) {
      this.skipped.push(label);
      this.render();
      return null;
    }
    try {
      return await operation();
    } catch (error) {
      const message = error?.message || String(error);
      this.issues.push({ label, message });
      window.HQEarlyDiagnostics?.record("module", `${label}: ${message}`);
      console.error(`[Operation HQ] ${label} failed:`, error);
      this.render();
      return null;
    }
  },

  render() {
    const status = document.getElementById("boot-status");
    if (!status) return;
    const safeMode = window.HQEarlyDiagnostics?.isSafeMode() === true;
    if (!this.issues.length) {
      status.textContent = safeMode
        ? `Safe mode is active. Core tools started; ${this.skipped.length} optional module${this.skipped.length === 1 ? "" : "s"} paused.`
        : "All dashboard modules started successfully.";
      status.dataset.state = "success";
    } else {
      status.textContent = `${this.issues.length} module${this.issues.length === 1 ? "" : "s"} had a startup issue: ${this.issues.map(issue => issue.label).join(", ")}. Other tools remain available.`;
      status.dataset.state = "error";
    }
  },

  text(backgroundIssues = []) {
    const header = `Operation HQ diagnostics — ${new Date().toISOString()}`;
    const lines = [header, `Build: ${chrome.runtime.getManifest().version}`, `Safe mode: ${window.HQEarlyDiagnostics?.isSafeMode() ? "on" : "off"}`];
    if (this.issues.length) lines.push(...this.issues.map(issue => `- ${issue.label}: ${issue.message}`));
    else lines.push("All enabled dashboard modules started successfully.");
    if (this.skipped.length) lines.push(`Paused optional modules: ${this.skipped.join(", ")}`);
    const early = window.HQEarlyDiagnostics?.entries?.() || [];
    if (early.length) {
      lines.push("Recent early/runtime events:");
      early.slice(-10).forEach(entry => lines.push(`- ${entry.at} ${entry.type}: ${entry.message} (${entry.source}:${entry.line || 0})`));
    }
    if (backgroundIssues.length) {
      lines.push("Recent background events:");
      backgroundIssues.slice(-10).forEach(entry => lines.push(`- ${entry.at || "unknown time"} ${entry.label || "background"}: ${entry.message || "Unknown error"}`));
    }
    return lines.join("\n");
  },
};

function wireRecoveryControls() {
  const safeMode = window.HQEarlyDiagnostics?.isSafeMode() === true;
  if (safeMode) BootDiagnostics.skipped = Object.values(LazyFeatures.definitions).map(([label]) => label);
  document.body.classList.toggle("safe-mode", safeMode);
  const status = document.getElementById("safe-mode-status");
  const exit = document.getElementById("exit-safe-mode-btn");
  if (status) status.textContent = safeMode
    ? "Repeated incomplete startups were detected. Optional integrations are paused so core tools remain usable."
    : "Crash recovery is armed. Early script and promise failures are included in copied diagnostics.";
  if (exit) {
    exit.classList.toggle("hidden", !safeMode);
    exit.onclick = () => {
      window.HQEarlyDiagnostics?.clearAndExitSafeMode();
      location.reload();
    };
  }
}

function focusableElements(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => !el.closest(".hidden") && !el.inert);
}

function trapFocus(event, root) {
  if (event.key !== "Tab") return;
  const items = focusableElements(root);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setAccent(hex) {
  document.documentElement.style.setProperty("--accent", hex);
  const match = /^#([0-9a-f]{6})$/i.exec(hex || "");
  if (match) {
    const value = parseInt(match[1], 16);
    document.documentElement.style.setProperty("--accent-rgb", `${value >> 16}, ${(value >> 8) & 255}, ${value & 255}`);
  }
}

// Optional code is fetched from the packaged extension only when its panel is
// first opened. This avoids parsing the chart/editor bundles and entire feature
// workspaces on every new tab while keeping MV3 CSP fully local.
const ScriptLoader = {
  pending: new Map(),
  load(path) {
    if (!this.pending.has(path)) {
      this.pending.set(path, new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = chrome.runtime.getURL(path);
        script.async = false;
        script.onload = () => resolve(true);
        script.onerror = () => {
          this.pending.delete(path);
          script.remove();
          reject(new Error(`Could not load packaged module: ${path}`));
        };
        document.head.appendChild(script);
      }));
    }
    return this.pending.get(path);
  },
  async loadAll(paths = []) {
    for (const path of paths) await this.load(path);
  },
};

// The HTML declares only diagnostics plus this bootstrap. Core definitions are
// loaded here in one inspectable manifest, while panel-only code stays out of
// the first-use path below. A missing core file is recorded independently and
// does not prevent later definitions from being attempted.
const CORE_SCRIPTS = Object.freeze([
  "js/notes-editor.js",
  "js/local-ai.js",
  "js/eleven-labs-client.js",
  "js/icons.js",
  "js/research-link.js",
  "js/spinner.js",
  "js/exam-countdown.js",
  "js/storage-schema.js",
  "js/context-bus.js",
  "js/calendar-repository.js",
  "js/credential-vault.js",
  "js/page-scheduler.js",
  "js/mode-transitions.js",
  "js/cinematic-motion.js",
  "js/quotes.js",
  "js/tasks.js",
  "js/dailytasks.js",
  "js/calendar.js",
  "js/schedule.js",
  "js/seed.js",
  "js/today.js",
  "js/wallpaper.js",
  "js/pomodoro.js",
  "js/focus-scenes.js",
  "js/weather.js",
  "js/claude-client.js",
  "js/daily-planner.js",
  "js/completion-detection.js",
  "js/integration-health.js",
  "js/activity-log.js",
  "js/sound.js",
  "js/capture.js",
  "js/research-nudge.js",
  "js/backup-crypto.js",
  "js/professional-view.js",
  "js/deepwork.js",
  "js/nexus.js",
  "js/command-palette.js",
  "js/living-widgets.js",
]);

// Heavy or network-backed panels initialize on first use. Each initializer and
// its packaged scripts still run at most once per tab.
const LazyFeatures = {
  started: new Map(),
  definitions: {
    "notes-flyout": ["Notes", () => NotesEditor.init(), ["js/lib/tiptap/tiptap-bundle.js"]],
    "gmail-flyout": ["Gmail", () => Gmail.init(), ["js/mail-intelligence.js", "js/gmail.js"]],
    "spotify-flyout": ["Spotify", async () => {
      await SpotifyUI.init();
      if (await SpotifyClient.isConnected()) await SpotifyPlayer.connect();
    }, ["js/spotify-client.js", "js/spotify-player.js", "js/spotify-ui.js"]],
    "stats-flyout": ["Weekly stats", () => WeeklyStats.init(), ["js/lib/chart.umd.min.js", "js/weekly-stats.js"]],
    "venture-dash-flyout": ["Venture dashboard", () => VentureDashboard.init(), ["js/lib/chart.umd.min.js", "js/venture-dashboard.js"]],
    "radar-flyout": ["Idea radar", () => IdeaRadar.init(), ["js/idea-radar.js"]],
    "optimizer-flyout": ["Browser workspaces", () => ChromeOptimizer.init(), ["js/classifier.js", "js/bookmarks.js", "js/workspaces.js", "js/chrome-optimizer.js"]],
    "gleam-flyout": ["Gleam social confidence lab", () => GleamHQ.init(), ["js/gleam.js"]],
    "bookmarks-flyout": ["Bookmark intelligence", async () => { await Bookmarks.init(); ForgottenBookmark.init(); }, ["js/classifier.js", "js/bookmarks.js", "js/forgotten-bookmark.js"]],
    "mods-flyout": ["Mods", () => Mods.init(), ["js/mods.js"]],
    "vault-flyout": ["Idea vault", () => IdeaVault.init(), ["js/idea-vault.js"]],
    "srs-flyout": ["Recall Lab", () => SRS.init(), ["js/srs.js"]],
    "assignments-flyout": ["Study OS, assessment intake and research pipeline", async () => {
      await Assignments.init();
      await AssessmentIntake.init();
      await StudyOS.init();
    }, ["js/assignments.js", "js/assessment-intake.js", "js/study-os.js"]],
  },

  async ensure(panelId) {
    if (!this.definitions[panelId]) return true;
    if (window.HQEarlyDiagnostics?.isSafeMode()) {
      Wallpaper?.toast?.("That optional tool is paused in Safe Mode. Exit Safe Mode from Settings when you're ready to retry it.");
      return false;
    }
    if (!this.started.has(panelId)) {
      const [label, initializer, scripts] = this.definitions[panelId];
      this.started.set(panelId, BootDiagnostics.run(label, async () => {
        await ScriptLoader.loadAll(scripts);
        await initializer();
        return true;
      }));
    }
    const succeeded = (await this.started.get(panelId)) === true;
    // A transient provider/editor failure should not permanently brick the
    // panel for this tab. A later explicit click is allowed to retry.
    if (!succeeded) this.started.delete(panelId);
    return succeeded;
  },
};

function applyStaticIcons() {
  const build = document.getElementById("build-version");
  if (build) build.textContent = `${chrome.runtime.getManifest().version} · Atomic Continuity`;
  const map = {
    "settings-btn": "settings",
    "palette-btn": "search",
    "deepwork-btn": "shield",
    "privacy-btn": "eye",
    "pro-view-btn": "briefcase",
    "lockdown-btn": "lock",
    "zen-btn": "eye-off",
    "zen-reveal": "eye",
    "close-settings": "x",
  };
  Object.entries(map).forEach(([id, icon]) => {
    const el = document.getElementById(id);
    if (el) Icons.apply(el, icon);
  });

  const dockIconMap = {
    "nexus-flyout": "sparkles",
    "today-flyout": "sun",
    "pomodoro-flyout": "timer",
    "spotify-flyout": "music",
    "exam-countdown-flyout": "hourglass",
    "assignments-flyout": "clipboard-list",
    "gmail-flyout": "mail",
    "notes-flyout": "file-text",
    "calendar-flyout": "calendar",
    "bookmarks-flyout": "bookmark",
    "plan-flyout": "clipboard-list",
    "optimizer-flyout": "zap",
    "stats-flyout": "bar-chart-2",
    "mods-flyout": "puzzle",
    "vault-flyout": "key",
    "radar-flyout": "radar",
    "srs-flyout": "graduation-cap",
    "gleam-flyout": "sparkles",
    "venture-dash-flyout": "briefcase",
    "schedule-flyout": "calendar-clock",
  };
  document.querySelectorAll(".dock-btn[data-panel]").forEach(btn => {
    const icon = dockIconMap[btn.dataset.panel];
    if (icon) Icons.apply(btn, icon);
    btn.setAttribute("aria-label", btn.title || "Open tool");
    btn.setAttribute("aria-controls", btn.dataset.panel);
    btn.setAttribute("aria-expanded", "false");
  });

  document.querySelectorAll("button").forEach(btn => {
    // Preserve deliberate submit buttons. Unspecified buttons default to
    // submit inside forms, so only normalize the ones without an explicit
    // type. This keeps forms keyboard-accessible without accidental submits.
    if (!btn.hasAttribute("type")) btn.type = "button";
    if (!btn.getAttribute("aria-label") && btn.title) btn.setAttribute("aria-label", btn.title);
  });

  ["deepwork-btn", "privacy-btn", "pro-view-btn", "lockdown-btn", "zen-btn"].forEach(id => {
    document.getElementById(id)?.setAttribute("aria-pressed", "false");
  });
  document.querySelectorAll(".flyout").forEach((panel, index) => {
    const heading = panel.querySelector("h2");
    if (heading) {
      if (!heading.id) heading.id = `flyout-title-${index + 1}`;
      panel.setAttribute("aria-labelledby", heading.id);
    }
  });
  document.querySelectorAll(".flyout-close").forEach(btn => {
    Icons.apply(btn, "x");
    btn.setAttribute("aria-label", "Close panel");
  });
  document.querySelectorAll(".icon-inline[data-icon]").forEach(el => {
    el.innerHTML = Icons.get(el.dataset.icon);
  });
}

async function updateLockedToolBadges() {
  const hasKey = await ClaudeClient.hasKey();
  document.querySelectorAll(".dock-btn.locked-tool").forEach(btn => {
    btn.classList.toggle("needs-key", !hasKey);
    let badge = btn.querySelector(".lock-badge");
    if (!hasKey) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "lock-badge icon";
        badge.innerHTML = Icons.get("lock");
        btn.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  });
}

async function applyLayoutMode() {
  const s = await chrome.storage.local.get(["hq_layout_style", "hq_pin_daily", "hq_pin_tasks"]);
  const storedStyle = s.hq_layout_style || "living";
  const style = storedStyle === "minimal" ? "living" : storedStyle;
  const pinDaily = !!s.hq_pin_daily;
  const pinTasks = !!s.hq_pin_tasks;

  document.body.classList.remove("layout-full", "layout-minimal", "layout-living", "layout-focus", "hero-mode", "pin-daily", "pin-tasks");
  document.body.classList.add(`layout-${["living", "focus", "full"].includes(style) ? style : "living"}`);
  if (pinDaily) document.body.classList.add("pin-daily");
  if (pinTasks) document.body.classList.add("pin-tasks");
}

function wireLayoutSettings() {
  document.getElementById("layout-style-select").onchange = async (e) => {
    await chrome.storage.local.set({ hq_layout_style: e.target.value });
    applyLayoutMode();
  };
  document.getElementById("pin-daily").onchange = async (e) => {
    await chrome.storage.local.set({ hq_pin_daily: e.target.checked });
    applyLayoutMode();
  };
  document.getElementById("pin-tasks").onchange = async (e) => {
    await chrome.storage.local.set({ hq_pin_tasks: e.target.checked });
    applyLayoutMode();
  };
}

function updateClock() {
  const now = new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  document.getElementById("date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function setGreeting() {
  const h = new Date().getHours();
  const msg = h < 5 ? "Late night grind" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : h < 22 ? "Good evening" : "Late night grind";
  const greeting = document.getElementById("greeting");
  const words = `${msg}, Shourya`.split(" ");
  greeting.replaceChildren(...words.flatMap((word, index) => {
    const span = document.createElement("span");
    span.className = "greeting-word";
    span.style.setProperty("--word-index", index);
    span.textContent = word;
    return index === words.length - 1 ? [span] : [span, document.createTextNode(" ")];
  }));
}

async function loadSettings() {
  const s = await chrome.storage.local.get(["hq_accent", "hq_wallpaper_adaptive_colour", "hq_wallpaper_category", "hq_anime_scene", "hq_wallpaper_scene_v1", "hq_wallpaper_interval_value", "hq_wallpaper_interval_unit", "hq_custom_wallpapers", "hq_blur", "hq_sound_enabled", "hq_sound_volume", "hq_privacy_pin", "hq_auto_privacy_on_idle", "hq_layout_style", "hq_pin_daily", "hq_pin_tasks"]);
  setAccent(s.hq_accent || "#7c5cff");
  document.getElementById("wallpaper-category").value = s.hq_wallpaper_category || "gaming";
  document.getElementById("anime-scene").value = s.hq_anime_scene || "curated";
  document.getElementById("anime-scene-settings").classList.toggle("hidden", (s.hq_wallpaper_category || "gaming") !== "anime");
  syncWallpaperSceneControl(s.hq_wallpaper_category || "gaming", s.hq_wallpaper_scene_v1 || {});
  document.getElementById("wallpaper-adaptive-colour").checked = s.hq_wallpaper_adaptive_colour !== false;
  document.getElementById("custom-wallpaper-settings").classList.toggle("hidden", (s.hq_wallpaper_category || "gaming") !== "custom");
  document.getElementById("wallpaper-interval-value").value = s.hq_wallpaper_interval_value || 1;
  document.getElementById("wallpaper-interval-unit").value = s.hq_wallpaper_interval_unit || "tab";
  document.getElementById("custom-wallpaper-urls").value = (Array.isArray(s.hq_custom_wallpapers) ? s.hq_custom_wallpapers : []).join("\n");
  document.getElementById("wallpaper-interval-value").disabled = !s.hq_wallpaper_interval_unit || ["tab", "forever"].includes(s.hq_wallpaper_interval_unit);
  document.getElementById("toggle-blur").checked = !!s.hq_blur;
  document.body.classList.toggle("blur-on", !!s.hq_blur);
  document.getElementById("toggle-sound").checked = s.hq_sound_enabled !== false;
  document.getElementById("sound-volume").value = s.hq_sound_volume ?? 0.25;
  document.getElementById("toggle-idle-privacy").checked = !!s.hq_auto_privacy_on_idle;
  document.getElementById("privacy-pin-input").placeholder = s.hq_privacy_pin ? "PIN set — leave blank to keep, type to change" : "e.g. a 4-digit code";
  document.getElementById("layout-style-select").value = s.hq_layout_style === "minimal" ? "living" : (s.hq_layout_style || "living");
  document.getElementById("pin-daily").checked = !!s.hq_pin_daily;
  document.getElementById("pin-tasks").checked = !!s.hq_pin_tasks;

  const { hq_research_nudge_enabled } = await chrome.storage.local.get("hq_research_nudge_enabled");
  document.getElementById("toggle-research-nudge").checked = hq_research_nudge_enabled === true;
}

function syncWallpaperSceneControl(category, savedMap = {}) {
  const wrap = document.getElementById("wallpaper-scene-settings");
  const select = document.getElementById("wallpaper-scene");
  const channels = typeof WALLPAPER_SCENE_SOURCE !== "undefined" ? WALLPAPER_SCENE_SOURCE[category] : null;
  wrap.classList.toggle("hidden", !channels || category === "anime" || category === "custom");
  if (!channels) return;
  select.innerHTML = Object.entries(channels).map(([id, scene]) => `<option value="${escapeAttribute(id)}">${escapeHtml(scene.label)}</option>`).join("");
  select.value = channels[savedMap[category]] ? savedMap[category] : "curated";
}

function wireLocalAI() {
  const btn = document.getElementById("local-ai-load-btn");
  const statusEl = document.getElementById("local-ai-status");
  const progressWrap = document.getElementById("local-ai-progress-bar");
  const progressFill = document.getElementById("local-ai-progress-fill");
  const runBtn = document.getElementById("local-ai-run-btn");
  const cancelBtn = document.getElementById("local-ai-cancel-btn");
  const input = document.getElementById("local-ai-input");
  const output = document.getElementById("local-ai-output");
  const mode = document.getElementById("local-ai-mode");
  if (!btn) return;

  async function refreshStatus() {
    if (!LocalAI.isSupported()) {
      statusEl.textContent = "Not supported — this browser doesn't have WebGPU.";
      btn.disabled = true;
      btn.textContent = "Not available";
      runBtn.disabled = true;
      return;
    }
    if (LocalAI.isLoadedThisSession()) {
      statusEl.textContent = "Ready — local AI is active for this tab session.";
      btn.classList.add("hidden");
      runBtn.disabled = !input.value.trim();
      output.textContent = "Ready. Choose an operation and add real text.";
      return;
    }
    btn.classList.remove("hidden");
    const cached = await LocalAI.isModelCached();
    statusEl.textContent = cached ? "Downloaded already, not loaded into this tab session yet." : "Not downloaded yet (~700MB–900MB, one-time).";
    btn.textContent = cached ? "Load Local AI" : "Download & Load Local AI (~800MB)";
    btn.disabled = false;
    runBtn.disabled = true;
  }

  btn.onclick = async () => {
    btn.disabled = true;
    progressWrap.classList.remove("hidden");
    try {
      await LocalAI.downloadAndLoad((report) => {
        progressFill.style.width = `${Math.round((report.progress || 0) * 100)}%`;
        statusEl.textContent = report.text || "Loading…";
      });
      progressWrap.classList.add("hidden");
      await refreshStatus();
      if (typeof Capture !== "undefined") Capture.render(); // reveal the Summarize buttons now that it's actually ready
      if (typeof AssessmentIntake !== "undefined" && AssessmentIntake.initialized) AssessmentIntake.render();
      if (typeof GleamHQ !== "undefined" && GleamHQ.initialized) GleamHQ.refreshAIState();
    } catch (e) {
      console.error("Local AI load failed:", e);
      statusEl.textContent = `Failed: ${e.message}`;
      progressWrap.classList.add("hidden");
      btn.disabled = false;
    }
  };

  input.oninput = () => { runBtn.disabled = !LocalAI.isLoadedThisSession() || !input.value.trim() || LocalAI.isRunning(); };
  cancelBtn.onclick = () => {
    LocalAI.cancelActive();
    cancelBtn.disabled = true;
    runBtn.disabled = !input.value.trim();
    output.textContent = "Generation cancelled. Your input is unchanged.";
  };
  runBtn.onclick = async () => {
    if (!input.value.trim()) return;
    runBtn.disabled = true;
    cancelBtn.disabled = false;
    output.textContent = "Running privately on this device…";
    try {
      const result = await LocalAI.assist(mode.value, input.value);
      output.textContent = result;
    } catch (error) {
      output.textContent = error.message === "Generation cancelled." ? "Generation cancelled. Your input is unchanged." : `Local AI stopped safely: ${error.message}`;
    } finally {
      cancelBtn.disabled = true;
      runBtn.disabled = !LocalAI.isLoadedThisSession() || !input.value.trim();
    }
  };

  refreshStatus();
}

function wireResearchNudge() {
  document.getElementById("toggle-research-nudge").onchange = async (e) => {
    await chrome.storage.local.set({ hq_research_nudge_enabled: e.target.checked });
    ResearchNudge.render(); // reflect the change immediately rather than waiting for next tab open
  };
}

function wireSettingsDrawer() {
  const drawer = document.getElementById("settings-drawer");
  const backdrop = document.getElementById("settings-backdrop");
  const opener = document.getElementById("settings-btn");

  const close = () => {
    drawer.classList.add("hidden");
    backdrop.classList.add("hidden");
    drawer.setAttribute("aria-hidden", "true");
    drawer.inert = true;
    opener.setAttribute("aria-expanded", "false");
    opener.focus();
  };
  const open = () => {
    drawer.classList.remove("hidden");
    backdrop.classList.remove("hidden");
    drawer.removeAttribute("inert");
    drawer.inert = false;
    drawer.setAttribute("aria-hidden", "false");
    opener.setAttribute("aria-expanded", "true");
    IntegrationHealth.render().catch(error => console.warn("Integration health unavailable:", error));
    requestAnimationFrame(() => drawer.querySelector(".settings-tab.active")?.focus());
  };

  opener.setAttribute("aria-controls", "settings-drawer");
  opener.setAttribute("aria-expanded", "false");
  opener.onclick = open;
  document.getElementById("close-settings").onclick = close;
  backdrop.onclick = close;
  drawer.addEventListener("keydown", (event) => trapFocus(event, drawer));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !drawer.classList.contains("hidden")) close();
  });

  const settingsTabs = Array.from(document.querySelectorAll(".settings-tab"));
  settingsTabs.forEach(tab => {
    tab.onclick = () => {
      settingsTabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
        t.tabIndex = -1;
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      tab.tabIndex = 0;
      const cat = tab.dataset.cat;
      document.querySelectorAll("#settings-content .settings-group").forEach(g => {
        g.classList.toggle("hidden", g.dataset.category !== cat);
      });
      const content = document.getElementById("settings-content");
      content.setAttribute("aria-labelledby", tab.id);
      content.scrollTop = 0;
    };
    tab.onkeydown = (event) => {
      const current = settingsTabs.indexOf(tab);
      const keyTarget = {
        ArrowRight: (current + 1) % settingsTabs.length,
        ArrowDown: (current + 1) % settingsTabs.length,
        ArrowLeft: (current - 1 + settingsTabs.length) % settingsTabs.length,
        ArrowUp: (current - 1 + settingsTabs.length) % settingsTabs.length,
        Home: 0,
        End: settingsTabs.length - 1,
      }[event.key];
      if (keyTarget === undefined) return;
      event.preventDefault();
      settingsTabs[keyTarget].click();
      settingsTabs[keyTarget].focus();
    };
  });
  document.querySelector(".settings-tab.active")?.click();

  // Shown so the person can actually finish their Spotify Developer
  // Dashboard app registration — chrome.identity.getRedirectURL() is
  // deterministic per-extension-install but not something anyone could
  // otherwise guess or look up.
  const redirectDisplay = document.getElementById("spotify-redirect-uri-display");
  if (redirectDisplay && chrome.identity) redirectDisplay.textContent = chrome.identity.getRedirectURL();

  document.querySelectorAll(".swatch").forEach(sw => {
    sw.onclick = async () => {
      ModeTransitions?.play?.("theme", "Interface recalibrated", "Manual colour override");
      setAccent(sw.dataset.color);
      document.getElementById("wallpaper-adaptive-colour").checked = false;
      await chrome.storage.local.set({ hq_accent: sw.dataset.color, hq_wallpaper_adaptive_colour: false, hq_active_mod: null });
      if (typeof Mods !== "undefined") Mods.render();
    };
  });

  document.getElementById("wallpaper-category").onchange = async (e) => {
    ModeTransitions?.play?.("theme", "Environment shift", `${e.target.selectedOptions[0]?.textContent || e.target.value} atmosphere`);
    document.getElementById("custom-wallpaper-settings").classList.toggle("hidden", e.target.value !== "custom");
    document.getElementById("anime-scene-settings").classList.toggle("hidden", e.target.value !== "anime");
    const { hq_wallpaper_scene_v1 = {} } = await chrome.storage.local.get("hq_wallpaper_scene_v1");
    syncWallpaperSceneControl(e.target.value, hq_wallpaper_scene_v1);
    await chrome.storage.local.set({ hq_wallpaper_category: e.target.value, hq_wallpaper_cached: null, hq_active_mod: null });
    await Wallpaper.apply(true, false);
    if (typeof Mods !== "undefined") Mods.render();
  };
  document.getElementById("anime-scene").onchange = async (e) => {
    ModeTransitions?.play?.("theme", "Anime channel tuned", e.target.selectedOptions[0]?.textContent || "Curated anime");
    await chrome.storage.local.set({ hq_anime_scene: e.target.value, hq_wallpaper_cached: null, hq_wallpaper_current: null });
    if (document.getElementById("wallpaper-category").value === "anime") await Wallpaper.apply(true, false);
  };
  document.getElementById("wallpaper-scene").onchange = async (e) => {
    const category = document.getElementById("wallpaper-category").value;
    const { hq_wallpaper_scene_v1 = {} } = await chrome.storage.local.get("hq_wallpaper_scene_v1");
    hq_wallpaper_scene_v1[category] = e.target.value;
    ModeTransitions?.play?.("theme", "Scene channel tuned", e.target.selectedOptions[0]?.textContent || category);
    await chrome.storage.local.set({ hq_wallpaper_scene_v1, hq_wallpaper_cached: null, hq_wallpaper_current: null });
    await Wallpaper.apply(true, false);
  };
  document.getElementById("wallpaper-adaptive-colour").onchange = async (e) => {
    await chrome.storage.local.set({ hq_wallpaper_adaptive_colour: e.target.checked });
    if (e.target.checked) await Wallpaper.apply(false, false);
    else {
      const { hq_accent } = await chrome.storage.local.get("hq_accent");
      setAccent(hq_accent || "#7c5cff");
    }
  };
  document.getElementById("wallpaper-interval-value").onchange = async (e) => {
    await Wallpaper.setIntervalSetting(parseInt(e.target.value) || 1, document.getElementById("wallpaper-interval-unit").value);
  };
  document.getElementById("wallpaper-interval-unit").onchange = async (e) => {
    await Wallpaper.setIntervalSetting(parseInt(document.getElementById("wallpaper-interval-value").value) || 1, e.target.value);
    document.getElementById("wallpaper-interval-value").disabled = (e.target.value === "tab" || e.target.value === "forever");
  };
  document.getElementById("wallpaper-refresh-now").onclick = async () => {
    const btn = document.getElementById("wallpaper-refresh-now");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.classList.add("loading");
    btn.innerHTML = Spinner.html(14) + "Shuffling…";
    await Wallpaper.shuffleNow();
    btn.disabled = false;
    btn.classList.remove("loading");
    btn.textContent = originalLabel;
  };
  document.getElementById("save-custom-wallpapers").onclick = async () => {
    const input = document.getElementById("custom-wallpaper-urls");
    const urls = [...new Set(input.value.split(/\r?\n/).map(value => value.trim()).filter(value => {
      try { return new URL(value).protocol === "https:"; } catch { return false; }
    }))].slice(0, 50);
    await chrome.storage.local.set({ hq_custom_wallpapers: urls });
    input.value = urls.join("\n");
    Wallpaper.toast(`${urls.length} custom wallpaper${urls.length === 1 ? "" : "s"} saved.`);
    if (document.getElementById("wallpaper-category").value === "custom") await Wallpaper.apply(true, false);
  };

  document.getElementById("copy-diagnostics-btn").onclick = async () => {
    try {
      const { hq_background_errors: backgroundIssues = [] } = await chrome.storage.local.get("hq_background_errors");
      await navigator.clipboard.writeText(BootDiagnostics.text(backgroundIssues));
      Wallpaper.toast("Diagnostics copied.");
    } catch {
      Wallpaper.toast("Could not copy diagnostics automatically.");
    }
  };
  document.getElementById("clear-diagnostics-btn").onclick = async () => {
    window.HQEarlyDiagnostics?.clearEntries();
    await chrome.storage.local.remove("hq_background_errors");
    Wallpaper.toast("Saved diagnostics cleared.");
  };

  document.getElementById("toggle-blur").onchange = async (e) => {
    await chrome.storage.local.set({ hq_blur: e.target.checked });
    document.body.classList.toggle("blur-on", e.target.checked);
  };

  document.getElementById("toggle-sound").onchange = (e) => {
    chrome.storage.local.set({ hq_sound_enabled: e.target.checked });
  };
  document.getElementById("sound-volume").oninput = (e) => {
    chrome.storage.local.set({ hq_sound_volume: parseFloat(e.target.value) });
  };

  document.getElementById("privacy-pin-input").onchange = (e) => {
    const v = e.target.value.trim();
    if (v) chrome.storage.local.set({ hq_privacy_pin: v });
    e.target.value = "";
  };
  document.getElementById("clear-pin-btn").onclick = async () => {
    await chrome.storage.local.remove("hq_privacy_pin");
    document.getElementById("privacy-pin-input").placeholder = "e.g. a 4-digit code";
    Wallpaper?.toast?.("PIN cleared.");
  };
  document.getElementById("toggle-idle-privacy").onchange = (e) => {
    chrome.storage.local.set({ hq_auto_privacy_on_idle: e.target.checked });
  };

  document.getElementById("add-venture-btn").onclick = () => {
    const input = document.getElementById("new-venture-input");
    if (input.value.trim()) { Tasks.addVenture(input.value.trim()); input.value = ""; }
  };
}

function wireWallpaperSafety() {
  const hideButton = document.getElementById("wallpaper-block-current");
  const clearButton = document.getElementById("wallpaper-clear-blocklist");
  hideButton.onclick = () => Wallpaper.blockCurrent();
  clearButton.onclick = () => Wallpaper.clearBlocklist();
  Wallpaper.refreshSafetyControls();
}

function wireDock() {
  const backdrop = document.getElementById("flyout-backdrop");
  const peek = document.getElementById("dock-peek");
  const moreButton = document.getElementById("dock-more-btn");
  const moreTray = document.getElementById("dock-more-tray");
  let activeTrigger = null;

  // Every module has the same depth model: its living widget/launcher is the
  // glance, the existing flyout is the focused mini view, and this control
  // promotes the exact same surface to a full workspace. No cloned module,
  // second store, or inconsistent route is introduced.
  document.querySelectorAll(".flyout").forEach(panel => {
    const header = panel.querySelector(":scope > .panel-head");
    const close = header?.querySelector(":scope > .flyout-close");
    if (!header || header.querySelector(":scope > .panel-expand")) return;
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "panel-expand";
    expand.title = "Expand to full workspace";
    expand.setAttribute("aria-label", "Expand to full workspace");
    expand.setAttribute("aria-pressed", "false");
    Icons.apply(expand, "maximize-2");
    expand.onclick = () => {
      const full = panel.classList.toggle("panel-fullscreen");
      panel.dataset.depth = full ? "full" : "mini";
      expand.title = full ? "Return to mini view" : "Expand to full workspace";
      expand.setAttribute("aria-label", expand.title);
      expand.setAttribute("aria-pressed", String(full));
      Icons.apply(expand, full ? "minimize-2" : "maximize-2");
      panel.dispatchEvent(new CustomEvent("hq:panel-depth", { detail: { full } }));
    };
    if (close) header.insertBefore(expand, close);
    else header.appendChild(expand);
    panel.dataset.depth = "mini";
  });

  function setMoreOpen(open) {
    moreTray.classList.toggle("hidden", !open);
    moreButton.classList.toggle("active", open);
    moreButton.setAttribute("aria-expanded", String(open));
  }
  moreButton.onclick = () => setMoreOpen(moreTray.classList.contains("hidden"));

  function closeAll(restoreFocus = false) {
    document.querySelectorAll(".flyout").forEach(f => {
      f.classList.remove("open");
      f.classList.remove("panel-fullscreen");
      f.dataset.depth = "mini";
      const expand = f.querySelector(":scope > .panel-head > .panel-expand");
      if (expand) {
        expand.title = "Expand to full workspace";
        expand.setAttribute("aria-label", expand.title);
        expand.setAttribute("aria-pressed", "false");
        Icons.apply(expand, "maximize-2");
      }
      f.setAttribute("aria-hidden", "true");
      f.inert = true;
    });
    document.querySelectorAll("[data-panel], [data-open-panel]").forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-expanded", "false");
    });
    backdrop.classList.add("hidden");
    if (restoreFocus && activeTrigger?.isConnected && typeof activeTrigger.focus === "function") activeTrigger.focus();
    activeTrigger = null;
  }

  function open(panelId, btn) {
    const panel = document.getElementById(panelId);
    if (!panel) {
      window.HQEarlyDiagnostics?.record?.("panel-route", `Missing panel target: ${panelId || "(empty)"}`, "js/newtab.js");
      return false;
    }
    const alreadyOpen = panel.classList.contains("open");
    closeAll(false);
    setMoreOpen(false);
    if (alreadyOpen) return true; // clicking the active one again just closes it
    activeTrigger = btn || document.querySelector(`.dock-btn[data-panel="${panelId}"]`);
    panel.classList.add("open");
    panel.removeAttribute("inert");
    panel.inert = false;
    panel.setAttribute("aria-hidden", "false");
    if (activeTrigger) {
      activeTrigger.classList.add("active");
      activeTrigger.setAttribute("aria-expanded", "true");
    }
    backdrop.classList.remove("hidden");
    // Live data panels re-render on open rather than only once at boot —
    // Tasks change constantly through the day, so a dashboard that only
    // reflected page-load-time state would go stale within minutes.
    if (panelId === "venture-dash-flyout" && typeof VentureDashboard !== "undefined") VentureDashboard.render();
    if (panelId === "today-flyout" && typeof Today !== "undefined") Today.render();
    // The weather panel specifically focuses the city search box rather
    // than the generic "first focusable element" — that would land on
    // "Use my location", whose success depends on invisible browser/OS
    // permission state the person can't see or debug. The city input
    // always works regardless of that state, so it's the honest default.
    const focusable = panelId === "weather-flyout"
      ? panel.querySelector("#weather-city-input")
      : panelId === "gleam-flyout"
        ? panel.querySelector(".gleam-nav-btn.active")
        : panel.querySelector("button, input, textarea, select");
    if (focusable) focusable.focus();
    return true;
  }

  async function requestOpen(panelId, trigger = null) {
    if (!panelId || !document.getElementById(panelId)) {
      window.HQEarlyDiagnostics?.record?.("panel-route", `Missing panel target: ${panelId || "(empty)"}`, "js/newtab.js");
      return false;
    }
    if (!(await LazyFeatures.ensure(panelId))) return false;
    return open(panelId, trigger || document.querySelector(`.dock-btn[data-panel="${panelId}"]`));
  }

  // One reliable route for the dock, living widgets, command palette and
  // future launch surfaces. This avoids proxy-click chains where a visible
  // widget silently depended on a hidden dock button.
  window.HQPanels = Object.freeze({ open: requestOpen, close: closeAll });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const openPanel = document.querySelector(".flyout.open");
    if (!openPanel) return;
    trapFocus(e, openPanel);
  });

  // --- Hover peek: a quick live glance without opening the full panel ---
  async function peekTextFor(panelId) {
    switch (panelId) {
      case "pomodoro-flyout": {
        const label = document.getElementById("pomodoro-display")?.textContent || "25:00";
        return Pomodoro.running ? `${label} — running` : `${label} — paused`;
      }
      case "nexus-flyout":
        return "Local commands · missions · safe handoffs";
      case "gmail-flyout": {
        const { hq_gmail_connected } = await chrome.storage.local.get("hq_gmail_connected");
        return hq_gmail_connected ? "Connected — click to view inbox" : "Not connected yet";
      }
      case "notes-flyout": {
        const { hq_notes } = await chrome.storage.local.get("hq_notes");
        if (!hq_notes || !hq_notes.trim()) return "No notes yet";
        return hq_notes.trim().slice(0, 60) + (hq_notes.length > 60 ? "…" : "");
      }
      case "calendar-flyout": {
        const todayKey = hqLocalDateKey();
        const n = (Calendar.events[todayKey] || []).length;
        return `Today — ${n} event${n === 1 ? "" : "s"}`;
      }
      case "bookmarks-flyout":
        return typeof Bookmarks === "undefined" ? "Click to inspect and organise saved pages" : await Bookmarks.peekSummary();
      case "srs-flyout": {
        const n = typeof SRS !== "undefined" ? SRS.dueCount() : 0;
        return n ? `${n} card${n === 1 ? "" : "s"} due today` : "All caught up";
      }
      case "venture-dash-flyout": {
        if (typeof VentureDashboard === "undefined" || !VentureDashboard.selected) return "";
        const n = VentureDashboard.ventureTasks().filter(t => !t.done).length;
        return `${VentureDashboard.selected}: ${n} open`;
      }
      case "schedule-flyout": {
        if (typeof Schedule === "undefined" || !Schedule.active) return "";
        return `${Schedule.active.name} profile active`;
      }
      case "gleam-flyout": {
        if (typeof GleamHQ === "undefined" || !GleamHQ.data) return "Private social confidence practice";
        const streak = GleamHQ.streak();
        return streak ? `${streak}-day practice streak · local only` : "Lessons · simulations · field missions · local only";
      }
      default:
        return "";
    }
  }

  document.querySelectorAll(".dock-btn[data-panel]").forEach(btn => {
    btn.onclick = async () => {
      await requestOpen(btn.dataset.panel, btn);
    };
    btn.onmouseenter = async () => {
      const rect = btn.getBoundingClientRect();
      peek.style.left = `${rect.left + rect.width / 2}px`;
      peek.textContent = await peekTextFor(btn.dataset.panel);
      peek.classList.add("show");
    };
    btn.onmouseleave = () => peek.classList.remove("show");
  });
  document.querySelectorAll(".flyout-close").forEach(btn => {
    btn.onclick = () => closeAll(true);
  });
  backdrop.onclick = () => closeAll(true);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const expanded = document.querySelector(".flyout.open.panel-fullscreen");
    if (expanded) {
      expanded.classList.remove("panel-fullscreen");
      expanded.dataset.depth = "mini";
      const expand = expanded.querySelector(":scope > .panel-head > .panel-expand");
      if (expand) {
        expand.title = "Expand to full workspace";
        expand.setAttribute("aria-label", expand.title);
        expand.setAttribute("aria-pressed", "false");
        Icons.apply(expand, "maximize-2");
        expand.focus();
      }
    } else if (document.querySelector(".flyout.open")) closeAll(true);
    else if (!moreTray.classList.contains("hidden")) {
      setMoreOpen(false);
      moreButton.focus();
    }
  });
}

// Context Bus v0 — zen and privacy are independent toggles in the UI, but
// the bus wants one combined "mode" string. Recomputed after every change
// on either side so it stays correct regardless of which one moved.
function syncContextMode() {
  const zen = document.body.classList.contains("zen-mode");
  const privacy = document.body.classList.contains("privacy-mode");
  const mode = zen && privacy ? "lockdown" : zen ? "zen" : privacy ? "privacy" : "normal";

  const privacyButton = document.getElementById("privacy-btn");
  const zenButton = document.getElementById("zen-btn");
  const lockdownButton = document.getElementById("lockdown-btn");
  privacyButton?.classList.toggle("active", privacy);
  zenButton?.classList.toggle("active", zen);
  lockdownButton?.classList.toggle("active", zen && privacy);
  privacyButton?.setAttribute("aria-pressed", String(privacy));
  zenButton?.setAttribute("aria-pressed", String(zen));
  lockdownButton?.setAttribute("aria-pressed", String(zen && privacy));

  if (typeof ContextBus !== "undefined") ContextBus.setMode(mode);
}

function wirePrivacyMode() {
  const isOn = () => document.body.classList.contains("privacy-mode");

  const engage = () => {
    ModeTransitions?.play?.("privacy", "Privacy veil", "Sensitive surfaces concealed");
    document.body.classList.add("privacy-mode");
    syncContextMode();
  };

  const disengageRaw = () => {
    ModeTransitions?.play?.("privacy", "Privacy released", "Workspace restored");
    document.body.classList.remove("privacy-mode");
    syncContextMode();
  };

  // Exiting is where a PIN (if set) matters — hiding should always be
  // instant and never blocked, since the whole point is speed when someone
  // is approaching. Only *revealing* it again needs friction.
  async function tryDisengage() {
    const { hq_privacy_pin } = await chrome.storage.local.get("hq_privacy_pin");
    if (!hq_privacy_pin) { disengageRaw(); return; }
    openPinModal(async (entered) => {
      if (entered === hq_privacy_pin) disengageRaw();
      else Wallpaper?.toast?.("Wrong PIN.");
    });
  }

  function toggle() {
    if (isOn()) tryDisengage();
    else engage();
  }

  document.getElementById("privacy-btn").onclick = toggle;
  document.querySelectorAll(".privacy-overlay").forEach(el => { el.onclick = toggle; });
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (!typing && e.altKey && e.key.toLowerCase() === "h") {
      e.preventDefault();
      toggle();
    }
  });

  // Auto-engage on idle (opt-in, set in Settings) — background.js's idle
  // listener writes a timestamp here; react to it live if this tab is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.hq_privacy_auto_trigger && !isOn()) {
      engage();
    }
  });
}

// Small on-page PIN modal — deliberately not a native prompt(), which is
// uglier and easier to fat-finger past. This is a casual deterrent against
// someone else on a shared device poking around, not real cryptographic
// security — anyone with DevTools access to this browser profile can see
// past it. Good enough for "sibling browsing on the family laptop," not
// good enough for "hostile actor with access to this machine."
function openPinModal(onSubmit) {
  const modal = document.getElementById("pin-modal");
  const input = document.getElementById("pin-modal-input");
  const previousFocus = document.activeElement;
  modal.classList.remove("hidden");
  modal.removeAttribute("inert");
  modal.setAttribute("aria-hidden", "false");
  input.value = "";
  input.focus();

  const cleanup = () => {
    modal.classList.add("hidden");
    modal.setAttribute("inert", "");
    modal.setAttribute("aria-hidden", "true");
    input.onkeydown = null;
    document.getElementById("pin-modal-submit").onclick = null;
    document.getElementById("pin-modal-cancel").onclick = null;
    modal.onkeydown = null;
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  };

  document.getElementById("pin-modal-submit").onclick = () => { const v = input.value; cleanup(); onSubmit(v); };
  document.getElementById("pin-modal-cancel").onclick = () => cleanup();
  modal.onkeydown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); cleanup(); }
    else trapFocus(e, modal);
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") { const v = input.value; cleanup(); onSubmit(v); }
  };
}

function wireZenMode() {
  const enter = (showTransition = true) => {
    if (showTransition) ModeTransitions?.play?.("zen", "Cinema view", "Interface dissolving into the scene");
    document.body.classList.add("zen-mode");
    document.getElementById("zen-reveal").classList.remove("hidden");
    syncContextMode();
  };
  const exit = () => {
    ModeTransitions?.play?.("zen", "HQ returning", "Living widgets restored");
    document.body.classList.remove("zen-mode");
    document.getElementById("zen-reveal").classList.add("hidden");
    syncContextMode();
  };
  document.getElementById("zen-btn").onclick = enter;
  document.getElementById("zen-reveal").onclick = exit;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("zen-mode")) exit();
    const tag = document.activeElement?.tagName;
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable;
    if (!typing && e.altKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      document.body.classList.contains("zen-mode") ? exit() : enter();
    }
  });

  document.getElementById("lockdown-btn").onclick = () => {
    ModeTransitions?.play?.("lockdown", "Lockdown sealed", "Privacy and Zen engaged");
    enter(false); // zen
    document.body.classList.add("privacy-mode"); // privacy, engaged directly (hiding is always instant, no PIN needed to hide)
    syncContextMode(); // enter() already synced, but privacy was added after — recompute now it's "lockdown"
  };
}

function wireTaskInput() {
  const form = document.getElementById("task-compose");
  const text = document.getElementById("task-compose-text");
  const close = () => {
    form.classList.add("hidden");
    form.reset();
    document.getElementById("task-compose-error").textContent = "";
    document.getElementById("add-task-btn").setAttribute("aria-expanded", "false");
  };
  document.getElementById("add-task-btn").setAttribute("aria-controls", "task-compose");
  document.getElementById("add-task-btn").setAttribute("aria-expanded", "false");
  document.getElementById("add-task-btn").onclick = () => {
    const opening = form.classList.contains("hidden");
    if (!opening) { close(); return; }
    form.classList.remove("hidden");
    const filter = document.getElementById("task-filter").value;
    document.getElementById("task-compose-venture").value = filter === "all" ? "" : filter;
    document.getElementById("add-task-btn").setAttribute("aria-expanded", "true");
    text.focus();
  };
  document.getElementById("task-compose-cancel").onclick = close;
  form.onsubmit = event => {
    event.preventDefault();
    const value = text.value.trim();
    if (!value) { document.getElementById("task-compose-error").textContent = "Write one clear next action."; text.focus(); return; }
    const estimateValue = Number(document.getElementById("task-compose-estimate").value);
    const estimate = Number.isFinite(estimateValue) && estimateValue >= 5 ? estimateValue : null;
    const dueValue = document.getElementById("task-compose-due").value;
    const due = dueValue ? new Date(`${dueValue}T17:00:00`).getTime() : undefined;
    const selectedPriority = document.getElementById("task-compose-priority").value;
    Tasks.add(value, document.getElementById("task-compose-venture").value || undefined, estimate, {
      priority: selectedPriority === "auto" ? undefined : selectedPriority,
      priorityReason: selectedPriority === "auto" ? undefined : "chosen in task composer",
      dueAt: due,
    });
    close();
  };
  document.getElementById("task-filter").onchange = () => Tasks.render();
}

// Notes is now handled by NotesEditor.init() (js/notes-editor.js), which
// includes its own graceful fallback to a plain textarea if the tiptap
// bundle didn't load — see that file for the full reasoning. The old
// plain-textarea-only wireNotes() this replaced is gone; nothing else in
// the codebase called it.

function wireBookmarkSorter() {
  const invoke = async method => {
    if (!(await LazyFeatures.ensure("bookmarks-flyout"))) return;
    await Bookmarks[method]();
  };
  document.getElementById("sort-bookmarks-btn").onclick = () => invoke("sortAll");
  document.getElementById("preview-bookmarks-btn").onclick = () => invoke("preview");
  document.getElementById("undo-bookmarks-btn").onclick = () => invoke("undo");
  document.getElementById("sort-inbox-btn").onclick = () => invoke("sortInboxOnly");
  document.getElementById("refine-uncategorized-btn").onclick = () => invoke("refineUncategorized");

  chrome.storage.local.get("hq_realtime_sort_enabled").then(s => {
    document.getElementById("toggle-realtime-sort").checked = s.hq_realtime_sort_enabled !== false;
  });
  document.getElementById("toggle-realtime-sort").onchange = (e) => {
    chrome.storage.local.set({ hq_realtime_sort_enabled: e.target.checked });
  };
}

const EXPORTABLE_KEYS = null; // null = export everything in local storage

function wireDataBackup() {
  const encryptToggle = document.getElementById("toggle-encrypt-backup");
  const encryptFields = document.getElementById("encrypt-backup-fields");
  encryptToggle.onchange = () => encryptFields.classList.toggle("hidden", !encryptToggle.checked);

  document.getElementById("export-data-btn").onclick = async () => {
    const all = await chrome.storage.local.get(null);
    const json = JSON.stringify(all, null, 2);
    let outputText = json;
    let filenameSuffix = "";

    if (encryptToggle.checked) {
      const pass = document.getElementById("backup-export-passphrase").value;
      const confirmPass = document.getElementById("backup-export-passphrase-confirm").value;
      if (!pass) { Wallpaper.toast("Enter a passphrase, or uncheck \"Encrypt with a passphrase.\""); return; }
      if (pass !== confirmPass) { Wallpaper.toast("Passphrases don't match."); return; }
      const envelope = await BackupCrypto.encrypt(json, pass);
      outputText = JSON.stringify(envelope, null, 2);
      filenameSuffix = "-encrypted";
    }

    const blob = new Blob([outputText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operation-hq-backup-${new Date().toISOString().slice(0, 10)}${filenameSuffix}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Wallpaper.toast(encryptToggle.checked ? "Encrypted backup downloaded." : "Backup downloaded.");
  };

  document.getElementById("import-data-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      let data = parsed;
      if (BackupCrypto.isEncryptedEnvelope(parsed)) {
        data = await promptDecryptBackup(parsed);
        if (!data) { e.target.value = ""; return; } // user cancelled
      }

      if (!confirm("This will overwrite your current tasks, notes, and settings with the backup file. Continue?")) {
        e.target.value = "";
        return;
      }
      await chrome.storage.local.set(data);
      Wallpaper.toast("Backup restored — reloading…");
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      console.error(err);
      Wallpaper.toast("That file didn't look like a valid backup.");
    }
    e.target.value = "";
  };
}

// Shows the passphrase modal and attempts decryption, letting the person
// retry on a wrong passphrase as many times as they want (no artificial
// attempt limit — anyone with the file already has unlimited local
// attempts regardless, so a UI-level cap would only inconvenience the
// legitimate owner). Resolves with the parsed plaintext data object, or
// null if the person cancels.
function promptDecryptBackup(envelope) {
  return new Promise((resolve) => {
    const modal = document.getElementById("backup-passphrase-modal");
    const input = document.getElementById("backup-passphrase-input");
    const errEl = document.getElementById("backup-passphrase-error");
    const submitBtn = document.getElementById("backup-passphrase-submit");
    const cancelBtn = document.getElementById("backup-passphrase-cancel");
    const previousFocus = document.activeElement;

    modal.classList.remove("hidden");
    modal.removeAttribute("inert");
    modal.setAttribute("aria-hidden", "false");
    input.value = "";
    errEl.textContent = "";
    input.focus();

    const cleanup = () => {
      modal.classList.add("hidden");
      modal.setAttribute("inert", "");
      modal.setAttribute("aria-hidden", "true");
      submitBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeydown = null;
      modal.onkeydown = null;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };

    const attempt = async () => {
      submitBtn.disabled = true;
      errEl.textContent = "Decrypting…";
      try {
        const plaintext = await BackupCrypto.decrypt(envelope, input.value);
        const data = JSON.parse(plaintext);
        cleanup();
        resolve(data);
      } catch (err) {
        errEl.textContent = "Wrong passphrase, or the file is corrupted — try again.";
        submitBtn.disabled = false;
        input.value = "";
        input.focus();
      }
    };

    submitBtn.onclick = attempt;
    cancelBtn.onclick = () => { cleanup(); resolve(null); };
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); attempt(); } };
    modal.onkeydown = (e) => {
      if (e.key === "Escape") { e.preventDefault(); cleanup(); resolve(null); }
      else trapFocus(e, modal);
    };
  });
}

async function wireApiKeys() {
  const secretFields = {
    "key-wallhaven": "hq_key_wallhaven",
    "key-unsplash": "hq_key_unsplash",
    "key-pexels": "hq_key_pexels",
    "key-claude": "hq_key_claude",
    "key-elevenlabs": "hq_key_elevenlabs",
  };
  const fields = {
    "key-webhook-plan": "hq_webhook_plan_url",
    "holiday-country-code": "hq_holiday_country",
    "key-spotify-client-id": "hq_spotify_client_id",
  };
  await CredentialVault.init();
  const [stored, secrets] = await Promise.all([
    chrome.storage.local.get(Object.values(fields)),
    CredentialVault.get(Object.values(secretFields)),
  ]);
  Object.entries(fields).forEach(([id, key]) => { document.getElementById(id).value = stored[key] || ""; });
  Object.entries(secretFields).forEach(([id, key]) => { document.getElementById(id).value = secrets[key] || ""; });

  Object.entries(secretFields).forEach(([id, key]) => {
    let debounce;
    document.getElementById(id).oninput = (event) => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        await CredentialVault.setSecret(key, event.target.value);
        if (key === "hq_key_claude") updateLockedToolBadges();
        if (key === "hq_key_elevenlabs" && typeof DailyPlanner !== "undefined") DailyPlanner.render();
        if (typeof IntegrationHealth !== "undefined") IntegrationHealth.render();
      }, 400);
    };
  });

  Object.entries(fields).forEach(([id, key]) => {
    let debounce;
    document.getElementById(id).oninput = (e) => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        // Country code is the one field that gets normalized before storage
        // (uppercase, 2 letters) — Nager.Date's API is case-sensitive about it.
        const value = id === "holiday-country-code"
          ? e.target.value.trim().toUpperCase().slice(0, 2)
          : e.target.value.trim();
        await chrome.storage.local.set({ [key]: value });
        if (key === "hq_holiday_country" && typeof Calendar !== "undefined") Calendar.render();
      }, 400);
    };
  });
}

async function boot() {
  await BootDiagnostics.run("Interface icons", () => applyStaticIcons());
  await BootDiagnostics.run("Recovery controls", () => wireRecoveryControls());
  await BootDiagnostics.run("Clock", () => { updateClock(); PageScheduler.register("clock", 1000, updateClock); });
  await BootDiagnostics.run("Greeting", () => setGreeting());

  await BootDiagnostics.run("Data migrations", () => StorageSchema.migrate());
  await BootDiagnostics.run("Context", () => ContextBus.init());
  await BootDiagnostics.run("Settings data", () => loadSettings());
  await BootDiagnostics.run("Cinematic motion", () => CinematicMotion.init());
  await BootDiagnostics.run("Layout", () => applyLayoutMode());
  await BootDiagnostics.run("Daily quote", () => Quotes.render());
  await BootDiagnostics.run("Research nudge", () => ResearchNudge.render());
  await BootDiagnostics.run("Settings drawer", () => wireSettingsDrawer());
  await BootDiagnostics.run("Wallpaper safety", () => wireWallpaperSafety());
  await BootDiagnostics.run("Research controls", () => wireResearchNudge());
  await BootDiagnostics.run("Local AI controls", () => wireLocalAI());
  await BootDiagnostics.run("Tool dock", () => wireDock());
  await BootDiagnostics.run("Zen mode", () => wireZenMode());
  await BootDiagnostics.run("Privacy mode", () => wirePrivacyMode());
  await BootDiagnostics.run("Layout controls", () => wireLayoutSettings());
  await BootDiagnostics.run("Task controls", () => wireTaskInput());
  await BootDiagnostics.run("Bookmark controls", () => wireBookmarkSorter());
  await BootDiagnostics.run("Integration keys", () => wireApiKeys());
  await BootDiagnostics.run("Data backup", () => wireDataBackup());
  await BootDiagnostics.run("Command palette", () => CommandPalette.init());

  await BootDiagnostics.run("Starter data", () => Seed.run());
  await BootDiagnostics.run("Tasks", () => Tasks.init());
  await BootDiagnostics.run("Daily tasks", () => DailyTasks.init());
  requestAnimationFrame(() => document.body.classList.add("app-ready"));
  await BootDiagnostics.run("Calendar", () => Calendar.init());
  await BootDiagnostics.run("Schedule", () => Schedule.init());
  await BootDiagnostics.run("Wallpaper", async () => {
    const { unit } = await Wallpaper.getIntervalSetting();
    await Wallpaper.apply(unit === "tab", false);
  });
  await BootDiagnostics.run("Focus timer", () => Pomodoro.init());
  await BootDiagnostics.run("Focus scenes", () => FocusScenes.init());
  await BootDiagnostics.run("Today", () => Today.init());
  await BootDiagnostics.run("Exam countdown", () => ExamCountdown.init());
  await BootDiagnostics.run("Daily planner", () => DailyPlanner.init());
  await BootDiagnostics.run("Completion detection", () => CompletionDetection.init());
  await BootDiagnostics.run("Weather", () => Weather.init());
  await BootDiagnostics.run("Capture inbox", () => Capture.init());
  await BootDiagnostics.run("Professional view", () => ProfessionalView.init());
  await BootDiagnostics.run("Deep Work", () => DeepWork.init());
  await BootDiagnostics.run("Nexus Core", () => Nexus.init());
  await BootDiagnostics.run("Living widgets", () => LivingWidgets.init());
  await BootDiagnostics.run("Tool availability", () => updateLockedToolBadges());
  BootDiagnostics.render();
  window.HQEarlyDiagnostics?.markHealthy();
}

async function bootstrap() {
  for (const path of CORE_SCRIPTS) {
    await BootDiagnostics.run(`Core definition · ${path}`, () => ScriptLoader.load(path));
  }
  await boot();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
else bootstrap();
