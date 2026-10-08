import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../js/local-ai.js", import.meta.url), "utf8");
function instance(create) {
  const context = vm.createContext({ navigator: { gpu: {}, locks: navigator.locks }, window: { WebLLM: { CreateMLCEngine: create } }, chrome: { storage: { local: { async set() {} } } }, console });
  vm.runInContext(source, context);
  return vm.runInContext("LocalAI", context);
}
const engine = () => ({ unload: async () => {}, interruptGenerate() {}, chat: { completions: { async create() { return { choices: [{ message: { content: "Ready" } }] }; } } } });

test("rapid load calls allocate only one model", async () => {
  let finish, count = 0;
  const ready = new Promise(r => { finish = r; });
  const ai = instance(async () => { count++; await ready; return engine(); });
  const first = ai.downloadAndLoad();
  await assert.rejects(ai.downloadAndLoad(), /loading or unloading/);
  finish(); await first;
  assert.equal(count, 1);
  await ai.unload();
});

test("separate tabs share one model slot; unload allows the next tab", async () => {
  let count = 0;
  const create = async () => { count++; return engine(); };
  const first = instance(create), second = instance(create);
  await first.downloadAndLoad();
  await assert.rejects(second.downloadAndLoad(), /another HQ tab/);
  assert.equal(count, 1);
  await first.unload();
  await second.downloadAndLoad();
  assert.equal(count, 2);
  await second.unload();
});

test("failed loads release the slot and can be retried", async () => {
  let fail = true;
  const ai = instance(async () => { if (fail) throw new Error("network interrupted"); return engine(); });
  await assert.rejects(ai.downloadAndLoad(), /network interrupted/);
  assert.equal(ai._loading, false);
  fail = false;
  await ai.downloadAndLoad(); await ai.unload();
});

test("unloading waits for cancelled inference before releasing the engine", async () => {
  let finish, requested, unloaded = false;
  const started = new Promise(r => { requested = r; });
  const response = new Promise(r => { finish = r; });
  const model = engine();
  model.chat.completions.create = () => { requested(); return response; };
  model.unload = async () => { unloaded = true; };
  const ai = instance(async () => model);
  await ai.downloadAndLoad();
  const first = ai.run({ system: "help", input: "math" });
  const cancelled = assert.rejects(first, /cancelled/);
  await started;
  ai.cancelActive();
  await assert.rejects(ai.run({ system: "help", input: "more math" }), /another request/);
  const unload = ai.unload();
  assert.equal(unloaded, false);
  finish({ choices: [{ message: { content: "late response" } }] });
  await cancelled; await unload;
  assert.equal(unloaded, true);
  assert.equal(ai.isLoadedThisSession(), false);
});

test("a failed unload retains the engine and lock for a safe retry", async () => {
  const model = engine(); let fail = true;
  model.unload = async () => { if (fail) throw new Error("GPU busy"); };
  const ai = instance(async () => model), other = instance(async () => engine());
  await ai.downloadAndLoad();
  await assert.rejects(ai.unload(), /GPU busy/);
  assert.equal(ai.isLoadedThisSession(), true);
  await assert.rejects(other.downloadAndLoad(), /another HQ tab/);
  fail = false; await ai.unload();
  await other.downloadAndLoad(); await other.unload();
});

test("changing profile while loading is rejected", async () => {
  let release;
  const ready = new Promise(r => { release = r; });
  const ai = instance(async () => { await ready; return engine(); });
  const load = ai.downloadAndLoad();
  await assert.rejects(ai.selectProfile("math"), /Unload/);
  release(); await load; await ai.unload();
  await ai.selectProfile("math");
  assert.equal(ai.profileId, "math");
});
