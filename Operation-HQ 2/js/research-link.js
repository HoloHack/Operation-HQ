// research-link.js — "Research this" quick-action, built on request.
//
// Opens Perplexity with the exact text pre-filled and ready to send. The
// URL pattern (perplexity.ai/search/?q=...) was verified this session
// against a real, current discussion of people actually using it this
// way — not assumed from memory of an API that could easily have changed.
//
// Deliberately NOT an attempt at "notice what I've been researching
// lately and proactively suggest it" — that would need real pattern
// analysis over notes/tasks, which is a genuinely bigger undertaking (the
// local-AI foundation discussed earlier, still unbuilt). This is the
// honest, buildable slice: a one-click shortcut on something you've
// already written down, not a mind-reading feature layered on top of one.
//
// Only wired into Notes/Capture, deliberately NOT Idea Vault — Idea
// Vault's entire premise is "the full text stays on this device only,"
// and a one-click send-to-a-third-party button on that specific feature
// would undermine the one promise it exists to keep.

const ResearchLink = {
  urlFor(text) {
    return `https://www.perplexity.ai/search/?q=${encodeURIComponent(text)}`;
  },

  buttonHtml(extraClass = "") {
    return `<button class="research-btn ${extraClass}" title="Research this on Perplexity">${Icons.span("search")}</button>`;
  },

  open(text) {
    if (!text || !text.trim()) return;
    window.open(this.urlFor(text), "_blank", "noopener");
  },
};
