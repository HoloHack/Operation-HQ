import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';
import { SyncCoordinator } from '../lib/sync-coordinator.ts';
import { emptyHQState, sanitizeHQState, mergeHQState, validDate, validTime } from '../lib/hq-state.ts';
import { parseChapters, remainingSeconds } from '../lib/focus-clock.ts';
import { readStateRequest, StateRequestError, MAX_PAYLOAD_BYTES } from '../lib/state-request.ts';

const defer = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const task = (id, updatedAt=1) => ({id,title:id,priority:'normal',completed:false,updatedAt});
const make = (options={}) => new SyncCoordinator({initial:emptyHQState(),merge:mergeHQState,load:async()=>({snapshot:emptyHQState(),revision:0}),save:async(snapshot,revision)=>({snapshot,revision:revision+1}),changed:()=>{},debounce:100000,...options});
const changeNote = (coordinator, plain, updatedAt=10) => coordinator.change(s=>({...s,notes:{plain,updatedAt}}));

test('saving serializes requests and acknowledges only the generation sent',async()=>{
  const first=defer(); let requests=0; let active=0,max=0; const saved=[];
  const c=make({save:async(snapshot,revision)=>{requests++;active++;max=Math.max(max,active);saved.push(snapshot.notes.plain);if(requests===1)await first.promise;active--;return {snapshot,revision:revision+1};}});
  await c.start();changeNote(c,'first');const flush=c.flush();changeNote(c,'newest',11);const overlap=c.flush();
  assert.equal(c.pending,true);assert.equal(requests,1);first.resolve();await Promise.all([flush,overlap]);
  assert.deepEqual(saved,['first','newest']);assert.equal(max,1);assert.equal(c.pending,false);assert.equal(c.state.notes.plain,'newest');c.dispose();
});
test('startup preserves edits typed before load completes',async()=>{
  const load=defer();const c=make({load:()=>load.promise});const ready=c.start();changeNote(c,'draft');
  load.resolve({snapshot:{...emptyHQState(),tasks:[task('remote')]},revision:3});await ready;
  assert.equal(c.state.notes.plain,'draft');assert.equal(c.state.tasks[0].id,'remote');assert.equal(c.pending,true);c.dispose();
});
test('409 merges against latest state, not the old request snapshot',async()=>{
  const flight=defer();let count=0;const c=make({save:async(snapshot,revision)=>++count===1?flight.promise:{snapshot,revision:revision+1}});
  await c.start();c.change(s=>({...s,tasks:[task('first')]}));const flush=c.flush();c.change(s=>({...s,tasks:[...s.tasks,task('during-save')]}));
  flight.resolve({snapshot:{...emptyHQState(),tasks:[task('elsewhere')]},revision:4,conflict:true});await flush;
  assert.deepEqual(c.state.tasks.map(x=>x.id).sort(),['during-save','elsewhere','first']);assert.equal(c.revision,5);c.dispose();
});
test('concurrent notes preserve both and block automatic overwrite',async()=>{
  const remote={...emptyHQState(),notes:{plain:'remote version',updatedAt:20}};
  const c=make({save:async()=>({snapshot:remote,revision:2,conflict:true})});await c.start();changeNote(c,'my version');await c.flush();
  assert.equal(c.status,'conflict');assert.deepEqual(c.conflict,{local:'my version',remote:'remote version'});assert.equal(c.state.notes.plain,'my version');
  c.resolveNotes('combined');assert.equal(c.conflict,null);assert.equal(c.state.notes.plain,'combined');c.dispose();
});
test('save failure is unsaved, retains text and retries',async()=>{
  let fail=true;const c=make({save:async(snapshot,revision)=>{if(fail)throw Error('offline');return {snapshot,revision:revision+1};}});
  await c.start();changeNote(c,'retain me');await c.flush();assert.equal(c.status,'unsaved');assert.equal(c.pending,true);fail=false;await c.retry();assert.equal(c.status,'saved');c.dispose();
});
test('failed initial load cannot save a blank replacement',async()=>{
  let writes=0;const c=make({load:async()=>{throw Error('unavailable');},save:async()=>{writes++;throw Error();}});
  await c.start();changeNote(c,'new draft');await c.flush();assert.equal(writes,0);assert.equal(c.ready,false);c.dispose();
});
test('stale initial response is ignored after restart',async()=>{
  const old=defer();let loads=0;const c=make({load:()=>++loads===1?old.promise:Promise.resolve({snapshot:{...emptyHQState(),tasks:[task('new')]},revision:2})});
  const previous=c.start();c.dispose();await c.start();old.resolve({snapshot:emptyHQState(),revision:0});await previous;
  assert.equal(c.revision,2);assert.equal(c.state.tasks[0].id,'new');c.dispose();
});
test('timer calculates elapsed time after background throttling and stays zero on completion',()=>{
  assert.equal(remainingSeconds(100000,75000),25);assert.equal(remainingSeconds(100000,100001),0);assert.equal(remainingSeconds(100000,75001),25);
});
test('chapter parser preserves non-contiguous intent and excludes deadline numbers',()=>{
  assert.deepEqual(parseChapters('grind math chapters 5, 7, 8 and 10 by 30 September for 50 minutes'),[5,7,8,10]);
  assert.deepEqual(parseChapters('chapters 5 to 7 and 10'),[5,6,7,10]);
  assert.deepEqual(parseChapters('chapters 0 to 9'),[]);assert.deepEqual(parseChapters('chapters 9 to 1'),[]);assert.deepEqual(parseChapters('chapters 1 to 999'),[]);
});
test('dates and times reject impossible values',()=>{
  assert.equal(validDate('2026-02-30'),false);assert.equal(validDate('2024-02-29'),true);assert.equal(validDate('2025-02-29'),false);
  assert.equal(validTime('24:00'),false);assert.equal(validTime('09:60'),false);assert.equal(validTime('23:59'),true);
});
test('sanitizer preserves notes whitespace, secondary hue and valid event details',()=>{
  const s=sanitizeHQState({...emptyHQState(),notes:{plain:'  text\n\n',updatedAt:2},settings:{supportHue:42},events:[{id:'x',title:'Meeting',date:'2026-09-29',notes:' detail\n',location:'School',updatedAt:1}]});
  assert.equal(s.notes.plain,'  text\n\n');assert.equal(s.settings.supportHue,42);assert.equal(s.events[0].notes,' detail\n');assert.equal(s.events[0].location,'School');
});
const req=(body,headers={})=>new Request('https://hq.test/api/state',{method:'PUT',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
test('write validation rejects missing snapshots, null and oversized collections',async()=>{
  for (const body of [null,[],{}, {baseRevision:'0',snapshot:emptyHQState()}, {baseRevision:0,snapshot:{}}]) await assert.rejects(readStateRequest(req(body)),StateRequestError);
  await assert.rejects(readStateRequest(req({baseRevision:0,snapshot:{...emptyHQState(),tasks:Array.from({length:2001},(_,i)=>task(String(i)))}})),e=>e.status===422);
});
test('request validation rejects cross-origin writes and enforces raw byte limit',async()=>{
  await assert.rejects(readStateRequest(req({baseRevision:0,snapshot:emptyHQState()},{Origin:'https://attacker.test'})),e=>e.status===403);
  await assert.rejects(readStateRequest(req({padding:'a'.repeat(MAX_PAYLOAD_BYTES)})),e=>e.status===413);
});

function routeHarness() {
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE hq_state (user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, schema_version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  let user={userId:'alice'}, broken=false;
  const env={DB:{prepare(sql){return {bind(...args){return {async first(){if(broken)throw Error('private database details');return db.prepare(sql).get(...args);},async run(){if(broken)throw Error('private database details');const result=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};}};}}};
  const source=readFileSync(new URL('../app/api/state/route.ts',import.meta.url),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};new Function('require','module','exports',js)(name=>{
    if(name==='cloudflare:workers')return {env};if(name.includes('chatgpt-auth'))return {getChatGPTUser:async()=>user};if(name.includes('hq-state'))return {emptyHQState,sanitizeHQState};if(name.includes('state-request'))return {readStateRequest,StateRequestError};throw Error(name);
  },module,module.exports);
  return {db,...module.exports,setUser:value=>{user=value;},breakStorage:()=>{broken=true;}};
}
test('API enforces identity and account isolation',async()=>{
  const r=routeHarness();r.setUser(null);assert.equal((await r.GET()).status,401);assert.equal((await r.PUT(req({baseRevision:0,snapshot:emptyHQState()}))).status,401);
  r.setUser({userId:'alice'});assert.equal((await r.PUT(req({baseRevision:0,snapshot:{...emptyHQState(),tasks:[task('alice')]}}))).status,200);
  r.setUser({userId:'bob'});assert.equal((await (await r.GET()).json()).snapshot.tasks.length,0);r.db.close();
});
test('API compare-and-swap rejects stale writes and invalid first revision',async()=>{
  const r=routeHarness();assert.equal((await r.PUT(req({baseRevision:4,snapshot:emptyHQState()}))).status,409);
  assert.equal((await r.PUT(req({baseRevision:0,snapshot:emptyHQState()}))).status,200);
  assert.equal((await r.PUT(req({baseRevision:0,snapshot:emptyHQState()}))).status,409);
  const responses=await Promise.all([r.PUT(req({baseRevision:1,snapshot:emptyHQState()})),r.PUT(req({baseRevision:1,snapshot:emptyHQState()}))]);assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);r.db.close();
});
test('API refuses corrupt stored data without overwriting it',async()=>{
  const r=routeHarness();for(const payload of ['{invalid','null','{}']){r.db.prepare('INSERT OR REPLACE INTO hq_state VALUES (?,1,1,?,0)').run('alice',payload);assert.equal((await r.GET()).status,422);assert.equal((await r.PUT(req({baseRevision:1,snapshot:emptyHQState()}))).status,422);assert.equal(r.db.prepare('SELECT payload FROM hq_state').get().payload,payload);}r.db.close();
});
test('API returns safe storage failure, rejects invalid events and duplicate IDs',async()=>{
  const r=routeHarness();assert.equal((await r.PUT(req({baseRevision:0,snapshot:{...emptyHQState(),events:[{id:'x',title:'bad',date:'2026-02-30'}]}}))).status,422);
  assert.equal((await r.PUT(req({baseRevision:0,snapshot:{...emptyHQState(),tasks:[task('x'),task('x')]}}))).status,422);
  r.breakStorage();const failed=await r.GET();assert.equal(failed.status,503);assert.equal((await failed.text()).includes('private database details'),false);r.db.close();
});
test('UI contracts: no auto bridge writes, accessible dialogs, real unsaved labels',()=>{
  const ui=readFileSync(new URL('../app/dashboard.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
  assert.ok(!ui.includes('hq:bridge:push'));assert.ok(!ui.includes('Offline copy'));assert.ok(ui.includes('DialogContent'));assert.ok(ui.includes('inert={cinema}'));assert.ok(css.includes('html[data-motion="reduced"]'));assert.ok(ui.includes('Import into my account'));
});

test('merging disjoint collections preserves every record beyond save capacity',()=>{
  const left={...emptyHQState(),tasks:Array.from({length:1500},(_,i)=>task(`a${i}`))};
  const right={...emptyHQState(),tasks:Array.from({length:1500},(_,i)=>task(`b${i}`))};
  const merged=mergeHQState(left,right);assert.equal(merged.tasks.length,3000);assert.equal(new Set(merged.tasks.map(t=>t.id)).size,3000);
  assert.throws(()=>sanitizeHQState(merged),/save limit/);assert.equal(JSON.parse(JSON.stringify(merged)).tasks.length,3000);
  assert.equal(sanitizeHQState({...merged,settings:{...merged.settings,accentHue:100}},{preserveOverflow:true}).tasks.length,3000);
});
test('all capacity limits refuse oversized incoming collections and notes',async()=>{
  const {HQ_COLLECTION_LIMITS,HQ_NOTES_LIMIT,assertHQCapacity}=await import('../lib/hq-state.ts');
  for(const [key,limit] of Object.entries(HQ_COLLECTION_LIMITS)) assert.throws(()=>sanitizeHQState({...emptyHQState(),[key]:Array(limit+1).fill({})}),/save limit/);
  assert.throws(()=>assertHQCapacity({...emptyHQState(),notes:{plain:'x'.repeat(HQ_NOTES_LIMIT+1),updatedAt:1}}),/save limit/);
});
test('overflow after a conflict remains unsaved and exportable without retries losing records',async()=>{
  const {assertHQCapacity}=await import('../lib/hq-state.ts');let writes=0;
  const remote={...emptyHQState(),tasks:Array.from({length:1500},(_,i)=>task(`b${i}`))};
  const c=make({save:async(snapshot)=>{assertHQCapacity(snapshot);writes++;return {snapshot:remote,revision:1,conflict:true};}});
  await c.start();c.change(s=>({...s,tasks:Array.from({length:1500},(_,i)=>task(`a${i}`))}));await c.flush();
  assert.equal(c.state.tasks.length,3000);assert.equal(c.status,'unsaved');assert.equal(writes,1);assert.match(c.error,/save limit/);assert.equal(c.pending,true);c.dispose();
});
test('keep both notes preserves large text instead of slicing it',async()=>{
  const {assertHQCapacity}=await import('../lib/hq-state.ts');const text='a'.repeat(120000)+'\n'+ 'b'.repeat(120000);
  const state=sanitizeHQState({...emptyHQState(),notes:{plain:text,updatedAt:1}},{preserveOverflow:true});assert.equal(state.notes.plain,text);assert.throws(()=>assertHQCapacity(state),/save limit/);
});
test('chapter parser rejects decimals, oversized numbers and unfinished ranges',()=>{
  for(const input of ['math chapters 5.5','chapters 5, 7.5','chapters 1000','chapters 5 to','chapters 5-','chapters 5 and','chapters 5,'])assert.deepEqual(parseChapters(input),[],input);
});
test('chapter plan requires real deadline and estimates and reuses existing active tasks',async()=>{
  const {createChapterTasks}=await import('../lib/study-plan.ts');let sequence=0;const id=()=>`new${sequence++}`;
  const plan={subject:'Mathematics',chapters:[5,7,8,10],today:'2026-10-08',due:'2026-10-12',minutes:45};
  assert.throws(()=>createChapterTasks({...plan,due:''},[],id,1),/deadline/);assert.throws(()=>createChapterTasks({...plan,due:'2026-10-07'},[],id,1),/deadline/);assert.throws(()=>createChapterTasks({...plan,minutes:4},[],id,1),/Estimate/);
  const existing={...task('existing'),title:'Mathematics — Chapter 5',due:'2026-10-09'};
  const first=createChapterTasks(plan,[existing],id,1);assert.equal(first.tasks.length,3);assert.equal(first.reused,1);assert.ok(first.tasks.every(t=>t.due===plan.due&&t.estimateMinutes===45));assert.equal(existing.due,'2026-10-09');
  const second=createChapterTasks(plan,[existing,...first.tasks],id,2);assert.equal(second.tasks.length,0);assert.equal(second.reused,4);
});

test('API account binding rejects a stale tab after another account signs in',async()=>{
 const r=routeHarness();const request=req({baseRevision:0,snapshot:emptyHQState()});request.headers.set('x-hq-account','another-user');assert.equal((await r.PUT(request)).status,403);assert.equal((await r.GET(new Request('https://hq.test/api/state',{headers:{'x-hq-account':'another-user'}}))).status,403);assert.equal(r.db.prepare('SELECT count(*) AS n FROM hq_state').get().n,0);r.db.close();
});
