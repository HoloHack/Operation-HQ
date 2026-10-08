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

const NEVER_SORT_TITLES = ["inbox"];
const INBOX_FOLDER_NAME = "Inbox";

// This is the entire vocabulary Operation HQ is allowed to create. Keeping
// the list explicit makes sorting predictable: better recognition can move a
// bookmark between these useful buckets, but it can never invent hundreds of
// one-link folders or learn an unsafe arbitrary path from a manual drag.
const MANAGED_SUBFOLDERS = {
  "Coding & Dev": ["AI Tools", "AI Image Gen", "Automation", "Docs & References", "Hosting & Deploy", "Playgrounds", "Practice & Jobs", "Projects", "Security", "Web Development"],
  "Design & Inspiration": ["Design Tools", "UI Inspiration", "Visual & 3D"],
  "School & Academics": ["Courses", "Humanities & English", "Languages", "Mathematics", "Science", "STEM", "Study & Exams", "Study Tools"],
  "Business & Ventures": ["Client Delivery", "Marketing & Growth", "Startups & Product"],
  "Gaming & Roblox Dev": ["Chess", "Gaming", "Roblox Studio Docs"],
  "Reading & Articles": ["Documents", "Research & Reference", "Saved Reading"],
  "Entertainment": ["Anime & Manga", "Film & Series", "Music", "Sports", "Streaming"],
  "Finance & Shopping": ["Banking & Investing", "Shopping"],
  "Social & Communication": ["Chat & Docs Tools", "Communities", "Social Networks"],
  "Utilities & Misc": ["Fitness", "Productivity", "Tools", "Travel"],
};
// Retained as an empty compatibility guard for older callers. Version 2.9
// never creates an operational/catch-all destination: unresolved bookmarks
// stay in place until enough evidence or an explicit owner choice exists.
const OPERATIONAL_SUBFOLDERS = new Set();

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
  "cursor.com": ["Coding & Dev", "AI Tools"],
  "bolt.new": ["Coding & Dev", "AI Tools"],
  "v0.dev": ["Coding & Dev", "AI Tools"],
  "firebase.google.com": ["Coding & Dev", "Hosting & Deploy"],
  "cloudflare.com": ["Coding & Dev", "Hosting & Deploy"],
  "pypi.org": ["Coding & Dev", "Docs & References"],
  "freecodecamp.org": ["Coding & Dev", "Practice & Jobs"],
  "codecademy.com": ["Coding & Dev", "Practice & Jobs"],
  "geeksforgeeks.org": ["Coding & Dev", "Docs & References"],
  "stackblitz.com": ["Coding & Dev", "Playgrounds"],

  // Design & Inspiration
  "dribbble.com": ["Design & Inspiration", "UI Inspiration"],
  "mobbin.com": ["Design & Inspiration", "UI Inspiration"],
  "lapa.ninja": ["Design & Inspiration", "UI Inspiration"],
  "land-book.com": ["Design & Inspiration", "UI Inspiration"],
  "awwwards.com": ["Design & Inspiration", "UI Inspiration"],
  "behance.net": ["Design & Inspiration", "UI Inspiration"],
  "pinterest.com": ["Design & Inspiration", "UI Inspiration"],
  "figma.com": ["Design & Inspiration", "Design Tools"],
  "canva.com": ["Design & Inspiration", "Design Tools"],
  "unsplash.com": ["Design & Inspiration", "UI Inspiration"],
  "fonts.google.com": ["Design & Inspiration", "Design Tools"],
  "adobe.com": ["Design & Inspiration", "Design Tools"],

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
  "desmos.com": ["School & Academics", "STEM"],
  "wolframalpha.com": ["School & Academics", "STEM"],
  "cambridge.edu.au": ["School & Academics", "Mathematics"],
  "go.cambridge.edu.au": ["School & Academics", "Mathematics"],
  "cambridgego.com": ["School & Academics", "Mathematics"],
  "instructure.com": ["School & Academics", "Courses"],
  "education.nsw.gov.au": ["School & Academics", "Courses"],
  "educationstandards.nsw.edu.au": ["School & Academics", "Study & Exams"],
  "onenote.com": ["School & Academics", "Study Tools"],
  "quizizz.com": ["School & Academics", "Study Tools"],
  "kahoot.com": ["School & Academics", "Study Tools"],

  // Business & Ventures
  "stripe.com": ["Business & Ventures", null],
  "godaddy.com": ["Business & Ventures", null],
  "shopify.com": ["Business & Ventures", null],
  "squarespace.com": ["Business & Ventures", null],
  "wix.com": ["Business & Ventures", null],
  "lovable.dev": ["Business & Ventures", "Client Delivery"],
  "hubspot.com": ["Business & Ventures", "Marketing & Growth"],

  // Gaming & Roblox Dev
  "roblox.com": ["Gaming & Roblox Dev", null],
  "create.roblox.com": ["Gaming & Roblox Dev", "Roblox Studio Docs"],
  "devforum.roblox.com": ["Gaming & Roblox Dev", "Roblox Studio Docs"],
  "chess.com": ["Gaming & Roblox Dev", "Chess"],
  "lichess.org": ["Gaming & Roblox Dev", "Chess"],
  "steampowered.com": ["Gaming & Roblox Dev", "Gaming"],
  "epicgames.com": ["Gaming & Roblox Dev", "Gaming"],
  "xbox.com": ["Gaming & Roblox Dev", "Gaming"],
  "playstation.com": ["Gaming & Roblox Dev", "Gaming"],

  // Entertainment
  "netflix.com": ["Entertainment", "Streaming"],
  "spotify.com": ["Entertainment", "Streaming"],
  "twitch.tv": ["Entertainment", "Streaming"],
  "crunchyroll.com": ["Entertainment", "Streaming"],
  "myanimelist.net": ["Entertainment", "Streaming"],
  "primevideo.com": ["Entertainment", "Streaming"],
  "disneyplus.com": ["Entertainment", "Streaming"],
  "soundcloud.com": ["Entertainment", "Music"],
  "letterboxd.com": ["Entertainment", "Film & Series"],

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
  "mail.google.com": ["Social & Communication", "Chat & Docs Tools"],
  "meet.google.com": ["Social & Communication", "Chat & Docs Tools"],
  "teams.microsoft.com": ["Social & Communication", "Chat & Docs Tools"],

  // Reading & reference
  "wikipedia.org": ["Reading & Articles", "Research & Reference"],
  "britannica.com": ["Reading & Articles", "Research & Reference"],
  "arxiv.org": ["Reading & Articles", "Research & Reference"],
  "scholar.google.com": ["Reading & Articles", "Research & Reference"],
  "news.ycombinator.com": ["Reading & Articles", "Saved Reading"],

  // Utilities & Misc
  "bodybuilding.com": ["Utilities & Misc", "Fitness"],
  "myfitnesspal.com": ["Utilities & Misc", "Fitness"],
  "strava.com": ["Utilities & Misc", "Fitness"],
  "todoist.com": ["Utilities & Misc", "Productivity"],
  "ticktick.com": ["Utilities & Misc", "Productivity"],
  "maps.google.com": ["Utilities & Misc", "Travel"],
  "office.com": ["Utilities & Misc", "Productivity"],
  "microsoft365.com": ["Utilities & Misc", "Productivity"],
};

// Keyword fallback for domains not in the table above — still only ever
// resolves to a (root, subfolder) pair from the fixed ROOTS list.
const KEYWORD_RULES = [
  { root: "School & Academics", sub: "Mathematics", words: ["math", "maths", "mathematics", "algebra", "geometry", "calculus", "trigonometry", "quadratic", "indices", "surds", "probability", "statistics", "pythagoras", "cambridge maths", "math chapter", "math exercise"] },
  { root: "School & Academics", sub: "Science", words: ["science", "biology", "chemistry", "physics", "scientific method", "experiment", "laboratory", "data skills"] },
  { root: "School & Academics", sub: "Humanities & English", words: ["english", "literature", "poetry", "shakespeare", "essay", "creative writing", "hsie", "history", "geography", "commerce", "economics", "humanities", "source analysis"] },
  { root: "Coding & Dev", sub: "Docs & References", words: ["python", "javascript", "typescript", "java", "c#", "lua", "programming", "coding", "developer documentation", "api docs", "code example"] },
  { root: "Coding & Dev", sub: "AI Tools", words: ["ai", "artificial intelligence", "machine learning", "deep learning", "neural network", "large language model", "llm", "chatgpt", "claude", "openai", "anthropic", "gemini", "perplexity", "ai agent", "generative ai", "prompt engineering"] },
  { root: "Coding & Dev", sub: "Security", words: ["cybersecurity", "cyber security", "network security", "malware analysis", "penetration testing", "ethical hacking", "zero trust"] },
  { root: "Coding & Dev", sub: "Docs & References", words: ["docs", "documentation", "api reference", "developer guide"] },
  { root: "Coding & Dev", sub: null, words: ["javascript", "typescript", "python programming", "programming language", "source code", "repository", "algorithm", "software engineer", "web development", "framework", "npm package", "open source", "coding tutorial", "how to code", "learn to code", "learn python", "learn javascript", "python tutorial", "css tutorial", "html tutorial", "react tutorial", "coding for beginners", "web dev tutorial", "sql tutorial", "full stack", "backend developer", "frontend developer", "build an app", "code along", "programming tutorial"] },
  { root: "Coding & Dev", sub: "Practice & Jobs", words: ["coding challenge", "coding practice", "job listing", "job posting", "career opportunity"] },
  { root: "Design & Inspiration", sub: "UI Inspiration", words: ["design tutorial", "figma tutorial", "ui design", "ux design", "product design", "interaction design", "design system", "interface animation"] },
  { root: "Design & Inspiration", sub: "Visual & 3D", words: ["graphic design", "motion design", "3d art", "blender tutorial", "cinema 4d", "visual effects"] },
  { root: "Gaming & Roblox Dev", sub: "Roblox Studio Docs", words: ["roblox scripting", "roblox tutorial", "roblox dev", "roblox studio"] },
  { root: "School & Academics", sub: "STEM", words: ["stem project", "engineering challenge", "robotics project", "interdisciplinary science", "maths and science"] },
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
  { root: "Coding & Dev", sub: "Web Development", words: ["react", "next.js", "nextjs", "node.js", "nodejs", "html", "css", "tailwind", "frontend", "backend", "full stack", "web app", "web development"] },
  { root: "Coding & Dev", sub: "Projects", words: ["project repository", "project dashboard", "deployment project", "source repository", "codebase", "pull request", "issue tracker"] },
  { root: "Coding & Dev", sub: "Automation", words: ["workflow automation", "automate", "automation workflow", "webhook", "integration workflow", "no code", "low code"] },
  { root: "Design & Inspiration", sub: "Design Tools", words: ["design tool", "color palette", "colour palette", "font pairing", "typography", "icon library", "mockup", "wireframe", "prototype"] },
  { root: "School & Academics", sub: "Humanities & English", words: ["english essay", "essay writing", "literary analysis", "history lesson", "geography", "humanities", "bibliography", "citation guide"] },
  { root: "School & Academics", sub: "Study Tools", words: ["flashcards", "study timer", "note taking", "study planner", "memorisation", "memorization", "study app"] },
  { root: "Reading & Articles", sub: "Research & Reference", words: ["research paper", "journal article", "case study", "white paper", "encyclopedia", "reference guide", "academic paper", "doi"] },
  { root: "Reading & Articles", sub: "Documents", words: ["pdf", "document", "report", "ebook", "manual", "handbook", "documentation file"] },
  { root: "Reading & Articles", sub: "Saved Reading", minScore: 2, words: ["article", "blog", "newsletter", "explained", "deep dive", "opinion", "analysis", "guide", "tutorial"] },
  { root: "Entertainment", sub: "Anime & Manga", words: ["anime", "manga", "jujutsu kaisen", "one piece", "demon slayer", "crunchyroll"] },
  { root: "Entertainment", sub: "Sports", words: ["football", "soccer", "basketball", "cricket", "formula 1", "motorsport", "sports highlights", "match highlights"] },
  { root: "Social & Communication", sub: "Communities", words: ["community", "forum", "discussion", "server invite", "group chat"] },
  { root: "Social & Communication", sub: "Social Networks", words: ["profile", "social network", "direct message", "messages", "followers", "social feed"] },
  { root: "Utilities & Misc", sub: "Productivity", words: ["to do", "todo", "task manager", "calendar", "planner", "time tracker", "pomodoro", "productivity"] },
  { root: "Utilities & Misc", sub: "Travel", words: ["travel", "hotel", "flight", "directions", "maps", "destination", "itinerary"] },
  { root: "Utilities & Misc", sub: "Tools", words: ["calculator", "converter", "generator", "compressor", "formatter", "checker", "download tool", "online tool", "utility"] },
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
  normalizePath(path, { allowOperational = true } = {}) {
    if (!Array.isArray(path)) return null;
    const clean = path.map(part => String(part || "").trim()).filter(Boolean);
    if (clean.length < 1 || clean.length > 2 || !ROOTS.includes(clean[0])) return null;
    if (clean.length === 2) {
      const allowed = MANAGED_SUBFOLDERS[clean[0]] || [];
      if (!allowed.includes(clean[1])) return null;
      if (!allowOperational && OPERATIONAL_SUBFOLDERS.has(clean[1])) return null;
    }
    return clean;
  },

  isManagedPath(path, options) { return Boolean(this.normalizePath(path, options)); },

  domainOf(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
    catch { return "other"; }
  },

  contentVariesBase(domain) {
    const host = String(domain || "").toLowerCase().replace(/^www\./, "");
    return [...CONTENT_VARIES_DOMAINS].find(base => host === base || host.endsWith(`.${base}`)) || null;
  },

  shouldNeverSort(title) {
    const t = (title || "").toLowerCase().trim();
    return NEVER_SORT_TITLES.some(k => t === k);
  },

  fingerprint(bookmark) {
    try {
      const url = new URL(bookmark.url);
      const domain = url.hostname.toLowerCase().replace(/^www\./, "");
      const variableDomain = this.contentVariesBase(domain);
      const keyDomain = variableDomain || domain;
      const segments = url.pathname.split("/").filter(Boolean);
      // Content-variable services need a content identifier, not merely a
      // shared route such as /watch or /document/d. Otherwise correcting one
      // video or document silently teaches a rule for every other one.
      if (variableDomain === "youtube.com" && url.searchParams.get("v")) return `youtube.com/watch?v=${url.searchParams.get("v")}`;
      if (domain === "youtu.be" && segments[0]) return `${domain}/${segments[0]}`;
      if (["docs.google.com", "sheets.google.com", "drive.google.com"].includes(variableDomain)) return `${variableDomain}/${segments.slice(0, 4).join("/")}`.replace(/\/$/, "");
      const depth = variableDomain ? 3 : 2;
      return `${keyDomain}/${segments.slice(0, depth).join("/")}`.replace(/\/$/, "");
    } catch { return this.domainOf(bookmark.url); }
  },

  scoredKeywordMatch(bookmark) {
    const normalize = value => String(value || "").toLowerCase().replace(/%[0-9a-f]{2}/gi, " ").replace(/[^a-z0-9.+#]+/g, " ").replace(/\s+/g, " ").trim();
    const title = normalize([bookmark.title, ...(Array.isArray(bookmark.sourcePath) ? bookmark.sourcePath : [])].join(" "));
    const url = normalize(bookmark.url);
    const contains = (text, phrase) => {
      const needle = normalize(phrase);
      if (!needle) return false;
      if (needle.includes(" ")) return (` ${text} `).includes(` ${needle} `);
      return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(text);
    };
    const broadSignals = new Set(["article", "blog", "guide", "tutorial", "analysis", "explained", "document", "report", "profile", "messages", "community", "forum", "travel", "calendar", "planner", "productivity", "generator", "calculator", "tool"]);
    const scored = KEYWORD_RULES.map(rule => {
      const matched = [];
      let score = 0;
      for (const phrase of rule.words) {
        const word = phrase.toLowerCase();
        if (contains(title, word)) { score += word.includes(" ") ? 6 : (broadSignals.has(word) ? 2 : 3); matched.push(word); }
        else if (contains(url, word)) { score += word.includes(" ") ? 2 : 1; matched.push(word); }
      }
      return { rule, score, matched };
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length || scored[0].score < (scored[0].rule.minScore || 3)) return null;
    const candidates = [];
    const seen = new Set();
    for (const entry of scored) {
      const path = [entry.rule.root, entry.rule.sub].filter(Boolean);
      const key = path.join("\u0000");
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ path, score:entry.score, reasons:entry.matched.slice(0,3) });
      if (candidates.length >= 3) break;
    }
    const top = scored[0];
    const firstCandidate = candidates[0];
    const competingCandidate = candidates.find(candidate => candidate.path.join("\u0000") !== firstCandidate.path.join("\u0000"));
    // Two credible topic readings within one point are not enough evidence to
    // move data. This catches both cross-root clashes and collisions between
    // subtopics inside one root (for example AI tooling vs web development).
    if (competingCandidate && competingCandidate.score >= 3 && firstCandidate.score - competingCandidate.score < 2) {
      return { path: null, confidence: "needs-decision", source: "ambiguous-content", reasons: [firstCandidate.path.join(" › "), competingCandidate.path.join(" › ")], candidates };
    }
    // One subject-specific signal such as “calculus”, “chemistry”, “React”,
    // or “anime” is decisive when there is no credible competing topic. Broad
    // words such as “guide”, “article”, or “tool” remain suggestions only.
    const hasSpecificSignal = top.matched.some(signal => !broadSignals.has(signal));
    const confidence = top.score >= 6 || (top.score >= 3 && hasSpecificSignal) ? "high" : "medium";
    return { path: [top.rule.root, top.rule.sub].filter(Boolean), confidence, source: "content-score", reasons: top.matched.slice(0, 3), candidates };
  },

  stableDomainPath(domain) {
    const parts = String(domain || "").split(".").filter(Boolean);
    for (let index = 0; index < parts.length; index += 1) {
      const candidate = parts.slice(index).join(".");
      if (DOMAIN_TABLE[candidate]) return DOMAIN_TABLE[candidate].filter(Boolean);
    }
    return null;
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
      const learned = this.normalizePath(learnedMap[fingerprint], { allowOperational: false });
      if (learned) return { path: learned, confidence: "high", source: "learned-exact" };
    }
    if (learnedMap && learnedMap[domain] && !this.contentVariesBase(domain)) {
      const learned = this.normalizePath(learnedMap[domain], { allowOperational: false });
      if (learned) return { path: learned, confidence: "high", source: "learned-domain" };
    }

    // 2) Topic beats platform for EVERY bookmark. This is the black-and-
    // white rule: classify what the saved page says it is about first;
    // use a domain only when content gives no reliable signal.
    const topic = this.scoredKeywordMatch(bookmark);
    if (topic) return topic;

    // A bookmark already placed inside the supported taxonomy is an explicit
    // owner decision. Preserve it when no stronger title/URL topic contradicts
    // it, including older manual placements that predate exact learning.
    const currentPath = this.normalizePath(bookmark.sourcePath, { allowOperational:false });
    if (currentPath) return { path:currentPath, confidence:"high", source:"current-placement", reasons:["existing curated placement"], candidates:[{ path:currentPath, score:9, reasons:["current folder"] }] };

    // 3) Content-variable platforms never receive a broad domain guess.
    if (this.contentVariesBase(domain)) {
      // An ambiguous multi-topic platform stays where the person put it until
      // page evidence or an explicit decision identifies its real topic.
      return { path: null, confidence: "needs-evidence", source: "needs-content", reasons: ["platform content varies"], candidates:[] };
    }

    // 4) curated stable-domain table
    const stablePath = this.stableDomainPath(domain);
    if (stablePath) return { path: stablePath, confidence: "high", source: "domain", candidates:[{ path:stablePath, score:10, reasons:[domain] }] };

    // 5) a subfolder you (or a previous sort) already legitimately created
    // inside one of the fixed roots — never a stray top-level folder
    if (legitFolders) {
      const hit = legitFolders.find(f => {
        const name = (f.title || "").toLowerCase().trim();
        return name.length >= 4 && haystack.includes(name);
      });
      if (hit) return { path: [hit.parentTitle, hit.title], confidence: "medium", source: "existing-folder" };
    }

    // 6) no match. There is deliberately no catch-all destination: reducing
    // an "uncategorised" count by creating wrong categories is not accuracy.
    return { path: null, confidence: "needs-evidence", source: "needs-content", reasons: ["no confident topic signal"], candidates:[] };
  },

  ROOTS,
  MANAGED_SUBFOLDERS,
  INBOX_FOLDER_NAME,
  CONTENT_VARIES_DOMAINS,
  isRoot(title) { return ROOTS.includes(title); },

  // Exposed so callers (background.js's manual-re-file learning, in
  // particular) can avoid turning one re-filed bookmark into a blanket
  // rule for an entire platform — see CONTENT_VARIES_DOMAINS above.
  isContentVariesDomain(domain) { return Boolean(this.contentVariesBase(domain)); },

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
