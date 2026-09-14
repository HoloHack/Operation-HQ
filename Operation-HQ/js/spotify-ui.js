// spotify-ui.js — the visible panel: connect flow, search, playlist
// browsing, and a now-playing bar. Deliberately not a pixel-for-pixel
// Spotify clone — a real search box, a real playlist list, real transport
// controls, styled to match this app's own dark theme.

const SpotifyUI = {
  activePlaylistId: null,

  msToTime(ms) {
    if (ms == null) return "0:00";
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, "0")}`;
  },

  trackArtists(track) {
    return (track.artists || []).map(a => a.name).join(", ");
  },

  async init() {
    const connectBtn = document.getElementById("spotify-connect-btn");
    const disconnectBtn = document.getElementById("spotify-disconnect-btn");
    const searchInput = document.getElementById("spotify-search-input");

    if (connectBtn) {
      connectBtn.onclick = async () => {
        connectBtn.disabled = true;
        connectBtn.innerHTML = Spinner.html(14) + "Connecting…";
        const hasClientId = await SpotifyClient.hasClientId();
        if (!hasClientId) {
          Wallpaper?.toast?.("Add your Spotify Client ID in Settings > Integrations first.");
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect Spotify";
          return;
        }
        const result = await SpotifyClient.connect();
        if (!result.ok) {
          Wallpaper?.toast?.(`Spotify connect failed: ${result.reason}`);
          connectBtn.disabled = false;
          connectBtn.textContent = "Connect Spotify";
          return;
        }
        await SpotifyPlayer.connect();
        await this.render();
      };
    }

    if (disconnectBtn) {
      disconnectBtn.onclick = async () => {
        await SpotifyClient.disconnect();
        await this.render();
      };
    }

    if (searchInput) {
      let debounce;
      searchInput.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => this.search(searchInput.value), 400);
      };
    }

    this.wireTransportControls();
    SpotifyPlayer.on("stateChange", (state) => this.renderNowPlaying(state));
    SpotifyPlayer.on("ready", (deviceId) => this.renderConnectionStatus(!!deviceId));
    SpotifyPlayer.on("error", (err) => {
      console.error("Spotify playback error:", err);
      Wallpaper?.toast?.(`Spotify: ${err.message || err.errorType}`);
    });

    await this.render();
  },

  wireTransportControls() {
    const map = {
      "spotify-play-pause-btn": () => this.togglePlayPause(),
      "spotify-next-btn": () => SpotifyPlayer.next(),
      "spotify-prev-btn": () => SpotifyPlayer.previous(),
    };
    Object.entries(map).forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (el) el.onclick = fn;
    });
    const volumeSlider = document.getElementById("spotify-volume-slider");
    if (volumeSlider) volumeSlider.oninput = (e) => SpotifyPlayer.setVolume(parseFloat(e.target.value));
  },

  togglePlayPause() {
    const state = SpotifyPlayer.currentState;
    if (state && !state.paused) SpotifyPlayer.pause();
    else SpotifyPlayer.resume();
  },

  async render() {
    const connected = await SpotifyClient.isConnected();
    const connectBtn = document.getElementById("spotify-connect-btn");
    const disconnectBtn = document.getElementById("spotify-disconnect-btn");
    const mainArea = document.getElementById("spotify-main-area");
    const connectPrompt = document.getElementById("spotify-connect-prompt");

    if (!connected) {
      if (connectBtn) connectBtn.classList.remove("hidden");
      if (disconnectBtn) disconnectBtn.classList.add("hidden");
      if (mainArea) mainArea.classList.add("hidden");
      if (connectPrompt) connectPrompt.classList.remove("hidden");
      return;
    }

    if (connectBtn) connectBtn.classList.add("hidden");
    if (disconnectBtn) disconnectBtn.classList.remove("hidden");
    if (mainArea) mainArea.classList.remove("hidden");
    if (connectPrompt) connectPrompt.classList.add("hidden");

    await this.loadPlaylists();
  },

  renderConnectionStatus(deviceReady) {
    const statusEl = document.getElementById("spotify-status");
    if (!statusEl) return;
    statusEl.textContent = deviceReady ? "Connected — ready to play" : "Connecting to Spotify…";
  },

  async search(query) {
    const resultsEl = document.getElementById("spotify-search-results");
    if (!resultsEl) return;
    if (!query || !query.trim()) { resultsEl.innerHTML = ""; return; }

    const result = await SpotifyClient.searchTracks(query.trim());
    if (!result.ok) {
      resultsEl.innerHTML = `<li class="empty-state">Search failed: ${escapeHtml(result.reason)}</li>`;
      return;
    }
    resultsEl.innerHTML = result.tracks.length
      ? result.tracks.map(t => this.trackRowHtml(t)).join("")
      : '<li class="empty-state">No results.</li>';
    this.wireTrackRows(resultsEl, result.tracks);
  },

  async loadPlaylists() {
    const listEl = document.getElementById("spotify-playlist-list");
    if (!listEl) return;
    const result = await SpotifyClient.getUserPlaylists();
    if (!result.ok) {
      listEl.innerHTML = `<li class="empty-state">Couldn't load playlists: ${escapeHtml(result.reason)}</li>`;
      return;
    }
    listEl.innerHTML = result.playlists.map(p => `
      <li class="capture-item spotify-playlist-row" data-id="${escapeAttribute(p.id)}">
        <div class="capture-text">${escapeHtml(p.name)}<br><span style="font-size:11px; color:var(--text-dim);">${p.tracks?.total ?? 0} tracks</span></div>
      </li>
    `).join("") || '<li class="empty-state">No playlists found.</li>';

    listEl.querySelectorAll(".spotify-playlist-row").forEach(row => {
      row.onclick = () => this.selectPlaylist(row.dataset.id);
    });
  },

  async selectPlaylist(playlistId) {
    this.activePlaylistId = playlistId;
    const tracksEl = document.getElementById("spotify-playlist-tracks");
    if (!tracksEl) return;
    tracksEl.innerHTML = '<li class="empty-state">Loading…</li>';

    const result = await SpotifyClient.getPlaylistTracks(playlistId);
    if (!result.ok) {
      tracksEl.innerHTML = `<li class="empty-state">Couldn't load tracks: ${escapeHtml(result.reason)}</li>`;
      return;
    }
    tracksEl.innerHTML = result.tracks.length
      ? result.tracks.map(t => this.trackRowHtml(t)).join("")
      : '<li class="empty-state">This playlist is empty.</li>';
    this.wireTrackRows(tracksEl, result.tracks);
  },

  trackRowHtml(track) {
    return `
      <li class="capture-item spotify-track-row" data-uri="${escapeAttribute(track.uri || "")}">
        <div class="capture-text">
          ${escapeHtml(track.name)}<br>
          <span style="font-size:11px; color:var(--text-dim);">${escapeHtml(this.trackArtists(track))} · ${this.msToTime(track.duration_ms)}</span>
        </div>
      </li>`;
  },

  wireTrackRows(container, tracks) {
    container.querySelectorAll(".spotify-track-row").forEach(row => {
      row.onclick = () => {
        const uri = row.dataset.uri;
        if (uri) SpotifyPlayer.play([uri]);
      };
    });
  },

  renderNowPlaying(state) {
    const bar = document.getElementById("spotify-now-playing");
    if (!bar) return;
    if (!state || !state.track_window || !state.track_window.current_track) {
      bar.classList.add("hidden");
      return;
    }
    bar.classList.remove("hidden");
    const track = state.track_window.current_track;
    document.getElementById("spotify-now-playing-title").textContent = track.name;
    document.getElementById("spotify-now-playing-artist").textContent = (track.artists || []).map(a => a.name).join(", ");
    const playPauseBtn = document.getElementById("spotify-play-pause-btn");
    if (playPauseBtn) Icons.apply(playPauseBtn, state.paused ? "play" : "pause");
  },
};
