import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../js/background.js',import.meta.url),'utf8');
function fixture(){
 const node={id:'a',url:'https://example.org/a',title:'Maths',parentId:'from',index:2},classified=structuredClone(node),data={},writes=[],moves=[];let hook=async()=>{};
 const chrome={storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(data[k])]));},async set(values){await hook(values,writes.length);writes.push(structuredClone(values));Object.assign(data,structuredClone(values));}}},bookmarks:{async get(){return [structuredClone(node)];},async move(id,{parentId}){assert.equal(data.hq_bookmark_pending_v1.moves[0].phase,'prepared');moves.push(id);node.parentId=parentId;return structuredClone(node);}}};
 const ctx=vm.createContext({chrome,crypto:webcrypto,selfMovedIds:new Set(),setTimeout:()=>{},getBarId:async()=>'1',bookmarkFolderPath:async()=>['Personal']});
 vm.runInContext(source.slice(source.indexOf('async function moveSelf('),source.indexOf('// Queue creation events'))+';this.move=moveSelf',ctx);
 return {node,classified,data,writes,moves,ctx,hook(fn){hook=fn;},move:()=>ctx.move('a','to',classified)};
}
test('worker persists prepared intent then applied acknowledgement before committing Undo',async()=>{const f=fixture();await f.move();assert.equal(f.writes[0].hq_bookmark_pending_v1.moves[0].phase,'prepared');assert.equal(f.writes[1].hq_bookmark_pending_v1.moves[0].phase,'applied');assert.equal(f.data.hq_bookmark_undo_v2[0].moves[0].phase,'applied');assert.equal(f.data.hq_bookmark_pending_v1,null);});
test('worker ack failure retains uncertain prepared intent after actual native move',async()=>{const f=fixture();f.hook(async(_v,count)=>{if(count===1)throw Error('ack quota');});await assert.rejects(f.move(),/ack quota/);assert.equal(f.node.parentId,'to');assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'prepared');assert.equal(f.data.hq_bookmark_undo_v2,undefined);});
test('worker final commit failure retains applied recovery instead of dropping it',async()=>{const f=fixture();f.hook(async(_v,count)=>{if(count===2)throw Error('commit quota');});await assert.rejects(f.move(),/commit quota/);assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'applied');});
test('owner move into exact target during journal write is not attributed to HQ',async()=>{const f=fixture();f.hook(async(_v,count)=>{if(count===0)f.node.parentId='to';});await assert.rejects(f.move(),/changed while/);assert.equal(f.moves.length,0);assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'prepared');});
test('worker refuses to overwrite any existing interrupted journal',async()=>{const f=fixture();const old={id:'old',moves:[{id:'other'}]};f.data.hq_bookmark_pending_v1=old;await assert.rejects(f.move(),/recovery review/);assert.deepEqual(f.data.hq_bookmark_pending_v1,old);assert.equal(f.writes.length,0);});
test('unverified native acknowledgement is not marked applied',async()=>{const f=fixture();f.ctx.chrome.bookmarks.move=async()=>({id:'wrong',url:f.node.url,parentId:'to'});await assert.rejects(f.move(),/acknowledgement/);assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'prepared');});
test('automatic moves require the immutable classified resource before their first fresh read',async()=>{
 for(const edit of [{title:'INBOX'},{title:'Piano chords'},{url:'https://example.org/music'},{parentId:'manual'}]){const f=fixture();Object.assign(f.node,edit);await assert.rejects(f.move(),/changed before automatic sort/);assert.equal(f.moves.length,0);assert.equal(f.writes.length,0);assert.equal(f.data.hq_bookmark_pending_v1,undefined);for(const [key,value]of Object.entries(edit))assert.equal(f.node[key],value);}
 const f=fixture();await assert.rejects(f.ctx.move('a','to'),/classified bookmark snapshot/);assert.equal(f.moves.length,0);
});

test('actual automatic queue preserves changed-title/URL/parent work at the classification-to-move handoff',async()=>{
 for(const edit of [{title:'INBOX'},{title:'Piano chords'},{url:'https://example.org/music'},{parentId:'manual'}]){
  const f=fixture(),alarms=new Map();let reads=0,now=1000;
  const originalGet=f.ctx.chrome.bookmarks.get;
  f.ctx.chrome.bookmarks.get=async(...args)=>{const result=await originalGet(...args);if(++reads===2)Object.assign(f.node,edit);return result;};
  f.data.hq_learned_domains={sentinel:['School & Academics','Mathematics']};
  Object.assign(f.ctx,{getBarId:async()=>'from',scanLegitFolders:async()=>[],getOrCreateFolderPath:async()=>'to',clearBookmarkDecision:async()=>{},markBookmarkDecision:async()=>assert.fail('Strong initial classification should enter the guarded move'),Classifier:{shouldNeverSort:title=>title==='INBOX',classify:()=>({path:['School & Academics','Mathematics'],confidence:'high'}),normalizePath:path=>path}});
  vm.runInContext(source.slice(source.indexOf('async function sortAutomaticBookmark('),source.indexOf('const BookmarkAutomation='))+'\nthis.sort=sortAutomaticBookmark;',f.ctx);
  vm.runInContext(fs.readFileSync(new URL('../js/bookmark-automation.js',import.meta.url),'utf8')+'\nthis.Queue=BookmarkAutoQueue;',f.ctx);
  const options={storage:f.ctx.chrome.storage.local,locks:navigator.locks,alarms:{async create(name,value){alarms.set(name,value);},async clear(name){alarms.delete(name);}},sort:entry=>f.ctx.sort(entry),now:()=>now};
  const queue=new f.ctx.Queue(options);await queue.enqueue('a',f.classified);
  assert.equal(f.moves.length,0);assert.equal(f.data.hq_bookmark_pending_v1,undefined);assert.equal(f.data[queue.key].length,1);assert.match(f.data[queue.statusKey].lastError,/changed before automatic sort/);assert(alarms.has(queue.alarm));assert.deepEqual(f.data.hq_learned_domains,{sentinel:['School & Academics','Mathematics']});for(const [key,value]of Object.entries(edit))assert.equal(f.node[key],value);
  // A restarted worker reads the same durable failed entry rather than having
  // falsely acknowledged it as sorted. Do not re-run before its retry time.
  const restarted=new f.ctx.Queue(options);await restarted.wake();assert.equal(f.data[queue.key].length,1);assert.equal(f.moves.length,0);
 }
});
