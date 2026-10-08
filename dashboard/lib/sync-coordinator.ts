export type SyncStatus = "loading" | "saved" | "saving" | "unsaved" | "conflict";
type Notes = { notes: { plain: string; updatedAt: number } };
export type RemoteState<T> = { snapshot: T; revision: number };
export type SaveReply<T> = RemoteState<T> & { conflict?: boolean };
export type SyncCheckpoint<T> = {version: 1; state: T; baseline: T; revision: number; conflict: {local: string; remote: string} | null};
type Options<T> = {
  initial: T;
  merge: (a: T, b: T) => T;
  load: () => Promise<RemoteState<T>>;
  save: (state: T, revision: number) => Promise<SaveReply<T>>;
  changed: () => void;
  debounce?: number;
  recover?: () => Promise<SyncCheckpoint<T> | null>;
  checkpoint?: (value: SyncCheckpoint<T> | null) => Promise<void>;
};

/** One writer per page. A server acknowledgement only covers the generation sent. */
export class SyncCoordinator<T extends Notes> {
  state: T;
  revision = 0;
  status: SyncStatus = "loading";
  error = "";
  ready = false;
  generation = 0;
  acknowledged = 0;
  conflict: { local: string; remote: string } | null = null;
  recoveryError = "";
  journaledGeneration = -1;
  private baselineNotes = "";
  private baseline: T;
  private checkpointFlight: Promise<void> = Promise.resolve();
  private recoveryLoaded = false;
  private recoveryBlocked = false;
  private flight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private loadEpoch = 0;
  private options: Options<T>;
  constructor(options: Options<T>) { this.options = options; this.state = options.initial; this.baseline = options.initial; }
  get pending() { return this.generation > this.acknowledged; }
  private notify() { if (!this.disposed) this.options.changed(); }
  private checkpoint() {
    if (!this.options.checkpoint || this.recoveryBlocked) return;
    const generation = this.generation;
    const value: SyncCheckpoint<T> | null = this.pending ? {version:1,state:this.state,baseline:this.baseline,revision:this.revision,conflict:this.conflict ? {...this.conflict} : null} : null;
    this.checkpointFlight = this.checkpointFlight.then(async () => {
      try { await this.options.checkpoint!(value); this.journaledGeneration = generation; this.recoveryError = ""; }
      catch (error) { this.recoveryError = error instanceof Error ? error.message : "Local recovery failed. Export unsaved work before closing."; }
      this.notify();
    });
  }
  restore(value: SyncCheckpoint<T>) {
    if (this.flight) throw new Error("Wait for the current save before recovering a copy.");
    if (value.version !== 1) throw new Error("Unsupported recovery copy. It was left untouched.");
    const local = this.state;
    this.state = this.ready || this.pending ? this.options.merge(local, value.state) : value.state;
    this.baseline = value.baseline; this.baselineNotes = value.baseline.notes.plain;
    this.revision = value.revision;
    this.conflict = value.conflict;
    if ((this.ready || this.pending) && local.notes.plain !== value.state.notes.plain && local.notes.plain && value.state.notes.plain) {
      this.state = {...this.state,notes:local.notes}; this.conflict = {local:local.notes.plain,remote:value.state.notes.plain};
    }
    this.generation += 1; this.status = this.conflict ? "conflict" : "unsaved";
    this.checkpoint(); this.notify(); this.schedule();
  }
  async recoverCopy(value: SyncCheckpoint<T>) {
    await this.flush();
    if (this.disposed) return;
    this.restore(value);
  }
  private schedule(delay = this.options.debounce ?? 850) {
    if (this.timer) clearTimeout(this.timer);
    if (!this.ready || !this.pending || this.conflict || this.disposed) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delay);
  }
  change(mutator: (state: T) => T) {
    this.state = mutator(this.state); this.generation += 1;
    if (this.conflict) this.conflict.local = this.state.notes.plain;
    this.status = this.conflict ? "conflict" : "unsaved";
    this.checkpoint(); this.notify(); this.schedule();
  }
  private acceptRemote(remote: RemoteState<T>, initial = false) {
    const local = this.state;
    const changedLocal = local.notes.plain !== this.baselineNotes;
    const changedRemote = remote.snapshot.notes.plain !== this.baselineNotes;
    const divergent = changedLocal && changedRemote && local.notes.plain !== remote.snapshot.notes.plain;
    this.state = initial && !this.pending ? remote.snapshot : this.options.merge(local, remote.snapshot);
    // Newer local edits must survive both startup and conflict responses.
    if (changedLocal && (!changedRemote || divergent)) this.state = { ...this.state, notes: local.notes };
    this.revision = remote.revision; this.baselineNotes = remote.snapshot.notes.plain; this.baseline = remote.snapshot;
    if (divergent) {
      this.conflict = { local: local.notes.plain, remote: remote.snapshot.notes.plain };
      this.status = "conflict"; this.error = "Notes changed elsewhere. Both versions are preserved for review.";
    }
  }
  async start() {
    const epoch = ++this.loadEpoch;
    this.disposed = false; this.status = "loading"; this.notify();
    try {
      if (!this.recoveryLoaded && this.options.recover) {
        let recovered: SyncCheckpoint<T> | null = null;
        try { recovered = await this.options.recover(); }
        catch (error) { this.recoveryBlocked = true; this.recoveryError = error instanceof Error ? error.message : "Local recovery is unavailable. Export unsaved work before closing."; }
        if (this.disposed || epoch !== this.loadEpoch) return;
        this.recoveryLoaded = true;
        if (recovered) this.restore(recovered);
      }
      const remote = await this.options.load();
      if (this.disposed || epoch !== this.loadEpoch) return;
      this.acceptRemote(remote, true); this.ready = true;
      if (!this.conflict) { this.status = this.pending ? "unsaved" : "saved"; this.error = ""; }
      this.checkpoint(); this.notify(); this.schedule();
    } catch (error) {
      if (this.disposed || epoch !== this.loadEpoch) return;
      this.status = "unsaved"; this.error = error instanceof Error ? error.message : "Could not load saved data."; this.notify();
    }
  }
  async flush(): Promise<void> {
    if (this.flight) return this.flight;
    if (!this.ready || !this.pending || this.conflict || this.disposed) return;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.flight = this.commit();
    try { await this.flight; } finally { this.flight = null; }
  }
  private async commit() {
    // Bounded conflict retries; never spin indefinitely against another writer.
    for (let attempt = 0; attempt < 4 && this.pending && !this.conflict && !this.disposed; attempt++) {
      const generation = this.generation; const snapshot = this.state;
      // Complete the device write before asking cloud storage to acknowledge it.
      if (this.options.checkpoint) await this.checkpointFlight;
      if (this.disposed) return;
      this.status = "saving"; this.notify();
      try {
        const result = await this.options.save(snapshot, this.revision);
        if (result.conflict) {
          this.acceptRemote(result); this.generation += 1;
          this.checkpoint();
          if (this.conflict) { this.notify(); return; }
          continue;
        }
        this.revision = result.revision; this.baselineNotes = snapshot.notes.plain; this.baseline = snapshot;
        this.acknowledged = generation;
        // Do not replace state: it may contain edits made while this request ran.
        this.error = ""; this.status = this.pending ? "unsaved" : "saved"; this.checkpoint(); this.notify();
      } catch (error) {
        this.status = "unsaved"; this.error = error instanceof Error ? error.message : "Save failed.";
        this.notify(); return;
      }
    }
    if (this.pending && !this.conflict) { this.status = "unsaved"; this.notify(); this.schedule(3000); }
  }
  resolveNotes(text: string) {
    this.conflict = null; this.error = "";
    this.change(state => ({ ...state, notes: { plain: text, updatedAt: Date.now() } }));
  }
  async retry() { if (!this.ready) await this.start(); else await this.flush(); }
  async checkpointSettled() { await this.checkpointFlight; }
  dispose() { this.disposed = true; this.loadEpoch += 1; if (this.timer) clearTimeout(this.timer); }
}
