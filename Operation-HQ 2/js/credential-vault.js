// credential-vault.js — ephemeral provider-secret storage.
// Secrets live in chrome.storage.session, never chrome.storage.local. They
// survive service-worker suspension but are cleared when Chrome exits. Legacy
// local keys are migrated once and immediately removed from persistent storage.

const CredentialVault = {
  SECRET_KEYS: [
    "hq_key_wallhaven", "hq_key_unsplash", "hq_key_pexels", "hq_key_claude", "hq_key_elevenlabs",
    "hq_spotify_access_token", "hq_spotify_refresh_token", "hq_spotify_token_expires_at",
  ],
  _ready: null,
  _memory: {},

  get area() {
    return chrome.storage?.session || null;
  },

  init() {
    if (!this._ready) this._ready = this.migrateLegacy();
    return this._ready;
  },

  async migrateLegacy() {
    const legacy = await chrome.storage.local.get(this.SECRET_KEYS);
    const present = Object.fromEntries(this.SECRET_KEYS
      .filter(key => typeof legacy[key] === "string" ? !!legacy[key].trim() : Number.isFinite(legacy[key]))
      .map(key => [key, typeof legacy[key] === "string" ? legacy[key].trim() : legacy[key]]));
    if (this.area) {
      const current = await this.area.get(this.SECRET_KEYS);
      const missing = Object.fromEntries(Object.entries(present).filter(([key]) => !current[key]));
      if (Object.keys(missing).length) await this.area.set(missing);
    } else {
      Object.assign(this._memory, present);
    }
    if (Object.keys(present).length) await chrome.storage.local.remove(Object.keys(present));
    return true;
  },

  async get(keys) {
    await this.init();
    const list = Array.isArray(keys) ? keys : [keys];
    const allowed = list.filter(key => this.SECRET_KEYS.includes(key));
    if (this.area) return this.area.get(allowed);
    return Object.fromEntries(allowed.map(key => [key, this._memory[key] || ""]));
  },

  async getSecret(key) {
    const values = await this.get(key);
    return values[key] || "";
  },

  async setSecret(key, value) {
    if (!this.SECRET_KEYS.includes(key)) throw new Error("Unknown credential key.");
    await this.init();
    const clean = String(value || "").trim();
    if (this.area) {
      if (clean) await this.area.set({ [key]: clean });
      else await this.area.remove(key);
    } else if (clean) this._memory[key] = clean;
    else delete this._memory[key];
    // Defensive cleanup in case an older build wrote this key again.
    await chrome.storage.local.remove(key);
  },

  async set(values) {
    await this.init();
    const safe = Object.fromEntries(Object.entries(values || {}).filter(([key, value]) => this.SECRET_KEYS.includes(key) && value != null && value !== ""));
    if (this.area) await this.area.set(safe);
    else Object.assign(this._memory, safe);
    await chrome.storage.local.remove(Object.keys(safe));
  },

  async remove(keys) {
    await this.init();
    const safe = (Array.isArray(keys) ? keys : [keys]).filter(key => this.SECRET_KEYS.includes(key));
    if (this.area) await this.area.remove(safe);
    safe.forEach(key => delete this._memory[key]);
    await chrome.storage.local.remove(safe);
  },
};
