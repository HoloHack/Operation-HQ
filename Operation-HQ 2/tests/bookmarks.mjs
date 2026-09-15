import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = name => fs.readFileSync(new URL(`../js/${name}`, import.meta.url), "utf8");
const storage = {};
const nodes = new Map();
let nextId = 100;

function add(node) {
  const safe = { ...node, id: String(node.id) };
  nodes.set(safe.id, safe);
  return safe;
}

function childrenOf(parentId) {
  return [...nodes.values()].filter(node => node.parentId === String(parentId));
}

function treeNode(id) {
  const node = nodes.get(String(id));
  if (!node) return null;
  const copy = { ...node };
  if (!copy.url) copy.children = childrenOf(copy.id).map(child => treeNode(child.id));
  return copy;
}

function resetTree() {
  nodes.clear();
  add({ id: "0", title: "root" });
  add({ id: "1", parentId: "0", title: "Bookmarks Bar" });
}
resetTree();

const chrome = {
  permissions: {
    async contains() { return true; },
    async request() { return true; },
  },
  storage: { local: {
    async get(keys) {
      const names = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
      return Object.fromEntries(names.map(key => [key, storage[key]]));
    },
    async set(values) { Object.assign(storage, values); },
  } },
  bookmarks: {
    async getTree() { return [treeNode("0")]; },
    async getSubTree(id) { const node = treeNode(id); if (!node) throw new Error("missing"); return [node]; },
    async getChildren(id) { return childrenOf(id).map(node => ({ ...node })); },
    async get(id) { const node = nodes.get(String(id)); if (!node) throw new Error("missing"); return [{ ...node }]; },
    async create({ parentId, title }) { return add({ id: String(nextId++), parentId: String(parentId), title }); },
    async move(id, { parentId }) { const node = nodes.get(String(id)); if (!node) throw new Error("missing"); node.parentId = String(parentId); return { ...node }; },
    async remove(id) {
      if (childrenOf(id).length) throw new Error("not empty");
      if (!nodes.delete(String(id))) throw new Error("missing");
    },
    async update(id, changes) { const node = nodes.get(String(id)); Object.assign(node, changes); return { ...node }; },
  },
};

const context = vm.createContext({ chrome, URL, Set, Map, AbortController, DOMParser: class {}, fetch, crypto: webcrypto, console, setTimeout, clearTimeout });
vm.runInContext(source("classifier.js"), context, { filename: "classifier.js" });
vm.runInContext(source("bookmarks.js"), context, { filename: "bookmarks.js" });
const Classifier = vm.runInContext("Classifier", context);
const Bookmarks = vm.runInContext("Bookmarks", context);
assert.equal(Bookmarks.evidenceEndpoints("http://127.0.0.1/private").length, 0, "Private-network pages must not be fetched for classification");
assert.equal(Bookmarks.evidenceEndpoints("https://youtube.com/watch?v=evidence").length, 2, "YouTube should use its metadata endpoint before the full page");

// Invalid historical learning cannot escape the curated taxonomy.
const unsafeBookmark = { title: "Watch this", url: "https://youtube.com/watch?v=unsafe" };
const unsafeLearned = Classifier.classify(unsafeBookmark, { [Classifier.fingerprint(unsafeBookmark)]: ["Personal", "Secret", "Deep"] }, []);
assert.equal(unsafeLearned.source, "needs-content");
assert.equal(unsafeLearned.path, null);
assert.equal(Classifier.isManagedPath(["Utilities & Misc", "Review Queue"], { allowOperational: false }), false);
assert.equal(Classifier.isManagedPath(["Coding & Dev", "AI Tools"], { allowOperational: false }), true);
assert.deepEqual(
  Array.from(Classifier.classify({ title:"API reference", url:"https://docs.github.com/en/rest" }, {}, []).path),
  ["Coding & Dev", "Docs & References"],
  "Stable-domain matching must work through subdomains",
);
assert.deepEqual(
  Array.from(Classifier.classify({ title:"Watch this", url:"https://youtube.com/watch?v=placed", sourcePath:["School & Academics", "Mathematics"] }, {}, []).path),
  ["School & Academics", "Mathematics"],
  "An explicit valid owner placement must survive an ambiguous title",
);
assert.deepEqual(
  Array.from(Classifier.classify({ title:"Cambridge Maths chapter 5 quadratics", url:"https://youtube.com/watch?v=override", sourcePath:["Entertainment", "Streaming"] }, {}, []).path),
  ["School & Academics", "Mathematics"],
  "Strong page topic must correct a conflicting platform-style placement",
);
const oneSignal = Classifier.classify({ title:"Calculus", url:"https://youtube.com/watch?v=calculus" }, {}, []);
assert.equal(oneSignal.confidence, "high", "One subject-specific signal should be sufficient when uncontested");
assert.deepEqual(Array.from(oneSignal.path), ["School & Academics", "Mathematics"]);
const conflictingSignals = Classifier.classify({ title:"Physics React", url:"https://example.com/item" }, {}, []);
assert.equal(conflictingSignals.path, null, "Two equally credible topics must not trigger a guessed move");
assert.equal(conflictingSignals.source, "ambiguous-content");
assert.notEqual(
  Classifier.fingerprint({ url: "https://youtube.com/watch?v=one" }),
  Classifier.fingerprint({ url: "https://youtube.com/watch?v=two" }),
  "Learned YouTube corrections must be video-specific",
);
assert.equal(
  Classifier.fingerprint({ url:"https://m.youtube.com/watch?v=one" }),
  Classifier.fingerprint({ url:"https://youtube.com/watch?v=one" }),
  "Mobile and desktop forms of the same YouTube video must share one exact fingerprint",
);
assert.equal(Classifier.isContentVariesDomain("old.reddit.com"), true, "Content-variable protection must include service subdomains");

// Cleanup removes only registered folders created by Operation HQ.
resetTree();
add({ id: "user-empty", parentId: "1", title: "My empty folder" });
add({ id: "managed-root", parentId: "1", title: "Utilities & Misc" });
add({ id: "managed-tools", parentId: "managed-root", title: "Tools" });
storage[Bookmarks.MANAGED_KEY] = [
  { id: "managed-root", path: ["Utilities & Misc"] },
  { id: "managed-tools", path: ["Utilities & Misc", "Tools"] },
];
const removed = await Bookmarks.cleanupManagedEmptyFolders("1");
assert.equal(removed, 2);
assert(nodes.has("user-empty"), "A user-owned empty folder must never be removed");

// A failed Chrome move never appears in the undo transaction.
resetTree();
add({ id: "source", parentId: "1", title: "Source" });
add({ id: "target", parentId: "1", title: "Target" });
const failed = add({ id: "failed", parentId: "source", title: "Failed", url: "https://example.com" });
const moves = [];
const originalMove = chrome.bookmarks.move;
chrome.bookmarks.move = async () => { throw new Error("simulated move failure"); };
await assert.rejects(Bookmarks.moveAndRecord(failed, "target", ["Utilities & Misc", "Tools"], "1", moves));
assert.equal(moves.length, 0);
chrome.bookmarks.move = originalMove;

// A second operation is rejected while the first owns the mutation lock.
let release;
const held = new Promise(resolve => { release = resolve; });
const first = Bookmarks.runExclusive("first", () => held);
const second = await Bookmarks.runExclusive("second", async () => true);
assert.equal(second.blocked, true);
release();
await first;

// A full sort files strong topics, leaves ambiguous links untouched, persists
// the exact unresolved decision, and never creates a catch-all folder.
resetTree();
for (const key of Object.keys(storage)) delete storage[key];
Bookmarks.decisionItems = [];
add({ id:"ambiguous-video", parentId:"1", title:"Watch this", url:"https://youtube.com/watch?v=ambiguous" });
add({ id:"math-video", parentId:"1", title:"Cambridge Maths chapter 5 quadratics", url:"https://youtube.com/watch?v=maths" });
await Bookmarks.applySort();
const schoolRoot = childrenOf("1").find(node => node.title === "School & Academics");
const mathematics = schoolRoot && childrenOf(schoolRoot.id).find(node => node.title === "Mathematics");
assert(mathematics, "The Mathematics destination was not created");
assert.equal(nodes.get("math-video").parentId, mathematics.id, "A strong maths bookmark was not filed correctly");
assert.equal(nodes.get("ambiguous-video").parentId, "1", "An ambiguous bookmark must remain where the user saved it");
assert.deepEqual(Array.from(storage[Bookmarks.DECISIONS_KEY], item => item.bm.id), ["ambiguous-video"]);
assert.equal([...nodes.values()].some(node => node.title === "Review Queue"), false, "A sort must never create Review Queue");

// Sort + verify evidence is one continuous user action: an ambiguous title is
// resolved by page metadata and filed without ever entering a holding folder.
resetTree();
for (const key of Object.keys(storage)) delete storage[key];
Bookmarks.decisionItems = [];
add({ id:"evidence-video", parentId:"1", title:"Watch this", url:"https://youtube.com/watch?v=evidence" });
const realFetchPageContext = Bookmarks.fetchPageContext;
Bookmarks.fetchPageContext = async () => "Calculus derivatives practice";
await Bookmarks.sortAll();
Bookmarks.fetchPageContext = realFetchPageContext;
const evidenceSchool = childrenOf("1").find(node => node.title === "School & Academics");
const evidenceMaths = evidenceSchool && childrenOf(evidenceSchool.id).find(node => node.title === "Mathematics");
assert.equal(nodes.get("evidence-video").parentId, evidenceMaths?.id, "Page evidence did not resolve and file the ambiguous bookmark");
assert.equal(storage[Bookmarks.DECISIONS_KEY].length, 0, "A page-evidence resolution must clear its pending decision");
assert.equal([...nodes.values()].some(node => node.title === "Review Queue"), false);

// Populated holding folders left by old releases are evacuated to the neutral
// Bookmark Bar and removed, without assigning their links a guessed category.
resetTree();
for (const key of Object.keys(storage)) delete storage[key];
Bookmarks.decisionItems = [];
add({ id:"legacy-utilities", parentId:"1", title:"Utilities & Misc" });
add({ id:"legacy-queue", parentId:"legacy-utilities", title:"Review Queue" });
add({ id:"legacy-ambiguous", parentId:"legacy-queue", title:"Watch this", url:"https://youtube.com/watch?v=legacy" });
await Bookmarks.applySort();
assert.equal(nodes.get("legacy-ambiguous").parentId, "1", "A legacy-held ambiguous link must be released to the Bookmark Bar");
assert.equal(nodes.has("legacy-queue"), false, "The retired Review Queue folder must be removed after evacuation");
assert.deepEqual(Array.from(storage[Bookmarks.DECISIONS_KEY], item => item.bm.id), ["legacy-ambiguous"]);

// Exact undo restores only bookmarks still at the transaction destination.
resetTree();
add({ id: "from", parentId: "1", title: "From" });
add({ id: "to", parentId: "1", title: "To" });
add({ id: "other", parentId: "1", title: "Other" });
add({ id: "stable", parentId: "to", title: "Stable", url: "https://stable.example" });
add({ id: "changed", parentId: "other", title: "Changed later", url: "https://changed.example" });
storage[Bookmarks.UNDO_KEY] = [{
  id: "tx-1", kind: "full-sort", createdAt: Date.now(), moves: [
    { id: "stable", fromParentId: "from", fromPath: ["From"], toParentId: "to", toPath: ["Utilities & Misc", "Tools"] },
    { id: "changed", fromParentId: "from", fromPath: ["From"], toParentId: "to", toPath: ["Utilities & Misc", "Tools"] },
  ],
}];
storage[Bookmarks.MANAGED_KEY] = [];
await Bookmarks.undo();
assert.equal(nodes.get("stable").parentId, "from");
assert.equal(nodes.get("changed").parentId, "other", "Undo must not overwrite a later manual move");
assert.equal(storage[Bookmarks.UNDO_KEY].length, 0);

console.log("✓ Accuracy-first sorting, no catch-all folder, legacy evacuation, validated learning, exclusive mutations, failure-safe logging, and exact undo");
