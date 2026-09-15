// bookmarks.js v7 — evidence-first topic sorting with a guarded mutation
// layer. Classification is automatic only where evidence is strong. An
// unresolved bookmark never gets moved to a fake catch-all folder: it stays
// in place until page evidence or the owner's explicit choice resolves it.
// Same-site clustering is intentionally retired: a platform is not a topic.

const INBOX_NAME = "Inbox";

const Bookmarks = {
  MANAGED_KEY: "hq_bookmark_managed_folders_v2",
  UNDO_KEY: "hq_bookmark_undo_v2",
  DECISIONS_KEY: "hq_bookmark_decisions_v1",
  existingFolders: [],
  decisionItems: [],
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
    document.querySelectorAll("[data-bookmark-review-action]").forEach(button => {
      if (button.id === "bookmark-complete-decisions") {
        button.disabled = busy || ![...document.querySelectorAll("#bookmark-review-list select")].some(select => select.value);
      } else {
        button.disabled = busy || !button.closest(".bookmark-review-controls")?.querySelector("select")?.value;
      }
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
    const walk = (items, path = []) => (items || []).forEach(node => {
      if (node.url) nodes.push({ ...node, sourcePath:[...path] });
      if (node.children) walk(node.children, [...path, node.title].filter(Boolean));
    });
    for (const root of roots) {
      if (root.url) {
        nodes.push({ ...root, sourcePath:await this.folderPath(root.parentId, barId) });
      } else {
        const rootPath = root.id === barId ? [] : await this.folderPath(root.id, barId);
        walk(root.children, rootPath);
      }
    }
    return { barId, nodes };
  },

  async computePlan(scopeParentId) {
    const { barId, nodes } = await this.getAllBookmarks(scopeParentId);
    const legitFolders = await this.scanLegitFolders(barId);
    const learnedMap = await this.getLearnedMap();
    const plan = nodes.map(bm => {
      if (Classifier.shouldNeverSort(bm.title)) return { bm, path: null, keep: true, needsDecision: false };
      const result = Classifier.classify(bm, learnedMap, legitFolders);
      const path = Classifier.normalizePath(result.path, { allowOperational:false });
      const needsDecision = !path || result.confidence !== "high";
      return {
        bm, path:needsDecision ? null : path, suggestedPath:path, keep:false, needsDecision,
        confidence: result.confidence, source: result.source,
        reasons: result.reasons || [],
        candidates:result.candidates || [],
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
        const option = document.createElement("option");
        option.value = JSON.stringify([root, sub]);
        option.textContent = sub;
        group.append(option);
      }
      select.append(group);
    }
  },

  serializeDecision(item) {
    return {
      bm:{ id:String(item.bm.id), title:String(item.bm.title || "").slice(0,500), url:String(item.bm.url || "").slice(0,3000), parentId:String(item.bm.parentId || ""), sourcePath:Array.isArray(item.bm.sourcePath) ? item.bm.sourcePath.slice(0,12) : [] },
      context:String(item.context || "").slice(0,3000),
      reasons:(item.reasons || []).map(String).slice(0,6),
      suggestedPath:Classifier.normalizePath(item.suggestedPath, { allowOperational:false }),
      candidates:(item.candidates || []).map(candidate => ({ path:Classifier.normalizePath(candidate.path, { allowOperational:false }), score:Number(candidate.score) || 0, reasons:(candidate.reasons || []).map(String).slice(0,3) })).filter(candidate => candidate.path).slice(0,3),
      createdAt:Number(item.createdAt) || Date.now(),
    };
  },

  async persistDecisions(items = this.decisionItems) {
    const byId = new Map();
    items.forEach(item => {
      if (item?.bm?.id && item?.bm?.url) byId.set(String(item.bm.id), this.serializeDecision(item));
    });
    this.decisionItems = [...byId.values()].slice(-250);
    await chrome.storage.local.set({ [this.DECISIONS_KEY]:this.decisionItems });
    return this.decisionItems;
  },

  async restoreDecisions() {
    const saved = await chrome.storage.local.get(this.DECISIONS_KEY);
    const raw = Array.isArray(saved[this.DECISIONS_KEY]) ? saved[this.DECISIONS_KEY] : [];
    const current = [];
    for (const item of raw.slice(-250)) {
      try {
        const [bm] = await chrome.bookmarks.get(String(item?.bm?.id || ""));
        if (bm?.url) current.push({ ...item, bm:{ ...item.bm, ...bm } });
      } catch { /* deleted bookmarks disappear from the pending accuracy gate */ }
    }
    await this.persistDecisions(current);
    this.renderAccuracyGate(current);
    return current;
  },

  async mergeDecisions(items = [], resolvedIds = []) {
    const byId = new Map(this.decisionItems.map(item => [String(item.bm.id), item]));
    resolvedIds.forEach(id => byId.delete(String(id)));
    items.forEach(item => {
      if (item?.bm?.id) byId.set(String(item.bm.id), { ...item, createdAt:item.createdAt || Date.now() });
    });
    await this.persistDecisions([...byId.values()]);
    this.renderAccuracyGate();
  },

  renderAccuracyGate(items = this.decisionItems) {
    const board = this.el("bookmark-review-board");
    const list = this.el("bookmark-review-list");
    const count = this.el("bookmark-review-count");
    if (!board || !list || !count) return;
    this.decisionItems = items.slice(0, 250);
    count.textContent = String(items.length);
    board.classList.toggle("hidden", items.length === 0);
    list.replaceChildren();
    this.decisionItems.forEach(item => {
      const row = document.createElement("article");
      row.className = "bookmark-review-row";
      row.dataset.bookmarkDecisionId = String(item.bm.id);
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.bm.title || item.bm.url;
      const meta = document.createElement("span");
      const suggested = Classifier.normalizePath(item.suggestedPath, { allowOperational:false });
      const current = Array.isArray(item.bm.sourcePath) && item.bm.sourcePath.length ? item.bm.sourcePath.join(" › ") : "Bookmark Bar";
      meta.textContent = `${Classifier.domainOf(item.bm.url)} · currently: ${current} · ${item.reasons.join(" / ") || "more evidence needed"}`;
      const candidateCopy = document.createElement("small");
      const candidates = (item.candidates || []).map(candidate => Classifier.normalizePath(candidate.path, { allowOperational:false })).filter(Boolean);
      candidateCopy.textContent = candidates.length ? `Evidence suggests: ${candidates.map(path => path.join(" › ")).join(" · ")}` : "No safe automatic guess was made.";
      copy.append(title, meta, candidateCopy);
      const controls = document.createElement("div");
      controls.className = "bookmark-review-controls";
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Category for ${title.textContent}`);
      select.dataset.bookmarkDecisionId = String(item.bm.id);
      const prompt = document.createElement("option");
      prompt.value = "";
      prompt.textContent = "Choose the verified topic…";
      select.append(prompt);
      this.destinationOptions(select);
      const move = document.createElement("button");
      move.type = "button";
      move.dataset.bookmarkReviewAction = "true";
      move.textContent = "Confirm + learn";
      if (suggested) select.value = JSON.stringify(suggested);
      move.disabled = this.busy || !select.value;
      select.onchange = () => {
        move.disabled = !select.value || this.busy;
        const complete = this.el("bookmark-complete-decisions");
        if (complete) complete.disabled = this.busy || ![...list.querySelectorAll("select")].some(candidate => candidate.value);
      };
      move.onclick = () => {
        let path;
        try { path = JSON.parse(select.value); } catch { return; }
        this.applyCorrection(item.bm.id, path);
      };
      const open = document.createElement("button");
      open.type = "button";
      open.className = "secondary-btn";
      open.textContent = "Inspect";
      open.onclick = () => chrome.tabs.create({ url:item.bm.url });
      controls.append(select, move, open);
      row.append(copy, controls);
      list.append(row);
    });
    const complete = this.el("bookmark-complete-decisions");
    if (complete) complete.disabled = this.busy || !this.decisionItems.length || ![...list.querySelectorAll("select")].some(select => select.value);
  },

  async preview(scopeParentId) {
    return this.runExclusive("Preview", async () => {
      this.clearLog();
      this.setProgress(0, 0);
      this.log("Building a non-destructive preview…");
      const { plan } = await this.computePlan(scopeParentId);
      const grouped = {};
      plan.forEach(item => {
        if (!item.keep && item.path) grouped[item.path.join(" › ")] = (grouped[item.path.join(" › ")] || 0) + 1;
      });
      this.clearLog();
      Object.entries(grouped).sort((a, b) => b[1] - a[1]).forEach(([path, count]) => this.log(`${count} → ${path}`));
      const uncertain = plan.filter(item => item.needsDecision);
      await this.mergeDecisions(uncertain, plan.filter(item => !item.needsDecision).map(item => item.bm.id));
      this.log(`${plan.filter(item => item.keep).length} stay pinned at root.`);
      this.log(uncertain.length
        ? `${uncertain.length} item${uncertain.length === 1 ? " needs" : "s need"} a verified destination. Each remains exactly where it is.`
        : "Every bookmark has a confident destination.", !uncertain.length);
      this.log("Preview only. Nothing moved.");
      await this.recordAudit("preview", { reviewed: plan.length, uncertain: uncertain.length });
    });
  },

  async ensureContentPermission() {
    const origins = ["http://*/*", "https://*/*"];
    return await chrome.permissions.contains({ origins }) || chrome.permissions.request({ origins });
  },

  evidenceEndpoints(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (!/^https?:$/.test(url.protocol)) return [];
      const host = url.hostname.toLowerCase();
      const isPrivate = host === "localhost" || host === "::1" || host.endsWith(".local")
        || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
      if (isPrivate) return [];
      const endpoints = [];
      if (["youtube.com", "www.youtube.com", "youtu.be"].includes(host)) {
        endpoints.push(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.href)}`);
      }
      if (["tiktok.com", "www.tiktok.com"].includes(host)) {
        endpoints.push(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url.href)}`);
      }
      endpoints.push(url.href);
      return endpoints;
    } catch { return []; }
  },

  async fetchPageContext(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      for (const endpoint of this.evidenceEndpoints(url)) {
        try {
          const response = await fetch(endpoint, { signal: controller.signal, credentials: "omit", redirect:"follow" });
          if (!response.ok) continue;
          const type = (response.headers.get("content-type") || "").toLowerCase();
          if (type.includes("application/json")) {
            const data = await response.json();
            const context = [data?.title, data?.author_name, data?.provider_name, data?.description, data?.category].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
            if (context) return context.slice(0, 3000);
            continue;
          }
          if (!type.includes("text/html")) continue;
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html.slice(0, 120000), "text/html");
          const context = [
            doc.querySelector('meta[property="og:title"]')?.getAttribute("content") || doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content") || doc.querySelector("title")?.textContent || "",
            doc.querySelector('meta[name="description"]')?.getAttribute("content") || doc.querySelector('meta[property="og:description"]')?.getAttribute("content") || "",
            doc.querySelector('meta[name="keywords"]')?.getAttribute("content") || "",
            doc.querySelector("h1")?.textContent || "",
          ].join(" ").replace(/\s+/g, " ").trim();
          if (context) return context.slice(0, 3000);
        } catch (error) {
          if (controller.signal.aborted) break;
        }
      }
      return "";
    } catch { return ""; }
    finally { clearTimeout(timer); }
  },

  async collectEvidenceCandidates(barId, allBookmarks, { pendingOnly = false } = {}) {
    const [root] = await chrome.bookmarks.getSubTree(barId);
    const legacyHoldingDescendants = new Set();
    const walk = (items, insideLegacyHolder = false) => (items || []).forEach(node => {
      const nextInside = insideLegacyHolder || (!node.url && ["Uncategorized", "Review Queue"].includes(node.title));
      if (nextInside && node.url) legacyHoldingDescendants.add(node.id);
      if (node.children) walk(node.children, nextInside);
    });
    walk(root?.children);
    const pendingIds = new Set(this.decisionItems.map(item => String(item.bm.id)));
    return allBookmarks.filter(bm => pendingIds.has(String(bm.id)) || legacyHoldingDescendants.has(bm.id) || (!pendingOnly && Classifier.isContentVariesDomain(Classifier.domainOf(bm.url))));
  },

  async refineUncategorized({ pendingOnly = false } = {}) {
    return this.runExclusive("Deep topic review", async () => {
      if (!(await this.ensureContentPermission())) {
        this.log("Page-reading permission was declined. Nothing changed; unresolved bookmarks remain in their current folders.");
        return;
      }
      const { barId, nodes } = await this.getAllBookmarks();
      const bookmarks = await this.collectEvidenceCandidates(barId, nodes, { pendingOnly });
      if (!bookmarks.length) { this.log("No ambiguous bookmarks need a deep review.", true); return; }
      this.clearLog();
      this.log(`Reading real page titles and descriptions for ${bookmarks.length} bookmark(s)…`);
      this.setProgress(0, bookmarks.length);
      const learnedMap = await this.getLearnedMap();
      const legitFolders = await this.scanLegitFolders(barId);
      const moves = [];
      const resolvedIds = [];
      let stillUncertain = [];
      let reviewed = 0;
      for (let start = 0; start < bookmarks.length; start += 4) {
        const batch = bookmarks.slice(start, start + 4);
        const contexts = await Promise.all(batch.map(bm => this.fetchPageContext(bm.url)));
        for (let index = 0; index < batch.length; index += 1) {
          const bm = batch[index];
          const context = contexts[index];
          const result = context ? Classifier.classify({ ...bm, title: `${bm.title} ${context}` }, learnedMap, legitFolders) : { source: "needs-content", confidence:"needs-evidence", reasons: ["page could not be read"], candidates:[] };
          const path = Classifier.normalizePath(result.path, { allowOperational:false });
          if (path && result.confidence === "high") {
            const targetParent = await this.getOrCreateFolderPath(path, barId);
            await this.moveAndRecord(bm, targetParent, path, barId, moves);
            resolvedIds.push(bm.id);
          } else {
            stillUncertain.push({ bm, context, reasons: result.reasons || ["topic remains ambiguous"], suggestedPath:path, candidates:result.candidates || [] });
          }
          reviewed += 1;
          this.setProgress(reviewed, bookmarks.length);
        }
      }
      let locallyClassified = 0;
      if (stillUncertain.length && typeof LocalAI !== "undefined" && LocalAI.isLoadedThisSession()) {
        this.log(`Using the loaded on-device model on ${stillUncertain.length} still-ambiguous page${stillUncertain.length === 1 ? "" : "s"}…`);
        const taxonomy = Object.fromEntries(Classifier.ROOTS.map(root => [root, Classifier.MANAGED_SUBFOLDERS[root] || []]));
        const remaining = [];
        for (let start = 0; start < stillUncertain.length; start += 6) {
          const batch = stillUncertain.slice(start, start + 6);
          try {
            const decisions = await LocalAI.classifyBookmarks(batch.map(item => ({ id:item.bm.id, title:item.bm.title, url:item.bm.url, pageContext:item.context })), taxonomy);
            const byId = new Map(decisions.map(decision => [String(decision.id), decision]));
            for (const item of batch) {
              const decision = byId.get(String(item.bm.id));
              const path = Classifier.normalizePath([decision?.root, decision?.sub].filter(Boolean), { allowOperational:false });
              const confidence = String(decision?.confidence || "low").toLowerCase();
              if (path && confidence === "high") {
                const targetParent = await this.getOrCreateFolderPath(path, barId);
                await this.moveAndRecord(item.bm, targetParent, path, barId, moves);
                locallyClassified += 1;
                resolvedIds.push(item.bm.id);
              } else {
                remaining.push({ ...item, suggestedPath:path || item.suggestedPath, candidates:path ? [{ path, score:confidence === "medium" ? 5 : 2, reasons:[decision?.reason || "on-device suggestion"] }, ...(item.candidates || [])] : item.candidates, reasons:[decision?.reason || item.reasons?.[0] || "topic remains ambiguous", confidence === "medium" ? "on-device suggestion needs confirmation" : "low model confidence"] });
              }
            }
          } catch (error) {
            batch.forEach(item => remaining.push({ ...item, reasons:[...(item.reasons || []), `local model stopped: ${String(error.message || error).slice(0,120)}`] }));
          }
        }
        stillUncertain = remaining;
      }
      const released = await this.releaseLegacyHoldingBookmarks(stillUncertain, barId, moves);
      await this.commitTransaction("deep-topic-review", moves);
      const removed = await this.cleanupManagedEmptyFolders(barId);
      await this.mergeDecisions(stillUncertain, resolvedIds);
      const retired = await this.cleanupLegacyHoldingFolders(barId);
      await this.recordAudit("deep-topic-review", { reviewed, moved: moves.length, locallyClassified, released, uncertain: stillUncertain.length, removed });
      this.clearLog();
      this.log(stillUncertain.length
        ? `Evidence pass filed ${moves.length - released}${locallyClassified ? ` (${locallyClassified} by the loaded on-device model)` : ""}. ${stillUncertain.length} still need a verified destination and received no guessed category${released ? `; ${released} were released from an obsolete holding folder to the Bookmark Bar` : ""}. ${removed + retired} obsolete folder(s) removed.`
        : `Accuracy gate complete: ${moves.length} filed and ${removed + retired} obsolete folder(s) removed.`, !stillUncertain.length);
      this.setProgress(reviewed - stillUncertain.length, bookmarks.length, !stillUncertain.length);
      await this.refreshInboxCount();
      return { reviewed, moved:moves.length - released, released, uncertain:stillUncertain.length };
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

  async cleanupLegacyHoldingFolders(barId) {
    // Earlier Operation HQ builds created these exact holding folders. They
    // are retired in v7. Delete only an empty exact legacy location—never a
    // populated folder or an arbitrary similarly named personal folder.
    const rootChildren = await chrome.bookmarks.getChildren(barId);
    const candidates = rootChildren.filter(node => !node.url && ["Review Queue", "Uncategorized"].includes(node.title));
    const utilities = rootChildren.find(node => !node.url && node.title === "Utilities & Misc");
    if (utilities) {
      const nested = await chrome.bookmarks.getChildren(utilities.id);
      const queue = nested.find(node => !node.url && node.title === "Review Queue");
      if (queue) candidates.push(queue);
    }
    let removed = 0;
    for (const folder of candidates) {
      try {
        if ((await chrome.bookmarks.getChildren(folder.id)).length === 0) {
          await chrome.bookmarks.remove(folder.id);
          removed += 1;
        }
      } catch { /* folder changed while the accuracy pass was running */ }
    }
    return removed;
  },

  isLegacyHoldingPath(path) {
    const clean = Array.isArray(path) ? path.map(String) : [];
    return (clean.length === 1 && ["Review Queue", "Uncategorized"].includes(clean[0]))
      || (clean.length === 2 && clean[0] === "Utilities & Misc" && clean[1] === "Review Queue");
  },

  async releaseLegacyHoldingBookmarks(items, barId, moves) {
    let released = 0;
    for (const item of items) {
      if (!this.isLegacyHoldingPath(item?.bm?.sourcePath)) continue;
      if (await this.moveAndRecord(item.bm, barId, [], barId, moves)) released += 1;
      item.bm = { ...item.bm, parentId:String(barId), sourcePath:[] };
    }
    return released;
  },

  async getOrCreateLegacyFolderPath(pathArr, barId) {
    if (!this.isLegacyHoldingPath(pathArr)) throw new Error("Blocked an invalid legacy bookmark destination.");
    let parentId = barId;
    for (const title of pathArr) {
      const children = await chrome.bookmarks.getChildren(parentId);
      const existing = children.find(node => !node.url && node.title === title);
      parentId = existing?.id || (await chrome.bookmarks.create({ parentId, title })).id;
    }
    return parentId;
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
    const result = await this.runExclusive(scopeParentId ? "Inbox sort" : "Full sort", () => this.applySort(scopeParentId));
    if (!scopeParentId && result?.uncertain > 0 && !result?.failed) {
      this.log("Strong title and URL matches are filed. Checking real page evidence for the unresolved remainder…");
      return this.refineUncategorized({ pendingOnly:true });
    }
    return result;
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
        if (item.keep) {
          await this.moveAndRecord(item.bm, barId, [], barId, moves);
          kept += 1;
        } else if (item.needsDecision) {
          uncertain.push(item);
        } else {
          const targetParent = await this.getOrCreateFolderPath(item.path, barId);
          await this.moveAndRecord(item.bm, targetParent, item.path, barId, moves);
        }
      } catch (error) {
        failed += 1;
        this.log(`Could not move “${item.bm.title || item.bm.url}”: ${String(error?.message || error)}`);
      }
      this.setProgress(index + 1, total);
    }
    const released = await this.releaseLegacyHoldingBookmarks(uncertain, barId, moves);
    await this.commitTransaction(scopeParentId ? "inbox-sort" : "full-sort", moves);
    const removed = await this.cleanupManagedEmptyFolders(barId);
    await this.mergeDecisions(uncertain, plan.filter(item => !item.needsDecision).map(item => item.bm.id));
    const retired = await this.cleanupLegacyHoldingFolders(barId);
    await this.recordAudit("sort", { scope: scopeParentId ? "inbox" : "all", reviewed: plan.length, moved: moves.length, released, uncertain: uncertain.length, failed, removed });
    this.clearLog();
    this.log(uncertain.length
      ? `Accuracy gate paused: ${moves.length - released} confidently moved, ${kept} pinned, ${uncertain.length} still need a verified destination${released ? `, ${released} released from an obsolete holding folder` : ""}, ${failed} failed, ${removed + retired} obsolete folder(s) removed.`
      : `Complete: ${moves.length} moved, ${kept} pinned, zero unresolved, ${failed} failed, ${removed + retired} obsolete folder(s) removed.`, uncertain.length === 0 && failed === 0);
    if (uncertain.length) this.log(`No uncertain bookmark was assigned a guessed category${released ? "; legacy-held links now sit neutrally on the Bookmark Bar" : ""}. Confirm the remaining destinations below; each decision teaches only that exact saved page.`);
    this.setProgress(Math.max(0, total - uncertain.length - failed), total, uncertain.length === 0 && failed === 0);
    await this.refreshInboxCount();
    return { reviewed:plan.length, moved:moves.length - released, released, uncertain:uncertain.length, failed };
  },

  async sortInboxOnly() {
    if (this.busy) return this.runExclusive("Inbox sort", async () => {});
    const { barId } = await this.getAllBookmarks();
    const inbox = await this.findInboxFolder(barId);
    if (!inbox) { this.log("No Inbox folder exists, so there is nothing to sort."); return; }
    return this.sortAll(inbox.id);
  },

  async applyCorrection(bookmarkId, pathArr) {
    return this.runExclusive("Verified destination", async () => {
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
      await this.commitTransaction("verified-destination", moves);
      this.decisionItems = this.decisionItems.filter(item => String(item.bm.id) !== String(bookmarkId));
      await this.persistDecisions();
      this.renderAccuracyGate();
      const retired = await this.cleanupLegacyHoldingFolders(barId);
      await this.recordAudit("verified-destination", { bookmarkId, path, moved: moves.length, retired });
      this.log(`Verified and learned: ${bm.title || bm.url} → ${path.join(" › ")}`, true);
      if (!this.decisionItems.length) this.log("Accuracy gate complete. No unresolved bookmarks remain.", true);
      await this.refreshInboxCount();
    });
  },

  async applySelectedDecisions() {
    if (typeof document === "undefined") return;
    const selected = [...document.querySelectorAll("#bookmark-review-list select[data-bookmark-decision-id]")].map(select => {
      if (!select.value) return null;
      try { return { id:select.dataset.bookmarkDecisionId, path:JSON.parse(select.value) }; }
      catch { return null; }
    }).filter(Boolean);
    if (!selected.length) { this.log("Choose at least one verified destination first."); return; }
    return this.runExclusive("Finish selected decisions", async () => {
      const { barId } = await this.getAllBookmarks();
      const learned = await this.getLearnedMap();
      const moves = [];
      const completed = new Set();
      let failed = 0;
      for (const choice of selected) {
        const path = Classifier.normalizePath(choice.path, { allowOperational:false });
        if (!path) { failed += 1; continue; }
        try {
          const [bm] = await chrome.bookmarks.get(choice.id);
          if (!bm?.url) { failed += 1; continue; }
          const targetParent = await this.getOrCreateFolderPath(path, barId);
          await this.moveAndRecord(bm, targetParent, path, barId, moves);
          learned[Classifier.fingerprint(bm)] = path;
          completed.add(String(choice.id));
        } catch { failed += 1; }
      }
      await chrome.storage.local.set({ hq_learned_domains:learned });
      await this.commitTransaction("verified-destinations", moves);
      this.decisionItems = this.decisionItems.filter(item => !completed.has(String(item.bm.id)));
      await this.persistDecisions();
      this.renderAccuracyGate();
      const retired = await this.cleanupLegacyHoldingFolders(barId);
      await this.recordAudit("verified-destinations", { completed:completed.size, failed, moved:moves.length, retired });
      this.log(`${completed.size} verified destination${completed.size === 1 ? "" : "s"} filed${failed ? `; ${failed} stopped safely` : ""}.`, failed === 0);
      if (!this.decisionItems.length) this.log("Accuracy gate complete. No unresolved bookmarks remain.", true);
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
            else if (this.isLegacyHoldingPath(move.fromPath)) targetId = await this.getOrCreateLegacyFolderPath(move.fromPath, barId);
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
    const decisions = this.decisionItems.length;
    if (!inbox) {
      el.textContent = decisions ? `${decisions} bookmark destination${decisions === 1 ? "" : "s"} must be verified to finish sorting` : "All classified—no unresolved bookmark destinations";
      return;
    }
    const { nodes } = await this.getAllBookmarks(inbox.id);
    el.textContent = `${nodes.length} in your Inbox · ${decisions} unresolved destination${decisions === 1 ? "" : "s"}`;
  },

  async peekSummary() {
    const stack = await this.readUndoStack();
    if (this.decisionItems.length) return `${this.decisionItems.length} destination${this.decisionItems.length === 1 ? "" : "s"} need verification`;
    return stack.length ? `Undo available: ${stack[stack.length - 1].kind.replace(/-/g, " ")}` : "All classified";
  },

  async init() {
    await this.restoreDecisions();
    await this.updateUndoButton();
    await this.refreshInboxCount();
    const complete = this.el("bookmark-complete-decisions");
    if (complete) complete.onclick = () => this.applySelectedDecisions();
    if (!this._decisionListenerBound && chrome.storage?.onChanged) {
      this._decisionListenerBound = true;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes[this.DECISIONS_KEY]) return;
        const next = Array.isArray(changes[this.DECISIONS_KEY].newValue) ? changes[this.DECISIONS_KEY].newValue : [];
        this.decisionItems = next;
        this.renderAccuracyGate();
        this.refreshInboxCount().catch(() => {});
      });
    }
    this.setBusy(false);
  },
};
