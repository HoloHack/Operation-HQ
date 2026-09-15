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

console.log("✓ Nexus parses exact chapter lists, focus plans, missing details, themes, resources, and browser reviews deterministically");
