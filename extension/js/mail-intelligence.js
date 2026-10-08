// mail-intelligence.js — deterministic, explainable metadata-only email triage.
// It never reads message bodies and never modifies Gmail. Categories are
// virtual Operation HQ lanes; every consequence remains an explicit user action.
const MailIntelligence = {
  CATEGORY_RULES: [
    { id: "school", label: "School", venture: "School & Academics", words: ["assessment", "assignment", "canvas", "classroom", "school", "student", "teacher", "homework", "exam", "course", "timetable", "education.nsw", "instructure", "melonba", "pre-uni", "preuni", "tuition"] },
    { id: "work", label: "Work", venture: "Work", words: ["shift", "roster", "timesheet", "payroll", "payslip", "employee", "workplace", "manager", "employment", "interview"] },
    { id: "venture", label: "Venture", venture: "Business & Ventures", words: ["client", "proposal", "invoice", "project", "website", "domain", "hosting", "deployment", "github", "vercel", "stripe", "business", "startup", "hackathon", "competition", "devpost"] },
    { id: "social", label: "Social", venture: "Social & Communication", words: ["tiktok", "instagram", "discord", "reddit", "linkedin", "facebook", "snapchat", "mentioned you", "replied to you", "new message", "new follower", "commented"] },
    { id: "finance", label: "Finance", venture: "Finance & Shopping", words: ["receipt", "payment", "purchase", "order", "refund", "bank", "transaction", "statement", "subscription", "billing", "renewal"] },
    { id: "updates", label: "Updates", venture: "Reading & Articles", words: ["newsletter", "digest", "weekly update", "release notes", "what's new", "roundup", "unsubscribe", "promotion", "offer"] },
  ],

  PRIORITY_RULES: [
    { points: 70, reason: "explicit urgency", words: ["urgent", "immediately", "action required", "final notice", "overdue"] },
    { points: 55, reason: "time-sensitive deadline", words: ["due today", "due tomorrow", "deadline today", "deadline tomorrow", "expires today", "last day"] },
    { points: 45, reason: "account or payment problem", words: ["security alert", "unusual activity", "payment failed", "account suspended", "password changed"] },
    { points: 34, reason: "important commitment", words: ["assessment", "exam", "interview", "shift change", "submission", "appointment"] },
    { points: 22, reason: "response requested", words: ["please reply", "response required", "confirm your", "approval needed", "needs your attention"] },
  ],

  PLATFORM_LINKS: {
    tiktok: "https://www.tiktok.com/messages",
    instagram: "https://www.instagram.com/direct/inbox/",
    discord: "https://discord.com/channels/@me",
    reddit: "https://www.reddit.com/message/inbox/",
    linkedin: "https://www.linkedin.com/messaging/",
    facebook: "https://www.facebook.com/messages/",
    snapchat: "https://web.snapchat.com/",
  },

  headers(message) {
    const headers = message?.payload?.headers || [];
    const get = name => headers.find(item => String(item.name).toLowerCase() === name)?.value?.trim() || "";
    return { from: get("from"), subject: get("subject") || "No subject" };
  },

  textFor(message) {
    const { from, subject } = this.headers(message);
    return `${from} ${subject}`.toLowerCase();
  },

  classify(message, overrides = {}) {
    const { from, subject } = this.headers(message);
    const text = `${from} ${subject}`.toLowerCase();
    const override = overrides[message.threadId] || overrides[message.id];
    const categoryRule = override
      ? this.CATEGORY_RULES.find(rule => rule.id === override)
      : this.CATEGORY_RULES.find(rule => rule.words.some(word => text.includes(word)));
    const category = categoryRule?.id || "personal";
    const categoryLabel = categoryRule?.label || "Personal";
    let score = message.labelIds?.includes("IMPORTANT") ? 24 : 0;
    const reasons = message.labelIds?.includes("IMPORTANT") ? ["marked important in Gmail"] : [];
    for (const rule of this.PRIORITY_RULES) {
      if (rule.words.some(word => text.includes(word))) {
        score += rule.points;
        reasons.push(rule.reason);
      }
    }
    if (message.labelIds?.includes("UNREAD")) score += 8;
    if (category === "updates") score -= 18;
    if (/no-?reply|newsletter|digest/.test(text)) score -= 8;
    score = Math.max(0, Math.min(100, score));
    const priority = score >= 58 ? "urgent" : score >= 30 ? "important" : score >= 12 ? "normal" : "low";
    const platform = Object.keys(this.PLATFORM_LINKS).find(name => text.includes(name)) || null;
    return {
      category,
      categoryLabel,
      venture: categoryRule?.venture || "Personal",
      priority,
      score,
      reason: reasons.length ? reasons.join(" + ") : (override ? "your saved category correction" : `matched ${categoryLabel.toLowerCase()} metadata`),
      platform,
      platformUrl: platform ? this.PLATFORM_LINKS[platform] : null,
      suggestedMinutes: priority === "urgent" ? 20 : priority === "important" ? 15 : 10,
    };
  },

  summarise(messages, overrides = {}) {
    const rows = (messages || []).map(message => ({ message, triage: this.classify(message, overrides) }));
    const counts = rows.reduce((acc, row) => {
      acc[row.triage.category] = (acc[row.triage.category] || 0) + 1;
      acc[row.triage.priority] = (acc[row.triage.priority] || 0) + 1;
      return acc;
    }, {});
    return { rows, counts };
  },
};
