// command-palette.js — Cmd/Ctrl+K command palette (Roadmap §9, H1).
//
// Deliberately does not reimplement any action. Every command here just
// calls .click() on the same button that already does the thing — the
// dock buttons, the top-bar toggles, the settings actions. That means
// there is exactly one place each action's logic lives (rule 8), and the
// palette can never drift out of sync with what the buttons themselves do
// (e.g. a locked-tool badge on a Claude-gated panel still shows up,
// because opening it still goes through the same wireDock() code path).
//
// Also doubles as the first real, visible consumer of Context Bus v0 —
// the "right now" line at the top reads live from ContextBus.get().

const CommandPalette = {
  _open: false,
  _selected: 0,
  _filtered: [],
  _previousFocus: null,

  // Static commands not tied to a dock panel. Each `run` just clicks the
  // real button so the real handler fires — see file header.
  staticCommands() {
    return [
      { label: "Add Task", hint: "Master task list", run: () => document.getElementById("add-task-btn")?.click() },
      { label: "Toggle Privacy Mode", hint: "Alt+H — hide tasks/notes/inbox instantly", run: () => document.getElementById("privacy-btn")?.click() },
      { label: "Toggle Professional View", hint: "Hide personal ventures for screen-sharing", run: () => document.getElementById("pro-view-btn")?.click() },
      { label: "Lockdown", hint: "Zen + Privacy together, for calls", run: () => document.getElementById("lockdown-btn")?.click() },
      { label: "Toggle Zen Mode", hint: "Hide everything but the wallpaper", run: () => document.getElementById("zen-btn")?.click() },
      { label: "Toggle Deep Work", hint: "Block distracting sites (list managed in Settings)", run: () => document.getElementById("deepwork-btn")?.click() },
      { label: "Open Settings", hint: "", run: () => document.getElementById("settings-btn")?.click() },
      { label: "Export Data", hint: "Download a full JSON backup", run: () => document.getElementById("export-data-btn")?.click() },
      { label: "Shuffle Wallpaper", hint: "Fetch a new one now", run: () => document.getElementById("wallpaper-refresh-now")?.click() },
      { label: "Sort Bookmarks Now", hint: "Bulk-run the classifier", run: () => document.getElementById("sort-bookmarks-btn")?.click() },
    ];
  },

  // Every dock button becomes a command automatically — nothing to
  // maintain here when a new panel gets added to the dock later.
  dockCommands() {
    return Array.from(document.querySelectorAll(".dock-btn[data-panel]")).map(btn => {
      const title = btn.title || btn.dataset.panel;
      const label = title.split(" (")[0]; // drop the "(requires Claude API key)"-style suffix from the short label
      const hint = title.includes("(") ? title.slice(title.indexOf("(")) : "";
      return { label: `Open ${label}`, hint, run: () => btn.click() };
    });
  },

  allCommands() {
    return [...this.staticCommands(), ...this.dockCommands()];
  },

  contextLine() {
    if (typeof ContextBus === "undefined") return "";
    const c = ContextBus.get();
    const parts = [];
    if (c.mode && c.mode !== "normal") parts.push(c.mode[0].toUpperCase() + c.mode.slice(1) + " mode");
    if (c.deepWork) parts.push("Deep Work on");
    parts.push(`${c.tasksOpen} task${c.tasksOpen === 1 ? "" : "s"} left`);
    if (c.tasksDoneToday) parts.push(`${c.tasksDoneToday} done today`);
    if (c.activeTaskText) parts.push(`Tracking: ${c.activeTaskText}`);
    if (c.pomodoroRunning) parts.push("Focus timer running");
    return parts.join(" · ");
  },

  filter(query) {
    const q = query.trim().toLowerCase();
    const all = this.allCommands();
    if (!q) return all;
    return all
      .map(c => ({ c, i: c.label.toLowerCase().indexOf(q) }))
      .filter(x => x.i !== -1)
      .sort((a, b) => a.i - b.i)
      .map(x => x.c);
  },

  render() {
    const input = document.getElementById("palette-input");
    const list = document.getElementById("palette-results");
    const ctxEl = document.getElementById("palette-context");

    ctxEl.textContent = this.contextLine();
    this._filtered = this.filter(input.value);
    this._selected = Math.min(this._selected, Math.max(0, this._filtered.length - 1));

    list.innerHTML = this._filtered.map((c, i) => `
      <li id="palette-option-${i}" class="palette-item ${i === this._selected ? "selected" : ""}" data-i="${i}" role="option" aria-selected="${i === this._selected}">
        <span class="palette-label">${c.label}</span>
        ${c.hint ? `<span class="palette-hint">${c.hint}</span>` : ""}
      </li>
    `).join("") || '<li class="empty-state">No matching command.</li>';

    list.querySelectorAll(".palette-item").forEach(el => {
      el.onclick = () => this.run(parseInt(el.dataset.i));
    });
    input.setAttribute("aria-activedescendant", this._filtered.length ? `palette-option-${this._selected}` : "");
  },

  run(i) {
    const c = this._filtered[i];
    if (!c) return;
    this.close();
    c.run();
  },

  open() {
    this._open = true;
    this._selected = 0;
    const overlay = document.getElementById("command-palette");
    const input = document.getElementById("palette-input");
    this._previousFocus = document.activeElement;
    overlay.classList.remove("hidden");
    overlay.removeAttribute("inert");
    overlay.inert = false;
    overlay.setAttribute("aria-hidden", "false");
    input.setAttribute("aria-expanded", "true");
    document.getElementById("palette-btn").setAttribute("aria-expanded", "true");
    input.value = "";
    this.render();
    input.focus();
  },

  close() {
    this._open = false;
    const overlay = document.getElementById("command-palette");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    document.getElementById("palette-input").setAttribute("aria-expanded", "false");
    document.getElementById("palette-btn").setAttribute("aria-expanded", "false");
    if (this._previousFocus?.focus) this._previousFocus.focus();
    this._previousFocus = null;
  },

  toggle() {
    this._open ? this.close() : this.open();
  },

  init() {
    const paletteButton = document.getElementById("palette-btn");
    paletteButton.setAttribute("aria-controls", "command-palette");
    paletteButton.setAttribute("aria-expanded", "false");
    paletteButton.onclick = () => this.toggle();

    // Capture phase + stopPropagation, not the default bubble phase: this
    // extension has several other document-level keydown listeners
    // (wireDock's Escape-closes-flyout, wireZenMode's Escape-exits-zen,
    // wirePrivacyMode's Alt+H) that don't know about each other. Without
    // this, pressing Escape while the palette is open would also close
    // whatever flyout or mode happens to be open underneath it, since
    // bubble-phase listeners all fire for the same event regardless of
    // registration order. Capture phase runs first and stopPropagation
    // here means "the palette owns this keystroke," full stop.
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Cmd+K (Mac) / Ctrl+K (Win/Linux/ChromeOS) opens or closes it from
        // anywhere, even while typing elsewhere — that's the whole point of
        // a command palette. Browsers generally let page JS intercept this
        // combo (Notion/Slack/Linear all do the same thing), but this
        // hasn't been confirmed inside an actual Chrome window for this
        // extension specifically — the palette-btn click target above is
        // the guaranteed fallback if the shortcut ever gets swallowed by
        // the browser instead of reaching the page.
        e.preventDefault();
        e.stopPropagation();
        this.toggle();
        return;
      }
      if (!this._open) return;
      if (e.key === "Tab") { trapFocus(e, document.getElementById("command-palette")); e.stopPropagation(); return; }
      if (e.key === "Escape") { e.stopPropagation(); this.close(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); this._selected = Math.min(this._selected + 1, this._filtered.length - 1); this.render(); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); this._selected = Math.max(this._selected - 1, 0); this.render(); return; }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); this.run(this._selected); return; }
    }, true);

    document.getElementById("palette-input").oninput = () => { this._selected = 0; this.render(); };
    document.getElementById("command-palette").onclick = (e) => {
      if (e.target.id === "command-palette") this.close(); // click on the backdrop, not the box
    };
  },
};
