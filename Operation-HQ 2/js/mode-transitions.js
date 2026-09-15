// mode-transitions.js — one cinematic, non-blocking transition language.
// Each operating mode has its own visual signature, while reduced-motion
// keeps the same state cue without the large spatial movement.
const ModeTransitions = {
  timer: null,

  play(type, title, detail = "", options = {}) {
    const root = document.getElementById("mode-transition");
    if (!root) return;
    clearTimeout(this.timer);
    root.className = "mode-transition";
    root.dataset.kind = type;
    root.dataset.choreo = options.choreo || "default";
    if (options.primaryRgb) root.style.setProperty("--transition-rgb", options.primaryRgb.join(","));
    else root.style.removeProperty("--transition-rgb");
    if (options.secondaryRgb) root.style.setProperty("--transition-secondary-rgb", options.secondaryRgb.join(","));
    else root.style.removeProperty("--transition-secondary-rgb");
    root.querySelector(".mode-transition-title").textContent = title;
    root.querySelector(".mode-transition-detail").textContent = detail;
    root.setAttribute("aria-hidden", "false");
    document.body.classList.toggle("theme-reframing", type === "theme");
    if (typeof AmbientCompositor !== "undefined") AmbientCompositor.transition(type);
    // Restart the animation even when the same mode is toggled twice.
    void root.offsetWidth;
    root.classList.add("running");
    this.timer = setTimeout(() => {
      root.classList.remove("running");
      root.setAttribute("aria-hidden", "true");
      document.body.classList.remove("theme-reframing");
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 260 : 1180);
  },
};
