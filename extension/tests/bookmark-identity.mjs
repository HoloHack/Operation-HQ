import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=name=>fs.readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8');
function fixture(){
  const data={},nodes=new Map(),opened=[];
  const chrome={storage:{local:{async get(key){return {[key]:structuredClone(data[key])};},async set(value){Object.assign(data,structuredClone(value));}}},bookmarks:{async get(id){if(!nodes.has(id))throw Error('Missing bookmark');return [structuredClone(nodes.get(id))];}},tabs:{async create(input){opened.push(input);}}};
  const ctx=vm.createContext({URL,console,chrome,crypto:webcrypto,TextEncoder,navigator});
  vm.runInContext(source('classifier')+'\n'+source('bookmarks'),ctx);
  const book=vm.runInContext('Bookmarks',ctx),classifier=vm.runInContext('Classifier',ctx);
  book.renderAccuracyGate=()=>{};book.log=()=>{};
  return {book,classifier,data,nodes,opened,ctx};
}
const longBookmark=()=>({id:'long',parentId:'1',title:'T'.repeat(600)+' original',url:'https://example.org/'+ 'p'.repeat(3100)+'?chapter=5'});
const decision=bm=>({bm,context:'Mathematics lesson',reasons:['Reviewed topic'],suggestedPath:['School & Academics','Mathematics'],candidates:[]});

test('long unchanged decision identities survive bounded display persistence and repeated restore',async()=>{
  const f=fixture(),bm=longBookmark();f.nodes.set(bm.id,bm);
  await f.book.persistDecisions([decision(bm)]);
  const stored=f.data[f.book.DECISIONS_KEY][0];assert.equal(stored.bm.title.length,500);assert.equal(stored.bm.url.length,3000);assert.match(stored.resourceIdentity,/^sha256-v1:[a-f0-9]{64}$/);
  for(let i=0;i<3;i++){assert.equal((await f.book.restoreDecisions()).length,1);assert.equal(f.book.decisionItems[0].resourceIdentity,stored.resourceIdentity);assert(await f.book.decisionMatches(f.book.decisionItems[0],bm));}
});

test('edits after display cutoffs or changed placement invalidate exact identity',async()=>{
  for(const edit of [{title:'T'.repeat(600)+' changed'},{url:'https://example.org/'+'p'.repeat(3100)+'?chapter=7'},{parentId:'manual'}]){
    const f=fixture(),bm=longBookmark();f.nodes.set(bm.id,bm);await f.book.persistDecisions([decision(bm)]);f.nodes.set(bm.id,{...bm,...edit});f.book.decisionSelections.set(bm.id,'chosen');
    assert.equal((await f.book.restoreDecisions()).length,0);assert.equal(f.book.decisionSelections.has(bm.id),false);
  }
});

test('legacy exact entries upgrade; truncated legacy and malformed digests fail closed',async()=>{
  const f=fixture(),short={id:'short',parentId:'1',title:'Maths',url:'https://example.org/math'},long=longBookmark();f.nodes.set(short.id,short);f.nodes.set(long.id,long);
  f.data[f.book.DECISIONS_KEY]=[decision(short),decision({...long,title:long.title.slice(0,500),url:long.url.slice(0,3000)})];
  assert.deepEqual(Array.from(await f.book.restoreDecisions(),x=>x.bm.id),['short']);assert.match(f.book.decisionItems[0].resourceIdentity,/^sha256-v1:/);
  assert.equal(await f.book.decisionMatches({...decision(short),resourceIdentity:'invalid'},short),false);
});

test('background writer retains the same full identity as foreground and round-trips',async()=>{
  const f=fixture(),bm=longBookmark();f.nodes.set(bm.id,bm);
  const bg=source('background'),start=bg.indexOf('const BOOKMARK_DECISIONS_KEY ='),end=bg.indexOf('function bulkBookmarkOperationActive(');
  // Isolate the production decision writers, not a replacement test implementation.
  vm.runInContext(bg.slice(start,end)+'\nthis.mark=markBookmarkDecision;',f.ctx);
  await f.ctx.mark(bm,{path:['School & Academics','Mathematics'],reasons:['Page context']});
  const fromWorker=f.data[f.book.DECISIONS_KEY][0],fromPage=await f.book.serializeDecision(decision(bm));
  assert.equal(fromWorker.resourceIdentity,fromPage.resourceIdentity);assert.equal((await f.book.restoreDecisions()).length,1);
});

test('Inspect resolves exact full live URL and refuses stale evidence or non-web schemes',async()=>{
  const f=fixture(),bm=longBookmark();f.nodes.set(bm.id,bm);await f.book.persistDecisions([decision(bm)]);const reviewed=f.book.decisionItems[0];
  assert(await f.book.inspectDecision(reviewed));assert.equal(f.opened[0].url,bm.url);
  f.nodes.set(bm.id,{...bm,title:bm.title+' edited'});assert.equal(await f.book.inspectDecision(reviewed),false);assert.equal(f.opened.length,1);
  const script={...bm,url:'javascript:alert(1)'};f.nodes.set(bm.id,script);assert.equal(await f.book.inspectDecision(await f.book.serializeDecision(decision(script))),false);assert.equal(f.opened.length,1);
});

test('unavailable cryptographic identity support cannot produce a decision',async()=>{
  const f=fixture();f.ctx.crypto={};await assert.rejects(f.book.serializeDecision(decision(longBookmark())),/unavailable/);
});

test('single and bulk confirmation accept unchanged full identities despite display truncation',async()=>{
  for(const bulk of [false,true]){
    const f=fixture(),bm=longBookmark(),learned={};let moves=0;
    f.nodes.set(bm.id,bm);await f.book.persistDecisions([decision(bm)]);
    f.ctx.document={querySelectorAll:()=>[]};f.book.decisionSelections.set(bm.id,JSON.stringify(['School & Academics','Mathematics']));
    Object.assign(f.book,{runExclusive:async(_label,fn)=>fn(),getAllBookmarks:async()=>({barId:'1'}),getOrCreateFolderPath:async()=>'target',moveAndRecord:async current=>{assert.equal(current.url,bm.url);assert.equal(current.title,bm.title);moves++;},getLearnedMap:async()=>learned,commitTransaction:async()=>{},cleanupLegacyHoldingFolders:async()=>0,recordAudit:async()=>{},refreshInboxCount:async()=>{}});
    if(bulk)await f.book.applySelectedDecisions();else await f.book.applyCorrection(bm.id,['School & Academics','Mathematics']);
    assert.equal(moves,1);assert.deepEqual(Array.from(learned[f.classifier.fingerprint(bm)]),['School & Academics','Mathematics']);
  }
});
