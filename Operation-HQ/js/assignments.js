// assignments.js — local assessment tracking and review-first timetable fit.
// No school portal is scraped and no calendar event is written silently.

const Assignments = {
  KEY: "hq_assignments_v1",
  UNDO_KEY: "hq_assignment_plan_undo_v1",
  DELETE_UNDO_KEY: "hq_assignment_delete_undo_v1",
  items: [],
  draft: [],

  date(value) { return new Date(`${value}T12:00:00`); },
  dateKey(value = new Date()) { return hqLocalDateKey(value); },
  daysUntil(value) {
    const today = new Date(); today.setHours(12,0,0,0);
    return Math.ceil((this.date(value) - today) / 86400000);
  },
  minutes(value) { const [h,m] = String(value).split(":").map(Number); return h * 60 + m; },
  clock(value) { return `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`; },
  occupied(dateKey) {
    return (Calendar.events[dateKey] || []).flatMap(value => {
      const match = String(value).match(/\b(\d{2}:\d{2})[–-](\d{2}:\d{2})\b/);
      return match ? [{start:this.minutes(match[1]),end:this.minutes(match[2])}] : [];
    });
  },
  priorityWeight(priority) { return ({high:3,medium:2,low:1})[priority] || 1; },
  status(message) { const target = document.getElementById("assignment-status"); if (target) target.textContent = message; },

  defaultSteps(type = "general", requirements = []) {
    const steps = [{ id: "decode", phase: "Decode", label: "Read the brief and mark every deliverable", minutes: 25 }];
    if (["writing", "research", "presentation"].includes(type)) steps.push({ id: "evidence", phase: "Evidence", label: "Collect and organise usable evidence", minutes: 50 });
    if (type === "exam") steps.push({ id: "diagnose", phase: "Diagnose", label: "Map the assessed topics and identify weak areas", minutes: 40 });
    if (type === "practical") steps.push({ id: "plan", phase: "Plan", label: "Plan materials, method and success checks", minutes: 40 });
    const build = ({ writing: "Build the thesis, structure and first complete draft", research: "Synthesize findings into a defensible structure", presentation: "Build the argument and slide sequence", exam: "Complete timed practice and log every error", practical: "Complete the build and record evidence" })[type] || "Produce the first complete version";
    steps.push({ id: "build", phase: type === "exam" ? "Practice" : "Build", label: build, minutes: type === "practical" ? 90 : type === "exam" ? 75 : 60 });
    if (requirements.length) steps.push({ id: "rubric", phase: "Rubric", label: "Check every stated requirement against the work", minutes: 30 });
    steps.push({ id: "refine", phase: "Refine", label: "Revise the weakest section and run a quality check", minutes: 40 });
    steps.push({ id: "submit", phase: "Submit", label: "Prepare the correct file and complete submission checks", minutes: 20 });
    return steps;
  },

  normalize(item) {
    if (!item?.id || !item?.title || !item?.dueDate) return null;
    const requirements = Array.isArray(item.requirements) ? item.requirements.map(value => String(value).trim()).filter(Boolean).slice(0, 20) : [];
    const type = ["general", "exam", "writing", "research", "presentation", "practical"].includes(item.type) ? item.type : "general";
    const steps = Array.isArray(item.steps) && item.steps.length ? item.steps.slice(0, 20).map((step, index) => ({
      id: String(step.id || `step-${index + 1}`), phase: String(step.phase || "Action").slice(0, 30),
      label: String(step.label || step).slice(0, 180), minutes: Math.max(10, Math.min(240, Number(step.minutes) || 25)),
    })) : [];
    return { ...item, title: String(item.title).slice(0, 120), subject: String(item.subject || "Unassigned").slice(0, 48), type, requirements, steps, weight: Math.max(0, Math.min(100, Number(item.weight) || 0)), estimatedMinutes: Math.max(25, Math.min(3000, Number(item.estimatedMinutes) || 100)), priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium", done: !!item.done };
  },

  stepSourceIds(item, step, index) {
    return [`${item.id}:${step.id || index}`, item.intakeId ? `${item.intakeId}:${step.id || index}` : null].filter(Boolean);
  },

  linkedTask(item, step, index) {
    const ids = this.stepSourceIds(item, step, index);
    return Tasks.data.find(task => ids.includes(task.sourceId)) || null;
  },

  nextStep(item) {
    return (item.steps || []).map((step, index) => ({ step, index, task: this.linkedTask(item, step, index) })).find(entry => !entry.task?.done) || null;
  },

  async load() {
    const saved = await chrome.storage.local.get([this.KEY,this.UNDO_KEY,this.DELETE_UNDO_KEY]);
    this.items = Array.isArray(saved[this.KEY]) ? saved[this.KEY].map(item => this.normalize(item)).filter(Boolean) : [];
    document.getElementById("assignment-plan-undo").disabled = !saved[this.UNDO_KEY];
    document.getElementById("assignment-delete-undo").classList.toggle("hidden", !saved[this.DELETE_UNDO_KEY]);
  },
  async save() {
    this.items = this.items.map(item => this.normalize(item)).filter(Boolean).slice(0,100);
    await chrome.storage.local.set({ [this.KEY]: this.items });
    this.render();
  },

  risk(item) {
    if (item.done) return {key:"complete",label:"Complete",reason:"Marked complete"};
    const days = this.daysUntil(item.dueDate);
    if (days < 0) return {key:"overdue",label:"Overdue",reason:`Due ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`};
    if (days === 0) return {key:"critical",label:"Due today",reason:`${item.estimatedMinutes} min still estimated`};
    if (days <= 2 || (item.priority === "high" && days <= 5)) return {key:"high",label:"High risk",reason:`${days} day${days === 1 ? "" : "s"} · ${item.estimatedMinutes} min estimated`};
    if (days <= 7) return {key:"watch",label:"Watch",reason:`${days} days · ${item.estimatedMinutes} min estimated`};
    return {key:"steady",label:"On horizon",reason:`${days} days remaining`};
  },

  sorted() {
    return [...this.items].sort((a,b) => Number(a.done) - Number(b.done) || this.date(a.dueDate) - this.date(b.dueDate) || this.priorityWeight(b.priority) - this.priorityWeight(a.priority));
  },

  render() {
    const list = document.getElementById("assignment-list");
    const open = this.items.filter(item => !item.done);
    const riskCount = open.filter(item => ["overdue","critical","high"].includes(this.risk(item).key)).length;
    const completeSteps = open.reduce((sum, item) => sum + (item.steps || []).filter((step, index) => this.linkedTask(item, step, index)?.done).length, 0);
    const totalSteps = open.reduce((sum, item) => sum + (item.steps || []).length, 0);
    document.getElementById("assignment-summary").innerHTML = `<div><strong>${open.length}</strong><span>open</span></div><div><strong>${riskCount}</strong><span>high risk</span></div><div><strong>${open.reduce((sum,item) => sum + Number(item.estimatedMinutes || 0),0)}</strong><span>estimated min</span></div><div><strong>${totalSteps ? `${completeSteps}/${totalSteps}` : "—"}</strong><span>steps complete</span></div>`;
    if (!this.items.length) {
      list.innerHTML = '<li class="empty-state">No assignments tracked. Add a real deadline above; Operation HQ will not fabricate schoolwork.</li>';
      return;
    }
    list.innerHTML = this.sorted().map(item => {
      const risk = this.risk(item);
      const due = this.date(item.dueDate).toLocaleDateString([], {weekday:"short",month:"short",day:"numeric"});
      const steps = item.steps || [];
      const stepRows = steps.map((step, index) => ({ step, index, task: this.linkedTask(item, step, index) }));
      const linkedDone = stepRows.filter(entry => entry.task?.done).length;
      const progress = stepRows.length ? Math.round(linkedDone / stepRows.length * 100) : (item.done ? 100 : 0);
      const requirements = item.requirements || [];
      const typeLabel = item.type === "general" ? "assignment" : item.type;
      return `<li class="assignment-card${item.done ? " complete" : ""}" data-assignment-id="${escapeAttribute(item.id)}" data-risk="${risk.key}">
        <div class="assignment-card-signal"><span>${escapeHtml(item.subject)}</span><strong>${escapeHtml(risk.label)}</strong></div>
        <div class="assignment-card-main"><div class="assignment-title-row"><h3>${escapeHtml(item.title)}</h3><span>${escapeHtml(typeLabel)}${item.weight ? ` · ${item.weight}%` : ""}</span></div><p>Due ${escapeHtml(due)} · ${escapeHtml(item.priority)} priority · ${Number(item.estimatedMinutes)} min estimated</p><small>${escapeHtml(risk.reason)}</small>${item.description ? `<p class="assignment-card-description">${escapeHtml(item.description)}</p>` : ""}${stepRows.length ? `<div class="assignment-linked-progress" role="progressbar" aria-label="Assessment action steps completed" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><small>${linkedDone} of ${stepRows.length} action steps complete</small>` : ""}</div>
        ${stepRows.length ? `<details class="assignment-breakdown"><summary>Action plan and requirements</summary>${requirements.length ? `<ul class="assignment-requirement-list">${requirements.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : '<p class="settings-note">No rubric requirements have been recorded.</p>'}<ol>${stepRows.map(({step,index,task}) => `<li data-state="${task?.done ? "done" : task ? "task" : "ready"}"><span>${escapeHtml(step.phase)}</span><strong>${escapeHtml(step.label)}</strong><small>${Number(step.minutes)} min${task?.done ? " · done" : task ? " · in Tasks" : ""}</small></li>`).join("")}</ol></details>` : ""}
        ${item.source === "assessment-intake" ? '<p class="assignment-source-lock">Imported assessment details stay locked to their accepted Intake record. Undo the Intake acceptance before replacing the source.</p>' : `<details class="assignment-edit"><summary>Edit details</summary><div class="assignment-edit-grid"><label>Title<input data-edit-field="title" maxlength="120" value="${escapeAttribute(item.title)}"></label><label>Subject<input data-edit-field="subject" maxlength="48" value="${escapeAttribute(item.subject)}"></label><label>Due date<input data-edit-field="dueDate" type="date" value="${escapeAttribute(item.dueDate)}"></label><label>Estimate<input data-edit-field="estimatedMinutes" type="number" min="25" max="3000" step="25" value="${Number(item.estimatedMinutes)}"></label><label>Priority<select data-edit-field="priority"><option value="high"${item.priority === "high" ? " selected" : ""}>High</option><option value="medium"${item.priority === "medium" ? " selected" : ""}>Medium</option><option value="low"${item.priority === "low" ? " selected" : ""}>Low</option></select></label><label>Weight %<input data-edit-field="weight" type="number" min="0" max="100" value="${Number(item.weight || 0)}"></label></div><label>Requirements<textarea data-edit-field="requirements" rows="3" maxlength="1200">${escapeHtml(requirements.join("\n"))}</textarea></label><button type="button" data-action="update">Save changes</button></details>`}
        <div class="assignment-card-actions"><button data-action="start"${item.done ? " disabled" : ""}>Start next step</button><button class="secondary" data-action="steps"${item.done ? " disabled" : ""}>Add steps to Tasks</button><button class="secondary" data-action="plan"${item.done ? " disabled" : ""}>Plan sessions</button><button class="secondary" data-action="task"${item.done ? " disabled" : ""}>Add whole assignment</button><button class="secondary" data-action="complete">${item.done ? "Reopen" : "Complete"}</button><button class="secondary" data-action="delete">Delete</button></div>
      </li>`;
    }).join("");
  },

  flexibleSlots(item) {
    if (typeof Schedule === "undefined" || !Schedule.active) return [];
    const slots = [];
    const today = new Date(); today.setHours(12,0,0,0);
    const due = this.date(item.dueDate);
    const now = new Date();
    let scannedDays = 0;
    for (let cursor = new Date(today); cursor <= due && slots.length < 24 && scannedDays < 90; cursor.setDate(cursor.getDate() + 1), scannedDays += 1) {
      const sameDay = this.dateKey(cursor) === this.dateKey(now);
      const nowMinute = now.getHours() * 60 + now.getMinutes();
      const dayKey = SCHEDULE_DAY_KEYS[cursor.getDay()];
      Schedule.blocksFor(Schedule.active,dayKey,cursor).filter(block => Schedule.isFlexibleBlock(block)).forEach(block => {
        const start = Math.ceil(Math.max(this.minutes(block.s),sameDay ? nowMinute + 5 : 0) / 5) * 5;
        const end = this.minutes(block.e);
        if (end - start >= 25) slots.push({dateKey:this.dateKey(cursor),date:new Date(cursor),start,end,label:block.t});
      });
    }
    return slots;
  },

  buildPlan(id) {
    const item = this.items.find(entry => entry.id === id);
    if (!item || item.done) return;
    let remaining = Number(item.estimatedMinutes) || 0;
    this.draft = [];
    for (const slot of this.flexibleSlots(item)) {
      if (remaining <= 0) break;
      let cursor = slot.start;
      const occupied = this.occupied(slot.dateKey);
      while (remaining >= 25 && slot.end - cursor >= 25 && this.draft.length < 24) {
        const conflict = occupied.find(range => cursor < range.end && cursor + 25 > range.start);
        if (conflict) { cursor = Math.ceil(conflict.end / 5) * 5; continue; }
        const nextConflict = occupied.filter(range => range.start >= cursor).sort((a,b) => a.start - b.start)[0];
        const availableEnd = Math.min(slot.end,nextConflict?.start ?? slot.end);
        const duration = Math.min(50,remaining,availableEnd - cursor);
        if (duration < 25) { cursor = nextConflict ? Math.ceil(nextConflict.end / 5) * 5 : slot.end; continue; }
        this.draft.push({id:crypto.randomUUID(),assignmentId:item.id,dateKey:slot.dateKey,s:this.clock(cursor),e:this.clock(cursor + duration),duration,label:slot.label,title:item.title,subject:item.subject});
        remaining -= duration;
        cursor += duration;
      }
    }
    const panel = document.getElementById("assignment-plan");
    const list = document.getElementById("assignment-plan-list");
    panel.classList.remove("hidden");
    document.getElementById("assignment-plan-title").textContent = `${item.subject} · ${item.title}`;
    document.getElementById("assignment-plan-total").textContent = this.draft.length ? `${this.draft.reduce((sum,entry) => sum + entry.duration,0)} of ${item.estimatedMinutes} min fitted` : "No safe fit";
    list.innerHTML = this.draft.length ? this.draft.map(entry => `<li><span>${escapeHtml(this.date(entry.dateKey).toLocaleDateString([], {weekday:"short",month:"short",day:"numeric"}))}</span><strong>${escapeHtml(entry.s)}–${escapeHtml(entry.e)}</strong><small>${escapeHtml(entry.label)}</small></li>`).join("") : '<li class="empty-state">No future flexible block of at least 25 minutes exists before this deadline. Adjust the timetable or add this assignment to Tasks instead.</li>';
    document.getElementById("assignment-plan-apply").disabled = !this.draft.length;
    this.status(remaining > 0 ? `${remaining} estimated minutes could not be fitted. The preview shows only genuine available timetable capacity.` : "All estimated work fits. Review every session before applying.");
  },

  cancelPlan() { this.draft = []; document.getElementById("assignment-plan").classList.add("hidden"); this.status("Plan dismissed. Nothing changed."); },

  async applyPlan() {
    if (!this.draft.length) return;
    const before = structuredClone(Calendar.events);
    this.draft.forEach(entry => {
      const text = `Assignment · ${entry.subject} · ${entry.s}–${entry.e} · ${entry.title}`;
      Calendar.events[entry.dateKey] = Calendar.events[entry.dateKey] || [];
      if (!Calendar.events[entry.dateKey].includes(text)) Calendar.events[entry.dateKey].push(text);
    });
    await chrome.storage.local.set({hq_calendar_events:Calendar.events,[this.UNDO_KEY]:before});
    document.getElementById("assignment-plan-undo").disabled = false;
    const count = this.draft.length;
    await Calendar.render();
    await Today?.render?.();
    this.cancelPlan();
    this.status(`${count} reviewed assignment session${count === 1 ? "" : "s"} added. Undo remains available.`);
  },

  async undoPlan() {
    const saved = await chrome.storage.local.get(this.UNDO_KEY);
    if (!saved[this.UNDO_KEY]) return;
    Calendar.events = saved[this.UNDO_KEY];
    await chrome.storage.local.set({hq_calendar_events:Calendar.events});
    await chrome.storage.local.remove(this.UNDO_KEY);
    document.getElementById("assignment-plan-undo").disabled = true;
    await Calendar.render();
    await Today?.render?.();
    this.status("The last assignment session plan was undone.");
  },

  async undoDelete() {
    const saved = await chrome.storage.local.get(this.DELETE_UNDO_KEY);
    const item = this.normalize(saved[this.DELETE_UNDO_KEY]);
    if (!item) return;
    if (!this.items.some(entry => entry.id === item.id)) this.items.push(item);
    await chrome.storage.local.remove(this.DELETE_UNDO_KEY);
    document.getElementById("assignment-delete-undo").classList.add("hidden");
    await this.save();
    this.status(`Restored “${item.title}”.`);
  },

  async addTask(item) {
    if (Tasks.data.some(task => task.source === "assignment" && task.sourceId === item.id && !task.done)) { this.status("An open task already links to this assignment."); return; }
    Tasks.add(`${item.subject}: ${item.title}`,null,item.estimatedMinutes,{priority:item.priority,dueAt:this.date(item.dueDate).setHours(17,0,0,0),source:"assignment",sourceId:item.id});
    await Tasks.save();
    this.status("Assignment added to Tasks with its real deadline and priority.");
  },

  async addStepTasks(item, onlyNext = false) {
    const entries = (item.steps || []).map((step, index) => ({ step, index, task: this.linkedTask(item, step, index) })).filter(entry => !entry.task);
    const selected = onlyNext ? entries.slice(0, 1) : entries;
    let added = 0;
    selected.forEach(({ step, index }) => {
      const sourceId = item.intakeId ? `${item.intakeId}:${step.id || index}` : `${item.id}:${step.id || index}`;
      Tasks.add(`${item.subject}: ${step.label}`, null, step.minutes, {
        priority: item.priority, dueAt: this.date(item.dueDate).setHours(17,0,0,0), priorityReason: "assignment deadline",
        source: item.intakeId ? "assessment-step" : "assignment-step", sourceId, deferSave: true,
      });
      added += 1;
    });
    if (added) await Tasks.save();
    this.render();
    this.status(added ? `${added} assignment step${added === 1 ? "" : "s"} added to Tasks.` : "Every assignment step already exists in Tasks.");
    return selected.length ? this.linkedTask(item, selected[0].step, selected[0].index) : this.nextStep(item)?.task || null;
  },

  async startNext(item) {
    let entry = this.nextStep(item);
    if (!entry) return this.status("Every recorded step is complete. Reopen a task or mark the assignment complete.");
    let task = entry.task;
    if (!task) {
      await this.addStepTasks(item, true);
      task = this.linkedTask(item, entry.step, entry.index);
    }
    if (!task) return this.status("The next step could not be linked to Tasks.");
    await chrome.storage.local.set({ hq_current_focus_task: { id: task.id, text: task.text, venture: task.venture || item.subject, startedAt: Date.now() } });
    await ContextBus?.patch?.({ activeTaskId: task.id, activeTaskText: task.text, activeVenture: task.venture || item.subject });
    const alreadyRunning = Pomodoro.running;
    if (!alreadyRunning) {
      document.getElementById("pomo-mode").value = "25";
      Pomodoro.reset();
      await Pomodoro.toggle();
    }
    document.querySelector('.dock-btn[data-panel="pomodoro-flyout"]')?.click();
    this.status(alreadyRunning ? `Current focus changed to “${task.text}”; the existing timer kept running.` : `Focus started: ${task.text}`);
  },

  async updateItem(item, card) {
    const field = name => card.querySelector(`[data-edit-field="${name}"]`)?.value?.trim?.() || "";
    const title = field("title");
    const subject = field("subject");
    const dueDate = field("dueDate");
    const estimatedMinutes = Number(field("estimatedMinutes"));
    if (!title || !subject || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(estimatedMinutes) || estimatedMinutes < 25) return this.status("Title, subject, date and estimate must all be valid.");
    const oldDate = item.dueDate;
    const oldTitle = item.title;
    Object.assign(item, {
      title, subject, dueDate, estimatedMinutes: Math.min(3000, estimatedMinutes),
      priority: ["high", "medium", "low"].includes(field("priority")) ? field("priority") : "medium",
      weight: Math.max(0, Math.min(100, Number(field("weight")) || 0)),
      requirements: field("requirements").split(/\n+/).map(value => value.trim()).filter(Boolean).slice(0, 20),
      updatedAt: Date.now(),
    });
    await this.save();
    this.status(`Updated “${oldTitle}”. Existing Task and Calendar copies were preserved${oldDate !== dueDate ? "; review them because the deadline changed" : ""}.`);
  },

  async act(event) {
    const button = event.target.closest("button[data-action]");
    const card = button?.closest("[data-assignment-id]");
    if (!button || !card) return;
    const item = this.items.find(entry => entry.id === card.dataset.assignmentId);
    if (!item) return;
    button.disabled = true;
    try {
      if (button.dataset.action === "start") await this.startNext(item);
      if (button.dataset.action === "steps") await this.addStepTasks(item);
      if (button.dataset.action === "plan") this.buildPlan(item.id);
      if (button.dataset.action === "task") await this.addTask(item);
      if (button.dataset.action === "update") await this.updateItem(item, card);
      if (button.dataset.action === "complete") { item.done = !item.done; item.completedAt = item.done ? Date.now() : null; await this.save(); }
      if (button.dataset.action === "delete" && confirm(`Delete “${item.title}”? Existing Tasks and Calendar sessions will remain untouched, and one-step undo will remain available.`)) {
        await chrome.storage.local.set({ [this.DELETE_UNDO_KEY]: item });
        this.items = this.items.filter(entry => entry.id !== item.id);
        await this.save();
        document.getElementById("assignment-delete-undo").classList.remove("hidden");
        this.status("Assignment removed. Tasks and calendar entries were preserved; undo is available.");
      }
    } finally { if (button.isConnected) button.disabled = false; }
  },

  async init() {
    await this.load(); this.render();
    const due = document.getElementById("assignment-due");
    document.getElementById("assignment-form").onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = document.getElementById("assignment-title").value.trim();
      const subject = document.getElementById("assignment-subject").value.trim();
      const dueDate = due.value;
      const estimatedMinutes = Number(document.getElementById("assignment-minutes").value);
      const priority = document.getElementById("assignment-priority").value;
      const type = document.getElementById("assignment-type").value;
      const weight = Number(document.getElementById("assignment-weight").value) || 0;
      const requirements = document.getElementById("assignment-requirements").value.split(/\n+/).map(value => value.trim()).filter(Boolean).slice(0, 20);
      if (!title || !subject || !dueDate || !Number.isFinite(estimatedMinutes) || estimatedMinutes < 25) return this.status("Add a title, subject, valid due date, and at least 25 estimated minutes.");
      this.items.push({id:crypto.randomUUID(),title:title.slice(0,120),subject:subject.slice(0,48),dueDate,estimatedMinutes:Math.min(3000,estimatedMinutes),priority:["high","medium","low"].includes(priority) ? priority : "medium",type,weight:Math.max(0,Math.min(100,weight)),requirements,steps:this.defaultSteps(type,requirements),done:false,createdAt:Date.now()});
      await this.save();
      form.reset();
      document.getElementById("assignment-minutes").value = "100";
      this.status("Assignment and action plan tracked locally. No Task or Calendar entry was created.");
    };
    document.getElementById("assignment-list").onclick = event => this.act(event).catch(error => { console.error("Assignment action failed:",error); this.status("That action stopped safely. Nothing else was changed."); });
    document.getElementById("assignment-plan-cancel").onclick = () => this.cancelPlan();
    document.getElementById("assignment-plan-apply").onclick = () => this.applyPlan().catch(error => this.status(`Calendar plan failed safely: ${error.message}`));
    document.getElementById("assignment-plan-undo").onclick = () => this.undoPlan().catch(error => this.status(`Undo failed: ${error.message}`));
    document.getElementById("assignment-delete-undo").onclick = () => this.undoDelete().catch(error => this.status(`Assignment restore failed: ${error.message}`));
  },
};
