import { and, eq } from 'drizzle-orm';
import { api, HttpError, requireUser } from '@/lib/session';
import { db, schema } from '@/lib/db';
import { validateSig } from '@/lib/sigvalidate';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = api(async (req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const v = validateSig(await req.json());
  const [sig] = await db().update(schema.signatures).set(v).where(and(eq(schema.signatures.id, id), eq(schema.signatures.userId, user.id))).returning();
  if (!sig) throw new HttpError(404, 'Firma no encontrada');
  return Response.json({ signature: sig });
});

export const DELETE = api(async (_req: Request, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  await db().delete(schema.signatures).where(and(eq(schema.signatures.id, id), eq(schema.signatures.userId, user.id)));
  const [s] = await db().select().from(schema.userSettings).where(eq(schema.userSettings.userId, user.id)).limit(1);
  if (s && (s.sigNewId === id || s.sigReplyId === id)) {
    await db().update(schema.userSettings).set({ sigNewId: s.sigNewId === id ? null : s.sigNewId, sigReplyId: s.sigReplyId === id ? null : s.sigReplyId }).where(eq(schema.userSettings.userId, user.id));
  }
  return Response.json({ ok: true });
});
