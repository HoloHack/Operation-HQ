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
        events.push({id:ids[date]?.[index] || this.stableId(date,text,index), title:text, date, updatedAt:0});
      });
    }
    const note = saved.hq_notes_document_v2;
    const plain = note?.version===2 && typeof note.plain==='string' ? note.plain : typeof saved.hq_notes==='string' ? saved.hq_notes : '';
    if (tasks.length>2000 || events.length>3000 || plain.length>200000) throw new Error('Planning data exceeds the dashboard import limit. Nothing was truncated or changed. Export from browser tools instead.');
    if (tasks.some(t=>!t || typeof t.id!=='string' || !t.id || typeof t.text!=='string' || !t.text.trim())) throw new Error('Some tasks have invalid identifiers or text. Import stopped without changing the originals.');
    const projectedTasks = tasks.map(t=>({id:t.id,title:t.text,subject:t.venture||undefined,due:this.date(t.dueAt),estimateMinutes:Number(t.estMinutes)||undefined,priority:t.priority==='high'?'high':t.priority==='medium'?'normal':'low',completed:Boolean(t.done),updatedAt:this.stamp(t.updatedAt||t.completedAt||t.created)}));
    if(new Set(projectedTasks.map(t=>t.id)).size!==projectedTasks.length || new Set(events.map(e=>e.id)).size!==events.length) throw new Error('Duplicate planning identifiers need repair before dashboard import. Nothing was changed.');
    if (projectedTasks.some(t=>t.id.length>120 || t.title.length>500 || String(t.subject||'').length>120) || events.some(e=>String(e.id).length>120 || e.title.length>500)) throw new Error('Some planning fields exceed dashboard limits. Import stopped to preserve the original content.');
    return {schemaVersion:1,tasks:projectedTasks,events,notes:{plain,updatedAt:this.stamp(note?.updatedAt||note?.revision)},schedule:[],assignments:[],exams:[],habits:[],captures:[],settings:{accentHue:264,supportHue:198,motion:'balanced',density:'balanced',updatedAt:0},focus:{mission:'',minutes:25,chapters:[],updatedAt:0}};
  },
  async openTool(tool) {
    if (!Object.hasOwn(this.TOOLS,tool)) throw new Error('Unknown browser tool. No page was opened.');
    if (!globalThis.navigator?.locks?.request) throw new Error('Browser coordination is unavailable. No second workspace was opened.');
    return navigator.locks.request('hq-browser-workspace',()=>this._openTool(tool));
  },
  async _openTool(tool) {
    const base=chrome.runtime.getURL('newtab.html');
    // One on-demand workspace, rather than another large dashboard per click.
    const tabs=await chrome.tabs.query({});
    const found=tabs.find(tab=>typeof tab.url==='string' && tab.url.split('#')[0]===base);
    const url=`${base}#tool=${encodeURIComponent(tool)}`;
    if(found){await chrome.tabs.update(found.id,{url,active:true});if(found.windowId)await chrome.windows.update(found.windowId,{focused:true});}
    else await chrome.tabs.create({url});
    return {ok:true};
  },
  async handle(message,sender) {
    if(!this.validSender(sender)) return {ok:false,error:'Dashboard origin is not allowed.'};
    if(!message || message.protocol!==1) return {ok:false,error:'Unsupported bridge protocol.'};
    if(!['hq:bridge:status','hq:bridge:pull','hq:bridge:open-tool'].includes(message.type)) return {ok:false,error:'Unsupported bridge action.'};
    const enabled=Boolean((await chrome.storage.local.get(this.ENABLED_KEY))[this.ENABLED_KEY]);
    if(!enabled) return {ok:false,enabled:false,error:'Enable dashboard access in the extension popup before importing.'};
    if(message.type==='hq:bridge:status') return {ok:true,enabled:true,protocol:1,version:chrome.runtime.getManifest().version};
    if(message.type==='hq:bridge:open-tool') return this.openTool(message.tool);
    const saved=await chrome.storage.local.get(['hq_context','hq_tasks','hq_calendar_events','hq_calendar_entry_ids_v1','hq_notes_document_v2','hq_notes']);
    if(['privacy','lockdown'].includes(saved.hq_context?.mode)) return {ok:false,error:'Planning import is paused while Privacy or Lockdown is active.'};
    return {ok:true,enabled:true,snapshot:this.project(saved)};
  },
};
