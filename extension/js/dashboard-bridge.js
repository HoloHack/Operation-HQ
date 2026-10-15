// Read-only planning projection. No credentials, mail, bookmarks or cloud writes.
const DashboardBridge = {
  ORIGIN: 'https://operation-hq-command-center.shour-ya11.chatgpt.site',
  ENABLED_KEY: 'hq_dashboard_bridge_enabled_v1',
  TOOLS: Object.freeze({ bookmarks:'bookmarks-flyout', gmail:'gmail-flyout', tabs:'optimizer-flyout', calendar:'calendar-flyout', notes:'notes-flyout', study:'assignments-flyout', nexus:'nexus-flyout', settings:'settings-drawer', gleam:'gleam-flyout' }),
  validSender(sender) {
    try { return !sender?.id && new URL(sender?.url || '').origin === this.ORIGIN && (!sender.origin || sender.origin === this.ORIGIN); } catch { return false; }
  },
  date(timestamp) {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime()) || !timestamp) return undefined;
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  },
  stamp(value) { return Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0; },
  stableId(date, text, index) {
    let hash=2166136261; for (const c of `${date}:${text}:${index}`) hash=Math.imul(hash^c.charCodeAt(0),16777619);
    return `legacy:${date}:${(hash>>>0).toString(36)}:${index}`;
  },
  project(saved) {
    const tasks = Array.isArray(saved.hq_tasks) ? saved.hq_tasks : [];
    const events = []; const ids = saved.hq_calendar_entry_ids_v1 || {};
    for (const [date, values] of Object.entries(saved.hq_calendar_events || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(values)) continue;
      const calendarDate = new Date(`${date}T00:00:00Z`);
      if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0,10)!==date) continue;
      values.forEach((text,index) => {
        if (typeof text !== 'string' || !text.trim()) return;
        const entryId=ids[date]?.[index] || this.stableId(date,text,index);const detail=Object.values(saved.hq_calendar_details_v2||{}).find(d=>(d.occurrences||[]).some((o,i)=>`event:${d.id}:${i}`===entryId||(d.syncCanonicalId&&entryId===`sync:${d.syncCanonicalId}`&&o.dateKey===date)));events.push({id:entryId,title:detail?.title||text,date,start:detail?.start||undefined,end:detail?.end||undefined,notes:detail?.notes||undefined,location:detail?.location||undefined,category:detail?.category||undefined,updatedAt:this.stamp(detail?.updatedAt)});
      });
    }
    const note = saved.hq_notes_document_v2;
    const plain = note?.version===2 && typeof note.plain==='string' ? note.plain : typeof saved.hq_notes==='string' ? saved.hq_notes : '';
    if (tasks.length>2000 || events.length>3000 || plain.length>200000) throw new Error('Planning data exceeds the dashboard import limit. Nothing was truncated or changed. Export from browser tools instead.');
    if (tasks.some(t=>!t || typeof t.id!=='string' || !t.id || typeof t.text!=='string' || !t.text.trim())) throw new Error('Some tasks have invalid identifiers or text. Import stopped without changing the originals.');
    const projectedTasks = tasks.map(t=>({id:t.id,title:t.text,subject:t.venture||undefined,due:this.date(t.dueAt),estimateMinutes:Number(t.estMinutes)||undefined,priority:t.priority==='high'?'high':t.priority==='medium'?'normal':'low',completed:Boolean(t.done),updatedAt:this.stamp(t.updatedAt||t.completedAt||t.created)}));
    if(new Set(projectedTasks.map(t=>t.id)).size!==projectedTasks.length || new Set(events.map(e=>e.id)).size!==events.length) throw new Error('Duplicate planning identifiers need repair before dashboard import. Nothing was changed.');
    if (projectedTasks.some(t=>t.id.length>120 || t.title.length>500 || String(t.subject||'').length>120) || events.some(e=>String(e.id).length>120 || e.title.length>500)) throw new Error('Some planning fields exceed dashboard limits. Import stopped to preserve the original content.');
    const schedule=[];const profile=saved.hq_schedule_profiles?.[saved.hq_active_schedule_profile];if(profile?.days){for(const [dayIndex,key]of ['sun','mon','tue','wed','thu','fri','sat'].entries()){const alt=profile.altDays?.[key];for(const [tag,blocks]of [['base',profile.days[key]||[]],['alt',alt||[]]])blocks.forEach((b,i)=>{if(typeof b.t!=='string'||!b.t||!/^\d{2}:\d{2}$/.test(b.s)||!/^\d{2}:\d{2}$/.test(b.e))throw Error('Timetable block needs repair before import.');schedule.push({id:`schedule:${saved.hq_active_schedule_profile}:${key}:${tag}:${i}`,title:b.t,day:dayIndex,start:b.s,end:b.e,altAnchor:profile.altAnchorDate||undefined,weekParity:alt&&profile.altAnchorDate?(tag==='base'?0:1):undefined,updatedAt:0});});}}
    return {schemaVersion:1,tasks:projectedTasks,events,notes:{plain,updatedAt:this.stamp(note?.updatedAt||note?.revision)},schedule,assignments:[],exams:[],habits:[],captures:[],settings:{accentHue:264,supportHue:198,motion:'balanced',density:'balanced',updatedAt:0},focus:{mission:'',minutes:25,chapters:[],updatedAt:0}};
  },
  async openTool(tool, appearance) {
    if (!Object.hasOwn(this.TOOLS,tool)) throw new Error('Unknown browser tool. No page was opened.');
    if (!globalThis.navigator?.locks?.request) throw new Error('Browser coordination is unavailable. No second workspace was opened.');
    return navigator.locks.request('hq-browser-workspace',async()=>{
      if(appearance){const v=appearance;if(!['paper','ink'].includes(v.surface)||!['full','balanced','reduced'].includes(v.motion)||!Number.isFinite(v.hue)||v.hue<0||v.hue>=360)throw Error('Invalid desk appearance.');await chrome.storage.local.set({hq_desk_appearance_v1:{surface:v.surface,motion:v.motion,hue:v.hue}});}
      return this._openTool(tool);
    });
  },
  async _openTool(tool) {
    const base=chrome.runtime.getURL('newtab.html');
    // One on-demand workspace, rather than another large dashboard per click.
    const tabs=await chrome.tabs.query({});
    const found=tabs.find(tab=>typeof tab.url==='string' && tab.url.split('#')[0]===base);
    // A closed flyout must reopen even when this is the same requested tool.
    const request=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const url=`${base}#tool=${encodeURIComponent(tool)}&request=${encodeURIComponent(request)}`;
    if(found){await chrome.tabs.update(found.id,{url,active:true});if(found.windowId)await chrome.windows.update(found.windowId,{focused:true});}
    else await chrome.tabs.create({url});
    return {ok:true};
  },
  async handle(message,sender) {
    if(!this.validSender(sender)) return {ok:false,error:'Dashboard origin is not allowed.'};
    if(!message || typeof message.type!=="string" || (message.type?.startsWith('hq:sync:')?message.protocol!==2:message.protocol!==1)) return {ok:false,error:'Unsupported bridge protocol.'};
    if(!['hq:sync:pair','hq:sync:exchange','hq:sync:disconnect','hq:bridge:status','hq:bridge:pull','hq:bridge:open-tool','hq:bridge:wallpaper'].includes(message.type)) return {ok:false,error:'Unsupported bridge action.'};
    const enabled=Boolean((await chrome.storage.local.get(this.ENABLED_KEY))[this.ENABLED_KEY]);
    if(!enabled) return {ok:false,enabled:false,error:'Enable dashboard access in the extension popup before importing.'};
    if(message.type.startsWith('hq:sync:')){if(message.protocol!==2)throw Error('Paired sync needs protocol 2.');return PlanningSync.handle(message);}
    if(message.type==='hq:bridge:status') return {ok:true,enabled:true,protocol:1,version:chrome.runtime.getManifest().version};
    if(message.type==='hq:bridge:open-tool') return this.openTool(message.tool,message.appearance);
    if(message.type==='hq:bridge:wallpaper'){
      const saved=await chrome.storage.local.get(['hq_context','hq_wallpaper_cached','hq_wallpaper_current']);
      if(['privacy','lockdown'].includes(saved.hq_context?.mode))return {ok:false,error:'Wallpaper sharing is paused in Privacy or Lockdown.'};
      let url;try{url=new URL(saved.hq_wallpaper_cached||saved.hq_wallpaper_current?.url||'');}catch{return {ok:false,error:'No working companion wallpaper is saved. Choose a local image on the dashboard instead.'};}
      if(url.protocol!=='https:'||url.username||url.password)return {ok:false,error:'This background is local to the companion. Choose the same image file on the dashboard.'};
      return {ok:true,url:url.href};
    }
    const saved=await chrome.storage.local.get(['hq_context','hq_tasks','hq_calendar_events','hq_calendar_entry_ids_v1','hq_calendar_details_v2','hq_notes_document_v2','hq_notes','hq_schedule_profiles','hq_active_schedule_profile']);
    if(['privacy','lockdown'].includes(saved.hq_context?.mode)) return {ok:false,error:'Planning import is paused while Privacy or Lockdown is active.'};
    return {ok:true,enabled:true,snapshot:this.project(saved)};
  },
};
