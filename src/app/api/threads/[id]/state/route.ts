import { and, eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { setThreadState, STATES, type State } from '@/lib/inbox';
import { db, schema } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };
type Body = { state?: State; snoozeUntil?: string | null; pinned?: boolean; muted?: boolean; noReply?: boolean; followUpAt?: string | null; followUpNote?: string | null };

export const POST = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const b = (await req.json()) as Body;
  const extra: Record<string, unknown> = {};
  if (b.pinned !== undefined) extra.pinned = !!b.pinned;
  if (b.muted !== undefined) extra.muted = !!b.muted;
  if (b.noReply !== undefined) extra.noReply = !!b.noReply;
  if (b.followUpAt !== undefined) extra.followUpAt = b.followUpAt ? new Date(b.followUpAt) : null;
  if (b.followUpNote !== undefined) extra.followUpNote = b.followUpNote;

  if (b.state) {
    if (!STATES.includes(b.state)) throw new HttpError(400, 'Estado no válido');
    if (b.state === 'pospuesto') {
      if (!b.snoozeUntil) throw new HttpError(400, 'Indica hasta cuándo posponer');
      extra.snoozeUntil = new Date(b.snoozeUntil);
    }
    await setThreadState(user, id, b.state, extra);
  } else if (Object.keys(extra).length) {
    await db().insert(schema.threadStates).values({ userId: user.id, threadId: id, ...extra })
      .onConflictDoUpdate({ target: [schema.threadStates.userId, schema.threadStates.threadId], set: extra });
  }
  const [state] = await db().select().from(schema.threadStates).where(and(eq(schema.threadStates.userId, user.id), eq(schema.threadStates.threadId, id))).limit(1);
  return Response.json({ state });
});
