import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
function fixture(){
  const data={},nodes=new Map([['a',{id:'a',title:'Maths',url:'https://example.org/a',parentId:'from',index:0}],['b',{id:'b',title:'Piano',url:'https://example.org/b',parentId:'from',index:1}]]),calls=[];
  const hooks={path:async()=>{},write:async()=>{}};
  const chrome={bookmarks:{async get(id){if(!nodes.has(id))throw Error('Missing');return [structuredClone(nodes.get(id))];},async move(id,input){calls.push({id,...input});Object.assign(nodes.get(id),input);return structuredClone(nodes.get(id));}},storage:{local:{async set(values){await hooks.write(values);Object.assign(data,structuredClone(values));}}}};
  const ctx=vm.createContext({chrome,crypto:webcrypto,console,URL});vm.runInContext(fs.readFileSync(new URL('../js/bookmarks.js',import.meta.url),'utf8'),ctx);const book=vm.runInContext('Bookmarks',ctx);book.folderPath=async()=>{await hooks.path();return ['School & Academics','Mathematics'];};
  const move=(id='a',moves=[])=>book.moveAndRecord(structuredClone(nodes.get(id)),'to',[],'1',moves);
  return {data,nodes,calls,hooks,book,move};
}
test('owner title/URL/parent edits during folder traversal abort before journaling or moving',async()=>{
  for(const edit of [{title:'INBOX'},{url:'https://example.org/changed'},{parentId:'manual'}]){const f=fixture();f.hooks.path=async()=>Object.assign(f.nodes.get('a'),edit);await assert.rejects(f.move(),/changed after preview/);assert.equal(f.calls.length,0);assert.equal(f.data[f.book.JOURNAL_KEY],undefined);assert.deepEqual({...f.nodes.get('a'),...edit},f.nodes.get('a'));}
});
test('the undo index is captured fresh after unrelated sibling changes during traversal',async()=>{
  const f=fixture(),moves=[];f.hooks.path=async()=>{f.nodes.get('a').index=3;};await f.move('a',moves);assert.equal(moves[0].fromIndex,3);assert.equal(f.calls.length,1);
});
test('owner changes during journal persistence discard only the aborted move intent',async()=>{
  for(const edit of [{title:'INBOX'},{url:'https://example.org/changed'},{parentId:'manual'},{index:5}]){const f=fixture(),moves=[];let once=true;f.hooks.write=async values=>{if(once&&values[f.book.JOURNAL_KEY]){once=false;Object.assign(f.nodes.get('a'),edit);}};await assert.rejects(f.move('a',moves),/changed while recording recovery/);assert.equal(f.calls.length,0);assert.equal(moves.length,0);assert.equal(f.data[f.book.JOURNAL_KEY].moves.length,0);for(const [key,value]of Object.entries(edit))assert.equal(f.nodes.get('a')[key],value);}
});
test('an aborted later move preserves earlier completed move and its recovery record',async()=>{
  const f=fixture(),moves=[];await f.move('a',moves);let once=true;f.hooks.write=async()=>{if(once){once=false;f.nodes.get('b').parentId='manual';}};await assert.rejects(f.move('b',moves),/changed while recording recovery/);assert.deepEqual(f.calls.map(x=>x.id),['a']);assert.deepEqual(moves.map(x=>x.id),['a']);assert.deepEqual(f.data[f.book.JOURNAL_KEY].moves.map(x=>x.id),['a']);assert.equal(f.nodes.get('b').parentId,'manual');
});
test('journal failure prevents Chrome mutation and blocks subsequent moves',async()=>{
  const f=fixture();f.hooks.write=async()=>{throw Error('Quota');};await assert.rejects(f.move(),/Quota/);assert.equal(f.calls.length,0);assert.equal(f.book.journalFailed,true);assert.equal(f.book.pendingTransaction.moves.length,0);await assert.rejects(f.move('b'),/Recovery storage failed/);
});
test('failed cleanup after owner drift pauses further mutations rather than overriding the owner',async()=>{
  const f=fixture();let writes=0;f.hooks.write=async()=>{writes++;if(writes===1)f.nodes.get('a').parentId='manual';else throw Error('Cleanup quota');};await assert.rejects(f.move(),/changed while recording recovery/);assert.equal(f.calls.length,0);assert.equal(f.nodes.get('a').parentId,'manual');assert.equal(f.book.journalFailed,true);await assert.rejects(f.move('b'),/Recovery storage failed/);
});
