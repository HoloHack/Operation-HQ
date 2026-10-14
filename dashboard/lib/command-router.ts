import {parseChapters} from './focus-clock.ts';
export const commandExamples=['Show unfinished tasks','Show my timetable','Reschedule for maths','Study maths chapters 5, 7, 8 and 10','Show exam countdowns','Open notes','Find manga releases','Change theme for HSIE','Open bookmarks','Open Gmail','Review tab groups','Practise social skills','Refresh weather','Open local AI','Pause focus timer'];
/** Classify supported local commands without executing actions or inventing model responses. */
export function routeCommand(raw:string){
 const text=raw.trim(),subject=/math/i.test(text)?'Mathematics':/science/i.test(text)?'Science':/hsie|history|geography/i.test(text)?'HSIE':/english/i.test(text)?'English':undefined;
 const chapters=parseChapters(text);
 // Manga chapters are discoveries, not school chapter tasks.
 if(/\bchapters?\b/i.test(text)&&subject){if(!chapters.length)return {kind:'invalid' as const,subject};return {kind:'chapters' as const,subject,chapters,reschedule:/reschedule|schedule|plan.*time/i.test(text)};}
 if(/\b(theme|palette|colou?r(?:s|\s+scheme)?)\b/i.test(text))return {kind:'theme' as const};
 if(/anime|manga|release/i.test(text))return {kind:'panel' as const,panel:'releases' as const};
 if(/calendar|schedule|timetable|reschedule/i.test(text))return {kind:'panel' as const,panel:'calendar' as const,subject};
 if(/\b(?:local ai|ai settings|advanced settings)\b/i.test(text))return {kind:'browser' as const,tool:'settings'};
 if(/\bbookmarks?\b/i.test(text))return {kind:'browser' as const,tool:'bookmarks'};
 if(/\btabs?\b|\bworkspaces?\b|\bsaved groups\b/i.test(text))return {kind:'browser' as const,tool:'tabs'};
 if(/gleam|confidence|social.*skills|conversation.*practice/i.test(text))return {kind:'browser' as const,tool:'gleam'};
 if(/gmail|email|\bmail\b/i.test(text))return {kind:'browser' as const,tool:'gmail'};
 if(/notes?/i.test(text))return {kind:'panel' as const,panel:'notes' as const};
 if(/exam|assignment|assessment|study/i.test(text))return {kind:'panel' as const,panel:'study' as const};
 if(/tasks?|unfinished|priority|what.*next/i.test(text))return {kind:'panel' as const,panel:'tasks' as const};
 if(/weather/i.test(text))return {kind:'weather' as const};
 if(/pause.*(?:focus|timer)|stop.*timer/i.test(text))return {kind:'pause' as const};
 if(/\bhelp\b|what can you do|commands/i.test(text))return {kind:'help' as const};
 return {kind:'unknown' as const};
}
