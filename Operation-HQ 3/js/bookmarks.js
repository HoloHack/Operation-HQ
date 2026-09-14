// bookmarks.js v6 — deterministic topic sorting with a guarded mutation
// layer. Classification is automatic where evidence is strong; uncertain
// items stay visible in the Review Board instead of being guessed.
// Same-site clustering is intentionally retired: a platform is not a topic.

const INBOX_NAME = "Inbox";

const Bookmarks = {
  MANAGED_KEY: "hq_bookmark_managed_folders_v2",
  UNDO_KEY: "hq_bookmark_undo_v2",
  existingFolders: [],
  reviewItems: [],
  busy: false,
  activeOperation: "",
  operationToken: "",

  el(id) { return typeof document === "undefined" ? null : document.getElementById(id); },

  async recordAudit(action, details) {
    const { hq_bookmark_audit_v1 } = await chrome.storage.local.get("hq_bookmark_audit_v1");
    const audit = Array.isArray(hq_bookmark_audit_v1) ? hq_bookmark_audit_v1 : [];
    audit.unshift({ at: Date.now(), action, ...details });
    await chrome.storage.local.set({ hq_bookmark_audit_v1: audit.slice(0, 40) });
  },

  log(msg, success = false) {
    const el = this.el("bookmark-log");
    if (!el) return;
    const row = document.createElement("div");
    row.textContent = String(msg);
    if (success) row.classList.add("bookmark-log-done");
    el.prepend(row);
  },

  clearLog() {
    const el = this.el("bookmark-log");
    if (el) el.replaceChildren();
  },

  setProgress(done, total, isDone = false) {
    const bar = this.el("bookmark-progress-fill");
    const label = this.el("bookmark-progress-label");
    if (!bar || !label) return;
    const pct = total ? Math.round((done / total) * 100) : 0;
    bar.style.width = `${pct}%`;
    bar.classList.toggle("done", isDone);
    label.textContent = isDone ? "Complete" : (total ? `${done} / ${total} (${pct}%)` : "");
  },

  setBusy(busy, label = "") {
    this.busy = busy;
    this.activeOperation = busy ? label : "";
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-bookmark-operation]").forEach(button => {
      button.disabled = busy || (button.id === "undo-bookmarks-btn" && button.dataset.hasUndo !== "true");
      button.setAttribute("aria-busy", busy ? "true" : "false");
    });
    const status = this.el("bookmark-operation-state");
    if (status) status.textContent = busy ? `${label} in progress…` : "Ready";
  },

  async runExclusive(label, operation) {
    if (this.busy) {
      this.log(`${this.activeOperation || "Another bookmark operation"} is already running. No second operation was started.`);
      return { blocked: true };
    }
    this.setBusy(true, label);
    this.operationToken = crypto.randomUUID();
    let ownsGlobalLock = false;
    let ownsBulkFlag = false;
    try {
      if (chrome.runtime?.sendMessage) {
        try {
          const response = await chrome.runtime.sendMessage({ type: "hq:bookmarks:lock", action: "acquire", token: this.operationToken, label });
          if (response && response.granted === false) {
            this.log(`${response.label || "Another bookmark operation"} is running in a different new tab. Nothing was changed.`);
            return { blocked: true };
          }
          ownsGlobalLock = response?.granted === true;
        } catch { /* local lock remains a safe fallback during service-worker restart */ }
      }
      await chrome.storage.local.set({ hq_bulk_sort_active: { token: this.operationToken, expiresAt: Date.now() + 120000 } });
      ownsBulkFlag = true;
      return await operation();
    } catch (error) {
      this.log(`${label} stopped safely: ${String(error?.message || error)}`);
      await this.recordAudit("operation-error", { label, message: String(error?.message || error).slice(0, 400) });
      return { error: true };
    } finally {
      if (ownsBulkFlag) {
        const active = await chrome.storage.local.get("hq_bulk_sort_active");
        if (active.hq_bulk_sort_active?.token === this.operationToken) await chrome.storage.local.set({ hq_bulk_sort_active: false });
      }
      if (ownsGlobalLock) {
        try { await chrome.runtime.sendMessage({ type: "hq:bookmarks:lock", action: "release", token: this.operationToken }); }
        catch { /* an expired/restarted worker has no lock left to release */ }
      }
      this.operationToken = "";
      this.setBusy(false);
      await this.updateUndoButton();
    }
  },

  async getLearnedMap() {
    const { hq_learned_domains } = await chrome.storage.local.get("hq_learned_domains");
    return hq_learned_domains && typeof hq_learned_domains === "object" ? hq_learned_domains : {};
  },

  async scanLegitFolders(barId) {
    const roots = (await chrome.bookmarks.getChildren(barId)).filter(node => !node.url && Classifier.isRoot(node.title));
    const legit = [];
    for (const root of roots) {
      const children = await chrome.bookmarks.getChildren(root.id);
      children.filter(node => !node.url && Classifier.isManagedPath([root.title, node.title], { allowOperational: false }))
        .forEach(node => legit.push({ title: node.title, parentTitle: root.title }));
    }
    this.existingFolders = legit;
    return legit;
  },

  async findInboxFolder(barId) {
    return (await chrome.bookmarks.getChildren(barId)).find(node => !node.url && node.title === INBOX_NAME) || null;
  },

  async folderPath(parentId, barId) {
    if (!parentId || parentId === barId) return [];
    const path = [];
    let currentId = parentId;
    for (let depth = 0; depth < 12 && currentId && currentId !== barId; depth += 1) {
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
    // A full sort owns the Bookmark Bar only. Chrome's Other Bookmarks and
    // mobile roots remain exactly where the user placed them.
    const roots = scopeParentId ? await chrome.bookmarks.getSubTree(scopeParentId) : [tree[0].children[0]];
    const nodes = [];
    const walk = items => (items || []).forEach(node => {
      if (node.url) nodes.push(node);
      if (node.children) walk(node.children);
    });
    walk(roots);
    return { barId, nodes };
  },

  async computePlan(scopeParentId) {
    const { barId, nodes } = await this.getAllBookmarks(scopeParentId);
    const legitFolders = await this.scanLegitFolders(barId);
    const learnedMap = await this.getLearnedMap();
    const plan = nodes.map(bm => {
      if (Classifier.shouldNeverSort(bm.title)) return { bm, path: null, keep: true, fallback: false };
      const result = Classifier.classify(bm, learnedMap, legitFolders);
      const path = Classifier.normalizePath(result.path) || ["Utilities & Misc", "Review Queue"];
      return {
        bm, path, keep: false, confidence: result.confidence, source: result.source,
        reasons: result.reasons || [],
        fallback: ["catchall", "needs-content", "ambiguous-content"].includes(result.source),
      };
    });
    return { barId, plan };
  },

  destinationOptions(select) {
    for (const root of Classifier.ROOTS) {
      const group = document.createElement("optgroup");
      group.label = root;
      const rootOption = document.createElement("option");
      rootOption.value = JSON.stringify([root]);
      rootOption.textContent = `${root} · general`;
      group.append(rootOption);
      for (const sub of Classifier.MANAGED_SUBFOLDERS[root] || []) {
        if (sub === "Review Queue") continue;
        const option = document.createElement("option");
        option.value = JSON.stringify([root, sub]);
        option.textContent = sub;
        group.append(option);
      }
      select.append(group);
    }
  },

  renderReviewBoard(items = this.reviewItems) {
    const board = this.el("bookmark-review-board");
    const list = this.el("bookmark-review-list");
    const count = this.el("bookmark-review-count");
    if (!board || !list || !count) return;
    this.reviewItems = items.slice(0, 60);
    count.textContent = String(items.length);
    board.classList.toggle("hidden", items.length === 0);
    list.replaceChildren();
    this.reviewItems.forEach(item => {
      const row = document.createElement("article");
      row.className = "bookmark-review-row";
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.bm.title || item.bm.url;
      const meta = document.createElement("span");
      meta.textContent = `${Classifier.domainOf(item.bm.url)} · ${item.reasons.join(" / ") || "topic not clear enough"}`;
      copy.append(title, meta);
      const controls = document.createElement("div");
      controls.className = "bookmark-review-controls";
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Category for ${title.textContent}`);
      const prompt = document.createElement("option");
      prompt.value = "";
      prompt.textContent = "Choose topic…";
      select.append(prompt);
      this.destinationOptions(select);
      const move = document.createElement("button");
      move.type = "button";
      move.textContent = "File + learn";
      move.disabled = true;
      select.onchange = () => { move.disabled = !select.value || this.busy; };
      move.onclick = () => {
        let path;
        try { path = JSON.parse(select.value); } catch { return; }
        this.applyCorrection(item.bm.id, path);
      };
      controls.append(select, move);
      row.append(copy, controls);
      list.append(row);
    });
  },

  async preview(scopeParentId) {
    return this.runExclusive("Preview", async () => {
      this.clearLog();
      this.setProgress(0, 0);
      this.log("Building a non-destructive preview…");
      const { plan } = await this.computePlan(scopeParentId);
      const grouped = {};
      plan.forEach(item => {
        if (!item.keep) grouped[item.path.join(" › ")] = (grouped[item.path.join(" › ")] || 0) + 1;
      });
      this.clearLog();
      Object.entries(grouped).sort((a, b) => b[1] - a[1]).forEach(([path, count]) => this.log(`${count} → ${path}`));
      const uncertain = plan.filter(item => item.fallback);
      this.renderReviewBoard(uncertain);
      this.log(`${plan.filter(item => item.keep).length} stay pinned at root.`);
      this.log(uncertain.length
        ? `${uncertain.length} uncertain item${uncertain.length === 1 ? "" : "s"} are waiting in the Review Board—none were guessed.`
        : "Every bookmark has a confident destination.", !uncertain.length);
      this.log("Preview only. Nothing moved.");
      await this.recordAudit("preview", { reviewed: plan.length, uncertain: uncertain.length });
    });
  },

  async ensureContentPermission() {
    const origins = ["http://*/*", "https://*/*"];
    return await chrome.permissions.contains({ origins }) || chrome.permissions.request({ origins });
  },

  async fetchPageContext(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
      if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return "";
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html.slice(0, 90000), "text/html");
      return [
        doc.querySelector("title")?.textContent || "",
        doc.querySelector('meta[name="description"]')?.getAttribute("content") || doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || "",
        doc.querySelector("h1")?.textContent || "",
      ].join(" ").replace(/\s+/g, " ").trim().slice(0, 3000);
    } catch { return ""; }
    finally { clearTimeout(timer); }
  },

  async collectReviewBookmarks(barId, allBookmarks) {
    const [root] = await chrome.bookmarks.getSubTree(barId);
    const reviewDescendants = new Set();
    const walk = (items, insideReview = false) => (items || []).forEach(node => {
      const nextInside = insideReview || (!node.url && ["Uncategorized", "Review Queue"].includes(node.title));
      if (nextInside && node.url) reviewDescendants.add(node.id);
      if (node.children) walk(node.children, nextInside);
    });
    walk(root?.children);
    return allBookmarks.filter(bm => reviewDescendants.has(bm.id) || Classifier.isContentVariesDomain(Classifier.domainOf(bm.url)));
  },

  async refineUncategorized() {
    return this.runExclusive("Deep topic review", async () => {
      if (!(await this.ensureContentPermission())) {
        this.log("Page-reading permission was declined. Nothing changed; Preview and the Review Board still work.");
        return;
      }
      const { barId, nodes } = await this.getAllBookmarks();
      const bookmarks = await this.collectReviewBookmarks(barId, nodes);
      if (!bookmarks.length) { this.log("No ambiguous bookmarks need a deep review.", true); return; }
      this.clearLog();
      this.log(`Reading real page titles and descriptions for ${bookmarks.length} bookmark(s)…`);
      this.setProgress(0, bookmarks.length);
      const learnedMap = await this.getLearnedMap();
      const legitFolders = await this.scanLegitFolders(barId);
      const moves = [];
      const stillUncertain = [];
      let reviewed = 0;
      for (let start = 0; start < bookmarks.length; start += 4) {
        const batch = bookmarks.slice(start, start + 4);
        const contexts = await Promise.all(batch.map(bm => this.fetchPageContext(bm.url)));
        for (let index = 0; index < batch.length; index += 1) {
          const bm = batch[index];
          const context = contexts[index];
          const result = context ? Classifier.classify({ title: `${bm.title} ${context}`, url: bm.url }, learnedMap, legitFolders) : { source: "needs-content", reasons: ["page could not be read"] };
          if (result.path && !["catchall", "needs-content", "ambiguous-content"].includes(result.source)) {
            const targetParent = await this.getOrCreateFolderPath(result.path, barId);
            await this.moveAndRecord(bm, targetParent, result.path, barId, moves);
          } else {
            stillUncertain.push({ bm, reasons: result.reasons || ["topic remains ambiguous"], fallback: true });
          }
          reviewed += 1;
          this.setProgress(reviewed, bookmarks.length);
        }
      }
      await this.commitTransaction("deep-topic-review", moves);
      const removed = await this.cleanupManagedEmptyFolders(barId);
      this.renderReviewBoard(stillUncertain);
      await this.recordAudit("deep-topic-review", { reviewed, moved: moves.length, uncertain: stillUncertain.length, removed });
      this.clearLog();
      this.log(`Deep review complete: ${moves.length} filed, ${stillUncertain.length} need one clear choice, ${removed} unused HQ folder(s) removed.`, true);
      this.setProgress(reviewed, bookmarks.length, true);
      await this.refreshInboxCount();
    });
  },

  async readManagedRegistry() {
    const saved = await chrome.storage.local.get(this.MANAGED_KEY);
    return Array.isArray(saved[this.MANAGED_KEY]) ? saved[this.MANAGED_KEY] : [];
  },

  async registerManagedFolder(node, path) {
    const registry = await this.readManagedRegistry();
    const entry = { id: node.id, parentId: node.parentId, title: node.title, path: [...path], createdAt: Date.now() };
    const next = [...registry.filter(item => item.id !== node.id), entry].slice(-120);
    await chrome.storage.local.set({ [this.MANAGED_KEY]: next });
  },

  async getOrCreateFolderPath(pathArr, barId) {
    const path = Classifier.normalizePath(pathArr);
    if (!path) throw new Error("Blocked an invalid bookmark destination.");
    let parentId = barId;
    for (let index = 0; index < path.length; index += 1) {
      const name = path[index];
      const existing = (await chrome.bookmarks.getChildren(parentId)).find(node => !node.url && node.title.toLowerCase() === name.toLowerCase());
      if (existing) parentId = existing.id;
      else {
        const created = await chrome.bookmarks.create({ parentId, title: name });
        parentId = created.id;
        await this.registerManagedFolder(created, path.slice(0, index + 1));
      }
    }
    return parentId;
  },

  async getOrCreateInbox(barId) {
    const existing = await this.findInboxFolder(barId);
    if (existing) return existing.id;
    return (await chrome.bookmarks.create({ parentId: barId, title: INBOX_NAME })).id;
  },

  async cleanupManagedEmptyFolders(barId) {
    let registry = await this.readManagedRegistry();
    let removed = 0;
    let changed = true;
    while (changed) {
      changed = false;
      const ordered = [...registry].sort((a, b) => (b.path?.length || 0) - (a.path?.length || 0));
      for (const entry of ordered) {
        try {
          const [node] = await chrome.bookmarks.get(entry.id);
          if (!node || node.url) { registry = registry.filter(item => item.id !== entry.id); continue; }
          const actualPath = await this.folderPath(node.id, barId);
          const valid = Classifier.isManagedPath(actualPath) && JSON.stringify(actualPath) === JSON.stringify(entry.path);
          if (!valid) { registry = registry.filter(item => item.id !== entry.id); continue; }
          if ((await chrome.bookmarks.getChildren(node.id)).length === 0) {
            await chrome.bookmarks.remove(node.id);
            registry = registry.filter(item => item.id !== entry.id);
            removed += 1;
            changed = true;
          }
        } catch { registry = registry.filter(item => item.id !== entry.id); }
      }
    }
    await chrome.storage.local.set({ [this.MANAGED_KEY]: registry });
    return removed;
  },

  async moveAndRecord(bm, targetParentId, targetPath, barId, moves) {
    if (bm.parentId === targetParentId) return false;
    const inverse = { id: bm.id, fromParentId: bm.parentId, fromPath: await this.folderPath(bm.parentId, barId), toParentId: targetParentId, toPath: [...targetPath] };
    await chrome.bookmarks.move(bm.id, { parentId: targetParentId });
    moves.push(inverse); // only successful mutations are undoable
    return true;
  },

  async readUndoStack() {
    const saved = await chrome.storage.local.get([this.UNDO_KEY, "hq_bookmark_undo"]);
    if (Array.isArray(saved[this.UNDO_KEY])) return saved[this.UNDO_KEY];
    if (Array.isArray(saved.hq_bookmark_undo) && saved.hq_bookmark_undo.length) return [{ id: `legacy-${Date.now()}`, kind: "legacy-sort", createdAt: Date.now(), moves: saved.hq_bookmark_undo }];
    return [];
  },

  async commitTransaction(kind, moves) {
    if (!moves.length) return null;
    const stack = await this.readUndoStack();
    const transaction = { id: crypto.randomUUID(), kind, createdAt: Date.now(), moves };
    await chrome.storage.local.set({ [this.UNDO_KEY]: [...stack, transaction].slice(-8), hq_bookmark_undo: [] });
    return transaction;
  },

  async updateUndoButton() {
    const button = this.el("undo-bookmarks-btn");
    if (!button) return;
    const stack = await this.readUndoStack();
    button.dataset.hasUndo = stack.length ? "true" : "false";
    button.disabled = this.busy || !stack.length;
    button.textContent = stack.length ? `Undo ${stack[stack.length - 1].kind.replace(/-/g, " ")}` : "Nothing to undo";
  },

  async migrateEmojiRootNames(barId) {
    const names = { "💻 Coding & Dev": "Coding & Dev", "🎨 Design & Inspiration": "Design & Inspiration", "🎓 School & Academics": "School & Academics", "💼 Business & Ventures": "Business & Ventures", "🎮 Gaming & Roblox Dev": "Gaming & Roblox Dev", "📚 Reading & Articles": "Reading & Articles", "🎵 Entertainment": "Entertainment", "💰 Finance & Shopping": "Finance & Shopping", "🌐 Social & Communication": "Social & Communication", "🧰 Utilities & Misc": "Utilities & Misc" };
    const children = await chrome.bookmarks.getChildren(barId);
    for (const node of children) {
      if (!node.url && names[node.title]) {
        const targetName = names[node.title];
        const target = children.find(candidate => !candidate.url && candidate.title === targetName);
        if (target) for (const child of await chrome.bookmarks.getChildren(node.id)) await chrome.bookmarks.move(child.id, { parentId: target.id });
        else await chrome.bookmarks.update(node.id, { title: targetName });
      }
    }
  },

  async sortAll(scopeParentId) {
    return this.runExclusive(scopeParentId ? "Inbox sort" : "Full sort", () => this.applySort(scopeParentId));
  },

  async applySort(scopeParentId) {
    this.clearLog();
    this.setProgress(0, 1);
    this.log("Analysing titles, URLs, known services and learned corrections…");
    const { barId } = await this.getAllBookmarks();
    await this.migrateEmojiRootNames(barId);
    const { plan } = await this.computePlan(scopeParentId);
    const total = plan.length || 1;
    const moves = [];
    const uncertain = [];
    let kept = 0;
    let failed = 0;
    for (let index = 0; index < plan.length; index += 1) {
      const item = plan[index];
      try {
        const targetParent = item.keep ? barId : await this.getOrCreateFolderPath(item.path, barId);
        await this.moveAndRecord(item.bm, targetParent, item.keep ? [] : item.path, barId, moves);
        if (item.keep) kept += 1;
        if (item.fallback) uncertain.push(item);
      } catch (error) {
        failed += 1;
        this.log(`Could not move “${item.bm.title || item.bm.url}”: ${String(error?.message || error)}`);
      }
      this.setProgress(index + 1, total);
    }
    await this.commitTransaction(scopeParentId ? "inbox-sort" : "full-sort", moves);
    const removed = await this.cleanupManagedEmptyFolders(barId);
    this.renderReviewBoard(uncertain);
    await this.recordAudit("sort", { scope: scopeParentId ? "inbox" : "all", reviewed: plan.length, moved: moves.length, uncertain: uncertain.length, failed, removed });
    this.clearLog();
    this.log(`Complete: ${moves.length} moved, ${kept} pinned, ${uncertain.length} need one review choice, ${failed} failed, ${removed} unused HQ folder(s) removed.`, failed === 0);
    if (uncertain.length) this.log("Use the Review Board below for uncertain links. Your choice becomes an exact learned rule for that site path.");
    this.setProgress(total, total, true);
    await this.refreshInboxCount();
  },

  async sortInboxOnly() {
    if (this.busy) return this.runExclusive("Inbox sort", async () => {});
    const { barId } = await this.getAllBookmarks();
    const inbox = await this.findInboxFolder(barId);
    if (!inbox) { this.log("No Inbox folder exists, so there is nothing to sort."); return; }
    return this.sortAll(inbox.id);
  },

  async applyCorrection(bookmarkId, pathArr) {
    return this.runExclusive("Review correction", async () => {
      const path = Classifier.normalizePath(pathArr, { allowOperational: false });
      if (!path) throw new Error("That destination is outside the managed taxonomy.");
      const { barId } = await this.getAllBookmarks();
      const [bm] = await chrome.bookmarks.get(bookmarkId);
      if (!bm?.url) throw new Error("That bookmark no longer exists.");
      const targetParent = await this.getOrCreateFolderPath(path, barId);
      const moves = [];
      await this.moveAndRecord(bm, targetParent, path, barId, moves);
      const learned = await this.getLearnedMap();
      learned[Classifier.fingerprint(bm)] = path;
      await chrome.storage.local.set({ hq_learned_domains: learned });
      await this.commitTransaction("review-correction", moves);
      this.reviewItems = this.reviewItems.filter(item => item.bm.id !== bookmarkId);
      this.renderReviewBoard(this.reviewItems);
      await this.recordAudit("review-correction", { bookmarkId, path, moved: moves.length });
      this.log(`Filed and learned: ${bm.title || bm.url} → ${path.join(" › ")}`, true);
      await this.refreshInboxCount();
    });
  },

  async undo() {
    return this.runExclusive("Undo", async () => {
      const stack = await this.readUndoStack();
      const transaction = stack.pop();
      if (!transaction?.moves?.length) { this.log("There is no bookmark operation to undo."); return; }
      const { barId } = await this.getAllBookmarks();
      let restored = 0;
      let skipped = 0;
      for (const move of [...transaction.moves].reverse()) {
        try {
          const [bm] = await chrome.bookmarks.get(move.id);
          if (!bm || (move.toParentId && bm.parentId !== move.toParentId)) { skipped += 1; continue; }
          let targetId = move.fromParentId;
          try { await chrome.bookmarks.get(targetId); }
          catch {
            if (move.fromPath?.length === 1 && move.fromPath[0] === INBOX_NAME) targetId = await this.getOrCreateInbox(barId);
            else if (Classifier.isManagedPath(move.fromPath)) targetId = await this.getOrCreateFolderPath(move.fromPath, barId);
            else { skipped += 1; continue; }
          }
          await chrome.bookmarks.move(move.id, { parentId: targetId });
          restored += 1;
        } catch { skipped += 1; }
      }
      await chrome.storage.local.set({ [this.UNDO_KEY]: stack, hq_bookmark_undo: [] });
      const removed = await this.cleanupManagedEmptyFolders(barId);
      await this.recordAudit("undo", { transactionId: transaction.id, restored, skipped, removed });
      this.log(`Undo complete: ${restored} restored${skipped ? `, ${skipped} left untouched because they changed later` : ""}.`, true);
      await this.refreshInboxCount();
    });
  },

  async refreshInboxCount() {
    const { barId } = await this.getAllBookmarks();
    const inbox = await this.findInboxFolder(barId);
    const el = this.el("inbox-count");
    if (!el) return;
    if (!inbox) { el.textContent = "Inbox is clear—new uncertain bookmarks will be held here safely."; return; }
    const { nodes } = await this.getAllBookmarks(inbox.id);
    el.textContent = `${nodes.length} bookmark${nodes.length === 1 ? "" : "s"} waiting in Inbox`;
  },

  async peekSummary() {
    const stack = await this.readUndoStack();
    return stack.length ? `Undo available: ${stack[stack.length - 1].kind.replace(/-/g, " ")}` : "No sort run yet";
  },

  async init() {
    await this.updateUndoButton();
    await this.refreshInboxCount();
    this.setBusy(false);
  },
};
