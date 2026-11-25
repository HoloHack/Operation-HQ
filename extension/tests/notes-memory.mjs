// Diagnostic only: disposable Linux Chrome profiles, never the owner's notes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {profileMemory} from './process-memory.mjs';

const root=path.resolve(import.meta.dirname,'..');
const output=path.join(root,'test-results');
const sample=Number(process.env.HQ_NOTES_SAMPLE||0);
const idleMs=Number(process.env.HQ_NOTES_IDLE_MS||30000);
const order=process.env.HQ_NOTES_ORDER||(sample%2?'edited-first':'baseline-first');
const warmed=process.env.HQ_NOTES_WARMED||'0';
assert(['0','1'].includes(warmed),'HQ_NOTES_WARMED must be 0 or 1');
assert(Number.isInteger(sample)&&sample>=0&&sample<=20,'Sample must be an integer from 0 to 20');
assert(Number.isInteger(idleMs)&&idleMs>=0&&idleMs<=300000,'Idle interval must be 0–300000 ms');
assert(['baseline-first','edited-first'].includes(order),'Unknown arm order');
await fs.mkdir(output,{recursive:true});
const seed=Array.from({length:1200},(_,i)=>`Synthetic unique sentence ${String(i).padStart(4,'0')}: practise maths, preserve notes and check exact saves. `).join('').slice(0,99999)+'Z';
assert.equal(Buffer.byteLength(seed),100000);
const sha=text=>createHash('sha256').update(text).digest('hex');
const marker=cycle=>` [cycle-${String(cycle).padStart(2,'0')}]`;
const result={version:1,sample,order,idleMs,seed:{bytes:100000,sha256:sha(seed)},startedAt:new Date().toISOString(),arms:[],scope:'One cold two-arm pair of disposable Linux profiles with configurable order. Repeated alternating pairs have not been run by this invocation. Small real keyboard edits on a fixed synthetic 100 KB document; no private data, model, provider, forced GC or runtime optimization. Never-open versus first-open includes lazy bundle cost. Later-cycle slope is a hypothesis diagnostic, not proof of a leak or a Mac/per-tab/300 MB result. Default idle is 30 seconds, not five minutes; inspect idleMs.'};
const sleep=async ms=>{while(ms>0){const step=Math.min(ms,30000);await new Promise(resolve=>setTimeout(resolve,step));ms-=step;}};
const arms=order==='baseline-first'?['never-open','edit-close-reopen']:['edit-close-reopen','never-open'];
if(warmed==='1')arms.push('warmed-read-only');
result.warmedReadOnly=warmed==='1';
result.armOrder=[...arms];
if(warmed==='1')result.scope=result.scope.replace('One cold two-arm pair','One cold three-arm comparison')+' The optional third arm warms the editor and opens/closes it twenty times without edits; it always runs last, so order effects remain possible. This is a matched same-build control, not a causal estimate of history cost.';

async function assertSaved(page,plain,{editor=false}={}){
  await page.waitForFunction(async({plain,editor})=>{
    const saved=await chrome.storage.local.get(['hq_notes_document_v2','hq_notes_html','hq_notes','hq_notes_recovery_v1','hq_notes_sync_conflict_v1']);
    const doc=saved.hq_notes_document_v2;
    if(!doc||doc.version!==2||doc.plain!==plain||doc.html!==`<p>${plain}</p>`||saved.hq_notes!==plain||saved.hq_notes_html!==doc.html||saved.hq_notes_recovery_v1||saved.hq_notes_sync_conflict_v1)return false;
    if(!editor)return true;
    return typeof NotesEditor!=='undefined'&&NotesEditor.editor&&!NotesEditor._debounceTimer&&!NotesEditor._pendingWrites&&NotesEditor.document?.plain===plain&&NotesEditor.editor.getText({blockSeparator:'\n'})===plain&&document.getElementById('notes-save-status').textContent==='Saved locally';
  },{plain,editor},{timeout:15000});
}

async function diagnostics(page){
  return page.evaluate(async()=>{
    const doc=(await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2;
    const modelLoaded=typeof LocalAI!=='undefined'&&(LocalAI.isLoadedThisSession()||LocalAI._loading||LocalAI._bridgePromise!==null);
    const notes=typeof NotesEditor==='undefined'?null:NotesEditor,editor=notes?.editor;
    const history=editor?.state.plugins.find(plugin=>/^history\$/.test(plugin.key))?.getState(editor.state);
    return {domElements:document.querySelectorAll('*').length,richEditors:document.querySelectorAll('#notes-editor-container [contenteditable="true"]').length,notesModuleLoaded:!!notes,editorRetained:!!editor,editorDestroyed:editor?.isDestroyed??null,editorDocSize:editor?.state.doc.content.size??null,viewLifecycleCapabilities:editor?{unmount:typeof editor.unmount,mount:typeof editor.mount}:null,history:history?{doneEvents:history.done.eventCount,undoneEvents:history.undone.eventCount}:null,canUndo:editor?.can().undo()??null,canRedo:editor?.can().redo()??null,pendingWrites:notes?._pendingWrites||0,debouncePending:!!notes?._debounceTimer,plainBytes:new TextEncoder().encode(doc.plain).length,revision:doc.revision,modelLoaded,modelRuntimeRequested:performance.getEntriesByType('resource').some(resource=>/webllm-loader|web-llm\.js/.test(resource.name))};
  });
}

try{
  for(const arm of arms){
    const profile=await fs.mkdtemp(path.join(os.tmpdir(),'hq-notes-memory-'));let context;
    const run={arm,snapshots:[],pageErrors:[],blockedHttpRequests:0};result.arms.push(run);
    try{
      context=await chromium.launchPersistentContext(profile,{channel:'chromium',...(process.env.HQ_CHROMIUM_EXECUTABLE?{executablePath:process.env.HQ_CHROMIUM_EXECUTABLE}:{}),headless:true,viewport:{width:1440,height:960},args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`,'--no-sandbox']});
      context.setDefaultTimeout(15000);
      context.on('page',page=>page.on('pageerror',error=>run.pageErrors.push(error.message)));
      await context.route(/^https?:\/\//,route=>{run.blockedHttpRequests++;return route.abort();});
      const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
      await worker.evaluate(plain=>chrome.storage.local.set({hq_boot_sequence_v1:'off',hq_weather_auto_location:false,hq_realtime_sort_enabled:false,hq_seeded:true,hq_notes_document_v2:{version:2,plain,html:`<p>${plain}</p>`,revision:1,updatedAt:1,source:'synthetic-memory-fixture'},hq_notes:plain,hq_notes_html:`<p>${plain}</p>`}),seed);
      const page=await context.newPage();await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto(`chrome-extension://${new URL(worker.url()).host}/newtab.html`);
      await page.waitForFunction(()=>document.body?.classList.contains('app-ready'));
      let plain=seed,warmedRevision;
      const capture=async(label,cycle)=>{
        const memory=await profileMemory(profile);assert(memory.available,'Linux process PSS unavailable');
        const state=await diagnostics(page);assert.equal(state.modelLoaded,false);assert.equal(state.modelRuntimeRequested,false);
        if(arm==='warmed-read-only'&&warmedRevision!==undefined){
          assert.deepEqual(state.history,{doneEvents:0,undoneEvents:0},'Read-only arm mutated edit history');
          assert.equal(state.canUndo,false,'Read-only arm acquired Undo');
          assert.equal(state.canRedo,false,'Read-only arm acquired Redo');
          assert.equal(state.revision,warmedRevision,'Read-only reopen changed saved revision');
        }
        run.snapshots.push({label,cycle,elapsedMs:Date.now()-started,memory,state});
      };
      const started=Date.now();await assertSaved(page,plain);await capture('before-first-open',0);
      if(arm!=='never-open'){
        assert.equal(await page.evaluate(()=>typeof NotesEditor),'undefined','Notes loaded before the intervention');
        assert.equal(await page.evaluate(()=>HQPanels.open('notes-flyout')),true);
        await page.waitForFunction(()=>typeof NotesEditor!=='undefined'&&!!NotesEditor.editor);
        await assertSaved(page,plain,{editor:true});await page.evaluate(()=>HQPanels.close());
        if(arm==='warmed-read-only')warmedRevision=(await diagnostics(page)).revision;
        await capture('after-first-open-close',0);
      }
      for(let cycle=1;cycle<=20;cycle++){
        const at=Date.now();
        if(arm!=='never-open'){
          assert.equal(await page.evaluate(()=>HQPanels.open('notes-flyout')),true);
          if(arm==='edit-close-reopen'){
            const rich=page.locator('#notes-editor-container [contenteditable="true"]');
            await rich.focus();await rich.press('Control+End');await page.keyboard.insertText(marker(cycle));
            plain+=marker(cycle);
          }
          await assertSaved(page,plain,{editor:true});
          await page.locator('#notes-flyout .flyout-close').click();
          assert.equal(await page.locator('#notes-flyout').evaluate(element=>getComputedStyle(element).display),'none');
        }else await assertSaved(page,plain);
        // Equal nominal pacing; normal autosave completes before each sample.
        await sleep(Math.max(0,1000-(Date.now()-at)));
        if([1,5,10,20].includes(cycle))await capture('closed-cycle',cycle);
      }
      await sleep(idleMs);await assertSaved(page,plain,{editor:arm!=='never-open'});await capture('closed-idle',20);
      if(arm==='edit-close-reopen'){
        // Memory samples precede this functional probe and reload. Close/reopen
        // must not silently discard the live editor's user-visible history.
        await page.evaluate(()=>HQPanels.open('notes-flyout'));
        assert.equal(await page.evaluate(()=>NotesEditor.editor.commands.undo()),true,'Undo was lost across panel close/reopen');
        const previous=plain.slice(0,-marker(20).length);await assertSaved(page,previous,{editor:true});
        assert.equal(await page.evaluate(()=>NotesEditor.editor.commands.redo()),true,'Redo unavailable after Undo');
        await assertSaved(page,plain,{editor:true});
        run.historyAcrossClose={undoExactPrevious:true,redoExactFinal:true};
      }
      const revision=await page.evaluate(async()=>(await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2.revision);
      await page.reload();await page.waitForFunction(()=>document.body?.classList.contains('app-ready'));await assertSaved(page,plain);
      if(arm!=='never-open'){await page.evaluate(()=>HQPanels.open('notes-flyout'));await assertSaved(page,plain,{editor:true});}
      assert((await page.evaluate(async()=>(await chrome.storage.local.get('hq_notes_document_v2')).hq_notes_document_v2.revision))>=revision,'Reload regressed the saved revision');
      run.savedAfterReload={exactPlainAndHtml:true,mirrorsExact:true,noRepairOrConflict:true,bytes:Buffer.byteLength(plain),sha256:sha(plain),historyScope:arm==='edit-close-reopen'?'In-session Undo/Redo checked across close/reopen; history persistence across page reload is not claimed.':arm==='warmed-read-only'?'Zero edit history and stable revision checked before reload; no edits or Undo/Redo commands were performed.':'Editor was never opened; no history assertion.'};
      assert.deepEqual(run.pageErrors,[],'Uncaught errors in Notes experiment');run.passed=true;
    }catch(error){run.error=String(error.stack||error);throw error;}
    finally{await context?.close();await fs.rm(profile,{recursive:true,force:true});}
  }
  result.passed=true;
}catch(error){result.error=String(error.stack||error);process.exitCode=1;}
finally{
  result.finishedAt=new Date().toISOString();
  const file=path.join(output,`notes-memory-${sample}-${order}${warmed==='1'?'-warmed':''}.json`);await fs.writeFile(file,JSON.stringify(result,null,2));
  console.log(JSON.stringify({file,passed:result.passed===true,arms:result.arms.map(arm=>({arm:arm.arm,passed:arm.passed===true,snapshots:arm.snapshots.length,error:arm.error})),error:result.error}));
}
