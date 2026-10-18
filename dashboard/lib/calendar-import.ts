import {assertHQCapacity,type HQState,type HQEvent,validDate,validTime} from './hq-state.ts';
import {localDate,shiftDate,minute,clock} from './planning.ts';

type Property={name:string;params:Record<string,string>;value:string};
type Wall={date:string;time?:string;zone?:string};
const unescape=(v:string)=>v.replace(/\\([nN,;\\])/g,(_,c)=>c==='n'||c==='N'?'\n':c);
const stamp=(wall:Wall)=>wall.date+(wall.time?'T'+wall.time:'');
const zoneValid=(zone:string)=>{try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();return true;}catch{return false;}};
function wallProperty(p:Property):Wall{
 const match=p.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
 if(!match)throw Error('Calendar dates must use complete DATE or DATE-TIME values.');
 const date=`${match[1]}-${match[2]}-${match[3]}`,time=match[4]?`${match[4]}:${match[5]}`:undefined;
 if(!validDate(date)||time&&!validTime(time)||match[6]&&match[6]!=='00')throw Error('Invalid date/time or sub-minute precision. Nothing was imported.');
 const zone=match[7]?'UTC':p.params.TZID;
 if(zone&&!zoneValid(zone))throw Error(`Unsupported timezone: ${zone}. Export with an IANA timezone or UTC.`);
 if(!time&&zone)throw Error('All-day calendar dates must not carry a timezone.');
 return {date,time,zone};
}
function inZone(ms:number,zone:string):Wall{
 const fields=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(ms).map(v=>[v.type,v.value]));
 return {date:`${fields.year}-${fields.month}-${fields.day}`,time:`${fields.hour}:${fields.minute}`};
}
/** Resolve each occurrence's wall clock, rejecting skipped/ambiguous DST times. */
function instant(w:Wall,localZone:string){
 const zone=w.zone||localZone,target=Date.parse(w.date+'T'+w.time+':00Z');let result=target;
 for(let n=0;n<4;n++){const got=inZone(result,zone);const delta=target-Date.parse(got.date+'T'+got.time+':00Z');if(!delta)break;result+=delta;}
 if(stamp(inZone(result,zone))!==stamp(w))throw Error('An event falls in a skipped daylight-saving hour. Resolve its time in the original calendar.');
 for(const offset of [-120,-90,-60,-30,30,60,90,120])if(stamp(inZone(result+offset*60000,zone))===stamp(w))throw Error('An event falls in an ambiguous daylight-saving hour. Export that occurrence in UTC.');
 return result;
}
function parseProperties(text:string){
 if(new TextEncoder().encode(text).length>2_000_000)throw Error('Choose a calendar smaller than 2 MB. Nothing was imported.');
 const lines=text.replace(/^\uFEFF/,'').replace(/\r\n[ \t]|\n[ \t]/g,'').split(/\r?\n/),events:Property[][]=[];let current:Property[]|null=null,depth=0;
 if(!lines.includes('BEGIN:VCALENDAR')||!lines.includes('END:VCALENDAR'))throw Error('Choose a complete .ics calendar.');
 for(const line of lines){
  if(line==='BEGIN:VEVENT'){if(current)throw Error('Nested calendar event.');current=[];depth=0;continue;}
  if(line==='END:VEVENT'){if(!current)throw Error('Unmatched calendar event.');events.push(current);current=null;if(events.length>3000)throw Error('Calendar has more than 3,000 events.');continue;}
  if(!current)continue;if(line.startsWith('BEGIN:')){depth++;continue;}if(line.startsWith('END:')){depth--;continue;}if(depth)continue;
  const colon=line.indexOf(':');if(colon<0){if(line.trim())throw Error('Malformed calendar content line.');continue;}
  const [name,...parts]=line.slice(0,colon).split(';'),params:Record<string,string>={};
  for(const part of parts){const eq=part.indexOf('=');if(eq<1)throw Error('Malformed calendar parameter.');params[part.slice(0,eq).toUpperCase()]=part.slice(eq+1).replace(/^"|"$/g,'');}
  current.push({name:name.toUpperCase(),params,value:line.slice(colon+1)});
 }
 if(current)throw Error('Calendar ended inside an event.');return events;
}
function stableId(key:string){let a=2166136261,b=5381;for(const c of key){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return `ics:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;}
/** Finite, reviewed occurrence import. Unsupported recurrence fails the entire preview. */
export function previewCalendarImport(text:string,options:{from:string;until:string;timezone:string},state:HQState,now:number){
 if(!validDate(options.from)||!validDate(options.until)||options.until<options.from||Date.parse(options.until)-Date.parse(options.from)>89*86400000)throw Error('Choose an import window of 1–90 days.');
 if(!zoneValid(options.timezone))throw Error('Choose a valid IANA display timezone.');
 const records=parseProperties(text),events:HQEvent[]=[],warnings:string[]=[],seen=new Set<string>();let duplicates=0,conflicts=0,outside=0,work=0;
 for(const properties of records){
  const all=(name:string)=>properties.filter(p=>p.name===name),one=(name:string)=>{const found=all(name);if(found.length>1)throw Error('Duplicate '+name+' property.');return found[0];};
  if(one('RECURRENCE-ID'))throw Error('This file contains edited recurring instances. Export a finite occurrence snapshot from the original calendar before importing.');
  if(one('STATUS')?.value==='CANCELLED')continue;
  const uid=one('UID')?.value,title=unescape(one('SUMMARY')?.value||'').trim(),startProp=one('DTSTART');
  if(!uid||uid.length>1000||!title||title.length>500||!startProp)throw Error('Each event needs a UID, title and start.');
  const start=wallProperty(startProp),endProp=one('DTEND');
  if(one('DURATION'))throw Error('DURATION events need an explicit end time before import.');
  const end=endProp?wallProperty(endProp):start.time?null:{date:shiftDate(start.date,1)};
  if(!end)throw Error('Timed events need an end time.');
  if(Boolean(start.time)!==Boolean(end.time)||start.zone!==end.zone)throw Error('Event start and end must use the same date/time type and timezone.');
  const daySpan=Math.round((Date.parse(end.date)-Date.parse(start.date))/86400000);
  if(start.time&&(daySpan!==0||end.time!<=start.time))throw Error('Overnight events need separate daily entries before import.');
  if(!start.time&&(daySpan<1||daySpan>90))throw Error('All-day events need a positive duration of at most 90 days.');
  const rule=one('RRULE'),dates=new Set<string>([start.date]);
  if(rule){
   const values:Record<string,string>={};for(const pair of rule.value.split(';')){const [k,v,...rest]=pair.split('=');if(!v||rest.length||values[k])throw Error('Malformed recurrence rule.');values[k]=v;}
   if(Object.keys(values).some(k=>!['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','WKST'].includes(k))||!['DAILY','WEEKLY'].includes(values.FREQ))throw Error('Only daily and weekly recurrence rules are supported here. Export other rules as a finite snapshot.');
   const interval=Number(values.INTERVAL||1),count=Number(values.COUNT||Infinity);
   if(!Number.isInteger(interval)||interval<1||interval>52||count!==Infinity&&(!Number.isInteger(count)||count<1||count>10000)||values.COUNT&&values.UNTIL)throw Error('Unsupported recurrence interval or count.');
   const days=['SU','MO','TU','WE','TH','FR','SA'],weekStart=days.indexOf(values.WKST||'MO'),by=values.BYDAY?values.BYDAY.split(',').map(v=>days.indexOf(v)):[new Date(start.date+'T12:00:00').getDay()];
   if(weekStart<0||by.some(v=>v<0)||values.FREQ==='DAILY'&&values.BYDAY||values.FREQ==='WEEKLY'&&!by.includes(new Date(start.date+'T12:00:00').getDay()))throw Error('Unsupported recurrence weekdays.');
   const until=values.UNTIL?wallProperty({name:'UNTIL',params:{},value:values.UNTIL}):null;
   dates.clear();let occurrences=0;const startDay=new Date(start.date+'T12:00:00').getDay(),firstWeek=Date.parse(start.date)-((startDay-weekStart+7)%7)*86400000;
   const stop=shiftDate(options.until,2),iterations=Math.round((Date.parse(stop)-Date.parse(start.date))/86400000);
   if(iterations>40000)throw Error('This recurrence starts too far in the past. Export a finite snapshot.');
   for(let n=0;n<=iterations;n++){
    if(++work>100000)throw Error('This recurrence set is too large to preview safely. Export a shorter finite snapshot.');
    const date=shiftDate(start.date,n),day=new Date(date+'T12:00:00').getDay();
    if(values.FREQ==='DAILY'?n%interval!==0:Math.floor((Date.parse(date)-firstWeek)/604800000)%interval!==0||!by.includes(day))continue;
    const wall={...start,date};if(until&&(until.time&&until.zone?instant(wall,options.timezone)>instant(until,options.timezone):until.time?stamp(wall)>stamp(until):wall.date>until.date))break;
    if(++occurrences>count)break;dates.add(date);
   }
   // DTSTART is part of a recurrence set even if BYDAY excludes its weekday.
   dates.add(start.date);
  }
  const excluded=new Set<string>();
  for(const p of all('EXDATE'))for(const value of p.value.split(',')){const w=wallProperty({...p,value});if(w.time!==start.time||w.zone!==start.zone)throw Error('Recurrence exceptions must use the original start clock and timezone.');excluded.add(w.date);}
  for(const p of all('RDATE'))for(const value of p.value.split(',')){const w=wallProperty({...p,value});if(w.time!==start.time||w.zone!==start.zone)throw Error('Additional occurrences must use the original start clock and timezone.');dates.add(w.date);}
  const notes=unescape(one('DESCRIPTION')?.value||''),location=unescape(one('LOCATION')?.value||'');
  const provenance=`Imported calendar UID: ${uid}\nOriginal timezone: ${start.zone||'floating local time'}\nDisplay timezone at import: ${options.timezone}`;
  if(notes.length+provenance.length+2>10000||location.length>500)throw Error('An event contains more notes or location text than HQ can preserve.');
  for(const date of [...dates].sort()){
   if(excluded.has(date))continue;let occurrenceStart:Wall={date,time:start.time},occurrenceEnd:Wall={date:shiftDate(date,daySpan),time:end.time};
   if(start.time){occurrenceStart=inZone(instant({...start,date},options.timezone),options.timezone);occurrenceEnd=inZone(instant({...end,date},options.timezone),options.timezone);if(occurrenceStart.date!==occurrenceEnd.date||occurrenceEnd.time!<=occurrenceStart.time!)throw Error('Timezone conversion crosses midnight or reverses an event. Split it in the original calendar first.');}
   const span=start.time?1:daySpan;
   for(let part=0;part<span;part++){
    const shownDate=shiftDate(occurrenceStart.date,part);if(shownDate<options.from||shownDate>options.until){outside++;continue;}
    const id=stableId(uid+'|'+date+'|'+(start.time||'all-day')+'|'+(start.zone||'floating')+'|'+part),event:HQEvent={id,title,date:shownDate,start:occurrenceStart.time,end:occurrenceEnd.time,category:'calendar-import',notes:[notes,provenance].filter(Boolean).join('\n\n'),location:location||undefined,updatedAt:now};
    if(seen.has(id))throw Error('This file repeats an event identity. Nothing was imported.');seen.add(id);
    const current=state.events.find(e=>e.id===id);
    if(current){if(['title','date','start','end','notes','location'].some(k=>(current as unknown as Record<string,unknown>)[k]!== (event as unknown as Record<string,unknown>)[k]))conflicts++;else duplicates++;continue;}
    const deleted=state.tombstones.some(t=>t.collection==='events'&&t.id===id);if(deleted){conflicts++;continue;}
    events.push(event);if(events.length>3000)throw Error('More than 3,000 occurrences. Choose a shorter import window.');
   }
  }
 }
 if(conflicts)warnings.push(`${conflicts} existing, edited or previously deleted occurrences kept. Re-import does not overwrite or resurrect them.`);
 if(duplicates)warnings.push(`${duplicates} identical occurrences already present.`);
 assertHQCapacity({...state,events:[...state.events,...events]});
 return {events,warnings,duplicates,conflicts,outside,from:options.from,until:options.until,timezone:options.timezone,basis:JSON.stringify({events:state.events,tombstones:state.tombstones})};
}
export function applyCalendarImport(state:HQState,preview:ReturnType<typeof previewCalendarImport>){
 if(preview.basis!==JSON.stringify({events:state.events,tombstones:state.tombstones}))throw Error('Calendar changed. Preview the import again.');
 const next={...state,events:[...state.events,...preview.events]};assertHQCapacity(next);return next;
}
