'use client';

export type State = 'pendiente' | 'gestion' | 'esperando' | 'pospuesto' | 'apartado' | 'finalizado';

export type AiInsight = { summary: string; requests: string[]; commitments: string[]; priority: string; nextAction: string; model: string };

export type InboxItem = {
  id: string; subject: string; fromName: string; fromEmail: string; snippet: string; date: string; unread: boolean;
  messageCount: number; lastFromMe: boolean; toMe: boolean; category: string; vip: boolean; state: State; stateAt: string | null;
  pinned: boolean; muted: boolean; snoozeUntil: string | null; followUpAt: string | null; followUpNote: string | null; waitingSince: string | null;
  ai: AiInsight | null;
};

export type Member = { email: string; name: string | null; role: string; area: string | null };
export type SigLite = { id: string; name: string; type: string };
export type Settings = { sigNewId: string | null; sigReplyId: string | null; slaTargets: { Clientes: number; Equipo: number; Proveedores: number }; slaBiz: boolean; vipEmails: string[]; supplierDomains: string[]; orgMetrics: boolean; reopenRule: boolean; groupBy: string };
export type Me = { user: { id: string; email: string; name: string | null; picture: string | null; role: string; area: string | null; domain: string }; settings: Settings; org: { domain: string; name: string; showNames: boolean; minGroup: boolean; perfVisibility: string; areas: string[] } | null; members: Member[]; signatures: SigLite[]; aiEnabled: boolean };

export type Task = {
  id: string; title: string; status: string; priority: string; dueDate: string | null; projectId: string | null; assigneeEmail: string; createdById: string;
  threadId: string | null; threadOwnerId: string | null; threadSubject: string | null; threadFrom: string | null; threadSummary: string | null; shareEmail: boolean;
  checklist: { t: string; done: boolean }[]; nudgedAt: string | null; createdAt: string; updatedAt: string;
  collaborators: string[]; comments: { id: string; authorEmail: string; body: string; createdAt: string }[]; activity: { id: string; text: string; createdAt: string }[];
};
export type Project = { id: string; name: string; color: string };

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T = any>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(url, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
  const text = await r.text();
  let j: any = {};
  try { j = text ? JSON.parse(text) : {}; } catch { j = { error: text.slice(0, 200) }; }
  if (r.status === 401) { window.location.href = '/?error=' + encodeURIComponent(j.error || 'Tu sesión expiró'); throw new ApiError(401, j.error || 'Sesión expirada'); }
  if (!r.ok) throw new ApiError(r.status, j.error || `Error ${r.status}`);
  return j as T;
}

export const STATE_META: Record<State, { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'blue' },
  gestion: { label: 'En gestión', cls: 'violet' },
  esperando: { label: 'Esperando respuesta', cls: 'amber' },
  pospuesto: { label: 'Pospuesto', cls: 'teal' },
  apartado: { label: 'Apartado', cls: '' },
  finalizado: { label: 'Finalizado', cls: 'green' },
};

export const TZ = 'America/Santiago';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function localISODate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function todayISO() { return localISODate(new Date()); }
export function addDaysISO(iso: string, n: number) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export function shortTime(iso: string): string {
  const d = new Date(iso), now = new Date();
  const sameDay = localISODate(d) === localISODate(now);
  if (sameDay) return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  const diff = (now.getTime() - d.getTime()) / 86_400_000;
  if (diff < 6) return DAYS[new Date(localISODate(d) + 'T12:00:00Z').getUTCDay()].replace(/^./, (c) => c.toUpperCase());
  const [y, m, dd] = localISODate(d).split('-').map(Number);
  return `${dd} ${MONTHS[m - 1]}${y !== Number(localISODate(now).slice(0, 4)) ? ' ' + y : ''}`;
}

export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function dueLabel(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const t = todayISO();
  if (iso === t) return 'Hoy';
  if (iso === addDaysISO(t, 1)) return 'Mañana';
  const d = new Date(iso + 'T12:00:00Z');
  const txt = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return iso < t ? `Venció el ${txt}` : txt.replace(/^./, (c) => c.toUpperCase());
}

export function fmtHours(h: number | null | undefined): string {
  if (h === null || h === undefined || !isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  const r = h < 10 ? Math.round(h * 10) / 10 : Math.round(h);
  return `${String(r).replace('.', ',')} h`;
}

export function ago(iso: string): string {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `${Math.round(h)} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? '1 día' : `${d} días`;
}

export function initials(name: string): string {
  return (name || '?').replace(/[<>"]/g, '').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

const PALETTE = ['#1546C9', '#6B3FD1', '#0B6E6E', '#B4560B', '#9F1F5A', '#1A6E37', '#4A4F5A'];
export function colorFor(s: string): string {
  let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const CAT_COLOR: Record<string, string> = { Clientes: '#1546C9', Equipo: '#6B3FD1', Proveedores: '#A84F0A', Notificaciones: '#4A4F5A', Boletines: '#0B6E6E' };

/** Semana ISO de una fecha (en la zona de Santiago). */
export function isoWeek(iso: string): { week: number; monday: string } {
  const d = new Date(localISODate(new Date(iso)) + 'T12:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - day * 86_400_000);
  const thu = new Date(monday.getTime() + 3 * 86_400_000);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return { week: Math.ceil(((thu.getTime() - jan1) / 86_400_000 + 1) / 7), monday: monday.toISOString().slice(0, 10) };
}

function tzOffsetMin(d: Date): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = s.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
}

/** Instante ISO para una fecha y hora de pared en Santiago. */
export function zonedISO(dateISO: string, hh: number, mm = 0): string {
  const guess = new Date(`${dateISO}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  return new Date(guess.getTime() - tzOffsetMin(guess) * 60_000).toISOString();
}

export function nextWeekdayISO(target: number): string {
  let d = addDaysISO(todayISO(), 1);
  for (let i = 0; i < 8; i++) { if (new Date(d + 'T12:00:00Z').getUTCDay() === target) return d; d = addDaysISO(d, 1); }
  return d;
}

/** Opciones rápidas de fecha y hora para posponer o recordar. */
export function quickTimes(): { label: string; iso: string }[] {
  const t = todayISO();
  const nowHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(new Date()));
  const out: { label: string; iso: string }[] = [];
  if (nowHour < 17) out.push({ label: 'Hoy a las 18:00', iso: zonedISO(t, 18) });
  out.push({ label: 'Mañana a las 9:00', iso: zonedISO(addDaysISO(t, 1), 9) });
  out.push({ label: 'El lunes a las 9:00', iso: zonedISO(nextWeekdayISO(1), 9) });
  out.push({ label: 'En una semana', iso: zonedISO(addDaysISO(t, 7), 9) });
  return out;
}

export function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
}
export function fileToDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
}
