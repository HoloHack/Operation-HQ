import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../js/background.js',import.meta.url),'utf8');
function fixture(){
 const node={id:'a',url:'https://example.org/a',title:'Maths',parentId:'from',index:2},data={},writes=[],moves=[];let hook=async()=>{};
 const chrome={storage:{local:{async get(keys){return Object.fromEntries(keys.map(k=>[k,structuredClone(data[k])]));},async set(values){await hook(values,writes.length);writes.push(structuredClone(values));Object.assign(data,structuredClone(values));}}},bookmarks:{async get(){return [structuredClone(node)];},async move(id,{parentId}){assert.equal(data.hq_bookmark_pending_v1.moves[0].phase,'prepared');moves.push(id);node.parentId=parentId;return structuredClone(node);}}};
 const ctx=vm.createContext({chrome,crypto:webcrypto,selfMovedIds:new Set(),setTimeout:()=>{},getBarId:async()=>'1',bookmarkFolderPath:async()=>['Personal']});
 vm.runInContext(source.slice(source.indexOf('async function moveSelf('),source.indexOf('// Queue creation events'))+';this.move=moveSelf',ctx);
 return {node,data,writes,moves,ctx,hook(fn){hook=fn;},move:()=>ctx.move('a','to')};
}
test('worker persists prepared intent then applied acknowledgement before committing Undo',async()=>{const f=fixture();await f.move();assert.equal(f.writes[0].hq_bookmark_pending_v1.moves[0].phase,'prepared');assert.equal(f.writes[1].hq_bookmark_pending_v1.moves[0].phase,'applied');assert.equal(f.data.hq_bookmark_undo_v2[0].moves[0].phase,'applied');assert.equal(f.data.hq_bookmark_pending_v1,null);});
test('worker ack failure retains uncertain prepared intent after actual native move',async()=>{const f=fixture();f.hook(async(_v,count)=>{if(count===1)throw Error('ack quota');});await assert.rejects(f.move(),/ack quota/);assert.equal(f.node.parentId,'to');assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'prepared');assert.equal(f.data.hq_bookmark_undo_v2,undefined);});
test('worker final commit failure retains applied recovery instead of dropping it',async()=>{const f=fixture();f.hook(async(_v,count)=>{if(count===2)throw Error('commit quota');});await assert.rejects(f.move(),/commit quota/);assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'applied');});
test('owner move into exact target during journal write is not attributed to HQ',async()=>{const f=fixture();f.hook(async(_v,count)=>{if(count===0)f.node.parentId='to';});await assert.rejects(f.move(),/changed while/);assert.equal(f.moves.length,0);assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'prepared');});
test('worker refuses to overwrite any existing interrupted journal',async()=>{const f=fixture();const old={id:'old',moves:[{id:'other'}]};f.data.hq_bookmark_pending_v1=old;await assert.rejects(f.move(),/recovery review/);assert.deepEqual(f.data.hq_bookmark_pending_v1,old);assert.equal(f.writes.length,0);});
test('unverified native acknowledgement is not marked applied',async()=>{const f=fixture();f.ctx.chrome.bookmarks.move=async()=>({id:'wrong',url:f.node.url,parentId:'to'});await assert.rejects(f.move(),/acknowledgement/);assert.equal(f.data.hq_bookmark_pending_v1.moves[0].phase,'prepared');});
