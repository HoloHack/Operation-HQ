// gmail.js — read-only inbox via chrome.identity + Gmail API.
// Inbox rows are rendered only from authenticated Gmail API responses.
const Gmail = {
  token: null,
  FETCH_TIMEOUT_MS: 15000,
  PAGE_SIZE: 30,
  pageIndex: 0,
  pageTokens: [""],
  nextPageToken: null,
  currentQuery: "in:inbox",
  followups: [],
  messages: [],
  smartFilter: "all",
  categoryOverrides: {},

  async fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  },

  elements() {
    return {
      connect: document.getElementById("gmail-connect-btn"),
      refresh: document.getElementById("gmail-refresh-btn"),
      disconnect: document.getElementById("gmail-disconnect-btn"),
      list: document.getElementById("gmail-list"),
      status: document.getElementById("gmail-status"),
      dot: document.getElementById("gmail-connection-dot"),
      search: document.getElementById("gmail-search-input"),
      filter: document.getElementById("gmail-filter"),
      pagination: document.getElementById("gmail-pagination"),
      previous: document.getElementById("gmail-prev-page"),
      next: document.getElementById("gmail-next-page"),
      pageLabel: document.getElementById("gmail-page-label"),
      oauthHelp: document.getElementById("gmail-oauth-help-btn"),
      smartFilters: document.getElementById("gmail-smart-filters"),
      triageSummary: document.getElementById("gmail-triage-summary")
    };
  },

  setStatus(message, state = "idle") {
    const { status, dot } = this.elements();
    status.textContent = message;
    dot.classList.toggle("connected", state === "connected");
    dot.classList.toggle("error", state === "error");
  },

  setConnectedUi(connected) {
    const { connect, refresh, disconnect } = this.elements();
    connect.hidden = connected;
    refresh.hidden = !connected;
    disconnect.hidden = !connected;
  },

  async getToken(interactive) {
    const result = await chrome.identity.getAuthToken({ interactive });
    const token = typeof result === "string" ? result : result?.token;
    if (!token) throw new Error("Google did not return an OAuth token.");
    this.token = token;
    return token;
  },

  async api(path, token, retry = true) {
    const response = await this.fetchWithTimeout(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 401 && retry) {
      await chrome.identity.removeCachedAuthToken({ token });
      const freshToken = await this.getToken(false);
      return this.api(path, freshToken, false);
    }
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json())?.error?.message || ""; } catch {}
      throw new Error(detail || `Gmail API returned ${response.status}.`);
    }
    return response.json();
  },

  async connect() {
    const { connect, list } = this.elements();
    const originalLabel = connect.textContent;
    connect.disabled = true;
    connect.classList.add("loading");
    connect.innerHTML = Spinner.html(14) + "Connecting…";
    list.replaceChildren();
    this.setStatus("Waiting for Google authorization…");
    try {
      const token = await this.getToken(true);
      this.pageIndex = 0;
      this.pageTokens = [""];
      await this.loadInbox(token, "", { allowCache: false });
      await chrome.storage.local.set({ hq_gmail_connected: true });
      this.setConnectedUi(true);
      this.elements().oauthHelp.hidden = true;
    } catch (error) {
      console.error("Gmail authorization failed:", error);
      await chrome.storage.local.remove("hq_gmail_connected");
      this.setConnectedUi(false);
      this.setStatus(this.diagnoseAuthError(error), "error");
      this.elements().oauthHelp.hidden = !this.isAudienceError(error);
    } finally {
      connect.disabled = false;
      connect.classList.remove("loading");
      connect.textContent = originalLabel;
    }
  },

  diagnoseAuthError(error) {
    const message = (error?.message || String(error)).trim();
    const lower = message.toLowerCase();
    if (lower.includes("bad client id") || lower.includes("oauth2 not granted or revoked")) {
      return "Google rejected this OAuth client. Create a Chrome Extension client tied to this exact extension ID.";
    }
    if (lower.includes("client_id") || lower.includes("oauth2 request failed")) {
      return "OAuth is not configured correctly in manifest.json.";
    }
    if (lower.includes("cancel") || lower.includes("user rejected") || lower.includes("user did not approve")) {
      return "Sign-in was closed before authorization finished.";
    }
    return message ? `Could not connect: ${message}` : "Could not connect to Gmail.";
  },

  isAudienceError(error) {
    const lower = (error?.message || String(error)).toLowerCase();
    return lower.includes("access_denied") || lower.includes("access denied") || lower.includes("verification process") || lower.includes("developer-approved tester");
  },

  formatDate(internalDate) {
    const value = Number(internalDate);
    if (!Number.isFinite(value)) return "";
    const date = new Date(value);
    const today = new Date();
    return date.toDateString() === today.toDateString()
      ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : date.toLocaleDateString([], { month: "short", day: "numeric" });
  },

  buildQuery() {
    const { search, filter } = this.elements();
    const text = (search.value || "").trim().replace(/[{}]/g, "");
    return [filter.value || "in:inbox", text].filter(Boolean).join(" ");
  },

  async readCache(query) {
    const { hq_gmail_cache_v1: cache } = await chrome.storage.local.get("hq_gmail_cache_v1");
    if (!cache || cache.query !== query || !Array.isArray(cache.messages)) return null;
    if (Date.now() - Number(cache.savedAt || 0) > 6 * 60 * 60 * 1000) return null;
    return cache;
  },

  async writeCache(query, messages, nextPageToken) {
    // Metadata only: sender, subject, timestamp, thread id and labels. No body
    // or snippet is requested or persisted.
    await chrome.storage.local.set({ hq_gmail_cache_v1: {
      query,
      savedAt: Date.now(),
      nextPageToken: nextPageToken || null,
      messages: messages.slice(0, this.PAGE_SIZE),
    } });
  },

  renderMessages(messages, { cached = false, failed = 0 } = {}) {
    const { list } = this.elements();
    this.messages = messages;
    const summary = MailIntelligence.summarise(messages, this.categoryOverrides);
    const visible = summary.rows.filter(({ triage }) => this.smartFilter === "all" || triage.category === this.smartFilter || triage.priority === this.smartFilter);
    list.replaceChildren(...visible.map(({ message, triage }) => this.renderMessage(message, triage)));
    if (!visible.length) list.innerHTML = '<li class="empty-state">No messages match this smart lane on the current Gmail page.</li>';
    const urgent = summary.counts.urgent || 0;
    const categories = Object.entries(summary.counts).filter(([key]) => !["urgent", "important", "normal", "low"].includes(key)).length;
    this.elements().triageSummary.textContent = `${urgent} urgent · ${categories} active categor${categories === 1 ? "y" : "ies"} · ${messages.length} analysed`;
    this.elements().smartFilters?.querySelectorAll("button").forEach(button => {
      const active = button.dataset.smartFilter === this.smartFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      const count = button.dataset.smartFilter === "all" ? messages.length : (summary.counts[button.dataset.smartFilter] || 0);
      button.dataset.count = String(count);
    });
    const cacheCue = cached ? " Cached metadata shown while Gmail reconnects." : "";
    this.setStatus(`${cached ? "Last saved view" : "Connected"}. ${messages.length} message${messages.length === 1 ? "" : "s"} classified${failed ? `; ${failed} could not be read` : ""}.${cacheCue}`, cached || failed ? "error" : "connected");
  },

  updatePagination() {
    const { pagination, previous, next, pageLabel } = this.elements();
    pagination.hidden = this.pageIndex === 0 && !this.nextPageToken;
    previous.disabled = this.pageIndex === 0;
    next.disabled = !this.nextPageToken;
    pageLabel.textContent = `Page ${this.pageIndex + 1}`;
  },

  renderMessage(message, triage = MailIntelligence.classify(message, this.categoryOverrides)) {
    const headers = message.payload?.headers || [];
    const header = name => headers.find(item => item.name.toLowerCase() === name)?.value?.trim() || "";
    const rawFrom = header("from");
    const from = rawFrom.replace(/\s*<[^>]+>\s*$/, "") || rawFrom || "Sender unavailable";
    const subject = header("subject") || "No subject";
    const unread = message.labelIds?.includes("UNREAD");
    const item = document.createElement("li");
    item.className = `gmail-message gmail-${triage.category} priority-${triage.priority}${unread ? " gmail-message-unread" : ""}`;
    item.tabIndex = 0;
    item.dataset.threadId = message.threadId;
    item.dataset.from = from;
    item.dataset.subject = subject;
    item.dataset.internalDate = message.internalDate || "";
    item.dataset.messageId = message.id || "";
    item.dataset.category = triage.category;
    item.dataset.priority = triage.priority;
    item.setAttribute("aria-label", `${from}: ${subject}. Open in Gmail.`);
    const followed = this.followups.some(entry => entry.threadId === message.threadId && !entry.done);
    item.innerHTML = `<span class="gmail-priority-signal" aria-label="${escapeAttribute(triage.priority)} priority"></span>
      <span class="gmail-message-main"><span class="gmail-sender">${escapeHtml(from)}</span><span class="gmail-subject">${escapeHtml(subject)}</span><span class="gmail-explain">${escapeHtml(triage.reason)}</span></span>
      <span class="gmail-message-time">${escapeHtml(this.formatDate(message.internalDate))}</span>
      <span class="gmail-triage-badges"><span class="gmail-priority-badge">${escapeHtml(triage.priority)}</span><select class="gmail-category-select" aria-label="Category for ${escapeAttribute(subject)}">${MailIntelligence.CATEGORY_RULES.map(rule => `<option value="${rule.id}" ${rule.id === triage.category ? "selected" : ""}>${rule.label}</option>`).join("")}<option value="personal" ${triage.category === "personal" ? "selected" : ""}>Personal</option></select></span>
      <span class="gmail-message-actions"><button class="gmail-open-btn" data-mail-action="open" type="button">Open</button><button class="gmail-task-btn" data-mail-action="task" type="button">Add task</button><button class="gmail-calendar-btn" data-mail-action="calendar" type="button">Schedule</button>${triage.platformUrl ? `<button class="gmail-social-btn" data-mail-action="social" type="button">Open ${escapeHtml(triage.platform)}</button>` : ""}<button class="gmail-followup-btn ${followed ? "active" : ""}" data-mail-action="followup" type="button">${followed ? "Following up" : "Follow up"}</button></span>`;
    return item;
  },

  async toggleFollowup(item) {
    const threadId = item?.dataset.threadId;
    if (!threadId) return;
    const existing = this.followups.find(entry => entry.threadId === threadId && !entry.done);
    if (existing) this.followups = this.followups.filter(entry => entry.id !== existing.id);
    else this.followups.unshift({ id: crypto.randomUUID(), provider: "gmail", threadId, from: item.dataset.from || "", subject: item.dataset.subject || "No subject", createdAt: Date.now(), done: false });
    this.followups = this.followups.slice(0, 100);
    await chrome.storage.local.set({ hq_followups: this.followups });
    if (typeof Today !== "undefined") Today.render();
    const message = this.messages.find(entry => entry.threadId === threadId) || { threadId, id: item.dataset.messageId, internalDate: item.dataset.internalDate, labelIds: item.classList.contains("gmail-message-unread") ? ["UNREAD"] : [], payload: { headers: [{ name: "From", value: item.dataset.from }, { name: "Subject", value: item.dataset.subject }] } };
    item.replaceWith(this.renderMessage(message));
  },

  triageForItem(item) {
    const message = this.messages.find(entry => entry.threadId === item?.dataset.threadId);
    return message ? MailIntelligence.classify(message, this.categoryOverrides) : null;
  },

  async createTaskFromMessage(item) {
    const threadId = item?.dataset.threadId;
    if (!threadId) return;
    const triage = this.triageForItem(item);
    const duplicate = Tasks.data.some(task => !task.done && task.source === "gmail" && task.sourceId === threadId);
    if (duplicate) {
      this.setStatus("That email already has an open task in Operation HQ.", "connected");
      return;
    }
    Tasks.add(item.dataset.subject || "Review email", triage?.venture, triage?.suggestedMinutes || 15, {
      priority: triage?.priority === "urgent" ? "high" : triage?.priority === "important" ? "medium" : "low",
      source: "gmail",
      sourceId: threadId,
    });
    await Tasks.save();
    await Today?.render?.();
    this.setStatus(`Task added from “${item.dataset.subject || "email"}”.`, "connected");
  },

  async scheduleMessage(item) {
    if (!item?.dataset.threadId) return;
    const subject = item.dataset.subject || "Review email";
    const lower = subject.toLowerCase();
    const date = new Date();
    if (lower.includes("tomorrow")) date.setDate(date.getDate() + 1);
    const key = hqLocalDateKey(date);
    const marker = `Email: ${subject}`;
    const result = await CalendarRepository.addLegacy(key, marker);
    CalendarRepository.syncCalendar(result);
    if (!result.inverse.length) {
      this.setStatus("That email is already on the selected day in your calendar.", "connected");
      return;
    }
    await Calendar.render();
    await Today?.render?.();
    this.setStatus(`Scheduled for ${date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}.`, "connected");
  },

  openSocial(item) {
    const triage = this.triageForItem(item);
    if (!triage?.platformUrl) return;
    chrome.tabs.create({ url: triage.platformUrl });
  },

  async saveCategory(item, category) {
    const key = item?.dataset.threadId || item?.dataset.messageId;
    if (!key || ![...MailIntelligence.CATEGORY_RULES.map(rule => rule.id), "personal"].includes(category)) return;
    this.categoryOverrides[key] = category;
    await chrome.storage.local.set({ hq_gmail_category_overrides_v1: this.categoryOverrides });
    this.renderMessages(this.messages);
  },

  async handleMessageAction(event) {
    const item = event.target.closest(".gmail-message");
    if (!item) return;
    const select = event.target.closest(".gmail-category-select");
    if (select) {
      event.stopPropagation();
      if (event.type === "change") await this.saveCategory(item, select.value);
      return;
    }
    const button = event.target.closest("button[data-mail-action]");
    if (!button) {
      this.openThread(item.dataset.threadId);
      return;
    }
    event.stopPropagation();
    if (button.dataset.mailAction === "open") this.openThread(item.dataset.threadId);
    if (button.dataset.mailAction === "task") await this.createTaskFromMessage(item);
    if (button.dataset.mailAction === "calendar") await this.scheduleMessage(item);
    if (button.dataset.mailAction === "social") this.openSocial(item);
    if (button.dataset.mailAction === "followup") await this.toggleFollowup(item);
  },

  async loadInbox(token = this.token, pageToken = "", { allowCache = true } = {}) {
    const { list } = this.elements();
    list.innerHTML = `<li class="empty-state">Loading your inbox…</li>`;
    this.setStatus("Syncing Gmail…");
    const { hq_followups = [], hq_gmail_category_overrides_v1 = {} } = await chrome.storage.local.get(["hq_followups", "hq_gmail_category_overrides_v1"]);
    this.followups = Array.isArray(hq_followups) ? hq_followups : [];
    this.categoryOverrides = hq_gmail_category_overrides_v1 && typeof hq_gmail_category_overrides_v1 === "object" ? hq_gmail_category_overrides_v1 : {};
    this.currentQuery = this.buildQuery();
    if (allowCache && this.pageIndex === 0) {
      const cached = await this.readCache(this.currentQuery);
      if (cached?.messages?.length) this.renderMessages(cached.messages, { cached: true });
    }
    const params = new URLSearchParams({ maxResults: String(this.PAGE_SIZE), q: this.currentQuery });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await this.api(`messages?${params}`, token);
    this.nextPageToken = data.nextPageToken || null;
    if (!data.messages?.length) {
      list.replaceChildren();
      this.setStatus("Connected. No messages match this view.", "connected");
      this.updatePagination();
      return;
    }
    const settled = await Promise.allSettled(data.messages.map(message =>
      this.api(`messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, this.token || token)
    ));
    const messages = settled.filter(result => result.status === "fulfilled").map(result => result.value);
    if (!messages.length) throw new Error("Gmail returned the inbox list, but message details could not be loaded.");
    const failed = settled.length - messages.length;
    this.renderMessages(messages, { failed });
    if (this.pageIndex === 0) await this.writeCache(this.currentQuery, messages, this.nextPageToken);
    this.updatePagination();
  },

  async runSearch() {
    this.pageIndex = 0;
    this.pageTokens = [""];
    this.nextPageToken = null;
    const token = this.token || await this.getToken(false);
    await this.loadInbox(token, "", { allowCache: true });
  },

  async nextPage() {
    if (!this.nextPageToken) return;
    this.pageTokens[this.pageIndex + 1] = this.nextPageToken;
    this.pageIndex += 1;
    await this.loadInbox(this.token, this.pageTokens[this.pageIndex], { allowCache: false });
  },

  async previousPage() {
    if (this.pageIndex === 0) return;
    this.pageIndex -= 1;
    await this.loadInbox(this.token, this.pageTokens[this.pageIndex] || "", { allowCache: this.pageIndex === 0 });
  },

  async refresh() {
    const { refresh } = this.elements();
    refresh.disabled = true;
    try {
      // Refresh treats the visible search/filter controls as authoritative and
      // returns to page one, avoiding an old page token being applied to a new query.
      await this.runSearch();
    } catch (error) {
      console.error("Gmail refresh failed:", error);
      this.setStatus(this.diagnoseAuthError(error), "error");
    } finally {
      refresh.disabled = false;
    }
  },

  async disconnect() {
    try {
      if (this.token) await chrome.identity.removeCachedAuthToken({ token: this.token });
      if (chrome.identity.clearAllCachedAuthTokens) await chrome.identity.clearAllCachedAuthTokens();
    } finally {
      this.token = null;
      this.messages = [];
      await chrome.storage.local.remove(["hq_gmail_connected", "hq_gmail_cache_v1"]);
      this.elements().oauthHelp.hidden = true;
      this.elements().list.replaceChildren();
      this.elements().pagination.hidden = true;
      this.setConnectedUi(false);
      this.setStatus("Disconnected. No email data is loaded.");
    }
  },

  openThread(threadId) {
    if (!threadId) return;
    chrome.tabs.create({ url: `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}` });
  },

  async init() {
    const { connect, refresh, disconnect, list, previous, next, filter, oauthHelp, smartFilters } = this.elements();
    connect.addEventListener("click", () => this.connect());
    refresh.addEventListener("click", () => this.refresh());
    disconnect.addEventListener("click", () => this.disconnect());
    oauthHelp.addEventListener("click", () => chrome.tabs.create({ url: "https://console.cloud.google.com/auth/audience?project=hq-newtab" }));
    document.getElementById("gmail-search-form").addEventListener("submit", event => {
      event.preventDefault();
      this.runSearch().catch(error => this.setStatus(this.diagnoseAuthError(error), "error"));
    });
    filter.addEventListener("change", () => this.runSearch().catch(error => this.setStatus(this.diagnoseAuthError(error), "error")));
    previous.addEventListener("click", () => this.previousPage().catch(error => this.setStatus(this.diagnoseAuthError(error), "error")));
    next.addEventListener("click", () => this.nextPage().catch(error => this.setStatus(this.diagnoseAuthError(error), "error")));
    smartFilters.addEventListener("click", event => {
      const button = event.target.closest("button[data-smart-filter]");
      if (!button) return;
      this.smartFilter = button.dataset.smartFilter;
      this.renderMessages(this.messages);
    });
    list.addEventListener("click", event => this.handleMessageAction(event).catch(error => this.setStatus(`Email action failed: ${error.message}`, "error")));
    list.addEventListener("change", event => this.handleMessageAction(event).catch(error => this.setStatus(`Category update failed: ${error.message}`, "error")));
    list.addEventListener("keydown", event => {
      if (event.target.closest("button, select")) return;
      if (event.key === "Enter" || event.key === " ") {
        const item = event.target.closest(".gmail-message");
        if (item) {
          event.preventDefault();
          this.openThread(item.dataset.threadId);
        }
      }
    });
    const { hq_gmail_connected: connected, hq_gmail_category_overrides_v1 = {} } = await chrome.storage.local.get(["hq_gmail_connected", "hq_gmail_category_overrides_v1"]);
    this.categoryOverrides = hq_gmail_category_overrides_v1 && typeof hq_gmail_category_overrides_v1 === "object" ? hq_gmail_category_overrides_v1 : {};
    this.setConnectedUi(false);
    if (!connected) return;
    try {
      const token = await this.getToken(false);
      await this.loadInbox(token);
      this.setConnectedUi(true);
    } catch (error) {
      await chrome.storage.local.remove("hq_gmail_connected");
      this.setStatus("Gmail authorization expired. Connect again to continue.", "error");
      this.setConnectedUi(false);
    }
  }
};
    if (this.isAudienceError(error)) {
      return "Google blocked this account because HQ Newtab is still in testing. Add the account under Google Auth Platform → Audience → Test users, then connect again.";
    }
