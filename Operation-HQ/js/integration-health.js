// integration-health.js — local configuration and Chrome-permission ledger.
const IntegrationHealth = {
  async statusRows() {
    const state = await chrome.storage.local.get([
      "hq_gmail_connected", "hq_spotify_client_id", "hq_spotify_refresh_token",
      "hq_key_claude", "hq_key_elevenlabs", "hq_key_unsplash", "hq_key_pexels"
    ]);
    const downloads = await chrome.permissions.contains({ permissions: ["downloads"] });
    return [
      ["Gmail", !!state.hq_gmail_connected, state.hq_gmail_connected ? "Previously authorized · open to verify" : "OAuth setup needed"],
      ["Spotify", !!(state.hq_spotify_client_id && state.hq_spotify_refresh_token), state.hq_spotify_refresh_token ? "Saved authorization · open to verify" : state.hq_spotify_client_id ? "Client ID set" : "Client ID needed"],
      ["Claude", !!state.hq_key_claude, state.hq_key_claude ? "Key stored locally" : "Not configured"],
      ["ElevenLabs", !!state.hq_key_elevenlabs, state.hq_key_elevenlabs ? "Key stored locally" : "Not configured"],
      ["Wallpaper providers", !!(state.hq_key_unsplash || state.hq_key_pexels), state.hq_key_unsplash || state.hq_key_pexels ? "Optional provider key set" : "Key-free fallback active"],
      ["Assessment Intake", downloads, downloads ? "Download metadata detection granted · file reading remains separate" : "Optional download detection not connected"],
      ["Local AI", LocalAI.isSupported(), LocalAI.isSupported() ? "WebGPU available" : "WebGPU unavailable"],
    ];
  },

  async render() {
    const list = document.getElementById("integration-health-list");
    if (!list) return;
    const rows = await this.statusRows();
    list.innerHTML = rows.map(([name, ready, detail]) => `<div class="integration-health-item">
      <span class="integration-health-dot ${ready ? "ready" : "setup"}" aria-hidden="true"></span>
      <strong>${escapeHtml(name)}</strong><small>${escapeHtml(detail)}</small>
    </div>`).join("");
    try {
      const permissions = await chrome.permissions.getAll();
      const api = (permissions.permissions || []).sort().join(", ") || "None";
      const origins = (permissions.origins || []).sort().join("\n") || "No optional origins granted";
      document.getElementById("permission-ledger-content").textContent = `Chrome APIs: ${api}\n\nGranted sites:\n${origins}`;
    } catch (error) {
      document.getElementById("permission-ledger-content").textContent = `Permission status unavailable: ${error.message}`;
    }
  },
};
