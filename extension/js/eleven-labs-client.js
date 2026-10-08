// eleven-labs-client.js — thin wrapper around ElevenLabs' text-to-speech
// endpoint. The key is session-only via CredentialVault and disappears when
// Chrome exits; no provider secret is written into persistent local storage.
//
// PAID SERVICE: ElevenLabs has a free tier but is metered above it. Kept
// deliberately separate from the free Integrations settings tab — see
// Settings -> Paid Services.

const ElevenLabsClient = {
  // "Rachel" — one of ElevenLabs' own premade default voices, documented
  // in their quickstart examples. Not configurable yet; a voice picker is
  // a reasonable follow-up if this gets used a lot, not built this pass.
  VOICE_ID: "21m00Tcm4TlvDq8ikWAM",
  MODEL: "eleven_turbo_v2_5", // low-latency model, cheaper on the free tier's character quota
  MAX_CHARS: 2000, // defensive cap — the rationale this feeds is ~150 tokens/~700 chars, this just guards against accidentally sending something huge

  async getKey() {
    return CredentialVault.getSecret("hq_key_elevenlabs");
  },

  async hasKey() {
    return !!(await this.getKey());
  },

  // Returns a ready-to-play HTMLAudioElement (paused, not yet started) so
  // the caller controls playback/stop timing. Throws on missing key or a
  // non-2xx response, same convention as ClaudeClient.call().
  async synthesize(text) {
    const key = await this.getKey();
    if (!key) throw new Error("No ElevenLabs API key set — add one in Settings > Paid Services to enable this.");

    const trimmed = (text || "").slice(0, this.MAX_CHARS);
    if (!trimmed.trim()) throw new Error("Nothing to read aloud.");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.VOICE_ID}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": key,
          "Accept": "audio/mpeg",
        },
        body: JSON.stringify({
          text: trimmed,
          model_id: this.MODEL,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`ElevenLabs API ${res.status}: ${body.slice(0, 200)}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      // Release the blob URL once playback actually finishes or errors —
      // otherwise every "Read it to me" click leaks another object URL for
      // the rest of the tab's lifetime.
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      audio.addEventListener("error", () => URL.revokeObjectURL(url), { once: true });
      return audio;
    } finally {
      clearTimeout(timer);
    }
  },
};
