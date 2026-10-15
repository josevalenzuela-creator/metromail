import { todayISO, addDaysISO, type Task } from './lib';

export const TS: [string, string][] = [['hacer', 'Por hacer'], ['curso', 'En curso'], ['revision', 'En revisión'], ['hecho', 'Hecho']];
export const tsLabel = (k: string) => (TS.find((x) => x[0] === k) || TS[0])[1];

const hrs = (iso: string | null | undefined) => (iso ? (Date.now() - new Date(iso).getTime()) / 3_600_000 : 0);

export type Flags = { overdue: boolean; noResp: boolean; waitComment: boolean; notStarted: boolean; stale: boolean; soon: boolean; urgent: boolean };

/** Señales de riesgo de una tarea, calculadas en vivo. */
export function flagsOf(t: Task, me: string): Flags {
  const none = { overdue: false, noResp: false, waitComment: false, notStarted: false, stale: false, soon: false, urgent: false };
  if (t.status === 'hecho') return none;
  const today = todayISO();
  const overdue = !!t.dueDate && t.dueDate < today;
  const last = t.comments[t.comments.length - 1];
  const waitComment = !!last && last.authorEmail === me && t.assigneeEmail !== me && hrs(last.createdAt) >= 24;
  const notStarted = t.assigneeEmail !== me && t.status === 'hacer' && hrs(t.createdAt) >= 24;
  const stale = hrs(t.updatedAt) >= 72;
  const soon = !!t.dueDate && t.dueDate <= addDaysISO(today, 1);
  return { overdue, noResp: waitComment || notStarted, waitComment, notStarted, stale, soon, urgent: overdue || (soon && t.priority === 'Alta') };
}

export function ageText(iso: string | null | undefined): string {
  const h = hrs(iso);
  if (h < 24) return `${Math.max(1, Math.round(h))} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 día' : `${d} días`;
}
