// srs.js — Recall Lab: general-purpose, local spaced repetition.
// SM-2 state changes only on the first grade for a card in a session.

const SRS_STORAGE_CARDS = "hq_srs_cards";
const SRS_STORAGE_LANGS = "hq_srs_languages"; // Compatibility key; values are subjects/decks.
const SRS_STORAGE_SETTINGS = "hq_srs_settings_v2";
const SRS_STORAGE_UNDO = "hq_srs_delete_undo_v1";
const DEFAULT_SRS_LANGUAGES = [];

function sm2(card, quality) {
  const c = { ...card };
  if (quality < 3) {
    c.repetitions = 0;
    c.intervalDays = 1;
    c.lapses = (Number(c.lapses) || 0) + 1;
  } else {
    if (c.repetitions === 0) c.intervalDays = 1;
    else if (c.repetitions === 1) c.intervalDays = 6;
    else c.intervalDays = Math.max(1, Math.round(c.intervalDays * c.easeFactor));
    c.repetitions += 1;
  }
  c.easeFactor = Math.max(1.3, (Number(c.easeFactor) || 2.5) + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  c.dueDate = Date.now() + c.intervalDays * 86400000;
  c.lastReviewed = Date.now();
  return c;
}

const SRS = {
  cards: [],
  languages: [],
  settings: { sessionLimit: 20 },
  _queue: [],
  _current: null,
  _reviewedThisSession: 0,
  _sessionTotal: 0,
  _sessionDeck: "all",
  _editingId: null,
  initialized: false,

  normalizeCard(card) {
    if (!card?.id || !String(card.front || "").trim() || !String(card.back || "").trim()) return null;
    return {
      ...card,
      id: String(card.id), language: String(card.language || "Unassigned").trim().slice(0, 60) || "Unassigned",
      front: String(card.front).trim().slice(0, 1200), back: String(card.back).trim().slice(0, 2400),
      tags: Array.isArray(card.tags) ? card.tags.map(value => String(value).trim().toLowerCase()).filter(Boolean).slice(0, 12) : [],
      repetitions: Math.max(0, Number(card.repetitions) || 0), easeFactor: Math.max(1.3, Number(card.easeFactor) || 2.5),
      intervalDays: Math.max(0, Number(card.intervalDays) || 0), dueDate: Number(card.dueDate) || Date.now(),
      lastReviewed: Number(card.lastReviewed) || null, created: Number(card.created) || Date.now(),
      lapses: Math.max(0, Number(card.lapses) || 0), suspended: !!card.suspended,
    };
  },

  async init() {
    const saved = await chrome.storage.local.get([SRS_STORAGE_CARDS, SRS_STORAGE_LANGS, SRS_STORAGE_SETTINGS, SRS_STORAGE_UNDO]);
    this.cards = (Array.isArray(saved[SRS_STORAGE_CARDS]) ? saved[SRS_STORAGE_CARDS] : []).map(card => this.normalizeCard(card)).filter(Boolean).slice(0, 10000);
    this.languages = (Array.isArray(saved[SRS_STORAGE_LANGS]) ? saved[SRS_STORAGE_LANGS] : DEFAULT_SRS_LANGUAGES).map(value => String(value).trim()).filter(Boolean).slice(0, 100);
    this.settings = { sessionLimit: Math.max(5, Math.min(100, Number(saved[SRS_STORAGE_SETTINGS]?.sessionLimit) || 20)) };
    if (!saved[SRS_STORAGE_LANGS]) await chrome.storage.local.set({ [SRS_STORAGE_LANGS]: this.languages });
    if (!saved[SRS_STORAGE_SETTINGS]) await chrome.storage.local.set({ [SRS_STORAGE_SETTINGS]: this.settings });

    if (!this.initialized) {
      document.getElementById("srs-start-review-btn").onclick = () => this.startReview();
      document.getElementById("srs-show-answer-btn").onclick = () => this.showAnswer();
      document.getElementById("srs-grade-buttons").querySelectorAll(".srs-grade").forEach(button => button.onclick = () => this.grade(Number(button.dataset.q)));
      document.getElementById("srs-add-card-btn").onclick = () => this.addCard();
      document.getElementById("srs-add-lang-btn").onclick = () => this.addLanguage();
      document.getElementById("srs-new-lang-input").onkeydown = event => { if (event.key === "Enter") { event.preventDefault(); this.addLanguage(); } };
      document.getElementById("srs-session-deck").onchange = () => this.render();
      document.getElementById("srs-session-limit").onchange = event => this.setSessionLimit(event.currentTarget.value);
      document.getElementById("srs-library-deck").onchange = () => this.render();
      document.getElementById("srs-search").oninput = () => this.render();
      document.getElementById("srs-export-btn").onclick = () => this.exportCards();
      document.getElementById("srs-import-input").onchange = event => { const [file] = event.currentTarget.files; event.currentTarget.value = ""; if (file) this.importFile(file); };
      document.getElementById("srs-undo-delete-btn").onclick = () => this.undoDelete();
      this.initialized = true;
    }
    document.getElementById("srs-undo-delete-btn").classList.toggle("hidden", !saved[SRS_STORAGE_UNDO]);
    document.getElementById("srs-session-limit").value = String(this.settings.sessionLimit);
    this.renderLangOptions(); this.renderLangList(); this.render();
  },

  dueCards(deck = "all") { return this.cards.filter(card => !card.suspended && card.dueDate <= Date.now() && (deck === "all" || card.language === deck)); },
  dueCount(deck = "all") { return this.dueCards(deck).length; },
  status(message) { const element = document.getElementById("srs-status"); if (element) element.textContent = message; },

  async saveCards() {
    this.cards = this.cards.map(card => this.normalizeCard(card)).filter(Boolean).slice(0, 10000);
    await chrome.storage.local.set({ [SRS_STORAGE_CARDS]: this.cards });
  },
  async saveLanguages() { await chrome.storage.local.set({ [SRS_STORAGE_LANGS]: this.languages }); },

  renderLangOptions() {
    const add = document.getElementById("srs-new-lang");
    const session = document.getElementById("srs-session-deck");
    const library = document.getElementById("srs-library-deck");
    const sessionValue = session.value || "all", libraryValue = library.value || "all";
    add.innerHTML = this.languages.length ? this.languages.map(name => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`).join("") : '<option value="">Add a subject below first</option>';
    const options = '<option value="all">All subjects</option>' + this.languages.map(name => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`).join("");
    session.innerHTML = options; library.innerHTML = options;
    if ([...session.options].some(option => option.value === sessionValue)) session.value = sessionValue;
    if ([...library.options].some(option => option.value === libraryValue)) library.value = libraryValue;
  },

  renderLangList() {
    const list = document.getElementById("srs-lang-list");
    list.innerHTML = this.languages.length ? this.languages.map(name => `<span class="venture-chip">${escapeHtml(name)}<button type="button" data-lang="${escapeAttribute(name)}" aria-label="Remove ${escapeAttribute(name)} from subject choices">${Icons.span("x")}</button></span>`).join("") : '<p class="settings-note">No subjects yet. Add the actual subject you want to revise.</p>';
    list.querySelectorAll("button").forEach(button => button.onclick = () => this.removeLanguage(button.dataset.lang));
  },

  async addLanguage() {
    const input = document.getElementById("srs-new-lang-input");
    const name = input.value.trim().slice(0, 60);
    if (name && !this.languages.some(value => value.toLowerCase() === name.toLowerCase())) {
      this.languages.push(name); await this.saveLanguages(); this.renderLangOptions(); this.renderLangList(); this.render();
    }
    input.value = "";
  },

  async removeLanguage(name) {
    const used = this.cards.filter(card => card.language === name).length;
    if (used && !confirm(`Remove “${name}” from new-card choices? ${used} existing card${used === 1 ? " keeps" : "s keep"} the subject and no card is deleted.`)) return;
    this.languages = this.languages.filter(value => value !== name);
    await this.saveLanguages(); this.renderLangOptions(); this.renderLangList(); this.render();
  },

  async setSessionLimit(value) {
    this.settings.sessionLimit = Math.max(5, Math.min(100, Number(value) || 20));
    document.getElementById("srs-session-limit").value = String(this.settings.sessionLimit);
    await chrome.storage.local.set({ [SRS_STORAGE_SETTINGS]: this.settings }); this.render();
  },

  async addCard() {
    if (!this.languages.length) return this.status("Add a real subject before creating a card.");
    const language = document.getElementById("srs-new-lang").value;
    const front = document.getElementById("srs-new-front").value.trim();
    const back = document.getElementById("srs-new-back").value.trim();
    const tags = document.getElementById("srs-new-tags").value.split(",").map(value => value.trim().toLowerCase()).filter(Boolean).slice(0, 12);
    if (!language || !front || !back) return this.status("A card needs a subject, prompt and answer.");
    this.cards.push(this.normalizeCard({ id: crypto.randomUUID(), language, front, back, tags, repetitions: 0, easeFactor: 2.5, intervalDays: 0, dueDate: Date.now(), created: Date.now(), lapses: 0, suspended: false }));
    await this.saveCards();
    document.getElementById("srs-new-front").value = ""; document.getElementById("srs-new-back").value = ""; document.getElementById("srs-new-tags").value = "";
    this.status("Card added and due now."); this.render();
  },

  async removeCard(id) {
    const card = this.cards.find(value => value.id === id);
    if (!card || !confirm(`Delete this ${card.language} card? One-step undo will remain available.`)) return;
    await chrome.storage.local.set({ [SRS_STORAGE_UNDO]: card });
    this.cards = this.cards.filter(value => value.id !== id); await this.saveCards(); this.render();
    document.getElementById("srs-undo-delete-btn").classList.remove("hidden"); this.status("Card deleted. Undo is available.");
  },

  async undoDelete() {
    const saved = await chrome.storage.local.get(SRS_STORAGE_UNDO);
    const card = this.normalizeCard(saved[SRS_STORAGE_UNDO]);
    if (!card) return;
    if (!this.cards.some(value => value.id === card.id)) this.cards.push(card);
    await chrome.storage.local.remove(SRS_STORAGE_UNDO);
    await this.saveCards();
    document.getElementById("srs-undo-delete-btn").classList.add("hidden"); this.render(); this.status("Deleted card restored.");
  },
  startEdit(id) { this._editingId = id; this.render(); },
  cancelEdit() { this._editingId = null; this.render(); },

  async saveEdit(id) {
    const front = document.getElementById(`srs-edit-front-${id}`).value.trim();
    const back = document.getElementById(`srs-edit-back-${id}`).value.trim();
    const language = document.getElementById(`srs-edit-lang-${id}`).value;
    const tags = document.getElementById(`srs-edit-tags-${id}`).value.split(",").map(value => value.trim().toLowerCase()).filter(Boolean).slice(0, 12);
    if (!front || !back || !language) return this.status("A card needs a subject, prompt and answer.");
    const index = this.cards.findIndex(card => card.id === id);
    if (index !== -1) this.cards[index] = this.normalizeCard({ ...this.cards[index], front, back, language, tags });
    await this.saveCards(); this._editingId = null; this.render(); this.status("Card updated without resetting its review history.");
  },

  async toggleSuspend(id) {
    const card = this.cards.find(value => value.id === id); if (!card) return;
    card.suspended = !card.suspended; await this.saveCards(); this.render();
    this.status(card.suspended ? "Card suspended; it will not enter review sessions." : "Card restored to its existing schedule.");
  },

  startReview() {
    const deck = document.getElementById("srs-session-deck").value || "all";
    this._sessionDeck = deck;
    this._queue = this.dueCards(deck).sort((a, b) => a.dueDate - b.dueDate || a.repetitions - b.repetitions).slice(0, this.settings.sessionLimit);
    this._reviewedThisSession = 0; this._sessionTotal = this._queue.length;
    if (!this._queue.length) return this.status("Nothing is due in that subject right now.");
    document.getElementById("srs-add-group").classList.add("hidden"); document.getElementById("srs-review-summary").classList.add("hidden");
    document.querySelector(".srs-library-controls").classList.add("hidden"); document.getElementById("srs-card-list").classList.add("hidden");
    document.getElementById("srs-review-area").classList.remove("hidden"); this.nextCard();
  },

  nextCard() {
    document.getElementById("srs-review-back").classList.add("hidden"); document.getElementById("srs-grade-buttons").classList.add("hidden"); document.getElementById("srs-show-answer-btn").classList.remove("hidden");
    if (!this._queue.length) return this.endReview();
    this._current = this._queue[0];
    document.getElementById("srs-review-lang").textContent = this._current.__sessionRetry ? `${this._current.language} · one more time` : this._current.language;
    document.getElementById("srs-review-front").textContent = this._current.front; document.getElementById("srs-review-back").textContent = this._current.back;
    document.getElementById("srs-review-progress").textContent = `${Math.min(this._reviewedThisSession + 1, this._sessionTotal)} of ${this._sessionTotal} scheduled cards${this._current.__sessionRetry ? " · reinforcement pass" : ""}`;
  },

  showAnswer() { document.getElementById("srs-review-back").classList.remove("hidden"); document.getElementById("srs-grade-buttons").classList.remove("hidden"); document.getElementById("srs-show-answer-btn").classList.add("hidden"); },

  async grade(quality) {
    if (!this._current || ![1, 3, 4, 5].includes(quality)) return;
    const isRetry = !!this._current.__sessionRetry;
    if (!isRetry) {
      const updated = sm2(this._current, quality); const index = this.cards.findIndex(card => card.id === updated.id);
      if (index !== -1) this.cards[index] = updated; await this.saveCards();
    }
    const graded = this._current; this._queue.shift();
    if (quality < 3 && !isRetry) {
      const current = this.cards.find(card => card.id === graded.id) || graded;
      this._queue.splice(Math.min(this._queue.length, 3), 0, { ...current, __sessionRetry: true });
    }
    if (!isRetry) this._reviewedThisSession += 1;
    this.nextCard();
  },

  endReview() {
    document.getElementById("srs-review-area").classList.add("hidden"); document.getElementById("srs-add-group").classList.remove("hidden");
    document.getElementById("srs-review-summary").classList.remove("hidden"); document.querySelector(".srs-library-controls").classList.remove("hidden");
    document.getElementById("srs-card-list").classList.remove("hidden"); this._current = null;
    const languageDeck = /\b(language|english|hindi|tamil|gujarati|japanese|french|spanish|mandarin|chinese|korean)\b/i.test(this._sessionDeck);
    if (this._reviewedThisSession > 0 && languageDeck && typeof DailyTasks !== "undefined") DailyTasks.bump("lang", 1);
    this.status(this._reviewedThisSession ? `${this._reviewedThisSession} scheduled card${this._reviewedThisSession === 1 ? "" : "s"} reviewed. Reinforcement passes were not double-counted.` : "Review ended.");
    this.render();
  },

  parseImport(name, text) {
    if (name.toLowerCase().endsWith(".json")) {
      const value = JSON.parse(text), rows = Array.isArray(value) ? value : value.cards;
      if (!Array.isArray(rows)) throw new Error("JSON must be an array of cards or an object with a cards array");
      return rows.map(row => ({ ...row, language: row.language || row.subject || row.deck, front: row.front, back: row.back, tags: row.tags }));
    }
    return text.split(/\r?\n/).filter(Boolean).map(line => { const [language, front, back, tags = ""] = line.split("\t"); return { language, front, back, tags: tags.split(",") }; });
  },

  async importFile(file) {
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Import must be 5 MB or smaller");
      const rows = this.parseImport(file.name, await file.text()).slice(0, 5000); let added = 0, skipped = 0;
      for (const row of rows) {
        const language = String(row.language || "").trim().slice(0, 60), front = String(row.front || "").trim().slice(0, 1200), back = String(row.back || "").trim().slice(0, 2400);
        if (!language || !front || !back || this.cards.some(card => card.language === language && card.front === front && card.back === back)) { skipped += 1; continue; }
        if (!this.languages.includes(language)) this.languages.push(language);
        this.cards.push(this.normalizeCard({ ...row, id: crypto.randomUUID(), language, front, back, tags: Array.isArray(row.tags) ? row.tags : [], repetitions: Number(row.repetitions) || 0, easeFactor: Number(row.easeFactor) || 2.5, intervalDays: Number(row.intervalDays) || 0, dueDate: Number(row.dueDate) || Date.now(), created: Number(row.created) || Date.now(), lastReviewed: Number(row.lastReviewed) || null, lapses: Number(row.lapses) || 0, suspended: !!row.suspended })); added += 1;
      }
      await Promise.all([this.saveCards(), this.saveLanguages()]); this.renderLangOptions(); this.renderLangList(); this.render();
      this.status(`${added} card${added === 1 ? "" : "s"} imported; ${skipped} invalid or exact duplicate row${skipped === 1 ? "" : "s"} skipped.`);
    } catch (error) { this.status(`Import stopped safely: ${error.message}`); }
  },

  exportCards() {
    if (!this.cards.length) return this.status("There are no cards to export.");
    const payload = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), cards: this.cards }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `operation-hq-recall-${hqLocalDateKey()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); this.status("Recall cards exported with scheduling history.");
  },

  filteredCards() {
    const deck = document.getElementById("srs-library-deck")?.value || "all", query = (document.getElementById("srs-search")?.value || "").trim().toLowerCase();
    return this.cards.filter(card => (deck === "all" || card.language === deck) && (!query || [card.language, card.front, card.back, ...(card.tags || [])].join(" ").toLowerCase().includes(query)));
  },

  render() {
    const sessionDeck = document.getElementById("srs-session-deck")?.value || "all", due = this.dueCount(sessionDeck), totalDue = this.dueCount();
    const badge = document.getElementById("srs-due-badge"); if (badge) { badge.textContent = totalDue || ""; badge.classList.toggle("hidden", totalDue === 0); }
    document.getElementById("srs-due-count").textContent = `${due} card${due === 1 ? "" : "s"} due${sessionDeck === "all" ? " today" : ` in ${sessionDeck}`}`;
    document.getElementById("srs-start-review-btn").disabled = due === 0;
    const newCards = this.cards.filter(card => card.repetitions === 0 && !card.suspended).length;
    const learning = this.cards.filter(card => card.repetitions > 0 && card.intervalDays < 21 && !card.suspended).length;
    const mature = this.cards.filter(card => card.intervalDays >= 21 && !card.suspended).length, suspended = this.cards.filter(card => card.suspended).length;
    document.getElementById("srs-metrics").innerHTML = `<div><strong>${totalDue}</strong><span>due now</span></div><div><strong>${newCards}</strong><span>new</span></div><div><strong>${learning}</strong><span>learning</span></div><div><strong>${mature}</strong><span>mature</span></div><div><strong>${suspended}</strong><span>suspended</span></div>`;
    const list = document.getElementById("srs-card-list"), cards = this.filteredCards().sort((a, b) => Number(a.suspended) - Number(b.suspended) || a.dueDate - b.dueDate);
    if (!cards.length) { list.innerHTML = '<li class="empty-state">No cards match this view. Add a real subject and card above.</li>'; return; }
    list.innerHTML = cards.map(card => {
      if (card.id === this._editingId) {
        const decks = this.languages.includes(card.language) ? this.languages : [card.language, ...this.languages];
        return `<li class="srs-card srs-edit-row" data-id="${escapeAttribute(card.id)}"><select id="srs-edit-lang-${escapeAttribute(card.id)}" aria-label="Card subject">${decks.map(name => `<option value="${escapeAttribute(name)}"${name === card.language ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><textarea id="srs-edit-front-${escapeAttribute(card.id)}" rows="2" aria-label="Card prompt">${escapeHtml(card.front)}</textarea><textarea id="srs-edit-back-${escapeAttribute(card.id)}" rows="3" aria-label="Card answer">${escapeHtml(card.back)}</textarea><input id="srs-edit-tags-${escapeAttribute(card.id)}" value="${escapeAttribute((card.tags || []).join(", "))}" aria-label="Card tags"><div class="capture-actions"><button type="button" class="srs-save-edit">Save</button><button type="button" class="srs-cancel-edit secondary-btn">Cancel</button></div></li>`;
      }
      const dueIn = card.suspended ? "Suspended" : card.dueDate <= Date.now() ? "Due now" : `Due in ${Math.max(1, Math.ceil((card.dueDate - Date.now()) / 86400000))}d`;
      return `<li class="srs-card${card.suspended ? " suspended" : ""}" data-id="${escapeAttribute(card.id)}"><div class="srs-card-signal"><span>${escapeHtml(card.language)}</span><b>${escapeHtml(dueIn)}</b></div><div class="srs-card-content"><strong>${escapeHtml(card.front)}</strong><p>${escapeHtml(card.back)}</p>${card.tags?.length ? `<div class="srs-tags">${card.tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}<small>${card.repetitions} successful review${card.repetitions === 1 ? "" : "s"} · ease ${card.easeFactor.toFixed(2)} · ${card.lapses} lapse${card.lapses === 1 ? "" : "s"}</small></div><div class="srs-card-actions"><button type="button" class="srs-suspend secondary-btn">${card.suspended ? "Resume" : "Suspend"}</button><button type="button" class="srs-edit secondary-btn">Edit</button><button type="button" class="srs-del secondary-btn">Delete</button></div></li>`;
    }).join("");
    list.querySelectorAll(".srs-del").forEach(button => button.onclick = () => this.removeCard(button.closest("[data-id]").dataset.id));
    list.querySelectorAll(".srs-edit").forEach(button => button.onclick = () => this.startEdit(button.closest("[data-id]").dataset.id));
    list.querySelectorAll(".srs-suspend").forEach(button => button.onclick = () => this.toggleSuspend(button.closest("[data-id]").dataset.id));
    list.querySelectorAll(".srs-save-edit").forEach(button => button.onclick = () => this.saveEdit(button.closest("[data-id]").dataset.id));
    list.querySelectorAll(".srs-cancel-edit").forEach(button => button.onclick = () => this.cancelEdit());
  },
};
