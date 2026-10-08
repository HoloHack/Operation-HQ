import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..');
const repo=path.resolve(root,'..');
const {chromium}=createRequire(path.join(repo,'extension/package.json'))('playwright');
const fixture=path.join(root,'test-results/browser-fixture'),out=path.join(root,'test-results/browser');await fs.mkdir(out,{recursive:true});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'hq-dashboard-ci-'));
const origin='https://operation-hq-command-center.shour-ya11.chatgpt.site';
const empty=()=>({schemaVersion:1,tasks:[],events:[],notes:{plain:'Existing dashboard notes',updatedAt:1},schedule:[],assignments:[],exams:[],habits:[],captures:[],settings:{accentHue:100,supportHue:150,motion:'balanced',density:'balanced',updatedAt:5},focus:{mission:'Keep my focus',minutes:25,chapters:[],updatedAt:5}});
const state={snapshot:empty(),revision:1};let offline=false,writes=0;const results=[],errors=[];let context;
async function check(name,run){try{const details=await run();results.push({name,passed:true,details});console.log('✓ '+name+' '+JSON.stringify(details||{}));}catch(error){results.push({name,passed:false,error:String(error.stack||error)});throw error;}}
async function poll(run,accept){const end=Date.now()+15000;while(Date.now()<end){const value=await run();if(accept(value))return value;await new Promise(r=>setTimeout(r,40));}throw Error('Expected state not reached');}
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:960},args:[`--disable-extensions-except=${path.join(repo,'extension')}`,`--load-extension=${path.join(repo,'extension')}`,'--no-sandbox']});context.setDefaultTimeout(15000);
 context.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());});
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const extensionId=new URL(worker.url()).host,extensionBase=`chrome-extension://${extensionId}/`;
 await worker.evaluate(()=>chrome.storage.local.set({hq_boot_sequence_v1:'off',hq_weather_auto_location:false,hq_tasks:[{id:'math-ch5',text:'Maths chapter 5',priority:'high',done:false,created:2,estMinutes:45}],hq_calendar_events:{'2026-10-12':['Maths deadline']},hq_notes_document_v2:{version:2,plain:'Browser notes',updatedAt:2}}));
 await context.route(/^https?:\/\//,async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  if(url.pathname==='/api/state'){
   if(offline)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Offline test fixture'})});
   if(route.request().method()==='PUT'){const body=route.request().postDataJSON();if(body.baseRevision!==state.revision)return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({...state,accountId:'ci-user'})});state.snapshot=body.snapshot;state.revision++;writes++;}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...state,accountId:'ci-user'})});
  }
  if(url.pathname==='/__hq_prepare')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Isolated recovery fixture</title>'});
  const relative=url.pathname.startsWith('/assets/')?url.pathname.slice(1):'index.html';const file=path.join(fixture,relative);
  if(!file.startsWith(fixture+path.sep))return route.abort();
  try{return route.fulfill({status:200,contentType:relative.endsWith('.js')?'application/javascript':relative.endsWith('.css')?'text/css':'text/html',body:await fs.readFile(file)});}catch{return route.fulfill({status:404,body:'Fixture resource not found'});}
 });
 const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});await page.goto(origin+'/__hq_prepare');
 await page.evaluate(async(snapshot)=>{await new Promise((resolve,reject)=>{const request=indexedDB.open('operation-hq-local-drafts-v1',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('drafts',{keyPath:'id'});store.createIndex('accountId','accountId');};request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({id:'legacy-copy',accountId:'legacy-user',savedAt:1,checkpoint:{version:1,state:snapshot,baseline:snapshot,revision:0,conflict:null}});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};});},empty());
 await page.goto(origin+'/__hq_ci');await page.getByText('Saved',{exact:true}).waitFor();
 const openImport=async()=>{await page.getByRole('button',{name:'Import from extension',exact:true}).click();await page.getByRole('button',{name:'Read preview from extension',exact:true}).click();};
 const popup=await context.newPage();await popup.goto(extensionBase+'popup.html');
 await check('Disabled bridge reports its actual reason and cannot import',async()=>{
  await openImport();await page.getByRole('dialog').getByText(/Enable dashboard access in the extension popup/).waitFor();assert.equal(await page.getByRole('button',{name:'Import into my account'}).count(),0);assert.equal(writes,0);await page.getByRole('button',{name:'Close import'}).click();
 });
 await popup.locator('#bridge-enabled').check();await poll(()=>worker.evaluate(()=>chrome.storage.local.get('hq_dashboard_bridge_enabled_v1')),v=>v.hq_dashboard_bridge_enabled_v1===true);
 await check('Actual extension preview waits for approval and preserves dashboard preferences',async()=>{
  await openImport();await page.getByLabel('Browser notes preview').waitFor();assert.equal(await page.getByRole('button',{name:'Import into my account'}).isEnabled(),false);assert.equal(writes,0);
  await page.getByLabel('Keep both versions',{exact:true}).check();await page.getByLabel(/This is my browser profile/).check();await page.getByRole('button',{name:'Import into my account'}).click();
  await poll(()=>state.snapshot.tasks.length,v=>v===1);assert.equal(state.snapshot.tasks[0].id,'browser:math-ch5');assert.equal(state.snapshot.events.length,1);assert.equal(state.snapshot.settings.accentHue,100);assert.equal(state.snapshot.focus.mission,'Keep my focus');assert.equal(state.snapshot.notes.plain,'Existing dashboard notes\n\n--- Browser notes ---\n\nBrowser notes');
 });
 await check('Re-import cannot duplicate tasks, calendar entries or appended notes',async()=>{
  const notes=state.snapshot.notes.plain;await openImport();await page.getByLabel('Browser notes preview').waitFor();await page.getByLabel('Keep both versions',{exact:true}).check();await page.getByLabel(/This is my browser profile/).check();await page.getByRole('button',{name:'Import into my account'}).click();await page.getByText('Saved',{exact:true}).waitFor();assert.equal(state.snapshot.tasks.length,1);assert.equal(state.snapshot.events.length,1);assert.equal(state.snapshot.notes.plain,notes);
 });
 await check('Failed refresh clears an older preview and Settings cannot stack dialogs',async()=>{
  await page.getByRole('button',{name:'Open settings'}).click();await page.getByRole('button',{name:'Review browser import'}).click();assert.equal(await page.getByRole('dialog').count(),1);await page.getByRole('button',{name:'Read preview from extension'}).click();await page.getByLabel('Browser notes preview').waitFor();await popup.locator('#bridge-enabled').uncheck();await poll(()=>worker.evaluate(()=>chrome.storage.local.get('hq_dashboard_bridge_enabled_v1')),v=>v.hq_dashboard_bridge_enabled_v1===false);await page.getByRole('button',{name:'Read preview from extension'}).click();await page.getByRole('dialog').getByText(/Enable dashboard access in the extension popup/).waitFor();assert.equal(await page.getByRole('button',{name:'Import into my account'}).count(),0);await page.getByRole('button',{name:'Close import'}).click();
 });
 await popup.locator('#bridge-enabled').check();await poll(()=>worker.evaluate(()=>chrome.storage.local.get('hq_dashboard_bridge_enabled_v1')),v=>v.hq_dashboard_bridge_enabled_v1===true);
 await check('Browser tools button opens the real allowed Nexus tool',async()=>{
  await page.getByRole('button',{name:'Browser tools',exact:true}).click();await poll(()=>worker.evaluate(async()=> (await chrome.tabs.query({})).map(t=>t.url)),urls=>urls.some(url=>url?.endsWith('newtab.html#tool=nexus')));await page.bringToFront();
 });
 await check('Offline notes survive real IndexedDB storage and reload before cloud recovery',async()=>{
  offline=true;await page.locator('.rail').getByRole('button',{name:'Notes',exact:true}).click();const note='  Offline maths work\nChapter 7 — keep this once.  ';await page.getByLabel('Notes document',{exact:true}).fill(note);await page.getByText('Unsaved work has a recovery copy on this device.',{exact:true}).waitFor();
  await page.reload();await page.getByText('Offline test fixture',{exact:true}).waitFor();await page.locator('.rail').getByRole('button',{name:'Notes',exact:true}).click();assert.equal(await page.getByLabel('Notes document',{exact:true}).inputValue(),note);assert.notEqual(state.snapshot.notes.plain,note);
  offline=false;await page.reload();await poll(()=>state.snapshot.notes.plain,v=>v===note);await page.getByText('Saved',{exact:true}).waitFor();return {restoredExactText:true};
 });
 await check('Device journals isolate accounts and duplicate tabs reserve independent copies',async()=>{
  const result=await page.evaluate(async()=>{
   const {DraftJournal,claimDraftTab}=window.HQTest;const snapshot={schemaVersion:1,tasks:[],events:[],notes:{plain:'fixture',updatedAt:1},schedule:[],assignments:[],exams:[],habits:[],captures:[],settings:{accentHue:100,supportHue:150,motion:'balanced',density:'balanced',updatedAt:5},focus:{mission:'',minutes:25,chapters:[],updatedAt:0}};
   const checkpoint={version:1,state:snapshot,baseline:snapshot,revision:0,conflict:null};const a=new DraftJournal('alice','one'),b=new DraftJournal('bob','one'),a2=new DraftJournal('alice','two');await a.write(checkpoint);await b.write(checkpoint);await a2.write(checkpoint);const own=await a.list(),other=await b.list();let rejected=false;try{await a.remove(other[0]);}catch{rejected=true;}
   const previous=sessionStorage.getItem('hq-draft-tab-id-v1');const claimed=await claimDraftTab('ci-user');const independent=claimed.tabId!==previous;claimed.release();sessionStorage.setItem('hq-draft-tab-id-v1',previous);return {alice:own.length,bob:other.length,rejected,independent};
  });assert.deepEqual(result,{alice:2,bob:1,rejected:true,independent:true});return result;
 });
 await check('Recovery summaries paginate without loading documents and version-1 copies remain readable',async()=>{
  const result=await page.evaluate(async()=>{
   const {DraftJournal}=window.HQTest;const legacy=new DraftJournal('legacy-user','other'),old=await legacy.list(),oldCopy=await legacy.read(old[0]);
   const checkpoint={version:1,state:oldCopy.state,baseline:oldCopy.baseline,revision:0,conflict:null};
   for(let i=0;i<25;i++)await new DraftJournal('paged-user',String(i)).write(checkpoint);
   const journal=new DraftJournal('paged-user','reader'),first=await journal.list(),second=await journal.list(first.at(-1));
   const loaded=await journal.read(second[0]);return {first:first.length,second:second.length,unique:new Set([...first,...second].map(r=>r.id)).size,summariesOnly:[...first,...second].every(r=>!('checkpoint' in r)),legacyNotes:oldCopy.state.notes.plain,selectedNotes:loaded.state.notes.plain};
  });assert.deepEqual(result,{first:20,second:5,unique:25,summariesOnly:true,legacyNotes:'Existing dashboard notes',selectedNotes:'Existing dashboard notes'});return result;
 });
 await check('Recovered notes conflict exposes both versions and saves only after choice',async()=>{
  offline=true;await page.locator('.rail').getByRole('button',{name:'Notes',exact:true}).click();await page.getByLabel('Notes document',{exact:true}).fill('My offline edit');await page.getByText('Unsaved work has a recovery copy on this device.',{exact:true}).waitFor();state.snapshot={...state.snapshot,notes:{plain:'Changed in another window',updatedAt:Date.now()+1000}};state.revision++;offline=false;await page.reload();await page.getByText('Review conflict',{exact:true}).waitFor();await page.locator('.rail').getByRole('button',{name:'Notes',exact:true}).click();assert.equal(await page.getByLabel('Notes document',{exact:true}).inputValue(),'My offline edit');assert.equal(await page.getByLabel('Saved elsewhere',{exact:true}).inputValue(),'Changed in another window');await page.getByRole('button',{name:'Keep both',exact:true}).click();await poll(()=>state.snapshot.notes.plain,v=>v==='My offline edit\n\n--- Other version ---\n\nChanged in another window');await page.getByRole('button',{name:'Close panel'}).click();
 });
 await check('Panels and import close buttons fit narrow screens; keyboard Escape restores Cinema',async()=>{
  for(const width of [320,640,1440,1920]){await page.setViewportSize({width,height:960});await page.getByRole('button',{name:'Open settings'}).click();const panel=page.getByRole('dialog'),close=page.getByRole('button',{name:'Close panel'});const p=await panel.boundingBox(),c=await close.boundingBox();assert(p.x>=-1&&p.x+p.width<=width+1);assert(c.x>=p.x&&c.x+c.width<=p.x+p.width+1);await close.click();await page.screenshot({path:path.join(out,`dashboard-${width}.png`)});}
  await page.getByRole('button',{name:'Hide the interface'}).click();assert(await page.getByRole('button',{name:'Restore dashboard'}).isVisible());await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Restore dashboard'}).count(),0);
 });
 await check('Generated colour choices wait for approval and transition layers clean up',async()=>{
  await page.setViewportSize({width:1440,height:960});await page.emulateMedia({reducedMotion:'no-preference'});const old=state.snapshot.settings.accentHue;await page.locator('#nexus-command').fill('theme for HSIE study');await page.locator('.nexus button[type="submit"]').click();await page.locator('.theme-options button').first().waitFor();assert.equal(await page.locator('.theme-options button').count(),3);assert.equal(state.snapshot.settings.accentHue,old);await page.locator('.theme-options button').first().click();await page.locator('.theme-transition').waitFor();await page.waitForFunction(()=>!document.querySelector('.theme-transition'));return {choices:3};
 });
 await check('No uncaught errors in real dashboard and bridge journeys',async()=>{assert.deepEqual(errors,[]);return {productionAccountWrites:0,backend:'isolated API fixture; real server covered by SQLite regression tests'};});
}catch(error){console.error(error);process.exitCode=1;if(context){for(const p of context.pages().filter(p=>p.url().startsWith(origin))){await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.log('UI failure text',await p.locator('body').innerText().catch(()=>''));}}}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify({results,errors,limitations:'Actual product component + real extension/IndexedDB/WebLocks. Cloud API and account are isolated fixtures; no live provider login or Mac RAM measurement.'},null,2));await context?.close();await fs.rm(profile,{recursive:true,force:true});}
