import { and, eq, inArray, lte, ne } from 'drizzle-orm';
import { db, schema } from './db';
import { getThread, listThreads, modifyThread, pool, stateLabelIds, summarizeThread } from './gmail';
import type { SessionUser } from './session';
import { getSettings } from './settings';

export type State = 'pendiente' | 'gestion' | 'esperando' | 'pospuesto' | 'apartado' | 'finalizado';
export const STATES: State[] = ['pendiente', 'gestion', 'esperando', 'pospuesto', 'apartado', 'finalizado'];

const IN_INBOX: Record<State, boolean> = { pendiente: true, gestion: true, esperando: false, pospuesto: false, apartado: false, finalizado: false };

export function categorize(labelIds: string[], fromEmail: string, myDomain: string, supplierDomains: string[]): string {
  if (labelIds.some((l) => ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_FORUMS'].includes(l))) return 'Boletines';
  if (labelIds.includes('CATEGORY_UPDATES')) return 'Notificaciones';
  const d = fromEmail.split('@')[1] || '';
  if (d === myDomain || d.endsWith('.' + myDomain)) return 'Equipo';
  if (supplierDomains.some((s) => d === s || d.endsWith('.' + s))) return 'Proveedores';
  if (/^(no-?reply|noreply|notifications?|mailer-daemon|postmaster|alerts?)@/i.test(fromEmail)) return 'Notificaciones';
  return 'Clientes';
}

type CacheRow = typeof schema.threadCache.$inferSelect;
type StateRow = typeof schema.threadStates.$inferSelect;

async function refreshCache(user: SessionUser, ids: { id: string; historyId: string }[]) {
  if (!ids.length) return;
  const cached = await db().select({ threadId: schema.threadCache.threadId, historyId: schema.threadCache.historyId })
    .from(schema.threadCache).where(and(eq(schema.threadCache.userId, user.id), inArray(schema.threadCache.threadId, ids.map((x) => x.id))));
  const known = new Map(cached.map((c) => [c.threadId, c.historyId]));
  const stale = ids.filter((x) => known.get(x.id) !== x.historyId);
  await pool(stale, 8, async (x) => {
    try {
      const t = await getThread(user.id, x.id, 'metadata');
      const s = summarizeThread(t, user.email);
      const row = { userId: user.id, ...s, updatedAt: new Date() };
      await db().insert(schema.threadCache).values(row).onConflictDoUpdate({ target: [schema.threadCache.userId, schema.threadCache.threadId], set: { ...row, ai: null } });
    } catch (e) {
      console.warn('No se pudo leer el hilo', x.id, e);
    }
  });
}

/** Cambia el estado de gestión de un hilo y lo refleja en Gmail (bandeja + etiqueta). */
export async function setThreadState(user: SessionUser, threadId: string, state: State, extra: Partial<StateRow> = {}) {
  const labels = await stateLabelIds(user.id).catch(() => ({} as Record<string, string>));
  const all = Object.values(labels);
  const add: string[] = [], remove: string[] = all.filter((l) => l !== labels[state]);
  if (labels[state]) add.push(labels[state]);
  if (IN_INBOX[state]) add.push('INBOX'); else remove.push('INBOX');
  if (state === 'finalizado') remove.push('UNREAD');
  await modifyThread(user.id, threadId, add, remove);
  const values = { userId: user.id, threadId, state, stateAt: new Date(), ...extra };
  if (state !== 'pospuesto') values.snoozeUntil = null;
  if (state === 'esperando' && !extra.waitingSince) values.waitingSince = new Date();
  await db().insert(schema.threadStates).values(values)
    .onConflictDoUpdate({ target: [schema.threadStates.userId, schema.threadStates.threadId], set: values });
}

/** Sincroniza la bandeja: despierta pospuestos, refresca la caché y aplica la regla de reapertura. */
export async function syncInbox(user: SessionUser, q = 'in:inbox') {
  const settings = await getSettings(user.id);
  const now = new Date();

  // 1. Pospuestos cuya hora llegó: vuelven a la bandeja.
  const due = await db().select().from(schema.threadStates)
    .where(and(eq(schema.threadStates.userId, user.id), eq(schema.threadStates.state, 'pospuesto'), lte(schema.threadStates.snoozeUntil, now)));
  for (const d of due) await setThreadState(user, d.threadId, 'pendiente').catch(() => null);

  // 2. Hilos de la bandeja de Gmail + hilos gestionados fuera de ella.
  const list = await listThreads(user.id, q, 60);
  const inboxIds = (list.threads || []).map((t) => ({ id: t.id, historyId: t.historyId }));
  const managed = await db().select().from(schema.threadStates)
    .where(and(eq(schema.threadStates.userId, user.id), ne(schema.threadStates.state, 'pendiente')));
  const managedOut = managed.filter((m) => !inboxIds.some((i) => i.id === m.threadId) && m.state !== 'finalizado');
  await refreshCache(user, inboxIds);
  // Los gestionados fuera de la bandeja solo se refrescan si no están en caché.
  const outCached = managedOut.length ? await db().select({ id: schema.threadCache.threadId }).from(schema.threadCache)
    .where(and(eq(schema.threadCache.userId, user.id), inArray(schema.threadCache.threadId, managedOut.map((m) => m.threadId)))) : [];
  await refreshCache(user, managedOut.filter((m) => !outCached.some((c) => c.id === m.threadId)).map((m) => ({ id: m.threadId, historyId: 'x' })));

  const ids = [...inboxIds.map((i) => i.id), ...managedOut.map((m) => m.threadId)];
  const caches: CacheRow[] = ids.length ? await db().select().from(schema.threadCache)
    .where(and(eq(schema.threadCache.userId, user.id), inArray(schema.threadCache.threadId, ids))) : [];
  const stateMap = new Map(managed.map((m) => [m.threadId, m]));
  // Hilos de la bandeja aún «pendientes» pueden tener fijado, silencio o recordatorio.
  const pendIds = inboxIds.map((i) => i.id).filter((id) => !stateMap.has(id));
  const pendRows = pendIds.length ? await db().select().from(schema.threadStates)
    .where(and(eq(schema.threadStates.userId, user.id), inArray(schema.threadStates.threadId, pendIds))) : [];
  pendRows.forEach((p) => stateMap.set(p.threadId, p));

  // 3. Regla de reapertura: si llegó un mensaje nuevo después del cambio de estado.
  for (const c of caches) {
    const st = stateMap.get(c.threadId);
    if (!st || st.state === 'pendiente' || st.state === 'gestion') continue;
    const newer = !c.lastFromMe && c.date.getTime() > st.stateAt.getTime() + 1000;
    const inInbox = c.labelIds.includes('INBOX') || inboxIds.some((i) => i.id === c.threadId);
    if (newer && inInbox) {
      if (st.muted) { await setThreadState(user, c.threadId, 'finalizado', { muted: true }).catch(() => null); stateMap.set(c.threadId, { ...st, state: 'finalizado' }); continue; }
      if (st.state === 'esperando' || settings.reopenRule || st.state !== 'finalizado') {
        await setThreadState(user, c.threadId, 'pendiente').catch(() => null);
        stateMap.set(c.threadId, { ...st, state: 'pendiente', stateAt: new Date() });
      }
    }
  }

  const vip = new Set(settings.vipEmails.map((e) => e.toLowerCase()));
  return caches
    .filter((c) => (stateMap.get(c.threadId)?.state || 'pendiente') !== 'finalizado' || inboxIds.some((i) => i.id === c.threadId))
    .map((c) => {
      const st = stateMap.get(c.threadId);
      return {
        id: c.threadId,
        subject: c.subject,
        fromName: c.fromName,
        fromEmail: c.fromEmail,
        snippet: c.snippet,
        date: c.date.toISOString(),
        unread: c.labelIds.includes('UNREAD'),
        messageCount: c.messageCount,
        lastFromMe: c.lastFromMe,
        toMe: c.toMe,
        category: categorize(c.labelIds, c.fromEmail, user.domain, settings.supplierDomains),
        vip: vip.has(c.fromEmail.toLowerCase()),
        state: (st?.state || 'pendiente') as State,
        stateAt: st?.stateAt?.toISOString() || null,
        pinned: !!st?.pinned,
        muted: !!st?.muted,
        snoozeUntil: st?.snoozeUntil?.toISOString() || null,
        followUpAt: st?.followUpAt?.toISOString() || null,
        followUpNote: st?.followUpNote || null,
        waitingSince: st?.waitingSince?.toISOString() || null,
        ai: c.ai || null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type InboxItem = Awaited<ReturnType<typeof syncInbox>>[number];
