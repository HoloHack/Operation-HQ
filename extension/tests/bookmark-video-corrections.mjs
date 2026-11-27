import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({URL,console});
vm.runInContext(fs.readFileSync(new URL('../js/classifier.js',import.meta.url),'utf8'),context);
const c=vm.runInContext('Classifier',context);
const maths=['School & Academics','Mathematics'],music=['Entertainment','Music'];
const id='opaque_VIDEO-27';
const bookmark=url=>({title:'Saved resource',url});
const urls=[`https://www.youtube.com/watch?v=${id}`,`https://youtu.be/${id}`,`https://youtube.com/shorts/${id}`,`http://m.youtube.com/embed/${id}`,`https://youtube.com/live/${id}/`];
const classify=(url,learned)=>c.classify(bookmark(url),learned,[]);

test('whole-video corrections work across each supported URL form without rewriting fingerprints',()=>{
  for(const source of urls)for(const target of urls){
    const result=classify(target,{[c.fingerprint(bookmark(source))]:maths});
    assert.equal(result.confidence,'high',`${source} -> ${target}`);
    assert.deepEqual(Array.from(result.path),maths);
    assert.match(result.source,/^learned-(exact|video-alias)$/);
  }
  assert.equal(c.fingerprint(bookmark(urls[0])),`youtube.com/watch?v=${id}`);
  assert.equal(c.fingerprint(bookmark(urls[1])),`youtu.be/${id}`);
  assert.equal(c.fingerprint(bookmark(urls[2])),`page:https://youtube.com/shorts/${id}`);
});

test('known tracking is harmless but segmentation and playlist inputs do not borrow alias rules',()=>{
  const learned={[c.fingerprint(bookmark(urls[0]))]:maths};
  for(const suffix of ['?utm_source=share','?fbclid=abc&gclid=def'])assert.equal(classify(urls[2]+suffix,learned).source,'learned-video-alias');
  for(const suffix of ['?t=20','?start=20','?end=40','?list=playlist','?index=2','?clip=segment','?unknown=value','#t=20'])assert.notEqual(classify(urls[2]+suffix,learned).source,'learned-video-alias');
  for(const suffix of ['?t=20','?list=playlist','?index=2']){
    const exact=c.fingerprint(bookmark(urls[2]+suffix));
    assert.equal(classify(urls[2]+suffix,{[exact]:music,...learned}).source,'learned-exact');
    assert.deepEqual(Array.from(classify(urls[2]+suffix,{[exact]:music,...learned}).path),music);
  }
});

test('different IDs, invalid hosts/routes and opaque query identifiers cannot inherit watch corrections',()=>{
  const learned={[c.fingerprint(bookmark(urls[0]))]:maths};
  for(const url of [
    `https://youtu.be/other_VIDEO`,
    `https://evil.youtube.com/watch?v=${id}`,
    `https://youtube.com/playlist?v=${id}`,
    `https://youtube.com/results?v=${id}`,
    `https://youtube.com/shorts/${id}/extra`,
    `https://youtu.be/${id}/extra`,
    `https://youtube.com/watch?v=${id}&v=other`,
    `https://youtube.com/shorts/${id}?v=other`,
    `https://youtube.com.evil.example/watch?v=${id}`,
    `https://example.org/?v=${id}`,
  ])assert(!['learned-exact','learned-video-alias'].includes(classify(url,learned).source),url);
  for(const value of ['%2Fvideo','%20','a.b',''])assert.equal(c.youtubeCorrectionAliases(bookmark('https://youtu.be/'+value)).length,0);
});

test('non-web schemes, credentials, nondefault ports and extra short-link paths cannot become video authority',()=>{
  const learned={[c.fingerprint(bookmark(urls[0]))]:maths,[c.fingerprint(bookmark(urls[1]))]:maths};
  const invalid=[`ftp://youtube.com/watch?v=${id}`,`https://user:pass@youtube.com/watch?v=${id}`,`https://youtube.com:444/watch?v=${id}`,`https://youtube.com:444/shorts/${id}`,`https://youtu.be/${id}/extra`,`ftp://youtu.be/${id}`,`https://user:pass@youtu.be/${id}`,`https://youtu.be:444/${id}`];
  for(const url of invalid){assert.equal(c.youtubeCorrectionAliases(bookmark(url)).length,0,url);assert(!['learned-exact','learned-video-alias'].includes(classify(url,learned).source),url);}
  for(const url of [`https://youtube.com:443/watch?v=${id}`,`http://youtu.be:80/${id}`,`https://youtube.com:443/shorts/${id}`]){assert.equal(classify(url,learned).confidence,'high',url);assert.deepEqual(Array.from(classify(url,learned).path),maths);}
});

test('conflicting valid historical alias corrections hold rather than fall back to topic keywords',()=>{
  const learned={[c.fingerprint(bookmark(urls[0]))]:maths,[c.fingerprint(bookmark(urls[1]))]:music};
  const result=c.classify({title:'Calculus mathematics exercises',url:urls[2]},learned,[]);
  assert.equal(result.path,null);assert.equal(result.confidence,'needs-decision');assert.equal(result.source,'learned-alias-conflict');assert.match(result.reasons[0],/disagree/);
  const invalid={...learned,[c.fingerprint(bookmark(urls[1]))]:['Inbox']};
  assert.equal(classify(urls[2],invalid).source,'learned-video-alias');
});

test('an existing exact correction remains authoritative despite disagreeing alias corrections',()=>{
  const learned={[c.fingerprint(bookmark(urls[0]))]:maths,[c.fingerprint(bookmark(urls[1]))]:music};
  assert.equal(classify(urls[0],learned).source,'learned-exact');assert.deepEqual(Array.from(classify(urls[0],learned).path),maths);
  assert.equal(classify(urls[1],learned).source,'learned-exact');assert.deepEqual(Array.from(classify(urls[1],learned).path),music);
});

test('alias lookup is finite and never scans private learned-map entries',()=>{
  const original=Object.freeze({[c.fingerprint(bookmark(urls[0]))]:Object.freeze([...maths])});
  const snapshot=JSON.stringify(original),map=new Proxy(original,{ownKeys(){throw Error('Do not scan corrections');}});
  const before=urls[2];assert.equal(classify(before,map).source,'learned-video-alias');assert.equal(urls[2],before);assert.equal(JSON.stringify(original),snapshot);assert(c.youtubeCorrectionAliases(bookmark(before)).length<=26);
});

test('actual automatic worker uses a verified alias correction and holds conflicting aliases',async()=>{
  const source=fs.readFileSync(new URL('../js/classifier.js',import.meta.url),'utf8');
  const background=fs.readFileSync(new URL('../js/background.js',import.meta.url),'utf8');
  const worker=background.slice(background.indexOf('async function sortAutomaticBookmark('),background.indexOf('const BookmarkAutomation='));
  for(const conflict of [false,true]){
    const item={id:'one',parentId:'1',title:'Saved resource',url:`https://youtube.com/shorts/${id}`},moves=[],held=[],folders=[];
    const learned={[c.fingerprint(bookmark(urls[0]))]:maths,...(conflict?{[c.fingerprint(bookmark(urls[1]))]:music}:{})};
    const ctx=vm.createContext({URL,Date,console,chrome:{bookmarks:{get:async()=>[structuredClone(item)]},storage:{local:{get:async()=>({hq_learned_domains:learned})}}},getBarId:async()=>'1',bookmarkFolderPath:async()=>[],scanLegitFolders:async()=>[],markBookmarkDecision:async(_bookmark,result)=>held.push(result),getOrCreateFolderPath:async path=>{folders.push(Array.from(path));return 'target';},moveSelf:async(...args)=>moves.push(args),clearBookmarkDecision:async()=>{}});
    vm.runInContext(source+'\n'+worker+'\nthis.sort=sortAutomaticBookmark;',ctx);
    const result=await ctx.sort({id:'one',url:item.url,parentId:'1'});
    if(conflict){assert.equal(result.outcome,'needs-evidence');assert.equal(moves.length,0);assert.equal(folders.length,0);assert.equal(held[0].source,'learned-alias-conflict');}
    else{assert.equal(result.outcome,'sorted');assert.equal(moves.length,1);assert.deepEqual(folders,[maths]);assert.deepEqual(moves[0][2],item);assert.equal(held.length,0);}
  }
});
