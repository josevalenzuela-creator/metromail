import { and, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db, schema } from './db';
import { bizHours, isoWeek, localDate } from './biz';
import { getThread, header, isFromMe, listMessages, parseAddress, parseAddressList, pool, type GMessage } from './gmail';
import type { SessionUser } from './session';
import { getSettings } from './settings';
import type { SlaTargets } from '@/db/schema';

export const SLA_CATS = ['Clientes', 'Equipo', 'Proveedores'] as const;

export function senderType(email: string, myDomain: string, suppliers: string[]): string {
  const d = email.split('@')[1] || '';
  if (d === myDomain || d.endsWith('.' + myDomain)) return 'Equipo';
  if (suppliers.some((s) => d === s || d.endsWith('.' + s))) return 'Proveedores';
  return 'Clientes';
}

export function isAutomated(m: GMessage): boolean {
  const from = parseAddress(header(m, 'From')).email;
  if (/^(no-?reply|noreply|notifications?|mailer-daemon|postmaster|alerts?|bounce)/i.test(from)) return true;
  if (header(m, 'List-Unsubscribe')) return true;
  const auto = header(m, 'Auto-Submitted').toLowerCase();
  if (auto && auto !== 'no') return true;
  if (/bulk|list|junk/i.test(header(m, 'Precedence'))) return true;
  const labels = m.labelIds || [];
  return labels.some((l) => ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS', 'SPAM', 'TRASH', 'CHAT'].includes(l));
}

export type RawEvent = { messageId: string; threadId: string; receivedAt: Date; repliedAt: Date | null; senderType: string; toMe: boolean };

/** Calcula los periodos de espera de un hilo: cada vez que alguien te escribe y tú aún no respondes. */
export function eventsFromThread(msgs: GMessage[], me: string, myDomain: string, suppliers: string[]): RawEvent[] {
  const sorted = [...msgs].sort((a, b) => Number(a.internalDate) - Number(b.internalDate));
  const out: RawEvent[] = [];
  let open: RawEvent | null = null;
  for (const m of sorted) {
    const when = new Date(Number(m.internalDate));
    if (isFromMe(m, me)) {
      if (open) { open.repliedAt = when; out.push(open); open = null; }
      continue;
    }
    if (open || isAutomated(m)) continue;
    const meL = me.toLowerCase();
    const inTo = parseAddressList(header(m, 'To')).some((a) => a.email === meL);
    const inCc = parseAddressList(header(m, 'Cc')).some((a) => a.email === meL);
    if (!inTo && !inCc) continue;
    open = { messageId: m.id, threadId: m.threadId, receivedAt: when, repliedAt: null, senderType: senderType(parseAddress(header(m, 'From')).email, myDomain, suppliers), toMe: inTo };
  }
  if (open) out.push(open);
  return out;
}

/** Avanza la sincronización del SLA por lotes (para no exceder el tiempo de una función). */
export async function slaSyncStep(user: SessionUser, opts: { budget?: number; force?: boolean } = {}) {
  const budget = opts.budget ?? 25;
  const settings = await getSettings(user.id);
  let [st] = await db().select().from(schema.slaSync).where(eq(schema.slaSync.userId, user.id)).limit(1);
  const stale = !st || (st.status !== 'running' && (opts.force || Date.now() - st.lastRunAt.getTime() > 15 * 60_000));
  if (stale) {
    const hasEvents = (await db().select({ id: schema.slaEvents.id }).from(schema.slaEvents).where(eq(schema.slaEvents.userId, user.id)).limit(1)).length > 0;
    const since = hasEvents && st ? Math.floor((st.lastRunAt.getTime() - 48 * 3_600_000) / 1000) : null;
    const q = `{to:${user.email} cc:${user.email}} -from:me -in:chats -category:promotions -category:social -category:forums ${since ? `after:${since}` : 'newer_than:90d'}`;
    const ids = new Set<string>();
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await listMessages(user.id, q, 100, token);
      (r.messages || []).forEach((m) => ids.add(m.threadId));
      token = r.nextPageToken;
      if (!token || ids.size >= 600) break;
    }
    // Hilos que esperaban respuesta: revisar si ya respondiste.
    const open = await db().select({ threadId: schema.slaEvents.threadId }).from(schema.slaEvents)
      .where(and(eq(schema.slaEvents.userId, user.id), isNull(schema.slaEvents.repliedAt), gte(schema.slaEvents.receivedAt, new Date(Date.now() - 60 * 86_400_000))));
    open.forEach((o) => ids.add(o.threadId));
    const pending = [...ids];
    const values = { userId: user.id, pending, processed: 0, total: pending.length, status: 'running', lastRunAt: new Date() };
    await db().insert(schema.slaSync).values(values).onConflictDoUpdate({ target: schema.slaSync.userId, set: values });
    st = { ...values } as typeof st;
  }
  if (st.status !== 'running') return { status: 'idle', processed: st.processed, total: st.total };
  const batch = st.pending.slice(0, budget), rest = st.pending.slice(budget);
  await pool(batch, 6, async (threadId) => {
    try {
      const t = await getThread(user.id, threadId, 'metadata');
      const evs = eventsFromThread(t.messages || [], user.email, user.domain, settings.supplierDomains);
      for (const e of evs) {
        await db().insert(schema.slaEvents).values({ userId: user.id, ...e })
          .onConflictDoUpdate({ target: [schema.slaEvents.userId, schema.slaEvents.messageId], set: { repliedAt: e.repliedAt, senderType: e.senderType, toMe: e.toMe } });
      }
    } catch (e) {
      console.warn('SLA: no se pudo leer el hilo', threadId, e);
    }
  });
  const done = rest.length === 0;
  await db().update(schema.slaSync).set({ pending: rest, processed: st.processed + batch.length, status: done ? 'idle' : 'running', lastRunAt: new Date() }).where(eq(schema.slaSync.userId, user.id));
  return { status: done ? 'idle' : 'running', processed: st.processed + batch.length, total: st.total };
}

export type SlaEventFull = { receivedAt: Date; handledAt: Date | null; senderType: string; toMe: boolean; threadId: string };

/** Carga eventos del usuario con la fecha de atención (respuesta o finalización) y excluye «no requiere respuesta». */
export async function loadEvents(userId: string, sinceDays: number): Promise<SlaEventFull[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const evs = await db().select().from(schema.slaEvents).where(and(eq(schema.slaEvents.userId, userId), gte(schema.slaEvents.receivedAt, since)));
  const threadIds = [...new Set(evs.map((e) => e.threadId))];
  const states = threadIds.length ? await db().select().from(schema.threadStates).where(and(eq(schema.threadStates.userId, userId), inArray(schema.threadStates.threadId, threadIds))) : [];
  const sm = new Map(states.map((s) => [s.threadId, s]));
  return evs.filter((e) => !sm.get(e.threadId)?.noReply).map((e) => {
    const s = sm.get(e.threadId);
    let handled = e.repliedAt;
    if (!handled && s && s.state === 'finalizado' && s.stateAt > e.receivedAt) handled = s.stateAt;
    return { receivedAt: e.receivedAt, handledAt: handled, senderType: e.senderType, toMe: e.toMe, threadId: e.threadId };
  });
}

export type SlaSummary = {
  measured: number; ok: number; pct: number | null; prevPct: number | null;
  medianH: number | null; p90H: number | null; lateNow: number; riskNow: number;
  lateThreads: { threadId: string; elapsedH: number; target: number; senderType: string; late: boolean }[];
  byCat: { cat: string; n: number; ok: number; medianH: number | null; target: number }[];
  trend: { label: string; n: number; ok: number; pct: number | null }[];
  unit: string;
};

function quant(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[i];
}

/** Calcula los indicadores de SLA a partir de eventos (función pura, testeable). */
export function computeSla(all: SlaEventFull[], targets: SlaTargets, biz: boolean, days: number, includeCc: boolean, now = new Date()): SlaSummary {
  const t = (c: string) => (targets as Record<string, number>)[c] ?? 8;
  const inWin = (e: SlaEventFull, from: number, to: number) => e.receivedAt.getTime() >= from && e.receivedAt.getTime() < to;
  const nowMs = now.getTime(), start = nowMs - days * 86_400_000, prevStart = start - days * 86_400_000;
  const pool = all.filter((e) => includeCc || e.toMe);

  const judge = (e: SlaEventFull) => {
    if (e.handledAt) { const h = bizHours(e.receivedAt, e.handledAt, biz); return { measured: true, ok: h <= t(e.senderType), h }; }
    const el = bizHours(e.receivedAt, now, biz);
    return { measured: el > t(e.senderType), ok: false, h: null as number | null, el };
  };

  const cur = pool.filter((e) => inWin(e, start, nowMs + 1));
  const prev = pool.filter((e) => inWin(e, prevStart, start));
  let measured = 0, ok = 0;
  const hs: number[] = [];
  const byCat = new Map<string, { n: number; ok: number; hs: number[] }>();
  for (const e of cur) {
    const j = judge(e);
    const c = byCat.get(e.senderType) || { n: 0, ok: 0, hs: [] };
    if (j.measured) { measured++; c.n++; if (j.ok) { ok++; c.ok++; } }
    if (j.h !== null) { hs.push(j.h); c.hs.push(j.h); }
    byCat.set(e.senderType, c);
  }
  let pm = 0, pok = 0;
  for (const e of prev) { const j = judge(e); if (j.measured) { pm++; if (j.ok) pok++; } }

  const lateThreads: SlaSummary['lateThreads'] = [];
  const seen = new Set<string>();
  for (const e of pool.filter((x) => !x.handledAt && x.receivedAt.getTime() > nowMs - 60 * 86_400_000)) {
    if (seen.has(e.threadId)) continue;
    const el = bizHours(e.receivedAt, now, biz), tg = t(e.senderType);
    if (el > tg || el >= tg * 0.75) { lateThreads.push({ threadId: e.threadId, elapsedH: el, target: tg, senderType: e.senderType, late: el > tg }); seen.add(e.threadId); }
  }
  lateThreads.sort((a, b) => b.elapsedH / b.target - a.elapsedH / a.target);

  // Tendencia: por día (7 días) o por semana ISO (30 y 90 días).
  const unit = days <= 7 ? 'día' : 'semana';
  const buckets = new Map<string, { label: string; n: number; ok: number; order: string }>();
  for (const e of cur) {
    const j = judge(e);
    if (!j.measured) continue;
    let key: string, label: string;
    if (unit === 'día') { key = localDate(e.receivedAt); const d = new Date(key + 'T12:00:00Z'); label = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][d.getUTCDay()] + ' ' + d.getUTCDate(); }
    else { const w = isoWeek(e.receivedAt); key = w.monday; label = 'Sem ' + w.week; }
    const b = buckets.get(key) || { label, n: 0, ok: 0, order: key };
    b.n++; if (j.ok) b.ok++;
    buckets.set(key, b);
  }
  const trend = [...buckets.values()].sort((a, b) => a.order.localeCompare(b.order)).map((b) => ({ label: b.label, n: b.n, ok: b.ok, pct: b.n ? Math.round((b.ok / b.n) * 100) : null }));

  return {
    measured, ok, pct: measured ? Math.round((ok / measured) * 100) : null, prevPct: pm ? Math.round((pok / pm) * 100) : null,
    medianH: quant(hs, 0.5), p90H: quant(hs, 0.9),
    lateNow: lateThreads.filter((x) => x.late).length, riskNow: lateThreads.filter((x) => !x.late).length, lateThreads,
    byCat: SLA_CATS.map((c) => { const v = byCat.get(c) || { n: 0, ok: 0, hs: [] }; return { cat: c, n: v.n, ok: v.ok, medianH: quant(v.hs, 0.5), target: t(c) }; }),
    trend, unit,
  };
}

export async function slaSummaryFor(userId: string, days: number, includeCc: boolean) {
  const s = await getSettings(userId);
  const events = await loadEvents(userId, days * 2 + 60);
  return computeSla(events, s.slaTargets, s.slaBiz, days, includeCc);
}
