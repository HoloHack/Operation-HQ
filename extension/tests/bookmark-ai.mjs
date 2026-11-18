import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../js/local-ai.js',import.meta.url),'utf8');
function fixture(reply){const ctx=vm.createContext({console});vm.runInContext(source,ctx);const ai=vm.runInContext('LocalAI',ctx),calls=[];ai.run=async request=>{assert(request.input.length<=8500);const items=JSON.parse(request.input);calls.push(items);return JSON.stringify(reply(items));};return {ai,calls};}
const taxonomy={'School & Academics':['Mathematics','Science'],'Entertainment':['Music']};
const valid=id=>({id,root:'School & Academics',sub:'Mathematics',confidence:'high',reason:'Math evidence'});
test('large escaped batches preserve all exact IDs in complete bounded JSON',async()=>{const {ai,calls}=fixture(items=>items.map(item=>valid(item.id)));const items=Array.from({length:8},(_,i)=>({id:String(i),title:'x'.repeat(260),url:'https://example.org/'+i,pageContext:'\u0001'.repeat(1800)}));const result=await ai.classifyBookmarks(items,taxonomy);assert.equal(result.length,8);assert(calls.length>1);assert.deepEqual(calls.flat().map(x=>x.id),items.map(x=>x.id));});
test('duplicate IDs are rejected, not last-wins; foreign IDs cannot escape batch',async()=>{const {ai}=fixture(()=>[valid('one'),{...valid('one'),root:'Entertainment',sub:'Music'},valid('foreign'),valid('two')]);const result=await ai.classifyBookmarks([{id:'one'},{id:'two'}],taxonomy);assert.deepEqual(Array.from(result,x=>x.id),['two']);});
test('invalid roots, subfolders, confidence and reasons remain unresolved',async()=>{for(const bad of [{root:'Invented'},{sub:'Invented'},{confidence:'certain'},{reason:{}},{reason:''},{root:'toString'},{sub:[]}]){const {ai}=fixture(()=>[{...valid('one'),...bad}]);assert.equal((await ai.classifyBookmarks([{id:'one'}],taxonomy)).length,0,JSON.stringify(bad));}});
test('valid root-only suggestions and bounded reasons retain only expected fields',async()=>{const {ai}=fixture(()=>[{...valid('one'),sub:null,reason:'x'.repeat(1000),action:'delete'}]);const [result]=await ai.classifyBookmarks([{id:'one'}],taxonomy);assert.equal(result.sub,'');assert.equal(result.reason.length,300);assert.equal(result.action,undefined);});
test('input ID collisions and oversized IDs stop before inference',async()=>{const {ai,calls}=fixture(()=>[]);for(const items of [[{id:'same'},{id:'same'}],[{id:'x'.repeat(81)}],[{id:''}]])await assert.rejects(ai.classifyBookmarks(items,taxonomy),/IDs/);assert.equal(calls.length,0);});
test('malformed and oversized output fail visibly rather than fabricating decisions',async()=>{const {ai}=fixture(()=>[]);ai.run=async()=>'{"id":"one"}';await assert.rejects(ai.classifyBookmarks([{id:'one'}],taxonomy),/array/);ai.run=async()=>'x'.repeat(32001);await assert.rejects(ai.classifyBookmarks([{id:'one'}],taxonomy),/safety limit/);});
test('automatic worker lookup cannot reuse another hash-route shell evidence',async()=>{
  const source=fs.readFileSync(new URL('../js/background.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function sortAutomaticBookmark('),source.indexOf('const BookmarkAutomation='));
  const cache={'url:https://example.org/':{text:'Guitar music',at:Date.now()}};let observed;
  const bm={id:'one',title:'Saved page',parentId:'1',url:'https://example.org/#/math'};
  const ctx=vm.createContext({URL,Date,chrome:{bookmarks:{get:async()=>[bm]},storage:{local:{get:async()=>({hq_bookmark_evidence_v1:cache})}}},getBarId:async()=>'1',bookmarkFolderPath:async()=>[],scanLegitFolders:async()=>[],markBookmarkDecision:async()=>{},Classifier:{shouldNeverSort:()=>false,normalizePath:()=>null,classify:item=>{observed=item.title;return {};}}});
  vm.runInContext(fn+'\nthis.sort=sortAutomaticBookmark;',ctx);
  await ctx.sort({id:'one',url:bm.url,parentId:'1'});assert.equal(observed,'Saved page');
  cache['url:'+bm.url]={schema:2,resourceKey:'url:'+bm.url,text:'Calculus lesson',at:Date.now()};
  await ctx.sort({id:'one',url:bm.url,parentId:'1'});assert.equal(observed,'Saved page Calculus lesson');
});
