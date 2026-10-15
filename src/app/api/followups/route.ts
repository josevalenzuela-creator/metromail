import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';

export const GET = api(async () => {
  const user = await requireUser();
  const states = await db().select().from(schema.threadStates).where(and(
    eq(schema.threadStates.userId, user.id),
    or(isNotNull(schema.threadStates.followUpAt), inArray(schema.threadStates.state, ['esperando', 'pospuesto', 'apartado'])),
  ));
  const ids = states.map((s) => s.threadId);
  const caches = ids.length ? await db().select().from(schema.threadCache).where(and(eq(schema.threadCache.userId, user.id), inArray(schema.threadCache.threadId, ids))) : [];
  const cm = new Map(caches.map((c) => [c.threadId, c]));
  const items = states.filter((s) => s.state !== 'finalizado' || s.followUpAt).map((s) => {
    const c = cm.get(s.threadId);
    return {
      threadId: s.threadId, state: s.state, subject: c?.subject || '(conversación)', fromName: c?.fromName || '', snippet: c?.snippet || '',
      followUpAt: s.followUpAt?.toISOString() || null, followUpNote: s.followUpNote, waitingSince: s.waitingSince?.toISOString() || null,
      snoozeUntil: s.snoozeUntil?.toISOString() || null,
    };
  });
  return Response.json({ items });
});
