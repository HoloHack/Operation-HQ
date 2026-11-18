// Native Chromium extension tests. All mutations are confined to a temporary profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {profileMemory} from './process-memory.mjs';
const root=path.resolve(import.meta.dirname,'..');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'hq-chromium-'));
const output=path.join(root,'test-results');await fs.mkdir(output,{recursive:true});
const results=[],errors=[],consoleErrors=[],network=[];
let context;
async function waitForSaved(read,accept){const end=Date.now()+12000;while(Date.now()<end){const value=await read();if(accept(value))return value;await new Promise(r=>setTimeout(r,50));}throw new Error("Saved data did not reach the expected state.");}
async function check(name,run){const start=Date.now();try{const details=await run();results.push({name,passed:true,milliseconds:Date.now()-start,details});console.log('✓ '+name+(details?' '+JSON.stringify(details):''));}catch(error){results.push({name,passed:false,error:String(error.stack||error)});throw error;}}
try{
 context=await chromium.launchPersistentContext(profile,{channel:'chromium',...(process.env.HQ_CHROMIUM_EXECUTABLE?{executablePath:process.env.HQ_CHROMIUM_EXECUTABLE}:{}),headless:true,viewport:{width:1440,height:960},args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--no-sandbox']});
 context.setDefaultTimeout(12000);
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const extensionId=new URL(worker.url()).host,base=`chrome-extension://${extensionId}/`;
 await worker.evaluate(()=>chrome.storage.local.set({hq_boot_sequence_v1:'off',hq_weather_auto_location:false,hq_wallpaper_interval_value:1,hq_wallpaper_interval_unit:'day'}));
 context.on('page',p=>{p.on('pageerror',e=>errors.push({page:p.url(),message:e.message}));p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});});
 await context.route(/^https?:\/\//,route=>{network.push(route.request().url());return route.abort();});
 const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto(base+'newtab.html');await page.waitForFunction(()=>document.body?.classList.contains('app-ready'));
 await check('Clean browser process memory is measured',async()=>{const memory=await profileMemory(profile);assert(memory.available);await fs.writeFile(path.join(output,'memory-clean.json'),JSON.stringify(memory,null,2));return memory;});
 await check('Native service worker boots without startup errors',async()=>{
   const issues=await worker.evaluate(()=>chrome.storage.local.get('hq_background_errors'));
   assert.equal((await page.evaluate(()=>BootDiagnostics.issues)).length,0);assert.deepEqual(issues.hq_background_errors||[],[]);
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
   assert.equal(workspaces.length,1);assert.equal(new URLSearchParams(new URL(workspaces[0].url).hash.slice(1)).get('tool'),'bookmarks');await page.waitForFunction(()=>new URLSearchParams(location.hash.slice(1)).get('tool')==='bookmarks'&&document.getElementById('bookmarks-flyout').classList.contains('open'));await page.locator('#bookmarks-flyout .flyout-close').click();await popup.evaluate(()=>DashboardBridge.openTool('bookmarks'));await page.waitForFunction(()=>document.getElementById('bookmarks-flyout').classList.contains('open'));await popup.close();
 });
 const panels=await page.evaluate(()=>[...document.querySelectorAll('.flyout[id]')].map(e=>e.id));
 await check('All packaged flyouts open and have reachable close buttons',async()=>{
   for(const width of [320,1440]){await page.setViewportSize({width,height:960});for(const id of panels){console.log('Opening panel '+id+' at '+width);
     await page.evaluate(()=>HQPanels.close());
     assert.equal(await page.evaluate(id=>HQPanels.open(id),id),true,'Panel failed: '+id);
     const panel=page.locator('#'+id);await panel.waitFor({state:'visible'});for(const field of await panel.locator('input[placeholder],textarea[placeholder]').all()){assert.equal(await field.evaluate(e=>getComputedStyle(e,'::placeholder').opacity),'1','Placeholder must remain legible in '+id);assert.match(await field.evaluate(e=>getComputedStyle(e,'::placeholder').color),/^rgb\(/);}for(const legend of await panel.locator('legend').all())assert.equal(await legend.evaluate(e=>getComputedStyle(e).color),await panel.evaluate(e=>getComputedStyle(e).color),'Legend must follow desk ink');
     const close=panel.locator('.flyout-close');assert.equal(await close.count(),1,'Close count: '+id);if(id==='gleam-flyout'&&width===320){const form=panel.locator('.gleam-onboarding');await page.screenshot({path:path.join(output,'gleam-calibration-narrow.png')});const overflow=await form.evaluate(e=>({scroll:e.scrollWidth,width:e.clientWidth,items:[...e.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>e.getBoundingClientRect().right+1).map(n=>({tag:n.tagName,id:n.id,class:n.className,w:n.getBoundingClientRect().width}))}));assert(overflow.scroll<=overflow.width+1,'Gleam calibration content overflows: '+JSON.stringify(overflow));const b=await form.boundingBox();assert(b.x>=0&&b.x+b.width<=width,'Gleam calibration extends beyond screen');}
     const [p,c]=await Promise.all([panel.boundingBox(),close.boundingBox()]);
     assert(c&&p&&c.x>=p.x-1&&c.y>=p.y-1&&c.x+c.width<=p.x+p.width+1&&c.y+c.height<=p.y+p.height+1,'Close outside panel: '+id+' '+JSON.stringify({p,c}));
     assert(p.x>=-1&&p.x+p.width<=width+1,'Panel outside viewport: '+id+' '+width);for(const surface of await panel.locator('.study-mission-preview,#srs-review-area,.gleam-onboarding,.nexus-cortex,.focus-theme-proposal,.focus-mission-console,.cal-surface,.cal-inspector,.notes-search-field,.local-ai-output,.nexus-ai-output').all()){assert.equal(await surface.evaluate(e=>getComputedStyle(e).backgroundImage),'none','Legacy gradient survived in '+id);assert.match(await surface.evaluate(e=>getComputedStyle(e).backgroundColor),/^rgb\(/,'Reading surface must be opaque in '+id);}await page.screenshot({path:path.join(output,`panel-${id}-${width}.png`)});await close.click();assert.equal(await panel.getAttribute('aria-hidden'),'true','Close inactive: '+id);
   }}
   assert.deepEqual(await page.evaluate(()=>BootDiagnostics.issues),[]);
   return {panelCount:panels.length};
 });
 await check('Hidden legacy task rows are not retained; all 2000 records remain usable',async()=>{
   const result=await page.evaluate(()=>{
     const original=Tasks.data;
     try { Tasks.data=Array.from({length:2000},(_,i)=>({id:'memory-task-'+i,text:'Memory task '+i,priority:'low',done:i%2===0,created:Date.now()}));Tasks.render();
       return {rows:document.querySelectorAll('#task-list .task-item').length,records:Tasks.data.length,open:Tasks.data.filter(t=>!t.done).length,label:document.getElementById('task-progress-label').textContent};
     } finally { Tasks.data=original;Tasks.render(); }
   });assert.deepEqual(result,{rows:0,records:2000,open:1000,label:'1000 / 2000 done'});return result;
 });
 await check('Charts release closed buffers and reopen from unchanged records',async()=>{
   const result=await page.evaluate(async()=>{
     await HQPanels.close();await HQPanels.open('stats-flyout');await WeeklyStats.render();
     const first=Boolean(WeeklyStats.chart)&&document.getElementById('weekly-stats-canvas').width>1;
     HQPanels.close();const released=WeeklyStats.chart===null&&document.getElementById('weekly-stats-canvas').width===1;
     await HQPanels.open('stats-flyout');await WeeklyStats.render();const reopened=Boolean(WeeklyStats.chart);
     const original={data:Tasks.data,ventures:Tasks.ventures,selected:VentureDashboard.selected,metrics:VentureDashboard.metrics};
     try { Tasks.ventures=['Memory fixture'];Tasks.data=[{id:'chart-task',text:'Retained task',venture:'Memory fixture',done:false}];VentureDashboard.selected='Memory fixture';VentureDashboard.metrics=[{id:'m1',venture:'Memory fixture',date:'2026-01-01',mrr:10},{id:'m2',venture:'Memory fixture',date:'2026-02-01',mrr:20}];
       await HQPanels.open('venture-dash-flyout');const ventureOpen=Boolean(VentureDashboard.chart&&VentureDashboard.metricsChart);
       HQPanels.close();VentureDashboard.render();const canvases=['weekly-stats-canvas','venture-dash-canvas','venture-metrics-canvas'].map(id=>({width:document.getElementById(id).width,height:document.getElementById(id).height}));
       return {first,released,reopened,ventureOpen,canvases,charts:Object.keys(Chart.instances).length,records:Tasks.data.length,metrics:VentureDashboard.metrics.length};
     } finally { HQPanels.close();Tasks.data=original.data;Tasks.ventures=original.ventures;VentureDashboard.selected=original.selected;VentureDashboard.metrics=original.metrics;VentureDashboard.render();Tasks.render(); }
   });assert(result.first&&result.released&&result.reopened&&result.ventureOpen);assert.equal(result.charts,0);assert(result.canvases.every(c=>c.width===1&&c.height===1));assert.equal(result.records,1);assert.equal(result.metrics,2);return result;
 });
 await check('Settings and safe-mode exit remain usable',async()=>{
   await page.locator('#desk-advanced').click();await page.waitForFunction(()=>!document.getElementById('settings-drawer').classList.contains('hidden'));
   await page.locator('#close-settings').click();
   await page.evaluate(()=>localStorage.setItem('hq_safe_mode_v1','true'));await page.reload();
   await page.waitForFunction(()=>document.body?.classList.contains('app-ready'));assert(await page.locator('#safe-mode-exit').isVisible());
   await page.locator('#safe-mode-exit').click();await page.waitForFunction(()=>document.body?.classList.contains('app-ready')&&!document.body?.classList.contains('safe-mode'));
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
   await waitForSaved(()=>page.evaluate(async()=> (await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2?.plain),value=>typeof value==='string'&&value.includes('Chapter five')); 
   const before=await page.evaluate(async()=> (await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2.plain);
   await page.reload();await page.waitForFunction(()=>document.body?.classList.contains('app-ready'));await page.evaluate(()=>HQPanels.open('notes-flyout'));
   const after=await page.evaluate(async()=> (await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2.plain);
   assert.equal(after,before);assert.equal((after.match(/Chapter five/g)||[]).length,1);return {plain:after};
 });
 await check('Native bookmark move, managed cleanup and exact undo preserve user folders',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('bookmarks-flyout'));
   const receipt=await page.evaluate(async()=>{
     const tree=await chrome.bookmarks.getTree(),bar=tree[0].children.find(n=>n.id==='1')||tree[0].children[0];
     const user=await chrome.bookmarks.create({parentId:bar.id,title:'HQ TEST Personal'}),empty=await chrome.bookmarks.create({parentId:bar.id,title:'HQ TEST Keep Empty'}),target=await chrome.bookmarks.create({parentId:bar.id,title:'HQ TEST Target'});
     const siblings=[];for(const title of ['Alpha','Beta','Gamma'])siblings.push(await chrome.bookmarks.create({parentId:user.id,title,url:'https://example.org/'+title}));
     let result;for(let attempt=0;attempt<40;attempt++){result=await Bookmarks.runExclusive('Native test',async()=>{const moves=[];await Bookmarks.moveAndRecord(siblings[1],target.id,[],bar.id,moves);await Bookmarks.moveAndRecord(siblings[0],target.id,[],bar.id,moves);await Bookmarks.commitTransaction('native-test',moves);await Bookmarks.cleanupManagedEmptyFolders(bar.id);return {moved:moves.length};});if(!result?.blocked)break;await new Promise(r=>setTimeout(r,50));}if(result?.error||result?.blocked)throw new Error('Native bookmark operation did not finish: '+document.getElementById('bookmark-log').textContent);
     const moved=(await chrome.bookmarks.getChildren(target.id)).map(n=>n.title);await Bookmarks.undo();
     return {moved,restored:(await chrome.bookmarks.getChildren(user.id)).map(n=>n.title),empty:(await chrome.bookmarks.get(empty.id))[0].title};
   });
   assert.deepEqual(receipt.moved,['Beta','Alpha']);assert.deepEqual(receipt.restored,['Alpha','Beta','Gamma']);assert.equal(receipt.empty,'HQ TEST Keep Empty');
 });
 await check('Native bookmark sorting follows topic, leaves ambiguity in place, and undoes exact moves',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('bookmarks-flyout'));
   const sorted=await page.evaluate(async()=>{
     await chrome.storage.local.set({hq_realtime_sort_enabled:false});
     const tree=await chrome.bookmarks.getTree(),bar=tree[0].children.find(n=>n.id==='1')||tree[0].children[0];
     const folder=await chrome.bookmarks.create({parentId:bar.id,title:'HQ TEST Sorting'});
     const maths=await chrome.bookmarks.create({parentId:folder.id,title:'Cambridge Maths chapter 5 quadratics',url:'https://youtube.com/watch?v=hq-maths'});
     const coding=await chrome.bookmarks.create({parentId:folder.id,title:'API reference',url:'https://docs.github.com/en/rest'});
     const ambiguous=await chrome.bookmarks.create({parentId:folder.id,title:'Watch this',url:'https://example.org/hq-ambiguous'});
     let result;for(let i=0;i<40;i++){result=await Bookmarks.runExclusive('Native topic sort',()=>Bookmarks.applySort(folder.id));if(!result?.blocked)break;await new Promise(r=>setTimeout(r,50));}
     if(result?.error||result?.blocked)throw new Error(document.getElementById('bookmark-log').textContent);
     const topic=async id=>{const b=(await chrome.bookmarks.get(id))[0];return Bookmarks.folderPath(b.parentId,bar.id);};
     const mathPath=await topic(maths.id),codingPath=await topic(coding.id),ambiguousParent=(await chrome.bookmarks.get(ambiguous.id))[0].parentId;
     await Bookmarks.undo();return {mathPath,codingPath,ambiguityPreserved:ambiguousParent===folder.id,restored:(await chrome.bookmarks.getChildren(folder.id)).map(n=>n.id),expected:[maths.id,coding.id,ambiguous.id]};
   });
   assert.deepEqual(sorted.mathPath,['School & Academics','Mathematics']);assert.deepEqual(sorted.codingPath,['Coding & Dev','Docs & References']);assert(sorted.ambiguityPreserved);assert.deepEqual(sorted.restored,sorted.expected);
 });
 await check('Large bookmark decision UI is paginated without dropping entries',async()=>{
   const result=await page.evaluate(()=>{
     const prior=Bookmarks.decisionItems;
     const fixture=Array.from({length:65},(_,i)=>({bm:{id:'ui-fixture-'+i,title:'Ambiguous fixture '+i,url:'https://example.org/'+i,parentId:'1'},reasons:['test fixture'],candidates:[]}));
     Bookmarks.renderAccuracyGate(fixture);const first=document.querySelectorAll('.bookmark-review-row').length;const select=document.querySelector('#bookmark-review-list select');select.value=JSON.stringify(['Gaming & Roblox Dev','Chess']);select.dispatchEvent(new Event('change'));
     document.querySelector('[data-bookmark-page="next"]').click();const second=document.querySelector('.bookmark-review-row strong').textContent;
     const retained=Bookmarks.decisionItems.length;document.querySelector('[data-bookmark-page=previous]').click();const retainedChoice=document.querySelector('#bookmark-review-list select').value;Bookmarks.decisionPage=0;Bookmarks.renderAccuracyGate(prior);return {first,second,retained,retainedChoice};
   });
   assert.equal(result.first,20);assert.equal(result.second,'Ambiguous fixture 20');assert.equal(result.retained,65);assert.deepEqual(JSON.parse(result.retainedChoice),['Gaming & Roblox Dev','Chess']);
 });
 await check('Native tab groups survive save and restore in a separate window',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('optimizer-flyout'));
   const saved=await page.evaluate(async()=>{
     const own=await chrome.tabs.getCurrent();const a=await chrome.tabs.create({windowId:own.windowId,url:'https://example.org/hq-test-a',active:false}),b=await chrome.tabs.create({windowId:own.windowId,url:'https://example.org/hq-test-b',active:false});
     const group=await chrome.tabs.group({tabIds:[a.id,b.id]});await chrome.tabGroups.update(group,{title:'HQ Maths Test',color:'blue'});
     await Workspaces.saveCurrent('Native group test');const snapshot=Workspaces.items[0];await Workspaces.restore(snapshot.id);
     const groups=await chrome.tabGroups.query({title:'HQ Maths Test'});return {snapshot: snapshot.tabs.filter(t=>t.url.includes('/hq-test-')),groups:groups.map(g=>({title:g.title,color:g.color,windowId:g.windowId})),originalGroupId:(await chrome.tabs.get(a.id)).groupId,expectedOriginalGroupId:group};
   });
   assert.equal(saved.snapshot.length,2);assert(saved.snapshot.every(t=>t.groupTitle==='HQ Maths Test'));assert.equal(saved.groups.length,2);assert.equal(saved.originalGroupId,saved.expectedOriginalGroupId);
   // Test-only cleanup. Application restore itself never closes original tabs.
   await page.evaluate(async()=>{const own=await chrome.tabs.getCurrent();for(const window of await chrome.windows.getAll()){if(window.id!==own.windowId)await chrome.windows.remove(window.id);}for(const tab of await chrome.tabs.query({currentWindow:true})){if(Workspaces.restorableUrl(tab)?.includes('/hq-test-'))await chrome.tabs.remove(tab.id);}});
 });
 await check('Gmail connect handles cancelled OAuth visibly (token-provider stub)',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('gmail-flyout'));
   await page.evaluate(()=>{Gmail.getToken=async()=>{throw new Error('The user did not approve access.');};});
   await page.locator('#gmail-connect-btn').click();await page.waitForFunction(()=>document.getElementById('gmail-connection-dot').classList.contains('error'));
   assert.equal(await page.locator('#gmail-connect-btn').isEnabled(),true);
 });
 await check('Widgets have direct working routes and calendar works at narrow widths',async()=>{
   await page.evaluate(()=>HQPanels.close());await page.getByRole('button',{name:'Weather',exact:true}).click();
   assert(await page.locator('#weather-flyout').evaluate(e=>e.classList.contains('open')));await page.evaluate(()=>HQPanels.close());
   for(const width of [320,640,1280,1920]){
     await page.setViewportSize({width,height:960});await page.evaluate(()=>HQPanels.open('calendar-flyout'));
     const panel=page.locator('#calendar-flyout'),box=await panel.boundingBox();assert(box.x>=-1&&box.x+box.width<=width+1,'Calendar outside viewport '+width);
     const close=panel.locator('.flyout-close');await close.click();
     await page.screenshot({path:path.join(output,`workspace-${width}.png`)});
   }
 });
 await check('Study palettes await approval; layered launch animation stays skippable',async()=>{
   await page.setViewportSize({width:1440,height:960});await page.bringToFront();
   await page.evaluate(()=>HQPanels.close());await page.evaluate(()=>HQPanels.open('pomodoro-flyout'));
   const before=await page.evaluate(()=>chrome.storage.local.get('hq_adaptive_theme_v1'));
   const proposals=await page.evaluate(()=>AdaptiveThemes.propose('HSIE study',{regenerate:true}));
   assert.equal(proposals.length,3);assert.equal(new Set(proposals.map(p=>p.id)).size,3);
   assert.deepEqual(await page.evaluate(()=>chrome.storage.local.get('hq_adaptive_theme_v1')),before,'Proposal applied without approval');
   await page.locator('.focus-theme-option').first().click();
   await waitForSaved(()=>page.evaluate(()=>chrome.storage.local.get('hq_adaptive_theme_active_v1')),v=>v.hq_adaptive_theme_active_v1===true);
   await page.evaluate(()=>HQPanels.close());await page.emulateMedia({reducedMotion:'no-preference'});
   const legacy=await context.newPage();await legacy.goto(base+'newtab.html?legacy=1');await legacy.waitForFunction(()=>document.body.classList.contains('app-ready'));await legacy.emulateMedia({reducedMotion:'no-preference'});await legacy.evaluate(()=>{BootCinematic.mode='full';BootCinematic.replay();});await legacy.waitForFunction(()=>document.getElementById('hq-launch').classList.contains('is-active'));
   const animatedLayers=await legacy.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running').length);assert(animatedLayers>=5,'Legacy launch animation has too few layers');await legacy.locator('#hq-launch-skip').click();await legacy.waitForFunction(()=>!document.body.classList.contains('boot-cinematic-active'));await legacy.close();await page.bringToFront();await page.evaluate(()=>HQPanels.open('nexus-flyout'));await page.locator('#nexus-flyout .flyout-close').click();await page.emulateMedia({reducedMotion:'reduce'});
   return {generatedOptions:proposals.length,animatedLayers};
 });
 await check('Exact-origin dashboard bridge works through real Chrome external messaging (isolated fixture)',async()=>{
   const fixture='https://operation-hq-command-center.shour-ya11.chatgpt.site/__hq_bridge_ci';
   await context.route(fixture,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Isolated bridge fixture</title><p>CI fixture only</p>'}));
   const site=await context.newPage();await site.goto(fixture);
   const send=type=>site.evaluate(({extensionId,type})=>new Promise(resolve=>chrome.runtime.sendMessage(extensionId,{protocol:1,type},response=>resolve(chrome.runtime.lastError?{error:chrome.runtime.lastError.message}:response))),{extensionId,type});
   const disabled=await send('hq:bridge:status');assert.equal(disabled.enabled,false);
   const popup=await context.newPage();await popup.goto(base+'popup.html');await popup.locator('#bridge-enabled').check();
   await waitForSaved(()=>worker.evaluate(()=>chrome.storage.local.get('hq_dashboard_bridge_enabled_v1')),v=>v.hq_dashboard_bridge_enabled_v1===true);
   assert.equal((await send('hq:bridge:status')).ok,true);
   const pulled=await send('hq:bridge:pull');assert.equal(pulled.ok,true);assert.equal(pulled.snapshot.tasks.length,0);assert(pulled.snapshot.notes.plain.includes('Chapter five'));
   assert.equal(pulled.snapshot.schemaVersion,1);assert(!JSON.stringify(pulled).includes('refresh_token'));
   await popup.locator('#bridge-enabled').uncheck();await popup.close();await site.close();
   return {productionSiteRequests:0,realUserDataMutations:0};
 });
 await check('Browser tools use the shared Paper/Night desk and readable narrow bookmark controls',async()=>{
   await worker.evaluate(()=>chrome.storage.local.set({hq_desk_appearance_v1:{surface:'paper',hue:152,motion:'reduced'}}));
   await page.goto(base+'newtab.html#tool=bookmarks&request=shared-desk-test');await page.waitForFunction(()=>document.body.classList.contains('app-ready')&&document.getElementById('bookmarks-flyout').classList.contains('open'));
   assert.equal(await page.locator('body').getAttribute('data-workspace'),'tools');assert.equal(await page.locator('#app').isVisible(),false);assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(241, 240, 233)');
   await page.evaluate(()=>Bookmarks.renderAccuracyGate([{bm:{id:'readable',title:'Every Chess Tip - Explained',url:'https://youtube.com/watch?v=readable',parentId:'1'},reasons:['test-only layout'],candidates:[]}]));
   for(const width of [320,1440]){await page.setViewportSize({width,height:960});const panel=page.locator('#bookmarks-flyout'),select=page.locator('#bookmark-review-list select');const box=await select.boundingBox();assert(box.width>180);assert(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.waitForFunction(()=>getComputedStyle(document.getElementById('bookmarks-flyout')).opacity==='1');await page.screenshot({path:path.join(output,`shared-desk-${width}.png`)});}
   await worker.evaluate(()=>chrome.storage.local.set({hq_desk_appearance_v1:{surface:'ink',hue:220,motion:'reduced'}}));await page.waitForFunction(()=>document.body.dataset.deskSurface==='ink'&&getComputedStyle(document.body).backgroundColor==='rgb(27, 32, 28)');assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(27, 32, 28)');
   await page.locator('#bookmarks-flyout .flyout-close').click();await page.getByRole('button',{name:'Gmail',exact:true}).click();await page.locator('#gmail-flyout').waitFor({state:'visible'});await page.screenshot({path:path.join(output,'shared-desk-gmail.png')});return {surfaceMatches:true,oldDashboardHidden:true,readableSelect:true};
 });
 await check('Automatic bookmarks retry busy locks and resolve late titles',async()=>{
   await worker.evaluate(async()=>{await chrome.storage.local.set({hq_realtime_sort_enabled:false});globalThis.HQAutoStarted=false;void navigator.locks.request('hq-bookmark-mutations',async()=>{globalThis.HQAutoStarted=true;await new Promise(resolve=>globalThis.HQReleaseAuto=resolve);});});await waitForSaved(()=>worker.evaluate(()=>globalThis.HQAutoStarted),Boolean);
   const created=await worker.evaluate(async()=>{const bar=(await chrome.bookmarks.getTree())[0].children[0].id;await chrome.storage.local.set({hq_realtime_sort_enabled:true});return chrome.bookmarks.create({parentId:bar,title:'Chess endgame practice',url:'https://example.org/auto-chess'});});
   try{await waitForSaved(()=>worker.evaluate(async()=> (await chrome.storage.local.get('hq_bookmark_auto_queue_v1')).hq_bookmark_auto_queue_v1||[]),items=>items.some(v=>v.id===created.id));assert.equal((await worker.evaluate(id=>chrome.bookmarks.get(id),created.id))[0].parentId,created.parentId);}finally{await worker.evaluate(()=>globalThis.HQReleaseAuto());}
   await worker.evaluate(()=>BookmarkAutomation.wake());const destination=await worker.evaluate(async id=>{const [b]=await chrome.bookmarks.get(id),[parent]=await chrome.bookmarks.get(b.parentId),[root]=await chrome.bookmarks.get(parent.parentId);return [root.title,parent.title];},created.id);assert.deepEqual(destination,['Gaming & Roblox Dev','Chess']);
   const vague=await worker.evaluate(async()=>chrome.bookmarks.create({parentId:(await chrome.bookmarks.getTree())[0].children[0].id,title:'Watch this',url:'https://youtube.com/watch?v=hqdelayedfixture'}));await waitForSaved(()=>worker.evaluate(async()=> (await chrome.storage.local.get('hq_bookmark_auto_queue_v1')).hq_bookmark_auto_queue_v1||[]),items=>items.some(v=>v.id===vague.id));assert.equal((await worker.evaluate(id=>chrome.bookmarks.get(id),vague.id))[0].parentId,vague.parentId);
   await worker.evaluate(id=>chrome.bookmarks.update(id,{title:'Piano chords and scales lesson'}),vague.id);await waitForSaved(()=>worker.evaluate(id=>chrome.bookmarks.get(id),vague.id),items=>items[0].parentId!==vague.parentId);assert.equal(await worker.evaluate(async id=>{const [b]=await chrome.bookmarks.get(id);return (await chrome.bookmarks.get(b.parentId))[0].title;},vague.id),'Music');
   await page.evaluate(()=>HQPanels.open('bookmarks-flyout'));await page.locator('#bookmark-auto-toggle').uncheck();await page.getByText('Automatic sorting is off. New bookmarks are kept where you save them.',{exact:true}).waitFor();await page.screenshot({path:path.join(output,'bookmark-automation.png')});await page.locator('#bookmarks-flyout .flyout-close').click();return {busyRetry:true,lateTitle:true,noGuesses:true};
 });
 await check('Heavy AI stays unloaded and measured DOM/JS heap remain bounded',async()=>{
   assert.equal(await page.evaluate(()=>performance.getEntriesByType('resource').some(r=>/webllm-loader|web-llm\.js/.test(r.name))),false);
   const session=await context.newCDPSession(page);await session.send('Performance.enable');const metrics=await session.send('Performance.getMetrics');
   const heap=metrics.metrics.find(m=>m.name==='JSHeapUsedSize')?.value,dom=await page.locator('*').count();
   assert(heap<128*1024*1024,'JS heap exceeded test budget');assert(dom<20000,'DOM exceeded test budget');
   return {jsHeapUsedBytes:heap,domElements:dom,note:'JS heap only. Not renderer RSS, GPU memory, or a measured 300 MB Mac limit.'};
 });
 await check('Process memory is measured after all native tools',async()=>{const memory=await profileMemory(profile);assert(memory.available);await fs.writeFile(path.join(output,'memory-after-tools.json'),JSON.stringify(memory,null,2));return memory;});
 await check('Closed tools release their layout and record settled profile memory',async()=>{
   await page.evaluate(()=>HQPanels.close());const hidden=await page.locator('.flyout').evaluateAll(items=>items.map(e=>({id:e.id,display:getComputedStyle(e).display,width:e.getBoundingClientRect().width})));assert(hidden.every(e=>e.display==='none'&&e.width===0),'Closed panels retained layout: '+JSON.stringify(hidden.filter(e=>e.width>0)));assert.equal(await page.locator('#settings-drawer').evaluate(e=>getComputedStyle(e).display),'none');
   await new Promise(resolve=>setTimeout(resolve,10000));const memory=await profileMemory(profile);assert(memory.available);await fs.writeFile(path.join(output,'memory-settled.json'),JSON.stringify(memory,null,2));return {closedPanels:hidden.length,memory};
 });
 await check('Long bookmark decisions survive restoration and reject renamed resources',async()=>{
   const result=await page.evaluate(async()=>{
     await chrome.storage.local.set({hq_realtime_sort_enabled:false});
     const bar=(await chrome.bookmarks.getTree())[0].children[0].id;
     const saved=(await chrome.storage.local.get(Bookmarks.DECISIONS_KEY))[Bookmarks.DECISIONS_KEY];
     const original=Bookmarks.decisionItems,selections=[...Bookmarks.decisionSelections];
     const bookmark=await chrome.bookmarks.create({parentId:bar,title:'Long resource '+ 'x'.repeat(600),url:'https://example.org/?resource='+ 'y'.repeat(3200)});
     try{
       await Bookmarks.persistDecisions([{bm:bookmark,reasons:['Synthetic decision']}]);
       const bounded=Bookmarks.decisionItems.find(item=>String(item.bm.id)===String(bookmark.id));
       if(!bounded)throw new Error('Synthetic long-resource decision was not persisted: '+bookmark.id);
       const identity=bounded.resourceIdentity;
       await Bookmarks.restoreDecisions();
       const retained=Bookmarks.decisionItems.some(item=>item.bm.id===bookmark.id);
       const valid=await Bookmarks.decisionMatches(bounded,bookmark);
       const changed=await chrome.bookmarks.update(bookmark.id,{title:'INBOX'});
       const stale=await Bookmarks.decisionMatches(bounded,changed);
       const outcome=await Bookmarks.applyCorrection(bookmark.id,['School & Academics','Mathematics']);
       const untouched=(await chrome.bookmarks.get(bookmark.id))[0].parentId===bar;
       return {identity,fixtureId:bookmark.id,boundedId:bounded.bm.id,retained,valid,stale,untouched,blocked:outcome?.error===true,titleLength:bounded.bm.title.length,urlLength:bounded.bm.url.length};
     }finally{await chrome.bookmarks.remove(bookmark.id);await Classifier.updateDecisionStore(()=>saved||[]);Bookmarks.decisionItems=original;Bookmarks.decisionSelections=new Map(selections);Bookmarks.renderAccuracyGate();}
   });
   const diagnostic=JSON.stringify(result);assert.match(result.identity,/^sha256-v1:[a-f0-9]{64}$/,diagnostic);assert.equal(result.fixtureId,result.boundedId,diagnostic);assert(result.retained&&result.valid&&result.untouched&&result.blocked,diagnostic);assert.equal(result.stale,false,diagnostic);assert.equal(result.titleLength,500,diagnostic);assert.equal(result.urlLength,3000,diagnostic);return result;
 });
 await check('Native page and worker decision writers preserve queued additions and restores',async()=>{
   const state=await worker.evaluate(async()=>{
     const saved=await chrome.storage.local.get(['hq_realtime_sort_enabled','hq_bookmark_decisions_v1']);
     await chrome.storage.local.set({hq_realtime_sort_enabled:false});
     const bar=(await chrome.bookmarks.getTree())[0].children[0].id,fixtures=[];
     for(const name of ['seed','worker','page'])fixtures.push(await chrome.bookmarks.create({parentId:bar,title:'HQ decision race '+name,url:'https://example.org/decision-race-'+name}));
     return {saved,fixtures};
   });
   try{
     await page.evaluate(async bookmark=>{
       globalThis.__HQDecisionRace={original:Bookmarks.decisionItems,selections:[...Bookmarks.decisionSelections],held:false};
       await Bookmarks.persistDecisions([{bm:bookmark,reasons:['Synthetic seed']}]);
       globalThis.__HQDecisionRace.holder=navigator.locks.request('hq-bookmark-decisions-v1',async()=>{
         globalThis.__HQDecisionRace.held=true;
         await new Promise(resolve=>globalThis.__HQDecisionRace.release=resolve);
       });
     },state.fixtures[0]);
     await page.waitForFunction(()=>globalThis.__HQDecisionRace.held);
     await worker.evaluate(bookmark=>{globalThis.__HQWorkerDecisionRace=markBookmarkDecision(bookmark,{reasons:['Synthetic worker addition']});},state.fixtures[1]);
     await waitForSaved(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.filter(lock=>lock.name==='hq-bookmark-decisions-v1').length),count=>count>=1);
     await page.evaluate(bookmark=>{
       const state=globalThis.__HQDecisionRace;
       state.write=Bookmarks.persistDecisions([{bm:bookmark,reasons:['Synthetic page addition']}]);
       state.restore=Bookmarks.restoreDecisions();
     },state.fixtures[2]);
     await waitForSaved(()=>page.evaluate(async()=>(await navigator.locks.query()).pending.filter(lock=>lock.name==='hq-bookmark-decisions-v1').length),count=>count>=3);
     await page.evaluate(()=>globalThis.__HQDecisionRace.release());
     await worker.evaluate(()=>globalThis.__HQWorkerDecisionRace);
     await page.evaluate(()=>Promise.all([globalThis.__HQDecisionRace.holder,globalThis.__HQDecisionRace.write,globalThis.__HQDecisionRace.restore]));
     const ids=await worker.evaluate(async()=>(await chrome.storage.local.get('hq_bookmark_decisions_v1')).hq_bookmark_decisions_v1.map(item=>String(item.bm.id)));
     for(const bookmark of state.fixtures)assert(ids.includes(bookmark.id),'Concurrent writer lost fixture '+bookmark.id);
     assert.equal(new Set(ids).size,ids.length,'Concurrent writers duplicated decision IDs');
     return {workerAndPageAdditionsRetained:true,restoreRetainedQueuedWrites:true,uniqueIds:true};
   }finally{
     await page.evaluate(async()=>{
       const state=globalThis.__HQDecisionRace;if(!state)return;
       state.release?.();await Promise.allSettled([state.holder,state.write,state.restore].filter(Boolean));
     });
     await worker.evaluate(async()=>{if(globalThis.__HQWorkerDecisionRace)await Promise.allSettled([globalThis.__HQWorkerDecisionRace]);delete globalThis.__HQWorkerDecisionRace;});
     for(const bookmark of state.fixtures)await worker.evaluate(id=>chrome.bookmarks.remove(id),bookmark.id);
     await page.evaluate(async saved=>{
       await Classifier.updateDecisionStore(()=>saved.hq_bookmark_decisions_v1||[]);
       const state=globalThis.__HQDecisionRace;if(state){Bookmarks.decisionItems=state.original;Bookmarks.decisionSelections=new Map(state.selections);Bookmarks.renderAccuracyGate();}
       await chrome.storage.local.set({hq_realtime_sort_enabled:saved.hq_realtime_sort_enabled??false});delete globalThis.__HQDecisionRace;
     },state.saved);
   }
 });
 await check('Native recovery keeps uncertain owner moves and preserves verified Undo',async()=>{
   await page.evaluate(()=>HQPanels.open('bookmarks-flyout'));
   const outcomes=[];
   for(const phase of ['legacy','prepared']){
     const state=await page.evaluate(async phase=>{
       const keys=[Bookmarks.JOURNAL_KEY,Bookmarks.UNDO_KEY,'hq_bookmark_undo','hq_bookmark_recovery_reviews_v1','hq_realtime_sort_enabled'];
       const saved=await chrome.storage.local.get(keys),bar=(await chrome.bookmarks.getTree())[0].children[0].id;
       await chrome.storage.local.set({hq_realtime_sort_enabled:false});Bookmarks.pendingTransaction=null;Bookmarks.journalFailed=false;
       const source=await chrome.bookmarks.create({parentId:bar,title:'HQ Recovery Source '+phase}),target=await chrome.bookmarks.create({parentId:bar,title:'HQ Recovery Target '+phase});
       const verified=await chrome.bookmarks.create({parentId:source.id,title:'HQ verified recovery '+phase,url:'https://example.org/verified-recovery-'+phase});
       const uncertain=await chrome.bookmarks.create({parentId:source.id,title:'HQ owner placement '+phase,url:'https://example.org/owner-recovery-'+phase+'?opaque='+'x'.repeat(280)});
       const applied=[];await Bookmarks.moveAndRecord(verified,target.id,[],bar,applied);
       await chrome.bookmarks.move(uncertain.id,{parentId:target.id});
       const intent={id:uncertain.id,url:uncertain.url,fromParentId:source.id,fromIndex:1,fromPath:[source.title],toParentId:target.id,toPath:[target.title],...(phase==='prepared'?{phase:'prepared'}:{})};
       const journal={id:'native-recovery-'+phase,kind:'interrupted-sort',createdAt:Date.now(),moves:[intent]};
       await chrome.storage.local.set({[Bookmarks.JOURNAL_KEY]:journal});await Bookmarks.updateUndoButton();
       return {keys,saved,source,target,verified,uncertain,applied,journal,current:(await chrome.bookmarks.get(uncertain.id))[0]};
     },phase);
     try{
       await page.locator('#undo-bookmarks-btn').click();await page.waitForFunction(()=>!Bookmarks.busy);
       await page.locator('#bookmark-recovery-review').waitFor({state:'visible'});
       await page.setViewportSize({width:320,height:960});
       const summary=page.locator('#bookmark-recovery-review summary');await summary.focus();await summary.press('Enter');
       assert.equal(await page.locator('#bookmark-recovery-review details').evaluate(element=>element.open),true,'Recovery details did not open with Enter');
       const geometry=await page.locator('#bookmark-recovery-review').evaluate(section=>{
         const rect=element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width};};
         return {viewport:innerWidth,section:rect(section),button:rect(section.querySelector('button')),scrollWidth:section.scrollWidth,clientWidth:section.clientWidth};
       });
       for(const name of ['section','button'])assert(geometry[name].width>0&&geometry[name].left>=0&&geometry[name].right<=geometry.viewport,`${phase} narrow recovery ${name} escaped viewport: ${JSON.stringify(geometry)}`);
       assert(geometry.scrollWidth<=geometry.clientWidth+1,'Opaque recovery URL overflowed: '+JSON.stringify(geometry));
       await page.screenshot({path:path.join(output,'bookmark-recovery-'+phase+'-320.png')});
       await page.setViewportSize({width:1440,height:960});
       assert.deepEqual(await worker.evaluate(id=>chrome.bookmarks.get(id),state.uncertain.id),[state.current],'Undo changed uncertain '+phase+' placement');
       const keep=page.locator('#bookmark-recovery-review').getByRole('button',{name:/Keep current locations/});
       const cancelDialog=page.waitForEvent('dialog').then(async dialog=>{assert.equal(dialog.type(),'confirm');assert.match(dialog.message(),/No bookmarks will move or be deleted/);await dialog.dismiss();});
       await keep.click();await cancelDialog;
       assert.equal(await worker.evaluate(async()=>Boolean((await chrome.storage.local.get('hq_bookmark_pending_v1')).hq_bookmark_pending_v1)),true,'Cancelled review discarded recovery');
       await page.evaluate(async state=>{
         await chrome.storage.local.set({[Bookmarks.JOURNAL_KEY]:{...state.journal,moves:[...state.applied,...state.journal.moves]}});await Bookmarks.updateUndoButton();
       },state);
       const acceptDialog=page.waitForEvent('dialog').then(dialog=>dialog.accept());
       await page.locator('#bookmark-recovery-review').getByRole('button',{name:/Keep current locations/}).click();await acceptDialog;
       await waitForSaved(()=>worker.evaluate(async()=>(await chrome.storage.local.get('hq_bookmark_pending_v1')).hq_bookmark_pending_v1),journal=>journal?.moves?.length===1&&journal.moves[0].id===state.verified.id&&journal.moves[0].phase==='applied');
       await page.waitForFunction(()=>!Bookmarks.busy);
       assert.deepEqual(await worker.evaluate(id=>chrome.bookmarks.get(id),state.uncertain.id),[state.current],'Keep-current changed owner '+phase+' placement');
       const archived=await worker.evaluate(async()=>(await chrome.storage.local.get('hq_bookmark_recovery_reviews_v1')).hq_bookmark_recovery_reviews_v1);
       assert(archived.some(item=>item.id===state.journal.id&&item.decision==='keep-current-locations'&&item.moves.length===1&&item.moves[0].id===state.uncertain.id),'Uncertain review was not archived');
       await page.locator('#undo-bookmarks-btn').click();await page.waitForFunction(()=>!Bookmarks.busy);
       const restored=(await worker.evaluate(id=>chrome.bookmarks.get(id),state.verified.id))[0];
       assert.equal(restored.parentId,state.source.id,'Verified inverse was lost');assert.equal(restored.index,state.verified.index,'Verified Undo lost original index');
       const owner=(await worker.evaluate(id=>chrome.bookmarks.get(id),state.uncertain.id))[0];
       assert.equal(owner.parentId,state.current.parentId,'Verified Undo moved the uncertain bookmark');assert.equal(owner.url,state.current.url);assert.equal(owner.title,state.current.title);
       // Removing its verified sibling legitimately renumbers Chrome's index.
       assert.deepEqual(await worker.evaluate(async id=>(await chrome.bookmarks.getChildren(id)).map(item=>item.id),state.target.id),[state.uncertain.id]);
       await page.locator('#bookmark-recovery-review').waitFor({state:'detached'});outcomes.push({phase,uncertainUntouched:true,confirmationRequired:true,verifiedUndoPreserved:true,narrowRecoveryContained:true,keyboardDetails:true});
     }finally{
       await page.setViewportSize({width:1440,height:960});
       await page.evaluate(async state=>{
         for(const id of [state.verified.id,state.uncertain.id,state.source.id,state.target.id])await chrome.bookmarks.remove(id);
         await navigator.locks.request('hq-bookmark-mutations',async()=>{await chrome.storage.local.remove(state.keys);await chrome.storage.local.set(state.saved);});
         Bookmarks.pendingTransaction=null;Bookmarks.journalFailed=false;await Bookmarks.updateUndoButton();
       },state);
     }
   }
   return {outcomes};
 });
 await check('No uncaught browser errors across tested journeys',async()=>{assert.deepEqual(errors,[]);return {consoleErrors};});
}catch(error){console.error(error);process.exitCode=1;if(context){for(const p of context.pages().filter(p=>p.url().includes('newtab.html'))){await p.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});const diagnostics=await p.evaluate(()=>({issues:typeof BootDiagnostics==='undefined'?[]:BootDiagnostics.issues,early:window.HQEarlyDiagnostics?.entries()})).catch(()=>null);console.log('Failure diagnostics',JSON.stringify(diagnostics));console.log('Failure panel states',JSON.stringify(await p.evaluate(()=>({hash:location.hash,panels:[...document.querySelectorAll('.flyout.open')].map(e=>({id:e.id,visible:getComputedStyle(e).visibility})),errors:window.HQEarlyDiagnostics?.entries()})).catch(()=>null)));await fs.writeFile(path.join(output,'diagnostics.json'),JSON.stringify(diagnostics,null,2));}}}
finally{await fs.writeFile(path.join(output,'chromium-results.json'),JSON.stringify({timestamp:new Date().toISOString(),results,errors,consoleErrors,network,providerTests:'External HTTP blocked; Gmail cancellation token stub. No live account or local model download.'},null,2));await context?.close();await fs.rm(profile,{recursive:true,force:true});}

