// quotes.js — one original focus cue per day. The date-seeded sequence is
// stable, offline, attribution-safe, and does not depend on a third party.

const QUOTES = [
  "Choose the next clear action, then make it smaller.",
  "A calm plan beats a crowded intention.",
  "Finish the useful version before polishing the imaginary one.",
  "Protect the hour that moves the work forward.",
  "Clarity grows when the first step becomes visible.",
  "A short focused session can change the shape of a day.",
  "Make the important task easier to start than to avoid.",
  "Progress is evidence, not a feeling.",
  "Reduce the surface area; increase the attention.",
  "The next decision matters more than the last distraction.",
  "Good systems return you to the work without drama.",
  "Leave enough space to notice what matters.",
  "Build momentum with a result you can point to.",
  "A realistic plan respects your future time.",
  "Do one demanding thing before collecting more options.",
  "Close loops before opening new ones.",
  "Quality starts with knowing what done means.",
  "Attention improves when everything does not compete at once.",
  "Make today's work easy to resume tomorrow.",
  "The strongest routine survives an imperfect day.",
  "Measure the outcome, then improve the method.",
  "Start where the uncertainty is highest.",
  "A useful constraint can turn hesitation into direction.",
  "Keep the promise small enough to keep consistently.",
  "The dashboard is ready; choose what deserves the next hour.",
  "Leave the system clearer than you found it.",
  "One completed priority is worth many rearranged possibilities.",
  "Rest is part of a sustainable operating system.",
  "Create a visible win, then decide what follows.",
  "The simplest reliable process is often the strongest one.",
  "Review the result without turning the review into a delay.",
];

const Quotes = {
  todayIndex() {
    const start = new Date(2026, 0, 1);
    const today = new Date();
    const days = Math.floor((today - start) / 86400000);
    return ((days % QUOTES.length) + QUOTES.length) % QUOTES.length;
  },

  today() {
    return QUOTES[this.todayIndex()];
  },

  render() {
    const el = document.getElementById("daily-quote");
    if (!el) return;
    const cue = this.today();
    const figure = document.createElement("figure");
    figure.className = "quote-figure";
    const text = document.createElement("blockquote");
    text.className = "quote-text";
    text.textContent = `“${cue}”`;
    const author = document.createElement("figcaption");
    author.className = "quote-author";
    author.textContent = "— Operation HQ";
    figure.append(text, author);
    el.replaceChildren(figure);
  },
};
