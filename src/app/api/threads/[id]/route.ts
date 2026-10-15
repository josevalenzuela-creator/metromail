import { and, eq } from 'drizzle-orm';
import { api, requireUser } from '@/lib/session';
import { loadThreadView } from '@/lib/thread';
import { modifyThread } from '@/lib/gmail';
import { db, schema } from '@/lib/db';

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export const GET = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const view = await loadThreadView(user.id, user.email, id);
  // Abrir marca como leído, pero NO cambia el estado de gestión.
  if (view.unread) await modifyThread(user.id, id, [], ['UNREAD']).catch(() => null);
  const [state] = await db().select().from(schema.threadStates).where(and(eq(schema.threadStates.userId, user.id), eq(schema.threadStates.threadId, id))).limit(1);
  const [cache] = await db().select({ ai: schema.threadCache.ai }).from(schema.threadCache).where(and(eq(schema.threadCache.userId, user.id), eq(schema.threadCache.threadId, id))).limit(1);
  return Response.json({ ...view, state: state || null, ai: cache?.ai || null });
});
