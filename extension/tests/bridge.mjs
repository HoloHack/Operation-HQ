import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/dashboard-bridge.js',import.meta.url),'utf8');
function fixture(){
  const saved={},tabs=[];let counter=0;
  const chrome={storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,saved[k]]));}}},runtime:{getURL:p=>'chrome-extension://test/'+p,getManifest:()=>({version:'3.1.0'})},tabs:{async query(){await new Promise(r=>setTimeout(r,5));return [...tabs];},async create(t){tabs.push({...t,id:++counter,windowId:1});},async update(id,v){Object.assign(tabs.find(t=>t.id===id),v);}},windows:{async update(){}}};
  const context=vm.createContext({chrome,navigator,URL,console,Date,Set,setTimeout});
  vm.runInContext(source,context);
  const bridge=vm.runInContext('DashboardBridge',context);
  return {bridge,saved,tabs,sender:{url:bridge.ORIGIN+'/workspace',origin:bridge.ORIGIN},message:{protocol:1,type:'hq:bridge:pull'}};
}
test('bridge is off by default and permits only the exact dashboard origin',async()=>{
  const f=fixture();assert.equal((await f.bridge.handle(f.message,f.sender)).enabled,false);
  f.saved[f.bridge.ENABLED_KEY]=true;
  for(const url of ['https://evil.test','https://operation-hq-command-center.shour-ya11.chatgpt.site.evil.test/','http://operation-hq-command-center.shour-ya11.chatgpt.site/','garbage']) assert.equal((await f.bridge.handle(f.message,{url})).ok,false);
  assert.equal((await f.bridge.handle(f.message,{...f.sender,id:'other-extension'})).ok,false);
  assert.equal((await f.bridge.handle({...f.message,type:'hq:bridge:delete'},f.sender)).ok,false);
  assert.equal((await f.bridge.handle({...f.message,protocol:2},f.sender)).ok,false);
});
test('planning projection excludes secrets, bookmarks and emails without storage mutations',async()=>{
  const f=fixture();Object.assign(f.saved,{[f.bridge.ENABLED_KEY]:true,hq_tasks:[{id:'task1',text:'Maths chapter 5',priority:'high',created:123}],hq_calendar_events:{'2026-10-08':['Practice'],'2026-02-31':['Invalid']},hq_notes_document_v2:{version:2,plain:'One copy',revision:123},hq_claude_key:'SECRET',hq_privacy_pin:'1234',hq_gmail_cache_v1:{messages:['private']}});
  const before=JSON.stringify(f.saved),result=await f.bridge.handle(f.message,f.sender);
  assert.equal(result.ok,true);assert.equal(result.snapshot.tasks[0].title,'Maths chapter 5');assert.equal(result.snapshot.events.length,1);assert.equal(result.snapshot.notes.plain,'One copy');assert.equal(result.snapshot.events[0].id,f.bridge.project(f.saved).events[0].id);
  assert.equal(JSON.stringify(f.saved),before);assert(!JSON.stringify(result).includes('SECRET'));assert(!JSON.stringify(result).includes('private'));
});
test('oversized, malformed and duplicate tasks stop rather than truncate',()=>{
  const f=fixture();
  assert.throws(()=>f.bridge.project({hq_notes:'x'.repeat(200001)}),/exceeds/);
  assert.throws(()=>f.bridge.project({hq_tasks:[{}]}),/invalid/);
  assert.throws(()=>f.bridge.project({hq_tasks:[{id:'same',text:'A'},{id:'same',text:'B'}]}),/Duplicate/);
  assert.throws(()=>f.bridge.project({hq_tasks:[{id:'a',text:'x'.repeat(501)}]}),/limits/);
});
test('privacy mode blocks planning reads even when bridge was enabled',async()=>{
  const f=fixture();Object.assign(f.saved,{[f.bridge.ENABLED_KEY]:true,hq_context:{mode:'privacy'}});
  assert.equal((await f.bridge.handle(f.message,f.sender)).ok,false);
});
test('concurrent tool clicks reuse one workspace and reject arbitrary routes',async()=>{
  const f=fixture();await Promise.all([f.bridge.openTool('notes'),f.bridge.openTool('calendar'),f.bridge.openTool('bookmarks')]);
  assert.equal(f.tabs.length,1);assert.equal(new URLSearchParams(new URL(f.tabs[0].url).hash.slice(1)).get('tool'),'bookmarks');
  await assert.rejects(f.bridge.openTool('https://evil.test'),/Unknown/);assert.equal(f.tabs.length,1);
});

test('request identities reopen the same tool without another workspace',async()=>{const f=fixture();await f.bridge.openTool('gmail');const first=f.tabs[0].url;await f.bridge.openTool('gmail');assert.equal(f.tabs.length,1);assert.notEqual(f.tabs[0].url,first);assert.equal(new URLSearchParams(new URL(f.tabs[0].url).hash.slice(1)).get('tool'),'gmail');});
test('projected alternate weeks match native job weeks and respect overrides',()=>{
 const f=fixture(),block=t=>({s:'16:30',e:'18:30',t}),profile={days:{mon:[block('Park')]},altDays:{mon:[block('Marking job')]},altAnchorDate:'2026-09-16',altIntervalWeeks:2,altWeekOverride:null};
 const saved={hq_schedule_profiles:{master:profile},hq_active_schedule_profile:'master'};
 const projected=f.bridge.project(saved).schedule;
 assert.equal(projected.find(b=>b.title==='Marking job').weekParity,0);assert.equal(projected.find(b=>b.title==='Park').weekParity,1);
 assert.equal(projected[0].altAnchor,'2026-09-14');
 for(const override of [true,false]){profile.altWeekOverride=override;const rows=f.bridge.project(saved).schedule;assert.equal(rows.length,1);assert.equal(rows[0].title,override?'Marking job':'Park');assert.equal(rows[0].weekParity,undefined);}
 profile.altWeekOverride=null;profile.altIntervalWeeks=3;assert.throws(()=>f.bridge.project(saved),/unsupported interval/);
});
