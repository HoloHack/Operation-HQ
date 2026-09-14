// nexus.js — local command routing and deliberate mission sequences.
//
// Nexus is intentionally deterministic: it never pretends a model understood
// something it did not, and it never scrapes third-party messaging services.
// Native HQ tools open inside the extension; services without a supported API
// hand off to their official web app in a new tab. Destructive tab actions and
// multi-step mode changes always stop at a review/confirmation surface first.

const Nexus = {
  selectedMission: null,
  pendingPlan: null,
  suggestionIndex: -1,
  suggestions: [],

  missions: {
    study: {
      title: "Study launch",
      steps: "Turn on Deep Work, set a 25-minute timer, start it, then open the Study OS command view.",
      minutes: "25",
      panel: "assignments-flyout",
    },
    build: {
      title: "Build sprint",
      steps: "Turn on Deep Work, set a 50-minute timer, start it, then open the Venture Dashboard.",
      minutes: "50",
      panel: "venture-dash-flyout",
    },
    review: {
      title: "Evening close",
      steps: "Open Weekly Signals so you can review completions, open work, and decide what belongs tomorrow.",
      panel: "stats-flyout",
    },
  },

  panelButton(panelId) {
    return document.querySelector(`.dock-btn[data-panel="${panelId}"]`);
  },

  openPanel(panelId, message) {
    const button = this.panelButton(panelId);
    if (!button) throw new Error(`Panel not available: ${panelId}`);
    button.click();
    this.setResult(message || "Opened.");
  },

  async openUrl(url, label) {
    await chrome.tabs.create({ url });
    this.setResult(`${label} opened in its official web app. Nexus does not read or send messages there.`);
  },

  setResult(message, state = "Ready") {
    const result = document.getElementById("nexus-result");
    const engineState = document.getElementById("nexus-engine-state");
    if (result) result.textContent = message;
    if (engineState) {
      engineState.textContent = state;
      engineState.dataset.state = state.toLowerCase().replace(/\s+/g, "-");
    }
    document.getElementById("nexus-flyout")?.setAttribute("data-engine-state", state.toLowerCase().replace(/\s+/g, "-"));
  },

  contextLine() {
    if (typeof ContextBus === "undefined") return "Local command routing is ready.";
    const c = ContextBus.get();
    const parts = [];
    if (c.mode && c.mode !== "normal") parts.push(`${c.mode[0].toUpperCase()}${c.mode.slice(1)} mode`);
    if (c.deepWork) parts.push("Deep Work on");
    parts.push(`${c.tasksOpen || 0} open task${c.tasksOpen === 1 ? "" : "s"}`);
    if (c.activeTaskText) parts.push(`Tracking: ${c.activeTaskText}`);
    if (c.currentScheduleBlock) parts.push(`Now: ${c.currentScheduleBlock}`);
    if (c.pomodoroRunning) parts.push("Focus timer running");
    return parts.join(" · ");
  },

  refreshContext() {
    const el = document.getElementById("nexus-context");
    if (el) el.textContent = this.contextLine();
    const c = typeof ContextBus !== "undefined" ? ContextBus.get() : {};
    const mode = c.mode && c.mode !== "normal" ? c.mode : c.deepWork ? "Deep Work" : "Normal";
    const values = {
      "nexus-telemetry-mode": mode[0]?.toUpperCase() + mode.slice(1),
      "nexus-telemetry-workload": `${c.tasksOpen || 0} open`,
      "nexus-telemetry-timeline": c.currentScheduleBlock || (c.pomodoroRunning ? "Focus active" : "Open time"),
      "nexus-telemetry-authority": "Local first",
    };
    Object.entries(values).forEach(([id, value]) => { const target = document.getElementById(id); if (target) target.textContent = value; });
  },

  normalizedCommand(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, " ");
  },

  async remember(command) {
    const { hq_nexus_recent = [] } = await chrome.storage.local.get("hq_nexus_recent");
    const recent = [command, ...hq_nexus_recent.filter(item => item !== command)].slice(0, 5);
    await chrome.storage.local.set({ hq_nexus_recent: recent });
    this.renderRecents(recent);
  },

  renderRecents(recent = []) {
    const container = document.getElementById("nexus-recent-commands");
    if (!container) return;
    container.replaceChildren(...recent.map(command => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nexus-recent-command";
      button.textContent = command;
      button.onclick = () => {
        document.getElementById("nexus-command-input").value = command;
        this.runCommand(command);
      };
      return button;
    }));
  },

  capabilityRegistry() {
    return [
      { id:"urgent-mail", label:"Urgent mail", aliases:["urgent email","priority inbox","important mail"], scope:"Gmail metadata", confirmation:"none", match:/\b(urgent|priority|important)\b.*\b(gmail|email|mail|inbox)\b|\b(gmail|email|mail|inbox)\b.*\b(urgent|priority|important)\b/, run:() => this.openPanel("gmail-flyout","Opened Gmail. Choose the Urgent smart lane to inspect the locally classified priority view.") },
      { id:"task-plan", label:"Task planner", aliases:["plan my tasks","build task plan","schedule my tasks"], scope:"Local schedule", confirmation:"review", match:/\b(plan|schedule|fit)\b.*\b(tasks?|work)\b/, run:() => this.openPanel("schedule-flyout","Opened Timeline Intelligence. Build Task Plan will preview every proposed calendar block before applying it.") },
      { id:"group-tabs", label:"Topic tab groups", aliases:["group my tabs","organise tabs","sort tabs"], scope:"Current Chrome window", confirmation:"review", match:/\b(group|organise|organize|sort)\b.*\btabs?\b/, run:() => this.openPanel("optimizer-flyout","Opened Browser Workspaces. Analyse current tabs previews topic groups before any group is created.") },
      { id:"assessment-intake", label:"Assessment Intake", aliases:["scan assessment downloads","analyse assessment brief","assessment intake","check downloaded tasks"], scope:"Optional download metadata and explicitly granted files", confirmation:"review before tracker, tasks or calendar", match:/\b(scan|analyse|analyze|check|read)\b.*\b(assessment|assignment|download|brief|rubric)\b/, run:() => this.openPanel("assignments-flyout","Opened Assessment Intake. File reading stays local and every extracted deadline remains a review draft until you accept it.") },
      { id:"native-ai", label:"Native AI", aliases:["open local ai","native ai lab","analyse text locally"], scope:"On-device WebGPU model", confirmation:"model download and each prompt are explicit", match:/\b(local|native|offline)\s+ai\b/, run:() => { document.getElementById("settings-btn")?.click(); document.querySelector('.settings-tab[data-cat="integrations"]')?.click(); this.setResult("Opened Native Intelligence Lab. It runs only after you load the local model and submit real text."); } },
      { id:"gleam", label:"Gleam social confidence lab", aliases:["open gleam","practice social skills","social confidence","conversation practice","rehearse a conversation"], scope:"Local lessons, simulations and reflections", confirmation:"real-world missions remain your choice", match:/\b(gleam|social skills?|social confidence|conversation practice|rehearse.*conversation)\b/, run:() => this.openPanel("gleam-flyout","Opened Gleam. Practice evidence stays local; simulations never claim to predict real people.") },
      { id:"tiktok", label:"TikTok messages", aliases:["open tiktok messages","tiktok inbox"], scope:"Official app handoff", confirmation:"none", match:/\btiktok\b/, run:() => this.openUrl("https://www.tiktok.com/messages","TikTok messages") },
      { id:"instagram", label:"Instagram messages", aliases:["open instagram messages","instagram inbox","insta messages"], scope:"Official app handoff", confirmation:"none", match:/\b(instagram|insta)\b/, run:() => this.openUrl("https://www.instagram.com/direct/inbox/","Instagram messages") },
      { id:"discord", label:"Discord", aliases:["open discord","discord messages"], scope:"Official app handoff", confirmation:"none", match:/\bdiscord\b/, run:() => this.openUrl("https://discord.com/channels/@me","Discord") },
      { id:"slack", label:"Slack", aliases:["open slack"], scope:"Official app handoff", confirmation:"none", match:/\bslack\b/, run:() => this.openUrl("https://app.slack.com/client","Slack") },
      { id:"teams", label:"Microsoft Teams", aliases:["open teams"], scope:"Official app handoff", confirmation:"none", match:/\bteams\b/, run:() => this.openUrl("https://teams.microsoft.com/v2/","Microsoft Teams") },
      { id:"gmail", label:"Gmail", aliases:["open gmail","show inbox","check email"], scope:"Gmail read-only", confirmation:"none", match:/\b(gmail|email|mail|inbox|messages?)\b/, run:() => this.openPanel("gmail-flyout","Opened the read-only Gmail view. Connect Google only when you choose to.") },
      { id:"today", label:"Today", aliases:["what next","what now","open today"], scope:"Local planning", confirmation:"none", match:/\b(today|what.*next|what.*now|daily view)\b/, run:() => this.openPanel("today-flyout","Opened Today: what is active, later, and waiting.") },
      { id:"calendar", label:"Calendar", aliases:["open calendar","show events"], scope:"Local calendar", confirmation:"none", match:/\b(calendar|event|appointment)\b/, run:() => this.openPanel("calendar-flyout","Opened your local calendar.") },
      { id:"notes", label:"Notes", aliases:["open notes","capture note","write note"], scope:"Local notes", confirmation:"none", match:/\b(note|notes|write|capture)\b/, run:() => this.openPanel("notes-flyout","Opened notes for a quick capture.") },
      { id:"focus", label:"Focus timer", aliases:["open focus","show timer","pomodoro"], scope:"Local timer", confirmation:"start requires review", match:/\b(focus|timer|pomodoro)\b/, run:() => this.openPanel("pomodoro-flyout","Opened the focus timer. Starting it remains your choice.") },
      { id:"workspaces", label:"Workspaces", aliases:["open workspaces","browser session","tab set"], scope:"Chrome tabs", confirmation:"restore opens new window", match:/\b(workspace|workspaces|browser session|tab set)\b/, run:() => this.openPanel("optimizer-flyout","Opened Browser Workspaces. Restoring creates a separate window and keeps this session intact.") },
      { id:"tabs", label:"Tab review", aliases:["clean tabs","duplicate tabs","tab optimiser"], scope:"Chrome tabs", confirmation:"review", match:/\b(tab|tabs|duplicate|optimizer|clean)\b/, run:() => this.openPanel("optimizer-flyout","Opened Tab Review. Nexus will not close tabs without your confirmation.") },
      { id:"bookmarks", label:"Bookmarks", aliases:["open bookmarks","sort bookmarks","saved pages"], scope:"Chrome bookmarks", confirmation:"review", match:/\b(bookmark|bookmarks|saved page)\b/, run:() => this.openPanel("bookmarks-flyout","Opened bookmarks.") },
      { id:"research-library", label:"Research pipeline", aliases:["open research","show sources","research library","source cards"], scope:"User-entered local source metadata", confirmation:"none", match:/\b(research|sources?|citations?|references?)\b/, run:async() => { this.openPanel("assignments-flyout","Opened Study OS. Choose Research to inspect source provenance and notes."); setTimeout(() => StudyOS?.showView?.("research"), 0); } },
      { id:"recall", label:"Recall Lab", aliases:["open recall","revision cards","flashcards","spaced repetition"], scope:"Local recall cards", confirmation:"reviews only reschedule the graded card", match:/\b(recall|flashcards?|spaced repetition|revision cards?)\b/, run:() => this.openPanel("srs-flyout","Opened Recall Lab.") },
      { id:"study", label:"Study OS", aliases:["open study","study command centre","what should i study"], scope:"Local assignments, exams, sources and tasks", confirmation:"mission launch requires review", match:/\b(study|study os|study command|what.*study)\b/, run:() => this.openPanel("assignments-flyout","Opened Study OS. It will choose only from your real local commitments.") },
      { id:"assignments", label:"Assignment centre", aliases:["open assignments","assessment deadlines","assignment planner"], scope:"Local study planning", confirmation:"calendar plans require review", match:/\b(assignments?|assessments?|deadlines?)\b/, run:async() => { this.openPanel("assignments-flyout","Opened Study OS. Calendar sessions remain review-only."); setTimeout(() => StudyOS?.showView?.("assignments"), 0); } },
      { id:"ventures", label:"Venture dashboard", aliases:["open ventures","projects","build dashboard"], scope:"Local venture data", confirmation:"none", match:/\b(venture|project|build dashboard)\b/, run:() => this.openPanel("venture-dash-flyout","Opened the Venture Dashboard.") },
      { id:"schedule", label:"Schedule", aliases:["open schedule","routine","timetable"], scope:"Local timetable", confirmation:"none", match:/\b(schedule|routine|timetable)\b/, run:() => this.openPanel("schedule-flyout","Opened schedules.") },
      { id:"stats", label:"Weekly signals", aliases:["open stats","weekly review","progress"], scope:"Local activity", confirmation:"none", match:/\b(stats|signals|progress|review)\b/, run:() => this.openPanel("stats-flyout","Opened Weekly Signals.") },
      { id: "settings", label:"Settings", aliases:["open settings","customize dashboard"], scope:"Local preferences", confirmation:"none", match: /\b(settings?|preferences?|customi[sz]e)\b/, run: () => {
        document.getElementById("settings-btn")?.click();
        this.setResult("Opened Settings.");
      } },
      { id: "new-task", label:"New task", aliases:["add a task","create new task"], scope:"Local tasks", confirmation:"form submission", match: /\b(add|new|create)\b.*\btask\b|\btask\b.*\b(add|new|create)\b/, run: () => {
        document.getElementById("add-task-btn")?.click();
        this.setResult("Opened the task form. Nothing is saved until you submit it.");
      } },
    ];
  },

  commandSuggestions(query = "") {
    const normalized = this.normalizedCommand(query);
    const words = normalized.split(" ").filter(Boolean);
    return this.capabilityRegistry().flatMap(capability => (capability.aliases || []).map(command => {
      const lower = command.toLowerCase();
      const prefix = normalized && lower.startsWith(normalized) ? 8 : 0;
      const wordScore = words.reduce((score, word) => score + (lower.includes(word) ? 2 : 0), 0);
      return { command, capability, score: prefix + wordScore + (!normalized ? 1 : 0) };
    })).filter(item => !normalized || item.score > 0).sort((a,b) => b.score - a.score || a.command.localeCompare(b.command)).slice(0, 5);
  },

  renderSuggestions(query = "") {
    const container = document.getElementById("nexus-suggestions");
    this.suggestions = this.commandSuggestions(query);
    this.suggestionIndex = -1;
    container.hidden = !this.suggestions.length || !query.trim();
    container.replaceChildren(...this.suggestions.map((item,index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role","option");
      button.setAttribute("aria-selected","false");
      button.dataset.index = String(index);
      button.innerHTML = `<span>${escapeHtml(item.command)}</span><small>${escapeHtml(item.capability.scope)} · ${escapeHtml(item.capability.confirmation)}</small>`;
      button.onclick = () => this.chooseSuggestion(index);
      return button;
    }));
  },

  chooseSuggestion(index) {
    const item = this.suggestions[index];
    if (!item) return;
    const input = document.getElementById("nexus-command-input");
    input.value = item.command;
    document.getElementById("nexus-suggestions").hidden = true;
    input.focus();
  },

  moveSuggestion(direction) {
    if (!this.suggestions.length) return;
    this.suggestionIndex = (this.suggestionIndex + direction + this.suggestions.length) % this.suggestions.length;
    document.querySelectorAll("#nexus-suggestions [role=option]").forEach((button,index) => {
      const selected = index === this.suggestionIndex;
      button.classList.toggle("selected",selected);
      button.setAttribute("aria-selected",String(selected));
    });
  },

  traceCapability(capability, command) {
    const trace = document.getElementById("nexus-command-trace");
    if (!trace) return;
    trace.textContent = `Matched ${capability.label} · ${capability.scope} · ${capability.confirmation === "none" ? "direct" : capability.confirmation} · “${command}”`;
  },

  previewPlan(plan) {
    this.pendingPlan = plan;
    document.getElementById("nexus-plan-title").textContent = plan.title;
    document.getElementById("nexus-plan-steps").textContent = plan.steps;
    document.getElementById("nexus-plan-preview").hidden = false;
    this.setResult("Review the exact change, then confirm or cancel.", "Review required");
  },

  cancelPlan() {
    this.pendingPlan = null;
    document.getElementById("nexus-plan-preview").hidden = true;
    this.setResult("Cancelled. Nothing was changed.");
  },

  async confirmPlan() {
    if (!this.pendingPlan) return;
    const plan = this.pendingPlan;
    const button = document.getElementById("nexus-plan-run");
    button.disabled = true;
    this.setResult(`Running ${plan.title.toLowerCase()}…`, "Working");
    try {
      await plan.run();
      this.pendingPlan = null;
      document.getElementById("nexus-plan-preview").hidden = true;
      this.refreshContext();
      this.setResult(`${plan.title} completed.`);
    } catch (error) {
      console.error("Nexus plan failed:", error);
      this.setResult("The action stopped safely. Review the current state before retrying.", "Action failed");
    } finally {
      button.disabled = false;
    }
  },

  async runCommand(raw) {
    const command = this.normalizedCommand(raw);
    if (!command) {
      this.setResult("Type a command, or choose a mission or handoff below.", "Waiting");
      return;
    }

    this.setResult("Routing locally…", "Working");
    try {
      const timerMatch = command.match(/\b(\d{1,3})\s*(?:minute|minutes|min|mins)\b/);
      if (/\b(start|begin|run)\b/.test(command) && /\b(focus|timer|pomodoro)\b/.test(command) && timerMatch) {
        const minutes = Number(timerMatch[1]);
        if (minutes < 1 || minutes > 180) {
          return this.setResult("Choose a focus duration between 1 and 180 minutes.", "Needs input");
        }
        await this.remember(command);
        return this.previewPlan({
          title: `Start ${minutes}-minute focus`,
          steps: `Set the timer to ${minutes} minutes and start it. Deep Work will not be changed.`,
          run: async () => {
            const select = document.getElementById("pomo-mode");
            let custom = select.querySelector('option[data-nexus-custom="true"]');
            if (!custom) { custom = document.createElement("option"); custom.dataset.nexusCustom = "true"; select.appendChild(custom); }
            custom.value = String(minutes);
            custom.textContent = `Custom ${minutes}`;
            select.value = String(minutes);
            select.dispatchEvent(new Event("change", { bubbles: true }));
            if (!Pomodoro.running) await Pomodoro.toggle();
          },
        });
      }

      const enableDeepWork = /(?:\b(?:enable|activate)\b.*\bdeep work\b|\b(?:turn|switch)\s+on\b.*\bdeep work\b)/.test(command);
      const disableDeepWork = /(?:\b(?:disable|deactivate)\b.*\bdeep work\b|\b(?:turn|switch)\s+off\b.*\bdeep work\b)/.test(command);
      if (enableDeepWork && !DeepWork.active) {
        await this.remember(command);
        return this.previewPlan({ title: "Enable Deep Work", steps: "Activate your saved blocking and JavaScript-restriction lists.", run: () => DeepWork.toggle() });
      }
      if (enableDeepWork && DeepWork.active) {
        return this.setResult("Deep Work is already enabled.");
      }
      if (disableDeepWork && DeepWork.active) {
        await this.remember(command);
        return this.previewPlan({ title: "Disable Deep Work", steps: "Restore access to sites controlled by your Deep Work lists.", run: () => DeepWork.toggle() });
      }
      if (disableDeepWork && !DeepWork.active) {
        return this.setResult("Deep Work is already disabled.");
      }

      // Named services precede generic message terms in registry order.
      const capability = this.capabilityRegistry().find(item => item.match.test(command));
      if (capability) {
        await this.remember(command);
        this.traceCapability(capability, command);
        return await capability.run();
      }

      this.setResult("I couldn't match that safely. Try Gmail, calendar, notes, focus, tabs, bookmarks, study, ventures, schedules, stats, settings, or a named message service.", "No match");
    } catch (error) {
      console.error("Nexus command failed:", error);
      this.setResult("That action could not be completed. Nothing else was changed.", "Action failed");
    }
  },

  selectMission(id) {
    const mission = this.missions[id];
    if (!mission) return;
    this.selectedMission = id;
    document.querySelectorAll(".nexus-mission").forEach(button => {
      const selected = button.dataset.nexusMission === id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    document.getElementById("nexus-mission-title").textContent = mission.title;
    document.getElementById("nexus-mission-steps").textContent = mission.steps;
    document.getElementById("nexus-mission-preview").hidden = false;
    this.setResult("Review the sequence, then confirm if you want Nexus to run it.", "Review required");
  },

  async runMission() {
    const mission = this.missions[this.selectedMission];
    if (!mission) return;
    const runButton = document.getElementById("nexus-mission-run");
    runButton.disabled = true;
    this.setResult(`Starting ${mission.title.toLowerCase()}…`, "Working");
    try {
      if (mission.minutes) {
        if (typeof DeepWork !== "undefined" && !DeepWork.active) await DeepWork.toggle();
        const mode = document.getElementById("pomo-mode");
        mode.value = mission.minutes;
        mode.dispatchEvent(new Event("change", { bubbles: true }));
        if (typeof Pomodoro !== "undefined" && !Pomodoro.running) await Pomodoro.toggle();
      }
      this.openPanel(mission.panel, `${mission.title} is active${mission.minutes ? ` with a ${mission.minutes}-minute timer` : ""}.`);
      document.getElementById("nexus-mission-preview").hidden = true;
      document.querySelectorAll(".nexus-mission").forEach(button => {
        button.classList.remove("selected");
        button.setAttribute("aria-pressed", "false");
      });
      this.selectedMission = null;
      this.refreshContext();
    } catch (error) {
      console.error("Nexus mission failed:", error);
      this.setResult("The mission could not finish. Review the current focus state before trying again.", "Mission stopped");
    } finally {
      runButton.disabled = false;
    }
  },

  async init() {
    const form = document.getElementById("nexus-command-form");
    const input = document.getElementById("nexus-command-input");
    if (!form || !input) return;

    form.addEventListener("submit", event => {
      event.preventDefault();
      document.getElementById("nexus-suggestions").hidden = true;
      this.runCommand(input.value);
    });
    input.setAttribute("aria-controls", "nexus-suggestions");
    input.setAttribute("aria-autocomplete", "list");
    input.addEventListener("input", () => this.renderSuggestions(input.value));
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSuggestion(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Tab" && this.suggestionIndex >= 0) {
        event.preventDefault();
        this.chooseSuggestion(this.suggestionIndex);
      } else if (event.key === "Escape") {
        document.getElementById("nexus-suggestions").hidden = true;
      }
    });
    document.querySelectorAll("[data-nexus-command]").forEach(button => {
      button.onclick = () => {
        input.value = button.dataset.nexusCommand;
        this.runCommand(input.value);
      };
    });
    document.querySelectorAll("[data-nexus-mission]").forEach(button => {
      button.setAttribute("aria-pressed", "false");
      button.onclick = () => this.selectMission(button.dataset.nexusMission);
    });
    document.getElementById("nexus-mission-run").onclick = () => this.runMission();
    document.getElementById("nexus-plan-run").onclick = () => this.confirmPlan();
    document.getElementById("nexus-plan-cancel").onclick = () => this.cancelPlan();
    const { hq_nexus_recent = [] } = await chrome.storage.local.get("hq_nexus_recent");
    this.renderRecents(Array.isArray(hq_nexus_recent) ? hq_nexus_recent : []);
    document.getElementById("nexus-clear-recents").onclick = async () => {
      await chrome.storage.local.remove("hq_nexus_recent");
      this.renderRecents([]);
      this.setResult("Recent commands cleared.");
    };

    // Plain J is intentionally limited to non-editing contexts. Browser and
    // operating-system shortcuts always win when a modifier key is held.
    document.addEventListener("keydown", event => {
      if (event.key.toLowerCase() !== "j" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
      event.preventDefault();
      this.panelButton("nexus-flyout")?.click();
    });

    if (typeof ContextBus !== "undefined") ContextBus.onChange(() => this.refreshContext());
    this.refreshContext();
  },
};
