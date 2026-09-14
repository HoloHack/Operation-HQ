// classifier.js — shared, DOM-free bookmark classification logic.
// Used by BOTH newtab.js/bookmarks.js (bulk sort, UI) and background.js
// (real-time onCreated sort) via <script src> in the page and importScripts()
// in the service worker — plain global object, no ES modules, so it works
// in both contexts unmodified.
//
// Two-tier fixed taxonomy: Tier 1 (ROOTS) is a small fixed list the
// classifier is NEVER allowed to add to. Tier 2 (subfolders) is the only
// thing it may create, always nested inside a Tier 1 root. This is the fix
// for the "every topic becomes its own top-level folder" bug.

const ROOTS = [
  "Coding & Dev",
  "Design & Inspiration",
  "School & Academics",
  "Business & Ventures",
  "Gaming & Roblox Dev",
  "Reading & Articles",
  "Entertainment",
  "Finance & Shopping",
  "Social & Communication",
  "Utilities & Misc",
];

const NEVER_SORT_TITLES = ["inbox", "canva"];
const INBOX_FOLDER_NAME = "Inbox";

// Curated domain lookup. Content-variable platforms are deliberately
// classified from title/page metadata before this table is considered.
const DOMAIN_TABLE = {
  // Coding & Dev
  "github.com": ["Coding & Dev", "Docs & References"],
  "stackoverflow.com": ["Coding & Dev", "Docs & References"],
  "exercism.org": ["Coding & Dev", "Practice & Jobs"],
  "copilot.microsoft.com": ["Coding & Dev", "AI Tools"],
  "github.com/features/copilot": ["Coding & Dev", "AI Tools"],
  "developer.mozilla.org": ["Coding & Dev", "Docs & References"],
  "devdocs.io": ["Coding & Dev", "Docs & References"],
  "w3schools.com": ["Coding & Dev", "Docs & References"],
  "css-tricks.com": ["Coding & Dev", "Docs & References"],
  "vercel.com": ["Coding & Dev", "Hosting & Deploy"],
  "netlify.com": ["Coding & Dev", "Hosting & Deploy"],
  "supabase.com": ["Coding & Dev", "Hosting & Deploy"],
  "npmjs.com": ["Coding & Dev", "Hosting & Deploy"],
  "codepen.io": ["Coding & Dev", "Playgrounds"],
  "replit.com": ["Coding & Dev", "Playgrounds"],
  "codesandbox.io": ["Coding & Dev", "Playgrounds"],
  "jsfiddle.net": ["Coding & Dev", "Playgrounds"],
  "leetcode.com": ["Coding & Dev", "Practice & Jobs"],
  "codewars.com": ["Coding & Dev", "Practice & Jobs"],
  "hackerrank.com": ["Coding & Dev", "Practice & Jobs"],
  "hiring.cafe": ["Coding & Dev", "Practice & Jobs"],
  "levels.fyi": ["Coding & Dev", "Practice & Jobs"],
  "seek.com.au": ["Coding & Dev", "Practice & Jobs"],
  "indeed.com": ["Coding & Dev", "Practice & Jobs"],
  "openai.com": ["Coding & Dev", "AI Tools"],
  "chatgpt.com": ["Coding & Dev", "AI Tools"],
  "claude.ai": ["Coding & Dev", "AI Tools"],
  "anthropic.com": ["Coding & Dev", "AI Tools"],
  "gemini.google.com": ["Coding & Dev", "AI Tools"],
  "perplexity.ai": ["Coding & Dev", "AI Tools"],
  "grok.com": ["Coding & Dev", "AI Tools"],
  "poe.com": ["Coding & Dev", "AI Tools"],
  "huggingface.co": ["Coding & Dev", "AI Tools"],
  "midjourney.com": ["Coding & Dev", "AI Image Gen"],
  "leonardo.ai": ["Coding & Dev", "AI Image Gen"],
  "runwayml.com": ["Coding & Dev", "AI Image Gen"],
  "ideogram.ai": ["Coding & Dev", "AI Image Gen"],
  "n8n.io": ["Coding & Dev", "Automation"],
  "zapier.com": ["Coding & Dev", "Automation"],
  "make.com": ["Coding & Dev", "Automation"],

  // Design & Inspiration
  "dribbble.com": ["Design & Inspiration", "UI Inspiration"],
  "mobbin.com": ["Design & Inspiration", "UI Inspiration"],
  "lapa.ninja": ["Design & Inspiration", "UI Inspiration"],
  "land-book.com": ["Design & Inspiration", "UI Inspiration"],
  "awwwards.com": ["Design & Inspiration", "UI Inspiration"],
  "behance.net": ["Design & Inspiration", "UI Inspiration"],
  "pinterest.com": ["Design & Inspiration", "UI Inspiration"],
  "figma.com": ["Design & Inspiration", "Design Tools"],

  // School & Academics
  "thinkswap.com": ["School & Academics", null],
  "studiosity.com": ["School & Academics", null],
  "sentral.com.au": ["School & Academics", null],
  "classroom.google.com": ["School & Academics", null],
  "coursera.org": ["School & Academics", "Courses"],
  "udemy.com": ["School & Academics", "Courses"],
  "khanacademy.org": ["School & Academics", "Courses"],
  "edx.org": ["School & Academics", "Courses"],
  "brilliant.org": ["School & Academics", "Courses"],
  "quizlet.com": ["School & Academics", "Study Tools"],
  "duolingo.com": ["School & Academics", "Languages"],

  // Business & Ventures
  "stripe.com": ["Business & Ventures", null],
  "godaddy.com": ["Business & Ventures", null],
  "shopify.com": ["Business & Ventures", null],
  "squarespace.com": ["Business & Ventures", null],
  "wix.com": ["Business & Ventures", null],
  "lovable.dev": ["Business & Ventures", "Client Delivery"],

  // Gaming & Roblox Dev
  "roblox.com": ["Gaming & Roblox Dev", null],
  "create.roblox.com": ["Gaming & Roblox Dev", "Roblox Studio Docs"],
  "devforum.roblox.com": ["Gaming & Roblox Dev", "Roblox Studio Docs"],
  "chess.com": ["Gaming & Roblox Dev", "Chess"],
  "lichess.org": ["Gaming & Roblox Dev", "Chess"],

  // Entertainment
  "netflix.com": ["Entertainment", "Streaming"],
  "spotify.com": ["Entertainment", "Streaming"],
  "twitch.tv": ["Entertainment", "Streaming"],
  "crunchyroll.com": ["Entertainment", "Streaming"],
  "myanimelist.net": ["Entertainment", "Streaming"],
  "primevideo.com": ["Entertainment", "Streaming"],
  "disneyplus.com": ["Entertainment", "Streaming"],

  // Finance & Shopping
  "amazon.com": ["Finance & Shopping", "Shopping"],
  "amazon.com.au": ["Finance & Shopping", "Shopping"],
  "ebay.com": ["Finance & Shopping", "Shopping"],
  "ebay.com.au": ["Finance & Shopping", "Shopping"],
  "aliexpress.com": ["Finance & Shopping", "Shopping"],
  "temu.com": ["Finance & Shopping", "Shopping"],
  "commsec.com.au": ["Finance & Shopping", "Banking & Investing"],
  "raiz.com.au": ["Finance & Shopping", "Banking & Investing"],
  "paypal.com": ["Finance & Shopping", "Banking & Investing"],
  "westpac.com.au": ["Finance & Shopping", "Banking & Investing"],
  "commbank.com.au": ["Finance & Shopping", "Banking & Investing"],
  "nab.com.au": ["Finance & Shopping", "Banking & Investing"],
  "anz.com.au": ["Finance & Shopping", "Banking & Investing"],

  // Social & Communication
  "reddit.com": ["Social & Communication", null],
  "twitter.com": ["Social & Communication", null],
  "x.com": ["Social & Communication", null],
  "instagram.com": ["Social & Communication", null],
  "tiktok.com": ["Social & Communication", null],
  "facebook.com": ["Social & Communication", null],
  "linkedin.com": ["Social & Communication", null],
  "discord.com": ["Social & Communication", "Chat & Docs Tools"],
  "slack.com": ["Social & Communication", "Chat & Docs Tools"],
  "notion.so": ["Social & Communication", "Chat & Docs Tools"],
  "docs.google.com": ["Social & Communication", "Chat & Docs Tools"],
  "sheets.google.com": ["Social & Communication", "Chat & Docs Tools"],
  "drive.google.com": ["Social & Communication", "Chat & Docs Tools"],
  "calendar.google.com": ["Social & Communication", "Chat & Docs Tools"],
  "trello.com": ["Social & Communication", "Chat & Docs Tools"],
  "asana.com": ["Social & Communication", "Chat & Docs Tools"],
  "airtable.com": ["Social & Communication", "Chat & Docs Tools"],

  // Utilities & Misc
  "bodybuilding.com": ["Utilities & Misc", "Fitness"],
  "myfitnesspal.com": ["Utilities & Misc", "Fitness"],
  "strava.com": ["Utilities & Misc", "Fitness"],
};

// Keyword fallback for domains not in the table above — still only ever
// resolves to a (root, subfolder) pair from the fixed ROOTS list.
const KEYWORD_RULES = [
  { root: "Coding & Dev", sub: "AI Tools", words: ["artificial intelligence", "machine learning", "deep learning", "neural network", "large language model", "llm", "chatgpt", "claude", "openai", "anthropic", "gemini", "perplexity", "ai agent", "generative ai", "prompt engineering"] },
  { root: "Coding & Dev", sub: "Security", words: ["cybersecurity", "cyber security", "network security", "malware analysis", "penetration testing", "ethical hacking", "zero trust"] },
  { root: "Coding & Dev", sub: "Docs & References", words: ["docs", "documentation", "api reference", "developer guide"] },
  { root: "Coding & Dev", sub: null, words: ["javascript", "typescript", "python programming", "programming language", "source code", "repository", "algorithm", "software engineer", "web development", "framework", "npm package", "open source", "coding tutorial", "how to code", "learn to code", "learn python", "learn javascript", "python tutorial", "css tutorial", "html tutorial", "react tutorial", "coding for beginners", "web dev tutorial", "sql tutorial", "full stack", "backend developer", "frontend developer", "build an app", "code along", "programming tutorial"] },
  { root: "Coding & Dev", sub: "Practice & Jobs", words: ["coding challenge", "coding practice", "job listing", "job posting", "career opportunity"] },
  { root: "Design & Inspiration", sub: "UI Inspiration", words: ["design tutorial", "figma tutorial", "ui design", "ux design", "product design", "interaction design", "design system", "interface animation"] },
  { root: "Design & Inspiration", sub: "Visual & 3D", words: ["graphic design", "motion design", "3d art", "blender tutorial", "cinema 4d", "visual effects"] },
  { root: "Gaming & Roblox Dev", sub: "Roblox Studio Docs", words: ["roblox scripting", "roblox tutorial", "roblox dev", "roblox studio"] },
  { root: "School & Academics", sub: "STEM", words: ["math tutorial", "mathematics", "physics explained", "chemistry tutorial", "biology lesson", "calculus", "algebra", "trigonometry", "science experiment"] },
  { root: "School & Academics", sub: "Study & Exams", words: ["hsc", "nesa", "atar", "assignment", "homework", "lecture notes", "study guide", "exam prep", "past papers", "revision notes"] },
  { root: "School & Academics", sub: "Courses", words: ["online course", "masterclass", "certificate course", "course lesson"] },
  { root: "Business & Ventures", sub: "Startups & Product", words: ["startup", "saas", "product strategy", "product management", "business model", "entrepreneur", "founder", "market research"] },
  { root: "Business & Ventures", sub: "Marketing & Growth", words: ["marketing strategy", "social media marketing", "seo guide", "growth strategy", "sales funnel", "brand strategy"] },
  { root: "Reading & Articles", sub: null, words: ["medium.com", "substack.com", "blog post", "read the article", "wikipedia.org", "news article"] },
  { root: "Gaming & Roblox Dev", sub: "Gaming", words: ["gameplay", "game review", "gaming guide", "walkthrough", "speedrun", "esports"] },
  { root: "Entertainment", sub: "Film & Series", words: ["anime series", "movie review", "watch episode", "streaming service", "official trailer", "film analysis", "tv series"] },
  { root: "Entertainment", sub: "Music", words: ["music video", "official audio", "album review", "music production", "song cover"] },
  { root: "Social & Communication", sub: null, words: ["discussion forum", "community forum", "online community"] },
  { root: "Finance & Shopping", sub: "Banking & Investing", words: ["investing", "stock market", "portfolio", "index fund", "personal finance", "budgeting"] },
  { root: "Finance & Shopping", sub: "Shopping", words: ["buy now", "add to cart", "product price", "online store", "checkout", "product comparison"] },
];

// Platforms where the CONTENT varies too much for the domain alone to
// mean anything — a YouTube video could be a coding tutorial, a chess
// lesson, or a gaming stream; a Reddit link could be r/programming or
// r/funny; a Google Doc could be a school essay or a business plan.
// Unlike github.com or chess.com, where the domain basically IS the
// category, these need the title checked FIRST. This is the actual fix
// for "it groups everything YouTube into YouTube" — not a YouTube-only
// patch, the same flaw applied to every domain below it.
const CONTENT_VARIES_DOMAINS = new Set([
  "youtube.com", "youtu.be", "reddit.com", "docs.google.com", "sheets.google.com", "drive.google.com",
  "notion.so", "medium.com", "substack.com", "twitter.com", "x.com", "tiktok.com", "instagram.com",
]);

const Classifier = {
  domainOf(url) {
    try { return new URL(url).hostname.replace("www.", ""); }
    catch { return "other"; }
  },

  shouldNeverSort(title) {
    const t = (title || "").toLowerCase().trim();
    return NEVER_SORT_TITLES.some(k => t === k || t.startsWith(k));
  },

  fingerprint(bookmark) {
    try {
      const url = new URL(bookmark.url);
      const firstPath = url.pathname.split("/").filter(Boolean).slice(0, 2).join("/");
      return `${url.hostname.replace(/^www\./, "")}/${firstPath}`.replace(/\/$/, "");
    } catch { return this.domainOf(bookmark.url); }
  },

  scoredKeywordMatch(bookmark) {
    const title = String(bookmark.title || "").toLowerCase();
    const url = String(bookmark.url || "").toLowerCase().replace(/[-_+]/g, " ");
    const scored = KEYWORD_RULES.map(rule => {
      const matched = [];
      let score = 0;
      for (const phrase of rule.words) {
        const word = phrase.toLowerCase();
        if (title.includes(word)) { score += word.includes(" ") ? 6 : 3; matched.push(word); }
        else if (url.includes(word)) { score += word.includes(" ") ? 2 : 1; matched.push(word); }
      }
      return { rule, score, matched };
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length || scored[0].score < 3) return null;
    const top = scored[0];
    const runner = scored[1];
    if (runner && runner.rule.root !== top.rule.root && top.score - runner.score <= 1) {
      return { path: ["Utilities & Misc", "Review Queue"], confidence: "low", source: "ambiguous-content", reasons: [top.rule.root, runner.rule.root] };
    }
    return { path: [top.rule.root, top.rule.sub].filter(Boolean), confidence: top.score >= 6 ? "high" : "medium", source: "content-score", reasons: top.matched.slice(0, 3) };
  },

  // learnedMap: { domain: [root, sub|null] } from manual re-files
  // legitFolders: [{title, parentTitle}] — ONLY folders that are already
  // nested one level inside a fixed root (Tier 2). Deliberately excludes
  // any top-level folder, because a stray leftover folder from a bug in an
  // earlier version (one junk folder per site) would otherwise look just
  // as "legitimate" as a real category and keep getting reinforced forever.
  classify(bookmark, learnedMap, legitFolders) {
    const domain = this.domainOf(bookmark.url);
    const haystack = (bookmark.title + " " + (bookmark.url || "")).toLowerCase();
    const fingerprint = this.fingerprint(bookmark);

    // 1) learned from a manual correction — exact site/path fingerprint
    // wins. Legacy domain rules remain a fallback only for stable domains.
    if (learnedMap && learnedMap[fingerprint]) {
      return { path: learnedMap[fingerprint].filter(Boolean), confidence: "high", source: "learned-exact" };
    }
    if (learnedMap && learnedMap[domain] && !CONTENT_VARIES_DOMAINS.has(domain)) {
      return { path: learnedMap[domain].filter(Boolean), confidence: "high", source: "learned-domain" };
    }

    // 2) Topic beats platform for EVERY bookmark. This is the black-and-
    // white rule: classify what the saved page says it is about first;
    // use a domain only when content gives no reliable signal.
    const topic = this.scoredKeywordMatch(bookmark);
    if (topic) return topic;

    // 3) Content-variable platforms never receive a broad domain guess.
    if (CONTENT_VARIES_DOMAINS.has(domain)) {
      // An ambiguous multi-topic platform should be reviewed, not forced
      // into a platform folder. This is why generic YouTube links no longer
      // become Entertainment / YouTube by default.
      return { path: ["Utilities & Misc", "Review Queue"], confidence: "low", source: "needs-content", reasons: ["platform content varies"] };
    }

    // 4) curated stable-domain table
    if (DOMAIN_TABLE[domain]) {
      return { path: DOMAIN_TABLE[domain].filter(Boolean), confidence: "high", source: "domain" };
    }
    // try bare eTLD+1 in case of subdomains (e.g. mail.google.com)
    const parts = domain.split(".");
    if (parts.length > 2) {
      const bare = parts.slice(-2).join(".");
      if (DOMAIN_TABLE[bare]) return { path: DOMAIN_TABLE[bare].filter(Boolean), confidence: "high", source: "domain" };
    }

    // 5) a subfolder you (or a previous sort) already legitimately created
    // inside one of the fixed roots — never a stray top-level folder
    if (legitFolders) {
      const hit = legitFolders.find(f => {
        const name = (f.title || "").toLowerCase().trim();
        return name.length >= 4 && haystack.includes(name);
      });
      if (hit) return { path: [hit.parentTitle, hit.title], confidence: "medium", source: "existing-folder" };
    }

    // 6) no match — broad catch-all, never a new folder per domain
    return { path: ["Utilities & Misc", "Review Queue"], confidence: "low", source: "catchall", reasons: ["no confident topic signal"] };
  },

  ROOTS,
  INBOX_FOLDER_NAME,
  CONTENT_VARIES_DOMAINS,
  isRoot(title) { return ROOTS.includes(title); },

  // Exposed so callers (background.js's manual-re-file learning, in
  // particular) can avoid turning one re-filed bookmark into a blanket
  // rule for an entire platform — see CONTENT_VARIES_DOMAINS above.
  isContentVariesDomain(domain) { return CONTENT_VARIES_DOMAINS.has(domain); },

  // Turns a hostname into a clean folder label for same-site clustering,
  // e.g. "copilot.microsoft.com" -> "Copilot", "chatgpt.com" -> "Chatgpt".
  // A curated map covers the common cases; anything else falls back to a
  // reasonable generic guess so it still looks intentional, not raw.
  niceLabel(domain) {
    const CURATED = {
      "copilot.microsoft.com": "Copilot", "chatgpt.com": "ChatGPT", "claude.ai": "Claude",
      "gemini.google.com": "Gemini", "perplexity.ai": "Perplexity", "github.com": "GitHub",
      "leetcode.com": "LeetCode", "exercism.org": "Exercism", "chess.com": "Chess.com",
      "roblox.com": "Roblox", "discord.com": "Discord", "notion.so": "Notion",
      "docs.google.com": "Google Docs", "sheets.google.com": "Google Sheets",
      "drive.google.com": "Google Drive", "calendar.google.com": "Google Calendar",
      "youtube.com": "YouTube", "figma.com": "Figma", "netlify.com": "Netlify",
      "vercel.com": "Vercel", "stackoverflow.com": "Stack Overflow",
    };
    if (CURATED[domain]) return CURATED[domain];
    const stripped = domain.replace(/^(www|app|mail|docs|m|my)\./, "");
    const first = stripped.split(".")[0];
    return first.charAt(0).toUpperCase() + first.slice(1);
  },
};
