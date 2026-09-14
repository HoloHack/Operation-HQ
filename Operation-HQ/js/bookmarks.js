// bookmarks.js v5 — uses the shared Classifier (fixed 10-root taxonomy,
// domain-first lookup, learned re-files), live progress, empty-folder
// cleanup, dry-run preview, undo, and a scoped "sort just Inbox" action.

const INBOX_NAME = "Inbox";

const Bookmarks = {
  existingFolders: [],

  async recordAudit(action, details) {
    const { hq_bookmark_audit_v1 } = await chrome.storage.local.get("hq_bookmark_audit_v1");
    const audit = Array.isArray(hq_bookmark_audit_v1) ? hq_bookmark_audit_v1 : [];
    audit.unshift({ at: Date.now(), action, ...details });
    await chrome.storage.local.set({ hq_bookmark_audit_v1: audit.slice(0, 30) });
  },

  log(msg, success = false) {
    const el = document.getElementById("bookmark-log");
    const row = document.createElement("div");
    row.textContent = String(msg);
    if (success) row.classList.add("bookmark-log-done");
    el.prepend(row);
  },

  setProgress(done, total, isDone = false) {
    const bar = document.getElementById("bookmark-progress-fill");
    const label = document.getElementById("bookmark-progress-label");
    if (!bar) return;
    const pct = total ? Math.round((done / total) * 100) : 0;
    bar.style.width = `${pct}%`;
    bar.classList.toggle("done", isDone);
    label.innerHTML = isDone ? `${Icons.span("check")} Complete` : (total ? `${done} / ${total} (${pct}%)` : "");
  },

  async getLearnedMap() {
    const { hq_learned_domains } = await chrome.storage.local.get("hq_learned_domains");
    return hq_learned_domains || {};
  },

  // Only folders nested one level inside a fixed root count as "legit" for
  // matching purposes — never a stray top-level folder (that was the actual
  // bug: old junk folders from an earlier version kept getting reinforced).
  async scanLegitFolders(barId) {
    const rootChildren = await chrome.bookmarks.getChildren(barId);
    const roots = rootChildren.filter(c => !c.url && Classifier.isRoot(c.title));
    const legit = [];
    for (const root of roots) {
      const subs = await chrome.bookmarks.getChildren(root.id);
      subs.filter(s => !s.url).forEach(s => legit.push({ title: s.title, parentTitle: root.title }));
    }
    this.existingFolders = legit;
    return legit;
  },

  async findInboxFolder(barId) {
    const children = await chrome.bookmarks.getChildren(barId);
    return children.find(c => !c.url && c.title === INBOX_NAME) || null;
  },

  async folderPath(parentId, barId) {
    if (!parentId || parentId === barId) return [];
    const path = [];
    let currentId = parentId;
    for (let depth = 0; depth < 12 && currentId && currentId !== barId; depth++) {
      try {
        const [node] = await chrome.bookmarks.get(currentId);
        if (!node) break;
        path.unshift(node.title);
        currentId = node.parentId;
      } catch { break; }
    }
    return path;
  },

  async getAllBookmarks(scopeParentId) {
    const tree = await chrome.bookmarks.getTree();
    const barId = tree[0].children[0].id;
    const nodes = [];
    const walk = (n) => n.forEach(x => {
      if (x.url && (!scopeParentId || x.parentId === scopeParentId)) nodes.push(x);
      if (x.children) walk(x.children);
    });
    walk(tree[0].children);
    return { barId, nodes };
  },

  async computePlan(scopeParentId) {
    const { barId, nodes } = await this.getAllBookmarks(scopeParentId);
    const legitFolders = await this.scanLegitFolders(barId);
    const learnedMap = await this.getLearnedMap();
    const plan = [];
    for (const bm of nodes) {
      if (Classifier.shouldNeverSort(bm.title)) { plan.push({ bm, path: null, keep: true }); continue; }
      const result = Classifier.classify(bm, learnedMap, legitFolders);
      plan.push({ bm, path: result.path, keep: false, confidence: result.confidence, source: result.source, reasons: result.reasons || [], fallback: ["catchall", "needs-content", "ambiguous-content"].includes(result.source) });
    }
    return { barId, plan };
  },

  async preview(scopeParentId) {
    document.getElementById("bookmark-log").innerHTML = "";
    this.setProgress(0, 0);
    this.log("Building preview (nothing will move yet)…");
    const { plan } = await this.computePlan(scopeParentId);
    const grouped = {};
    plan.forEach(p => {
      if (p.keep) return;
      const key = p.path.join(" › ");
      grouped[key] = (grouped[key] || 0) + 1;
    });
    document.getElementById("bookmark-log").innerHTML = "";
    Object.entries(grouped).sort((a, b) => b[1] - a[1]).forEach(([path, count]) => {
      this.log(`${count} → ${path}`);
    });
    const keepCount = plan.filter(p => p.keep).length;
    const review = plan.filter(p => p.fallback);
    this.log(`${keepCount} stay pinned at root.`);
    if (review.length) {
      this.log(`${review.length} uncertain bookmark${review.length === 1 ? "" : "s"} → Review Queue (never guessed).`);
      review.slice(0, 8).forEach(item => this.log(`Review: ${item.bm.title || item.bm.url} · ${item.reasons.join(" vs ") || "insufficient topic evidence"}`));
    }
    this.log("Preview only — click Sort Now to actually apply this.");
  },

  // Same-site clustering is intentionally retired. A platform is not a
  // topic: ten YouTube links may belong to AI, school, design and gaming.
  // Curated topic folders are created by Classifier; no folder is invented
  // merely because a hostname repeats.
  async clusterFolder(folderId, threshold = 3) {
    return 0;
  },

  // Runs clustering across every Tier-1 root and each of its Tier-2
  // subfolders (but never recurses into an already-clustered Tier-3
  // folder — that would just re-shuffle stable groups every run).
  async clusterAll(barId) {
    let total = 0;
    const roots = (await chrome.bookmarks.getChildren(barId)).filter(c => !c.url && Classifier.isRoot(c.title));
    for (const root of roots) {
      total += await this.clusterFolder(root.id);
      const subs = (await chrome.bookmarks.getChildren(root.id)).filter(c => !c.url);
      for (const sub of subs) {
        total += await this.clusterFolder(sub.id);
      }
    }
    return total;
  },

  // --- Content-aware review for ambiguous bookmarks ---
  // Domain/keyword matching only sees the bookmark's saved title + URL,
  // which for a lot of real bookmarks (generic titles, short links) isn't
  // enough context. This actually fetches the page and reads its real
  // <title> and meta description to classify off real content — genuinely
  // reads what the page is about, not just what site it's on. Requires the
  // optional broad host permission, requested here (user gesture) not at
  // install time. It checks Uncategorized plus content-variable platforms
  // such as YouTube and Docs, because their hostname is not their topic.
  async ensureContentPermission() {
    const origins = ["http://*/*", "https://*/*"];
    const has = await chrome.permissions.contains({ origins });
    if (has) return true;
    return chrome.permissions.request({ origins });
  },

  async fetchPageContext(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) return "";
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html.slice(0, 60000), "text/html");
      const title = doc.querySelector("title")?.textContent || "";
      const desc = doc.querySelector('meta[name="description"]')?.getAttribute("content")
        || doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
      const h1 = doc.querySelector("h1")?.textContent || "";
      return [title, desc, h1].join(" ").trim();
    } catch (e) {
      return ""; // timeout, network error, or blocked — just skip enrichment for this one
    } finally {
      clearTimeout(timer);
    }
  },

  async refineUncategorized() {
    return this.withBulkFlag(async () => {
    const granted = await this.ensureContentPermission();
    if (!granted) {
      this.log("Permission declined — content-based refinement needs access to read the pages you've bookmarked. Nothing was changed.");
      return;
    }

    const { barId, nodes } = await this.getAllBookmarks();
    const tree = await chrome.bookmarks.getSubTree(barId);
    const uncategorizedParents = new Set();
    const collectUncategorized = (items) => items.forEach(item => {
      if (!item.url && ["Uncategorized", "Review Queue"].includes(item.title)) uncategorizedParents.add(item.id);
      if (item.children) collectUncategorized(item.children);
    });
    collectUncategorized(tree);
    const bookmarks = nodes.filter(bm => Classifier.isContentVariesDomain(Classifier.domainOf(bm.url)) || uncategorizedParents.has(bm.parentId));
    if (!bookmarks.length) { this.log("No ambiguous or multi-topic bookmarks need a deep review."); return; }

    document.getElementById("bookmark-log").innerHTML = "";
    this.log(`Reading ${bookmarks.length} page(s) for real context — this is slower than a normal sort…`);
    this.setProgress(0, bookmarks.length);

    const learnedMap = await this.getLearnedMap();
    const legitFolders = await this.scanLegitFolders(barId);
    let moved = 0, i = 0;
    const undoLog = [];

    for (const bm of bookmarks) {
      const context = await this.fetchPageContext(bm.url);
      if (context) {
        const enriched = { title: `${bm.title} ${context}`, url: bm.url };
        const result = Classifier.classify(enriched, learnedMap, legitFolders);
        if (result.path && !["catchall", "needs-content", "ambiguous-content"].includes(result.source)) {
          const targetParent = await this.getOrCreateFolderPath(result.path, barId);
          if (bm.parentId !== targetParent) {
            undoLog.push({ id: bm.id, fromParentId: bm.parentId, fromPath: await this.folderPath(bm.parentId, barId) });
            await chrome.bookmarks.move(bm.id, { parentId: targetParent });
            moved++;
          }
        }
      }
      i++;
      this.setProgress(i, bookmarks.length);
    }

    await chrome.storage.local.set({ hq_bookmark_undo: undoLog });
    await this.recordAudit("deep-topic-review", { reviewed: bookmarks.length, moved, undoable: undoLog.length });
    document.getElementById("undo-bookmarks-btn").disabled = undoLog.length === 0;
    const removed = await this.cleanupEmptyFolders(barId);
    document.getElementById("bookmark-log").innerHTML = "";
    this.log(`Done. Read ${bookmarks.length} page(s), reclassified ${moved} using actual page content, removed ${removed} empty folder(s). ${bookmarks.length - moved} stayed in Review Queue because their topic was still not clear enough.`, true);
    this.setProgress(bookmarks.length, bookmarks.length, true);
    });
  },

  async getOrCreateFolderPath(pathArr, barId) {
    let parentId = barId;
    for (const name of pathArr) {
      const children = await chrome.bookmarks.getChildren(parentId);
      const existing = children.find(c => !c.url && c.title.toLowerCase() === name.toLowerCase());
      if (existing) parentId = existing.id;
      else {
        const created = await chrome.bookmarks.create({ parentId, title: name });
        parentId = created.id;
      }
    }
    return parentId;
  },

  async cleanupEmptyFolders(barId) {
    let removedTotal = 0;
    let changed = true;
    while (changed) {
      changed = false;
      const tree = await chrome.bookmarks.getSubTree(barId);
      const folders = [];
      const walk = (nodes) => nodes.forEach(n => {
        if (!n.url && n.id !== barId && n.title !== INBOX_NAME) folders.push(n);
        if (n.children) walk(n.children);
      });
      walk(tree[0].children);
      for (const f of folders) {
        if (!f.children || f.children.length === 0) {
          await chrome.bookmarks.removeTree(f.id);
          removedTotal++;
          changed = true;
        }
      }
    }
    return removedTotal;
  },

  // Wrapped around any move we trigger ourselves, so background.js's
  // "learn from manual re-files" listener knows to ignore it.
  async withBulkFlag(fn) {
    await chrome.storage.local.set({ hq_bulk_sort_active: true });
    try { return await fn(); }
    finally { await chrome.storage.local.set({ hq_bulk_sort_active: false }); }
  },

  // One-time migration: earlier versions created root folders with emoji
  // prefixes (e.g. "💻 Coding & Dev"). Since folder matching is exact-title,
  // renaming in place avoids ending up with both an old emoji folder and a
  // new plain one side by side.
  async migrateEmojiRootNames(barId) {
    const EMOJI_MAP = {
      "💻 Coding & Dev": "Coding & Dev",
      "🎨 Design & Inspiration": "Design & Inspiration",
      "🎓 School & Academics": "School & Academics",
      "💼 Business & Ventures": "Business & Ventures",
      "🎮 Gaming & Roblox Dev": "Gaming & Roblox Dev",
      "📚 Reading & Articles": "Reading & Articles",
      "🎵 Entertainment": "Entertainment",
      "💰 Finance & Shopping": "Finance & Shopping",
      "🌐 Social & Communication": "Social & Communication",
      "🧰 Utilities & Misc": "Utilities & Misc",
    };
    const children = await chrome.bookmarks.getChildren(barId);
    for (const c of children) {
      if (!c.url && EMOJI_MAP[c.title]) {
        const target = EMOJI_MAP[c.title];
        const clash = children.find(x => !x.url && x.title === target);
        if (clash) {
          // both exist — merge: move everything from the emoji one into the plain one, then delete the empty shell
          const subChildren = await chrome.bookmarks.getChildren(c.id);
          for (const sc of subChildren) await chrome.bookmarks.move(sc.id, { parentId: clash.id });
        } else {
          await chrome.bookmarks.update(c.id, { title: target });
        }
      }
    }
  },

  async sortAll(scopeParentId) {
    return this.withBulkFlag(async () => {
      document.getElementById("bookmark-log").innerHTML = "";
      this.setProgress(0, 1);
      this.log("Sorting…");
      const { barId } = await this.getAllBookmarks();
      await this.migrateEmojiRootNames(barId);
      const { plan } = await this.computePlan(scopeParentId);
      const total = plan.length || 1;

      const undoLog = [];
      let moved = 0, kept = 0, fallback = 0, i = 0;

      for (const { bm, path, keep, fallback: isFallback } of plan) {
        const targetParent = keep ? barId : await this.getOrCreateFolderPath(path, barId);
        if (bm.parentId !== targetParent) {
          undoLog.push({ id: bm.id, fromParentId: bm.parentId, fromPath: await this.folderPath(bm.parentId, barId) });
          await chrome.bookmarks.move(bm.id, { parentId: targetParent });
          if (keep) kept++; else moved++;
        } else if (keep) {
          kept++;
        }
        if (isFallback) fallback++;
        i++;
        this.setProgress(i, total);
      }

      await chrome.storage.local.set({ hq_bookmark_undo: undoLog });
      await this.recordAudit("sort", { scope: scopeParentId ? "inbox" : "all", reviewed: plan.length, moved, fallback, undoable: undoLog.length });
      document.getElementById("undo-bookmarks-btn").disabled = undoLog.length === 0;

      this.log("Cleaning up empty folders…");
      const removed = await this.cleanupEmptyFolders(barId);

      document.getElementById("bookmark-log").innerHTML = "";
      this.log(`Done. Moved ${moved}, kept ${kept} pinned at root, ${fallback} need deeper content review, removed ${removed} empty folder(s). No platform-only folders were created.`, true);
      this.setProgress(total, total, true);
      this.setProgress(total, total);
      await this.refreshInboxCount();
    });
  },

  async sortInboxOnly() {
    const { barId } = await this.getAllBookmarks();
    const inbox = await this.findInboxFolder(barId);
    if (!inbox) { this.log("No Inbox folder found — nothing to sort."); return; }
    await this.sortAll(inbox.id);
  },

  async undo() {
    return this.withBulkFlag(async () => {
      const { hq_bookmark_undo } = await chrome.storage.local.get("hq_bookmark_undo");
      const undoLog = hq_bookmark_undo || [];
      if (!undoLog.length) return;
      const { barId } = await this.getAllBookmarks();
      this.log(`Reverting ${undoLog.length} move(s)…`);
      for (const { id, fromParentId, fromPath = [] } of undoLog) {
        try { await chrome.bookmarks.move(id, { parentId: fromParentId }); }
        catch (e) {
          // Cleanup may have removed an emptied source folder. Recreate its
          // exact saved hierarchy instead of silently skipping the restore.
          try {
            const restoredParent = await this.getOrCreateFolderPath(fromPath, barId);
            await chrome.bookmarks.move(id, { parentId: restoredParent });
          } catch { /* the bookmark itself may have been deleted since */ }
        }
      }
      await chrome.storage.local.set({ hq_bookmark_undo: [] });
      await this.recordAudit("undo", { restored: undoLog.length });
      document.getElementById("undo-bookmarks-btn").disabled = true;
      this.log("Undo complete.");
      await this.refreshInboxCount();
    });
  },

  async refreshInboxCount() {
    const { barId } = await this.getAllBookmarks();
    const inbox = await this.findInboxFolder(barId);
    const el = document.getElementById("inbox-count");
    if (!el) return;
    if (!inbox) { el.textContent = "No Inbox folder yet — create one and drop new bookmarks in it."; return; }
    const children = await chrome.bookmarks.getChildren(inbox.id);
    const count = children.filter(c => c.url).length;
    el.textContent = `${count} bookmark(s) waiting in Inbox`;
  },

  async peekSummary() {
    const { hq_bookmark_undo } = await chrome.storage.local.get("hq_bookmark_undo");
    const n = (hq_bookmark_undo || []).length;
    return n ? `Last sort moved ${n}` : "No sort run yet";
  },

  async init() {
    const { hq_bookmark_undo } = await chrome.storage.local.get("hq_bookmark_undo");
    document.getElementById("undo-bookmarks-btn").disabled = !(hq_bookmark_undo && hq_bookmark_undo.length);
    await this.refreshInboxCount();
  }
};
