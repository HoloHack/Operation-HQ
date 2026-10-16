import test from 'node:test';
import assert from 'node:assert/strict';
import {PairedPlanning,readPairing,pairedSnapshot} from '../lib/paired-planning.ts';
import {emptyHQState} from '../lib/hq-state.ts';
const token='test-only-pair-token-0001',key='hq-pair-v2:alice';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(options={}){
 const data=options.data||new Map();if(options.paired)data.set(key,JSON.stringify({token,revision:1}));
 const calls=[],views=[];const store={state:{...emptyHQState(),notes:{plain:'Dashboard notes',updatedAt:1}},generation:0,ready:true,pending:false,conflict:null,async flush(){this.pending=false;},change(fn){this.state=fn(this.state);this.generation++;}};
 const browser={...emptyHQState(),notes:{plain:'Browser notes',updatedAt:2}};
 const f={data,calls,views,store,browser,failWrite:false,visible:true,handler:null};
 const storage={getItem:k=>data.get(k)??null,setItem(k,v){if(f.failWrite)throw Error('Device quota failure');data.set(k,v);},removeItem:k=>data.delete(k)};
 const call=async message=>{calls.push(message);if(f.handler)return f.handler(message);if(message.type==='hq:bridge:pull')return {ok:true,snapshot:browser};if(message.type==='hq:sync:pair')return {ok:true,token,revision:1,snapshot:message.snapshot};if(message.type==='hq:sync:exchange')return {ok:true,revision:message.revision+1,snapshot:message.snapshot};return {ok:true};};
 f.controller=new PairedPlanning({accountId:'alice',store,storage,call,visible:()=>f.visible,changed:v=>views.push(v),lock:options.lock||(async(_name,run)=>{await run();return true;})});f.controller.start();return f;
}
const edit=(f,text)=>{f.store.change(s=>({...s,notes:{plain:text,updatedAt:10}}));f.store.pending=true;};
test('pairing requires explicit approval and corrupt saved credentials remain untouched',async()=>{
 const f=fixture();assert.equal(await f.controller.pair(false),false);assert.equal(f.calls.length,0);f.data.set(key,'broken');f.controller.refresh();assert.equal(f.data.get(key),'broken');assert.equal(f.controller.view.paused,true);assert.equal(await f.controller.pair(true),false);assert.equal(f.calls.length,0);
 for(const raw of ['{}','{"token":"short","revision":1}',JSON.stringify({token,revision:-1}),JSON.stringify({token,revision:1.5})])assert.throws(()=>readPairing(raw));
});
test('a confirmed pair preserves both notes and exchanges acknowledge their own revision',async()=>{
 const f=fixture();assert(await f.controller.pair(true));assert.match(f.store.state.notes.plain,/Dashboard notes[\s\S]*Browser notes/);assert.equal(readPairing(f.data.get(key)).revision,1);assert(await f.controller.exchange());assert.equal(readPairing(f.data.get(key)).revision,2);assert(f.controller.view.lastSuccess);assert.equal(f.controller.view.paused,false);
});
test('edits made while a pair reply is pending survive and the unfinished pair is revoked',async()=>{
 const f=fixture(),pending=defer(),started=defer();f.handler=async m=>{if(m.type==='hq:bridge:pull')return {ok:true,snapshot:f.browser};if(m.type==='hq:sync:pair'){started.resolve();await pending.promise;return {ok:true,token,revision:1,snapshot:m.snapshot};}return {ok:true};};
 const operation=f.controller.pair(true);await started.promise;edit(f,'Newer work typed during pairing');pending.resolve();assert.equal(await operation,false);assert.equal(f.store.state.notes.plain,'Newer work typed during pairing');assert.equal(f.data.has(key),false);assert.equal(f.calls.filter(m=>m.type==='hq:sync:disconnect').length,1);assert.match(f.controller.view.message,/newer edits were kept/i);
});
test('closing the account view during a pending pair revokes its exact new token without saving it',async()=>{
 const f=fixture(),pending=defer(),started=defer();f.handler=async m=>{if(m.type==='hq:bridge:pull')return {ok:true,snapshot:f.browser};if(m.type==='hq:sync:pair'){started.resolve();await pending.promise;return {ok:true,token,revision:1,snapshot:m.snapshot};}return {ok:true};};
 const operation=f.controller.pair(true);await started.promise;f.controller.dispose();const notifications=f.views.length;pending.resolve();await operation;assert.equal(f.store.generation,0);assert.equal(f.data.has(key),false);assert.equal(f.views.length,notifications);assert.equal(f.calls.at(-1).token,token);assert.equal(f.calls.at(-1).type,'hq:sync:disconnect');
});
test('a local pairing write failure revokes the remote association and preserves the dashboard',async()=>{
 const f=fixture();f.failWrite=true;assert.equal(await f.controller.pair(true),false);assert.equal(f.store.generation,0);assert.equal(f.store.state.notes.plain,'Dashboard notes');assert.equal(f.data.has(key),false);assert.equal(f.calls.at(-1).type,'hq:sync:disconnect');assert.match(f.controller.view.message,/quota/);
});
test('a failed compensation is reported rather than claiming the remote pair was revoked',async()=>{
 const f=fixture();f.failWrite=true;f.handler=async m=>m.type==='hq:bridge:pull'?{ok:true,snapshot:f.browser}:m.type==='hq:sync:pair'?{ok:true,token,revision:1,snapshot:m.snapshot}:{ok:false,error:'Unavailable'};
 assert.equal(await f.controller.pair(true),false);assert.match(f.controller.view.message,/did not confirm revocation/);assert.equal(f.store.generation,0);
});
test('pairing flushes edits made during preview before capturing its baseline',async()=>{
 const f=fixture(),pending=defer(),started=defer();f.handler=async m=>{if(m.type==='hq:bridge:pull'){started.resolve();await pending.promise;return {ok:true,snapshot:f.browser};}return {ok:true,token,revision:1,snapshot:m.snapshot};};const operation=f.controller.pair(true);await started.promise;edit(f,'Edited during read');pending.resolve();assert(await operation);assert.match(f.calls.find(m=>m.type==='hq:sync:pair').snapshot.notes.plain,/Edited during read/);assert.match(f.store.state.notes.plain,/Edited during read/);
});
test('incomplete exchange replies cannot blank data, advance revision or keep auto-retrying',async()=>{
 const f=fixture({paired:true});f.handler=async()=>({ok:true,revision:2,snapshot:{schemaVersion:1}});assert.equal(await f.controller.exchange(),false);assert.equal(f.store.generation,0);assert.equal(readPairing(f.data.get(key)).revision,1);assert(f.controller.view.paused);const count=f.calls.length;await f.controller.exchange(false);assert.equal(f.calls.length,count);f.handler=null;assert(await f.controller.exchange());assert.equal(f.controller.view.paused,false);
});
test('an invalid acknowledgement revision is refused before changing planning',async()=>{
 for(const revision of [1,0,-1,2.5,'2',undefined]){const f=fixture({paired:true});f.handler=async()=>({ok:true,revision,snapshot:f.store.state});assert.equal(await f.controller.exchange(),false);assert.equal(f.store.generation,0);assert.equal(readPairing(f.data.get(key)).revision,1);}
});
test('typing during an exchange preserves newer notes and pauses automatic retries',async()=>{
 const f=fixture({paired:true}),pending=defer(),started=defer();f.handler=async m=>{started.resolve();await pending.promise;return {ok:true,revision:2,snapshot:m.snapshot};};const operation=f.controller.exchange();await started.promise;edit(f,'Latest local typing');pending.resolve();assert.equal(await operation,false);assert.equal(f.store.state.notes.plain,'Latest local typing');assert.equal(readPairing(f.data.get(key)).revision,1);assert(f.controller.view.paused);
});
test('disconnect cannot overlap an exchange within one dashboard and preserves planning copies',async()=>{
 const f=fixture({paired:true}),pending=defer(),started=defer();f.handler=async m=>{if(m.type==='hq:sync:exchange'){started.resolve();await pending.promise;return {ok:true,revision:2,snapshot:m.snapshot};}return {ok:true};};const operation=f.controller.exchange();await started.promise;assert.equal(await f.controller.disconnect(),false);assert.equal(f.calls.length,1);pending.resolve();await operation;assert(await f.controller.disconnect());assert.equal(f.data.has(key),false);assert.equal(f.store.state.notes.plain,'Dashboard notes');assert.equal(f.controller.view.connection,null);
});
test('all operations use the same cross-tab lock and reread the latest stored revision',async()=>{
 let locked=false;const names=[];const lock=async(name,run)=>{names.push(name);if(locked)return false;locked=true;try{await run();return true;}finally{locked=false;}};const data=new Map(),a=fixture({paired:true,data,lock}),b=fixture({data,lock}),pending=defer(),started=defer();a.handler=async m=>{started.resolve();await pending.promise;return {ok:true,revision:2,snapshot:m.snapshot};};const operation=a.controller.exchange();await started.promise;assert.equal(await b.controller.disconnect(),false);assert.equal(b.calls.length,0);pending.resolve();await operation;assert(await b.controller.exchange());assert.equal(b.calls[0].revision,2);assert.equal(new Set(names).size,1);
});
test('a disconnection in another tab invalidates an old response instead of recreating pairing',async()=>{
 const f=fixture({paired:true}),pending=defer(),started=defer();f.handler=async m=>{started.resolve();await pending.promise;return {ok:true,revision:2,snapshot:m.snapshot};};const operation=f.controller.exchange();await started.promise;f.data.delete(key);f.controller.refresh();pending.resolve();assert.equal(await operation,false);assert.equal(f.data.has(key),false);assert.equal(f.store.generation,0);assert.equal(f.controller.view.connection,null);
});
test('closed views and hidden tabs cannot apply a stale reply or start automatic traffic',async()=>{
 const f=fixture({paired:true});f.visible=false;await f.controller.exchange(false);assert.equal(f.calls.length,0);f.visible=true;const pending=defer(),started=defer();f.handler=async m=>{started.resolve();await pending.promise;return {ok:true,revision:2,snapshot:{...m.snapshot,notes:{plain:'Old reply',updatedAt:10}}};};const operation=f.controller.exchange();await started.promise;f.controller.dispose();pending.resolve();await operation;assert.equal(f.store.generation,0);assert.equal(readPairing(f.data.get(key)).revision,1);
});
test('a disposed view waiting for cloud save never sends the delayed browser request',async()=>{
 const f=fixture({paired:true}),pending=defer();f.store.flush=()=>pending.promise;const operation=f.controller.exchange();f.controller.dispose();pending.resolve();await operation;assert.equal(f.calls.length,0);
});
test('failed revocation retains the saved association and reports the actual error',async()=>{
 const f=fixture({paired:true});f.handler=async()=>({ok:false,error:'Browser unavailable'});assert.equal(await f.controller.disconnect(),false);assert(f.data.has(key));assert.match(f.controller.view.message,/Browser unavailable/);assert(f.controller.view.paused);
});
test('partial and malformed planning records are refused without sanitizing them away',()=>{
 assert.throws(()=>pairedSnapshot({schemaVersion:1,notes:{plain:'x'}}),/incomplete/);assert.throws(()=>pairedSnapshot({...emptyHQState(),events:[{id:'bad',title:'No date',updatedAt:1}]}),/invalid/);assert.equal(pairedSnapshot(emptyHQState()).notes.plain,'');
});
