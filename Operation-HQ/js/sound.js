// sound.js — short, pleasant completion chimes generated entirely with the
// Web Audio API. No external audio files: nothing to license, nothing to
// source, and it keeps the extension's footprint tiny. Off by default
// volume is modest; fully toggleable in Settings.

const Sound = {
  ctx: null,

  getCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    return this.ctx;
  },

  async isEnabled() {
    const { hq_sound_enabled } = await chrome.storage.local.get("hq_sound_enabled");
    return hq_sound_enabled !== false; // on by default
  },

  async getVolume() {
    const { hq_sound_volume } = await chrome.storage.local.get("hq_sound_volume");
    return hq_sound_volume ?? 0.25;
  },

  // Plays a short sequence of sine-wave notes with a soft envelope so it
  // reads as a gentle chime, not a harsh beep.
  async playNotes(freqs, { noteDuration = 0.12, gap = 0.03 } = {}) {
    if (!(await this.isEnabled())) return;
    const vol = await this.getVolume();
    if (vol <= 0) return;
    const ctx = this.getCtx();
    if (ctx.state === "suspended") await ctx.resume();

    let t = ctx.currentTime;
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + noteDuration + 0.02);
      t += noteDuration + gap;
    });
  },

  // Named chimes for different moments — small, distinct, non-annoying.
  taskComplete() { return this.playNotes([523.25, 659.25]); },              // C5, E5 — quick pop
  dailyComplete() { return this.playNotes([523.25, 659.25, 783.99]); },     // C5 E5 G5 — fuller
  allDailyDone() { return this.playNotes([523.25, 659.25, 783.99, 1046.5]); }, // C5 E5 G5 C6 — streak day win
  milestone() { return this.playNotes([392, 523.25, 659.25, 783.99, 1046.5], { noteDuration: 0.16 }); },
  pomodoroDone() { return this.playNotes([659.25, 523.25], { noteDuration: 0.2 }); },
};
