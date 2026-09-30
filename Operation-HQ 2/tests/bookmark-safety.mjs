import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

const source = name => fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), "utf8");
function fixture() {
  const data = {};
  const nodes = new Map();
  let sequence = 10;
  const children = id => [...nodes.values()].filter(n => n.parentId === id).sort((a, b) => a.index - b.index);
  const add = node => { nodes.set(node.id, { index: children(node.parentId).length, ...node }); return structuredClone(nodes.get(node.id)); };
  add({ id: "0", title: "root" });
  add({ id: "1", parentId: "0", title: "Bookmarks Bar" });
  add({ id: "from", parentId: "1", title: "Personal" });
  add({ id: "to", parentId: "1", title: "Destination" });
  for (const id of ["a", "b", "c"]) add({ id, parentId: "from", title: id, url: `https://example.org/${id}` });
  const tree = id => { const n = structuredClone(nodes.get(id)); if (!n.url) n.children = children(id).map(child => tree(child.id)); return n; };
  const chrome = {
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])])); },
      async set(values) { Object.assign(data, structuredClone(values)); },
    } },
    bookmarks: {
      async get(id) { if (!nodes.has(id)) throw new Error("missing bookmark"); return [structuredClone(nodes.get(id))]; },
      async getChildren(id) { return structuredClone(children(id)); },
      async getTree() { return [tree("0")]; },
      async getSubTree(id) { return [tree(id)]; },
      async create(input) { return add({ ...input, id: String(sequence++) }); },
      async move(id, { parentId, index }) {
        const node = nodes.get(id);
        if (!node || !nodes.has(parentId) || nodes.get(parentId).url) throw new Error("invalid move");
        const old = children(node.parentId).filter(n => n.id !== id);
        old.forEach((n, i) => { n.index = i; });
        const next = children(parentId).filter(n => n.id !== id);
        if (index !== undefined && (!Number.isInteger(index) || index < 0 || index > next.length)) throw new Error("invalid index");
        next.splice(index ?? next.length, 0, node);
        node.parentId = parentId;
        next.forEach((n, i) => { n.index = i; });
        return structuredClone(node);
      },
      async remove(id) { if (children(id).length) throw new Error("not empty"); nodes.delete(id); },
    },
  };
  function page(lockNavigator = navigator) {
    const context = vm.createContext({ chrome, navigator: lockNavigator, crypto: webcrypto, console, URL, setTimeout, clearTimeout, AbortController });
    vm.runInContext(source("classifier") + "\n" + source("bookmarks"), context);
    return vm.runInContext("Bookmarks", context);
  }
  return { data, nodes, chrome, children, add, page, book: page() };
}
const read = async (f, id) => (await f.chrome.bookmarks.get(id))[0];
const move = async (f, id, moves = []) => f.book.moveAndRecord(await read(f, id), "to", [], "1", moves);

test("independent pages cannot interleave bookmark operations", async () => {
  const f = fixture();
  let started, release;
  const acquired = new Promise(r => { started = r; });
  const hold = new Promise(r => { release = r; });
  const first = f.book.runExclusive("first", async () => { started(); await hold; });
  await acquired;
  let ran = false;
  const second = await f.page().runExclusive("second", async () => { ran = true; });
  assert.equal(second.blocked, true);
  assert.equal(ran, false);
  release(); await first;
});

test("missing coordination fails closed and always restores controls", async () => {
  const f = fixture(), book = f.page({});
  let ran = false;
  assert.equal((await book.runExclusive("sort", async () => { ran = true; })).error, true);
  assert.equal(ran, false); assert.equal(book.busy, false);
});

test("storage errors do not leave controls locked or an unhandled rejection", async () => {
  const f = fixture();
  f.chrome.storage.local.get = async () => { throw new Error("storage offline"); };
  f.chrome.storage.local.set = async () => { throw new Error("storage offline"); };
  assert.equal((await f.book.runExclusive("sort", async () => assert.fail())).error, true);
  assert.equal(f.book.busy, false);
});

test("a stopped sort persists recovery before committing its final undo record", async () => {
  const f = fixture();
  await f.book.runExclusive("sort", async () => { await move(f, "b"); throw new Error("interrupted"); });
  assert.equal(f.nodes.get("b").parentId, "to");
  assert.equal(f.data[f.book.JOURNAL_KEY].moves.length, 1);
  const fresh = f.page();
  assert.equal((await fresh.runExclusive("sort", async () => assert.fail())).error, true);
  await fresh.undo();
  assert.deepEqual(f.children("from").map(n => n.id), ["a", "b", "c"]);
  assert.equal(f.data[f.book.JOURNAL_KEY], null);
});

test("journal intent is durable before Chrome receives any mutation", async () => {
  const f = fixture(), original = f.chrome.bookmarks.move;
  f.chrome.bookmarks.move = async (...args) => {
    assert.equal(f.data[f.book.JOURNAL_KEY].moves[0].id, "a");
    return original(...args);
  };
  await f.book.runExclusive("sort", () => move(f, "a"));
});

test("journal failure prevents the move and all subsequent moves", async () => {
  const f = fixture(), original = f.chrome.storage.local.set;
  f.chrome.storage.local.set = async values => { if (values[f.book.JOURNAL_KEY]) throw new Error("quota"); return original(values); };
  await assert.rejects(move(f, "a"));
  f.chrome.storage.local.set = original;
  await assert.rejects(move(f, "b"), /Recovery storage failed/);
  assert.deepEqual(f.children("from").map(n => n.id), ["a", "b", "c"]);
});

test("a failed Chrome move is not recorded as a completed move", async () => {
  const f = fixture(), moves = [];
  f.chrome.bookmarks.move = async () => { throw new Error("Chrome unavailable"); };
  await assert.rejects(move(f, "a", moves));
  assert.equal(moves.length, 0);
  assert.equal(f.data[f.book.JOURNAL_KEY].moves.length, 0);
});

test("undo restores original sibling order across multiple moves", async () => {
  const f = fixture();
  await f.book.runExclusive("sort", async () => {
    const moves = []; await move(f, "b", moves); await move(f, "a", moves);
    await f.book.commitTransaction("sort", moves);
  });
  await f.book.undo();
  assert.deepEqual(f.children("from").map(n => n.id), ["a", "b", "c"]);
});

test("undo keeps transient failures available for retry", async () => {
  const f = fixture();
  await f.book.runExclusive("sort", async () => { const moves = []; await move(f, "b", moves); await f.book.commitTransaction("sort", moves); });
  const original = f.chrome.bookmarks.move;
  f.chrome.bookmarks.move = async () => { throw new Error("temporary failure"); };
  await f.book.undo();
  assert.equal(f.data[f.book.UNDO_KEY][0].moves.length, 1);
  f.chrome.bookmarks.move = original;
  await f.book.undo();
  assert.equal(f.data[f.book.UNDO_KEY].length, 0);
  assert.deepEqual(f.children("from").map(n => n.id), ["a", "b", "c"]);
});

test("sorting refuses stale previews and undo preserves later user moves", async () => {
  const f = fixture(), stale = await read(f, "a");
  await f.chrome.bookmarks.move("a", { parentId: "1" });
  await assert.rejects(f.book.moveAndRecord(stale, "to", [], "1", []), /changed after preview/);
  await f.book.runExclusive("sort", async () => { const moves = []; await move(f, "b", moves); await f.book.commitTransaction("sort", moves); });
  await f.chrome.bookmarks.move("b", { parentId: "1" });
  await f.book.undo();
  assert.equal(f.nodes.get("b").parentId, "1");
});

test("legacy names do not establish ownership of user folders", async () => {
  const f = fixture();
  for (const title of ["Review Queue", "Uncategorized"]) f.add({ id: title, title, parentId: "1" });
  await f.book.cleanupLegacyHoldingFolders("1");
  assert(f.nodes.has("Review Queue")); assert(f.nodes.has("Uncategorized"));
});

test("managed source folders needed for undo are not removed", async () => {
  const f = fixture();
  f.nodes.get("from").title = "School & Academics";
  f.data[f.book.MANAGED_KEY] = [{ id: "from", path: ["School & Academics"] }];
  await f.book.runExclusive("sort", async () => {
    const moves = [];
    for (const id of ["a", "b", "c"]) await move(f, id, moves);
    await f.book.commitTransaction("sort", moves);
    await f.book.cleanupManagedEmptyFolders("1");
  });
  assert(f.nodes.has("from"));
  await f.book.undo();
  assert.deepEqual(f.children("from").map(n => n.id), ["a", "b", "c"]);
});
