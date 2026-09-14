// spotify-client.js — OAuth (Authorization Code + PKCE, the correct modern
// flow for a public client like a browser extension — no client secret
// ever exists, so there's nothing to leak even though this all runs in
// visible extension code) plus thin wrappers over the real Spotify Web
// API for search/browse. Playback itself is NOT handled here — the Web
// Playback SDK is a remote script Spotify requires loading via
// <script src="https://sdk.scdn.co/spotify-player.js">, which Manifest
// V3 flatly forbids inside a normal extension page's CSP. That lives in
// the sandboxed page (spotify-sandbox.html) instead — see spotify-player.js
// for the bridge between here and there.

const SpotifyClient = {
  AUTH_URL: "https://accounts.spotify.com/authorize",
  TOKEN_URL: "https://accounts.spotify.com/api/token",
  API_BASE: "https://api.spotify.com/v1",
  FETCH_TIMEOUT_MS: 15000,
  SCOPES: [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state",
    "playlist-read-private",
    "playlist-read-collaborative",
    "user-library-read",
  ].join(" "),

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  },

  async getClientId() {
    const { hq_spotify_client_id } = await chrome.storage.local.get("hq_spotify_client_id");
    return (hq_spotify_client_id || "").trim();
  },

  async hasClientId() {
    return !!(await this.getClientId());
  },

  async isConnected() {
    const { hq_spotify_refresh_token } = await chrome.storage.local.get("hq_spotify_refresh_token");
    return !!hq_spotify_refresh_token;
  },

  // --- PKCE helpers ---
  randomString(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, b => chars[b % chars.length]).join("");
  },

  base64UrlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },

  async codeChallengeFor(verifier) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return this.base64UrlEncode(digest);
  },

  // launchWebAuthFlow's redirect URI is deterministic per-extension —
  // https://<extension-id>.chromiumapp.org/ — Chrome handles capturing the
  // final redirect itself; nothing needs registering beyond adding this
  // exact URL in the Spotify Developer Dashboard's app settings.
  redirectUri() {
    return chrome.identity.getRedirectURL();
  },

  // Kicks off the real OAuth flow. Returns { ok, reason? }. On success,
  // tokens are already persisted to storage — callers don't need to do
  // anything further with the return value beyond checking `ok`.
  async connect() {
    const clientId = await this.getClientId();
    if (!clientId) return { ok: false, reason: "no-client-id" };

    const verifier = this.randomString(64);
    const challenge = await this.codeChallengeFor(verifier);
    const redirectUri = this.redirectUri();

    const authUrl = new URL(this.AUTH_URL);
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("scope", this.SCOPES);

    let redirectedTo;
    try {
      redirectedTo = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
    } catch (e) {
      return { ok: false, reason: "flow-failed", error: e.message };
    }
    if (!redirectedTo) return { ok: false, reason: "cancelled" };

    const code = new URL(redirectedTo).searchParams.get("code");
    const errorParam = new URL(redirectedTo).searchParams.get("error");
    if (errorParam) return { ok: false, reason: "denied", error: errorParam };
    if (!code) return { ok: false, reason: "no-code" };

    return this.exchangeCodeForToken(code, verifier, redirectUri, clientId);
  },

  async exchangeCodeForToken(code, verifier, redirectUri, clientId) {
    try {
      const res = await this.fetchWithTimeout(this.TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, reason: "token-exchange-failed", error: `${res.status}: ${body.slice(0, 200)}` };
      }
      const data = await res.json();
      await this.storeTokens(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "network-error", error: e.message };
    }
  },

  async storeTokens(data) {
    const expiresAt = Date.now() + (data.expires_in - 60) * 1000; // 60s safety margin before actual expiry
    const toStore = { hq_spotify_access_token: data.access_token, hq_spotify_token_expires_at: expiresAt };
    // Spotify only returns a refresh_token on the FIRST authorization —
    // subsequent refresh-token grants don't always include a new one, so
    // never overwrite an existing refresh token with an absent one.
    if (data.refresh_token) toStore.hq_spotify_refresh_token = data.refresh_token;
    await chrome.storage.local.set(toStore);
  },

  async refreshAccessToken() {
    const clientId = await this.getClientId();
    const { hq_spotify_refresh_token } = await chrome.storage.local.get("hq_spotify_refresh_token");
    if (!clientId || !hq_spotify_refresh_token) return { ok: false, reason: "not-connected" };

    try {
      const res = await this.fetchWithTimeout(this.TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: hq_spotify_refresh_token,
          client_id: clientId,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // A refresh failing with 400/401 usually means the refresh token
        // itself was revoked (password change, app de-authorized from the
        // Spotify account side, etc.) — clear local state so the UI shows
        // "reconnect" instead of silently retrying a token that will never
        // work again.
        if (res.status === 400 || res.status === 401) await this.disconnect();
        return { ok: false, reason: "refresh-failed", error: `${res.status}: ${body.slice(0, 200)}` };
      }
      const data = await res.json();
      await this.storeTokens(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "network-error", error: e.message };
    }
  },

  // Returns a real, currently-valid access token, transparently refreshing
  // first if the cached one has expired (or is about to). Returns null if
  // not connected or refresh fails outright — callers should treat null as
  // "show the connect/reconnect UI," not retry silently forever.
  async getValidAccessToken() {
    const { hq_spotify_access_token, hq_spotify_token_expires_at } = await chrome.storage.local.get(["hq_spotify_access_token", "hq_spotify_token_expires_at"]);
    if (hq_spotify_access_token && hq_spotify_token_expires_at && Date.now() < hq_spotify_token_expires_at) {
      return hq_spotify_access_token;
    }
    const result = await this.refreshAccessToken();
    if (!result.ok) return null;
    const { hq_spotify_access_token: fresh } = await chrome.storage.local.get("hq_spotify_access_token");
    return fresh;
  },

  async disconnect() {
    await chrome.storage.local.remove(["hq_spotify_access_token", "hq_spotify_refresh_token", "hq_spotify_token_expires_at"]);
  },

  // --- Web API (search/browse) ---
  async apiFetch(path, params = {}) {
    const token = await this.getValidAccessToken();
    if (!token) return { ok: false, reason: "not-connected" };

    const url = new URL(this.API_BASE + path);
    Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });

    try {
      const res = await this.fetchWithTimeout(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, reason: "api-error", status: res.status, error: body.slice(0, 200) };
      }
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, reason: "network-error", error: e.message };
    }
  },

  async searchTracks(query, limit = 20) {
    const result = await this.apiFetch("/search", { q: query, type: "track", limit });
    if (!result.ok) return result;
    return { ok: true, tracks: result.data.tracks?.items || [] };
  },

  async getUserPlaylists(limit = 50) {
    const result = await this.apiFetch("/me/playlists", { limit });
    if (!result.ok) return result;
    return { ok: true, playlists: result.data.items || [] };
  },

  async getPlaylistTracks(playlistId, limit = 100) {
    const result = await this.apiFetch(`/playlists/${playlistId}/tracks`, { limit, fields: "items(track(id,name,artists,album,duration_ms,uri))" });
    if (!result.ok) return result;
    return { ok: true, tracks: (result.data.items || []).map(i => i.track).filter(Boolean) };
  },

  async getCurrentUser() {
    const result = await this.apiFetch("/me");
    if (!result.ok) return result;
    return { ok: true, user: result.data };
  },
};
