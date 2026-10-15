import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=n=>fs.readFileSync(new URL('../js/'+n+'.js',import.meta.url),'utf8');
function fixture(){const data={};let requests=0;const chrome={storage:{local:{async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]]));},async set(v){Object.assign(data,v);}}}};const context=vm.createContext({chrome,URL,navigator,console,Date,Map,Set,TextDecoder,AbortController,setTimeout,clearTimeout,fetch:async()=>{requests++;return new Response(JSON.stringify({title:'Every Chess Tip - Explained in stages',provider_name:'YouTube'}),{headers:{'content-type':'application/json'}});}});vm.runInContext(source('classifier')+'\n'+source('bookmarks'),context);return {context,data,book:vm.runInContext('Bookmarks',context),classifier:vm.runInContext('Classifier',context),requests:()=>requests};}
test('real smoke-test title patterns classify by subject despite generic guide words and stale folders',()=>{
 const {classifier:c}=fixture();
 const cases=[['Marvel Rivals Ultimate Beginners Guide How To Have The Perfect Aim',['Gaming & Roblox Dev','Gaming']],['How to LEARN any LANGUAGE in a single DAY. Secret learning techniques',['School & Academics','Languages']],['Every Chess Tip - Explained! (in stages) - YouTube',['Gaming & Roblox Dev','Chess']],['Sahiba - Easy Piano Tutorial with Notes & Chords',['Entertainment','Music']],['Air walk made easy #funk #remix #tutorial',['Entertainment','Music']]];
 for(const [title,path] of cases){const r=c.classify({title,url:'https://youtube.com/watch?v=test',sourcePath:['Reading & Articles','Saved Reading']},{},[]);assert.deepEqual(Array.from(r.path),path,title);assert.equal(r.confidence,'high',title);}
 assert.deepEqual(Array.from(c.classify({title:'Getting started | Jules',url:'https://jules.google/docs/getting-started'},{},[]).path),['Coding & Dev','AI Tools']);
 assert.equal(c.classify({title:'Watch this',url:'https://youtube.com/watch?v=unknown'},{},[]).path,null);
 assert.equal(c.classify({title:'Physics React',url:'https://example.org'},{},[]).path,null);
});
test('successful page metadata is cached and avoids repeated provider calls',async()=>{const f=fixture();const one=await f.book.fetchPageContext('https://youtube.com/watch?v=known');assert(one.includes('Chess'));const two=await f.book.fetchPageContext('https://youtube.com/watch?v=known');assert.equal(one,two);assert.equal(f.requests(),1);});
test('page evidence stops reading an oversized response at its byte budget',async()=>{const f=fixture();let cancelled=false;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(64000).fill(65));},cancel(){cancelled=true;}});const text=await f.book.boundedPageText(new Response(stream));assert.equal(text.length,128000);assert(cancelled);});
test('page permission request starts synchronously before sort storage or network work',async()=>{const f=fixture();let asked=false;f.context.chrome.permissions={request(){asked=true;return Promise.resolve(false);}};const pending=f.book.ensureContentPermission();assert(asked);assert.equal(await pending,false);});
