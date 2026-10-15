import { and, eq, inArray } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { slaSummaryFor } from '@/lib/sla';
import { db, schema } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const GET = api(async (req: Request) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const days = [7, 30, 90].includes(Number(sp.get('days'))) ? Number(sp.get('days')) : 30;
  const cc = sp.get('cc') === '1';
  const [summary, settings, sync] = await Promise.all([
    slaSummaryFor(user.id, days, cc),
    getSettings(user.id),
    db().select().from(schema.slaSync).where(eq(schema.slaSync.userId, user.id)).limit(1),
  ]);
  const ids = summary.lateThreads.slice(0, 12).map((x) => x.threadId);
  const caches = ids.length ? await db().select({ threadId: schema.threadCache.threadId, subject: schema.threadCache.subject, fromName: schema.threadCache.fromName })
    .from(schema.threadCache).where(and(eq(schema.threadCache.userId, user.id), inArray(schema.threadCache.threadId, ids))) : [];
  const cm = new Map(caches.map((c) => [c.threadId, c]));
  return Response.json({
    ...summary,
    lateThreads: summary.lateThreads.slice(0, 12).map((x) => ({ ...x, subject: cm.get(x.threadId)?.subject || 'Conversación', fromName: cm.get(x.threadId)?.fromName || '' })),
    targets: settings.slaTargets, biz: settings.slaBiz,
    sync: sync[0] ? { status: sync[0].status, processed: sync[0].processed, total: sync[0].total, lastRunAt: sync[0].lastRunAt } : null,
  });
});
