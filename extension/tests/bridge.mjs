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
  assert.equal(f.tabs.length,1);assert(f.tabs[0].url.endsWith('#tool=bookmarks'));
  await assert.rejects(f.bridge.openTool('https://evil.test'),/Unknown/);assert.equal(f.tabs.length,1);
});
