// notes-editor.js — one canonical, versioned Notes document.
//
// Older builds let the rich editor, Capture and Today write two storage keys
// independently, then tried to merge any "missing" lines back into the editor.
// Storage events and repeated initialisation could therefore amplify one append
// into two or three copies. This module is now the only Notes writer. The old
// keys remain derived compatibility mirrors for features that only need plain
// text, never competing sources of truth.

const NotesEditor = {
  DOC_KEY: "hq_notes_document_v2",
  RECOVERY_KEY: "hq_notes_recovery_v1",
  editor: null,
  document: null,
  _initPromise: null,
  _debounceTimer: null,
  _saveChain: Promise.resolve(),
  _storageListenerBound: false,
  _applyingExternal: false,

  escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  },

  normaliseLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(line => line.replace(/^[•\-*]\s*/, "").trim())
      .filter(Boolean);
  },

  htmlFromPlainText(text) {
    const lines = this.normaliseLines(text);
    return lines.length ? lines.map(line => `<p>${this.escapeHtml(line)}</p>`).join("") : "<p></p>";
  },

  plainFromHtml(html) {
    const surface = document.createElement("div");
    surface.innerHTML = String(html || "");
    surface.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    surface.querySelectorAll("p,li,h1,h2,h3,h4,h5,h6,blockquote,pre").forEach(block => block.append("\n"));
    return surface.textContent.split("\n").map(line => line.trim()).filter(Boolean).join("\n");
  },

  // Deliberately narrow repair: only collapse when the complete sequence is
  // repeated exactly three times. A student may intentionally repeat a line;
  // we do not silently deduplicate normal note content.
  collapseExactTriplication(lines) {
    if (!Array.isArray(lines) || lines.length < 3 || lines.length % 3 !== 0) return null;
    const size = lines.length / 3;
    const first = lines.slice(0, size);
    const same = part => part.length === first.length && part.every((line, index) => line === first[index]);
    return same(lines.slice(size, size * 2)) && same(lines.slice(size * 2)) ? first : null;
  },

  validDocument(value) {
    return !!value && typeof value === "object" && !Array.isArray(value)
      && value.version === 2 && typeof value.html === "string" && typeof value.plain === "string";
  },

  nextRevision(previous = 0) {
    return Math.max(Date.now(), Number(previous || 0) + 1);
  },

  createDocument(html, plain, previousRevision = 0, source = "editor") {
    return {
      version: 2,
      html: String(html || "<p></p>"),
      plain: String(plain || ""),
      revision: this.nextRevision(previousRevision),
      updatedAt: Date.now(),
      source,
    };
  },

  async loadDocument() {
    const saved = await chrome.storage.local.get([this.DOC_KEY, "hq_notes_html", "hq_notes", this.RECOVERY_KEY]);
    let doc = this.validDocument(saved[this.DOC_KEY]) ? saved[this.DOC_KEY] : null;

    if (!doc) {
      const legacyHtml = typeof saved.hq_notes_html === "string" ? saved.hq_notes_html : "";
      const legacyPlain = typeof saved.hq_notes === "string" && saved.hq_notes.trim()
        ? saved.hq_notes
        : this.plainFromHtml(legacyHtml);
      doc = this.createDocument(legacyHtml || this.htmlFromPlainText(legacyPlain), legacyPlain, 0, "legacy-migration");
    }

    const lines = this.normaliseLines(doc.plain);
    const repaired = this.collapseExactTriplication(lines);
    if (repaired && !saved[this.RECOVERY_KEY]) {
      await chrome.storage.local.set({
        [this.RECOVERY_KEY]: { document: doc, detectedAt: Date.now(), reason: "exact-triplication" },
      });
      const plain = repaired.join("\n");
      doc = this.createDocument(this.htmlFromPlainText(plain), plain, doc.revision, "triplication-repair");
    }

    await this.writeDocument(doc, { keepRevision: true });
    this.document = doc;
    this.refreshMeta();
    return doc;
  },

  async writeDocument(doc, { keepRevision = false } = {}) {
    const normalized = keepRevision ? { ...doc } : this.createDocument(doc.html, doc.plain, doc.revision, doc.source);
    this._saveChain = this._saveChain.catch(() => {}).then(async () => {
      await chrome.storage.local.set({
        [this.DOC_KEY]: normalized,
        hq_notes_html: normalized.html,
        hq_notes: normalized.plain,
      });
      this.document = normalized;
      this.setSaveStatus("Saved locally");
      this.refreshMeta();
      return normalized;
    });
    return this._saveChain;
  },

  editorSnapshot(source = "editor") {
    if (!this.editor) return this.document || this.createDocument("<p></p>", "", 0, source);
    const html = this.editor.getHTML();
    const plain = this.editor.getText({ blockSeparator: "\n" }).split("\n").map(line => line.trim()).filter(Boolean).join("\n");
    return this.createDocument(html, plain, this.document?.revision, source);
  },

  async persist(source = "editor") {
    return this.writeDocument(this.editorSnapshot(source), { keepRevision: true });
  },

  debouncedPersist() {
    this.setSaveStatus("Saving…");
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.persist().catch(error => {
      console.error("Notes save failed:", error);
      this.setSaveStatus("Save failed — retrying on next edit", true);
    }), 350);
  },

  async appendExternal(value, source = "capture") {
    const text = String(value || "").trim();
    if (!text) return null;
    if (!this.document) await this.loadDocument();
    const previous = structuredClone(this.document);
    const safe = this.escapeHtml(text).replace(/\r?\n/g, "<br>");

    if (this.editor) {
      this._applyingExternal = true;
      this.editor.commands.insertContent(`<p>${safe}</p>`);
      this._applyingExternal = false;
      clearTimeout(this._debounceTimer);
      await this.persist(source);
    } else {
      const separator = this.document.plain ? "\n" : "";
      const doc = this.createDocument(
        `${this.document.html === "<p></p>" ? "" : this.document.html}<p>${safe}</p>`,
        `${this.document.plain}${separator}${text}`,
        this.document.revision,
        source,
      );
      await this.writeDocument(doc, { keepRevision: true });
      const fallback = document.getElementById("notes-area-fallback");
      if (fallback) fallback.value = doc.plain;
    }
    return { previous };
  },

  async restoreSnapshot(receipt) {
    const previous = receipt?.previous;
    if (!this.validDocument(previous)) return false;
    const restored = this.createDocument(previous.html, previous.plain, this.document?.revision, "undo");
    await this.writeDocument(restored, { keepRevision: true });
    this.applyDocument(restored);
    return true;
  },

  applyDocument(doc) {
    if (!this.validDocument(doc)) return;
    this.document = doc;
    if (this.editor && this.editor.getHTML() !== doc.html) {
      this._applyingExternal = true;
      this.editor.commands.setContent(doc.html, false);
      this._applyingExternal = false;
    }
    const fallback = document.getElementById("notes-area-fallback");
    if (fallback && fallback.value !== doc.plain) fallback.value = doc.plain;
    this.refreshMeta();
  },

  setSaveStatus(message, error = false) {
    const status = document.getElementById("notes-save-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = error ? "error" : "saved";
  },

  refreshMeta() {
    const plain = this.document?.plain || "";
    const words = plain.trim() ? plain.trim().split(/\s+/).length : 0;
    const count = document.getElementById("notes-word-count");
    if (count) count.textContent = `${words} word${words === 1 ? "" : "s"}`;
  },

  search(query) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    const result = document.getElementById("notes-search-result");
    if (!result) return;
    if (!needle) { result.textContent = ""; return; }
    const haystack = (this.document?.plain || "").toLocaleLowerCase();
    let count = 0;
    for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) count += 1;
    result.textContent = count ? `${count} match${count === 1 ? "" : "es"}` : "No matches";
  },

  toolbarAction(command) {
    if (!this.editor) return;
    const chain = this.editor.chain().focus();
    const actions = {
      bold: () => chain.toggleBold().run(),
      italic: () => chain.toggleItalic().run(),
      bulletList: () => chain.toggleBulletList().run(),
      orderedList: () => chain.toggleOrderedList().run(),
      heading: () => chain.toggleHeading({ level: 2 }).run(),
      code: () => chain.toggleCodeBlock().run(),
      blockquote: () => chain.toggleBlockquote().run(),
    };
    actions[command]?.();
  },

  updateToolbarState() {
    if (!this.editor) return;
    const active = {
      bold: this.editor.isActive("bold"),
      italic: this.editor.isActive("italic"),
      bulletList: this.editor.isActive("bulletList"),
      orderedList: this.editor.isActive("orderedList"),
      heading: this.editor.isActive("heading", { level: 2 }),
      code: this.editor.isActive("codeBlock"),
      blockquote: this.editor.isActive("blockquote"),
    };
    document.querySelectorAll("#notes-toolbar [data-cmd]").forEach(button => {
      button.classList.toggle("active", !!active[button.dataset.cmd]);
      button.setAttribute("aria-pressed", String(!!active[button.dataset.cmd]));
    });
  },

  bindSharedControls() {
    document.getElementById("notes-toolbar")?.querySelectorAll("[data-cmd]").forEach(button => {
      button.onclick = () => this.toolbarAction(button.dataset.cmd);
    });
    const search = document.getElementById("notes-search");
    if (search) search.oninput = () => this.search(search.value);
    const recovery = document.getElementById("notes-restore-recovery");
    if (recovery) recovery.onclick = async () => {
      const saved = await chrome.storage.local.get(this.RECOVERY_KEY);
      const doc = saved[this.RECOVERY_KEY]?.document;
      if (!this.validDocument(doc)) return;
      const restored = this.createDocument(doc.html, doc.plain, this.document?.revision, "manual-recovery");
      await this.writeDocument(restored, { keepRevision: true });
      this.applyDocument(restored);
      await chrome.storage.local.remove(this.RECOVERY_KEY);
      recovery.classList.add("hidden");
      this.setSaveStatus("Previous copy restored");
    };
    const exportButton = document.getElementById("notes-export");
    if (exportButton) exportButton.onclick = () => {
      const blob = new Blob([this.document?.plain || ""], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `operation-hq-notes-${new Date().toISOString().slice(0, 10)}.txt`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
  },

  bindStorageListener() {
    if (this._storageListenerBound || !chrome.storage?.onChanged) return;
    this._storageListenerBound = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const incoming = changes[this.DOC_KEY]?.newValue;
      if (!this.validDocument(incoming) || incoming.revision <= Number(this.document?.revision || 0)) return;
      this.applyDocument(incoming);
    });
  },

  init() {
    if (!this._initPromise) this._initPromise = this._init();
    return this._initPromise;
  },

  async _init() {
    const container = document.getElementById("notes-editor-container");
    const fallback = document.getElementById("notes-area-fallback");
    const toolbar = document.getElementById("notes-toolbar");
    if (!container || !fallback) return;

    const doc = await this.loadDocument();
    this.bindSharedControls();
    this.bindStorageListener();
    const recovery = await chrome.storage.local.get(this.RECOVERY_KEY);
    document.getElementById("notes-restore-recovery")?.classList.toggle("hidden", !recovery[this.RECOVERY_KEY]);

    if (typeof TiptapBundle === "undefined") {
      fallback.classList.remove("hidden");
      fallback.value = doc.plain;
      toolbar?.classList.add("hidden");
      fallback.oninput = () => {
        this.document = this.createDocument(this.htmlFromPlainText(fallback.value), fallback.value, this.document?.revision, "fallback");
        this.debouncedPersist();
      };
      this.setSaveStatus("Plain editor · autosaved locally");
      return;
    }

    const { Editor, StarterKit, Placeholder } = TiptapBundle;
    this.editor = new Editor({
      element: container,
      extensions: [StarterKit, Placeholder.configure({ placeholder: "Start with the thought—not the formatting…" })],
      content: doc.html,
      onUpdate: () => {
        if (!this._applyingExternal) {
          this.document = this.editorSnapshot("editor");
          this.debouncedPersist();
          this.refreshMeta();
        }
        this.updateToolbarState();
      },
      onSelectionUpdate: () => this.updateToolbarState(),
    });
    this.updateToolbarState();
    this.setSaveStatus("Saved locally");
  },
};
