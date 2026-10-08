// workspaces.js — durable, topic-aware browser-session snapshots.
// Sync is merge-only by default. Restore opens a separate window and rebuilds
// saved tab groups. This module never closes a tab.
const Workspaces = {
  KEY: "hq_browser_workspaces",
  items: [],
  groupPlan: [],
  GROUP_COLORS: ["blue", "purple", "cyan", "green", "yellow", "orange", "red", "pink", "grey"],

  eligible(tab) { return /^https?:\/\//i.test(tab.url || ""); },
  domain(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; } },
  normalized(url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach(key => parsed.searchParams.delete(key));
      return parsed.toString().replace(/\/$/, "");
    } catch { return String(url || ""); }
  },

  async load() {
    const stored = await chrome.storage.local.get(this.KEY);
    this.items = Array.isArray(stored[this.KEY]) ? stored[this.KEY] : [];
  },
  async persist() { await chrome.storage.local.set({ [this.KEY]: this.items.slice(0, 30) }); },
  setStatus(message) { const status = document.getElementById("workspace-status"); if (status) status.textContent = message; },

  async bookmarkIndex() {
    if (!chrome.bookmarks?.getTree) return new Map();
    const tree = await chrome.bookmarks.getTree();
    const index = new Map();
    const walk = (nodes, path = []) => (nodes || []).forEach(node => {
      if (node.url) index.set(this.normalized(node.url), { id: node.id, path });
      if (node.children) walk(node.children, node.title ? [...path, node.title] : path);
    });
    walk(tree);
    return index;
  },

  async groupMap(tabs) {
    const ids = [...new Set(tabs.map(tab => tab.groupId).filter(id => Number.isInteger(id) && id >= 0))];
    if (!chrome.tabGroups) return new Map();
    const entries = await Promise.all(ids.map(async id => {
      try { return [id, await chrome.tabGroups.get(id)]; } catch { return [id, null]; }
    }));
    return new Map(entries);
  },

  async captureCurrent() {
    const tabs = (await chrome.tabs.query({ currentWindow: true })).filter(tab => this.eligible(tab));
    const [groups, bookmarks, learned] = await Promise.all([
      this.groupMap(tabs), this.bookmarkIndex(), chrome.storage.local.get("hq_learned_domains"),
    ]);
    return tabs.slice(0, 100).map(tab => {
      const group = groups.get(tab.groupId);
      const classified = typeof Classifier !== "undefined"
        ? Classifier.classify({ title: tab.title || "", url: tab.url }, learned.hq_learned_domains || {}, [])
        : { path: ["Utilities & Misc"], confidence: "low" };
      const bookmark = bookmarks.get(this.normalized(tab.url));
      return {
        url: tab.url, title: tab.title || this.domain(tab.url), pinned: !!tab.pinned,
        topic: classified.path?.[0] || "Utilities & Misc", subtopic: classified.path?.[1] || null,
        confidence: classified.confidence, bookmarked: !!bookmark, bookmarkPath: bookmark?.path?.filter(Boolean).slice(-3) || [],
        groupTitle: group?.title || null, groupColor: group?.color || null, groupCollapsed: !!group?.collapsed,
      };
    });
  },

  async saveCurrent(name) {
    const tabs = await this.captureCurrent();
    if (!tabs.length) throw new Error("This window has no restorable web tabs.");
    const snapshot = { id: crypto.randomUUID(), name: name.trim().slice(0, 48), createdAt: Date.now(), tabs };
    this.items.unshift(snapshot);
    await this.persist(); this.render();
    this.setStatus(`Saved ${snapshot.tabs.length} tabs with topics, bookmark links and tab-group structure.`);
  },

  async restoreGroups(createdTabs, savedTabs, windowId) {
    if (!chrome.tabGroups || !chrome.tabs.group) return;
    const grouped = new Map();
    savedTabs.forEach((saved, index) => {
      if (!saved.groupTitle || !createdTabs[index]?.id) return;
      const key = `${saved.groupTitle}::${saved.groupColor || "grey"}`;
      if (!grouped.has(key)) grouped.set(key, { title: saved.groupTitle, color: saved.groupColor || "grey", collapsed: saved.groupCollapsed, ids: [] });
      grouped.get(key).ids.push(createdTabs[index].id);
    });
    for (const group of grouped.values()) {
      const groupId = await chrome.tabs.group({ tabIds: group.ids, createProperties: { windowId } });
      await chrome.tabGroups.update(groupId, { title: group.title.slice(0, 32), color: group.color, collapsed: !!group.collapsed });
    }
  },

  async restore(id) {
    const workspace = this.items.find(item => item.id === id);
    const validTabs = (workspace?.tabs || []).filter(tab => this.eligible(tab));
    if (!validTabs.length) throw new Error("This workspace no longer contains valid web tabs.");
    this.setStatus(`Opening ${workspace.name} in a separate window…`);
    const created = await chrome.windows.create({ url: validTabs.map(tab => tab.url), focused: true });
    const createdTabs = await chrome.tabs.query({ windowId: created.id });
    await Promise.all(createdTabs.map((tab, index) => validTabs[index]?.pinned ? chrome.tabs.update(tab.id, { pinned: true }) : null));
    await this.restoreGroups(createdTabs, validTabs, created.id);
    this.setStatus(`Restored ${validTabs.length} tabs and saved groups. Your original window was untouched.`);
  },

  async replaceSnapshot(id) {
    const workspace = this.items.find(item => item.id === id);
    if (!workspace) return;
    const current = await this.captureCurrent();
    if (!current.length) throw new Error("This window has no restorable web tabs.");
    const currentUrls = new Set(current.map(tab => this.normalized(tab.url)));
    const preserved = (workspace.tabs || []).filter(tab => !currentUrls.has(this.normalized(tab.url)));
    workspace.tabs = [...current, ...preserved].slice(0, 120);
    workspace.updatedAt = Date.now();
    await this.persist(); this.render();
    this.setStatus(`Synced ${workspace.name}: ${current.length} current · ${preserved.length} saved-only tab${preserved.length === 1 ? "" : "s"} preserved.`);
  },

  async bookmarkMissing(id) {
    const workspace = this.items.find(item => item.id === id);
    const liveIndex = await this.bookmarkIndex();
    const missingByUrl = new Map();
    (workspace?.tabs || []).forEach(tab => {
      const key = this.normalized(tab.url);
      if (key && !liveIndex.has(key) && !missingByUrl.has(key)) missingByUrl.set(key, tab);
    });
    const missing = [...missingByUrl.values()];
    if (!missing.length) { this.setStatus("Every tab in this workspace is already bookmarked."); return; }
    if (!confirm(`Add ${missing.length} missing workspace tab${missing.length === 1 ? "" : "s"} to the Bookmark Inbox? Nothing existing will move.`)) return;
    const tree = await chrome.bookmarks.getTree();
    const barId = tree[0].children[0].id;
    const inboxId = await Bookmarks.getOrCreateFolderPath(["Inbox"], barId);
    for (const tab of missing) await chrome.bookmarks.create({ parentId: inboxId, title: tab.title, url: tab.url });
    const addedUrls = new Set(missing.map(tab => this.normalized(tab.url)));
    workspace.tabs.forEach(tab => { tab.bookmarked = liveIndex.has(this.normalized(tab.url)) || addedUrls.has(this.normalized(tab.url)); });
    await this.persist(); this.render(); await Bookmarks.refreshInboxCount();
    this.setStatus(`${missing.length} missing tab${missing.length === 1 ? "" : "s"} added to Bookmark Inbox for topic review.`);
  },

  duplicateCount(tabs = []) {
    const seen = new Set(); let duplicates = 0;
    tabs.forEach(tab => { const key = this.normalized(tab.url); if (seen.has(key)) duplicates++; else if (key) seen.add(key); });
    return duplicates;
  },

  async healthCheck() {
    const liveBookmarks = await this.bookmarkIndex();
    const now = Date.now();
    const metrics = this.items.map(item => {
      const tabs = item.tabs || [];
      return {
        item,
        duplicates:this.duplicateCount(tabs),
        invalid:tabs.filter(tab => !this.eligible(tab)).length,
        missingBookmarks:tabs.filter(tab => !liveBookmarks.has(this.normalized(tab.url))).length,
        stale:now - Number(item.updatedAt || item.createdAt || now) > 30 * 86400000,
      };
    });
    const panel = document.getElementById("workspace-health");
    panel.classList.remove("hidden");
    if (!metrics.length) { panel.innerHTML = '<p>No saved workspaces to inspect.</p>'; return; }
    const duplicates = metrics.reduce((sum,row) => sum + row.duplicates,0);
    const stale = metrics.filter(row => row.stale).length;
    const invalid = metrics.reduce((sum,row) => sum + row.invalid,0);
    const clean = metrics.filter(row => !row.duplicates && !row.invalid && !row.stale).length;
    panel.innerHTML = `<strong>Workspace health report</strong><div class="workspace-health-grid"><span><b>${clean}</b> healthy</span><span><b>${duplicates}</b> duplicate refs</span><span><b>${stale}</b> stale snapshots</span><span><b>${invalid}</b> invalid URLs</span></div><p>Health is diagnostic only. Metadata refresh and saved-copy deduplication remain explicit actions on each workspace.</p>`;
    this.setStatus("Workspace health inspected without changing any tabs, groups, bookmarks or snapshots.");
  },

  async refreshMetadata(id) {
    const workspace = this.items.find(item => item.id === id);
    if (!workspace) return;
    const [bookmarks,learned] = await Promise.all([this.bookmarkIndex(),chrome.storage.local.get("hq_learned_domains")]);
    workspace.tabs = (workspace.tabs || []).map(tab => {
      const classified = typeof Classifier !== "undefined" ? Classifier.classify({title:tab.title || "",url:tab.url},learned.hq_learned_domains || {},[]) : {path:["Utilities & Misc"],confidence:"low"};
      const bookmark = bookmarks.get(this.normalized(tab.url));
      return {...tab,topic:classified.path?.[0] || "Utilities & Misc",subtopic:classified.path?.[1] || null,confidence:classified.confidence,bookmarked:!!bookmark,bookmarkPath:bookmark?.path?.filter(Boolean).slice(-3) || []};
    });
    workspace.updatedAt = Date.now();
    await this.persist(); this.render();
    this.setStatus(`Refreshed ${workspace.name}'s topics and bookmark links. Its saved URL list and Chrome tabs were untouched.`);
  },

  async dedupeSnapshot(id) {
    const workspace = this.items.find(item => item.id === id);
    if (!workspace) return;
    const count = this.duplicateCount(workspace.tabs || []);
    if (!count) { this.setStatus(`${workspace.name} has no duplicate URL references.`); return; }
    if (!confirm(`Remove ${count} duplicate URL reference${count === 1 ? "" : "s"} from the saved copy of “${workspace.name}”? Open tabs and bookmarks will not change.`)) return;
    const seen = new Set();
    workspace.tabs = (workspace.tabs || []).filter(tab => { const key = this.normalized(tab.url); if (!key || seen.has(key)) return false; seen.add(key); return true; });
    workspace.updatedAt = Date.now();
    await this.persist(); this.render();
    this.setStatus(`Removed ${count} duplicate reference${count === 1 ? "" : "s"} from the saved copy. Open tabs and bookmarks were untouched.`);
  },

  async remove(id) {
    const workspace = this.items.find(item => item.id === id);
    if (!workspace || !confirm(`Delete the saved workspace “${workspace.name}”? Your open tabs and bookmarks will not be affected.`)) return;
    this.items = this.items.filter(item => item.id !== id);
    await this.persist(); this.render(); this.setStatus(`Deleted ${workspace.name}. Open tabs and bookmarks were untouched.`);
  },

  async analyseCurrent() {
    const current = await this.captureCurrent();
    const groups = new Map();
    current.forEach((tab, index) => {
      const topic = tab.topic || "Utilities & Misc";
      if (!groups.has(topic)) groups.set(topic, []);
      groups.get(topic).push({ ...tab, index });
    });
    const liveTabs = (await chrome.tabs.query({ currentWindow: true })).filter(tab => this.eligible(tab));
    this.groupPlan = [...groups.entries()].map(([topic, tabs]) => ({ topic, tabs, tabIds: tabs.map(tab => liveTabs[tab.index]?.id).filter(Boolean) })).filter(group => group.tabIds.length >= 2);
    const panel = document.getElementById("workspace-intelligence");
    panel.classList.remove("hidden");
    if (!this.groupPlan.length) panel.innerHTML = '<p>No topic has at least two tabs, so grouping would add clutter instead of reducing it.</p>';
    else panel.innerHTML = `<strong>Review grouping plan</strong>${this.groupPlan.map(group => `<div><span>${escapeHtml(group.topic)}</span><small>${group.tabs.length} tabs · ${group.tabs.filter(tab => tab.bookmarked).length} bookmarked</small></div>`).join("")}<p>No tab will close, move to another window or be deleted.</p>`;
    document.getElementById("workspace-group-btn").disabled = !this.groupPlan.length;
    document.getElementById("workspace-cancel-group-btn").classList.remove("hidden");
  },

  cancelGrouping() {
    this.groupPlan = [];
    document.getElementById("workspace-intelligence").classList.add("hidden");
    document.getElementById("workspace-group-btn").disabled = true;
    document.getElementById("workspace-cancel-group-btn").classList.add("hidden");
  },

  async applyGrouping() {
    if (!this.groupPlan.length || !chrome.tabs.group || !chrome.tabGroups) return;
    for (let index = 0; index < this.groupPlan.length; index++) {
      const plan = this.groupPlan[index];
      const groupId = await chrome.tabs.group({ tabIds: plan.tabIds });
      await chrome.tabGroups.update(groupId, { title: plan.topic.slice(0, 32), color: this.GROUP_COLORS[index % this.GROUP_COLORS.length], collapsed: false });
    }
    const count = this.groupPlan.reduce((sum, group) => sum + group.tabIds.length, 0);
    this.cancelGrouping(); this.setStatus(`Grouped ${count} tabs by topic. No tabs were closed or discarded.`);
  },

  render() {
    const list = document.getElementById("workspace-list");
    if (!list) return;
    if (!this.items.length) { list.innerHTML = '<li class="empty-state">No saved workspaces yet. Save this window when its tabs form a useful setup.</li>'; return; }
    list.innerHTML = this.items.map(item => {
      const tabs = item.tabs || [];
      const topics = [...new Set(tabs.map(tab => tab.topic).filter(Boolean))].slice(0, 5);
      const bookmarked = tabs.filter(tab => tab.bookmarked).length;
      const groups = new Set(tabs.map(tab => tab.groupTitle).filter(Boolean)).size;
      const date = new Date(item.updatedAt || item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      return `<li class="workspace-card" data-workspace-id="${escapeAttribute(item.id)}">
        <div><h3>${escapeHtml(item.name)}</h3><div class="workspace-meta">${tabs.length} tabs · ${bookmarked} bookmarked · ${groups} saved group${groups === 1 ? "" : "s"} · ${escapeHtml(date)}</div></div>
        <div class="workspace-actions"><button data-action="restore">Open</button><button class="secondary" data-action="update">Safe sync</button><button class="secondary" data-action="metadata">Refresh links</button><button class="secondary" data-action="bookmark">Bookmark missing</button>${this.duplicateCount(tabs) ? '<button class="secondary" data-action="dedupe">Dedupe saved copy</button>' : ""}<button class="secondary" data-action="delete">Delete</button></div>
        <div class="workspace-domains">${topics.map(topic => `<span>${escapeHtml(topic)}</span>`).join("") || "Topics appear after the next safe sync"}</div>
      </li>`;
    }).join("");
  },

  async act(event) {
    const button = event.target.closest("button[data-action]");
    const card = button?.closest("[data-workspace-id]");
    if (!button || !card) return;
    button.disabled = true;
    try {
      if (button.dataset.action === "restore") await this.restore(card.dataset.workspaceId);
      if (button.dataset.action === "update") await this.replaceSnapshot(card.dataset.workspaceId);
      if (button.dataset.action === "bookmark") await this.bookmarkMissing(card.dataset.workspaceId);
      if (button.dataset.action === "metadata") await this.refreshMetadata(card.dataset.workspaceId);
      if (button.dataset.action === "dedupe") await this.dedupeSnapshot(card.dataset.workspaceId);
      if (button.dataset.action === "delete") await this.remove(card.dataset.workspaceId);
    } catch (error) { console.error("Workspace action failed:", error); this.setStatus(`Could not complete that workspace action: ${error.message}`); }
    finally { button.disabled = false; }
  },

  async init() {
    await this.load(); this.render();
    document.getElementById("workspace-save-form").onsubmit = async event => {
      event.preventDefault(); const input = document.getElementById("workspace-name-input"); const name = input.value.trim(); if (!name) return;
      try { await this.saveCurrent(name); input.value = ""; } catch (error) { this.setStatus(error.message); }
    };
    document.getElementById("workspace-list").onclick = event => this.act(event);
    document.getElementById("workspace-analyse-btn").onclick = () => this.analyseCurrent().catch(error => this.setStatus(`Tab analysis failed: ${error.message}`));
    document.getElementById("workspace-health-btn").onclick = () => this.healthCheck().catch(error => this.setStatus(`Workspace health check failed: ${error.message}`));
    document.getElementById("workspace-group-btn").onclick = () => this.applyGrouping().catch(error => this.setStatus(`Grouping failed: ${error.message}`));
    document.getElementById("workspace-cancel-group-btn").onclick = () => this.cancelGrouping();
  },
};
