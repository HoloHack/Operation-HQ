import { validDate, type HQTask } from './hq-state.ts';

export function createChapterTasks(plan: { subject: string; chapters: number[]; due: string; today: string; minutes: number }, existing: HQTask[], id: () => string, now: number) {
  if (!plan.subject.trim() || !plan.chapters.length || plan.chapters.length > 30 || plan.chapters.some(n => !Number.isInteger(n) || n < 1 || n > 999)) throw new Error('Choose a subject and valid chapter list.');
  if (!validDate(plan.due) || plan.due < plan.today) throw new Error('Choose a deadline today or later.');
  if (!Number.isInteger(plan.minutes) || plan.minutes < 5 || plan.minutes > 180) throw new Error('Estimate 5–180 minutes per chapter.');
  const active = new Set(existing.filter(task => !task.completed).map(task => task.title.toLowerCase()));
  const tasks: HQTask[] = []; let reused = 0;
  for (const chapter of new Set(plan.chapters)) {
    const title = `${plan.subject} — Chapter ${chapter}`;
    if (active.has(title.toLowerCase())) { reused++; continue; }
    tasks.push({ id: id(), title, subject: plan.subject, due: plan.due, estimateMinutes: plan.minutes, priority: tasks.length === 0 ? 'critical' : 'high', completed: false, updatedAt: now });
    active.add(title.toLowerCase());
  }
  return { tasks, reused };
}
