export type SyncStatus = "loading" | "saved" | "saving" | "unsaved" | "conflict";
type Notes = { notes: { plain: string; updatedAt: number } };
export type RemoteState<T> = { snapshot: T; revision: number };
export type SaveReply<T> = RemoteState<T> & { conflict?: boolean };
type Options<T> = {
  initial: T;
  merge: (a: T, b: T) => T;
  load: () => Promise<RemoteState<T>>;
  save: (state: T, revision: number) => Promise<SaveReply<T>>;
  changed: () => void;
  debounce?: number;
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
  private baselineNotes = "";
  private flight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private loadEpoch = 0;
  private options: Options<T>;
  constructor(options: Options<T>) { this.options = options; this.state = options.initial; }
  get pending() { return this.generation > this.acknowledged; }
  private notify() { if (!this.disposed) this.options.changed(); }
  private schedule(delay = this.options.debounce ?? 850) {
    if (this.timer) clearTimeout(this.timer);
    if (!this.ready || !this.pending || this.conflict || this.disposed) return;
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delay);
  }
  change(mutator: (state: T) => T) {
    this.state = mutator(this.state); this.generation += 1;
    if (this.conflict) this.conflict.local = this.state.notes.plain;
    this.status = this.conflict ? "conflict" : "unsaved";
    this.notify(); this.schedule();
  }
  private acceptRemote(remote: RemoteState<T>, initial = false) {
    const local = this.state;
    const changedLocal = local.notes.plain !== this.baselineNotes;
    const changedRemote = remote.snapshot.notes.plain !== this.baselineNotes;
    const divergent = changedLocal && changedRemote && local.notes.plain !== remote.snapshot.notes.plain;
    this.state = initial && !this.pending ? remote.snapshot : this.options.merge(local, remote.snapshot);
    // Newer local edits must survive both startup and conflict responses.
    if (changedLocal && (!changedRemote || divergent)) this.state = { ...this.state, notes: local.notes };
    this.revision = remote.revision; this.baselineNotes = remote.snapshot.notes.plain;
    if (divergent) {
      this.conflict = { local: local.notes.plain, remote: remote.snapshot.notes.plain };
      this.status = "conflict"; this.error = "Notes changed elsewhere. Both versions are preserved for review.";
    }
  }
  async start() {
    const epoch = ++this.loadEpoch;
    this.disposed = false; this.status = "loading"; this.notify();
    try {
      const remote = await this.options.load();
      if (this.disposed || epoch !== this.loadEpoch) return;
      this.acceptRemote(remote, true); this.ready = true;
      if (!this.conflict) { this.status = this.pending ? "unsaved" : "saved"; this.error = ""; }
      this.notify(); this.schedule();
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
      this.status = "saving"; this.notify();
      try {
        const result = await this.options.save(snapshot, this.revision);
        if (result.conflict) {
          this.acceptRemote(result); this.generation += 1;
          if (this.conflict) { this.notify(); return; }
          continue;
        }
        this.revision = result.revision; this.baselineNotes = snapshot.notes.plain;
        this.acknowledged = generation;
        // Do not replace state: it may contain edits made while this request ran.
        this.error = ""; this.status = this.pending ? "unsaved" : "saved"; this.notify();
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
  dispose() { this.disposed = true; this.loadEpoch += 1; if (this.timer) clearTimeout(this.timer); }
}
