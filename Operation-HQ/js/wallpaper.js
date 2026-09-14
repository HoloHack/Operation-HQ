// wallpaper.js v6 — resilient, quality-curated discovery (toplist first,
// progressively broader relevance recovery only when the selected scene has
// no usable result), named anime scene channels, adaptive colour, and a
// flexible number+unit(+Forever) refresh interval. Community-voted results
// confirms Wallhaven's `random` pool includes every low-effort upload,
// are preferred to Wallhaven's unrestricted random pool.

// Wallhaven's SFW tier excludes explicit work but can still include imagery
// that is a poor fit for a calm shared-screen dashboard. These negative
// terms keep the anime channels action/scene-led while still allowing the
// named characters the user deliberately selected.
const CONTENT_EXCLUSIONS = "-ecchi -bikini -swimsuit -lingerie -cleavage";
const CHARACTER_EXCLUSIONS = `-girl -woman -female ${CONTENT_EXCLUSIONS}`;
const ANIME_SCENE_SOURCE = {
  curated: { q: `anime action cinematic wallpaper ${CONTENT_EXCLUSIONS}` },
  sukuna: { q: `Ryomen Sukuna Jujutsu Kaisen ${CONTENT_EXCLUSIONS}` },
  gojo: { q: `Satoru Gojo Jujutsu Kaisen ${CONTENT_EXCLUSIONS}` },
  "yuji-black-flash": { q: `Yuji Itadori black flash Jujutsu Kaisen ${CONTENT_EXCLUSIONS}` },
  "luffy-gear-5": { q: `Monkey D Luffy Gear 5 One Piece ${CONTENT_EXCLUSIONS}` },
  "luffy-gear-4": { q: `Monkey D Luffy Gear 4 One Piece ${CONTENT_EXCLUSIONS}` },
  "luffy-gear-2": { q: `Monkey D Luffy Gear 2 One Piece ${CONTENT_EXCLUSIONS}` },
  "observation-haki": { q: `One Piece observation haki Luffy ${CONTENT_EXCLUSIONS}` },
  "demon-slayer": { q: `Demon Slayer Kimetsu no Yaiba cinematic ${CONTENT_EXCLUSIONS}` },
  "cherry-blossom": { q: `anime cherry blossom scenery ${CONTENT_EXCLUSIONS}` },
};
const WALLPAPER_SCENE_SOURCE = {
  gaming: {
    curated: { label: "Cyber worlds", q: `cyberpunk gaming environment cinematic neon ${CHARACTER_EXCLUSIONS}` },
    "neon-city": { label: "Neon megacity", q: `cyberpunk neon megacity rainy night cinematic ${CHARACTER_EXCLUSIONS}` },
    "sci-fi-station": { label: "Sci-fi station", q: `science fiction space station interior cinematic ${CHARACTER_EXCLUSIONS}` },
    "fantasy-world": { label: "Epic fantasy world", q: `epic fantasy world environment cinematic ${CHARACTER_EXCLUSIONS}` },
  },
  cars: {
    curated: { label: "Night performance", q: `modified performance car night cinematic ${CHARACTER_EXCLUSIONS}` },
    "skyline-night": { label: "Nissan Skyline GTR · night", q: `Nissan Skyline GTR R34 modified night rain city ${CHARACTER_EXCLUSIONS}` },
    "jdm-tunnel": { label: "JDM tunnel run", q: `JDM car tunnel night cinematic ${CHARACTER_EXCLUSIONS}` },
    "supercar-rain": { label: "Supercar · rain", q: `supercar rain night cinematic photography ${CHARACTER_EXCLUSIONS}` },
    "porsche-mountain": { label: "Porsche mountain road", q: `Porsche mountain road dusk cinematic ${CHARACTER_EXCLUSIONS}` },
  },
  space: {
    curated: { label: "Deep-space cinema", q: `deep space cinematic galaxy ultra detailed ${CHARACTER_EXCLUSIONS}` },
    "black-hole": { label: "Black hole", q: `black hole accretion disk cinematic space ${CHARACTER_EXCLUSIONS}` },
    nebula: { label: "Nebula", q: `colourful nebula deep space astrophotography ${CHARACTER_EXCLUSIONS}` },
    "earth-orbit": { label: "Earth orbit", q: `earth from orbit space cinematic ${CHARACTER_EXCLUSIONS}` },
    "lunar-base": { label: "Lunar future", q: `futuristic lunar base moon cinematic ${CHARACTER_EXCLUSIONS}` },
  },
  scenic: {
    curated: { label: "Epic landscapes", q: `epic landscape professional photography cinematic ${CHARACTER_EXCLUSIONS}` },
    alpine: { label: "Alpine dawn", q: `alpine mountain lake dawn landscape photography ${CHARACTER_EXCLUSIONS}` },
    "forest-fog": { label: "Forest fog", q: `ancient forest fog cinematic landscape ${CHARACTER_EXCLUSIONS}` },
    "coastal-night": { label: "Coastal night", q: `dramatic coast night stars landscape photography ${CHARACTER_EXCLUSIONS}` },
    "city-night": { label: "City at night", q: `modern city skyline night cinematic photography ${CHARACTER_EXCLUSIONS}` },
    "cherry-blossom": { label: "Cherry blossom", q: `cherry blossom landscape japan cinematic ${CHARACTER_EXCLUSIONS}` },
  },
  minimal: {
    curated: { label: "Editorial minimal", q: `minimal editorial architecture aesthetic ${CHARACTER_EXCLUSIONS}` },
    brutalist: { label: "Brutalist architecture", q: `brutalist architecture minimal shadows photography ${CHARACTER_EXCLUSIONS}` },
    monochrome: { label: "Monochrome", q: `monochrome minimal architecture fine art ${CHARACTER_EXCLUSIONS}` },
    "abstract-light": { label: "Abstract light", q: `abstract light gradient minimal dark ${CHARACTER_EXCLUSIONS}` },
    "zen-interior": { label: "Zen interior", q: `japanese zen interior minimal architecture ${CHARACTER_EXCLUSIONS}` },
  },
};
const CATEGORY_SOURCE = {
  anime:   { source: "wallhaven", q: ANIME_SCENE_SOURCE.curated.q, categories: "010", purity: "100", topRange: "1y" },
  gaming:  { source: "wallhaven", q: WALLPAPER_SCENE_SOURCE.gaming.curated.q, categories: "100", purity: "100", topRange: "1y" },
  space:   { source: "wallhaven", q: WALLPAPER_SCENE_SOURCE.space.curated.q, categories: "100", purity: "100", topRange: "1y" },
  cars:    { source: "wallhaven", q: WALLPAPER_SCENE_SOURCE.cars.curated.q, categories: "100", purity: "100", topRange: "1y" },
  scenic:  { source: "wallhaven", q: WALLPAPER_SCENE_SOURCE.scenic.curated.q, categories: "100", purity: "100", topRange: "1y" },
  minimal: { source: "wallhaven", q: WALLPAPER_SCENE_SOURCE.minimal.curated.q, categories: "100", purity: "100", topRange: "1y" },
};

// A deliberately small rescue vocabulary. Exact cinematic searches remain
// the first choice, but community tagging is inconsistent and can return an
// empty 4K pool for long, natural-language queries. These broader queries are
// only tried after the selected and curated channels, and retain the same SFW
// exclusions and decoded-image quality gate.
const CATEGORY_RESCUE_QUERY = {
  anime: `anime wallpaper ${CONTENT_EXCLUSIONS}`,
  gaming: `cyberpunk environment ${CHARACTER_EXCLUSIONS}`,
  cars: `performance car night ${CHARACTER_EXCLUSIONS}`,
  space: `space galaxy ${CHARACTER_EXCLUSIONS}`,
  scenic: `landscape nature ${CHARACTER_EXCLUSIONS}`,
  minimal: `minimal architecture ${CHARACTER_EXCLUSIONS}`,
};

const HISTORY_LIMIT = 20;
const BLOCKLIST_LIMIT = 500;
const FETCH_TIMEOUT_MS = 12000;
const TOP_RANGE = "1M"; // top-voted wallpapers of the last month — quality/freshness balance
const MIN_4K_WIDTH = 3840;
const MIN_4K_HEIGHT = 2160;

const GRADIENT_FALLBACKS = [
  "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  "linear-gradient(135deg, #2d1b4e 0%, #1a1a2e 50%, #16213e 100%)",
  "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
  "linear-gradient(135deg, #232526 0%, #414345 100%)",
];

const UNIT_MINUTES = { hours: 60, days: 1440, weeks: 10080, months: 43200 };

const Wallpaper = {
  _renderRequestId: 0,

  setStatus(message, state = "neutral") {
    const el = document.getElementById("wallpaper-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.state = state;
  },

  candidateMeta(candidate) {
    if (!candidate) return null;
    if (typeof candidate === "string") return { key: `custom:${candidate}`, url: candidate, thumb: candidate };
    if (candidate.path) return { key: `wallhaven:${candidate.id || candidate.path}`, url: candidate.path, thumb: candidate.thumbs?.small || candidate.path, color: candidate.colors?.[0] || null };
    if (candidate.urls) {
      const raw = candidate.urls.raw || candidate.urls.full || candidate.urls.regular;
      const parsed = new URL(raw);
      parsed.searchParams.set("auto", "format");
      parsed.searchParams.set("fit", "crop");
      parsed.searchParams.set("w", String(MIN_4K_WIDTH));
      parsed.searchParams.set("h", String(MIN_4K_HEIGHT));
      parsed.searchParams.set("q", "92");
      return { key: `unsplash:${candidate.id || raw}`, url: parsed.toString(), thumb: candidate.urls.thumb, color: candidate.color || null };
    }
    if (candidate.src) return { key: `pexels:${candidate.id || candidate.src.original}`, url: candidate.src.original || candidate.src.large2x, thumb: candidate.src.small, color: candidate.avg_color || null };
    return null;
  },

  is4KDimensions(width, height) {
    const w = Number(width || 0);
    const h = Number(height || 0);
    return (w >= MIN_4K_WIDTH && h >= MIN_4K_HEIGHT) || (w >= 5120 && h >= 1440);
  },

  qualityFilter(pool) {
    const qualifying = (pool || []).filter(item => {
      if (typeof item === "string") return true;
      return this.is4KDimensions(item.dimension_x || item.width, item.dimension_y || item.height);
    });
    return qualifying;
  },

  async getBlocklist() {
    const { hq_wallpaper_blocklist } = await chrome.storage.local.get("hq_wallpaper_blocklist");
    return Array.isArray(hq_wallpaper_blocklist) ? hq_wallpaper_blocklist : [];
  },

  async filterBlocked(pool) {
    const blocked = new Set(await this.getBlocklist());
    return this.qualityFilter(pool).filter(candidate => {
      const meta = this.candidateMeta(candidate);
      return meta && !blocked.has(meta.key);
    });
  },

  async getKeys() {
    const s = await chrome.storage.local.get(["hq_key_wallhaven", "hq_key_unsplash", "hq_key_pexels"]);
    return { wallhaven: s.hq_key_wallhaven || "", unsplash: s.hq_key_unsplash || "", pexels: s.hq_key_pexels || "" };
  },

  async getHistory() {
    const { hq_wallpaper_history } = await chrome.storage.local.get("hq_wallpaper_history");
    return hq_wallpaper_history || [];
  },

  async pushHistory(id) {
    const hist = await this.getHistory();
    hist.push(id);
    while (hist.length > HISTORY_LIMIT) hist.shift();
    await chrome.storage.local.set({ hq_wallpaper_history: hist });
  },

  async fetchWithTimeout(url, opts = {}) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort("wallpaper-timeout");
    }, FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...opts, signal: controller.signal });
    } catch (error) {
      const wrapped = new Error(timedOut || error?.name === "AbortError"
        ? "Wallpaper provider timed out"
        : "Wallpaper provider could not be reached");
      wrapped.code = timedOut || error?.name === "AbortError" ? "timeout" : "network";
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  },

  // Returns a pool of Wallhaven results (not just one) so both the main
  // wallpaper pick AND the companion widget thumbnails can be drawn from
  // the same curated, high-quality batch.
  async fetchWallhavenPool(cfg, keys) {
    const params = new URLSearchParams({
      q: String(cfg.q || "").trim(),
      categories: cfg.categories || "100",
      purity: cfg.purity || "100",
      sorting: cfg.sorting || "toplist",
      order: "desc",
      // 3840x1440 allows genuine 4K ultrawides into the API pool. The local
      // qualityFilter and decoded-image check still reject anything below
      // 3840x2160 unless it is at least 5120x1440.
      atleast: "3840x1440",
      ratios: "16x9,16x10,21x9,32x9",
    });
    if ((cfg.sorting || "toplist") === "toplist") params.set("topRange", cfg.topRange || TOP_RANGE);
    if (keys.wallhaven) params.set("apikey", keys.wallhaven);
    const res = await this.fetchWithTimeout(`https://wallhaven.cc/api/v1/search?${params}`);
    if (!res.ok) {
      const error = new Error(`Wallpaper provider returned HTTP ${res.status}`);
      if ([401, 403].includes(res.status)) error.code = "auth";
      else if (res.status === 429) error.code = "rate-limit";
      else if (res.status >= 500) error.code = "provider";
      throw error;
    }
    const data = await res.json();
    return this.filterBlocked(data.data || []);
  },

  async fetchWallhaven(cfg, keys) {
    const pool = await this.fetchWallhavenPool(cfg, keys);
    const hist = await this.getHistory();
    const fresh = pool.filter(p => !hist.includes(p.id));
    const list = fresh.length ? fresh : pool;
    const pick = list[Math.floor(Math.random() * (list.length || 1))];
    if (!pick) return null;
    await this.pushHistory(pick.id);
    return { ...this.candidateMeta(pick), pool };
  },

  async fetchWallhavenResilient(configs, keys) {
    const seen = new Set();
    const attempts = configs.filter(config => {
      const signature = `${config.categories || "100"}|${config.sorting || "toplist"}|${config.topRange || TOP_RANGE}|${String(config.q || "").trim().toLowerCase()}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
    let connectionError = null;
    for (let index = 0; index < attempts.length; index++) {
      try {
        const result = await this.fetchWallhaven(attempts[index], keys);
        if (result) return { ...result, searchTier: index + 1, searchAttempts: attempts.length };
      } catch (error) {
        connectionError = error;
        // A timeout or offline network will affect every broader query too.
        // Stop immediately so one failed provider cannot hold the new tab for
        // several sequential timeout windows.
        if (["timeout", "network", "auth", "rate-limit", "provider"].includes(error?.code)) break;
      }
    }
    if (connectionError) throw connectionError;
    return null;
  },

  async fetchUnsplash(cfg, keys) {
    if (!keys.unsplash) {
      return this.fetchWallhaven({ q: cfg.wallhavenQ || cfg.q, categories: "100", purity: "100" }, keys);
    }
    const url = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(cfg.q)}&orientation=landscape&content_filter=high&count=6`;
    const res = await this.fetchWithTimeout(url, { headers: { Authorization: `Client-ID ${keys.unsplash}` } });
    if (!res.ok) throw new Error(`Unsplash ${res.status}`);
    const data = await res.json();
    const pool = await this.filterBlocked(Array.isArray(data) ? data : [data]);
    const hist = await this.getHistory();
    const fresh = pool.filter(p => !hist.includes(p.id));
    const list = fresh.length ? fresh : pool;
    const pick = list[Math.floor(Math.random() * (list.length || 1))];
    if (!pick) return null;
    await this.pushHistory(pick.id);
    return { ...this.candidateMeta(pick), pool };
  },

  async fetchPexels(cfg, keys) {
    if (!keys.pexels) {
      return this.fetchWallhaven({ q: cfg.wallhavenQ || cfg.q, categories: "100", purity: "100" }, keys);
    }
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(cfg.q)}&orientation=landscape&per_page=20`;
    const res = await this.fetchWithTimeout(url, { headers: { Authorization: keys.pexels } });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const data = await res.json();
    const hist = await this.getHistory();
    const pool = await this.filterBlocked(data.photos || []);
    const fresh = pool.filter(p => !hist.includes(String(p.id)));
    const list = fresh.length ? fresh : pool;
    const pick = list[Math.floor(Math.random() * (list.length || 1))];
    if (!pick) return null;
    await this.pushHistory(String(pick.id));
    return { ...this.candidateMeta(pick), pool };
  },

  // Returns { url, thumb, pool } — pool is used to populate the widget thumbnails.
  async fetchRandom(category) {
    if (category === "custom") {
      const { hq_custom_wallpapers } = await chrome.storage.local.get("hq_custom_wallpapers");
      const list = await this.filterBlocked(hq_custom_wallpapers || []);
      if (!list.length) return null;
      const url = list[Math.floor(Math.random() * list.length)];
      return { ...this.candidateMeta(url), pool: [] };
    }
    let cfg = CATEGORY_SOURCE[category] || CATEGORY_SOURCE.gaming;
    const keys = await this.getKeys();
    if (category === "anime") {
      const { hq_anime_scene = "curated" } = await chrome.storage.local.get("hq_anime_scene");
      const selected = ANIME_SCENE_SOURCE[hq_anime_scene] || ANIME_SCENE_SOURCE.curated;
      cfg = { ...CATEGORY_SOURCE.anime, q: selected.q };
      return this.fetchWallhavenResilient([
        cfg,
        CATEGORY_SOURCE.anime,
        { ...CATEGORY_SOURCE.anime, q: `anime scenery cinematic ${CONTENT_EXCLUSIONS}`, topRange: "1y" },
        { ...CATEGORY_SOURCE.anime, q: CATEGORY_RESCUE_QUERY.anime, sorting: "relevance" },
      ], keys);
    }
    const channels = WALLPAPER_SCENE_SOURCE[category];
    if (channels) {
      const { hq_wallpaper_scene_v1 = {} } = await chrome.storage.local.get("hq_wallpaper_scene_v1");
      const sceneId = hq_wallpaper_scene_v1[category] || "curated";
      const selected = channels[sceneId] || channels.curated;
      const selectedConfig = { ...cfg, source: "wallhaven", q: selected.q, categories: "100", purity: "100", topRange: "1y" };
      return this.fetchWallhavenResilient([
        selectedConfig,
        { ...selectedConfig, q: channels.curated.q },
        { ...selectedConfig, q: CATEGORY_RESCUE_QUERY[category], topRange: "1y" },
        { ...selectedConfig, q: CATEGORY_RESCUE_QUERY[category], sorting: "relevance" },
      ], keys);
    }
    if (cfg.source === "wallhaven") return this.fetchWallhavenResilient([cfg], keys);
    if (cfg.source === "unsplash") return this.fetchUnsplash(cfg, keys);
    if (cfg.source === "pexels") return this.fetchPexels(cfg, keys);
    return null;
  },

  async cacheOffline(category, url) {
    try {
      const res = await this.fetchWithTimeout(url);
      if (!res.ok) return;
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      await this.adaptPaletteFromBitmap(bitmap, category);
      const maxW = 3840;
      const scale = Math.min(1, maxW / bitmap.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
      await chrome.storage.local.set({ [`hq_wallpaper_offline_${category}`]: dataUrl });
    } catch (e) {
      console.warn("Offline wallpaper cache skipped:", e.message);
    }
  },

  gradientFor() {
    const day = new Date().getDate();
    return GRADIENT_FALLBACKS[day % GRADIENT_FALLBACKS.length];
  },

  rgbToHex(r, g, b) {
    return `#${[r, g, b].map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
  },

  async adaptPaletteFromBitmap(bitmap, category) {
    const { hq_wallpaper_adaptive_colour } = await chrome.storage.local.get("hq_wallpaper_adaptive_colour");
    if (hq_wallpaper_adaptive_colour === false) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let totalR = 0, totalG = 0, totalB = 0, count = 0, luminance = 0;
    const vivid = [];
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      totalR += r; totalG += g; totalB += b; luminance += lum; count++;
      if (max - min > 38 && lum > .18 && lum < .82) vivid.push({ r, g, b, score: (max - min) * (1 - Math.abs(.5 - lum)) });
    }
    vivid.sort((a, b) => b.score - a.score);
    const picks = vivid.slice(0, Math.max(8, Math.floor(vivid.length * .08)));
    const base = picks.length ? picks.reduce((sum, p) => ({ r: sum.r + p.r, g: sum.g + p.g, b: sum.b + p.b }), { r: 0, g: 0, b: 0 }) : { r: totalR, g: totalG, b: totalB };
    const divisor = picks.length || count || 1;
    let r = base.r / divisor, g = base.g / divisor, b = base.b / divisor;
    const peak = Math.max(r, g, b);
    if (peak < 150) { const lift = 150 / Math.max(1, peak); r *= lift; g *= lift; b *= lift; }
    const accent = this.rgbToHex(r, g, b);
    const avgLuma = luminance / Math.max(1, count);
    const top = Math.min(.5, Math.max(.22, .22 + avgLuma * .23));
    const bottom = Math.min(.78, Math.max(.58, .57 + avgLuma * .25));
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-rgb", `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`);
    document.documentElement.style.setProperty("--scrim-top", top.toFixed(2));
    document.documentElement.style.setProperty("--scrim-bottom", bottom.toFixed(2));
    document.body.dataset.wallpaperTone = avgLuma > .58 ? "light" : "dark";
    await chrome.storage.local.set({ [`hq_wallpaper_palette_${category}`]: { accent, r: Math.round(r), g: Math.round(g), b: Math.round(b), top, bottom, tone: document.body.dataset.wallpaperTone } });
  },

  async applyStoredPalette(category) {
    const saved = await chrome.storage.local.get(["hq_wallpaper_adaptive_colour", `hq_wallpaper_palette_${category}`]);
    if (saved.hq_wallpaper_adaptive_colour === false) return;
    const palette = saved[`hq_wallpaper_palette_${category}`];
    if (!palette) return;
    document.documentElement.style.setProperty("--accent", palette.accent);
    document.documentElement.style.setProperty("--accent-rgb", `${palette.r}, ${palette.g}, ${palette.b}`);
    document.documentElement.style.setProperty("--scrim-top", Number(palette.top).toFixed(2));
    document.documentElement.style.setProperty("--scrim-bottom", Number(palette.bottom).toFixed(2));
    document.body.dataset.wallpaperTone = palette.tone || "dark";
  },

  async setBackground(cssUrlOrGradient, isGradient = false) {
    const layer = document.getElementById("wallpaper-layer");
    const image = document.getElementById("wallpaper-image");
    if (!layer || !image) return false;

    const requestId = ++this._renderRequestId;
    if (isGradient) {
      image.classList.remove("ready");
      image.removeAttribute("src");
      layer.style.backgroundImage = cssUrlOrGradient;
      layer.classList.remove("loading");
      return true;
    }

    const url = String(cssUrlOrGradient || "").trim();
    if (!url) return false;
    layer.classList.add("loading");

    return new Promise((resolve) => {
      const preload = new Image();
      preload.decoding = "async";
      preload.referrerPolicy = "no-referrer";
      preload.onload = () => {
        if (requestId !== this._renderRequestId) { resolve(false); return; }
        if (!url.startsWith("data:") && !this.is4KDimensions(preload.naturalWidth, preload.naturalHeight)) {
          layer.classList.remove("loading");
          this.setStatus(`Rejected ${preload.naturalWidth}×${preload.naturalHeight}: wallpaper is below the 4K quality gate.`, "error");
          resolve(false);
          return;
        }
        image.src = url;
        image.classList.add("ready");
        layer.style.backgroundImage = "none";
        layer.classList.remove("loading");
        resolve(true);
      };
      preload.onerror = () => {
        if (requestId === this._renderRequestId) {
          layer.classList.remove("loading");
          this.setStatus("Image host failed to load. Keeping the last working background.", "error");
        }
        resolve(false);
      };
      preload.src = url;
    });
  },

  toast(msg) {
    const el = document.getElementById("toast");
    if (!el) { console.warn(msg); return; }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
  },

  async rememberCurrent(result, category) {
    const current = result?.key && result?.url
      ? { key: result.key, url: result.url, category }
      : null;
    await chrome.storage.local.set({ hq_wallpaper_current: current });
    await this.refreshSafetyControls();
  },

  async refreshSafetyControls() {
    const hideButton = document.getElementById("wallpaper-block-current");
    const countLabel = document.getElementById("wallpaper-blocked-count");
    const clearButton = document.getElementById("wallpaper-clear-blocklist");
    const { hq_wallpaper_current } = await chrome.storage.local.get("hq_wallpaper_current");
    const blocked = await this.getBlocklist();
    if (hideButton) hideButton.classList.toggle("hidden", !hq_wallpaper_current?.key);
    if (countLabel) countLabel.textContent = `${blocked.length} wallpaper${blocked.length === 1 ? "" : "s"} hidden on this device.`;
    if (clearButton) clearButton.disabled = blocked.length === 0;
  },

  async blockCurrent() {
    const { hq_wallpaper_current } = await chrome.storage.local.get("hq_wallpaper_current");
    if (!hq_wallpaper_current?.key) {
      this.toast("This cached wallpaper can't be identified yet — shuffle once, then hide it.");
      return;
    }
    const blocked = await this.getBlocklist();
    const next = [...blocked.filter(key => key !== hq_wallpaper_current.key), hq_wallpaper_current.key].slice(-BLOCKLIST_LIMIT);
    const category = hq_wallpaper_current.category || "gaming";
    await chrome.storage.local.set({ hq_wallpaper_blocklist: next, hq_wallpaper_cached: null, hq_wallpaper_current: null });
    await chrome.storage.local.remove(`hq_wallpaper_offline_${category}`);
    this.toast("Hidden. That wallpaper won't appear again on this device.");
    await this.refreshSafetyControls();
    await this.apply(true, false);
  },

  async clearBlocklist() {
    await chrome.storage.local.set({ hq_wallpaper_blocklist: [] });
    await this.refreshSafetyControls();
    this.toast("Hidden wallpapers restored.");
  },

  async apply(forceNew = false, silent = true) {
    const { hq_wallpaper_category } = await chrome.storage.local.get("hq_wallpaper_category");
    const category = hq_wallpaper_category || "gaming";
    await this.applyStoredPalette(category);
    const offlineKey = `hq_wallpaper_offline_${category}`;
    const s = await chrome.storage.local.get([offlineKey, "hq_wallpaper_cached", "hq_wallpaper_cached_category", "hq_wallpaper_current"]);
    const offlineCopy = s[offlineKey];
    const blocked = new Set(await this.getBlocklist());
    const cachedIsBlocked = s.hq_wallpaper_current?.key && blocked.has(s.hq_wallpaper_current.key);
    const sameCategoryCached = s.hq_wallpaper_cached_category === category && !cachedIsBlocked ? s.hq_wallpaper_cached : null;
    const safeOfflineCopy = cachedIsBlocked ? null : offlineCopy;

    // Always paint a known-good background immediately. Previously a forced
    // refresh skipped both cache and offline fallback, leaving a blank page
    // for the whole network request—and permanently blank when that request
    // failed. The refresh now happens on top of a visible background.
    const immediate = sameCategoryCached || safeOfflineCopy;
    const immediateRendered = immediate ? await this.setBackground(immediate) : false;
    if (!immediateRendered) await this.setBackground(this.gradientFor(), true);

    if (!forceNew && sameCategoryCached && immediateRendered) {
      this.setStatus(`Showing cached ${category} wallpaper.`, "success");
      return;
    }

    try {
      this.setStatus(`Loading a new ${category} wallpaper…`, "loading");
      const result = await this.fetchRandom(category);
      if (result?.url) {
        const rendered = await this.setBackground(result.url);
        if (!rendered) throw new Error("Wallpaper image could not be decoded");
        await chrome.storage.local.set({ hq_wallpaper_cached: result.url, hq_wallpaper_cached_category: category });
        await this.rememberCurrent(result, category);
        this.cacheOffline(category, result.url);
        const searchNote = result.searchTier > 1 ? ` · recovered on search tier ${result.searchTier}` : "";
        this.setStatus(`Showing verified 4K ${category} wallpaper${searchNote}.`, "success");
        return;
      }
      throw new Error(category === "custom" ? "No valid custom wallpaper URLs are saved" : "Wallpaper provider returned no usable images");
    } catch (e) {
      console.warn("Wallpaper refresh unavailable; retained fallback:", e.message);
      this.setStatus(`${e.message}. The last working background remains active.`, "error");
      if (!silent) {
        this.toast(e.message || "Couldn't load a new wallpaper. The last working background is still active.");
      }
    }

    if (!safeOfflineCopy && !sameCategoryCached) {
      await this.setBackground(this.gradientFor(), true);
    }
  },

  async shuffleNow() {
    await this.apply(true, false);
  },

  // --- Flexible refresh interval: number + unit (hours/days/weeks/months),
  // "tab" (every new tab), or "forever" (manual shuffle only) ---
  async getIntervalSetting() {
    const s = await chrome.storage.local.get(["hq_wallpaper_interval_value", "hq_wallpaper_interval_unit"]);
    return { value: s.hq_wallpaper_interval_value || 1, unit: s.hq_wallpaper_interval_unit || "tab" };
  },

  async setIntervalSetting(value, unit) {
    await chrome.storage.local.set({ hq_wallpaper_interval_value: value, hq_wallpaper_interval_unit: unit });
  },

  intervalToMinutes(value, unit) {
    if (unit === "tab" || unit === "forever") return null;
    return (UNIT_MINUTES[unit] || 1440) * value;
  },
};
