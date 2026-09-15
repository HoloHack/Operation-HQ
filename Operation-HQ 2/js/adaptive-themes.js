// adaptive-themes.js — generates a fresh, subject-aware visual system for a
// named focus session. It is deterministic UI composition, not a pretend
// cloud model: the subject, local time, current environment and a generation
// seed feed colour-theory and contrast rules. The person always chooses one
// of three previews before anything is applied.

const AdaptiveThemes = {
  KEY: "hq_adaptive_theme_v1",
  ACTIVE_KEY: "hq_adaptive_theme_active_v1",
  generation: 0,
  current: null,
  proposals: [],
  proposalLabel: "",
  lastPromptedKey: "",

  clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
  },

  key(value) {
    return this.clean(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  },

  hash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  },

  subject(label) {
    const text = this.clean(label).toLocaleLowerCase();
    const families = [
      { id: "mathematics", label: "mathematics", hue: 207, pace: "precision", terms: /\b(math|maths|mathematics|algebra|geometry|calculus|statistics|probability|cambridge|chapter)\b/ },
      { id: "science", label: "science", hue: 166, pace: "analysis", terms: /\b(science|biology|chemistry|physics|experiment|lab)\b/ },
      { id: "humanities", label: "humanities", hue: 34, pace: "archive", terms: /\b(hsie|history|geography|commerce|economics|society|culture)\b/ },
      { id: "english", label: "English", hue: 276, pace: "editorial", terms: /\b(english|essay|novel|poem|speech|analysis|writing|literature)\b/ },
      { id: "technology", label: "technology", hue: 187, pace: "systems", terms: /\b(coding|code|software|technology|engineering|design|robotics|computing)\b/ },
      { id: "language", label: "languages", hue: 326, pace: "cadence", terms: /\b(language|french|spanish|japanese|chinese|latin|vocabulary)\b/ },
      { id: "creative", label: "creative work", hue: 18, pace: "studio", terms: /\b(art|music|creative|film|media|drawing|composition)\b/ },
    ];
    return families.find(family => family.terms.test(text)) || {
      id: "general",
      label: text ? "this session" : "focused work",
      hue: this.hash(text || "focus") % 360,
      pace: "focus",
    };
  },

  hsl(h, s, l) {
    const hue = ((h % 360) + 360) % 360;
    const saturation = Math.max(0, Math.min(100, s)) / 100;
    const lightness = Math.max(0, Math.min(100, l)) / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = lightness - chroma / 2;
    let rgb = hue < 60 ? [chroma,x,0] : hue < 120 ? [x,chroma,0] : hue < 180 ? [0,chroma,x] : hue < 240 ? [0,x,chroma] : hue < 300 ? [x,0,chroma] : [chroma,0,x];
    return rgb.map(value => Math.round((value + m) * 255));
  },

  hex(rgb) {
    return `#${rgb.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
  },

  mix(a, b, amount = 0.5) {
    return a.map((value, index) => Math.round(value * (1 - amount) + b[index] * amount));
  },

  generatedName(seed, subject, index) {
    const first = ["Lucid", "Quiet", "Vector", "Liminal", "Solar", "Deep", "Aerial", "Kinetic", "Clear", "Nova"];
    const second = ["Current", "Archive", "Orbit", "Studio", "Field", "Aperture", "Canvas", "Signal", "Horizon", "Circuit"];
    const a = first[(seed + index * 3) % first.length];
    const b = second[((seed >>> 5) + index * 5) % second.length];
    return `${a} ${b}`;
  },

  environmentNow() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--environment-rgb").trim().split(",").map(Number);
    return raw.length === 3 && raw.every(Number.isFinite) ? raw : [124, 92, 255];
  },

  generate(label, count = 3) {
    const cleanLabel = this.clean(label) || "Focused work";
    const subject = this.subject(cleanLabel);
    const now = new Date();
    const seed = this.hash(`${cleanLabel}|${now.getHours()}|${this.generation}`);
    const ambient = this.environmentNow();
    const choreographies = ["prism", "iris", "velocity", "bloom"];
    const shapes = ["precision", "soft", "editorial", "panoramic"];
    return Array.from({ length: count }, (_, index) => {
      const variance = ((seed >>> (index * 5)) % 43) - 21;
      const hue = subject.hue + variance + index * 37;
      const saturation = 68 + ((seed >>> (index * 3 + 2)) % 18);
      const primary = this.hsl(hue, saturation, 62 + index * 2);
      const secondary = this.hsl(hue + (index === 1 ? 146 : 64 + index * 19), Math.max(54, saturation - 8), 58 + index * 3);
      const surface = this.hsl(hue + 8, 28 + index * 5, 7 + index * 2);
      const environment = this.mix(this.hsl(hue + 24, 58, 50), ambient, 0.28);
      const choreography = choreographies[(seed + index) % choreographies.length];
      const shape = shapes[((seed >>> 8) + index) % shapes.length];
      return {
        id: `${this.key(cleanLabel) || "focus"}-${this.generation}-${index}-${seed.toString(36)}`,
        focusKey: this.key(cleanLabel),
        label: cleanLabel,
        subject: subject.id,
        subjectLabel: subject.label,
        name: this.generatedName(seed, subject, index),
        primary,
        secondary,
        environment,
        surface,
        choreography,
        shape,
        rationale: `${subject.pace} rhythm · ${choreography} transition · high-contrast dark surface`,
        createdAt: Date.now(),
      };
    });
  },

  applyVariables(scheme) {
    if (!scheme) return;
    const root = document.documentElement;
    root.style.setProperty("--accent", this.hex(scheme.primary));
    root.style.setProperty("--accent-rgb", scheme.primary.join(","));
    root.style.setProperty("--accent-2", this.hex(scheme.secondary));
    root.style.setProperty("--accent-2-rgb", scheme.secondary.join(","));
    root.style.setProperty("--environment-rgb", scheme.environment.join(","));
    root.style.setProperty("--theme-surface-rgb", scheme.surface.join(","));
    document.body.dataset.adaptiveTheme = scheme.id;
    document.body.dataset.themeChoreo = scheme.choreography;
    document.body.dataset.themeShape = scheme.shape;
    document.body.dataset.themeSubject = scheme.subject || "general";
  },

  environmentRGB() {
    return Array.isArray(this.current?.environment) ? this.current.environment : null;
  },

  async apply(scheme, { animate = true } = {}) {
    if (!scheme || !Array.isArray(scheme.primary)) return false;
    this.current = scheme;
    if (animate && typeof ModeTransitions !== "undefined") {
      ModeTransitions.play("theme", scheme.name, `${scheme.label} · ${scheme.rationale}`, {
        choreo: scheme.choreography,
        primaryRgb: scheme.primary,
        secondaryRgb: scheme.secondary,
      });
    }
    const mutate = () => this.applyVariables(scheme);
    if (animate && document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      try { document.startViewTransition(mutate); } catch { mutate(); }
    } else mutate();
    await chrome.storage.local.set({
      [this.KEY]: scheme,
      [this.ACTIVE_KEY]: true,
      hq_accent: this.hex(scheme.primary),
      hq_wallpaper_adaptive_colour: false,
      hq_active_mod: null,
    });
    document.getElementById("wallpaper-adaptive-colour")?.toggleAttribute("checked", false);
    const adaptiveToggle = document.getElementById("wallpaper-adaptive-colour");
    if (adaptiveToggle) adaptiveToggle.checked = false;
    this.renderAppliedState();
    if (typeof AmbientCompositor !== "undefined") AmbientCompositor.signal({ x: innerWidth / 2, y: innerHeight / 2 }, 1);
    if (typeof Wallpaper !== "undefined") Wallpaper.toast(`${scheme.name} deployed for ${scheme.label}.`);
    return true;
  },

  renderAppliedState() {
    document.querySelectorAll(".focus-theme-option").forEach(button => {
      const active = button.dataset.schemeId === this.current?.id;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      const action = button.querySelector(".focus-theme-action");
      if (action) action.textContent = active ? "Active" : "Use this";
    });
  },

  proposalHtml(scheme) {
    const safeName = typeof escapeHtml === "function" ? escapeHtml(scheme.name) : scheme.name;
    const safeReason = typeof escapeHtml === "function" ? escapeHtml(scheme.rationale) : scheme.rationale;
    return `<button class="focus-theme-option" type="button" data-scheme-id="${scheme.id}" aria-pressed="false" style="--proposal-primary:${scheme.primary.join(",")};--proposal-secondary:${scheme.secondary.join(",")};--proposal-surface:${scheme.surface.join(",")}">
      <span class="focus-theme-visual" aria-hidden="true"><i></i><b></b><em></em></span>
      <span class="focus-theme-meta"><strong>${safeName}</strong><small>${safeReason}</small></span>
      <span class="focus-theme-action">Use this</span>
    </button>`;
  },

  propose(label, { regenerate = false } = {}) {
    const cleanLabel = this.clean(label) || "Focused work";
    if (regenerate) this.generation += 1;
    this.proposalLabel = cleanLabel;
    this.lastPromptedKey = this.key(cleanLabel);
    this.proposals = this.generate(cleanLabel, 3);
    const panel = document.getElementById("focus-theme-proposal");
    const options = document.getElementById("focus-theme-options");
    const heading = document.getElementById("focus-theme-heading");
    if (!panel || !options) return this.proposals;
    if (heading) heading.textContent = `Choose a look for ${cleanLabel}`;
    options.innerHTML = this.proposals.map(scheme => this.proposalHtml(scheme)).join("");
    options.querySelectorAll(".focus-theme-option").forEach(button => {
      button.onclick = async () => {
        const scheme = this.proposals.find(item => item.id === button.dataset.schemeId);
        if (scheme) await this.apply(scheme);
      };
    });
    panel.classList.remove("hidden");
    this.renderAppliedState();
    return this.proposals;
  },

  shouldSuggest(label) {
    const key = this.key(label);
    return !!key && key !== this.current?.focusKey && key !== this.lastPromptedKey;
  },

  async deactivate() {
    this.current = null;
    ["--accent","--accent-rgb","--accent-2","--accent-2-rgb","--environment-rgb","--theme-surface-rgb"].forEach(property => document.documentElement.style.removeProperty(property));
    document.body.removeAttribute("data-adaptive-theme");
    document.body.removeAttribute("data-theme-choreo");
    document.body.removeAttribute("data-theme-shape");
    document.body.removeAttribute("data-theme-subject");
    await chrome.storage.local.set({ [this.ACTIVE_KEY]: false });
  },

  bind() {
    const generate = document.getElementById("focus-theme-ideas");
    const regenerate = document.getElementById("focus-theme-regenerate");
    const dismiss = document.getElementById("focus-theme-dismiss");
    const input = document.getElementById("focus-context-input");
    if (generate) generate.onclick = () => this.propose(input?.value || "Focused work", { regenerate: true });
    if (regenerate) regenerate.onclick = () => this.propose(input?.value || this.proposalLabel || "Focused work", { regenerate: true });
    if (dismiss) dismiss.onclick = () => document.getElementById("focus-theme-proposal")?.classList.add("hidden");
  },

  async init() {
    const saved = await chrome.storage.local.get([this.KEY, this.ACTIVE_KEY]);
    const scheme = saved[this.KEY];
    if (saved[this.ACTIVE_KEY] === true && scheme && Array.isArray(scheme.primary) && Array.isArray(scheme.secondary)) {
      this.current = scheme;
      this.applyVariables(scheme);
    }
    this.bind();
    return true;
  },
};
