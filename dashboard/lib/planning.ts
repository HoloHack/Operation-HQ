import {validDate,validTime,type HQState,type HQEvent} from './hq-state.ts';
export const localDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function shiftDate(key:string,days:number){if(!validDate(key))throw Error('Choose a valid date.');const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+days);return localDate(d);}
export const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
export const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function isStudyAvailability(title:string){
 const text=title.toLowerCase();
 if(/school|class|tuition|appointment|meeting|transit|travel|park|sport|workout|training|basketball|soccer|cricket|singing|piano|chess|language|breakfast|lunch|dinner|sleep|wind down|rest|run\b/.test(text))return false;
 return /flex|study|coding|business|catch-up|practice|competition/.test(text);
}
export function dayAgenda(state:HQState,date:string):HQEvent[]{
 const day=new Date(`${date}T12:00:00`).getDay();
 return [...state.events.filter(e=>e.date===date),...state.schedule.filter(b=>b.day===day&&(b.weekParity===undefined||!b.altAnchor||((Math.floor((Date.parse(date)-Date.parse(b.altAnchor))/604800000)%2+2)%2)===b.weekParity)).map(b=>({...b,id:`timetable:${b.id}:${date}`,date,category:isStudyAvailability(b.title)?'availability':'timetable'}))].sort((a,b)=>String(a.start||'00:00').localeCompare(String(b.start||'00:00')));
}
export function rangeAgenda(state:HQState,from:string,days=30){
 if(!Number.isInteger(days)||days<1||days>90)throw Error('Show between 1 and 90 agenda days.');
 return Array.from({length:days},(_,i)=>dayAgenda(state,shiftDate(from,i))).flat();
}
export function subjectMatches(subject:string,text:string){
 const normalized=(s:string)=>s.toLowerCase().replace(/mathematics|maths?/g,'math').replace(/history|geography/g,'hsie');
 return normalized(text).includes(normalized(subject).trim());
}
export function contextNow(state:HQState,now:Date){const date=localDate(now),time=clock(now.getHours()*60+now.getMinutes()),agenda=dayAgenda(state,date);return {current:agenda.filter(e=>e.start&&e.end&&e.start<=time&&e.end>time).sort((a,b)=>Number(a.category==='availability')-Number(b.category==='availability'))[0],next:agenda.find(e=>e.start&&e.start>time&&e.category!=='availability')||agenda.find(e=>e.start&&e.start>time),tomorrow:dayAgenda(state,shiftDate(date,1))};}
export function makeEvent(input:Partial<HQEvent>,id:string,now:number):HQEvent{
 const title=input.title?.trim();if(!title||title.length>500||!validDate(input.date||''))throw Error('Add an event title and valid date.');
 if(Boolean(input.start)!==Boolean(input.end)||input.start&&(!validTime(input.start)||!validTime(input.end!)||input.end!<=input.start))throw Error('Choose an end time after the start; overnight events need separate daily entries.');
 return {id,title,date:input.date!,start:input.start||undefined,end:input.end||undefined,notes:input.notes,location:input.location,category:input.category,updatedAt:now};
}
export function planCapacity(state:HQState,options:{from:string;until:string;subject?:string;start:string;end:string;breakMinutes:number;timetableOnly?:boolean},id:()=>string,now:number){
 if(!validDate(options.from)||!validDate(options.until)||options.until<options.from||!validTime(options.start)||!validTime(options.end)||options.end<=options.start)throw Error('Choose a valid date range and daily study window.');
 const days=Math.round((Date.parse(options.until)-Date.parse(options.from))/86400000)+1;if(days>90)throw Error('Plan at most 90 days at a time.');
 const breaks=Math.max(0,Math.min(30,options.breakMinutes));
 const tasks=state.tasks.filter(t=>!t.completed).sort((a,b)=>{
  const prefer=(t:typeof a)=>options.subject&&subjectMatches(options.subject,`${t.subject||''} ${t.title}`)?0:1;
  const rank={critical:0,high:1,normal:2,low:3};return prefer(a)-prefer(b)||rank[a.priority]-rank[b.priority]||String(a.due||'9999').localeCompare(String(b.due||'9999'));
 });
 const instant=new Date(now),today=localDate(instant),nowMinute=instant.getHours()*60+instant.getMinutes();
 const replaced=state.events.filter(e=>e.category==='study-plan'&&e.date>=options.from&&e.date<=options.until&&(e.date>today||(e.date===today&&Boolean(e.start)&&minute(e.start!)>nowMinute)));
 const replacedIds=new Set(replaced.map(e=>e.id));
 const events:HQEvent[]=[],unscheduled:string[]=[];const existing=state.events.filter(e=>!replacedIds.has(e.id));
 const working={...state,events:existing};
 for(const task of tasks){
  const retainedMinutes=existing.filter(e=>e.category==='study-plan'&&e.notes===`Task: ${task.id}`&&(!task.due||e.date<=task.due.slice(0,10))&&e.start&&e.end&&(e.date>today||e.date===today&&minute(e.end)>nowMinute)).reduce((total,e)=>total+Math.max(0,minute(e.end!)-Math.max(minute(e.start!),e.date===today?nowMinute:0)),0);
  let remaining=Math.max(0,(task.estimateMinutes||25)-retainedMinutes);const chunks:HQEvent[]=[];
  for(let i=0;i<days&&remaining;i++){const date=shiftDate(options.from,i);if(date<today)continue;if(task.due&&date>task.due.slice(0,10))break;
   const occupied=dayAgenda(working,date).filter(e=>e.category!=='availability').concat(events.filter(e=>e.date===date),chunks.filter(e=>e.date===date));
   if(occupied.some(e=>!e.start||!e.end))continue; // All-day commitments reserve the day.
   let cursor=minute(options.start),end=minute(options.end);const instant=new Date(now);if(date===localDate(instant))cursor=Math.max(cursor,instant.getHours()*60+instant.getMinutes()+1);
   const spans=occupied.map(e=>({start:minute(e.start!),end:minute(e.end!)})).sort((a,b)=>a.start-b.start);
   const available=options.timetableOnly?dayAgenda(working,date).filter(e=>e.category==='availability'&&e.start&&e.end).map(e=>({start:Math.max(cursor,minute(e.start!)),end:Math.min(end,minute(e.end!))})).filter(v=>v.end>v.start).sort((a,b)=>a.start-b.start):[{start:cursor,end}];
   const ranges:{start:number;end:number}[]=[];for(const span of available){const last=ranges.at(-1);if(last&&span.start<=last.end)last.end=Math.max(last.end,span.end);else ranges.push({...span});}
   for(const range of ranges){
    let position=range.start;
    for(const span of [...spans,{start:range.end,end:range.end}]){
     if(span.end<position)continue;const stop=Math.min(range.end,span.start);
     while(position+5<=stop&&remaining){const duration=Math.min(50,remaining,stop-position);if(duration<5)break;chunks.push({id:id(),title:task.title,date,start:clock(position),end:clock(position+duration),category:'study-plan',notes:`Task: ${task.id}`,updatedAt:now});remaining-=duration;position+=duration+breaks;}
     position=Math.max(position,span.end+breaks);if(position>=range.end||!remaining)break;
    }
    if(!remaining)break;
   }
  }
  if(remaining){unscheduled.push(`${task.title}: ${remaining} minutes do not fit before its deadline.`);}events.push(...chunks);
 }
 return {events,unscheduled,basis:JSON.stringify({tasks:state.tasks,events:state.events,schedule:state.schedule}),replaced};
}
export function applyCapacity(state:HQState,plan:ReturnType<typeof planCapacity>,now:number){
 if(plan.basis!==JSON.stringify({tasks:state.tasks,events:state.events,schedule:state.schedule}))throw Error("Your tasks or commitments changed. Generate another preview.");
 const ids=new Set(plan.replaced.map(e=>e.id));
 return {...state,events:[...state.events.filter(e=>!ids.has(e.id)),...plan.events]};
}
export function undoCapacity(state:HQState,inverse:{added:HQEvent[];removed:HQEvent[]},now:number){
 const additions=new Map(inverse.added.map(e=>[e.id,e])),current=state.events.filter(e=>additions.has(e.id));
 if(current.length!==additions.size||current.some(e=>JSON.stringify(e)!==JSON.stringify(additions.get(e.id))))throw Error('A planned event was edited or removed. Undo stopped to preserve that change.');
 const currentIds=new Set(state.events.map(e=>e.id));
 const removed=inverse.removed.filter(e=>!currentIds.has(e.id)).map(e=>({...e,updatedAt:Math.max(now,e.updatedAt+1,...state.tombstones.filter(t=>t.collection==='events'&&t.id===e.id).map(t=>t.updatedAt+1))}));
 return {...state,events:[...state.events.filter(e=>!additions.has(e.id)),...removed]};
}
export function restoreCalendarItem(state:HQState,kind:'events'|'schedule',record:HQEvent|HQState['schedule'][number],now:number):HQState{
 if(state[kind].some(e=>e.id===record.id))throw Error('This commitment is already present. Its current version was kept.');
 const deletedAt=state.tombstones.filter(t=>t.collection===kind&&t.id===record.id).reduce((max,t)=>Math.max(max,t.updatedAt),0);
 const restored={...record,updatedAt:Math.max(now,record.updatedAt+1,deletedAt+1)};
 return kind==='events'?{...state,events:[...state.events,restored as HQEvent]}:{...state,schedule:[...state.schedule,restored as HQState['schedule'][number]]};
}
/** RFC 5545 content lines: fold by UTF-8 octets, never inside a code point. */
export function foldCalendarLine(line:string){
 const encoder=new TextEncoder();let output='',part='',bytes=0;
 for(const char of line){const size=encoder.encode(char).byteLength;if(bytes+size>75){output+=part+'\r\n';part=' ';bytes=1;}part+=char;bytes+=size;}
 return output+part;
}
export function exportICS(events:HQEvent[],now=new Date()){
 const escape=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const stamp=(e:HQEvent,t?:string)=>e.date.replaceAll('-','')+(t?'T'+t.replace(':','')+'00':'');
 const dtstamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Operation HQ//Calendar//EN','CALSCALE:GREGORIAN',...events.flatMap(e=>[
  'BEGIN:VEVENT',`UID:${escape(e.id)}@operation-hq`,`DTSTAMP:${dtstamp}`,
  e.start?`DTSTART:${stamp(e,e.start)}`:`DTSTART;VALUE=DATE:${stamp(e)}`,
  e.end?`DTEND:${stamp(e,e.end)}`:`DTEND;VALUE=DATE:${shiftDate(e.date,1).replaceAll('-','')}`,
  `SUMMARY:${escape(e.title)}`,...(e.notes?[`DESCRIPTION:${escape(e.notes)}`]:[]),...(e.location?[`LOCATION:${escape(e.location)}`]:[]),'END:VEVENT'
 ]),'END:VCALENDAR'].map(foldCalendarLine).join('\r\n')+'\r\n';
}
/** A finite timetable snapshot, not an invented recurrence rule or timezone conversion. */
export function exportAgendaICS(state:HQState,from:string,days=30,now=new Date()){return exportICS(rangeAgenda(state,from,days),now);}
