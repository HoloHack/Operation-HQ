import {validDate,validTime,type HQState,type HQEvent} from './hq-state.ts';
export const localDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function shiftDate(key:string,days:number){if(!validDate(key))throw Error('Choose a valid date.');const d=new Date(`${key}T12:00:00`);d.setDate(d.getDate()+days);return localDate(d);}
export const minute=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
export const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function dayAgenda(state:HQState,date:string):HQEvent[]{
 const day=new Date(`${date}T12:00:00`).getDay();
 return [...state.events.filter(e=>e.date===date),...state.schedule.filter(b=>b.day===day&&(b.weekParity===undefined||!b.altAnchor||((Math.floor((Date.parse(date)-Date.parse(b.altAnchor))/604800000)%2+2)%2)===b.weekParity)).map(b=>({...b,id:`timetable:${b.id}:${date}`,date,category:'timetable'}))].sort((a,b)=>String(a.start||'00:00').localeCompare(String(b.start||'00:00')));
}
export function contextNow(state:HQState,now:Date){const date=localDate(now),time=clock(now.getHours()*60+now.getMinutes()),agenda=dayAgenda(state,date);return {current:agenda.find(e=>e.start&&e.end&&e.start<=time&&e.end>time),next:agenda.find(e=>e.start&&e.start>time),tomorrow:dayAgenda(state,shiftDate(date,1))};}
export function makeEvent(input:Partial<HQEvent>,id:string,now:number):HQEvent{
 const title=input.title?.trim();if(!title||title.length>500||!validDate(input.date||''))throw Error('Add an event title and valid date.');
 if(Boolean(input.start)!==Boolean(input.end)||input.start&&(!validTime(input.start)||!validTime(input.end!)||input.end!<=input.start))throw Error('Choose an end time after the start; overnight events need separate daily entries.');
 return {id,title,date:input.date!,start:input.start||undefined,end:input.end||undefined,notes:input.notes,location:input.location,category:input.category,updatedAt:now};
}
export function planCapacity(state:HQState,options:{from:string;until:string;subject?:string;start:string;end:string;breakMinutes:number},id:()=>string,now:number){
 if(!validDate(options.from)||!validDate(options.until)||options.until<options.from||!validTime(options.start)||!validTime(options.end)||options.end<=options.start)throw Error('Choose a valid date range and daily study window.');
 const days=Math.round((Date.parse(options.until)-Date.parse(options.from))/86400000)+1;if(days>90)throw Error('Plan at most 90 days at a time.');
 const breaks=Math.max(0,Math.min(30,options.breakMinutes));
 const tasks=state.tasks.filter(t=>!t.completed).sort((a,b)=>{
  const prefer=(t:typeof a)=>options.subject&&`${t.subject||''} ${t.title}`.toLowerCase().includes(options.subject.toLowerCase())?0:1;
  const rank={critical:0,high:1,normal:2,low:3};return prefer(a)-prefer(b)||rank[a.priority]-rank[b.priority]||String(a.due||'9999').localeCompare(String(b.due||'9999'));
 });
 const events:HQEvent[]=[],unscheduled:string[]=[];const existing=state.events.filter(e=>e.category!=='study-plan');
 const working={...state,events:existing};
 for(const task of tasks){let remaining=task.estimateMinutes||25;const chunks:HQEvent[]=[];
  for(let i=0;i<days&&remaining;i++){const date=shiftDate(options.from,i);if(task.due&&date>task.due.slice(0,10))break;
   const occupied=dayAgenda(working,date).concat(events.filter(e=>e.date===date),chunks.filter(e=>e.date===date));
   if(occupied.some(e=>!e.start||!e.end))continue; // All-day commitments reserve the day.
   let cursor=minute(options.start),end=minute(options.end);const instant=new Date(now);if(date===localDate(instant))cursor=Math.max(cursor,instant.getHours()*60+instant.getMinutes()+1);
   const spans=occupied.map(e=>({start:minute(e.start!),end:minute(e.end!)})).sort((a,b)=>a.start-b.start);
   for(const span of [...spans,{start:end,end}]){const stop=Math.min(end,span.start);while(cursor+5<=stop&&remaining){const duration=Math.min(50,remaining,stop-cursor);if(duration<5)break;chunks.push({id:id(),title:task.title,date,start:clock(cursor),end:clock(cursor+duration),category:'study-plan',notes:`Task: ${task.id}`,updatedAt:now});remaining-=duration;cursor+=duration+breaks;}cursor=Math.max(cursor,span.end+breaks);if(cursor>=end||!remaining)break;}
  }
  if(remaining){unscheduled.push(`${task.title}: ${remaining} minutes do not fit before its deadline.`);}events.push(...chunks);
 }
 return {events,unscheduled,basis:JSON.stringify({tasks:state.tasks,events:state.events,schedule:state.schedule}),replaced:state.events.filter(e=>e.category==='study-plan')};
}
export function applyCapacity(state:HQState,plan:ReturnType<typeof planCapacity>,now:number){
 if(plan.basis!==JSON.stringify({tasks:state.tasks,events:state.events,schedule:state.schedule}))throw Error("Your tasks or commitments changed. Generate another preview.");
 const current=state.events.filter(e=>e.category==='study-plan');if(JSON.stringify(current)!==JSON.stringify(plan.replaced))throw Error('Your plan changed. Generate another preview.');
 return {...state,events:[...state.events.filter(e=>e.category!=='study-plan'),...plan.events]};
}
export function exportICS(events:HQEvent[]){const escape=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');const stamp=(e:HQEvent,t?:string)=>e.date.replaceAll('-','')+(t?'T'+t.replace(':','')+'00':'');return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Operation HQ//Calendar//EN',...events.flatMap(e=>['BEGIN:VEVENT',`UID:${escape(e.id)}@operation-hq`,e.start?`DTSTART:${stamp(e,e.start)}`:`DTSTART;VALUE=DATE:${stamp(e)}`,e.end?`DTEND:${stamp(e,e.end)}`:`DTEND;VALUE=DATE:${shiftDate(e.date,1).replaceAll('-','')}`,`SUMMARY:${escape(e.title)}`,...(e.notes?[`DESCRIPTION:${escape(e.notes)}`]:[]),'END:VEVENT']),'END:VCALENDAR'].join('\r\n');}
