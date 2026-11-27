// Development benchmark: diagnostics, not a passing semantic-quality gate.
// Optional --suggestions <JSON file> scores explicitly supplied predictions;
// it never downloads a model or calls a provider and never calls them live AI.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context=vm.createContext({URL,console});
vm.runInContext(fs.readFileSync(new URL('../js/classifier.js',import.meta.url),'utf8'),context);
const classifier=vm.runInContext('Classifier',context);
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/bookmark-labelled.json',import.meta.url),'utf8'));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validPath=path=>Array.isArray(path)&&path.length>=1&&path.length<=2&&same(Array.from(classifier.normalizePath(path,{allowOperational:false})||[]),path);
assert.equal(new Set(fixture.cases.map(item=>item.id)).size,fixture.cases.length,'Duplicate fixture IDs');
for(const item of fixture.cases)assert(item.expected===null||validPath(item.expected),'Invalid expected taxonomy: '+item.id);
const rows=fixture.cases.map(item=>{
  const protectedTitle=classifier.shouldNeverSort(item.title);
  const result=protectedTitle?{path:null,confidence:'protected',source:'protected-title'}:classifier.classify(item,{},[]);
  const accepted=!protectedTitle&&result.confidence==='high'&&validPath(Array.from(result.path||[]));
  const prediction=accepted?Array.from(result.path):null;
  return {id:item.id,expected:item.expected,prediction,accepted,confidence:result.confidence,source:result.source,correct:same(prediction,item.expected)};
});
function metrics(rows){
  const total=rows.length,accepted=rows.filter(r=>r.accepted),correctAccepted=accepted.filter(r=>r.correct),known=rows.filter(r=>r.expected!==null),needsAbstention=rows.filter(r=>r.expected===null);
  const rate=(a,b)=>b?Number((a/b).toFixed(4)):null;
  return {total,accepted:accepted.length,correctAccepted:correctAccepted.length,incorrectAccepted:accepted.length-correctAccepted.length,abstained:total-accepted.length,coverage:rate(accepted.length,total),abstentionRate:rate(total-accepted.length,total),selectiveAccuracy:rate(correctAccepted.length,accepted.length),allCaseAccuracy:rate(rows.filter(r=>r.correct).length,total),knownTopicCount:known.length,knownTopicRecall:rate(correctAccepted.length,known.length),knownTopicsLeftUnresolved:known.filter(r=>!r.accepted).length,requiredAbstentionCount:needsAbstention.length,correctAbstentions:needsAbstention.filter(r=>!r.accepted).length};
}
const corrections=fixture.corrections.map(item=>{
  assert(validPath(item.destination),'Invalid correction destination');
  const learned={[classifier.fingerprint(item.bookmark)]:item.destination},result=classifier.classify(item.bookmark,learned,[]);
  return {id:item.id,ownerOverrideAccepted:result.source==='learned-exact'&&same(Array.from(result.path||[]),item.destination),unrelatedResourceIsolated:item.unrelated?classifier.classify(item.unrelated,learned,[]).source!=='learned-exact':null};
});
const resourcePairs=fixture.resourcePairs.map(item=>({id:item.id,expectedSame:item.same,actualSame:classifier.fingerprint({url:item.a})===classifier.fingerprint({url:item.b}),correct:item.same===(classifier.fingerprint({url:item.a})===classifier.fingerprint({url:item.b}))}));
const seen=new Set(),uniqueRows=rows.filter((row,index)=>{const key=classifier.fingerprint(fixture.cases[index]);if(seen.has(key))return false;seen.add(key);return true;});
const report={benchmarkVersion:fixture.version,scope:fixture.scope,policy:'Only high-confidence taxonomy-valid deterministic results count as accepted; protected titles count as abstention. Incorrect high-confidence decisions are reported, not hidden by a pass threshold. Deduplicated metrics retain the first fixture row for each canonical resource.',modelInference:'not run',baseline:{metrics:metrics(rows),deduplicatedMetrics:metrics(uniqueRows),cases:rows},corrections,resourcePairs};
if(process.argv.length>2){
  assert.equal(process.argv[2],'--suggestions','Only --suggestions <JSON path> is supported');assert(process.argv[3],'Missing suggestion path');
  const supplied=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));assert(Array.isArray(supplied),'Suggestions must be an array');
  const counts=new Map();for(const item of supplied)if(typeof item?.id==='string')counts.set(item.id,(counts.get(item.id)||0)+1);
  const allowed=new Set(rows.map(r=>r.id)),validated=new Map();
  for(const item of supplied)if(allowed.has(item?.id)&&counts.get(item.id)===1&&validPath(item.path)&&['high','medium','low'].includes(item.confidence))validated.set(item.id,item);
  const scored=rows.map(row=>{const proposed=validated.get(row.id),prediction=proposed?.confidence==='high'&&row.source!=='protected-title'?proposed.path:null;return {...row,prediction,accepted:prediction!==null,confidence:proposed?.confidence||'not-supplied',source:row.source==='protected-title'?'protected-title':'supplied-offline-prediction',correct:same(prediction,row.expected)};});
  report.suppliedSuggestionReplay={scope:'Explicit supplied offline predictions only. Not measured live-model accuracy or current automatic sorting behavior; supplied confidence is not independently calibrated.',validated:validated.size,rejected:supplied.length-validated.size,metrics:metrics(scored),cases:scored};
}
console.log(JSON.stringify(report,null,2));
