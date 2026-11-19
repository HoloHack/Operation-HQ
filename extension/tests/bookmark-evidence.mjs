import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function fixture() {
  const data = {};
  const nodes = new Map();
  const add = node => { nodes.set(node.id, {...node}); return node; };
  add({id:'1',title:'Bookmarks Bar'});
  const tree = id => { const n = {...nodes.get(id)}; if(!n.url)n.children=[...nodes.values()].filter(c=>c.parentId===id).map(c=>tree(c.id)); return n; };
  let reads = 0;
  const chrome = {
    storage:{local:{get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))}},
    bookmarks:{getSubTree:async id=>[tree(id)],get:async id=>{if(!nodes.has(id))throw Error('Missing bookmark');return [{...nodes.get(id)}];}},
  };
  const ctx=vm.createContext({URL,console,chrome,navigator,crypto:webcrypto,TextEncoder,AbortController,setTimeout,clearTimeout,fetch:async()=>{reads++;throw Error('Unexpected fetch');}});
  for(const name of ['classifier','bookmarks'])vm.runInContext(fs.readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8'),ctx);
  return {book:vm.runInContext('Bookmarks',ctx),data,add,ctx,reads:()=>reads};
}

test('hash-router resources never share page evidence or reuse old shell evidence',async()=>{
  const {book,data}=fixture();
  data[book.EVIDENCE_KEY]={'url:https://example.org/':{text:'Old shared shell',at:Date.now()}};
  const seen=[];
  book.readPageContext=async url=>{seen.push(url);return url.endsWith('/math')?'Calculus lesson':'Guitar music';};
  assert.equal(await book.fetchPageContext('https://example.org/#/math'),'Calculus lesson');
  assert.equal(await book.fetchPageContext('https://example.org/#/music'),'Guitar music');
  assert.equal(await book.fetchPageContext('https://example.org/#/math'),'Calculus lesson');
  assert.equal(seen.length,2);
});

test('ordinary document anchors reuse evidence for the same page',async()=>{
  const {book}=fixture();let reads=0;
  book.readPageContext=async()=>{reads++;return 'Chemistry chapter';};
  assert.equal(await book.fetchPageContext('https://example.org/lesson#one'),'Chemistry chapter');
  assert.equal(await book.fetchPageContext('https://example.org/lesson#two'),'Chemistry chapter');
  assert.equal(reads,1);
});

test('static fetch cannot claim evidence for hash-router content',async()=>{
  const f=fixture();
  for(const url of ['https://example.org/#/math','https://example.org/#!/music'])assert.equal(await f.book.fetchPageContext(url),'');
  assert.equal(f.reads(),0);
});

test('Deep Review preserves protected titles in pending, legacy and variable-platform scopes',async()=>{
  const f=fixture();f.add({id:'legacy',parentId:'1',title:'Uncategorized'});
  const protectedLink=f.add({id:'keep',parentId:'legacy',title:' INBOX ',url:'https://youtube.com/watch?v=keep'});
  const regular=f.add({id:'sort',parentId:'legacy',title:'Calculus',url:'https://youtube.com/watch?v=sort'});
  f.book.decisionItems=[{bm:protectedLink},{bm:regular}];
  for(const pendingOnly of [true,false]){
    const candidates=await f.book.collectEvidenceCandidates('1',[protectedLink,regular],{pendingOnly});
    assert.deepEqual(Array.from(candidates,item=>item.id),['sort']);
  }
  assert.equal(protectedLink.parentId,'legacy');
});

test('restored decisions cannot rebind old evidence to changed resources or placements',async()=>{
  const f=fixture();
  const old={id:'changed',parentId:'1',title:'Math resource',url:'https://example.org/math'};
  const stable={id:'stable',parentId:'1',title:'Stable resource',url:'https://example.org/stable'};
  f.book.renderAccuracyGate=()=>{};
  for(const edit of [{url:'https://example.org/music'},{title:'Music resource'},{parentId:'manual-folder'},null]){
    if(edit)f.add({...old,...edit});
    else f.add({...old,id:'different'});
    f.add(stable);
    // For the deletion case, request an ID absent from the mutable tree.
    const saved=edit?old:{...old,id:'deleted'};
    f.data[f.book.DECISIONS_KEY]=[{bm:saved,context:'Old mathematical evidence',suggestedPath:['School & Academics','Mathematics'],candidates:[],reasons:['Old evidence']},{bm:stable,context:'Still applicable',candidates:[],reasons:[]}];
    f.book.decisionSelections.set(saved.id,JSON.stringify(['School & Academics','Mathematics']));
    const restored=await f.book.restoreDecisions();
    assert.deepEqual(Array.from(restored,item=>item.bm.id),['stable']);
    assert.equal(f.book.decisionSelections.has(saved.id),false);
    assert.equal(f.data[f.book.DECISIONS_KEY].length,1);
  }
});

function renamedConfirmationFixture(title = 'INBOX') {
  const f=fixture();
  const reviewed={id:'renamed',parentId:'1',title:'Math page',url:'https://example.org/math'};
  f.add({...reviewed,title});
  f.book.decisionItems=[{bm:{...reviewed},suggestedPath:['School & Academics','Mathematics']}];
  // The real store predates the title edit. Without this seed the batch test
  // accidentally checks disappearance from an empty store, not safe rejection.
  f.data[f.book.DECISIONS_KEY]=structuredClone(f.book.decisionItems);
  f.book.decisionSelections.set(reviewed.id,JSON.stringify(['School & Academics','Mathematics']));
  f.ctx.document={querySelectorAll:()=>[]};
  const calls={destinations:0,moves:0};
  Object.assign(f.book,{
    runExclusive:async(_name,operation)=>operation(),
    getAllBookmarks:async()=>({barId:'1',nodes:[]}),
    getOrCreateFolderPath:async()=>{calls.destinations++;return 'destination';},
    moveAndRecord:async()=>{calls.moves++;return true;},
    getLearnedMap:async()=>({}),
    commitTransaction:async()=>{},
    renderAccuracyGate:()=>{},
    cleanupLegacyHoldingFolders:async()=>0,
    recordAudit:async()=>{},
    refreshInboxCount:async()=>{},
    log:()=>{},
  });
  return {...f,calls,reviewed};
}

test('single confirmation rejects protected and ordinary title-only changes while review stays open',async()=>{
  for(const title of ['INBOX','Music page']){
    const f=renamedConfirmationFixture(title);
    await assert.rejects(f.book.applyCorrection(f.reviewed.id,['School & Academics','Mathematics']),/changed after review/);
    assert.deepEqual(f.calls,{destinations:0,moves:0});
    assert.equal(f.data.hq_learned_domains,undefined);
  }
});

test('batch confirmation rejects protected and ordinary title-only changes before destination creation or learning',async()=>{
  for(const title of ['INBOX','Music page']){
    const f=renamedConfirmationFixture(title);
    await f.book.applySelectedDecisions();
    assert.deepEqual(f.calls,{destinations:0,moves:0});
    assert.deepEqual(f.data.hq_learned_domains,{});
    assert.equal(f.book.decisionItems.length,1);
    assert.equal(f.data[f.book.DECISIONS_KEY][0].bm.title,'Math page');
  }
});

test('persisted decisions require matching live Chrome records and retain unrelated decisions',async()=>{
  const f=fixture();
  const stable=f.add({id:'stable',parentId:'1',title:'Stable page',url:'https://example.org/stable'});
  const old={id:'changed',parentId:'1',title:'Old title',url:'https://example.org/changed'};
  f.add({...old,title:'New title'});
  const missing={id:'missing',parentId:'1',title:'Deleted page',url:'https://example.org/missing'};
  await f.book.persistDecisions([{bm:stable}]);
  await f.book.persistDecisions([{bm:old},{bm:missing}]);
  assert.deepEqual(f.data[f.book.DECISIONS_KEY].map(item=>item.bm.id),['stable']);
  assert.match(f.data[f.book.DECISIONS_KEY][0].resourceIdentity,/^sha256-v1:[a-f0-9]{64}$/);
});
