// spotify-sandbox.js — runs inside the sandboxed spotify-sandbox.html
// page. No chrome.* API access here (that's what sandboxing means); every
// interaction with the rest of the extension goes through postMessage to
// window.parent. Message protocol (kept intentionally small):
//
//   Parent -> Sandbox: {type: "init", token}
//                       {type: "token_response", requestId, token}
//                       {type: "play", uris?, contextUri?, positionMs?}
//                       {type: "pause"} {type: "resume"} {type: "next"}
//                       {type: "previous"} {type: "seek", positionMs}
//                       {type: "setVolume", volume}
//                       {type: "getCurrentState"}
//
//   Sandbox -> Parent:  {type: "ready", deviceId}
//                       {type: "not_ready", deviceId}
//                       {type: "player_state_changed", state}
//                       {type: "error", errorType, message}
//                       {type: "token_request", requestId}
//                       {type: "current_state", state}

let player = null;
let deviceId = null;
let pendingTokenRequests = new Map(); // requestId -> resolve function
let nextRequestId = 1;
let latestToken = null;

function send(msg) {
  window.parent.postMessage(msg, "*"); // see note in spotify-player.js on why "*" is acceptable here
}

function requestFreshToken() {
  return new Promise((resolve) => {
    const requestId = nextRequestId++;
    pendingTokenRequests.set(requestId, resolve);
    send({ type: "token_request", requestId });
  });
}

window.addEventListener("message", async (event) => {
  if (event.source !== window.parent) return; // only the extension page that embedded this iframe, never anything else
  const msg = event.data || {};

  switch (msg.type) {
    case "init": {
      latestToken = msg.token;
      initPlayer();
      break;
    }
    case "token_response": {
      const resolve = pendingTokenRequests.get(msg.requestId);
      if (resolve) { resolve(msg.token); pendingTokenRequests.delete(msg.requestId); }
      latestToken = msg.token;
      break;
    }
    case "play": {
      if (!player || !deviceId) return;
      // Actually starting playback on a specific device/track goes through
      // the Web API, not an SDK method — the SDK creates the "device," the
      // Web API tells Spotify what to play on it. Doing this here (rather
      // than making the parent do a second round of Web API calls) keeps
      // all playback-control logic in one place.
      const token = latestToken || await requestFreshToken();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
          method: "PUT",
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(msg.uris ? { uris: msg.uris } : {}),
            ...(msg.contextUri ? { context_uri: msg.contextUri } : {}),
            ...(msg.positionMs != null ? { position_ms: msg.positionMs } : {}),
          }),
        });
      } catch (e) {
        send({ type: "error", errorType: "playback_error", message: e.message });
      } finally {
        clearTimeout(timer);
      }
      break;
    }
    case "pause": if (player) player.pause().catch(() => {}); break;
    case "resume": if (player) player.resume().catch(() => {}); break;
    case "next": if (player) player.nextTrack().catch(() => {}); break;
    case "previous": if (player) player.previousTrack().catch(() => {}); break;
    case "seek": if (player && msg.positionMs != null) player.seek(msg.positionMs).catch(() => {}); break;
    case "setVolume": if (player && msg.volume != null) player.setVolume(msg.volume).catch(() => {}); break;
    case "getCurrentState": {
      if (!player) return;
      const state = await player.getCurrentState();
      send({ type: "current_state", state });
      break;
    }
    default: break;
  }
});

function initPlayer() {
  if (player) return; // already initialized — "init" can arrive more than once (e.g. the parent page reloaded its iframe reference) and must be idempotent
  if (typeof Spotify === "undefined" || !Spotify.Player) {
    // The SDK script hasn't finished loading/executing yet. This is the
    // one thing about this whole integration that's genuinely hardest to
    // verify outside a real browser — the ordering here depends on real
    // network timing for a remote script this environment can't fetch.
    send({ type: "error", errorType: "initialization_error", message: "Spotify SDK not yet available" });
    return;
  }

  player = new Spotify.Player({
    name: "Operation HQ",
    getOAuthToken: (cb) => {
      if (latestToken) { cb(latestToken); return; }
      requestFreshToken().then(cb);
    },
    volume: 0.5,
  });

  player.addListener("ready", ({ device_id }) => { deviceId = device_id; send({ type: "ready", deviceId: device_id }); });
  player.addListener("not_ready", ({ device_id }) => { send({ type: "not_ready", deviceId: device_id }); });
  player.addListener("player_state_changed", (state) => { send({ type: "player_state_changed", state }); });
  player.addListener("initialization_error", ({ message }) => send({ type: "error", errorType: "initialization_error", message }));
  player.addListener("authentication_error", ({ message }) => send({ type: "error", errorType: "authentication_error", message }));
  player.addListener("account_error", ({ message }) => send({ type: "error", errorType: "account_error", message }));
  player.addListener("playback_error", ({ message }) => send({ type: "error", errorType: "playback_error", message }));

  player.connect();
}

// The SDK calls this global once it's finished loading — if "init" already
// arrived before the SDK script finished (a real possible race, since
// they load from different origins with independent timing), retry here.
window.onSpotifyWebPlaybackSDKReady = () => {
  if (latestToken) initPlayer();
};
