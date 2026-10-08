import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const data={};
const context=vm.createContext({chrome:{storage:{local:{async get(keys){return Object.fromEntries(keys.map(k=>[k,structuredClone(data[k])]));},async set(values){Object.assign(data,structuredClone(values));}}}},structuredClone,crypto:webcrypto,Date});
vm.runInContext(readFileSync(new URL('../js/calendar-repository.js',import.meta.url),'utf8'),context);
const repo=vm.runInContext('CalendarRepository',context);
await repo.addLegacy('2026-10-08','Original');const before=JSON.stringify(data);
for(const actions of [
 Array.from({length:251},()=>({type:'addLegacy',dateKey:'2026-10-08',text:'Extra'})),
 [{type:'addLegacy',dateKey:'2026-02-31',text:'Impossible'}],
 [{type:'addLegacy',dateKey:'2026-10-08',text:'x'.repeat(501)}],
 [{type:'upsertEvent',event:{id:'constructor',date:'2026-10-08',title:'Bad ID',occurrences:[{dateKey:'2026-10-08',text:'Bad'}]}}],
 [{type:'upsertEvent',event:{id:'too-many',date:'2026-10-08',title:'Too many',occurrences:Array.from({length:201},()=>({dateKey:'2026-10-08',text:'Overflow'}))}}],
 [{type:'addLegacy',dateKey:'2026-10-08',text:'First'},{type:'addLegacy',dateKey:'invalid',text:'Second'}],
]){await assert.rejects(repo.transaction(actions));assert.equal(JSON.stringify(data),before,'Rejected transaction changed storage');}
const success=await repo.addLegacy('2026-10-09','Valid afterwards');assert.equal(data.hq_calendar_revision_v1,2);
await repo.undo(success.inverse);assert.deepEqual(data.hq_calendar_events,{'2026-10-08':['Original']});
console.log('✓ Calendar rejects oversized/invalid transactions atomically, preserves content, and recovers after rejection');
