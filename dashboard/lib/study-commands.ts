import type {HQState,HQTask} from './hq-state.ts';
import {contextNow,dayAgenda,localDate,subjectMatches} from './planning.ts';
export type LocalMatch={id:string;panel:'tasks'|'calendar'|'notes'|'study';title:string;detail:string};
/** Bounded literal retrieval over explicit local planning; no external/model access. */
export function searchStudy(state:HQState,query:string):LocalMatch[]{
 const terms=query.toLowerCase().replace(/\b(find|search|my|saved|for|please|notes?|tasks?|events?|assignments?|exams?)\b/g,' ').trim().split(/\s+/).filter(Boolean);
 if(!terms.length)return [];
 const matches=(s:string)=>terms.every(term=>subjectMatches(term,s));
 const records:LocalMatch[]=[...state.tasks.map(t=>({id:t.id,panel:'tasks' as const,title:t.title,detail:`${t.subject||'Task'} · ${t.completed?'Done':t.due||'No deadline'}`})),...state.events.map(e=>({id:e.id,panel:'calendar' as const,title:e.title,detail:`${e.date} ${e.start||'All day'} ${e.notes||''}`.slice(0,220)})),...state.assignments.map(a=>({id:a.id,panel:'study' as const,title:a.title,detail:`${a.subject||'Assignment'} · ${a.due||'No deadline'}`})),...state.exams.map(e=>({id:e.id,panel:'study' as const,title:e.title,detail:`${e.subject||'Exam'} · ${e.date}`}))];
 const result=records.filter(r=>matches(r.title+' '+r.detail));
 if(matches(state.notes.plain)){const position=Math.max(0,state.notes.plain.toLowerCase().indexOf(terms[0]));result.unshift({id:'notes',panel:'notes',title:'Your notes',detail:state.notes.plain.slice(Math.max(0,position-40),position+180)});}
 return result.slice(0,30);
}
export function nextStudyTask(state:HQState,subject?:string):HQTask|undefined{
 const rank={critical:0,high:1,normal:2,low:3};return state.tasks.filter(t=>!t.completed&&(!subject||subjectMatches(subject,`${t.subject||''} ${t.title}`))).sort((a,b)=>rank[a.priority]-rank[b.priority]||String(a.due||'9999').localeCompare(String(b.due||'9999')))[0];
}
/** Factual day brief. Unknown workload/estimates stay explicit. */
export function studyBrief(state:HQState,now:Date){
 const date=localDate(now),context=contextNow(state,now),next=nextStudyTask(state),tasks=state.tasks.filter(t=>!t.completed),overdue=tasks.filter(t=>t.due&&t.due.slice(0,10)<date),exam=state.exams.filter(e=>e.date>=date).sort((a,b)=>a.date.localeCompare(b.date))[0],sessions=dayAgenda(state,date).filter(e=>e.category==='study-plan');
 return [`${tasks.length} unfinished tasks; ${overdue.length} past their deadline.`,next?`Next by priority/deadline: ${next.title}${next.estimateMinutes?` (${next.estimateMinutes} min estimate)`:' (no time estimate)'}.`:'Add your next task before making a plan.',`${sessions.length} study sessions scheduled today.`,context.current?`Current commitment: ${context.current.title}.`:'No current timed commitment.',exam?`Next recorded exam: ${exam.title}, ${exam.date}.`:'No upcoming exam date recorded.'].join(' ');
}
