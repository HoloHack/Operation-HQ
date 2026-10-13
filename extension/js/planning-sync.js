// Explicitly paired, bounded planning exchange. Never reads mail or bookmarks.
const PlanningSync={
 KEY:'hq_planning_pair_v2',
 clean(snapshot){
  if(!snapshot||snapshot.schemaVersion!==1||typeof snapshot.notes?.plain!=='string'||snapshot.notes.plain.length>200000)throw Error('Unsupported planning document.');
  if(JSON.stringify(snapshot).length>1500000)throw Error('Planning payload exceeds the safe limit.');
  const result={schemaVersion:1};const limits={tasks:2000,events:3000,schedule:1000,assignments:1000,exams:300,habits:300,captures:2000,releases:100,tombstones:20000};
  for(const [key,limit]of Object.entries(limits)){const list=snapshot[key]||[];if(!Array.isArray(list)||list.length>limit)throw Error('Invalid '+key+' collection.');const seen=new Set();for(const item of list){if(!item||typeof item.id!=='string'||!item.id||item.id.length>120||!/^[-:a-zA-Z0-9_.]+$/.test(item.id)||!Number.isFinite(item.updatedAt)||item.updatedAt<0)throw Error('Invalid planning identifier or timestamp.');const identity=key==='tombstones'?item.collection+':'+item.id:item.id;if(seen.has(identity))throw Error('Duplicate planning identifier.');seen.add(identity);if(['tasks','events','schedule','assignments','exams','habits','releases'].includes(key)&&(!item.title||typeof item.title!=='string'||item.title.length>500))throw Error('Invalid planning title.');if(key==='events'){CalendarRepository.validateDate(item.date);if(item.start&&!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.start))throw Error('Invalid event start.');}}
   result[key]=structuredClone(list);
  }
  for(const key of ['notes','focus','settings']){if(!snapshot[key]||typeof snapshot[key]!=='object')throw Error('Missing '+key+'.');result[key]=structuredClone(snapshot[key]);}return result;
 },
 canonicalId(id,key){id=String(id);if(key==='tasks'&&id.startsWith('dashboard:'))return id.slice(10);if(key==='events'&&id.startsWith('event:sync:')&&id.endsWith(':0'))return id.slice(11,-2);if(key==='events'&&id.startsWith('sync:'))return id.slice(5);return 'browser:'+id;},
 comparable(value){
  if(!value)return '';
  // Chrome's Value::Dict storage may reorder keys. Compare content, not insertion order.
  const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>[k,stable(v[k])])):v;
  const copy={...value};delete copy.updatedAt;return JSON.stringify(stable(copy));
 },
 merge(base,left,right){
  const output={...right},conflicts=[];for(const key of ['tasks','events','schedule','assignments','exams','habits','captures','releases']){
   const b=new Map((base[key]||[]).map(r=>[r.id,r])),l=new Map((left[key]||[]).map(r=>[r.id,r])),r=new Map((right[key]||[]).map(r=>[r.id,r]));const list=[];
   for(const id of new Set([...b.keys(),...l.keys(),...r.keys()])){const old=b.get(id),a=l.get(id),z=r.get(id),ac=this.comparable(a)!==this.comparable(old),zc=this.comparable(z)!==this.comparable(old);if(ac&&zc&&this.comparable(a)!==this.comparable(z)){conflicts.push(key+': '+(a?.title||z?.title||id));continue;}const winner=ac?a:z;if(winner)list.push(winner);}output[key]=list;
  }
  for(const key of ['notes','focus','settings']){const ac=this.comparable(left[key])!==this.comparable(base[key]),zc=this.comparable(right[key])!==this.comparable(base[key]);if(ac&&zc&&this.comparable(left[key])!==this.comparable(right[key]))conflicts.push(key);else output[key]=ac?left[key]:right[key];}
  const tombstones=new Map();for(const t of [...base.tombstones||[],...left.tombstones||[],...right.tombstones||[]]){const k=t.collection+':'+t.id;if(!tombstones.has(k)||t.updatedAt>tombstones.get(k).updatedAt)tombstones.set(k,t);}output.tombstones=[...tombstones.values()];
  if(conflicts.length)throw Error('Sync paused: both sides changed '+conflicts.slice(0,5).join(', ')+'. Export both versions and review them before reconnecting.');return this.clean(output);
 },
 async native(){return chrome.storage.local.get(['hq_context','hq_tasks','hq_calendar_events','hq_calendar_details_v2','hq_calendar_entry_ids_v1','hq_calendar_revision_v1','hq_notes_document_v2','hq_notes','hq_schedule_profiles','hq_active_schedule_profile']);},
 readNative(pair,saved){const projection=DashboardBridge.project(saved),out=structuredClone(pair.snapshot),baseline=pair.native||{};
  for(const key of ['tasks','events','schedule']){const latest=projection[key],before=baseline[key]||[],map=new Map(out[key].map(r=>[r.id,r]));for(const item of latest){const id=this.canonicalId(item.id,key),old=before.find(r=>r.id===item.id);if(!old){map.set(id,{...map.get(id),...item,id,updatedAt:Date.now()});continue;}const changes={};for(const field of new Set([...Object.keys(item),...Object.keys(old)])){if(field==='id'||field==='updatedAt')continue;if(this.comparable({value:item[field]})!==this.comparable({value:old[field]}))changes[field]=item[field];}if(Object.keys(changes).length)map.set(id,{...map.get(id),...changes,id,updatedAt:Date.now()});}for(const old of before){if(!latest.some(r=>this.canonicalId(r.id,key)===this.canonicalId(old.id,key))){const id=this.canonicalId(old.id,key);map.delete(id);out.tombstones.push({id,collection:key,updatedAt:Date.now()});}}out[key]=[...map.values()];const ts=new Map(out.tombstones.map(t=>[t.collection+':'+t.id,t]));out.tombstones=[...ts.values()];}
  if(projection.notes.plain!==(baseline.notes?.plain||''))out.notes={...projection.notes,updatedAt:Date.now()};return this.clean(out);
 },
 mirror(snapshot,saved){const values={};const original=DashboardBridge.project(saved);for(const block of original.schedule){const incoming=snapshot.schedule.find(b=>b.id==='browser:'+block.id);if(!incoming||incoming.title!==block.title||incoming.start!==block.start||incoming.end!==block.end||incoming.day!==block.day)throw Error('Edit imported browser timetable blocks in the browser Schedule tool; their alternating-week profile is preserved.');}
  const existing=saved.hq_tasks||[];
  values.hq_tasks=snapshot.tasks.map(t=>{const nativeId=t.id.startsWith('browser:')?t.id.slice(8):'dashboard:'+t.id,old=existing.find(x=>x.id===nativeId)||{};return {...old,id:nativeId,text:t.title,venture:t.subject||null,priority:t.priority==='critical'||t.priority==='high'?'high':t.priority==='normal'?'medium':'low',done:t.completed,dueAt:t.due?new Date(t.due+'T17:00:00').getTime():null,estMinutes:t.estimateMinutes||null,created:old.created||t.updatedAt,updatedAt:t.updatedAt};});
  for(const detail of Object.values(saved.hq_calendar_details_v2||{})){if(detail.syncCanonicalId)continue;for(const [i,o]of (detail.occurrences||[]).entries()){const id=`browser:event:${detail.id}:${i}`,e=snapshot.events.find(x=>x.id===id);if(!e)throw Error('Delete recurring browser events in the browser calendar first.');if(e&&(e.title!==detail.title||e.date!==o.dateKey||String(e.start||'')!==String(detail.start||'')||String(e.end||'')!==String(detail.end||'')))throw Error('Edit recurring browser events in the browser calendar. Paired sync preserves the recurrence definition.');}}
  const events={},ids={};for(const e of snapshot.events){const nativeId=e.id.startsWith('browser:')?e.id.slice(8):(Object.values(saved.hq_calendar_entry_ids_v1||{}).flat().includes(`event:sync:${e.id}:0`)?`event:sync:${e.id}:0`:'sync:'+e.id);const originalIndex=(saved.hq_calendar_entry_ids_v1?.[e.date]||[]).indexOf(nativeId);const display=originalIndex>=0&&e.id.startsWith('browser:event:')?saved.hq_calendar_events[e.date][originalIndex]:e.title;(events[e.date]||=[]).push(display);(ids[e.date]||=[]).push(nativeId);}
  values.hq_calendar_events=events;values.hq_calendar_entry_ids_v1=ids;values.hq_calendar_revision_v1=(saved.hq_calendar_revision_v1||0)+1;
  // Rich metadata is retained in the canonical snapshot; native compatibility details keep their own fields.
  values.hq_calendar_details_v2=structuredClone(saved.hq_calendar_details_v2||{});
  for(const [key,detail]of Object.entries(values.hq_calendar_details_v2))if(detail.syncCanonicalId&&!snapshot.events.some(e=>e.id===detail.syncCanonicalId))delete values.hq_calendar_details_v2[key];
  for(const event of snapshot.events.filter(e=>!e.id.startsWith('browser:'))){values.hq_calendar_details_v2['sync:'+event.id]={...event,id:'sync:'+event.id,syncCanonicalId:event.id,allDay:!event.start,occurrences:[{dateKey:event.date,text:event.title}]};}

  const old=saved.hq_notes_document_v2;if(old?.plain!==snapshot.notes.plain){const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');values.hq_notes_document_v2={version:2,plain:snapshot.notes.plain,html:'<pre>'+escape(snapshot.notes.plain)+'</pre>',revision:Math.max(Date.now(),(old?.revision||0)+1),updatedAt:snapshot.notes.updatedAt,source:'paired-dashboard'};values.hq_notes=snapshot.notes.plain;values.hq_notes_html=values.hq_notes_document_v2.html;}
  return values;
 },
 async handle(message){
  if(!globalThis.navigator?.locks?.request)throw Error('Planning coordination is unavailable.');
  if(typeof message.accountId!=='string'||!message.accountId||message.accountId.length>200)throw Error('A signed-in account is required.');
  return navigator.locks.request('hq-planning-write',async()=>{
   const saved=await this.native();if(['privacy','lockdown'].includes(saved.hq_context?.mode))throw Error('Planning sync is paused in Privacy or Lockdown.');const pair=(await chrome.storage.local.get(this.KEY))[this.KEY];
   if(message.type==='hq:sync:pair'){
    if(pair&&pair.accountId!==message.accountId)throw Error('This browser is paired to another account. Disconnect it in the extension popup first.');
    if(pair)throw Error('This account is already paired. Disconnect before replacing its baseline.');
    if(message.approved!==true)throw Error('Pairing needs your explicit approval.');
    const snapshot=this.clean(message.snapshot),token=crypto.randomUUID(),native=DashboardBridge.project(saved),record={accountId:message.accountId,token,revision:1,snapshot,native,history:[]};
    const values=this.mirror(snapshot,saved);record.native=DashboardBridge.project({...saved,...values});
    await chrome.storage.local.set({...values,[this.KEY]:record,hq_sync_pair_backup_v2:saved});return {ok:true,token,revision:1,snapshot};
   }
   if(!pair||pair.accountId!==message.accountId||pair.token!==message.token)throw Error('This account is not paired to this browser.');
   if(message.type==='hq:sync:disconnect'){await chrome.storage.local.remove(this.KEY);return {ok:true};}
   if(message.type==='hq:sync:exchange'){
    const base=message.revision===pair.revision?pair.snapshot:(pair.history||[]).find(h=>h.revision===message.revision)?.snapshot;if(!base)return {ok:false,conflict:true,revision:pair.revision,error:'This browser baseline is too old. Disconnect and review pairing again; your data has not changed.'};
    const incoming=this.clean(message.snapshot),native=this.readNative(pair,saved),snapshot=this.merge(base,incoming,native),values=this.mirror(snapshot,saved);const next={...pair,history:[...(pair.history||[]),{revision:pair.revision,snapshot:pair.snapshot}].slice(-3),revision:pair.revision+1,snapshot,native:DashboardBridge.project({...saved,...values})};await chrome.storage.local.set({...values,[this.KEY]:next});return {ok:true,snapshot,revision:next.revision};
   }
   throw Error('Unknown paired planning action.');
  });
 }
};
