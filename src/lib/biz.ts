export const TZ = process.env.APP_TIMEZONE || 'America/Santiago';
const DAY = 86_400_000;

const offsetFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' });

/** Diferencia en ms entre la hora local de TZ y UTC para un instante. */
export function tzOffsetMs(d: Date): number {
  const p = offsetFmt.formatToParts(d).find((x) => x.type === 'timeZoneName')?.value || 'GMT';
  const m = p.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) * 60_000;
}

/** Instante expresado como "hora de pared" local (tratada como UTC para operar por días). */
function wall(d: Date): number {
  return d.getTime() + tzOffsetMs(d);
}

export const BIZ_START = 9, BIZ_END = 19;

/** Horas entre dos instantes. Si biz=true, solo cuenta lunes a viernes de 9:00 a 19:00 (hora de TZ). */
export function bizHours(from: Date, to: Date, biz: boolean): number {
  if (to.getTime() <= from.getTime()) return 0;
  if (!biz) return (to.getTime() - from.getTime()) / 3_600_000;
  const a = wall(from), b = wall(to);
  let ms = 0;
  for (let day = Math.floor(a / DAY) * DAY; day < b; day += DAY) {
    const wd = new Date(day).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const s = Math.max(a, day + BIZ_START * 3_600_000), e = Math.min(b, day + BIZ_END * 3_600_000);
    if (e > s) ms += e - s;
  }
  return ms / 3_600_000;
}

/** Fecha local (YYYY-MM-DD) de un instante en TZ. */
export function localDate(d: Date): string {
  return new Date(wall(d)).toISOString().slice(0, 10);
}

/** Número de semana ISO y lunes de esa semana (en TZ). */
export function isoWeek(d: Date): { week: number; monday: string } {
  const w = new Date(wall(d));
  const day = (w.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate() - day));
  const thu = new Date(monday.getTime() + 3 * DAY);
  const jan1 = Date.UTC(thu.getUTCFullYear(), 0, 1);
  return { week: Math.ceil(((thu.getTime() - jan1) / DAY + 1) / 7), monday: monday.toISOString().slice(0, 10) };
}

export function fmtHours(h: number): string {
  if (!isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  const r = h < 10 ? Math.round(h * 10) / 10 : Math.round(h);
  return `${String(r).replace('.', ',')} h`;
}
