import {emptyHQState,sanitizeHQState,assertHQCapacity,type HQState} from './hq-state.ts';

export const historyCollections=['tasks','events','schedule'] as const;
type Collection=typeof historyCollections[number];
type RecordValue=HQState[Collection][number];
type Change={collection:Collection;before?:RecordValue;after?:RecordValue;deletedAt?:number};
export type HistoryRecord={version:1;id:string;accountId:string;label:string;savedAt:number;changes:Change[]};
export type HistorySummary=Pick<HistoryRecord,'id'|'accountId'|'label'|'savedAt'> & {changes:number;bytes:number};
export const HISTORY_LIMIT=200,HISTORY_BYTES=8_000_000,RECORD_BYTES=2_000_000;

/** Object insertion order is not an edit (Chrome storage can reorder keys). */
export function sameRecord(a:unknown,b:unknown):boolean {
 const order=(v:unknown):unknown=>Array.isArray(v)?v.map(order):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,order(x)])):v;
 return JSON.stringify(order(a))===JSON.stringify(order(b));
}
export function historyBasis(s:HQState){return {tasks:s.tasks,events:s.events,schedule:s.schedule,tombstones:s.tombstones};}
export function createHistory(before:HQState,after:HQState,accountId:string,id:string,label:string,now:number):HistoryRecord {
 const changes:Change[]=[];
 for(const collection of historyCollections){
  const old=new Map(before[collection].map(r=>[r.id,r])),next=new Map(after[collection].map(r=>[r.id,r]));
  for(const [id,record] of old){if(!next.has(id)){
   const deletedAt=after.tombstones.find(t=>t.collection===collection&&t.id===id)?.updatedAt;
   if(!deletedAt)throw Error('A deletion needs its recovery marker before it can be saved.');
   changes.push({collection,before:record,deletedAt});
  }else if(!sameRecord(record,next.get(id)))throw Error('Recovery supports additions and deletions; edit existing records separately.');}
  for(const [id,record] of next)if(!old.has(id))changes.push({collection,after:record});
 }
 if(!changes.length)throw Error('No changes to apply.');
 return validateHistory({version:1,id,accountId,label,savedAt:now,changes},accountId);
}
export function validateHistory(raw:unknown,accountId:string):HistoryRecord {
 const r=raw as HistoryRecord;
 if(!r||r.version!==1||r.accountId!==accountId||!accountId||typeof r.id!=='string'||!r.id||r.id.length>120||typeof r.label!=='string'||!r.label.trim()||r.label.length>600||!Number.isSafeInteger(r.savedAt)||r.savedAt<0||!Array.isArray(r.changes)||!r.changes.length||r.changes.length>6000)throw Error('This recovery entry is unsupported or belongs to another account. It was left untouched.');
 const seen=new Set<string>();
 for(const c of r.changes){
  if(!historyCollections.includes(c.collection)||Boolean(c.before)===Boolean(c.after))throw Error('This recovery entry has invalid changes. It was left untouched.');
  const value=c.before||c.after!;
  const normalized=sanitizeHQState({...emptyHQState(),[c.collection]:[value]})[c.collection][0];
  if(!normalized||!sameRecord(normalized,value)||typeof value.id!=='string'||!value.id||value.id.length>120||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<0)throw Error('This recovery entry has damaged records. Nothing was shortened or discarded.');
  const key=c.collection+':'+value.id;if(seen.has(key))throw Error('This recovery entry has duplicate records.');seen.add(key);
  if(c.before&&(!Number.isSafeInteger(c.deletedAt)||c.deletedAt!<=value.updatedAt))throw Error('This recovery entry has an invalid deletion marker.');
 }
 if(new TextEncoder().encode(JSON.stringify(r)).byteLength>RECORD_BYTES)throw Error('This action is too large for recovery. Export your work before changing it.');
 return structuredClone(r);
}
/** Restore only this operation. Never replace an entire historical calendar. */
export function restoreHistory(state:HQState,raw:HistoryRecord,accountId:string,now:number):HQState {
 const record=validateHistory(raw,accountId);const next={...state};
 for(const c of record.changes){
  const value=c.before||c.after!,current=state[c.collection].find(r=>r.id===value.id);
  if(c.before){
   if(current)throw Error('An item is already present. Its current copy was kept.');
   const marker=state.tombstones.find(t=>t.collection===c.collection&&t.id===value.id);
   if(marker?.updatedAt!==c.deletedAt)throw Error('This item changed or was deleted again. Recovery stopped to preserve the newer change.');
  }else if(!current||!sameRecord(current,value))throw Error('An added item was edited or removed. Recovery stopped to preserve that change.');
 }
 for(const collection of historyCollections){
  const changes=record.changes.filter(c=>c.collection===collection),added=new Set(changes.filter(c=>c.after).map(c=>c.after!.id));
  const restored=changes.filter(c=>c.before).map(c=>({...c.before!,updatedAt:Math.max(now,c.before!.updatedAt+1,c.deletedAt!+1)}));
  (next[collection] as RecordValue[])=[...state[collection].filter(r=>!added.has(r.id)),...restored];
 }
 assertHQCapacity(next);return next;
}

/** Device-local, account-scoped recovery. Persist BEFORE the destructive change. */
export class ActionJournal {
 private db:Promise<IDBDatabase>|null=null;
 readonly accountId:string;
 constructor(accountId:string){if(!accountId)throw Error('Sign in before using recovery.');this.accountId=accountId;}
 private open(){
  if(!this.db)this.db=new Promise<IDBDatabase>((resolve,reject)=>{
   const request=indexedDB.open('operation-hq-action-history-v1',1);let expired=false;
   const timer=setTimeout(()=>{expired=true;this.db=null;reject(Error('Recovery storage did not open. Nothing was changed.'));},4000);
   request.onupgradeneeded=()=>{for(const name of ['records','summaries']){const store=request.result.createObjectStore(name,{keyPath:'id'});store.createIndex('accountId','accountId');if(name==='summaries')store.createIndex('newest',['accountId','savedAt','id']);}};
   request.onerror=()=>{clearTimeout(timer);this.db=null;reject(Error('Recovery storage is unavailable. Nothing was changed.'));};
   request.onsuccess=()=>{clearTimeout(timer);const db=request.result;if(expired){db.close();return;}db.onversionchange=()=>{db.close();this.db=null;};resolve(db);};
  });return this.db;
 }
 async list(before?:HistorySummary):Promise<HistorySummary[]>{
  if(before&&before.accountId!==this.accountId)throw Error('That entry belongs to another account.');
  const db=await this.open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('summaries','readonly'),items:HistorySummary[]=[];
   const upper=before?[this.accountId,before.savedAt,before.id]:[this.accountId,Number.MAX_SAFE_INTEGER,[]];
   const request=tx.objectStore('summaries').index('newest').openCursor(IDBKeyRange.bound([this.accountId,0,''],upper,false,Boolean(before)),'prev');
   request.onsuccess=()=>{const cursor=request.result;if(cursor&&items.length<20){items.push(cursor.value);cursor.continue();}};
   tx.oncomplete=()=>resolve(items);tx.onabort=tx.onerror=()=>reject(Error('Could not read recovery history.'));
  });
 }
 async read(id:string):Promise<HistoryRecord>{
  const db=await this.open();return new Promise((resolve,reject)=>{
   const tx=db.transaction('records','readonly'),request=tx.objectStore('records').get(id);
   tx.oncomplete=()=>{try{resolve(validateHistory(request.result,this.accountId));}catch(e){reject(e);}};
   tx.onabort=tx.onerror=()=>reject(Error('Could not read this recovery entry.'));
  });
 }
 async append(raw:HistoryRecord):Promise<HistorySummary>{
  const record=validateHistory(raw,this.accountId),bytes=new TextEncoder().encode(JSON.stringify(record)).byteLength;
  const summary={id:record.id,accountId:this.accountId,label:record.label,savedAt:record.savedAt,changes:record.changes.length,bytes};
  const db=await this.open();await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(['records','summaries'],'readwrite'),summaries=tx.objectStore('summaries');let failure='Recovery storage could not save this action. Nothing was changed.';
   // One transaction serializes count/quota checks across every tab. No eviction.
   const request=summaries.index('accountId').getAll(this.accountId);
   request.onsuccess=()=>{const items=request.result as HistorySummary[];if(items.length>=HISTORY_LIMIT||items.reduce((n,r)=>n+r.bytes,0)+bytes>HISTORY_BYTES){failure='Recovery history is full. Review and forget old entries before deleting more work.';tx.abort();return;}
    tx.objectStore('records').add(record);summaries.add(summary);
   };
   tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(Error(failure));
  });this.notify();return summary;
 }
 async remove(id:string){
  const db=await this.open();await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction(['records','summaries'],'readwrite'),records=tx.objectStore('records'),request=records.get(id);let failure='Could not remove this recovery entry.';
   request.onsuccess=()=>{if(!request.result)return;if(request.result.accountId!==this.accountId){failure='That entry belongs to another account.';tx.abort();return;}records.delete(id);tx.objectStore('summaries').delete(id);};
   tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(Error(failure));
  });this.notify();
 }
 private notify(){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('hq-action-history',{detail:this.accountId}));}
}
export type RecoveryActions={journal:ActionJournal;perform:(label:string,mutator:(s:HQState)=>HQState)=>Promise<HistorySummary>;restore:(id:string)=>Promise<void>};
