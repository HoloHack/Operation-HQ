// calendar.js — a local-first scheduling command centre.
// Rich event metadata lives beside the long-standing date -> string map. The
// string map remains the compatibility surface used by Today, assignments,
// Gmail and Schedule, so upgrading Calendar never strands existing data.

const Calendar = {
  DETAILS_KEY: "hq_calendar_details_v2",
  viewDate: new Date(),
  selectedDate: null,
  view: "month",
  events: {},
  details: {},
  holidays: {},
  _holidayCacheKey: null,
  _initPromise: null,
  _storageBound: false,
  _query: "",
  _activeReminder: null,

  categories: {
    school: { label: "School", color: "#55d6ff" },
    deadline: { label: "Deadline", color: "#ff6b86" },
    focus: { label: "Focus", color: "#a78bfa" },
    personal: { label: "Personal", color: "#4eddb7" },
  },

  el(id) { return document.getElementById(id); },

  key(y, monthIndex, day) {
    return `${y}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  },

  dateKey(date = new Date()) {
    return this.key(date.getFullYear(), date.getMonth(), date.getDate());
  },

  fromKey(key) {
    const [year, month, day] = String(key).split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  },

  validDateKey(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) return false;
    const date = this.fromKey(key);
    return !Number.isNaN(date.getTime()) && this.dateKey(date) === key;
  },

  addDays(date, count) {
    const next = new Date(date);
    next.setDate(next.getDate() + count);
    return next;
  },

  minutes(value) {
    const [hours, minutes] = String(value || "0:0").split(":").map(Number);
    return hours * 60 + minutes;
  },

  formatTime(value) {
    if (!value) return "";
    const date = new Date(2000, 0, 1, ...String(value).split(":").map(Number));
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  },

  formatDate(key, options = { weekday: "short", day: "numeric", month: "short" }) {
    return this.fromKey(key).toLocaleDateString([], options);
  },

  async fetchWithTimeout(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { signal: controller.signal }); }
    finally { clearTimeout(timer); }
  },

  async loadHolidaysIfNeeded(year) {
    const { hq_holiday_country } = await chrome.storage.local.get("hq_holiday_country");
    const country = (hq_holiday_country || "").trim().toUpperCase();
    if (!country || country.length !== 2) {
      this.holidays = {};
      this._holidayCacheKey = null;
      return;
    }
    const cacheKey = `${country}-${year}`;
    if (cacheKey === this._holidayCacheKey) return;
    try {
      const response = await this.fetchWithTimeout(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
      if (!response.ok) throw new Error(`Nager.Date ${response.status}`);
      const data = await response.json();
      this.holidays = Object.fromEntries((data || []).filter(item => item.date && item.localName).map(item => [item.date, item.localName]));
      this._holidayCacheKey = cacheKey;
    } catch (error) {
      console.warn("Holiday fetch failed (non-fatal):", error.message);
      this.holidays = {};
      this._holidayCacheKey = null;
    }
  },

  scheduleLabelFor(date) {
    if (typeof Schedule === "undefined" || !Schedule.active) return null;
    const dayKey = SCHEDULE_DAY_KEYS[date.getDay()];
    if (!Schedule.dayHasAlt(Schedule.active, dayKey)) return null;
    return Schedule.isAltWeek(Schedule.active, date) ? Schedule.active.altLabel : null;
  },

  validDetails(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  },

  init() {
    if (!this._initPromise) this._initPromise = this._init();
    return this._initPromise;
  },

  async _init() {
    const saved = await chrome.storage.local.get(["hq_calendar_events", this.DETAILS_KEY, "hq_calendar_view_v2", "hq_calendar_undo_v2"]);
    this.events = this.validDetails(saved.hq_calendar_events) ? saved.hq_calendar_events : {};
    this.details = this.validDetails(saved[this.DETAILS_KEY]) ? saved[this.DETAILS_KEY] : {};
    this.view = ["month", "week", "agenda"].includes(saved.hq_calendar_view_v2) ? saved.hq_calendar_view_v2 : "month";
    this.selectedDate = this.dateKey();
    this.bindControls();
    this.bindStorage();
    this.el("cal-undo").classList.toggle("hidden", !saved.hq_calendar_undo_v2);
    await this.render();
  },

  bindControls() {
    this.el("cal-prev").onclick = () => this.navigate(-1);
    this.el("cal-next").onclick = () => this.navigate(1);
    this.el("cal-today").onclick = () => {
      this.viewDate = new Date();
      this.selectedDate = this.dateKey();
      this.render();
    };
    document.querySelectorAll("[data-cal-view]").forEach(button => {
      button.onclick = async () => {
        this.view = button.dataset.calView;
        await chrome.storage.local.set({ hq_calendar_view_v2: this.view });
        this.render();
      };
    });
    this.el("cal-search").oninput = event => { this._query = event.target.value.trim().toLocaleLowerCase(); this.render(); };
    this.el("cal-quick-form").onsubmit = event => { event.preventDefault(); this.quickAdd(); };
    this.el("cal-new-event").onclick = () => this.openEditor(null, this.selectedDate);
    this.el("cal-event-form").onsubmit = event => { event.preventDefault(); this.saveEditor(); };
    this.el("cal-event-cancel").onclick = () => this.closeEditor();
    this.el("cal-event-delete").onclick = () => this.deleteEditorEvent();
    this.el("cal-event-all-day").onchange = () => this.updateEditorVisibility();
    this.el("cal-event-repeat").onchange = () => this.updateEditorVisibility(true);
    this.el("cal-undo").onclick = () => this.undoLastChange();
    this.el("cal-reminder-banner").onclick = () => {
      if (!this._activeReminder) return;
      this.selectedDate = this._activeReminder.occurrenceDate;
      this.openEditor(this.details[this._activeReminder.id], this._activeReminder.occurrenceDate);
    };
  },

  bindStorage() {
    if (this._storageBound || !chrome.storage?.onChanged) return;
    this._storageBound = true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes.hq_calendar_events) this.events = this.validDetails(changes.hq_calendar_events.newValue) ? changes.hq_calendar_events.newValue : {};
      if (changes[this.DETAILS_KEY]) this.details = this.validDetails(changes[this.DETAILS_KEY].newValue) ? changes[this.DETAILS_KEY].newValue : {};
      if (changes.hq_calendar_events || changes[this.DETAILS_KEY]) this.render();
    });
  },

  navigate(direction) {
    if (this.view === "month") this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + direction, 1);
    else this.viewDate = this.addDays(this.viewDate, direction * (this.view === "week" ? 7 : 30));
    this.render();
  },

  occurrenceKeys(event) {
    const first = this.fromKey(event.date);
    const until = event.repeat === "none" ? first : this.fromKey(event.repeatUntil || event.date);
    const keys = [];
    let cursor = new Date(first);
    for (let guard = 0; guard < 200 && cursor <= until; guard += 1) {
      keys.push(this.dateKey(cursor));
      if (event.repeat === "daily") cursor = this.addDays(cursor, 1);
      else if (event.repeat === "weekly") cursor = this.addDays(cursor, 7);
      else if (event.repeat === "monthly") {
        const originalDay = first.getDate();
        const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12);
        nextMonth.setDate(Math.min(originalDay, new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()));
        cursor = nextMonth;
      } else break;
    }
    return keys;
  },

  legacyText(event) {
    return event.allDay || !event.start ? event.title : `${event.start} ${event.title}`;
  },

  removeMaterialized(event) {
    (event?.occurrences || []).forEach(({ dateKey, text }) => {
      const list = this.events[dateKey];
      if (!Array.isArray(list)) return;
      const index = list.indexOf(text);
      if (index >= 0) list.splice(index, 1);
      if (!list.length) delete this.events[dateKey];
    });
  },

  materialize(event) {
    const text = this.legacyText(event);
    event.occurrences = this.occurrenceKeys(event).map(dateKey => ({ dateKey, text }));
    event.occurrences.forEach(({ dateKey: key, text: label }) => {
      if (!Array.isArray(this.events[key])) this.events[key] = [];
      this.events[key].push(label);
    });
  },

  recordsForDate(dateKey, { applyFilter = true } = {}) {
    const legacy = Array.isArray(this.events[dateKey]) ? this.events[dateKey] : [];
    const consumed = new Array(legacy.length).fill(false);
    const records = [];

    Object.values(this.details).forEach(event => {
      const occurrence = (event.occurrences || []).find(item => item.dateKey === dateKey);
      if (!occurrence) return;
      const matching = legacy.findIndex((text, index) => !consumed[index] && text === occurrence.text);
      if (matching >= 0) consumed[matching] = true;
      records.push({ ...event, occurrenceDate: dateKey, displayText: occurrence.text, legacy: false });
    });
    legacy.forEach((text, index) => {
      if (!consumed[index]) records.push({ id: `legacy-${dateKey}-${index}`, title: text, date: dateKey, occurrenceDate: dateKey, displayText: text, allDay: true, category: "personal", legacy: true, legacyIndex: index });
    });
    const query = applyFilter ? this._query : "";
    return records
      .filter(event => !query || [event.title, event.location, event.notes, event.category].some(value => String(value || "").toLocaleLowerCase().includes(query)))
      .sort((a, b) => String(a.start || "99:99").localeCompare(String(b.start || "99:99")) || String(a.title).localeCompare(String(b.title)));
  },

  conflictCount() {
    let count = 0;
    const byDate = {};
    Object.values(this.details).forEach(event => {
      if (event.allDay || !event.start || !event.end) return;
      (event.occurrences || []).forEach(({ dateKey }) => (byDate[dateKey] ||= []).push(event));
    });
    Object.values(byDate).forEach(items => {
      items.sort((a, b) => this.minutes(a.start) - this.minutes(b.start));
      for (let left = 0; left < items.length; left += 1) {
        for (let right = left + 1; right < items.length; right += 1) {
          if (this.minutes(items[right].start) >= this.minutes(items[left].end)) break;
          count += 1;
        }
      }
    });
    return count;
  },

  nextEvent() {
    const today = this.dateKey();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    for (let offset = 0; offset <= 60; offset += 1) {
      const key = this.dateKey(this.addDays(this.fromKey(today), offset));
      const candidates = this.recordsForDate(key, { applyFilter: false }).filter(event => {
        if (offset > 0 || event.allDay || !event.start) return true;
        return this.minutes(event.end || event.start) > currentMinutes;
      });
      if (candidates.length) return candidates[0];
    }
    return null;
  },

  activeReminder() {
    const now = new Date();
    const today = this.dateKey(now);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return this.recordsForDate(today, { applyFilter: false }).find(event => {
      if (event.legacy || event.allDay || !event.start || !Number(event.reminder)) return false;
      const start = this.minutes(event.start);
      return currentMinutes >= start - Number(event.reminder) && currentMinutes <= start + 5;
    }) || null;
  },

  updateHeader() {
    const current = this.viewDate;
    if (this.view === "month") this.el("cal-label").textContent = current.toLocaleDateString([], { month: "long", year: "numeric" });
    else if (this.view === "week") {
      const start = this.weekStart(current);
      const end = this.addDays(start, 6);
      this.el("cal-label").textContent = `${start.toLocaleDateString([], { day: "numeric", month: "short" })} – ${end.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`;
    } else this.el("cal-label").textContent = `Next 30 days · ${current.toLocaleDateString([], { month: "short", year: "numeric" })}`;
    document.querySelectorAll("[data-cal-view]").forEach(button => {
      const active = button.dataset.calView === this.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });

    const todayEvents = this.recordsForDate(this.dateKey(), { applyFilter: false });
    this.el("cal-today-stat").textContent = `${todayEvents.length} today`;
    const conflicts = this.conflictCount();
    this.el("cal-conflict-stat").textContent = conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"}` : "No conflicts";
    this.el("cal-conflict-stat").dataset.state = conflicts ? "attention" : "clear";
    const next = this.nextEvent();
    this.el("cal-next-stat").textContent = next ? `Next · ${next.title}` : "Runway clear";
    this._activeReminder = this.activeReminder();
    const reminder = this.el("cal-reminder-banner");
    reminder.classList.toggle("hidden", !this._activeReminder);
    if (this._activeReminder) {
      this.el("cal-reminder-title").textContent = this._activeReminder.title;
      this.el("cal-reminder-time").textContent = `${this.formatTime(this._activeReminder.start)} · open details`;
    }
  },

  weekStart(date) {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(12, 0, 0, 0);
    return start;
  },

  eventHtml(event, compact = false) {
    const category = this.categories[event.category] || this.categories.personal;
    const time = event.allDay || !event.start ? "" : this.formatTime(event.start);
    return `<button class="cal-event-chip ${compact ? "compact" : ""}" type="button" data-event-id="${escapeAttribute(event.id)}" data-event-date="${escapeAttribute(event.occurrenceDate)}" ${event.legacy ? `data-legacy-index="${event.legacyIndex}"` : ""} style="--event-color:${category.color}" title="${escapeAttribute(event.title)}"><span>${time ? `${escapeHtml(time)} · ` : ""}${escapeHtml(event.title)}</span>${event.priority === "high" ? '<i aria-label="High priority">!</i>' : ""}</button>`;
  },

  bindRenderedEvents(container) {
    container.querySelectorAll(".cal-date-hit").forEach(button => button.onclick = () => {
      this.selectedDate = button.dataset.date;
      this.renderSelected();
      this.render();
    });
    container.querySelectorAll(".cal-event-chip").forEach(button => button.onclick = event => {
      event.stopPropagation();
      const record = button.dataset.legacyIndex == null
        ? this.details[button.dataset.eventId]
        : { legacy: true, date: button.dataset.eventDate, legacyIndex: Number(button.dataset.legacyIndex), title: this.events[button.dataset.eventDate]?.[Number(button.dataset.legacyIndex)] || "" };
      this.selectedDate = button.dataset.eventDate;
      this.openEditor(record, button.dataset.eventDate);
    });
  },

  async renderMonth() {
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();
    await this.loadHolidaysIfNeeded(year);
    const firstDow = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const today = this.dateKey();
    let html = '<div class="cal-weekdays" aria-hidden="true">' + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => `<span>${day}</span>`).join("") + "</div>";
    html += '<div class="cal-month-grid">';
    for (let index = 0; index < firstDow; index += 1) html += '<div class="cal-cell empty"></div>';
    for (let day = 1; day <= days; day += 1) {
      const dateKey = this.key(year, month, day);
      const events = this.recordsForDate(dateKey);
      const holiday = this.holidays[dateKey];
      const rhythm = this.scheduleLabelFor(new Date(year, month, day));
      html += `<div class="cal-cell ${dateKey === today ? "today" : ""} ${dateKey === this.selectedDate ? "selected" : ""} ${holiday ? "holiday" : ""}">
        <button class="cal-date-hit" type="button" data-date="${dateKey}" aria-label="View ${escapeAttribute(this.formatDate(dateKey, { weekday: "long", day: "numeric", month: "long" }))}"><span>${day}</span>${events.length ? `<i>${events.length}</i>` : ""}</button>
        ${holiday ? `<div class="cal-holiday" title="${escapeAttribute(holiday)}">${escapeHtml(holiday)}</div>` : ""}
        ${rhythm ? `<div class="cal-rhythm">${escapeHtml(rhythm)}</div>` : ""}
        <div class="cal-cell-events">${events.slice(0, 3).map(event => this.eventHtml(event, true)).join("")}</div>
        ${events.length > 3 ? `<button class="cal-date-hit cal-more" type="button" data-date="${dateKey}">+${events.length - 3} more</button>` : ""}
      </div>`;
    }
    html += "</div>";
    const grid = this.el("cal-grid");
    grid.className = "cal-surface mode-month scroll-cap";
    grid.innerHTML = html;
    this.bindRenderedEvents(grid);
  },

  async renderWeek() {
    const start = this.weekStart(this.viewDate);
    await this.loadHolidaysIfNeeded(start.getFullYear());
    const today = this.dateKey();
    let html = '<div class="cal-week-grid">';
    for (let offset = 0; offset < 7; offset += 1) {
      const date = this.addDays(start, offset);
      const key = this.dateKey(date);
      const events = this.recordsForDate(key);
      html += `<section class="cal-week-column ${key === today ? "today" : ""} ${key === this.selectedDate ? "selected" : ""}">
        <button class="cal-date-hit cal-week-head" type="button" data-date="${key}"><small>${date.toLocaleDateString([], { weekday: "short" })}</small><strong>${date.getDate()}</strong></button>
        ${this.holidays[key] ? `<p class="cal-holiday">${escapeHtml(this.holidays[key])}</p>` : ""}
        <div class="cal-week-events">${events.length ? events.map(event => this.eventHtml(event)).join("") : '<span class="cal-open-space">Open</span>'}</div>
      </section>`;
    }
    html += "</div>";
    const grid = this.el("cal-grid");
    grid.className = "cal-surface mode-week scroll-cap";
    grid.innerHTML = html;
    this.bindRenderedEvents(grid);
  },

  renderAgenda() {
    const start = new Date(this.viewDate);
    let html = '<div class="cal-agenda-list">';
    let visibleDays = 0;
    for (let offset = 0; offset < 30; offset += 1) {
      const date = this.addDays(start, offset);
      const key = this.dateKey(date);
      const events = this.recordsForDate(key);
      if (!events.length) continue;
      visibleDays += 1;
      html += `<section class="cal-agenda-day"><button class="cal-date-hit cal-agenda-date" type="button" data-date="${key}"><strong>${date.toLocaleDateString([], { weekday: "short", day: "numeric" })}</strong><span>${date.toLocaleDateString([], { month: "long" })}</span></button><div>${events.map(event => this.eventHtml(event)).join("")}</div></section>`;
    }
    if (!visibleDays) html += '<div class="calendar-empty"><strong>Your runway is clear.</strong><span>No events match this 30-day view.</span></div>';
    html += "</div>";
    const grid = this.el("cal-grid");
    grid.className = "cal-surface mode-agenda scroll-cap";
    grid.innerHTML = html;
    this.bindRenderedEvents(grid);
  },

  async render() {
    if (!this.el("cal-grid")) return;
    this.updateHeader();
    if (this.view === "month") await this.renderMonth();
    else if (this.view === "week") await this.renderWeek();
    else this.renderAgenda();
    this.renderSelected();
  },

  renderSelected() {
    if (!this.selectedDate) this.selectedDate = this.dateKey();
    const events = this.recordsForDate(this.selectedDate);
    this.el("cal-selected-label").textContent = this.formatDate(this.selectedDate, { weekday: "long", day: "numeric", month: "long" });
    this.el("cal-selected-summary").textContent = events.length ? `${events.length} commitment${events.length === 1 ? "" : "s"}` : "Open day";
    const list = this.el("cal-day-events");
    list.innerHTML = events.length ? events.map(event => this.eventHtml(event)).join("") : '<div class="calendar-empty compact"><strong>No events</strong><span>Protect this space or add a clear commitment.</span></div>';
    this.bindRenderedEvents(list);
  },

  openEditor(record, dateKey = this.selectedDate) {
    const isLegacy = !!record?.legacy;
    const form = this.el("cal-event-form");
    form.classList.remove("hidden");
    form.dataset.eventId = record?.id || "";
    form.dataset.legacyDate = isLegacy ? record.date : "";
    form.dataset.legacyIndex = isLegacy ? String(record.legacyIndex) : "";
    this.el("cal-editor-title").textContent = record ? "Edit event" : "New event";
    this.el("cal-event-title").value = record?.title || "";
    this.el("cal-event-date").value = record?.date || dateKey || this.dateKey();
    this.el("cal-event-all-day").checked = record ? record.allDay !== false : false;
    this.el("cal-event-start").value = record?.start || "16:00";
    this.el("cal-event-end").value = record?.end || "17:00";
    this.el("cal-event-category").value = record?.category || "personal";
    this.el("cal-event-priority").value = record?.priority || "normal";
    this.el("cal-event-location").value = record?.location || "";
    this.el("cal-event-repeat").value = record?.repeat || "none";
    this.el("cal-event-repeat-until").value = record?.repeatUntil || "";
    this.el("cal-event-reminder").value = String(record?.reminder ?? 0);
    this.el("cal-event-notes").value = record?.notes || "";
    this.el("cal-event-delete").classList.toggle("hidden", !record);
    this.el("cal-event-error").textContent = "";
    this.updateEditorVisibility();
    requestAnimationFrame(() => this.el("cal-event-title").focus());
  },

  closeEditor() {
    const form = this.el("cal-event-form");
    form.classList.add("hidden");
    form.reset();
    form.dataset.eventId = "";
    form.dataset.legacyDate = "";
    form.dataset.legacyIndex = "";
  },

  updateEditorVisibility(seedRepeat = false) {
    const allDay = this.el("cal-event-all-day").checked;
    this.el("cal-time-fields").classList.toggle("hidden", allDay);
    const recurring = this.el("cal-event-repeat").value !== "none";
    this.el("cal-repeat-until-field").classList.toggle("hidden", !recurring);
    if (recurring && seedRepeat && !this.el("cal-event-repeat-until").value) {
      const until = this.addDays(this.fromKey(this.el("cal-event-date").value || this.dateKey()), 90);
      this.el("cal-event-repeat-until").value = this.dateKey(until);
    }
  },

  editorRecord() {
    const allDay = this.el("cal-event-all-day").checked;
    return {
      id: this.el("cal-event-form").dataset.eventId || crypto.randomUUID(),
      title: this.el("cal-event-title").value.trim(),
      date: this.el("cal-event-date").value,
      allDay,
      start: allDay ? "" : this.el("cal-event-start").value,
      end: allDay ? "" : this.el("cal-event-end").value,
      category: this.el("cal-event-category").value,
      priority: this.el("cal-event-priority").value,
      location: this.el("cal-event-location").value.trim(),
      repeat: this.el("cal-event-repeat").value,
      repeatUntil: this.el("cal-event-repeat").value === "none" ? "" : this.el("cal-event-repeat-until").value,
      reminder: Number(this.el("cal-event-reminder").value || 0),
      notes: this.el("cal-event-notes").value.trim(),
      updatedAt: Date.now(),
    };
  },

  validateEvent(event) {
    if (!event.title) return "Give the event a clear title.";
    if (!this.validDateKey(event.date)) return "Choose a valid date.";
    if (!event.allDay && (!event.start || !event.end || this.minutes(event.end) <= this.minutes(event.start))) return "End time must be after start time.";
    if (event.repeat !== "none" && (!this.validDateKey(event.repeatUntil) || event.repeatUntil < event.date)) return "Choose when the repeating series ends.";
    const maximum = this.dateKey(this.addDays(this.fromKey(event.date), 366));
    if (event.repeat !== "none" && event.repeatUntil > maximum) return "Keep a repeating series within one year so the dashboard stays fast.";
    return "";
  },

  async saveEditor() {
    const form = this.el("cal-event-form");
    const event = this.editorRecord();
    const error = this.validateEvent(event);
    if (error) { this.el("cal-event-error").textContent = error; return; }
    await this.pushUndo("Event change");
    const existing = this.details[event.id];
    if (existing) this.removeMaterialized(existing);
    if (form.dataset.legacyDate) {
      const list = this.events[form.dataset.legacyDate] || [];
      const index = Number(form.dataset.legacyIndex);
      if (Number.isInteger(index) && index >= 0 && index < list.length) list.splice(index, 1);
      if (!list.length) delete this.events[form.dataset.legacyDate];
    }
    event.createdAt = existing?.createdAt || Date.now();
    this.materialize(event);
    this.details[event.id] = event;
    this.selectedDate = event.date;
    this.viewDate = this.fromKey(event.date);
    await this.persist();
    this.closeEditor();
    await this.render();
    Wallpaper?.toast?.(existing ? "Calendar event updated." : "Calendar event added.");
  },

  async deleteEditorEvent() {
    const form = this.el("cal-event-form");
    await this.pushUndo("Event removed");
    const id = form.dataset.eventId;
    if (id && this.details[id]) {
      this.removeMaterialized(this.details[id]);
      delete this.details[id];
    } else if (form.dataset.legacyDate) {
      const list = this.events[form.dataset.legacyDate] || [];
      const index = Number(form.dataset.legacyIndex);
      if (Number.isInteger(index) && index >= 0 && index < list.length) list.splice(index, 1);
      if (!list.length) delete this.events[form.dataset.legacyDate];
    }
    await this.persist();
    this.closeEditor();
    await this.render();
    Wallpaper?.toast?.("Calendar event removed.");
  },

  async persist() {
    await chrome.storage.local.set({ hq_calendar_events: this.events, [this.DETAILS_KEY]: this.details });
  },

  async pushUndo(label) {
    await chrome.storage.local.set({
      hq_calendar_undo_v2: {
        label,
        events: structuredClone(this.events),
        details: structuredClone(this.details),
        createdAt: Date.now(),
      },
    });
    this.el("cal-undo")?.classList.remove("hidden");
  },

  async undoLastChange() {
    const { hq_calendar_undo_v2: undo } = await chrome.storage.local.get("hq_calendar_undo_v2");
    if (!undo || !this.validDetails(undo.events) || !this.validDetails(undo.details)) return;
    this.events = undo.events;
    this.details = undo.details;
    await this.persist();
    await chrome.storage.local.remove("hq_calendar_undo_v2");
    this.el("cal-undo").classList.add("hidden");
    this.closeEditor();
    await this.render();
    Wallpaper?.toast?.(`${undo.label || "Calendar change"} undone.`);
  },

  parseQuick(text) {
    let title = String(text || "").trim();
    const now = new Date();
    let date = this.dateKey(now);
    const explicitIso = title.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    const slash = title.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
    if (explicitIso) date = explicitIso[1];
    else if (slash) date = this.key(Number(slash[3] || now.getFullYear()), Number(slash[2]) - 1, Number(slash[1]));
    else if (/\btomorrow\b/i.test(title)) date = this.dateKey(this.addDays(now, 1));
    else {
      const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const found = weekdays.findIndex(day => new RegExp(`\\b${day}\\b`, "i").test(title));
      if (found >= 0) {
        let offset = (found - now.getDay() + 7) % 7;
        if (offset === 0) offset = 7;
        date = this.dateKey(this.addDays(now, offset));
      }
    }
    const timeMatch = title.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    let start = "";
    let end = "";
    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = Number(timeMatch[2] || 0);
      if (timeMatch[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
      if (timeMatch[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
      start = `${String(Math.min(hour, 23)).padStart(2, "0")}:${String(Math.min(minute, 59)).padStart(2, "0")}`;
      const duration = title.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hours)\b/i);
      const durationMinutes = duration ? Number(duration[1]) * (/^h/i.test(duration[2]) ? 60 : 1) : 60;
      const endMinutes = Math.min(1439, this.minutes(start) + durationMinutes);
      end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    }
    const tag = title.match(/#(school|deadline|focus|personal)\b/i)?.[1]?.toLowerCase();
    title = title
      .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "")
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/g, "")
      .replace(/\b(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, "")
      .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, "")
      .replace(/\bfor\s+\d+(?:\.\d+)?\s*(?:m|min|mins|minutes|h|hr|hrs|hours)\b/gi, "")
      .replace(/#(?:school|deadline|focus|personal)\b/gi, "")
      .replace(/\s+/g, " ").trim();
    return { title, date, allDay: !start, start, end, category: tag || "personal" };
  },

  async quickAdd() {
    const input = this.el("cal-quick-input");
    const parsed = this.parseQuick(input.value);
    if (!parsed.title) {
      this.el("cal-quick-status").textContent = "Try: Math revision tomorrow at 4pm for 45m #school";
      return;
    }
    if (!this.validDateKey(parsed.date)) {
      this.el("cal-quick-status").textContent = "That date is not valid. Use YYYY-MM-DD or day/month.";
      return;
    }
    await this.pushUndo("Quick add");
    const event = {
      ...parsed,
      id: crypto.randomUUID(), priority: "normal", location: "", repeat: "none", repeatUntil: "", reminder: 0, notes: "", createdAt: Date.now(), updatedAt: Date.now(),
    };
    this.materialize(event);
    this.details[event.id] = event;
    this.selectedDate = event.date;
    this.viewDate = this.fromKey(event.date);
    await this.persist();
    input.value = "";
    this.el("cal-quick-status").textContent = `${event.title} · ${this.formatDate(event.date)}${event.start ? ` at ${this.formatTime(event.start)}` : ""}`;
    await this.render();
  },

  // Compatibility entry point used by older internal actions.
  addEvent(dateKey) {
    this.selectedDate = dateKey;
    this.openEditor(null, dateKey);
  },
};
