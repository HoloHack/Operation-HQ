// mods.js — Opera GX-style preset bundles: one click swaps accent color +
// wallpaper category together as a named "mod," instead of tuning each
// setting separately. Modeled on real GX Mods architecture (research-backed:
// GX Mods bundle wallpaper/theme + UI color + sound into one named preset)
// — sound cues already exist app-wide via sound.js, so a mod here is
// wallpaper + accent; the "sound pack" per-mod idea is a natural next step
// once there's a reason for mods to sound different from each other.

const MODS = [
  { id: "anime", name: "Anime Fan", icon: "sparkles", accent: "#7c5cff", wallpaper: "anime" },
  { id: "gearhead", name: "Gearhead", icon: "car", accent: "#ff6b6b", wallpaper: "cars" },
  { id: "cyberdeck", name: "Cyberdeck", icon: "satellite-dish", accent: "#ffb648", wallpaper: "space" },
  { id: "wanderer", name: "Wanderer", icon: "mountain", accent: "#4da6ff", wallpaper: "scenic" },
  { id: "zen", name: "Zen Minimal", icon: "moon", accent: "#00d4a0", wallpaper: "minimal" },
];

const Mods = {
  async apply(modId) {
    const mod = MODS.find(m => m.id === modId);
    if (!mod) return;

    ModeTransitions?.play?.("theme", mod.name, "Recalibrating atmosphere and interface colour");
    setAccent(mod.accent);
    await chrome.storage.local.set({
      hq_accent: mod.accent,
      hq_wallpaper_category: mod.wallpaper,
      hq_wallpaper_cached: null, // force a fresh pull in the new category
      hq_active_mod: modId,
    });
    await Wallpaper.apply(true, false);

    // keep the settings-drawer controls in sync so they don't look stale
    const catSelect = document.getElementById("wallpaper-category");
    if (catSelect) catSelect.value = mod.wallpaper;

    this.render();
  },

  async render() {
    const grid = document.getElementById("mods-grid");
    if (!grid) return;
    const { hq_active_mod } = await chrome.storage.local.get("hq_active_mod");

    grid.innerHTML = MODS.map(m => `
      <button class="mod-card ${hq_active_mod === m.id ? "active" : ""}" data-id="${m.id}" style="--mod-color:${m.accent}">
        <div class="mod-icon">${Icons.span(m.icon)}</div>
        <div class="mod-name">${m.name}</div>
        <div class="mod-swatch"></div>
      </button>
    `).join("");

    grid.querySelectorAll(".mod-card").forEach(card => {
      card.onclick = () => this.apply(card.dataset.id);
    });
  },

  init() {
    this.render();
  },
};
