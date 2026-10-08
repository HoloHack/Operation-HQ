import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyHQState,mergeHQState} from '../lib/hq-state.ts';
import {reviewBrowserImport,applyBrowserImport,browserImportSummary} from '../lib/browser-import.ts';
import {SyncCoordinator} from '../lib/sync-coordinator.ts';
const task=(id,title=id)=>({id,title,priority:'high',completed:false,updatedAt:1});
const base=()=>({...emptyHQState(),notes:{plain:'dashboard notes',updatedAt:1}});
const source=()=>({...emptyHQState(),tasks:[task('same')],events:[{id:'event',title:'Maths',date:'2026-10-12',updatedAt:0}],notes:{plain:'browser notes',updatedAt:2}});
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const coordinator=options=>new SyncCoordinator({initial:emptyHQState(),merge:(a,b)=>({...b,tasks:[...new Map([...a.tasks,...b.tasks].map(t=>[t.id,t])).values()]}),load:async()=>({snapshot:emptyHQState(),revision:0}),save:async(snapshot,revision)=>({snapshot,revision:revision+1}),changed:()=>{},debounce:100000,...options});
test('browser import adds namespaced records without replacing colliding dashboard IDs or preferences',()=>{
 const current={...base(),tasks:[task('same','My task')],settings:{...emptyHQState().settings,accentHue:100},focus:{...emptyHQState().focus,mission:'Do not reset'}};
 const result=applyBrowserImport(current,source());assert.deepEqual(result.tasks.map(t=>t.id),['same','browser:same']);assert.equal(result.tasks[0].title,'My task');assert.equal(result.notes.plain,'dashboard notes');assert.equal(result.settings.accentHue,100);assert.equal(result.focus.mission,'Do not reset');assert.equal(current.tasks.length,1);
});
test('re-import is idempotent and keeps later edits to imported records',()=>{
 const first=applyBrowserImport(base(),source(),'both',10);first.tasks[0].title='Edited in dashboard';
 const second=applyBrowserImport(first,source(),'both',11);assert.equal(second.tasks.length,1);assert.equal(second.events.length,1);assert.equal(second.tasks[0].title,'Edited in dashboard');assert.equal(second.notes.plain,first.notes.plain);assert.equal(browserImportSummary(second,source()).newTasks,0);
});
test('notes choice keeps, replaces or combines exact documents including whitespace',()=>{
 const incoming={...source(),notes:{plain:'  browser\nnotes  ',updatedAt:2}};
 assert.equal(applyBrowserImport(base(),incoming,'keep').notes.plain,'dashboard notes');assert.equal(applyBrowserImport(base(),incoming,'browser').notes.plain,incoming.notes.plain);assert.equal(applyBrowserImport(base(),incoming,'both').notes.plain,'dashboard notes\n\n--- Browser notes ---\n\n'+incoming.notes.plain);
});
test('invalid previews fail without filtering or truncating records',()=>{
 for(const candidate of [{...source(),schemaVersion:2},{...source(),tasks:[task('x'),task('x')]},{...source(),events:[{id:'bad',title:'Bad',date:'2026-02-30'}]},{...source(),tasks:[task('x','x'.repeat(501))]}])assert.throws(()=>reviewBrowserImport(candidate));
});
test('oversized import union and combined notes stop atomically',()=>{
 const current={...base(),tasks:Array.from({length:2000},(_,i)=>task('dashboard'+i))};assert.throws(()=>applyBrowserImport(current,source()),/save limit/);assert.equal(current.tasks.length,2000);
 const large={...base(),notes:{plain:'a'.repeat(120000),updatedAt:1}},incoming={...source(),notes:{plain:'b'.repeat(120000),updatedAt:2}};assert.throws(()=>applyBrowserImport(large,incoming,'both'),/save limit/);assert.equal(large.notes.plain.length,120000);
});
test('device checkpoint completes before cloud request and clears only after acknowledgement',async()=>{
 const sequence=[];const c=coordinator({checkpoint:async value=>sequence.push(value?'device:'+value.state.notes.plain:'clear'),save:async(snapshot,revision)=>{sequence.push('cloud:'+snapshot.notes.plain);return {snapshot,revision:revision+1};}});
 await c.start();await c.checkpointSettled();sequence.length=0;c.change(s=>({...s,notes:{plain:'draft',updatedAt:1}}));await c.flush();await c.checkpointSettled();assert.deepEqual(sequence,['device:draft','cloud:draft','clear']);c.dispose();
});
test('offline reload restores exact draft but cannot write before a successful account load',async()=>{
 let writes=0;const checkpoint={version:1,state:{...base(),notes:{plain:'  offline\nnotes  ',updatedAt:2}},baseline:base(),revision:3,conflict:null};
 const c=coordinator({recover:async()=>checkpoint,checkpoint:async()=>{},load:async()=>{throw Error('offline');},save:async()=>{writes++;throw Error();}});await c.start();assert.equal(c.state.notes.plain,checkpoint.state.notes.plain);assert.equal(c.ready,false);await c.flush();assert.equal(writes,0);assert.equal(c.pending,true);c.dispose();
});
test('recovered draft and changed cloud notes preserve both for explicit review',async()=>{
 const c=coordinator({recover:async()=>({version:1,state:{...base(),notes:{plain:'local edit',updatedAt:3}},baseline:base(),revision:2,conflict:null}),checkpoint:async()=>{},load:async()=>({snapshot:{...base(),notes:{plain:'remote edit',updatedAt:4}},revision:4})});await c.start();assert.deepEqual(c.conflict,{local:'local edit',remote:'remote edit'});assert.equal(c.state.notes.plain,'local edit');c.dispose();
});
test('acknowledgement cannot clear a newer device draft',async()=>{
 const first=defer(),saved=[];let count=0;const c=coordinator({checkpoint:async value=>saved.push(value?.state.notes.plain||'clear'),save:async(snapshot,revision)=>{if(++count===1)await first.promise;return {snapshot,revision:revision+1};}});await c.start();await c.checkpointSettled();saved.length=0;c.change(s=>({...s,notes:{plain:'first',updatedAt:1}}));const flushing=c.flush();await new Promise(r=>setTimeout(r,0));c.change(s=>({...s,notes:{plain:'second',updatedAt:2}}));first.resolve();await flushing;await c.checkpointSettled();assert(saved.includes('second'));assert.equal(saved.at(-1),'clear');assert.equal(c.state.notes.plain,'second');assert.equal(c.pending,false);c.dispose();
});
test('unavailable recovery cannot block valid cloud saves or delete unreadable copies',async()=>{
 let checkpoints=0;const c=coordinator({recover:async()=>{throw Error('Unreadable device copy');},checkpoint:async()=>{checkpoints++;}});await c.start();assert(c.ready);c.change(s=>({...s,notes:{plain:'new',updatedAt:1}}));await c.flush();assert.equal(c.status,'saved');assert.match(c.recoveryError,/Unreadable/);assert.equal(checkpoints,0);c.dispose();
});

test('unreadable recovery records are refused instead of filtering their contents',async()=>{
 const {DraftJournal}=await import('../lib/draft-journal.ts');const j=new DraftJournal('alice','tab');const checkpoint={version:1,state:base(),baseline:base(),revision:0,conflict:null};
 assert.equal(j.validate({id:'test',accountId:'alice',savedAt:1,checkpoint}).state.notes.plain,'dashboard notes');
 for(const modified of [{...checkpoint,revision:-1},{...checkpoint,state:{...base(),tasks:[{}]}},{...checkpoint,state:{...base(),schemaVersion:2}},{...checkpoint,state:{...base(),tasks:[task('same'),task('same')]}},{...checkpoint,state:{...base(),tasks:[task('x','a'.repeat(501))]}}])assert.throws(()=>j.validate({id:'test',accountId:'alice',savedAt:1,checkpoint:modified}));
 assert.throws(()=>j.validate({id:'test',accountId:'bob',savedAt:1,checkpoint}));
});

test('manual recovery waits for an in-flight save and retains unrelated current tasks and both notes',async()=>{
 const gate=defer();let writes=0;const current={...base(),tasks:[task('current')],notes:{plain:'Cloud document',updatedAt:10}};
 const c=coordinator({merge:mergeHQState,load:async()=>({snapshot:current,revision:3}),save:async(snapshot,revision)=>{if(++writes===1)await gate.promise;return {snapshot,revision:revision+1};}});
 await c.start();c.change(s=>({...s,notes:{plain:'Current edit',updatedAt:11}}));const flushing=c.flush();await new Promise(r=>setTimeout(r,0));
 const copy={version:1,state:{...base(),tasks:[task('recovered')],notes:{plain:'Older draft',updatedAt:2}},baseline:base(),revision:1,conflict:null};
 assert.throws(()=>c.restore(copy),/current save/);const recovering=c.recoverCopy(copy);gate.resolve();await flushing;await recovering;
 assert.deepEqual(new Set(c.state.tasks.map(t=>t.id)),new Set(['current','recovered']));assert.deepEqual(c.conflict,{local:'Current edit',remote:'Older draft'});assert.equal(writes,1);c.dispose();
});
