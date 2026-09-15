// command-intelligence.js — deterministic orchestration underneath Nexus.
// It understands planning phrases, resolves dates, searches the person's own
// bookmarks/tabs/workspaces, and builds review drafts. It never opens, moves,
// closes or schedules anything without a visible user action.

const HQCommandEngine = {
  SUBJECTS: [
    { id: "maths", label: "Maths", match: /\b(math|maths|mathematics|algebra|geometry|calculus|statistics|probability)\b/ },
    { id: "science", label: "Science", match: /\b(science|biology|chemistry|physics)\b/ },
    { id: "english", label: "English", match: /\b(english|essay|literature|writing)\b/ },
    { id: "hsie", label: "HSIE", match: /\b(hsie|history|geography|commerce|economics|humanities)\b/ },
    { id: "technology", label: "Technology", match: /\b(coding|programming|software|technology|engineering|design)\b/ },
    { id: "language", label: "Language", match: /\b(language|french|spanish|japanese|chinese|tamil|gujarati)\b/ },
  ],
  STOP_WORDS: new Set(["the","a","an","and","or","to","for","with","my","me","please","saved","open","find","show","pull","up","from","group","tab","tabs","bookmark","bookmarks","chapter","chapters"]),

  normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  },

  subjectFor(text) {
    return this.SUBJECTS.find(subject => subject.match.test(text)) || null;
  },

  chapterRange(text) {
    const range = text.match(/\bchapters?\s*(\d{1,3})\s*(?:-|–|to|through)\s*(\d{1,3})\b/i);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start >= 0 && end >= start && end - start <= 30) {
        return { start, end, values:Array.from({ length:end - start + 1 }, (_, index) => start + index), contiguous:true };
      }
    }
    const list = text.match(/\bchapters?\s*(\d{1,3}(?:\s*(?:,|&|\band\b)\s*\d{1,3})+)/i);
    if (list) {
      const values = [...list[1].matchAll(/\d{1,3}/g)]
        .map(match => Number(match[0]))
        .filter((value, index, all) => value >= 0 && all.indexOf(value) === index)
        .slice(0, 30);
      if (values.length > 1) return { start:Math.min(...values), end:Math.max(...values), values, contiguous:false };
    }
    const single = text.match(/\bchapters?\s*(\d{1,3})\b/i);
    return single ? { start:Number(single[1]), end:Number(single[1]), values:[Number(single[1])], contiguous:true } : null;
  },

  dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  },

  deadlineFor(text) {
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) {
      const date = new Date(`${iso[1]}T12:00:00`);
      if (!Number.isNaN(date.getTime())) return { key: iso[1], label: iso[1] };
    }
    const base = new Date();
    base.setHours(12,0,0,0);
    if (/\bby\s+(?:today|tonight)\b/i.test(text)) return { key:this.dateKey(base), label:/\btonight\b/i.test(text) ? "tonight" : "today" };
    if (/\bby\s+tomorrow\b/i.test(text)) {
      base.setDate(base.getDate() + 1);
      return { key:this.dateKey(base), label:"tomorrow" };
    }
    const inDays = text.match(/\b(?:within|in)\s+(\d{1,2})\s+days?\b/i);
    if (inDays) {
      base.setDate(base.getDate() + Math.min(60, Number(inDays[1])));
      return { key:this.dateKey(base), label:`in ${inDays[1]} days` };
    }
    const weekdayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
    const weekday = text.match(/\bby\s+(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
    if (weekday) {
      const target = weekdayNames.indexOf(weekday[2].toLowerCase());
      let offset = (target - base.getDay() + 7) % 7;
      if (offset === 0 || weekday[1]) offset += 7;
      base.setDate(base.getDate() + offset);
      return { key:this.dateKey(base), label:`${weekday[1] || ""}${weekday[2]}`.trim() };
    }
    // A leading/session-level "today" (for example "Today I am going to
    // grind Maths…") is a useful implicit planning horizon, but only after
    // explicit "by …" deadlines above have had priority.
    if (/\b(?:today|tonight)\b/i.test(text)) return { key:this.dateKey(base), label:/\btonight\b/i.test(text) ? "tonight" : "today" };
    if (/\btomorrow\b/i.test(text)) {
      base.setDate(base.getDate() + 1);
      return { key:this.dateKey(base), label:"tomorrow" };
    }
    return null;
  },

  durationFor(text) {
    const match = text.match(/\b(\d{1,3})\s*(?:minute|minutes|min|mins)\b/i);
    return match ? Math.max(5, Math.min(180, Number(match[1]))) : null;
  },

  parse(raw) {
    const text = this.normalize(raw);
    const lower = text.toLowerCase();
    const subject = this.subjectFor(lower);
    const chapters = this.chapterRange(lower);
    const deadline = this.deadlineFor(lower);
    const duration = this.durationFor(lower);
    const planningVerb = /\b(reschedule|re-schedule|replan|re-plan|prioriti[sz]e|focus|study|work on|work through|prepare|revise|revision|grind|practice|complete|finish)\b/.test(lower);
    const changeVerb = /\b(reschedule|re-schedule|replan|re-plan|prioriti[sz]e|move|change)\b/.test(lower);
    const sessionPlanningVerb = /\b(grind|practice|complete|finish|work through)\b/.test(lower);
    const asksTheme = /\b(theme|colour scheme|color scheme|atmosphere|look|visual style)\b/.test(lower);
    const asksResource = /\b(find|open|show|pull up|locate|launch)\b/.test(lower) && /\b(cambridge|textbook|coursebook|chapter|resource|lesson|saved link|bookmark|tab group|workspace)\b/.test(lower);
    const asksBrowserReview = /\b(clean|optimise|optimize|dedupe|review|efficient|organise|organize)\b/.test(lower) && /\b(tabs?|groups?|workspaces?|bookmarks?)\b/.test(lower);
    const asksStudyHelp = /\b(explain|help me with|help with|teach me|quiz me|test me|check my|check this|walk me through)\b/.test(lower);

    if (asksStudyHelp) return { intent:"study-help", text, subject, mode:/\b(quiz|test)\b/.test(lower) ? "quiz" : /\bcheck\b/.test(lower) ? "critique" : "explain", query:text.replace(/^.*?\b(?:explain|help me with|help with|teach me|quiz me|test me|check my|check this|walk me through)\b/i, "").trim() };
    if (asksTheme) return { intent:"generated-theme", text, subject, topic:subject?.label || text.replace(/.*?\b(?:for|to match)\b/i, "").trim(), duration };
    if (planningVerb && (subject || chapters || /\bchapters?\b/.test(lower))) {
      return { intent:"focus-plan", text, subject, chapters, deadline, duration, changesSchedule:changeVerb, buildsDraft:changeVerb || sessionPlanningVerb };
    }
    if (asksResource) return { intent:"find-resource", text, subject, chapters, query:this.resourceQuery(text, subject, chapters) };
    if (asksBrowserReview) return { intent:"browser-review", text };
    return null;
  },

  resourceQuery(text, subject, chapters) {
    const explicit = this.normalize(text)
      .replace(/\b(find|open|show|pull up|locate|launch|saved|bookmark|tab group|workspace|please|for me)\b/gi, " ")
      .replace(/\s+/g," ").trim();
    if (explicit.length >= 3) return explicit;
    const chapterText = chapters?.values?.length
      ? `chapters ${chapters.values.join(" ")}`
      : chapters
        ? `chapter ${chapters.start}${chapters.end !== chapters.start ? ` to ${chapters.end}` : ""}`
        : "";
    return [subject?.label, chapterText].filter(Boolean).join(" ");
  },

  tokens(query) {
    return [...new Set(this.normalize(query).toLowerCase().replace(/[^a-z0-9]+/g," ").split(" ").filter(token => (token.length > 1 || /^\d+$/.test(token)) && !this.STOP_WORDS.has(token)))];
  },

  normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","fbclid","gclid"].forEach(key => parsed.searchParams.delete(key));
      return parsed.toString().replace(/\/$/,"");
    } catch { return String(url || ""); }
  },

  scoreResource(item, query, tokens) {
    const title = String(item.title || "").toLowerCase();
    const url = String(item.url || "").toLowerCase();
    const context = String(item.context || "").toLowerCase();
    const phrase = this.normalize(query).toLowerCase();
    let score = title.includes(phrase) ? 18 : 0;
    tokens.forEach(token => {
      if (title.includes(token)) score += 6;
      if (context.includes(token)) score += 3;
      if (url.includes(token)) score += 2;
    });
    if (/cambridge/.test(phrase) && /cambridge/.test(`${title} ${url} ${context}`)) score += 12;
    if (item.sources?.includes("Bookmark")) score += 3;
    if (item.sources?.includes("Open tab")) score += 2;
    return score;
  },

  async savedResources(query) {
    const cleanQuery = this.normalize(query);
    const tokens = this.tokens(cleanQuery);
    if (!tokens.length) return [];
    const resources = [];
    const push = item => {
      if (!/^https?:\/\//i.test(item.url || "")) return;
      resources.push({ ...item, url:this.normalizeUrl(item.url), sources:[item.source] });
    };
    if (chrome.bookmarks?.getTree) {
      const tree = await chrome.bookmarks.getTree();
      const walk = (nodes, path = []) => (nodes || []).forEach(node => {
        const nextPath = node.url ? path : [...path, node.title].filter(Boolean);
        if (node.url) push({ title:node.title || node.url, url:node.url, context:path.join(" › "), source:"Bookmark" });
        if (node.children) walk(node.children, nextPath);
      });
      walk(tree);
    }
    if (chrome.tabs?.query) {
      const tabs = await chrome.tabs.query({});
      tabs.forEach(tab => push({ title:tab.title || tab.url, url:tab.url, context:"Currently open in Chrome", source:"Open tab", tabId:tab.id }));
    }
    const saved = await chrome.storage.local.get("hq_browser_workspaces");
    (Array.isArray(saved.hq_browser_workspaces) ? saved.hq_browser_workspaces : []).forEach(workspace => {
      (workspace.tabs || []).forEach(tab => push({ title:tab.title || tab.url, url:tab.url, context:[workspace.name,tab.groupTitle,tab.topic,tab.subtopic].filter(Boolean).join(" › "), source:"Saved workspace" }));
    });
    const byUrl = new Map();
    resources.forEach(item => {
      const existing = byUrl.get(item.url);
      if (!existing) byUrl.set(item.url,item);
      else {
        existing.sources = [...new Set([...existing.sources,...item.sources])];
        existing.context = [existing.context,item.context].filter(Boolean).sort((a,b) => b.length-a.length)[0] || "";
        if (item.tabId) existing.tabId = item.tabId;
      }
    });
    return [...byUrl.values()]
      .map(item => ({ ...item, score:this.scoreResource(item,cleanQuery,tokens) }))
      .filter(item => item.score >= 5)
      .sort((a,b) => b.score-a.score || a.title.localeCompare(b.title))
      .slice(0,8);
  },
};
