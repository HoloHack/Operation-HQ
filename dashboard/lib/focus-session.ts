import {remainingSeconds} from './focus-clock.ts';
type Mission={mission:string;minutes:number};
export type FocusSession=Mission&{version:1;deadline:number|null;secondsLeft:number};
/** Restore a device clock without silently replacing corrupt stored bytes. */
export function restoreFocusSession(raw:string|null,focus:Mission,now=Date.now()):FocusSession{
 const fresh:FocusSession={version:1,mission:focus.mission,minutes:focus.minutes,deadline:null,secondsLeft:focus.minutes*60};if(raw===null)return fresh;
 if(raw.length>4096)throw Error('The saved focus clock is invalid. Reset or restart to choose a fresh session.');
 let value:FocusSession;try{value=JSON.parse(raw);}catch{throw Error('The saved focus clock could not be read. It was left untouched.');}
 if(!value||value.version!==1||typeof value.mission!=='string'||!Number.isInteger(value.minutes)||value.minutes<1||value.minutes>180||!Number.isInteger(value.secondsLeft)||value.secondsLeft<0||value.secondsLeft>value.minutes*60||value.deadline!==null&&(!Number.isSafeInteger(value.deadline)||value.deadline<1))throw Error('The saved focus clock is invalid. It was left untouched.');
 if(value.mission!==focus.mission||value.minutes!==focus.minutes)return fresh;
 const secondsLeft=value.deadline===null?value.secondsLeft:Math.min(focus.minutes*60,remainingSeconds(value.deadline,now));return {...value,secondsLeft,deadline:secondsLeft>0?value.deadline:null};
}
/** Persist explicit actions and completion rather than writing once per tick. */
export function focusSession(focus:Mission,secondsLeft:number,deadline:number|null):FocusSession{return {version:1,mission:focus.mission,minutes:focus.minutes,secondsLeft:Math.max(0,Math.min(focus.minutes*60,Math.ceil(secondsLeft))),deadline};}
