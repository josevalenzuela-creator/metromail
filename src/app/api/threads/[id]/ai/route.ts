import { api, requireUser } from '@/lib/session';
import { loadThreadView, threadText } from '@/lib/thread';
import { analyzeThread } from '@/lib/ai';
import { db, schema } from '@/lib/db';
import { getThread, summarizeThread } from '@/lib/gmail';

export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export const POST = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const view = await loadThreadView(user.id, user.email, id);
  const ai = await analyzeThread(threadText(view, user.name || user.email), user.name || user.email);
  const meta = summarizeThread(await getThread(user.id, id, 'metadata'), user.email);
  await db().insert(schema.threadCache).values({ userId: user.id, ...meta, ai, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.threadCache.userId, schema.threadCache.threadId], set: { ai } });
  return Response.json({ ai });
});
