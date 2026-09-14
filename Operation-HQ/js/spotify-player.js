// spotify-player.js — the extension-page side of the bridge to
// spotify-sandbox.html. This is the piece I want to be most honest about:
// everything in this file and spotify-client.js is real, testable logic
// (message routing, token refresh, state management), but whether the
// sandboxed iframe actually succeeds in loading and running Spotify's
// live SDK end-to-end is something no amount of Node/jsdom simulation can
// verify — it depends on real network timing, real Spotify infrastructure,
// and genuinely conflicting documentation about sandboxed-page behavior
// that I could not fully resolve without a real browser. That one piece
// needs a real Chrome load to confirm, more than anything else in this
// project.

const SpotifyPlayer = {
  iframe: null,
  ready: false,
  deviceId: null,
  currentState: null,
  _listeners: { stateChange: [], ready: [], error: [] },
  _messageHandlerBound: false,

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  },

  emit(event, data) {
    (this._listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error(`SpotifyPlayer listener for "${event}" threw:`, e); }
    });
  },

  send(msg) {
    if (this.iframe && this.iframe.contentWindow) this.iframe.contentWindow.postMessage(msg, "*");
    // "*" targetOrigin: a sandboxed extension page's origin is a unique
    // opaque one Chrome generates per-load, not something this code can
    // predict/pin in advance the way a normal cross-origin postMessage
    // setup would. The real access control here is on the RECEIVING side
    // instead — spotify-sandbox.js only accepts messages where
    // event.source === window.parent, a direct window-identity check that
    // doesn't depend on origin strings at all and is what actually keeps
    // this safe from other frames.
  },

  async handleMessage(event) {
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    const msg = event.data || {};

    switch (msg.type) {
      case "ready":
        this.ready = true;
        this.deviceId = msg.deviceId;
        this.emit("ready", msg.deviceId);
        break;
      case "not_ready":
        this.ready = false;
        this.emit("ready", null);
        break;
      case "player_state_changed":
        this.currentState = msg.state;
        this.emit("stateChange", msg.state);
        break;
      case "error":
        this.emit("error", { errorType: msg.errorType, message: msg.message });
        break;
      case "token_request": {
        const token = await SpotifyClient.getValidAccessToken();
        this.send({ type: "token_response", requestId: msg.requestId, token });
        break;
      }
      case "current_state":
        this.currentState = msg.state;
        break;
      default:
        break;
    }
  },

  // Creates the sandboxed iframe (once) and waits for it to finish loading
  // before the caller sends anything — sending "init" before the sandbox
  // script has attached its message listener would silently lose the
  // message, so this ordering is load-bearing, not decorative.
  ensureIframe() {
    if (this.iframe) return Promise.resolve(this.iframe);
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      iframe.src = chrome.runtime.getURL("spotify-sandbox.html");
      iframe.style.display = "none";
      iframe.onload = () => resolve(iframe);
      document.body.appendChild(iframe);
      this.iframe = iframe;

      if (!this._messageHandlerBound) {
        window.addEventListener("message", (e) => this.handleMessage(e));
        this._messageHandlerBound = true;
      }
    });
  },

  async connect() {
    const token = await SpotifyClient.getValidAccessToken();
    if (!token) return { ok: false, reason: "not-connected" };
    await this.ensureIframe();
    this.send({ type: "init", token });
    return { ok: true };
  },

  play(uris) { this.send({ type: "play", uris }); },
  playContext(contextUri, positionMs) { this.send({ type: "play", contextUri, positionMs }); },
  pause() { this.send({ type: "pause" }); },
  resume() { this.send({ type: "resume" }); },
  next() { this.send({ type: "next" }); },
  previous() { this.send({ type: "previous" }); },
  seek(positionMs) { this.send({ type: "seek", positionMs }); },
  setVolume(volume) { this.send({ type: "setVolume", volume }); },
};
