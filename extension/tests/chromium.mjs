// Native Chromium extension tests. All mutations are confined to a temporary profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve(import.meta.dirname,'..');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'hq-chromium-'));
const output=path.join(root,'test-results');await fs.mkdir(output,{recursive:true});
const results=[],errors=[],consoleErrors=[],network=[];
let context;
async function check(name,run){const start=Date.now();try{const details=await run();results.push({name,passed:true,milliseconds:Date.now()-start,details});console.log('✓ '+name);}catch(error){results.push({name,passed:false,error:String(error.stack||error)});throw error;}}
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:960},args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--no-sandbox']});
 context.setDefaultTimeout(12000);
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).host,base=`chrome-extension://${extensionId}/`;
 await worker.evaluate(()=>chrome.storage.local.set({hq_boot_sequence_v1:'off',hq_weather_auto_location:false,hq_wallpaper_interval_value:1,hq_wallpaper_interval_unit:'day'}));
 context.on('page',p=>{p.on('pageerror',e=>errors.push({page:p.url(),message:e.message}));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});});
 await context.route(/^https?:\/\//,route=>{network.push(route.request().url());return route.abort();});
 const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(base+'newtab.html');await page.waitForFunction(()=>document.body.classList.contains('app-ready'));
 await check('Native service worker boots without startup errors',async()=>{
   const issues=await worker.evaluate(()=>chrome.storage.local.get('hq_background_diagnostics_v1'));
   assert.equal((await page.evaluate(()=>BootDiagnostics.issues)).length,0);
   return {extensionId,backgroundDiagnostics:issues};
 });
 await check('Ordinary new tabs do not load the Operation HQ workspace',async()=>{
   const manifest=await worker.evaluate(()=>chrome.runtime.getManifest());assert.equal(manifest.chrome_url_overrides,undefined);
   const blank=await context.newPage();await blank.goto('chrome://newtab/');
   assert(!blank.url().startsWith(base));assert.equal(await blank.locator('script[src*="newtab.js"]').count(),0);await blank.close();
 });
 await check('Popup tool clicks reuse one workspace under concurrent requests',async()=>{
   const popup=await context.newPage();await popup.goto(base+'popup.html');await popup.locator('[data-tool="bookmarks"]').click();
   await page.waitForFunction(()=>document.getElementById('bookmarks-flyout').classList.contains('open'));
   await popup.evaluate(()=>Promise.all(['notes','calendar','bookmarks'].map(tool=>DashboardBridge.openTool(tool))));
   const workspaces=await popup.evaluate(async()=> (await chrome.tabs.query({})).filter(t=>t.url?.split('#')[0]===chrome.runtime.getURL('newtab.html')));
   assert.equal(workspaces.length,1);assert(workspaces[0].url.endsWith('#tool=bookmarks'));await page.waitForFunction(()=>location.hash==='#tool=bookmarks'&&document.getElementById('bookmarks-flyout').classList.contains('open'));await popup.close();
 });
 const panels=await page.evaluate(()=>[...document.querySelectorAll('.flyout[id]')].map(e=>e.id));
 await check('All packaged flyouts open and have reachable close buttons',async()=>{
   for(const id of panels){console.log('Opening panel '+id);
     await page.evaluate(()=>HQPanels.close());
     assert.equal(await page.evaluate(id=>HQPanels.open(id),id),true,'Panel failed: '+id);
     const panel=page.locator('#'+id);await panel.waitFor({state:'visible'});
     const close=panel.locator('.flyout-close');assert.equal(await close.count(),1,'Close count: '+id);
     const [p,c]=await Promise.all([panel.boundingBox(),close.boundingBox()]);
     assert(c&&p&&c.x>=p.x-1&&c.y>=p.y-1&&c.x+c.width<=p.x+p.width+1&&c.y+c.height<=p.y+p.height+1,'Close outside panel: '+id+' '+JSON.stringify({p,c}));
     await close.click();assert.equal(await panel.getAttribute('aria-hidden'),'true','Close inactive: '+id);
   }
   assert.deepEqual(await page.evaluate(()=>BootDiagnostics.issues),[]);
   return {panelCount:panels.length};
 });
 await check('Settings and safe-mode exit remain usable',async()=>{
   await page.locator('#settings-btn').click();await page.waitForFunction(()=>!document.getElementById('settings-drawer').classList.contains('hidden'));
   await page.locator('#close-settings').click();
   await page.evaluate(()=>localStorage.setItem('hq_safe_mode_v1','true'));await page.reload();
   await page.waitForFunction(()=>document.body.classList.contains('app-ready'));assert(await page.locator('#safe-mode-exit').isVisible());
   await page.locator('#safe-mode-exit').click();await page.waitForFunction(()=>document.body.classList.contains('app-ready')&&!document.body.classList.contains('safe-mode'));
 });
 await check('Unknown commands respond; maths chapter lists stay exact and await confirmation',async()=>{
   await page.evaluate(()=>HQPanels.open('nexus-flyout'));
   await page.locator('#nexus-command-input').fill('zxq unsupported command');await page.locator('#nexus-command-run').click();
   await page.waitForFunction(()=>/not|could|try|understand|unknown|match|suggest/i.test(document.getElementById('nexus-result').textContent));
   await page.locator('#nexus-command-input').fill('Today I am going to grind math chapters 5, 7, 8 and 10');await page.locator('#nexus-command-run').click();
   await page.waitForFunction(()=>!document.getElementById('nexus-followup').hidden||!document.getElementById('nexus-plan-preview').hidden);
   const parsed=await page.evaluate(()=>HQCommandEngine.parse('Today I am going to grind math chapters 5, 7, 8 and 10'));
   assert.deepEqual(parsed.chapters.values,[5,7,8,10]);assert.equal(parsed.intent,'focus-plan');
   const tasks=await page.evaluate(async()=> (await chrome.storage.local.get('hq_tasks')).hq_tasks||[]);
   assert.equal(tasks.length,0,'Unconfirmed maths plan wrote tasks');
   return {chapters:parsed.chapters.values,deadline:parsed.deadline?.key};
 });
 await check('Notes save once and survive reload without triplication',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('notes-flyout'));
   const rich=page.locator('#notes-editor-container [contenteditable="true"]');
   if(await rich.count())await rich.fill('Maths practice\nChapter five');else await page.locator('#notes-area-fallback').fill('Maths practice\nChapter five');
   await page.waitForFunction(async()=> (await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2?.plain.includes('Chapter five'));
   const before=await page.evaluate(async()=> (await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2.plain);
   await page.reload();await page.waitForFunction(()=>document.body.classList.contains('app-ready'));await page.evaluate(()=>HQPanels.open('notes-flyout'));
   const after=await page.evaluate(async()=> (await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2.plain);
   assert.equal(after,before);assert.equal((after.match(/Chapter five/g)||[]).length,1);
 });
 await check('Native bookmark move, managed cleanup and exact undo preserve user folders',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('bookmarks-flyout'));
   const receipt=await page.evaluate(async()=>{
     const tree=await chrome.bookmarks.getTree(),bar=tree[0].children.find(n=>n.id==='1')||tree[0].children[0];
     const user=await chrome.bookmarks.create({parentId:bar.id,title:'HQ TEST Personal'}),empty=await chrome.bookmarks.create({parentId:bar.id,title:'HQ TEST Keep Empty'}),target=await chrome.bookmarks.create({parentId:bar.id,title:'HQ TEST Target'});
     const siblings=[];for(const title of ['Alpha','Beta','Gamma'])siblings.push(await chrome.bookmarks.create({parentId:user.id,title,url:'https://example.org/'+title}));
     await Bookmarks.runExclusive('Native test',async()=>{const moves=[];await Bookmarks.moveAndRecord(siblings[1],target.id,[],bar.id,moves);await Bookmarks.moveAndRecord(siblings[0],target.id,[],bar.id,moves);await Bookmarks.commitTransaction('native-test',moves);await Bookmarks.cleanupManagedEmptyFolders(bar.id);});
     const moved=(await chrome.bookmarks.getChildren(target.id)).map(n=>n.title);await Bookmarks.undo();
     return {moved,restored:(await chrome.bookmarks.getChildren(user.id)).map(n=>n.title),empty:(await chrome.bookmarks.get(empty.id))[0].title};
   });
   assert.deepEqual(receipt.moved,['Beta','Alpha']);assert.deepEqual(receipt.restored,['Alpha','Beta','Gamma']);assert.equal(receipt.empty,'HQ TEST Keep Empty');
 });
 await check('Gmail connect handles cancelled OAuth visibly (token-provider stub)',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('gmail-flyout'));
   await page.evaluate(()=>{Gmail.getToken=async()=>{throw new Error('The user did not approve access.');};});
   await page.locator('#gmail-connect-btn').click();await page.waitForFunction(()=>document.getElementById('gmail-connection-dot').classList.contains('error'));
   assert.equal(await page.locator('#gmail-connect-btn').isEnabled(),true);
 });
 await check('Widgets have direct working routes and calendar works at narrow widths',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.locator('#widget-weather [data-open-panel]').first().click();
   assert(await page.locator('#weather-flyout').evaluate(e=>e.classList.contains('open')));await page.evaluate(()=>HQPanels.close());
   for(const width of [320,640,1280,1920]){
     await page.setViewportSize({width,height:960});await page.evaluate(()=>HQPanels.open('calendar-flyout'));
     const panel=page.locator('#calendar-flyout'),box=await panel.boundingBox();assert(box.x>=-1&&box.x+box.width<=width+1,'Calendar outside viewport '+width);
     const close=panel.locator('.flyout-close');await close.click();
     await page.screenshot({path:path.join(output,`workspace-${width}.png`)});
   }
 });
 await check('Heavy AI stays unloaded and measured DOM/JS heap remain bounded',async()=>{
   assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/webllm-loader|webllm-bundle/.test(r.name))),false);
   const session=await context.newCDPSession(page);await session.send('Performance.enable');const metrics=await session.send('Performance.getMetrics');
   const heap=metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,dom=await page.locator('*').count();
   assert(heap<128*1024*1024,'JS heap exceeded test budget');assert(dom<20000,'DOM exceeded test budget');
   return {jsHeapUsedBytes:heap,domElements:dom,note:'JS heap only. Not renderer RSS, GPU memory, or a measured 300 MB Mac limit.'};
 });
 await check('No uncaught browser errors across tested journeys',async()=>{assert.deepEqual(errors,[]);return {consoleErrors};});
}catch(error){console.error(error);process.exitCode=1;if(context){for(const p of context.pages().filter(p=>p.url().includes('newtab.html'))){await p.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});const diagnostics=await p.evaluate(()=>({issues:typeof BootDiagnostics==='undefined'?[]:BootDiagnostics.issues,early:window.HQEarlyDiagnostics?.entries()})).catch(()=>null);console.log('Failure diagnostics',JSON.stringify(diagnostics));console.log('Failure panel states',JSON.stringify(await p.evaluate(()=>({hash:location.hash,panels:[...document.querySelectorAll('.flyout.open')].map(e=>({id:e.id,visible:getComputedStyle(e).visibility})),errors:window.HQEarlyDiagnostics?.entries()})).catch(()=>null)));await fs.writeFile(path.join(output,'diagnostics.json'),JSON.stringify(diagnostics,null,2));}}}
finally{await fs.writeFile(path.join(output,'chromium-results.json'),JSON.stringify({timestamp:new Date().toISOString(),results,errors,consoleErrors,network,providerTests:'External HTTP blocked; Gmail cancellation token stub. No live account or local model download.'},null,2));await context?.close();await fs.rm(profile,{recursive:true,force:true});}
