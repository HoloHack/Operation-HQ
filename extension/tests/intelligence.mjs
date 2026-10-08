import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/command-intelligence.js", import.meta.url), "utf8");
const context = vm.createContext({ URL, Set, Map, Date, String, Number });
vm.runInContext(source, context, { filename:"command-intelligence.js" });
const Engine = vm.runInContext("HQCommandEngine", context);
const nexusSource = fs.readFileSync(new URL("../js/nexus.js", import.meta.url), "utf8");
vm.runInContext(nexusSource, context, { filename:"nexus.js" });
const NexusUnit = vm.runInContext("Nexus", context);
const scheduleSource = fs.readFileSync(new URL("../js/schedule.js", import.meta.url), "utf8");
vm.runInContext(scheduleSource, context, { filename:"schedule.js" });
const ScheduleUnit = vm.runInContext("Schedule", context);

const plan = Engine.parse("Reschedule my work so Maths chapters 3 to 7 are the priority by 2026-09-18 for 40 minutes");
assert.equal(plan.intent, "focus-plan");
assert.equal(plan.subject.id, "maths");
assert.deepEqual({ start:plan.chapters.start, end:plan.chapters.end }, { start:3, end:7 });
assert.equal(plan.deadline.key, "2026-09-18");
assert.equal(plan.duration, 40);
assert.equal(plan.changesSchedule, true);

const grind = Engine.parse("Today I am going to grind Maths chapters 5, 7, 8 and 10");
assert.equal(grind.intent, "focus-plan");
assert.equal(grind.subject.id, "maths");
assert.deepEqual(Array.from(grind.chapters.values), [5, 7, 8, 10]);
assert.equal(grind.chapters.contiguous, false);
assert.equal(grind.deadline.label, "today");
assert.equal(grind.changesSchedule, false);
assert.equal(grind.buildsDraft, true);
assert.equal(NexusUnit.focusLabel(grind), "Maths · chapters 5, 7, 8 and 10");
assert.deepEqual(Array.from(ScheduleUnit.chapterValues(grind.chapters)), [5, 7, 8, 10]);
const explicitDeadlineWins = Engine.parse("Today, reschedule Maths chapters 5 and 7 by Friday");
assert.match(explicitDeadlineWins.deadline.label.toLowerCase(), /friday/);

const incomplete = Engine.parse("Focus on Maths chapters");
assert.equal(incomplete.intent, "focus-plan");
assert.equal(incomplete.chapters, null);

assert.equal(Engine.parse("Create a colour scheme for HSIE study").intent, "generated-theme");
assert.equal(Engine.parse("Explain completing the square").intent, "study-help");
assert.equal(Engine.parse("Find my Cambridge Maths chapter 4 bookmark").intent, "find-resource");
assert.equal(Engine.parse("Optimise duplicate tabs and groups").intent, "browser-review");
assert.deepEqual(Array.from(Engine.tokens("Find my saved Cambridge Maths chapter 4")), ["cambridge", "maths", "4"]);
assert(Engine.resourceQuery("", grind.subject, grind.chapters).includes("5 7 8 10"));
assert.deepEqual(Array.from(Engine.chapterRange("chapters 5, 7 to 8 and 10").values), [5, 7, 8, 10]);
for (const text of ["chapters 8 to 3", "chapters 1 to 200", "chapter 1000", "chapter 1.5"]) {
  assert.equal(Engine.chapterRange(text), null, `Must not silently shorten an invalid request: ${text}`);
}
assert.equal(Engine.deadlineFor("today, finish by 2026-02-31"), null);
assert.equal(Engine.deadlineFor("by 2028-02-29").key, "2028-02-29");

// Commands await the real lazy loader; a timer tick is not a loading boundary.
let finishOpen, opened = false, viewed = "", messages = [];
const opening = new Promise(resolve => { finishOpen = resolve; });
context.window = { HQPanels: { async open(id) { assert.equal(id, "assignments-flyout"); await opening; opened = true; return true; } } };
context.StudyOS = { showView(view) { assert(opened); viewed = view; } };
NexusUnit.setResult = message => messages.push(message);
const action = NexusUnit.capabilityRegistry().find(item => item.id === "research-library").run();
assert.equal(viewed, ""); assert.equal(messages.length, 0);
finishOpen(); await action;
assert.equal(viewed, "research");
context.window.HQPanels.open = async () => false;
messages = [];
await assert.rejects(NexusUnit.openPanel("gmail-flyout", "Gmail opened"), /Panel not available/);
assert.equal(messages.length, 0, "Failed routes cannot claim a panel opened");

const elements = new Map();
context.document = { getElementById(id) { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } };
NexusUnit.renderResources = () => {};
NexusUnit.remember = async () => {};
Engine.savedResources = async () => [];
assert.equal(await NexusUnit.handleIntelligentIntent(grind, "Today grind maths chapters 5, 7, 8 and 10"), true, "A focus preview must stop command routing rather than fall through to a second action");
assert.equal(NexusUnit.pendingPlan.title, "Launch Maths · chapters 5, 7, 8 and 10");
let ran = 0, finishPlan;
NexusUnit.pendingPlan = { title: "test", run: () => { ran++; return new Promise(resolve => { finishPlan = resolve; }); } };
NexusUnit.refreshContext = () => {};
const executing = NexusUnit.confirmPlan();
await NexusUnit.confirmPlan();
assert.equal(ran, 1, "Double confirmation must not run a plan twice");
finishPlan(); await executing;

console.log("✓ Nexus parses exact chapter lists, focus plans, missing details, themes, resources, and browser reviews deterministically");
