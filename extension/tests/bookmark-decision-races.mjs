import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=name=>fs.readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const bm=(id,title='Maths resource')=>({id,title,parentId:'1',url:'https://example.org/'+id});
const decision=bookmark=>({bm:bookmark,reasons:['Evidence'],candidates:[],suggestedPath:['School & Academics','Mathematics']});
function fixture(){
  const data={},nodes=new Map();
  const chrome={storage:{local:{async get(key){return {[key]:structuredClone(data[key])};},async set(value){Object.assign(data,structuredClone(value));}}},bookmarks:{async get(id){if(!nodes.has(id))throw Error('Missing bookmark');return [structuredClone(nodes.get(id))];}}};
  function page(){const ctx=vm.createContext({chrome,navigator,crypto:webcrypto,TextEncoder,URL,console});vm.runInContext(source('classifier')+'\n'+source('bookmarks'),ctx);const book=vm.runInContext('Bookmarks',ctx),classifier=vm.runInContext('Classifier',ctx);book.renderAccuracyGate=()=>{};book.log=()=>{};return {ctx,book,classifier};}
  const first=page(),worker=page(),bg=source('background');vm.runInContext(bg.slice(bg.indexOf('const BOOKMARK_DECISIONS_KEY ='),bg.indexOf('function bulkBookmarkOperationActive('))+'\nthis.mark=markBookmarkDecision;this.clear=clearBookmarkDecision;',worker.ctx);
  return {data,nodes,page,...first,worker};
}
function pauseDigest(classifier){const reached=deferred(),release=deferred(),original=classifier.decisionIdentity.bind(classifier);let once=true;classifier.decisionIdentity=async bookmark=>{if(once){once=false;reached.resolve();await release.promise;}return original(bookmark);};return {reached:reached.promise,release:release.resolve};}

test('restore locks digest read/write and cannot erase a concurrent worker addition',async()=>{
  const f=fixture(),a=bm('a'),b=bm('b');f.nodes.set(a.id,a);f.nodes.set(b.id,b);await f.book.persistDecisions([decision(a)]);
  const pause=pauseDigest(f.classifier),restoring=f.book.restoreDecisions();await pause.reached;const marking=f.worker.ctx.mark(b,{reasons:['New worker decision']});pause.release();await Promise.all([restoring,marking]);assert.deepEqual(f.data[f.book.DECISIONS_KEY].map(x=>x.bm.id).sort(),['a','b']);
});
test('explicit foreground intents preserve unseen concurrent worker decisions',async()=>{
  const f=fixture(),a=bm('a'),b=bm('b'),c=bm('c');for(const item of [a,b,c])f.nodes.set(item.id,item);await f.book.persistDecisions([decision(a)]);
  const pause=pauseDigest(f.worker.classifier),marking=f.worker.ctx.mark(b,{reasons:['Worker']});await pause.reached;const merging=f.book.persistDecisions([decision(c)],['a']);pause.release();await Promise.all([marking,merging]);assert.deepEqual(f.data[f.book.DECISIONS_KEY].map(x=>x.bm.id).sort(),['b','c']);
});
test('stale tab intents cannot overwrite or remove a newer same-ID resource',async()=>{
  const f=fixture(),old=bm('same');f.nodes.set(old.id,old);await f.book.persistDecisions([decision(old)]);const stale=f.book.decisionItems[0],current={...old,title:'Music resource',url:'https://example.org/music'};f.nodes.set(current.id,current);await f.worker.ctx.mark(current,{reasons:['Current resource']});
  await f.book.persistDecisions([stale],['same'],[stale]);assert.equal(f.data[f.book.DECISIONS_KEY].length,1);assert.equal(f.data[f.book.DECISIONS_KEY][0].resourceIdentity,await f.classifier.decisionIdentity(current));await f.worker.ctx.clear('same',old);assert.equal(f.data[f.book.DECISIONS_KEY].length,1);
});
test('independent page writers merge and failed mutations release the decision lock',async()=>{
  const f=fixture(),second=f.page(),a=bm('a'),b=bm('b');f.nodes.set(a.id,a);f.nodes.set(b.id,b);await Promise.all([f.book.persistDecisions([decision(a)]),second.book.persistDecisions([decision(b)])]);assert.equal(f.data[f.book.DECISIONS_KEY].length,2);
  await assert.rejects(f.classifier.updateDecisionStore(async()=>{throw Error('Failure');}),/Failure/);await f.book.persistDecisions([],['a']);assert.deepEqual(f.data[f.book.DECISIONS_KEY].map(x=>x.bm.id),['b']);
});
test('replacement clears selected destination when resource or placement changes',async()=>{
  for(const edit of [{title:'New resource'},{parentId:'manual'}]){const f=fixture(),old=bm('a');f.nodes.set(old.id,old);await f.book.persistDecisions([decision(old)]);f.book.decisionSelections.set(old.id,'old-choice');const changed={...old,...edit};f.nodes.set(old.id,changed);await f.book.mergeDecisions([decision(changed)]);assert.equal(f.book.decisionSelections.has(old.id),false);}
});
test('click-time snapshots cannot rebind a waiting confirmation to a replacement resource',async()=>{
  for(const bulk of [false,true]){
    const f=fixture(),old=bm('a');f.nodes.set(old.id,old);await f.book.persistDecisions([decision(old)]);f.book.decisionSelections.set(old.id,JSON.stringify(['School & Academics','Mathematics']));f.ctx.document={querySelectorAll:()=>[]};let execute,destinations=0;
    Object.assign(f.book,{runExclusive:async(_label,fn)=>{await new Promise(r=>execute=r);return fn();},getAllBookmarks:async()=>({barId:'1'}),getLearnedMap:async()=>({}),getOrCreateFolderPath:async()=>{destinations++;return 'target';},commitTransaction:async()=>{},cleanupLegacyHoldingFolders:async()=>0,recordAudit:async()=>{},refreshInboxCount:async()=>{}});
    const pending=bulk?f.book.applySelectedDecisions():f.book.applyCorrection(old.id,['School & Academics','Mathematics']);const current={...old,title:'New resource',url:'https://example.org/music'};f.nodes.set(old.id,current);f.book.decisionItems=[await f.book.serializeDecision(decision(current))];execute();if(bulk)await pending;else await assert.rejects(pending,/changed after review/);assert.equal(destinations,0);
  }
});
test('missing decision coordination fails closed without writing storage',async()=>{
  const f=fixture();f.ctx.navigator={};await assert.rejects(f.book.persistDecisions([decision(bm('a'))]),/coordination/);assert.equal(f.data[f.book.DECISIONS_KEY],undefined);
});
test('identity-verifier failure during restore preserves pending records',async()=>{
  const f=fixture(),a=bm('a');f.nodes.set(a.id,a);await f.book.persistDecisions([decision(a)]);const before=JSON.stringify(f.data[f.book.DECISIONS_KEY]);f.ctx.crypto={};await assert.rejects(f.book.restoreDecisions(),/unavailable/);assert.equal(JSON.stringify(f.data[f.book.DECISIONS_KEY]),before);
});
test('the actual storage listener clears stale choices before adopting worker replacements',async()=>{
  for(const changed of [false,true]){const f=fixture(),old=bm('a'),listeners=[];f.nodes.set(old.id,old);await f.book.persistDecisions([decision(old)]);f.ctx.chrome.storage.onChanged={addListener:listener=>listeners.push(listener)};Object.assign(f.book,{refreshAutomation:async()=>{},updateUndoButton:async()=>{},refreshInboxCount:async()=>{},setBusy:()=>{}});await f.book.init();f.book.decisionSelections.set(old.id,'old-choice');const current=changed?{...old,title:'Changed resource'}:old;f.nodes.set(old.id,current);await f.worker.ctx.mark(current,{reasons:['Worker replacement']});for(const listener of listeners)listener({[f.book.DECISIONS_KEY]:{newValue:structuredClone(f.data[f.book.DECISIONS_KEY])}},'local');assert.equal(f.book.decisionSelections.has(old.id),!changed);}
});
