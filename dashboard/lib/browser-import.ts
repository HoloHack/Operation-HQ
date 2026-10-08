import { assertHQCapacity, sanitizeHQState } from './hq-state.ts';
import type { HQState } from './hq-state.ts';

export type NotesChoice = 'keep' | 'browser' | 'both';
const prefix = 'browser:';

/** Only import planning fields. Browser defaults cannot reset dashboard preferences. */
export function reviewBrowserImport(input: unknown): HQState {
  if (!input || typeof input !== 'object' || (input as HQState).schemaVersion !== 1) throw new Error('The extension returned an unsupported preview. Nothing was imported.');
  assertHQCapacity(input);
  const source = input as HQState;
  for (const key of ['tasks', 'events'] as const) {
    if (!Array.isArray(source[key])) throw new Error('The preview is missing its planning collections.');
    if (source[key].some(item => !item || typeof item.id !== 'string' || !item.id || typeof item.title !== 'string' || !item.title.trim() || item.id.length > 112 || item.title.length > 500)) throw new Error('Some browser records need repair before import. Nothing was changed.');
    if (new Set(source[key].map(item => item.id)).size !== source[key].length) throw new Error('The preview has duplicate identifiers. Nothing was imported.');
  }
  if (typeof source.notes?.plain !== 'string') throw new Error('The preview has an invalid notes document.');
  const sanitized = sanitizeHQState(source);
  if (sanitized.tasks.length !== source.tasks.length || sanitized.events.length !== source.events.length) throw new Error('Some browser records are invalid. Import stopped without dropping them.');
  for (const key of ['tasks', 'events'] as const) for (let i = 0; i < source[key].length; i++) {
    if (sanitized[key][i].title !== source[key][i].title || sanitized[key][i].id !== source[key][i].id) throw new Error('Some browser fields exceed supported limits. Import stopped without shortening them.');
  }
  return sanitized;
}

export function applyBrowserImport(current: HQState, source: HQState, notesChoice: NotesChoice = 'keep', now = Date.now()): HQState {
  source = reviewBrowserImport(source);
  // Existing dashboard edits always win. Re-imports cannot duplicate or overwrite them.
  const merge = <T extends {id: string}>(existing: T[], incoming: T[]) => {
    const ids = new Set(existing.map(item => item.id));
    return [...existing, ...incoming.map(item => ({...item, id: prefix + item.id})).filter(item => !ids.has(item.id))];
  };
  let notes = current.notes;
  if (!notes.plain && source.notes.plain) notes = {...source.notes, updatedAt: now};
  else if (source.notes.plain && source.notes.plain !== notes.plain) {
    if (notesChoice === 'browser') notes = {plain: source.notes.plain, updatedAt: now};
    if (notesChoice === 'both' && !notes.plain.endsWith('\n\n--- Browser notes ---\n\n' + source.notes.plain)) notes = {plain: notes.plain + '\n\n--- Browser notes ---\n\n' + source.notes.plain, updatedAt: now};
  }
  const result = {...current, tasks: merge(current.tasks, source.tasks), events: merge(current.events, source.events), notes};
  assertHQCapacity(result); // Reject the whole import if the union cannot be saved.
  return result;
}

export function browserImportSummary(current: HQState, source: HQState) {
  const count = <T extends {id: string}>(existing: T[], incoming: T[]) => incoming.filter(item => !existing.some(saved => saved.id === prefix + item.id)).length;
  return {newTasks: count(current.tasks, source.tasks), newEvents: count(current.events, source.events), notesDiffer: Boolean(current.notes.plain && source.notes.plain && current.notes.plain !== source.notes.plain)};
}
