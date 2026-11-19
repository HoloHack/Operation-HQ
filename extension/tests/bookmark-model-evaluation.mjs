// Contract fixtures only: these tests do NOT measure real model accuracy.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=name=>fs.readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8');
const packaged=JSON.parse(fs.readFileSync(new URL('../js/bookmark-evaluation-cases.json',import.meta.url),'utf8'));
function fixture(reply){
  const ctx=vm.createContext({URL,TextEncoder,crypto:webcrypto,console,Date,AbortController});
  vm.runInContext(source('classifier')+'\n'+source('local-ai')+'\n'+source('bookmark-evaluation'),ctx);
  const ai=vm.runInContext('LocalAI',ctx),classifier=vm.runInContext('Classifier',ctx),evaluation=vm.runInContext('BookmarkEvaluation',ctx),calls=[];
  ai._engine={chat:{completions:{async create(request){const records=JSON.parse(request.messages[1].content);calls.push({records,request});return {choices:[{message:{content:await reply(records,ai)}}]};}}},interruptGenerate(){}};
  return {ctx,ai,classifier,evaluation,calls};
}
const valid=id=>({id,root:'School & Academics',sub:'Mathematics',confidence:'high',reason:'Synthetic stub result, not measured model quality'});
test('requires already-loaded model and performs no model load',async()=>{
  const f=fixture(()=> '[]');f.ai._engine=null;f.ai.downloadAndLoad=()=>{throw Error('Must not load');};
  await assert.rejects(f.evaluation.evaluate({...f,fixture:packaged}),/explicitly first/);assert.equal(f.calls.length,0);
});
test('actual classification boundary batches unique synthetic inputs without gold labels',async()=>{
  const f=fixture(records=>JSON.stringify(records.map(item=>valid(item.id))));
  const report=await f.evaluation.evaluate({...f,fixture:packaged});
  assert.equal(report.baseline.metrics.total,31);assert.equal(f.calls.flatMap(call=>call.records).length,31);
  for(const call of f.calls){assert(call.records.length<=8);for(const row of call.records)assert.deepEqual(Object.keys(row),['id','title','url','pageContext']);}
  assert.equal(report.counts.completedCases,31);assert.equal(report.counts.failedCases,0);assert.equal(report.counts.missing,0);
  assert.equal(report.modelSuggestions.cases.find(row=>row.id==='protected-inbox').prediction,null);
  assert.match(report.inputHash,/^[a-f0-9]{64}$/);assert.equal(report.traces.length,f.calls.length);
  for(let index=0;index<report.traces.length;index++){const trace=report.traces[index];assert.equal(trace.input,f.calls[index].request.messages[1].content);assert.equal(trace.system,f.calls[index].request.messages[0].content);assert.equal(trace.inputHash,await f.evaluation.hash(trace.input));assert.equal(trace.promptHash,await f.evaluation.hash(trace.system));assert(trace.rawResponse.length<=32000);}
});
test('missing and rejected model decisions count as abstention, not success',async()=>{
  const f=fixture(records=>JSON.stringify([valid(records[0].id),valid('foreign'),{...valid(records[1].id),confidence:'certain'}]));
  const report=await f.evaluation.evaluate({...f,fixture:packaged});assert(report.counts.rejectedItemsInDecodedResponses>0);assert(report.counts.missing>0);assert(report.modelSuggestions.metrics.abstained>0);assert.equal(report.counts.failedCases,0);
});
test('malformed responses record failures and do not fabricate predictions',async()=>{
  const f=fixture(()=>'{not JSON');const report=await f.evaluation.evaluate({...f,fixture:packaged});assert.equal(report.counts.failedCases,31);assert.equal(report.counts.failedBatches,4);assert.equal(report.counts.malformedResponses,4);assert.equal(report.counts.rejectedItemsInDecodedResponses,0);assert.equal(report.modelSuggestions.metrics.accepted,0);assert(report.traces.some(trace=>trace.error));
});
test('non-array and oversized responses remain distinct from decoded item rejection',async()=>{
  const shape=fixture(()=>'{"id":"one"}'),shapeReport=await shape.evaluation.evaluate({...shape,fixture:packaged});assert.equal(shapeReport.counts.invalidShapeResponses,4);assert.equal(shapeReport.counts.malformedResponses,0);assert.equal(shapeReport.counts.rejectedItemsInDecodedResponses,0);
  const f=fixture(()=> 'x'.repeat(32001)),report=await f.evaluation.evaluate({...f,fixture:packaged});assert.equal(report.counts.oversizedResponses,4);assert.equal(report.counts.malformedResponses,0);assert(report.traces.filter(trace=>trace.rawResponse).every(trace=>trace.rawResponse.length===32000&&trace.responseTruncated));
});
test('cancelled and switched-engine runs stop subsequent requests',async()=>{
  for(const mode of ['cancel','engine']){
    const controller=new AbortController();const f=fixture((records,ai)=>{if(mode==='cancel')controller.abort();else ai._engine={};return JSON.stringify(records.map(item=>valid(item.id)));});
    const report=await f.evaluation.evaluate({...f,fixture:packaged,signal:controller.signal});assert.equal(f.calls.length,1);assert.equal(report.counts.cancelledCases,31);assert.equal(report.modelSuggestions.metrics.accepted,0);assert.equal(report.modelInference,'interrupted model attempt');
  }
});
test('observer is opt-in and never installed on unrelated run calls',async()=>{
  const f=fixture(records=>JSON.stringify(records.map(item=>valid(item.id)))),traces=[];
  await f.ai.classifyBookmarks([{id:'test',title:'Synthetic',url:'https://example.org'}],{'School & Academics':['Mathematics']},{onTrace:trace=>traces.push(trace)});
  assert.equal(traces.length,1);await f.ai.run({system:'Unrelated request',input:'[]'});assert.equal(traces.length,1);assert.equal(f.ai.onTrace,undefined);
});
test('external cancelActive stops the whole evaluation without requiring its AbortSignal',async()=>{
  const f=fixture((records,ai)=>{ai.cancelActive();return JSON.stringify(records.map(item=>valid(item.id)));});
  const report=await f.evaluation.evaluate({...f,fixture:packaged});assert.equal(f.calls.length,1);assert.equal(report.counts.cancelledCases,31);assert.equal(report.counts.failedBatches,0);assert.equal(report.modelInference,'interrupted model attempt');assert.equal(f.ai.isRunning(),false);
});
test('unload initiation stops evaluation even while its engine pointer is still present',async()=>{
  const f=fixture((records,ai)=>{ai._unloading=true;return JSON.stringify(records.map(item=>valid(item.id)));}),engine=f.ai._engine;
  const report=await f.evaluation.evaluate({...f,fixture:packaged});assert.equal(f.ai._engine,engine);assert.equal(f.calls.length,1);assert.equal(report.counts.cancelledCases,31);assert.equal(report.counts.failedBatches,0);assert.equal(report.modelSuggestions.metrics.accepted,0);assert.equal(f.ai.isRunning(),false);
});
test('hash failure never starts inference and releases the evaluation UI controls',async()=>{
  const f=fixture(()=> '[]');f.ctx.crypto={};
  await assert.rejects(f.evaluation.evaluate({...f,fixture:packaged}),/hashing/);assert.equal(f.calls.length,0);assert.equal(f.ai.isRunning(),false);
  let mounted;const node=()=>({children:[],style:{},append(...children){this.children.push(...children);},setAttribute(){}});
  const anchor={after(section){mounted=section;}};f.ctx.document={getElementById:id=>id==='local-ai-output'?anchor:null,createElement:node};f.ctx.chrome={runtime:{getURL:path=>'chrome-extension://fixture/'+path}};f.ctx.fetch=async()=>({ok:true,json:async()=>packaged});
  f.ai.mountBookmarkEvaluationUI();const run=mounted.children[2],cancel=mounted.children[3],status=mounted.children[4];await run.onclick();assert.equal(run.disabled,false);assert.equal(cancel.disabled,true);assert.equal(f.ai._bookmarkEvaluationActive,false);assert.equal(f.ai.isRunning(),false);assert.match(status.textContent,/Evaluation stopped: Evaluation hashing is unavailable/);assert.equal(f.calls.length,0);
});
