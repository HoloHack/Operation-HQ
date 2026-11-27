import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../js/bookmarks.js',import.meta.url),'utf8');
function fixture(){
  const data={},nodes=new Map(),calls=[],messages=[],hooks={beforeSet:async()=>{},afterMove:node=>node};
  for(const [id,parentId]of [['1','0'],['from','1'],['to','1'],['manual','1']])nodes.set(id,{id,parentId,title:id});
  for(const [index,id]of ['a','b'].entries())nodes.set(id,{id,parentId:'from',index,title:'Resource '+id,url:'https://example.org/'+id});
  const chrome={storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,structuredClone(data[key])]));},async set(values){await hooks.beforeSet(values);Object.assign(data,structuredClone(values));}}},bookmarks:{async get(id){if(!nodes.has(id))throw Error('Missing bookmark');return [structuredClone(nodes.get(id))];},async move(id,input){calls.push({id,...input});Object.assign(nodes.get(id),input);return hooks.afterMove(structuredClone(nodes.get(id)));}}};
  const page=()=>{const context=vm.createContext({chrome,navigator,crypto:webcrypto,console,URL});vm.runInContext(source,context);const book=vm.runInContext('Bookmarks',context);Object.assign(book,{folderPath:async()=>['Personal'],getAllBookmarks:async()=>({barId:'1'}),cleanupManagedEmptyFolders:async()=>0,recordAudit:async()=>{},refreshInboxCount:async()=>{},log:text=>messages.push(text)});return book;};
  const book=page(),move=(id='a',moves=[])=>book.moveAndRecord(structuredClone(nodes.get(id)),'to',[],'1',moves);
  const pending=(moves,id='pending')=>data[book.JOURNAL_KEY]={id,kind:'interrupted-sort',createdAt:1,moves};
  const inverse=(id='a',phase)=>({id,url:'https://example.org/'+id,fromParentId:'from',fromIndex:id==='a'?0:1,fromPath:['Personal'],toParentId:'to',toPath:[],...(phase?{phase}:{})});
  return {data,nodes,calls,hooks,book,page,move,pending,inverse,messages};
}

test('prepared intent before a move is preserved for explicit review, never inferred as applied',async()=>{
  const f=fixture();f.pending([f.inverse('a','prepared')]);const result=await f.page().undo();assert.equal(result.uncertain,1);assert.equal(f.calls.length,0);assert.equal(f.nodes.get('a').parentId,'from');assert.equal(f.data[f.book.JOURNAL_KEY].moves[0].phase,'prepared');
});
test('owner manual move to the intended target cannot be mistaken for a completed prepared or legacy move',async()=>{
  for(const phase of ['prepared',undefined]){const f=fixture();f.nodes.get('a').parentId='to';f.pending([f.inverse('a',phase)]);const result=await f.page().undo();assert.equal(result.uncertain,1);assert.equal(f.calls.length,0);assert.equal(f.nodes.get('a').parentId,'to');}
});
test('failed cleanup after the owner moves into the exact intended target remains review-only after restart',async()=>{
  const f=fixture();let writes=0;
  f.hooks.beforeSet=async()=>{writes++;if(writes===1)f.nodes.get('a').parentId='to';else throw Error('Cleanup quota');};
  await assert.rejects(f.move(),/changed while recording recovery/);
  assert.equal(f.book.journalFailed,true);assert.equal(f.calls.length,0);assert.equal(f.data[f.book.JOURNAL_KEY].moves[0].phase,'prepared');
  f.hooks.beforeSet=async()=>{};const before=structuredClone(f.nodes.get('a')),result=await f.page().undo();
  assert.equal(result.uncertain,1);assert.equal(result.restored,0);assert.equal(f.calls.length,0);assert.deepEqual(f.nodes.get('a'),before);
});
test('completion ack failure retains prepared disk intent and stops the next move',async()=>{
  const f=fixture(),moves=[];f.hooks.beforeSet=async values=>{if(values[f.book.JOURNAL_KEY]?.moves.some(move=>move.phase==='applied'))throw Error('Ack quota');};await assert.rejects(f.move('a',moves),/completion could not be recorded/);assert.equal(moves.length,0);assert.equal(f.nodes.get('a').parentId,'to');assert.equal(f.data[f.book.JOURNAL_KEY].moves[0].phase,'prepared');assert.equal(f.book.journalFailed,true);await assert.rejects(f.move('b',moves),/Recovery storage failed/);f.hooks.beforeSet=async()=>{};await f.page().undo();assert.equal(f.nodes.get('a').parentId,'to');assert.equal(f.calls.length,1);
});
test('restart after durable applied acknowledgement allows exact undo without a committed transaction',async()=>{
  const f=fixture(),moves=[];await f.move('b',moves);assert.equal(f.data[f.book.JOURNAL_KEY].moves[0].phase,'applied');assert.equal(moves[0].phase,'applied');const result=await f.page().undo();assert.equal(result.restored,1);assert.equal(f.nodes.get('b').parentId,'from');assert.equal(f.nodes.get('b').index,1);assert.equal(f.data[f.book.JOURNAL_KEY],null);
});
test('mixed applied and prepared records undo only verified moves and preserve uncertain records',async()=>{
  const f=fixture();f.nodes.get('a').parentId='to';f.nodes.get('b').parentId='to';f.pending([f.inverse('a','applied'),f.inverse('b','prepared')]);const result=await f.page().undo();assert.equal(result.restored,1);assert.equal(result.uncertain,1);assert.equal(f.nodes.get('a').parentId,'from');assert.equal(f.nodes.get('b').parentId,'to');assert.deepEqual(f.calls.map(x=>x.id),['a']);assert.deepEqual(f.data[f.book.JOURNAL_KEY].moves.map(x=>x.id),['b']);
});
test('legacy committed undo remains trusted while legacy pending history remains review-only',async()=>{
  const f=fixture();f.nodes.get('a').parentId='to';f.data[f.book.UNDO_KEY]=[{id:'committed',kind:'sort',createdAt:1,moves:[f.inverse('a')]}];const result=await f.page().undo();assert.equal(result.restored,1);assert.equal(result.uncertain,0);assert.equal(f.nodes.get('a').parentId,'from');
});
test('failed acknowledgement cannot be committed away together with an earlier successful move',async()=>{
  const f=fixture(),moves=[];await f.move('a',moves);f.hooks.beforeSet=async values=>{if(values[f.book.JOURNAL_KEY]?.moves.some(move=>move.id==='b'&&move.phase==='applied'))throw Error('Ack quota');};await assert.rejects(f.move('b',moves));assert.equal(moves.length,1);await assert.rejects(f.book.commitTransaction('sort',moves),/Recovery storage failed/);f.hooks.beforeSet=async()=>{};assert.deepEqual(f.data[f.book.JOURNAL_KEY].moves.map(x=>x.phase),['applied','prepared']);const result=await f.page().undo();assert.equal(result.restored,1);assert.equal(result.uncertain,1);assert.equal(f.nodes.get('b').parentId,'to');
});
test('invalid Chrome move acknowledgement stays prepared and pauses instead of becoming trusted undo',async()=>{
  const f=fixture();f.hooks.afterMove=node=>({...node,id:'wrong'});await assert.rejects(f.move(),/unverified move acknowledgement/);assert.equal(f.data[f.book.JOURNAL_KEY].moves[0].phase,'prepared');assert.equal(f.book.journalFailed,true);await f.page().undo();assert.equal(f.nodes.get('a').parentId,'to');assert.equal(f.calls.length,1);
});
test('explicit Keep current archives uncertain metadata, preserves verified undo and never moves bookmarks',async()=>{
  const f=fixture();f.nodes.get('a').parentId='to';f.nodes.get('b').parentId='to';const pending=f.pending([f.inverse('a','applied'),f.inverse('b','prepared')]),expected=structuredClone(pending);assert.equal((await f.book.keepCurrentRecovery(expected)).needsConfirmation,true);assert.equal(f.data[f.book.JOURNAL_KEY].moves.length,2);const result=await f.book.keepCurrentRecovery(expected,true);assert.equal(result.kept,1);assert.equal(result.verifiedUndoRemaining,1);assert.equal(f.calls.length,0);assert.equal(f.data.hq_bookmark_recovery_reviews_v1[0].moves[0].id,'b');assert.deepEqual(f.data[f.book.JOURNAL_KEY].moves.map(x=>x.id),['a']);await f.page().undo();assert.equal(f.nodes.get('a').parentId,'from');assert.equal(f.nodes.get('b').parentId,'to');
});
test('stale or failed Keep current confirmation cannot erase new recovery records',async()=>{
  const f=fixture(),pending=f.pending([f.inverse('a','prepared')]),expected=structuredClone(pending);f.data[f.book.JOURNAL_KEY].moves.push(f.inverse('b','prepared'));const stale=await f.book.keepCurrentRecovery(expected,true);assert.equal(stale.error,true);assert.equal(f.data[f.book.JOURNAL_KEY].moves.length,2);const current=structuredClone(f.data[f.book.JOURNAL_KEY]);f.hooks.beforeSet=async()=>{throw Error('Quota');};const failed=await f.book.keepCurrentRecovery(current,true);assert.equal(failed.error,true);assert.equal(f.data[f.book.JOURNAL_KEY].moves.length,2);assert.equal(f.data.hq_bookmark_recovery_reviews_v1,undefined);assert.equal(f.calls.length,0);
});
