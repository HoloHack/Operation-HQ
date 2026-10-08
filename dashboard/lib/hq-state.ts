export type Priority = "critical" | "high" | "normal" | "low";

export type HQTask = {
  id: string;
  title: string;
  subject?: string;
  due?: string;
  estimateMinutes?: number;
  priority: Priority;
  completed: boolean;
  updatedAt: number;
};

export type HQEvent = {
  id: string;
  title: string;
  date: string;
  start?: string;
  end?: string;
  category?: string;
  notes?: string;
  location?: string;
  updatedAt: number;
};

export type HQState = {
  schemaVersion: 1;
  tasks: HQTask[];
  events: HQEvent[];
  notes: { plain: string; updatedAt: number };
  schedule: Array<{ id: string; title: string; day: number; start: string; end: string; subject?: string; updatedAt: number }>;
  assignments: Array<{ id: string; title: string; subject?: string; due?: string; progress?: number; updatedAt: number }>;
  exams: Array<{ id: string; title: string; date: string; subject?: string; updatedAt: number }>;
  habits: Array<{ id: string; title: string; completedDates: string[]; updatedAt: number }>;
  captures: Array<{ id: string; text: string; createdAt: number; updatedAt: number }>;
  settings: {
    accentHue: number;
    supportHue: number;
    motion: "full" | "balanced" | "reduced";
    density: "calm" | "balanced" | "command";
    updatedAt: number;
  };
  focus: { mission: string; minutes: number; subject?: string; chapters: number[]; updatedAt: number };
};

const safeText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const safeDocument = (value: unknown, max: number) => String(value ?? "").slice(0, max);
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const fallbackId = () => typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : `hq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
const id = (value: unknown) => safeText(value, 120) || fallbackId();

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validTime(value: string) { return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value); }

export function emptyHQState(): HQState {
  return {
    schemaVersion: 1,
    tasks: [],
    events: [],
    notes: { plain: "", updatedAt: 0 },
    schedule: [],
    assignments: [],
    exams: [],
    habits: [],
    captures: [],
    settings: { accentHue: 264, supportHue: 198, motion: "balanced", density: "balanced", updatedAt: 0 },
    focus: { mission: "", minutes: 25, chapters: [], updatedAt: 0 },
  };
}

export const HQ_COLLECTION_LIMITS = { tasks: 2000, events: 3000, schedule: 1000, assignments: 1000, exams: 300, habits: 300, captures: 2000 } as const;
export const HQ_NOTES_LIMIT = 200000;

/** Refuse oversized writes instead of silently discarding user records. */
export function assertHQCapacity(input: unknown) {
  if (!input || typeof input !== "object") return;
  const value = input as Record<string, unknown>;
  for (const [key, limit] of Object.entries(HQ_COLLECTION_LIMITS)) {
    if (Array.isArray(value[key]) && value[key].length > limit)
      throw new Error(`The ${key} collection exceeds the ${limit}-item save limit. Your work remains in this tab. Export it before closing.`);
  }
  if (String((value.notes as { plain?: unknown } | undefined)?.plain ?? "").length > HQ_NOTES_LIMIT)
    throw new Error("Notes exceed the 200,000-character save limit. Your text remains in this tab. Export it before closing.");
}

export function sanitizeHQState(input: unknown, options: { preserveOverflow?: boolean } = {}): HQState {
  if (!options.preserveOverflow) assertHQCapacity(input);
  const value = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const base = emptyHQState();
  const settings = value.settings && typeof value.settings === "object" ? value.settings as Record<string, unknown> : {};
  const focus = value.focus && typeof value.focus === "object" ? value.focus as Record<string, unknown> : {};
  const array = (key: string, _limit: number) => Array.isArray(value[key]) ? (value[key] as unknown[]) : [];

  return {
    schemaVersion: 1,
    tasks: array("tasks", 2000).map(raw => {
      const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const priority = ["critical", "high", "normal", "low"].includes(String(item.priority)) ? item.priority as Priority : "normal";
      return { id: id(item.id), title: safeText(item.title, 500), subject: safeText(item.subject, 120) || undefined, due: safeText(item.due, 32) || undefined, estimateMinutes: Math.max(0, Math.min(1440, finite(item.estimateMinutes))) || undefined, priority, completed: Boolean(item.completed), updatedAt: Math.max(0, finite(item.updatedAt, Date.now())) };
    }).filter(item => item.title),
    events: array("events", 3000).map(raw => {
      const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const start = safeText(item.start, 8), end = safeText(item.end, 8);
      return { id: id(item.id), title: safeText(item.title, 500), date: safeText(item.date, 16), start: validTime(start) ? start : undefined, end: validTime(end) ? end : undefined, category: safeText(item.category, 80) || undefined, notes: safeDocument(item.notes, 10000) || undefined, location: safeText(item.location, 500) || undefined, updatedAt: Math.max(0, finite(item.updatedAt, Date.now())) };
    }).filter(item => item.title && validDate(item.date)),
    notes: {
      plain: safeDocument((value.notes as Record<string, unknown> | undefined)?.plain, options.preserveOverflow ? Infinity : HQ_NOTES_LIMIT),
      updatedAt: Math.max(0, finite((value.notes as Record<string, unknown> | undefined)?.updatedAt)),
    },
    schedule: array("schedule", 1000).map(raw => {
      const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return { id: id(item.id), title: safeText(item.title, 300), day: Math.max(0, Math.min(6, finite(item.day))), start: safeText(item.start, 8), end: safeText(item.end, 8), subject: safeText(item.subject, 120) || undefined, updatedAt: Math.max(0, finite(item.updatedAt, Date.now())) };
    }).filter(item => item.title && validTime(item.start) && validTime(item.end) && item.end > item.start),
    assignments: array("assignments", 1000).map(raw => {
      const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return { id: id(item.id), title: safeText(item.title, 500), subject: safeText(item.subject, 120) || undefined, due: safeText(item.due, 32) || undefined, progress: Math.max(0, Math.min(100, finite(item.progress))), updatedAt: Math.max(0, finite(item.updatedAt, Date.now())) };
    }).filter(item => item.title),
    exams: array("exams", 300).map(raw => {
      const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return { id: id(item.id), title: safeText(item.title, 500), date: safeText(item.date, 16), subject: safeText(item.subject, 120) || undefined, updatedAt: Math.max(0, finite(item.updatedAt, Date.now())) };
    }).filter(item => item.title && validDate(item.date)),
    habits: array("habits", 300).map(raw => {
      const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return { id: id(item.id), title: safeText(item.title, 240), completedDates: Array.isArray(item.completedDates) ? item.completedDates.map(v => safeText(v, 16)).filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v)).slice(-730) : [], updatedAt: Math.max(0, finite(item.updatedAt, Date.now())) };
    }).filter(item => item.title),
    captures: array("captures", 2000).map(raw => {
      const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      return { id: id(item.id), text: safeText(item.text, 4000), createdAt: Math.max(0, finite(item.createdAt, Date.now())), updatedAt: Math.max(0, finite(item.updatedAt, Date.now())) };
    }).filter(item => item.text),
    settings: {
      accentHue: Math.round(Math.max(0, Math.min(359, finite(settings.accentHue, base.settings.accentHue)))),
      supportHue: Math.round(Math.max(0, Math.min(359, finite(settings.supportHue, base.settings.supportHue)))),
      motion: ["full", "balanced", "reduced"].includes(String(settings.motion)) ? settings.motion as HQState["settings"]["motion"] : base.settings.motion,
      density: ["calm", "balanced", "command"].includes(String(settings.density)) ? settings.density as HQState["settings"]["density"] : base.settings.density,
      updatedAt: Math.max(0, finite(settings.updatedAt)),
    },
    focus: {
      mission: safeText(focus.mission, 500),
      minutes: Math.max(5, Math.min(180, finite(focus.minutes, 25))),
      subject: safeText(focus.subject, 120) || undefined,
      chapters: Array.isArray(focus.chapters) ? [...new Set(focus.chapters.map(v => finite(v)).filter(v => Number.isInteger(v) && v > 0 && v < 1000))].slice(0, 50) : [],
      updatedAt: Math.max(0, finite(focus.updatedAt)),
    },
  };
}

function mergeById<T extends { id: string; updatedAt: number }>(left: T[], right: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of [...left, ...right]) {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) merged.set(item.id, item);
  }
  return [...merged.values()];
}

export function mergeHQState(leftInput: unknown, rightInput: unknown): HQState {
  const left = sanitizeHQState(leftInput, { preserveOverflow: true });
  const right = sanitizeHQState(rightInput, { preserveOverflow: true });
  return sanitizeHQState({
    ...left,
    ...right,
    tasks: mergeById(left.tasks, right.tasks),
    events: mergeById(left.events, right.events),
    schedule: mergeById(left.schedule, right.schedule),
    assignments: mergeById(left.assignments, right.assignments),
    exams: mergeById(left.exams, right.exams),
    habits: mergeById(left.habits, right.habits),
    captures: mergeById(left.captures, right.captures),
    notes: left.notes.updatedAt > right.notes.updatedAt ? left.notes : right.notes,
    focus: left.focus.updatedAt > right.focus.updatedAt ? left.focus : right.focus,
    settings: left.settings.updatedAt > right.settings.updatedAt ? left.settings : right.settings,
  }, { preserveOverflow: true });
}
