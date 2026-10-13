import {validDate,type HQState,type HQTask,type Priority} from './hq-state.ts';

export function taskDetails(input:Partial<HQTask>,original:HQTask,now:number):HQTask {
  const title=String(input.title??'').trim(),subject=String(input.subject??'').trim(),due=String(input.due??'');
  if(!title||title.length>500)throw Error('Give the task a title of 1–500 characters.');
  if(subject.length>120)throw Error('Keep the subject under 120 characters.');
  if(due&&!validDate(due))throw Error('Choose a real deadline date.');
  if(!['critical','high','normal','low'].includes(String(input.priority)))throw Error('Choose a priority.');
  const estimate=Number(input.estimateMinutes||0);
  if(!Number.isInteger(estimate)||estimate<0||estimate>1440)throw Error('Use a whole-minute estimate from 1 to 1,440, or leave it blank.');
  return {...original,title,subject:subject||undefined,due:due||undefined,priority:input.priority as Priority,estimateMinutes:estimate||undefined,updatedAt:Math.max(now,original.updatedAt+1)};
}

export function restoreDeletedTask(state:HQState,task:HQTask,now:number):HQState {
  if(state.tasks.some(t=>t.id===task.id))throw Error('That task is already present. The current copy was kept.');
  const deletedAt=state.tombstones.filter(t=>t.collection==='tasks'&&t.id===task.id).reduce((max,t)=>Math.max(max,t.updatedAt),0);
  return {...state,tasks:[...state.tasks,{...task,updatedAt:Math.max(now,task.updatedAt+1,deletedAt+1)}]};
}
