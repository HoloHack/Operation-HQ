import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=name=>fs.readFileSync(new URL(`../js/${name}.js`,import.meta.url),'utf8');
function fixture(responseFor) {
  const saved={},requests=[];
  const chrome={storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,saved[key]])),set:async value=>Object.assign(saved,structuredClone(value))}}};
  const ctx=vm.createContext({URL,console,chrome,AbortController,TextDecoder,setTimeout,clearTimeout,fetch:async(endpoint,options)=>{requests.push({endpoint,options});return responseFor(endpoint);}});
  vm.runInContext(source('classifier')+'\n'+source('bookmarks'),ctx);
  return {ctx,saved,requests,book:vm.runInContext('Bookmarks',ctx),classifier:vm.runInContext('Classifier',ctx)};
}
function jsonResponse(url,{redirected=false}={}){
  const response=new Response(JSON.stringify({title:'Piano scales chords music guitar tutorial',provider_name:'Music Site'}),{headers:{'content-type':'application/json'}});
  Object.defineProperties(response,{url:{value:url},redirected:{value:redirected}});
  return response;
}
test('evidence rejects cross-origin, changed path/query and missing final resource identity',async()=>{
  const requested='https://example.org/item/one?chapter=5';
  for(const responseUrl of ['https://unrelated.example.org/music','https://example.org/item/two?chapter=5','https://example.org/item/one?chapter=7','']){
    const f=fixture(()=>jsonResponse(responseUrl));
    assert.equal(await f.book.fetchPageContext(requested),'',responseUrl);
    assert.equal(f.saved.hq_bookmark_evidence_v1,undefined);
    assert.equal(f.requests[0].options.redirect,'error');
    assert.equal(f.requests[0].options.credentials,'omit');
  }
});
test('a reported redirect is rejected even if its final URL equals the original',async()=>{
  const f=fixture(endpoint=>jsonResponse(endpoint,{redirected:true}));
  assert.equal(await f.book.fetchPageContext('https://example.org/item/one'),'');
});
test('same-resource response is cached with resource-bound schema; old unproven entries are not reused',async()=>{
  const url='https://example.org/item/one',key='url:'+url;
  const f=fixture(endpoint=>jsonResponse(endpoint));
  f.saved.hq_bookmark_evidence_v1={[key]:{text:'Old unrelated topic',at:Date.now()}};
  const text=await f.book.fetchPageContext(url);
  assert(text.includes('Piano'));assert.equal(f.requests.length,1);
  const entry=f.saved.hq_bookmark_evidence_v1[key];assert.equal(entry.schema,2);assert.equal(entry.resourceKey,key);
  assert.equal(await f.book.fetchPageContext(url+'#heading'),text);assert.equal(f.requests.length,1);
});
test('oEmbed evidence requires its exact provider endpoint and original video query',async()=>{
  const url='https://www.youtube.com/watch?v=original';
  const f=fixture(endpoint=>endpoint.includes('/oembed?')?jsonResponse('https://www.youtube.com/oembed?format=json&url='+encodeURIComponent('https://www.youtube.com/watch?v=other')):jsonResponse('https://www.youtube.com/'));
  assert.equal(await f.book.fetchPageContext(url),'');
  const direct=fixture(endpoint=>jsonResponse(endpoint));
  assert((await direct.book.fetchPageContext(url)).includes('Piano'));
  assert.equal(direct.requests.length,1);
});
test('worker cannot auto-file from legacy or mismatched-resource cache evidence',async()=>{
  const url='https://example.org/item/one',key='url:'+url;
  const f=fixture(()=>{throw Error('Worker must not fetch page metadata');});
  const bm={id:'one',parentId:'1',title:'Saved page',url};let moves=0;
  f.ctx.chrome.bookmarks={get:async()=>[bm]};
  Object.assign(f.ctx,{getBarId:async()=>'1',bookmarkFolderPath:async()=>[],scanLegitFolders:async()=>[],getOrCreateFolderPath:async()=>'music',moveSelf:async()=>{moves++;},clearBookmarkDecision:async()=>{},markBookmarkDecision:async()=>{}});
  const bg=source('background'),fn=bg.slice(bg.indexOf('async function sortAutomaticBookmark('),bg.indexOf('const BookmarkAutomation='));
  vm.runInContext(fn+'\nthis.sort=sortAutomaticBookmark',f.ctx);
  const text='Piano scales chords music guitar tutorial';
  for(const entry of [{text,at:Date.now()},{schema:2,resourceKey:'url:https://example.org/item/two',text,at:Date.now()}]){
    f.saved.hq_bookmark_evidence_v1={[key]:entry};
    assert.equal((await f.ctx.sort({id:'one',url,parentId:'1'})).outcome,'needs-evidence');
    assert.equal(moves,0);
  }
  f.saved.hq_bookmark_evidence_v1={[key]:{schema:2,resourceKey:key,text,at:Date.now()}};
  assert.equal((await f.ctx.sort({id:'one',url,parentId:'1'})).outcome,'sorted');assert.equal(moves,1);
  assert.equal(f.requests.length,0);
});
