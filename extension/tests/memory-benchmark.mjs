// Comparable whole-process PSS samples. CI only; never the owner's Chrome profile.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {profileMemory} from './process-memory.mjs';
const current=path.resolve(import.meta.dirname,'..'),baseline=process.env.HQ_MEMORY_BASELINE;
if(!baseline)throw Error('Supply the exact baseline extension directory.');
const output=path.join(current,'test-results');await fs.mkdir(output,{recursive:true});
const results=[];
for(let sample=0;sample<3;sample++)for(const [label,root] of (sample%2?[['candidate',current],['baseline',path.resolve(baseline)]]:[['baseline',path.resolve(baseline)],['candidate',current]])){
 const profile=await fs.mkdtemp(path.join(os.tmpdir(),'hq-memory-'+label+'-'));let context;
 try{
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:1440,height:960},args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--no-sandbox']});
  await context.route(/^https?:\/\//,r=>r.abort());
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(()=>chrome.storage.local.set({hq_boot_sequence_v1:'off',hq_weather_auto_location:false,hq_realtime_sort_enabled:false}));
  const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`chrome-extension://${new URL(worker.url()).host}/newtab.html`);await page.waitForFunction(()=>document.body.classList.contains('app-ready'));
  const before=await profileMemory(profile);
  const panels=await page.evaluate(()=>[...document.querySelectorAll('.flyout[id]')].map(p=>p.id));
  for(const width of [320,1440]){await page.setViewportSize({width,height:960});for(const id of panels){await page.evaluate(async id=>{await HQPanels.open(id);},id);await page.locator('#'+id).waitFor({state:'visible'});await page.waitForTimeout(100);await page.screenshot();await page.evaluate(()=>HQPanels.close());}}
  await page.waitForTimeout(10000);
  const after=await profileMemory(profile),session=await context.newCDPSession(page);await session.send('Performance.enable');const metrics=await session.send('Performance.getMetrics');
  results.push({label,sample,before,after,heapBytes:metrics.metrics.find(v=>v.name==='JSHeapUsedSize')?.value,viewports:[320,1440],panels:panels.length});
 }finally{await context?.close();await fs.rm(profile,{recursive:true,force:true});}
}
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
const summary=label=>Object.fromEntries(['rendererPssBytes','gpuPssBytes','profilePssBytes'].map(k=>[k,median(results.filter(r=>r.label===label).map(r=>r.after[k]))]));
const old=summary('baseline'),newer=summary('candidate');
const result={baselineCommit:'9924ef1b6fe71ffc21425066929d17bb51975080',results,medianBaseline:old,medianCandidate:newer,rendererReductionBytes:old.rendererPssBytes-newer.rendererPssBytes,rendererReductionPercent:100*(1-newer.rendererPssBytes/old.rendererPssBytes),note:'Three alternating-order pairs of cold disposable Linux profiles, same 320/1440×960 viewports, reduced motion, all-panel screenshot cycles, no model/provider responses, ten seconds settled. PSS is not Mac per-tab memory; three short paired runs are not a leak or 300MB certification.'};
await fs.writeFile(path.join(output,'memory-comparison.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
