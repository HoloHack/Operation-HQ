// calendar-repository.js — single-writer calendar authority.
//
// Every Calendar, Today, Gmail, Schedule, Assignment and Assessment write is
// expressed as a small operation. The service worker serializes those
// operations, reads the newest state immediately before each commit, and
// returns an operation-specific inverse for safe undo. This prevents a stale
// new-tab snapshot (or an old undo snapshot) from erasing unrelated events.

const CalendarRepository = {
  EVENTS_KEY: "hq_calendar_events",
  DETAILS_KEY: "hq_calendar_details_v2",
  IDS_KEY: "hq_calendar_entry_ids_v1",
  REVISION_KEY: "hq_calendar_revision_v1",
  _writeQueue: Promise.resolve(),

  validMap(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  },

  isAuthority() {
    return typeof document === "undefined" || typeof chrome.runtime?.sendMessage !== "function";
  },

  entryId(prefix = "legacy") {
    return `${prefix}:${crypto.randomUUID()}`;
  },

  validateDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Calendar date must use YYYY-MM-DD.");
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Calendar date is invalid.");
    return value;
  },

  validateId(value) {
    if (typeof value !== "string" || !value || value.length > 200 || ["__proto__", "prototype", "constructor"].includes(value)) throw new Error("Calendar identifier is invalid.");
    return value;
  },

  validateText(value) {
    if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error("Calendar text must contain 1–500 characters. Nothing was truncated.");
    return value;
  },

  async readState() {
    const saved = await chrome.storage.local.get([this.EVENTS_KEY, this.DETAILS_KEY, this.IDS_KEY, this.REVISION_KEY]);
    const events = structuredClone(this.validMap(saved[this.EVENTS_KEY]));
    const details = structuredClone(this.validMap(saved[this.DETAILS_KEY]));
    const ids = structuredClone(this.validMap(saved[this.IDS_KEY]));

    Object.entries(events).forEach(([dateKey, values]) => {
      if (!Array.isArray(values)) { delete events[dateKey]; delete ids[dateKey]; return; }
      const current = Array.isArray(ids[dateKey]) ? ids[dateKey].slice(0, values.length) : [];
      while (current.length < values.length) current.push(this.entryId());
      ids[dateKey] = current;
    });

    // Upgrade old structured occurrences to stable ids without changing the
    // compatibility date -> string surface used elsewhere in the extension.
    Object.values(details).forEach(event => {
      (Array.isArray(event?.occurrences) ? event.occurrences : []).forEach((occurrence, index) => {
        const values = events[occurrence.dateKey];
        if (!Array.isArray(values)) return;
        const occurrenceId = `event:${event.id}:${index}`;
        const already = ids[occurrence.dateKey]?.indexOf(occurrenceId) ?? -1;
        if (already >= 0) return;
        const match = values.findIndex((value, valueIndex) => value === occurrence.text && !String(ids[occurrence.dateKey][valueIndex] || "").startsWith("event:"));
        if (match >= 0) ids[occurrence.dateKey][match] = occurrenceId;
      });
    });

    return { events, details, ids, revision: Number(saved[this.REVISION_KEY]) || 0 };
  },

  removeEntry(state, dateKey, index) {
    const values = state.events[dateKey];
    if (!Array.isArray(values) || index < 0 || index >= values.length) return null;
    const [text] = values.splice(index, 1);
    const [id] = (state.ids[dateKey] || []).splice(index, 1);
    if (!values.length) { delete state.events[dateKey]; delete state.ids[dateKey]; }
    return { dateKey, index, text, id: id || this.entryId() };
  },

  removeEvent(state, id) {
    const previous = state.details[id];
    if (!previous) return null;
    (Array.isArray(previous.occurrences) ? previous.occurrences : []).forEach((occurrence, occurrenceIndex) => {
      const ids = state.ids[occurrence.dateKey] || [];
      let index = ids.indexOf(`event:${id}:${occurrenceIndex}`);
      if (index < 0) index = (state.events[occurrence.dateKey] || []).indexOf(occurrence.text);
      if (index >= 0) this.removeEntry(state, occurrence.dateKey, index);
    });
    delete state.details[id];
    return previous;
  },

  applyAction(state, action) {
    if (!action || typeof action !== "object") return [];

    if (action.type === "upsertEvent") {
      const event = structuredClone(action.event || {});
      if (!event.id || !event.date || !event.title || !Array.isArray(event.occurrences)) throw new Error("Calendar event operation is incomplete.");
      this.validateId(event.id); this.validateDate(event.date); this.validateText(event.title);
      if (!event.occurrences.length || event.occurrences.length > 200) throw new Error("Calendar recurrence requires 1–200 occurrences. Split a longer plan; nothing was truncated.");
      event.occurrences.forEach(occurrence => { this.validateDate(occurrence?.dateKey); this.validateText(occurrence?.text); });
      const previous = this.removeEvent(state, event.id);
      event.occurrences.forEach((occurrence, index) => {
        (state.events[occurrence.dateKey] ||= []).push(occurrence.text);
        (state.ids[occurrence.dateKey] ||= []).push(`event:${event.id}:${index}`);
      });
      state.details[event.id] = event;
      return [previous ? { type: "upsertEvent", event: previous } : { type: "removeEvent", id: event.id }];
    }

    if (action.type === "removeEvent") {
      this.validateId(action.id);
      const previous = this.removeEvent(state, String(action.id || ""));
      return previous ? [{ type: "upsertEvent", event: previous }] : [];
    }

    if (action.type === "addLegacy") {
      const dateKey = String(action.dateKey || "");
      this.validateDate(dateKey);
      const text = this.validateText(action.text).trim();
      const values = state.events[dateKey] ||= [];
      if (action.dedupe !== false && values.includes(text)) return [];
      const id = String(action.id || this.entryId());
      this.validateId(id);
      if (Object.values(state.ids).some(ids => Array.isArray(ids) && ids.includes(id))) throw new Error("Calendar entry identifier already exists.");
      values.push(text);
      (state.ids[dateKey] ||= []).push(id);
      return [{ type: "removeLegacy", id, dateKey }];
    }

    if (action.type === "removeLegacy") {
      const dateKey = String(action.dateKey || "");
      this.validateDate(dateKey);
      const ids = state.ids[dateKey] || [];
      let index = action.id ? ids.indexOf(String(action.id)) : Number(action.index);
      if ((!Number.isInteger(index) || index < 0) && action.text) index = (state.events[dateKey] || []).indexOf(String(action.text));
      const removed = this.removeEntry(state, dateKey, index);
      return removed ? [{ type: "restoreLegacy", ...removed }] : [];
    }

    if (action.type === "restoreLegacy") {
      const dateKey = String(action.dateKey || "");
      this.validateDate(dateKey);
      const text = this.validateText(action.text);
      const values = state.events[dateKey] ||= [];
      const ids = state.ids[dateKey] ||= [];
      const index = Math.max(0, Math.min(Number(action.index) || 0, values.length));
      const id = String(action.id || this.entryId());
      this.validateId(id);
      if (Object.values(state.ids).some(ids => Array.isArray(ids) && ids.includes(id))) throw new Error("Calendar restore would duplicate an existing entry.");
      values.splice(index, 0, text);
      ids.splice(index, 0, id);
      return [{ type: "removeLegacy", id, dateKey }];
    }

    throw new Error(`Unsupported calendar operation: ${String(action.type || "unknown")}`);
  },

  async _authoritativeCommit(actions) {
    const run = async () => {
      if (!Array.isArray(actions) || actions.length > 250) throw new Error("Calendar transaction requires at most 250 actions. Nothing was changed or truncated.");
      const state = await this.readState();
      const inverse = [];
      for (const action of actions) {
        inverse.unshift(...this.applyAction(state, action));
      }
      state.revision += 1;
      await chrome.storage.local.set({
        [this.EVENTS_KEY]: state.events,
        [this.DETAILS_KEY]: state.details,
        [this.IDS_KEY]: state.ids,
        [this.REVISION_KEY]: state.revision,
      });
      return { state, inverse };
    };
    const result = this._writeQueue.then(run, run);
    this._writeQueue = result.catch(() => {});
    return result;
  },

  async handleMessage(message) {
    if (!this.isAuthority() || message?.type !== "hq:calendar:commit") return null;
    return this._authoritativeCommit(message.actions);
  },

  async transaction(actions) {
    if (this.isAuthority()) return this._authoritativeCommit(actions);
    const response = await chrome.runtime.sendMessage({ type: "hq:calendar:commit", actions });
    if (!response?.ok) throw new Error(response?.error || "Calendar authority did not accept the update.");
    return response.result;
  },

  addLegacy(dateKey, text, options = {}) {
    return this.transaction([{ type: "addLegacy", dateKey, text, dedupe: options.dedupe !== false, id: options.id }]);
  },

  addLegacyMany(entries) {
    return this.transaction(entries.map(entry => ({ type: "addLegacy", dateKey: entry.dateKey, text: entry.text, dedupe: entry.dedupe !== false, id: entry.id })));
  },

  undo(inverse) {
    return this.transaction(Array.isArray(inverse) ? inverse : []);
  },

  syncCalendar(result) {
    if (typeof Calendar === "undefined" || !result?.state) return;
    Calendar.events = result.state.events;
    Calendar.details = result.state.details;
    Calendar.entryIds = result.state.ids;
  },
};
