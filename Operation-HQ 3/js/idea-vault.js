// idea-vault.js — "I had this idea first" proof, without exposing the idea
// to anyone. Hashes the exact text + timestamp with SHA-256 (Web Crypto,
// built into the browser, no library needed) — the hash is what you'd ever
// share as proof; the full text stays local unless you choose to reveal it.
// If you ever need external corroboration, email yourself the hash+timestamp
// — that gives you an independently-timestamped record via your own inbox,
// without this extension needing any external service.

const IdeaVault = {
  async sha256(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  },

  async stamp(text) {
    if (!text.trim()) return null;
    const timestamp = Date.now();
    const hash = await this.sha256(`${text}|${timestamp}`);
    const entry = { id: crypto.randomUUID(), text, timestamp, hash };
    const { hq_idea_vault } = await chrome.storage.local.get("hq_idea_vault");
    const vault = hq_idea_vault || [];
    vault.unshift(entry);
    await chrome.storage.local.set({ hq_idea_vault: vault });
    return entry;
  },

  async getAll() {
    const { hq_idea_vault } = await chrome.storage.local.get("hq_idea_vault");
    return hq_idea_vault || [];
  },

  async remove(id) {
    const vault = (await this.getAll()).filter(e => e.id !== id);
    await chrome.storage.local.set({ hq_idea_vault: vault });
  },

  receiptText(entry) {
    const d = new Date(entry.timestamp);
    return `Operation HQ Idea Vault receipt\nHash (SHA-256 of text+timestamp): ${entry.hash}\nStamped: ${d.toISOString()} (${d.toLocaleString()})\n\nTo verify later: re-hash "<exact text>|${entry.timestamp}" with SHA-256 and confirm it matches the hash above.`;
  },

  async render() {
    const list = document.getElementById("vault-list");
    if (!list) return;
    const vault = await this.getAll();
    if (!vault.length) {
      list.innerHTML = '<li class="empty-state">Nothing stamped yet.</li>';
      return;
    }
    list.innerHTML = vault.map(e => `
      <li class="vault-item" data-id="${escapeAttribute(e.id)}">
        <div class="vault-text">${escapeHtml(e.text)}</div>
        <div class="vault-meta">${new Date(e.timestamp).toLocaleString()} · <code>${e.hash.slice(0, 16)}…</code></div>
        <div class="vault-actions">
          <button class="vault-copy">Copy receipt</button>
          <button class="vault-del" aria-label="Delete idea receipt">${Icons.span("x")}</button>
        </div>
      </li>
    `).join("");

    list.querySelectorAll(".vault-item").forEach(el => {
      const id = el.dataset.id;
      const entry = vault.find(e => e.id === id);
      el.querySelector(".vault-copy").onclick = async () => {
        await navigator.clipboard.writeText(this.receiptText(entry));
        Wallpaper?.toast?.("Receipt copied — paste it anywhere you want an external timestamp (e.g. email it to yourself).");
      };
      el.querySelector(".vault-del").onclick = () => { this.remove(id); this.render(); };
    });
  },

  init() {
    document.getElementById("vault-stamp-btn").onclick = async () => {
      const input = document.getElementById("vault-input");
      const text = input.value.trim();
      if (!text) return;
      await this.stamp(text);
      input.value = "";
      this.render();
    };
    this.render();
  },
};
