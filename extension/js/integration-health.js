// integration-health.js — local configuration and Chrome-permission ledger.
const IntegrationHealth = {
  async statusRows() {
    const [state, secrets] = await Promise.all([
      chrome.storage.local.get(["hq_gmail_connected", "hq_spotify_client_id"]),
      CredentialVault.get(["hq_key_claude", "hq_key_elevenlabs", "hq_key_unsplash", "hq_key_pexels", "hq_spotify_refresh_token"]),
    ]);
    const downloads = await chrome.permissions.contains({ permissions: ["downloads"] });
    return [
      ["Gmail", !!state.hq_gmail_connected, state.hq_gmail_connected ? "Previously authorized · open to verify" : "OAuth setup needed"],
      ["Spotify", !!(state.hq_spotify_client_id && secrets.hq_spotify_refresh_token), secrets.hq_spotify_refresh_token ? "Session authorization active" : state.hq_spotify_client_id ? "Client ID set · connect this session" : "Client ID needed"],
      ["Claude", !!secrets.hq_key_claude, secrets.hq_key_claude ? "Session key active" : "Not configured this browser session"],
      ["ElevenLabs", !!secrets.hq_key_elevenlabs, secrets.hq_key_elevenlabs ? "Session key active" : "Not configured this browser session"],
      ["Wallpaper providers", !!(secrets.hq_key_unsplash || secrets.hq_key_pexels), secrets.hq_key_unsplash || secrets.hq_key_pexels ? "Session provider key active" : "Key-free fallback active"],
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
