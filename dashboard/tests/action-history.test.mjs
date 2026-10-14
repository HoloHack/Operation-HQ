import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyHQState,recordRemovals,mergeHQState} from '../lib/hq-state.ts';
import {createHistory,restoreHistory,validateHistory,sameRecord,historyBasis} from '../lib/action-history.ts';
const task={id:'task',title:'Maths chapter 7',priority:'high',completed:false,estimateMinutes:30,updatedAt:100};
const initial=()=>({...emptyHQState(),tasks:[task]});
const deleted=()=>recordRemovals(initial(),{...initial(),tasks:[]},110);
const action=()=>createHistory(initial(),deleted(),'alice','change','Deleted maths',110);
test('durable inverse survives serialization and restores only its task beyond its tombstone',()=>{
 const s={...deleted(),tasks:[{...task,id:'unrelated'}],notes:{plain:'New notes',updatedAt:120}};
 const restored=restoreHistory(s,JSON.parse(JSON.stringify(action())),'alice',115);
 assert.equal(restored.tasks.length,2);assert.equal(restored.notes.plain,'New notes');assert.equal(restored.tasks.find(t=>t.id==='task').updatedAt,115);assert.equal(mergeHQState(s,restored).tasks.length,2);
});
test('restoring cannot overwrite a present copy, a newer deletion or a missing deletion marker',()=>{
 assert.throws(()=>restoreHistory(initial(),action(),'alice',120),/already present/);
 assert.throws(()=>restoreHistory({...deleted(),tombstones:[{id:'task',collection:'tasks',updatedAt:130}]},action(),'alice',140),/deleted again/);
 assert.throws(()=>restoreHistory({...deleted(),tombstones:[]},action(),'alice',120),/changed/);
});
test('history rejects wrong-account, corrupt, duplicate and truncated records',()=>{
 assert.throws(()=>validateHistory(action(),'bob'),/another account/);
 for(const patch of [{version:9},{savedAt:NaN},{changes:[]},{changes:[...action().changes,...action().changes]},{changes:[{...action().changes[0],before:{...task,title:'x'.repeat(501)}}]},{changes:[{...action().changes[0],deletedAt:100}]}])assert.throws(()=>validateHistory({...action(),...patch},'alice'));
});
test('plan recovery keeps unrelated events and atomically rejects edits to its sessions',()=>{
 const old={id:'old',title:'Prior study',date:'2026-10-15',start:'17:00',end:'17:30',updatedAt:90};
 const added={...old,id:'new',title:'Maths',updatedAt:110},unrelated={...old,id:'unrelated'};
 const before={...initial(),events:[old]},after=recordRemovals(before,{...before,events:[added]},110),record=createHistory(before,after,'alice','plan','Study plan',110);
 const restored=restoreHistory({...after,events:[added,unrelated]},record,'alice',120);
 assert.deepEqual(restored.events.map(e=>e.id),['unrelated','old']);assert(restored.events[1].updatedAt>after.tombstones[0].updatedAt);
 assert.throws(()=>restoreHistory({...after,events:[{...added,notes:'New correction'}]},record,'alice',120),/edited or removed/);assert.equal(after.events[0].title,'Maths');
});
test('weekly recovery preserves alternating metadata and protects the whole operation from partial restore',()=>{
 const weekly={id:'weekly',title:'Study flex',day:3,start:'19:00',end:'20:00',altAnchor:'2026-10-14',weekParity:1,updatedAt:100};
 const before={...initial(),schedule:[weekly]},after=recordRemovals(before,{...before,tasks:[],schedule:[]},110),record=createHistory(before,after,'alice','two','Deleted two',110);
 const restored=restoreHistory(after,record,'alice',120);assert.equal(restored.schedule[0].weekParity,1);assert.equal(restored.tasks[0].id,'task');
 assert.throws(()=>restoreHistory({...after,tasks:[task]},record,'alice',120));assert.equal(after.schedule.length,0);
});
test('recovery compares values despite reordered keys and never treats unrelated notes as stale',()=>{
 assert(sameRecord({title:'A',updatedAt:2,subject:undefined},{updatedAt:2,title:'A'}));
 assert(sameRecord(historyBasis(initial()),historyBasis({...initial(),notes:{plain:'elsewhere',updatedAt:1000}})));
 assert(!sameRecord(historyBasis(initial()),historyBasis({...initial(),tasks:[{...task,title:'Edited'}]})));
});
test('restoring at collection capacity refuses the entire inverse without silently losing another task',()=>{
 const full={...deleted(),tasks:Array.from({length:2000},(_,i)=>({...task,id:String(i)}))};
 assert.throws(()=>restoreHistory(full,action(),'alice',120),/2000-item/);assert.equal(full.tasks.length,2000);
});
test('history creation refuses a deletion without its marker and edited records masquerading as removals',()=>{
 assert.throws(()=>createHistory(initial(),{...initial(),tasks:[]},'alice','no-marker','Delete',110),/marker/);
 assert.throws(()=>createHistory(initial(),{...initial(),tasks:[{...task,title:'Changed'}]},'alice','edit','Delete',110),/edit existing/);
});
