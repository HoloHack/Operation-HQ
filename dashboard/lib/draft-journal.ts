import { sanitizeHQState } from './hq-state.ts';
import type { HQState } from './hq-state.ts';
import type { SyncCheckpoint } from './sync-coordinator';

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
      const request = indexedDB.open(databaseName, 1);
      const timer = setTimeout(() => reject(new Error('Local recovery storage did not open. Export your work before closing.')), 4000);
      request.onupgradeneeded = () => { const store = request.result.createObjectStore(storeName, {keyPath:'id'}); store.createIndex('accountId','accountId'); };
      request.onerror = () => {clearTimeout(timer);reject(new Error('Local recovery storage is unavailable. Export unsaved work before closing.'));};
      request.onsuccess = () => {clearTimeout(timer);const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
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
  async list(): Promise<DraftRecord[]> {
    const records = await this.transaction('readonly', store=>store.index('accountId').getAll(this.accountId));
    return records.filter(record=>record.accountId===this.accountId).sort((a,b)=>b.savedAt-a.savedAt);
  }
  async recoverOwn(): Promise<SyncCheckpoint<HQState> | null> {
    const record = await this.transaction('readonly', store=>store.get(this.key())) as DraftRecord | undefined;
    return record ? this.validate(record) : null;
  }
  validate(record: DraftRecord): SyncCheckpoint<HQState> {
    if (record.accountId!==this.accountId || record.checkpoint?.version!==1 || !record.checkpoint.state || !record.checkpoint.baseline) throw new Error('This recovery copy belongs to another account or is unsupported. It was left untouched.');
    return {...record.checkpoint, state:sanitizeHQState(record.checkpoint.state,{preserveOverflow:true}), baseline:sanitizeHQState(record.checkpoint.baseline,{preserveOverflow:true})};
  }
  write(checkpoint: SyncCheckpoint<HQState> | null): Promise<void> {
    const next = this.tail.catch(()=>{}).then(async()=> {
      if (!checkpoint) { await this.transaction('readwrite',store=>store.delete(this.key())); return; }
      if (JSON.stringify(checkpoint).length > 8_000_000) throw new Error('This draft exceeds the local recovery limit. No text was shortened. Export your work.');
      await this.transaction('readwrite',store=>store.put({id:this.key(),accountId:this.accountId,savedAt:Date.now(),checkpoint}));
    });
    this.tail=next; return next;
  }
  async remove(record: DraftRecord) {
    if (record.accountId!==this.accountId) throw new Error('You cannot remove another account’s recovery copy.');
    await this.transaction('readwrite',store=>store.delete(record.id));
  }
}
