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

// Invalid historical learning cannot escape the curated taxonomy.
const unsafeBookmark = { title: "Watch this", url: "https://youtube.com/watch?v=unsafe" };
const unsafeLearned = Classifier.classify(unsafeBookmark, { [Classifier.fingerprint(unsafeBookmark)]: ["Personal", "Secret", "Deep"] }, []);
assert.equal(unsafeLearned.source, "needs-content");
assert.equal(Classifier.isManagedPath(["Utilities & Misc", "Review Queue"], { allowOperational: false }), false);
assert.equal(Classifier.isManagedPath(["Coding & Dev", "AI Tools"], { allowOperational: false }), true);
assert.notEqual(
  Classifier.fingerprint({ url: "https://youtube.com/watch?v=one" }),
  Classifier.fingerprint({ url: "https://youtube.com/watch?v=two" }),
  "Learned YouTube corrections must be video-specific",
);

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

console.log("✓ Managed-only cleanup, validated learning, exclusive mutations, failure-safe logging, and exact undo");
