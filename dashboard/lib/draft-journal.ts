import { sanitizeHQState } from './hq-state.ts';
import type { HQState } from './hq-state.ts';
import type { SyncCheckpoint } from './sync-coordinator';

export type DraftSummary = {id: string; accountId: string; savedAt: number; tasks: number; events: number; noteCharacters: number};
export type DraftRecord = {id: string; accountId: string; savedAt: number; checkpoint: SyncCheckpoint<HQState>};
const databaseName = 'operation-hq-local-drafts-v1';
const storeName = 'drafts';

/** Duplicating a tab also clones sessionStorage; a live lock prevents draft-ID reuse. */
export async function claimDraftTab(accountId: string): Promise<{tabId: string; release: () => void}> {
  const random = () => crypto.randomUUID();
  const key = 'hq-draft-tab-id-v1';
  const existing = sessionStorage.getItem(key);
  if (!navigator.locks?.request) {
    const tabId=random();sessionStorage.setItem(key,tabId);
    return {tabId,release:()=>{}}; // Preserve separate drafts; recovery picker handles reloads.
  }
  const claim = (tabId: string) => new Promise<{tabId:string;release:()=>void} | null>((resolve,reject)=> {
    void navigator.locks.request(`hq-draft-owner:${accountId}:${tabId}`,{ifAvailable:true},async lock=> {
      if (!lock) {resolve(null);return;}
      let release!: () => void;const held = new Promise<void>(done=>{release=done;});
      resolve({tabId,release});await held;
    }).catch(reject);
  });
  const result = (existing ? await claim(existing) : null) || await claim(random());
  if (!result) throw new Error('This device could not reserve a recovery copy. Export unsaved work.');
  try {sessionStorage.setItem(key,result.tabId);} catch(error) {result.release();throw error;}
  return result;
}

/** Each account AND tab has its own record. A second tab cannot replace this draft. */
export class DraftJournal {
  readonly accountId: string;
  readonly tabId: string;
  private db: Promise<IDBDatabase> | null = null;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(accountId: string, tabId: string) {
    if (!accountId || !tabId) throw new Error('A signed-in account and tab identity are required for local recovery.');
    this.accountId = accountId; this.tabId = tabId;
  }
  private open() {
    if (!this.db) this.db = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2);
      let expired=false;const timer = setTimeout(() => {expired=true;reject(new Error('Local recovery storage did not open. Export your work before closing.'));}, 4000);
      request.onupgradeneeded = () => {
        if(!request.result.objectStoreNames.contains(storeName)){const store=request.result.createObjectStore(storeName,{keyPath:'id'});store.createIndex('accountId','accountId');}
        if(!request.result.objectStoreNames.contains('summaries')){
          const store=request.result.createObjectStore('summaries',{keyPath:'id'});store.createIndex('accountId','accountId');store.createIndex('newest',['accountId','savedAt','id']);
          const cursor=request.transaction!.objectStore(storeName).openCursor();
          cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const r=item.value as DraftRecord;
            if(r.accountId && typeof r.checkpoint?.state?.notes?.plain==='string' && Array.isArray(r.checkpoint.state.tasks) && Array.isArray(r.checkpoint.state.events))store.put({id:r.id,accountId:r.accountId,savedAt:r.savedAt,tasks:r.checkpoint.state.tasks.length,events:r.checkpoint.state.events.length,noteCharacters:r.checkpoint.state.notes.plain.length});
            item.continue();};
        }
      };
      request.onerror = () => {clearTimeout(timer);reject(new Error('Local recovery storage is unavailable. Export unsaved work before closing.'));};
      request.onsuccess = () => {clearTimeout(timer);const db=request.result;if(expired){db.close();return;}db.onversionchange=()=>db.close();resolve(db);};
    });
    return this.db;
  }
  private async transaction<R>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<R>): Promise<R> {
    const db = await this.open();
    return new Promise((resolve,reject) => {
      const transaction=db.transaction(storeName,mode), request=run(transaction.objectStore(storeName));
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onabort=transaction.onerror=()=>reject(new Error('Local recovery storage could not complete the write. Export unsaved work before closing.'));
    });
  }
  private key(tabId = this.tabId) { return JSON.stringify([this.accountId,tabId]); }
  async list(before?: DraftSummary): Promise<DraftSummary[]> {
    const db=await this.open();
    return new Promise((resolve,reject)=> {
      const records: DraftSummary[]=[];const transaction=db.transaction('summaries','readonly');
      const upper=before ? [this.accountId,before.savedAt,before.id] : [this.accountId,Number.MAX_SAFE_INTEGER,[]];
      const request=transaction.objectStore('summaries').index('newest').openCursor(IDBKeyRange.bound([this.accountId,0,''],upper,false,Boolean(before)),'prev');
      request.onsuccess=()=>{const cursor=request.result;if(cursor && records.length<20){records.push(cursor.value);cursor.continue();}};
      transaction.oncomplete=()=>resolve(records);transaction.onabort=transaction.onerror=()=>reject(new Error('Could not read recovery summaries.'));
    });
  }
  async read(summary: DraftSummary): Promise<SyncCheckpoint<HQState>> {
    if(summary.accountId!==this.accountId)throw new Error('This recovery copy belongs to another account.');
    const record=await this.transaction('readonly',store=>store.get(summary.id));
    if(!record)throw new Error('This draft was already saved or is no longer available.');
    return this.validate(record);
  }
  async recoverOwn(): Promise<SyncCheckpoint<HQState> | null> {
    const record = await this.transaction('readonly', store=>store.get(this.key())) as DraftRecord | undefined;
    return record ? this.validate(record) : null;
  }
  validate(record: DraftRecord): SyncCheckpoint<HQState> {
    if (record.accountId!==this.accountId || record.checkpoint?.version!==1 || !record.checkpoint.state || !record.checkpoint.baseline) throw new Error('This recovery copy belongs to another account or is unsupported. It was left untouched.');
    if(!Number.isSafeInteger(record.checkpoint.revision) || record.checkpoint.revision<0)throw new Error('This recovery copy has an invalid revision. It was left untouched.');
    if(record.checkpoint.conflict!==null && (typeof record.checkpoint.conflict?.local!=='string' || typeof record.checkpoint.conflict?.remote!=='string'))throw new Error('This recovery copy has an invalid notes conflict. It was left untouched.');
    const normalize=(raw: HQState) => {
      const collections=['tasks','events','schedule','assignments','exams','habits','captures'] as const;
      if(raw.schemaVersion!==1 || typeof raw.notes?.plain!=='string' || collections.some(key=>!Array.isArray(raw[key])))throw new Error('This recovery copy needs repair. It was left untouched.');
      const normalized=sanitizeHQState(raw,{preserveOverflow:true});
      if(collections.some(key=>normalized[key].length!==raw[key].length || normalized[key].some((item,index)=>item.id!==raw[key][index].id || ('title' in item && item.title!== (raw[key][index] as unknown as {title:string}).title)) || new Set(normalized[key].map(item=>item.id)).size!==raw[key].length))throw new Error('This recovery copy has invalid or duplicate records. Nothing was discarded.');
      return normalized;
    };
    return {...record.checkpoint, state:normalize(record.checkpoint.state), baseline:normalize(record.checkpoint.baseline)};
  }
  private async mutate(id: string, checkpoint: SyncCheckpoint<HQState> | null) {
    const db=await this.open();
    await new Promise<void>((resolve,reject)=> {
      const transaction=db.transaction([storeName,'summaries'],'readwrite');
      if(checkpoint){
        const savedAt=Date.now();transaction.objectStore(storeName).put({id,accountId:this.accountId,savedAt,checkpoint});
        transaction.objectStore('summaries').put({id,accountId:this.accountId,savedAt,tasks:checkpoint.state.tasks.length,events:checkpoint.state.events.length,noteCharacters:checkpoint.state.notes.plain.length});
      }else{transaction.objectStore(storeName).delete(id);transaction.objectStore('summaries').delete(id);}
      transaction.oncomplete=()=>resolve();transaction.onabort=transaction.onerror=()=>reject(new Error('Local recovery storage could not complete the write. Export unsaved work before closing.'));
    });
  }
  write(checkpoint: SyncCheckpoint<HQState> | null): Promise<void> {
    const next=this.tail.catch(()=>{}).then(async()=> {
      if(checkpoint && JSON.stringify(checkpoint).length>8_000_000)throw new Error('This draft exceeds the local recovery limit. No text was shortened. Export your work.');
      await this.mutate(this.key(),checkpoint);
    });
    this.tail=next;return next;
  }
  async remove(record: DraftSummary) {
    if(record.accountId!==this.accountId)throw new Error('You cannot remove another account’s recovery copy.');
    const stored=await this.transaction('readonly',store=>store.get(record.id)) as DraftRecord | undefined;
    if(!stored)return;
    if(stored.accountId!==this.accountId)throw new Error('You cannot remove another account’s recovery copy.');
    await this.mutate(record.id,null);
  }
}
